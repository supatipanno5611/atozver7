import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { DATE_PATTERN, INTERNAL_LINK_PATTERN, buildDocument, parseDocument, sortBase } from '../utils';

export class ProjectIngest {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        return { path: projectPath, displayName: projectPath.split('/').pop() ?? projectPath };
    }

    private getCopiedFile(file: TFile, projectPath: string): TFile | null {
        const target = `${projectPath}/${file.basename}.md`;
        const found = this.plugin.app.vault.getAbstractFileByPath(target);
        return found instanceof TFile ? found : null;
    }

    private computeClosure(start: TFile): TFile[] {
        const visited = new Set<string>();
        const result: TFile[] = [];
        const queue: TFile[] = [start];

        while (queue.length > 0) {
            const file = queue.shift();
            if (!file || visited.has(file.path)) continue;
            visited.add(file.path);
            if (file.extension !== 'md') continue;
            result.push(file);

            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const refs = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
            for (const ref of refs) {
                const linked = this.plugin.app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
                if (linked instanceof TFile && !visited.has(linked.path)) {
                    queue.push(linked);
                }
            }
        }

        return result;
    }

    async addActiveFileToProject(): Promise<void> {
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
        if (activeFile.extension !== 'md') {
            new Notice('Only Markdown files are supported');
            return;
        }
        if (activeFile.path.startsWith(`${proj.path}/`)) {
            new Notice('The active file is already inside the project folder.');
            return;
        }

        const raw = await this.plugin.app.vault.read(activeFile);
        if (Object.keys(parseDocument(raw).frontmatter).length === 0) {
            new Notice('Frontmatter is required.');
            return;
        }

        if (!(this.plugin.app.vault.getAbstractFileByPath(proj.path) instanceof TFolder)) {
            new Notice('Project folder not found.');
            return;
        }

        const closure = this.computeClosure(activeFile);
        const allUploadPaths = closure.map((file) => `${proj.path}/${file.basename}.md`);
        const isReupload = this.getCopiedFile(activeFile, proj.path) instanceof TFile;
        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter((file) => file.path.startsWith(`${proj.path}/`)).length;
        const newFileCount = closure
            .filter((file) => !(this.getCopiedFile(file, proj.path) instanceof TFile))
            .length;

        new ProjectUploadModal(
            this.plugin.app,
            allUploadPaths,
            isReupload,
            newFileCount,
            proj.displayName,
            currentCopyCount,
            () => {
                void this.executeUpload(closure, proj, isReupload);
            },
        ).open();
    }

    private async executeUpload(
        closure: TFile[],
        proj: { path: string; displayName: string },
        isReupload: boolean,
    ): Promise<void> {
        try {
            for (const file of closure) {
                await this.createProcessedCopy(file, `${proj.path}/${file.basename}.md`);
            }
            await this.appendUploadLog(closure, proj);
            new Notice(`${closure.length} file(s) ${isReupload ? 'updated in' : 'added to'} ${proj.displayName}.`);
        } catch (error) {
            console.error('executeUpload failed:', error);
            await this.appendErrorLog('executeUpload', error);
            new Notice('Upload failed. Check log.md.');
        }
    }

    private async createProcessedCopy(file: TFile, targetPath: string): Promise<void> {
        const { vault, fileManager } = this.plugin.app;

        const existing = vault.getAbstractFileByPath(targetPath);
        if (existing instanceof TFile) {
            await fileManager.trashFile(existing);
        }

        const raw = await vault.read(file);
        const { frontmatter, body } = parseDocument(raw);
        const base = Array.isArray(frontmatter.base) ? [...frontmatter.base] : [];
        const filtered = base.filter((value) => {
            if (typeof value !== 'string') return true;
            if (DATE_PATTERN.test(value)) return false;
            if (value.startsWith('.')) return false;
            if (INTERNAL_LINK_PATTERN.test(value)) return false;
            return true;
        });

        sortBase(filtered);
        frontmatter.base = filtered;
        await vault.create(targetPath, buildDocument(frontmatter, body));
    }

    private async appendUploadLog(files: TFile[], proj: { path: string; displayName: string }): Promise<void> {
        const lines = files.map((file) => `- ${file.basename}`).join('\n');
        const entry = `## ${proj.displayName}\n${lines}\n`;
        const existing = this.plugin.app.vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await this.plugin.app.vault.process(existing, (content) => `${content}\n${entry}`);
            return;
        }
        await this.plugin.app.vault.create('log.md', entry);
    }

    private async appendErrorLog(context: string, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error && error.stack ? `\n\`\`\`\n${error.stack}\n\`\`\`` : '';
        const entry = `## ${context}\n${message}${stack}\n`;
        const existing = this.plugin.app.vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await this.plugin.app.vault.process(existing, (content) => `${content}\n${entry}`);
            return;
        }
        await this.plugin.app.vault.create('log.md', entry);
    }
}

class ProjectUploadModal extends Modal {
    constructor(
        app: App,
        private allUploadPaths: string[],
        private isReupload: boolean,
        private newFileCount: number,
        private projectDisplayName: string,
        private currentCopyCount: number,
        private onConfirm: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(this.isReupload ? 'Re-upload project files' : 'Add files to project');

        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });
        infoEl.createDiv({ cls: 'project-modal-summary-count', text: `${this.projectDisplayName} (${this.currentCopyCount}) +${this.newFileCount}` });

        if (this.isReupload) {
            const reuploadRow = infoEl.createDiv({ cls: 'project-modal-reupload-row' });
            reuploadRow.createEl('span', { text: 'Re-upload', cls: 'project-modal-badge' });
        }

        const pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        for (const path of this.allUploadPaths) {
            pathListEl.createEl('div', { text: path, cls: 'project-modal-path-item' });
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: 'Cancel' });
        const confirmBtn = btnEl.createEl('button', { text: 'Upload', cls: 'mod-cta' });

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
