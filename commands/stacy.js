const fs = require("fs");
const path = require("path");

const configFile = path.join(
    __dirname,
    "..",
    "config",
    "stacy.json"
);

function loadConfig() {
    try {
        if (!fs.existsSync(configFile)) {
            fs.writeFileSync(
                configFile,
                JSON.stringify(
                    { enabled: false },
                    null,
                    4
                )
            );
        }

        return JSON.parse(
            fs.readFileSync(configFile, "utf8")
        );
    } catch (error) {
        console.error(
            "STACY CONFIG ERROR:",
            error
        );

        return {
            enabled: false
        };
    }
}

function saveConfig(config) {
    fs.writeFileSync(
        configFile,
        JSON.stringify(
            config,
            null,
            4
        )
    );
}

module.exports = async ({
    jid,
    args
}) => {

    // Stacy works only in groups
    if (!jid.endsWith("@g.us")) {
        return (
            "STACY\n\n" +
            "Stacy can only be used in groups."
        );
    }

    const action =
        String(
            args?.[0] || ""
        )
            .toLowerCase()
            .trim();

    const config = loadConfig();

    if (action === "on") {

        config.enabled = true;

        saveConfig(config);

        return (
            "STACY ACTIVATED\n\n" +
            "Stacy is now active in all groups.\n\n" +
            "Mention Stacy in a group to talk to her."
        );
    }

    if (action === "off") {

        config.enabled = false;

        saveConfig(config);

        return (
            "STACY DEACTIVATED\n\n" +
            "Stacy is now inactive in all groups."
        );
    }

    return (
        "STACY\n\n" +
        "Usage:\n" +
        ".stacy on\n" +
        ".stacy off"
    );
};
