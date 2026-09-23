const fs = require("fs");
const path = require("path");

const pairFile =
    path.join(__dirname, "paired.json");


/* ============================= */
/* LOAD PAIRS */
/* ============================= */

function loadPairs() {

    try {

        if (
            !fs.existsSync(pairFile)
        ) {

            fs.writeFileSync(
                pairFile,
                "[]"
            );
        }

        const data =
            fs.readFileSync(
                pairFile,
                "utf8"
            );

        const pairs =
            JSON.parse(data);

        return Array.isArray(pairs)
            ? pairs
            : [];

    } catch (error) {

        console.error(
            "❌ Could not load paired numbers:",
            error
        );

        return [];
    }
}


/* ============================= */
/* SAVE PAIRS */
/* ============================= */

function savePairs(pairs) {

    fs.writeFileSync(
        pairFile,
        JSON.stringify(
            pairs,
            null,
            4
        )
    );
}


/* ============================= */
/* CLEAN NUMBER */
/* ============================= */

function cleanNumber(value) {

    if (!value) {
        return "";
    }

    return String(value)
        .split("@")[0]
        .split(":")[0]
        .replace(/[^\d]/g, "");
}


/* ============================= */
/* CHECK PAIRED */
/* ============================= */

function isPaired(value) {

    const number =
        cleanNumber(value);

    if (!number) {
        return false;
    }

    const pairs =
        loadPairs();

    return pairs.includes(number);
}


/* ============================= */
/* ADD PAIR */
/* ============================= */

function addPair(value) {

    const number =
        cleanNumber(value);

    if (!number) {

        return {
            success: false,
            reason: "invalid"
        };
    }

    const pairs =
        loadPairs();

    if (
        pairs.includes(number)
    ) {

        return {
            success: false,
            reason: "exists",
            number
        };
    }

    pairs.push(number);

    savePairs(pairs);

    return {
        success: true,
        number
    };
}


/* ============================= */
/* REMOVE PAIR */
/* ============================= */

function removePair(value) {

    const number =
        cleanNumber(value);

    if (!number) {

        return {
            success: false,
            reason: "invalid"
        };
    }

    const pairs =
        loadPairs();

    const index =
        pairs.indexOf(number);

    if (
        index === -1
    ) {

        return {
            success: false,
            reason: "not_found",
            number
        };
    }

    pairs.splice(
        index,
        1
    );

    savePairs(pairs);

    return {
        success: true,
        number
    };
}


/* ============================= */
/* RESOLVE LID → PHONE */
/* ============================= */

async function resolvePhoneJid(
    sock,
    jid
) {

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
                "⚠️ Pair LID → phone lookup failed:",
                error.message
            );
        }
    }

    return null;
}


/* ============================= */
/* CHECK MESSAGE PAIRING */
/* ============================= */

async function isMessagePaired(
    message,
    sock
) {

    const senderJids = [
        message?.key?.participant,
        message?.key?.participantAlt,
        message?.key?.remoteJid,
        message?.key?.remoteJidAlt
    ]
        .filter(Boolean);


    /* Normal number check */

    for (
        const jid of senderJids
    ) {

        if (
            isPaired(jid)
        ) {
            return true;
        }
    }


    /* LID check */

    for (
        const jid of senderJids
    ) {

        if (
            !jid.endsWith("@lid")
        ) {
            continue;
        }

        const phoneJid =
            await resolvePhoneJid(
                sock,
                jid
            );

        if (!phoneJid) {
            continue;
        }

        if (
            isPaired(phoneJid)
        ) {
            return true;
        }
    }


    return false;
}


module.exports = {
    loadPairs,
    savePairs,
    cleanNumber,
    isPaired,
    addPair,
    removePair,
    resolvePhoneJid,
    isMessagePaired
};
