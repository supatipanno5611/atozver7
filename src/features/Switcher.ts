import type ATOZVER6Plugin from '../main';
import { App, SuggestModal } from 'obsidian';
import { SwitcherItem } from '../types';

const FILE_SEARCH_PREFIXES = ['-', '~', '@'];

class TitleSwitcherModal extends SuggestModal<SwitcherItem> {
    private plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app);
        this.plugin = plugin;
        this.setPlaceholder('title 검색 | - ~ @ 로 시작하면 파일명 검색');
    }

    getSuggestions(query: string): SwitcherItem[] {
        const isFileMode = FILE_SEARCH_PREFIXES.some(p => query.startsWith(p));
        const searchText = isFileMode ? query.slice(1).toLowerCase() : query.toLowerCase();

        if (isFileMode) {
            return this.plugin.allFileCandidates.filter(c =>
                c.display.toLowerCase().includes(searchText)
            );
        }

        const results: SwitcherItem[] = [];
        for (const [title, path] of this.plugin.titleCandidates) {
            if (title.toLowerCase().includes(searchText)) {
                const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
                results.push({ display: title, path });
            }
        }
        return results;
    }

    renderSuggestion(item: SwitcherItem, el: HTMLElement) {
        const isFileMode = FILE_SEARCH_PREFIXES.some(p => this.inputEl.value.startsWith(p));
        if (isFileMode) {
            el.setText(item.display);
            return;
        }
        const basename = item.path.split('/').pop()?.replace(/\.md$/, '') ?? item.path;
        el.setText(`${item.display} [${basename}]`);
    }

    onChooseSuggestion(item: SwitcherItem) {
        this.app.workspace.openLinkText(item.path, '');
    }
}

export class SwitcherFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    openTitleSwitcher(): void {
        new TitleSwitcherModal(this.plugin.app, this.plugin).open();
    }
}
