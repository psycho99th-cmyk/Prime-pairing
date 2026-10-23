const economy = require("../config/economy-system");

module.exports = async ({ sock, jid, message }) => {
    // Silent return if not the bot account / owner
    if (!message.key?.fromMe) return;

    const usersObj = economy.getAllUsers();
    const usersArray = Object.values(usersObj);

    if (usersArray.length === 0) {
        await sock.sendMessage(jid, { text: "📭 No registered users found in the economy yet." }, { quoted: message });
        return;
    }

    // Sort by total net worth (wallet + bank) descending
    usersArray.sort((a, b) => {
        const netA = (a.wallet || 0) + (a.bank || 0);
        const netB = (b.wallet || 0) + (b.bank || 0);
        return netB - netA;
    });

    const top10 = usersArray.slice(0, 10);
    const mentions = [];

    const listLines = top10.map((user, index) => {
        const netWorth = (user.wallet || 0) + (user.bank || 0);
        const displayName = user.name || `User ${user.id}`;
        
        let tagStr = displayName;
        if (user.jid) {
            mentions.push(user.jid);
            tagStr = `@${user.jid.split("@")[0].replace(":", "")}`;
        }

        const medals = ["👑", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        const rankMedal = medals[index] || `${index + 1}.`;

        return `${rankMedal} ${tagStr}\n   └ Net Worth: *🪙${economy.format(netWorth)}* (Wallet: 🪙${economy.format(user.wallet)} | Bank: 🪙${economy.format(user.bank)})`;
    }).join("\n\n");

    const text =
`╭━━〔 🏆 PRIME ECONOMY LEADERBOARD 〕━━╮
┃
┃ 📊 Top Richest Players (Wallet + Bank):
┃
${listLines}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(
        jid,
        { text, mentions },
        { quoted: message }
    );
};

module.exports.public = true;
