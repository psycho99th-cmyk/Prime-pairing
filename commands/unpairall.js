const {
    loadPairs,
    savePairs
} = require("../config/pair-system");

module.exports = async () => {

    const pairs =
        loadPairs();

    if (
        pairs.length === 0
    ) {

        return `⚠️ *NO PAIRED USERS*

There are currently no paired users to remove.`;

    }

    const count =
        pairs.length;

    savePairs([]);

    return `✅ *ALL PAIRS REMOVED*

🔒 Access has been removed from ${count} paired user${count === 1 ? "" : "s"}.

👥 Total paired users: 0`;

};
