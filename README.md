# SITCON 人物關係圖

一個功能完整的人物關係圖表管理系統，使用 **Node.js + Express + MySQL + Apache ECharts** 建立。支援動態人物管理、關係建立、高解析度圖片輸出，以及 API 金鑰驗證等功能。

> **重要更新**：已從 Cytoscape.js 完全遷移至 Apache ECharts，提供更好的效能與視覺效果。

![SITCON Relationship Graph](https://via.placeholder.com/800x400/77B55A/FFFFFF?text=SITCON+人物關係圖)

## ✨ 功能特色

### 🎯 核心功能
- **人物管理**：新增、查詢人物資料，支援完整 Unicode（含 Emoji）
- **關係管理**：建立、刪除人物間的連線關係，雙向檢查防止重複
- **視覺化顯示**：使用 Apache ECharts 渲染互動式力導向關係圖
- **智能過濾**：只顯示有連線的節點，自動隱藏孤立節點
- **佈局切換**：支援力導向與圓形兩種佈局模式

### 🛡️ 安全特性
- **API 金鑰驗證**：POST/DELETE 請求需要驗證（資料修改操作）
- **公開讀取**：GET 請求無需驗證（資料查詢和圖片生成）
- **輸入驗證**：完整的參數驗證與類型檢查
- **SQL 注入防護**：參數化查詢 + 參數數量驗證
- **XSS 防護**：自動清理 HTML/Script 標籤
- **速率限制**：防止 API 濫用

### 📷 圖片輸出
- **超高解析度**：4000×4000px (2x deviceScaleFactor)
- **自訂參數**：支援線條粗細、節點大小、透明度調整
- **快速生成**：約 2-3 秒即時生成
- **力導向佈局**：自動優化節點位置，減少重疊（500 次迭代）
- **PNG 格式**：支援透明度，適合各種背景

### 🎨 視覺設計
- **現代化配色**：綠色節點 (#77B55A)、灰色半透明連線
- **無箭頭設計**：簡潔的直線連接，強調雙向關係
- **高對比文字**：白色文字 + 深綠色描邊，清晰易讀
- **響應式佈局**：適配不同螢幕尺寸

## 📦 專案結構

```
sitcon-relationship/
├── config.js              # 主要設定檔（資料庫連線、API 金鑰等）
├── config.js.example      # 設定檔範例
├── server.js              # Express 後端伺服器 (900+ 行)
├── db.sql                 # MySQL 資料庫建表語法
├── package.json           # npm 依賴設定
├── public/
│   └── index.html         # Debug 頁面 (ECharts 互動式圖表)
├── n8n_prompt.md          # Telegram Bot AI Agent 設定
├── cursor.md              # 完整交接文件
└── README.md              # 本說明文件
```

## 🚀 快速開始

### 1. 安裝依賴套件

```bash
npm install
```

### 2. 設定資料庫連線

複製設定檔範例並填入您的資料：

```bash
cp config.js.example config.js
```

編輯 `config.js` 檔案：

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
    key: "your_secure_api_key_here"  // 請使用強密碼！
  }
};
```

### 3. 建立資料庫

```bash
# 登入 MySQL
mysql -u root -p

# 建立資料庫
CREATE DATABASE sitcon_relationship CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sitcon_relationship;

# 匯入資料表結構
source db.sql;
```

### 4. 啟動伺服器

**開發環境：**
```bash
node server.js
```

**生產環境（推薦使用 PM2）：**
```bash
pm2 start server.js --name sitcon-relationship
pm2 save
pm2 startup
```

### 5. 開啟瀏覽器

造訪 `http://localhost:3000` 即可看到 Debug 頁面。

## 📡 API 文件

### 🔍 查詢 API（無需驗證）

#### 取得關係圖資料
```bash
GET /api/graph
```

**回應範例：**
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

#### 取得所有人物資料
```bash
GET /api/persons
```

**回應範例：**
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

#### 查詢特定人物關係
```bash
GET /api/person/:id/relations
GET /api/relations?id=:id
```

**回應範例：**
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
  ]
}
```

### ✏️ 修改 API（需要 API 金鑰）

#### 新增人物
```bash
curl -X POST http://localhost:3000/api/addNode \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"name": "Charlie", "description": "@charlie"}'
```

**輸入限制：**
- `name`: 必填，最大 100 字元
- `description`: 選填，最大 500 字元

**成功回應：**
```json
{
  "success": true,
  "id": 15,
  "name": "Charlie",
  "description": "@charlie",
  "message": "人物新增成功"
}
```

#### 新增關係
```bash
curl -X POST http://localhost:3000/api/addEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

**防呆機制：**
- 禁止自己連自己
- 雙向檢查防止重複（1→3 與 3→1 視為相同）
- 自動檢查人物是否存在

#### 刪除關係
```bash
curl -X DELETE http://localhost:3000/api/deleteEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

**特性：**
- 雙向刪除（1→3 和 3→1 都會被刪除）

### 🖼️ 圖片生成 API（無需驗證）

#### 自訂參數 PNG 圖片
```bash
# 預設參數
GET /custom.png

# 自訂參數
GET /custom.png?width=8&nodesize=50&opacity=0.9

# 完整參數
GET /custom.png?width=6&nodesize=40&fontsize=16&opacity=0.8
```

**圖片規格：**
- **格式**：PNG (支援透明度)
- **Viewport 尺寸**：2000×2000 px
- **實際解析度**：4000×4000 px (deviceScaleFactor: 2)
- **檔案大小**：約 200-500 KB
- **生成時間**：約 2-3 秒

**可調參數：**

| 參數 | 說明 | 預設值 | 建議範圍 |
|------|------|--------|----------|
| `width` | 線條粗細 | 2 | 1-10 |
| `nodesize` | 節點大小 | 40 | 30-100 |
| `fontsize` | 字體大小 | 自動計算 | 10-50 |
| `opacity` | 線條透明度 | 0.8 | 0.1-1.0 |

## 🗄️ 資料庫結構

### persons 表（人物）
```sql
CREATE TABLE persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### relations 表（關係）
```sql
CREATE TABLE relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_person_id INT NOT NULL,
    to_person_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (to_person_id) REFERENCES persons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**設計重點：**
- UTF-8 MB4 完整支援 Emoji 和特殊字元
- CASCADE 刪除：刪除人物時自動刪除相關連線
- InnoDB 引擎：支援交易和外鍵約束

## 🛠️ 技術堆疊

### 後端技術
- **Node.js 18+** - JavaScript 運行環境
- **Express.js 4.18.2** - Web 應用框架
- **MySQL2 3.6.5** - 資料庫驅動（連接池）
- **Puppeteer 24.22.3** - 無頭瀏覽器（圖片生成）
- **CORS 2.8.5** - 跨域請求支援

### 前端技術
- **Apache ECharts 5.4.3** - 圖表視覺化函式庫
- **原生 JavaScript** - 前端互動邏輯
- **CSS3** - 現代化樣式設計

### 資料庫
- **MySQL 8.0+** - 關聯式資料庫
- **UTF-8 MB4** - 完整 Unicode 支援

### 已移除技術
- ~~Cytoscape.js~~ → 已改用 Apache ECharts

## 🔧 開發與維護

### 環境要求
- Node.js 18.0+
- MySQL 8.0+
- 2GB+ RAM（圖片生成需要）
- Chrome/Chromium（Puppeteer 自動下載）

### 伺服器重啟（PM2）
```bash
# 重啟伺服器
pm2 restart sitcon-relationship

# 查看日誌
pm2 logs sitcon-relationship

# 查看狀態
pm2 status
```

**重要：修改 `server.js` 或 `config.js` 後必須重啟！**

### 資料庫備份
```bash
# 備份資料庫
mysqldump -u root -p sitcon_relationship > backup_$(date +%Y%m%d).sql

# 還原資料庫
mysql -u root -p sitcon_relationship < backup_20251001.sql
```

### 效能優化
- ✅ ECharts Canvas 渲染器
- ✅ 力導向迭代次數（500 次，更好的佈局品質）
- ✅ Puppeteer 資源載入優化
- ✅ 資料庫查詢參數化
- ✅ 連接池管理（最多 10 個連線）

## 🐛 故障排除

### 常見問題

#### 1. 資料庫連線失敗
```
Error: ER_ACCESS_DENIED_ERROR
```
**解決方案**：
- 檢查 `config.js` 中的連線資訊
- 確認 MySQL 服務已啟動
- 確認使用者權限正確

#### 2. API 金鑰驗證失敗
```json
{"error": "需要 API Key"}
```
**解決方案**：
- 在請求中加入 `x-api-key` Header
- 或使用查詢參數 `?key=your_key`

#### 3. 圖片生成失敗
```
Error: Failed to launch the browser process
```
**解決方案**：
```bash
# Ubuntu/Debian 安裝依賴
sudo apt-get install -y chromium-browser \
  fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 libxss1

# 重新安裝 Puppeteer
npm install puppeteer --force
```

#### 4. 某些人物消失
**可能原因：**
- 該人物沒有任何連線關係（系統會自動隱藏孤立節點）
- 獨立群組被推到畫面外（調整 `gravity` 參數）

**解決方案：**
- 檢查資料庫是否有該人物的關係
- 調整力導向參數（見 `cursor.md` 詳細說明）

#### 5. 首頁載入很卡
**已實施的優化：**
- Canvas 渲染器
- 關閉動畫效果
- 迭代次數 500（較高但獲得更好佈局）

**進一步優化：**
- 使用圓形佈局（幾乎無延遲）
- 降低迭代次數到 300
- 減少節點數量

## 📚 相關文件

- **[cursor.md](cursor.md)** - 完整技術交接文件（868 行）
- **[n8n_prompt.md](n8n_prompt.md)** - Telegram Bot AI Agent 設定
- **[db.sql](db.sql)** - 資料庫結構與範例資料

## 🎯 使用場景

此系統特別適合：
- ✅ 社群人際關係管理
- ✅ 組織架構視覺化
- ✅ 知識圖譜建立
- ✅ 社交網路分析
- ✅ Telegram Bot 整合

## 🤝 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

**注意事項：**
- 請遵循現有的程式碼風格
- 新增功能請更新相關文件
- 修改後請測試所有 API 端點

## 📄 授權條款

此專案採用 MIT 授權條款。

## 🙋 支援與回饋

如果您有任何問題或建議：
- 開啟 [GitHub Issue](../../issues)
- 發送 Pull Request
- 查閱 [cursor.md](cursor.md) 完整技術文件

## 📊 專案統計

- **程式碼行數**：約 1200 行
- **API 端點**：9 個
- **資料表**：2 個
- **依賴套件**：5 個
- **文件完整度**：⭐⭐⭐⭐⭐

## 🎉 專案里程碑

- ✅ 2025-09-25: 初始版本發布（Cytoscape.js）
- ✅ 2025-10-01: 重大更新（遷移至 ECharts）
  - 完全移除 Cytoscape.js
  - 圖片解析度提升到 4000×4000px
  - 視覺設計優化（線條改為灰色）
  - 佈局品質提升（迭代次數 500）
  - 完整交接文件（cursor.md）

---

**🌟 感謝使用 SITCON 人物關係圖系統！**

**版本**：2.0.0 (ECharts)
**最後更新**：2025-10-01
**專案狀態**：✅ 穩定運行，功能完整
