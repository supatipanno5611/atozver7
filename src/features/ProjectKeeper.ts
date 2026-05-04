import { App, Modal, Notice, TFile } from 'obsidian';
import type ATOZVER6Plugin from '../main';

export class ProjectKeeper {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        return { path: projectPath, displayName: projectPath.split('/').pop() ?? projectPath };
    }

    private getAllCopies(projectPath: string): TFile[] {
        return this.plugin.app.vault.getMarkdownFiles()
            .filter((file) => file.path.startsWith(`${projectPath}/`));
    }

    private buildReverseGraph(projectPath: string): Map<string, Set<string>> {
        const reverse = new Map<string, Set<string>>();
        for (const copy of this.getAllCopies(projectPath)) {
            const cache = this.plugin.app.metadataCache.getFileCache(copy);
            const refs = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
            for (const ref of refs) {
                const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(ref.link, copy.path);
                if (!(dest instanceof TFile) || !dest.path.startsWith(`${projectPath}/`)) continue;

                if (!reverse.has(dest.path)) reverse.set(dest.path, new Set());
                reverse.get(dest.path)?.add(copy.path);
            }
        }
        return reverse;
    }

    private computeInClosure(seed: TFile, projectPath: string): TFile[] {
        const reverse = this.buildReverseGraph(projectPath);
        const visited = new Set<string>();
        const result: TFile[] = [];
        const queue: TFile[] = [seed];

        while (queue.length > 0) {
            const file = queue.shift();
            if (!file || visited.has(file.path)) continue;
            visited.add(file.path);
            result.push(file);

            const incoming = reverse.get(file.path) ?? new Set<string>();
            for (const sourcePath of incoming) {
                const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
                if (source instanceof TFile && !visited.has(source.path)) {
                    queue.push(source);
                }
            }
        }

        return result;
    }

    async removeActiveFileFromProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) {
            new Notice('Set a project path first.');
            return;
        }

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }

        if (!activeFile.path.startsWith(`${proj.path}/`)) {
            new Notice('The active file is not inside the project folder.');
            return;
        }

        const closure = this.computeInClosure(activeFile, proj.path);
        new ProjectRemoveModal(
            this.plugin.app,
            closure.map((file) => file.path),
            proj.displayName,
            this.getAllCopies(proj.path).length,
            () => {
                void this.executeRemove(closure, proj);
            },
        ).open();
    }

    private async executeRemove(
        copiedFiles: TFile[],
        proj: { path: string; displayName: string },
    ): Promise<void> {
        try {
            for (const copiedFile of copiedFiles) {
                await this.plugin.app.fileManager.trashFile(copiedFile);
            }
            new Notice(`${copiedFiles.length} file(s) removed from ${proj.displayName}.`);
        } catch (error) {
            console.error('executeRemove failed:', error);
            await this.appendErrorLog('executeRemove', error);
            new Notice('Remove failed. Check log.md.');
        }
    }

    async verifyIntegrity(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) {
            new Notice('Set a project path first.');
            return;
        }

        const copies = this.getAllCopies(proj.path);
        const leaks: { source: string; ref: string; resolvedTo: string | null }[] = [];

        for (const copy of copies) {
            const cache = this.plugin.app.metadataCache.getFileCache(copy);
            const refs = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
            for (const ref of refs) {
                const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(ref.link, copy.path);
                if (!(dest instanceof TFile)) {
                    leaks.push({ source: copy.path, ref: ref.link, resolvedTo: null });
                    continue;
                }
                if (!dest.path.startsWith(`${proj.path}/`)) {
                    leaks.push({ source: copy.path, ref: ref.link, resolvedTo: dest.path });
                }
            }
        }

        if (leaks.length === 0) {
            new Notice(`${proj.displayName}: no integrity issues found (${copies.length} files checked).`);
            return;
        }

        const lines = leaks
            .map((leak) => leak.resolvedTo === null
                ? `- [${leak.source}] ${leak.ref} -> unresolved`
                : `- [${leak.source}] ${leak.ref} -> ${leak.resolvedTo}`)
            .join('\n');

        const entry = `## Integrity check (${proj.displayName})\n${leaks.length} issue(s)\n${lines}\n`;
        const existing = this.plugin.app.vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await this.plugin.app.vault.process(existing, (content) => `${content}\n${entry}`);
        } else {
            await this.plugin.app.vault.create('log.md', entry);
        }

        new Notice(`${leaks.length} issue(s) logged to log.md.`);
    }

    private async appendErrorLog(context: string, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error && error.stack ? `\n\`\`\`\n${error.stack}\n\`\`\`` : '';
        const entry = `## Error: ${context}\n${message}${stack}\n`;
        const existing = this.plugin.app.vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await this.plugin.app.vault.process(existing, (content) => `${content}\n${entry}`);
            return;
        }
        await this.plugin.app.vault.create('log.md', entry);
    }
}

class ProjectRemoveModal extends Modal {
    constructor(
        app: App,
        private closurePaths: string[],
        private projectDisplayName: string,
        private currentCopyCount: number,
        private onConfirm: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Remove files from project');

        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });
        infoEl.createDiv({ cls: 'project-modal-summary-count', text: `${this.projectDisplayName} (${this.currentCopyCount}) -${this.closurePaths.length}` });

        const pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        for (const path of this.closurePaths) {
            pathListEl.createEl('div', { text: path, cls: 'project-modal-path-item project-modal-path-item--remove' });
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: 'Cancel' });
        const confirmBtn = btnEl.createEl('button', { text: 'Remove', cls: 'mod-warning' });

        confirmBtn.addEventListener('click', () => {
            this.close();
            this.onConfirm();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
