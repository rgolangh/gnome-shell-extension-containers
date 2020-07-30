'use strict';

const Main = imports.ui.main;
const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GObject = imports.gi.GObject;

let containersMenu;
let debugEnabled = false;

function debug(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [DEBUG] ${msg}`);
    }
}

function info(msg) {
    if (debugEnabled) {
        log(`gnome-shell-extensions-containers - [INFO] ${msg}`);
    }
}

function enable() {
    info("enabling containers extension");
    containersMenu = new ContainersMenu();
    debug(containersMenu);
    containersMenu.renderMenu();
    Main.panel.addToStatusArea('containers-menu', containersMenu);
}

function disable() {
    info("disabling containers extension");
    containersMenu.destroy();
}

function createIcon(name, styleClass) {
    return new St.Icon({ icon_name: name, style_class: styleClass, icon_size: '14' });
}

var ContainersMenu = GObject.registerClass(
    {
        GTypeName: 'ContainersMenu'
    },
    class ContainersMenu extends PanelMenu.Button {
        _init() {
            super._init(0.0, "Containers");
            this.menu.box.add_style_class_name('containers-extension-menu');
            const hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
            const gicon = Gio.icon_new_for_string(Me.path + "/podman-icon.png");
            const icon = new St.Icon({ gicon: gicon, icon_size: '24' });

            hbox.add_child(icon);
            hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
            this.add_child(hbox);
            this.connect('button_press_event', Lang.bind(this, () => {
                if (this.menu.isOpen) {
                    this.menu.removeAll();
                    this.renderMenu();
                }
        }));
    }

    renderMenu() {
        try {
            const containers = getContainers();
            info(`found ${containers.length} containers`);
            if (containers.length > 0) {
                containers.forEach((container) => {
                    debug(`Menu item for container ${container.Id} with name ${container.Names[0]}`);
                    const subMenu = new ContainerSubMenuMenuItem(container, container.Names[0]);
                    this.menu.addMenuItem(subMenu);
                });
            } else {
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
            }
        } catch (err) {
            const errMsg = _("Error occurred when rendering containers");
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            info(`${errMsg}: ${err}`);
        }
        this.show();
    }
});

/* getContainers return a json array containers in the form of 
[
    {
        "Id": "7a9e1233db51",
        "Image": "localhost/image-name:latest",
        "Command": "/entrypoint.sh bash",
        "Created": "1596032658",
        "CreatedAt": "2 weeks ago",
        "State": "stopped",
        "Ports": [],
        "Size": "",
        "Names": [
            "sleepy_shockley"
        ],
        "Labels": {
            "key": "value"
        }
    }
]
*/
const getContainers = () => {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman ps -a --format json");
    if (!res) {
        info(`status: ${status}, error: ${err}`);
        throw new Error(_("Error occurred when fetching containers"));
    }
    debug(out);
    const containers = JSON.parse(imports.byteArray.toString(out));
    if (containers == null) {
        return {};
    }
    return containers;
};

const runCommand = function (command, containerName) {
    const cmdline = `podman ${command} ${containerName}`;
    info(`running command ${cmdline}`);
    const [res, out, err, status] = GLib.spawn_command_line_sync(cmdline);
    if (status === 0) {
        info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = _(`Error occurred when running ${command} on container ${containerName}`);
        Main.notify(errMsg);
        info(errMsg);
        info(err);
    }
    debug(out);
    return out;
}

const runCommandInTerminal = function (command, containerName, args) {
    const cmdline = `gnome-terminal -- ${command} ${containerName} ${args}`;
    info(`running command ${cmdline}`);
    const [res, out, err, status] = GLib.spawn_command_line_async(cmdline);
    if (status === 0) {
        info(`command on ${containerName} terminated successfully`);
    } else {
        const errMsg = _(`Error occurred when running ${command} on container ${containerName}`);
        Main.notify(errMsg);
        info(errMsg);
        info(err);
    }
    debug(out);
    return out;
}

var PopupMenuItem = GObject.registerClass(
    {
        GTypeName: 'PopupMenuItem'
    },
    class extends PopupMenu.PopupMenuItem {
        _init(label, value) {
            if (value === undefined) {
                super._init(label);
            } else {
                super._init(`${label}: ${value}`);
                this.connect('button_press_event', Lang.bind(this, () => {
                    setClipboard(value);
                }, false));
            }
            this.add_style_class_name("containers-extension-subMenuItem");
        }
    }
);

var ContainerMenuItem = GObject.registerClass(
   {
        GTypeName: 'ContainerMenuItem'
   },
    class extends PopupMenuItem {
        _init(containerName, command) {
            super._init(command);
            this.containerName = containerName;
            this.command = command;
            this.connect('activate', Lang.bind(this, () => {
                runCommand(this.command, this.containerName);
	        }));
        }
    }
);

var ContainerMenuWithOutputItem = GObject.registerClass(
    {
        GTypeName: 'ContainerMenuWithOutputItem'
    },
    class extends PopupMenuItem {
        _init(containerName, command, outputHdndler) {
            super._init(command);
            this.containerName = containerName;
            this.command = command;
            this.connect('activate', Lang.bind(this, () => {
                var out = runCommand(this.command, this.containerName);
                outputHdndler(out);
	        }));
        }
    }
);

var ContainerMenuItemWithTerminalAction = GObject.registerClass(
    {
        GTypeName: 'ContainerMenuItemWithTerminalAction'
    },
    class extends PopupMenuItem {
        _init(label, containerName, command, args) {
            super._init(label);
            this.containerName = containerName;
            this.command = command;
            this.args = args;
            this.connect('activate', Lang.bind(this, () => {
                runCommandInTerminal(this.command, this.containerName, this.args);
	        }));
        }
    }
);

var ContainerSubMenuMenuItem = GObject.registerClass(
    {
        GTypeName: 'ContainerSubMenuMenuItem'
    },
    class extends PopupMenu.PopupSubMenuMenuItem {
        _init(container, name) {
            super._init(container.Names[0]);
            this.menu.addMenuItem(new PopupMenuItem("Status", container.State));
            this.menu.addMenuItem(new PopupMenuItem("Id", container.Id));
            this.menu.addMenuItem(new PopupMenuItem("Image", container.Image));
            this.menu.addMenuItem(new PopupMenuItem("Command", container.Command));
            this.menu.addMenuItem(new PopupMenuItem("Created", container.Created));
            this.menu.addMenuItem(new PopupMenuItem("Ports", container.Ports));

            // add more stats and info - inspect - SLOW
            this.connect("button_press_event", Lang.bind(this, () => {
                debug(`Inspect ${container.Names[0]}`)
                inspect(container.Names[0], this.menu);
            }));
            // end of inspect

            debug(`Eval container ${container.Names[0]} state ${container.State}`)

            switch (container.State) {
                case "exited":
                case "created":
                case "stopped":
                    this.insert_child_at_index(createIcon('process-stop-symbolic', 'status-stopped'), 1);
                    const startMeunItem = new ContainerMenuItem(container.Names[0], "start");
                    startMeunItem.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-start'), 1);
                    this.menu.addMenuItem(startMeunItem);
                    const rmMenuItem = new ContainerMenuItem(container.Names[0], "rm");
                    rmMenuItem.insert_child_at_index(createIcon('user-trash-symbolic', 'status-remove'), 1);
                    this.menu.addMenuItem(rmMenuItem);
                    break;

                case "running":
                    this.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-running'), 1);
                    const pauseMenuIten = new ContainerMenuItem(container.Names[0], "pause");
                    pauseMenuIten.insert_child_at_index(createIcon('media-playback-pause-symbolic', 'status-stopped'), 1);
                    this.menu.addMenuItem(pauseMenuIten);
                    const stopMenuItem = new ContainerMenuItem(container.Names[0], "stop");
                    stopMenuItem.insert_child_at_index(createIcon('process-stop-symbolic', 'status-stopped'), 1);
                    this.menu.addMenuItem(stopMenuItem);
                    const restartMenuItem = new ContainerMenuItem(container.Names[0], "restart");
                    restartMenuItem.insert_child_at_index(createIcon('system-reboot-symbolic', 'status-restart'), 1);
                    this.menu.addMenuItem(restartMenuItem);
                    this.menu.addMenuItem(createTopMenuItem(container));
                    this.menu.addMenuItem(createShellMenuItem(container));
                    this.menu.addMenuItem(createStatsMenuItem(container));
                    break;
                
                case "paused":
                    this.insert_child_at_index(createIcon('media-playback-pause-symbolic', 'status-paused'), 1);
                    const unpauseMenuItem = new ContainerMenuItem(container.Names[0], "unpause");
                    unpauseMenuItem.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-start'), 1)
                    this.menu.addMenuItem(unpauseMenuItem);
                    break;
                    
                default:
                    this.insert_child_at_index(createIcon('action-unavailable-symbolic', 'status-undefined'), 1);
                    break;
            }

            // add log button
            const logMenuItem = createLogMenuItem(container);
            this.menu.addMenuItem(logMenuItem);
        }
    }
);

function setClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, text);
}

function inspect(container, menu) {
    let out = runCommand("inspect --format json", container);
    let inspect = JSON.parse(imports.byteArray.toString(out));
    if (inspect.length > 0 && inspect[0].NetworkSettings != null) {
        menu.addMenuItem(
            new PopupMenuItem("IP Address", JSON.stringify(inspect[0].NetworkSettings.IPAddress)));
    }
}

function createLogMenuItem(container) {
    let i = new ContainerMenuItemWithTerminalAction("logs", "", `podman logs -f ${container.Names[0]}`, "");
    i.insert_child_at_index(createIcon('document-open-symbolic.symbolic', 'action-logs'), 1)
    return i
}

function createTopMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("top", container.Names[0], "watch podman top", "");
    i.insert_child_at_index(createIcon('view-reveal-symbolic.symbolic', 'action-top'), 1);
    return i;
}

function createShellMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("sh", container.Names[0], "podman exec -it", "/bin/sh");
    i.insert_child_at_index(new St.Label({ style_class: 'action-sh', text: ">_" }), 1);
    return i;
}

function createStatsMenuItem(container) {
    const i = new ContainerMenuItemWithTerminalAction("stats", container.Names[0], "podman stats", "");
    i.insert_child_at_index(new St.Label({ style_class: 'action-stats', text: "%" }), 1);
    return i;
}
