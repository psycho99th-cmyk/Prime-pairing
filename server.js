const express = require('express');
const cors = require('cors');
const path = require('path');
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

app.use(cors());
app.use(express.json());

// In-memory store for tracking active pairing sessions
const activeSessions = new Map();

/**
 * Route: Request Pairing Code
 * Receives phone number, spins up Baileys socket, and returns pairing code.
 */
app.post('/api/request-code', async (req, res) => {
    let { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    // Clean phone number format (remove +, spaces, or dashes)
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    const sessionId = `session_${Date.now()}`;
    const sessionDir = path.join(__dirname, 'sessions', sessionId);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04']
        });

        socket.ev.on('creds.update', saveCreds);

        // Track session status
        activeSessions.set(sessionId, {
            status: 'pending',
            dir: sessionDir,
            socket: socket
        });

        // Delay slight tick to ensure socket handshakes before requesting code
        await delay(2000);

        if (!socket.authState.creds.registered) {
            const pairingCode = await socket.requestPairingCode(phoneNumber);

            // Listen for successful authentication
            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log(`[${sessionId}] Connection opened successfully.`);
                    const session = activeSessions.get(sessionId);
                    if (session) {
                        session.status = 'connected';
                    }
                } else if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (!shouldReconnect) {
                        console.log(`[${sessionId}] Session closed or logged out.`);
                    }
                }
            });

            return res.json({
                success: true,
                code: pairingCode,
                sessionId: sessionId
            });
        } else {
            return res.status(400).json({ success: false, message: 'Number is already registered.' });
        }

    } catch (error) {
        console.error('Error requesting pairing code:', error);
        // Clean up directory on failure
        fs.removeSync(sessionDir);
        return res.status(500).json({ success: false, message: 'Failed to generate code.' });
    }
});

/**
 * Route: Check Session Status
 * Polled by frontend every 3 seconds to check if device completed pairing.
 */
app.get('/api/check-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session) {
        return res.json({ status: 'not_found' });
    }

    return res.json({ status: session.status });
});

/**
 * Route: Auto-Download Bot Zip
 * Triggers ZIP download containing session credentials and bot core files.
 */
app.get('/api/download/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session || session.status !== 'connected') {
        return res.status(400).send('Session not authenticated or expired.');
    }

    const zipFileName = `PRIME_BOT_${sessionId}.zip`;
    res.attachment(zipFileName);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // 1. Pack session auth folder into zip
    archive.directory(session.dir, 'session');

    // 2. Pack core bot files (e.g., commands, index.js, package.json) if present
    const botCorePath = path.join(__dirname, 'bot-files');
    if (fs.existsSync(botCorePath)) {
        archive.directory(botCorePath, false);
    }

    await archive.finalize();

    // Clean up memory and temp session files after download stream completes
    res.on('finish', () => {
        setTimeout(() => {
            try {
                if (session.socket) session.socket.end();
                fs.removeSync(session.dir);
                activeSessions.delete(sessionId);
                console.log(`[${sessionId}] Cleaned up session files.`);
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        }, 5000);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
