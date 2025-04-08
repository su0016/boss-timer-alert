const express = require('express');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_CREDENTIALS = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
const SPREADSHEET_ID = '您的Google Sheets ID';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const sheets = google.sheets('v4');
const auth = new google.auth.JWT(
  GOOGLE_SHEETS_CREDENTIALS.client_email,
  null,
  GOOGLE_SHEETS_CREDENTIALS.private_key.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

app.use(express.json());
app.use(express.static('public'));

async function getBossData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'bossdata!A2:C',
    });

    return response.data.values.map(row => ({
      name: row[0],
      lastKilled: row[1],
      respawnTime: row[2],
    }));
  } catch (error) {
    console.error('❌ 無法讀取 Google Sheets', error);
    return [];
  }
}

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

app.get('/api/bosses', async (req, res) => {
  const data = await getBossData();
  res.json(data);
});

app.post('/api/boss/:name/setRespawnTime', async (req, res) => {
  const bossName = req.params.name;
  const { time } = req.body;

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: '時間格式錯誤，請使用 HH:mm' });
  }

  const today = new Date();
  const [hour, minute] = time.split(':');
  const respawnDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(hour), parseInt(minute));

  let data = await getBossData();
  const boss = data.find(b => b.name === bossName);
  if (!boss) return res.status(404).json({ error: `找不到 ${bossName}` });

  boss.respawnTime = respawnDate.toISOString();

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

    await sendDiscordNotification(bossName, `設定新的重生時間為 ${time}`);

    res.json({ message: `BOSS ${bossName} 的重生時間已設定為 ${time}`, respawnTime: boss.respawnTime });
  } catch (err) {
    console.error('❌ 更新 Google Sheets 錯誤：', err);
    res.status(500).json({ error: '無法更新 Google Sheets' });
  }
});

setInterval(async () => {
  try {
    const data = await getBossData();
    const now = new Date();

    for (const boss of data) {
      if (!boss.respawnTime) continue;

      const respawnTime = new Date(boss.respawnTime);
      const timeDiff = respawnTime - now;

      if (timeDiff <= 60000 && timeDiff > 0) {
        await sendDiscordNotification(boss.name, `
::contentReference[oaicite:1]{index=1}
 
