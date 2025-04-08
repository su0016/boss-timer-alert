const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

const SHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU';
const SHEET_RANGE = 'A2:D';
const creds = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function getSheet() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  return sheets;
}

app.get('/api/bosses', async (req, res) => {
  const sheets = await getSheet();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  });
  const rows = result.data.values || [];
  const bosses = rows.map(row => ({
    name: row[0],
    respawnTime: row[3] || ''
  }));
  res.json(bosses);
});

app.post('/api/boss/:name/adjustRespawnTime', async (req, res) => {
  const { name } = req.params;
  const { respawnTime } = req.body;

  const sheets = await getSheet();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  });

  const rows = result.data.values || [];
  const index = rows.findIndex(row => row[0] === name);

  if (index === -1) return res.status(404).send('BOSS not found');

  const rowNumber = index + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `D${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[respawnTime]]
    }
  });
  res.send('Updated');
});

app.get('/api/notify/:name', (req, res) => {
  const bossName = req.params.name;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `⚔️ ${bossName} 即將重生！` })
    });
  }
  res.send('Notified');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
