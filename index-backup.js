const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const {
    isPaired,
    cleanNumber
} = require("./config/pair-system");

const {
    isOwner
} = require("./config/owner-system");

const {
    makeInMemoryStore
} = require("@whiskeysockets/baileys");

const commands = new Map();

const commandFolder = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandFolder)) {
    if (!file.endsWith(".js")) continue;

    try {
        const command = require(
            path.join(commandFolder, file)
        );

        const name = file
            .replace(".js", "")
            .toLowerCase();

        commands.set(name, command);

        console.log(`✅ Loaded command: .${name}`);
    } catch (error) {
        console.error(
            `❌ Failed to load ${file}:`,
            error
        );
    }
}

function getPossibleNumbers(message) {

    const values = [
        message?.key?.participant,
        message?.key?.participantAlt,
        message?.key?.remoteJid,
        message?.key?.remoteJidAlt
    ];

    const cached =
        global.primeNumbers || {};

    values.push(
        ...Object.keys(cached)
    );

    return values
        .filter(Boolean)
        .map(cleanNumber)
        .filter(Boolean);
}

function userIsPaired(message) {

    const numbers =
        getPossibleNumbers(message);

    return numbers.some(
        number => isPaired(number)
    );
}

async function startBot() {

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState("./auth");

    const sock = makeWASocket({
        auth: state,
        logger: P({
            level: "silent"
        }),
        printQRInTerminal: false
    });

    global.primeNumbers =
        global.primeNumbers || {};

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    sock.ev.on(
        "connection.update",
        update => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {
                console.log(
                    "\n📱 Scan this QR code:\n"
                );

                qrcode.generate(
                    qr,
                    {
                        small: true
                    }
                );
            }

            if (connection === "open") {
                console.log(
                    "\n╭━━━━━━━━━━━━━━━━━━━━╮"
                );
                console.log(
                    "┃   PRIME BOT ONLINE  ┃"
                );
                console.log(
                    "╰━━━━━━━━━━━━━━━━━━━━╯\n"
                );
            }

            if (connection === "close") {

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    "❌ Connection closed:",
                    statusCode
                );

                if (
                    statusCode !==
                    DisconnectReason.loggedOut
                ) {
                    startBot();
                }
            }
        }
    );

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            for (const message of messages) {

                try {

                    if (!message?.message) {
                        continue;
                    }

                    const chatJid =
                        message.key.remoteJid;

                    const text =
                        message.message
                            ?.conversation ||
                        message.message
                            ?.extendedTextMessage
                            ?.text ||
                        "";

                    console.log(
                        "\n━━━━━━━━━━━━━━━━━━━━"
                    );

                    console.log(
                        "📩 MESSAGE RECEIVED"
                    );

                    console.log(
                        "JID:",
                        chatJid
                    );

                    console.log(
                        "FROM:",
                        message.key.participant ||
                        message.key.remoteJid
                    );

                    console.log(
                        "TEXT:",
                        text
                    );

                    console.log(
                        "FROM ME:",
                        message.key.fromMe
                    );

                    console.log(
                        "━━━━━━━━━━━━━━━━━━━━"
                    );

                    if (
                        !text.startsWith(".")
                    ) {
                        continue;
                    }

                    const parts =
                        text.trim().split(/\s+/);

                    const command =
                        parts[0]
                            .slice(1)
                            .toLowerCase();

                    const args =
                        parts.slice(1);

                    const handler =
                        commands.get(command);

                    console.log(
                        "🔎 COMMAND:",
                        command
                    );

                    console.log(
                        "🔎 HANDLER FOUND:",
                        !!handler
                    );

                    if (!handler) {
                        continue;
                    }

                    const owner =
                        isOwner(
                            message,
                            sock
                        );

                    const paired =
                        userIsPaired(
                            message
                        );

                    console.log(
                        "👑 OWNER:",
                        owner
                    );

                    console.log(
                        "🔐 PAIRED:",
                        paired
                    );

                    const ownerOnlyCommands = [
                        "pair",
                        "delpair",
                        "pairs",
                        "unpairall"
                    ];

                    if (
                        ownerOnlyCommands.includes(
                            command
                        ) &&
                        !owner
                    ) {
                        await sock.sendMessage(
                            chatJid,
                            {
                                text:
                                    "⛔ *Only owner can use this command.*"
                            }
                        );

                        continue;
                    }

                    if (
                        !owner &&
                        !paired
                    ) {
                        console.log(
                            "🚫 USER NOT PAIRED"
                        );

                        continue;
                    }

                    console.log(
                        "🚀 RUNNING COMMAND:",
                        command
                    );

                    await sock.sendMessage(
                        chatJid,
                        {
                            react: {
                                text: "⏳",
                                key: message.key
                            }
                        }
                    );

                    const result =
                        await handler({
                            sock,
                            jid: chatJid,
                            message,
                            args,
                            command
                        });

                    console.log(
                        "📤 COMMAND RESULT:",
                        result
                    );

                    if (result) {

                        await sock.sendMessage(
                            chatJid,
                            {
                                text: result
                            }
                        );
                    }

                    await sock.sendMessage(
                        chatJid,
                        {
                            react: {
                                text: "",
                                key: message.key
                            }
                        }
                    );

                } catch (error) {

                    console.error(
                        "🔥 MESSAGE HANDLER ERROR:",
                        error
                    );
                }
            }
        }
    );
}

startBot();
