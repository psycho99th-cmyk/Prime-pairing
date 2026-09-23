const {
    jidNormalizedUser
} = require("@whiskeysockets/baileys");


function cleanJid(jid) {
    if (!jid) return "";

    return jid
        .replace(
            /:\d+@/,
            "@"
        )
        .trim()
        .toLowerCase();
}


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


function getDmTarget(
    message
) {
    return (
        message?.key?.remoteJid ||
        ""
    );
}


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
     * Don't allow groups or broadcast
     * JIDs to be passed to unblock.
     */

    if (
        target ===
        "status@broadcast" ||
        target.endsWith("@g.us")
    ) {
        return "";
    }


    /*
     * Normal phone-number JID
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
     * LID → Phone JID
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
                        cleanJid(phone)
                    );
                }
            }

        } catch (error) {

            console.error(
                "Unblock LID resolution error:",
                error.message
            );
        }
    }


    return target;
}


module.exports = async ({
    sock,
    jid,
    message
}) => {

    let target = "";


    /*
     * GROUP
     *
     * Reply to the person:
     *
     * .unblock
     */

    if (
        jid.endsWith("@g.us")
    ) {

        target =
            getQuotedParticipant(
                message
            );


        if (!target) {

            return `❌ *REPLY TO THE PERSON YOU WANT TO UNBLOCK.*

Example:

Reply to their message with:

*.unblock*`;
        }

    }


    /*
     * DM
     *
     * .unblock
     */

    else {

        target =
            getDmTarget(
                message
            );


        if (!target) {

            return `❌ *COULDN'T FIND THE PERSON TO UNBLOCK.*`;
        }
    }


    /*
     * Resolve LID if necessary
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
     * Prevent unblocking the bot itself
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

        return `❌ *I CAN'T UNBLOCK MYSELF.*`;
    }


    try {

        await sock.updateBlockStatus(
            target,
            "unblock"
        );


        return `✅ *USER UNBLOCKED SUCCESSFULLY.*`;

    } catch (error) {

        console.error(
            "🔥 UNBLOCK COMMAND ERROR:",
            error
        );


        return `❌ *FAILED TO UNBLOCK THIS USER.*

${error?.message || "Unknown error"}`;
    }
};
