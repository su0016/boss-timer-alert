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
      range: 'Sheet1!A2:B', // 假設資料從第2行開始
    });

    return response.data.values.map(row => ({
      name: row[0],
      lastKilled: row[1],
    }));
  } catch (error) {
    console.error('❌ 無法讀取 Google Sheets', error);
    return [];
  }
}

app.use(express.json());
app.use(express.static('public'));

// 獲取 BOSS 資料
app.get('/api/bosses', async (req, res) => {
  const data = await getBossData();
  res.json(data);
});

// 更新 BOSS 擊殺時間
app.post('/api/boss/:name/kill', async (req, res) => {
  const bossName = req.params.name;
  const now = new Date().toISOString();

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);

  if (!boss) {
    return res.status(404).json({ error: `找不到名為 ${bossName} 的 BOSS` });
  }

  boss.lastKilled = now;

  // 更新 Google Sheets
  try {
    const updateRange = `Sheet1!B${data.findIndex(b => b.name === bossName) + 2}`; // 將 BOSS 擊殺時間更新到相應位置
    const updateRes = await sheets.spreadsheets.values.update({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: updateRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[now]],
      },
    });

    res.json({ message: `BOSS ${bossName} 擊殺時間已更新`, boss });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 時出錯：', err);
    res.status(500).json({ error: '無法更新 Google Sheets', detail: err });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動在 http://localhost:${PORT}`);
});
