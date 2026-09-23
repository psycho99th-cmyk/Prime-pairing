const axios = require("axios");

const API_BASE_URL =
    "https://prime-music-api.onrender.com";

module.exports = async ({
    sock,
    jid
}) => {

    try {

        /*
         * =========================
         * GET ALL SONGS
         * =========================
         */

        const response =
            await axios.get(
                `${API_BASE_URL}/api/songs`,
                {
                    timeout: 30000
                }
            );

        const result =
            response.data;


        /*
         * =========================
         * CHECK RESPONSE
         * =========================
         */

        if (
            !result.success ||
            !Array.isArray(result.songs) ||
            !result.songs.length
        ) {

            return `❌ *PRIME MUSIC LIBRARY IS EMPTY.*`;

        }


        /*
         * =========================
         * GROUP BY ARTIST
         * =========================
         */

        const artists = {};


        for (const song of result.songs) {

            const artist =
                String(
                    song.artist ||
                    "UNKNOWN ARTIST"
                ).trim();

            const title =
                String(
                    song.title ||
                    "Unknown Song"
                ).trim();


            if (!artists[artist]) {

                artists[artist] = [];

            }

            artists[artist].push(title);

        }


        /*
         * =========================
         * SORT ARTISTS
         * =========================
         */

        const sortedArtists =
            Object.keys(artists)
                .sort((a, b) =>
                    a.localeCompare(
                        b,
                        undefined,
                        {
                            sensitivity:
                                "base"
                        }
                    )
                );


        /*
         * =========================
         * BUILD MESSAGE
         * =========================
         */

        let message =
`🎵 ━━━ PRIME MUSIC ━━━ 🎵

`;


        for (
            const artist
            of sortedArtists
        ) {

            const songs =
                artists[artist];


            /*
             * Sort songs
             * alphabetically
             */

            songs.sort((a, b) =>
                a.localeCompare(
                    b,
                    undefined,
                    {
                        sensitivity:
                            "base"
                    }
                )
            );


            message +=
`🎧 ${artist.toUpperCase()}
`;


            songs.forEach(
                (title, index) => {

                    const prefix =
                        index ===
                        songs.length - 1
                            ? "└─"
                            : "├─";

                    message +=
`${prefix} ${title}
`;

                }
            );


            message +=
"\n";

        }


        message +=
`━━━━━━━━━━━━━━━━━━
POWERED BY PRIME BOT`;


        return message;


    } catch (error) {

        console.error(
            "Songs command error:",
            error.response?.data ||
            error.message
        );


        return `❌ *Couldn't load the PRIME MUSIC library right now.*

Please try again later.`;

    }

};
