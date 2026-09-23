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

        await sock.groupSettingUpdate(
            jid,
            "not_announcement"
        );

        return "🔓 Group unmuted. Everyone can send messages.";

    } catch (error) {

        console.error(
            "Unmute error:",
            error
        );

        return "❌ Failed to unmute the group.";
    }
};
