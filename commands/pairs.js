const {
    loadPairs
} = require("../config/pair-system");

module.exports = async () => {

    const pairs =
        loadPairs();


    if (
        pairs.length === 0
    ) {

        return `╭━━〔 🔐 PAIRED USERS 〕━━⬣
┃
┃ No paired users yet.
┃
╰━━━━━━━━━━━━━━━━⬣

👥 Total: 0`;

    }


    let list = "";

    pairs.forEach(
        (number, index) => {

            list +=
`┃ ${index + 1}. ${number}\n`;

        }
    );


    return `╭━━〔 🔐 PAIRED USERS 〕━━⬣
┃
${list}╰━━━━━━━━━━━━━━━━⬣

👥 Total: ${pairs.length}`;

};
