const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configDir =
    path.join(__dirname, "..", "config");

const mediaDir =
    path.join(configDir, "media");

const configPath =
    path.join(configDir, "images.json");

const imagePath =
    path.join(mediaDir, "menu.jpg");


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


module.exports = async ({
    sock,
    jid,
    args
}) => {

    const images =
        getImages();


    /*
     * =========================
     * UPDATE MENU IMAGE
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

*.menu img "https://example.com/menu.jpg"*`;

        }


        try {

            const response =
                await axios({
                    method: "GET",
                    url,
                    responseType:
                        "arraybuffer",
                    timeout: 30000
                });


            fs.writeFileSync(
                imagePath,
                response.data
            );


            images.menu =
                url;


            fs.writeFileSync(
                configPath,
                JSON.stringify(
                    images,
                    null,
                    4
                )
            );


            return `✅ *Menu image updated successfully.*`;


        } catch (error) {

            console.error(
                "Menu image error:",
                error.message
            );


            return `❌ *Couldn't download the image.*

Make sure the URL is a direct, publicly accessible image URL.`;

        }

    }


    /*
     * =========================
     * GET BOT WHATSAPP NAME
     * =========================
     */

    const botName =
        sock.user?.name ||
        sock.user?.verifiedName ||
        "PRIME BOT";


    /*
     * =========================
     * MENU
     * =========================
     */

    const menuText =
`╭━━━〔 ⚡ PRIME BOT 〕━━━╮
┃
┃ 👋 Hello, *${botName}*
┃
┃ 🤖 Version : 1.0.0
┃ ⚡ Status  : Online
┃ 🔒 Access  : Private
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

┏━━〔 👑 OWNER 〕━━┓
┃
┃ › .ping
┃ › .alive
┃ › .status
┃ › .owner
┃
┗━━━━━━━━━━━━━━━━━┛

┏━━〔 🎨 MEDIA 〕━━┓
┃
┃ › .vv
┃ › .vv2
┃ › .profile
┃
┗━━━━━━━━━━━━━━━━━┛

┏━━〔 🔄 CONVERTER 〕━━┓
┃
┃ › .tourl
┃ › .toimg
┃ › .sticker
┃
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━〔 👥 GROUP 〕━━┓
┃
┃ › .groupinfo
┃ › .gclink
┃ › .promote
┃ › .demote
┃ › .add
┃ › .kick
┃ › .mute
┃ › .unmute
┃ › .tagall
┃ › .hidetag
┃ › .antilink
┃
┗━━━━━━━━━━━━━━━━━┛

┏━━〔 🎮 GAMES 〕━━┓
┃
┃ › .guess
┃ › .bomb
┃
┗━━━━━━━━━━━━━━━━━┛

┏━━〔 📥 DOWNLOADER 〕━━┓
┃
┃ › .play
┃
┗━━━━━━━━━━━━━━━━━━━━━┛

┏━━〔 🛡️ SYSTEM 〕━━┓
┃
┃ › .pair
┃ › .delpair
┃ › .pairs
┃ › .unpairall
┃ › .deleted
┃ › .online
┃ › .sleep
┃ › .wake
┃ › .block
┃ › .unblock
┗━━━━━━━━━━━━━━━━━━┛

┏━━〔 🗑️ MESSAGE 〕━━┓
┃
┃ › .del
┃
┗━━━━━━━━━━━━━━━━━━┛

┏━━〔 📚 INFO 〕━━┓
┃
┃ › .help
┃ › .menu
┃
┗━━━━━━━━━━━━━━━━━┛

╭────────────────────╮
│ ⚡ PRIME BOT
│ Private • Fast • Secure
╰────────────────────╯`;


    /*
     * =========================
     * SEND MENU IMAGE
     * =========================
     */

    if (
        fs.existsSync(imagePath)
    ) {

        await sock.sendMessage(
            jid,
            {
                image:
                    fs.readFileSync(
                        imagePath
                    ),

                caption:
                    menuText
            }
        );

        return null;

    }


    /*
     * =========================
     * TEXT MENU
     * =========================
     */

    return menuText;

};
