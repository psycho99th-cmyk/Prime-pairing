const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configDir =
    path.join(__dirname, "..", "config");

const mediaDir =
    path.join(configDir, "media");

const configPath =
    path.join(configDir, "images.json");

const aliveImagePath =
    path.join(mediaDir, "alive.jpg");


if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, {
        recursive: true
    });
}

if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, {
        recursive: true
    });
}


function getImages() {

    try {

        return JSON.parse(
            fs.readFileSync(
                configPath,
                "utf8"
            )
        );

    } catch {

        return {
            alive: "",
            menu: "",
            aliveText: "I'M ALIVE"
        };

    }

}


function saveImages(images) {

    fs.writeFileSync(
        configPath,
        JSON.stringify(
            images,
            null,
            4
        )
    );

}


function formatUptime() {

    let seconds =
        Math.floor(
            process.uptime()
        );

    const days =
        Math.floor(
            seconds / 86400
        );

    seconds %= 86400;

    const hours =
        Math.floor(
            seconds / 3600
        );

    seconds %= 3600;

    const minutes =
        Math.floor(
            seconds / 60
        );

    seconds %= 60;

    const parts = [];

    if (days) {
        parts.push(
            `${days}d`
        );
    }

    if (hours) {
        parts.push(
            `${hours}h`
        );
    }

    if (minutes) {
        parts.push(
            `${minutes}m`
        );
    }

    parts.push(
        `${seconds}s`
    );

    return parts.join(" ");
}


/*
|--------------------------------------------------------------------------
| DOWNLOAD IMAGE
|--------------------------------------------------------------------------
*/

async function downloadImage(
    url,
    outputPath
) {

    const response =
        await axios({
            method: "GET",
            url,
            responseType: "arraybuffer",
            timeout: 30000,
            maxContentLength:
                15 * 1024 * 1024,
            maxBodyLength:
                15 * 1024 * 1024,

            headers: {
                "User-Agent":
                    "Mozilla/5.0"
            }
        });


    const buffer =
        Buffer.from(
            response.data
        );


    if (
        !buffer.length
    ) {

        throw new Error(
            "Downloaded file is empty."
        );

    }


    /*
     * Check the actual file
     * signature instead of trusting
     * the URL extension.
     */

    const isJPEG =
        buffer[0] === 0xFF &&
        buffer[1] === 0xD8 &&
        buffer[2] === 0xFF;

    const isPNG =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4E &&
        buffer[3] === 0x47;

    const isGIF =
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46;

    const isWEBP =
        buffer.toString(
            "ascii",
            0,
            4
        ) === "RIFF" &&
        buffer.toString(
            "ascii",
            8,
            12
        ) === "WEBP";


    if (
        !isJPEG &&
        !isPNG &&
        !isGIF &&
        !isWEBP
    ) {

        throw new Error(
            "URL did not return a supported image."
        );

    }


    /*
     * Save the ORIGINAL image.
     *
     * Do not pretend PNG/WebP/GIF is
     * a JPEG by changing only the
     * filename.
     */

    let extension = ".jpg";

    if (isPNG) {
        extension = ".png";
    }

    if (isGIF) {
        extension = ".gif";
    }

    if (isWEBP) {
        extension = ".webp";
    }


    const realPath =
        outputPath.replace(
            /\.jpg$/i,
            extension
        );


    fs.writeFileSync(
        realPath,
        buffer
    );


    /*
     * If the extension changed,
     * remove the old alive.jpg so
     * the bot doesn't accidentally
     * try sending the wrong file.
     */

    if (
        realPath !== outputPath &&
        fs.existsSync(outputPath)
    ) {

        fs.unlinkSync(
            outputPath
        );

    }


    return realPath;
}


/*
|--------------------------------------------------------------------------
| COMMAND
|--------------------------------------------------------------------------
*/

module.exports = async ({
    sock,
    jid,
    args
}) => {

    const images =
        getImages();


    /*
     * =========================
     * .alive img URL
     * =========================
     */

    if (
        args[0]?.toLowerCase() ===
        "img"
    ) {

        const url =
            args
                .slice(1)
                .join(" ")
                .replace(
                    /^["']|["']$/g,
                    ""
                )
                .trim();


        if (!url) {

            return `❌ Please provide an image URL.

Example:

*.alive img "https://example.com/alive.jpg"*`;

        }


        try {

            const savedPath =
                await downloadImage(
                    url,
                    aliveImagePath
                );


            images.alive =
                url;


            images.alivePath =
                savedPath;


            if (
                !images.aliveText
            ) {

                images.aliveText =
                    "I'M ALIVE";

            }


            saveImages(
                images
            );


            return `✅ *Alive image updated successfully.*

The image has been saved locally.

Use *.alive* to view it.`;

        } catch (error) {

            console.error(
                "🔥 Alive image error:",
                error.message
            );


            return `❌ *Couldn't use that image.*

The URL did not return a supported image.

Try another direct image URL.`;

        }

    }


    /*
     * =========================
     * .alive text
     * =========================
     */

    if (
        args[0]?.toLowerCase() ===
        "text"
    ) {

        const newText =
            args
                .slice(1)
                .join(" ")
                .replace(
                    /^["']|["']$/g,
                    ""
                )
                .trim();


        if (!newText) {

            return `✏️ *CURRENT ALIVE TEXT*

┃ *${images.aliveText || "I'M ALIVE"}*

To change it:

*.alive text "YOUR TEXT"*`;

        }


        images.aliveText =
            newText;


        saveImages(
            images
        );


        return `✅ *Alive text updated successfully.*

New text:

┃ *${newText}*

Use *.alive* to view it.`;

    }


    /*
     * =========================
     * ALIVE TEXT
     * =========================
     */

    const customAliveText =
        images.aliveText ||
        "I'M ALIVE";


    const aliveText =
`╭━━〔 ⚡ PRIME BOT 〕━━╮
┃
┃ *${customAliveText}*
┃
┃ Uptime  : ${formatUptime()}
┃
╰━━━━━━━━━━━━━━━━━━━╯`;


    /*
     * =========================
     * FIND SAVED IMAGE
     * =========================
     */

    let imagePath =
        images.alivePath;


    if (
        !imagePath ||
        !fs.existsSync(imagePath)
    ) {

        const possibleFiles = [
            aliveImagePath,
            aliveImagePath.replace(
                /\.jpg$/i,
                ".png"
            ),
            aliveImagePath.replace(
                /\.jpg$/i,
                ".gif"
            ),
            aliveImagePath.replace(
                /\.jpg$/i,
                ".webp"
            )
        ];


        imagePath =
            possibleFiles.find(
                file =>
                    fs.existsSync(
                        file
                    )
            );
    }


    /*
     * =========================
     * SEND IMAGE
     * =========================
     */

    if (
        imagePath &&
        fs.existsSync(imagePath)
    ) {

        try {

            await sock.sendMessage(
                jid,
                {
                    image:
                        fs.readFileSync(
                            imagePath
                        ),

                    caption:
                        aliveText
                }
            );

            return null;

        } catch (error) {

            console.error(
                "🔥 Alive send error:",
                error.message
            );


            return `${aliveText}

⚠️ *Alive image could not be sent.*

The saved image format may not be supported by WhatsApp.`;
        }
    }


    /*
     * =========================
     * TEXT ONLY
     * =========================
     */

    return aliveText;

};
