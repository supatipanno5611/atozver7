import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ATOZVER6Plugin from './main';
import { DEFAULT_SETTINGS } from './types';

type JsonSettingKey = 'userproperties' | 'symbols' | 'symbolPairs';
type NumberSettingKey = 'snippetLimit' | 'symbolLimit';

export class ATOZSettingTab extends PluginSettingTab {
    plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Certain Markdown').setHeading();
        new Setting(containerEl)
            .setName('Certain Markdown path')
            .setDesc('Vault-relative path opened by the "Open certain Markdown file" command. Example: index.md or folder/note.md.')
            .addText((t) => t
                .setPlaceholder('Example: index.md')
                .setValue(this.plugin.settings.CertainMdPath)
                .onChange(async (v) => {
                    this.plugin.settings.CertainMdPath = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Cursor center').setHeading();
        new Setting(containerEl)
            .setName('Enable cursor center')
            .setDesc('Keeps the cursor near the center while editing.')
            .addToggle((t) => t
                .setValue(this.plugin.settings.isCursorCenterEnabled)
                .onChange(async (v) => {
                    this.plugin.settings.isCursorCenterEnabled = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Properties').setHeading();
        this.addJsonSetting(
            containerEl,
            'Default user properties',
            'JSON object used when inserting frontmatter properties.',
            'userproperties',
        );

        new Setting(containerEl).setName('Project').setHeading();
        new Setting(containerEl)
            .setName('Project folder path')
            .setDesc('Vault-relative folder path used by project commands. Example: _publish.')
            .addText((t) => t
                .setPlaceholder('_publish')
                .setValue(this.plugin.settings.projectPath)
                .onChange(async (v) => {
                    this.plugin.settings.projectPath = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Snippets').setHeading();
        new Setting(containerEl)
            .setName('Snippet trigger')
            .setDesc('Typing this character opens snippet suggestions.')
            .addText((t) => t
                .setPlaceholder('@')
                .setValue(this.plugin.settings.snippetTrigger)
                .onChange(async (v) => {
                    this.plugin.settings.snippetTrigger = v;
                    await this.plugin.saveSettings();
                }));

        this.addNumberSetting(containerEl, 'Snippet limit', 'Maximum number of snippet suggestions to show.', 'snippetLimit');
        this.addLineListSetting(containerEl, 'Snippets list', 'One snippet per line.', 'snippets');

        new Setting(containerEl).setName('Symbols').setHeading();
        new Setting(containerEl)
            .setName('Symbol trigger')
            .setDesc('Typing this character opens symbol suggestions.')
            .addText((t) => t
                .setPlaceholder('~')
                .setValue(this.plugin.settings.symbolTrigger)
                .onChange(async (v) => {
                    this.plugin.settings.symbolTrigger = v;
                    await this.plugin.saveSettings();
                }));

        this.addNumberSetting(containerEl, 'Symbol limit', 'Maximum number of symbol suggestions to show.', 'symbolLimit');
        this.addJsonSetting(containerEl, 'Symbols list', 'JSON array of symbol suggestion items.', 'symbols');
        this.addJsonSetting(containerEl, 'Symbol pairs', 'JSON object used by smart backspace pair removal.', 'symbolPairs');

        new Setting(containerEl).setName('Work and later notes').setHeading();
        new Setting(containerEl)
            .setName('Work file path')
            .setDesc('Vault-relative path used by the work note commands.')
            .addText((t) => t
                .setPlaceholder('Example: work.md')
                .setValue(this.plugin.settings.workFilePath)
                .onChange(async (v) => {
                    this.plugin.settings.workFilePath = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Later file path')
            .setDesc('Vault-relative path used for work note backups.')
            .addText((t) => t
                .setPlaceholder('Example: later.md')
                .setValue(this.plugin.settings.laterFilePath)
                .onChange(async (v) => {
                    this.plugin.settings.laterFilePath = v.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Work timestamp format')
            .setDesc('Moment.js format used when appending work note backups.')
            .addText((t) => t
                .setPlaceholder('Enter a timestamp format')
                .setValue(this.plugin.settings.workTimestampFormat)
                .onChange(async (v) => {
                    this.plugin.settings.workTimestampFormat = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Reset').setHeading();
        new Setting(containerEl)
            .setName('Reset all settings')
            .setDesc('Restores all plugin settings to their defaults.')
            .addButton((btn) => btn
                .setButtonText('Reset')
                .setWarning()
                .onClick(() => {
                    void this.resetSettings();
                }));
    }

    private async resetSettings(): Promise<void> {
        this.plugin.settings = structuredClone(DEFAULT_SETTINGS);
        await this.plugin.saveSettings();
        new Notice('Settings reset to defaults.');
        this.display();
    }

    private addNumberSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: NumberSettingKey,
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((t) => {
                t.inputEl.type = 'number';
                t.setValue(String(this.plugin.settings[key]))
                    .onChange(async (v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        this.plugin.settings[key] = Math.floor(n);
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addLineListSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: 'snippets',
    ): void {
        const setting = new Setting(containerEl).setName(name).setDesc(desc);
        setting.settingEl.addClass('atoz-setting-vertical');
        const initial = this.plugin.settings[key].join('\n');

        setting.addTextArea((ta) => {
            ta.inputEl.addClass('atoz-setting-textarea');
            ta.setValue(initial);
            ta.inputEl.addEventListener('blur', () => {
                void (async () => {
                    this.plugin.settings[key] = ta.getValue().split('\n').filter((line) => line.length > 0);
                    await this.plugin.saveSettings();
                })();
            });
        });
    }

    private addJsonSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: JsonSettingKey,
    ): void {
        const setting = new Setting(containerEl).setName(name).setDesc(desc);
        setting.settingEl.addClass('atoz-setting-vertical');
        const initial = JSON.stringify(this.plugin.settings[key], null, 2);
        const errorEl = setting.settingEl.createDiv({ cls: 'atoz-setting-error' });

        setting.addTextArea((ta) => {
            ta.inputEl.addClass('atoz-setting-textarea');
            ta.setValue(initial);
            ta.inputEl.addEventListener('blur', () => {
                void (async () => {
                    try {
                        this.updateJsonSetting(key, JSON.parse(ta.getValue()));
                        await this.plugin.saveSettings();
                        errorEl.setText('');
                    } catch {
                        errorEl.setText('Invalid JSON. Changes were not saved.');
                    }
                })();
            });
        });
    }

    private updateJsonSetting(key: JsonSettingKey, value: unknown): void {
        if (key === 'userproperties' && this.isStringRecord(value)) {
            this.plugin.settings.userproperties = value;
            return;
        }

        if (key === 'symbolPairs' && this.isStringRecord(value)) {
            this.plugin.settings.symbolPairs = value;
            return;
        }

        if (key === 'symbols' && Array.isArray(value)) {
            this.plugin.settings.symbols = value
                .filter((item): item is { id: unknown; symbol: unknown; closing?: unknown } => typeof item === 'object' && item !== null)
                .map((item) => ({
                    id: typeof item.id === 'string' ? item.id : '',
                    symbol: typeof item.symbol === 'string' ? item.symbol : '',
                    ...(typeof item.closing === 'string' ? { closing: item.closing } : {}),
                }));
            return;
        }

        throw new Error('Invalid JSON shape');
    }

    private isStringRecord(value: unknown): value is Record<string, string> {
        return typeof value === 'object' && value !== null && !Array.isArray(value) &&
            Object.values(value).every((entry) => typeof entry === 'string');
    }
}
