import type ATOZVER6Plugin from '../main';
import { App, Notice, SuggestModal, parseYaml } from 'obsidian';
import { moment } from 'obsidian';
import { DATE_PATTERN, sortBase } from '../utils';

export class PropertiesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    private buildTodayBase(): string[] {
        const m = moment();
        return [
            m.format('YYYY년'),
            m.format('M월'),
            m.format('D일'),
        ];
    }

    async lintProperties(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return;

        const allowed = new Set([...Object.keys(this.plugin.settings.userproperties), 'base']);
        const toReview: string[] = [];

        await this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            for (const [key, value] of Object.entries(frontmatter)) {
                if (allowed.has(key)) continue;

                const isEmpty =
                    value === null ||
                    value === undefined ||
                    value === '' ||
                    (Array.isArray(value) && value.length === 0);

                if (isEmpty) {
                    delete frontmatter[key];
                } else {
                    toReview.push(key);
                }
            }
        });

        if (toReview.length > 0) {
            const leaf = this.plugin.app.workspace.getLeaf('tab');
            await leaf.openFile(activeFile);
            new Notice(`확인 필요한 속성: ${toReview.join(', ')}`);
        } else {
            new Notice('속성 정리 완료.');
        }
    }

    async insertProperties(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성화된 파일이 없습니다.');
            return;
        }

        await this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            for (const [key, yamlValue] of Object.entries(this.plugin.settings.userproperties)) {
                if (frontmatter[key] === undefined) {
                    try {
                        frontmatter[key] = parseYaml(yamlValue.trim());
                    } catch {
                        frontmatter[key] = yamlValue;
                    }
                }
            }

            if (frontmatter['base'] === undefined) {
                frontmatter['base'] = this.buildTodayBase();
            }
            if (Array.isArray(frontmatter['base'])) {
                sortBase(frontmatter['base']);
            }

            const sortedEntries = Object.entries(frontmatter).sort(([a], [b]) => a.localeCompare(b));
            Object.keys(frontmatter).forEach(key => delete frontmatter[key]);
            for (const [k, v] of sortedEntries) {
                frontmatter[k] = v;
            }
        });

        new BaseInputModal(this.plugin.app, this.plugin.baseCandidates).open();
    }
}

const NEW_ITEM_PREFIX = "+ '";

export class BaseInputModal extends SuggestModal<string> {
    private candidates: string[];
    private currentBase: string[];

    constructor(app: App, candidates: string[], initialBase?: string[]) {
        super(app);
        this.candidates = candidates;
        this.currentBase = initialBase ?? this.fetchInitialBase();
        this.setPlaceholder('base에 추가할 항목을 입력하세요.');
    }

    private fetchInitialBase(): string[] {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return [];
        const cache = this.app.metadataCache.getFileCache(activeFile);
        const base = cache?.frontmatter?.['base'];
        return Array.isArray(base) ? [...base] : [];
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();

        const filtered = this.candidates.filter(c =>
            !DATE_PATTERN.test(c) &&
            c.toLowerCase().includes(trimmed.toLowerCase())
        );

        const newItem = (trimmed && !this.candidates.includes(trimmed))
            ? `${NEW_ITEM_PREFIX}${trimmed}' 추가`
            : null;

        const mappedFiltered = filtered.map(c =>
            this.currentBase.includes(c) ? `[done] ${c}` : c
        );
        const done = '✓ 완료';

        return filtered.length === 1
            ? [...mappedFiltered, ...(newItem ? [newItem] : []), done]
            : [...(newItem ? [newItem] : []), done, ...mappedFiltered];
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    async onChooseSuggestion(value: string) {
        if (value === '✓ 완료') return;

        const isDone = value.startsWith('[done] ');
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const cleaned = isDone ? value.slice(7) : value;
        const item = isNew
            ? cleaned.slice(NEW_ITEM_PREFIX.length, -4)
            : cleaned;

        if (isDone) {
            await this.removeFromBase(item);
            this.currentBase = this.currentBase.filter(c => c !== item);
        } else {
            await this.addToBase(item);
            if (!this.currentBase.includes(item)) {
                this.currentBase.push(item);
                sortBase(this.currentBase);
            }
        }

        new BaseInputModal(this.app, this.candidates, this.currentBase).open();
    }

    private async addToBase(item: string) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        let alreadyExists = false;
        await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const base = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
            if (base.includes(item)) {
                alreadyExists = true;
                return;
            }
            base.push(item);
            sortBase(base);
            frontmatter['base'] = base;
        });

        if (alreadyExists) {
            new Notice(`이미 존재하는 항목입니다: ${item}`);
            return;
        }

        if (!this.candidates.includes(item)) {
            this.candidates.push(item);
        }
        new Notice(`base에 추가됨: ${item}`);
    }

    private async removeFromBase(item: string) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const base = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
            frontmatter['base'] = base.filter(v => v !== item);
        });

        new Notice(`base에서 제거됨: ${item}`);
    }
}
