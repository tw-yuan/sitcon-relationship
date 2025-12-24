const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const puppeteer = require('puppeteer');
const crypto = require('crypto');

const app = express();

// Session 儲存（簡單的記憶體實作）
const sessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 小時

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

// ==================== Admin Session Management ====================

// 產生隨機 Session Token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 清理過期的 Sessions
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TIMEOUT) {
      sessions.delete(token);
    }
  }
}

// 每小時清理一次過期 Session
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// 驗證 Session 中介軟體
function requireAdminSession(req, res, next) {
  const token = req.headers['x-session-token'];
  
  if (!token) {
    return res.status(401).json({
      error: '未登入',
      message: '請先登入管理後台',
      timestamp: new Date().toISOString()
    });
  }
  
  const session = sessions.get(token);
  
  if (!session) {
    return res.status(401).json({
      error: 'Session 無效',
      message: '請重新登入',
      timestamp: new Date().toISOString()
    });
  }
  
  // 檢查是否過期
  if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
    sessions.delete(token);
    return res.status(401).json({
      error: 'Session 已過期',
      message: '請重新登入',
      timestamp: new Date().toISOString()
    });
  }
  
  req.adminUser = session.username;
  next();
}

// POST /api/admin/login - 管理員登入
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 驗證輸入
    if (!username || !password) {
      return res.status(400).json({
        error: '缺少參數',
        message: '請提供帳號和密碼',
        timestamp: new Date().toISOString()
      });
    }
    
    // 驗證帳號密碼
    if (username !== config.admin.username || password !== config.admin.password) {
      // 為了安全，等待一段隨機時間（防止時間攻擊）
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
      
      console.log(`登入失敗: ${username} from ${req.ip}`);
      
      return res.status(401).json({
        error: '帳號或密碼錯誤',
        message: '請檢查您的帳號和密碼',
        timestamp: new Date().toISOString()
      });
    }
    
    // 產生 Session Token
    const sessionToken = generateSessionToken();
    
    // 儲存 Session
    sessions.set(sessionToken, {
      username: username,
      createdAt: Date.now()
    });
    
    console.log(`管理員登入成功: ${username} from ${req.ip}`);
    
    res.json({
      success: true,
      token: sessionToken,
      expiresIn: SESSION_TIMEOUT / 1000, // 秒數
      message: '登入成功',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('登入錯誤:', error);
    res.status(500).json({
      error: '登入失敗',
      message: '伺服器內部錯誤',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/admin/logout - 管理員登出
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  
  if (token) {
    sessions.delete(token);
  }
  
  res.json({
    success: true,
    message: '登出成功',
    timestamp: new Date().toISOString()
  });
});

// GET /api/admin/verify - 驗證 Session 是否有效
app.get('/api/admin/verify', requireAdminSession, (req, res) => {
  res.json({
    success: true,
    username: req.adminUser,
    message: 'Session 有效',
    timestamp: new Date().toISOString()
  });
});

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
      queryDatabase('SELECT id, name, description, gender, created_at FROM persons ORDER BY id'),
      queryDatabase('SELECT id, from_person_id, to_person_id, source, created_at FROM relations ORDER BY id')
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
      to: relation.to_person_id.toString(),
      source: relation.source || ''
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
    
    const persons = await queryDatabase('SELECT id, name, description, gender, created_at FROM persons ORDER BY name');
    
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

// GET /api/person/:id/relations - 查詢某個人物的關係狀態
app.get('/api/person/:id/relations', async (req, res) => {
  try {
    const personId = validateId(req.params.id);
    console.log(`查詢人物關係狀態: personId=${personId}`);

    // 確認人物存在
    const personRows = await queryDatabase(
      'SELECT id, name, description, gender FROM persons WHERE id = ?',
      [personId]
    );

    if (personRows.length === 0) {
      return res.status(404).json({
        error: '人物不存在',
        message: `找不到 ID 為 ${personId} 的人物`,
        timestamp: new Date().toISOString()
      });
    }

    const person = personRows[0];

    // 取得所有與該人物相關的關係（雙向）
    const relations = await queryDatabase(
      'SELECT id, from_person_id, to_person_id, source FROM relations WHERE from_person_id = ? OR to_person_id = ? ORDER BY id',
      [personId, personId]
    );

    // 收集鄰接人物 ID
    const neighborIdSet = new Set();
    for (const rel of relations) {
      if (rel.from_person_id === personId) neighborIdSet.add(rel.to_person_id);
      if (rel.to_person_id === personId) neighborIdSet.add(rel.from_person_id);
    }

    const neighborIds = Array.from(neighborIdSet);
    let neighbors = [];
    if (neighborIds.length > 0) {
      const placeholders = neighborIds.map(() => '?').join(',');
      const neighborRows = await queryDatabase(
        `SELECT id, name, gender FROM persons WHERE id IN (${placeholders}) ORDER BY id`,
        neighborIds
      );
      neighbors = neighborRows.map(row => ({ id: row.id, name: row.name, gender: row.gender }));
    }

    const edges = relations.map(r => ({
      id: r.id,
      from: r.from_person_id,
      to: r.to_person_id,
      source: r.source || ''
    }));

    res.json({
      success: true,
      person: {
        id: person.id,
        name: person.name,
        description: person.description || '',
        gender: person.gender
      },
      degree: edges.length,
      neighbors,
      edges,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('查詢人物關係狀態錯誤:', error);
    res.status(500).json({
      error: '無法查詢人物關係狀態',
      message: '伺服器內部錯誤，請稍後再試',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/background?id=:id - 取得人物背景資訊（使用 Query Parameters）
app.get('/api/background', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (id === undefined || id === null || id === '') {
      return res.status(400).json({
        error: '缺少必要參數',
        message: '請提供 id 參數',
        timestamp: new Date().toISOString()
      });
    }
    
    const personId = validateId(id);
    
    // 檢查人物是否存在
    const personResult = await queryDatabase(
      'SELECT id, name, description, gender FROM persons WHERE id = ?',
      [personId]
    );
    
    if (personResult.length === 0) {
      return res.status(404).json({
        error: '人物不存在',
        message: `找不到 ID 為 ${personId} 的人物`,
        timestamp: new Date().toISOString()
      });
    }
    
    // 查詢背景資訊
    const backgroundResult = await queryDatabase(
      'SELECT person_id, birth_year, body, created_at, updated_at FROM person_backgrounds WHERE person_id = ?',
      [personId]
    );
    
    const person = personResult[0];
    const background = backgroundResult.length > 0 ? backgroundResult[0] : null;
    
    res.json({
      success: true,
      person: {
        id: person.id,
        name: person.name,
        description: person.description,
        gender: person.gender
      },
      background: background ? {
        birth_year: background.birth_year || null,
        body: background.body || '',
        created_at: background.created_at,
        updated_at: background.updated_at
      } : null,
      message: background ? '成功取得人物背景' : '此人物尚無背景資訊',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('取得人物背景錯誤:', error);
    res.status(500).json({
      error: '無法取得人物背景',
      message: '伺服器內部錯誤，請稍後再試',
      timestamp: new Date().toISOString()
    });
  }
});

// 驗證中間件：支援 Session 或 API Key
function requireSessionOrApiKey(req, res, next) {
  const sessionToken = req.headers['x-session-token'];
  const apiKey = req.headers['x-api-key'];
  
  // 優先檢查 Session Token
  if (sessionToken) {
    const session = sessions.get(sessionToken);
    if (session && (Date.now() - session.createdAt <= SESSION_TIMEOUT)) {
      req.adminUser = session.username;
      return next();
    }
  }
  
  // 檢查 API Key
  if (apiKey) {
    if (apiKey === config.api.key) {
      return next();
    }
  }
  
  // 都沒有或都無效
  return res.status(401).json({
    error: '未授權',
    message: '請提供有效的 Session Token 或 API Key',
    timestamp: new Date().toISOString()
  });
}

// POST /api/background - 新增或更新人物背景資訊（使用 Query Parameters）
app.post('/api/background',
  requireSessionOrApiKey, // 支援 Session Token 或 API Key
  rateLimit(60000, 30), // 每分鐘最多 30 次
  validateInput({
    required: ['id'],
    types: { 
      id: 'string',
      // birth_year 可以是 string 或 number，後面會轉換
      body: 'string'
    },
    numberRange: {
      id: { min: 1, max: 2147483647 },
      birth_year: { min: 1900, max: 2100 } // numberRange 會自動用 parseFloat 檢查
    }
  }),
  async (req, res) => {
    try {
      const personId = validateId(req.body.id);
      
      // 處理 birth_year：可以接受字串或數字，統一轉換成數字或 null
      let birth_year = null;
      if (req.body.birth_year !== undefined && req.body.birth_year !== null && req.body.birth_year !== '') {
        const parsedYear = parseInt(req.body.birth_year, 10);
        if (isNaN(parsedYear)) {
          return res.status(400).json({
            error: '輸入驗證失敗',
            details: ['birth_year 必須是有效的數字'],
            timestamp: new Date().toISOString()
          });
        }
        birth_year = parsedYear;
      }
      
      const { body = '' } = req.body;
      
      // 清理輸入
      const cleanBody = sanitizeInput(body);
      
      // 檢查人物是否存在
      const personExists = await queryDatabase(
        'SELECT id FROM persons WHERE id = ?',
        [personId]
      );
      
      if (personExists.length === 0) {
        return res.status(404).json({
          error: '人物不存在',
          message: `找不到 ID 為 ${personId} 的人物`,
          timestamp: new Date().toISOString()
        });
      }
      
      // 檢查背景資訊是否已存在
      const existingBackground = await queryDatabase(
        'SELECT person_id FROM person_backgrounds WHERE person_id = ?',
        [personId]
      );
      
      let result;
      let isUpdate = false;
      
      if (existingBackground.length > 0) {
        // 更新現有背景
        result = await queryDatabase(
          'UPDATE person_backgrounds SET birth_year = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE person_id = ?',
          [birth_year, cleanBody, personId]
        );
        isUpdate = true;
      } else {
        // 新增背景
        result = await queryDatabase(
          'INSERT INTO person_backgrounds (person_id, birth_year, body) VALUES (?, ?, ?)',
          [personId, birth_year, cleanBody]
        );
      }
      
      console.log(`${isUpdate ? '更新' : '新增'}人物背景成功:`, { personId, birth_year, bodyLength: cleanBody.length });
      
      res.json({
        success: true,
        personId: personId,
        action: isUpdate ? 'updated' : 'created',
        message: `人物背景${isUpdate ? '更新' : '新增'}成功`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('新增/更新人物背景錯誤:', error);
      res.status(500).json({
        error: '無法處理人物背景',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// GET /api/relations?id=:id - 以查詢參數查詢人物的關係狀態
app.get('/api/relations', async (req, res) => {
  try {
    const { id } = req.query;
    if (id === undefined || id === null || id === '') {
      return res.status(400).json({
        error: '缺少必要參數',
        message: '請提供 id 查詢參數，例如 /api/relations?id=1',
        timestamp: new Date().toISOString()
      });
    }

    const personId = validateId(id);
    console.log(`查詢人物關係狀態(參數版): personId=${personId}`);

    // 確認人物存在
    const personRows = await queryDatabase(
      'SELECT id, name, description, gender FROM persons WHERE id = ?',
      [personId]
    );

    if (personRows.length === 0) {
      return res.status(404).json({
        error: '人物不存在',
        message: `找不到 ID 為 ${personId} 的人物`,
        timestamp: new Date().toISOString()
      });
    }

    const person = personRows[0];

    // 取得所有與該人物相關的關係（雙向）
    const relations = await queryDatabase(
      'SELECT id, from_person_id, to_person_id, source FROM relations WHERE from_person_id = ? OR to_person_id = ? ORDER BY id',
      [personId, personId]
    );

    // 收集鄰接人物 ID
    const neighborIdSet = new Set();
    for (const rel of relations) {
      if (rel.from_person_id === personId) neighborIdSet.add(rel.to_person_id);
      if (rel.to_person_id === personId) neighborIdSet.add(rel.from_person_id);
    }

    const neighborIds = Array.from(neighborIdSet);
    let neighbors = [];
    if (neighborIds.length > 0) {
      const placeholders = neighborIds.map(() => '?').join(',');
      const neighborRows = await queryDatabase(
        `SELECT id, name, gender FROM persons WHERE id IN (${placeholders}) ORDER BY id`,
        neighborIds
      );
      neighbors = neighborRows.map(row => ({ id: row.id, name: row.name, gender: row.gender }));
    }

    const edges = relations.map(r => ({
      id: r.id,
      from: r.from_person_id,
      to: r.to_person_id,
      source: r.source || ''
    }));

    res.json({
      success: true,
      person: {
        id: person.id,
        name: person.name,
        description: person.description || '',
        gender: person.gender
      },
      degree: edges.length,
      neighbors,
      edges,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('查詢人物關係狀態(參數版)錯誤:', error);
    res.status(500).json({
      error: '無法查詢人物關係狀態',
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
    types: { name: 'string', description: 'string', gender: 'string' },
    maxLength: { name: 100, description: 500 }
  }),
  async (req, res) => {
    try {
      const { name, description = '', gender = 'unknown' } = req.body;
      
      const cleanName = sanitizeInput(name);
      const cleanDescription = sanitizeInput(description);
      
      // 驗證性別參數
      const validGenders = ['male', 'female', 'femboy', 'unknown'];
      const cleanGender = validGenders.includes(gender) ? gender : 'unknown';
      
      if (!validGenders.includes(gender)) {
        console.log(`性別參數無效: ${gender}，使用預設值 'unknown'`);
      }
      
      // 檢查是否已存在相同名稱
      const existingPersons = await queryDatabase('SELECT id FROM persons WHERE name = ?', [cleanName]);
      
      if (existingPersons.length > 0) {
        return res.status(409).json({
          error: '人物已存在',
          message: `名稱「${cleanName}」已被使用`,
          timestamp: new Date().toISOString()
        });
      }
      
      const result = await queryDatabase('INSERT INTO persons (name, description, gender) VALUES (?, ?, ?)', [cleanName, cleanDescription, cleanGender]);
      
      console.log('新增人物成功:', { id: result.insertId, name: cleanName, gender: cleanGender });
      
      res.json({
        success: true,
        id: result.insertId,
        name: cleanName,
        description: cleanDescription,
        gender: cleanGender,
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

// POST /api/addEdge - 新增或更新關係 (Upsert)
app.post('/api/addEdge', 
  rateLimit(60000, 50), // 每分鐘最多 50 次操作
  requireApiKey,
  validateInput({
    required: ['from', 'to'],
    types: { from: 'string', to: 'string', source: 'string' },
    numberRange: { from: { min: 1, max: 2147483647 }, to: { min: 1, max: 2147483647 } },
    maxLength: { source: 500 }
  }),
  async (req, res) => {
    try {
      const { from, to, source = '' } = req.body;
      
      const fromId = validateId(from);
      const toId = validateId(to);
      const cleanSource = sanitizeInput(source);
      
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
      
      let result;
      let action;
      let relationId;
      
      if (existingRelations.length > 0) {
        // 關係已存在 → 更新 (直接覆蓋)
        const existingRelation = existingRelations[0];
        relationId = existingRelation.id;
        
        result = await queryDatabase(
          'UPDATE relations SET source = ? WHERE id = ?',
          [cleanSource, relationId]
        );
        
        action = 'updated';
        console.log('更新關係成功:', { id: relationId, from: fromId, to: toId, source: cleanSource });
        
      } else {
        // 關係不存在 → 新增
        result = await queryDatabase(
          'INSERT INTO relations (from_person_id, to_person_id, source) VALUES (?, ?, ?)', 
          [fromId, toId, cleanSource]
        );
        
        relationId = result.insertId;
        action = 'created';
        console.log('新增關係成功:', { id: relationId, from: fromId, to: toId, source: cleanSource });
      }
      
      res.json({
        success: true,
        id: relationId,
        from: fromId,
        to: toId,
        source: cleanSource,
        action: action,
        message: action === 'created' ? '關係新增成功' : '關係更新成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('新增/更新關係錯誤:', error);
      res.status(500).json({
        error: '無法處理關係',
        message: '伺服器內部錯誤，請稍後再試',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// PUT /api/updateEdge - 更新關係（只更新 source）- 管理後台專用
app.put('/api/updateEdge',
  requireAdminSession, // 使用 Session 驗證，不是 API Key
  rateLimit(60000, 50), // 每分鐘最多 50 次更新
  validateInput({
    required: ['from', 'to'],
    types: { from: 'string', to: 'string', source: 'string' },
    numberRange: { from: { min: 1, max: 2147483647 }, to: { min: 1, max: 2147483647 } },
    maxLength: { source: 500 }
  }),
  async (req, res) => {
    try {
      const { from, to, source = '' } = req.body;
      
      const fromId = validateId(from);
      const toId = validateId(to);
      const cleanSource = sanitizeInput(source);
      
      if (fromId === toId) {
        return res.status(400).json({
          error: '無效的操作',
          message: '不能更新自己與自己的關係',
          timestamp: new Date().toISOString()
        });
      }
      
      // 更新關係的 source（雙向查詢）
      const updateQuery = 'UPDATE relations SET source = ? WHERE (from_person_id = ? AND to_person_id = ?) OR (from_person_id = ? AND to_person_id = ?)';
      const result = await queryDatabase(updateQuery, [cleanSource, fromId, toId, toId, fromId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: '找不到指定的關係',
          message: `人物 ${fromId} 和 ${toId} 之間沒有關係`,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('更新關係成功:', { from: fromId, to: toId, source: cleanSource });
      
      res.json({
        success: true,
        updatedRows: result.affectedRows,
        from: fromId,
        to: toId,
        source: cleanSource,
        message: '關係更新成功',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('更新關係錯誤:', error);
      res.status(500).json({
        error: '無法更新關係',
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

// 使用 ECharts 生成 PNG 圖片端點
app.get('/custom.png', async (req, res) => {
  // 移除超時限制
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    console.log('使用 ECharts 生成 PNG 圖片...');

    // 取得參數 (無限制)
    const lineWidth = parseInt(req.query.width) || 2;  // 預設粗細為 2
    const nodeSize = parseInt(req.query.nodesize) || 40;  // 預設節點大小為 40
    const fontSize = parseInt(req.query.fontsize) || Math.max(14, Math.floor(nodeSize / 2.5));
    const opacity = parseFloat(req.query.opacity) || 0.8;  // 預設透明度為 0.8

    console.log(`使用線條粗細: ${lineWidth}px, 節點大小: ${nodeSize}px, 透明度: ${opacity}`);

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

    // 只保留有連線的人物節點 - ECharts 格式
    const nodes = persons
      .filter(person => person.id && person.name && connectedPersonIds.has(person.id.toString()))
      .map(person => ({
        id: person.id.toString(),
        name: person.name.toString(),
        symbolSize: nodeSize,
        itemStyle: {
          color: '#77B55A',
          borderColor: '#77B55A',
          borderWidth: 2
        },
        label: {
          show: true,
          color: '#fff',
          fontSize: fontSize,
          fontWeight: 'bold',
          textBorderColor: '#2d4a1f',
          textBorderWidth: 2
        }
      }));

    const links = relations
      .filter(relation => relation.id && relation.from_person_id && relation.to_person_id)
      .map(relation => ({
        source: relation.from_person_id.toString(),
        target: relation.to_person_id.toString(),
        lineStyle: {
          width: lineWidth,
          color: `rgba(128, 128, 128, ${opacity})`,  // 灰色
          curveness: 0  // 直線
        }
      }));

    console.log(`節點數量: ${nodes.length}, 邊數量: ${links.length}`);

    // 生成 ECharts HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #ffffff; }
        #chart { width: 2000px; height: 2000px; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>
        const chart = echarts.init(document.getElementById('chart'), null, {
            devicePixelRatio: 2  // 設定高解析度,提升圖片清晰度
        });

        const option = {
            backgroundColor: '#ffffff',
            animation: false,
            series: [{
                type: 'graph',
                layout: 'force',
                data: ${JSON.stringify(nodes)},
                links: ${JSON.stringify(links)},
                roam: false,
                draggable: false,
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                force: {
                    repulsion: 1800,
                    gravity: 0.2,
                    edgeLength: 150,
                    layoutAnimation: false,
                    friction: 0.6,
                    initLayout: 'circular'
                },
                layoutIterations: 500,  // 迭代次數
                emphasis: {
                    disabled: true
                }
            }]
        };

        chart.setOption(option);

        // 等待佈局完成 (減少迭代次數後可以更快)
        setTimeout(() => {
            window.renderComplete = true;
        }, 1000);
    </script>
</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ]
    });
    const page = await browser.newPage();

    // 禁用不必要的功能加快速度
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setContent(htmlContent);
    await page.setViewport({
      width: 2000,
      height: 2000,
      deviceScaleFactor: 2  // 設定 2x 縮放比例,提高截圖品質
    });

    // 等待 ECharts 渲染完成
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 0 });

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true
    });

    await browser.close();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="relationship-echarts.png"');
    res.setHeader('Cache-Control', 'no-cache');

    res.end(screenshot, 'binary');

  } catch (error) {
    console.error('生成 ECharts PNG 失敗:', error);
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
