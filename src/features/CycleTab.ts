import type ATOZVER6Plugin from '../main';
import { MarkdownView, WorkspaceLeaf } from 'obsidian';
import { pickMostRecentLeaf } from '../utils';

export class CycleTabFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    cycleAllTabs(markdownOnly = false) {
        const { workspace } = this.plugin.app;

        const leaves: WorkspaceLeaf[] = [];
        workspace.iterateRootLeaves((leaf) => {
            if (markdownOnly && !(leaf.view instanceof MarkdownView && leaf.view.file)) return;
            leaves.push(leaf);
        });

        if (leaves.length <= 1) return;

        const activeLeaf = workspace.getMostRecentLeaf();
        const currentIndex = activeLeaf ? leaves.indexOf(activeLeaf) : -1;
        const nextIndex = (currentIndex + 1) % leaves.length;
        const target = leaves[nextIndex];

        if (target) {
            workspace.setActiveLeaf(target, { focus: true });
            if (target.view instanceof MarkdownView) target.view.editor.focus();
        }
    }
}
