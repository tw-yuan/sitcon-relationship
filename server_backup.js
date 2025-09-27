const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const puppeteer = require('puppeteer');

const app = express();

// 全域異常處理
process.on('uncaughtException', (err) => {
  console.error('未捕獲的異常:', err);
  console.error('堆疊追蹤:', err.stack);
  // 優雅地關閉伺服器
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
  console.error('Promise:', promise);
  // 優雅地關閉伺服器
  process.exit(1);
});

// 中介軟體設定
app.use(cors());

// JSON 解析中介軟體與錯誤處理
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));

// JSON 解析錯誤處理
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON 解析錯誤:', err.message);
    return res.status(400).json({
      error: 'JSON 格式錯誤',
      message: '請檢查請求內容是否為有效的 JSON 格式'
    });
  }
  next(err);
});

// 請求大小限制處理
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: '請求內容過大',
      message: '請求內容不得超過 10MB'
    });
  }
  next(err);
});

// 靜態檔案服務
app.use(express.static('public'));

// 請求日誌中介軟體
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// 輸入驗證中介軟體
function validateInput(schema) {
  return (req, res, next) => {
    try {
      const { body } = req;
      
      // 檢查必要欄位
      if (schema.required) {
        for (const field of schema.required) {
          if (!body[field]) {
            return res.status(400).json({
              error: '缺少必要欄位',
              message: `欄位 '${field}' 為必填項目`,
              field: field
            });
          }
        }
      }
      
      // 檢查資料類型
      if (schema.types) {
        for (const [field, expectedType] of Object.entries(schema.types)) {
          if (body[field] !== undefined) {
            const actualType = typeof body[field];
            if (actualType !== expectedType) {
              return res.status(400).json({
                error: '資料類型錯誤',
                message: `欄位 '${field}' 應為 ${expectedType} 類型，但收到 ${actualType}`,
                field: field
              });
            }
          }
        }
      }
      
      // 檢查字串長度
      if (schema.maxLength) {
        for (const [field, maxLen] of Object.entries(schema.maxLength)) {
          if (body[field] && typeof body[field] === 'string' && body[field].length > maxLen) {
            return res.status(400).json({
              error: '字串長度超限',
              message: `欄位 '${field}' 長度不得超過 ${maxLen} 字元`,
              field: field
            });
          }
        }
      }
      
      // 檢查數值範圍
      if (schema.numberRange) {
        for (const [field, range] of Object.entries(schema.numberRange)) {
          if (body[field] !== undefined) {
            const num = Number(body[field]);
            if (isNaN(num) || num < range.min || num > range.max) {
              return res.status(400).json({
                error: '數值範圍錯誤',
                message: `欄位 '${field}' 必須是 ${range.min} 到 ${range.max} 之間的數字`,
                field: field
              });
            }
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('輸入驗證錯誤:', error);
      res.status(500).json({
        error: '輸入驗證失敗',
        message: '伺服器處理驗證時發生錯誤'
      });
    }
  };
}

// API Key 驗證中介軟體
function requireApiKey(req, res, next) {
  try {
    const providedKey = req.headers['x-api-key'] || req.query.key;
    
    if (!providedKey) {
      return res.status(401).json({ 
        error: '需要 API Key',
        message: '請在 Header 中提供 x-api-key 或在 query 參數中提供 key',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!config.api || !config.api.key) {
      console.error('伺服器設定錯誤: API Key 未設定');
      return res.status(500).json({
        error: '伺服器設定錯誤',
        message: '請聯繫系統管理員'
      });
    }
    
    if (providedKey !== config.api.key) {
      console.warn(`API Key 驗證失敗 - IP: ${req.ip}, Key: ${providedKey.substring(0, 5)}...`);
      return res.status(403).json({ 
        error: 'API Key 無效',
        message: '提供的 API Key 不正確',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  } catch (error) {
    console.error('API Key 驗證中介軟體錯誤:', error);
    res.status(500).json({
      error: '驗證過程發生錯誤',
      message: '請稍後再試'
    });
  }
}

// 建立 MySQL 連線池（更好的連線管理）
const db = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4',
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  idleTimeout: 300000,
  queueLimit: 0
});

// 測試資料庫連線
function testDatabaseConnection() {
  return new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) {
        console.error('無法連接到 MySQL:', err);
        reject(err);
        return;
      }
      
      connection.ping((pingErr) => {
        connection.release();
        if (pingErr) {
          console.error('MySQL 連線測試失敗:', pingErr);
          reject(pingErr);
          return;
        }
        
        console.log('已成功連接到 MySQL 資料庫');
        resolve();
      });
    });
  });
}

// 資料庫查詢包裝函數（內建 SQL injection 防護）
function queryDatabase(sql, params = []) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // SQL injection 安全性檢查
    if (typeof sql !== 'string') {
      reject(new Error('SQL 查詢必須是字串類型'));
      return;
    }
    
    // 檢查是否包含潛在危險的 SQL 模式（僅警告，不阻擋）
    const dangerousPatterns = [
      /;[\s]*drop[\s]+/i,
      /;[\s]*delete[\s]+/i,
      /;[\s]*truncate[\s]+/i,
      /;[\s]*alter[\s]+/i,
      /;[\s]*create[\s]+/i,
      /union[\s]+select/i,
      /\/\*[\s\S]*\*\//
    ];
    
    dangerousPatterns.forEach(pattern => {
      if (pattern.test(sql)) {
        console.warn('偵測到潛在危險的 SQL 模式:', {
          sql: sql.substring(0, 100),
          pattern: pattern.toString()
        });
      }
    });
    
    // 確保參數是陣列
    if (!Array.isArray(params)) {
      reject(new Error('SQL 參數必須是陣列'));
      return;
    }
    
    // 檢查參數數量與 SQL 中的 ? 數量是否匹配
    const placeholderCount = (sql.match(/\?/g) || []).length;
    if (placeholderCount !== params.length) {
      reject(new Error(`SQL 參數數量不匹配：期望 ${placeholderCount} 個，但提供 ${params.length} 個`));
      return;
    }
    
    db.query(sql, params, (err, results) => {
      const duration = Date.now() - startTime;
      
      if (err) {
        console.error(`資料庫查詢錯誤 (${duration}ms):`, {
          sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
          params: params.map(p => typeof p === 'string' && p.length > 50 ? p.substring(0, 50) + '...' : p),
          error: err.message,
          code: err.code
        });
        reject(err);
        return;
      }
      
      console.log(`資料庫查詢成功 (${duration}ms):`, {
        sql: sql.substring(0, 50) + (sql.length > 50 ? '...' : ''),
        rowCount: Array.isArray(results) ? results.length : 'N/A'
      });
      
      resolve(results);
    });
  });
}

// 輸入清理函數（額外的 SQL injection 防護）
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  // 移除潛在危險字元
  return input
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // 移除控制字元
    .replace(/['"\\;]/g, '') // 移除引號、反斜線、分號
    .trim();
}

// 驗證數字 ID 的函數
function validateId(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId) || numId < 1 || numId > 2147483647) {
    throw new Error(`無效的 ID: ${id}`);
  }
  return numId;
}

// 速率限制映射（簡單的內存存儲）
const rateLimitMap = new Map();

// 簡單的速率限制中介軟體
function rateLimit(windowMs = 60000, maxRequests = 100) {
  return (req, res, next) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // 清理過期的記錄
    if (rateLimitMap.has(clientId)) {
      const requests = rateLimitMap.get(clientId).filter(time => time > windowStart);
      rateLimitMap.set(clientId, requests);
    } else {
      rateLimitMap.set(clientId, []);
    }
    
    const requests = rateLimitMap.get(clientId);
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({
        error: '請求過於頻繁',
        message: `每分鐘最多 ${maxRequests} 次請求`,
        retryAfter: Math.ceil((requests[0] + windowMs - now) / 1000)
      });
    }
    
    requests.push(now);
    next();
  };
}

// 初始化資料庫連線
testDatabaseConnection().catch(err => {
  console.error('資料庫連線初始化失敗:', err);
  process.exit(1);
});

// API 路由

// GET /api/graph - 取得所有人物與關係
app.get('/api/graph', rateLimit(60000, 200), async (req, res) => {
  try {
    const getPersonsQuery = 'SELECT id, name FROM persons ORDER BY name';
    const getRelationsQuery = 'SELECT id, from_person_id, to_person_id FROM relations ORDER BY id';
    
    // 並行查詢人物和關係
    const [persons, relations] = await Promise.all([
      queryDatabase(getPersonsQuery),
      queryDatabase(getRelationsQuery)
    ]);
    
    // 資料驗證
    if (!Array.isArray(persons) || !Array.isArray(relations)) {
      throw new Error('資料庫回傳格式異常');
    }
    
    // 找出所有有連線的人物ID
    const connectedPersonIds = new Set();
    relations.forEach(relation => {
      if (relation.from_person_id && relation.to_person_id) {
        connectedPersonIds.add(relation.from_person_id.toString());
        connectedPersonIds.add(relation.to_person_id.toString());
      }
    });
    
    // 只保留有連線的人物節點
    const nodes = persons
      .filter(person => person.id && person.name && connectedPersonIds.has(person.id.toString()))
      .map(person => ({
        id: person.id.toString(),
        label: person.name.toString()
      }));
    
    const edges = relations
      .filter(relation => relation.id && relation.from_person_id && relation.to_person_id)
      .map(relation => ({
        id: relation.id.toString(),
        from: relation.from_person_id.toString(),
        to: relation.to_person_id.toString()
      }));
    
    res.json({ 
      success: true,
      nodes, 
      edges,
      timestamp: new Date().toISOString(),
      counts: {
        totalPersons: persons.length,
        connectedPersons: nodes.length,
        relations: edges.length
      }
    });
    
  } catch (error) {
    console.error('取得圖表資料錯誤:', error);
    res.status(500).json({ 
      error: '無法取得圖表資料',
      message: '伺服器內部錯誤，請稍後再試',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/persons - 取得所有人物資料
app.get('/api/persons', rateLimit(60000, 100), async (req, res) => {
  try {
    const query = 'SELECT id, name, description, created_at FROM persons ORDER BY created_at DESC';
    
    const results = await queryDatabase(query);
    
    // 資料驗證
    if (!Array.isArray(results)) {
      throw new Error('資料庫回傳格式異常');
    }
    
    // 格式化回應資料
    const persons = results
      .filter(person => person.id && person.name) // 過濾無效資料
      .map(person => ({
        id: person.id,
        name: person.name.toString(),
        description: (person.description || '').toString(),
        created_at: person.created_at
      }));
    
    res.json({
      success: true,
      count: persons.length,
      data: persons,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('查詢人物資料錯誤:', error);
    res.status(500).json({ 
      error: '無法取得人物資料',
      message: '伺服器內部錯誤，請稍後再試',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/addNode - 新增人物
app.post('/api/addNode', 
  rateLimit(60000, 20), // 每分鐘最多 20 次新增
  requireApiKey,
  validateInput({
    required: ['name'],
    types: { name: 'string', description: 'string' },
    maxLength: { name: 255, description: 1000 }
  }),
  async (req, res) => {
    try {
      const { name, description = '' } = req.body;
      
      // 檢查重複名稱
      const checkQuery = 'SELECT id FROM persons WHERE name = ?';
      const existing = await queryDatabase(checkQuery, [name]);
      
      if (existing.length > 0) {
        return res.status(409).json({
          error: '人物名稱重複',
          message: `人物 '${name}' 已經存在`,
          existingId: existing[0].id
        });
      }
      
      const insertQuery = 'INSERT INTO persons (name, description) VALUES (?, ?)';
      const result = await queryDatabase(insertQuery, [name.trim(), description.trim()]);
      
      if (!result.insertId) {
        throw new Error('新增人物失敗：未取得新增ID');
      }
      
      res.status(201).json({
        success: true,
        id: result.insertId,
        name: name.trim(),
        description: description.trim(),
        message: '人物新增成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('新增人物錯誤:', error);
      
      // 檢查是否為資料庫約束錯誤
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: '人物名稱重複',
          message: '該人物名稱已存在'
        });
      }
      
      res.status(500).json({ 
        error: '無法新增人物',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// POST /api/addEdge - 新增關係
app.post('/api/addEdge', requireApiKey, (req, res) => {
  const { from, to } = req.body;
  
  if (!from || !to) {
    return res.status(400).json({ error: 'from 和 to 參數為必填欄位' });
  }
  
  if (from === to) {
    return res.status(400).json({ error: '不能建立自己與自己的關係' });
  }
  
  // 檢查人物是否存在
  const checkPersonsQuery = 'SELECT id FROM persons WHERE id IN (?, ?)';
  db.query(checkPersonsQuery, [from, to], (err, results) => {
    if (err) {
      console.error('檢查人物錯誤:', err);
      return res.status(500).json({ error: '無法檢查人物是否存在' });
    }
    
    if (results.length !== 2) {
      return res.status(400).json({ error: '指定的人物不存在' });
    }
    
    // 檢查關係是否已存在
    const checkRelationQuery = 'SELECT id FROM relations WHERE (from_person_id = ? AND to_person_id = ?) OR (from_person_id = ? AND to_person_id = ?)';
    db.query(checkRelationQuery, [from, to, to, from], (err, results) => {
      if (err) {
        console.error('檢查關係錯誤:', err);
        return res.status(500).json({ error: '無法檢查關係是否存在' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ error: '這個關係已經存在' });
      }
      
      // 新增關係
      const insertQuery = 'INSERT INTO relations (from_person_id, to_person_id) VALUES (?, ?)';
      db.query(insertQuery, [from, to], (err, result) => {
        if (err) {
          console.error('新增關係錯誤:', err);
          return res.status(500).json({ error: '無法新增關係' });
        }
        
        res.json({
          success: true,
          id: result.insertId,
          message: '關係新增成功'
        });
      });
    });
  });
});

// DELETE /api/deleteEdge - 刪除關係
app.delete('/api/deleteEdge', requireApiKey, (req, res) => {
  const { from, to } = req.body;
  
  // 只支援透過人物 ID 組合刪除
  if (!from || !to) {
    return res.status(400).json({ 
      error: '請提供人物 ID 組合 (from 和 to)' 
    });
  }
  
  if (from === to) {
    return res.status(400).json({ error: '不能刪除自己與自己的關係' });
  }
  
  // 透過人物 ID 組合刪除（雙向查詢）
  const deleteQuery = 'DELETE FROM relations WHERE (from_person_id = ? AND to_person_id = ?) OR (from_person_id = ? AND to_person_id = ?)';
  const queryParams = [from, to, to, from];
  
  db.query(deleteQuery, queryParams, (err, result) => {
    if (err) {
      console.error('刪除關係錯誤:', err);
      return res.status(500).json({ error: '無法刪除關係' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        error: '找不到指定的關係',
        message: `人物 ${from} 和 ${to} 之間沒有關係`
      });
    }
    
    res.json({
      success: true,
      deletedRows: result.affectedRows,
      message: '關係刪除成功'
    });
  });
});

// 提供首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 圖片展示頁面 (適合 Telegram 分享)
app.get('/graph', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.send(`
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SITCON 人物關係圖</title>
    <meta property="og:title" content="SITCON 人物關係圖">
    <meta property="og:description" content="即時生成的人物關係圖表">
    <meta property="og:image" content="${baseUrl}/full.png">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${baseUrl}/graph">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="SITCON 人物關係圖">
    <meta name="twitter:description" content="即時生成的人物關係圖表">
    <meta name="twitter:image" content="${baseUrl}/full.png">
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .description {
            color: #666;
            margin-bottom: 20px;
        }
        .graph-image {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .refresh-btn {
            margin-top: 20px;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        .refresh-btn:hover {
            background: #0056b3;
        }
        .links {
            margin-top: 20px;
            font-size: 14px;
            color: #666;
        }
        .links a {
            color: #007bff;
            text-decoration: none;
            margin: 0 10px;
        }
        .links a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>SITCON 人物關係圖</h1>
        <p class="description">即時生成的人物關係網路圖表，展示各成員之間的連結關係</p>
        
        <img class="graph-image" 
             src="/full.png" 
             alt="SITCON 人物關係圖"
             onclick="refreshImage()">
        
        <button class="refresh-btn" onclick="refreshImage()">重新生成圖片</button>
        
        <div class="links">
            <a href="/full.png" target="_blank">下載圖片</a>
            <a href="/" target="_blank">互動式圖表</a>
        </div>
    </div>

    <script>
        function refreshImage() {
            const img = document.querySelector('.graph-image');
            const timestamp = new Date().getTime();
            img.src = '/full.png?' + timestamp;
        }
        
        // 每 30 秒自動刷新一次
        setInterval(refreshImage, 30000);
    </script>
</body>
</html>
  `);
});


    // 專為 Telegram Bot 優化的圖片端點
app.get('/telegram.png', async (req, res) => {
  try {
    console.log('為 Telegram 生成 PNG 圖片...');
    
    // 取得圖表資料
    const getPersonsQuery = 'SELECT id, name FROM persons';
    const getRelationsQuery = 'SELECT id, from_person_id, to_person_id FROM relations';
    
    const [persons, relations] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(getPersonsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getRelationsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);
    
    // 找出所有有連線的人物ID
    const connectedPersonIds = new Set();
    relations.forEach(relation => {
      connectedPersonIds.add(relation.from_person_id.toString());
      connectedPersonIds.add(relation.to_person_id.toString());
    });
    
    // 只保留有連線的人物節點
    const nodes = persons
      .filter(person => connectedPersonIds.has(person.id.toString()))
      .map(person => ({
        id: person.id.toString(),
        label: person.name
      }));
    
    const edges = relations.map(relation => ({
      id: relation.id.toString(),
      from: relation.from_person_id.toString(),
      to: relation.to_person_id.toString()
    }));
    
    // 生成 HTML (使用較小尺寸以符合 Telegram 限制)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #ffffff; }
        #cy { width: 800px; height: 800px; background: #ffffff; }
    </style>
</head>
<body>
    <div id="cy"></div>
    <script>
        const nodes = ${JSON.stringify(nodes)};
        const edges = ${JSON.stringify(edges)};
        
        const cy = cytoscape({
            container: document.getElementById('cy'),
            
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#77B55A',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': 'white',
                        'text-outline-width': 2,
                        'text-outline-color': '#2d4a1f',
                        'width': 40,
                        'height': 40,
                        'font-size': 10,
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 7,
                        'line-color': 'rgba(176, 211, 243, 0.6)',
                        'curve-style': 'straight'
                    }
                }
            ],
            
            elements: [
                ...nodes.map(node => ({ group: 'nodes', data: node })),
                ...edges.map(edge => ({
                    group: 'edges',
                    data: {
                        id: 'edge-' + edge.id,
                        source: edge.from,
                        target: edge.to
                    }
                }))
            ],
            
            layout: {
                name: 'cose',
                idealEdgeLength: 100,
                nodeOverlap: 40,
                refresh: 20,
                fit: true,
                padding: 30,
                randomize: false,
                componentSpacing: 150,
                nodeRepulsion: 800000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0
            }
        });
        
        // 標記渲染完成
        cy.ready(function() {
            setTimeout(() => {
                window.renderComplete = true;
            }, 2000);
        });
    </script>
</body>
</html>`;

    // 啟動無頭瀏覽器
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForTimeout(5000); // 簡單等待 5 秒
    
    // 截圖 (較小的檔案大小)
    const screenshot = await page.screenshot({
      type: 'png',
      quality: 80,
      clip: { x: 0, y: 0, width: 800, height: 800 }
    });
    
    await browser.close();
    
    console.log('Telegram PNG 圖片生成完成，大小:', screenshot.length, 'bytes');
    
    // 為 Telegram 優化的回應標頭
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': screenshot.length,
      'Content-Disposition': 'attachment; filename=sitcon-relationship.png'
    });
    
    res.end(screenshot);
    
  } catch (error) {
    console.error('生成 Telegram PNG 失敗:', error);
    res.status(500).json({ error: '無法生成圖片: ' + error.message });
  }
});

// 專為 Telegram Bot 優化的 JPG 端點 (支援線條粗細參數)
app.get('/telegram.jpg', async (req, res) => {
  try {
    console.log('為 Telegram 生成 JPG 圖片...');
    
    // 取得參數 (線條粗細)
    const lineWidth = parseInt(req.query.width) || 7;  // 預設粗細為 7
    
    console.log(`使用線條粗細: ${lineWidth}`);
    
    // 取得圖表資料
    const getPersonsQuery = 'SELECT id, name FROM persons';
    const getRelationsQuery = 'SELECT id, from_person_id, to_person_id FROM relations';
    
    const [persons, relations] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(getPersonsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getRelationsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);
    
    // 找出所有有連線的人物ID
    const connectedPersonIds = new Set();
    relations.forEach(relation => {
      connectedPersonIds.add(relation.from_person_id.toString());
      connectedPersonIds.add(relation.to_person_id.toString());
    });
    
    // 只保留有連線的人物節點
    const nodes = persons
      .filter(person => connectedPersonIds.has(person.id.toString()))
      .map(person => ({
        id: person.id.toString(),
        label: person.name
      }));
    
    const edges = relations.map(relation => ({
      id: relation.id.toString(),
      from: relation.from_person_id.toString(),
      to: relation.to_person_id.toString()
    }));
    
    // 生成 HTML (使用白色背景，適合 JPG)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #ffffff; }
        #cy { width: 800px; height: 800px; background: #ffffff; }
    </style>
</head>
<body>
    <div id="cy"></div>
    <script>
        const nodes = ${JSON.stringify(nodes)};
        const edges = ${JSON.stringify(edges)};
        
        const cy = cytoscape({
            container: document.getElementById('cy'),
            
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#77B55A',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': 'white',
                        'text-outline-width': 2,
                        'text-outline-color': '#2d4a1f',
                        'width': 40,
                        'height': 40,
                        'font-size': 10,
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': lineWidth,
                        'line-color': 'rgba(176, 211, 243, 0.6)',
                        'curve-style': 'straight'
                    }
                }
            ],
            
            elements: [
                ...nodes.map(node => ({ group: 'nodes', data: node })),
                ...edges.map(edge => ({
                    group: 'edges',
                    data: {
                        id: 'edge-' + edge.id,
                        source: edge.from,
                        target: edge.to
                    }
                }))
            ],
            
            layout: {
                name: 'cose',
                idealEdgeLength: 100,
                nodeOverlap: 40,
                refresh: 20,
                fit: true,
                padding: 30,
                randomize: false,
                componentSpacing: 150,
                nodeRepulsion: 800000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0
            }
        });
        
        // 標記渲染完成
        cy.ready(function() {
            setTimeout(() => {
                window.renderComplete = true;
            }, 2000);
        });
    </script>
</body>
</html>`;

    // 啟動無頭瀏覽器
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 800 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForTimeout(5000); // 簡單等待 5 秒
    
    // 截圖為 JPG (更小的檔案大小)
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: 800, height: 800 }
    });
    
    await browser.close();
    
    console.log('Telegram JPG 圖片生成完成，大小:', screenshot.length, 'bytes');
    
    // 為 Telegram 優化的回應標頭
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': screenshot.length,
      'Content-Disposition': 'attachment; filename=sitcon-relationship.jpg'
    });
    
    res.end(screenshot);
    
  } catch (error) {
    console.error('生成 Telegram JPG 失敗:', error);
    res.status(500).json({ error: '無法生成圖片: ' + error.message });
  }
});

// 可調整線條粗細的 JPG 端點
app.get('/custom.jpg', async (req, res) => {
  try {
    console.log('生成可自訂的 JPG 圖片...');
    
    // 取得參數 (預設值與 Telegram 圖片相同)
    const lineWidth = Math.max(1, Math.min(50, parseInt(req.query.width) || 7));  // 預設粗細為 7
    const nodeSize = parseInt(req.query.nodesize) || 40;  // 預設節點大小為 40
    
    console.log(`使用線條粗細: ${lineWidth}px, 節點大小: ${nodeSize}px`);
    
    // 取得圖表資料
    const getPersonsQuery = 'SELECT id, name FROM persons';
    const getRelationsQuery = 'SELECT id, from_person_id, to_person_id FROM relations';
    
    const [persons, relations] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(getPersonsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(getRelationsQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);
    
    // 找出所有有連線的人物ID
    const connectedPersonIds = new Set();
    relations.forEach(relation => {
      connectedPersonIds.add(relation.from_person_id.toString());
      connectedPersonIds.add(relation.to_person_id.toString());
    });
    
    // 只保留有連線的人物節點
    const nodes = persons
      .filter(person => connectedPersonIds.has(person.id.toString()))
      .map(person => ({
        id: person.id.toString(),
        label: person.name
      }));
    
    const edges = relations.map(relation => ({
      id: relation.id.toString(),
      from: relation.from_person_id.toString(),
      to: relation.to_person_id.toString()
    }));
    
    // 生成自訂的 HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #ffffff; }
        #cy { width: 2000px; height: 2000px; background: #ffffff; }
    </style>
</head>
<body>
    <div id="cy"></div>
    <script>
        const nodes = ${JSON.stringify(nodes)};
        const edges = ${JSON.stringify(edges)};
        
        const cy = cytoscape({
            container: document.getElementById('cy'),
            
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#77B55A',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': 'white',
                        'text-outline-width': 2,
                        'text-outline-color': '#2d4a1f',
                        'width': ${nodeSize},
                        'height': ${nodeSize},
                        'font-size': 10,
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': ${lineWidth},
                        'line-color': 'rgba(176, 211, 243, 0.6)',
                        'curve-style': 'straight'
                    }
                }
            ],
            
            elements: [
                ...nodes.map(node => ({ group: 'nodes', data: node })),
                ...edges.map(edge => ({
                    group: 'edges',
                    data: {
                        id: 'edge-' + edge.id,
                        source: edge.from,
                        target: edge.to
                    }
                }))
            ],
            
            layout: {
                name: 'cose',
                idealEdgeLength: 100,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                padding: 50,
                randomize: false,
                componentSpacing: 180,
                nodeRepulsion: 1200000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 60,
                numIter: 800,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0,
                avoidOverlap: true,
                avoidOverlapPadding: 25
            }
        });
        
        // 標記渲染完成
        cy.ready(function() {
            setTimeout(() => {
                window.renderComplete = true;
            }, 2000);
        });
    </script>
</body>
</html>`;

    // 啟動無頭瀏覽器
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 2000, height: 2000 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForTimeout(5000); // 簡單等待 5 秒
    
    // 截圖為 JPG
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: 2000, height: 2000 }
    });
    
    await browser.close();
    
    console.log(`自訂 JPG 圖片生成完成，大小: ${screenshot.length} bytes`);
    
    // 回應標頭
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': screenshot.length,
      'Content-Disposition': 'attachment; filename=sitcon-relationship-custom.jpg'
    });
    
    res.end(screenshot);
    
  } catch (error) {
    console.error('生成自訂 JPG 失敗:', error);
    res.status(500).json({ error: '無法生成圖片: ' + error.message });
  }
});


// 404 錯誤處理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '找不到請求的資源',
    message: `路徑 ${req.originalUrl} 不存在`,
    timestamp: new Date().toISOString()
  });
});

// 全域錯誤處理中介軟體
app.use((err, req, res, next) => {
  console.error('全域錯誤處理:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // 根據錯誤類型回應不同的狀態碼
  let statusCode = 500;
  let message = '伺服器內部錯誤';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = '輸入驗證失敗';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = '未經授權的存取';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = '資料庫連線失敗';
  }

  res.status(statusCode).json({
    error: message,
    message: process.env.NODE_ENV === 'development' ? err.message : '請稍後再試',
    timestamp: new Date().toISOString()
  });
});

// 啟動伺服器
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`🚀 伺服器運行在 http://localhost:${PORT}`);
  console.log(`📊 API 文件：http://localhost:${PORT}/api/graph`);
  console.log(`🔐 已啟用 API 金鑰驗證`);
  console.log(`⚡ 已啟用速率限制保護`);
  console.log(`🛡️ 已啟用 SQL injection 防護`);
});

// 優雅地關閉資料庫連線
process.on('SIGINT', () => {
  console.log('\n正在關閉伺服器...');
  db.end(() => {
    console.log('資料庫連線已關閉');
    process.exit(0);
  });
});
