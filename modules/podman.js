"use strict";

const GLib = imports.gi.GLib;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Logger = Me.imports.modules.logger;

let podmanVersion;

/** @returns list of containers : Container[] */
// eslint-disable-next-line no-unused-vars
function getContainers() {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman ps -a --format json");

    if (!res) {
        Logger.info(`status: ${status}, error: ${err}`);
        throw new Error("Error occurred when fetching containers");
    }
    Logger.debug(out);
    const jsonContainers = JSON.parse(imports.byteArray.toString(out));
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
        runCommandInTerminal("podman logs -f", this.name, "");
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

    inspect() {
        let out = runCommand("inspect --format json", this.name);
        let json = JSON.parse(imports.byteArray.toString(out));
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
}

/** discoverPodmanVersion fetches the podman version from cli */
// eslint-disable-next-line no-unused-vars
function discoverPodmanVersion() {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman version --format json");
    if (!res) {
        Logger.info(`status: ${status}, error: ${err}`);
        throw new Error("Error getting podman version");
    }
    Logger.debug(out);
    const versionJson = JSON.parse(imports.byteArray.toString(out));
    if (versionJson.Client !== null && versionJson.Client.Version !== null) {
        podmanVersion = new Version(versionJson.Client.Version);
    }
    if (versionJson === null) {
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

/** runCommand runs a podman container command using the cli
 *
 * @param {string} command the command verb
 * @param {string} containerName is the contaier name
 */
function runCommand(command, containerName) {
    const cmdline = `podman ${command} ${containerName}`;
    Logger.info(`running command ${cmdline}`);
    // eslint-disable-next-line no-unused-vars
    const [_res, out, err, status] = GLib.spawn_command_line_sync(cmdline);
    if (status === 0) {
        Logger.info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg);
        Logger.info(errMsg);
        Logger.info(err);
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
 */
function runCommandInTerminal(command, containerName, args) {
    const cmdline = `gnome-terminal -- ${command} ${containerName} ${args}`;
    Logger.info(`running command ${cmdline}`);
    const ok = GLib.spawn_command_line_async(cmdline);
    if (ok) {
        Logger.info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg);
        Logger.info(errMsg);
    }
}

