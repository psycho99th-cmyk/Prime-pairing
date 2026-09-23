const axios = require("axios");

const API_BASE_URL =
    "https://prime-music-api.onrender.com";


/*
 * =========================
 * NORMALIZE TEXT
 * =========================
 */

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[_\-–—]+/g, " ")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


/*
 * =========================
 * GET WORDS
 * =========================
 */

function getWords(text) {
    return normalizeText(text)
        .split(" ")
        .filter(Boolean);
}


/*
 * =========================
 * CLEAN QUERY
 * =========================
 */

function cleanQuery(query) {
    return normalizeText(query)
        .replace(/\bby\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


/*
 * =========================
 * CHECK WORD MATCH
 * =========================
 */

function containsAllWords(text, words) {
    const normalized =
        normalizeText(text);

    return words.every(word =>
        normalized.includes(word)
    );
}


/*
 * =========================
 * SEARCH API
 * =========================
 */

async function searchAPI(query) {
    try {
        const response =
            await axios.get(
                `${API_BASE_URL}/api/search`,
                {
                    params: {
                        q: query
                    },

                    timeout: 30000
                }
            );

        const result =
            response.data;

        if (
            !result.success ||
            !Array.isArray(result.songs)
        ) {
            return [];
        }

        return result.songs;

    } catch (error) {

        console.error(
            "Music search error:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


/*
 * =========================
 * COLLECT SONGS
 * =========================
 *
 * Searches the complete query
 * and individual words.
 *
 * This helps when the API
 * doesn't return results for
 * "diamonds Rihanna".
 */

async function collectSongs(query) {

    const cleaned =
        cleanQuery(query);

    const words =
        getWords(cleaned);

    const searches = [
        cleaned
    ];


    /*
     * Add individual words.
     *
     * Example:
     *
     * diamonds Rihanna
     *
     * Searches:
     *
     * diamonds Rihanna
     * diamonds
     * Rihanna
     */

    for (const word of words) {
        if (!searches.includes(word)) {
            searches.push(word);
        }
    }


    /*
     * Remove duplicates
     */

    const uniqueSearches =
        [...new Set(
            searches.filter(Boolean)
        )];


    const allSongs = [];


    for (const search of uniqueSearches) {

        const songs =
            await searchAPI(search);

        allSongs.push(...songs);
    }


    /*
     * Remove duplicate records
     */

    const uniqueSongs =
        new Map();


    for (const song of allSongs) {

        const key =
            song.id ||
            song.file_url;

        if (
            key &&
            !uniqueSongs.has(key)
        ) {
            uniqueSongs.set(
                key,
                song
            );
        }
    }


    return [
        ...uniqueSongs.values()
    ];
}


/*
 * =========================
 * DATE SCORE
 * =========================
 */

function getUpdatedTime(song) {

    const time =
        new Date(
            song.updated_at || 0
        ).getTime();

    return Number.isNaN(time)
        ? 0
        : time;
}


/*
 * =========================
 * FIND EXACT TITLE
 * =========================
 *
 * Example:
 *
 * .play diamonds
 *
 * If multiple songs have the
 * exact title, choose the
 * most recently updated one.
 */

function findExactTitle(
    songs,
    query
) {

    const normalizedQuery =
        cleanQuery(query);

    const matches =
        songs.filter(song => {

            return (
                normalizeText(song.title) ===
                normalizedQuery
            );

        });


    if (!matches.length) {
        return null;
    }


    matches.sort((a, b) => {

        return (
            getUpdatedTime(b) -
            getUpdatedTime(a)
        );

    });


    return matches[0];
}


/*
 * =========================
 * SCORE SONG
 * =========================
 *
 * Gives higher scores to
 * matching title + artist.
 */

function scoreSong(
    song,
    query
) {

    const cleanedQuery =
        cleanQuery(query);

    const queryWords =
        getWords(cleanedQuery);

    const title =
        normalizeText(song.title);

    const artist =
        normalizeText(song.artist);


    if (!title) {
        return -1;
    }


    let score = 0;


    /*
     * Check whether the query
     * is an exact title.
     */

    if (
        title === cleanedQuery
    ) {
        score += 1000;
    }


    /*
     * Exact artist match.
     */

    if (
        artist === cleanedQuery
    ) {
        score += 500;
    }


    /*
     * Match words against title
     */

    const titleMatches =
        queryWords.filter(word =>
            title.includes(word)
        );


    /*
     * Match words against artist
     */

    const artistMatches =
        queryWords.filter(word =>
            artist.includes(word)
        );


    /*
     * Title matches
     */

    score +=
        titleMatches.length * 100;


    /*
     * Artist matches receive
     * higher priority.
     */

    score +=
        artistMatches.length * 300;


    /*
     * Partial title match
     */

    if (
        title.includes(cleanedQuery)
    ) {
        score += 300;
    }


    /*
     * Partial artist match
     */

    if (
        artist.includes(cleanedQuery)
    ) {
        score += 400;
    }


    /*
     * Prefer songs with a
     * matching title word.
     */

    if (
        titleMatches.length === 0
    ) {
        score -= 200;
    }


    return score;
}


/*
 * =========================
 * FIND BEST SONG
 * =========================
 */

function findBestSong(
    songs,
    query
) {


    /*
     * =========================
     * 1. EXACT TITLE FIRST
     * =========================
     *
     * .play diamonds
     *
     * Returns the latest updated
     * song with the exact title.
     */

    const exactTitle =
        findExactTitle(
            songs,
            query
        );


    if (exactTitle) {
        return exactTitle;
    }


    /*
     * =========================
     * 2. RANK TITLE + ARTIST
     * =========================
     */

    const ranked =
        songs
            .map(song => {

                return {
                    song,
                    score:
                        scoreSong(
                            song,
                            query
                        )
                };

            })
            .filter(item =>
                item.score >= 0
            )
            .sort((a, b) => {

                /*
                 * Highest score first.
                 */

                if (
                    b.score !== a.score
                ) {
                    return (
                        b.score -
                        a.score
                    );
                }


                /*
                 * Same score:
                 * newest song first.
                 */

                return (
                    getUpdatedTime(
                        b.song
                    ) -
                    getUpdatedTime(
                        a.song
                    )
                );

            });


    return ranked[0]?.song || null;
}


/*
 * =========================
 * MAIN COMMAND
 * =========================
 */

module.exports = async ({
    sock,
    jid,
    args
}) => {


    const query =
        args
            .join(" ")
            .trim();


    /*
     * =========================
     * NO QUERY
     * =========================
     */

    if (!query) {

        return (
            "❌ *Please enter a song name.*\n\n" +

            "Example:\n" +
            "*.play Faded*\n\n" +

            "With artist:\n" +
            "*.play Diamonds Rihanna*\n" +
            "*.play Diamonds by Rihanna*"
        );

    }


    try {


        /*
         * =========================
         * SEARCH MUSIC LIBRARY
         * =========================
         */

        const songs =
            await collectSongs(
                query
            );


        if (
            !songs.length
        ) {

            return (
                "❌ *Song not found.*\n\n" +

                `🔎 Search: *${query}*`
            );

        }


        /*
         * =========================
         * SELECT BEST SONG
         * =========================
         */

        const song =
            findBestSong(
                songs,
                query
            );


        if (!song) {

            return (
                "❌ *No matching song found.*\n\n" +

                `🔎 Search: *${query}*\n\n` +

                "Try the song name with the artist."
            );

        }


        /*
         * =========================
         * CHECK AUDIO
         * =========================
         */

        if (
            !song.file_url
        ) {

            return (
                "❌ *This song doesn't have a playable audio file.*"
            );

        }


        /*
         * =========================
         * SONG INFORMATION
         * =========================
         */

        const songName =
            song.title ||
            "Unknown";


        const artist =
            song.artist ||
            "Unknown";


        const credits =
            song.credits ||
            "Not specified";


        const caption =
`🎵 *${songName.toUpperCase()}*

👤 Artist: ${artist}
✍️ Credits: ${credits}

━━━━━━━━━━━━━━━━
*POWERED BY PRIME BOT*`;


        /*
         * =========================
         * SEND COVER
         * =========================
         */

        if (
            song.cover_url
        ) {

            try {

                await sock.sendMessage(
                    jid,
                    {
                        image: {
                            url:
                                song.cover_url
                        },

                        caption
                    }
                );

            } catch (coverError) {

                console.error(
                    "Cover image error:",
                    coverError.message
                );

            }

        } else {

            await sock.sendMessage(
                jid,
                {
                    text:
                        caption
                }
            );

        }


        /*
         * =========================
         * SEND MP3
         * =========================
         */

        await sock.sendMessage(
            jid,
            {
                audio: {
                    url:
                        song.file_url
                },

                mimetype:
                    "audio/mpeg",

                fileName:
                    `${songName}.mp3`,

                ptt:
                    false
            }
        );


        return null;


    } catch (error) {


        console.error(
            "Play command error:",

            error.response?.data ||
            error.message
        );


        return (
            "❌ *Couldn't get the song right now.*\n\n" +

            "Please try again later."
        );

    }

};
