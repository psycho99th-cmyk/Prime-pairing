const {
    isSleeping
} = require("../config/sleep-system");

module.exports = async () => {

    const status =
        isSleeping()
            ? "Sleeping"
            : "ACTIVE";

    return `╭━━━〔 ⚡ PRIME BOT 〕━━━╮
┃ 🟢 Status : ${status}
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
};
