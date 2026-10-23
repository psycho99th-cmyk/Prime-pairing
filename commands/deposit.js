const economy = require("../config/economy-system");

const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 200000;

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const amountArg = args.find(arg => /^\d+$/.test(arg));
    const amount = parseInt(amountArg, 10);

    if (isNaN(amount) || amount <= 0) {
        await sock.sendMessage(jid, { text: `❌ Please specify a valid amount to deposit!\nExample: *.deposit 5000*` }, { quoted: message });
        return;
    }

    if (amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
        await sock.sendMessage(jid, { text: `❌ Deposit amount must be between *🪙${economy.format(MIN_DEPOSIT)}* and *🪙${economy.format(MAX_DEPOSIT)}*!` }, { quoted: message });
        return;
    }

    if ((user.wallet || 0) < amount) {
        await sock.sendMessage(jid, { text: `❌ Insufficient cash in your wallet! You have *🪙${economy.format(user.wallet || 0)}* cash.` }, { quoted: message });
        return;
    }

    user.wallet -= amount;
    user.bank = (user.bank || 0) + amount;

    economy.addTransaction(user, {
        type: "spend",
        description: "Bank Deposit",
        amount
    });
    economy.save();

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const text =
`╭━━〔 🏦 BANK DEPOSIT 〕━━╮
┃
┃ ✅ *DEPOSITED SUCCESSFULLY!*
┃
┃ 👤 ${tag}
┃ 💵 Deposited: *+${economy.format(amount)} coins*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃ 🏦 Bank: *🪙${economy.format(user.bank)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
