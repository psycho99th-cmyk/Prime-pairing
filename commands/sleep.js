const {
    isSleeping,
    setSleeping
} = require("../config/sleep-system");

module.exports = async () => {

    if (isSleeping()) {

        return `😴 *PRIME BOT IS ALREADY SLEEPING*

Contact owner to wake up.`;
    }

    setSleeping(true);

    return `😴 *PRIME BOT IS SLEEPING*

PRIME has entered sleep mode.

Contact owner to wake up.`;
};
