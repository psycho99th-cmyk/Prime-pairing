// commands/tts.js
// Usage: .tts <text>   |   .tts -fr <text>   |   reply to a message with .tts

const googleTTS = require("google-tts-api");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// WhatsApp voice notes need OGG/Opus, so convert the MP3 with ffmpeg
function toOpus(mp3Buffer) {
    return new Promise((resolve, reject) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const inFile = path.join(os.tmpdir(), `tts-${id}.mp3`);
        const outFile = path.join(os.tmpdir(), `tts-${id}.ogg`);

        fs.writeFileSync(inFile, mp3Buffer);

        execFile(
            "ffmpeg",
            [
                "-y", "-i", inFile, "-vn",
                "-c:a", "libopus", "-b:a", "48k",
                "-ar", "48000", "-ac", "1",
                "-f", "ogg", outFile
            ],
            (error) => {
                try {
                    if (error) return reject(error);
                    resolve(fs.readFileSync(outFile));
                } catch (e) {
                    reject(e);
                } finally {
                    fs.rmSync(inFile, { force: true });
                    fs.rmSync(outFile, { force: true });
                }
            }
        );
    });
}

module.exports = async ({ sock, jid, message, args }) => {
    const quotedMsg =
        message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
        quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || "";

    // Optional language flag, e.g. -fr, -es, -pt-BR
    const words = [...args];
    let lang = "en";
    if (words[0] && /^-[a-z]{2}(-[a-z]{2})?$/i.test(words[0])) {
        lang = words.shift().slice(1);
    }

    const text = (words.join(" ") || quotedText).trim();

    if (!text) {
        return "❌ Usage: *.tts <text>*\nOther language: *.tts -fr bonjour*\nOr reply to a message with *.tts*";
    }

    if (text.length > 600) {
        return "❌ Text is too long (max 600 characters).";
    }

    try {
        const parts = await googleTTS.getAllAudioBase64(text, {
            lang,
            slow: false,
            host: "https://translate.google.com",
            timeout: 15000,
            splitPunct: ",.?!"
        });

        const mp3 = Buffer.concat(
            parts.map((p) => Buffer.from(p.base64, "base64"))
        );

        // Preferred: real voice note (OGG/Opus)
        try {
            const opus = await toOpus(mp3);
            await sock.sendMessage(
                jid,
                { audio: opus, mimetype: "audio/ogg; codecs=opus", ptt: true },
                { quoted: message }
            );
            return;
        } catch (error) {
            console.log("⚠️ ffmpeg conversion failed, sending MP3 instead:", error.message);
        }

        // Fallback: normal audio file
        await sock.sendMessage(
            jid,
            { audio: mp3, mimetype: "audio/mpeg", ptt: false },
            { quoted: message }
        );
    } catch (error) {
        console.error("🔥 TTS ERROR:", error);
        return "❌ Failed to convert text to speech. Check the language code and try again.";
    }
};
