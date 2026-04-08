"use strict";

import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Dialog from "resource:///org/gnome/shell/ui/dialog.js";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";
import GObject from "gi://GObject";

import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";

import * as Podman from "./modules/podman.js";

export default class ContainersExtension extends Extension {
    /**
     * enable is the entry point called by gnome-shell
     */
    enable() {
        console.log(`enabling ${this.uuid} extension`);
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this.menu = this._indicator.menu;
        this._settings = this.getSettings();
        this._renderRequestId = 0;

        this._indicator.menu.box.add_style_class_name("containers-extension-menu");
        const hbox = new St.BoxLayout({style_class: "panel-status-menu-box"});
        const ext = Extension.lookupByUUID("containers@royg");
        const gicon = Gio.icon_new_for_string(`${ext.path}/podman-icon.png`);
        const icon = new St.Icon({gicon, icon_size: "24"});
        this._indicator.add_child(icon);
        this._indicator.add_child(hbox);

        this._indicator.menu.connect("open-state-changed", () => {
            if (this.menu.isOpen) {
                this._renderMenu();
                this._sync();
            } else {
                this._stop_sync();
            }
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Build static menu items
        const prefs = new PopupMenu.PopupMenuItem("Preferences");
        prefs.connect("activate", () => this.openPreferences());
        this.menu.addMenuItem(prefs);

        const prune = new PopupMenu.PopupMenuItem("Prune Containers");
        prune.connect("activate", () => {
            new PruneContainersDialog().open(1, true);
        });
        this.menu.addMenuItem(prune);

        const newContainer = new PopupMenu.PopupMenuItem("New Fedora rawhide Container");
        newContainer.connect("activate", () => {
            Main.notify("Creating Container...", "Pulling image and starting fedora-minimal:rawhide");
            Podman.spawnCommandline("podman run -di registry.fedoraproject.org/fedora-minimal:rawhide /bin/bash")
                .then(() => Main.notify("Container Created", "Fedora rawhide container is now running."))
                .catch(e => Main.notify("Error creating container", e.message));
        });
        this.menu.addMenuItem(newContainer);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Dynamic container section
        this._containerSection = new PopupMenu.PopupMenuSection();
        const scrollView = new St.ScrollView({
            style_class: "containers-scroll-view",
        });
        scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        scrollView.add_child(this._containerSection.actor);

        this._scrollItem = new PopupMenu.PopupBaseMenuItem({
            reactive: true,
            can_focus: false,
            style_class: "containers-scroll-item",
        });
        this._scrollItem.actor.add_child(scrollView);
        scrollView.set_x_expand(true);
        scrollView.set_y_expand(true);
        this.menu.addMenuItem(this._scrollItem);

        this._noContainersItem = new PopupMenu.PopupMenuItem("No containers detected");
        this.menu.addMenuItem(this._noContainersItem);
        this._noContainersItem.actor.visible = false; // Hidden by default

        this._containerItems = new Map();
        this._renderMenu();
    }


    /**
     * disable is called when the main extension menu is closed
     */
    disable() {
        console.log("disabling containers extension");
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
        this._containerSection = null;
        this._scrollItem = null;
        this._noContainersItem = null;
        this._containerItems = null;
    }

    async _sync() {
        this.podmanListenCmd = await Podman.newEventsProcess(containerEvent => {
            console.debug(`container event for container ${containerEvent.name}`);
            this._renderMenu();
        });
    }

    async _stop_sync() {
        try {
            const out = this.podmanListenCmd?.get_stdout_pipe();
            await out.close_async(0, null, () => {});
            await this.podmanListenCmd.force_exit();
            console.debug(`podman events process status ${this.podmanListenCmd.get_status()}`);
        } catch (e) {
            console.error(`cleaning up podman events subprocess failed ${e}`);
        }
    }

    async _renderMenu() {
        this._renderRequestId++;
        const requestId = this._renderRequestId;

        try {
            const containers = await Podman.getContainers(this._settings);
            if (requestId !== this._renderRequestId) {
                return;
            }
            console.debug(`found ${containers.length} containers`);

            if (containers.length > 0) {
                this._scrollItem.actor.visible = true;
                this._noContainersItem.actor.visible = false;

                const currentIds = new Set(containers.map(c => c.id));

                let index = 0;
                // Update existing or create new items
                for (const container of containers) {
                    if (this._containerItems.has(container.id)) {
                        const item = this._containerItems.get(container.id);
                        item.update(container, {
                            extraInfo: this._settings.get_boolean("extra-info"),
                        });
                        this._containerSection.moveMenuItem(item, index);
                    } else {
                        const item = new ContainerSubMenuItem(container, {
                            extraInfo: this._settings.get_boolean("extra-info"),
                        });
                        this._containerSection.addMenuItem(item, index);
                        this._containerItems.set(container.id, item);
                    }
                    index++;
                }

                // Remove stale items
                for (const [id, item] of this._containerItems) {
                    if (!currentIds.has(id)) {
                        item.destroy();
                        this._containerItems.delete(id);
                    }
                }
            } else {
                this._containerSection.removeAll();
                this._containerItems.clear();
                this._scrollItem.actor.visible = false;
                this._noContainersItem.actor.visible = true;
            }
        } catch (err) {
            if (requestId !== this._renderRequestId) {
                return;
            }
            this._containerSection.removeAll();
            this._containerItems.clear();
            this._scrollItem.actor.visible = false;
            const errMsg = "Error occurred when fetching containers";
            this._noContainersItem.label.text = errMsg;
            this._noContainersItem.actor.visible = true;
            console.error(`${errMsg}: ${err}`);
        }
    }
}

class ContainerSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(container, settings) {
        super(container.name);
        this.menu.box.add_style_class_name("container-menu-item");

        this._container = container;
        this._statusIcon = null;

        // Create buttons once
        this._startBtn = createActionButton(() => this._container.start(), "media-playback-start-symbolic");
        this._stopBtn = createActionButton(() => this._container.stop(), "media-playback-stop-symbolic");
        this._restartBtn = createActionButton(() => this._container.restart(), "system-reboot-symbolic");
        this._pauseBtn = createActionButton(
            () => {
                const status = this._container.status.split(" ")[0];
                if (["Up", "running"].includes(status)) {
                    this._container.pause();
                } else if (["Paused", "paused"].includes(status)) {
                    this._container.unpause();
                }
            },
            "media-playback-pause-symbolic"
        );
        this._pauseBtn.toggle_mode = true;
        this._deleteBtn = createActionButton(
            () => new RemoveContainerDialog(this._container).open(1, true),
            "user-trash-symbolic");

        // Status Icon at index 1
        this._statusIcon = createIcon("action-unavailable-symbolic", "status-undefined");
        this.insert_child_at_index(this._statusIcon, 1);

        // In GNOME Shell's PopupSubMenuMenuItem, index 3 is typically an expanding spacer.
        // We insert the buttons at index 4 so they appear on the right side, after the spacer.
        // Because we insert them all at index 4 sequentially, they push each other to the right.
        this.insert_child_at_index(this._restartBtn, 4);
        this.insert_child_at_index(this._pauseBtn, 4);
        this.insert_child_at_index(this._deleteBtn, 4);
        this.insert_child_at_index(this._startBtn, 4);
        this.insert_child_at_index(this._stopBtn, 4);

        // Add a placeholder so GNOME Shell knows this submenu can be expanded
        this._placeholderItem = new PopupMenu.PopupMenuItem("Loading...");
        this.menu.addMenuItem(this._placeholderItem);

        this.menu.connect("open-state-changed", (menu, open) => {
            if (open) {
                this._populateSubmenu();
            }
        });

        this.update(container, settings);
    }

    update(container, settings) {
        this._container = container;
        this._settings = settings;
        this.label.text = container.name;

        // Update Status Icon
        let iconName, styleClass;
        const status = container.status.split(" ")[0];
        switch (status) {
            case "Exited":
            case "exited":
            case "Created":
            case "created":
            case "configured":
            case "stopped":
                iconName = "media-playback-stop-symbolic";
                styleClass = "status-stopped";
                break;
            case "Up":
            case "running":
                iconName = "media-playback-start-symbolic";
                styleClass = "status-running";
                break;
            case "Paused":
            case "paused":
                iconName = "media-playback-pause-symbolic";
                styleClass = "status-paused";
                break;
            default:
                iconName = "action-unavailable-symbolic";
                styleClass = "status-undefined";
                break;
        }

        this._statusIcon.icon_name = iconName;
        this._statusIcon.style_class = `${styleClass} popup-menu-icon`;

        // Update Button Visibility and State
        const isStopped = ["Exited", "exited", "Created", "created", "configured", "stopped"].includes(status);
        const isRunning = ["Up", "running"].includes(status);
        const isPaused = ["Paused", "paused"].includes(status);

        this._startBtn.visible = isStopped;
        this._stopBtn.visible = isRunning;
        this._restartBtn.visible = isRunning || isPaused;
        this._pauseBtn.visible = isRunning || isPaused;
        this._pauseBtn.reactive = isRunning || isPaused;
        this._pauseBtn.checked = isPaused;
        this._deleteBtn.visible = isStopped;

        // If submenu is currently open, refresh it
        if (this.menu.isOpen) {
            this._populateSubmenu();
        }
    }

    // Override _getTopMenu to fix GNOME Shell's traversal through St.ScrollView
    _getTopMenu() {
        let actor = this.actor.get_parent();
        while (actor) {
            if (actor._delegate && typeof actor._delegate._setOpenedSubMenu === "function") {
                return actor._delegate;
            }
            actor = actor.get_parent();
        }
        return null;
    }

    _populateSubmenu() {
        // Clear everything including placeholder
        this.menu.removeAll();

        if (this._settings.extraInfo) {
            const info = new PopupMenu.PopupMenuItem("Loading details...");
            this.menu.addMenuItem(info);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._updateDetails(this._container, info);
        }

        this.menu.addAction("Show Logs", () => this._container.logs());
        this.menu.addAction("Watch Top", () => this._container.watchTop());
        this.menu.addAction("Open Shell", () => this._container.shell());
        this.menu.addAction("Watch Statistics", () => this._container.stats());

        const copyItem = new PopupMenu.PopupMenuItem("Copy Container Details");
        copyItem.activate = async () => {
            setClipboard(await this._container.details());
        };
        this.menu.addMenuItem(copyItem);

        // Add a small delay if it's empty? No, it shouldn't be empty now.

        const last = this.menu.box.get_children().at(-1);
        if (last) {
            last.add_style_class_name("last-container-menu-item");
        }
    }

    async _updateDetails(container, infoItem) {
        try {
            const details = await container.details();
            if (infoItem.actor && infoItem.actor.get_parent()) {
                infoItem.label.text = details;
            }
        } catch (e) {
            console.error(`Failed to update container details: ${e}`);
            if (infoItem.actor && infoItem.actor.get_parent()) {
                infoItem.label.text = "Error loading details";
            }
        }
    }
}

/**
 * set clipboard with @param text
 * @param {string} text to set the clipboard with
 */
function setClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, text);
}

/**
 * creates a button for a primary container action
 * @param {Function} command is the action executed when clicking the button
 * @param {string} iconName is the icon name
 * @returns {St.Button} new icon
 */
function createActionButton(command, iconName) {
    const btn = new St.Button({
        track_hover: true,
        style_class: "containers-action-button button",
    });
    btn.child = new St.Icon({
        icon_name: iconName,
        style_class: "popup-menu-icon",
    });
    btn.connect("clicked", () => {
        command();
    });
    return btn;
}

class RemoveContainerDialog extends ModalDialog.ModalDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(container) {
        super();
        const content = new Dialog.MessageDialogContent({
            title: "Remove Container",
            description: `Are you sure you want to remove container ${container.name}?`,
        });
        this.contentLayout.add_child(content);
        this.addButton({
            action: () => this.close(),
            label: "Cancel",
            key: Clutter.KEY_Escape,
        });
        this.addButton({
            action: () =>  {
                this.close();
                container.rm();
            },
            label: "Remove",
        });
    }
}

class PruneContainersDialog extends ModalDialog.ModalDialog {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        const content = new Dialog.MessageDialogContent({
            title: "Prune Containers",
            description: "Are you sure you want to remove all stopped containers?",
        });
        this.contentLayout.add_child(content);
        this.addButton({
            action: () => this.close(),
            label: "Cancel",
            key: Clutter.KEY_Escape,
        });
        this.addButton({
            action: () =>  {
                this.close();
                Podman.spawnCommandline("podman container prune -f")
                    .then(() => Main.notify("Containers pruned", "All stopped containers have been removed."))
                    .catch(e => Main.notify("Error pruning containers", e.message));
            },
            label: "Prune",
        });
    }
}

/**
 * createIcon is just a convenience shortcut for standard icons
 * @param {string} name is icon name
 * @param {string} styleClass is style_class
 * @returns {St.icon} new icon
 */
function createIcon(name, styleClass) {
    return new St.Icon({icon_name: name, style_class: `${styleClass} popup-menu-icon`});
}
