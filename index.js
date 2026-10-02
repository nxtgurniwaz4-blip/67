"use strict";

const mineflayer = require("mineflayer");
const express = require("express");
const settings = require("./settings.json");
const { Client, GatewayIntentBits } = require("discord.js");

let logEntries = [];

// ⚠️ PASTE YOUR SECRETS DISCORD BOT TOKEN HERE INSIDE THE QUOTES
const DISCORD_BOT_TOKEN = "P"; 

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

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bot Live Portal</title>
      <style>
        body { background-color: #0b0c10; color: #c5c6c7; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { background: rgba(31, 40, 51, 0.65); padding: 35px; border-radius: 16px; text-align: center; }
        h1 { font-size: 26px; color: #ffffff; }
        .status-box { padding: 16px; border-radius: 8px; background: rgba(0, 0, 0, 0.3); color: #45f3ff; }
        .btn { display: block; color: #45f3ff; text-decoration: none; padding: 12px 24px; border: 1px solid #45f3ff; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>AFK Bot Dashboard</h1>
        <div class="status-box">STATUS: LIVE</div>
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

  // Pulls cleaned parameters straight out of your updated settings.json config file
  const serverIp = settings.server.ip.trim();
  const serverPort = settings.server.port;
  const botUsername = settings.bot-account.username;
  const accountPassword = settings.utils["auto-auth"].password;
  const targetVersion = settings.server.version;

  addLog(`[Network] Connecting directly to ${serverIp}:${serverPort}...`);

  // Bypassed the broken proxy routing and DNS SRV checks completely
  bot = mineflayer.createBot({
    host: serverIp,
    port: serverPort,
    username: botUsername,
    auth: "offline",
    version: targetVersion
  });
  
  setupBotEvents(accountPassword);
}

function setupBotEvents(accountPassword) {
    const sendDiscordAlert = (reason) => {
        const https = require("https");
        const data = JSON.stringify({ content: `⚠️CRITICAL ALERT: ZOOBA HAS ${reason.toUpperCase()}` });
        const req = https.request({
            hostname: "discord.com",
            path: "/api/webhooks/1537329941492797542/HKbPfru5A12F4M6NHQ0a8rp5UM2uwVjw5f2MJ9lsWxVBIuPuoZ6OYuM-cyJxEFw_QIzb",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        });
        req.on("error", (err) => console.error("Discord Error:", err.message));
        req.write(data);
        req.end();
    };

    let inactivityTimer;
    const resetInactivityTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => { sendDiscordAlert("stayed still"); }, 120000); 
    };

    bot.once("spawn", () => {
        botState.connected = true;
        addLog("[Success] Logged into server instance cleanly!");
        sendDiscordAlert("joined the server");
        resetInactivityTimer();

        setTimeout(() => {
            if (botState && botState.connected && bot) {
                bot.chat(`/login ${accountPassword}`);
                bot.chat("/skin Hacker");
            }
        }, 2000);

        setInterval(() => {
            if (bot && botState.connected) { bot.chat('/time query day'); }
        }, 240000);

        clearInterval(walkInterval);
        walkInterval = setInterval(() => {
            if (botState.connected && bot && bot.entity) { bot.setControlState("forward", true); }
        }, 5000);
    });

    bot.on("messagestr", (message) => {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes("zooba")) {
            if (lowerMessage.includes("drowned")) { sendDiscordAlert("drowned"); }
            else if (
                lowerMessage.includes("died") || lowerMessage.includes("slain") || 
                lowerMessage.includes("killed") || lowerMessage.includes("shot")
            ) { 
                sendDiscordAlert("died"); 
            }
        }
    });

    bot.on("kicked", (reason) => { 
        const cleanReason = reason && reason.toString ? reason.toString() : JSON.stringify(reason);
        addLog(`[Kicked] Reason: ${cleanReason}`);
        sendDiscordAlert(`kicked (Reason: ${cleanReason})`); 
    });
    
    bot.on("move", () => { resetInactivityTimer(); });

    bot.on("end", (reason) => {
        botState.connected = false;
        clearInterval(walkInterval);
        clearTimeout(inactivityTimer);
        addLog(`[Disconnected] Connection ended: ${reason}`);
        sendDiscordAlert(`disconnected (Server unreachable: ${reason})`);
        setTimeout(startBot, 15000);
    });

    bot.on("error", (err) => {
        botState.connected = false;
        clearInterval(walkInterval);
        clearTimeout(inactivityTimer);
        addLog(`[Error] Network error caught: ${err.message}`);
        sendDiscordAlert(`crushed/errored (${err.message})`);
    });
}

discordClient.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === "!restart") {
        message.reply("🔄 **Received command.** Initiating clean reboot sequence for Zooba...");
        botState.connected = false;
        startBot();
    }
});

startBot();
discordClient.login(process.env.DISCORD_TOKEN || DISCORD_BOT_TOKEN).catch(err => console.error("Discord Login Fail:", err.message));
