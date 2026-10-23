const economy = require("../config/economy-system");

module.exports = async ({ sock, jid, message, args }) => {
    // Silent return if not the bot account / owner
    if (!message.key?.fromMe) return;

    const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    let recipientJid = contextInfo.mentionedJid?.[0] || contextInfo.participant || null;

    if (!recipientJid) return;

    const recipient = economy.findUserByJid(recipientJid);
    if (!recipient) {
        await sock.sendMessage(
            jid,
            { text: "❌ That user is not registered in the economy yet!" },
            { quoted: message }
        );
        return;
    }

    const amountArg = args.find(arg => /^\d+$/.test(arg));
    const amount = parseInt(amountArg, 10);

    if (isNaN(amount) || amount <= 0) {
        await sock.sendMessage(
            jid,
            { text: `❌ Please specify a valid amount!\nExample: *.addcoins @user 10000*` },
            { quoted: message }
        );
        return;
    }

    recipient.wallet = (recipient.wallet || 0) + amount;

    economy.addTransaction(recipient, {
        type: "earn",
        description: "Admin Added Coins",
        amount
    });
    economy.save();

    const recipientTagJid = recipient.jid || recipientJid;
    const recipientTag = `@${recipientTagJid.split("@")[0].replace(":", "")}`;

    const text =
`╭━━〔 🪙 ADMIN ADD COINS 〕━━╮
┃
┃ ✅ Successfully added: *+${economy.format(amount)} coins*
┃ 👤 Target: ${recipientTag}
┃ 👛 New Wallet: *🪙${economy.format(recipient.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(
        jid,
        { text, mentions: [recipientTagJid] },
        { quoted: message }
    );
};

module.exports.public = true;
