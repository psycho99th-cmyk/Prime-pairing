const fs = require("fs");
const path = require("path");

const file =
    path.join(__dirname, "sleep.json");

function loadSettings() {
    try {

        if (!fs.existsSync(file)) {

            fs.writeFileSync(
                file,
                JSON.stringify(
                    {
                        sleeping: false
                    },
                    null,
                    4
                )
            );
        }

        return JSON.parse(
            fs.readFileSync(
                file,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "❌ Could not load sleep settings:",
            error
        );

        return {
            sleeping: false
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

function isSleeping() {

    return loadSettings()
        .sleeping === true;
}

function setSleeping(value) {

    const settings =
        loadSettings();

    settings.sleeping =
        Boolean(value);

    saveSettings(
        settings
    );

    return settings.sleeping;
}

module.exports = {
    isSleeping,
    setSleeping
};
