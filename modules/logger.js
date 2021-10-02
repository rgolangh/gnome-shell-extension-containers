"use strict";


let debugEnabled = true;


/**
 * debug is convenience method for debug log messages
 *
 * @param {string} msg is the logged message
 */
function debug(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [DEBUG] ${msg}`);
    }
}

/**
 * info is convenience method for info log messages
 *
 * @param {string} msg the logged message
 */
function info(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [INFO] ${msg}`);
    }
}
