const {
    isSleeping,
    setSleeping
} = require("../config/sleep-system");

module.exports = async () => {

    if (!isSleeping()) {

        return `🟢 *PRIME BOT IS ALREADY AWAKE*

PRIME BOT IS FULLY READY AND ACTIVE.`;
    }

    setSleeping(false);

    return `🟢 *PRIME BOT IS FULLY READY AND ACTIVE*

All commands are now available.`;
};
