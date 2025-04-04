const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_USERNAME = 'su0016';
const REPO_NAME = 'boss-timer-alert';
const TOKEN = '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';
const BRANCH = 'main';

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

  if (!boss) {
    console.log(`❌ 找不到 ID 為 ${bossId} 的 BOSS`);
    return res.status(404).json({ error: '找不到該BOSS' });
  }

  boss.lastKilled = now;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ 已更新本地 bossData.json 中 ${boss.name} 的 lastKilled 時間為 ${now}`);

  // 上傳到 GitHub
  try {
    const apiURL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/bossData.json`;

    // 取得 SHA
    const getRes = await fetch(apiURL, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
      }
    });

    const fileInfo = await getRes.json();

    if (!fileInfo.sha) {
      console.error('❌ 取得 GitHub SHA 失敗：', fileInfo);
      return res.status(500).json({ error: '無法取得檔案 SHA', detail: fileInfo });
    }

    const encodedContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

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
      console.log('✅ 成功將 bossData.json 更新上傳到 GitHub');
      res.json({ message: 'BOSS 時間已更新並同步到 GitHub', boss });
    } else {
      console.error('❌ 上傳 GitHub 失敗：', updateData);
      res.status(500).json({ error: '上傳到 GitHub 失敗', detail: updateData });
    }
  } catch (err) {
    console.error('❌ 發生例外錯誤：', err);
    res.status(500).json({ error: 'GitHub API 發生錯誤' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動在 http://localhost:${PORT}`);
});
