const express = require('express');
const app = express();
const mineflayer = require('mineflayer');
const fs = require('fs');

// Load configurations safely from settings.json
const config = require('./settings.json');
const PORT = process.env.PORT || 3000;

let bot;
let movementInterval;
let botState = {
    connected: false,
    uptime: 0,
    coords: { x: 0, y: 0, z: 0 }
};

// Simple log logger helper
function addLog(message) {
    console.log(`[BOT LOG] ${message}`);
}

// Uptime tracker function
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

// Main function to instantiate the Mineflayer instance
function createBot() {
    if (botState.connected) return;

    bot = mineflayer.createBot({
        host: config.server.ip,
        port: parseInt(config.server.port) || 25565,
        username: config.name || "AFK_Bot",
        version: config.server.version || false
    });

    bot.on('login', () => {
        botState.connected = true;
        addLog('Bot logged in as ' + bot.username);
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
        addLog('Bot error: ' + err.message);
    });
}

// Express route endpoint for the web interface panel
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\${config.name || "AFK Bot"} Dashboard</title>
    <style>
        body { font-family: sans-serif; background: #1a1a1a; color: #fff; margin: 2rem; }
        .stat-card { background: #2a2a2a; padding: 15px; margin-bottom: 10px; border-radius: 5px; }
        dt { font-weight: bold; color: #aaa; }
        dd { margin: 5px 0 0 0; font-size: 1.2rem; }
        .status-section { padding: 15px; border-radius: 5px; margin-bottom: 20px; font-weight: bold; display: flex; align-items: center; gap: 10px; }
        .online { background: #2e7d32; }
        .offline { background: #c62828; }
        .status-icon { font-size: 1.5rem; }
    </style>
</head>
<body>
    <main>
        <section id="status-box" class="status-section offline">
            <span id="status-icon" class="status-icon">&#x2717;</span>
            <div>
                <div id="status-label">Offline</div>
                <small id="status-detail">Panel disconnected from server</small>
            </div>
        </section>

        <section>
            <div class="stat-card">
                <dt>Uptime</dt>
                <dd id="uptime-text">-</dd>
            </div>
            <div class="stat-card">
                <dt>Coordinates</dt>
                <dd id="coords-text">Searching...</dd>
            </div>
            <div class="stat-card">
                <dt>Server address</dt>
                <dd id="server-ip-text">Not configured</dd>
            </div>
        </section>
    </main>

    <script>
        function updateDashboard() {
            // Safe fallback evaluation loop via window fetch API matching backend state
            fetch('/api/status')
                .then(res => res.json())
                .then(data => {
                    const box = document.getElementById('status-box');
                    const icon = document.getElementById('status-icon');
                    const label = document.getElementById('status-label');
                    const detail = document.getElementById('status-detail');

                    if (data.connected) {
                        box.className = 'status-section online';
                        icon.innerHTML = '&#x2713;';
                        label.innerText = 'Online';
                        detail.innerText = 'Bot running cleanly';
                    } else {
                        box.className = 'status-section offline';
                        icon.innerHTML = '&#x2717;';
                        label.innerText = 'Offline';
                        detail.innerText = 'Waiting for connection trigger';
                    }

                    document.getElementById('uptime-text').innerText = data.uptimeFormatted;
                    document.getElementById('coords-text').innerText = 'X: ' + data.coords.x + ', Y: ' + data.coords.y + ', Z: ' + data.coords.z;
                    document.getElementById('server-ip-text').innerText = data.serverIp;
                })
                .catch(e => console.error("Update cycle failed", e));
        }
        setInterval(updateDashboard, 5000);
        updateDashboard();
    </script>
</body>
</html>
    `);
});

// JSON API Endpoint called dynamically by front-end javascript scripts
app.get('/api/status', (req, res) => {
    res.json({
        connected: botState.connected,
        uptimeFormatted: formatUptime(botState.uptime),
        coords: botState.coords,
        serverIp: config.server?.ip || "Not configured"
    });
});

// Automated status ticker updater increment loop
setInterval(() => {
    if (botState.connected) {
        botState.uptime++;
    }
}, 1000);

// Initialize application listening engine
app.listen(PORT, () => {
    addLog('Server running on port ' + PORT);
    if (config.autoStart) {
        createBot();
    }
});
