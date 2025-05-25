"use strict";

import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from "gi://Gio";
import { podmanVersion, spawnCommandline } from './podman.js';

const uid = new Gio.Credentials().get_unix_user();

const PODMAN_SOCKET_PATH = `/var/run/user/${uid}/podman/podman.sock`;

export async function request(apiPath, method = 'GET', requestBody = null) {
    const file = Gio.File.new_for_path(PODMAN_SOCKET_PATH);
    if (!file.query_exists(null)) {
        console.log(`podman socket ${PODMAN_SOCKET_PATH} does not exists`)
        throw exception("podman socket does not exists");
    }
    const unixSocketAddress = Gio.UnixSocketAddress.new(PODMAN_SOCKET_PATH);
    let session = new Soup.Session({
        'remote-connectable': unixSocketAddress,
        'user-agent': 'GJS Soup for gnome-shell-extension-containers'
    });
    var requestUrl = null
    if (apiPath[0] == "/") {
        requestUrl = GLib.Uri.parse(`http://localhost${apiPath}`, null);
    } else {
        requestUrl = GLib.Uri.parse(`http://localhost/v${podmanVersion.toString()}/libpod/${apiPath}`, null);
    }

    console.log(`url is ${requestUrl.to_string()}`);

    let message = new Soup.Message({ method: method, uri: requestUrl });
    if (!message) {
        throw new Error("Failed to create Soup.Message object.");
    }
    if (requestBody) {
        message.set_request_body_from_bytes(
            'application/json',
            new GLib.Bytes(new TextEncoder().encode(JSON.stringify(requestBody)))
        );
    }

    let result = session.send_and_read(message, null);
    console.log(`response ${result}`);
    try {
        const decoder = new TextDecoder('utf-8');
        let d = decoder.decode(result.get_data())
        console.log(`response ${d}`);
        return d == '' ? '' : JSON.parse(d);
    } catch (e) {
        console.error(`Error parsing JSON response for ${apiPath}: ${e}`);
        return ""; // Return raw data if parsing fails
    }
}

export function isPodmanSocketActive() {
    let [res, stdout, stderr, exitCode] =
        GLib.spawn_command_line_sync('systemctl --user is-active podman.socket');
    if (res) {
        console.log(`is active ${stdout.toString().trim()}`);
        return stdout.toString().trim() == "active";
    }

    if (stderr) {
        throw new Error(`'systemctl --user is-active podman.socket' failed unexpectedly. Exit Code: ${exitCode}. Stderr: ${stderr}`);
    }
}

