const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const puppeteer = require('puppeteer');

const app = express();

// 中介軟體設定
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Key 驗證中介軟體
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || req.query.key;
  
  if (!providedKey) {
    return res.status(401).json({ 
      error: '需要 API Key',
      message: '請在 Header 中提供 x-api-key 或在 query 參數中提供 key'
    });
  }
  
  if (providedKey !== config.api.key) {
    return res.status(403).json({ 
      error: 'API Key 無效',
      message: '提供的 API Key 不正確'
    });
  }
  
  next();
}

// 建立 MySQL 連線
const db = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4'
});

// 連接資料庫
db.connect((err) => {
  if (err) {
    console.error('無法連接到 MySQL:', err);
    process.exit(1);
  }
  console.log('已成功連接到 MySQL 資料庫');
});

// API 路由

// GET /api/graph - 取得所有人物與關係
app.get('/api/graph', (req, res) => {
  const getPersonsQuery = 'SELECT id, name FROM persons';
  const getRelationsQuery = 'SELECT id, from_person_id, to_person_id FROM relations';
  
  // 並行查詢人物和關係
  Promise.all([
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
  ])
  .then(([persons, relations]) => {
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
    
    res.json({ nodes, edges });
  })
  .catch(err => {
    console.error('查詢資料庫錯誤:', err);
    res.status(500).json({ error: '無法取得圖表資料' });
  });
});

// GET /api/persons - 取得所有人物資料
app.get('/api/persons', (req, res) => {
  const query = 'SELECT id, name, description, created_at FROM persons ORDER BY created_at DESC';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('查詢人物資料錯誤:', err);
      return res.status(500).json({ error: '無法取得人物資料' });
    }
    
    // 格式化回應資料
    const persons = results.map(person => ({
      id: person.id,
      name: person.name,
      description: person.description || '',
      created_at: person.created_at
    }));
    
    res.json({
      success: true,
      count: persons.length,
      data: persons
    });
  });
});

// POST /api/addNode - 新增人物
app.post('/api/addNode', requireApiKey, (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '人物名稱為必填欄位' });
  }
  
  const query = 'INSERT INTO persons (name, description) VALUES (?, ?)';
  db.query(query, [name, description || ''], (err, result) => {
    if (err) {
      console.error('新增人物錯誤:', err);
      return res.status(500).json({ error: '無法新增人物' });
    }
    
    res.json({
      success: true,
      id: result.insertId,
      message: '人物新增成功'
    });
  });
});

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

// 生成即時 PNG 圖片
app.get('/full.png', async (req, res) => {
  try {
    console.log('開始生成 PNG 圖片...');
    
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
    
    // 生成 HTML 用於渲染
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #ffffff; }
        #cy { width: 1200px; height: 1200px; background: #ffffff; }
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
                        'text-outline-width': 3,
                        'text-outline-color': '#2d4a1f',
                        'width': 80,
                        'height': 80,
                        'font-size': 14,
                        'font-weight': 'bold',
                        'border-width': 3,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 15,
                        'line-color': '#b0d3f3',
                        'curve-style': 'straight',
                        'opacity': 1
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
                idealEdgeLength: 200,
                nodeOverlap: 60,
                refresh: 20,
                fit: true,
                padding: 50,
                randomize: false,
                componentSpacing: 200,
                nodeRepulsion: 1200000,
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
            }, 3000);
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
    await page.setViewport({ width: 1200, height: 1200 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 15000 });
    
    // 截圖
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 1200 }
    });
    
    await browser.close();
    
    console.log('PNG 圖片生成完成，大小:', screenshot.length, 'bytes');
    
    // 設定回應標頭並返回圖片 (為 Telegram Bot API 優化)
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': screenshot.length,
      'Content-Disposition': 'inline; filename="sitcon-relationship.png"',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.end(screenshot, 'binary');
    
  } catch (error) {
    console.error('生成 PNG 失敗:', error);
    res.status(500).json({ error: '無法生成圖片: ' + error.message });
  }
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
                        'width': 60,
                        'height': 60,
                        'font-size': 12,
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 8,
                        'line-color': '#b0d3f3',
                        'curve-style': 'straight',
                        'opacity': 1
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
                idealEdgeLength: 120,
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
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 10000 });
    
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
    const lineWidth = parseInt(req.query.width) || 8;  // 預設粗細為 8
    
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
                        'width': 60,
                        'height': 60,
                        'font-size': 12,
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 8,
                        'line-color': '#b0d3f3',
                        'curve-style': 'straight',
                        'opacity': 1
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
                idealEdgeLength: 120,
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
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 10000 });
    
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
    
    // 取得參數
    const lineWidth = Math.max(1, Math.min(50, parseInt(req.query.width) || 8));  // 限制在 1-50 之間
    const nodeSize = parseInt(req.query.nodesize) || 60;  // 節點大小
    
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
                        'font-size': ${Math.max(10, nodeSize * 0.2)},
                        'font-weight': 'bold',
                        'border-width': 2,
                        'border-color': '#77B55A'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': ${lineWidth},
                        'line-color': '#b0d3f3',
                        'curve-style': 'straight',
                        'opacity': 1
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
                idealEdgeLength: 120,
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
    await page.setViewport({ width: 2000, height: 2000 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // 等待 Cytoscape 渲染完成
    await page.waitForFunction(() => window.renderComplete === true, { timeout: 10000 });
    
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

// 啟動伺服器
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`伺服器運行在 http://localhost:${PORT}`);
});

// 優雅地關閉資料庫連線
process.on('SIGINT', () => {
  console.log('\n正在關閉伺服器...');
  db.end(() => {
    console.log('資料庫連線已關閉');
    process.exit(0);
  });
});
