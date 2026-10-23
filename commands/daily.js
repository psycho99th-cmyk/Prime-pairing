const economy = require("../config/economy-system");
const DAILY_REWARD = 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function formatTimeRemaining(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const seconds = Math.floor((ms / 1000) % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

module.exports = async ({ sock, jid, message }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;
    const user = economy.getUser(who.id);
    if (!user) return;

    const now = Date.now();
    const nextClaim = user.cooldowns?.daily || 0;
    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    if (now < nextClaim) {
        await sock.sendMessage(jid, inGroup ? { text: `⏳ Come back in *${formatTimeRemaining(nextClaim - now)}*.`, mentions: [who.jid] } : { text: `⏳ Cooldown active.` }, { quoted: message });
        return;
    }

    user.wallet = (user.wallet || 0) + DAILY_REWARD;
    if (!user.cooldowns) user.cooldowns = {};
    user.cooldowns.daily = now + COOLDOWN_MS;

    economy.addTransaction(user, { type: "earn", description: "Daily Reward", amount: DAILY_REWARD });
    economy.save();

    const text = `╭━━〔 🪙 DAILY REWARD 〕━━╮\n┃ ✅ Claimed *+${economy.format(DAILY_REWARD)} coins*!\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
