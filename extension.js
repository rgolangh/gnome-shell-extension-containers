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

let _containersMenu;

function init() {
    log("starting");
}

function enable() {
    log("enabling");
    _containersMenu = new ContainersMenu;
    Main.panel.addToStatusArea('containers-menu', _containersMenu);
}

function disable() {
    _containersMenu.destroy();
}

function createIcon(name, styleClass) {
    return new St.Icon({ icon_name: name, style_class: styleClass, icon_size: '14' });
}

const ContainersMenu = new Lang.Class({
    Name: 'ContainersMenu',
    Extends: PanelMenu.Button,

    _init: function () {
        this.parent(0.0, _("Containers"));
        log("starting");
        const hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        const gicon = Gio.icon_new_for_string(Me.path + "/podman-icon.png");
        const icon = new St.Icon({ gicon: gicon, icon_size: '24' });

        hbox.add_child(icon);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);
        this.actor.connect('button_press_event', Lang.bind(this, () => {
            if (this.menu.isOpen) {
                this.menu.removeAll();
                this._renderMenu();
            }
        }));

        this._renderMenu();
    },

    _renderMenu: function () {
        try {
            const containers = getContainers();
            if (containers.length > 0) {
                containers.forEach((container) => {
                    const subMenu = new ContainerSubMenuMenuItem(container);
                    log("submenu " + subMenu);
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
{ "ID": "7a9e1233db51",
  "Image": "localhost/image-name:latest",
  "Command": "/entrypoint.sh bash",
  "CreatedAtTime": "2018-10-10T10:14:47.884563227+03:00",
  "Created": "2 weeks ago",
  "Status": "Created",
  "Ports": "",
  "Size": "",
  "Names": "sleepy_shockley",
  "Labels": "key=value,"
}
*/
const getContainers = () => {
    const [res, out, err, status] = GLib.spawn_command_line_sync("podman ps -a --format '{{json .}}'");
    if (status !== 0) {
        log(err);
        log(status);
        throw new Error("Error occurred when fetching containers");
    }
    const ret = String.fromCharCode
        .apply(String, out)
        .trim()
        .split("\n")
        .map((s) => {
            return JSON.parse(s);
        });
    log("containers returned " + typeof (ret) + " " + JSON.stringify(ret) + "----" + out);
    return ret;
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
    return out;
}

const PopupMenuItem = new Lang.Class({
    Name: 'PopupMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function (label) {
        this.parent(label);
        this.actor.add_style_class_name("container-extension-subMenuItem");
    }
})

const ContainerMenuItem = new Lang.Class({
    Name: 'ContainerMenuItem',
    Extends: PopupMenuItem,

    _init: function (containerName, command) {
        this.parent(command);
        this.containerName = containerName;
        this.command = command;
        this.connect('activate', Lang.bind(this, this._action));
    },

    _action: function () {
        runCommand(this.command, this.containerName);
    }
});

const ContainerSubMenuMenuItem = new Lang.Class({
    Name: 'ContainerSubMenuMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function (container) {
        log("constructor " + container);
        this.parent(container.Names);
        this.menu.addMenuItem(new PopupMenuItem("Id" + ": " + container.ID));
        this.menu.addMenuItem(new PopupMenuItem("Image" + ": " + container.Image));
        this.menu.addMenuItem(new PopupMenuItem("Command" + ": " + container.Command));
        this.menu.addMenuItem(new PopupMenuItem("Created" + ": " + container.Created));
        this.menu.addMenuItem(new PopupMenuItem("Ports" + ": " + container.Size));
        this.menu.addMenuItem(new PopupMenuItem("Labels" + ": " + container.Labels));
        // add more stats and info - inspect - SLOW
        const out = runCommand("inspect --format '{{json .}}'", container.Names)
        const inspect = JSON.parse(String.fromCharCode.apply(String, out).trim());
        this.menu.addMenuItem(new PopupMenuItem("IP Address: " + JSON.stringify(inspect.NetworkSettings.IPAddress)));
        // end of inspect

        switch (container.Status.split(" ")[0]) {
            case "Exited":
            case "Created":
            case "stopped":
                log("action " + container.Status);
                this.actor.insert_child_at_index(createIcon('process-stop-symbolic', 'status-stopped'), 1);
                const startMeunItem = new ContainerMenuItem(container.Names, "start");
                startMeunItem.actor.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-stopped'), 1);
                this.menu.addMenuItem(startMeunItem);
                const rmMenuItem = new ContainerMenuItem(container.Names, "rm");
                rmMenuItem.actor.insert_child_at_index(createIcon('user-trash-symbolic', 'status-stopped'), 1);
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
                unpauseMenuItem.actor.insert_child_at_index(createIcon('media-playback-start-symbolic', 'status-paused'), 1)
                this.menu.addMenuItem(unpauseMenuItem);
                break;
            default:
                this.actor.insert_child_at_index(createIcon('action-unavailable-symbolic', 'status-undefined'), 1);
                break;
        }
    }
});
