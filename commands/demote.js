const {
    findBotParticipant,
    getTargetFromReply,
    findParticipant,
    getParticipantJid
} = require("../config/group-system");

module.exports = async ({ sock, jid, message }) => {

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

        const target =
            getTargetFromReply(message);

        if (!target) {
            return "❌ Reply to the person's message with .demote";
        }

        const participant =
            findParticipant(
                metadata,
                target
            );

        if (!participant) {
            return "❌ Could not find that group member.";
        }

        const targetJid =
            getParticipantJid(
                participant
            );

        if (!targetJid) {
            return "❌ Could not identify that member.";
        }

        await sock.groupParticipantsUpdate(
            jid,
            [targetJid],
            "demote"
        );

        return `✅ @${targetJid.split("@")[0]} is no longer an admin.`;

    } catch (error) {

        console.error(
            "Demote error:",
            error
        );

        return "❌ Failed to demote member.";
    }
};
