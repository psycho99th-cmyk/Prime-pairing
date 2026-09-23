module.exports = async ({ sock, jid }) => {

    // Only work inside groups
    if (!jid.endsWith("@g.us")) {
        return "❌ This command can only be used in a group.";
    }

    try {

        // Get group information
        const metadata = await sock.groupMetadata(jid);

        const groupName =
            metadata.subject || "Unknown";

        const participants =
            metadata.participants || [];

        const memberCount =
            participants.length;

        // Find group owner
        const owner =
            metadata.owner ||
            participants.find(
                participant =>
                    participant.admin === "superadmin"
            )?.id ||
            "Unknown";

        const ownerNumber =
            owner !== "Unknown"
                ? owner.split("@")[0]
                : "Unknown";

        const description =
            metadata.desc ||
            "No description";

        // Get group profile picture
        let profilePicture = null;

        try {

            profilePicture =
                await sock.profilePictureUrl(
                    jid,
                    "image"
                );

        } catch (error) {

            console.log(
                "No group profile picture available."
            );

        }

        // Build response
        const text =
`╭━━〔 ⚡ PRIME BOT 〕━━╮
┃
┃ 👥 GROUP INFO
┃
┃ 🏷️ Name    : ${groupName}
┃ 👤 Members : ${memberCount}
┃ 👑 Owner   : +${ownerNumber}
┃ 📝 Desc    : ${description}
┃
╰━━━━━━━━━━━━━━━━━━━╯`;

        // Send group PFP + information
        if (profilePicture) {

            await sock.sendMessage(jid, {
                image: {
                    url: profilePicture
                },
                caption: text
            });

            return null;
        }

        // If no PFP is available
        return text;

    } catch (error) {

        console.error(
            "Groupinfo error:",
            error
        );

        return "❌ Failed to get group information.";
    }
};
