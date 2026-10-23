const sportySystem = require("../config/sporty-system");
const economy = require("../config/economy-system");

const MIN_STAKE = 500;
const MAX_STAKE = 100000;

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const sportyData = sportySystem.loadSporty(sock);
    const action = (args && args[0] ? args[0] : "").toLowerCase();
    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const timeLeftMs = sportyData.expiresAt - Date.now();
    const isLivePhase = timeLeftMs <= (3 * 60 * 1000);

    // 1. PLACE MULTIBET: .sporty bet <matchId:selection,...> <amount>
    if (action === "bet") {
        if (isLivePhase) {
            await sock.sendMessage(jid, { text: `❌ Betting is closed! Matches are in the live simulation phase.` }, { quoted: message });
            return;
        }

        const legsArg = args[1];
        const stakeArg = args[2];

        if (!legsArg || !stakeArg || !/^\d+$/.test(stakeArg)) {
            await sock.sendMessage(jid, {
                text: `❌ Invalid format!\nUsage: *.sporty bet <matchId:selection>,... <amount>*\nExample: *.sporty bet 3:1, 7:over, 12:btts_yes 5000*\n\n*(Markets: 1, X, 2 | over, under | btts_yes, btts_no)*`
            }, { quoted: message });
            return;
        }

        const stake = parseInt(stakeArg, 10);
        if (stake < MIN_STAKE || stake > MAX_STAKE) {
            await sock.sendMessage(jid, { text: `❌ Stake must be between *🪙${economy.format(MIN_STAKE)}* and *🪙${economy.format(MAX_STAKE)}*!` }, { quoted: message });
            return;
        }

        if ((user.wallet || 0) < stake) {
            await sock.sendMessage(jid, { text: `❌ Insufficient wallet cash! You have *🪙${economy.format(user.wallet || 0)}* cash.` }, { quoted: message });
            return;
        }

        const legItems = legsArg.split(",").map(s => s.trim()).filter(Boolean);
        if (legItems.length === 0) {
            await sock.sendMessage(jid, { text: `❌ No match selections provided!` }, { quoted: message });
            return;
        }

        let totalOdds = 1.0;
        const parsedLegs = [];

        for (const item of legItems) {
            const parts = item.split(":");
            if (parts.length < 2) {
                await sock.sendMessage(jid, { text: `❌ Invalid pick format: *${item}*. Use matchId:selection (e.g. 3:1 or 12:btts_yes)` }, { quoted: message });
                return;
            }

            const matchId = parseInt(parts[0], 10);
            const rawSel = parts[1].toLowerCase();
            const marketInput = parts.length === 3 ? parts[1].toLowerCase() : (rawSel === "over" || rawSel === "under" || rawSel.startsWith("btts") ? rawSel : "1x2");
            const actualSelection = parts.length === 3 ? parts[2].toLowerCase() : rawSel;

            const match = sportyData.matches.find(m => m.id === matchId);
            if (!match) {
                await sock.sendMessage(jid, { text: `❌ Match #${matchId} does not exist in this round!` }, { quoted: message });
                return;
            }

            let odd = 0;
            let marketType = "";
            let selectionName = "";

            if (marketInput === "1x2" || actualSelection === "1" || actualSelection === "x" || actualSelection === "2") {
                marketType = "1x2";
                const sel = actualSelection.toUpperCase();
                if (sel === "1") { odd = match.odds.homeWin; selectionName = `${match.home} (Home Win)`; }
                else if (sel === "X") { odd = match.odds.draw; selectionName = `Draw`; }
                else if (sel === "2") { odd = match.odds.awayWin; selectionName = `${match.away} (Away Win)`; }
                else {
                    await sock.sendMessage(jid, { text: `❌ Invalid 1X2 pick for Match #${matchId}. Use 1, X, or 2.` }, { quoted: message });
                    return;
                }
            } else if (marketInput === "over" || marketInput === "under") {
                marketType = marketInput;
                if (marketInput === "over") { odd = match.odds.over25; selectionName = `Over 2.5 Goals`; }
                else { odd = match.odds.under25; selectionName = `Under 2.5 Goals`; }
            } else if (marketInput === "btts_yes" || marketInput === "btts_no" || actualSelection === "btts_yes" || actualSelection === "btts_no") {
                const bttsPick = marketInput.startsWith("btts") ? marketInput : actualSelection;
                marketType = bttsPick;
                if (bttsPick === "btts_yes") { odd = match.odds.bttsYes; selectionName = `BTTS: Yes`; }
                else { odd = match.odds.bttsNo; selectionName = `BTTS: No`; }
            } else {
                await sock.sendMessage(jid, { text: `❌ Invalid market/selection for Match #${matchId}.` }, { quoted: message });
                return;
            }

            totalOdds *= odd;
            parsedLegs.push({
                matchId,
                market: marketType,
                selection: actualSelection.toUpperCase() === "X" ? "X" : actualSelection.toLowerCase(),
                matchStr: `${match.home} vs ${match.away}`,
                pickStr: selectionName,
                odd
            });
        }

        user.wallet -= stake;
        const potentialPayout = Math.round(stake * totalOdds);
        const bookingCode = sportySystem.generateBookingCode();

        if (!sportyData.slips) sportyData.slips = [];
        sportyData.slips.push({
            code: bookingCode,
            userId: who.id,
            chatJid: jid,
            stake,
            totalOdds,
            potentialPayout,
            legs: parsedLegs,
            timestamp: Date.now()
        });

        economy.addTransaction(user, {
            type: "spend",
            description: `SportyBet Multibet Slip (${bookingCode}, Odds: ${totalOdds.toFixed(2)}x)`,
            amount: stake
        });
        sportySystem.saveSporty(sportyData);

        const legsDisplay = parsedLegs.map(l => `• [${l.matchStr}] ➔ *${l.pickStr}* (@${l.odd})`).join("\n");
        const text =
`╭━━〔 🎫 TICKET BOOKED 〕━━╮
┃
┃ 👤 ${tag}
┃ 🔑 Booking Code: *[ ${bookingCode} ]*
┃ 📊 Total Legs: *${parsedLegs.length}*
┃ 📈 Total Odds: *${totalOdds.toFixed(2)}x*
┃ 💵 Stake: *🪙${economy.format(stake)}*
┃ 💰 Potential Payout: *🪙${economy.format(potentialPayout)}*
┃
┃ *Selections:*
${legsDisplay}
┃
┃ 💡 Share code: *.sporty load ${bookingCode} <amount>*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 2. LOAD BOOKING CODE: .sporty load <code> <amount>
    if (action === "load") {
        if (isLivePhase) {
            await sock.sendMessage(jid, { text: `❌ Betting is closed! Matches are in the live simulation phase.` }, { quoted: message });
            return;
        }

        const targetCode = (args[1] || "").toUpperCase();
        const stakeArg = args[2];

        if (!targetCode || !stakeArg || !/^\d+$/.test(stakeArg)) {
            await sock.sendMessage(jid, { text: `❌ Usage: *.sporty load <code> <amount>*\nExample: *.sporty load PRIME4821 5000*` }, { quoted: message });
            return;
        }

        const stake = parseInt(stakeArg, 10);
        if (stake < MIN_STAKE || stake > MAX_STAKE) {
            await sock.sendMessage(jid, { text: `❌ Stake must be between *🪙${economy.format(MIN_STAKE)}* and *🪙${economy.format(MAX_STAKE)}*!` }, { quoted: message });
            return;
        }

        if ((user.wallet || 0) < stake) {
            await sock.sendMessage(jid, { text: `❌ Insufficient wallet cash! You have *🪙${economy.format(user.wallet || 0)}* cash.` }, { quoted: message });
            return;
        }

        const originalSlip = (sportyData.slips || []).find(s => s.code.toUpperCase() === targetCode);
        if (!originalSlip) {
            await sock.sendMessage(jid, { text: `❌ Booking code *${targetCode}* was not found or has expired!` }, { quoted: message });
            return;
        }

        user.wallet -= stake;
        const totalOdds = originalSlip.totalOdds;
        const potentialPayout = Math.round(stake * totalOdds);
        const newCode = sportySystem.generateBookingCode();

        sportyData.slips.push({
            code: newCode,
            userId: who.id,
            chatJid: jid,
            stake,
            totalOdds,
            potentialPayout,
            legs: originalSlip.legs,
            timestamp: Date.now()
        });

        economy.addTransaction(user, {
            type: "spend",
            description: `SportyBet Loaded Ticket (${newCode} from ${originalSlip.code})`,
            amount: stake
        });
        sportySystem.saveSporty(sportyData);

        const text =
`╭━━〔 🎫 TICKET LOADED 〕━━╮
┃
┃ 👤 ${tag}
┃ 🔗 Loaded Code: *${originalSlip.code}* ➔ New Code: *[ ${newCode} ]*
┃ 📈 Total Odds: *${totalOdds.toFixed(2)}x*
┃ 💵 Stake: *🪙${economy.format(stake)}*
┃ 💰 Potential Payout: *🪙${economy.format(potentialPayout)}*
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 3. VIEW USER SLIPS: .sporty slips
    if (action === "slips") {
        const userSlips = (sportyData.slips || []).filter(s => s.userId === who.id);
        if (userSlips.length === 0) {
            await sock.sendMessage(jid, { text: `❌ You have no active betting slips for this round!` }, { quoted: message });
            return;
        }

        const slipsList = userSlips.map(s => 
            `• Code: *[${s.code}]* | Legs: ${s.legs.length} | Odds: *${s.totalOdds.toFixed(2)}x*\n   └ Stake: 🪙${economy.format(s.stake)} ➔ Win: *🪙${economy.format(s.potentialPayout)}*`
        ).join("\n\n");

        const text =
`╭━━〔 📋 YOUR ACTIVE SLIPS 〕━━╮
┃
┃ 👤 ${tag}
┃
${slipsList}
┃
┃ ⏳ Round settles in: *${sportySystem.formatTimeRemaining(timeLeftMs)}*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 4. SPORTY HISTORY: .sporty history
    if (action === "history") {
        const historyList = (sportyData.settledHistory || []).filter(h => h.userId === who.id).slice(0, 8);
        if (historyList.length === 0) {
            await sock.sendMessage(jid, { text: `❌ You have no settled football betting history yet!` }, { quoted: message });
            return;
        }

        const histDisplay = historyList.map(h => 
            `• Code: [${h.code}] | Odds: ${h.totalOdds.toFixed(2)}x\n   └ Stake: 🪙${economy.format(h.stake)} ➔ ${h.won ? `🟢 *WON (+🪙${economy.format(h.payout)})*` : `❌ *Lost*`}`
        ).join("\n\n");

        const text =
`╭━━〔 📜 SPORTYBET HISTORY 〕━━╮
┃
┃ 👤 ${tag}
┃
${histDisplay}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 5. LIVE CENTER: .sporty live
    if (action === "live") {
        const matchSample = sportyData.matches.slice(0, 8).map(m => {
            const hGoals = Math.floor(Math.random() * 3);
            const aGoals = Math.floor(Math.random() * 3);
            const minute = Math.floor(Math.random() * 75) + 15;
            return `• ${m.home} *${hGoals} - ${aGoals}* ${m.away} (${minute}')`;
        }).join("\n");

        const text =
`╭━━〔 🔴 SPORTYBET LIVE CENTER 〕━━╮
┃
┃ ⏱️ Time Remaining: *${sportySystem.formatTimeRemaining(timeLeftMs)}*
┃ ⚽ *Live Simulation Feed:*
${matchSample}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 6. DEFAULT VIEW: MATCHES LIST
    const timeRemaining = sportySystem.formatTimeRemaining(timeLeftMs);
    const statusNote = isLivePhase ? "🔴 *MATCHES IN PLAY (Betting Closed)*" : `🟢 *BETTING OPEN* (${timeRemaining})`;
    
    const matchesList = sportyData.matches.slice(0, 12).map(m => 
        `*#${m.id}* | ${m.home} vs ${m.away}\n   └ 1[${m.odds.homeWin}] X[${m.odds.draw}] 2[${m.odds.awayWin}] | O[${m.odds.over25}] U[${m.odds.under25}] | BTTS:[Y:${m.odds.bttsYes} N:${m.odds.bttsNo}]`
    ).join("\n\n");

    const text =
`╭━━〔 ⚽ SPORTYBET MATCHES 〕━━╮
┃
┃ 🏟️ Round #${sportyData.roundId} | ${statusNote}
┃
${matchesList}
┃
┃ 💡 *Commands:*
┃ • *.sporty bet 3:1, 7:btts_yes 5000*
┃ • *.sporty load PRIME4821 10000*
┃ • *.sporty slips* | *.sporty history*
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
