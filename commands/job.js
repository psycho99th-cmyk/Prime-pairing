const economy = require("../config/economy-system");

const JOBS = {
    cleaner: { name: "🧹 Cleaner", salary: 800, cert: null },
    driver: { name: "🛵 Delivery Driver", salary: 1800, cert: null },
    mechanic: { name: "🔧 Mechanic", salary: 2500, cert: "mechanic" },
    cashier: { name: "🛒 Store Cashier", salary: 3500, cert: "business" },
    developer: { name: "💻 Software Developer", salary: 6000, cert: "cs" },
    lawyer: { name: "⚖️ Lawyer", salary: 8500, cert: "law" },
    doctor: { name: "🩺 Doctor", salary: 12000, cert: "medical" }
};

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) return;

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const subCommand = (args && args[0] ? args[0] : "").toLowerCase();
    const jobKey = (args && args[1] ? args[1] : "").toLowerCase();

    if (subCommand === "quit" || subCommand === "resign") {
        if (!user.job) {
            await sock.sendMessage(jid, { text: `❌ ${tag}, you don't have a job to quit!` }, inGroup ? { mentions: [who.jid] } : {});
            return;
        }
        user.job = null;
        if (user.cooldowns) delete user.cooldowns.work;
        economy.save();

        const text =
`╭━━〔 💼 EMPLOYMENT 〕━━╮
┃
┃ 🚪 *RESIGNED FROM JOB*
┃
┃ 👤 ${tag}
┃ You are now unemployed. Type *.job list* to find a new job.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    if (subCommand === "apply") {
        if (!user.cv || Date.now() > user.cv.expiresAt + (24 * 60 * 60 * 1000)) {
            const text =
`╭━━〔 📄 EMPLOYMENT ERROR 〕━━╮
┃
┃ ❌ *VALID CV REQUIRED!*
┃
┃ 👤 ${tag}
┃ You need a valid, non-expired CV to apply for jobs.
┃ 👉 Type *.cv buy* to get or renew your CV.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
            return;
        }

        if (user.job) {
            const text =
`╭━━〔 💼 EMPLOYMENT ERROR 〕━━╮
┃
┃ ⚠️ *ALREADY EMPLOYED!*
┃
┃ 👤 ${tag}
┃ You must resign first before applying for a new job!
┃ 👉 Type *.job quit* to resign.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
            return;
        }

        if (!jobKey || !JOBS[jobKey]) {
            const text =
`╭━━〔 💼 AVAILABLE JOBS 〕━━╮
┃
┃ ❌ *INVALID JOB SPECIFIED!*
┃ Choose a valid job code to apply.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
            return;
        }

        const selectedJob = JOBS[jobKey];

        // Check Certificate Requirement
        if (selectedJob.cert) {
            const hasCert = (user.certificates || []).includes(selectedJob.cert);
            if (!hasCert) {
                const text =
`╭━━〔 🎓 REQUIREMENT ERROR 〕━━╮
┃
┃ ❌ *CERTIFICATE REQUIRED!*
┃
┃ 👤 ${tag}
┃ You need the certificate for this job!
┃ 👉 Complete study in *.school* first.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
                await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
                return;
            }
        }

        // Assign job and start the 3-hour countdown from application time
        user.job = jobKey;
        if (!user.cooldowns) user.cooldowns = {};
        user.cooldowns.work = Date.now() + (3 * 60 * 60 * 1000); // 3 hours countdown from application
        economy.save();

        const text =
`╭━━〔 💼 EMPLOYMENT 〕━━╮
┃
┃ 🎉 *HIRED SUCCESSFULLY!*
┃
┃ 👤 ${tag}
┃ 🏷️ Position: *${selectedJob.name}*
┃ 💰 Salary: *🪙${economy.format(selectedJob.salary)} / shift*
┃
┃ ⏱️ Your 3-hour shift countdown has started!
┃ 👉 Type *.work* in 3 hours to collect your first salary.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    const currentJob = user.job ? JOBS[user.job] : null;
    const jobStatusStr = currentJob ? `${currentJob.name} (*🪙${economy.format(currentJob.salary)}/shift*)` : "Unemployed ❌";

    const text =
`╭━━〔 💼 CAREER & JOBS 〕━━╮
┃
┃ 👤 ${tag}
┃ 📌 Current Job: *${jobStatusStr}*
┃
┃ 📋 *Available Careers (Payout every 3h):*
┃ • Cleaner: *.job apply cleaner* (🪙800)
┃ • Driver: *.job apply driver* (🪙1,800)
┃ • Mechanic: *.job apply mechanic* (🪙2,500)
┃ • Cashier: *.job apply cashier* (🪙3,500)
┃ • Developer: *.job apply developer* (🪙6,000)
┃ • Lawyer: *.job apply lawyer* (🪙8,500)
┃ • Doctor: *.job apply doctor* (🪙12,000)
┃
┃ 💡 *Commands:* Apply: *.job apply <name>* | Quit: *.job quit*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
