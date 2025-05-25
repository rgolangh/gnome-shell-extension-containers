"use strict";

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import * as PodmanApi from "./podman-socket-api.js";

const TERM_KEEP_ON_EXIT = true;
const TERM_CLOSE_ON_EXIT = false;

Gio._promisify(Gio.Subprocess.prototype,
    "communicate_utf8_async", "communicate_utf8_finish");

export var podmanVersion;

export async function init() {
    if (podmanVersion === undefined) {
        await discoverPodmanVersion();
    }
}
/**
 * Get a list of containers
 * @param {Gio.settings} settings - The extension settings
 * @returns {Container[]} list of containers as reported by podman
 */
export async function getContainers(settings) {

    let jsonContainers;
    try {
        jsonContainers = await PodmanApi.request(`containers/json?all=true`);
    } catch (e) {
        console.error(e.message);
        throw new Error("Error occurred when fetching containers");
    }

    if (jsonContainers === null) {
        return [];
    }

    const containers = [];
    jsonContainers.forEach(e => {
        console.debug(e);
        let c = new Container(e, settings);
        containers.push(c);
    });
    return containers;
}

class Container {
    // settings: the extension's Gio.settings
    constructor(jsonContainer, settings) {
        console.debug(`###@@@@##@@ JSON container -  ${jsonContainer}`);
        this.terminal = settings.get_string("terminal");
        if (podmanVersion.newerOrEqualTo("5.0.0")) {
            Object.assign(this, jsonContainer);
        } else if (podmanVersion.newerOrEqualTo("2.0.3")) {
            this.name = jsonContainer.Names[0].replace(/^\//, '');
            this.id = jsonContainer.Id;
            this.state = jsonContainer.State;
            this.status = jsonContainer.Status;
            this.createdAt = new Date(jsonContainer.Created * 1000);
            this.lables = jsonContainer.Labels
            this.image = jsonContainer.Image;
            this.command = jsonContainer.Command;
            this.entrypoint = jsonContainer.Entrypoint;
            if (jsonContainer.Ports === "") {
                this.ports = "n/a";
            } else {
                this.ports = jsonContainer.Ports?.map(e => `host ${e.host_ip}:${e.host_port}/${e.protocol} -> pod ${e.container_port}`);
            }
        } else {
            this.name = jsonContainer.Names;
            this.id = jsonContainer.ID;
            this.state = jsonContainer.Status;
            this.status = jsonContainer.Status;
            this.createdAt = jsonContainer.Created;
        }

    }

    start() {
        runCommand("start", this.Id);
    }

    rm() {
        runCommand("rm", this.Id);
    }

    stop() {
        runCommand("stop", this.Id);
    }

    restart() {
        runCommand("restart", this.Id);
    }

    pause() {
        runCommand("pause", this.Id);
    }

    unpause() {
        runCommand("unpause", this.Id);
    }

    logs() {
        console.debug(`this state ${this.state} and is this === running ${this.State === "running"}`);
        runCommandInTerminal(this.terminal, "podman logs -f", this.Id, "", this.State === "running" ? TERM_CLOSE_ON_EXIT : TERM_KEEP_ON_EXIT);
    }

    watchTop() {
        runCommandInTerminal(this.terminal, "watch podman top", this.Id, "");
    }

    shell() {
        runCommandInTerminal(this.terminal, "podman exec -it", this.Id, "/bin/sh");
    }

    stats() {
        runCommandInTerminal(this.terminal, "podman stats", this.Id, "");
    }

    async inspect() {
        const out = await runCommand("inspect --format json", this.Id);
        let json = JSON.parse(out);
        if (json.length > 0 && json[0].NetworkSettings !== null) {
            const ipAddress = JSON.stringify(json[0].NetworkSettings.IPAddress);
            this.ipAddress = ipAddress ? "n/a" : ipAddress;
        }
    }

    toString() {
        return `name:    ${this.name}
                id:      ${this.id}
                state:   ${this.state}
                status:  ${this.status}
                image:   ${this.image}
                created: ${this.createdAt}`;

    }

    details() {
        const containerDetails = [
            `State: ${this.state}`,
            `Status: ${this.status}`,
            `Image: ${this.image}`,
            `Created: ${this.createdAt}`,
        ];
        if (this.Command !== null) {
            containerDetails.push(`Command: ${this.command}`);
        }

        if (this.entrypoint !== null) {
            containerDetails.push(`Entrypoint: ${this.entrypoint}`);
        }
        containerDetails.push(`Ports: ${this.ports}`);

        // add more stats and info - inspect - SLOW
        //this.inspect();
        //containerDetails.push(`IP Address: ${this.ipAddress}`);
        return containerDetails.join("\n");
    }
}

/**
 * discoverPodmanVersion fetches the podman version from cli
 */
async function discoverPodmanVersion() {
    try {
        let v = await PodmanApi.request('/version');
        podmanVersion = new Version(v.Version);
        console.debug("new version ", podmanVersion)
    } catch (e) {
        console.error(e.message);
        throw new Error("Error getting podman version");
    }
}

class Version {
    constructor(v) {
        const splits = v.split(".");
        this.major = splits[0];
        this.minor = splits[1];
        this.preRelease = '';
        if (splits.length > 2) {
            let patchWithPreRlease = splits.slice(2).join('.').split("-");
            this.patch = patchWithPreRlease[0];
            if (patchWithPreRlease[1]) {
                this.preRelease = patchWithPreRlease.slice(1).join('-');
            }
        }

    }

    newerOrEqualTo(v) {
        return this.compare(new Version(v)) >= 0;
    }

    compare(other) {
        console.log(`comparing ${this} with ${other}`);
        console.debug(`compare ${this} with ${other}`);
        if (this.major !== other.major) {
            return Math.sign(this.major - other.major);
        }
        if (this.minor !== other.minor) {
            return Math.sign(this.minor - other.minor);
        }
        if (this.patch !== other.patch) {
            if (this.patch === null) {
                return -1;
            }
            console.log(`comparing patch ${this.patch} to ${other.patch}`);
            return this.patch.localeCompare(other.patch);
        }
        if (this.preRelease !== other.preRelease) {
            if (this.preRelease == '') {
                return 1;
            }
            if (other.preRelease == '') {
                return -1;
            }

            console.log(`comparing prerelese ${this.preRelease} to ${other.preRelease}`);
            return this.preRelease?.localeCompare(other.preRelease);
        }
        return 0;
    }

    toString() {
        let v = `${this.major}.${this.minor}.${this.patch}`;
        if (this.preRelease) {
            v = `${v}.${this.preRelease}`;
        }
        return v
    }
}

/**
 * spawnCommandline runs a shell command and returns its output
 * @param {string} cmdline the command line to spawn
 * @returns {string}       the command output
 * @throws
 */
export async function spawnCommandline(cmdline) {
    const [, argv] = GLib.shell_parse_argv(cmdline);
    const cmd = Gio.Subprocess.new(argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);

    let [out, err] = await cmd.communicate_utf8_async(null, null);
    const status = cmd.get_exit_status();
    if (status !== 0) {
        throw new Error(`Command terminated with status ${status}: ${err}`);
    }
    return out;
}

/**
 * runCommand runs a podman container command using the cli
 * @param {string} command       the command verb
 * @param {string} containerName is the contaier name
 * @returns {string} command     output
 */
async function runCommand(command, containerName) {
    const cmdline = `podman ${command} ${containerName}`;
    console.info(`running command ${cmdline}`);

    let out;
    try {
        out = await spawnCommandline(cmdline);
        console.info(`command on ${containerName} terminated successfully`);
    } catch (e) {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg, e.message);
        console.error(`${errMsg}: ${e.message}`);
    }
    console.debug(out);
    return out;
}

/**
 * runCommandInTerminal runs a podman container command using the cli
 * and in gnome-terminal(unconfigurable atm) visible to users to present output.
 * Useful for logs, top, and stats container-commands.
 * @param {string} terminal        the terminal program plus extra args if needed to execute in
 * @param {string} command         the podman verb
 * @param {string} containerName   is the container name
 * @param {string[]} args          extra args to pass to the podman invocation
 * @param {boolean} keepOpenOnExit true means keep the terminal open when the command terminates
 *      and/or when the output stream is closed. False means that if the logs can't be followed the terminal
 *      just exits. For commands that are streaming like 'stats' this doesn't have an effect.
 */
function runCommandInTerminal(terminal, command, containerName, args, keepOpenOnExit) {
    let cmdline;
    if (keepOpenOnExit) {
        cmdline = `${terminal} bash -c '${command} ${containerName} ${args};read i'`;
    } else {
        cmdline = `${terminal} ${command} ${containerName} ${args}`;
    }
    console.debug(`running command ${cmdline}`);
    try {
        GLib.spawn_command_line_async(cmdline);
        console.debug(`command on ${containerName} terminated successfully`);
    } catch (e) {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg, e.message);
        console.error(`${errMsg}: ${e.message}`);
    }
}

/**
 * start listening to podman events in a separate process, each event is a line read.
 * @param {Function} onEvent - run onEvent function on every line read
 * @returns {Gio.Subprocess} process - The process handle
 */
export async function newEventsProcess(onEvent) {
    try {
        const cmdline = "podman events --filter type=container --format '{\"name\": \"{{ .Name }}\"}'";
        const [, argv] = GLib.shell_parse_argv(cmdline);
        const process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        const pipe = process.get_stdout_pipe();
        await _read(pipe, onEvent);
        return process;
    } catch (e) {
        console.error(e.message);
        throw new Error("Error occurred when fetching containers");
    }
}

/**
 * Read the input straem as a json a apply the onEvent function on it
 * @param {Gio.inputStream} inputStream - Input stream of an array of json messages, where each entry is a single event on a container. See "man podman-events".
 * @param {Function} onEvent - Function to apply on each container event
 */
async function _read(inputStream, onEvent) {
    await inputStream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, (source, result) => {
        const rawjson = new TextDecoder().decode(source.read_bytes_finish(result).toArray());
        console.debug(`raw json answer: ${rawjson}`);
        if (rawjson === "") {
            // no output is EOF, no need to continue processing
            return;
        }
        const rawjsonArray = rawjson.split(/\n/);
        rawjsonArray.forEach(j => {
            if (j !== "") {
                try {
                    const containerEvent = JSON.parse(j);
                    console.debug(`firing callback on container event ${containerEvent}`);
                    onEvent(containerEvent);
                } catch (e) {
                    console.error(`json parse error ${e}`);
                }
            }
        });
        if (!source.is_closed()) {
            // keep reading
            _read(source, onEvent);
        }
    });
}

export class Pod {
    // settings: the extension's Gio.settings
    constructor(jsonPod, settings) {
        console.debug(`JSON pod -  ${jsonPod}`);
        console.debug(`settings -  ${settings}`);
        Object.assign(this, jsonPod);
        this.terminal = settings.get_string("terminal");
    }

    start() {
        PodmanApi.request(`pods/${this.Id}/start`, "POST");
    }

    rm() {
        PodmanApi.request(`pods/${this.Id}`, "DELETE");
    }

    stop() {
        PodmanApi.request(`pods/${this.Id}/stop`, "POST");
    }

    restart() {
        PodmanApi.request(`pods/${this.Id}/restart`, "POST");
    }

    pause() {
        PodmanApi.request(`pods/${this.Id}/pause`, "POST");
    }

    unpause() {
        PodmanApi.request(`pods/${this.Id}/unpause`, "POST");
    }

    logs() {
        runCommandInTerminal(this.terminal, "podman pod logs -f", this.Id, "", this.State === "running" ? TERM_CLOSE_ON_EXIT : TERM_KEEP_ON_EXIT);
    }

    watchTop() {
        runCommandInTerminal(this.terminal, "watch podman pod top", this.Id, "");
    }

    stats() {
        runCommandInTerminal(this.terminal, "podman pod stats", this.Id, "");
    }

}


