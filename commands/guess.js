const games = new Map();

const JOIN_TIME = 60 * 1000;
const ROUND_TIME = 30 * 1000;
const MAX_PLAYERS = 10;
const TOTAL_ROUNDS = 10;

function getPlayerName(message) {
    return (
        message.pushName ||
        message.verifiedBizName ||
        message.key?.participant?.split("@")[0] ||
        "Player"
    );
}

function getPlayerId(message) {
    return (
        message.key?.participant ||
        message.key?.participantAlt ||
        message.key?.remoteJid
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatPlayers(game) {
    return game.players
        .map(
            (player, index) =>
                `${index + 1}. ${player.name} — ${player.score} point${player.score === 1 ? "" : "s"}`
        )
        .join("\n");
}

async function send(sock, jid, text) {
    try {
        await sock.sendMessage(jid, { text });
    } catch (error) {
        console.error("❌ Guess send error:", error.message);
    }
}

/* ============================= */
/* REPLY TO MESSAGE */
/* ============================= */

async function reply(sock, jid, text, message) {
    try {
        await sock.sendMessage(
            jid,
            { text },
            { quoted: message }
        );
    } catch (error) {
        console.error("❌ Guess reply error:", error.message);
    }
}

/* ============================= */
/* START ROUND */
/* ============================= */

async function startRound(sock, jid, game) {

    if (!games.has(jid)) return;

    if (game.round >= TOTAL_ROUNDS) {
        await endGame(sock, jid, game);
        return;
    }

    game.round++;

    game.target =
        Math.floor(Math.random() * 100) + 1;

    game.roundActive = true;
    game.winnerThisRound = null;

    await send(
        sock,
        jid,
`🎮 *GUESS GAME*

🔄 *ROUND ${game.round}/${TOTAL_ROUNDS}*

🎯 Guess a number between *1 and 100*.

⏱️ You have *30 seconds*.`
    );

    const roundNumber = game.round;

    await sleep(ROUND_TIME);

    if (!games.has(jid)) return;

    const currentGame = games.get(jid);

    if (currentGame.round !== roundNumber) return;

    if (!currentGame.roundActive) return;

    currentGame.roundActive = false;

    await send(
        sock,
        jid,
`⏰ *TIME UP!*

🎯 The number was *${currentGame.target}*.

🔄 Moving to the next round...`
    );

    await sleep(1500);

    if (!games.has(jid)) return;

    const nextGame = games.get(jid);

    if (nextGame.round >= TOTAL_ROUNDS) {
        await endGame(sock, jid, nextGame);
        return;
    }

    await startRound(sock, jid, nextGame);
}

/* ============================= */
/* END GAME */
/* ============================= */

async function endGame(sock, jid, game) {

    if (!games.has(jid)) return;

    game.roundActive = false;

    const sortedPlayers =
        [...game.players].sort(
            (a, b) => b.score - a.score
        );

    let scoreboard =
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

                return (
                    `${medal} ${player.name} — ${player.score} point${player.score === 1 ? "" : "s"}`
                );
            })
            .join("\n");

    const highestScore =
        sortedPlayers[0]?.score || 0;

    const winners =
        sortedPlayers.filter(
            player =>
                player.score === highestScore
        );

    let winnerText;

    if (winners.length === 1) {

        winnerText =
`👑 *WINNER*

${winners[0].name} — ${winners[0].score} points`;

    } else {

        winnerText =
`🤝 *IT'S A TIE!*

${winners
    .map(
        player =>
            `👑 ${player.name} — ${player.score} points`
    )
    .join("\n")}`;
    }

    await send(
        sock,
        jid,
`🏆 *GUESS GAME OVER!*

🎯 *FINAL SCORES*

${scoreboard}

━━━━━━━━━━━━━━

${winnerText}

🎮 *10/10 ROUNDS COMPLETED*`
    );

    games.delete(jid);
}

/* ============================= */
/* START LOBBY */
/* ============================= */

async function startLobby(sock, jid) {

    if (games.has(jid)) {

        await send(
            sock,
            jid,
`⚠️ *A GUESS GAME IS ALREADY RUNNING!*

Finish the current game before starting another one.`
        );

        return;
    }

    const game = {
        jid,
        players: [],
        joining: true,
        roundActive: false,
        round: 0,
        target: null,
        winnerThisRound: null
    };

    games.set(jid, game);

    await send(
        sock,
        jid,
`🎯 *GUESS GAME*

A new game has been created!

⏳ *JOINING TIME: 1 MINUTE*

Type:

*join game*

👥 Players: *0/${MAX_PLAYERS}*

🎮 Maximum players: *10*

⚡ After 1 minute, the game will automatically start!`
    );

    await sleep(JOIN_TIME);

    if (!games.has(jid)) return;

    const currentGame = games.get(jid);

    if (!currentGame.joining) return;

    currentGame.joining = false;

    if (currentGame.players.length < 2) {

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

🎮 *GUESS GAME STARTING*

👥 *PLAYERS: ${currentGame.players.length}/${MAX_PLAYERS}*

${formatPlayers(currentGame)}

🔥 Get ready!

🔄 Starting Round 1...`
    );

    await sleep(2000);

    if (!games.has(jid)) return;

    await startRound(sock, jid, currentGame);
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

    const playerId = getPlayerId(message);

    if (!playerId) return true;

    const alreadyJoined =
        game.players.some(
            player => player.id === playerId
        );

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

    game.players.push({
        id: playerId,
        name: getPlayerName(message),
        score: 0
    });

    await send(
        sock,
        jid,
`✅ *PLAYER JOINED!*

👤 ${getPlayerName(message)}

👥 Players: *${game.players.length}/${MAX_PLAYERS}*`
    );

    if (game.players.length === MAX_PLAYERS) {

        game.joining = false;

        await send(
            sock,
            jid,
`🔥 *10 PLAYERS REACHED!*

Joining is now closed.

🎮 The game will start shortly!`
        );

        await sleep(1500);

        if (games.has(jid)) {
            await startRound(sock, jid, game);
        }
    }

    return true;
}

/* ============================= */
/* HANDLE GUESS */
/* ============================= */

async function handleGuess(sock, message) {

    const jid = message.key.remoteJid;

    if (!jid) return false;

    const game = games.get(jid);

    if (!game || !game.roundActive) {
        return false;
    }

    const senderId = getPlayerId(message);

    const player =
        game.players.find(
            player => player.id === senderId
        );

    if (!player) {
        return false;
    }

    const text =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        "";

    const guess = Number(text.trim());

    if (
        !Number.isInteger(guess) ||
        guess < 1 ||
        guess > 100
    ) {
        return false;
    }

    /* ============================= */
    /* CORRECT GUESS */
    /* ============================= */

    if (guess === game.target) {

        if (!game.roundActive) {
            return true;
        }

        game.roundActive = false;

        game.winnerThisRound = player.id;

        player.score++;

        await reply(
            sock,
            jid,
`🎯 *CORRECT!*

🏆 *${player.name}* guessed the number!

🔢 Number: *${game.target}*

⭐ *+1 POINT*

📊 Score: *${player.score}*

🔄 Moving to the next round...`,
            message
        );

        const roundNumber = game.round;

        await sleep(1500);

        if (!games.has(jid)) {
            return true;
        }

        const currentGame = games.get(jid);

        if (currentGame.round !== roundNumber) {
            return true;
        }

        if (currentGame.round >= TOTAL_ROUNDS) {

            await endGame(
                sock,
                jid,
                currentGame
            );

            return true;
        }

        await startRound(
            sock,
            jid,
            currentGame
        );

        return true;
    }

    /* ============================= */
    /* HIGHER / LOWER */
    /* ============================= */

    if (guess > game.target) {

        await reply(
            sock,
            jid,
            `⬇️ *LOWER*`,
            message
        );

    } else {

        await reply(
            sock,
            jid,
            `⬆️ *HIGHER*`,
            message
        );
    }

    return true;
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
`⚠️ *NO GUESS GAME*

There is no active guess game in this chat.`
        );

        return;
    }

    game.roundActive = false;
    game.joining = false;

    games.delete(jid);

    await send(
        sock,
        jid,
`🛑 *GUESS GAME STOPPED*

The current game has been ended.

🎮 You can start a new game with:

*.guess*`
    );
}

/* ============================= */
/* COMMAND */
/* ============================= */

module.exports = async ({
    sock,
    jid,
    args
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
        jid
    );
};

/* ============================= */
/* EXTERNAL HANDLERS */
/* ============================= */

module.exports.handleJoin =
    handleJoin;

module.exports.handleGuess =
    handleGuess;
