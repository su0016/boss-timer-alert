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
  
  // 假設 BOSS重置時間設為 2 分鐘 (120秒)
  const resetTimeInMinutes = 2; // 設置為 2 分鐘
  const respawnTime = new Date(new Date(boss.lastKilled).getTime() + resetTimeInMinutes * 60 * 1000); // 重生時間
  boss.respawnTime = respawnTime.toISOString(); // 計算並存入重生時間

  // 更新 Google Sheets
  try {
    const updateRangeLastKilled = `bossdata!B${data.findIndex(b => b.name === bossName) + 2}`; // 擊殺時間所在的單元格
    const updateRangeRespawnTime = `bossdata!C${data.findIndex(b => b.name === bossName) + 2}`; // 重生時間所在的單元格
    const updateRangeResetTime = `bossdata!D${data.findIndex(b => b.name === bossName) + 2}`; // 重置時間所在的單元格

    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: updateRangeLastKilled,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[now]],
      },
    });

    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: updateRangeRespawnTime,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[boss.respawnTime]],
      },
    });

    await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: updateRangeResetTime,
      valueInputOption: 'RAW',
      requestBody: {
        values: [["2 分鐘"]], // 設置 BOSS 重置時間為 2 分鐘
      },
    });

    res.json({ message: `BOSS ${bossName} 擊殺時間及重生時間已更新`, boss });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 時出錯：', err);
    res.status(500).json({ error: '無法更新 Google Sheets', detail: err });
  }
});

app.use(express.json());
app.use(express.static('public'));

// 獲取 BOSS 資料
app.get('/api/bosses', async (req, res) => {
  const data = await getBossData();
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動在 http://localhost:${PORT}`);
});
