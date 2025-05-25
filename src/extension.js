"use strict";

import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { ContainerSubMenuItem, PodSubMenuItem, ImageSubMenuItem, VolumeSubMenuItem, NetworkSubMenuItem } from "./modules/ui.js";
import * as Podman from "./modules/podman.js";
import * as PodmanApi from "./modules/podman-socket-api.js";

export default class ContainersExtension extends Extension {
    /**
     * enable is the entry point called by gnome-shell
     */
    async enable() {
        console.log(`enabling ${this.uuid} extension`);
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this.menu = this._indicator.menu;
        this._settings = this.getSettings();

        this._indicator.menu.box.add_style_class_name("containers-extension-menu");
        const hbox = new St.BoxLayout({ style_class: "panel-status-menu-box" });
        const ext = Extension.lookupByUUID("containers@royg");
        const gicon = Gio.icon_new_for_string(`${ext.path}/podman-icon.png`);
        const icon = new St.Icon({ gicon, icon_size: "24" });
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
        await this._renderMenu();
    }


    /**
     * disable is called when the main extension menu is closed
     */
    async disable() {
        console.log("disabling containers extension");
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
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
            await out.close_async(0, null, () => { });
            await this.podmanListenCmd.force_exit();
            console.debug(`podman events process status ${this.podmanListenCmd.get_status()}`);
        } catch (e) {
            console.error(`cleaning up podman events subprocess failed ${e}`);
        }
    }

    async _renderMenu() {
        this.menu.removeAll();
        const prefs = new PopupMenu.PopupMenuItem("Preferences");
        prefs.connect("activate", () => this.openPreferences());
        this.menu.addMenuItem(prefs);

        if (!PodmanApi.isPodmanSocketActive()) {
            const activatePodmanSocket = new PopupMenu.PopupMenuItem("Activate Podman User Socket")
            activatePodmanSocket.connect("activate", () => {
                Podman.spawnCommandline("systemctl --user enable --now podman.socket");
                Main.notify("Gnome Shell Extension Containers started user podman.socket");
            });
            this.menu.addMenuItem(activatePodmanSocket);
            return;
        }
        await Podman.init();
        prefs.connect("activate", () => this.openPreferences());

        this.entitiesButtonSections = new PopupMenu.PopupMenuSection();
        this.entitiesButtonSections.actor.add_style_class_name('entities-buttons');
        this.entitiesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.entitiesButtonSections);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.entitiesSection);
        await this.addRadioButtonsToMenu();
    }

    async renderContainersMenu() {
        this.entitiesSection.removeAll();
        const pruneContainers = new PopupMenu.PopupMenuItem("Prune Containers");
        pruneContainers.connect("activate",
            () => Podman.spawnCommandline("podman container prune -f"));
        this.entitiesSection.addMenuItem(pruneContainers);
        const newContainer = new PopupMenu.PopupMenuItem("New Fedora rawhide Container");
        newContainer.connect("activate",
            () => Podman.spawnCommandline("podman run -di registry.fedoraproject.org/fedora-minimal:rawhide /bin/bash"));
        this.entitiesSection.addMenuItem(newContainer);
        this.entitiesSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        try {
            const containers = await Podman.getContainers(this._settings);
            console.debug(`found ${containers.length} containers`);
            if (containers.length > 0) {
                containers.forEach(container => {
                    console.debug(container.toString());
                    this.entitiesSection.addMenuItem(new ContainerSubMenuItem(container, { extraInfo: this._settings.get_boolean("extra-info") }));
                });
            } else {
                this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem("No containers found"));
            }
        } catch (err) {
            this.entitiesSection.removeAll();
            const errMsg = `Error occurred when fetching containers ${err}`;
            this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            console.error(`${errMsg}: ${err}`);
        }
    }

    async renderPodsMenu() {
        this.entitiesSection.removeAll();
        try {
            const pods = await PodmanApi.request('pods/json');
            console.debug(`found ${pods.length} pods`);

            if (pods.length > 0) {
                pods.forEach(p => {
                    console.debug(p);
                    console.debug(`setting ${this._settings}`);
                    this.entitiesSection.addMenuItem(
                        new PodSubMenuItem(new Podman.Pod(p, this._settings)));
                });
            } else {
                this.entitiesSection.addMenuItem(
                    new PopupMenu.PopupMenuItem("No pods found"));
            }
        } catch (err) {
            this.entitiesSection.removeAll();
            const errMsg = `Error occurred when fetching pods ${err}`;
            this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            console.error(`${errMsg}: ${err}`);
        }
    }

    async renderImagesMenu() {
        this.entitiesSection.removeAll();
        const pruneImages = new PopupMenu.PopupMenuItem("Prune Images");
        pruneImages.connect("activate",
            () => PodmanApi.request("images/prune", "POST"));
        this.entitiesSection.addMenuItem(pruneImages);
        this.entitiesSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        try {
            const images = await PodmanApi.request('images/json?dangling=false');
            console.debug(`found ${images.length} images`);

            if (images.length > 0) {
                images.forEach(image => {
                    if (image.Dangling == true) { return; }
                    console.debug(`${image.Names}`);
                    this.entitiesSection.addMenuItem(new ImageSubMenuItem(image, this._settings));
                });
            } else {
                this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem("No images found"));
            }
        } catch (err) {
            this.entitiesSection.removeAll();
            const errMsg = `Error occurred when fetching images ${err}`;
            this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            console.error(`${errMsg}: ${err}`);
        }

    }

    async renderVolumesMenu() {
        this.entitiesSection.removeAll();
        try {
            const volumes = await PodmanApi.request('volumes/json');
            console.debug(`found ${volumes.length} volumes`);

            if (volumes.length > 0) {
                volumes.slice(0, 10).forEach(volume => {
                    console.debug(`${volume.Name}`);
                    this.entitiesSection.addMenuItem(new VolumeSubMenuItem(volume, this._settings));
                });
            } else {
                this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem("No volumes found"));
            }
        } catch (err) {
            this.entitiesSection.removeAll();
            const errMsg = `Error occurred when fetching volumes ${err}`;
            this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            console.error(`${errMsg}: ${err}`);
        }

    }

    async renderNetworksMenu() {
        this.entitiesSection.removeAll();
        try {
            const networks = await PodmanApi.request('networks/json');
            console.debug(`found ${networks.length} networks`);

            if (networks.length > 0) {
                networks.slice(0, 10).forEach(network => {
                    console.debug(`${network.Name}`);
                    this.entitiesSection.addMenuItem(new NetworkSubMenuItem(network, this._settings));
                });
            } else {
                this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem("No networks found"));
            }
        } catch (err) {
            this.entitiesSection.removeAll();
            const errMsg = `Error occurred when fetching networks ${err}`;
            this.entitiesSection.addMenuItem(new PopupMenu.PopupMenuItem(errMsg));
            console.error(`${errMsg}: ${err}`);
        }

    }

    async addRadioButtonsToMenu() {
        this.entitiesButtonSections.addMenuItem(new PopupMenu.PopupMenuItem(""));
        this._radioItems = [];
        const radioOptions = ['Containers', 'Pods', 'Images', 'Volumes', 'Networks'];
        radioOptions.forEach(option => {
            let button = new St.Button({
                label: `${option}`,
                style_class: 'popup-menu-item'
            });

            this.entitiesButtonSections.box.get_children().at(0).insert_child_at_index(button, -1);
            this._radioItems.push(button);

            if (option == this._activeRadioChoice) {
                button.checked = true;
                button.set_style("background-color: -st-accent-color;");
            } else {
                button.checked = false;
            }

            button.connect('event', (_, event) => {
                if (event.type() == Clutter.EventType.BUTTON_RELEASE) {
                    this.onRadioOptionSelected(option);
                    return false;
                }
                return Clutter.EVENT_PROPOGATE;
            });
            button.connect('notify::checked', () => {
                if (button.get_checked()) {
                    button.set_style("background-color: -st-accent-color;");
                } else {
                    button.set_style('popup-menu-item');
                }
            });
        });
        await this.onRadioOptionSelected('Containers');
    }

    async onRadioOptionSelected(selectedOption) {
        console.log(`activerRadio choice ${this._activeRadioChoice}`);
        console.log(`selected option ${selectedOption}`);

        //if (this._activeRadioChoice === selectedOption) {
        //   return;
        //}
        this._activeRadioChoice = selectedOption;

        this._radioItems.forEach(button => {
            if (button.label == selectedOption) {
                button.checked = true;
            } else {
                button.checked = false;
            }
        });

        console.log(`Radio option selected: ${selectedOption}`);
        switch (selectedOption) {
            case "Containers":
                await this.renderContainersMenu()
                break;
            case "Pods":
                await this.renderPodsMenu()
                break;
            case "Images":
                await this.renderImagesMenu()
                break;
            case "Volumes":
                await this.renderVolumesMenu()
                break;
            case "Networks":
                await this.renderNetworksMenu()
                break;
            default:
                console.log('nothing to render');
                break;
        }
    }
}

