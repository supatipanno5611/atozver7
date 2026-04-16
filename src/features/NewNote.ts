import type ATOZVER6Plugin from '../main';
import { App, MarkdownView, Notice, SuggestModal, normalizePath, prepareFuzzySearch } from 'obsidian';

export class NewNoteFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    open() {
        const existingNumbers: Record<string, Set<number>> = {};
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            const match = file.basename.match(/^(.+)-(\d+)$/);
            if (!match) continue;
            const set = '.' + (match[1] ?? '');
            const n = parseInt(match[2] ?? '0', 10);
            if (!existingNumbers[set]) existingNumbers[set] = new Set();
            existingNumbers[set]!.add(n);
        }

        new NewNoteModal(
            this.plugin.app,
            this.plugin.settings.sets,
            this.plugin.settings.recentSets,
            existingNumbers,
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

            if (!this.plugin.baseCandidates.includes(set)) {
                this.plugin.baseCandidates.push(set);
            }
            if (!this.plugin.settings.sets.includes(set)) {
                this.plugin.settings.sets.push(set);
            }

            // recentSets 업데이트: 앞에 추가, 중복 제거, 3개로 자르기
            this.plugin.settings.recentSets = [
                set,
                ...this.plugin.settings.recentSets.filter(s => s !== set)
            ].slice(0, 3);

            await this.plugin.saveSettings();

        } catch (error) {
            new Notice('새 노트 생성 중 오류가 발생했습니다.');
        }
    }
}

class NewNoteModal extends SuggestModal<string> {
    private sets: string[];
    private recentSets: string[];
    private existingNumbers: Record<string, Set<number>>;
    private onSubmit: (filename: string, set: string) => void;

    constructor(
        app: App,
        sets: string[],
        recentSets: string[],
        existingNumbers: Record<string, Set<number>>,
        onSubmit: (filename: string, set: string) => void
    ) {
        super(app);
        this.sets = sets;
        this.recentSets = recentSets;
        this.existingNumbers = existingNumbers;
        this.onSubmit = onSubmit;
        this.setPlaceholder('set을 선택하세요.');
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();

        if (!trimmed) {
            return this.recentSets
                .filter(s => this.sets.includes(s))
                .map(set => this.toCandidate(set));
        }

        if (trimmed === '.') {
            return this.sets.map(set => this.toCandidate(set));
        }

        if (!trimmed.startsWith('.')) {
            return [];
        }

        const fuzzy = prepareFuzzySearch(trimmed.toLowerCase());
        const matched = this.sets.filter(s => fuzzy(s.toLowerCase()));

        const newItem = !this.sets.includes(trimmed)
            ? `+ '${trimmed}' 새 set`
            : null;

        const matchedCandidates = matched.map(set => this.toCandidate(set));

        return matched.length === 1
            ? [...matchedCandidates, ...(newItem ? [newItem] : [])]
            : [...(newItem ? [newItem] : []), ...matchedCandidates];
    }

    private toCandidate(set: string): string {
        const name = set.startsWith('.') ? set.slice(1) : set;
        const existing = this.existingNumbers[set] ?? new Set();
        let n = 1;
        while (existing.has(n)) n++;
        return `${name}-${n}`;
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    onChooseSuggestion(value: string) {
        if (value.startsWith("+ '")) {
            const trimmed = this.inputEl.value.trim();
            const name = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
            this.onSubmit(`${name}-1`, trimmed);
            return;
        }
        const match = value.match(/^(.+)-(\d+)$/);
        if (!match) return;
        const name = match[1] ?? value;
        const set = '.' + name;
        this.onSubmit(value, set);
    }
}
