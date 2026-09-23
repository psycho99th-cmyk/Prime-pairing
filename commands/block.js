const {
    jidNormalizedUser
} = require("@whiskeysockets/baileys");


/*
|--------------------------------------------------------------------------
| CLEAN JID
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
| GET REPLIED-TO PARTICIPANT
|--------------------------------------------------------------------------
*/

function getQuotedParticipant(
    message
) {

    const context =
        message?.message
            ?.extendedTextMessage
            ?.contextInfo;

    if (!context?.stanzaId) {
        return "";
    }

    return (
        context.participant ||
        context.participantAlt ||
        ""
    );
}


/*
|--------------------------------------------------------------------------
| GET DM TARGET
|--------------------------------------------------------------------------
*/

function getDmTarget(
    message
) {

    return (
        message?.key?.remoteJid ||
        ""
    );
}


/*
|--------------------------------------------------------------------------
| RESOLVE LID → PHONE JID
|--------------------------------------------------------------------------
*/

async function resolveTarget(
    sock,
    jid
) {

    if (!jid) {
        return "";
    }

    let target =
        cleanJid(jid);


    /*
     * Don't try to block the
     * group itself or status.
     */

    if (
        target ===
        "status@broadcast" ||
        target.endsWith("@g.us")
    ) {
        return "";
    }


    /*
     * If already a normal
     * WhatsApp number, use it.
     */

    if (
        target.endsWith(
            "@s.whatsapp.net"
        )
    ) {

        return jidNormalizedUser(
            target
        );
    }


    /*
     * Resolve LID using Baileys'
     * signal repository mapping.
     */

    if (
        target.endsWith("@lid")
    ) {

        try {

            const lidMapping =
                sock.signalRepository
                    ?.lidMapping;


            if (
                lidMapping &&
                typeof lidMapping.getPNForLID ===
                    "function"
            ) {

                const phone =
                    await lidMapping
                        .getPNForLID(
                            target
                        );


                if (phone) {

                    return jidNormalizedUser(
                        cleanJid(
                            phone
                        )
                    );
                }
            }

        } catch (error) {

            console.error(
                "Block LID resolution error:",
                error.message
            );
        }
    }


    return target;
}


/*
|--------------------------------------------------------------------------
| COMMAND
|--------------------------------------------------------------------------
*/

module.exports = async ({
    sock,
    jid,
    message
}) => {

    let target = "";


    /*
     * =========================
     * GROUP
     * =========================
     */

    if (
        jid.endsWith("@g.us")
    ) {

        target =
            getQuotedParticipant(
                message
            );


        if (!target) {

            return `❌ *REPLY TO THE PERSON YOU WANT TO BLOCK.*

Example:

Reply to their message with:

*.block*`;
        }
    }


    /*
     * =========================
     * DM
     * =========================
     */

    else {

        target =
            getDmTarget(
                message
            );


        if (!target) {

            return `❌ *COULDN'T FIND THE PERSON TO BLOCK.*`;
        }
    }


    /*
     * =========================
     * RESOLVE TARGET
     * =========================
     */

    target =
        await resolveTarget(
            sock,
            target
        );


    if (!target) {

        return `❌ *COULDN'T RESOLVE THIS USER.*`;
    }


    /*
     * =========================
     * DON'T BLOCK YOURSELF
     * =========================
     */

    const botIds = [
        sock.user?.id,
        sock.user?.lid
    ]
        .filter(Boolean)
        .map(cleanJid);


    if (
        botIds.includes(
            cleanJid(target)
        )
    ) {

        return `❌ *I CAN'T BLOCK MYSELF.*`;
    }


    /*
     * =========================
     * BLOCK USER
     * =========================
     */

    try {

        await sock.updateBlockStatus(
            target,
            "block"
        );


        return `🚫 *USER BLOCKED SUCCESSFULLY.*`;

    } catch (error) {

        console.error(
            "🔥 BLOCK COMMAND ERROR:",
            error
        );


        return `❌ *FAILED TO BLOCK THIS USER.*

Please try again.`;
    }
};
