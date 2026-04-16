import type ATOZVER6Plugin from '../main';
import { MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { pickMostRecentLeaf } from '../utils';

export class ExecutesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async focusRootLeaf() {
        const { workspace } = this.plugin.app;

        const rootLeaves: WorkspaceLeaf[] = [];
        workspace.iterateRootLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) rootLeaves.push(leaf);
        });

        const target = pickMostRecentLeaf(rootLeaves, this.plugin.app);
        if (target) {
            workspace.setActiveLeaf(target, { focus: true });
            (target.view as MarkdownView).editor.focus();
            return;
        }

        const recentPath = Object.entries(this.plugin.settings.recentSwitcher)
            .sort((a, b) => b[1] - a[1])[0]?.[0];
        if (recentPath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(recentPath);
            if (file instanceof TFile) {
                await workspace.getLeaf('tab').openFile(file);
                return;
            }
        }

        await this.plugin.work.openWorkFile();
    }

    executeDeleteParagraph() {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        if (lineCount === 1) {
            editor.setValue('');
            return;
        }

        if (cursor.line < lineCount - 1) {
            editor.replaceRange('',
                { line: cursor.line, ch: 0 },
                { line: cursor.line + 1, ch: 0 }
            );
        } else {
            editor.replaceRange('',
                { line: cursor.line - 1, ch: editor.getLine(cursor.line - 1).length },
                { line: cursor.line, ch: editor.getLine(cursor.line).length }
            );
        }
    }
}
