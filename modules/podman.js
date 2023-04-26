"use strict";

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Logger = Me.imports.modules.logger;

const TERM_KEEP_ON_EXIT = true;
const TERM_CLOSE_ON_EXIT = false;

Gio._promisify(Gio.Subprocess.prototype,
    "communicate_utf8_async", "communicate_utf8_finish");

let podmanVersion;

/** @returns {Container[]} */
// eslint-disable-next-line no-unused-vars
async function getContainers() {
    if (podmanVersion === undefined) {
        await discoverPodmanVersion();
    }

    let jsonContainers;

    try {
        const out = await spawnCommandline("podman ps -a --format json");
        jsonContainers = JSON.parse(out);
    } catch (e) {
        Logger.info(e.message);
        throw new Error("Error occurred when fetching containers");
    }

    if (jsonContainers === null) {
        return [];
    }

    const containers = [];
    jsonContainers.forEach(e => {
        let c = new Container(e);
        containers.push(c);
    });
    return containers;
}

class Container {
    constructor(jsonContainer) {
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
        this.command = jsonContainer.Command;
        this.startedAt = new Date(jsonContainer.StartedAt * 1000);
        if (jsonContainer.Ports === null) {
            this.ports = "n/a";
        } else {
            this.ports = jsonContainer.Ports.map(e => `host ${e.hostPort}/${e.protocol} -> pod ${e.containerPort}`);
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
        Logger.debug(`this state ${this.state} and is this === running ${this.state === "running"}`);
        runCommandInTerminal("podman logs -f", this.name, "", this.state === "running" ? TERM_CLOSE_ON_EXIT : TERM_KEEP_ON_EXIT);
    }

    watchTop() {
        runCommandInTerminal("watch podman top", this.name, "");
    }

    shell() {
        runCommandInTerminal("podman exec -it", this.name, "/bin/sh");
    }

    stats() {
        runCommandInTerminal("podman stats", this.name, "");
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
            `Command: ${this.command}`,
            `Created: ${this.createdAt}`,
            `Started: ${this.startedAt !== null ? this.startedAt : "never"}`,
            `Ports: ${this.ports}`,
        ];

        // add more stats and info - inspect - SLOW
        this.inspect();
        containerDetails.push(`IP Address: ${this.ipAddress}`);
        return containerDetails.join("\n");
    }
}

/** discoverPodmanVersion fetches the podman version from cli */
// eslint-disable-next-line no-unused-vars
async function discoverPodmanVersion() {
    let versionJson;

    try {
        const out = await spawnCommandline("podman version --format json");
        versionJson = JSON.parse(out);
    } catch (e) {
        Logger.info(e.message);
        throw new Error("Error getting podman version");
    }

    const versionString = versionJson?.Client?.Version;
    if (versionString) {
        podmanVersion = new Version(versionString);
    } else {
        Logger.info("unable to set podman info, will fall back to syntax and output < 2.0.3");
    }
    Logger.debug(podmanVersion);
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
        Logger.debug(`compare ${this} with ${other}`);
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
 * @param {string} cmdline - the command line to spawn
 * @returns {string} - the command output
 * @throws
 */
async function spawnCommandline(cmdline) {
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

/** runCommand runs a podman container command using the cli
 *
 * @param {string} command the command verb
 * @param {string} containerName is the contaier name
 */
async function runCommand(command, containerName) {
    const cmdline = `podman ${command} ${containerName}`;
    Logger.info(`running command ${cmdline}`);

    let out;
    try {
        out = await spawnCommandline(cmdline);
        Logger.info(`command on ${containerName} terminated successfully`);
    } catch (e) {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg, e.message);
        Logger.info(`${errMsg}: ${e.message}`);
    }
    Logger.debug(out);
    return out;
}

/** runCommandInTerminal runs a podman container command using the cli
 *  and in gnome-terminal(unconfigurable atm) visible to users to present output.
 *  Useful for logs, top, and stats container-commands.
 *
 * @param {string} command {string} the command verb
 * @param {string} containerName {string} is the contaier name
 * @param {...string} args to pass to the invocation
 * @param {boolean} keepOpenOnExit true means keep the terminal open when the command terminates
 * and/or when the output stream is closed. False means that if the logs can't be followed the terminal
 * just exits. For commands that are streaming like 'stats' this doesn't have and effect.
 */
function runCommandInTerminal(command, containerName, args, keepOpenOnExit) {
    let cmdline;
    if (keepOpenOnExit) {
        cmdline = `gnome-terminal -- bash -c '${command} ${containerName} ${args};read i'`;
    } else {
        cmdline = `gnome-terminal -- ${command} ${containerName} ${args}`;
    }
    Logger.info(`running command ${cmdline}`);
    try {
        GLib.spawn_command_line_async(cmdline);
        Logger.info(`command on ${containerName} terminated successfully`);
    } catch (e) {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg);
        Logger.info(errMsg);
    }
}

