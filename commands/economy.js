const economy = require("../config/economy-system");

module.exports = async ({ sock, jid, message }) => {
    const text =
`╭━━〔 🪙 PRIME ECONOMY GUIDE 〕━━╮
┃
┃ 📊 *Finances & Account:*
┃ • *.balance* - Check your wallet & bank balance
┃ • *.daily* - Claim your daily 🪙1,000 reward
┃ • *.deposit <amount>* - Store cash in bank (Min: 🪙1k)
┃ • *.withdraw <amount>* - Take cash out of bank (Min: 🪙1k)
┃ • *.give @user <amount>* - Send coins to players (5% tax)
┃ • *.history* - View your last 15 transactions
┃
┃ 💼 *Career & Education:*
┃ • *.cv buy* - Purchase a 14-day valid CV (🪙5,000)
┃ • *.work* - Collect your job salary shift
┃ • *.school* - Manage academic enrollment & graduation
┃
┃ 🎰 *Casino & Betting:*
┃ • *.bet dice <amount> <1-6>* - Pick exact number (Min: 🪙2k, 5x win)
┃ • *.bet flip <amount> <heads/tails>* - Guess coin outcome (Min: 🪙500, 2x win)
┃
┃ 🛒 *Shop & Garage:*
┃ • *.shop* (or *.show*) - View available cars & prices
┃ • *.buy car <number>* - Purchase a car into your garage
┃ • *.inv* (or *.inventory*) - Inspect your garage & certificates
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, { text }, { quoted: message });
};

module.exports.public = true;
