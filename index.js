"use strict";

const mineflayer = require("mineflayer");
const express = require("express");
const proxy = require("socks-proxy-agent");
const proxyUrl = "socks5://83.14.246.42:1080";
let logEntries = [];

function addLog(msg) {
  const time = new Date().toLocaleTimeString();
  const structuredMsg = `[${time}] ${msg}`;
  console.log(structuredMsg);
  logEntries.push(structuredMsg);
  if (logEntries.length > 50) logEntries.shift();
}

const app = express();
const PORT = process.env.PORT || 5000;
let bot = null;
let walkInterval = null;
let botState = { connected: false };

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bot Live Portal</title>
      <style>
        body {
          background-color: #0b0c10;
          background-image: radial-gradient(circle at center, #1f2833 0%, #0b0c10 100%);
          color: #c5c6c7;
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: rgba(31, 40, 51, 0.65);
          padding: 35px;
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.04);
          text-align: center;
          max-width: 420px;
          width: 85%;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        h1 {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: 1.5px;
          margin: 0 0 25px 0;
          color: #ffffff;
        }
        .status-box {
          font-size: 15px;
          font-weight: 700;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 30px;
          letter-spacing: 1px;
          text-transform: uppercase;
          background: rgba(0, 0, 0, 0.3);
          color: \${botState.connected ? '#45f3ff' : '#ff4a4a'};
          text-shadow: 0 0 12px \${botState.connected ? 'rgba(69,243,255,0.4)' : 'rgba(255,74,74,0.4)'};
          border: 1px solid \${botState.connected ? 'rgba(69,243,255,0.3)' : 'rgba(255,74,74,0.3)'};
          transition: all 0.5s ease;
        }
        .btn {
          display: block;
          color: #45f3ff;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
          border: 1px solid rgba(69, 243, 255, 0.4);
          padding: 12px 24px;
          border-radius: 6px;
          background: rgba(69, 243, 255, 0.02);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn:hover {
          background-color: #45f3ff;
          color: #0b0c10;
          box-shadow: 0 0 20px rgba(69, 243, 255, 0.6);
          border-color: #45f3ff;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>AFK Bot Dashboard</h1>
        <div class="status-box">
          STATUS: \${botState.connected ? 'ONLINE & RUNNING' : 'OFFLINE / RECONNECTING'}
        </div>
        <a class="btn" href="/logs">View Console Logs</a>
      </div>
    </body>
    </html>
  `);
});

app.get("/health", (req, res) => res.json({ connected: botState.connected }));
app.get("/logs", (req, res) => res.send(`<pre>${logEntries.join('\n')}</pre>`));
app.listen(PORT, () => addLog(`Web Server booted up on port ${PORT}`));

function startBot() {
  clearInterval(walkInterval);
  if (bot) {
    try { bot.removeAllListeners(); bot.end(); } catch (e) {}
    bot = null;
  }

  const serverIp = "onepiecesmp87.play.hosting";
  const serverPort = 25565;
  const botUsername = "Zooba";
  const accountPassword = "chalol78";

  addLog(`[Network] Pinging ${serverIp}:${serverPort}...`);
  
  bot = mineflayer.createBot({
    agent: new proxy .SocksProxyAgent(proxyUrl),
    host: serverIp,
    port: serverPort,
    username: botUsername,
    auth: "offline",
    version: false
  });

  bot.once("spawn", () => {
    botState.connected = true;
    addLog("[Success] Logged into server instance and spawned cleanly!");
    
    setTimeout(() => {
        if (botState && botState.connected) {
            bot.chat(`/login ${accountPassword}`);
            bot.chat("/skin Hacker");
            addLog("[Auth] Sent account password key packet.");
            console.log(`${bot.username} has spawned in the bedrock box.`);
        }
    }, 2000);

    setInterval(() => {
        if (bot && botState.connected) {
            bot.chat('/time query day');
            console.log('Sent keep-alive command to prevent Limbo sleep.');
        }
    }, 240000);
    
    clearInterval(walkInterval);
    walkInterval = setInterval(() => {
      if (botState.connected && bot.entity) {
        bot.setControlState("forward", true);
      }
    }, 5000);
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    clearInterval(walkInterval);
    addLog(`[Disconnect] Server became unreachable (${reason}). Retrying in 15 seconds...`);
    setTimeout(startBot, 15000);
  });

  bot.on("error", (err) => {
    botState.connected = false;
    addLog(`[Network Alert] Connection dropped: ${err.message}`);
  });
}

startBot();
