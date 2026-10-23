const economy = require("../config/economy-system");

const MIN_GIVE = 300;
const MAX_GIVE = 100000;
const TAX_RATE = 0.05;

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const sender = economy.getUser(who.id);
    if (!sender) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    let recipientJid = contextInfo.mentionedJid?.[0] || contextInfo.participant || null;

    if (!recipientJid) {
        await sock.sendMessage(jid, { text: `❌ Please tag someone or reply to their message!\nExample: *.give @user 2000*` }, { quoted: message });
        return;
    }

    const recipient = economy.findUserByJid(recipientJid);
    if (!recipient) {
        await sock.sendMessage(jid, { text: "❌ That user is not registered in the economy yet!" }, { quoted: message });
        return;
    }

    if (recipient.id === sender.id) {
        await sock.sendMessage(jid, { text: "❌ You cannot send coins to yourself!" }, { quoted: message });
        return;
    }

    const amountArg = args.find(arg => /^\d+$/.test(arg));
    const amount = parseInt(amountArg, 10);

    if (isNaN(amount) || amount < MIN_GIVE || amount > MAX_GIVE) {
        await sock.sendMessage(jid, { text: `❌ Amount must be between *🪙${economy.format(MIN_GIVE)}* and *🪙${economy.format(MAX_GIVE)}*!` }, { quoted: message });
        return;
    }

    const tax = Math.round(amount * TAX_RATE);
    const totalDeduction = amount + tax;

    if ((sender.wallet || 0) < totalDeduction) {
        await sock.sendMessage(jid, { text: `❌ Insufficient funds! You need *🪙${economy.format(totalDeduction)}* total (includes 5% tax of 🪙${economy.format(tax)}).` }, { quoted: message });
        return;
    }

    sender.wallet -= totalDeduction;
    recipient.wallet = (recipient.wallet || 0) + amount;

    const recipientTagJid = recipient.jid || recipientJid;
    const recipientDisplay = `@${recipientTagJid.split("@")[0].replace(":", "")}`;

    // Log transaction history for sender
    economy.addTransaction(sender, {
        type: "sent",
        amount,
        tax,
        recipient: recipientDisplay
    });

    // Log transaction history for recipient
    economy.addTransaction(recipient, {
        type: "received",
        amount,
        sender: who.jid ? `@${who.jid.split("@")[0]}` : sender.name
    });

    economy.save();

    const inGroup = jid.endsWith("@g.us");
    const senderTag = who.jid ? `@${who.jid.split("@")[0]}` : `*${sender.name}*`;

    const text =
`╭━━〔 💸 COIN TRANSFER 〕━━╮
┃
┃ 📤 From: ${senderTag}
┃ 📥 To: ${recipientDisplay}
┃ 🪙 Amount Sent: *${economy.format(amount)} coins*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid, recipientTagJid].filter(Boolean) } : { text }, { quoted: message });
};

module.exports.public = true;
