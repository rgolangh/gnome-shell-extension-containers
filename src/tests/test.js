#!/usr/bin/gjs

//import Soup from 'gi://Soup?version=3.0';
//import GLib from 'gi://GLib';
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
//const Soup_2_4 = imports.gi.versions.Soup = '2.4';
const Soup_3_0 = imports.gi.versions.Soup = '3.0';
const Soup = imports.gi.Soup; // Now refers to Soup-2.4

const uid = new Gio.Credentials().get_unix_user();

const PODMAN_SOCKET_PATH = `/var/run/user/${uid}/podman/podman.sock`;

async function podmanRequest(apiPath, method = 'GET', requestBody = null) {
    const unixSocketAddress = Gio.UnixSocketAddress.new(PODMAN_SOCKET_PATH);
    let session = new Soup.Session({
        'remote-connectable': unixSocketAddress,
        'user-agent': 'GJS Soup Standalone Script Example/1.0'
    });
    const requestUrl = GLib.Uri.parse(`http://localhost/${apiPath}`, null);

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
        return JSON.parse(d);
    } catch (e) {
        logError(`Error parsing JSON response for ${apiPath}: ${e}`);
        return ""; // Return raw data if parsing fails
    }
}

function logError(message) {
    console.error(`[ERROR] ${message}`);
}

async function testme() {
    let containers = await podmanRequest('/containers/json');
    let images = await podmanRequest('/images/json');
    let volumes = await podmanRequest('/volumes');
    let networks = await podmanRequest('/networks');
    let version = await podmanRequest('/version');

    if (containers) {
        console.log(`number of container: ${containers.length}`);
        containers.forEach(c => console.log(`  - container: ${c.Names}`));
    }
    if (images) {
        console.log(`number of images: ${images.length}`);
        images.forEach(i => {
            console.log(`  - image: ${i.Names} ${i.RepoTags}`);
        });
    }
    if (volumes) {
        console.log(`number of volumes: ${volumes.length}`);
        console.log(`status of volumes: ${volumes}`);
    }
    if (networks) {
        console.log(`number of networks: ${networks.length}`);
        networks.forEach(n => {
            console.log(`  - network: ${n.name} ${n.driver}`);
        });
    }

    console.log(`version ${version.Version}`);
}

function main() {
    console.log(`podman socket pash ${PODMAN_SOCKET_PATH}`);
    const loop = new GLib.MainLoop(null, false);
    testme().then((result) => {
        console.log(result);
        loop.quit();
    }).catch((e) => {
        console.log(`ok out ${e}`);
        loop.quit();
    });
    loop.run();
}

main();
