import type ATOZVER6Plugin from '../main';
import { App, Notice, SuggestModal, parseYaml, TFile } from 'obsidian';
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
    	const allowed = new Set([...Object.keys(this.plugin.settings.userproperties), 'base', 'uploadtime']);
        const requiredKeys = Object.keys(this.plugin.settings.userproperties);
        const files = this.plugin.app.vault.getMarkdownFiles();

        const excluded = new Set([
            'log.md',
            this.plugin.settings.workFilePath,
            this.plugin.settings.laterFilePath,
            this.plugin.settings.taskFilePath,
            this.plugin.settings.ordinaryFilePath,
        ]);
    
        let cleanedCount = 0;
        let reviewCount = 0;
        const missingKeyFiles: string[] = [];
    
        for (const file of files) {
            if (excluded.has(file.path)) continue;
    
            const toReview: string[] = [];
    
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                for (const [key, value] of Object.entries(frontmatter)) {
                    if (allowed.has(key)) continue;
    
                    const isEmpty =
                        value === null ||
                        value === undefined ||
                        value === '' ||
                        (Array.isArray(value) && value.length === 0);
    
                    if (isEmpty) {
                        delete frontmatter[key];
                        cleanedCount++;
                    } else {
                        toReview.push(key);
                    }
                }
    
                for (const key of requiredKeys) {
                    if (frontmatter[key] === undefined) {
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
                .map((path, i) => {
                    const name = path.replace(/\.md$/, '');
                    return `${i + 1}. [[${name}]]`;
                })
                .join('\n');
    
            const { vault } = this.plugin.app;
            const existing = vault.getAbstractFileByPath('log.md');
            if (existing instanceof TFile) {
                await vault.modify(existing, logContent);
            } else {
                await vault.create('log.md', logContent);
            }
        }
    
        if (cleanedCount === 0 && reviewCount === 0 && missingKeyFiles.length === 0) {
            new Notice('정리할 속성이 없습니다.');
        } else {
            new Notice(`${cleanedCount}개 속성 정리, ${reviewCount}개 파일 확인 필요, ${missingKeyFiles.length}개 파일 누락 속성 기록.`);
        }
    }

    async insertProperties(initialItems: string[] = []): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성화된 파일이 없습니다.');
            return;
        }

        const today = this.buildTodayBase();

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
                frontmatter['base'] = [...today, ...initialItems];
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
        const done = '✓ 완료';
    
        if (!trimmed) {
            return [done];
        }
    
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
