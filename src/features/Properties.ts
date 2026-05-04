import { App, Notice, SuggestModal, TFile, moment, parseYaml } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { DATE_PATTERN, sortBase } from '../utils';

type FrontmatterRecord = Record<string, unknown>;

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export class PropertiesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    private buildTodayBase(): string[] {
        const today = moment();
        return [
            `${today.format('YYYY')}\uB144`,
            `${today.format('M')}\uC6D4`,
            `${today.format('D')}\uC77C`,
        ];
    }

    async lintProperties(): Promise<void> {
        const allowed = new Set([...Object.keys(this.plugin.settings.userproperties), 'base', 'uploadtime']);
        const requiredKeys = Object.keys(this.plugin.settings.userproperties);
        const files = this.plugin.app.vault.getMarkdownFiles();
        const excluded = new Set([
            'log.md',
            this.plugin.settings.workFilePath,
            this.plugin.settings.laterFilePath,
        ]);

        let cleanedCount = 0;
        let reviewCount = 0;
        const missingKeyFiles: string[] = [];

        for (const file of files) {
            if (excluded.has(file.path)) continue;

            const toReview: string[] = [];
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const fm = frontmatter as FrontmatterRecord;

                for (const [key, value] of Object.entries(fm)) {
                    if (allowed.has(key)) continue;

                    const isEmpty = value === null || value === undefined || value === '' ||
                        (Array.isArray(value) && value.length === 0);

                    if (isEmpty) {
                        delete fm[key];
                        cleanedCount++;
                    } else {
                        toReview.push(key);
                    }
                }

                for (const key of requiredKeys) {
                    if (fm[key] === undefined) {
                        missingKeyFiles.push(file.path);
                        return;
                    }
                }
            });

            if (toReview.length > 0) {
                const leaf = this.plugin.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
                reviewCount++;
            }
        }

        if (missingKeyFiles.length > 0) {
            const logContent = missingKeyFiles
                .map((path, index) => `${index + 1}. [[${path.replace(/\.md$/, '')}]]`)
                .join('\n');

            const existing = this.plugin.app.vault.getAbstractFileByPath('log.md');
            if (existing instanceof TFile) {
                await this.plugin.app.vault.modify(existing, logContent);
            } else {
                await this.plugin.app.vault.create('log.md', logContent);
            }
        }

        if (cleanedCount === 0 && reviewCount === 0 && missingKeyFiles.length === 0) {
            new Notice('No properties needed cleanup');
            return;
        }

        new Notice(`Cleaned ${cleanedCount}, review needed for ${reviewCount}, missing keys logged for ${missingKeyFiles.length} files`);
    }

    async insertProperties(initialItems: string[] = []): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        const today = this.buildTodayBase();

        await this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;

            for (const [key, yamlValue] of Object.entries(this.plugin.settings.userproperties)) {
                if (fm[key] !== undefined) continue;

                try {
                    const parsed: unknown = parseYaml(yamlValue.trim());
                    fm[key] = parsed;
                } catch {
                    fm[key] = yamlValue;
                }
            }

            if (fm.base === undefined) {
                fm.base = [...today, ...initialItems];
            }

            const base = readStringArray(fm.base);
            if (base.length > 0 || Array.isArray(fm.base)) {
                sortBase(base);
                fm.base = base;
            }

            const sortedEntries = Object.entries(fm).sort(([a], [b]) => a.localeCompare(b));
            for (const key of Object.keys(fm)) delete fm[key];
            for (const [key, value] of sortedEntries) {
                fm[key] = value;
            }
        });

        new BaseInputModal(this.plugin.app, this.plugin.baseCandidates).open();
    }
}

const NEW_ITEM_PREFIX = "+ '";
const DONE_LABEL = 'Done';

export class BaseInputModal extends SuggestModal<string> {
    private currentBase: string[];

    constructor(
        app: App,
        private candidates: string[],
        initialBase?: string[],
    ) {
        super(app);
        this.currentBase = initialBase ?? this.fetchInitialBase();
        this.setPlaceholder('Add a base item');
    }

    private fetchInitialBase(): string[] {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return [];

        const cache = this.app.metadataCache.getFileCache(activeFile);
        const frontmatter = cache?.frontmatter as FrontmatterRecord | undefined;
        return readStringArray(frontmatter?.base);
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();
        if (!trimmed) return [DONE_LABEL];

        const filtered = this.candidates.filter((candidate) =>
            !DATE_PATTERN.test(candidate) &&
            candidate.toLowerCase().includes(trimmed.toLowerCase()),
        );

        const newItem = this.candidates.includes(trimmed)
            ? null
            : `${NEW_ITEM_PREFIX}${trimmed}' add`;

        const mappedFiltered = filtered.map((candidate) =>
            this.currentBase.includes(candidate) ? `[done] ${candidate}` : candidate,
        );

        return filtered.length === 1
            ? [...mappedFiltered, ...(newItem ? [newItem] : []), DONE_LABEL]
            : [...(newItem ? [newItem] : []), DONE_LABEL, ...mappedFiltered];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    onChooseSuggestion(value: string): void {
        if (value === DONE_LABEL) return;
        void this.handleChoice(value);
    }

    private async handleChoice(value: string): Promise<void> {
        const isDone = value.startsWith('[done] ');
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const cleaned = isDone ? value.slice(7) : value;
        const item = isNew ? cleaned.slice(NEW_ITEM_PREFIX.length, -4) : cleaned;

        if (isDone) {
            await this.removeFromBase(item);
            this.currentBase = this.currentBase.filter((candidate) => candidate !== item);
        } else {
            await this.addToBase(item);
            if (!this.currentBase.includes(item)) {
                this.currentBase.push(item);
                sortBase(this.currentBase);
            }
        }

        new BaseInputModal(this.app, this.candidates, this.currentBase).open();
    }

    private async addToBase(item: string): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        let alreadyExists = false;
        await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;
            const base = readStringArray(fm.base);
            if (base.includes(item)) {
                alreadyExists = true;
                return;
            }

            base.push(item);
            sortBase(base);
            fm.base = base;
        });

        if (alreadyExists) {
            new Notice(`Already in base: ${item}`);
            return;
        }

        if (!this.candidates.includes(item)) {
            this.candidates.push(item);
        }
        new Notice(`Added to base: ${item}`);
    }

    private async removeFromBase(item: string): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;
            const base = readStringArray(fm.base);
            fm.base = base.filter((value) => value !== item);
        });

        new Notice(`Removed from base: ${item}`);
    }
}
