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
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
  console.error('Promise:', promise);
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
      message: '請求內容超過 10MB 限制'
    });
  }
  next(err);
});

// 請求日誌
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// 靜態檔案服務
app.use(express.static(path.join(__dirname, 'public')));

// 資料庫連線池
const db = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4',
  connectionLimit: 10,
  acquireTimeout: 0,
  timeout: 0,
  reconnect: true
});

// 測試資料庫連線
async function testDatabaseConnection() {
  return new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) {
        console.error('資料庫連線失敗:', err.message);
        reject(err);
        return;
      }
      
      console.log('資料庫連線成功！連線 ID:', connection.threadId);
      connection.query('SELECT 1 as test', (err, results) => {
        connection.release();
        
        if (err) {
          console.error('資料庫查詢測試失敗:', err.message);
          reject(err);
          return;
        }
        
        console.log('資料庫查詢測試成功:', results);
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

// 輸入驗證中介軟體
function validateInput(schema) {
  return (req, res, next) => {
    const errors = [];
    
    // 檢查必填欄位
    if (schema.required) {
      for (const field of schema.required) {
        if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
          errors.push(`缺少必填欄位: ${field}`);
        }
      }
    }
    
    // 檢查資料類型
    if (schema.types) {
      for (const [field, expectedType] of Object.entries(schema.types)) {
        if (req.body[field] !== undefined) {
          const actualType = typeof req.body[field];
          if (actualType !== expectedType) {
            errors.push(`欄位 ${field} 類型錯誤: 期望 ${expectedType}，實際 ${actualType}`);
          }
        }
      }
    }
    
    // 檢查字串長度
    if (schema.maxLength) {
      for (const [field, maxLen] of Object.entries(schema.maxLength)) {
        if (req.body[field] && typeof req.body[field] === 'string' && req.body[field].length > maxLen) {
          errors.push(`欄位 ${field} 長度超過限制: 最大 ${maxLen} 字元`);
        }
      }
    }
    
    // 檢查數字範圍
    if (schema.numberRange) {
      for (const [field, range] of Object.entries(schema.numberRange)) {
        if (req.body[field] !== undefined) {
          const num = parseFloat(req.body[field]);
          if (isNaN(num)) {
            errors.push(`欄位 ${field} 必須是有效的數字`);
          } else if ((range.min !== undefined && num < range.min) || (range.max !== undefined && num > range.max)) {
            errors.push(`欄位 ${field} 超出範圍: ${range.min || '-∞'} 到 ${range.max || '+∞'}`);
          }
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: '輸入驗證失敗',
        details: errors,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

// API Key 驗證中介軟體
function requireApiKey(req, res, next) {
  // 檢查配置中是否有 API Key
  if (!config.api || !config.api.key) {
    console.error('伺服器配置錯誤: 缺少 API Key 設定');
    return res.status(500).json({
      error: '伺服器配置錯誤',
      message: '請聯繫管理員檢查伺服器設定',
      timestamp: new Date().toISOString()
    });
  }
  
  const providedKey = req.headers['x-api-key'] || req.query.key;
  
  if (!providedKey) {
    return res.status(401).json({
      error: '缺少 API Key',
      message: '請在 x-api-key 標頭或 key 查詢參數中提供 API Key',
      timestamp: new Date().toISOString()
    });
  }
  
  if (providedKey !== config.api.key) {
    console.warn('API Key 驗證失敗:', {
      providedKey: providedKey.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });
    
    return res.status(403).json({
      error: 'API Key 無效',
      message: '提供的 API Key 不正確',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
}

// 速率限制中介軟體
function rateLimit(windowMs, maxRequests) {
  const requests = new Map();
  
  return (req, res, next) => {
    const clientId = req.ip;
    const now = Date.now();
    
    if (!requests.has(clientId)) {
      requests.set(clientId, []);
    }
    
    const clientRequests = requests.get(clientId);
    
    // 清理過期的請求記錄
    const validRequests = clientRequests.filter(timestamp => now - timestamp < windowMs);
    requests.set(clientId, validRequests);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        error: '請求過於頻繁',
        message: `請在 ${Math.ceil(windowMs / 1000)} 秒內最多發送 ${maxRequests} 個請求`,
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }
    
    validRequests.push(now);
    next();
  };
}

// 輸入清理函數
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // 移除 HTML 標籤和腳本
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// ID 驗證函數
function validateId(id) {
  const numId = parseInt(id);
  if (isNaN(numId) || numId <= 0 || numId > 2147483647) {
    throw new Error(`無效的 ID: ${id}`);
  }
  return numId;
}

// API 端點

// GET /api/graph - 取得完整圖表資料
app.get('/api/graph', async (req, res) => {
  try {
    console.log('取得圖表資料請求');
    
    const [persons, relations] = await Promise.all([
      queryDatabase('SELECT id, name, description, created_at FROM persons ORDER BY id'),
      queryDatabase('SELECT id, from_person_id, to_person_id, created_at FROM relations ORDER BY id')
    ]);
    
    // 資料驗證
    if (!Array.isArray(persons) || !Array.isArray(relations)) {
      throw new Error('資料庫回傳格式錯誤');
    }
    
    // 找出所有有連線的人物ID
    const connectedPersonIds = new Set();
    const validRelations = relations.filter(relation => {
      if (relation.from_person_id && relation.to_person_id) {
        connectedPersonIds.add(relation.from_person_id.toString());
        connectedPersonIds.add(relation.to_person_id.toString());
        return true;
      }
      return false;
    });
    
    // 只保留有連線的人物
    const connectedPersons = persons.filter(person => 
      person.id && person.name && connectedPersonIds.has(person.id.toString())
    );
    
    const nodes = connectedPersons.map(person => ({
      id: person.id.toString(),
      label: person.name.toString()
    }));
    
    const edges = validRelations.map(relation => ({
      id: relation.id.toString(),
      from: relation.from_person_id.toString(),
      to: relation.to_person_id.toString()
    }));
    
    console.log(`回傳圖表資料: ${nodes.length} 個節點, ${edges.length} 個邊`);
    
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

// GET /api/persons - 取得所有人物
app.get('/api/persons', async (req, res) => {
  try {
    console.log('取得人物列表請求');
    
    const persons = await queryDatabase('SELECT id, name, description, created_at FROM persons ORDER BY name');
    
    if (!Array.isArray(persons)) {
      throw new Error('資料庫回傳格式錯誤');
    }
    
    const validPersons = persons.filter(person => person.id && person.name);
    
    console.log(`回傳人物列表: ${validPersons.length} 個人物`);
    
    res.json({
      success: true,
      persons: validPersons,
      count: validPersons.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('取得人物列表錯誤:', error);
    res.status(500).json({
      error: '無法取得人物列表',
      message: '伺服器內部錯誤，請稍後再試',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/addNode - 新增人物
app.post('/api/addNode', 
  rateLimit(60000, 30), // 每分鐘最多 30 次新增
  requireApiKey,
  validateInput({
    required: ['name'],
    types: { name: 'string', description: 'string' },
    maxLength: { name: 100, description: 500 }
  }),
  async (req, res) => {
    try {
      const { name, description = '' } = req.body;
      
      const cleanName = sanitizeInput(name);
      const cleanDescription = sanitizeInput(description);
      
      // 檢查是否已存在相同名稱
      const existingPersons = await queryDatabase('SELECT id FROM persons WHERE name = ?', [cleanName]);
      
      if (existingPersons.length > 0) {
        return res.status(409).json({
          error: '人物已存在',
          message: `名稱「${cleanName}」已被使用`,
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await queryDatabase('INSERT INTO persons (name, description) VALUES (?, ?)', [cleanName, cleanDescription]);
      
      console.log('新增人物成功:', { id: result.insertId, name: cleanName });
      
      res.json({
        success: true,
        id: result.insertId,
        name: cleanName,
        description: cleanDescription,
        message: '人物新增成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('新增人物錯誤:', error);
      res.status(500).json({
        error: '無法新增人物',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// POST /api/addEdge - 新增關係
app.post('/api/addEdge', 
  rateLimit(60000, 50), // 每分鐘最多 50 次新增
  requireApiKey,
  validateInput({
    required: ['from', 'to'],
    types: { from: 'string', to: 'string' },
    numberRange: { from: { min: 1, max: 2147483647 }, to: { min: 1, max: 2147483647 } }
  }),
  async (req, res) => {
    try {
      const { from, to } = req.body;
      
      const fromId = validateId(from);
      const toId = validateId(to);
      
      if (fromId === toId) {
        return res.status(400).json({
          error: '無效的關係',
          message: '不能建立自己與自己的關係',
          timestamp: new Date().toISOString()
        });
      }
      
      // 檢查人物是否存在
      const [fromExists, toExists] = await Promise.all([
        queryDatabase('SELECT id FROM persons WHERE id = ?', [fromId]),
        queryDatabase('SELECT id FROM persons WHERE id = ?', [toId])
      ]);
      
      if (fromExists.length === 0) {
        return res.status(404).json({
          error: '人物不存在',
          message: `找不到 ID 為 ${fromId} 的人物`,
          timestamp: new Date().toISOString()
        });
      }
      
      if (toExists.length === 0) {
        return res.status(404).json({
          error: '人物不存在',
          message: `找不到 ID 為 ${toId} 的人物`,
          timestamp: new Date().toISOString()
        });
      }
      
      // 檢查關係是否已存在（雙向檢查）
      const existingRelations = await queryDatabase(
        'SELECT id FROM relations WHERE (from_person_id = ? AND to_person_id = ?) OR (from_person_id = ? AND to_person_id = ?)',
        [fromId, toId, toId, fromId]
      );
      
      if (existingRelations.length > 0) {
        return res.status(409).json({
          error: '關係已存在',
          message: `人物 ${fromId} 和 ${toId} 之間已有關係`,
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await queryDatabase('INSERT INTO relations (from_person_id, to_person_id) VALUES (?, ?)', [fromId, toId]);
      
      console.log('新增關係成功:', { id: result.insertId, from: fromId, to: toId });
      
      res.json({
        success: true,
        id: result.insertId,
        from: fromId,
        to: toId,
        message: '關係新增成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('新增關係錯誤:', error);
      res.status(500).json({
        error: '無法新增關係',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// DELETE /api/deleteEdge - 刪除關係
app.delete('/api/deleteEdge', 
  rateLimit(60000, 20), // 每分鐘最多 20 次刪除
  requireApiKey,
  validateInput({
    required: ['from', 'to'],
    types: { from: 'string', to: 'string' },
    numberRange: { from: { min: 1, max: 2147483647 }, to: { min: 1, max: 2147483647 } }
  }),
  async (req, res) => {
    try {
      const { from, to } = req.body;
      
      const fromId = validateId(from);
      const toId = validateId(to);
      
      if (fromId === toId) {
        return res.status(400).json({ 
          error: '無效的操作',
          message: '不能刪除自己與自己的關係',
          timestamp: new Date().toISOString()
        });
      }
      
      // 透過人物 ID 組合刪除（雙向查詢）
      const deleteQuery = 'DELETE FROM relations WHERE (from_person_id = ? AND to_person_id = ?) OR (from_person_id = ? AND to_person_id = ?)';
      const result = await queryDatabase(deleteQuery, [fromId, toId, toId, fromId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          error: '找不到指定的關係',
          message: `人物 ${fromId} 和 ${toId} 之間沒有關係`,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        deletedRows: result.affectedRows,
        message: '關係刪除成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('刪除關係錯誤:', error);
      res.status(500).json({ 
        error: '無法刪除關係',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// 可調整線條粗細的 PNG 端點
app.get('/custom.png', async (req, res) => {
  // 移除超時限制
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    console.log('生成可自訂的 PNG 圖片...');
    
    // 取得參數 (無限制)
    const lineWidth = parseInt(req.query.width) || 7;  // 預設粗細為 7
    const nodeSize = parseInt(req.query.nodesize) || 40;  // 預設節點大小為 40
    
    console.log(`使用線條粗細: ${lineWidth}px, 節點大小: ${nodeSize}px`);
    
    // 取得圖表資料
    const [persons, relations] = await Promise.all([
      queryDatabase('SELECT id, name FROM persons ORDER BY name'),
      queryDatabase('SELECT id, from_person_id, to_person_id FROM relations ORDER BY id')
    ]);
    
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
    
    console.log(`節點數量: ${nodes.length}, 邊數量: ${edges.length}`);
    
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
                        'curve-style': 'straight',
                        'opacity': 0.6
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
            // 等待佈局完成
            cy.on('layoutstop', function() {
                window.renderComplete = true;
            });
            
            // 如果沒有佈局事件，在 ready 後直接標記完成
            setTimeout(() => {
                if (!window.renderComplete) {
                    window.renderComplete = true;
                }
            }, 100);
        });
    </script>
</body>
</html>`;
    
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setContent(htmlContent);
    await page.setViewport({ width: 2000, height: 2000 });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 0 });
    
    const screenshot = await page.screenshot({ 
      type: 'png',
      fullPage: true 
    });
    
    await browser.close();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="relationship-custom.png"');
    res.setHeader('Cache-Control', 'no-cache');
    
    res.end(screenshot, 'binary');
    
  } catch (error) {
    console.error('生成自訂 PNG 失敗:', error);
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
  
  // 防止標頭重複設定
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    error: '伺服器內部錯誤',
    message: '發生未預期的錯誤，請稍後再試',
    timestamp: new Date().toISOString()
  });
});

// 啟動伺服器
async function startServer() {
  try {
    // 測試資料庫連線
    await testDatabaseConnection();
    
    const port = config.server.port || 3000;
    app.listen(port, () => {
      console.log(`
===========================================
🚀 SITCON 關係圖伺服器啟動成功！
===========================================
📍 伺服器地址: http://localhost:${port}
📊 網頁介面: http://localhost:${port}/
🔧 API 文檔: http://localhost:${port}/api/graph
🎨 自訂圖片: http://localhost:${port}/custom.jpg

🔐 安全功能已啟用:
   ✅ API Key 驗證 (POST 請求)
   ✅ 速率限制保護
   ✅ SQL Injection 防護
   ✅ 輸入驗證與清理
   ✅ 全域錯誤處理

📅 啟動時間: ${new Date().toLocaleString('zh-TW')}
===========================================
      `);
    });
  } catch (error) {
    console.error('伺服器啟動失敗:', error);
    process.exit(1);
  }
}

startServer();
