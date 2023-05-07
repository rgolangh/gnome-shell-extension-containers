// exported debug info
"use strict";


let debugEnabled = false;


/**
 * debug is convenience method for debug log messages
 * @param {string} msg is the logged message
 */
// eslint-disable-next-line no-unused-vars
function debug(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [DEBUG] ${msg}`);
    }
}

/**
 * info is convenience method for info log messages
 * @param {string} msg the logged message
 */
// eslint-disable-next-line no-unused-vars
function info(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [INFO] ${msg}`);
    }
}
