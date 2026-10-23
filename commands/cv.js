const economy = require("../config/economy-system");

const CV_COST = 5000;
const CV_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

function formatTimeRemaining(ms) {
    if (ms <= 0) return "Expired";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    return [days > 0 ? `${days}d` : "", hours > 0 || days > 0 ? `${hours}h` : "", `${minutes}m`].filter(Boolean).join(" ");
}

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    let user = economy.getUser(who.id);
    if (!user) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;
    const now = Date.now();
    const action = (args && args[0] ? args[0] : "").toLowerCase();

    if (user.cv && now > user.cv.expiresAt + GRACE_PERIOD_MS) {
        user.cv = null;
        user.job = null;
        economy.save();
    }

    if (action === "buy" || action === "get" || action === "pay") {
        if ((user.wallet || 0) < CV_COST) {
            await sock.sendMessage(jid, inGroup ? { text: `❌ Insufficient funds! You need *🪙${economy.format(CV_COST)}* for a CV.`, mentions: [who.jid] } : { text: `❌ Insufficient funds!` }, { quoted: message });
            return;
        }

        user.wallet -= CV_COST;
        user.cv = { createdAt: now, expiresAt: now + CV_DURATION_MS };

        economy.addTransaction(user, { type: "spend", description: "CV Purchase", amount: CV_COST });
        economy.save();

        const text =
`╭━━〔 📄 CURRICULUM VITAE 〕━━╮
┃
┃ ✅ *CV SUCCESSFULLY ISSUED!*
┃ 💸 Paid: *-${economy.format(CV_COST)} coins*
┃ ⏳ Valid for: *14 Days*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    const cv = user.cv;
    if (!cv) {
        const text = `╭━━〔 📄 CV 〕━━╮\n┃ ⚠️ No CV found! Type *.cv buy* (🪙5,000).\n╰━━━━━━━━━━━━━━━╯`;
        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    const timeRemaining = formatTimeRemaining(cv.expiresAt - now);
    const text = `╭━━〔 📄 CV STATUS 〕━━╮\n┃ ✅ Valid & Verified\n┃ ⏳ Expires in: *${timeRemaining}*\n╰━━━━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
