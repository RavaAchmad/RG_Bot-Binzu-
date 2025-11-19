/* XRDHZ-MD - PTERODACTYL OPTIMIZED VERSION
  Optimized for limited disk I/O in container environments
*/

import "./settings.js";
import path, { join } from "path";
import pino from "pino";
import ws from "ws";
import chalk from "chalk";
import platform from "process";
import lodash from "lodash";
import yargs from "yargs";
import syntaxerror from "syntax-error";
import { format } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, mkdirSync, watch, writeFileSync } from "fs";
import { spawn, execSync } from "child_process";
import { createRequire } from "module";
import { tmpdir } from "os";

import { Low, JSONFile } from "lowdb";
import { makeWASocket, protoType } from "./function/simple.js";
import { requestPairing, connectionUpdate } from "./function/connection.js";

const { Browsers, useMultiFileAuthState, fetchLatestWaWebVersion, makeCacheableSignalKeyStore } = await import("baileys");

protoType();

// ===== SETUP CUSTOM TMP DIRECTORY (Critical untuk Pterodactyl) =====
const customTmpDir = join(process.cwd(), 'tmp');
process.env.TMPDIR = customTmpDir;
process.env.TEMP = customTmpDir;
process.env.TMP = customTmpDir;

// Set memory limits
process.env.NODE_OPTIONS = '--max-old-space-size=512';
process.setMaxListeners(50);

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== "win32") {
    return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString();
};
global.__require = function require(dir = import.meta.url) {
    return createRequire(dir);
};
global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};
const __dirname = global.__dirname(import.meta.url);

// ===== OPTIMIZED SESSION STATE dengan Write Throttling =====
const sessionDir = './sessions';
if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

let writeQueue = new Map();
let isWritingCreds = false;
let lastCredWrite = 0;

const throttledWrite = async (filepath, data) => {
    const now = Date.now();
    
    // Minimum 5s between cred writes
    if (now - lastCredWrite < 5000) {
        writeQueue.set(filepath, data);
        return;
    }
    
    writeQueue.set(filepath, data);
    
    if (isWritingCreds) return;
    isWritingCreds = true;
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    for (const [path, content] of writeQueue.entries()) {
        try {
            writeFileSync(path, JSON.stringify(content, null, 2));
            lastCredWrite = Date.now();
        } catch (error) {
            if (error.code === 'ENOSPC') {
                console.error(chalk.red('[SESSION] Disk full! Skipping write...'));
                // Emergency cleanup
                try {
                    const tmpFiles = readdirSync(customTmpDir);
                    tmpFiles.forEach(f => {
                        try { unlinkSync(join(customTmpDir, f)); } catch (e) {}
                    });
                } catch (e) {}
            } else {
                console.error('[SESSION ERROR]:', error.message);
            }
        }
    }
    
    writeQueue.clear();
    isWritingCreds = false;
};

const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(sessionDir);

// Throttled saveCreds
const saveCreds = async () => {
    const credsPath = join(sessionDir, 'creds.json');
    await throttledWrite(credsPath, state.creds);
};

const { version, isLatest } = await fetchLatestWaWebVersion();

// ===== OPTIMIZED CONNECTION OPTIONS =====
const connectionOptions = {
    version: version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }).child({ level: "store" }))
    },
    
    // CRITICAL: Reduce unnecessary writes
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    
    // Don't cache old messages
    getMessage: async (key) => {
        return { conversation: '' };
    },
    
    // Ignore spam sources
    shouldIgnoreJid: (jid) => {
        return jid.endsWith('@newsletter');
    },
    
    patchMessageBeforeSending: message => {
        const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {}
                        },
                        ...message
                    }
                }
            };
        }
        return message;
    },
    
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 3000,
    maxMsgRetryCount: 2
};

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.conn = makeWASocket(connectionOptions, global.opts);
global.prefix = new RegExp("^[" + (opts.prefix || "‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-").replace(/[|\\{}()[\]^$+*?.\-\^]/g, "\\$&") + "]");

// ===== OPTIMIZED DATABASE dengan Debounced Write =====
global.db = new Low(new JSONFile("database.json"));
global.DATABASE = global.db;

global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) {
        return new Promise(resolve =>
            setInterval(function () {
                !global.db.READ ? (clearInterval(this), resolve(global.db.data == null ? global.loadDatabase() : global.db.data)) : null;
            }, 1 * 1000)
        );
    }
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read();
    global.db.READ = false;
    global.db.data = {
        users: {},
        chats: {},
        settings: {},
        ...(global.db.data || {})
    };
    global.db.chain = lodash.chain(global.db.data);
};

// ===== DEBOUNCED DATABASE WRITE (Hemat I/O) =====
if (global.db) {
    let writeTimer = null;
    let lastWrite = Date.now();
    let isDirty = false;
    let isWriting = false;
    
    const scheduleWrite = () => {
        isDirty = true;
        clearTimeout(writeTimer);
        
        writeTimer = setTimeout(async () => {
            if (!isDirty || isWriting) return;
            
            const now = Date.now();
            const timeSinceLastWrite = now - lastWrite;
            
            // Minimum 60s between writes (hemat I/O)
            if (timeSinceLastWrite < 60000) {
                setTimeout(scheduleWrite, 10000);
                return;
            }
            
            isWriting = true;
            try {
                if (global.db.data) {
                    // Atomic write via temp file
                    const tmpFile = 'database.tmp.json';
                    const mainFile = 'database.json';
                    
                    writeFileSync(tmpFile, JSON.stringify(global.db.data, null, 2));
                    
                    // Rename is atomic operation
                    if (existsSync(mainFile)) unlinkSync(mainFile);
                    require('fs').renameSync(tmpFile, mainFile);
                    
                    lastWrite = now;
                    isDirty = false;
                    console.log(chalk.green('[DB]'), 'Saved at', new Date().toLocaleTimeString());
                }
            } catch (error) {
                if (error.code === 'ENOSPC') {
                    console.error(chalk.red('[DB] DISK FULL!'), 'Retrying in 5 minutes...');
                    setTimeout(scheduleWrite, 5 * 60 * 1000);
                } else {
                    console.error('[DB ERROR]:', error.message);
                }
            } finally {
                isWriting = false;
            }
        }, 5000);
    };
    
    // Save every 2 minutes max
    setInterval(scheduleWrite, 120 * 1000);
    
    // Watch critical changes only
    const handler = {
        set(target, property, value) {
            target[property] = value;
            scheduleWrite();
            return true;
        }
    };
    
    // Defer proxy setup
    setTimeout(() => {
        if (global.db.data?.users) {
            global.db.data.users = new Proxy(global.db.data.users, handler);
        }
    }, 10000);
}

// ===== AGGRESSIVE TMP CLEANUP =====
if (!existsSync(customTmpDir)) {
    mkdirSync(customTmpDir, { recursive: true });
}

const cleanupTmp = async () => {
    try {
        if (!existsSync(customTmpDir)) return;
        
        const files = readdirSync(customTmpDir);
        const now = Date.now();
        const limit = 30 * 1000; // 30 seconds
        
        let deletedCount = 0;
        for (const file of files) {
            const filePath = join(customTmpDir, file);
            try {
                const stats = statSync(filePath);
                if (now - stats.mtimeMs >= limit) {
                    unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (deletedCount > 0) {
            console.log(chalk.yellow('[TMP]'), `Cleaned ${deletedCount} file(s)`);
        }
    } catch (error) {
        console.error('[TMP CLEANUP ERROR]:', error.message);
    }
};

// Run immediately
cleanupTmp();

// Then every 20 seconds
setInterval(cleanupTmp, 20 * 1000);

// ===== SESSION CLEANUP (Remove old cache files) =====
setInterval(() => {
    try {
        if (!existsSync(sessionDir)) return;
        
        const files = readdirSync(sessionDir);
        const essentialFiles = ['creds.json', 'app-state-sync-version.json'];
        
        for (const file of files) {
            if (!essentialFiles.includes(file) && file.endsWith('.json')) {
                const filePath = join(sessionDir, file);
                const stats = statSync(filePath);
                const age = Date.now() - stats.mtimeMs;
                
                // Delete cache files older than 1 hour
                if (age > 60 * 60 * 1000) {
                    try {
                        unlinkSync(filePath);
                        console.log(chalk.yellow('[SESSION]'), `Cleaned ${file}`);
                    } catch (e) {}
                }
            }
        }
    } catch (error) {
        // Silent fail
    }
}, 60 * 60 * 1000); // Every hour

// ===== DISK MONITOR =====
let lastDiskCheck = 0;
setInterval(() => {
    const now = Date.now();
    if (now - lastDiskCheck < 60000) return;
    lastDiskCheck = now;
    
    try {
        const diskUsage = execSync('df -h / | tail -1').toString();
        const usagePercent = parseInt(diskUsage.split(/\s+/)[4]);
        
        if (usagePercent > 85) {
            console.warn(chalk.red('[WARNING]'), `Disk usage at ${usagePercent}%!`);
            cleanupTmp();
        }
    } catch (e) {
        // Ignore if df not available
    }
}, 60000);

// ===== GRACEFUL SHUTDOWN =====
const gracefulShutdown = async (signal) => {
    console.log(chalk.yellow(`\n[SHUTDOWN]`), `Received ${signal}, saving data...`);
    
    try {
        if (global.db?.data) {
            await global.db.write();
            console.log(chalk.green('[SHUTDOWN]'), 'Database saved');
        }
        
        if (global.conn?.ws) {
            await global.conn.ws.close();
            console.log(chalk.green('[SHUTDOWN]'), 'Connection closed');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('[SHUTDOWN ERROR]:', error.message);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ===== EMERGENCY ENOSPC HANDLER =====
process.on('uncaughtException', async (error) => {
    if (error.code === 'ENOSPC') {
        console.error(chalk.red.bold('\n[CRITICAL] DISK FULL DETECTED!\n'));
        
        try {
            // Stop all writes
            if (global.db) global.db.READ = true;
            
            // Emergency cleanup
            await cleanupTmp();
            
            // Clear old session cache
            const sessionFiles = readdirSync(sessionDir);
            const essentialFiles = ['creds.json', 'app-state-sync-version.json'];
            
            for (const file of sessionFiles) {
                if (!essentialFiles.includes(file) && file.endsWith('.json')) {
                    try {
                        unlinkSync(join(sessionDir, file));
                    } catch (e) {}
                }
            }
            
            console.log(chalk.green('[CLEANUP]'), 'Emergency cleanup completed');
            
            // Try to save database one last time
            if (global.db?.data) {
                try {
                    await global.db.write();
                    console.log(chalk.green('[CLEANUP]'), 'Database saved');
                } catch (e) {
                    console.error(chalk.red('[CLEANUP]'), 'Could not save database');
                }
            }
            
            console.log(chalk.yellow('[SYSTEM]'), 'Please check disk space and restart.');
            process.exit(1);
            
        } catch (cleanupError) {
            console.error('[CLEANUP ERROR]:', cleanupError.message);
            process.exit(1);
        }
    } else {
        console.error('[UNCAUGHT EXCEPTION]:', error);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason?.code === 'ENOSPC') {
        console.error(chalk.red('[UNHANDLED REJECTION - ENOSPC]'));
        cleanupTmp();
    } else {
        console.error('[UNHANDLED REJECTION]:', reason);
    }
});

// ===== START PAIRING =====
async function StartPairing() {
    if (existsSync("./sessions/creds.json") && !conn.authState.creds.registered) {
        console.log(chalk.red.bold("[SISTEM] ERROR SESSION RUSAK"));
        process.exit(1);
    }

    if (!conn.authState.creds.registered) {
        await global.reloadHandler(true);
        conn.ev.on("connection.update", async update => {
            const { connection } = update;
            if (connection === "connecting") {
                await requestPairing(global.conn);
            }
        });
    }
}

// ===== HANDLER SYSTEM =====
let isHandlerInit = true;
let HandlerModule = await import("./handler.js");

global.reloadHandler = async function reloadHandler(restartConnection) {
    try {
        const NewHandler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (NewHandler && Object.keys(NewHandler).length) {
            HandlerModule = NewHandler;
        }
    } catch (error) {
        console.error(error);
    }

    if (restartConnection) {
        const lastChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch (error) {
            console.error(error);
        }
        conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions, { chats: lastChats });
        isHandlerInit = true;
    }

    if (!isHandlerInit) {
        conn.ev.off("message.upsert", conn.handler);
        conn.ev.off("group-participants.update", conn.participantsUpdate);
        conn.ev.off("groups.update", conn.groupsUpdate);
        conn.ev.off("message.delete", conn.onDelete);
        conn.ev.off("connection.update", conn.connectionUpdate);
        conn.ev.off("creds.update", conn.credsUpdate);
    }

    conn.sWelcome = "Selamat Datang @user";
    conn.sBye = "Selamat Tinggal @user";
    conn.sSubject = "@subject";
    conn.sDesc = "@desc";
    conn.sPromote = "Selamat @user telah menjadi Admin";
    conn.sDemote = "@user telah diberhentikan sebagai Admin";

    conn.handler = HandlerModule.handler.bind(global.conn);
    conn.participantsUpdate = HandlerModule.participantsUpdate.bind(global.conn);
    conn.groupsUpdate = HandlerModule.groupsUpdate.bind(global.conn);
    conn.onDelete = HandlerModule.catchDeleted.bind(global.conn);
    conn.connectionUpdate = async update => await connectionUpdate(update, conn);
    conn.credsUpdate = saveCreds.bind(global.conn);

    conn.ev.on("messages.upsert", conn.handler);
    conn.ev.on("group-participants.update", conn.participantsUpdate);
    conn.ev.on("groups.update", conn.groupsUpdate);
    conn.ev.on("message.delete", conn.onDelete);
    conn.ev.on("connection.update", conn.connectionUpdate);
    conn.ev.on("creds.update", conn.credsUpdate);

    isHandlerInit = false;
    return true;
};

// ===== PLUGINS SYSTEM =====
global.plugins = {};
const pluginFolder = global.__dirname(join(__dirname, "./plugins/index"));
const pluginFilter = filename => /\.js$/.test(filename);

async function featuresInit() {
    for (let filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            let files = global.__filename(join(pluginFolder, filename));
            const module = await import(files);
            global.plugins[filename] = module.default || module;
        } catch (error) {
            console.log(chalk.red("[INFO] FITUR ERROR"), `"${filename}"`);
            console.log(error);
            delete global.plugins[filename];
        }
    }
}
await featuresInit();

global.reloadPlugins = async (_ev, filename) => {
    if (!pluginFilter(filename)) return;

    const dir = global.__filename(join(pluginFolder, filename), true);
    if (filename in global.plugins) {
        if (existsSync(dir)) {
            console.log(chalk.green("[INFO] FITUR DIUPDATE"), `"${filename}"`);
        } else {
            console.log(chalk.red("[INFO] FITUR DIHAPUS"), `"${filename}"`);
            return delete global.plugins[filename];
        }
    } else {
        console.log(chalk.blue("[INFO] FITUR DITAMBAHKAN"), `"${filename}"`);
    }

    const error = syntaxerror(readFileSync(dir), filename, {
        sourceType: "module",
        allowAwaitOutsideFunction: true
    });
    
    if (error) {
        console.log(chalk.yellow("[INFO] SYNTAXERROR"), `"${filename}"`);
        console.log(error);
        return;
    }

    try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
        global.plugins[filename] = module.default || module;
    } catch (e) {
        console.log(chalk.red("[INFO] FITUR ERROR"), `"${filename}"`);
        console.log(format(e));
    } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
    }
};

Object.freeze(global.reloadPlugins);
await watch(pluginFolder, global.reloadPlugins);
await global.reloadHandler();
await StartPairing();

console.log(chalk.green.bold('\n✓ Bot started successfully!'));
console.log(chalk.cyan('Memory limit:'), '512MB');
console.log(chalk.cyan('Tmp directory:'), customTmpDir);
console.log(chalk.cyan('DB write interval:'), '120s (debounced)');
console.log(chalk.cyan('Session write throttle:'), '5s minimum\n');