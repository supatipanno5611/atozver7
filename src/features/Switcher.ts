import type ATOZVER6Plugin from '../main';
import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';

class TitleSwitcherModal extends FuzzySuggestModal<{ title: string; path: string }> {
    private candidates: { title: string; path: string }[];

    constructor(app: App, titleCandidates: Map<string, string>) {
        super(app);
        this.candidates = [...titleCandidates.entries()].map(([title, path]) => ({ title, path }));
    }

    getItems(): { title: string; path: string }[] {
        return this.candidates;
    }

    getItemText(item: { title: string; path: string }): string {
        return item.title;
    }

    onChooseItem(item: { title: string; path: string }): void {
        this.app.workspace.openLinkText(item.path, '');
    }
}

export class SwitcherFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    openTitleSwitcher(): void {
        new TitleSwitcherModal(this.plugin.app, this.plugin.titleCandidates).open();
    }
}
