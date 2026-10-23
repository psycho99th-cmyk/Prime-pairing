const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "economy.json");

const CURRENCY = "PRIME coins 🪙";
const START_COINS = 3000;

function emptyDb() {
    return { users: {}, lids: {} };
}

function readJson(target) {
    const data = JSON.parse(fs.readFileSync(target, "utf8"));
    return {
        users: data.users || {},
        lids: data.lids || {}
    };
}

function load() {
    if (!fs.existsSync(file) && !fs.existsSync(file + ".bak")) {
        return emptyDb();
    }

    for (const target of [file, file + ".bak"]) {
        try {
            if (fs.existsSync(target)) {
                const data = readJson(target);
                if (target !== file) {
                    console.log("⚠️ Economy file was damaged, restored from the backup.");
                }
                return data;
            }
        } catch (error) {
            console.error(`❌ Could not read ${path.basename(target)}:`, error.message);
            try {
                fs.copyFileSync(target, `${target}.corrupt-${Date.now()}`);
            } catch {}
        }
    }

    console.error("🔥 Economy data could not be loaded. Starting empty.");
    return emptyDb();
}

const db = load();

function save() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, file + ".bak");
    }
    fs.renameSync(tmp, file);
}

const isPhoneJid = jid => typeof jid === "string" && jid.endsWith("@s.whatsapp.net");
const isLid = jid => typeof jid === "string" && jid.endsWith("@lid");
const digitsOf = jid => String(jid || "").split("@")[0].split(":")[0];

function normalizeJid(jid) {
    return jid ? jid.replace(/:\d+@/, "@") : null;
}

function senderJids(sock, message) {
    if (message.key?.fromMe) {
        return [sock?.user?.id, sock?.user?.lid].filter(Boolean);
    }
    return [
        message.key?.participantAlt,
        message.key?.participant,
        message.key?.remoteJidAlt,
        message.key?.remoteJid
    ].filter(jid => jid && !jid.endsWith("@g.us"));
}

async function identify(sock, message) {
    const jids = senderJids(sock, message);
    const phoneJid = jids.map(normalizeJid).find(isPhoneJid);
    const lid = jids.map(normalizeJid).find(isLid);

    let id = null;
    let mention = phoneJid || lid || null;

    if (phoneJid) {
        id = digitsOf(phoneJid);
        if (lid && db.lids[lid] !== id) {
            db.lids[lid] = id;
            if (db.users[id]) save();
        }
    } else if (lid) {
        id = db.lids[lid] || null;
        if (!id) {
            try {
                const mapped = await sock?.signalRepository?.lidMapping?.getPNForLID(lid);
                if (mapped) {
                    id = digitsOf(mapped);
                    mention = normalizeJid(mapped);
                    db.lids[lid] = id;
                }
            } catch {}
        }
        if (!id) {
            id = `lid:${digitsOf(lid)}`;
        } else if (isPhoneJid(mention) === false && /^\d+$/.test(id)) {
            mention = `${id}@s.whatsapp.net`;
        }
    }

    const name = message.pushName || (id && /^\d+$/.test(id) ? `+${id}` : "Player");

    if (id && db.users[id]) {
        if (mention && !db.users[id].jid) {
            db.users[id].jid = mention;
            save();
        }
    }

    return { id, jid: mention, name };
}

function getUser(id) {
    return db.users[id] || null;
}

function getAllUsers() {
    return db.users || {};
}

function findUserByJid(targetJid) {
    if (!targetJid) return null;
    const cleanDigits = digitsOf(targetJid);

    if (db.users[cleanDigits]) return db.users[cleanDigits];

    if (isLid(targetJid)) {
        const mappedId = db.lids[targetJid];
        if (mappedId && db.users[mappedId]) return db.users[mappedId];

        const lidKey = `lid:${cleanDigits}`;
        if (db.users[lidKey]) return db.users[lidKey];
    }

    const normTarget = normalizeJid(targetJid);
    for (const id in db.users) {
        const u = db.users[id];
        if (u.jid && normalizeJid(u.jid) === normTarget) {
            return u;
        }
    }

    return null;
}

function createUser(who) {
    if (!who?.id || db.users[who.id]) {
        return null;
    }

    db.users[who.id] = {
        id: who.id,
        name: who.name,
        jid: who.jid || (String(who.id).match(/^\d+$|^\+?\d+$/) ? `${who.id.replace('+', '')}@s.whatsapp.net` : null),
        registeredAt: Date.now(),
        wallet: START_COINS,
        bank: 0,
        inventory: {},
        cars: [],
        cooldowns: {},
        streak: 0,
        cv: null,
        job: null,
        activeCourse: null,
        certificates: [],
        history: []
    };

    save();
    return db.users[who.id];
}

function addTransaction(user, record) {
    if (!user.history) user.history = [];
    user.history.push({
        ...record,
        timestamp: Date.now()
    });
    if (user.history.length > 15) {
        user.history = user.history.slice(-15);
    }
    save();
}

function format(amount) {
    return Number(amount || 0).toLocaleString("en-US");
}

module.exports = {
    CURRENCY,
    START_COINS,
    identify,
    getUser,
    getAllUsers,
    findUserByJid,
    createUser,
    addTransaction,
    save,
    format
};
