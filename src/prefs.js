import Gio from "gi://Gio";
import Adw from "gi://Adw";

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

        const extraInfoRow = new Adw.SwitchRow({
            title: _("Extra Info"),
            subtitle: _("Whether to show extra info of a container in name and the opened menu"),
        });
        appearanceGroup.add(extraInfoRow);
        window._settings.bind("extra-info", extraInfoRow, "active", Gio.SettingsBindFlags.DEFAULT);

        const behaviourGroup = new Adw.PreferencesGroup({
            title: _("Behaviour"),
            description: _("Configure the behaviour of the extension"),
        });
        page.add(behaviourGroup);

        const terminalRow = new Adw.EntryRow({
            title: _("Terminal program with arguments"),
            show_apply_button: true, // Allows user to apply the input
        });
        behaviourGroup.add(terminalRow);
        window._settings.bind("terminal", terminalRow, "text", Gio.SettingsBindFlags.DEFAULT);
    }
}

