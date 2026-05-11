import { App, Notice, SuggestModal, moment } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { DATE_PATTERN, sortBase } from '../utils';

type FrontmatterRecord = Record<string, unknown>;

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sortFrontmatterKeys(fm: FrontmatterRecord): void {
    const sortedKeys = Object.keys(fm).sort((a, b) => a.localeCompare(b));
    const sortedValues: FrontmatterRecord = {};
    for (const key of sortedKeys) {
        sortedValues[key] = fm[key];
    }

    for (const key of Object.keys(fm)) delete fm[key];
    for (const key of sortedKeys) {
        fm[key] = sortedValues[key];
    }
}

export class BaseFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    private buildTodayBase(): string[] {
        const today = moment();
        return [
            `${today.format('YYYY')}\uB144`,
            `${today.format('M')}\uC6D4`,
            `${today.format('D')}\uC77C`,
        ];
    }

    async insertBaseProperties(initialItems: string[] = []): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성 파일이 없습니다.');
            return;
        }

        const today = this.buildTodayBase();

        await this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;

            if (fm.base === undefined) {
                fm.base = [...today, ...initialItems];
            }

            const base = readStringArray(fm.base);
            if (base.length > 0 || Array.isArray(fm.base)) {
                sortBase(base);
                fm.base = base;
            }

            sortFrontmatterKeys(fm);
        });

        new BaseInputModal(this.plugin.app, this.plugin.baseCandidates).open();
    }
}

const NEW_ITEM_PREFIX = "+ '";
const NEW_ITEM_SUFFIX = "' 추가";
const DONE_LABEL = '완료';
const SELECTED_PREFIX = '[선택됨] ';

export class BaseInputModal extends SuggestModal<string> {
    private currentBase: string[];

    constructor(
        app: App,
        private candidates: string[],
        initialBase?: string[],
    ) {
        super(app);
        this.currentBase = initialBase ?? this.fetchInitialBase();
        this.setPlaceholder('기준 항목 추가');
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
            : `${NEW_ITEM_PREFIX}${trimmed}${NEW_ITEM_SUFFIX}`;

        const mappedFiltered = filtered.map((candidate) =>
            this.currentBase.includes(candidate) ? `${SELECTED_PREFIX}${candidate}` : candidate,
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
        const isDone = value.startsWith(SELECTED_PREFIX);
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const cleaned = isDone ? value.slice(SELECTED_PREFIX.length) : value;
        const item = isNew ? cleaned.slice(NEW_ITEM_PREFIX.length, -NEW_ITEM_SUFFIX.length) : cleaned;

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
            new Notice(`이미 기준에 있습니다: ${item}`);
            return;
        }

        if (!this.candidates.includes(item)) {
            this.candidates.push(item);
        }
        new Notice(`기준에 추가했습니다: ${item}`);
    }

    private async removeFromBase(item: string): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;
            const base = readStringArray(fm.base);
            fm.base = base.filter((value) => value !== item);
        });

        new Notice(`기준에서 제거했습니다: ${item}`);
    }
}
