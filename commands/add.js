const {
    findBotParticipant
} = require("../config/group-system");

module.exports = async ({ sock, jid, args }) => {

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

        if (!args[0]) {
            return "❌ Usage: .add 234xxxxxxxxxx";
        }

        const number =
            args[0]
                .replace(/[^\d]/g, "");

        if (!number) {
            return "❌ Invalid phone number.";
        }

        const target =
            `${number}@s.whatsapp.net`;

        const result =
            await sock.groupParticipantsUpdate(
                jid,
                [target],
                "add"
            );

        console.log(
            "Add result:",
            result
        );

        const status =
            result?.[0]?.status;

        if (
            status &&
            status !== 200
        ) {
            return `❌ Couldn't add +${number}. Status: ${status}`;
        }

        return `✅ +${number} has been added to the group.`;

    } catch (error) {

        console.error(
            "Add error:",
            error
        );

        return "❌ Failed to add member.";
    }
};
