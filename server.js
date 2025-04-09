const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// ===== Google Sheets 設定 =====
const SHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU';
const SHEET_RANGE = 'A2:D';
const creds = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function getSheet() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  return sheets;
}

// ===== 網頁 API =====
app.get('/api/bosses', async (req, res) => {
  const sheets = await getSheet();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });
  const rows = result.data.values || [];
  const bosses = rows.map(row => ({
    name: row[0],
    respawnTime: row[3] || '',
  }));
  res.json(bosses);
});

app.post('/api/boss/:name/adjustRespawnTime', async (req, res) => {
  const { name } = req.params;
  const { respawnTime } = req.body;

  const sheets = await getSheet();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
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
      values: [[respawnTime]],
    },
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
      body: JSON.stringify({ content: `⚔️ ${bossName} 即將重生！` }),
    });
  }
  res.send('Notified');
});

// ===== Discord Bot =====
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

bot.once('ready', () => {
  console.log(`🤖 Discord Bot logged in as ${bot.user.tag}`);
});

bot.on('messageCreate', async message => {
  if (message.author.bot) return;

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (channelId && message.channel.id !== channelId) return; // 限定頻道用

  if (message.content.startsWith('!boss')) {
    const args = message.content.split(' ');
    if (args.length !== 3) {
      message.reply('❌ 格式錯誤，請使用 `!boss 名稱 時間` 例如：`!boss 火龍 16:30`');
      return;
    }

    const bossName = args[1];
    const respawnTime = args[2];

    try {
      const sheets = await getSheet();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: SHEET_RANGE,
      });

      const rows = result.data.values || [];
      const index = rows.findIndex(row => row[0] === bossName);

      if (index === -1) {
        message.reply(`❌ 找不到 BOSS 名稱：${bossName}`);
        return;
      }

      const rowNumber = index + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `D${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[respawnTime]],
        },
      });

      message.reply(`✅ 已更新 ${bossName} 的重生時間為 ${respawnTime}`);
    } catch (err) {
      console.error('Google Sheets 更新錯誤：', err);
      message.reply('❌ 無法更新 Google Sheet，請稍後再試');
    }
  }
});

// 啟動 bot
bot.login(process.env.DISCORD_BOT_TOKEN);

// 啟動 web 伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));
