const fs = require("fs");
const path = require("path");


/*
 * =========================
 * LOAD SAVED NAMES
 * =========================
 */

function getSavedNames() {

    const namesPath =
        path.join(
            __dirname,
            "..",
            "config",
            "names.json"
        );

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

        console.log(
            "Names file lookup failed:",
            error.message
        );

        return {};

    }

}


/*
 * =========================
 * FIND USERNAME
 * =========================
 */

function findUsername(
    names,
    target,
    targetAlt,
    realJid
) {

    const possibleIds = [
        target,
        targetAlt,
        realJid
    ].filter(Boolean);


    for (
        const id of possibleIds
    ) {

        if (
            names[id]
        ) {

            return names[id];

        }

    }


    return "Unknown";

}


module.exports = async ({
    sock,
    jid,
    message
}) => {

    try {

        /*
         * =========================
         * GET REPLIED MESSAGE
         * =========================
         */

        const context =
            message.message
                ?.extendedTextMessage
                ?.contextInfo;


        const quoted =
            context?.quotedMessage;


        /*
         * WhatsApp may provide
         * participant and/or
         * participantAlt.
         */

        const target =
            context?.participant ||
            context?.participantAlt;


        const targetAlt =
            context?.participantAlt ||
            context?.participant;


        if (
            !quoted ||
            !target
        ) {

            return `❌ Reply to a person's message.

Example:

Reply to their message
.profile`;

        }


        /*
         * =========================
         * INITIAL JID
         * =========================
         */

        let realJid =
            target;


        let number =
            null;


        /*
         * =========================
         * GROUP LOOKUP
         * =========================
         */

        if (
            jid.endsWith("@g.us")
        ) {

            try {

                const metadata =
                    await sock.groupMetadata(
                        jid
                    );


                const participant =
                    metadata.participants.find(
                        p =>
                            p.id === target ||
                            p.id === targetAlt ||
                            p.lid === target ||
                            p.lid === targetAlt ||
                            p.phoneNumber === target ||
                            p.phoneNumber === targetAlt
                    );


                if (participant) {

                    /*
                     * Prefer phone number
                     */

                    if (
                        participant.phoneNumber
                    ) {

                        realJid =
                            participant.phoneNumber;

                    }

                    /*
                     * If no phone number,
                     * keep the participant JID.
                     */

                    else if (
                        participant.id
                    ) {

                        realJid =
                            participant.id;

                    }

                }

            } catch (error) {

                console.log(
                    "Profile group lookup failed:",
                    error.message
                );

            }

        }


        /*
         * =========================
         * LID → PHONE
         * =========================
         */

        if (
            realJid?.endsWith("@lid") &&
            sock?.signalRepository?.lidMapping
        ) {

            try {

                const phoneJid =
                    await sock
                        .signalRepository
                        .lidMapping
                        .getPNForLID(
                            realJid
                        );


                if (phoneJid) {

                    realJid =
                        phoneJid;

                }

            } catch (error) {

                console.log(
                    "Profile LID lookup failed:",
                    error.message
                );

            }

        }


        /*
         * =========================
         * GET NUMBER
         * =========================
         */

        if (
            realJid?.endsWith(
                "@s.whatsapp.net"
            )
        ) {

            number =
                realJid
                    .split("@")[0]
                    .split(":")[0];

        }


        /*
         * =========================
         * LOAD NAMES.JSON
         * =========================
         */

        const names =
            getSavedNames();


        /*
         * =========================
         * FIND TARGET USERNAME
         * =========================
         */

        const username =
            findUsername(
                names,
                target,
                targetAlt,
                context?.participant
            );


        /*
         * =========================
         * GET ABOUT
         * =========================
         */

        let about =
            "Not available";


        try {

            if (
                realJid &&
                realJid.endsWith(
                    "@s.whatsapp.net"
                )
            ) {

                const status =
                    await sock.fetchStatus(
                        realJid
                    );


                if (
                    status?.[0]
                        ?.status
                        ?.status
                ) {

                    about =
                        status[0]
                            .status
                            .status;

                }

            }

        } catch (error) {

            console.log(
                "Profile About lookup failed:",
                error.message
            );

        }


        /*
         * =========================
         * NUMBER DISPLAY
         * =========================
         */

        const displayNumber =
            number
                ? `+${number}`
                : "Not available";


        /*
         * =========================
         * PROFILE TEXT
         * =========================
         */

        const profileText =
`╭━━〔 👤 PROFILE 〕━━⬣
┃
┃ ✦ Username: ${username}
┃ ✦ Number: ${displayNumber}
┃ ✦ About: ${about}
┃
╰━━━━━━━━━━━━━━━━⬣`;


        /*
         * =========================
         * GET PROFILE PICTURE
         * =========================
         */

        let profilePicture =
            null;


        try {

            if (realJid) {

                profilePicture =
                    await sock.profilePictureUrl(
                        realJid,
                        "image"
                    );

            }

        } catch {

            try {

                profilePicture =
                    await sock.profilePictureUrl(
                        target,
                        "image"
                    );

            } catch {

                profilePicture =
                    null;

            }

        }


        /*
         * =========================
         * SEND PROFILE
         * =========================
         */

        if (profilePicture) {

            await sock.sendMessage(
                jid,
                {
                    image: {
                        url:
                            profilePicture
                    },

                    caption:
                        profileText
                }
            );

        } else {

            await sock.sendMessage(
                jid,
                {
                    text:
                        profileText
                }
            );

        }


        return null;


    } catch (error) {

        console.error(
            "Profile error:",
            error
        );

        return "❌ Failed to retrieve profile information.";

    }

};
