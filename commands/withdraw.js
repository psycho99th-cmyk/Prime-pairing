const economy = require("../config/economy-system");

const MIN_WITHDRAW = 1000;
const MAX_WITHDRAW = 200000;

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
        await sock.sendMessage(jid, { text: `❌ Please specify a valid amount to withdraw!\nExample: *.withdraw 5000*` }, { quoted: message });
        return;
    }

    if (amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) {
        await sock.sendMessage(jid, { text: `❌ Withdrawal amount must be between *🪙${economy.format(MIN_WITHDRAW)}* and *🪙${economy.format(MAX_WITHDRAW)}*!` }, { quoted: message });
        return;
    }

    if ((user.bank || 0) < amount) {
        await sock.sendMessage(jid, { text: `❌ Insufficient funds in your bank! You have *🪙${economy.format(user.bank || 0)}* in your bank.` }, { quoted: message });
        return;
    }

    user.bank -= amount;
    user.wallet = (user.wallet || 0) + amount;

    economy.addTransaction(user, {
        type: "earn",
        description: "Bank Withdrawal",
        amount
    });
    economy.save();

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const text =
`╭━━〔 🏦 BANK WITHDRAWAL 〕━━╮
┃
┃ ✅ *WITHDRAWN SUCCESSFULLY!*
┃
┃ 👤 ${tag}
┃ 💵 Withdrawn: *+${economy.format(amount)} coins*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃ 🏦 Bank: *🪙${economy.format(user.bank)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
