const fs = require("fs");
const path = require("path");

const CACHE_FILE =
    path.join(__dirname, "deleted-cache.json");

const MEDIA_DIR =
    path.join(__dirname, "..", "deleted-media");

/*
 * Deleted media is kept for 1 minute only.
 */
const MAX_AGE =
    60 * 1000;


function ensureStorage() {

    if (!fs.existsSync(MEDIA_DIR)) {
        fs.mkdirSync(MEDIA_DIR, {
            recursive: true
        });
    }

    if (!fs.existsSync(CACHE_FILE)) {
        fs.writeFileSync(
            CACHE_FILE,
            "{}"
        );
    }
}


function loadCache() {

    try {

        ensureStorage();

        return JSON.parse(
            fs.readFileSync(
                CACHE_FILE,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "❌ Could not load deleted cache:",
            error
        );

        return {};
    }
}


function saveCache(cache) {

    try {

        ensureStorage();

        fs.writeFileSync(
            CACHE_FILE,
            JSON.stringify(
                cache,
                null,
                2
            )
        );

    } catch (error) {

        console.error(
            "❌ Could not save deleted cache:",
            error
        );
    }
}


function getMessageId(key) {

    return key?.id || null;
}


function isViewOnceMessage(message) {

    if (!message) {
        return false;
    }

    return Boolean(
        message.viewOnceMessage ||
        message.viewOnceMessageV2 ||
        message.viewOnceMessageV2Extension
    );
}


function getMediaType(message) {

    if (!message) {
        return null;
    }

    if (message.imageMessage) {
        return "image";
    }

    if (message.videoMessage) {
        return "video";
    }

    if (message.audioMessage) {
        return "audio";
    }

    if (message.documentMessage) {
        return "document";
    }

    if (message.stickerMessage) {
        return "sticker";
    }

    return null;
}


function deleteMediaFile(mediaPath) {

    if (
        mediaPath &&
        fs.existsSync(mediaPath)
    ) {

        try {

            fs.unlinkSync(
                mediaPath
            );

        } catch (error) {

            console.error(
                "⚠️ Could not delete cached media:",
                error.message
            );

        }
    }
}


function cacheMessage(data) {

    const {
        key,
        message,
        mediaPath = null,
        mediaType = null
    } = data || {};


    const id =
        getMessageId(key);


    if (!id || !message) {
        return;
    }


    /*
     * Never cache View Once messages.
     */

    if (
        isViewOnceMessage(message)
    ) {
        return;
    }


    const cache =
        loadCache();


    cache[id] = {
        timestamp: Date.now(),
        key,
        message,
        mediaPath,
        mediaType
    };


    cleanCache(cache);

    saveCache(cache);


    /*
     * Automatically remove this
     * message/media after 1 minute.
     */

    setTimeout(() => {

        const currentCache =
            loadCache();

        const item =
            currentCache[id];


        if (!item) {
            return;
        }


        deleteMediaFile(
            item.mediaPath
        );


        delete currentCache[id];


        saveCache(
            currentCache
        );


    }, MAX_AGE);
}


function getCachedMessage(key) {

    const id =
        getMessageId(key);


    if (!id) {
        return null;
    }


    const cache =
        loadCache();


    const saved =
        cache[id];


    if (!saved) {
        return null;
    }


    if (
        !saved.timestamp ||
        Date.now() -
        saved.timestamp >
        MAX_AGE
    ) {

        deleteMediaFile(
            saved.mediaPath
        );


        delete cache[id];

        saveCache(
            cache
        );


        return null;
    }


    return saved;
}


function cleanCache(cache) {

    const now =
        Date.now();


    for (
        const id of Object.keys(cache)
    ) {

        const item =
            cache[id];


        if (
            !item?.timestamp ||
            now -
            item.timestamp >
            MAX_AGE
        ) {

            deleteMediaFile(
                item?.mediaPath
            );


            delete cache[id];
        }
    }
}


function cleanupCache() {

    const cache =
        loadCache();


    cleanCache(
        cache
    );


    saveCache(
        cache
    );
}


function getMediaDirectory() {

    ensureStorage();

    return MEDIA_DIR;
}


module.exports = {
    cacheMessage,
    getCachedMessage,
    cleanupCache,
    getMediaDirectory,
    getMediaType,
    isViewOnceMessage
};
