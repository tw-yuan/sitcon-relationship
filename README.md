# SITCON 人物關係圖

一個使用 Node.js + Express + MySQL + Cytoscape.js 建立的人物關係圖表 demo 專案。

## 專案結構

```
sitcon-relationship/
├── config.js          # 設定檔（需要填入 MySQL 連線資訊）
├── server.js          # Express 後端伺服器
├── db.sql             # MySQL 資料庫建表語法
├── package.json       # npm 依賴設定
├── public/
│   └── index.html     # 前端 Cytoscape.js 頁面
└── README.md          # 專案說明文件
```

## 功能特色

- **後端 API**：
  - `GET /api/graph`：取得所有人物與關係
  - `POST /api/addNode`：新增人物
  - `POST /api/addEdge`：新增關係
- **前端互動**：
  - 使用 Cytoscape.js 渲染網狀圖
  - 點擊節點顯示人物 ID
  - 拖曳節點調整位置
  - 表單新增人物和關係

## 安裝與執行步驟

### 1. 安裝依賴套件

```bash
npm install
```

### 2. 設定 MySQL 資料庫

#### 2.1 建立資料庫和資料表

```bash
# 登入 MySQL
mysql -u your_username -p

# 建立資料庫（可選）
CREATE DATABASE sitcon_relationship CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sitcon_relationship;

# 匯入建表語法
source db.sql
```

#### 2.2 設定資料庫連線

編輯 `config.js` 檔案，填入您的 MySQL 連線資訊：

```js
module.exports = {
  db: {
    host: "localhost",
    user: "your_username",      // 您的 MySQL 使用者名稱
    password: "your_password",  // 您的 MySQL 密碼
    database: "sitcon_relationship"  // 資料庫名稱
  },
  server: {
    port: 3000
  }
};
```

### 3. 啟動伺服器

```bash
node server.js
```

### 4. 開啟瀏覽器

造訪 `http://localhost:3000` 即可看到人物關係圖。

## API 使用範例

### 取得圖表資料

```bash
curl http://localhost:3000/api/graph
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

### 新增人物

```bash
curl -X POST http://localhost:3000/api/addNode \
  -H "Content-Type: application/json" \
  -d '{"name": "Charlie", "description": "SITCON 講師"}'
```

### 新增關係

```bash
curl -X POST http://localhost:3000/api/addEdge \
  -H "Content-Type: application/json" \
  -d '{"from": "1", "to": "3"}'
```

## 資料庫結構

### persons 表
- `id`: 主鍵（自動遞增）
- `name`: 人物姓名（必填）
- `description`: 人物描述
- `created_at`: 建立時間

### relations 表
- `id`: 主鍵（自動遞增）
- `from_person_id`: 來源人物 ID（外鍵）
- `to_person_id`: 目標人物 ID（外鍵）
- `created_at`: 建立時間

## 預設範例資料

專案包含以下範例資料：
- Alice（SITCON 的組織者）
- Bob（SITCON 的講師）
- Charlie（SITCON 的志工）
- Diana（SITCON 的參與者）

以及它們之間的關係連線。

## 技術堆疊

- **後端**：Node.js + Express + MySQL
- **前端**：HTML + CSS + JavaScript + Cytoscape.js
- **資料庫**：MySQL 8.0+

## 開發提示

- 開啟瀏覽器開發者工具的 Console，點擊節點可看到詳細的人物資訊
- 可以透過 API 測試工具（如 Postman）測試後端 API
- 修改 `public/index.html` 中的樣式來自訂圖表外觀
