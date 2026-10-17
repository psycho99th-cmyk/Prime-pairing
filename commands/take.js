// commands/take.js
// Usage: reply to a sticker with  .take <name>   or   .take <name> | <author>

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const webp = require("node-webpmux");
const crypto = require("crypto");
const P = require("pino");

function buildExif(pack, author) {
    const json = {
        "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
        "sticker-pack-name": pack,
        "sticker-pack-publisher": author,
        emojis: []
    };

    const header = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
        0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00,
        0x00, 0x00
    ]);

    const body = Buffer.from(JSON.stringify(json), "utf8");
    const exif = Buffer.concat([header, body]);
    exif.writeUIntLE(body.length, 14, 4);
    return exif;
}

module.exports = async ({ sock, jid, message, args }) => {
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = ctx?.quotedMessage;

    if (!quotedMsg?.stickerMessage) {
        return "❌ Reply to a sticker with *.take <name>*";
    }

    const [packRaw, authorRaw] = args.join(" ").split("|");
    const pack = (packRaw || "").trim();
    const author = (authorRaw || "").trim();

    if (!pack) {
        return "❌ Usage: reply to a sticker with *.take <name>*";
    }

    try {
        const buffer = await downloadMediaMessage(
            {
                key: {
                    remoteJid: jid,
                    id: ctx.stanzaId,
                    participant: ctx.participant
                },
                message: quotedMsg
            },
            "buffer",
            {},
            {
                logger: P({ level: "silent" }),
                reuploadRequest: sock.updateMediaMessage
            }
        );

        const img = new webp.Image();
        await img.load(buffer);
        img.exif = buildExif(pack, author);
        const output = await img.save(null);

        await sock.sendMessage(jid, { sticker: output }, { quoted: message });
    } catch (error) {
        console.error("🔥 TAKE ERROR:", error);
        return "❌ Failed to rename the sticker.";
    }
};
