const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_CREDENTIALS = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const SPREADSHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU'; // 你的 Google Sheet ID
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // 你的 Discord Webhook URL

const sheets = google.sheets('v4');
const auth = new google.auth.JWT(
  GOOGLE_SHEETS_CREDENTIALS.client_email,
  null,
  GOOGLE_SHEETS_CREDENTIALS.private_key,
  ['https://www.googleapis.com/auth/spreadsheets'],
  null
);

app.use(express.json());
app.use(express.static('public'));

// 連接到 Google Sheets
async function getBossData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'bossdata!A2:D', // 假設BOSS數據在A-D列，從第2行開始
    });

    return response.data.values.map(row => ({
      name: row[0],
      lastKilled: row[1],
      respawnTime: row[2], // 重生時間
      resetTime: row[3],   // 重置時間
    }));
  } catch (error) {
    console.error('❌ 無法讀取 Google Sheets', error);
    return [];
  }
}

// 送出推播訊息到 Discord
async function sendDiscordNotification(bossName, message) {
  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ 未設定 Discord Webhook URL');
    return;
  }

  const payload = {
    content: `🚨 BOSS 更新通知: ${bossName} - ${message}`,
  };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('✅ 成功推播到 Discord');
  } catch (err) {
    console.error('❌ 推播到 Discord 時出錯：', err);
  }
}

// 獲取 BOSS 資料
app.get('/api/bosses', async (req, res) => {
  const data = await getBossData();
  res.json(data);
});

// 更新 BOSS 擊殺時間及重生時間
app.post('/api/boss/:name/kill', async (req, res) => {
  const bossName = req.params.name;
  const now = new Date().toISOString();

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);

  if (!boss) {
    return res.status(404).json({ error: `找不到名為 ${bossName} 的 BOSS` });
  }

  boss.lastKilled = now;

  const resetTime = boss.resetTime;
  let resetTimeInMinutes = 0;

  if (resetTime.includes("小時")) {
    resetTimeInMinutes = parseInt(resetTime.replace(" 小時", "")) * 60;
  } else if (resetTime.includes("分鐘")) {
    resetTimeInMinutes = parseInt(resetTime.replace(" 分鐘", ""));
  }

  const respawnTime = new Date(new Date(boss.lastKilled).getTime() + resetTimeInMinutes * 60 * 1000);
  boss.respawnTime = respawnTime.toISOString();

  try {
    const rowIndex = data.findIndex(b => b.name === bossName) + 2;
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `bossdata!B${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[now]] },
    });
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `bossdata!C${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[boss.respawnTime]] },
    });
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `bossdata!D${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[resetTime]] },
    });

    // 送出 Discord 推播
    await sendDiscordNotification(bossName, `BOSS ${bossName} 擊殺時間及重生時間已更新`);

    res.json({ message: `BOSS ${bossName} 擊殺時間及重生時間已更新`, boss });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 時出錯：', err);
    res.status(500).json({ error: '無法更新 Google Sheets', detail: err });
  }
});

// ✅ 新增：調整 BOSS 重生時間的 API（增加或減少分鐘）
app.post('/api/boss/:name/adjustRespawnTime', async (req, res) => {
  const bossName = req.params.name;
  const { minutes } = req.body;

  if (typeof minutes !== 'number') {
    return res.status(400).json({ error: 'minutes 必須是數字' });
  }

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);

  if (!boss || !boss.respawnTime) {
    return res.status(404).json({ error: `找不到名為 ${bossName} 的 BOSS 或尚未設定重生時間` });
  }

  const currentRespawnTime = new Date(boss.respawnTime);
  const adjustedRespawnTime = new Date(currentRespawnTime.getTime() + minutes * 60 * 1000);
  boss.respawnTime = adjustedRespawnTime.toISOString();

  try {
    const rowIndex = data.findIndex(b => b.name === bossName) + 2;
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: `bossdata!C${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[boss.respawnTime]],
      },
    });

    // 送出 Discord 推播
    await sendDiscordNotification(bossName, `已調整 ${bossName} 的重生時間`);

    res.json({ message: `已調整 ${bossName} 的重生時間`, boss });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 時出錯：', err);
    res.status(500).json({ error: '無法更新 Google Sheets', detail: err });
  }
});

// 每 1 分鐘檢查 BOSS 是否即將重生
setInterval(async () => {
  try {
    const data = await getBossData();
    
    data.forEach(async (boss) => {
      const respawnTime = new Date(boss.respawnTime);
      const now = new Date();

      // 計算重生時間與現在時間的差距
      const timeDiff = respawnTime - now;

      // 如果 BOSS 重生時間距離現在小於等於 1 分鐘（60,000 毫秒），發送通知
      if (timeDiff <= 60000 && timeDiff > 0) {
        await sendDiscordNotification(boss.name, `🚨 BOSS ${boss.name} 即將重生！剩餘時間：1 分鐘`);
      }
    });
  } catch (err) {
    console.error('❌ 檢查 BOSS 重生時間時出錯：', err);
  }
}, 60000); // 每 1 分鐘檢查一次

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動在 http://localhost:${PORT}`);
});
