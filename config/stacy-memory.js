const fs = require("fs");
const path = require("path");

const memoryFile = path.join(
    __dirname,
    "stacy-memory.json"
);

const MEMORY_VERSION = 3;

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   DEFAULT MEMORY
========================================================= */

const DEFAULT_MEMORY = {
    version: MEMORY_VERSION,

    people: {},

    groups: {},

    relationships: [],

    globalEvents: []
};

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   LOAD
========================================================= */

function loadMemory() {

    try {

        if (!fs.existsSync(memoryFile)) {
            return {
                ...DEFAULT_MEMORY
            };
        }

        const raw =
            fs.readFileSync(
                memoryFile,
                "utf8"
            );

        if (!raw.trim()) {
            return {
                ...DEFAULT_MEMORY
            };
        }

        const data =
            JSON.parse(raw);

        return migrateMemory(data);

    } catch (error) {

        console.error(
            "🔥 STACY MEMORY LOAD ERROR:",
            error
        );

        return {
            ...DEFAULT_MEMORY
        };
    }
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   MIGRATION
========================================================= */

function migrateMemory(data) {

    /*
     * Old format:
     *
     * {
     *   "lid": {
     *      name: "...",
     *      age: "...",
     *      ...
     *   }
     * }
     *
     * New format:
     *
     * {
     *   version: 3,
     *   people: {},
     *   groups: {},
     *   relationships: [],
     *   globalEvents: []
     * }
     */

    if (
        data &&
        typeof data === "object" &&
        !data.people
    ) {

        const oldPeople = {};

        for (
            const [lid, profile]
            of Object.entries(data)
        ) {

            if (
                lid === "version" ||
                lid === "groups" ||
                lid === "relationships" ||
                lid === "globalEvents"
            ) {
                continue;
            }

            if (
                profile &&
                typeof profile === "object"
            ) {

                oldPeople[
                    normalizeLid(lid)
                ] = normalizePerson(
                    profile,
                    lid
                );
            }
        }

        return {
            version: MEMORY_VERSION,

            people: oldPeople,

            groups:
                data.groups || {},

            relationships:
                data.relationships || [],

            globalEvents:
                data.globalEvents || []
        };
    }

    const migrated = {
        ...DEFAULT_MEMORY,

        ...data,

        version: MEMORY_VERSION,

        people:
            data?.people || {},

        groups:
            data?.groups || {},

        relationships:
            Array.isArray(
                data?.relationships
            )
                ? data.relationships
                : [],

        globalEvents:
            Array.isArray(
                data?.globalEvents
            )
                ? data.globalEvents
                : []
    };

    for (
        const [lid, profile]
        of Object.entries(
            migrated.people
        )
    ) {

        migrated.people[
            normalizeLid(lid)
        ] =
            normalizePerson(
                profile,
                lid
            );
    }

    saveMemoryObject(migrated);

    return migrated;
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   NORMALIZE LID
========================================================= */

function normalizeLid(lid) {

    if (!lid) {
        return null;
    }

    return String(lid)
        .trim()
        .toLowerCase()
        .replace(/:\d+@/, "@");
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   NORMALIZE PERSON
========================================================= */

function normalizePerson(
    profile = {},
    lid
) {

    return {

        lid:
            normalizeLid(
                profile.lid || lid
            ),

        name:
            profile.name || null,

        aliases:
            Array.isArray(profile.aliases)
                ? profile.aliases
                : [],

        age:
            profile.age || null,

        gender:
            profile.gender || null,

        interests:
            Array.isArray(profile.interests)
                ? profile.interests
                : [],

        likes:
            Array.isArray(profile.likes)
                ? profile.likes
                : [],

        dislikes:
            Array.isArray(profile.dislikes)
                ? profile.dislikes
                : [],

        importantFacts:
            Array.isArray(
                profile.importantFacts
            )
                ? profile.importantFacts
                : [],

        events:
            Array.isArray(profile.events)
                ? profile.events
                : [],

        temporaryMemories:
            Array.isArray(
                profile.temporaryMemories
            )
                ? profile.temporaryMemories
                : [],

        notes:
            Array.isArray(profile.notes)
                ? profile.notes
                : [],

        conversationSummary:
            profile.conversationSummary ||
            "",

        communicationStyle: {

            language:
                profile.communicationStyle
                    ?.language ||
                "Nigerian English",

            usesPidgin:
                profile.communicationStyle
                    ?.usesPidgin ||
                false,

            usesEmojis:
                profile.communicationStyle
                    ?.usesEmojis ||
                false,

            humour:
                profile.communicationStyle
                    ?.humour ||
                "unknown",

            tone:
                profile.communicationStyle
                    ?.tone ||
                "unknown"
        },

        relationship: {

            status:
                profile.relationship
                    ?.status ||
                "unknown",

            partnerName:
                profile.relationship
                    ?.partnerName ||
                null,

            history:
                Array.isArray(
                    profile.relationship
                        ?.history
                )
                    ? profile.relationship.history
                    : []
        },

        firstSeen:
            profile.firstSeen ||
            new Date().toISOString(),

        lastSeen:
            profile.lastSeen ||
            new Date().toISOString(),

        createdAt:
            profile.createdAt ||
            new Date().toISOString(),

        updatedAt:
            profile.updatedAt ||
            new Date().toISOString()
    };
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   SAVE
========================================================= */

let memory = loadMemory();

function saveMemoryObject(
    object
) {

    try {

        fs.writeFileSync(
            memoryFile,
            JSON.stringify(
                object,
                null,
                4
            ),
            "utf8"
        );

    } catch (error) {

        console.error(
            "🔥 STACY MEMORY SAVE ERROR:",
            error
        );
    }
}

function saveMemory() {
    saveMemoryObject(memory);
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   PERSON
========================================================= */

function getPersonMemory(lid) {

    const normalized =
        normalizeLid(lid);

    if (!normalized) {
        return null;
    }

    return (
        memory.people[normalized] ||
        null
    );
}

function ensurePerson(lid) {

    const normalized =
        normalizeLid(lid);

    if (!normalized) {
        return null;
    }

    if (
        !memory.people[normalized]
    ) {

        memory.people[normalized] =
            normalizePerson(
                {
                    lid: normalized
                },
                normalized
            );

        saveMemory();
    }

    return memory.people[normalized];
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   UNIQUE VALUES
========================================================= */

function addUnique(
    target,
    values
) {

    if (!Array.isArray(target)) {
        return;
    }

    if (!Array.isArray(values)) {
        values = [values];
    }

    for (
        const value of values
    ) {

        if (
            value === null ||
            value === undefined
        ) {
            continue;
        }

        const clean =
            String(value).trim();

        if (!clean) {
            continue;
        }

        const exists =
            target.some(
                item =>
                    String(item)
                        .toLowerCase() ===
                    clean.toLowerCase()
            );

        if (!exists) {
            target.push(clean);
        }
    }
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   UPDATE PERSON
========================================================= */

function updatePerson(
    lid,
    updates = {}
) {

    const profile =
        ensurePerson(lid);

    if (!profile) {
        return null;
    }

    if (
        updates.name !== undefined &&
        updates.name !== null &&
        String(updates.name).trim()
    ) {

        profile.name =
            String(
                updates.name
            ).trim();
    }

    if (
        updates.age !== undefined &&
        updates.age !== null
    ) {

        const age =
            Number(updates.age);

        if (
            Number.isFinite(age) &&
            age > 0 &&
            age < 120
        ) {

            profile.age = age;
        }
    }

    if (
        updates.gender !== undefined &&
        updates.gender !== null &&
        String(updates.gender).trim()
    ) {

        profile.gender =
            String(
                updates.gender
            ).trim();
    }

    addUnique(
        profile.aliases,
        updates.aliases
    );

    addUnique(
        profile.interests,
        updates.interests
    );

    addUnique(
        profile.likes,
        updates.likes
    );

    addUnique(
        profile.dislikes,
        updates.dislikes
    );

    addUnique(
        profile.importantFacts,
        updates.importantFacts
    );

    addUnique(
        profile.notes,
        updates.notes
    );

    if (
        Array.isArray(
            updates.events
        )
    ) {

        for (
            const event
            of updates.events
        ) {

            if (!event) {
                continue;
            }

            profile.events.push({

                description:
                    typeof event === "string"
                        ? event
                        : event.description ||
                          event.name ||
                          JSON.stringify(event),

                date:
                    event?.date ||
                    null,

                addedAt:
                    new Date()
                        .toISOString()
            });
        }
    }

    if (
        Array.isArray(
            updates.temporaryMemories
        )
    ) {

        for (
            const item
            of updates.temporaryMemories
        ) {

            if (!item) {
                continue;
            }

            profile.temporaryMemories.push({

                content:
                    typeof item === "string"
                        ? item
                        : item.content || "",

                expiresAt:
                    item?.expiresAt ||
                    new Date(
                        Date.now() +
                        7 * 24 * 60 * 60 * 1000
                    ).toISOString(),

                addedAt:
                    new Date()
                        .toISOString()
            });
        }
    }

    if (
        updates.relationship &&
        typeof updates.relationship === "object"
    ) {

        updateRelationship(
            lid,
            updates.relationship.status,
            updates.relationship.partnerName
        );
    }

    if (
        updates.communicationStyle &&
        typeof updates.communicationStyle === "object"
    ) {

        profile.communicationStyle = {

            ...profile.communicationStyle,

            ...updates.communicationStyle
        };
    }

    if (
        updates.conversationSummary !==
        undefined
    ) {

        profile.conversationSummary =
            String(
                updates.conversationSummary ||
                ""
            ).slice(
                0,
                2000
            );
    }

    profile.lastSeen =
        new Date().toISOString();

    profile.updatedAt =
        new Date().toISOString();

    saveMemory();

    return profile;
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   FACTS
========================================================= */

function rememberFact(
    lid,
    fact
) {

    if (!fact) {
        return null;
    }

    return updatePerson(
        lid,
        {
            importantFacts: [
                fact
            ]
        }
    );
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   TEMPORARY MEMORY
========================================================= */

function addTemporaryMemory(
    lid,
    content,
    expiresAt
) {

    if (!content) {
        return null;
    }

    return updatePerson(
        lid,
        {
            temporaryMemories: [
                {
                    content,
                    expiresAt
                }
            ]
        }
    );
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   RELATIONSHIPS
========================================================= */

function updateRelationship(
    lid,
    status,
    partnerName = null
) {

    const profile =
        ensurePerson(lid);

    if (!profile) {
        return null;
    }

    const oldStatus =
        profile.relationship.status;

    const oldPartner =
        profile.relationship.partnerName;

    profile.relationship = {

        status:
            status ||
            oldStatus ||
            "unknown",

        partnerName:
            partnerName ||
            oldPartner ||
            null,

        history:
            Array.isArray(
                profile.relationship.history
            )
                ? profile.relationship.history
                : []
    };

    if (
        status &&
        (
            status !== oldStatus ||
            partnerName !== oldPartner
        )
    ) {

        profile.relationship.history.push({

            previousStatus:
                oldStatus,

            previousPartner:
                oldPartner,

            newStatus:
                status,

            newPartner:
                partnerName,

            changedAt:
                new Date()
                    .toISOString()
        });
    }

    profile.updatedAt =
        new Date().toISOString();

    saveMemory();

    return profile;
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   PERSON CONTEXT
========================================================= */

function getPersonContext(
    lid
) {

    const profile =
        getPersonMemory(lid);

    if (!profile) {

        return (
            "No previous information is known about this person."
        );
    }

    const lines = [];

    lines.push(
        `Person ID: ${profile.lid}`
    );

    if (profile.name) {

        lines.push(
            `Name: ${profile.name}`
        );
    }

    if (
        profile.aliases?.length
    ) {

        lines.push(
            `Aliases: ${
                profile.aliases.join(", ")
            }`
        );
    }

    if (profile.age) {

        lines.push(
            `Age: ${profile.age}`
        );
    }

    if (profile.gender) {

        lines.push(
            `Gender: ${profile.gender}`
        );
    }

    if (
        profile.interests?.length
    ) {

        lines.push(
            `Interests: ${
                profile.interests.join(", ")
            }`
        );
    }

    if (
        profile.likes?.length
    ) {

        lines.push(
            `Likes: ${
                profile.likes.join(", ")
            }`
        );
    }

    if (
        profile.dislikes?.length
    ) {

        lines.push(
            `Dislikes: ${
                profile.dislikes.join(", ")
            }`
        );
    }

    if (
        profile.importantFacts?.length
    ) {

        lines.push(
            `Important facts: ${
                profile.importantFacts.join("; ")
            }`
        );
    }

    if (
        profile.notes?.length
    ) {

        lines.push(
            `Notes: ${
                profile.notes.join("; ")
            }`
        );
    }

    if (
        profile.events?.length
    ) {

        for (
            const event
            of profile.events.slice(-10)
        ) {

            lines.push(
                `Event: ${
                    event.description ||
                    JSON.stringify(event)
                }`
            );
        }
    }

    if (
        profile.temporaryMemories?.length
    ) {

        for (
            const item
            of profile.temporaryMemories
        ) {

            lines.push(
                `Temporary memory: ${
                    item.content
                }`
            );
        }
    }

    if (
        profile.relationship?.status &&
        profile.relationship.status !==
            "unknown"
    ) {

        lines.push(
            `Relationship status: ${
                profile.relationship.status
            }`
        );

        if (
            profile.relationship.partnerName
        ) {

            lines.push(
                `Partner: ${
                    profile.relationship.partnerName
                }`
            );
        }
    }

    if (
        profile.conversationSummary
    ) {

        lines.push(
            `Conversation summary: ${
                profile.conversationSummary
            }`
        );
    }

    return lines.join("\n");
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   GROUPS
========================================================= */

function getGroup(
    groupId
) {

    if (!groupId) {
        return null;
    }

    if (
        !memory.groups[groupId]
    ) {

        memory.groups[groupId] = {

            groupId,

            name: null,

            commonTopics: [],

            members: {},

            conversation: [],

            createdAt:
                new Date()
                    .toISOString(),

            updatedAt:
                new Date()
                    .toISOString()
        };

        saveMemory();
    }

    return memory.groups[groupId];
}

function registerGroupMember(
    groupId,
    lid,
    name = null
) {

    if (!groupId || !lid) {
        return;
    }

    const normalized =
        normalizeLid(lid);

    const group =
        getGroup(groupId);

    const person =
        ensurePerson(normalized);

    if (!group || !person) {
        return;
    }

    if (
        !group.members[normalized]
    ) {

        group.members[normalized] = {

            lid: normalized,

            name:
                name ||
                person.name ||
                null,

            firstSeen:
                new Date()
                    .toISOString(),

            lastSeen:
                new Date()
                    .toISOString()
        };

    } else {

        group.members[
            normalized
        ].lastSeen =
            new Date().toISOString();

        if (
            name &&
            !group.members[
                normalized
            ].name
        ) {

            group.members[
                normalized
            ].name = name;
        }
    }

    if (
        name &&
        !person.name
    ) {

        person.name = name;
    }

    person.lastSeen =
        new Date().toISOString();

    group.updatedAt =
        new Date().toISOString();

    saveMemory();
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   SPEAKER-AWARE GROUP MEMORY
========================================================= */

function addGroupConversation(
    groupId,
    role,
    content,
    personLid = null,
    speaker = null
) {

    const group =
        getGroup(groupId);

    if (!group || !content) {
        return;
    }

    const isStacy =
        role === "assistant" ||
        speaker === "stacy";

    group.conversation.push({

        role,

        speaker:
            isStacy
                ? "stacy"
                : "human",

        personLid:
            isStacy
                ? null
                : normalizeLid(
                    personLid
                ),

        content:
            String(content)
                .slice(0, 3000),

        timestamp:
            new Date().toISOString()
    });

    if (
        group.conversation.length >
        40
    ) {

        group.conversation =
            group.conversation.slice(
                -40
            );
    }

    group.updatedAt =
        new Date().toISOString();

    saveMemory();
}

function buildGroupConversation(
    groupId
) {

    const group =
        getGroup(groupId);

    if (!group) {
        return "";
    }

    return group.conversation
        .map(entry => {

            if (
                entry.speaker ===
                "stacy"
            ) {

                return (
                    `[Stacy]\n` +
                    entry.content
                );
            }

            const person =
                entry.personLid
                    ? getPersonMemory(
                        entry.personLid
                    )
                    : null;

            return (
                `[${person?.name || "Unknown person"} | ID: ${
                    entry.personLid || "unknown"
                }]\n` +
                entry.content
            );
        })
        .join("\n\n");
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   CONVERSATION SUMMARY
========================================================= */

function updateConversationSummary(
    lid,
    summary
) {

    if (!lid || !summary) {
        return;
    }

    return updatePerson(
        lid,
        {
            conversationSummary:
                summary
        }
    );
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   CLEANUP
========================================================= */

function cleanupMemory() {

    const now =
        Date.now();

    for (
        const profile
        of Object.values(
            memory.people
        )
    ) {

        profile.events =
            Array.isArray(
                profile.events
            )
                ? profile.events.slice(-30)
                : [];

        profile.temporaryMemories =
            Array.isArray(
                profile.temporaryMemories
            )
                ? profile.temporaryMemories
                    .filter(item => {

                        if (
                            !item.expiresAt
                        ) {
                            return true;
                        }

                        return (
                            new Date(
                                item.expiresAt
                            ).getTime() >
                            now
                        );
                    })
                : [];
    }

    if (
        memory.relationships.length >
        200
    ) {

        memory.relationships =
            memory.relationships.slice(
                -200
            );
    }

    if (
        memory.globalEvents.length >
        100
    ) {

        memory.globalEvents =
            memory.globalEvents.slice(
                -100
            );
    }

    saveMemory();
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   GET MEMORY
========================================================= */

function getMemory() {
    return memory;
}

/* =========================================================
   GET PERSON LID FROM WHATSAPP MESSAGE
========================================================= */

function getPersonLid(message) {

    const key =
        message?.key;

    return normalizeLid(
        key?.participantAlt ||
        key?.participant ||
        key?.remoteJidAlt ||
        key?.remoteJid ||
        null
    );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    getPersonLid,

    normalizeLid,

    getPersonMemory,

    ensurePerson,

    updatePerson,

    rememberFact,

    updateRelationship,

    addTemporaryMemory,

    getPersonContext,

    getGroup,

    registerGroupMember,

    addGroupConversation,

    buildGroupConversation,

    updateConversationSummary,

    cleanupMemory,

    getMemory,

    saveMemory
};
