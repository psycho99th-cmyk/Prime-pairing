const economy = require("../config/economy-system");
const carsData = require("../config/cars");

module.exports = async ({ sock, jid, message }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const sender = economy.getUser(who.id);
    if (!sender) {
        await sock.sendMessage(jid, { text: "❌ You are not registered yet! Type *.register*." }, { quoted: message });
        return;
    }

    const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || {};
    let targetUser = sender;
    let targetJid = contextInfo.mentionedJid?.[0] || contextInfo.participant || null;
    let isOther = false;

    if (targetJid) {
        if (!message.key?.fromMe) {
            await sock.sendMessage(jid, { text: "❌ You can only check your own inventory!" }, { quoted: message });
            return;
        }

        const found = economy.findUserByJid(targetJid);
        if (found) {
            targetUser = found;
            isOther = true;
        } else {
            await sock.sendMessage(jid, { text: "❌ That user is not registered in the economy yet!" }, { quoted: message });
            return;
        }
    }

    // 1. Format Cars / Garage
    const userCars = targetUser.cars || [];
    let carsDisplay = "• No cars owned 🚶‍♂️";
    let totalCarValue = 0;

    if (userCars.length > 0) {
        carsDisplay = userCars.map((carName, index) => {
            const carObj = carsData.find(c => c.name === carName);
            const price = carObj ? carObj.price : 0;
            totalCarValue += price;
            return `  ${index + 1}. 🚗 ${carName} (🪙${economy.format(price)})`;
        }).join("\n");
    }

    // 2. Format Certificates
    const userCerts = targetUser.certificates || [];
    let certsDisplay = "• None earned 📜";
    if (userCerts.length > 0) {
        certsDisplay = userCerts.map((cert, index) => `  ${index + 1}. 🎓 ${cert}`).join("\n");
    }

    // 3. Job & CV info
    const jobStatus = targetUser.job ? targetUser.job.toUpperCase() : "Unemployed";
    const cvStatus = targetUser.cv && Date.now() < targetUser.cv.expiresAt ? "✅ Active CV" : "❌ No Active CV";

    const inGroup = jid.endsWith("@g.us");
    const tag = isOther ? `@${(targetUser.jid || targetJid).split("@")[0].replace(":", "")}` : (who.jid ? `@${who.jid.split("@")[0]}` : `*${targetUser.name}*`);

    const text =
`╭━━〔 🎒 PLAYER INVENTORY 〕━━╮
┃
┃ 👤 Owner: ${tag}
┃ 💼 Job: *${jobStatus}* | Status: *${cvStatus}*
┃
┃ 🚗 *Garage (${userCars.length}):*
${carsDisplay}
┃   └ Total Car Value: *🪙${economy.format(totalCarValue)}*
┃
┃ 📜 *Certificates (${userCerts.length}):*
${certsDisplay}
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

    const allMentions = isOther ? [targetUser.jid || targetJid].filter(Boolean) : (who.jid ? [who.jid] : []);

    await sock.sendMessage(jid, inGroup ? { text, mentions: allMentions } : { text }, { quoted: message });
};

module.exports.public = true;
