"use strict";

const Main = imports.ui.main;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
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
    Logger.info("enabling containers extension");
    Podman.discoverPodmanVersion();
    containersMenu = new ContainersMenu();
    Logger.debug(containersMenu);
    containersMenu.renderMenu();
    Main.panel.addToStatusArea("containers-menu", containersMenu);
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
    return new St.Icon({icon_name: name, style_class: `icon ${styleClass}`, icon_size: "14"});
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
                const containers = Podman.getContainers();
                Logger.info(`found ${containers.length} containers`);
                if (containers.length > 0) {
                    containers.forEach(container => {
                        Logger.debug(container.toString());
                        const subMenu = new ContainerSubMenuMenuItem(container, container.name);
                        this.menu.addMenuItem(subMenu);
                    });
                } else {
                    this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
                }
            } catch (err) {
                const errMsg = "Error occurred when fetching containers";
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
                Logger.info(`${errMsg}: ${err}`);
            }
            this.show();
        }
    });


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
        _init(containerName, commandLabel, commandFunc) {
            super._init(commandLabel);
            this.containerName = containerName;
            this.connect("activate", () => commandFunc());
            this.add_style_class_name("action");
	    this.disabled = true;
        }
    });

var ContainerSubMenuMenuItem = GObject.registerClass(
    {
        GTypeName: "ContainerSubMenuMenuItem",
    },
    class extends PopupMenu.PopupSubMenuMenuItem {
        _init(container) {
            super._init(container.name);
            // insert action box
	    const abox = new St.BoxLayout({style_class: "container-action-box"});
	    this.insert_child_at_index(abox, 3)
            const startMeunItem = new ContainerMenuItem(container.name, "", () => container.start());
            startMeunItem.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-start"), 1);
	    abox.add_child(startMeunItem);
            const stopMenuItem = new ContainerMenuItem(container.name, "", () => container.stop());
            stopMenuItem.insert_child_at_index(createIcon("process-stop-symbolic", "status-stopped"), 1);
	    abox.add_child(stopMenuItem);
            const rmMenuItem = new ContainerMenuItem(container.name, "", () => container.rm());
            rmMenuItem.insert_child_at_index(createIcon("user-trash-symbolic", "status-remove"), 1);
	    abox.add_child(rmMenuItem);

            const pauseMenuIten = new ContainerMenuItem(container.name, "", () => container.pause());
            pauseMenuIten.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-stopped"), 1);
	    abox.add_child(pauseMenuIten);
            const unpauseMenuItem = new ContainerMenuItem(container.name, "", () => container.unpause());
            unpauseMenuItem.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-start"), 1);
            abox.add_child(unpauseMenuItem);

            const restartMenuItem = new ContainerMenuItem(container.name, "", () => container.restart());
            restartMenuItem.insert_child_at_index(createIcon("system-reboot-symbolic", "status-restart"), 1);
	    abox.add_child(restartMenuItem);

            const topMenuItem = createTopMenuItem(container);
            const shellMenuItem = createShellMenuItem(container);
            const statsMenuItem = createStatsMenuItem(container);
            abox.add_child(topMenuItem);
            abox.add_child(shellMenuItem);
            abox.add_child(statsMenuItem);

            this.menu.addMenuItem(new PopupMenuItem("Status", container.status));
            this.menu.addMenuItem(new PopupMenuItem("Id", container.id));
            this.menu.addMenuItem(new PopupMenuItem("Image", container.image));
            this.menu.addMenuItem(new PopupMenuItem("Command", container.command));
            this.menu.addMenuItem(new PopupMenuItem("Created", container.createdAt));
            this.menu.addMenuItem(new PopupMenuItem("Ports", container.ports));
            const ipAddrMenuItem = new PopupMenuItem("IP Address", "");
            this.menu.addMenuItem(ipAddrMenuItem);
            this.inspected = false;

            // add more stats and info - inspect - SLOW
            this.connect("button_press_event", () => {
                if (!this.inspected) {
                    container.inspect();
                    this.inspected = true;
                    ipAddrMenuItem.label.set_text(`${ipAddrMenuItem.label.text} ${container.ipAddress}`);
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
                startMeunItem.add_style_class_name("action-enabled");
                startMeunItem.disabled = false;
                rmMenuItem.add_style_class_name("action-enabled");
                break;
            }
            case "Up":
            case "running": {
                this.menu.addMenuItem(new PopupMenuItem("Started", container.startedAt));
                this.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
                pauseMenuIten.add_style_class_name("action-enabled");
                stopMenuItem.add_style_class_name("action-enabled");
	        stopMenuItem.disabled = false;
                restartMenuItem.add_style_class_name("action-enabled");
		topMenuItem.add_style_class_name("action-enabled");
		shellMenuItem.add_style_class_name("action-enabled");
		statsMenuItem.add_style_class_name("action-enabled");
                break;
            }
            case "Paused":
            case "paused": {
                this.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-paused"), 1);
		unpauseMenuItem.add_style_class_name("action-enabled");
                break;
            }
            default:
                this.insert_child_at_index(createIcon("action-unavailable-symbolic", "status-undefined"), 1);
                break;
            }

            // add log button
            const logMenuItem = createLogMenuItem(container);
		logMenuItem.disabled = true;
            this.menu.addMenuItem(logMenuItem);
        }
    });

/** set clipboard with @param text
 *
 * @param {string} text to set the clipboard with*/
function setClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, text);
}

/** creates a log menu items
 *
 * @param {Container} container is the target container
 */
function createLogMenuItem(container) {
    let i = new ContainerMenuItem(container.name, "logs", () => container.logs());
    i.insert_child_at_index(createIcon("document-open-symbolic.symbolic", "action-logs"), 1);
    return i;
}

/** creates a top menu item
 *
 * @param {Container} container is the target container
 */
function createTopMenuItem(container) {
    const i = new ContainerMenuItem(container.name, "top", () => container.watchTop());
    i.insert_child_at_index(createIcon("view-reveal-symbolic.symbolic", "action-top"), 1);
    return i;
}

/** creates a shell menu item
 *
 * @param {Container} container is the target container
 */
function createShellMenuItem(container) {
    const i = new ContainerMenuItem(container.name, "sh", () => container.shell());
    i.insert_child_at_index(new St.Label({style_class: "action-sh", text: ">_"}), 1);
    return i;
}

/** creates a stats menu item/
 *
 * @param {Container} container is the target container
 */
function createStatsMenuItem(container) {
    const i = new ContainerMenuItem(container.name, "stats", () => container.stats());
    i.insert_child_at_index(new St.Label({style_class: "action-stats", text: "%"}), 1);
    return i;
}

