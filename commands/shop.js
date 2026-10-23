const economy = require("../config/economy-system");
const cars = require("../config/cars");

module.exports = async ({ sock, jid, message }) => {
    const carList = cars.map(c => `${c.id}. ${c.name} - 🪙${economy.format(c.price)}`).join("\n");
    const text = `🛒 *CAR SHOP*\n\n${carList}\n\nType *.buy car <number>* to purchase.`;
    await sock.sendMessage(jid, { text }, { quoted: message });
};

module.exports.public = true;
