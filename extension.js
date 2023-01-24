/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'workmode-extension';

const { GObject, St, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const QuickSettings = imports.ui.quickSettings;
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const _ = ExtensionUtils.gettext;

const Me = ExtensionUtils.getCurrentExtension();
let Ext;

const FeatureMenuToggle = GObject.registerClass(
class FeatureMenuToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            label: Ext.currentModeLabel() + ' Mode',
            gicon: Ext.icon(Ext.mode),
            toggleMode: true,
        });
         this._settings = new Gio.Settings({
            schema_id: 'org.gnome.shell.extensions.workmode',
        });
        this._settings.bind('workmode-enabled',
            this, 'checked',
            Gio.SettingsBindFlags.DEFAULT);
        this.connect('button-press-event', () => Ext.checkEnabled());
        
        // This function is unique to this class. It adds a nice header with an
        // icon, title and optional subtitle. It's recommended you do so for
        // consistency with other menus.
        this.menu.setHeader(Ext.icon('logo'), 'Change Mode');
        
        // You may also add sections of items to the menu
        this._itemsSection = new PopupMenu.PopupMenuSection();
        for (let i in Ext.modes) {
            const modeLabel = Ext.modes[i].charAt(0).toUpperCase() + Ext.modes[i].substr(1);
            this._itemsSection.addAction(modeLabel, () => Ext.changeMode(Ext.modes[i]), Ext.icon(Ext.modes[i]));
        }
        this.menu.addMenuItem(this._itemsSection);

        // Add an entry-point for more settings
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = this.menu.addAction('Edit Modes',
            () => ExtensionUtils.openPrefs());
            
        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[Extension.uuid] = settingsItem;
    }
});

const FeatureIndicator = GObject.registerClass(
class FeatureIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();

        // Create the icon for the indicator
        this._indicator = this._addIndicator();
        this._indicator.gicon = Ext.icon(Ext.mode);

        // Create the toggle menu and associate it with the indicator, being
        // sure to destroy it along with the indicator
        this.quickSettingsItems.push(new FeatureMenuToggle());
        
        this.connect('destroy', () => {
            this.quickSettingsItems.forEach(item => item.destroy());
        });
        
        // Add the indicator to the panel and the toggle to the menu
        QuickSettingsMenu._indicators.add_child(this);
        QuickSettingsMenu._addItems(this.quickSettingsItems);
    }
    _displayMode(mode) {
        if (mode === 'default') {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
            }
        } else { 
            if (!this._indicator) this._indicator = this._addIndicator();
            this._indicator.gicon = Ext.icon(mode);
        }
        this.quickSettingsItems.forEach(item => {
            item.gicon = Ext.icon(Ext.mode);
            item.label = Ext.currentModeLabel() + ' Mode';
        });
    }
});

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        Ext = this;
        this._toggle = null;
        this.icons = {
            logo: Gio.icon_new_for_string(`${Me.path}/icons/logo.svg`),
            work: Gio.icon_new_for_string(`${Me.path}/icons/work.svg`),
            game: Gio.icon_new_for_string(`${Me.path}/icons/game.svg`),
            unknown: Gio.icon_new_for_string(`${Me.path}/icons/unknown.svg`),
            default: Gio.icon_new_for_string(`${Me.path}/icons/default.svg`)
        };
        this.modes = [
            'work',
            'game',
            'relax'
        ];
        this.mode = 'game';
        this.previousMode = 'work';

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }
    checkEnabled() {
        this._enabled = !this.settings.get_boolean('workmode-enabled');
        if (!this._enabled) this.updateMode('default', this.mode);
        else this.updateMode(this.mode, this.previousMode);
    }
    icon(mode) {
        return this.icons[mode] || this.icons.unknown;
    }
    currentModeLabel() {
        const mode = this.modes[this.modes.indexOf(this.mode)] || 'off'
        return mode.charAt(0).toUpperCase() + mode.substr(1)
    }
    changeTopColor(mode, previous) {
        Main.panel.remove_style_class_name('panel--mode-' + previous);
        Main.panel.add_style_class_name('panel--mode-' + mode);
    }
    changeIndecatorIcon() {
        if (this._indicator.icons[this.mode]) {
            this._indicator.icon.gicon = this._indicator.icons[this.mode];
        } else {
            this._indicator.icon.gicon = this._indicator.icons.unknown;
        }
    }
    changeBackground(mode) {
        const background = new Gio.Settings({schema: "org.gnome.desktop.background"}),
                path = "file://" + Me.path + '/wallpapers/' + mode + '.png';

        log(path)

        let set_prop = (prop) => {
            if (background.is_writable(prop)) {
                if (!background.set_string(prop, path)) {
                    log(`[WorkMode] Failed to write property ${prop}`)
                }
            } else {
                log(`[WorkMode] Property not writable ${prop}`)
            }
        }

        const keys = background.list_keys();

        let set_picture_uri = (prop = "picture-uri") => { if (keys.indexOf(prop) !== -1) set_prop(prop) }

        set_picture_uri()
        set_picture_uri('picture-uri-dark')
    }
    changeMode(mode, previous = this.mode, setMode = true) {
        this.previousMode = previous;
        this.mode = mode;
        this.modeNumber = this.modes.indexOf(mode);
        if (!this._enabled) this.updateMode('default', mode);
        else this.updateMode(mode, previous);
    }
    updateMode(mode, previous) {
        this.changeTopColor(mode, previous);
        this._toggle._displayMode(mode);
        this.changeBackground(mode);
    }
    enable() {
        this.settings = ExtensionUtils.getSettings(
            'org.gnome.shell.extensions.workmode');

        this._enabled = this.settings.get_boolean('workmode-enabled');

        this._toggle = new FeatureIndicator();
        // this._indicator = new Indicator();
        // Main.panel.addToStatusArea(this._uuid, this._indicator);
    }

    disable() {
        // this._indicator.destroy();
        // this._indicator = null;
        this._toggle.destroy();
        this._toggle = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
