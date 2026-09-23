module.exports = async ({ sock, jid, message }) => {
    const start = Date.now();

    await sock.sendMessage(
        jid,
        {
            text: "🏓"
        },
        {
            quoted: message
        }
    );

    const latency =
        Date.now() - start;

    let indicator;

    if (latency < 100) {
        indicator = "🟢";
    } else if (latency <= 300) {
        indicator = "🟡";
    } else {
        indicator = "🔴";
    }

    return `[${indicator} ${latency}ms]`;
};
