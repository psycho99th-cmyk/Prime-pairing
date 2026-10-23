const economy = require("../config/economy-system");
const WORK_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const JOBS = {
    cleaner: { name: "🧹 Cleaner", salary: 800 },
    driver: { name: "🛵 Delivery Driver", salary: 1800 },
    mechanic: { name: "🔧 Mechanic", salary: 2500 },
    cashier: { name: "🛒 Store Cashier", salary: 3500 },
    developer: { name: "💻 Software Developer", salary: 6000 },
    lawyer: { name: "⚖️ Lawyer", salary: 8500 },
    doctor: { name: "🩺 Doctor", salary: 12000 }
};

module.exports = async ({ sock, jid, message }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;
    let user = economy.getUser(who.id);
    if (!user || !user.job || !JOBS[user.job]) return;

    const now = Date.now();
    if (now < (user.cooldowns?.work || 0)) return;

    const jobInfo = JOBS[user.job];
    user.wallet = (user.wallet || 0) + jobInfo.salary;
    if (!user.cooldowns) user.cooldowns = {};
    user.cooldowns.work = now + WORK_COOLDOWN_MS;

    economy.addTransaction(user, { type: "earn", description: `Work Shift (${jobInfo.name})`, amount: jobInfo.salary });
    economy.save();

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const text = `╭━━〔 💼 WORK SHIFT 〕━━╮\n┃ ✅ Earned *+${economy.format(jobInfo.salary)} coins* as ${jobInfo.name}!\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
