const economy = require("../config/economy-system");

const MIN_DICE_BET = 2000;
const MIN_FLIP_BET = 500;
const MAX_BET = 50000;

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const subCommand = (args && args[0] ? args[0] : "").toLowerCase();
    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    if (subCommand !== "dice" && subCommand !== "flip") {
        const text =
`╭━━〔 🎲 PRIME CASINO 〕━━╮
┃
┃ 👤 ${tag}
┃ 🎰 *Available Betting Games:*
┃
┃ • Dice Roll: *.bet dice <amount> <number 1-6>*
┃   *(Min: 🪙2k | Max: 🪙50k | Win 5x on exact match)*
┃
┃ • Coin Flip: *.bet flip <amount> <heads/tails>*
┃   *(Min: 🪙500 | Max: 🪙50k | Win 2x on correct guess)*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 1. DICE GAME (.bet dice <amount> <number 1-6>)
    if (subCommand === "dice") {
        const numericArgs = args.slice(1).map(arg => parseInt(arg, 10)).filter(n => !isNaN(n));
        const targetNum = numericArgs.find(n => n >= 1 && n <= 6);
        const amount = numericArgs.find(n => n !== targetNum);

        if (!targetNum || !amount || isNaN(amount)) {
            await sock.sendMessage(
                jid,
                { text: `❌ Invalid format! Pick a number from 1 to 6.\nExample: *.bet dice 2000 4*` },
                { quoted: message }
            );
            return;
        }

        if (amount < MIN_DICE_BET || amount > MAX_BET) {
            await sock.sendMessage(jid, { text: `❌ Dice bet must be between *🪙${economy.format(MIN_DICE_BET)}* and *🪙${economy.format(MAX_BET)}*!` }, { quoted: message });
            return;
        }

        if ((user.wallet || 0) < amount) {
            await sock.sendMessage(jid, { text: `❌ Insufficient cash in your wallet! You have *🪙${economy.format(user.wallet || 0)}* cash.` }, { quoted: message });
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        const won = roll === targetNum;

        if (won) {
            const winnings = amount * 5;
            user.wallet += winnings;
            economy.addTransaction(user, { type: "earn", description: `Casino Dice Exact Win (Rolled ${roll})`, amount: winnings });
            economy.save();

            const text =
`╭━━〔 🎲 DICE ROLL 〕━━╮
┃
┃ 🎯 *JACKPOT! EXACT MATCH!*
┃
┃ 👤 ${tag}
┃ 🎲 Rolled: *${roll}* | Your Pick: *${targetNum}*
┃ 🪙 Payout: *+${economy.format(winnings)} coins (5x)*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        } else {
            user.wallet -= amount;
            economy.addTransaction(user, { type: "spend", description: `Casino Dice Loss (Rolled ${roll}, Picked ${targetNum})`, amount });
            economy.save();

            const text =
`╭━━〔 🎲 DICE ROLL 〕━━╮
┃
┃ 💀 *YOU MISSED!*
┃
┃ 👤 ${tag}
┃ 🎲 Rolled: *${roll}* | Your Pick: *${targetNum}*
┃ 💸 Lost: *-${economy.format(amount)} coins*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        }
        return;
    }

    // 2. COIN FLIP (.bet flip <amount> <heads/tails>)
    if (subCommand === "flip") {
        const amountArg = args.find(arg => /^\d+$/.test(arg));
        const amount = parseInt(amountArg, 10);

        if (isNaN(amount) || amount <= 0) {
            await sock.sendMessage(jid, { text: `❌ Please specify a valid bet amount!\nExample: *.bet flip 1000 heads*` }, { quoted: message });
            return;
        }

        if (amount < MIN_FLIP_BET || amount > MAX_BET) {
            await sock.sendMessage(jid, { text: `❌ Coin flip bet must be between *🪙${economy.format(MIN_FLIP_BET)}* and *🪙${economy.format(MAX_BET)}*!` }, { quoted: message });
            return;
        }

        if ((user.wallet || 0) < amount) {
            await sock.sendMessage(jid, { text: `❌ Insufficient cash in your wallet! You have *🪙${economy.format(user.wallet || 0)}* cash.` }, { quoted: message });
            return;
        }

        const choiceArg = args.find(arg => {
            const lower = arg.toLowerCase();
            return lower === "heads" || lower === "h" || lower === "tails" || lower === "t";
        });

        if (!choiceArg) {
            await sock.sendMessage(jid, { text: `❌ Please choose *heads* or *tails*!\nExample: *.bet flip 1000 heads*` }, { quoted: message });
            return;
        }

        const choice = choiceArg.toLowerCase().startsWith("h") ? "heads" : "tails";
        const outcome = Math.random() < 0.5 ? "heads" : "tails";
        const won = choice === outcome;

        if (won) {
            user.wallet += amount;
            economy.addTransaction(user, { type: "earn", description: `Casino Flip Win (${outcome})`, amount });
            economy.save();

            const text =
`╭━━〔 🪙 COIN FLIP 〕━━╮
┃
┃ 🎉 *YOU WON!*
┃
┃ 👤 ${tag}
┃ 🪙 Result: *${outcome.toUpperCase()}* (You guessed ${choice})
┃ 💰 Payout: *+${economy.format(amount)} coins*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        } else {
            user.wallet -= amount;
            economy.addTransaction(user, { type: "spend", description: `Casino Flip Loss (${outcome})`, amount });
            economy.save();

            const text =
`╭━━〔 🪙 COIN FLIP 〕━━╮
┃
┃ 💀 *YOU LOST!*
┃
┃ 👤 ${tag}
┃ 🪙 Result: *${outcome.toUpperCase()}* (You guessed ${choice})
┃ 💸 Lost: *-${economy.format(amount)} coins*
┃ 👛 Wallet: *🪙${economy.format(user.wallet)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;
            await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        }
        return;
    }
};

module.exports.public = true;
