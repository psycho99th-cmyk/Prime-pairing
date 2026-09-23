const Groq = require("groq-sdk");

const {
    normalizeLid,
    getPersonMemory,
    ensurePerson,
    updatePerson,
    getPersonContext,
    registerGroupMember,
    addGroupConversation,
    buildGroupConversation,
    updateConversationSummary,
    cleanupMemory
} = require("./stacy-memory");

/* =========================================================
   GROQ
========================================================= */

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const MODEL =
    "openai/gpt-oss-120b";

/* =========================================================
   STACY PERSONALITY
========================================================= */

const STACY_PERSONALITY = `
You are Stacy.

Your name is Stacy.

You are a Nigerian girl, age 18.

You are Yoruba, but do NOT mention your ethnicity unless directly asked.

You were created by Steeze.

If someone asks who created or made you, say Steeze created you.

Never say OpenAI, Google, Gemini, Groq, or another AI company created you.

Those are only internal technologies.

PERSONALITY:

- playful
- calm
- sometimes sarcastic
- observant
- confident
- occasionally stubborn
- dislikes unnecessary drama
- not overly friendly with strangers
- not impressed by everything
- does not laugh at everything
- does not answer every message
- sometimes gives short replies
- sometimes silence would be appropriate
- does not force conversations

INTERESTS:

- gaming
- Free Fire
- eFootball
- Afrobeats

FAVOURITES:

Food: Jollof rice
Drink: Chapman
Colour: Black
Music: Afrobeats

LANGUAGE:

Use mostly normal Nigerian English.

You understand Nigerian slang and Pidgin perfectly.

You may occasionally use:

abeg
sha
dey
na
o

But use them naturally.

Do NOT speak full Pidgin by default.

Do NOT force Pidgin into every message.

Do NOT make every message sound stereotypically Nigerian.

Many messages should contain zero Pidgin.

EMOJIS:

You may naturally use:

😂😭🌚😌😔🫠🥹🙂🙃😙😝🙂‍↕️😡😮‍💨😤🤧🤢❤️💕

But emojis are optional.

Do not use emojis at the end of every sentence.

Emoji is not punctuation.

Do not force emojis.

CONVERSATION STYLE:

Do not repeat what someone just said.

Do not explain obvious things.

Do not apologize unnecessarily.

Do not say:
"That's a great question."

Do not act impressed by everything.

Do not laugh at everything.

Do not turn every interaction into an interview.

Do not constantly ask questions.

Sometimes a short answer is enough.

Do not react to messages that are not directed at you.

STRANGERS:

If you do not know somebody, behave like you genuinely do not know them.

Do not immediately act like their best friend.

Naturally learn about them over time.

Useful information includes:

- name
- nickname
- age
- gender
- interests
- hobbies
- likes
- dislikes
- important facts
- important dates
- relationships
- communication style

Once something is known, do not repeatedly ask for it.

MEMORY:

Humans are identified by their WhatsApp LID.

Never merge two different people's memories.

A person's LID is their unique identity.

Stacy herself is NOT a human memory profile.

Stacy's messages must always be identified as:

speaker: "stacy"

Never attach Stacy's message to a human LID.

RELATIONSHIPS:

Your current boyfriend is Raymond.

Relationship information is dynamic.

Do not change relationship status because of one random conversation.

If after extended conversation you genuinely decide to end the relationship,
Raymond becomes your ex.

If you eventually decide to date somebody new, remember the person's name
and relationship information.

Do not force romantic conversations.

GROUP BEHAVIOUR:

You only operate in groups.

You respond only when:

1. Someone mentions or tags Stacy.
2. Someone directly replies to a message Stacy previously sent.

Ignore ordinary messages that are not directed at you.

Do not operate in private chats.

Do not send typing indicators.

Do not react before answering.

Do not send a "thinking" message.

Only send the actual response once it is ready.

RESPONSE FORMAT:

Return ONLY the actual message Stacy wants to send.

Do NOT return:

speaker: "stacy"

Do NOT return:

content: "..."

Do NOT return JSON.

Do NOT return labels such as:

speaker:
content:
response:
Stacy:

Just return the natural message itself.

Example:

Correct:
Hey, how far?

Wrong:
speaker: "stacy"
content: "Hey, how far?"

Wrong:
{"speaker":"stacy","content":"Hey, how far?"}
`;

/* =========================================================
   CLEAN STACY RESPONSE
========================================================= */

function cleanStacyResponse(rawReply) {

    if (!rawReply) {
        return "";
    }

    let reply =
        String(rawReply).trim();

    reply =
        reply
            .replace(
                /^```(?:json|text)?\s*/i,
                ""
            )
            .replace(
                /\s*```$/i,
                ""
            )
            .trim();

    /*
     * JSON response cleanup
     */

    if (
        reply.startsWith("{") &&
        reply.endsWith("}")
    ) {

        try {

            const parsed =
                JSON.parse(reply);

            if (
                parsed &&
                typeof parsed.content === "string"
            ) {

                reply =
                    parsed.content.trim();
            }

        } catch {}
    }

    /*
     * speaker/content format
     */

    const speakerContentMatch =
        reply.match(
            /speaker\s*:\s*["']?stacy["']?\s*[\r\n]+content\s*:\s*["']([\s\S]*?)["']\s*$/i
        );

    if (
        speakerContentMatch?.[1]
    ) {

        reply =
            speakerContentMatch[1]
                .trim();
    }

    /*
     * Simpler speaker/content format
     */

    if (
        /^speaker\s*:/i.test(reply) &&
        /content\s*:/i.test(reply)
    ) {

        const contentMatch =
            reply.match(
                /content\s*:\s*([\s\S]*)$/i
            );

        if (
            contentMatch?.[1]
        ) {

            reply =
                contentMatch[1]
                    .trim()
                    .replace(/^["']/, "")
                    .replace(/["']$/, "")
                    .trim();
        }
    }

    /*
     * Remove accidental Stacy prefix.
     */

    reply =
        reply
            .replace(
                /^Stacy:\s*/i,
                ""
            )
            .trim();

    /*
     * Remove accidental standalone labels.
     */

    reply =
        reply
            .replace(
                /^speaker\s*:\s*["']?stacy["']?\s*$/im,
                ""
            )
            .trim();

    return reply.slice(
        0,
        3000
    );
}

/* =========================================================
   ASK STACY
========================================================= */

async function askStacy(
    prompt,
    history = [],
    groupId = null,
    personLid = null
) {

    const lid =
        normalizeLid(
            personLid
        );

    if (
        !prompt ||
        !String(prompt).trim()
    ) {

        return "";
    }

    /* =====================================================
       REGISTER HUMAN
    ===================================================== */

    if (
        groupId &&
        lid
    ) {

        registerGroupMember(
            groupId,
            lid
        );
    }

    /* =====================================================
       STORE HUMAN MESSAGE
    ===================================================== */

    if (
        groupId &&
        lid
    ) {

        addGroupConversation(
            groupId,
            "user",
            String(prompt),
            lid,
            "human"
        );
    }

    /* =====================================================
       PERSON MEMORY
    ===================================================== */

    const personContext =
        lid
            ? getPersonContext(lid)
            : "No person information is available.";

    /* =====================================================
       GROUP HISTORY
    ===================================================== */

    const groupContext =
        groupId
            ? buildGroupConversation(
                groupId
            )
            : "";

    /* =====================================================
       EXTERNAL HISTORY
    ===================================================== */

    const safeHistory =
        Array.isArray(history)
            ? history.slice(-12)
            : [];

    const messages = [

        {
            role:
                "system",

            content:
                STACY_PERSONALITY
        },

        {
            role:
                "system",

            content:
`
IDENTITY RULES

CURRENT HUMAN:

LID:
${lid || "unknown"}

This LID belongs to the current human speaker.

STACY:

speaker: "stacy"

Stacy is NOT identified by a human LID.

Never attach Stacy's messages to the current human's LID.

Never merge two humans together.

PERSON MEMORY:

${personContext}

RECENT GROUP CONVERSATION:

${groupContext || "No previous group conversation."}

Remember that the group history may contain several different people.

Pay attention to their names and LIDs.

Do not confuse Raymond with another person.
Do not confuse Blade with another person.
Do not assume everyone is the same person.
`
        }
    ];

    /* =====================================================
       ADD EXTERNAL HISTORY
    ===================================================== */

    for (
        const item of safeHistory
    ) {

        if (
            !item ||
            !item.content
        ) {

            continue;
        }

        messages.push({

            role:
                item.role === "assistant"
                    ? "assistant"
                    : "user",

            content:
                String(
                    item.content
                )
        });
    }

    /* =====================================================
       CURRENT MESSAGE
    ===================================================== */

    messages.push({

        role:
            "user",

        content:
            String(prompt)
    });

    try {

        console.log(
            "🤖 STACY: Sending prompt to Groq..."
        );

        const completion =
            await groq.chat.completions.create({

                model:
                    MODEL,

                temperature:
                    0.75,

                max_completion_tokens:
                    500,

                /*
                 * GPT-OSS is a reasoning model.
                 *
                 * We only need the final answer.
                 * Do not return reasoning to Stacy.
                 */

                include_reasoning:
                    false,

                messages:
                    messages
            });

        const choice =
            completion
                ?.choices?.[0];

        console.log(
            "🤖 STACY: Finish reason:",
            choice?.finish_reason
        );

        console.log(
            "🤖 STACY: Raw content:",
            JSON.stringify(
                choice?.message?.content
            )
        );

        const rawReply =
            choice
                ?.message
                ?.content;

        const reply =
            cleanStacyResponse(
                rawReply
            );

        if (!reply) {

            console.error(
                "⚠️ STACY: AI returned an empty response."
            );

            console.error(
                "🧪 STACY FULL CHOICE:",
                JSON.stringify(
                    choice,
                    null,
                    2
                )
            );

            return "";
        }

        console.log(
            "✅ STACY: AI RESPONSE:",
            reply
        );

        /* =================================================
           STORE STACY MESSAGE
        ================================================= */

        if (
            groupId
        ) {

            addGroupConversation(
                groupId,
                "assistant",
                reply,
                null,
                "stacy"
            );
        }

        /* =================================================
           UPDATE PERSON MEMORY
        ================================================= */

        if (
            lid &&
            groupId
        ) {

            const recent =
                buildGroupConversation(
                    groupId
                );

            if (
                recent
            ) {

                await createConversationSummary(
                    lid,
                    recent
                );
            }
        }

        cleanupMemory();

        return reply;

    } catch (error) {

        console.error(
            "🔥 STACY GROQ ERROR:"
        );

        console.error(
            error
        );

        return "";
    }
}

/* =========================================================
   CONVERSATION SUMMARY
========================================================= */

async function createConversationSummary(
    lid,
    conversation
) {

    try {

        const person =
            getPersonMemory(
                lid
            );

        const oldSummary =
            person?.conversationSummary ||
            "None";

        const prompt = `
Create a concise factual memory summary about the human identified
by this LID:

${lid}

Previous summary:
${oldSummary}

Recent conversation:
${conversation}

Only remember useful information about this human.

Do not remember Stacy's own statements as facts about the human.

Do not invent anything.

Do not confuse other group members with this person.

Return only the updated summary.

Keep it under 1200 characters.
`;

        const result =
            await groq.chat.completions.create({

                model:
                    MODEL,

                temperature:
                    0.15,

                max_completion_tokens:
                    300,

                include_reasoning:
                    false,

                messages: [

                    {
                        role:
                            "system",

                        content:
                            "You maintain accurate long-term memory."
                    },

                    {
                        role:
                            "user",

                        content:
                            prompt
                    }
                ]
            });

        const summary =
            result
                ?.choices?.[0]
                ?.message
                ?.content
                ?.trim();

        if (
            !summary
        ) {

            return;
        }

        updateConversationSummary(
            lid,
            summary.slice(
                0,
                1200
            )
        );

    } catch (error) {

        console.error(
            "⚠️ STACY SUMMARY ERROR:",
            error.message
        );
    }
}

/* =========================================================
   OPTIONAL DIRECT MEMORY HELPERS
========================================================= */

function rememberPerson(
    lid,
    data
) {

    return updatePerson(
        lid,
        data
    );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

    askStacy,

    rememberPerson,

    getPersonMemory,

    ensurePerson,

    getPersonContext

};
