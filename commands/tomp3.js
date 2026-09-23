const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const {
    downloadMediaMessage
} = require("@whiskeysockets/baileys");

const P = require("pino");

const execFileAsync = promisify(execFile);


function getContextInfo(message) {
    return (
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        null
    );
}


function getQuotedMessage(message) {
    return getContextInfo(message)?.quotedMessage;
}


function getQuotedKey(message) {
    return getContextInfo(message)?.stanzaId;
}


function getQuotedParticipant(message) {
    const context = getContextInfo(message);

    return (
        context?.participant ||
        context?.participantAlt ||
        null
    );
}


async function downloadVideo({
    sock,
    jid,
    message,
    quoted,
    participant
}) {
    const quotedId = getQuotedKey(message);

    if (!quotedId) {
        throw new Error("Quoted video ID is missing.");
    }

    const quotedWAMessage = {
        key: {
            remoteJid: jid,
            id: quotedId,
            participant: participant || undefined,
            fromMe: false
        },

        message: quoted
    };

    console.log("TOMP3: Downloading video...");

    const buffer = await downloadMediaMessage(
        quotedWAMessage,
        "buffer",
        {},
        {
            logger: P({
                level: "silent"
            }),

            reuploadRequest:
                sock.updateMediaMessage
        }
    );

    if (!Buffer.isBuffer(buffer)) {
        throw new Error("Invalid video buffer.");
    }

    console.log(
        "TOMP3: Video downloaded:",
        buffer.length,
        "bytes"
    );

    return buffer;
}


async function convertToMP3(inputPath, outputPath) {
    console.log("TOMP3: Converting audio to MP3...");

    await execFileAsync(
        "ffmpeg",
        [
            "-y",

            "-i",
            inputPath,

            "-vn",

            "-c:a",
            "libmp3lame",

            "-b:a",
            "320k",

            "-ar",
            "48000",

            "-map_metadata",
            "-1",

            outputPath
        ],
        {
            maxBuffer: 1024 * 1024 * 5
        }
    );

    console.log("TOMP3: Conversion complete.");
}


module.exports = async ({
    sock,
    jid,
    message
}) => {

    const quoted = getQuotedMessage(message);

    if (!quoted?.videoMessage) {
        return (
            "INVALID MEDIA\n\n" +
            "Reply to a video with:\n\n" +
            ".tomp3"
        );
    }

    const video = quoted.videoMessage;

    if (video.viewOnce === true) {
        return (
            "VIEW-ONCE VIDEO\n\n" +
            "View-once videos are not supported."
        );
    }

    const participant = getQuotedParticipant(message);

    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prime-tomp3-")
    );

    const inputPath = path.join(
        tempDir,
        "input.mp4"
    );

    const outputPath = path.join(
        tempDir,
        "audio.mp3"
    );

    try {

        const buffer = await downloadVideo({
            sock,
            jid,
            message,
            quoted,
            participant
        });

        fs.writeFileSync(
            inputPath,
            buffer
        );

        await convertToMP3(
            inputPath,
            outputPath
        );

        if (!fs.existsSync(outputPath)) {
            throw new Error(
                "MP3 file was not created."
            );
        }

        console.log("TOMP3: Sending MP3 to chat...");

        await sock.sendMessage(
            jid,
            {
                audio: fs.readFileSync(outputPath),
                mimetype: "audio/mpeg",
                fileName: "PRIME_AUDIO.mp3",
                ptt: false
            }
        );

        console.log("TOMP3: MP3 SENT");

        return null;

    } catch (error) {

        console.error(
            "TOMP3 ERROR:",
            error?.message || error
        );

        return (
            "TOMP3 FAILED\n\n" +
            "I couldn't convert that video into MP3."
        );

    } finally {

        try {
            fs.rmSync(
                tempDir,
                {
                    recursive: true,
                    force: true
                }
            );

            console.log(
                "TOMP3: Temporary files cleaned."
            );

        } catch (cleanupError) {
            console.error(
                "TOMP3 CLEANUP ERROR:",
                cleanupError?.message || cleanupError
            );
        }
    }
};
