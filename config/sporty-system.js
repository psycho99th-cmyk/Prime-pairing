const fs = require("fs");
const path = require("path");
const economy = require("./economy-system");

const file = path.join(__dirname, "sporty.json");
const ROUND_DURATION_MS = 10 * 60 * 1000; // 10 minutes total per round

const CLUBS = [
    "Arsenal", "Liverpool", "Manchester City", "Chelsea", "Manchester United",
    "Tottenham", "Real Madrid", "Barcelona", "Atletico Madrid", "Bayern Munich",
    "Borussia Dortmund", "RB Leipzig", "Paris Saint-Germain", "Marseille",
    "Inter Milan", "AC Milan", "Juventus", "Napoli", "Ajax", "Porto",
    "Benfica", "Sporting CP", "Galatasaray", "Fenerbahce", "Aston Villa",
    "Newcastle", "Bayer Leverkusen", "AS Roma", "Lazio", "Villarreal"
];

function randomFloat(min, max, decimals = 2) {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
}

function generateBookingCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "PRIME";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function emptyData() {
    return {
        roundId: 1,
        expiresAt: Date.now() + ROUND_DURATION_MS,
        matches: [],
        slips: [],
        settledHistory: []
    };
}

function loadSporty(sock = null) {
    if (!fs.existsSync(file)) {
        const data = emptyData();
        data.matches = generateMatches();
        saveSporty(data);
        return data;
    }
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!data.settledHistory) data.settledHistory = [];
        if (Date.now() > data.expiresAt) {
            settleAndBroadcastRound(data, sock);
            data.roundId += 1;
            data.expiresAt = Date.now() + ROUND_DURATION_MS;
            data.matches = generateMatches();
            saveSporty(data);
        }
        return data;
    } catch {
        const data = emptyData();
        data.matches = generateMatches();
        saveSporty(data);
        return data;
    }
}

function saveSporty(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateMatches() {
    const matches = [];
    const shuffled = [...CLUBS].sort(() => 0.5 - Math.random());
    const matchCount = Math.floor(Math.random() * 9) + 20; // 20 to 28 matches

    let clubIndex = 0;
    for (let i = 1; i <= matchCount; i++) {
        if (clubIndex + 1 >= shuffled.length) clubIndex = 0;
        const home = shuffled[clubIndex++];
        const away = shuffled[clubIndex++];

        matches.push({
            id: i,
            home,
            away,
            odds: {
                homeWin: randomFloat(1.40, 3.40),
                draw: randomFloat(3.00, 3.90),
                awayWin: randomFloat(1.85, 4.80),
                over25: randomFloat(1.65, 2.25),
                under25: randomFloat(1.65, 2.20),
                bttsYes: randomFloat(1.60, 2.10),
                bttsNo: randomFloat(1.65, 2.20)
            }
        });
    }
    return matches;
}

function settleAndBroadcastRound(data, sock) {
    if (!data.slips || data.slips.length === 0) return;

    const settledMatches = data.matches.map(m => {
        const homeGoals = Math.floor(Math.random() * 4); // 0 to 3 goals
        const awayGoals = Math.floor(Math.random() * 4);
        return {
            ...m,
            homeGoals,
            awayGoals,
            totalGoals: homeGoals + awayGoals,
            btts: homeGoals > 0 && awayGoals > 0,
            outcome: homeGoals > awayGoals ? "1" : (homeGoals < awayGoals ? "2" : "X")
        };
    });

    const chatResults = {};
    if (!data.settledHistory) data.settledHistory = [];

    for (const slip of data.slips) {
        let slipWon = true;
        let totalOdds = slip.totalOdds;

        for (const leg of slip.legs) {
            const match = settledMatches.find(m => m.id === leg.matchId);
            if (!match) {
                slipWon = false;
                break;
            }

            if (leg.market === "1x2") {
                if (match.outcome !== leg.selection) {
                    slipWon = false;
                    break;
                }
            } else if (leg.market === "over" || leg.market === "under") {
                const isOver = match.totalGoals > 2.5;
                if (leg.market === "over" && !isOver) { slipWon = false; break; }
                if (leg.market === "under" && isOver) { slipWon = false; break; }
            } else if (leg.market === "btts_yes" || leg.market === "btts_no") {
                if (leg.market === "btts_yes" && !match.btts) { slipWon = false; break; }
                if (leg.market === "btts_no" && match.btts) { slipWon = false; break; }
            }
        }

        const user = economy.getUser(slip.userId);
        let payout = 0;
        if (user && slipWon) {
            payout = Math.round(slip.stake * totalOdds);
            user.wallet = (user.wallet || 0) + payout;
            economy.addTransaction(user, {
                type: "earn",
                description: `SportyBet Win (${slip.code}, Odds: ${totalOdds.toFixed(2)}x)`,
                amount: payout
            });
        }

        const settledRecord = {
            code: slip.code,
            userId: slip.userId,
            userName: user ? user.name : "Player",
            userJid: user ? user.jid : null,
            stake: slip.stake,
            totalOdds,
            payout,
            won: slipWon,
            legsCount: slip.legs.length,
            timestamp: Date.now()
        };

        data.settledHistory.unshift(settledRecord);
        if (data.settledHistory.length > 50) data.settledHistory.pop();

        if (!chatResults[slip.chatJid]) chatResults[slip.chatJid] = [];
        chatResults[slip.chatJid].push(settledRecord);
    }

    if (sock) {
        const keyHighlights = settledMatches.slice(0, 6).map(m => 
            `• ${m.home} *${m.homeGoals} - ${m.awayGoals}* ${m.away}`
        ).join("\n");

        for (const [chatJid, results] of Object.entries(chatResults)) {
            let summaryText = 
`╭━━〔 ⚽ ROUND #${data.roundId} RESULTS 〕━━╮
┃
┃ 🏁 *FULL TIME SCORES:*
${keyHighlights}
┃
┃ 🎟️ *TICKET SETTLEMENTS:*`;

            const mentions = [];
            for (const r of results) {
                const tag = r.userJid ? `@${r.userJid.split("@")[0]}` : `*${r.userName}*`;
                if (r.userJid) mentions.push(r.userJid);

                if (r.won) {
                    summaryText += `\n┃ • ${tag} [${r.code}] ➔ 🟢 *WON!* Payout: *🪙${economy.format(r.payout)}*`;
                } else {
                    summaryText += `\n┃ • ${tag} [${r.code}] ➔ ❌ *Lost* (${r.stake} staked)`;
                }
            }

            summaryText += `\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

            try {
                await sock.sendMessage(chatJid, { text: summaryText, mentions: [...new Set(mentions)] });
            } catch (err) {
                console.error(`❌ Failed broadcast to ${chatJid}:`, err.message);
            }
        }
    }

    data.slips = [];
}

function formatTimeRemaining(ms) {
    if (ms <= 0) return "Matchday Live / Settling...";
    const mins = Math.floor(ms / (1000 * 60));
    const secs = Math.floor((ms / 1000) % 60);
    return `${mins}m ${secs}s`;
}

module.exports = {
    loadSporty,
    saveSporty,
    generateBookingCode,
    formatTimeRemaining
};
  
