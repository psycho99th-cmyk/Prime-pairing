const {
    removePair
} = require("../config/pair-system");

module.exports = async ({ args }) => {

    if (!args[0]) {

        return `❌ *Missing phone number.*

Usage:
.delpair 2349158667929`;

    }

    const result =
        removePair(args[0]);


    if (!result.success) {

        if (
            result.reason ===
            "not_found"
        ) {

            return `⚠️ *Not Paired*

📱 Number: ${result.number}

This number is not currently paired with PRIME BOT.`;

        }


        return "❌ Invalid phone number.";

    }


    return `✅ *PAIR DELETED*

📱 Number: ${result.number}

🔒 Access: Removed

This number can no longer use PRIME BOT.`;

};
