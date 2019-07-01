'use strict';

const Main = imports.ui.main;
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

let debugIsEnabled = false;

function debug(obj) {
    if (debugIsEnabled) {
        log("object is " + obj);
    }
}

function enable() {
    log("enabling containers extension");
    containersMenu = new ContainersMenu();
    debug(containersMenu);
    containersMenu.renderMenu();
    Main.panel.addToStatusArea('containers-menu', containersMenu);
}

function disable() {
    log("disabling containers extension");
    containersMenu.destroy();
}

function createIcon(name, styleClass) {
    return new St.Icon({ icon_name: name, style_class: styleClass, icon_size: '14' });
}

const ContainersMenu = GObject.registerClass(
class ContainersMenu extends PanelMenu.Button {
    _init() {
        super._init(0.0, "Containers");
        const hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        const gicon = Gio.icon_new_for_string(Me.path + "/podman-icon.png");
        const icon = new St.Icon({ gicon: gicon, icon_size: '24' });

        hbox.add_child(icon);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);
        this.actor.connect('button_press_event', Lang.bind(this, () => {
            if (this.menu.isOpen) {
                this.menu.removeAll();
                this.renderMenu();
            }
        }));
    }

    renderMenu() {
        try {
            const containers = getContainers();
            log("found " + containers.length + " containers");
            if (containers.length > 0) {
                containers.forEach((container) => {
                    debug(container);
                    const subMenu = new ContainerSubMenuMenuItem(container, container.Names);
                    this.menu.addMenuItem(subMenu);
                });
            } else {
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
            }
        } catch (err) {
            const errMsg = "Error occurred when fetching containers";
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            log(errMsg);
            log(err);
        }
        this.actor.show();
    }
});

/* getContainers return a json array containers in the form of 
[
    {
        "ID": "7a9e1233db51",
        "Image": "localhost/image-name:latest",
        "Command": "/entrypoint.sh bash",
        "CreatedAtTime": "2018-10-10T10:14:47.884563227+03:00",
        "Created": "2 weeks ago",
        "Status": "Created",
        "Ports": "",
        "Size": "",
        "Names": "sleepy_shockley",
        "Labels": "key=value,"
    },
]
*/
const getContainers = () => {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman ps -a --format json");
    if (status !== 0) {
        log(err);
        log(status);
        throw new Error("Error occurred when fetching containers");
    }
    debug(out);
    return JSON.parse(out);
};

const runCommand = function (command, containerName) {
    const cmdline = "podman " + command + " " + containerName;
    log("running command " + cmdline);
    const [res, out, err, status] = GLib.spawn_command_line_sync(cmdline);
    if (status === 0) {
        log("`" + command + "` on " + containerName + " terminated successfully");
    } else {
        const errMsg = _("Error occurred when running `" + command + "` on container " + containerName);
        Main.notify(errMsg);
        log(errMsg);
        log(err);
    }
    debug(out);
    return out;
}

const PopupMenuItem = class extends PopupMenu.PopupMenuItem {
    constructor(label) {
        super(label);
        this.actor.add_style_class_name("container-extension-subMenuItem");
    }
}

const ContainerMenuItem = class extends PopupMenuItem {
    constructor(containerName, command) {
        super(command);
        this.containerName = containerName;
        this.command = command;
        this.connect('activate', Lang.bind(this, this._action));
    }

    _action() {
        runCommand(this.command, this.containerName);
    }
};

var ContainerSubMenuMenuItem = class extends PopupMenu.PopupSubMenuMenuItem {
    constructor(container, name) {
        log("constructor " + container.Names);
        super(container.Names);
        this.menu.addMenuItem(new PopupMenuItem("Status" + ": " + container.Status));
        this.menu.addMenuItem(new PopupMenuItem("Id" + ": " + container.ID));
        this.menu.addMenuItem(new PopupMenuItem("Image" + ": " + container.Image));
        this.menu.addMenuItem(new PopupMenuItem("Command" + ": " + container.Command));
        this.menu.addMenuItem(new PopupMenuItem("Created" + ": " + container.Created));
        this.menu.addMenuItem(new PopupMenuItem("Ports" + ": " + container.Ports));
        // this.menu.addMenuItem(new PopupMenuItem("Labels" + ": " + [].join(container.Labels.));
        // add more stats and info - inspect - SLOW
        const out = runCommand("inspect --format json", container.Names)
        const inspect = JSON.parse(out);
        if (inspect.length > 0 && inspect[0].NetworkSettings != null) {
            this.menu.addMenuItem(
                new PopupMenuItem("IP Address: " + JSON.stringify(inspect[0].NetworkSettings.IPAddress)));
        }
        // end of inspect

        switch (container.Status.split(" ")[0]) {
            case "Exited":
            case "Created":
            case "stopped":
                log("action " + container.Status);
                this.actor.insert_child_at_index(createIcon('process-stop-symbolic', 'status-stopped'), 1);
                const startMeunItem = new ContainerMenuItem(container.Names, "start");
                startMeunItem.actor.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-start'), 1);
                this.menu.addMenuItem(startMeunItem);
                const rmMenuItem = new ContainerMenuItem(container.Names, "rm");
                rmMenuItem.actor.insert_child_at_index(createIcon('user-trash-symbolic', 'status-remove'), 1);
                this.menu.addMenuItem(rmMenuItem);
                break;
            case "Up":
                this.actor.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-running'), 1);
                const pauseMenuIten = new ContainerMenuItem(container.Names, "pause");
                pauseMenuIten.actor.insert_child_at_index(createIcon('media-playback-pause-symbolic', 'status-stopped'), 1);
                this.menu.addMenuItem(pauseMenuIten);
                const stopMenuItem = new ContainerMenuItem(container.Names, "stop");
                stopMenuItem.actor.insert_child_at_index(createIcon('process-stop-symbolic', 'status-stopped'), 1);
                this.menu.addMenuItem(stopMenuItem);
                break;
            case "Paused":
                this.actor.insert_child_at_index(createIcon('media-playback-pause-symbolic', 'status-paused'), 1);
                const unpauseMenuItem = new ContainerMenuItem(container.Names, "unpause");
                unpauseMenuItem.actor.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-start'), 1)
                this.menu.addMenuItem(unpauseMenuItem);
                break;
            default:
                this.actor.insert_child_at_index(createIcon('action-unavailable-symbolic', 'status-undefined'), 1);
                break;
        }
    }
};
