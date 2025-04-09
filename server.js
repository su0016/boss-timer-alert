import express from 'express'; // 改為使用 import
import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import bodyParser from 'body-parser';
import fetch from 'node-fetch'; // 改為使用 import
import { Client, GatewayIntentBits } from 'discord.js';

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// ===== Google Sheets 設定 =====
const SHEET_ID = '1FBZ7Div_p4KnphgaY-5UB0cxs8_n9B27Ry29reDN7EU';
const SHEET_RANGE = 'A2:D';

// 確認 GOOGLE_SHEETS_CREDENTIALS 是否正確
const creds = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS || '{}');
if (!creds.client_email || !creds.private_key) {
  console.error('🔴 Google Sheets credentials are missing or incorrect.');
} else {
  console.log('🟢 Google Sheets credentials loaded successfully.');
}

// 確認 DISCORD_BOT_TOKEN 是否正確
const discordToken = process.env.DISCORD_BOT_TOKEN;
if (!discordToken) {
  console.error('🔴 Discord Bot Token is missing.');
} else {
  console.log('🟢 Discord Bot Token is loaded successfully.');
}

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 取得 Google Sheets 客戶端
async function getSheet() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  return sheets;
}

// ===== 網頁 API =====
app.get('/api/bosses', async (req, res) => {
  try {
    console.log("🟢 Fetching bosses data from Google Sheets...");
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
    console.log("🟢 Boss data fetched successfully.");
    res.json(bosses);
  } catch (err) {
    console.error("🔴 Error fetching bosses data:", err.message);
    res.status(500).send('Failed to fetch data from Google Sheets');
  }
});

app.post('/api/boss/:name/adjustRespawnTime', async (req, res) => {
  const { name } = req.params;
  const { respawnTime } = req.body;

  try {
    console.log(`🟢 Adjusting respawn time for ${name} to ${respawnTime}...`);
    const sheets = await getSheet();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_RANGE,
    });

    const rows = result.data.values || [];
    const index = rows.findIndex(row => row[0] === name);

    if (index === -1) {
      console.log(`🔴 BOSS ${name} not found.`);
      return res.status(404).send('BOSS not found');
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
    console.log(`🟢 Respawn time for ${name} updated to ${respawnTime}`);
    res.send('Updated');
  } catch (err) {
    console.error("🔴 Error updating respawn time:", err.message);
    res.status(500).send('Failed to update respawn time');
  }
});

app.get('/api/notify/:name', (req, res) => {
  const bossName = req.params.name;
  // ===== Discord Webhook 設定 =====
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("🔴 Webhook URL is missing.");
} else {
  console.log("🟢 Webhook URL loaded successfully.");
}

// ===== 其他代碼 =====
console.log("Webhook URL:", webhookUrl);  // 確保 webhookUrl 已經定義
  if (webhookUrl) {
    console.log(`🟢 Sending notification for BOSS: ${bossName}`);
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `⚔️ ${bossName} 即將重生！` }),
    }).then(() => {
      console.log(`🟢 Notification sent for BOSS: ${bossName}`);
    }).catch((err) => {
      console.error("🔴 Error sending notification:", err.message);
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
      console.log(`🟢 Updating respawn time for BOSS ${bossName} to ${respawnTime}`);
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

      console.log(`🟢 BOSS ${bossName} respawn time updated to ${respawnTime}`);
      message.reply(`✅ 已更新 ${bossName} 的重生時間為 ${respawnTime}`);
    } catch (err) {
      console.error("🔴 Google Sheets 更新錯誤：", err.message);
      message.reply('❌ 無法更新 Google Sheet，請稍後再試');
    }
  }
});
console.log("Webhook URL:", webhookUrl);
// 啟動 bot
bot.login(process.env.DISCORD_BOT_TOKEN);

// 啟動 web 伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on ${PORT}`);
});
