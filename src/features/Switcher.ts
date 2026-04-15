import type ATOZVER6Plugin from '../main';
import { App, SuggestModal, TFile, WorkspaceLeaf } from 'obsidian';
import { SwitcherItem } from '../types';

const FILE_SEARCH_PREFIX = '-';
const SWITCHER_RECENT_WEIGHT = 0.0000001;
const SWITCHER_HISTORY_LIMIT = 16;

class TitleSwitcherModal extends SuggestModal<SwitcherItem> {
    private plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app);
        this.plugin = plugin;
    }

    getSuggestions(query: string): SwitcherItem[] {
        const isFileMode = query.startsWith(FILE_SEARCH_PREFIX);
        const searchText = isFileMode ? query.slice(1).toLowerCase() : query.toLowerCase();

        let candidates: SwitcherItem[];

        if (isFileMode) {
            candidates = this.plugin.allFileCandidates.filter(c =>
                c.display.toLowerCase().includes(searchText)
            );
        } else {
            candidates = [];
            for (const [title, path] of this.plugin.titleCandidates) {
                if (title.toLowerCase().includes(searchText)) {
                    candidates.push({ display: title, path });
                }
            }
        }

        if (!searchText) {
            return candidates
                .map(c => ({ item: c, score: this.plugin.settings.recentSwitcher[c.path] ?? 0 }))
                .sort((a, b) => b.score - a.score)
                .map(r => r.item);
        }

        return candidates
            .map(c => ({
                item: c,
                score: (this.plugin.settings.recentSwitcher[c.path] ?? 0) * SWITCHER_RECENT_WEIGHT
            }))
            .sort((a, b) => b.score - a.score)
            .map(r => r.item);
    }

    renderSuggestion(item: SwitcherItem, el: HTMLElement) {
        el.setText(item.display);
    }

    async onChooseSuggestion(item: SwitcherItem) {
        const { workspace, vault } = this.app;

        let existingLeaf: WorkspaceLeaf | null = null;
        workspace.iterateRootLeaves((leaf) => {
            if (!existingLeaf && (leaf.view as any).file?.path === item.path) {
                existingLeaf = leaf;
            }
        });

        if (existingLeaf) {
            workspace.setActiveLeaf(existingLeaf, { focus: true });
            this.recordRecent(item.path);
            return;
        }

        const file = vault.getAbstractFileByPath(item.path);
        if (!(file instanceof TFile)) {
            workspace.openLinkText(item.path, '');
            this.recordRecent(item.path);
            return;
        }

        let leaf = workspace.getLeaf(false);
        const isMainArea = leaf.view.containerEl.closest('.mod-root') !== null;
        if (!isMainArea) {
            leaf = workspace.getLeaf('tab');
        }

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
