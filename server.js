const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public')); // 讓 public 資料夾可訪問

// 讀取 BOSS 資料
app.get('/api/bosses', (req, res) => {
  const data = JSON.parse(fs.readFileSync('bossData.json', 'utf8'));
  res.json(data);
});

// 更新 BOSS 死亡時間
app.post('/api/boss/:id/kill', (req, res) => {
  const bossId = req.params.id;
  const now = new Date().toISOString();

  let data = JSON.parse(fs.readFileSync('bossData.json', 'utf8'));
  const boss = data.find(b => b.id === bossId);
  if (boss) {
    boss.lastKilled = now;
    fs.writeFileSync('bossData.json', JSON.stringify(data, null, 2));
    res.json({ message: '更新成功', boss });
  } else {
    res.status(404).json({ error: '找不到該BOSS' });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器啟動在 http://localhost:${PORT}`);
});
