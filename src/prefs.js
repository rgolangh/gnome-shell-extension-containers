import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class ContainersPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the extension'),
        });
        page.add(group);

        // Create a new preferences row
        const row = new Adw.SwitchRow({
            title: _('Extra Info'),
            subtitle: _('Whether to show extra info of a container in name and the opened menu'),
        });
        group.add(row);

        // Create a settings object and bind the row to the `extra-info` key
        window._settings = this.getSettings();
        window._settings.bind('extra-info', row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}
