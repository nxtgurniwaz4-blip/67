"use strict";

const express = require("express");
const http = require("http");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");

// Logger fallbacks in case local modules aren't available
let addLog = console.log;
let getLogs = () => [];
try {
  const logger = require("./logger");
  addLog = logger.addLog || console.log;
  getLogs = logger.getLogs || (() => []);
} catch (e) {
  console.log("[Notice] Local logger module not found, defaulting to console.");
}

// ============================================================
// EXPRESS SERVER - Keeps Render Alive & Handles Dashboard
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Bot state tracking
let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
  coords: { x: 0, y: 0, z: 0 }
};

let bot = null;
let movementInterval = null;

// Endpoint for Dashboard UI data
app.get('/health', (req, res) => {
  res.json({
    status: botState.connected ? 'connected' : 'offline',
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: botState.coords
  });
});

// Endpoint to start the bot via UI
app.post('/api/start', (req, res) => {
  if (!botState.connected) {
    addLog("Bot start requested from dashboard.");
    createBot();
    res.json({ success: true, message: "Starting bot..." });
  } else {
    res.json({ success: false, message: "Bot is already running." });
  }
});

// Endpoint to stop the bot via UI
app.post('/api/stop', (req, res) => {
  if (botState.connected && bot) {
    addLog("Bot stop requested from dashboard.");
    bot.quit();
    res.json({ success: true, message: "Stopping bot..." });
  } else {
    res.json({ success: false, message: "Bot is already stopped." });
  }
});

// Fallback endpoints for dashboard links
app.get('/logs', (req, res) => res.json(getLogs()));
app.get('/tutorial', (req, res) => res.send("Configure your bot coordinates inside settings.json. Make sure the bot has OP."));

// Complete, polished HTML Dashboard UI
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name || "AFK Bot"} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://googleapis.com">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117; color: #e6edf3;
            display: flex; justify-content: center; align-items: center;
            min-height: 100vh; margin: 0; padding: 24px;
          }
          main { width: 100%; max-width: 400px; }
          header { margin-bottom: 28px; }
          header h1 { font-size: 26px; font-weight: 700; color: #f0f6fc; margin: 0; line-height: 1.2; }
          header p { font-size: 14px; color: #8b949e; margin: 6px 0 0; line-height: 1.5; }
          .status-section { border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; transition: background 0.3s, border-color 0.3s; }
          .status-section.online  { background: #0d2218; border: 2px solid #238636; }
          .status-section.offline { background: #200d0d; border: 2px solid #da3633; }
          .status-icon { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
          .status-icon.online  { background: #238636; color: #fff; }
          .status-icon.offline { background: #da3633; color: #fff; }
          .status-label { font-size: 18px; font-weight: 700; line-height: 1.2; }
          .status-label.online  { color: #3fb950; }
          .status-label.offline { color: #f85149; }
          .status-detail { font-size: 13px; color: #8b949e; margin-top: 3px; }
          .stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 16px 20px; margin-bottom: 10px; }
          dt { font-size: 12px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
          dd { margin: 0; font-size: 17px; font-weight: 600; color: #e6edf3; line-height: 1.3; }
          .stat-detail { margin: 4px 0 0; font-size: 11px; color: #6e7681; }
          .controls { margin-top: 8px; }
          .btn-grid { display: grid; gap: 10px; margin-bottom: 10px; }
          .btn-grid-2 { grid-template-columns: 1fr 1fr; }
          .btn-primary { min-height: 52px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: filter 0.2s; }
          .btn-primary:hover  { filter: brightness(1.2); }
          .btn-start { border: 2px solid #238636; background: #0d2218; color: #3fb950; }
          .btn-stop  { border: 2px solid #da3633; background: #200d0d; color: #f85149; }
          .btn-secondary { min-height: 44px; border-radius: 10px; border: 1px solid #21262d; background: #161b22; color: #8b949e; font-size: 13px; font-weight: 500; text-decoration: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
          .btn-secondary:hover { background: #21262d; color: #c9d1d9; }
          footer { margin-top: 20px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main role="main" aria-label="AFK Bot Dashboard">
          <header>
            <h1>AFK Bot Dashboard</h1>
            <p>Minecraft server bot &middot; Live status</p>
          </header>
          <section id="status-section" class="status-section offline">
            <div id="status-icon" class="status-icon offline">&#x2717;</div>
            <div>
              <div id="status-label" class="status-label offline">Connecting…</div>
              <div id="status-detail" class="status-detail">Establishing connection</div>
            </div>
          </section>
          <section>
            <div class="stat-card">
              <div class="stat-item">
                <dt>Uptime</dt>
                <dd id="uptime-text">—</dd>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-item">
                <dt>Coordinates</dt>
                <dd id="coords-text">Searching…</dd>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-item">
                <dt>Server address</dt>
                <dd>${config?.server?.ip || "Not configured"}</dd>
              </div'
            </div>
          </section>
          <section class="controls">
            <div class="btn-grid btn-grid-2">
              <button class="btn-primary btn-start" onclick="startBot()">Start bot</button>
              <button class="btn-primary btn-stop" onclick="stopBot()">Stop bot</button>
            </div>
            <div class="btn-grid btn-grid-2">
              <a href="/tutorial" class="btn-secondary">Setup guide</a>
              <a href="/logs" class="btn-secondary">View logs</a>
            </div>
          </section>
          <footer><p>Status updates every 5 seconds</p></footer>
        </main>
        <script>
          function formatUptime(s) {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
            if (m > 0) return m + 'm ' + sec + 's';
            return sec + ' seconds';
          }
          async function startBot() { await fetch('/api/start', { method: 'POST' }); update(); }
          async function stopBot() { await fetch('/api/stop', { method: 'POST' }); update(); }
          async function update() {
            try {
              const r = await fetch('/health');
              const data = await r.json();
              const online = data.status === 'connected';
              const section = document.getElementById('status-section');
              const icon = document.getElementById('status-icon');
              
              if (online) {
                section.className = 'status-section online';
                icon.className = 'status-icon online';
                icon.innerHTML = '&#x2713;';
                document.getElementById('status-label').className = 'status-label online';
                document.getElementById('status-label').innerText = 'Online';
                document.getElementById('status-detail').innerText = 'Connected to server';
                document.getElementById('uptime-text').innerText = formatUptime(data.uptime);
                document.getElementById('coords-text').innerText = `X: ${data.coords.x}, Y: ${data.coords.y}, Z: ${data.coords.z}`;
              } else {
                section.className = 'status-section offline';
                icon.className = 'status-icon offline';
                icon.innerHTML = '&#x2717;';
                document.getElementById('status-label').className = 'status-label offline';
                document.getElementById('status-label').innerText = 'Offline';
                document.getElementById('status-detail').innerText = 'Bot is not running';
                document.getElementById('uptime-text').innerText = '—';
                document.getElementById('coords-text').innerText = 'Searching…';
              }
            } catch (e) {
              console.error("Dashboard updating error:", e);
            }
          }
          setInterval(update, 5000);
          update();
        </script>
      </body>
    </html>
  `);
});


// ============================================================
// MINEFLAYER BOT LOGIC
// ============================================================
function createBot() {
if (botState.connected) return;
  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port || 25565,
    username: config.bot.username,
    auth: config.bot.auth || 'offline',
    viewDistance: 'tiny',
    physicsEnabled: false
  });
bot.loadPlugin(pathfinder);
bot.on('login', () => {
botState.connected = true;
botState.reconnectAttempts = 0;
addLog(Bot logged in as \${bot.username});
});
bot.on('move', () => {
if (bot.entity) {
botState.coords = {
x: Math.round(bot.entity.position.x),
y: Math.round(bot.entity.position.y),
z: Math.round(bot.entity.position.z)
};
}
});
bot.on('end', () => {
botState.connected = false;
addLog("Bot disconnected.");
if (movementInterval) clearInterval(movementInterval);
});
bot.on('error', (err) => {
addLog(Bot error: \${err.message});
});
}
// Start express server
app.listen(PORT, () => {
addLog(Server running on port \${PORT});
if (config.autoStart) {
createBot();
}
});
