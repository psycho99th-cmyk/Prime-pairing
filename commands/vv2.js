const fs = require("fs");
const path = require("path");

const {
    downloadMediaMessage
} = require("@whiskeysockets/baileys");

const P = require("pino");

const configDir =
    path.join(__dirname, "..", "config");

const configFile =
    path.join(configDir, "vv2.json");


function loadConfig() {
    try {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        if (!fs.existsSync(configFile)) {
            fs.writeFileSync(
                configFile,
                JSON.stringify({ sticker: null }, null, 4)
            );
        }

        return JSON.parse(
            fs.readFileSync(configFile, "utf8")
        );

    } catch (error) {
        console.error("VV2 CONFIG ERROR:", error);
        return { sticker: null };
    }
}


function saveConfig(config) {
    fs.writeFileSync(
        configFile,
        JSON.stringify(config, null, 4)
    );
}


function getContextInfo(message) {
    return (
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.stickerMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.audioMessage?.contextInfo ||
        message?.message?.documentMessage?.contextInfo ||
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


function getBotJid(sock) {
    const raw = sock?.user?.id;

    if (!raw) {
        return null;
    }

    const number =
        raw
            .split("@")[0]
            .split(":")[0];

    if (!number) {
        return null;
    }

    return number + "@s.whatsapp.net";
}


function getDateTime() {
    const now = new Date();

    const date =
        now.toLocaleDateString(
            "en-GB",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
        );

    const time =
        now.toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            }
        );

    return {
        date,
        time
    };
}


function buildCaption(originalCaption) {
    const {
        date,
        time
    } = getDateTime();

    let caption =
        "VV2 MEDIA\n" +
        "Date: " +
        date +
        "\n" +
        "Time: " +
        time;

    if (
        originalCaption &&
        String(originalCaption).trim()
    ) {
        caption +=
            "\n\nOriginal Caption:\n" +
            String(originalCaption).trim();
    }

    return caption;
}


async function downloadQuotedMedia({
    sock,
    jid,
    message,
    quoted,
    quotedParticipant
}) {
    const quotedId =
        getQuotedKey(message);

    if (!quotedId) {
        throw new Error(
            "Quoted message ID is missing."
        );
    }

    console.log(
        "Quoted message ID:",
        quotedId
    );

    console.log(
        "Quoted participant:",
        quotedParticipant || "none"
    );

    const quotedWAMessage = {
        key: {
            remoteJid: jid,
            id: quotedId,
            participant:
                quotedParticipant ||
                undefined,
            fromMe: false
        },

        message: quoted
    };

    console.log(
        "VV2: Downloading quoted media..."
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

    if (
        !buffer ||
        !Buffer.isBuffer(buffer)
    ) {
        throw new Error(
            "Baileys returned an invalid media buffer."
        );
    }

    console.log(
        "VV2: Media downloaded:",
        buffer.length,
        "bytes"
    );

    return buffer;
}


async function sendVideoWithRetry({
    sock,
    botJid,
    buffer,
    video,
    caption
}) {
    const mimetype =
        video.mimetype ||
        "video/mp4";

    const options = {
        video: buffer,

        mimetype,

        caption,

        fileLength:
            video.fileLength,

        seconds:
            video.seconds,

        height:
            video.height,

        width:
            video.width,

        gifPlayback:
            video.gifPlayback === true
    };

    let lastError = null;

    for (
        let attempt = 1;
        attempt <= 3;
        attempt++
    ) {
        try {
            console.log(
                "VV2: Sending video, attempt " +
                attempt +
                "/3..."
            );

            await sock.sendMessage(
                botJid,
                options
            );

            console.log(
                "VV2: VIDEO SENT TO BOT DM"
            );

            return true;

        } catch (error) {
            lastError = error;

            console.error(
                "VV2 VIDEO SEND ATTEMPT " +
                attempt +
                " FAILED:",
                error?.message ||
                error
            );

            if (attempt < 3) {
                console.log(
                    "VV2: Retrying video upload..."
                );

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            2500
                        )
                );
            }
        }
    }

    throw lastError;
}


module.exports = async ({
    sock,
    jid,
    message,
    args
}) => {

    const subcommand =
        String(
            args?.[0] || ""
        )
            .toLowerCase()
            .trim();


    if (
        subcommand === "clear"
    ) {
        saveConfig({
            sticker: null
        });

        return (
            "VV2 STICKER CLEARED\n\n" +
            "The saved trigger sticker has been removed.\n\n" +
            "VV2 is now inactive."
        );
    }


    if (
        subcommand === "set"
    ) {
        const quoted =
            getQuotedMessage(message);

        if (
            !quoted?.stickerMessage
        ) {
            return (
                "INVALID STICKER\n\n" +
                "Reply to a sticker with:\n\n" +
                ".vv2 set"
            );
        }

        const sticker =
            quoted.stickerMessage;

        const quotedKey =
            getQuotedKey(message);

        const quotedParticipant =
            getQuotedParticipant(message);

        saveConfig({
            sticker: {
                fileSha256:
                    sticker.fileSha256
                        ? Buffer
                            .from(
                                sticker.fileSha256
                            )
                            .toString(
                                "base64"
                            )
                        : null,

                stanzaId:
                    quotedKey ||
                    null,

                participant:
                    quotedParticipant ||
                    null
            }
        });

        return (
            "VV2 STICKER SET\n\n" +
            "This sticker is now your VV2 trigger.\n\n" +
            "Reply to view once media with this sticker to send the media to your PM.\n\n" +
            "Use .vv2 clear to remove it."
        );
    }


    const config =
        loadConfig();

    if (!config.sticker) {
        return null;
    }


    const triggerSticker =
        message
            ?.message
            ?.stickerMessage;

    if (!triggerSticker) {
        return null;
    }


    console.log(
        "VV2 DEBUG STICKER: FOUND"
    );


    const quoted =
        getQuotedMessage(message);

    if (!quoted) {
        console.log(
            "VV2 DEBUG: No quoted message."
        );

        return null;
    }


    const currentHash =
        triggerSticker.fileSha256
            ? Buffer
                .from(
                    triggerSticker.fileSha256
                )
                .toString(
                    "base64"
                )
            : null;


    console.log(
        "VV2 DEBUG CURRENT HASH:",
        currentHash
    );

    console.log(
        "VV2 DEBUG SAVED HASH:",
        config.sticker.fileSha256
    );


    if (
        !currentHash ||
        !config.sticker.fileSha256 ||
        currentHash !==
            config.sticker.fileSha256
    ) {
        console.log(
            "VV2 DEBUG: Sticker hash does not match."
        );

        return null;
    }


    console.log(
        "VV2 DEBUG: Trigger sticker MATCHED."
    );


    const image =
        quoted.imageMessage;

    const video =
        quoted.videoMessage;

    const audio =
        quoted.audioMessage;


    if (image?.viewOnce) {
        console.log(
            "VV2: Quoted IMAGE detected."
        );
    }

    if (video) {
        console.log(
            "VV2: Quoted VIDEO detected."
        );
    }

    if (audio) {
        console.log(
            "VV2: Quoted AUDIO detected."
        );
    }


    if (
    !image &&
    !video &&
    !audio
) {
    console.log(
        "VV2: No supported media found."
    );

    return null;
}

if (
    image?.viewOnce ||
    video?.viewOnce ||
    audio?.viewOnce
) {
    console.log(
        "VV2: Viewonce media accepted."
    );
    // Removed 'return null;' so the rest of your code can process it
}


    

    const botJid =
        getBotJid(sock);

    if (!botJid) {
        console.log(
            "VV2: Bot JID unavailable."
        );

        return null;
    }


    console.log(
        "VV2: Target DM:",
        botJid
    );


    const quotedParticipant =
        getQuotedParticipant(message);


    try {

        const mediaBuffer =
            await downloadQuotedMedia({
                sock,
                jid,
                message,
                quoted,
                quotedParticipant
            });


        const originalCaption =
            image?.caption ||
            video?.caption ||
            audio?.caption ||
            null;


        const caption =
            buildCaption(
                originalCaption
            );


        if (image) {

            console.log(
                "VV2: Sending image..."
            );

            await sock.sendMessage(
                botJid,
                {
                    image:
                        mediaBuffer,

                    caption
                }
            );

            console.log(
                "VV2: IMAGE SENT TO BOT DM"
            );

            return null;
        }


        if (video) {

            console.log(
                "VV2: Video mimetype:",
                video.mimetype ||
                "video/mp4"
            );

            console.log(
                "VV2: Video size:",
                video.fileLength ||
                mediaBuffer.length
            );

            await sendVideoWithRetry({
                sock,
                botJid,
                buffer:
                    mediaBuffer,
                video,
                caption
            });

            return null;
        }


        if (audio) {

            console.log(
                "VV2: Sending audio..."
            );

            await sock.sendMessage(
                botJid,
                {
                    audio:
                        mediaBuffer,

                    mimetype:
                        audio.mimetype ||
                        "audio/mpeg",

                    ptt:
                        audio.ptt === true,

                    caption
                }
            );

            console.log(
                "VV2: AUDIO SENT TO BOT DM"
            );

            return null;
        }

    } catch (error) {

        console.error(
            "VV2 MEDIA ERROR:",
            error?.message ||
            error
        );

        console.error(
            "VV2 STACK:",
            error?.stack ||
            "No stack"
        );
    }


    return null;
};
