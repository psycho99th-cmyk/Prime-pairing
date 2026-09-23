module.exports = async ({ sock, jid, message }) => {

    try {

        const contextInfo =
            message?.message
                ?.extendedTextMessage
                ?.contextInfo;

        // Do nothing if .del wasn't used as a reply
        if (!contextInfo?.stanzaId) {
            return;
        }

        const targetMessage = {
            remoteJid: jid,
            id: contextInfo.stanzaId,
            participant:
                contextInfo.participant ||
                contextInfo.participantAlt
        };

        // Delete the replied-to message
        await sock.sendMessage(
            jid,
            {
                delete: targetMessage
            }
        );

        // Delete the .del command itself
        await sock.sendMessage(
            jid,
            {
                delete: message.key
            }
        );

    } catch (error) {

        console.error(
            "🔥 DEL COMMAND ERROR:",
            error
        );

    }
};
