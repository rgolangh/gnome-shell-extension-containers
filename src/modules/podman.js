"use strict";

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const TERM_KEEP_ON_EXIT = true;
const TERM_CLOSE_ON_EXIT = false;

Gio._promisify(Gio.Subprocess.prototype,
    "communicate_utf8_async", "communicate_utf8_finish");

let podmanVersion;

/**
 * Get a list of containers
 * @param {Gio.settings} settings - The extension settings
 * @returns {Container[]} list of containers as reported by podman
 */
export async function getContainers(settings) {
    if (podmanVersion === undefined) {
        await discoverPodmanVersion();
    }

    let jsonContainers;

    try {
        const out = await spawnCommandline("podman ps -a --format json");
        jsonContainers = JSON.parse(out);
    } catch (e) {
        console.error(e.message);
        throw new Error("Error occurred when fetching containers");
    }

    if (jsonContainers === null) {
        return [];
    }

    const containers = [];
    jsonContainers.forEach(e => {
        let c = new Container(settings, e);
        containers.push(c);
    });
    return containers;
}

class Container {
    // settings: the extension's Gio.settings
    constructor(settings, jsonContainer) {
        this.terminal = settings.get_string("terminal");
        if (podmanVersion.newerOrEqualTo("2.0.3")) {
            this.name = jsonContainer.Names[0];
            this.id = jsonContainer.Id;
            this.state = jsonContainer.State;
            this.status = jsonContainer.State;
            this.createdAt = jsonContainer.CreatedAt;
        } else {
            this.name = jsonContainer.Names;
            this.id = jsonContainer.ID;
            this.state = jsonContainer.Status;
            this.status = jsonContainer.Status;
            this.createdAt = jsonContainer.Created;
        }

        this.image = jsonContainer.Image;
        this.command = jsonContainer.Cmd;
        this.entrypoint = jsonContainer.Entrypoint;
        this.startedAt = new Date(jsonContainer.StartedAt * 1000);
        if (jsonContainer.Ports === "") {
            this.ports = "n/a";
        } else {
            this.ports = jsonContainer.Ports?.map(e => `host ${e.host_ip}:${e.host_port}/${e.protocol} -> pod ${e.container_port}`);
        }
    }

    start() {
        runCommand("start", this.name);
    }

    rm() {
        runCommand("rm", this.name);
    }

    stop() {
        runCommand("stop", this.name);
    }

    restart() {
        runCommand("restart", this.name);
    }

    pause() {
        runCommand("pause", this.name);
    }

    unpause() {
        runCommand("unpause", this.name);
    }

    logs() {
        console.debug(`this state ${this.state} and is this === running ${this.state === "running"}`);
        runCommandInTerminal(this.terminal, "podman logs -f", this.name, "", this.state === "running" ? TERM_CLOSE_ON_EXIT : TERM_KEEP_ON_EXIT);
    }

    watchTop() {
        runCommandInTerminal(this.terminal, "watch podman top", this.name, "");
    }

    shell() {
        runCommandInTerminal(this.terminal, "podman exec -it", this.name, "/bin/sh");
    }

    stats() {
        runCommandInTerminal(this.terminal, "podman stats", this.name, "");
    }

    async inspect() {
        const out = await runCommand("inspect --format json", this.name);
        let json = JSON.parse(out);
        if (json.length > 0 && json[0].NetworkSettings !== null) {
            const ipAddress = JSON.stringify(json[0].NetworkSettings.IPAddress);
            this.ipAddress = ipAddress  ? "n/a" : ipAddress;
        }
    }

    toString() {
        return `name:   ${this.name}
                id:     ${this.id}
                state:  ${this.state}
                status: ${this.status}
                image:  ${this.image}`;
    }

    details() {
        const containerDetails = [
            `Status: ${this.status}`,
            `Image: ${this.image}`,
            `Created: ${this.createdAt}`,
            `Started: ${this.startedAt !== null ? this.startedAt : "never"}`,
        ];
        if (this.Command !== null) {
            containerDetails.push(`Command: ${this.command}`);
        }

        if (this.entrypoint !== null) {
            containerDetails.push(`Entrypoint: ${this.entrypoint}`);
        }
        containerDetails.push(`Ports: ${this.ports}`);

        // add more stats and info - inspect - SLOW
        this.inspect();
        containerDetails.push(`IP Address: ${this.ipAddress}`);
        return containerDetails.join("\n");
    }
}

/**
 * discoverPodmanVersion fetches the podman version from cli
 */
async function discoverPodmanVersion() {
    let versionJson;

    try {
        const out = await spawnCommandline("podman version --format json");
        versionJson = JSON.parse(out);
    } catch (e) {
        console.error(e.message);
        throw new Error("Error getting podman version");
    }

    const versionString = versionJson?.Client?.Version;
    if (versionString) {
        podmanVersion = new Version(versionString);
    } else {
        console.warn("unable to set podman info, will fall back to syntax and output < 2.0.3");
    }
    console.debug(podmanVersion);
}

class Version {
    constructor(v) {
        const splits = v.split(".");
        this.major = splits[0];
        this.minor = splits[1];
        if (splits.length > 2) {
            this.patch = splits[2];
        }
    }

    newerOrEqualTo(v) {
        return this.compare(new Version(v)) >= 0;
    }

    compare(other) {
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
            return this.patch.localeCompare(other.patch);
        }
        return 0;
    }

    toString() {
        return `major: ${this.major} minor: ${this.minor} patch: ${this.patch}`;
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

