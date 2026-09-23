const axios = require("axios");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = async ({ sock, jid, message }) => {

    try {

        let imageMessage = null;

        /*
         * ━━━━━━━━━━━━━━━━━━━━━━━
         * DIRECT IMAGE
         * Image sent with .tourl
         * ━━━━━━━━━━━━━━━━━━━━━━━
         */

        if (message?.message?.imageMessage) {
            imageMessage =
                message.message.imageMessage;
        }

        /*
         * ━━━━━━━━━━━━━━━━━━━━━━━
         * REPLIED IMAGE
         * .tourl sent as a reply
         * ━━━━━━━━━━━━━━━━━━━━━━━
         */

        if (!imageMessage) {

            const context =
                message?.message
                    ?.extendedTextMessage
                    ?.contextInfo;

            const quoted =
                context?.quotedMessage;

            if (quoted?.imageMessage) {
                imageMessage =
                    quoted.imageMessage;
            }
        }

        if (!imageMessage) {

            return `❌ *No image found.*

Send an image with:

*.tourl*

Or reply to an image with:

*.tourl*`;
        }

        console.log(
            "📥 Downloading image..."
        );

        const stream =
            await downloadContentFromMessage(
                imageMessage,
                "image"
            );

        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        const buffer =
            Buffer.concat(chunks);

        if (!buffer.length) {
            return "❌ *Failed to download the image.*";
        }

        console.log(
            "📤 Uploading to Catbox..."
        );

        const form =
            new FormData();

        form.append(
            "reqtype",
            "fileupload"
        );

        form.append(
            "fileToUpload",
            buffer,
            {
                filename: "prime-image.jpg",
                contentType:
                    imageMessage.mimetype ||
                    "image/jpeg"
            }
        );

        const response =
            await axios.post(
                "https://catbox.moe/user/api.php",
                form,
                {
                    headers:
                        form.getHeaders(),
                    maxContentLength:
                        Infinity,
                    maxBodyLength:
                        Infinity,
                    timeout: 120000
                }
            );

        const url =
            String(response.data).trim();

        if (
            !url ||
            !url.startsWith("http")
        ) {

            console.error(
                "❌ Catbox response:",
                response.data
            );

            return "❌ *Catbox upload failed.*";
        }

        console.log(
            "✅ Catbox URL:",
            url
        );

        return `✅ *UPLOAD SUCCESSFUL*

🔗 *URL:*
${url}`;

    } catch (error) {

        console.error(
            "🔥 TOURl ERROR:",
            error.response?.data ||
            error.message ||
            error
        );

        return `❌ *Failed to upload image.*

Please try again.`;
    }
};
