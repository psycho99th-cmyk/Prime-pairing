const {
    findBotParticipant
} = require("../config/group-system");

module.exports = async ({ sock, jid }) => {

    if (!jid.endsWith("@g.us")) {
        return "❌ This command can only be used in a group.";
    }

    try {

        const metadata =
            await sock.groupMetadata(jid);

        const bot =
            findBotParticipant(
                metadata,
                sock
            );

        if (!bot || !bot.admin) {
            return "❌ Prime Bot must be a group admin.";
        }

        const code =
            await sock.groupInviteCode(jid);

        if (!code) {
            return "❌ Couldn't get the group invite link.";
        }

        return `╭━━〔 ⚡ PRIME BOT 〕━━╮
┃
┃ 🔗 GROUP LINK
┃
┃ https://chat.whatsapp.com/${code}
┃
╰━━━━━━━━━━━━━━━━━━━╯`;

    } catch (error) {

        console.error(
            "Gclink error:",
            error
        );

        return "❌ Failed to get the group invite link.";
    }
};
