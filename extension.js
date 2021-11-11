"use strict";

const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Podman = Me.imports.modules.podman;
const Logger = Me.imports.modules.logger;

let containersMenu;

/**
 * enable is the entry point called by gnome-shell
 */
// eslint-disable-next-line no-unused-vars
function enable() {
    try {
        Logger.info("enabling containers extension");
        containersMenu = new ContainersMenu();
        Logger.debug(containersMenu);
        Main.panel.addToStatusArea("containers-menu", containersMenu);
    } catch(err) {
        logError(err);
    }
}

/** disable is called when the main extension menu is closed **/
// eslint-disable-next-line no-unused-vars
function disable() {
    Logger.info("disabling containers extension");
    containersMenu.destroy();
}

/** createIcon is just a convenience shortcut for standard icons
 *
 * @param {string} name is icon name
 * @param {string} styleClass is style_class
 */
function createIcon(name, styleClass) {
    return new St.Icon({icon_name: name, style_class: styleClass + " popup-menu-icon" });
}

var ContainersMenu = GObject.registerClass(
    class ContainersMenu extends PanelMenu.Button {
        _init() {
            super._init(0.0, "Containers");
            this.menu.box.add_style_class_name("containers-extension-menu");
            const hbox = new St.BoxLayout({style_class: "panel-status-menu-box"});
            const gicon = Gio.icon_new_for_string(`${Me.path}/podman-icon.png`);
            const icon = new St.Icon({gicon, icon_size: "24"});

            hbox.add_child(icon);
            this.add_child(hbox);

            this.menu.connect("open-state-changed", () => {
                if (this.menu.isOpen) {
                    this._renderMenu();
                }
            });
            this._renderMenu();
        }

        async _renderMenu() {
            try {
                const containers = await Podman.getContainers();
                Logger.info(`found ${containers.length} containers`);

                this.menu.removeAll();
                if (containers.length > 0) {
                    containers.forEach(container => {
                        Logger.debug(container.toString());
                        this.menu.addMenuItem(new ContainerSubMenuItem(container, container.name));
                    });
                } else {
                    this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
                }
            } catch (err) {
                logError(err);
                this.menu.removeAll();
                const errMsg = "Error occurred when fetching containers";
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
                Logger.info(`${errMsg}: ${err}`);
            }
        }
    });

var ContainerProperty = class extends PopupMenu.PopupMenuItem {
        constructor(label, value) {
            if (value === undefined) {
                super(label);
            } else {
                super(`${label}: ${value}`);
                this.connect("button-press-event", () => setClipboard(value));
            }
            this.actor.add_style_class_name("containers-extension-subMenuItem");
            this.actor.add_style_class_name(label.toLowerCase());
        }
    };


var ContainerSubMenuItem = class extends PopupMenu.PopupSubMenuMenuItem {
        constructor(container) {
            super(container.name);
            this.menu.box.add_style_class_name("aggregate-menu");
            const actions = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false, style_class: "container-action-bar"});
            this.menu.addMenuItem(actions);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const startBtn = addButton(actions, () => container.start(), "media-playback-start-symbolic");
            const stopBtn = addButton(actions, () => container.stop(), "media-playback-stop-symbolic");
            const restartBtn = addButton(actions, () => container.restart(), "system-reboot-symbolic");
            const pauseBtn = addButton(
                actions,
                () => {
                    if (container.status.split(" ")[0] === "running") {
                        container.pause();
                    }
                    if (container.status.split(" ")[0] === "paused") {
                        container.unpause();
                    }
                },
                "media-playback-pause-symbolic"
            );
            pauseBtn.toggle_mode = true;
            const deleteBtn = addButton(
                actions,
                () => {new RemoveContainerDialog(container).open(1, true)},
                "user-trash-symbolic.symbolic");
        
            switch (container.status.split(" ")[0]) {
            case "Exited":
            case "exited":
            case "Created":
            case "created":
            case "configured":
            case "stopped": {
                stopBtn.reactive = false;
                pauseBtn.reactive = false;
                this.actor.insert_child_at_index(createIcon("media-playback-stop-symbolic", "status-stopped"), 1);
                break;
            }
            case "Up":
            case "running": {
                startBtn.reactive = false;
                deleteBtn.reactive = false;
                pauseBtn.checked = false;
                this.actor.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
                break;
            }
            case "Paused":
            case "paused": {
                pauseBtn.checked = true;
                this.actor.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-paused"), 1);
                break;
            }
            default:
                this.actor.insert_child_at_index(createIcon("action-unavailable-symbolic", "status-undefined"), 1);
                break;
            }

            this.menu.addAction("Show logs", () => container.logs());
            this.menu.addAction("Watch top", () => container.watchTop());
            this.menu.addAction("Open shell", () => container.shell());
            this.menu.addAction("Watch statistics", () => container.stats());

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(new ContainerProperty("Status", container.status));
            if (container.startedAt !== null) {
                this.menu.addMenuItem(new ContainerProperty("Started", container.startedAt));
            }
            this.menu.addMenuItem(new ContainerProperty("Image", container.image));
            this.menu.addMenuItem(new ContainerProperty("Command", container.command));
            this.menu.addMenuItem(new ContainerProperty("Created", container.createdAt));
            this.menu.addMenuItem(new ContainerProperty("Ports", container.ports));
            const ipAddrMenuItem = new ContainerProperty("IP Address", "");
            this.menu.addMenuItem(ipAddrMenuItem);
            // add more stats and info - inspect - SLOW
            this.connect("button-press-event", async () => {
                if (!this.inspected) {
                    container.inspect();
                    this.inspected = true;
                    ipAddrMenuItem.label.set_text(`${ipAddrMenuItem.label.text} ${container.ipAddress}`);
                }
            });
        }
    };

/** set clipboard with @param text
 *
 * @param {string} text to set the clipboard with*/
function setClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, text);
}

/** adds a button to item and returns it
 *
 * @param item that the created button is added to
 * @param command is the actions to executoed when clicking the button
 * @param isconName is the icon name
 * */
function addButton(item, command, iconName) {
    const btn = new St.Button({
        track_hover: true,
        style_class: "containers-action-button button",
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    btn.child = new St.Icon({
        icon_name: iconName,
        style_class: "popup-menu-icon",
    });
    btn.connect("clicked", () => {
        command();
    });
    item.actor.add_child(btn);
    return btn;
}

var RemoveContainerDialog = class RemoveContainerDialog extends ModalDialog.ModalDialog {
    constructor(container) {
        super();
        const content = new Dialog.MessageDialogContent({
	    title: "Remove Container",
	    subtitle: `Are you sure you want to remove container ${container.name}?`,
	});
        this.contentLayout.add_child(content);
        this.addButton({
            action: () => this.close(),
            label: "Cancel",
            key: Clutter.KEY_Escapse
        });
        this.addButton({
            action: () =>  {
                this.close();
                container.rm();
            },
            label: "Remove",
        });
    }
};

