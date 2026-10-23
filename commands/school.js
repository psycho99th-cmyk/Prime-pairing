const economy = require("../config/economy-system");

const COLLECTION_FEE = 10000;
const CLASS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours minimum between classes
const MISSING_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours before a day is counted as missed

const COURSES = {
    mechanic: { name: "🧹 Mechanic Trade", fee: 7000, totalClasses: 4, jobKey: "mechanic", jobName: "Mechanic" },
    business: { name: "🛒 Business & Retail", fee: 15000, totalClasses: 5, jobKey: "cashier", jobName: "Store Cashier" },
    "computer science": { name: "💻 Computer Science", fee: 25000, totalClasses: 7, jobKey: "developer", jobName: "Software Developer" },
    law: { name: "⚖️ Law School", fee: 40000, totalClasses: 9, jobKey: "lawyer", jobName: "Lawyer" },
    medical: { name: "🩺 Medical School", fee: 55000, totalClasses: 12, jobKey: "doctor", jobName: "Doctor" }
};

function formatTimeRemaining(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    return `${hours}h ${minutes}m`;
}

module.exports = async ({ sock, jid, message, args }) => {
    const who = await economy.identify(sock, message);
    if (!who.id) return;

    const user = economy.getUser(who.id);
    if (!user) return;

    const inGroup = jid.endsWith("@g.us") && who.jid;
    const tag = inGroup ? `@${who.jid.split("@")[0]}` : `*${user.name}*`;

    const action = (args && args[0] ? args[0] : "").toLowerCase();
    // Combine remaining args into a single string so multi-word keys like "computer science" work properly
    const courseKey = args ? args.slice(1).join(" ").toLowerCase() : "";

    // 1. ENROLL IN A COURSE (.school enroll <course>)
    if (action === "enroll") {
        if (user.activeCourse) {
            const currentCourse = COURSES[user.activeCourse.key];
            await sock.sendMessage(
                jid,
                { text: `❌ ${tag}, you are already enrolled in *${currentCourse?.name || user.activeCourse.key}*! Finish your course first.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        if (!courseKey || !COURSES[courseKey]) {
            await sock.sendMessage(
                jid,
                { text: `❌ Invalid course! Codes: *mechanic*, *business*, *computer science*, *law*, *medical*.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        const course = COURSES[courseKey];
        if ((user.wallet || 0) < course.fee) {
            await sock.sendMessage(
                jid,
                { text: `❌ Insufficient funds! You need *🪙${economy.format(course.fee)}* to enroll in ${course.name}.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        user.wallet -= course.fee;
        user.activeCourse = {
            key: courseKey,
            enrolledAt: Date.now(),
            classesAttended: 0,
            lastAttended: 0,
            extraDays: 0,
            completed: false
        };
        economy.save();

        const text =
`╭━━〔 🎓 PRIME ACADEMY 〕━━╮
┃
┃ ✅ *ENROLLED SUCCESSFULLY!*
┃
┃ 👤 ${tag}
┃ 📚 Course: *${course.name}*
┃ 💸 Fee Paid: *-${economy.format(course.fee)} coins*
┃ 🪙 Balance: *${economy.format(user.wallet)}*
┃
┃ ⏱️ Required Classes: *${course.totalClasses}* (1 every 24h)
┃ ⚠️ *Rule:* Missing class for >48h extends your course by +1 day per missed day!
┃
┃ 👉 Type: *.school attend* to attend your first class!
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 2. ATTEND CLASS (.school attend)
    if (action === "attend" || action === "class") {
        if (!user.activeCourse) {
            await sock.sendMessage(
                jid,
                { text: `❌ ${tag}, you are not enrolled in any course! Type *.school* to view courses.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        const course = COURSES[user.activeCourse.key];
        const now = Date.now();
        const last = user.activeCourse.lastAttended;

        if (last > 0 && now - last < CLASS_COOLDOWN_MS) {
            const remaining = CLASS_COOLDOWN_MS - (now - last);
            await sock.sendMessage(
                jid,
                { text: `⏳ ${tag}, class is not ready yet! Come back in *${formatTimeRemaining(remaining)}*.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        let missedNotice = "";
        if (last > 0 && now - last > MISSING_WINDOW_MS) {
            const excessTime = now - (last + CLASS_COOLDOWN_MS);
            const missedDays = Math.floor(excessTime / (24 * 60 * 60 * 1000));
            if (missedDays > 0) {
                user.activeCourse.extraDays = (user.activeCourse.extraDays || 0) + missedDays;
                missedNotice = `\n┃ ⚠️ Missed ${missedDays} day(s)! Course extended by +${missedDays} day(s).`;
            }
        }

        user.activeCourse.classesAttended += 1;
        user.activeCourse.lastAttended = now;

        const effectiveTotal = course.totalClasses + (user.activeCourse.extraDays || 0);
        const isFinished = user.activeCourse.classesAttended >= effectiveTotal;
        if (isFinished) {
            user.activeCourse.completed = true;
        }
        economy.save();

        const text =
`╭━━〔 🏫 CLASS ATTENDANCE 〕━━╮
┃
┃ ✅ *CLASS COMPLETED!*
┃
┃ 👤 ${tag}
┃ 📚 Course: *${course.name}*
┃ 📈 Progress: *${user.activeCourse.classesAttended} / ${effectiveTotal} classes*${missedNotice}
┃
${isFinished ? "┃ 🎉 *Course Completed!* Type *.school claim* to graduate." : "┃ ⏰ Come back in 24 hours for your next class!"}
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 3. CLAIM CERTIFICATE (.school claim)
    if (action === "claim" || action === "graduate") {
        if (!user.activeCourse || !user.activeCourse.completed) {
            await sock.sendMessage(
                jid,
                { text: `❌ ${tag}, you have not completed your course yet!` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        if ((user.wallet || 0) < COLLECTION_FEE) {
            await sock.sendMessage(
                jid,
                { text: `❌ Insufficient funds! You need *🪙${economy.format(COLLECTION_FEE)}* collection fee.` },
                inGroup ? { mentions: [who.jid] } : {}
            );
            return;
        }

        const courseKey = user.activeCourse.key;
        user.wallet -= COLLECTION_FEE;
        if (!user.certificates.includes(courseKey)) {
            user.certificates.push(courseKey);
        }
        user.activeCourse = null;
        economy.save();

        const text =
`╭━━〔 🎓 GRADUATION & CERTIFICATE 〕━━╮
┃
┃ 🎉 *CONGRATULATIONS, GRADUATE!*
┃
┃ 👤 ${tag}
┃ 💸 Collection Fee: *-${economy.format(COLLECTION_FEE)} coins*
┃ 👛 Balance: *${economy.format(user.wallet)}*
┃
┃ Permanent certificate acquired! 👉 Type *.cert* to view.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

        await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
        return;
    }

    // 4. DEFAULT: VIEW CATALOG & STATUS (.school)
    let statusText = "Not enrolled in any course ❌";
    if (user.activeCourse) {
        const c = COURSES[user.activeCourse.key];
        const effectiveTotal = c.totalClasses + (user.activeCourse.extraDays || 0);
        statusText = `${c?.name} (${user.activeCourse.classesAttended}/${effectiveTotal} classes)`;
    }

    const text =
`╭━━〔 🏛️ PRIME ACADEMY 〕━━╮
┃
┃ 👤 ${tag}
┃ 📌 Status: *${statusText}*
┃ ⚠️ *Rule:* Missing class for >48h extends your duration by 1 day!
┃
┃ 📚 *Available Courses:*
┃ • Mechanic: *.school enroll mechanic* (🪙7k, 4 Days)
┃ • Business: *.school enroll business* (🪙15k, 5 Days)
┃ • Computer Science: *.school enroll computer science* (🪙25k, 7 Days)
┃ • Law: *.school enroll law* (🪙40k, 9 Days)
┃ • Medical: *.school enroll medical* (🪙55k, 12 Days)
┃
┃ 💡 *Commands:*
┃ • Enroll: *.school enroll <course name>*
┃ • Attend: *.school attend*
┃ • Graduate: *.school claim*
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, inGroup ? { text, mentions: [who.jid] } : { text }, { quoted: message });
};

module.exports.public = true;
