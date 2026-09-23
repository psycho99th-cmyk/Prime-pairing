module.exports = async ({ sock, jid, message }) => {

    const quoted =
        message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
        return `*Example*

Reply to an image, video, or audio and use:

*.vv*`;
    }

    const image = quoted.imageMessage;
    const video = quoted.videoMessage;
    const audio = quoted.audioMessage;

    // Check if at least one attached media is missing viewOnce (or vnce is false)
    if (
        !image?.viewOnce ||
        !video?.viewOnce ||
        !audio?.viewOnce
    ) {
        // Build clean message payload with viewOnce explicitly disabled
        const cleanMessage = {};

        if (image) {
            cleanMessage.image = { url: image.url } || image;
            cleanMessage.imageMessage = { ...image, viewOnce: false };
        } else if (video) {
            cleanMessage.videoMessage = { ...video, viewOnce: false };
        } else if (audio) {
            cleanMessage.audioMessage = { ...audio, viewOnce: false };
        }

        // Forward raw media payload directly to chatJid without quote wrappers
        await sock.sendMessage(jid, {
            forward: {
                key: message.message.extendedTextMessage.contextInfo.stanzaId,
                message: cleanMessage
            }
        });
    }

    return null;
};
