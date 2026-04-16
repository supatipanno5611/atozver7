import type ATOZVER6Plugin from '../main';
import { App, SuggestModal, TFile, WorkspaceLeaf, MarkdownView, prepareFuzzySearch } from 'obsidian';
import { SwitcherItem } from '../types';
import { convertHangulToQwerty } from '../utils';

const SWITCHER_RECENT_WEIGHT = 0.0000001;
const SWITCHER_HISTORY_LIMIT = 16;

type ModalItem = SwitcherItem & { isNewNote?: boolean };

class TitleSwitcherModal extends SuggestModal<ModalItem> {
    private plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app);
        this.plugin = plugin;
    }

    getSuggestions(query: string): ModalItem[] {
        const isFileMode = query.startsWith(this.plugin.settings.switcherFilePrefix);
        const rawText = isFileMode ? query.slice(this.plugin.settings.switcherFilePrefix.length) : query;

        if (!rawText) {
            const candidates = isFileMode
                ? this.plugin.allFileCandidates
                : [...this.plugin.titleCandidates].map(([title, path]) => ({ display: title, path }));
            return candidates
                .map(c => ({ item: c, score: this.plugin.settings.recentSwitcher[c.path] ?? 0 }))
                .sort((a, b) => b.score - a.score)
                .map(r => r.item);
        }

        if (isFileMode) {
            const converted = convertHangulToQwerty(rawText).toLowerCase();
            const fuzzy = prepareFuzzySearch(converted);
            return this.plugin.allFileCandidates
                .flatMap(c => {
                    const result = fuzzy(c.display.toLowerCase());
                    if (!result) return [];
                    return [{ ...c, _score: result.score + (this.plugin.settings.recentSwitcher[c.path] ?? 0) * SWITCHER_RECENT_WEIGHT }];
                })
                .sort((a, b) => b._score - a._score)
                .map(({ _score: _, ...c }) => c);
        }

        // 타이틀 모드: 원본 쿼리와 QWERTY 변환 쿼리 둘 다 검색
        const fuzzyOriginal = prepareFuzzySearch(rawText.toLowerCase());
        const fuzzyQwerty = prepareFuzzySearch(convertHangulToQwerty(rawText).toLowerCase());

        const seen = new Set<string>();
        const results: Array<ModalItem & { _score: number }> = [];

        for (const [title, path] of this.plugin.titleCandidates) {
            const s = fuzzyOriginal(title.toLowerCase())?.score ?? -Infinity;
            if (s > -Infinity && !seen.has(path)) {
                seen.add(path);
                results.push({ display: title, path, _score: s });
            }
        }

        for (const [qwerty, path] of this.plugin.titleCandidatesQwerty) {
            const s = fuzzyQwerty(qwerty.toLowerCase())?.score ?? -Infinity;
            if (s > -Infinity && !seen.has(path)) {
                const title = [...this.plugin.titleCandidates].find(([, p]) => p === path)?.[0] ?? qwerty;
                seen.add(path);
                results.push({ display: title, path, _score: s });
            }
        }

        results.sort((a, b) => b._score - a._score);

        const items: ModalItem[] = results.map(({ _score: _, ...c }) => c);
        items.push({ display: `'${rawText}' 새 노트 만들기`, path: '', isNewNote: true });
        return items;
    }

    renderSuggestion(item: ModalItem, el: HTMLElement) {
        el.setText(item.display);
    }

    async onChooseSuggestion(item: ModalItem) {
        if (item.isNewNote) {
            const query = this.inputEl.value;
            const rawText = query.startsWith(this.plugin.settings.switcherFilePrefix)
                ? query.slice(this.plugin.settings.switcherFilePrefix.length)
                : query;
            this.plugin.newNote.open(rawText);
            return;
        }

        const { workspace, vault } = this.app;

        let existingLeaf: WorkspaceLeaf | null = null;
        workspace.iterateRootLeaves((leaf) => {
            if (!existingLeaf && (leaf.view as any).file?.path === item.path) {
                existingLeaf = leaf;
            }
        });

        if (existingLeaf) {
            const leaf = existingLeaf as WorkspaceLeaf;
            workspace.setActiveLeaf(leaf, { focus: true });
            const view = leaf.view;
            if (view instanceof MarkdownView) view.editor.focus();
            this.recordRecent(item.path);
            return;
        }

        const file = vault.getAbstractFileByPath(item.path);
        if (!(file instanceof TFile)) {
            workspace.openLinkText(item.path, '');
            this.recordRecent(item.path);
            return;
        }

        const leaf = workspace.getLeaf('tab');
        await leaf.openFile(file);
        this.recordRecent(item.path);
    }

    private recordRecent(path: string) {
        const recent = this.plugin.settings.recentSwitcher;
        recent[path] = Date.now();
        this.plugin.settings.recentSwitcher = Object.fromEntries(
            Object.entries(recent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, SWITCHER_HISTORY_LIMIT)
        );
        this.plugin.debouncedSave();
    }
}

export class SwitcherFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    openTitleSwitcher(): void {
        new TitleSwitcherModal(this.plugin.app, this.plugin).open();
    }
}
