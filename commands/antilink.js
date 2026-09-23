const fs = require("fs");
const path = require("path");

const file =
    path.join(__dirname, "..", "config", "antilink.json");

function loadSettings() {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, "{}");
        }

        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );

    } catch (error) {
        console.error(
            "Antilink load error:",
            error
        );

        return {};
    }
}

function saveSettings(settings) {
    fs.writeFileSync(
        file,
        JSON.stringify(
            settings,
            null,
            4
        )
    );
}

module.exports = async ({ sock, jid, args }) => {

    if (!jid.endsWith("@g.us")) {
        return "❌ This command can only be used in a group.";
    }

    const action =
        (args[0] || "").toLowerCase();

    const settings =
        loadSettings();

    if (action === "on") {

        settings[jid] = true;

        saveSettings(settings);

        return `🔒 *ANTI-LINK ENABLED*

🚫 Group invite links will be removed automatically.`;

    }

    if (action === "off") {

        settings[jid] = false;

        saveSettings(settings);

        return `🔓 *ANTI-LINK DISABLED*

✅ Links are allowed again.`;

    }

    const status =
        settings[jid] === true
            ? "ON 🟢"
            : "OFF 🔴";

    return `╭━━〔 ⚡ PRIME BOT 〕━━╮
┃
┃ 🔗 ANTI-LINK
┃
┃ Status: ${status}
┃
┃ • .antilink on
┃ • .antilink off
┃
╰━━━━━━━━━━━━━━━━━━━╯`;
};
