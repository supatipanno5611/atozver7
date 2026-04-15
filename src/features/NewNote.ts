import type ATOZVER6Plugin from '../main';
import { App, MarkdownView, Notice, SuggestModal, normalizePath, prepareFuzzySearch } from 'obsidian';

export class NewNoteFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    open() {
        new NewNoteModal(
            this.plugin.app,
            this.plugin.settings.sets,
            (filename, set) => this.createNote(filename, set)
        ).open();
    }

    private async createNote(filename: string, set: string) {
        try {
            const path = normalizePath(`${filename}.md`);
            const newFile = await this.plugin.app.vault.create(path, '');

            let leaf = this.plugin.app.workspace.getLeaf(false);
            const isMainArea = leaf.view.containerEl.closest('.mod-root') !== null;
            if (!isMainArea) leaf = this.plugin.app.workspace.getLeaf('tab');
            await leaf.openFile(newFile);
            this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

            const view = leaf.view;
            if (view instanceof MarkdownView) {
                await this.plugin.properties.insertProperties([set]);
            }

            // 생성 완료 후 번호 갱신
            if (!this.plugin.baseCandidates.includes(set)) {
                this.plugin.baseCandidates.push(set);
            }
            const current = this.plugin.settings.sets[set] ?? 1;
            this.plugin.settings.sets[set] = current + 1;
            await this.plugin.saveSettings();

        } catch (error) {
            new Notice('새 노트 생성 중 오류가 발생했습니다.');
        }
    }

    async syncSets() {
        const sets = this.plugin.settings.sets;

        // vault 전체 순회해서 set별 실제 최고 번호 수집
        const actual: Record<string, number> = {};
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            const match = file.basename.match(/^(.+)-(\d+)$/);
            if (!match) continue;
            const set = match[1] ?? '';
            const n = parseInt(match[2] ?? '0', 10);
            actual[set] = Math.max(actual[set] ?? 0, n);
        }

        const changes: string[] = [];

        // 등록된 set 검증
        for (const set of Object.keys(sets)) {
            const stored = sets[set] ?? 1;
            const correctNext = (actual[set] ?? 0) + 1;
            if (stored !== correctNext) {
                changes.push(`${set}(${stored}→${correctNext})`);
                this.plugin.settings.sets[set] = correctNext;
            }
        }

        // vault에는 있지만 등록되지 않은 set 추가
        for (const [set, highest] of Object.entries(actual)) {
            if (!(set in sets)) {
                changes.push(`${set}(없음→${highest + 1})`);
                this.plugin.settings.sets[set] = highest + 1;
            }
        }

        await this.plugin.saveSettings();

        if (changes.length === 0) {
            new Notice('set 목록이 최신 상태입니다.');
        } else {
            new Notice(`${changes.length}개 항목이 동기화되었습니다: ${changes.join(', ')}`);
        }
    }
}

class NewNoteModal extends SuggestModal<string> {
    private sets: Record<string, number>;
    private onSubmit: (filename: string, set: string) => void;

    constructor(app: App, sets: Record<string, number>, onSubmit: (filename: string, set: string) => void) {
        super(app);
        this.sets = sets;
        this.onSubmit = onSubmit;
        this.setPlaceholder('set을 선택하세요.');
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();
        const setNames = Object.keys(this.sets);
    
        if (!trimmed) {
            return [];
        }
    
        const fuzzy = prepareFuzzySearch(trimmed.toLowerCase());
        const matched = setNames.filter(s => fuzzy(s.toLowerCase()));
    
        const newItem = !setNames.includes(trimmed)
            ? `+ '${trimmed}' 새 set`
            : null;
    
        const matchedCandidates = matched.map(set => this.toCandidate(set));
    
        return matched.length === 1
            ? [...matchedCandidates, ...(newItem ? [newItem] : [])]
            : [...(newItem ? [newItem] : []), ...matchedCandidates];
    }

    private toCandidate(set: string): string {
        const n = this.sets[set] ?? 1;
        return `${set}-${n}`;
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    onChooseSuggestion(value: string) {
        if (value.startsWith("+ '")) {
            const trimmed = this.inputEl.value.trim();
            this.onSubmit(`${trimmed}-1`, trimmed);
            return;
        }
        const match = value.match(/^(.+)-(\d+)$/);
        if (!match) return;
        const set = match[1] ?? value;
        this.onSubmit(value, set);
    }
}
