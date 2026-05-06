const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
  let filePath = req.url;
  
  // Default to bus.html if root
  if (filePath === '/' || filePath === '') {
    filePath = '/pages/bus.html';
  }
  
  // Route different paths
  if (filePath === '/bus') filePath = '/pages/bus.html';
  if (filePath === '/train') filePath = '/pages/train.html';
  if (filePath === '/rfid') filePath = '/pages/rfid.html';
  if (filePath === '/database') filePath = '/pages/rfid-database.html';
  
  // Build the full file path
  let fullPath = path.join(__dirname, filePath);
  
  // Get file extension
  const extname = String(path.extname(fullPath)).toLowerCase();
  
  // Set content type
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
  };
  
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // Read and serve the file
  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // File not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<h1>404 - File Not Found</h1><p>Requested: ${filePath}</p><p>Looking in: ${fullPath}</p>`);
      } else {
        // Server error
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      // Success - send the file
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 New client connected!');
  clients.add(ws);
  
  ws.on('message', (message) => {
    const msgStr = message.toString();
    console.log('📨 Received:', msgStr);
    
    // Broadcast to all connected clients
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  });
  
  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   TIRANA BUS TRACKER - WebSocket Server   ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  🖥️  HTTP Server: http://localhost:${PORT}     ║`);
  console.log(`║  🔌 WebSocket: ws://localhost:${PORT}/ws     ║`);
  console.log('║                                            ║');
  console.log('║  📍 Available pages:                      ║');
  console.log(`║     http://localhost:${PORT}/bus           ║`);
  console.log(`║     http://localhost:${PORT}/train         ║`);
  console.log(`║     http://localhost:${PORT}/rfid          ║`);
  console.log(`║     http://localhost:${PORT}/database      ║`);
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  ✅ Server is RUNNING                      ║');
  console.log('║  💳 Waiting for ESP32 to connect...        ║');
  console.log('╚════════════════════════════════════════════╝\n');
});
