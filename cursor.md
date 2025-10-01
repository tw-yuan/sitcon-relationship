# SITCON 人物關係圖專案 - 完整交接文件

## 📋 專案概述

這是一個功能完整的人物關係圖表管理系統，使用 **Node.js + Express + MySQL + Apache ECharts** 建立。支援動態人物管理、關係建立、高解析度圖片輸出，以及 API 金鑰驗證等功能。

**重要變更：已從 Cytoscape.js 完全遷移至 Apache ECharts**

## 🏗️ 專案結構

```
sitcon-relationship/
├── config.js              # 主要設定檔（包含資料庫連線、API 金鑰等）
├── config.js.example      # 設定檔範例
├── server.js              # Express 後端伺服器 (900+ 行)
├── db.sql                 # MySQL 資料庫建表語法與範例資料
├── package.json           # npm 依賴設定
├── public/
│   └── index.html         # 前端 debug 頁面 (Apache ECharts 互動式圖表)
├── .gitignore             # Git 忽略檔案
├── .gitattributes         # Git 屬性設定
├── .gitmessage            # Git 提交訊息範本
├── n8n_prompt.md          # n8n AI Agent 提示文件（Telegram Bot 整合）
├── cursor.md              # 本交接文件
└── README.md              # 專案說明文件
```

## 🎯 核心功能

### 人物管理
- **新增人物**：`POST /api/addNode` (需要 API 金鑰)
- **查詢所有人物**：`GET /api/persons` (公開)
- **查詢特定人物關係**：`GET /api/person/:id/relations` 或 `GET /api/relations?id=...` (公開)

### 關係管理
- **建立關係**：`POST /api/addEdge` (需要 API 金鑰)
- **刪除關係**：`DELETE /api/deleteEdge` (需要 API 金鑰，支援雙向刪除)

### 視覺化功能
- **Debug 頁面**：`GET /` (Apache ECharts 互動式圖表，僅供開發測試)
- **圖片生成**：`GET /custom.png` (4000x4000px 高解析度 PNG)

## 🛡️ 安全特性

### API 金鑰驗證
- **需要驗證的端點**：所有 POST/DELETE 請求
- **公開端點**：所有 GET 請求
- **驗證方式**：`x-api-key` 標頭或 `?key=xxx` 查詢參數

### 輸入驗證與防護
- **參數驗證**：使用 `validateInput` 中介軟體
- **SQL 注入防護**：使用參數化查詢 + 參數數量檢查
- **XSS 防護**：使用 `sanitizeInput` 清理 HTML/Script 標籤
- **速率限制**：
  - 新增人物：30 次/分鐘
  - 新增關係：50 次/分鐘
  - 刪除關係：20 次/分鐘

### 錯誤處理
- JSON 解析錯誤處理
- 請求大小限制 (10MB)
- 全域異常捕獲
- 詳細的錯誤日誌

## 📷 圖片輸出功能詳解

### `/custom.png` 端點規格

#### 基本資訊
- **格式**：PNG (支援透明度)
- **viewport 尺寸**：2000×2000 px
- **實際解析度**：4000×4000 px (deviceScaleFactor: 2)
- **檔案大小**：約 200-500 KB (取決於節點數量)
- **生成時間**：約 1.5-2 秒

#### 預設參數
```javascript
// URL: /custom.png
lineWidth: 2           // 線條粗細
nodeSize: 40           // 節點大小
fontSize: 16           // 字體大小 (自動計算)
opacity: 0.8           // 線條透明度
```

#### 可調參數
```bash
# 範例 URL
GET /custom.png?width=8&nodesize=50&opacity=0.9&fontsize=20
```

| 參數 | 說明 | 預設值 | 範圍 |
|------|------|--------|------|
| `width` | 線條粗細 | 2 | 1-10 (建議) |
| `nodesize` | 節點大小 | 40 | 30-100 (建議) |
| `fontsize` | 字體大小 | 自動 (nodeSize/2.5) | 10-50 |
| `opacity` | 線條透明度 | 0.8 | 0.1-1.0 |

#### 力導向佈局參數
```javascript
force: {
    repulsion: 1800,      // 節點排斥力
    gravity: 0.2,         // 中心重力
    edgeLength: 150,      // 連線長度
    friction: 0.6,        // 摩擦力
    layoutIterations: 500 // 迭代次數
}
```

#### 效能優化
- ECharts `devicePixelRatio: 2` (高解析度)
- Puppeteer `deviceScaleFactor: 2` (2x 縮放)
- 禁用不必要的資源載入 (圖片、字體、樣式)
- 力導向迭代次數 (500 次)
- Puppeteer 啟動參數優化

## 🎨 視覺設計規範

### 顏色配置
- **節點顏色**：綠色 `#77B55A`
- **節點邊框**：綠色 `#77B55A` (2px)
- **線條顏色**：灰色半透明 `rgba(128, 128, 128, 0.8)`
- **文字顏色**：白色 `#fff`
- **文字描邊**：深綠色 `#2d4a1f` (2px)
- **背景顏色**：白色 `#ffffff`

### 佈局特性
- **佈局算法**：Force-Directed (力導向)
- **初始佈局**：Circular (圓形)
- **線條樣式**：直線 (curveness: 0)
- **無箭頭**：簡潔的雙向連接
- **邊距**：0 (充滿整個畫布)
- **只顯示有連線的節點** (孤立節點自動隱藏)

## 🗄️ 資料庫結構

### persons 表
```sql
CREATE TABLE persons (
    id INT AUTO_INCREMENT PRIMARY KEY,           -- 人物唯一 ID
    name VARCHAR(255) NOT NULL,                  -- 人物姓名（必填）
    description TEXT,                            -- 人物描述（通常存 Telegram Username）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 建立時間
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### relations 表
```sql
CREATE TABLE relations (
    id INT AUTO_INCREMENT PRIMARY KEY,           -- 關係唯一 ID
    from_person_id INT NOT NULL,                 -- 來源人物 ID
    to_person_id INT NOT NULL,                   -- 目標人物 ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 建立時間
    FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (to_person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 重要設計考量
- **UTF-8 MB4**：完整支援所有 Unicode 字元（包含 Emoji）
- **CASCADE 刪除**：刪除人物時自動刪除相關連線
- **InnoDB 引擎**：支援交易和外鍵約束

## 🔧 技術架構

### 後端技術
- **Node.js 18+** + **Express.js 4.18.2**：Web 伺服器框架
- **MySQL2 3.6.5**：資料庫驅動（使用連接池）
- **Puppeteer 24.22.3**：無頭瀏覽器，用於圖片生成
- **CORS 2.8.5**：跨域請求支援

### 前端技術 (Debug 頁面)
- **Apache ECharts 5.4.3**：圖表視覺化函式庫
- **原生 JavaScript**：互動控制
- **CSS3**：現代化樣式設計

### 已移除技術
- ~~**Cytoscape.js**~~ (已完全移除，改用 ECharts)

### 中介軟體與安全層
- **請求日誌**：記錄所有請求 (時間戳、方法、URL、IP)
- **JSON 解析**：10MB 限制，嚴格模式
- **速率限制**：記憶體內實作，使用 Map 儲存
- **全域錯誤處理**：統一的 JSON 錯誤回應格式

## 🚀 安裝與執行

### 1. 安裝依賴
```bash
npm install
```

### 2. 設定環境
```bash
cp config.js.example config.js
# 編輯 config.js 設定資料庫連線和 API 金鑰
```

**config.js 範例**：
```javascript
module.exports = {
  db: {
    host: "localhost",
    user: "your_username",
    password: "your_password",
    database: "sitcon_relationship"
  },
  server: {
    port: 3000
  },
  api: {
    key: "your_secure_api_key_here"  // 請使用強密碼
  }
};
```

### 3. 建立資料庫
```bash
mysql -u root -p < db.sql
```

### 4. 啟動伺服器（開發環境）
```bash
node server.js
```

### 5. 啟動伺服器（生產環境 - PM2）
```bash
pm2 start server.js --name sitcon-relationship
pm2 save
pm2 startup
```

### 6. 伺服器重啟（PM2 環境）
```bash
# 重啟指令
pm2 restart 3  # 3 是 PM2 程序 ID

# 查看日誌
pm2 logs 3

# 查看狀態
pm2 status
```

**重要：每次修改 server.js 或 config.js 後都必須重啟！**

## 📡 API 端點詳細說明

### 查詢 API（無需驗證）

#### GET /api/graph
取得完整關係圖資料（只包含有連線的節點）

**回應格式**：
```json
{
  "success": true,
  "nodes": [
    { "id": "1", "label": "Alice" },
    { "id": "2", "label": "Bob" }
  ],
  "edges": [
    { "id": "1", "from": "1", "to": "2" }
  ],
  "timestamp": "2025-10-01T12:00:00.000Z",
  "counts": {
    "totalPersons": 10,
    "connectedPersons": 8,
    "relations": 12
  }
}
```

#### GET /api/persons
取得所有人物列表（包含孤立節點）

**回應格式**：
```json
{
  "success": true,
  "persons": [
    {
      "id": 1,
      "name": "Alice",
      "description": "@alice_telegram",
      "created_at": "2025-10-01T12:00:00.000Z"
    }
  ],
  "count": 10,
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

#### GET /api/person/:id/relations
查詢特定人物的所有關係

**範例**：`GET /api/person/5/relations`

**回應格式**：
```json
{
  "success": true,
  "person": {
    "id": 5,
    "name": "Alice",
    "description": "@alice"
  },
  "degree": 3,
  "neighbors": [
    { "id": 1, "name": "Bob" },
    { "id": 2, "name": "Charlie" }
  ],
  "edges": [
    { "id": 10, "from": 5, "to": 1 },
    { "id": 11, "from": 5, "to": 2 }
  ],
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

#### GET /api/relations?id=:id
查詢參數版本（與上面功能相同）

**範例**：`GET /api/relations?id=5`

### 修改 API（需要 API 金鑰）

#### POST /api/addNode
新增人物

**請求範例**：
```bash
curl -X POST http://localhost:3000/api/addNode \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"name": "Charlie", "description": "@charlie"}'
```

**輸入驗證**：
- `name`: 必填，字串，最大 100 字元
- `description`: 選填，字串，最大 500 字元

**成功回應**：
```json
{
  "success": true,
  "id": 15,
  "name": "Charlie",
  "description": "@charlie",
  "message": "人物新增成功",
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

**錯誤回應**：
- 409: 人物已存在
- 401: 缺少 API Key
- 403: API Key 無效
- 400: 輸入驗證失敗

#### POST /api/addEdge
建立關係（雙向檢查，禁止重複）

**請求範例**：
```bash
curl -X POST http://localhost:3000/api/addEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

**輸入驗證**：
- `from`: 必填，字串，數字 ID，範圍 1-2147483647
- `to`: 必填，字串，數字 ID，範圍 1-2147483647
- 禁止 `from === to` (自己連自己)

**成功回應**：
```json
{
  "success": true,
  "id": 25,
  "from": 1,
  "to": 3,
  "message": "關係新增成功",
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

**錯誤回應**：
- 409: 關係已存在（雙向檢查）
- 404: 人物不存在
- 400: 無效的關係（自己連自己）

#### DELETE /api/deleteEdge
刪除關係（雙向刪除）

**請求範例**：
```bash
curl -X DELETE http://localhost:3000/api/deleteEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

**成功回應**：
```json
{
  "success": true,
  "deletedRows": 1,
  "message": "關係刪除成功",
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

**錯誤回應**：
- 404: 找不到指定的關係

### 圖片生成 API（無需驗證）

#### GET /custom.png
生成自訂參數的 PNG 圖片

**範例**：
```bash
# 預設參數
GET /custom.png

# 自訂參數
GET /custom.png?width=8&nodesize=50&opacity=0.9

# 完整參數
GET /custom.png?width=6&nodesize=40&fontsize=16&opacity=0.8
```

**回應**：
- Content-Type: `image/png`
- Content-Disposition: `inline; filename="relationship-echarts.png"`
- Cache-Control: `no-cache`

## 🔍 重要程式碼區塊

### 資料庫查詢包裝器 (server.js:106-152)
```javascript
function queryDatabase(sql, params = []) {
  return new Promise((resolve, reject) => {
    // SQL injection 安全性檢查
    if (typeof sql !== 'string') {
      reject(new Error('SQL 查詢必須是字串類型'));
      return;
    }

    // 確保參數是陣列
    if (!Array.isArray(params)) {
      reject(new Error('SQL 參數必須是陣列'));
      return;
    }

    // 檢查參數數量與 SQL 中的 ? 數量是否匹配
    const placeholderCount = (sql.match(/\?/g) || []).length;
    if (placeholderCount !== params.length) {
      reject(new Error(`SQL 參數數量不匹配`));
      return;
    }

    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}
```

**關鍵安全特性**：
- 類型檢查
- 參數數量驗證
- 防止 SQL Injection
- 詳細錯誤日誌

### 輸入驗證中介軟體 (server.js:154-213)
```javascript
function validateInput(schema) {
  return (req, res, next) => {
    // 檢查必填欄位
    // 檢查資料類型
    // 檢查字串長度
    // 檢查數字範圍
    // 回傳詳細的驗證錯誤
  };
}
```

**使用範例**：
```javascript
app.post('/api/addNode',
  requireApiKey,
  validateInput({
    required: ['name'],
    types: { name: 'string', description: 'string' },
    maxLength: { name: 100, description: 500 }
  }),
  async (req, res) => { /* ... */ }
);
```

### API Key 驗證中介軟體 (server.js:215-253)
支援兩種驗證方式：
1. Header: `x-api-key: your_key`
2. Query: `?key=your_key`

### 速率限制中介軟體 (server.js:255-285)
記憶體內實作，使用 Map 儲存請求時間戳：
```javascript
function rateLimit(windowMs, maxRequests) {
  const requests = new Map();
  return (req, res, next) => {
    // 根據 IP 限制請求頻率
  };
}
```

### 圖片生成端點 (server.js:754-899)
```javascript
app.get('/custom.png', async (req, res) => {
  // 1. 取得參數
  // 2. 查詢資料庫
  // 3. 過濾有連線的節點
  // 4. 生成 ECharts HTML
  // 5. 啟動 Puppeteer
  // 6. 截圖
  // 7. 回傳 PNG
});
```

**效能優化重點**：
- `devicePixelRatio: 2` - 高解析度
- `deviceScaleFactor: 2` - 2x 縮放
- 禁用圖片/字體/樣式載入
- 迭代次數設為 500
- Puppeteer 啟動參數優化

## ⚠️ 注意事項與已知問題

### 環境要求
- **Node.js**: 18.0+ (建議 18.x LTS)
- **MySQL**: 8.0+ (需支援 utf8mb4)
- **記憶體**: 至少 2GB (Puppeteer 需要)
- **Chrome/Chromium**: Puppeteer 會自動下載

### 已知限制
1. **Puppeteer 在 root 環境**：需要 `--no-sandbox` 參數
2. **圖片生成時間**：約 1.5-2 秒，無法進一步加快（力導向計算需要時間）
3. **力導向佈局隨機性**：每次生成的圖片佈局可能略有不同
4. **孤立群組問題**：如果有 4 個人形成獨立小群組，可能會被推到邊緣
5. **記憶體使用**：Puppeteer 每次生成約佔用 200-300MB

### 效能考量
- **圖片生成**：每次即時生成，無快取（確保資料最新）
- **資料庫查詢**：使用連接池，最多 10 個連線
- **速率限制**：記憶體內儲存，重啟後清空

### 前端頁面用途
- **index.html 是 debug 頁面**：僅供開發者測試，不對外開放
- 提供參數調整介面，方便測試不同設定
- 可切換力導向/圓形佈局

## 🛠️ 開發建議

### 新增功能時
1. 遵循現有的中介軟體模式
2. 使用 `queryDatabase` 包裝器
3. 添加 `validateInput` 驗證
4. 添加速率限制（如果是寫入操作）
5. 添加詳細的錯誤處理
6. 更新本交接文件

### 除錯技巧
1. **檢查伺服器日誌**：`pm2 logs 3`
2. **測試 API**：使用 `curl` 或 Postman
3. **檢查資料庫**：
   ```bash
   mysql -u root -p
   USE sitcon_relationship;
   SELECT * FROM persons;
   SELECT * FROM relations;
   ```
4. **測試圖片生成**：直接訪問 `/custom.png`

### 常見問題排查

#### Q: 圖片生成很慢或失敗
A: 檢查：
- Puppeteer 是否正常安裝
- 記憶體是否足夠（至少 2GB）
- Chrome/Chromium 是否可用
- 查看 console.log 的錯誤訊息

#### Q: 某些人物不見了
A: 檢查：
- 那些人物是否有連線關係（孤立節點不顯示）
- 是否形成獨立小群組被推到畫面外（調整 gravity 參數）
- 資料庫中是否真的有這些人物和關係

#### Q: API 驗證失敗
A: 檢查：
- `config.js` 中的 API Key 是否設定
- 請求 Header 中的 `x-api-key` 是否正確
- 或使用 `?key=xxx` 查詢參數

#### Q: 資料庫連線失敗
A: 檢查：
- MySQL 服務是否啟動
- `config.js` 中的連線資訊是否正確
- 資料庫是否已建立
- 使用者權限是否足夠

## 📊 專案歷史與重大變更

### 2025-10-01 - 大規模重構（最新版本）
1. **完全移除 Cytoscape.js**，改用 Apache ECharts
2. **圖片生成改用 ECharts**：
   - 解析度提升到 4000x4000px
   - 改用力導向佈局
   - 生成時間約 2-3 秒
3. **前端效能優化**：
   - 使用 Canvas 渲染器
   - 迭代次數設為 500（更好的佈局品質）
   - 加入載入指示器
4. **視覺設計調整**：
   - 線條顏色：淺藍色 → 灰色 (rgba(128, 128, 128, 0.8))
   - 首頁線條粗細：1
   - 圖片線條粗細：2
   - 預設節點大小：40
   - 預設線條：直線
5. **新增佈局切換功能**：可在力導向與圓形佈局間切換

### 主要功能演進時間線
1. **初始版本**：基本的 Cytoscape.js 關係圖
2. **圖片生成**：添加 `/custom.png` 端點（使用 Cytoscape）
3. **API 完善**：添加人物和關係管理 API
4. **安全強化**：添加 API 金鑰驗證和輸入驗證
5. **錯誤處理**：完善全域錯誤處理機制
6. **視覺優化**：移除箭頭、調整透明度、優化佈局
7. **ECharts 遷移**：完全移除 Cytoscape.js，改用 ECharts（當前版本）

### 已移除功能
- ~~**Cytoscape.js**~~：已完全移除，改用 ECharts
- ~~**多個圖片端點**~~：原本有 `/full.png`、`/telegram.png`、`/telegram.jpg`
- ~~**優化重疊按鈕**~~：ECharts 的力導向已內建優化
- ~~**彈簧優化按鈕**~~：不再需要手動優化

## 🔧 維護指南

### 日常維護
1. **監控伺服器狀態**：`pm2 status`
2. **資料庫備份**：
   ```bash
   mysqldump -u root -p sitcon_relationship > backup_$(date +%Y%m%d).sql
   ```
3. **日誌檢查**：`pm2 logs 3 --lines 100`
4. **效能監控**：`pm2 monit`

### 伺服器重啟流程

**使用 PM2（推薦）**：
```bash
# 重啟
pm2 restart 3

# 查看日誌
pm2 logs 3

# 查看狀態
pm2 status
```

**手動重啟（不推薦）**：
```bash
pkill -f "node server.js"
sleep 2
cd /root/sitcon-relationship
node server.js &
```

**重啟時機**：
- 修改 `server.js` 後
- 修改 `config.js` 後
- 修改 `public/index.html` 後（前端不需要重啟，但為了清除快取建議重啟）
- 伺服器出現異常時
- 更新依賴套件後

### 資料庫維護
```bash
# 查看資料庫大小
SELECT
  table_name,
  table_rows,
  round((data_length + index_length) / 1024 / 1024, 2) as 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'sitcon_relationship';

# 優化資料表
OPTIMIZE TABLE persons, relations;

# 檢查孤立節點
SELECT p.* FROM persons p
LEFT JOIN relations r1 ON p.id = r1.from_person_id
LEFT JOIN relations r2 ON p.id = r2.to_person_id
WHERE r1.id IS NULL AND r2.id IS NULL;
```

### 升級建議
1. **依賴套件更新**：
   ```bash
   npm outdated
   npm update
   npm audit fix
   ```
2. **Node.js 版本升級**：保持在 18.x LTS
3. **MySQL 版本升級**：定期更新到最新穩定版
4. **安全更新**：`npm audit` 定期檢查

## 🚨 故障排除完整指南

### 圖片生成問題

#### 問題：圖片生成失敗或超時
**可能原因**：
- Puppeteer 未正確安裝
- 記憶體不足
- Chrome 未正確安裝

**解決方案**：
```bash
# 重新安裝 Puppeteer
npm install puppeteer --force

# 檢查記憶體
free -h

# 手動安裝 Chrome 依賴（Ubuntu/Debian）
sudo apt-get install -y \
  chromium-browser \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils
```

#### 問題：圖片模糊
**解決方案**：已設定 `devicePixelRatio: 2` 和 `deviceScaleFactor: 2`，如果還是模糊，可以將 `deviceScaleFactor` 提高到 3（但會更慢）

#### 問題：某些人物消失
**解決方案**：
1. 檢查是否為孤立節點（無連線）
2. 調整 `gravity` 參數（增加到 0.3-0.5）
3. 減少 `repulsion` 參數（降低到 1200-1500）

### API 問題

#### 問題：401 或 403 錯誤
**檢查項目**：
- API Key 是否正確
- Header 格式是否正確：`x-api-key: your_key`
- 或使用查詢參數：`?key=your_key`

#### 問題：409 衝突錯誤
**說明**：
- 人物名稱已存在
- 關係已存在（雙向檢查）
**這是正常的防呆機制**

#### 問題：429 速率限制
**說明**：請求太頻繁
**解決方案**：
- 減少請求頻率
- 或修改 `server.js` 中的速率限制參數

### 效能問題

#### 問題：首頁很卡
**已實施的優化**：
- Canvas 渲染器
- `layoutIterations: 500`（較高的迭代次數獲得更好的佈局）
- `animation: false`
- `lazyUpdate: false`

**如果還是很卡**：
- 使用圓形佈局（幾乎無延遲）
- 或降低迭代次數到 300

#### 問題：圖片生成太慢
**已實施的優化**：
- `layoutIterations: 500`
- 等待時間減少到 1 秒
- 禁用不必要的資源載入
- Puppeteer 啟動參數優化

**預期生成時間**：約 2-3 秒（因為迭代次數較多以獲得更好的佈局）

## 📞 聯絡資訊與相關文件

### 相關文件
- **[README.md](README.md)**：使用者說明文件
- **[n8n_prompt.md](n8n_prompt.md)**：Telegram Bot AI Agent 設定
- **[package.json](package.json)**：依賴套件列表
- **[db.sql](db.sql)**：資料庫結構與範例資料

### 技術支援資源
- **ECharts 官方文檔**：https://echarts.apache.org/
- **Puppeteer 文檔**：https://pptr.dev/
- **Express.js 文檔**：https://expressjs.com/
- **MySQL 文檔**：https://dev.mysql.com/doc/

### 專案統計
- **總程式碼行數**：約 1200 行
- **API 端點數量**：9 個
- **資料表數量**：2 個
- **主要依賴套件**：5 個

---

## 🎓 給下一位維護者的話

1. **這個專案已經很穩定**，主要功能都已完成並測試過
2. **不要輕易更改力導向參數**，目前的設定是經過多次調整的最佳平衡
3. **圖片生成速度已接近極限**，除非改用更簡單的佈局算法
4. **前端頁面只是 debug 工具**，實際使用是透過 Telegram Bot
5. **資料庫設計很簡單**，但已足夠使用，不建議過度設計
6. **安全機制已很完善**，包括速率限制、輸入驗證、SQL injection 防護
7. **遇到問題先看日誌**：`pm2 logs 3`
8. **修改後記得重啟**：`pm2 restart 3`
9. **定期備份資料庫**：人物關係資料很重要
10. **保持程式碼簡潔**：這個專案的優勢就是簡單易懂

**祝你維護順利！有問題歡迎查閱本文件或聯繫原開發團隊。**

---

**最後更新**：2025-10-01
**當前版本**：2.0.0 (ECharts)
**專案狀態**：✅ 穩定運行，功能完整
**建議維護頻率**：每月檢查一次日誌和資料庫
**預估維護時間**：每月 < 1 小時

**主要貢獻者**：
- 初始開發：[原開發者]
- ECharts 遷移：[2025-10-01]
- 效能優化：[2025-10-01]

---

**文件版本歷史**：
- v1.0 (2025-09-25)：初始版本（Cytoscape.js）
- v2.0 (2025-10-01)：大規模更新（ECharts 遷移 + 完整重寫）
