"use strict";

const mineflayer = require("mineflayer");
const express = require("express");

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
    <html>
      <head><title>Bot Live Portal</title></head>
      <body style="background:#0d1117; color:#e6edf3; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1>AFK Bot Dashboard</h1>
        <h2 style="color: ${botState.connected ? '#3fb950' : '#f85149'}">
          Status: ${botState.connected ? 'ONLINE & RUNNING' : 'OFFLINE / RECONNECTING'}
        </h2>
        <a href="/logs" style="color:#58a6ff;">View Console Logs</a>
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

  // Hardcoded server information to prevent 127.0.0.1 errors
  const serverIp = "onepiecesmp87.play.hosting";
  const serverPort = 25565;
  const botUsername = "Zooba";
  const accountPassword = "chalol78";

  addLog(`[Network] Pinging ${serverIp}:${serverPort}...`);

  bot = mineflayer.createBot({
    host: serverIp,
    port: serverPort,
    username: botUsername,
    auth: "offline",
    version: false
  });

  bot.once("spawn", () => {
    botState.connected = true;
    addLog("[Success] Logged into server instance and spawned cleanly!");
    
    // Auth handler delay loop
    setTimeout(() => {
        if (botState && botState.connected) {
            bot.chat(`/login ${accountPassword}`);
            bot.chat("/skin Hacker");
            addLog("[Auth] Sent account password key packet.");
            console.log(`${bot.username} has spawned in the bedrock box.`);
        }
    }, 2000);


    // Loop runs every 4 minutes (240,000 milliseconds)
    setInterval(() => {
        if (bot && botState.connected) {
            // Sends a server command to check the time
            bot.chat('/time query day');
            console.log('Sent keep-alive command to prevent Limbo sleep.');
        }
    }, 240000);

    
    // INFINITE WALK MODULE: Forces the bot forward constantly
    clearInterval(walkInterval);
    walkInterval = setInterval(() => {
      if (botState.connected && bot.entity) {
        bot.setControlState("forward", true);
      }
    }, 5000);


  bot.on("end", (reason) => {
    botState.connected = false;
    clearInterval(walkInterval);
    addLog(`[Disconnect] Server became unreachable (${reason}). Retrying in 15 seconds...`);
    setTimeout(startBot, 15000);
  });

  bot.on("error", (err) => {
    addLog(`[Network Alert] Connection dropped: ${err.message}`);
  });
}

// Fire up deployment
startBot();
