"use strict";

const mineflayer = require("mineflayer");
const express = require("express");
const settings = require("./settings.json");
const proxy = require("socks-proxy-agent");
const dns = require("dns");
const { Client, GatewayIntentBits } = require("discord.js");

const proxyUrl = "socks5://83.14.246.42:1080";
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

  const serverIp = "Cocomelon-76hE.aternos.me";
  const botUsername = "Zooba";
  const accountPassword = "chalol78";

  addLog(`[Network] Pinging ${serverIp}...`);
  
  dns.resolveSrv(`_minecraft._tcp.${serverIp}`, (err, records) => {
    let finalHost = serverIp;
    let finalPort = 25565;

    if (!err && records && records.length > 0) {
      finalHost = records[0].name;
      finalPort = records[0].port;
    }

    bot = mineflayer.createBot({
      agent: new proxy.SocksProxyAgent(proxyUrl),
      host: finalHost,
      port: finalPort,
      username: botUsername,
      auth: "offline",
      version: "1.21.1" // Kept exactly to match your current dashboard configurations!
    });
    
    setupBotEvents(accountPassword); 
  });
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

    // Converts Minecraft structured server packets cleanly into plain text to fix [object Object] output
    bot.on("kicked", (reason) => { 
        const cleanReason = reason && reason.toString ? reason.toString() : JSON.stringify(reason);
        sendDiscordAlert(`kicked (Reason: ${cleanReason})`); 
    });
    
    bot.on("move", () => { resetInactivityTimer(); });

    bot.on("end", (reason) => {
        botState.connected = false;
        clearInterval(walkInterval);
        clearTimeout(inactivityTimer);
        sendDiscordAlert(`disconnected (Server unreachable: ${reason})`);
        setTimeout(startBot, 15000);
    });

    bot.on("error", (err) => {
        botState.connected = false;
        clearInterval(walkInterval);
        clearTimeout(inactivityTimer);
        sendDiscordAlert(`crushed/errored (${err.message})`);
    });
}

// Discord Channel Text Command Monitoring Loop
discordClient.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Prevent bot from triggering its own loops
    if (message.content.toLowerCase() === "!restart") {
        message.reply("🔄 **Received command.** Initiating clean reboot sequence for Zooba...");
        botState.connected = false;
        startBot();
    }
});


startBot();
discordClient.login(process.env.DISCORD_TOKEN).catch(err => console.error("Discord Login Fail:", err.message));

