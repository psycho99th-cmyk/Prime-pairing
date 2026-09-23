module.exports = async ({
    sock,
    jid,
    args
}) => {

    if (!jid?.endsWith("@g.us")) {
        return `❌ *THIS COMMAND IS FOR GROUPS ONLY.*`;
    }

    const text =
        args.join(" ").trim();

    if (!text) {
        return `❌ *PROVIDE A MESSAGE TO SEND.*

Example:

*.hidetag Hello everyone*`;
    }

    try {

        const metadata =
            await sock.groupMetadata(jid);

        const participants =
            metadata?.participants || [];

        if (!participants.length) {
            return `❌ *COULDN'T GET GROUP MEMBERS.*`;
        }

        const mentions =
            participants
                .map(
                    participant =>
                        participant.id ||
                        participant.jid ||
                        participant.lid
                )
                .filter(Boolean);

        await sock.sendMessage(
            jid,
            {
                text,
                mentions
            }
        );

        return null;

    } catch (error) {

        console.error(
            "🔥 HIDETAG ERROR:",
            error
        );

        return `❌ *FAILED TO SEND HIDETAG.*

${error?.message || "Unknown error"}`;
    }
};
