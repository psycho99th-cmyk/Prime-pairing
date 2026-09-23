const {
    addPair,
    cleanNumber,
    isPaired
} = require("../config/pair-system");

module.exports = async ({ args, message, sock }) => {

    /*
     * ━━━━━━━━━━━━━━━━━━━━━━━
     * REPLY-TO-PAIR
     * Reply to someone's message
     * and send:
     *
     * .pair
     * ━━━━━━━━━━━━━━━━━━━━━━━
     */

    const quoted =
        message?.message
            ?.extendedTextMessage
            ?.contextInfo;

    if (
        quoted?.participant ||
        quoted?.participantAlt
    ) {

        /*
         * IMPORTANT:
         * Prefer participantAlt because
         * participant may now be a @lid JID.
         */

        let target =
            quoted.participantAlt ||
            quoted.participant;

        /*
         * If WhatsApp only gives us a LID,
         * try to resolve it to the phone JID.
         */

        if (
            target?.endsWith("@lid") &&
            sock?.signalRepository?.lidMapping
        ) {

            try {

                const phoneJid =
                    await sock.signalRepository
                        .lidMapping
                        .getPNForLID(target);

                if (phoneJid) {
                    target = phoneJid;
                }

            } catch (error) {

                console.log(
                    "⚠️ LID → phone lookup failed:",
                    error.message
                );
            }
        }

        /*
         * NEVER save a LID as a paired number.
         */

        if (
            !target ||
            target.endsWith("@lid")
        ) {

            return `❌ *Couldn't find the person's phone number.*

Please try again after the person sends a new message.`;
        }

        const number =
            cleanNumber(target);

        if (!number) {
            return "❌ *Couldn't identify the phone number.*";
        }

        /*
         * CHECK IF ALREADY PAIRED
         */

        if (isPaired(number)) {

            return `⚠️ *Already Paired*

📱 Number: ${number}

This number is already allowed to use PRIME BOT.`;
        }

        const result =
            addPair(number);

        if (!result.success) {

            if (
                result.reason === "exists"
            ) {

                return `⚠️ *Already Paired*

📱 Number: ${result.number}

This number is already allowed to use PRIME BOT.`;
            }

            return "❌ Invalid phone number.";
        }

        return `✅ *PAIR SUCCESSFUL*

📱 Number: ${result.number}

🔓 Access: Granted

This number can now use PRIME BOT.`;
    }


    /*
     * ━━━━━━━━━━━━━━━━━━━━━━━
     * NORMAL PHONE NUMBER PAIR
     * ━━━━━━━━━━━━━━━━━━━━━━━
     */

    if (!args.length) {

        return `❌ *Missing phone number.*

Usage:
.pair 2349158667929

You can also reply to someone's message with:
.pair`;
    }


    /*
     * Join ALL arguments so numbers
     * containing spaces work.
     *
     * Example:
     * +49 1579 2327296
     *
     * becomes:
     * +4915792327296
     */

    const input =
        args.join("");

    const number =
        cleanNumber(input);

    if (!number) {
        return "❌ Invalid phone number.";
    }

    /*
     * CHECK IF ALREADY PAIRED
     */

    if (isPaired(number)) {

        return `⚠️ *Already Paired*

📱 Number: ${number}

This number is already allowed to use PRIME BOT.`;
    }

    const result =
        addPair(number);

    if (!result.success) {

        if (
            result.reason === "exists"
        ) {

            return `⚠️ *Already Paired*

📱 Number: ${result.number}

This number is already allowed to use PRIME BOT.`;
        }

        return "❌ Invalid phone number.";
    }

    return `✅ *PAIR SUCCESSFUL*

📱 Number: ${result.number}

🔓 Access: Granted

This number can now use PRIME BOT.`;
};
