const fs = require("fs");
const path = require("path");

const file =
    path.join(__dirname, "deleted.json");

function loadSettings() {

    try {

        if (!fs.existsSync(file)) {

            fs.writeFileSync(
                file,
                JSON.stringify(
                    {
                        enabled: false
                    },
                    null,
                    4
                )
            );
        }

        const data =
            JSON.parse(
                fs.readFileSync(
                    file,
                    "utf8"
                )
            );

        return data;

    } catch (error) {

        console.error(
            "❌ Could not load deleted settings:",
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
        JSON.stringify(
            settings,
            null,
            4
        )
    );
}

function isDeletedEnabled() {

    return loadSettings().enabled === true;
}

function setDeletedEnabled(value) {

    const settings =
        loadSettings();

    settings.enabled = Boolean(value);

    saveSettings(settings);

    return settings.enabled;
}

module.exports = {
    isDeletedEnabled,
    setDeletedEnabled
};
