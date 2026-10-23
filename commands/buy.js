const economy = require("../config/economy-system");
const cars = require("../config/cars");

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    // Expecting format like: .buy car 2 or .buy 2
    const carArgIndex = args.findIndex(arg => arg.toLowerCase() === "car");
    let carId = null;

    if (carArgIndex !== -1 && args[carArgIndex + 1]) {
        carId = parseInt(args[carArgIndex + 1], 10);
    } else {
        // Fallback: look for any number in args
        const numArg = args.find(arg => /^\d+$/.test(arg));
        if (numArg) carId = parseInt(numArg, 10);
    }

    if (!carId || isNaN(carId)) {
        await sock.sendMessage(jid, { text: `❌ Please specify a valid car number!\nExample: *.buy car 2*` }, { quoted: message });
        return;
    }

    const selectedCar = cars.find(c => c.id === carId);
    if (!selectedCar) {
        await sock.sendMessage(jid, { text: `❌ Car #${carId} does not exist in the shop! Type *.shop* to view available cars.` }, { quoted: message });
        return;
    }

    if (!user.cars) user.cars = [];
    if (user.cars.includes(selectedCar.name)) {
        await sock.sendMessage(jid, { text: `❌ You already own a *${selectedCar.name}*!` }, { quoted: message });
        return;
    }

    if ((user.wallet || 0) < selectedCar.price) {
        await sock.sendMessage(jid, { text: `❌ Insufficient wallet cash! You need *🪙${economy.format(selectedCar.price)}* but you only have *🪙${economy.format(user.wallet || 0)}* in cash.` }, { quoted: message });
        return;
    }

    user.wallet -= selectedCar.price;
    user.cars.push(selectedCar.name);

    economy.addTransaction(user, {
        type: "spend",
        description: `Car Purchase (${selectedCar.name})`,
        amount: selectedCar.price
    });
    economy.save();

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const text =
`╭━━〔 🏎️ CAR PURCHASED 〕━━╮
┃
┃ 🎉 *SUCCESSFUL PURCHASE!*
┃
┃ 👤 ${tag}
┃ 🚗 Car: *${selectedCar.name}*
┃ 💸 Paid: *-🪙${economy.format(selectedCar.price)}*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
