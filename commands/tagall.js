module.exports = async ({ sock, jid }) => {

    // Only work inside groups
    if (!jid.endsWith("@g.us")) {
        return "❌ This command can only be used in a group.";
    }

    try {

        const metadata = await sock.groupMetadata(jid);
        const participants = metadata.participants;

        if (!participants || participants.length === 0) {
            return "❌ No group members found.";
        }

        const mentions = participants.map(
            participant => participant.id
        );

        let text = `╭━━〔 ⚡ PRIME BOT 〕━━╮
┃
┃ 👥 Members : ${participants.length}
┃
╰━━━━━━━━━━━━━━━━━━━╯

`;

        participants.forEach((participant, index) => {
            const number = participant.id.split("@")[0];

            text += `@${number}\n`;
        });

        await sock.sendMessage(jid, {
            text: text.trim(),
            mentions: mentions
        });

        return null;

    } catch (error) {

        console.error(
            "Tagall error:",
            error
        );

        return "❌ Failed to tag group members.";
    }
};
