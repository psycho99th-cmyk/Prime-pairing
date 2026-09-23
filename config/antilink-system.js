const fs = require("fs");
const path = require("path");

const file =
    path.join(__dirname, "antilink.json");

function isAntiLinkEnabled(jid) {

    try {

        if (!fs.existsSync(file)) {
            return false;
        }

        const settings =
            JSON.parse(
                fs.readFileSync(
                    file,
                    "utf8"
                )
            );

        return settings[jid] === true;

    } catch (error) {

        console.error(
            "Antilink check error:",
            error
        );

        return false;
    }
}

function containsLink(text) {

    if (!text) {
        return false;
    }

    const linkRegex =
        /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/)[^\s]+/i;

    return linkRegex.test(text);
}

function isAdmin(metadata, message) {

    const participant =
        message?.key?.participant ||
        message?.key?.participantAlt;

    if (!participant) {
        return false;
    }

    const participantNumber =
        String(participant)
            .split("@")[0]
            .split(":")[0];

    const found =
        metadata?.participants?.find(p => {

            const ids = [
                p?.id,
                p?.phoneNumber,
                p?.lid
            ]
                .filter(Boolean)
                .map(value =>
                    String(value)
                        .split("@")[0]
                        .split(":")[0]
                );

            return ids.includes(
                participantNumber
            );
        });

    return Boolean(
        found?.admin
    );
}

module.exports = {
    isAntiLinkEnabled,
    containsLink,
    isAdmin
};
