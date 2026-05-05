// WebSocket Server for Real-Time ESP32 Bus Tracking
// Run this on a VPS or Raspberry Pi with: node server.js

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

// WebSocket ports for each bus line
const PORTS = {
  L5: 8081,
  L7: 8082,
  L12: 8083,
  L2: 8084,
  L9: 8085,
  ALL: 8080  // Main WebSocket port
};

// Store active bus positions
let busPositions = {};

// Create main WebSocket server for clients (website)
const wssMain = new WebSocket.Server({ port: PORTS.ALL });
console.log(`Main WebSocket server running on port ${PORTS.ALL}`);

wssMain.on('connection', (ws, req) => {
  console.log('Client connected to main WebSocket');
  
  // Send current bus positions to new client
  ws.send(JSON.stringify({
    type: 'init',
    data: busPositions
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received from client:', data);
    } catch (e) {
      console.error('Parse error:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Create separate WebSocket servers for each bus line (ESP devices connect here)
for (const [line, port] of Object.entries(PORTS)) {
  if (line === 'ALL') continue;
  
  const wssLine = new WebSocket.Server({ port: port });
  console.log(`WebSocket server for ${line} running on port ${port}`);
  
  wssLine.on('connection', (ws, req) => {
    console.log(`ESP device connected to ${line} line`);
    
    ws.on('message', (message) => {
      try {
        const busData = JSON.parse(message);
        busData.last_update = Date.now();
        busData.line = line;
        
        // Store bus position
        if (!busPositions[line]) {
          busPositions[line] = [];
        }
        
        // Update or add bus
        const index = busPositions[line].findIndex(b => b.device_id === busData.device_id);
        if (index !== -1) {
          busPositions[line][index] = busData;
        } else {
          busPositions[line].push(busData);
        }
        
        // Remove old positions (older than 60 seconds)
        busPositions[line] = busPositions[line].filter(b => 
          Date.now() - b.last_update < 60000
        );
        
        // Broadcast to all connected clients
        wssMain.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'update',
              line: line,
              data: busData
            }));
          }
        });
        
        console.log(`[${line}] ${busData.device_id}: ${busData.lat}, ${busData.lon}, ${busData.speed}km/h`);
        
      } catch (e) {
        console.error('Parse error:', e);
      }
    });
    
    ws.on('close', () => {
      console.log(`ESP device disconnected from ${line} line`);
    });
  });
}

// HTTP server for status page
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ESP Bus Tracker Status</title>
      <style>
        body { background: #000; color: #00ff41; font-family: monospace; padding: 20px; }
        h1 { color: #00ff41; }
        pre { background: #111; padding: 10px; border: 1px solid #00ff41; }
      </style>
    </head>
    <body>
      <h1>TUA Bus Tracker - ESP Status</h1>
      <pre>${JSON.stringify(busPositions, null, 2)}</pre>
    </body>
    </html>
  `);
  res.end();
});

server.listen(8086);
console.log('Status page available at http://localhost:8086');
