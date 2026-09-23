const {
    isOnlineEnabled,
    setOnlineEnabled
} = require("../config/online-system");

module.exports = async ({ sock, args }) => {

    const action =
        args[0]?.toLowerCase();

    if (action === "on") {

        setOnlineEnabled(true);

        try {
            await sock.sendPresenceUpdate(
                "available"
            );
        } catch {}

        return `🟢 *ONLINE MODE ENABLED*

You  will remain online even without Internet.`;
    }


    if (action === "off") {

        setOnlineEnabled(false);

        try {
            await sock.sendPresenceUpdate(
                "unavailable"
            );
        } catch {}

        return `🔴 *ONLINE MODE DISABLED*

PRIME has returned to normal presence behavior.`;
    }


    return `❌ *Invalid option.*

Use:

.online on

.online off

Current status:
${
    isOnlineEnabled()
        ? "🟢 ON"
        : "🔴 OFF"
}`;
};
