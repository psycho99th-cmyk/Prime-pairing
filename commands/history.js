const economy = require("../config/economy-system");

function formatDate(timestamp) {
    const d = new Date(timestamp);
    const dateStr = d.toLocaleDateString("en-GB"); // DD/MM/YYYY
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} at ${timeStr}`;
}

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const sender = economy.getUser(who.id);
    if (!sender) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    let targetUser = sender;
    let targetJid = contextInfo.mentionedJid?.[0] || contextInfo.participant || null;
    let isOther = false;

    if (targetJid) {
        // Restrict inspecting other players' history strictly to the bot account / owner
        if (!message.key?.fromMe) {
            await sock.sendMessage(jid, { text: "❌ You can only check your own transaction history!" }, { quoted: message });
            return;
        }

        const found = economy.findUserByJid(targetJid);
        if (found) {
            targetUser = found;
            isOther = true;
        } else {
            await sock.sendMessage(jid, { text: "❌ That user is not registered in the economy yet!" }, { quoted: message });
            return;
        }
    }

    const history = targetUser.history || [];
    let historyLines = "• No transactions recorded yet 📭";

    if (history.length > 0) {
        // Show newest first
        historyLines = history.slice().reverse().map((tx, index) => {
            const timeStr = formatDate(tx.timestamp);
            if (tx.type === "sent") {
                return `${index + 1}. 📤 *Sent* 🪙${economy.format(tx.amount)} to ${tx.recipient}\n   └ Tax paid: 🪙${economy.format(tx.tax)} | 🕒 ${timeStr}`;
            } else if (tx.type === "received") {
                return `${index + 1}. 📥 *Received* 🪙${economy.format(tx.amount)} from ${tx.sender}\n   └ 🕒 ${timeStr}`;
            } else if (tx.type === "spend") {
                return `${index + 1}. 🛍️ *Spent* 🪙${economy.format(tx.amount)} (${tx.description})\n   └ 🕒 ${timeStr}`;
            } else if (tx.type === "earn") {
                return `${index + 1}. 🪙 *Earned* 🪙${economy.format(tx.amount)} (${tx.description})\n   └ 🕒 ${timeStr}`;
            }
            return `${index + 1}. 📄 Transaction (🪙${economy.format(tx.amount || 0)})\n   └ 🕒 ${timeStr}`;
        }).join("\n\n");
    }

    const inGroup = jid.endsWith("@g.us");
    const tag = isOther ? `@${(targetUser.jid || targetJid).split("@")[0].replace(":", "")}` : (who.jid ? `@${who.jid.split("@")[0]}` : `*${targetUser.name}*`);

    const text =
`╭━━〔 📜 TRANSACTION HISTORY 〕━━╮
┃
┃ 👤 Account: ${tag}
┃ 📊 Last ${Math.min(history.length, 15)} Transactions:
┃
${historyLines}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    const allMentions = isOther ? [targetUser.jid || targetJid].filter(Boolean) : (who.jid ? [who.jid] : []);

    await sock.sendMessage(jid, inGroup ? { text, mentions: allMentions } : { text }, { quoted: message });
};

module.exports.public = true;
