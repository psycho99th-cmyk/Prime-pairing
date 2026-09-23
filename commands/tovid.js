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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTEXT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getContextInfo(message) {
    return (
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.stickerMessage?.contextInfo ||
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOWNLOAD STICKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function downloadSticker({
    sock,
    jid,
    message,
    quoted,
    participant
}) {
    const quotedId = getQuotedKey(message);

    if (!quotedId) {
        throw new Error(
            "Quoted sticker ID is missing."
        );
    }

    const quotedWAMessage = {
        key: {
            remoteJid: jid,
            id: quotedId,
            participant:
                participant || undefined,
            fromMe: false
        },

        message: quoted
    };

    console.log(
        "TOVID: Downloading sticker..."
    );

    const buffer =
        await downloadMediaMessage(
            quotedWAMessage,
            "buffer",
            {},
            {
                logger:
                    P({
                        level: "silent"
                    }),

                reuploadRequest:
                    sock.updateMediaMessage
            }
        );

    if (!Buffer.isBuffer(buffer)) {
        throw new Error(
            "Invalid sticker buffer."
        );
    }

    console.log(
        "TOVID: Sticker downloaded:",
        buffer.length,
        "bytes"
    );

    return buffer;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// READ ORIGINAL WEBP FRAME TIMINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getFrameDurations(inputPath) {
    const result =
        await execFileAsync(
            "webpmux",
            [
                "-info",
                inputPath
            ],
            {
                maxBuffer:
                    1024 * 1024 * 5
            }
        );

    const output =
        String(result.stdout || "") +
        "\n" +
        String(result.stderr || "");

    console.log(
        "TOVID: Reading WebP frame information..."
    );

    const lines =
        output.split(/\r?\n/);

    const durations = [];

    for (const line of lines) {

        /*
         * Termux webpmux format:
         *
         * 1: 150 150 no 0 0 30 none no 2840 lossy
         *
         * The 30 is the duration in milliseconds.
         */

        const match =
            line.match(
                /^\s*\d+:\s+\d+\s+\d+\s+\S+\s+\d+\s+\d+\s+(\d+)\s+/
            );

        if (!match) {
            continue;
        }

        const duration =
            Number(match[1]);

        if (
            !Number.isFinite(duration) ||
            duration <= 0
        ) {
            continue;
        }

        durations.push(duration);
    }

    if (durations.length === 0) {

        console.log(
            "TOVID: Could not parse frame durations."
        );

        console.log(
            output
        );

        throw new Error(
            "Could not read animated WebP frame timings."
        );
    }

    console.log(
        "TOVID: Frame durations:",
        durations.length,
        "frames"
    );

    console.log(
        "TOVID: First frame duration:",
        durations[0],
        "ms"
    );

    return durations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONVERT ANIMATED WEBP TO MP4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertToVideo(
    inputPath,
    outputPath
) {
    console.log(
        "TOVID: Reading original frame timings..."
    );

    const frameDir =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "prime-frames-"
            )
        );

    const concatFile =
        path.join(
            frameDir,
            "frames.txt"
        );

    try {

        const durations =
            await getFrameDurations(
                inputPath
            );

        console.log(
            "TOVID: Total frames:",
            durations.length
        );

        const framePaths = [];

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // EXTRACT EVERY FRAME
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        for (
            let i = 0;
            i < durations.length;
            i++
        ) {

            const frameNumber =
                i + 1;

            const frameWebp =
                path.join(
                    frameDir,
                    `frame-${String(frameNumber).padStart(5, "0")}.webp`
                );

            const framePng =
                path.join(
                    frameDir,
                    `frame-${String(frameNumber).padStart(5, "0")}.png`
                );

            console.log(
                `TOVID: Extracting frame ${frameNumber}/${durations.length}...`
            );

            await execFileAsync(
                "webpmux",
                [
                    "-get",
                    "frame",
                    String(frameNumber),
                    inputPath,
                    "-o",
                    frameWebp
                ],
                {
                    maxBuffer:
                        1024 * 1024 * 5
                }
            );

            await execFileAsync(
                "dwebp",
                [
                    frameWebp,
                    "-o",
                    framePng
                ],
                {
                    maxBuffer:
                        1024 * 1024 * 5
                }
            );

            framePaths.push(
                framePng
            );
        }

        if (
            framePaths.length === 0
        ) {
            throw new Error(
                "No animation frames were extracted."
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CREATE FFMPEG CONCAT FILE
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const concatLines = [];

        for (
            let i = 0;
            i < framePaths.length;
            i++
        ) {

            const safePath =
                framePaths[i].replace(
                    /'/g,
                    "'\\''"
                );

            concatLines.push(
                "file '" +
                safePath +
                "'"
            );

            concatLines.push(
                "duration " +
                (
                    durations[i] / 1000
                ).toFixed(6)
            );
        }

        /*
         * Repeat the final frame so FFmpeg
         * preserves its duration.
         */

        const lastFrame =
            framePaths[
                framePaths.length - 1
            ];

        concatLines.push(
            "file '" +
            lastFrame.replace(
                /'/g,
                "'\\''"
            ) +
            "'"
        );

        fs.writeFileSync(
            concatFile,
            concatLines.join("\n") +
            "\n"
        );

        console.log(
            "TOVID: Creating MP4 using original timings..."
        );

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // FFMPEG CONVERSION
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        await execFileAsync(
            "ffmpeg",
            [
                "-y",

                "-f",
                "concat",

                "-safe",
                "0",

                "-i",
                concatFile,

                "-c:v",
                "libx264",

                "-pix_fmt",
                "yuv420p",

                "-vf",
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",

                "-movflags",
                "+faststart",

                outputPath
            ],
            {
                maxBuffer:
                    1024 * 1024 * 5
            }
        );

        console.log(
            "TOVID: MP4 conversion complete."
        );

    } finally {

        fs.rmSync(
            frameDir,
            {
                recursive: true,
                force: true
            }
        );

    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMMAND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = async ({
    sock,
    jid,
    message
}) => {

    const quoted =
        getQuotedMessage(message);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHECK QUOTED STICKER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (
        !quoted?.stickerMessage
    ) {

        return (
            "INVALID MEDIA\n\n" +
            "Reply to an animated video sticker with:\n\n" +
            ".tovid"
        );
    }

    const sticker =
        quoted.stickerMessage;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ONLY ANIMATED STICKERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (
        sticker.isAnimated !== true
    ) {

        return (
            "IMAGE STICKER DETECTED\n\n" +
            "Please reply to an animated video sticker.\n\n" +
            "Normal image stickers are not supported."
        );
    }

    const participant =
        getQuotedParticipant(message);

    const tempDir =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "prime-tovid-"
            )
        );

    const inputPath =
        path.join(
            tempDir,
            "sticker.webp"
        );

    const outputPath =
        path.join(
            tempDir,
            "converted.mp4"
        );

    try {

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // DOWNLOAD
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const buffer =
            await downloadSticker({
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

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CONVERT
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        await convertToVideo(
            inputPath,
            outputPath
        );

        if (
            !fs.existsSync(outputPath)
        ) {
            throw new Error(
                "Converted video file was not created."
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // SEND VIDEO
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.log(
            "TOVID: Sending video to chat..."
        );

        await sock.sendMessage(
            jid,
            {
                video:
                    fs.readFileSync(
                        outputPath
                    ),

                mimetype:
                    "video/mp4"
            }
        );

        console.log(
            "TOVID: VIDEO SENT"
        );

        return null;

    } catch (error) {

        console.error(
            "TOVID ERROR:",
            error?.message ||
            error
        );

        return (
            "TOVID FAILED\n\n" +
            "I couldn't convert that sticker into a video."
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
                "TOVID: Temporary files cleaned."
            );

        } catch (cleanupError) {

            console.error(
                "TOVID CLEANUP ERROR:",
                cleanupError?.message ||
                cleanupError
            );

        }
    }
};
