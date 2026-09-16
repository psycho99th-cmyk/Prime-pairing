import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pino from "pino";

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from "@whiskeysockets/baileys";

import { fileURLToPath } from "url";


/* =========================================================
   BASIC SERVER SETUP
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;


/* =========================================================
   SESSION STORAGE
========================================================= */

const sessionsDirectory =
    path.join(__dirname, "sessions");

if (!fs.existsSync(sessionsDirectory)) {
    fs.mkdirSync(sessionsDirectory, {
        recursive: true
    });
}

const activeSessions = new Map();


/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({
    limit: "1mb"
}));


app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();

});


/* =========================================================
   HELPERS
========================================================= */

function cleanNumber(number) {

    return String(number || "")
        .replace(/[^0-9]/g, "");

}


function generateSessionId() {

    const random =
        crypto.randomBytes(12).toString("hex");

    return "PRIME-" + random.toUpperCase();

}


function maskNumber(number) {

    if (!number || number.length < 7) {
        return "********";
    }

    return (
        number.slice(0, 3) +
        "****" +
        number.slice(-3)
    );

}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({
        name: "PRIME Pairing API",
        status: "online",
        version: "1.0.0"
    });

});


/* =========================================================
   CREATE PAIRING SESSION
========================================================= */

app.post("/api/pair", async (req, res) => {

    try {

        const phoneNumber =
            cleanNumber(
                req.body?.phoneNumber
            );


        /* ---------------------------------------------
           VALIDATE NUMBER
        --------------------------------------------- */

        if (
            !phoneNumber ||
            phoneNumber.length < 10
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid WhatsApp number with country code."

            });

        }


        /* ---------------------------------------------
           CREATE SESSION
        --------------------------------------------- */

        const sessionId =
            generateSessionId();

        const sessionPath =
            path.join(
                sessionsDirectory,
                sessionId
            );


        fs.mkdirSync(
            sessionPath,
            {
                recursive: true
            }
        );


        console.log("");
        console.log(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        );

        console.log(
            `📱 Pairing request: ${maskNumber(phoneNumber)}`
        );

        console.log(
            `🆔 Session: ${sessionId}`
        );


        /* ---------------------------------------------
           AUTH STATE
        --------------------------------------------- */

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(
            sessionPath
        );


        /* ---------------------------------------------
           CREATE SOCKET
        --------------------------------------------- */

        const sock =
            makeWASocket({

                auth: state,

                logger:
                    pino({
                        level: "silent"
                    }),

                printQRInTerminal: false

            });


        /* ---------------------------------------------
           SESSION
        --------------------------------------------- */

        const session = {

            id: sessionId,

            phoneNumber,

            socket: sock,

            status: "connecting",

            pairingCode: null,

            sessionSent: false,

            createdAt: Date.now()

        };


        activeSessions.set(
            sessionId,
            session
        );


        /* ---------------------------------------------
           SAVE CREDENTIALS
        --------------------------------------------- */

        sock.ev.on(
            "creds.update",
            saveCreds
        );


        /* =================================================
           CONNECTION UPDATE
        ================================================= */

        sock.ev.on(
            "connection.update",
            async (update) => {

                const {
                    connection,
                    lastDisconnect
                } = update;


                /* -----------------------------------------
                   CONNECTED
                ----------------------------------------- */

                if (connection === "open") {

                    session.status =
                        "connected";


                    console.log("");
                    console.log(
                        `✅ WHATSAPP CONNECTED`
                    );

                    console.log(
                        `🆔 ${sessionId}`
                    );


                    /* -------------------------------------
                       SEND SESSION ID
                    ------------------------------------- */

                    try {

                        const userJid =
                            `${phoneNumber}@s.whatsapp.net`;


                        await sock.sendMessage(
                            userJid,
                            {
                                text:
`╭━━━〔 ⚡ PRIME BOT 〕━━━╮
┃
┃ ✅ *PAIRING SUCCESSFUL*
┃
┃ Your WhatsApp account is
┃ now connected to PRIME.
┃
┃ 🆔 *SESSION ID*
┃
┃ ${sessionId}
┃
┃ 🔒 Keep this Session ID private.
┃
┃ You will need it when deploying
┃ PRIME BOT on your hosting panel.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

⚡ *PRIME BOT*
Private • Fast • Secure`
                            }
                        );


                        session.sessionSent =
                            true;


                        console.log(
                            `📩 Session ID sent: ${sessionId}`
                        );


                    } catch (error) {

                        console.error(
                            "❌ SESSION MESSAGE ERROR:",
                            error.message
                        );

                    }

                }


                /* -----------------------------------------
                   CONNECTION CLOSED
                ----------------------------------------- */

                if (connection === "close") {

                    const statusCode =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;


                    console.log("");
                    console.log(
                        "❌ WHATSAPP CONNECTION CLOSED"
                    );

                    console.log(
                        `🆔 Session: ${sessionId}`
                    );

                    console.log(
                        `📛 Status Code: ${statusCode}`
                    );


                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {

                        session.status =
                            "logged_out";

                        activeSessions.delete(
                            sessionId
                        );

                        console.log(
                            "🗑️ Session logged out."
                        );

                        return;
                    }


                    session.status =
                        "disconnected";


                    console.log(
                        "⚠️ Temporary connection failure."
                    );

                }

            }
        );


        /* =================================================
           WAIT FOR SOCKET TO BECOME READY
        ================================================= */

        await new Promise(
            (resolve, reject) => {

                let settled = false;


                const timeout =
                    setTimeout(() => {

                        if (settled) {
                            return;
                        }

                        settled = true;

                        reject(
                            new Error(
                                "WhatsApp socket did not become ready in time."
                            )
                        );

                    }, 30000);


                const checkConnection =
                    (update) => {

                        const {
                            connection
                        } = update;


                        if (
                            connection ===
                            "open"
                        ) {

                            return;

                        }


                        /*
                         * The socket has received its
                         * initial connection information.
                         *
                         * At this point Baileys can
                         * request the pairing code.
                         */

                        if (
                            update.qr ||
                            update.isNewLogin ||
                            connection === "connecting"
                        ) {

                            if (!settled) {

                                settled = true;

                                clearTimeout(
                                    timeout
                                );

                                sock.ev.off(
                                    "connection.update",
                                    checkConnection
                                );

                                resolve();

                            }

                        }

                    };


                sock.ev.on(
                    "connection.update",
                    checkConnection
                );

            }
        );


        /* =================================================
           REQUEST PAIRING CODE
        ================================================= */

        console.log(
            "🔢 Requesting WhatsApp pairing code..."
        );


        const pairingCode =
            await sock.requestPairingCode(
                phoneNumber
            );


        session.pairingCode =
            pairingCode;

        session.status =
            "waiting";


        console.log(
            `✅ Pairing code generated: ${sessionId}`
        );


        /* =================================================
           RESPONSE
        ================================================= */

        return res.json({

            success: true,

            sessionId,

            code: pairingCode,

            status: "waiting"

        });


    } catch (error) {

        console.error("");
        console.error(
            "🔥 PAIRING ERROR:"
        );

        console.error(
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to generate a pairing code right now.",

            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined

        });

    }

});


/* =========================================================
   SESSION STATUS
========================================================= */

app.get(
    "/api/pair/:sessionId",
    (req, res) => {

        const session =
            activeSessions.get(
                req.params.sessionId
            );


        if (!session) {

            return res.status(404).json({

                success: false,

                message:
                    "Session not found."

            });

        }


        return res.json({

            success: true,

            sessionId:
                session.id,

            status:
                session.status,

            connected:
                session.status === "connected",

            sessionSent:
                session.sessionSent

        });

    }
);


/* =========================================================
   SERVER START
========================================================= */

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "╭━━━━━━━━━━━━━━━━━━━━━━━━╮"
        );

        console.log(
            "┃   ⚡ PRIME PAIRING API  ┃"
        );

        console.log(
            "╰━━━━━━━━━━━━━━━━━━━━━━━━╯"
        );

        console.log("");

        console.log(
            `🌐 Port: ${PORT}`
        );

        console.log(
            "🟢 Status: Online"
        );

        console.log(
            "🔢 Pairing: WhatsApp Code"
        );

        console.log(
            "🔒 Sessions: Isolated"
        );

        console.log("");

    }
);