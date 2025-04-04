const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_USERNAME = 'su0016';
const REPO_NAME = 'boss-timer-alert';
const TOKEN = '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';
const BRANCH = 'main'; // 或 'master'，依你 repo 為主

app.use(express.json());
app.use(express.static('public'));

app.get('/api/bosses', (req, res) => {
  const data = JSON.parse(fs.readFileSync('bossData.json', 'utf8'));
  res.json(data);
});

app.post('/api/boss/:id/kill', async (req, res) => {
  const bossId = req.params.id;
  const now = new Date().toISOString();
  const filePath = path.join(__dirname, 'bossData.json');

  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const boss = data.find(b => b.id === bossId);

  if (!boss) return res.status(404).json({ error: '找不到該BOSS' });

  boss.lastKilled = now;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  // 上傳到 GitHub
  try {
    const apiURL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/bossData.json`;

    // 先取得 SHA
    const getRes = await fetch(apiURL, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
      }
    });

    const fileInfo = await getRes.json();

    const encodedContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    // 更新 bossData.json 到 GitHub
    const updateRes = await fetch(apiURL, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: `更新 ${boss.name} 的擊殺時間`,
        content: encodedContent,
        sha: fileInfo.sha,
        branch: BRANCH
      })
    });

    const updateData = await updateRes.json();
    if (updateRes.ok) {
      res.json({ message: 'BOSS 時間已更新並同步到 GitHub', boss });
    } else {
      console.error(updateData);
      res.status(500).json({ error: '上傳到 GitHub 失敗' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'GitHub API 發生錯誤' });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器啟動在 http://localhost:${PORT}`);
});
