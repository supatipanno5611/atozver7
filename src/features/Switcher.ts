import type ATOZVER6Plugin from '../main';
import { App, SuggestModal } from 'obsidian';
import { SwitcherItem } from '../types';

const FILE_SEARCH_PREFIX = '-';

class TitleSwitcherModal extends SuggestModal<SwitcherItem> {
    private plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app);
        this.plugin = plugin;
    }

    getSuggestions(query: string): SwitcherItem[] {
    	const isFileMode = query.startsWith(FILE_SEARCH_PREFIX);
        const searchText = isFileMode ? query.slice(1).toLowerCase() : query.toLowerCase();
    
        if (isFileMode) {
            return this.plugin.allFileCandidates.filter(c =>
                c.display.toLowerCase().includes(searchText)
            );
        }
    
        const results: SwitcherItem[] = [];
        for (const [title, path] of this.plugin.titleCandidates) {
            if (title.toLowerCase().includes(searchText)) {
                results.push({ display: title, path });
            }
        }
        return results;
    }

    renderSuggestion(item: SwitcherItem, el: HTMLElement) {
        el.setText(item.display);
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
