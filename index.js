"use strict";

const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const readline = require("readline");

// Simple internal logger
let logEntries = [];
function addLog(msg) {
  const time = new Date().toLocaleTimeString();
  const structuredMsg = `[${time}] ${msg}`;
  console.log(structuredMsg);
  logEntries.push(structuredMsg);
  if (logEntries.length > 200) logEntries.shift();
}
function getLogs() { return logEntries; }

// ============================================================
// EXPRESS SERVER - Dashboard Interface
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let isReconnecting = false;
let botRunning = true;

let botState = {
  connected: false,
  startTime: Date.now(),
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <style>
          body { font-family: sans-serif; background: #0d1117; color: #e6edf3; padding: 20px; }
          .card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 20px; margin-bottom: 10px; }
          .btn { padding: 10px 15px; border-radius: 5px; cursor: pointer; border: none; }
          .btn-start { background: #238636; color: white; }
          .btn-stop  { background: #da3633; color: white; }
        </style>
      </head>
      <body>
        <h1>Bot Dashboard</h1>
        <div class="card">
          <p>Status: <span id="status-label">Loading...</span></p>
          <p>Uptime: <span id="uptime-text">--</span></p>
          <button class="btn btn-start" onclick="fetch('/start', {method:'POST'})">Start</button>
          <button class="btn btn-stop" onclick="fetch('/stop', {method:'POST'})">Stop</button>
          <a href="/logs" style="color:white;">View Logs</a>
        </div>
        <script>
          async function update() {
            const r = await fetch('/health');
            const data = await r.json();
            document.getElementById('status-label').textContent = data.status;
            document.getElementById('uptime-text').textContent = data.uptime + 's';
          }
          setInterval(update, 5000); update();
        </script>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
  });
});

app.get("/logs", (req, res) => res.send(`<pre>${getLogs().join('\n')}</pre>`));

app.post("/start", (req, res) => { createBot(); res.json({ success: true }); });
app.post("/stop", (req, res) => { if (bot) bot.end(); res.json({ success: true }); });

app.listen(PORT, () => addLog(`Server started on port ${PORT}`));

// ============================================================
// BOT ENGINE & LOGIC
// ============================================================
function clearAllIntervals() {
  activeIntervals.forEach((id) => clearInterval(id));
  activeIntervals = [];
}

function createBot() {
  if (isReconnecting || !botRunning) return;
  if (bot) { try { bot.end(); } catch (e) {} }

  addLog(`[Bot] Connecting to ${config.server.ip}`);

  bot = mineflayer.createBot({
    username: config["bot-account"].username,
    host: config.server.ip,
    port: config.server.port,
  });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    botState.connected = true;
    addLog(`[Bot] Spawned!`);
    
    // Auto Auth
    if (config.utils["auto-auth"]?.enabled) {
      bot.on("messagestr", (msg) => {
        if (msg.includes("login")) bot.chat(`/login ${config.utils["auto-auth"].password}`);
      });
    }

    // Anti AFK
    addInterval(() => bot.swingArm(), 15000);
  });

  bot.on("end", () => {
    botState.connected = false;
    clearAllIntervals();
    setTimeout(createBot, 5000);
  });
}

createBot();

    
