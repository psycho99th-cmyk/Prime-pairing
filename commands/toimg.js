const {
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
 * CONVERT WEBP → PNG
 * =========================
 */

function convertToImage(input, output) {

    return new Promise((resolve, reject) => {

        const ffmpeg =
            spawn("ffmpeg", [
                "-y",
                "-i",
                input,
                "-frames:v",
                "1",
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
 * COMMAND
 * =========================
 */

module.exports = async ({
    sock,
    jid,
    message
}) => {

    try {

        /*
         * GET REPLIED MESSAGE
         */

        const context =
            message.message
                ?.extendedTextMessage
                ?.contextInfo;

        const quoted =
            context?.quotedMessage;


        if (!quoted) {

            return `❌ Reply to a sticker.

Example:

Reply to a sticker
.toimg`;
        }


        /*
         * CHECK STICKER
         */

        if (!quoted.stickerMessage) {

            return "❌ The replied message is not a sticker.";
        }


        /*
         * DOWNLOAD STICKER
         */

        const buffer =
            await downloadMedia(
                quoted.stickerMessage,
                "sticker"
            );


        const id =
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`;


        const input =
            path.join(
                tempDir,
                `${id}.webp`
            );

        const output =
            path.join(
                tempDir,
                `${id}.png`
            );


        fs.writeFileSync(
            input,
            buffer
        );


        /*
         * CONVERT
         */

        await convertToImage(
            input,
            output
        );


        /*
         * SEND IMAGE
         */

        await sock.sendMessage(
            jid,
            {
                image:
                    fs.readFileSync(
                        output
                    )
            }
        );


        /*
         * CLEAN UP
         */

        try {
            fs.unlinkSync(input);
        } catch {}

        try {
            fs.unlinkSync(output);
        } catch {}


        return null;


    } catch (error) {

        console.error(
            "ToImg error:",
            error
        );

        return "❌ Failed to convert the sticker.";
    }
};
