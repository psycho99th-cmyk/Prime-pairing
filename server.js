import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pino from "pino";

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    delay
} from "@whiskeysockets/baileys";

import { fileURLToPath } from "url";


/* =========================================================
   BASIC SERVER SETUP
========================================================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const app =
    express();

const PORT =
    process.env.PORT || 3000;


/* =========================================================
   SESSION STORAGE
========================================================= */

const sessionsDirectory =
    path.join(
        __dirname,
        "sessions"
    );

if (
    !fs.existsSync(
        sessionsDirectory
    )
) {
    fs.mkdirSync(
        sessionsDirectory,
        {
            recursive: true
        }
    );
}


/*
 * Active sessions currently running
 * on this server.
 */
const activeSessions =
    new Map();


/* =========================================================
   EXPRESS
========================================================= */

app.use(
    express.json({
        limit: "1mb"
    })
);


/*
 * Allow the future Vercel frontend
 * to communicate with this backend.
 */
app.use(
    (req, res, next) => {

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

        if (
            req.method === "OPTIONS"
        ) {
            return res.sendStatus(200);
        }

        next();

    }
);


/* =========================================================
   HELPERS
========================================================= */

function cleanNumber(number) {

    return String(
        number || ""
    )
    .replace(
        /[^0-9]/g,
        ""
    );

}


function generateSessionId() {

    const random =
        crypto.randomBytes(
            12
        ).toString("hex");

    return (
        "PRIME-" +
        random.toUpperCase()
    );

}


/*
 * Remove sensitive information from
 * anything we print to the console.
 */
function maskNumber(number) {

    if (
        !number ||
        number.length < 7
    ) {
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

app.get(
    "/",
    (req, res) => {

        res.json({
            name:
                "PRIME Pairing API",

            status:
                "online",

            version:
                "1.0.0"
        });

    }
);


/* =========================================================
   CREATE PAIRING SESSION
========================================================= */

app.post(
    "/api/pair",
    async (req, res) => {

        try {

            const phoneNumber =
                cleanNumber(
                    req.body?.phoneNumber
                );


            /* ---------------------------------------------
               Validate number
            --------------------------------------------- */

            if (
                !phoneNumber ||
                phoneNumber.length < 10
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Please enter a valid WhatsApp number with country code."

                });

            }


            /*
             * Generate a completely unique
             * session ID for this user.
             */

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


            console.log(
                `📱 New pairing request: ${maskNumber(phoneNumber)}`
            );

            console.log(
                `🆔 Session: ${sessionId}`
            );


            /* ---------------------------------------------
               Create Baileys authentication state
            --------------------------------------------- */

            const {
                state,
                saveCreds
            } =
                await useMultiFileAuthState(
                    sessionPath
                );


            /* ---------------------------------------------
               Create WhatsApp socket
            --------------------------------------------- */

            const sock =
                makeWASocket({

                    auth:
                        state,

                    logger:
                        pino({
                            level:
                                "silent"
                        }),

                    printQRInTerminal:
                        false

                });


            /* ---------------------------------------------
               Session object
            --------------------------------------------- */

            const session = {

                id:
                    sessionId,

                phoneNumber:
                    phoneNumber,

                socket:
                    sock,

                status:
                    "connecting",

                pairingCode:
                    null,

                sessionSent:
                    false,

                createdAt:
                    Date.now()

            };


            activeSessions.set(
                sessionId,
                session
            );


            /* ---------------------------------------------
               Save credentials
            --------------------------------------------- */

            sock.ev.on(
                "creds.update",
                saveCreds
            );


            /* =================================================
               CONNECTION EVENTS
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

                    if (
                        connection ===
                        "open"
                    ) {

                        session.status =
                            "connected";


                        console.log(
                            `✅ WhatsApp connected: ${sessionId}`
                        );


                        /*
                         * Send the unique Session ID
                         * to the linked WhatsApp account.
                         */

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
                                `❌ Failed to send Session ID for ${sessionId}:`,
                                error.message
                            );

                        }

                    }


                    /* -----------------------------------------
                       CONNECTION CLOSED
                    ----------------------------------------- */

                    if (
                        connection ===
                        "close"
                    ) {

                        const statusCode =
                            lastDisconnect
                                ?.error
                                ?.output
                                ?.statusCode;


                        console.log(
                            `❌ Connection closed: ${sessionId}`
                        );


                        /*
                         * WhatsApp logged the account out.
                         */
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
                                `🗑️ Logged-out session removed: ${sessionId}`
                            );


                            return;
                        }


                        /*
                         * Temporary connection failure.
                         *
                         * We keep the session data on disk.
                         * The deployment/persistent-session
                         * system will handle restoration later.
                         */

                        session.status =
                            "disconnected";

                    }

                }
            );


            /* =================================================
               WAIT FOR WHATSAPP SOCKET
            ================================================= */

            await delay(
                3000
            );


            /* =================================================
               REQUEST PAIRING CODE
            ================================================= */

            const pairingCode =
                await sock.requestPairingCode(
                    phoneNumber
                );


            session.pairingCode =
                pairingCode;

            session.status =
                "waiting";


            console.log(
                `🔢 Pairing code generated for ${sessionId}`
            );


            /* =================================================
               SEND CODE TO WEBSITE
            ================================================= */

            return res.json({

                success:
                    true,

                sessionId:
                    sessionId,

                code:
                    pairingCode,

                status:
                    "waiting"

            });


        } catch (error) {

            console.error(
                "🔥 PAIRING ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to generate a pairing code right now."

            });

        }

    }
);


/* =========================================================
   CHECK SESSION STATUS
========================================================= */

app.get(
    "/api/pair/:sessionId",
    (req, res) => {

        const sessionId =
            req.params.sessionId;


        const session =
            activeSessions.get(
                sessionId
            );


        if (!session) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "Session not found."

            });

        }


        return res.json({

            success:
                true,

            sessionId:
                session.id,

            status:
                session.status,

            connected:
                session.status ===
                "connected",

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