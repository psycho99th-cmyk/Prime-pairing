function cleanId(value) {
    if (!value) {
        return "";
    }

    return String(value)
        .split("@")[0]
        .split(":")[0]
        .replace(/[^\d]/g, "");
}

function normalizeJid(value) {
    if (!value) {
        return null;
    }

    return String(value)
        .replace(":10@lid", "@lid");
}

function findBotParticipant(metadata, sock) {

    const participants =
        metadata?.participants || [];

    const botIds = [
        sock?.user?.id,
        sock?.user?.lid
    ]
        .filter(Boolean)
        .map(normalizeJid);

    const botNumbers = [
        sock?.user?.id,
        sock?.user?.lid
    ]
        .filter(Boolean)
        .map(cleanId)
        .filter(Boolean);

    return participants.find(participant => {

        const participantId =
            normalizeJid(participant?.id);

        const participantPhone =
            normalizeJid(participant?.phoneNumber);

        const participantLid =
            normalizeJid(participant?.lid);

        if (
            participantId &&
            botIds.includes(participantId)
        ) {
            return true;
        }

        if (
            participantPhone &&
            botIds.includes(participantPhone)
        ) {
            return true;
        }

        if (
            participantLid &&
            botIds.includes(participantLid)
        ) {
            return true;
        }

        const participantNumbers = [
            participantId,
            participantPhone,
            participantLid
        ]
            .map(cleanId)
            .filter(Boolean);

        return participantNumbers.some(
            number => botNumbers.includes(number)
        );
    });
}

function getTargetFromReply(message) {

    const context =
        message?.message
            ?.extendedTextMessage
            ?.contextInfo;

    if (!context) {
        return null;
    }

    return (
        context.participant ||
        context.participantAlt ||
        null
    );
}

function findParticipant(metadata, target) {

    if (!target) {
        return null;
    }

    const normalizedTarget =
        normalizeJid(target);

    const targetNumber =
        cleanId(target);

    return (
        metadata?.participants || []
    ).find(participant => {

        const ids = [
            participant?.id,
            participant?.phoneNumber,
            participant?.lid
        ]
            .filter(Boolean)
            .map(normalizeJid);

        if (
            ids.includes(normalizedTarget)
        ) {
            return true;
        }

        return ids
            .map(cleanId)
            .filter(Boolean)
            .includes(targetNumber);
    }) || null;
}

function getParticipantJid(participant) {

    if (!participant) {
        return null;
    }

    /*
     * Prefer the real phone JID when available.
     */

    if (
        participant.phoneNumber &&
        participant.phoneNumber.endsWith(
            "@s.whatsapp.net"
        )
    ) {
        return participant.phoneNumber;
    }

    if (
        participant.id &&
        participant.id.endsWith(
            "@s.whatsapp.net"
        )
    ) {
        return participant.id;
    }

    return participant.id || null;
}

module.exports = {
    cleanId,
    normalizeJid,
    findBotParticipant,
    getTargetFromReply,
    findParticipant,
    getParticipantJid
};
