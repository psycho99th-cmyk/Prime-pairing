const fs = require("fs");
const path = require("path");

const games = new Map();

const JOIN_TIME = 60 * 1000;
const ROUND_TIME = 15 * 1000;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

const namesPath =
    path.join(
        __dirname,
        "..",
        "config",
        "names.json"
    );


/*
|--------------------------------------------------------------------------
| JID CLEANER
|--------------------------------------------------------------------------
*/

function cleanJid(jid) {

    if (!jid) {
        return "";
    }

    return jid
        .replace(
            /:\d+@/,
            "@"
        )
        .trim()
        .toLowerCase();
}


/*
|--------------------------------------------------------------------------
| LOAD NAMES.JSON
|--------------------------------------------------------------------------
*/

function loadNames() {

    try {

        if (
            !fs.existsSync(
                namesPath
            )
        ) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(
                namesPath,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "❌ Bomb names.json error:",
            error.message
        );

        return {};
    }
}


/*
|--------------------------------------------------------------------------
| GET SAVED WHATSAPP NAME
|--------------------------------------------------------------------------
*/

function getSavedName(
    jid,
    fallback
) {

    const names =
        loadNames();

    if (!jid) {
        return fallback || "Unknown";
    }

    const cleaned =
        cleanJid(jid);


    /*
     * Direct match
     */

    if (
        names[cleaned]
    ) {

        return names[cleaned];
    }


    /*
     * Try normal phone JID
     */

    if (
        cleaned.endsWith(
            "@s.whatsapp.net"
        )
    ) {

        const number =
            cleaned.split("@")[0];

        if (
            names[
                `${number}@s.whatsapp.net`
            ]
        ) {

            return names[
                `${number}@s.whatsapp.net`
            ];
        }
    }


    /*
     * Try LID
     */

    if (
        cleaned.endsWith("@lid")
    ) {

        if (
            names[cleaned]
        ) {

            return names[cleaned];
        }
    }


    return fallback || "Unknown";
}


/*
|--------------------------------------------------------------------------
| GET SENDER JID
|--------------------------------------------------------------------------
*/

function getSenderJid(
    message
) {

    return (
        message?.key?.participant ||
        message?.key?.participantAlt ||
        message?.key?.remoteJid ||
        ""
    );
}


/*
|--------------------------------------------------------------------------
| GET REPLIED MESSAGE JIDS
|--------------------------------------------------------------------------
*/

function getTargetJids(
    message
) {

    const context =
        message?.message
            ?.extendedTextMessage
            ?.contextInfo;

    if (
        !context?.stanzaId
    ) {
        return [];
    }

    return [
        context.participant,
        context.participantAlt
    ].filter(Boolean);
}


/*
|--------------------------------------------------------------------------
| GET PLAYER ALIASES
|--------------------------------------------------------------------------
*/

async function getAliases(
    sock,
    jid,
    groupJid
) {

    const aliases =
        new Set();

    if (!jid) {
        return [];
    }

    aliases.add(
        cleanJid(jid)
    );


    try {

        const metadata =
            await sock.groupMetadata(
                groupJid
            );

        const participants =
            metadata?.participants ||
            [];


        for (
            const participant
            of participants
        ) {

            const ids = [
                participant.id,
                participant.jid,
                participant.lid,
                participant.phoneNumber
            ].filter(Boolean);


            const cleanedIds =
                ids.map(
                    cleanJid
                );


            if (
                cleanedIds.includes(
                    cleanJid(jid)
                )
            ) {

                cleanedIds.forEach(
                    id => {
                        aliases.add(id);
                    }
                );
            }
        }

    } catch (error) {

        console.error(
            "Bomb alias error:",
            error.message
        );
    }


    /*
     * LID → phone number
     */

    try {

        const lidMapping =
            sock.signalRepository
                ?.lidMapping;


        if (
            lidMapping &&
            typeof lidMapping.getPNForLID ===
                "function"
        ) {

            const currentIds =
                [...aliases];


            for (
                const id
                of currentIds
            ) {

                if (
                    id.endsWith("@lid")
                ) {

                    try {

                        const phone =
                            await lidMapping
                                .getPNForLID(
                                    id
                                );


                        if (phone) {

                            aliases.add(
                                cleanJid(
                                    phone
                                )
                            );
                        }

                    } catch {}
                }
            }
        }

    } catch {}


    return [
        ...aliases
    ];
}


/*
|--------------------------------------------------------------------------
| CHECK SAME PLAYER
|--------------------------------------------------------------------------
*/

async function samePlayer(
    sock,
    groupJid,
    jid1,
    jid2
) {

    if (
        !jid1 ||
        !jid2
    ) {
        return false;
    }


    const aliases1 =
        await getAliases(
            sock,
            jid1,
            groupJid
        );


    const aliases2 =
        await getAliases(
            sock,
            jid2,
            groupJid
        );


    return aliases1.some(
        id =>
            aliases2.includes(
                id
            )
    );
}


/*
|--------------------------------------------------------------------------
| FIND PLAYER
|--------------------------------------------------------------------------
*/

async function findPlayer(
    sock,
    game,
    jid
) {

    for (
        const player
        of game.players
    ) {

        if (
            await samePlayer(
                sock,
                game.jid,
                player.jid,
                jid
            )
        ) {

            return player;
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| PLAYER DISPLAY NAME
|--------------------------------------------------------------------------
*/

function playerName(
    player
) {

    if (
        !player
    ) {
        return "Unknown";
    }


    /*
     * Re-read names.json so
     * the latest saved name is used.
     */

    const saved =
        getSavedName(
            player.jid,
            player.name
        );


    return saved ||
        player.name ||
        "Unknown";
}


/*
|--------------------------------------------------------------------------
| PLAYER MENTION TEXT
|--------------------------------------------------------------------------
|
| The real JID remains in the
| mentions array.
|
| The visible text now uses
| names.json instead of the
| LID/phone number.
|
*/

function playerMention(
    player
) {

    return `@${playerName(player)}`;
}


/*
|--------------------------------------------------------------------------
| START GAME
|--------------------------------------------------------------------------
*/

async function startGame(
    sock,
    game
) {

    if (
        !games.has(
            game.jid
        )
    ) {
        return;
    }


    if (
        game.players.length <
        MIN_PLAYERS
    ) {

        games.delete(
            game.jid
        );


        await sock.sendMessage(
            game.jid,
            {
                text:
`❌ *BOMB GAME CANCELLED!*

Not enough players joined.

👥 Players: *${game.players.length}/${MAX_PLAYERS}*

Minimum required: *${MIN_PLAYERS}* players.`
            }
        );


        return;
    }


    game.phase =
        "playing";

    game.round =
        0;


    await sock.sendMessage(
        game.jid,
        {
            text:
`🔒 *JOINING CLOSED!*

💣 *BOMB GAME STARTING*

👥 *PLAYERS: ${game.players.length}/${MAX_PLAYERS}*

${game.players
    .map(
        (player, index) =>
            `${index + 1}. ${playerName(player)}`
    )
    .join("\n")}

🔥 Get ready!`
        }
    );


    setTimeout(
        () =>
            startRound(
                sock,
                game
            ),
        2000
    );
}


/*
|--------------------------------------------------------------------------
| START ROUND
|--------------------------------------------------------------------------
*/

async function startRound(
    sock,
    game
) {

    if (
        !games.has(
            game.jid
        ) ||
        game.players.length <= 1
    ) {

        await finishGame(
            sock,
            game
        );

        return;
    }


    game.round++;


    const activePlayers =
        game.players.filter(
            player =>
                player.active
        );


    if (
        activePlayers.length <= 1
    ) {

        await finishGame(
            sock,
            game
        );

        return;
    }


    const randomIndex =
        Math.floor(
            Math.random() *
            activePlayers.length
        );


    game.bombHolder =
        activePlayers[
            randomIndex
        ];


    game.roundActive =
        true;


    game.roundEndsAt =
        Date.now() +
        ROUND_TIME;


    await sock.sendMessage(
        game.jid,
        {
            text:
`🔄 *ROUND ${game.round}*

💣 *BOMB ACTIVATED!*

💣 ${playerMention(
    game.bombHolder
)} has the bomb!

⏱️ *15 SECONDS!*

Reply *pass* to a message from another player to pass the bomb.`
        },
        {
            mentions: [
                game.bombHolder.jid
            ]
        }
    );


    game.roundTimer =
        setTimeout(
            () =>
                explodeBomb(
                    sock,
                    game
                ),
            ROUND_TIME
        );
}


/*
|--------------------------------------------------------------------------
| BOMB EXPLOSION
|--------------------------------------------------------------------------
*/

async function explodeBomb(
    sock,
    game
) {

    if (
        !games.has(
            game.jid
        ) ||
        !game.roundActive
    ) {
        return;
    }


    game.roundActive =
        false;


    const holder =
        game.bombHolder;


    if (!holder) {
        return;
    }


    holder.active =
        false;


    await sock.sendMessage(
        game.jid,
        {
            text:
`💥 *BOOM!*

💣 ${playerMention(
    holder
)} has been eliminated!

👥 Players remaining: *${
    game.players.filter(
        p => p.active
    ).length
}*

🔄 *NEXT ROUND...*`
        },
        {
            mentions: [
                holder.jid
            ]
        }
    );


    game.bombHolder =
        null;


    const remaining =
        game.players.filter(
            p => p.active
        );


    if (
        remaining.length <= 1
    ) {

        setTimeout(
            () =>
                finishGame(
                    sock,
                    game
                ),
            1500
        );

        return;
    }


    setTimeout(
        () =>
            startRound(
                sock,
                game
            ),
        1500
    );
}


/*
|--------------------------------------------------------------------------
| FINISH GAME
|--------------------------------------------------------------------------
*/

async function finishGame(
    sock,
    game
) {

    if (
        !games.has(
            game.jid
        )
    ) {
        return;
    }


    if (
        game.roundTimer
    ) {

        clearTimeout(
            game.roundTimer
        );
    }


    const winner =
        game.players.find(
            player =>
                player.active
        );


    games.delete(
        game.jid
    );


    if (!winner) {

        await sock.sendMessage(
            game.jid,
            {
                text:
`🏁 *BOMB GAME OVER!*

No winner.

💣 PRIME BOMB`
            }
        );

        return;
    }


    await sock.sendMessage(
        game.jid,
        {
            text:
`🏆 *BOMB GAME OVER!*

👑 *WINNER*

${playerMention(
    winner
)}

💣 Rounds Survived: *${game.round}*

🔥 *PRIME BOMB*`
        },
        {
            mentions: [
                winner.jid
            ]
        }
    );
}


/*
|--------------------------------------------------------------------------
| HANDLE JOIN
|--------------------------------------------------------------------------
*/

async function handleJoin(
    sock,
    jid,
    message
) {

    /*
     * Bomb is group-only.
     */

    if (
        !jid.endsWith("@g.us")
    ) {
        return false;
    }


    const game =
        games.get(
            jid
        );


    if (!game) {
        return false;
    }


    if (
        game.phase !==
        "joining"
    ) {
        return true;
    }


    const sender =
        getSenderJid(
            message
        );


    if (!sender) {
        return true;
    }


    const existing =
        await findPlayer(
            sock,
            game,
            sender
        );


    if (existing) {

        await sock.sendMessage(
            jid,
            {
                text:
`⚠️ *YOU ARE ALREADY IN THE GAME!*`
            }
        );

        return true;
    }


    if (
        game.players.length >=
        MAX_PLAYERS
    ) {

        await sock.sendMessage(
            jid,
            {
                text:
`⚠️ *GAME IS FULL!*

Maximum players: *${MAX_PLAYERS}*`
            }
        );

        return true;
    }


    const savedName =
        getSavedName(
            sender,
            message.pushName ||
                "Unknown"
        );


    game.players.push({
        jid: sender,
        name: savedName,
        active: true
    });


    await sock.sendMessage(
        jid,
        {
            text:
`✅ *PLAYER JOINED!*

👤 ${savedName}

👥 Players: *${game.players.length}/${MAX_PLAYERS}*`
        }
    );


    return true;
}


/*
|--------------------------------------------------------------------------
| HANDLE PASS
|--------------------------------------------------------------------------
*/

async function handlePass(
    sock,
    jid,
    message
) {

    /*
     * Bomb is group-only.
     */

    if (
        !jid.endsWith("@g.us")
    ) {
        return false;
    }


    const game =
        games.get(
            jid
        );


    if (!game) {
        return false;
    }


    if (
        game.phase !==
        "playing"
    ) {
        return true;
    }


    const sender =
        getSenderJid(
            message
        );


    if (!sender) {
        return true;
    }


    const senderPlayer =
        await findPlayer(
            sock,
            game,
            sender
        );


    /*
     * Eliminated or non-player
     * cannot pass.
     */

    if (
        !senderPlayer ||
        !senderPlayer.active
    ) {
        return true;
    }


    /*
     * Only current bomb holder
     * can pass.
     */

    if (
        !game.bombHolder ||
        !await samePlayer(
            sock,
            game.jid,
            game.bombHolder.jid,
            sender
        )
    ) {
        return true;
    }


    /*
     * Must reply to a message.
     */

    const targets =
        getTargetJids(
            message
        );


    if (
        !targets.length
    ) {
        return true;
    }


    let targetPlayer =
        null;


    for (
        const target
        of targets
    ) {

        const found =
            await findPlayer(
                sock,
                game,
                target
            );


        if (
            found &&
            found.active
        ) {

            targetPlayer =
                found;

            break;
        }
    }


    /*
     * Invalid target:
     * do absolutely nothing.
     */

    if (!targetPlayer) {
        return true;
    }


    /*
     * Cannot pass to yourself.
     */

    if (
        await samePlayer(
            sock,
            game.jid,
            sender,
            targetPlayer.jid
        )
    ) {
        return true;
    }


    /*
     * Timer has expired.
     */

    if (
        Date.now() >=
        game.roundEndsAt
    ) {
        return true;
    }


    game.bombHolder =
        targetPlayer;


    await sock.sendMessage(
        jid,
        {
            text:
`💣 *BOMB PASSED!*

💣 ${playerMention(
    targetPlayer
)} now has the bomb!

⏱️ Keep passing!`
        },
        {
            mentions: [
                targetPlayer.jid
            ]
        }
    );


    return true;
}


/*
|--------------------------------------------------------------------------
| HANDLE NORMAL TEXT
|--------------------------------------------------------------------------
*/

async function handleText({
    sock,
    jid,
    message,
    text
}) {

    if (!text) {
        return false;
    }


    if (
        !jid.endsWith("@g.us")
    ) {
        return false;
    }


    const normalized =
        text
            .trim()
            .toLowerCase();


    if (
        normalized ===
        "join game"
    ) {

        return await handleJoin(
            sock,
            jid,
            message
        );
    }


    if (
        normalized ===
        "pass"
    ) {

        return await handlePass(
            sock,
            jid,
            message
        );
    }


    return false;
}


/*
|--------------------------------------------------------------------------
| .bomb COMMAND
|--------------------------------------------------------------------------
*/

module.exports = async ({
    sock,
    jid,
    args,
    message
}) => {

    /*
     * Bomb is group-only.
     */

    if (
        !jid.endsWith("@g.us")
    ) {

        return `❌ *BOMB GAME IS FOR GROUPS ONLY.*`;
    }


    const action =
        args[0]?.toLowerCase();


    /*
     * .bomb stop
     */

    if (
        action ===
        "stop"
    ) {

        const game =
            games.get(
                jid
            );


        if (!game) {

            return `⚠️ *NO BOMB GAME IS RUNNING!*`;
        }


        const creator =
            getSenderJid(
                message
            );


        if (
            game.startedBy &&
            !await samePlayer(
                sock,
                jid,
                game.startedBy,
                creator
            )
        ) {

            return `❌ *ONLY THE GAME CREATOR CAN STOP THE GAME.*`;
        }


        if (
            game.joinTimer
        ) {

            clearTimeout(
                game.joinTimer
            );
        }


        if (
            game.roundTimer
        ) {

            clearTimeout(
                game.roundTimer
            );
        }


        games.delete(
            jid
        );


        return `🛑 *BOMB GAME STOPPED*

The current game has been cancelled.`;
    }


    /*
     * Don't start another game
     * in the same group.
     */

    if (
        games.has(
            jid
        )
    ) {

        return `⚠️ *A BOMB GAME IS ALREADY RUNNING!*

Finish the current game before starting another one.`;
    }


    const creator =
        getSenderJid(
            message
        );


    const game = {

        jid: jid,

        startedBy:
            creator,

        phase:
            "joining",

        players: [],

        round: 0,

        bombHolder:
            null,

        roundEndsAt:
            0,

        joinTimer:
            null,

        roundTimer:
            null,

        roundActive:
            false
    };


    games.set(
        jid,
        game
    );


    game.joinTimer =
        setTimeout(
            () =>
                startGame(
                    sock,
                    game
                ),
            JOIN_TIME
        );


    return `💣 *BOMB GAME*

A new game has been created!

⏳ *JOINING TIME: 1 MINUTE*

Type:

*join game*

👥 Players: *0/${MAX_PLAYERS}*

🎮 Maximum players: *${MAX_PLAYERS}*

⚡ After 1 minute, the bomb will automatically start!`;
};


/*
|--------------------------------------------------------------------------
| EXPORT GAME TEXT HANDLER
|--------------------------------------------------------------------------
*/

module.exports.handleText =
    handleText;

