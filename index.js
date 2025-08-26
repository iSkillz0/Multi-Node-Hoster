const { spawn } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

let processes = {};
let startTimes = {};
let logStream = null;

// ensure logs dir
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

function listProjects() {
    return fs.readdirSync("./").filter((dir) => /^\d+$/.test(dir));
}

function timestamp() {
    const now = new Date();
    return now.toISOString().replace("T", " ").split(".")[0];
}

function logToFile(id, message) {
    const logFile = path.join(logsDir, `${id}.txt`);
    fs.appendFileSync(logFile, `[${timestamp()}] ${message}`);
}

function formatDuration(ms) {
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / (1000 * 60)) % 60;
    const hr = Math.floor(ms / (1000 * 60 * 60));
    return `${hr}h ${min}m ${sec}s`;
}

function startBot(id) {
    if (processes[id]) return;

    const bot = spawn("node", ["index.js"], {
        cwd: `./${id}`,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
    });

    processes[id] = bot;
    startTimes[id] = Date.now();

    bot.stdout.on("data", (data) => {
        const msg = `[${id}] ${data}`;
        if (logStream === id) process.stdout.write(`[${timestamp()}] ${msg}`);
        logToFile(id, msg);
    });

    bot.stderr.on("data", (data) => {
        const msg = `[${id} ERROR] ${data}`;
        if (logStream === id) process.stderr.write(`[${timestamp()}] ${msg}`);
        logToFile(id, msg);
    });

    bot.on("exit", (code) => {
        const msg = `${id}/index.js exited with code ${code}. Restarting in 5s...\n`;
        console.log(`[${timestamp()}] ${msg.trim()}`);
        logToFile(id, msg);
        delete processes[id];
        delete startTimes[id];
        setTimeout(() => startBot(id), 5000);
    });

    const msg = `Started ${id}/index.js (PID: ${bot.pid})\n`;
    console.log(`[${timestamp()}] ${msg.trim()}`);
    logToFile(id, msg);
}

function stopBot(id) {
    if (processes[id]) {
        processes[id].kill();
        delete processes[id];
        delete startTimes[id];
        const msg = `Stopped bot ${id}\n`;
        console.log(`[${timestamp()}] ${msg.trim()}`);
        logToFile(id, msg);
    } else {
        console.log(`Bot ${id} not running.`);
    }
}

function restartBot(id) {
    if (processes[id]) {
        processes[id].kill();
        console.log(`[${timestamp()}] Restarting bot ${id}...`);
    } else {
        console.log(`[${timestamp()}] Bot ${id} not running, starting...`);
        startBot(id);
    }
}

function showStatus() {
    const ids = listProjects();
    console.log("\nBot Status:\n");
    console.log("ID   Status     PID     Uptime");
    console.log("--------------------------------------");

    ids.forEach((id) => {
        if (processes[id]) {
            const uptime = formatDuration(Date.now() - startTimes[id]);
            console.log(`${id.padEnd(4)} RUNNING   ${String(processes[id].pid).padEnd(6)} ${uptime}`);
        } else {
            console.log(`${id.padEnd(4)} STOPPED`);
        }
    });
    console.log("");
}

// Initial start
listProjects().forEach(startBot);

// Re-check projects every 30 min
setInterval(() => {
    const current = listProjects();

    // start new ones
    current.forEach((id) => {
        if (!processes[id]) startBot(id);
    });

    // stop removed ones
    Object.keys(processes).forEach((id) => {
        if (!current.includes(id)) {
            console.log(`[${timestamp()}] Project ${id} folder deleted, stopping bot...`);
            stopBot(id);
        }
    });
}, 30 * 60 * 1000);

console.log(`
Commands:
<number>  → Show logs for a specific bot
0         → Stop showing logs
rN        → Restart bot N (e.g. r2)
ra        → Restart all bots
sN        → Stop bot N (e.g. s2)
sa        → Stop all bots
ls        → List all bots with status, PID, and uptime
`);

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (input) => {
    if (/^\d+$/.test(input)) logStream = input;
    else if (input === "0") logStream = null;
    else if (/^r\d+$/.test(input)) restartBot(input.slice(1));
    else if (input === "ra") Object.keys(processes).forEach(restartBot);
    else if (/^s\d+$/.test(input)) stopBot(input.slice(1));
    else if (input === "sa") Object.keys(processes).forEach(stopBot);
    else if (input === "ls") showStatus();
});
