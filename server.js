const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');
const archiver = require('archiver');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const BOT_DIR = __dirname; // bot files live next to server.js

// Left out of the zip: pairing-server files, session data and secrets
const ZIP_IGNORE = [
    'server.js',
    'package.json',
    'package-lock.json',
    'node_modules/**',
    'sessions/**',
    'auth/**',
    '.git/**',
    '.env'
];

const CODE_WAIT_MS = 5 * 60 * 1000;      // time to enter the code in WhatsApp
const DOWNLOAD_WAIT_MS = 10 * 60 * 1000; // time to download after linking
const MAX_SESSIONS = 30;                 // protects the free Render instance

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Remove leftovers from any previous run
fs.emptyDirSync(SESSIONS_DIR);

const sessions = new Map();

/* ---------- helpers ---------- */

const hits = new Map();
function rateLimited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    const limited = list.length >= 5; // 5 codes per 10 minutes per IP
    if (!limited) list.push(now);
    hits.set(ip, list);
    return limited;
}

function destroySession(id) {
    const s = sessions.get(id);
    if (!s) return;
    s.closed = true;
    try { s.socket?.end(); } catch {}
    fs.remove(s.dir).catch(() => {});
    sessions.delete(id);
    console.log(`[${id.slice(0, 6)}] session cleaned up`);
}

async function connect(id) {
    const s = sessions.get(id);
    if (!s || s.closed) return null;

    const { state, saveCreds } = await useMultiFileAuthState(s.dir);
    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    s.socket = socket;
    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (s.closed || s.status === 'connected') return;

        if (connection === 'open') {
            // Give Baileys a few seconds to write all auth files before zipping
            setTimeout(() => {
                if (s.closed || s.status !== 'pending') return;
                s.status = 'connected';
                s.expiresAt = Date.now() + DOWNLOAD_WAIT_MS;
                console.log(`[${id.slice(0, 6)}] linked`);
            }, 4000);
            return;
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            // WhatsApp restarts the socket right after pairing: reconnect
            if (code === DisconnectReason.restartRequired && s.retries < 5) {
                s.retries += 1;
                connect(id).catch(() => { s.status = 'failed'; });
            } else {
                s.status = 'failed';
            }
        }
    });

    return { socket, state };
}

// Sweep expired sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
        if (now > s.expiresAt) destroySession(id);
    }
}, 60 * 1000);

/* ---------- routes ---------- */

app.get('/', (req, res) => res.send('PRIME BOT pairing server is running'));
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.post('/api/request-code', async (req, res) => {
    const phone = String(req.body?.phoneNumber || '').replace(/[^0-9]/g, '');

    if (phone.length < 8 || phone.length > 15) {
        return res.status(400).json({
            success: false,
            message: 'Enter a valid number with country code, e.g. 234123456789.'
        });
    }
    if (rateLimited(req.ip)) {
        return res.status(429).json({
            success: false,
            message: 'Too many attempts. Wait a few minutes and try again.'
        });
    }
    if (sessions.size >= MAX_SESSIONS) {
        return res.status(503).json({
            success: false,
            message: 'Server is busy. Try again in a few minutes.'
        });
    }

    const id = crypto.randomBytes(16).toString('hex'); // unguessable
    sessions.set(id, {
        status: 'pending',
        dir: path.join(SESSIONS_DIR, id),
        socket: null,
        closed: false,
        retries: 0,
        expiresAt: Date.now() + CODE_WAIT_MS
    });

    try {
        const { socket, state } = await connect(id);

        if (state.creds.registered) {
            destroySession(id);
            return res.status(400).json({ success: false, message: 'Number is already registered.' });
        }

        await delay(2000); // let the socket handshake first
        const code = await socket.requestPairingCode(phone);

        return res.json({
            success: true,
            code,
            sessionId: id,
            expiresIn: CODE_WAIT_MS / 1000
        });
    } catch (error) {
        console.error('Error requesting pairing code:', error);
        destroySession(id);
        return res.status(500).json({ success: false, message: 'Failed to generate code. Try again.' });
    }
});

app.get('/api/check-status/:sessionId', (req, res) => {
    const s = sessions.get(req.params.sessionId);
    if (!s) return res.json({ status: 'not_found' });
    return res.json({ status: s.status });
});

app.get('/api/download/:sessionId', (req, res) => {
    const id = req.params.sessionId;
    const s = sessions.get(id);

    if (!s || s.status !== 'connected') {
        return res.status(400).send('Session not authenticated or expired.');
    }

    res.attachment('Prime_Bot-v1.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
        console.error('Zip error:', err);
        res.end();
    });
    archive.pipe(res);

    // Your bot reads its login from ./auth
    archive.directory(s.dir, 'auth');

    // All bot files (commands, config, index.js, ...) except the ignored ones
    archive.glob('**/*', {
        cwd: BOT_DIR,
        dot: true,
        ignore: ZIP_IGNORE
    });

    res.on('finish', () => setTimeout(() => destroySession(id), 5000));
    archive.finalize();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
