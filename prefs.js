'use strict';

const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


// Like `extension.js` this is used for any one-time setup like translations.
function init() {
    log(`initializing ${Me.metadata.name} Preferences`);
}


// This function is called when the preferences window is first created to build
// and return a Gtk widget. As an example we'll create and return a GtkLabel.
function buildPrefsWidget() {
    // Copy the same GSettings code from `extension.js`
    this.settings = ExtensionUtils.getSettings(
        'org.gnome.shell.extensions.containers');

    // Create a parent widget that we'll return from this function
    let prefsWidget = new Gtk.Grid({
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });

    // Add a simple title and add it to the prefsWidget
    let title = new Gtk.Label({
        label: `<b>${Me.metadata.name} Preferences</b>`,
        halign: Gtk.Align.START,
        use_markup: true,
        visible: true
    });
    prefsWidget.attach(title, 0, 0, 2, 1);

    // Create a label & switch for `enable-debug-logs`
    let toggleLabel = new Gtk.Label({
        label: 'Enable debug logs:',
        halign: Gtk.Align.START,
        visible: true
    });
    prefsWidget.attach(toggleLabel, 0, 1, 1, 1);

    let toggle = new Gtk.Switch({
        active: this.settings.get_boolean ('enable-debug-logs'),
        halign: Gtk.Align.END,
        visible: true
    });
    prefsWidget.attach(toggle, 1, 1, 1, 1);

    // Bind the switch to the `enable-debug-logs` key
    this.settings.bind(
        'enable-debug-logs',
        toggle,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    return prefsWidget;
}

