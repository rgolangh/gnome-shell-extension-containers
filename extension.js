"use strict";

import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import GObject from 'gi://GObject';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Podman from './modules/podman.js';
import * as Logger from './modules/logger.js';

let containersMenu;

export default class ContainersExtension extends Extension {
    /**
     * enable is the entry point called by gnome-shell
     */
    // eslint-disable-next-line no-unused-vars
    enable() {
        Logger.info("enabling containers extension");
        containersMenu = new ContainersMenu();
        Logger.debug(containersMenu);
        Main.panel.addToStatusArea("containers-menu", containersMenu);
    }

    /**
     * disable is called when the main extension menu is closed
     */
    // eslint-disable-next-line no-unused-vars
    disable() {
        Logger.info("disabling containers extension");
        containersMenu.destroy();
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

var ContainersMenu = GObject.registerClass(
    class ContainersMenu extends PanelMenu.Button {
        _init() {
            super._init(0.0, "Containers");
            this.menu.box.add_style_class_name("containers-extension-menu");
            const hbox = new St.BoxLayout({style_class: "panel-status-menu-box"});
            const ext = Extension.lookupByUUID("containers@royg");
            const gicon = Gio.icon_new_for_string(`${ext.path}/podman-icon.png`);
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

                const prune = new PopupMenu.PopupMenuItem("Prune Containers");
                prune.connect("activate",
                    () => Podman.spawnCommandline("podman container prune -f"));

                const newContainer = new PopupMenu.PopupMenuItem("New Fedora rawhide Container");
                newContainer.connect("activate",
                    () => Podman.spawnCommandline("podman run -di registry.fedoraproject.org/fedora-minimal:rawhide /bin/bash"));

                this.menu.addMenuItem(prune);
                this.menu.addMenuItem(newContainer);
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

                if (containers.length > 0) {
                    containers.forEach(container => {
                        Logger.debug(container.toString());
                        this.menu.addMenuItem(new ContainerSubMenuItem(container, container.name));
                    });
                } else {
                    this.menu.addMenuItem(new PopupMenu.PopupMenuItem("No containers detected"));
                }
            } catch (err) {
                this.menu.removeAll();
                const errMsg = "Error occurred when fetching containers";
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
                Logger.info(`${errMsg}: ${err}`);
            }
        }
    });

var ContainerSubMenuItem = GObject.registerClass(
class extends PopupMenu.PopupSubMenuMenuItem {
    _init(container) {
        super._init(container.name);
        const actions = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false, style_class: "container-action-bar"});
        this.menu.addMenuItem(actions);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const startBtn = createActionButton(() => container.start(), "media-playback-start-symbolic");
        const stopBtn = createActionButton(() => container.stop(), "media-playback-stop-symbolic");
        const restartBtn = createActionButton(() => container.restart(), "system-reboot-symbolic");
        const pauseBtn = createActionButton(
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
        const deleteBtn = createActionButton(
            () => new RemoveContainerDialog(container).open(1, true),
            "media-eject-symbolic");

        switch (container.status.split(" ")[0]) {
        case "Exited":
        case "exited":
        case "Created":
        case "created":
        case "configured":
        case "stopped": {
            actions.actor.add_child(startBtn);
            pauseBtn.reactive = false;
            this.insert_child_at_index(createIcon("media-playback-stop-symbolic", "status-stopped"), 1);
            break;
        }
        case "Up":
        case "running": {
            actions.actor.add_child(stopBtn);
            deleteBtn.reactive = false;
            pauseBtn.checked = false;
            this.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
            break;
        }
        case "Paused":
        case "paused": {
            pauseBtn.checked = true;
            this.insert_child_at_index(createIcon("media-playback-pause-symbolic", "status-paused"), 1);
            break;
        }
        default:
            this.insert_child_at_index(createIcon("action-unavailable-symbolic", "status-undefined"), 1);
            break;
        }
        actions.actor.add_child(restartBtn);
        actions.actor.add_child(pauseBtn);
        actions.actor.add_child(deleteBtn);

        this.menu.addAction("Show Logs", () => container.logs());
        this.menu.addAction("Watch Top", () => container.watchTop());
        this.menu.addAction("Open Shell", () => container.shell());
        this.menu.addAction("Watch Statistics", () => container.stats());
        this.menu.addAction("Copy Container Details", () => setClipboard(container.details()));
    }
});

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
    return btn;
}

var RemoveContainerDialog = GObject.registerClass(
class RemoveContainerDialog extends ModalDialog.ModalDialog {
    _init(container) {
        super._init();
        const content = new Dialog.MessageDialogContent({
            title: "Remove Container",
            description: `Are you sure you want to remove container ${container.name}?`,
        });
        this.contentLayout.add_child(content);
        this.addButton({
            action: () => this.close(),
            label: "Cancel",
            key: Clutter.KEY_Escapse,
        });
        this.addButton({
            action: () =>  {
                this.close();
                container.rm();
            },
            label: "Remove",
        });
    }
});

