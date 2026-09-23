const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "online.json");

function loadSettings() {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify({ enabled: false }, null, 4)
            );
        }

        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch (error) {
        console.error(
            "❌ Could not load online settings:",
            error
        );

        return {
            enabled: false
        };
    }
}

function saveSettings(settings) {
    fs.writeFileSync(
        file,
        JSON.stringify(settings, null, 4)
    );
}

function isOnlineEnabled() {
    return loadSettings().enabled === true;
}

function setOnlineEnabled(value) {
    const settings = loadSettings();

    settings.enabled = Boolean(value);

    saveSettings(settings);

    return settings.enabled;
}

module.exports = {
    isOnlineEnabled,
    setOnlineEnabled
};
