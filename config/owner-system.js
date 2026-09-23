function cleanId(value) {
    if (!value) {
        return "";
    }

    return String(value)
        .split("@")[0]
        .split(":")[0]
        .replace(/[^\d]/g, "");
}


/* ============================= */
/* LID → PHONE */
/* ============================= */

async function resolvePhoneJid(sock, jid) {

    if (!jid) {
        return null;
    }

    if (
        jid.endsWith("@s.whatsapp.net")
    ) {
        return jid;
    }

    if (
        jid.endsWith("@lid") &&
        sock?.signalRepository?.lidMapping
    ) {

        try {

            const phoneJid =
                await sock
                    .signalRepository
                    .lidMapping
                    .getPNForLID(jid);

            if (phoneJid) {
                return phoneJid;
            }

        } catch (error) {

            console.log(
                "⚠️ LID → phone lookup failed:",
                error.message
            );
        }
    }

    return null;
}


/* ============================= */
/* OWNER CHECK */
/* ============================= */

async function isOwner(message, sock) {

    /* Bot's own messages */
    if (
        message?.key?.fromMe === true
    ) {
        return true;
    }


    const ownerIds = [
        sock?.user?.id,
        sock?.user?.lid
    ]
        .map(cleanId)
        .filter(Boolean);


    const senderJids = [
        message?.key?.participant,
        message?.key?.participantAlt,
        message?.key?.remoteJid,
        message?.key?.remoteJidAlt
    ]
        .filter(Boolean);


    /* Direct match */

    for (
        const senderJid of senderJids
    ) {

        if (
            ownerIds.includes(
                cleanId(senderJid)
            )
        ) {
            return true;
        }
    }


    /* LID → phone match */

    for (
        const senderJid of senderJids
    ) {

        if (
            !senderJid.endsWith("@lid")
        ) {
            continue;
        }

        const phoneJid =
            await resolvePhoneJid(
                sock,
                senderJid
            );

        if (!phoneJid) {
            continue;
        }

        if (
            ownerIds.includes(
                cleanId(phoneJid)
            )
        ) {
            return true;
        }
    }


    return false;
}


module.exports = {
    cleanId,
    isOwner,
    resolvePhoneJid
};
