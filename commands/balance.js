const economy = require("../config/economy-system");

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const sender = economy.getUser(who.id);
    if (!sender) {
        await sock.sendMessage(
            jid,
            { text: "❌ You are not registered yet! Type *.register* to join the economy." },
            { quoted: message }
        );
        return;
    }

    const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    let targetJid = null;
    let targetUser = sender;
    let isOther = false;

    const mentions = contextInfo.mentionedJid || [];
    if (mentions.length > 0) {
        targetJid = mentions[0];
    } else if (contextInfo.participant) {
        targetJid = contextInfo.participant;
    }

    if (targetJid) {
        // Restrict checking other balances strictly to the bot account / owner
        const isBotAccount = message.key?.fromMe;
        if (!isBotAccount) {
            await sock.sendMessage(
                jid,
                { text: "❌ You can only check your own balance!" },
                { quoted: message }
            );
            return;
        }

        const found = economy.findUserByJid(targetJid);
        if (found) {
            targetUser = found;
            isOther = true;
        } else {
            await sock.sendMessage(
                jid,
                { text: "❌ That user is not registered in the economy yet!" },
                { quoted: message }
            );
            return;
        }
    }

    const inGroup = jid.endsWith("@g.us");
    let tag;
    let targetTagJid = null;

    if (isOther) {
        targetTagJid = targetUser.jid || targetJid;
        tag = `@${targetTagJid.split("@")[0].replace(":", "")}`;
    } else {
        tag = who.jid ? `@${who.jid.split("@")[0]}` : `*${targetUser.name}*`;
        targetTagJid = who.jid;
    }

    const wallet = economy.format(targetUser.wallet || 0);
    const bank = economy.format(targetUser.bank || 0);

    const text =
`╭━━〔 🏦 ACCOUNT BALANCE 〕━━╮
┃
┃ 👤 Account: ${tag}
┃ 💵 Cash (Wallet): *🪙${wallet}*
┃ 🏦 Bank Account: *🪙${bank}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    const allMentions = targetTagJid ? [targetTagJid] : [];

    await sock.sendMessage(
        jid,
        inGroup ? { text, mentions: allMentions } : { text },
        { quoted: message }
    );
};

module.exports.public = true;
