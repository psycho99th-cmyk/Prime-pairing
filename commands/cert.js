const economy = require("../config/economy-system");

const CERT_NAMES = {
    mechanic: "🧹 Mechanic Trade Certificate",
    business: "🛒 Business & Retail Diploma",
    cs: "💻 Computer Science Degree",
    law: "⚖️ Bachelor of Laws (LL.B)",
    medical: "🩺 Doctor of Medicine (M.D.)"
};

module.exports = async ({ sock, jid, message }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) return;

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const certs = user.certificates || [];
    const certListStr = certs.length > 0
        ? certs.map(c => `• ${CERT_NAMES[c] || c}`).join("\n┃ ")
        : "None yet ❌ (Enroll via *.school*)";

    const text =
`╭━━〔 📜 YOUR CERTIFICATES 〕━━╮
┃
┃ 👤 ${tag}
┃ 🎓 *Permanent Qualifications:*
┃ ${certListStr}
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
