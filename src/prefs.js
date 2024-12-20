import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import {ExtensionPreferences, gettext as _} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class ContainersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _("General"),
            icon_name: "dialog-information-symbolic",
        });
        window.add(page);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _("Appearance"),
            description: _("Configure the appearance of the extension"),
        });
        page.add(appearanceGroup);

        // extra info
        const extraInfoRow = new Adw.SwitchRow({
            title: _("Extra Info"),
            subtitle: _("Whether to show extra info of a container in name and the opened menu"),
        });
        appearanceGroup.add(extraInfoRow);
        window._settings.bind("extra-info", extraInfoRow, "active", Gio.SettingsBindFlags.DEFAULT);

        const sortBy = ["command", "created", "id", "image", "names", "runningfor", "size", "status"];
        const comboModel = new Gtk.StringList({strings: sortBy});
        const podListSortBy = new Adw.ComboRow({
            title: _("Pod list sort by column"),
            model: comboModel,
        });
        let initVal = window._settings.get_string("pod-list-sort-by");
        podListSortBy.set_selected(sortBy.indexOf(initVal));
        podListSortBy.connect("notify::selected-item", () => {
            let selectedItem = podListSortBy.get_selected_item();
            window._settings.set_string("pod-list-sort-by", selectedItem.get_string());
        });
        appearanceGroup.add(podListSortBy);


        const behaviourGroup = new Adw.PreferencesGroup({
            title: _("Behaviour"),
            description: _("Configure the behaviour of the extension"),
        });
        page.add(behaviourGroup);

        // terminal program
        const terminalRow = new Adw.EntryRow({
            title: _("Terminal program with arguments"),
            show_apply_button: true, // Allows user to apply the input
        });
        behaviourGroup.add(terminalRow);
        window._settings.bind("terminal", terminalRow, "text", Gio.SettingsBindFlags.DEFAULT);
    }
}

