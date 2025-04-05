const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_CREDENTIALS = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const SPREADSHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU'; // 你的 Google Sheet ID

const sheets = google.sheets('v4');
const auth = new google.auth.JWT(
  GOOGLE_SHEETS_CREDENTIALS.client_email,
  null,
  GOOGLE_SHEETS_CREDENTIALS.private_key,
  ['https://www.googleapis.com/auth/spreadsheets'],
  null
);

// 連接到 Google Sheets
async function getBossData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'bossdata!A2:D', // 這裡假設BOSS數據在A列到D列，從第2行開始
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

// 更新 BOSS 擊殺時間及重生時間
app.post('/api/boss/:name/kill', async (req, res) => {
  const bossName = req.params.name;
  const now = new Date().toISOString(); // 記錄當前擊殺時間

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);

  if (!boss) {
    return res.status(404).json({ error: `找不到名為 ${bossName} 的 BOSS` });
  }

  // 更新 BOSS 擊殺時間
  boss.lastKilled = now;

  // 取得重置時間 (A4)
  const resetTime = boss.resetTime; // 假設是類似 "12 小時" 的字串

  let respawnTime = new Date();
  if (resetTime === "12 小時") respawnTime.setHours(respawnTime.getHours() + 12);

  boss.respawnTime = respawnTime.toISOString();

  // 重寫回 Google Sheet
  try {
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'bossdata!A2:D',
      valueInputOption: 'RAW',
      resource: {
        values: data.map(b => [b.name, b.lastKilled, b.respawnTime, b.resetTime]),
      },
    });

    res.status(200).send({ message: `BOSS ${bossName} 擊殺時間已更新` });
  } catch (error) {
    res.status(500).send({ error: `無法更新 BOSS ${bossName} 的資料` });
  }
});

// 調整重生時間 (增加/減少 1 分鐘)
app.post('/api/boss/:name/adjustTime', async (req, res) => {
  const bossName = req.params.name;
  const { minutes } = req.body;

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);

  if (!boss) {
    return res.status(404).json({ error: `找不到名為 ${bossName} 的 BOSS` });
  }

  // 調整重生時間
  const respawnTime = new Date(boss.respawnTime);
  respawnTime.setMinutes(respawnTime.getMinutes() + minutes);

  boss.respawnTime = respawnTime.toISOString();

  // 重寫回 Google Sheet
  try {
    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'bossdata!A2:D',
      valueInputOption: 'RAW',
      resource: {
        values: data.map(b => [b.name, b.lastKilled, b.respawnTime, b.resetTime]),
      },
    });

    res.status(200).send({ message: `BOSS ${bossName} 重生時間已調整` });
  } catch (error) {
    res.status(500).send({ error: `無法調整 BOSS ${bossName} 的時間` });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`伺服器已啟動，訪問: http://localhost:${PORT}`);
});
