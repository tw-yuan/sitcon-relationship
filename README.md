# SITCON 人物關係圖

一個功能完整的人物關係圖表管理系統，使用 Node.js + Express + MySQL + Cytoscape.js 建立。支援動態人物管理、關係建立、多格式圖片輸出，以及 API 金鑰驗證等功能。

![SITCON 人物關係圖](https://via.placeholder.com/800x400/77B55A/FFFFFF?text=SITCON+人物關係圖)

## 專案結構

```
sitcon-relationship/
├── config.js              # 主要設定檔（包含資料庫連線、API 金鑰等）
├── config.js.example      # 設定檔範例
├── server.js              # Express 後端伺服器
├── db.sql                 # MySQL 資料庫建表語法與範例資料
├── package.json           # npm 依賴設定
├── public/
│   └── index.html         # 前端顯示頁面
├── .gitignore             # Git 忽略檔案
├── .gitattributes         # Git 屬性設定
├── .gitmessage            # Git 提交訊息範本
└── README.md              # 專案說明文件
```

## 功能特色

### 🎯 核心功能
- **人物管理**：新增、查詢人物資料
- **關係管理**：建立、刪除人物間的連線關係
- **視覺化顯示**：使用 Cytoscape.js 渲染互動式關係圖
- **智能過濾**：只顯示有連線的節點，隱藏孤立節點

### 🛡️ 安全特性
- **API 金鑰驗證**：POST 請求需要驗證（資料修改操作）
- **公開讀取**：GET 請求無需驗證（資料查詢和圖片生成）

### 📷 圖片輸出
- **自訂參數 PNG**：`/custom.png` (2000x2000px) 支援線條粗細和節點大小調整
- **透明度支援**：PNG 格式提供真正的透明度效果，重疊線條清晰可見
- **高解析度**：2000x2000px 高畫質輸出，適合列印和展示

### 🎨 視覺設計
- **現代化風格**：綠色節點 (#77B55A)、淺藍色半透明連線 (rgba(176,211,243,0.6))、白色背景
- **無箭頭設計**：簡潔的直線連接，不顯示方向性
- **響應式佈局**：適配不同螢幕尺寸

## 安裝與執行步驟

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

```js
module.exports = {
  db: {
    host: "localhost",                    // MySQL 主機位址
    user: "your_username",               // MySQL 使用者名稱
    password: "your_password",           // MySQL 密碼
    database: "sitcon_relationship"      // 資料庫名稱
  },
  server: {
    port: 3000                           // 伺服器埠號
  },
  api: {
    key: "your_secure_api_key_here"      // API 驗證金鑰（請使用強密碼）
  }
};
```

### 3. 建立資料庫

```bash
# 登入 MySQL
mysql -u your_username -p

# 建立資料庫
CREATE DATABASE sitcon_relationship CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sitcon_relationship;

# 匯入資料表結構和範例資料
source db.sql;
```

### 4. 啟動伺服器

```bash
# 正式環境
node server.js

# 開發環境（自動重啟）
npm run dev
```

### 5. 開啟瀏覽器

造訪 `http://localhost:3000` 即可看到人物關係圖。

## 🚀 快速開始

```bash
# 克隆專案
git clone <repository-url>
cd sitcon-relationship

# 安裝依賴
npm install

# 設定資料庫連線
cp config.js.example config.js
# 編輯 config.js 填入您的資料庫資訊

# 建立資料庫並匯入資料
mysql -u username -p < db.sql

# 啟動伺服器
npm start
```

## 📡 API 文件

### 🔍 查詢 API（無需驗證）

#### 取得關係圖資料
```bash
GET /api/graph
```

回應格式：
```json
{
  "nodes": [
    { "id": "1", "label": "Alice" },
    { "id": "2", "label": "Bob" }
  ],
  "edges": [
    { "id": "1", "from": "1", "to": "2" }
  ]
}
```

#### 取得所有人物資料
```bash
GET /api/persons
```

回應格式：
```json
{
  "success": true,
  "count": 4,
  "data": [
    {
      "id": 1,
      "name": "Alice",
      "description": "SITCON 的組織者",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### ✏️ 修改 API（需要 API 金鑰）

#### 新增人物
```bash
curl -X POST http://localhost:3000/api/addNode \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"name": "Charlie", "description": "SITCON 講師"}'
```

#### 新增關係
```bash
curl -X POST http://localhost:3000/api/addEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

#### 刪除關係
```bash
curl -X DELETE http://localhost:3000/api/deleteEdge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"from": "1", "to": "3"}'
```

### 🖼️ 圖片生成 API（無需驗證）

#### 自訂參數 PNG 圖片
```bash
GET /custom.png                        # 預設設定：線條粗細 7、節點大小 40
GET /custom.png?width=5&nodesize=50    # 自訂參數：線條粗細 5、節點大小 50
```

**圖片特性：**
- **格式**：PNG (支援透明度)
- **尺寸**：2000x2000px 高解析度
- **透明度**：60% 透明的線條，重疊部分清晰可見
- **快取控制**：無快取，每次都是即時生成

**參數說明：**
- `width`: 線條粗細 (無限制，預設 7)
- `nodesize`: 節點大小 (無限制，預設 40)

## 🗄️ 資料庫結構

### persons 表
```sql
CREATE TABLE persons (
    id INT AUTO_INCREMENT PRIMARY KEY,           -- 人物唯一 ID
    name VARCHAR(255) NOT NULL,                  -- 人物姓名（必填）
    description TEXT,                            -- 人物描述
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

## 📦 預設範例資料

專案包含以下範例資料：
- **Alice**（SITCON 的組織者）
- **Bob**（SITCON 的講師）
- **Charlie**（SITCON 的志工）  
- **Diana**（SITCON 的參與者）

以及預設的關係連線：Alice ↔ Bob, Alice ↔ Charlie, Bob ↔ Diana, Charlie ↔ Diana

## 🛠️ 技術堆疊

### 後端技術
- **Node.js 18+** - JavaScript 運行環境
- **Express.js** - Web 應用框架
- **MySQL2** - 資料庫驅動程式
- **Puppeteer** - 無頭瀏覽器（用於 PNG 圖片生成）
- **CORS** - 跨域請求支援

### 前端技術
- **HTML5** - 網頁結構
- **CSS3** - 樣式設計
- **Vanilla JavaScript** - 前端邏輯
- **Cytoscape.js** - 圖表視覺化函式庫

### 資料庫
- **MySQL 8.0+** - 關聯式資料庫
- **UTF-8 MB4** - 完整 Unicode 支援

## 🔧 開發與部署

### 開發環境
```bash
# 安裝 nodemon 進行開發（可選）
npm install -g nodemon

# 啟動開發伺服器
npm run dev
```

### 環境要求
- Node.js 18.0+
- MySQL 8.0+
- 2GB+ RAM（PNG 圖片生成需要記憶體）

### 部署建議
- 使用 PM2 進行進程管理
- 設定 Nginx 反向代理
- 定期備份 MySQL 資料庫
- 監控伺服器資源使用狀況

### 效能優化
- PNG 圖片即時生成，支援透明度效果
- 資料庫查詢已優化
- 支援水平擴展（無狀態設計）

## 🐛 故障排除

### 常見問題

#### 1. 資料庫連線失敗
```
Error: ER_ACCESS_DENIED_ERROR
```
**解決方案**：檢查 `config.js` 中的資料庫連線資訊是否正確。

#### 2. API 金鑰驗證失敗
```
{"error": "需要 API Key"}
```
**解決方案**：確保在 POST 請求中包含正確的 `x-api-key` 標頭。

#### 3. PNG 圖片生成失敗
```
Error: Failed to launch the browser process
```
**解決方案**：
- 確保系統有足夠記憶體（建議 2GB+）
- 安裝 Puppeteer 所需的系統依賴
- 在 Docker 或 root 環境中，確保使用 `--no-sandbox` 參數

#### 4. 中文字元顯示問題
確保 MySQL 使用 `utf8mb4` 字元集，並且連線字串包含 `charset: 'utf8mb4'`。

## 🤝 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權條款

此專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案。

## 🙋‍♂️ 支援與回饋

如果您有任何問題或建議，歡迎：
- 開啟 [GitHub Issue](../../issues)
- 發送 Pull Request
- 聯繫專案維護者

---

**🎉 感謝使用 SITCON 人物關係圖系統！**
