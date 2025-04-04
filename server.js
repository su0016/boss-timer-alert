const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

// GitHub 資訊
const GITHUB_USERNAME = 'su0016';
const REPO_NAME = 'boss-timer-alert';
const TOKEN = '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';

app.use(express.json());
app.use(express.static('public'));

// 讀取 BOSS 資料
app.get('/api/bosses', (req, res) => {
  const data = JSON.parse(fs.readFileSync('bossData.json', 'utf8'));
  res.json(data);
});

// 更新並上傳 BOSS 死亡時間
app.post('/api/boss/:id/kill', (req, res) => {
  const bossId = req.params.id;
  const now = new Date().toISOString();
  const filePath = path.join(__dirname, 'bossData.json');

  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const boss = data.find(b => b.id === bossId);

  if (boss) {
    boss.lastKilled = now;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // 更新 GitHub 上的檔案
    const gitCmds = `
      git config --global user.email "bot@update.com"
      git config --global user.name "BossTimerBot"
      git add bossData.json
      git commit -m "Update ${boss.name} kill time"
      git push https://${TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git
    `;

    exec(gitCmds, { cwd: __dirname }, (err, stdout, stderr) => {
      if (err) {
        console.error("Git push failed:", stderr);
        return res.status(500).json({ error: "Git push failed" });
      }
      res.json({ message: 'BOSS 時間已更新並同步到 GitHub', boss });
    });
  } else {
    res.status(404).json({ error: '找不到該BOSS' });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器啟動在 http://localhost:${PORT}`);
});
