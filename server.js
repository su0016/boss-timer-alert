const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

const SHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU';

app.use(express.json());
app.use(express.static('public'));

app.get('/api/bosses', (req, res) => {
  const data = JSON.parse(fs.readFileSync('bossData.json', 'utf8'));
  res.json(data);
});

app.post('/api/boss/:name/kill', async (req, res) => {
  const bossName = decodeURIComponent(req.params.name);
  const now = new Date().toISOString();
  const filePath = path.join(__dirname, 'bossData.json');

  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const boss = data.find(b => b.name === bossName);

  if (!boss) {
    console.log(`❌ 找不到名稱為 ${bossName} 的 BOSS`);
    return res.status(404).json({ error: '找不到該BOSS' });
  }

  boss.lastKilled = now;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ 已更新本地 bossData.json 中 ${boss.name} 的 lastKilled 時間為 ${now}`);

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: '工作表1!A2:B100', // 注意：工作表名稱請跟你的實際名稱一致
    });

    const rows = readRes.data.values;
    const rowIndex = rows.findIndex(row => row[0] === bossName);

    if (rowIndex === -1) {
      console.log(`❌ 無法在 Google Sheets 中找到名稱為 ${bossName} 的列`);
    } else {
      const updateRange = `工作表1!B${rowIndex + 2}`; // 第二欄是擊殺時間
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[now]],
        },
      });
      console.log(`✅ 已更新 Google Sheets 中 ${bossName} 的擊殺時間`);
    }

    res.json({ message: 'BOSS 時間已更新', boss });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 發生錯誤：', err);
    res.status(500).json({ error: 'Google Sheets 更新失敗' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動在 http://localhost:${PORT}`);
});
