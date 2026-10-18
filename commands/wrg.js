const fs = require("fs");
const path = require("path");

const games = new Map();

const JOIN_TIME = 60 * 1000;
const TURN_TIME = 30 * 1000;
const MAX_PLAYERS = 10;
const MIN_LENGTH = 4;
const MAX_LENGTH = 11;
const TOTAL_ROUNDS = MAX_LENGTH - MIN_LENGTH + 1;

// true  = a wrong word knocks the player out
// false = a wrong word only gives a warning (a timeout still knocks them out)
const ELIMINATE_ON_WRONG = true;

/* ============================= */
/* WORD CHECKING */
/* ============================= */

// Optional offline list: put one word per line in config/words.txt
const wordFile = path.join(__dirname, "..", "config", "words.txt");
let wordSet = null;

try {
    if (fs.existsSync(wordFile)) {
        const words = fs
            .readFileSync(wordFile, "utf8")
            .split(/\r?\n/)
            .map(word => word.trim().toLowerCase())
            .filter(Boolean);

        if (words.length) {
            wordSet = new Set(words);
            console.log(`📚 WRG word list loaded: ${wordSet.size} words`);
        }
    }
} catch (error) {
    console.error("❌ WRG word list error:", error.message);
}

const wordCache = new Map();

async function isRealWord(word) {

    if (wordSet) {
        return wordSet.has(word);
    }

    if (wordCache.has(word)) {
        return wordCache.get(word);
    }

    try {

        const response = await fetch(
            `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=1`,
            { signal: AbortSignal.timeout(5000) }
        );

        const data = await response.json();

        const valid =
            Array.isArray(data) &&
            data[0]?.word?.toLowerCase() === word;

        wordCache.set(word, valid);

        return valid;

    } catch (error) {

        console.error("❌ WRG word check failed:", error.message);

        // If the checker is down, do not punish the player
        return true;
    }
}

/* ============================= */
/* HELPERS */
/* ============================= */

function isGroup(jid) {
    return !!jid && jid.endsWith("@g.us");
}

function numberOf(jid) {
    return String(jid || "").split("@")[0].split(":")[0];
}

function getPlayerName(message) {

    if (message.key?.fromMe) {
        return message.pushName || "Owner";
    }

    return (
        message.pushName ||
        message.verifiedBizName ||
        message.key?.participant?.split("@")[0] ||
        "Player"
    );
}

// In a DM there are only two people: the owner (fromMe) and the chat partner
function getPlayerId(message, jid) {

    if (message.key?.fromMe) {
        return "owner";
    }

    if (!isGroup(jid)) {
        return "partner";
    }

    return (
        message.key?.participant ||
        message.key?.participantAlt ||
        message.key?.remoteJid
    );
}

// The JID used to tag a player in a group
function getMentionJid(message, sock) {

    if (message.key?.fromMe) {
        const own = numberOf(sock?.user?.id);
        return own ? `${own}@s.whatsapp.net` : null;
    }

    return (
        message.key?.participant ||
        message.key?.participantAlt ||
        null
    );
}

// "Message yourself" chat
function isOwnChat(sock, jid) {

    const chat = numberOf(jid);

    return (
        !!chat &&
        [sock?.user?.id, sock?.user?.lid].some(
            id => id && numberOf(id) === chat
        )
    );
}

function shuffle(list) {
    const copy = [...list];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

// Groups tag the player, DMs show the name
function label(game, player) {

    if (game.group && player.jid) {
        return `@${numberOf(player.jid)}`;
    }

    return player.name;
}

function formatPlayers(game, list = game.players) {
    return list
        .map((player, index) => `${index + 1}. ${label(game, player)}`)
        .join("\n");
}

function mentionsFor(game, text) {

    if (!game?.group) return [];

    return game.players
        .filter(
            player =>
                player.jid &&
                new RegExp(`@${numberOf(player.jid)}(?!\\d)`).test(text)
        )
        .map(player => player.jid);
}

function clearTimers(game) {
    clearTimeout(game.timer);
    clearTimeout(game.lobbyTimer);
}

async function send(sock, jid, text, game) {

    const mentions = mentionsFor(game, text);

    try {
        await sock.sendMessage(
            jid,
            mentions.length ? { text, mentions } : { text }
        );
    } catch (error) {
        console.error("❌ WRG send error:", error.message);
    }
}

async function reply(sock, jid, text, message, game) {

    const mentions = mentionsFor(game, text);

    try {
        await sock.sendMessage(
            jid,
            mentions.length ? { text, mentions } : { text },
            { quoted: message }
        );
    } catch (error) {
        console.error("❌ WRG reply error:", error.message);
    }
}

function newPlayer(message, jid, sock) {
    return {
        id: getPlayerId(message, jid),
        jid: isGroup(jid) ? getMentionJid(message, sock) : null,
        name: getPlayerName(message),
        score: 0,
        out: false,
        best: null
    };
}

// Runs the next step (next turn, or next round) after a short pause
function scheduleNext(sock, jid, game, delay = 1500) {

    const step = game.step;

    setTimeout(() => {

        if (games.get(jid) !== game || game.step !== step) {
            return;
        }

        advance(sock, jid, game).catch(error =>
            console.error("❌ WRG step error:", error.message)
        );

    }, delay);
}

/* ============================= */
/* START LOBBY */
/* ============================= */

async function startLobby(sock, jid, message) {

    if (games.has(jid)) {

        await send(
            sock,
            jid,
`⚠️ *A WRG GAME IS ALREADY RUNNING!*

Finish the current game before starting another one.

Type *.wrg stop* to end it.`
        );

        return;
    }

    const game = {
        jid,
        group: isGroup(jid),
        players: [],
        order: [],
        used: new Set(),
        joining: true,
        roundActive: false,
        checking: false,
        round: 0,
        length: 0,
        step: 0,
        current: null,
        longest: null,
        timer: null,
        lobbyTimer: null
    };

    games.set(jid, game);

    if (!game.group) {
        await startDirectGame(sock, jid, game, message);
        return;
    }

    await send(
        sock,
        jid,
`🔤 *WRG GAME*

A new word game has been created!

📝 *HOW TO PLAY*
Every round has a word length, and *everyone* takes a turn spelling a word of that length.
Round 1 is *${MIN_LENGTH} letters*, then it grows by 1 each round, up to *${MAX_LENGTH} letters*.
No answer in time${ELIMINATE_ON_WRONG ? " or a wrong word" : ""} = you're out!

⏳ *JOINING TIME: 1 MINUTE*

Type:

*join game*

👥 Players: *0/${MAX_PLAYERS}*

⚡ After 1 minute, the game will automatically start!`,
        game
    );

    game.lobbyTimer = setTimeout(() => {
        closeLobby(sock, jid, game).catch(error =>
            console.error("❌ WRG lobby error:", error.message)
        );
    }, JOIN_TIME);
}

/* ============================= */
/* DIRECT MESSAGE GAME */
/* ============================= */

async function startDirectGame(sock, jid, game, message) {

    game.joining = false;

    const starter = newPlayer(message, jid, sock);

    game.players.push(starter);

    const solo = isOwnChat(sock, jid);

    if (!solo) {

        const otherId =
            starter.id === "owner"
                ? "partner"
                : "owner";

        game.players.push({
            id: otherId,
            jid: null,
            name: otherId === "owner" ? "Owner" : "Opponent",
            score: 0,
            out: false,
            best: null
        });
    }

    await send(
        sock,
        jid,
`🔤 *WRG GAME — ${solo ? "SOLO MODE" : "DM MODE"}*

📝 *HOW TO PLAY*
Every round has a word length, and each player spells a word of that length.
Round 1 is *${MIN_LENGTH} letters*, then it grows by 1 each round, up to *${MAX_LENGTH} letters*.
No answer in time${ELIMINATE_ON_WRONG ? " or a wrong word" : ""} = you're out!

👥 *PLAYERS*

${formatPlayers(game)}

🔥 Get ready!

🔄 Starting Round 1 in 5 seconds...`,
        game
    );

    scheduleNext(sock, jid, game, 5000);
}

async function closeLobby(sock, jid, game) {

    if (games.get(jid) !== game || !game.joining) {
        return;
    }

    game.joining = false;

    if (game.players.length < 2) {

        await send(
            sock,
            jid,
`❌ *GAME CANCELLED*

Not enough players joined.

At least *2 players* are required.`
        );

        games.delete(jid);
        return;
    }

    await send(
        sock,
        jid,
`🔒 *JOINING CLOSED!*

🔤 *WRG GAME STARTING*

👥 *PLAYERS: ${game.players.length}/${MAX_PLAYERS}*

${formatPlayers(game)}

🔥 Get ready!

🔄 Starting Round 1...`,
        game
    );

    scheduleNext(sock, jid, game, 2000);
}

/* ============================= */
/* JOIN GAME */
/* ============================= */

async function handleJoin(sock, message) {

    const jid = message.key.remoteJid;

    if (!jid) return false;

    const game = games.get(jid);

    if (!game || !game.joining) {
        return false;
    }

    const player = newPlayer(message, jid, sock);

    if (!player.id) return true;

    const alreadyJoined =
        game.players.some(existing => existing.id === player.id);

    if (alreadyJoined) {
        return true;
    }

    if (game.players.length >= MAX_PLAYERS) {

        await send(
            sock,
            jid,
`⚠️ *GAME FULL!*

Maximum players: *${MAX_PLAYERS}*`
        );

        return true;
    }

    game.players.push(player);

    await send(
        sock,
        jid,
`✅ *PLAYER JOINED!*

👤 ${label(game, player)}

👥 Players: *${game.players.length}/${MAX_PLAYERS}*`,
        game
    );

    if (game.players.length === MAX_PLAYERS) {

        game.joining = false;
        clearTimeout(game.lobbyTimer);

        await send(
            sock,
            jid,
`🔥 *${MAX_PLAYERS} PLAYERS REACHED!*

Joining is now closed.

🔤 The game will start shortly!`
        );

        scheduleNext(sock, jid, game, 1500);
    }

    return true;
}

/* ============================= */
/* ROUNDS AND TURNS */
/* ============================= */

// Next turn of the current round, or the next round once everyone has played
async function advance(sock, jid, game) {

    if (games.get(jid) !== game) return;

    if (game.order.length) {
        await startTurn(sock, jid, game);
        return;
    }

    const alive = game.players.filter(player => !player.out);
    const nextLength = MIN_LENGTH + game.round;
    const minAlive = game.players.length > 1 ? 2 : 1;

    if (alive.length < minAlive || nextLength > MAX_LENGTH) {
        await endGame(sock, jid, game);
        return;
    }

    await startRound(sock, jid, game, alive, nextLength);
}

async function startRound(sock, jid, game, alive, nextLength) {

    game.round++;
    game.length = nextLength;
    game.order = shuffle(alive);
    game.step++;

    const orderText =
        game.players.length > 1
            ? `\n\n📋 *TURN ORDER*\n\n${formatPlayers(game, game.order)}`
            : "";

    await send(
        sock,
        jid,
`🔤 *WRG GAME*

🔄 *ROUND ${game.round}/${TOTAL_ROUNDS}*

✍️ ${game.players.length > 1 ? "Everyone spells" : "Spell"} a word with exactly *${game.length} letters*.${orderText}`,
        game
    );

    scheduleNext(sock, jid, game);
}

async function startTurn(sock, jid, game) {

    const player = game.order.shift();

    game.current = player;
    game.roundActive = true;
    game.step++;

    await send(
        sock,
        jid,
`🔤 *WRG GAME*

🔄 *ROUND ${game.round}/${TOTAL_ROUNDS}* • ${game.length} letters

👉 ${label(game, player)}, it's your turn!

✍️ Type a word with exactly *${game.length} letters*.

⏱️ You have *30 seconds*.`,
        game
    );

    const step = game.step;

    game.timer = setTimeout(() => {
        onTimeout(sock, jid, game, step).catch(error =>
            console.error("❌ WRG timeout error:", error.message)
        );
    }, TURN_TIME);
}

async function onTimeout(sock, jid, game, step) {

    if (
        games.get(jid) !== game ||
        game.step !== step ||
        !game.roundActive
    ) {
        return;
    }

    await eliminate(
        sock,
        jid,
        game,
        game.current,
        "⏰ *TIME UP!* No word was given."
    );
}

async function eliminate(sock, jid, game, player, reason) {

    game.roundActive = false;
    clearTimeout(game.timer);

    player.out = true;

    const left = game.players.filter(p => !p.out).length;

    await send(
        sock,
        jid,
`${reason}

💀 ${label(game, player)} is out!${game.players.length > 1 ? `

👥 Players left: *${left}*` : ""}`,
        game
    );

    scheduleNext(sock, jid, game);
}

/* ============================= */
/* HANDLE MESSAGES */
/* ============================= */

async function handleText({ sock, jid, message, text }) {

    const game = games.get(jid);

    if (!game) return false;

    const clean = (text || "").trim().toLowerCase();

    if (!game.group && !message.key?.fromMe && message.pushName) {

        const partner =
            game.players.find(player => player.id === "partner");

        if (partner) {
            partner.name = message.pushName;
        }
    }

    if (game.joining) {

        if (clean === "join game") {
            return await handleJoin(sock, message);
        }

        return false;
    }

    if (!game.roundActive || !game.current) {
        return false;
    }

    if (getPlayerId(message, jid) !== game.current.id) {
        return false;
    }

    // Only a single word counts as an answer, normal chat is ignored
    if (!/^[a-z]+$/.test(clean)) {
        return false;
    }

    return await handleAnswer(sock, jid, game, clean, message);
}

async function handleAnswer(sock, jid, game, word, message) {

    if (game.checking) return true;

    const player = game.current;

    game.checking = true;

    let problem = null;

    try {

        if (word.length !== game.length) {

            problem =
                `must have exactly ${game.length} letters (yours has ${word.length})`;

        } else if (game.used.has(word)) {

            problem = "that word was already used";

        } else if (!(await isRealWord(word))) {

            problem = "that is not a valid word";
        }

    } finally {

        game.checking = false;
    }

    // The turn may have ended while the word was being checked
    if (
        games.get(jid) !== game ||
        !game.roundActive ||
        game.current !== player
    ) {
        return true;
    }

    if (problem) {

        if (ELIMINATE_ON_WRONG) {

            await eliminate(
                sock,
                jid,
                game,
                player,
                `❌ *${word.toUpperCase()}* — ${problem}.`
            );

        } else {

            await reply(
                sock,
                jid,
                `⚠️ *${word.toUpperCase()}* — ${problem}. Try again!`,
                message,
                game
            );
        }

        return true;
    }

    /* ============================= */
    /* VALID WORD */
    /* ============================= */

    game.roundActive = false;
    clearTimeout(game.timer);

    game.used.add(word);

    player.score += word.length;

    if (!player.best || word.length > player.best.length) {
        player.best = word;
    }

    if (!game.longest || word.length > game.longest.word.length) {
        game.longest = { player, word };
    }

    await reply(
        sock,
        jid,
`✅ *CORRECT!*

🔤 *${word.toUpperCase()}* — ${word.length} letters

⭐ *+${word.length} POINTS*

📊 Score: *${player.score}*`,
        message,
        game
    );

    scheduleNext(sock, jid, game);

    return true;
}

/* ============================= */
/* END GAME */
/* ============================= */

async function endGame(sock, jid, game) {

    if (games.get(jid) !== game) return;

    game.roundActive = false;
    clearTimers(game);

    const sortedPlayers =
        [...game.players].sort((a, b) => b.score - a.score);

    const scoreboard =
        sortedPlayers
            .map((player, index) => {

                let medal = `${index + 1}️⃣`;

                if (index === 0) {
                    medal = "🥇";
                } else if (index === 1) {
                    medal = "🥈";
                } else if (index === 2) {
                    medal = "🥉";
                }

                const best =
                    player.best
                        ? ` • Best: ${player.best.toUpperCase()}`
                        : "";

                return (
                    `${medal} ${label(game, player)} — ${player.score} point${player.score === 1 ? "" : "s"}${best}`
                );
            })
            .join("\n");

    const highestScore = sortedPlayers[0]?.score || 0;

    let winnerText;

    if (game.players.length === 1) {

        winnerText =
`🎯 *FINAL SCORE*

${label(game, game.players[0])} — ${game.players[0].score} points`;

    } else if (highestScore === 0) {

        winnerText = "😅 *NOBODY SCORED*\n\nBetter luck next time!";

    } else {

        const winners =
            sortedPlayers.filter(player => player.score === highestScore);

        if (winners.length === 1) {

            winnerText =
`👑 *WINNER*

${label(game, winners[0])} — ${winners[0].score} points`;

        } else {

            winnerText =
`🤝 *IT'S A TIE!*

${winners
    .map(player => `👑 ${label(game, player)} — ${player.score} points`)
    .join("\n")}`;
        }
    }

    const longestText =
        game.longest
            ? `🔠 *LONGEST WORD*

${label(game, game.longest.player)} — *${game.longest.word.toUpperCase()}* (${game.longest.word.length} letters)`
            : "🔠 *LONGEST WORD*\n\nNo words were spelled.";

    await send(
        sock,
        jid,
`🏆 *WRG GAME OVER!*

🔤 *FINAL SCORES*

${scoreboard}

━━━━━━━━━━━━━━

${winnerText}

${longestText}`,
        game
    );

    games.delete(jid);
}

/* ============================= */
/* STOP GAME */
/* ============================= */

async function stopGame(sock, jid) {

    const game = games.get(jid);

    if (!game) {

        await send(
            sock,
            jid,
`⚠️ *NO WRG GAME*

There is no active WRG game in this chat.`
        );

        return;
    }

    game.roundActive = false;
    game.joining = false;
    clearTimers(game);

    games.delete(jid);

    await send(
        sock,
        jid,
`🛑 *WRG GAME STOPPED*

The current game has been ended.

🔤 You can start a new game with:

*.wrg*`
    );
}

/* ============================= */
/* COMMAND */
/* ============================= */

module.exports = async ({
    sock,
    jid,
    args,
    message
}) => {

    const action =
        args[0]?.toLowerCase();

    if (action === "stop") {

        await stopGame(
            sock,
            jid
        );

        return;
    }

    await startLobby(
        sock,
        jid,
        message
    );
};

/* ============================= */
/* EXTERNAL HANDLERS */
/* ============================= */

module.exports.handleJoin =
    handleJoin;

module.exports.handleText =
    handleText;
