require("dotenv").config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    WAMessageStubType,
    delay
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const {
    isPaired,
    cleanNumber,
    isMessagePaired
} = require("./config/pair-system");

const {
    isOwner
} = require("./config/owner-system");

/* 🤖 STACY AI */
const {
    askStacy
} = require("./config/stacy-ai");

/* 🔗 ANTI-LINK SYSTEM */
const {
    isAntiLinkEnabled,
    containsLink,
    isAdmin
} = require("./config/antilink-system");

/* 🗑️ DELETED MESSAGE SYSTEM */
const {
    isDeletedEnabled
} = require("./config/deleted-system");

const {
    cacheMessage,
    getCachedMessage,
    cleanupCache,
    getMediaDirectory,
    getMediaType,
    isViewOnceMessage
} = require("./config/deleted-cache");

/* 🟢 ONLINE SYSTEM */
const {
    isOnlineEnabled
} = require("./config/online-system");

/* 😴 SLEEP SYSTEM */
const {
    isSleeping
} = require("./config/sleep-system");

/* ============================= */
/* READLINE INTERFACE FOR PAIRING */
/* ============================= */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

/* ============================= */
/* COMMAND LOADER */
/* ============================= */

const commands = new Map();

const commandFolder =
    path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandFolder)) {

    if (!file.endsWith(".js")) {
        continue;
    }

    try {

        const command =
            require(
                path.join(
                    commandFolder,
                    file
                )
            );

        const name =
            file
                .replace(".js", "")
                .toLowerCase();

        commands.set(
            name,
            command
        );

        console.log(
            `✅ Loaded command: .${name}`
        );

    } catch (error) {

        console.error(
            `❌ Failed to load ${file}:`,
            error
        );
    }
}

/* ============================= */
/* NUMBER HELPERS */
/* ============================= */

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

/* ============================= */
/* PAIRED USER CHECK */
/* ============================= */

async function userIsPaired(
    message,
    sock
) {

    const numbers =
        getPossibleNumbers(message);

    if (
        numbers.some(
            number =>
                isPaired(number)
        )
    ) {

        return true;
    }

    return await isMessagePaired(
        message,
        sock
    );
}

/* ============================= */
/* NORMALIZE JID */
/* ============================= */

function normalizeBotJid(jid) {

    if (!jid) {
        return null;
    }

    if (
        jid.endsWith("@s.whatsapp.net") &&
        jid.includes(":")
    ) {

        const number =
            jid
                .split("@")[0]
                .split(":")[0];

        return (
            number +
            "@s.whatsapp.net"
        );
    }

    return jid;
}

/* ============================= */
/* LID → PHONE */
/* ============================= */

async function resolvePhoneJid(
    sock,
    jid
) {

    if (!jid) {
        return null;
    }

    if (
        jid.endsWith("@s.whatsapp.net")
    ) {

        return normalizeBotJid(
            jid
        );
    }

    if (
        jid.endsWith("@lid") &&
        sock?.signalRepository?.lidMapping
    ) {

        try {

            const phoneJid =
                await sock
                    .signalRepository
                    .lidMapping
                    .getPNForLID(jid);

            if (phoneJid) {

                return normalizeBotJid(
                    phoneJid
                );
            }

        } catch (error) {

            console.log(
                "⚠️ LID → phone lookup failed:",
                error.message
            );
        }
    }

    return null;
}

/* ============================= */
/* GET SENDER JID */
/* ============================= */

function getSenderJid(message) {

    return (
        message?.key?.participantAlt ||
        message?.key?.participant ||
        message?.key?.remoteJidAlt ||
        message?.key?.remoteJid ||
        ""
    );
}

/* ============================= */
/* GET SENDER NUMBER */
/* ============================= */

async function getSenderNumber(
    sock,
    message
) {

    const senderJid =
        getSenderJid(message);

    if (!senderJid) {
        return "Unknown";
    }

    const phoneJid =
        await resolvePhoneJid(
            sock,
            senderJid
        );

    if (phoneJid) {

        return (
            cleanNumber(
                phoneJid
            ) ||
            "Unknown"
        );
    }

    const number =
        cleanNumber(
            senderJid
        );

    return (
        number ||
        "Unknown"
    );
}

/* ============================= */
/* MESSAGE TEXT */
/* ============================= */

function getMessageText(message) {

    if (!message) {
        return "";
    }

    if (
        message.conversation
    ) {

        return message.conversation;
    }

    if (
        message.extendedTextMessage?.text
    ) {

        return message
            .extendedTextMessage
            .text;
    }

    if (
        message.imageMessage?.caption
    ) {

        return message
            .imageMessage
            .caption;
    }

    if (
        message.videoMessage?.caption
    ) {

        return message
            .videoMessage
            .caption;
    }

    if (
        message.documentMessage?.caption
    ) {

        return message
            .documentMessage
            .caption;
    }

    return "";
}

/* ============================= */
/* CHAT NAME */
/* ============================= */

async function getChatName(
    sock,
    jid
) {

    if (!jid) {
        return "Unknown Chat";
    }

    if (
        !jid.endsWith("@g.us")
    ) {

        return "Private Chat";
    }

    try {

        const metadata =
            await sock.groupMetadata(
                jid
            );

        return (
            metadata?.subject ||
            "Group Chat"
        );

    } catch {

        return "Group Chat";
    }
}

/* ============================= */
/* SAVE MEDIA */
/* ============================= */

async function saveDeletedMedia(
    sock,
    message
) {

    if (!message?.message) {
        return null;
    }

    const original =
        message.message;

    if (
        isViewOnceMessage(
            original
        )
    ) {

        console.log(
            "👁️ View Once skipped."
        );

        return null;
    }

    const mediaType =
        getMediaType(
            original
        );

    if (!mediaType) {
        return null;
    }

    try {

        const buffer =
            await downloadMediaMessage(
                message,
                "buffer",
                {},
                {
                    logger:
                        P({
                            level:
                                "silent"
                        }),

                    reuploadRequest:
                        sock.updateMediaMessage
                }
            );

        if (
            !buffer ||
            !Buffer.isBuffer(buffer)
        ) {

            console.log(
                "⚠️ Media download failed."
            );

            return null;
        }

        const mediaDir =
            getMediaDirectory();

        const id =
            message.key.id;

        let extension =
            "bin";

        if (
            mediaType === "image"
        ) {

            extension =
                "jpg";
        }

        if (
            mediaType === "video"
        ) {

            extension =
                "mp4";
        }

        if (
            mediaType === "audio"
        ) {

            extension =
                "ogg";
        }

        if (
            mediaType === "sticker"
        ) {

            extension =
                "webp";
        }

        if (
            mediaType === "document"
        ) {

            const fileName =
                original
                    .documentMessage
                    ?.fileName ||
                "document";

            const ext =
                path.extname(
                    fileName
                );

            extension =
                ext
                    ? ext.replace(
                        ".",
                        ""
                    )
                    : "bin";
        }

        const filePath =
            path.join(
                mediaDir,
                `${id}.${extension}`
            );

        fs.writeFileSync(
            filePath,
            buffer
        );

        console.log(
            `💾 Cached ${mediaType}: ${filePath}`
        );

        return {
            mediaPath:
                filePath,

            mediaType:
                mediaType
        };

    } catch (error) {

        console.error(
            "🔥 Media cache error:",
            error
        );

        return null;
    }
}

/* ============================= */
/* CACHE MESSAGE */
/* ============================= */

async function cacheIncomingMessage(
    sock,
    message
) {

    if (
        !isDeletedEnabled() ||
        !message?.message
    ) {

        return;
    }

    if (
        message.key?.fromMe
    ) {

        return;
    }

    if (
        message.message.protocolMessage
    ) {

        return;
    }

    if (
        isViewOnceMessage(
            message.message
        )
    ) {

        return;
    }

    const media =
        await saveDeletedMedia(
            sock,
            message
        );

    cacheMessage({

        key:
            message.key,

        message:
            message.message,

        mediaPath:
            media?.mediaPath ||
            null,

        mediaType:
            media?.mediaType ||
            null
    });
}

/* ============================= */
/* SEND DELETED MESSAGE */
/* ============================= */

async function handleDeletedMessage(
    sock,
    deletedKey
) {

    if (
        !isDeletedEnabled()
    ) {

        return;
    }

    if (
        !deletedKey?.id
    ) {

        return;
    }

    const cached =
        getCachedMessage(
            deletedKey
        );

    if (!cached) {

        console.log(
            "⚠️ Deleted message not found in cache:",
            deletedKey.id
        );

        return;
    }

    if (
        isViewOnceMessage(
            cached.message
        )
    ) {

        console.log(
            "👁️ View Once recovery skipped."
        );

        return;
    }

    let botJid =
        sock?.user?.id;

    if (!botJid) {

        console.log(
            "⚠️ Bot JID is unavailable."
        );

        return;
    }

    botJid =
        normalizeBotJid(
            botJid
        );

    console.log(
        "📤 DELETED MESSAGE DESTINATION:",
        botJid
    );

    const senderNumber =
        await getSenderNumber(
            sock,
            {
                key:
                    cached.key
            }
        );

    const chatJid =
        cached.key.remoteJid;

    const chatName =
        await getChatName(
            sock,
            chatJid
        );

    const text =
        getMessageText(
            cached.message
        );

    const mediaType =
        cached.mediaType;

    const mediaPath =
        cached.mediaPath;

    const receivedTime =
        new Date(
            cached.timestamp
        ).toLocaleString();

    const caption =
`╭━━〔 🗑️ DELETED MESSAGE 〕━━╮
┃
┃ 👤 From: ${senderNumber}
┃ 📍 Chat: ${chatName}
┃ 📦 Type: ${mediaType || "text"}
┃ 🕐 Received: ${receivedTime}
┃
${text ? `┃ 💬 ${text}\n┃` : "┃"}
╰━━━━━━━━━━━━━━━━━━━━╯`;

    if (
        mediaPath &&
        fs.existsSync(
            mediaPath
        )
    ) {

        try {

            const buffer =
                fs.readFileSync(
                    mediaPath
                );

            if (
                mediaType === "image"
            ) {

                await sock.sendMessage(
                    botJid,
                    {
                        image:
                            buffer,
                        caption:
                            caption
                    }
                );

            } else if (
                mediaType === "video"
            ) {

                await sock.sendMessage(
                    botJid,
                    {
                        video:
                            buffer,
                        caption:
                            caption
                    }
                );

            } else if (
                mediaType === "audio"
            ) {

                const audio =
                    cached
                        .message
                        ?.audioMessage;

                await sock.sendMessage(
                    botJid,
                    {
                        audio:
                            buffer,

                        mimetype:
                            audio?.mimetype ||
                            "audio/ogg; codecs=opus",

                        ptt:
                            audio?.ptt === true
                    }
                );

                await sock.sendMessage(
                    botJid,
                    {
                        text:
                            caption
                    }
                );

            } else if (
                mediaType === "document"
            ) {

                const document =
                    cached
                        .message
                        ?.documentMessage;

                await sock.sendMessage(
                    botJid,
                    {
                        document:
                            buffer,

                        mimetype:
                            document?.mimetype ||
                            "application/octet-stream",

                        fileName:
                            document?.fileName ||
                            "deleted-document",

                        caption:
                            caption
                    }
                );

            } else if (
                mediaType === "sticker"
            ) {

                await sock.sendMessage(
                    botJid,
                    {
                        sticker:
                            buffer
                    }
                );

                await sock.sendMessage(
                    botJid,
                    {
                        text:
                            caption
                    }
                );

            } else {

                await sock.sendMessage(
                    botJid,
                    {
                        text:
                            caption
                    }
                );
            }

            console.log(
                "✅ Deleted content sent to bot's own private chat."
            );

            return;

        } catch (error) {

            console.error(
                "🔥 Failed to send deleted media:",
                error
            );
        }
    }

    await sock.sendMessage(
        botJid,
        {
            text:
                caption
        }
    );

    console.log(
        "✅ Deleted message sent to bot's own private chat."
    );
}

/* ============================= */
/* 🤖 STACY SYSTEM */
/* ============================= */

const stacyConfigFile =
    path.join(
        __dirname,
        "config",
        "stacy.json"
    );

function isStacyEnabled() {

    try {

        if (
            !fs.existsSync(
                stacyConfigFile
            )
        ) {

            return false;
        }

        const config =
            JSON.parse(
                fs.readFileSync(
                    stacyConfigFile,
                    "utf8"
                )
            );

        return (
            config?.enabled === true
        );

    } catch (error) {

        console.error(
            "🔥 STACY CONFIG ERROR:",
            error
        );

        return false;
    }
}

/* ============================= */
/* STACY SENT MESSAGE MEMORY */
/* ============================= */

const stacyMessages =
    new Map();

/* ============================= */
/* STACY CONTEXT INFO */
/* ============================= */

function getStacyContextInfo(
    message
) {

    return (
        message?.extendedTextMessage?.contextInfo ||
        message?.imageMessage?.contextInfo ||
        message?.videoMessage?.contextInfo ||
        message?.documentMessage?.contextInfo ||
        message?.audioMessage?.contextInfo ||
        message?.stickerMessage?.contextInfo ||
        null
    );
}

/* ============================= */
/* STACY BOT IDENTITY HELPERS */
/* ============================= */

function getStacyBotJids(sock) {

    const ids = [];

    const candidates = [

        sock?.user?.id,

        sock?.user?.lid,

        sock?.user?.jid,

        sock?.user?.id?.split(":")[0] +
            "@s.whatsapp.net"
    ];

    for (
        const jid of candidates
    ) {

        if (
            typeof jid !== "string" ||
            !jid
        ) {
            continue;
        }

        if (
            !ids.includes(jid)
        ) {

            ids.push(jid);
        }

        const normalized =
            normalizeBotJid(
                jid
            );

        if (
            normalized &&
            !ids.includes(
                normalized
            )
        ) {

            ids.push(
                normalized
            );
        }
    }

    return ids;
}

/* ============================= */
/* STACY BOT MENTION CHECK */
/* ============================= */

async function isStacyMentioned(
    sock,
    message
) {

    const context =
        getStacyContextInfo(
            message?.message
        );

    const mentioned =
        context?.mentionedJid || [];

    console.log(
        "🤖 STACY MENTION CHECK"
    );

    console.log(
        "🤖 BOT IDS:",
        getStacyBotJids(sock)
    );

    console.log(
        "🤖 MENTIONED JIDS:",
        mentioned
    );

    if (
        !mentioned.length
    ) {

        console.log(
            "🤖 STACY: No mentions found."
        );

        return false;
    }

    const botJids =
        getStacyBotJids(
            sock
        );

    for (
        const mentionedJid of mentioned
    ) {

        const normalizedMention =
            normalizeBotJid(
                mentionedJid
            );

        console.log(
            "🤖 CHECKING:",
            mentionedJid,
            "→",
            normalizedMention
        );

        if (
            botJids.includes(
                mentionedJid
            ) ||
            botJids.includes(
                normalizedMention
            )
        ) {

            console.log(
                "✅ STACY MENTION MATCHED"
            );

            return true;
        }

        const resolvedMention =
            await resolvePhoneJid(
                sock,
                mentionedJid
            );

        console.log(
            "🤖 RESOLVED MENTION:",
            resolvedMention
        );

        if (
            resolvedMention
        ) {

            const normalizedResolved =
                normalizeBotJid(
                    resolvedMention
                );

            if (
                botJids.includes(
                    normalizedResolved
                )
            ) {

                console.log(
                    "✅ STACY MENTION MATCHED: LID → PHONE"
                );

                return true;
            }
        }

        for (
            const botJid of botJids
        ) {

            if (
                !botJid.endsWith(
                    "@lid"
                )
            ) {
                continue;
            }

            const resolvedBot =
                await resolvePhoneJid(
                    sock,
                    botJid
                );

            if (
                resolvedBot &&
                resolvedMention &&
                normalizeBotJid(
                    resolvedBot
                ) ===
                normalizeBotJid(
                    resolvedMention
                )
            ) {

                console.log(
                    "✅ STACY MENTION MATCHED: BOT LID ↔ MENTION LID"
                );

                return true;
            }
        }
    }

    console.log(
        "❌ STACY MENTION NOT MATCHED"
    );

    return false;
}

/* ============================= */
/* STACY REPLY CHECK */
/* ============================= */

function isReplyToStacy(
    message,
    chatJid
) {

    const context =
        getStacyContextInfo(
            message?.message
        );

    const quotedId =
        context?.stanzaId;

    if (!quotedId) {
        return false;
    }

    const stored =
        stacyMessages.get(
            quotedId
        );

    if (!stored) {
        return false;
    }

    return (
        stored.chatJid ===
        chatJid
    );
}

/* ============================= */
/* REMEMBER STACY MESSAGE */
/* ============================= */

function rememberStacyMessage(
    sentMessage,
    chatJid,
    text
) {

    const id =
        sentMessage?.key?.id;

    if (!id) {
        return;
    }

    stacyMessages.set(
        id,
        {
            chatJid,
            text
        }
    );

    if (
        stacyMessages.size > 100
    ) {

        const firstKey =
            stacyMessages
                .keys()
                .next()
                .value;

        if (firstKey) {

            stacyMessages.delete(
                firstKey
            );
        }
    }
}

/* ============================= */
/* STACY AI MESSAGE HANDLER */
/* ============================= */

async function handleStacy(
    sock,
    message,
    chatJid,
    text
) {

    console.log(
        "🤖 STACY HANDLER CHECK"
    );

    if (
        !chatJid?.endsWith("@g.us")
    ) {

        return false;
    }

    if (
        !isStacyEnabled()
    ) {

        console.log(
            "🤖 STACY: DISABLED"
        );

        return false;
    }

    if (
        message.key?.fromMe
    ) {

        return false;
    }

    if (
        text?.startsWith(".")
    ) {

        return false;
    }

    const mentioned =
        await isStacyMentioned(
            sock,
            message
        );

    const repliedToStacy =
        isReplyToStacy(
            message,
            chatJid
        );

    console.log(
        "🧪 STACY ENABLED:",
        isStacyEnabled()
    );

    console.log(
        "🧪 STACY MENTIONED:",
        mentioned
    );

    console.log(
        "🧪 STACY REPLIED TO:",
        repliedToStacy
    );

    console.log(
        "🧪 STACY TEXT:",
        text
    );

    if (
        !mentioned &&
        !repliedToStacy
    ) {

        return false;
    }

    let prompt =
        text?.trim() ||
        "The user mentioned you. Respond naturally.";

    if (
        repliedToStacy
    ) {

        const context =
            getStacyContextInfo(
                message?.message
            );

        const quotedId =
            context?.stanzaId;

        const previous =
            stacyMessages.get(
                quotedId
            );

        if (
            previous?.text
        ) {

            prompt =
`Previous message you sent:
"${previous.text}"

User's reply:
${prompt}

Respond naturally to the user's reply.`;
        }
    }

    const personLid =
        message?.key?.participantAlt ||
        message?.key?.participant ||
        message?.key?.remoteJidAlt ||
        message?.key?.remoteJid ||
        null;

    console.log(
        "🧠 STACY CURRENT PERSON LID:",
        personLid
    );

    try {

        console.log(
            "🤖 STACY: Sending prompt to Groq..."
        );

        const reply =
            await askStacy(
                prompt,
                [],
                chatJid,
                personLid
            );

        if (
            !reply ||
            !String(reply).trim()
        ) {

            console.log(
                "⚠️ STACY: AI returned an empty response."
            );

            return true;
        }

        const cleanReply =
            String(reply).trim();

        console.log(
            "🤖 STACY RESPONSE:",
            cleanReply
        );

        const sent =
            await sock.sendMessage(
                chatJid,
                {
                    text:
                        cleanReply
                },
                {
                    quoted:
                        message
                }
            );

        rememberStacyMessage(
            sent,
            chatJid,
            cleanReply
        );

        console.log(
            "🤖 STACY REPLIED"
        );

        if (personLid) {

            console.log(
                "🧠 STACY PERSON MEMORY KEY:",
                personLid
            );
        }

        return true;

    } catch (error) {

        console.error(
            "🔥 STACY AI ERROR:",
            error
        );

        return true;
    }
}

/* ============================= */
/* START BOT */
/* ============================= */

async function startBot() {

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            "./auth"
        );

    const sock =
        makeWASocket({

            auth:
                state,

            logger:
                P({
                    level:
                        "silent"
                }),

            printQRInTerminal:
                false // Disable QR output
        });

    global.primeNumbers =
        global.primeNumbers ||
        {};

    cleanupCache();

    setInterval(
        () => {

            cleanupCache();

        },
        60 * 60 * 1000
    );

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    /* ============================= */
    /* PAIRING CODE LOGIC */
    /* ============================= */

    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('\nEnter your WhatsApp phone number (with country code, e.g. 234123456789): ');
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        await delay(3000);

        try {
            const code = await sock.requestPairingCode(cleanPhone);
            console.log(`\n================================`);
            console.log(`YOUR PAIRING CODE IS: ${code}`);
            console.log(`================================\n`);
        } catch (error) {
            console.error('🔥 Failed to request pairing code:', error);
        }
    }

    /* ============================= */
    /* CONNECTION */
    /* ============================= */

    sock.ev.on(
        "connection.update",
        async update => {

            const {
                connection,
                lastDisconnect
            } = update;

            if (
                connection === "open"
            ) {

                console.log(
                    "\n╭━━━━━━━━━━━━━━━━━━━━╮"
                );

                console.log(
                    "┃   PRIME BOT ONLINE  ┃"
                );

                console.log(
                    "╰━━━━━━━━━━━━━━━━━━━━╯\n"
                );

                console.log(
                    "🤖 BOT JID:",
                    sock.user?.id
                );

                console.log(
                    "🤖 BOT LID:",
                    sock.user?.lid ||
                    "Not exposed"
                );

                rl.close();

                if (
                    isOnlineEnabled()
                ) {

                    try {

                        await sock.sendPresenceUpdate(
                            "available"
                        );

                        console.log(
                            "🟢 ONLINE MODE: ACTIVE"
                        );

                    } catch (error) {

                        console.log(
                            "⚠️ Could not set online presence:",
                            error.message
                        );
                    }

                } else {

                    try {

                        await sock.sendPresenceUpdate(
                            "unavailable"
                        );

                    } catch {}
                }
            }

            if (
                connection === "close"
            ) {

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

    /* ============================= */
    /* DELETED MESSAGE DETECTION */
    /* ============================= */

    sock.ev.on(
        "messages.update",
        async updates => {

            for (
                const update of updates
            ) {

                try {

                    const stubType =
                        update
                            ?.update
                            ?.messageStubType;

                    if (
                        stubType ===
                        WAMessageStubType.REVOKE
                    ) {

                        console.log(
                            "🗑️ MESSAGE DELETED:",
                            update
                                ?.key
                                ?.id
                        );

                        await handleDeletedMessage(
                            sock,
                            update.key
                        );
                    }

                } catch (error) {

                    console.error(
                        "🔥 Deleted message update error:",
                        error
                    );
                }
            }
        }
    );

    /* ============================= */
    /* INCOMING MESSAGES */
    /* ============================= */

    sock.ev.on(
        "messages.upsert",
        async ({
            messages,
            type,
            requestId
        }) => {

            console.log(
                "📦 UPSERT TYPE:",
                type,
                "MESSAGES:",
                messages.length,
                "REQUEST ID:",
                requestId ||
                "none"
            );

            for (
                const message of messages
            ) {

                try {

                    if (
                        !message?.message
                    ) {

                        continue;
                    }

                    const chatJid =
                        message
                            .key
                            .remoteJid;

                    /* ============================= */
                    /* CACHE — NON BLOCKING */
                    /* ============================= */

                    if (
                        isDeletedEnabled()
                    ) {

                        cacheIncomingMessage(
                            sock,
                            message
                        ).catch(error => {

                            console.error(
                                "🔥 Background deleted-message cache error:",
                                error
                            );

                        });

                    }

                    /* ============================= */
                    /* PROTOCOL */
                    /* ============================= */

                    if (
                        message
                            .message
                            .protocolMessage
                    ) {

                        continue;
                    }

                    const text =
                        getMessageText(
                            message.message
                        );

                    /* ========================= */
                    /* ANTI-LINK */
                    /* ========================= */

                    if (
                        chatJid?.endsWith(
                            "@g.us"
                        ) &&
                        isAntiLinkEnabled(
                            chatJid
                        ) &&
                        containsLink(
                            text
                        ) &&
                        !message.key.fromMe
                    ) {

                        try {

                            const metadata =
                                await sock
                                    .groupMetadata(
                                        chatJid
                                    );

                            const senderIsAdmin =
                                isAdmin(
                                    metadata,
                                    message
                                );

                            if (
                                !senderIsAdmin
                            ) {

                                console.log(
                                    "🚫 LINK DETECTED"
                                );

                                await sock.sendMessage(
                                    chatJid,
                                    {
                                        delete:
                                            message.key
                                    }
                                );

                                await sock.sendMessage(
                                    chatJid,
                                    {
                                        text:
`╭━━〔 🚫 ANTI-LINK 〕━━╮
┃
┃ ❌ Links are not allowed
┃    in this group.
┃
┃ ⚠️ Your message was removed.
┃
╰━━━━━━━━━━━━━━━━━━━━╯`
                                    }
                                );

                                console.log(
                                    "✅ Link message deleted."
                                );

                                continue;
                            }

                            console.log(
                                "👑 Admin link allowed."
                            );

                        } catch (error) {

                            console.error(
                                "🔥 Antilink error:",
                                error
                            );
                        }
                    }

                    /* ========================= */
                    /* DEBUG */
                    /* ========================= */

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
                        "UPSERT TYPE:",
                        type
                    );

                    console.log(
                        "━━━━━━━━━━━━━━━━━━━━"
                    );

                    /* ================================================= */
                    /* 💣 BOMB GAME MESSAGE ROUTING                     */
                    /* ================================================= */

                    const bombCommand =
                        commands.get("bomb");

                    if (
                        bombCommand &&
                        typeof bombCommand.handleText ===
                            "function"
                    ) {

                        const bombHandled =
                            await bombCommand.handleText({
                                sock,
                                jid: chatJid,
                                message,
                                text
                            });

                        if (bombHandled) {
                            continue;
                        }
                    }

                    /* ================================================= */
                    /* 🎯 GUESS GAME MESSAGE ROUTING                    */
                    /* ================================================= */

                    const guessCommand =
                        commands.get("guess");

                    if (
                        guessCommand &&
                        typeof guessCommand.handleJoin ===
                            "function"
                    ) {

                        const normalizedText =
                            text
                                .trim()
                                .toLowerCase();

                        if (
                            normalizedText ===
                            "join game"
                        ) {

                            await guessCommand.handleJoin(
                                sock,
                                message
                            );

                            continue;
                        }

                        if (
                            /^\d+$/.test(
                                normalizedText
                            )
                        ) {

                            const handled =
                                await guessCommand.handleGuess(
                                    sock,
                                    message
                                );

                            if (handled) {
                                continue;
                            }
                        }
                    }

                    /* ============================= */
                    /* VV2 STICKER ROUTING */
                    /* ============================= */

                    const vv2Sticker =
                        message
                            ?.message
                            ?.stickerMessage;

                    if (vv2Sticker) {

                        const vv2Command =
                            commands.get("vv2");

                        if (
                            vv2Command &&
                            typeof vv2Command ===
                                "function"
                        ) {

                            const owner =
                                await isOwner(
                                    message,
                                    sock
                                );

                            const paired =
                                await userIsPaired(
                                    message,
                                    sock
                                );

                            console.log(
                                "🔎 VV2 STICKER DETECTED"
                            );

                            console.log(
                                "👑 VV2 OWNER:",
                                owner
                            );

                            console.log(
                                "🔐 VV2 PAIRED:",
                                paired
                            );

                            if (
                                owner ||
                                paired
                            ) {

                                await vv2Command({
                                    sock,
                                    jid: chatJid,
                                    message,
                                    args: [],
                                    command: "vv2"
                                });

                                console.log(
                                    "✅ VV2 STICKER ROUTED"
                                );
                            }
                        }

                        continue;
                    }

                    /* ============================= */
                    /* 🤖 STACY AI ROUTING */
                    /* ============================= */

                    if (
                        !message.key?.fromMe &&
                        chatJid?.endsWith("@g.us") &&
                        !text.startsWith(".")
                    ) {

                        const stacyHandled =
                            await handleStacy(
                                sock,
                                message,
                                chatJid,
                                text
                            );

                        if (stacyHandled) {
                            continue;
                        }
                    }

                    /* ========================= */
                    /* COMMAND CHECK */
                    /* ========================= */

                    if (
                        !text.startsWith(".")
                    ) {

                        continue;
                    }

                    const parts =
                        text
                            .trim()
                            .split(/\s+/);

                    const command =
                        parts[0]
                            .slice(1)
                            .toLowerCase();

                    const args =
                        parts.slice(1);

                    const handler =
                        commands.get(
                            command
                        );

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

                    /* ========================= */
                    /* OWNER / PAIR CHECK */
                    /* ========================= */

                    const owner =
                        await isOwner(
                            message,
                            sock
                        );

                    const paired =
                        await userIsPaired(
                            message,
                            sock
                        );

                    console.log(
                        "👑 OWNER:",
                        owner
                    );

                    console.log(
                        "🔐 PAIRED:",
                        paired
                    );

                    /* ========================= */
                    /* OWNER-ONLY COMMANDS */
                    /* ========================= */

                    const ownerOnlyCommands = [
                        "pair",
                        "delpair",
                        "pairs",
                        "unpairall",
                        "deleted",
                        "online",
                        "wake"
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

                    /* ========================= */
                    /* PRIVATE ACCESS CHECK */
                    /* ========================= */

                    if (
                        !owner &&
                        !paired
                    ) {

                        console.log(
                            "🚫 USER NOT PAIRED"
                        );

                        continue;
                    }

                    /* ========================= */
                    /* 😴 SLEEP MODE */
                    /* ========================= */

                    if (
                        isSleeping() &&
                        command !== "status" &&
                        command !== "sleep" &&
                        command !== "wake"
                    ) {

                        await sock.sendMessage(
                            chatJid,
                            {
                                text:
`😴 *PRIME BOT IS SLEEPING*

Contact owner to wake up.`
                            }
                        );

                        continue;
                    }

                    console.log(
                        "🚀 RUNNING COMMAND:",
                        command
                    );

                    /* ========================= */
                    /* COMMAND REACTION */
                    /* ========================= */

                    await sock.sendMessage(
                        chatJid,
                        {
                            react: {
                                text:
                                    "⏳",

                                key:
                                    message.key
                            }
                        }
                    );

                    const result =
                        await handler({
                            sock,
                            jid:
                                chatJid,
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
                                text:
                                    result
                            }
                        );
                    }

                    /* ========================= */
                    /* REMOVE REACTION */
                    /* ========================= */

                    await sock.sendMessage(
                        chatJid,
                        {
                            react: {
                                text:
                                    "",

                                key:
                                    message.key
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

/* ============================= */
/* START */
/* ============================= */

startBot();
