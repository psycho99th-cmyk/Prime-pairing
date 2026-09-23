const {
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const webpmux = require("node-webpmux");

const tempDir =
    path.join(__dirname, "..", "temp");

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
        recursive: true
    });
}


/*
 * =========================
 * DOWNLOAD MEDIA
 * =========================
 */

async function downloadMedia(message, type) {

    const stream =
        await downloadContentFromMessage(
            message,
            type
        );

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}


/*
 * =========================
 * CONVERT TO STICKER
 * =========================
 *
 * Keeps the original aspect ratio.
 *
 * No padding.
 * No white background.
 * No stretching.
 *
 * The image is scaled so its
 * largest side is 512px.
 */

function convertToSticker(input, output) {

    return new Promise((resolve, reject) => {

        const ffmpeg =
            spawn("ffmpeg", [
                "-y",

                "-i",
                input,

                "-vf",
                "scale=512:512:force_original_aspect_ratio=decrease",

                "-c:v",
                "libwebp",

                "-lossless",
                "0",

                "-q:v",
                "75",

                "-compression_level",
                "6",

                output
            ]);


        let error = "";

        ffmpeg.stderr.on(
            "data",
            data => {
                error += data.toString();
            }
        );


        ffmpeg.on(
            "close",
            code => {

                if (code === 0) {

                    resolve();

                } else {

                    reject(
                        new Error(error)
                    );

                }

            }
        );

    });

}


/*
 * =========================
 * CREATE WHATSAPP STICKER EXIF
 * =========================
 */

function createExif(packName, publisher) {

    const json =
        JSON.stringify({
            "sticker-pack-id":
                "com.primebot.stickers",

            "sticker-pack-name":
                packName,

            "sticker-pack-publisher":
                publisher,

            "emojis": [
                "🤖"
            ]
        });


    const exifHeader =
        Buffer.from([
            0x49, 0x49,
            0x2A, 0x00,
            0x08, 0x00,
            0x00, 0x00,
            0x01, 0x00,
            0x41, 0x57,
            0x07, 0x00,
            0x01, 0x00,
            0x00, 0x00,
            0x16, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00
        ]);


    return Buffer.concat([
        exifHeader,
        Buffer.from(json)
    ]);
}


/*
 * =========================
 * ADD STICKER METADATA
 * =========================
 */

async function addMetadata(filePath) {

    const image =
        new webpmux.Image();

    await image.load(filePath);


    const exif =
        createExif(
            "PRIME BOT",
            "STƎEZE"
        );


    image.exif =
        exif;


    await image.save(filePath);
}


/*
 * =========================
 * STICKER COMMAND
 * =========================
 */

module.exports = async ({
    sock,
    jid,
    message
}) => {

    try {

        /*
         * =========================
         * GET QUOTED MESSAGE
         * =========================
         */

        const context =
            message.message
                ?.extendedTextMessage
                ?.contextInfo;


        const quoted =
            context?.quotedMessage;


        if (!quoted) {

            return `❌ Reply to an image.

Example:

Reply to an image
.sticker`;

        }


        /*
         * =========================
         * CHECK IMAGE
         * =========================
         */

        if (!quoted.imageMessage) {

            return "❌ Please reply to an image.";

        }


        /*
         * =========================
         * DOWNLOAD IMAGE
         * =========================
         */

        const buffer =
            await downloadMedia(
                quoted.imageMessage,
                "image"
            );


        /*
         * =========================
         * CREATE UNIQUE FILE ID
         * =========================
         */

        const id =
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`;


        const input =
            path.join(
                tempDir,
                `${id}.jpg`
            );


        const output =
            path.join(
                tempDir,
                `${id}.webp`
            );


        fs.writeFileSync(
            input,
            buffer
        );


        /*
         * =========================
         * CONVERT
         * =========================
         */

        await convertToSticker(
            input,
            output
        );


        /*
         * =========================
         * ADD METADATA
         * =========================
         */

        await addMetadata(
            output
        );


        /*
         * =========================
         * SEND STICKER
         * =========================
         */

        await sock.sendMessage(
            jid,
            {
                sticker:
                    fs.readFileSync(
                        output
                    )
            }
        );


        /*
         * =========================
         * CLEAN UP
         * =========================
         */

        try {

            fs.unlinkSync(
                input
            );

        } catch {}


        try {

            fs.unlinkSync(
                output
            );

        } catch {}


        return null;


    } catch (error) {

        console.error(
            "Sticker error:",
            error
        );


        return "❌ Failed to create sticker.";

    }

};
