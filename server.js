const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const bossDataFilePath = path.join(__dirname, 'bossData.json');

// 設定靜態資料夾
app.use(express.json());
app.use(express.static('public')); // 讓 public 資料夾可訪問

// 讀取 BOSS 資料
function loadBossData() {
  try {
    const data = fs.readFileSync(bossDataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('讀取 BOSS 資料失敗:', error);
    return [];
  }
}

// 寫入 BOSS 資料
function saveBossData(data) {
  try {
    fs.writeFileSync(bossDataFilePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('寫入 BOSS 資料失敗:', error);
  }
}

// 獲取所有 BOSS 資料
app.get('/api/bosses', (req, res) => {
  const data = loadBossData();
  res.json(data);
});

// 更新 BOSS 死亡時間
app.post('/api/boss/:id/kill', (req, res) => {
  const bossId = req.params.id;
  const now = new Date().toISOString();

  let data = loadBossData();  // 讀取最新的資料
  const boss = data.find(b => b.id === bossId);

  if (boss) {
    boss.lastKilled = now;
    saveBossData(data);  // 儲存更新後的資料

    res.json({ message: 'BOSS 時間已重設', boss });
  } else {
    res.status(404).json({ error: '找不到該BOSS' });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器啟動在 http://localhost:${PORT}`);
});
