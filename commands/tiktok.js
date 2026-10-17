// commands/tiktok.js
// Usage: .tiktok <tiktok link>  (or reply to a message containing a link)

const API = "https://www.tikwm.com";
const full = (u) => (u && !u.startsWith("http") ? API + u : u);

module.exports = async ({ sock, jid, message, args }) => {
    // Link from args, or from a quoted message
    const quoted =
        message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
        quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    const input = args[0] || quotedText.match(/https?:\/\/\S+/)?.[0];

    if (!input || !/tiktok\.com/i.test(input)) {
        return "❌ Usage: *.tiktok <tiktok link>*";
    }

    try {
        const res = await fetch(
            `${API}/api/?url=${encodeURIComponent(input)}&hd=1`,
            { signal: AbortSignal.timeout(20000) }
        );
        const json = await res.json();
        if (json.code !== 0 || !json.data) throw new Error(json.msg || "API error");

        const d = json.data;
        const caption =
`╭━━〔 🎵 TIKTOK 〕━━╮
┃
┃ 👤 @${d.author?.unique_id || "unknown"}
┃ ❤️ ${d.digg_count ?? 0}
┃ 💬 ${d.comment_count ?? 0}
┃ 📝 ${d.title || "No caption"}━━━━━━━━━━━━━━━━━━━
*POWERED BY PRIME BOT*`;

        if (Array.isArray(d.images) && d.images.length) {
            // Photo slideshow post
            for (const img of d.images.slice(0, 10)) {
                await sock.sendMessage(
                    jid,
                    { image: { url: full(img) } },
                    { quoted: message }
                );
            }
            await sock.sendMessage(jid, { text: caption }, { quoted: message });
        } else {
            // Normal video post
            await sock.sendMessage(
                jid,
                { video: { url: full(d.hdplay || d.play) }, caption },
                { quoted: message }
            );
        }
    } catch (error) {
        console.error("🔥 TIKTOK ERROR:", error);
        return "❌ Failed to download. Check the link and try again.";
    }
};
