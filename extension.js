"use strict";

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GObject = imports.gi.GObject;

let containersMenu;
let debugEnabled = false;
let podmanVersion;

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

/**
 * enable is the entry point called by gnome-shell
 */
// eslint-disable-next-line no-unused-vars
function enable() {
    info("enabling containers extension");
    discoverPodmanVersion();
    containersMenu = new ContainersMenu();
    debug(containersMenu);
    containersMenu.renderMenu();
    Main.panel.addToStatusArea("containers-menu", containersMenu);
}

/** disable is called when the main extension menu is closed **/
// eslint-disable-next-line no-unused-vars
function disable() {
    info("disabling containers extension");
    containersMenu.destroy();
}

/** createIcon is just a convenience shortcut for standard icons
 *
 * @param {string} name is icon name
 * @param {string} styleClass is style_class
 * */
function createIcon(name, styleClass) {
    return new St.Icon({icon_name: name, style_class: styleClass, icon_size: "14"});
}

var ContainersMenu = GObject.registerClass(
    {
        GTypeName: "ContainersMenu",
    },
    class ContainersMenu extends PanelMenu.Button {
        _init() {
            super._init(0.0, "Containers");
            this.menu.box.add_style_class_name("containers-extension-menu");
            const hbox = new St.BoxLayout({style_class: "panel-status-menu-box"});
            const gicon = Gio.icon_new_for_string(`${Me.path}/podman-icon.png`);
            const icon = new St.Icon({gicon, icon_size: "24"});

            hbox.add_child(icon);
            this.add_child(hbox);
            this.connect("button_press_event", () => {
                if (this.menu.isOpen) {
                    this.menu.removeAll();
                    this.renderMenu();
                }
            });
        }

        renderMenu() {
            try {
                const containers = getContainers();
                info(`found ${containers.length} containers`);
                if (containers.length > 0) {
                    containers.forEach(container => {
                        debug(container.toString());
                        const subMenu = new ContainerSubMenuMenuItem(container, container.name);
                        this.menu.addMenuItem(subMenu);
                    });
                } else {
                    this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
                }
            } catch (err) {
                const errMsg = "Error occurred when fetching containers";
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
                info(`${errMsg}: ${err}`);
            }
            this.show();
        }
    });

/** runCommand runs a podman container command using the cli
 *
 * @param {string} command the command verb
 * @param {string} containerName is the contaier name
 */
function runCommand(command, containerName) {
    const cmdline = `podman ${command} ${containerName}`;
    info(`running command ${cmdline}`);
    // eslint-disable-next-line no-unused-vars
    const [_res, out, err, status] = GLib.spawn_command_line_sync(cmdline);
    if (status === 0) {
        info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg);
        info(errMsg);
        info(err);
    }
    debug(out);
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
    info(`running command ${cmdline}`);
    const ok = GLib.spawn_command_line_async(cmdline);
    if (ok) {
        info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = `Error occurred when running ${command} on container ${containerName}`;
        Main.notify(errMsg);
        info(errMsg);
    }
}

var PopupMenuItem = GObject.registerClass(
    {
        GTypeName: "PopupMenuItem",
    },
    class extends PopupMenu.PopupMenuItem {
        _init(label, value) {
            if (value === undefined) {
                super._init(label);
            } else {
                super._init(`${label}: ${value}`);
                this.connect("button_press_event", setClipboard.bind(this, value));
            }
            this.add_style_class_name("containers-extension-subMenuItem");
            this.add_style_class_name(label.toLowerCase());
        }
    });

var ContainerMenuItem = GObject.registerClass(
    {
        GTypeName: "ContainerMenuItem",
    },
    class extends PopupMenuItem {
        _init(containerName, command) {
            super._init(command);
            this.containerName = containerName;
            this.command = command;
            this.connect("activate", runCommand.bind(this, this.command, this.containerName));
        }
    });

var ContainerMenuItemWithTerminalAction = GObject.registerClass(
    {
        GTypeName: "ContainerMenuItemWithTerminalAction",
    },
    class extends PopupMenuItem {
        _init(label, containerName, command, args) {
            super._init(label);
            this.containerName = containerName;
            this.command = command;
            this.args = args;
            this.connect("activate", runCommandInTerminal.bind(this, this.command, this.containerName, this.args));
        }
    });

var ContainerSubMenuMenuItem = GObject.registerClass(
    {
        GTypeName: "ContainerSubMenuMenuItem",
    },
    class extends PopupMenu.PopupSubMenuMenuItem {
        _init(container) {
            super._init(container.name);
            this.menu.addMenuItem(new PopupMenuItem("Status", container.status));
            this.menu.addMenuItem(new PopupMenuItem("Id", container.id));
            this.menu.addMenuItem(new PopupMenuItem("Image", container.image));
            this.menu.addMenuItem(new PopupMenuItem("Command", container.command));
            this.menu.addMenuItem(new PopupMenuItem("Created", container.createdAt));
            this.menu.addMenuItem(new PopupMenuItem("Ports", container.ports));
            this.inspected = false;

            // add more stats and info - inspect - SLOW
            this.connect("button_press_event", () => {
                if (!this.inspected) {
                    inspect(container.name, this.menu);
                    this.inspected = true;
                }
            });

            switch (container.status.split(" ")[0]) {
            case "Exited":
            case "exited":
            case "Created":
            case "created":
            case "configured":
            case "stopped": {
                this.insert_child_at_index(createIcon("process-stop-symbolic", "status-stopped"), 1);
                const startMeunItem = new ContainerMenuItem(container.name, "start");
                startMeunItem.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-start"), 1);
                this.menu.addMenuItem(startMeunItem);
                const rmMenuItem = new ContainerMenuItem(container.name, "rm");
                rmMenuItem.insert_child_at_index(createIcon("user-trash-symbolic", "status-remove"), 1);
                this.menu.addMenuItem(rmMenuItem);
                break;
            }
            case "Up":
            case "running": {
                this.menu.addMenuItem(new PopupMenuItem("Started", container.startedAt));
                this.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
                const pauseMenuIten = new ContainerMenuItem(container.name, "pause");
                pauseMenuIten.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-stopped"), 1);
                this.menu.addMenuItem(pauseMenuIten);
                const stopMenuItem = new ContainerMenuItem(container.name, "stop");
                stopMenuItem.insert_child_at_index(createIcon("process-stop-symbolic", "status-stopped"), 1);
                this.menu.addMenuItem(stopMenuItem);
                const restartMenuItem = new ContainerMenuItem(container.name, "restart");
                restartMenuItem.insert_child_at_index(createIcon("system-reboot-symbolic", "status-restart"), 1);
                this.menu.addMenuItem(restartMenuItem);
                this.menu.addMenuItem(createTopMenuItem(container));
                this.menu.addMenuItem(createShellMenuItem(container));
                this.menu.addMenuItem(createStatsMenuItem(container));
                break;
            }
            case "Paused":
            case "paused": {
                this.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-paused"), 1);
                const unpauseMenuItem = new ContainerMenuItem(container.name, "unpause");
                unpauseMenuItem.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-start"), 1);
                this.menu.addMenuItem(unpauseMenuItem);
                break;
            }
            default:
                this.insert_child_at_index(createIcon("action-unavailable-symbolic", "status-undefined"), 1);
                break;
            }

            // add log button
            const logMenuItem = createLogMenuItem(container);
            this.menu.addMenuItem(logMenuItem);
        }
    });

/** set clipboard with @param text
 *
 * @param {string} text to set the clipboard with*/
function setClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, text);
}

/** a container inspect command which return much more data than
 * the regular list response and is slower
 *
 * @param {string} containerName is the target container name
 * @param {menuItem} menu to which to add details to
 */
function inspect(containerName, menu) {
    let out = runCommand("inspect --format json", containerName);
    let container = JSON.parse(imports.byteArray.toString(out));
    if (container.length > 0 && container[0].NetworkSettings !== null) {
        menu.addMenuItem(
            new PopupMenuItem("IP Address", JSON.stringify(container[0].NetworkSettings.IPAddress)));
    }
}

/** creates a log menu items
 *
 * @param {Container} container is the target container
 */
function createLogMenuItem(container) {
    let i = new ContainerMenuItemWithTerminalAction("logs", "", `podman logs -f ${container.name}`, "");
    i.insert_child_at_index(createIcon("document-open-symbolic.symbolic", "action-logs"), 1);
    return i;
}

/** creates a top menu item
 *
 * @param {Container} container is the target container
 */
function createTopMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("top", container.name, "watch podman top", "");
    i.insert_child_at_index(createIcon("view-reveal-symbolic.symbolic", "action-top"), 1);
    return i;
}

/** creates a shell menu item
 *
 * @param {Container} container is the target container
 */
function createShellMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("sh", container.name, "podman exec -it", "/bin/sh");
    i.insert_child_at_index(new St.Label({style_class: "action-sh", text: ">_"}), 1);
    return i;
}

/** creates a stats menu item/
 *
 * @param {Container} container is the target container
 */
function createStatsMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("stats", container.name, "podman stats", "");
    i.insert_child_at_index(new St.Label({style_class: "action-stats", text: "%"}), 1);
    return i;
}

/** discovers a podman version and stores in a global */
function discoverPodmanVersion() {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman version --format json");
    if (!res) {
        info(`status: ${status}, error: ${err}`);
        throw new Error("Error getting podman version");
    }
    debug(out);
    const versionJson = JSON.parse(imports.byteArray.toString(out));
    if (versionJson.Client !== null && versionJson.Client.Version !== null) {
        podmanVersion = new Version(versionJson.Client.Version);
    }
    if (versionJson === null) {
        info("unable to set podman info, will fall back to syntax and output < 2.0.3");
    }
    debug(podmanVersion);
}

/** return list of containers : Container[] */
function getContainers() {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman ps -a --format json");

    if (!res) {
        info(`status: ${status}, error: ${err}`);
        throw new Error("Error occurred when fetching containers");
    }
    debug(out);
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

    toString() {
        return `name:   ${this.name}
                id:     ${this.id}
                state:  ${this.state}
                status: ${this.status}
                image:  ${this.image}`;
    }
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
        debug(`compare ${this} with ${other}`);
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

