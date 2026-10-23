const economy = require("../config/economy-system");

module.exports = async ({ sock, jid, message }) => {

    const who = await economy.identify(sock, message);

    if (!who.id) {
        await sock.sendMessage(
            jid,
            { text: "❌ Could not identify you. Try again in a moment." },
            { quoted: message }
        );
        return;
    }

    // In groups the person is tagged, in DMs the name is shown
    const inGroup = jid.endsWith("@g.us") && who.jid;

    const tag = inGroup
        ? `@${who.jid.split("@")[0]}`
        : `*${who.name}*`;

    const existing = economy.getUser(who.id);

    let text;

    if (existing) {

        text =
`╭━━〔 💰 PRIME ECONOMY 〕━━╮
┃
┃ ℹ️ You are already registered.
┃
┃ 👤 ${tag}
┃ 👛 Wallet: *${economy.format(existing.wallet)}*
┃ 🏦 Bank: *${economy.format(existing.bank)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    } else {

        const user = economy.createUser(who);

        text =
`╭━━〔 💰 PRIME ECONOMY 〕━━╮
┃
┃ ✅ *REGISTERED!*
┃
┃ 👤 ${tag}
┃ 🪙 Starting coins: *${economy.format(user.wallet)}*
┃
┃ Welcome to the economy! 🎉
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
    }

    await sock.sendMessage(
        jid,
        inGroup ? { text, mentions: [who.jid] } : { text },
        { quoted: message }
    );
};

// Anyone can use this command, not only the owner and paired users
module.exports.public = true;
