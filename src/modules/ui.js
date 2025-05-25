"use strict";

import St from "gi://St";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Dialog from "resource:///org/gnome/shell/ui/dialog.js";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import * as PodmanApi from "./podman-socket-api.js";

export class ContainerSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(container, settings) {
        super(container.Names[0]);
        this.menu.box.add_style_class_name("container-menu-item");
        const label = new St.Label({ text: container.Image });
        label.add_style_class_name("container-name-label");
        const actions = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: "container-action-bar" });
        actions.actor.set_x_expand(true);
        actions.actor.set_x_align(Clutter.ActorAlign.END);
        // this.insert_child_at_index(actions, 2);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const startBtn = createActionButton(
            () => container.start(),
            "media-playback-start-symbolic"
        );
        const stopBtn = createActionButton(
            () => container.stop(),
            "media-playback-stop-symbolic"
        );
        const restartBtn = createActionButton(
            () => container.restart(),
            "system-reboot-symbolic");
        const pauseBtn = createActionButton(
            () => {
                if (container.State === "running") {
                    container.pause();
                }
                if (container.State === "paused") {
                    container.unpause();
                }
            },
            "media-playback-pause-symbolic"
        );
        pauseBtn.toggle_mode = true;
        const deleteBtn = createActionButton(
            () => new RemoveDialog("container", container.Names[0], () => container.rm()).open(1, true),
            "user-trash-symbolic");

        switch (container.State) {
            case "Exited":
            case "exited":
            case "Created":
            case "created":
            case "configured":
            case "stopped": {
                pauseBtn.reactive = false;
                this.insert_child_at_index(createIcon("media-playback-stop-symbolic", "status-stopped"), 1);
                // the element on index 3 is the expander, a spacer that clutter fills with space
                this.insert_child_at_index(startBtn, 4);
                break;
            }
            case "Up":
            case "running": {
                deleteBtn.reactive = false;
                pauseBtn.checked = false;
                this.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
                // the element on index 3 is the expander, a spacer that clutter fills with space
                this.insert_child_at_index(stopBtn, 4);
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
        // the element on index 3 is the expander, a spacer that clutter fills with space
        this.insert_child_at_index(restartBtn, 4);
        this.insert_child_at_index(pauseBtn, 4);
        this.insert_child_at_index(deleteBtn, 4);

        if (settings.extraInfo) {
            const info = new PopupMenu.PopupMenuItem([
                `State: ${container.State}`,
                `Image: ${container.Image}`,
                `Created: ${container.Created}`,
                `Command: ${container.Command?.join(" ")}`,
                `Lables: \n\t${Object.entries(container.Labels).join("\n\t")}`,
            ].join("\n"));
            info.add_style_class_name("container-info");
            this.menu.addMenuItem(info);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        this.menu.addAction("Show Logs", () => container.logs());
        this.menu.addAction("Watch Top", () => container.watchTop());
        this.menu.addAction("Open Shell", () => container.shell());
        this.menu.addAction("Watch Statistics", () => container.stats());
        this.menu.addAction("Copy Container Details", () => setClipboard(container.details()));
        // the css nth- or last-of-type is probably not implemented in gjs
        this.menu.box.get_children().at(-1).add_style_class_name("last-container-menu-item");
    }
}

export class PodSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(pod) {
        super(pod.Name);
        this.menu.box.add_style_class_name("container-menu-item");
        const label = new St.Label({ text: pod.Name });
        label.add_style_class_name("container-name-label");
        const actions = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: "container-action-bar" });
        actions.actor.set_x_expand(true);
        actions.actor.set_x_align(Clutter.ActorAlign.END);
        // this.insert_child_at_index(actions, 2);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const startBtn = createActionButton(() =>
            pod.start(),
            "media-playback-start-symbolic");
        const stopBtn = createActionButton(() =>
            pod.stop(),
            "media-playback-stop-symbolic");
        const restartBtn = createActionButton(() =>
            pod.restart(),
            "system-reboot-symbolic");
        const pauseBtn = createActionButton(
            () => {
                if (pod.Status === "running") {
                    pod.pause();
                }
                if (pod.Status === "paused") {
                    pod.unpause();
                }
            },
            "media-playback-pause-symbolic"
        );
        pauseBtn.toggle_mode = true;
        const deleteBtn = createActionButton(
            () => new RemoveDialog("pod", pod.Name, () => PodmanApi.request(`pods/${pod.Id}`, "DELETE")).open(1, true),
            "user-trash-symbolic");

        switch (pod.Status) {
            case "Exited":
            case "exited":
            case "Created":
            case "created":
            case "configured":
            case "stopped": {
                pauseBtn.reactive = false;
                this.insert_child_at_index(createIcon("media-playback-stop-symbolic", "status-stopped"), 1);
                // the element on index 3 is the expander, a spacer that clutter fills with space
                this.insert_child_at_index(startBtn, 4);
                break;
            }
            case "Up":
            case "Running":
            case "running": {
                deleteBtn.reactive = false;
                pauseBtn.checked = false;
                this.insert_child_at_index(createIcon("media-playback-start-symbolic", "status-running"), 1);
                // the element on index 3 is the expander, a spacer that clutter fills with space
                this.insert_child_at_index(stopBtn, 4);
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
        // the element on index 3 is the expander, a spacer that clutter fills with space
        this.insert_child_at_index(restartBtn, 4);
        this.insert_child_at_index(pauseBtn, 4);
        this.insert_child_at_index(deleteBtn, 4);

        let data = [`Name: ${pod.Name}`];
        if (Object.keys(pod.Labels).length > 0) {
            data.push(`Labels: \n\t${Object.entries(pod.Labels).join("\n\t")}`);
        }
        if (Object.keys(pod.Containers).length > 0) {
            data.push(`Containers: \n\t${pod.Containers.map(c => c.Names + " " + c.Status).join("\n\t")}`);
        }
        const info = new PopupMenu.PopupMenuItem(data.join("\n"));
        info.add_style_class_name("container-info");
        this.menu.addMenuItem(info);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menu.addAction("Show Logs", () => pod.logs());
        this.menu.addAction("Watch Top", () => pod.watchTop());
        this.menu.addAction("Open Shell", () => pod.shell());
        this.menu.addAction("Watch Statistics", () => pod.stats());
        // the css nth- or last-of-type is probably not implemented in gjs
        this.menu.box.get_children().at(-1).add_style_class_name("last-container-menu-item");
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export class ImageSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(image, settings) {
        super(image.RepoTags[0]);
        this.menu.box.add_style_class_name("container-menu-item");
        const label = new St.Label({ text: image.RepoTags[0] });
        label.add_style_class_name("container-name-label");
        const actions = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: "container-action-bar"
        });
        actions.actor.set_x_expand(true);
        actions.actor.set_x_align(Clutter.ActorAlign.END);
        // this.insert_child_at_index(actions, 2);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const deleteBtn = createActionButton(
            () => new RemoveDialog("image", image.RepoTags[0], () => PodmanApi.request(`images/${image.Id}`, "DELETE")).open(1, true),
            "user-trash-symbolic");
        this.insert_child_at_index(deleteBtn, 4);

        let data = [];
        data.push(`Size: ${formatBytes(image.Size)}`);
        data.push(`Containers: ${image.Containers}`);
        if (image.Lables != null) {
            data.push(image.Labels);
        }
        if (image.RepoTags.length > 0) {
            data.push(`Repo tags:\n\t${image.RepoTags.join("\n\t")}`);
        }
        const info = new PopupMenu.PopupMenuItem(data.join("\n"));
        info.add_style_class_name("container-info");
        this.menu.addMenuItem(info);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }
}

export class VolumeSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(volume, settings) {
        super(volume.Name);
        this.menu.box.add_style_class_name("container-menu-item");
        const label = new St.Label({ text: volume.Name });
        label.add_style_class_name("container-name-label");
        const actions = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: "container-action-bar" });
        actions.actor.set_x_expand(true);
        actions.actor.set_x_align(Clutter.ActorAlign.END);
        // this.insert_child_at_index(actions, 2);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const deleteBtn = createActionButton(
            () => new RemoveDialog("volume", volume.Name, () => PodmanApi.request(`volumes/${volume.Name}`, "DELETE")).open(1, true),
            "user-trash-symbolic");
        this.insert_child_at_index(deleteBtn, 4);

        const info = new PopupMenu.PopupMenuItem([
            `UID: ${volume.UID}`,
            `GID: ${volume.GID}`,
            `Labels: ${volume.Labels}`,
            `Mount point: ${volume.Mountpoint}`,
        ].join("\n"));
        info.add_style_class_name("container-info");
        this.menu.addMenuItem(info);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }
}

export class NetworkSubMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(network, settings) {
        super(network.name);
        this.menu.box.add_style_class_name("container-menu-item");
        const label = new St.Label({ text: network.name });
        label.add_style_class_name("container-name-label");
        const actions = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, style_class: "container-action-bar" });
        actions.actor.set_x_expand(true);
        actions.actor.set_x_align(Clutter.ActorAlign.END);
        // this.insert_child_at_index(actions, 2);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const deleteBtn = createActionButton(
            () => new RemoveDialog("network", network.name, () => PodmanApi.request(`networks/${network.Id}`, "DELETE")).open(1, true),
            "user-trash-symbolic");
        this.insert_child_at_index(deleteBtn, 4);

        const info = new PopupMenu.PopupMenuItem([
            `Driver: ${network.driver}`,
            `Interface: ${network.network_interface}`,
            `Subnets: ${network.Subnets}`,
        ].join("\n"));
        info.add_style_class_name("container-info");
        this.menu.addMenuItem(info);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }
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

class RemoveDialog extends ModalDialog.ModalDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(entityType, entityName, removeFunc) {
        super();
        const content = new Dialog.MessageDialogContent({
            title: `Remove ${entityType}`,
            description: `Are you sure you want to remove ${entityType} ${entityName}?`,
        });
        this.contentLayout.add_child(content);
        this.addButton({
            action: () => this.close(),
            label: "Cancel",
            key: Clutter.KEY_Escapse,
        });
        this.addButton({
            action: () => {
                this.close();
                removeFunc()
            },
            label: "Remove",
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
    return new St.Icon({ icon_name: name, style_class: `${styleClass} popup-menu-icon` });
}

