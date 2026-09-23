const {
    isDeletedEnabled,
    setDeletedEnabled
} = require("../config/deleted-system");

module.exports = async ({ args }) => {

    const action =
        args[0]?.toLowerCase();

    if (action === "on") {

        if (isDeletedEnabled()) {

            return `⚠️ *DELETED MESSAGE*

Already enabled.

🟢 PRIME will send deleted messages to your PM.`;
        }

        setDeletedEnabled(true);

        return `✅ *DELETED MESSAGE ENABLED*

🟢 Status: ON

Deleted messages from DMs and groups will now be sent to your PM.

⏱️ Message history: 24 hours`;
    }

    if (action === "off") {

        if (!isDeletedEnabled()) {

            return `⚠️ *DELETED MESSAGE*

Already disabled.`;
        }

        setDeletedEnabled(false);

        return `🔴 *DELETED MESSAGE DISABLED*

PRIME will no longer recover deleted messages.`;
    }

    return `❌ *Invalid option.*

Use:

.deleted on

.deleted off

Current status:
${isDeletedEnabled() ? "🟢 ON" : "🔴 OFF"}`;
};
