import type ATOZVER6Plugin from '../main';
import { App, Modal, Notice, TFile } from 'obsidian';
import { moment } from 'obsidian';

export class ProjectKeeper {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        const displayName = projectPath.split('/').pop() ?? projectPath;
        return { path: projectPath, displayName };
    }

    private getAllCopies(projectPath: string): TFile[] {
        return this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(projectPath + '/'));
    }

    private getCopiedUploadTime(copiedFile: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(copiedFile);
        const uploadtime = cache?.frontmatter?.['date'];
        return typeof uploadtime === 'string' ? uploadtime : '';
    }

    private buildReverseGraph(projectPath: string): Map<string, Set<string>> {
        const reverse = new Map<string, Set<string>>();
        for (const copy of this.getAllCopies(projectPath)) {
            const cache = this.plugin.app.metadataCache.getFileCache(copy);
            const refs = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
            for (const ref of refs) {
                const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(ref.link, copy.path);
                if (dest instanceof TFile && dest.path.startsWith(projectPath + '/')) {
                    if (!reverse.has(dest.path)) reverse.set(dest.path, new Set());
                    reverse.get(dest.path)!.add(copy.path);
                }
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
            const f = queue.shift()!;
            if (visited.has(f.path)) continue;
            visited.add(f.path);
            result.push(f);

            const incoming = reverse.get(f.path) ?? new Set<string>();
            for (const sourcePath of incoming) {
                const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
                if (source instanceof TFile && !visited.has(source.path)) queue.push(source);
            }
        }
        return result;
    }

    async removeActiveFileFromProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }

        if (!activeFile.path.startsWith(proj.path + '/')) {
            new Notice('보관소 안의 파일이 아닙니다. 내리기는 보관소 안에서만 가능합니다.');
            return;
        }

        const closure = this.computeInClosure(activeFile, proj.path);
        const existingDates = this.getCopiedUploadTime(activeFile);
        const currentCopyCount = this.getAllCopies(proj.path).length;

        new ProjectRemoveModal(
            this.plugin.app,
            closure.map(f => f.path),
            existingDates,
            proj.displayName,
            currentCopyCount,
            async () => {
                await this.executeRemove(closure, proj);
            }
        ).open();
    }

    private async executeRemove(
        copiedFiles: TFile[],
        proj: { path: string; displayName: string }
    ): Promise<void> {
        try {
            for (const copiedFile of copiedFiles) {
                await this.plugin.app.vault.delete(copiedFile);
            }
            new Notice(`${copiedFiles.length}개 파일을 ${proj.displayName}에서 내렸습니다.`);
        } catch (error) {
            console.error('executeRemove 실패:', error);
            await this.appendErrorLog('executeRemove', error);
            new Notice('내리기 중 오류가 발생했습니다. log.md를 확인해주세요.');
        }
    }

    async verifyIntegrity(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

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
                if (!dest.path.startsWith(proj.path + '/')) {
                    leaks.push({ source: copy.path, ref: ref.link, resolvedTo: dest.path });
                }
            }
        }

        if (leaks.length === 0) {
            new Notice(`${proj.displayName}: 누수 없음 (${copies.length}개 검사)`);
            return;
        }

        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const lines = leaks.map(l =>
            l.resolvedTo === null
                ? `- [${l.source}] ${l.ref} → (해석 실패)`
                : `- [${l.source}] ${l.ref} → ${l.resolvedTo}`
        ).join('\n');
        const entry = `## ${timestamp} — 무결성 검증 (${proj.displayName})\n${leaks.length}건 누수\n${lines}\n`;
        const { vault } = this.plugin.app;
        const existing = vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await vault.process(existing, (content) => content + '\n' + entry);
        } else {
            await vault.create('log.md', entry);
        }
        new Notice(`누수 ${leaks.length}건. log.md 확인.`);
    }

    private async appendErrorLog(context: string, error: unknown): Promise<void> {
        const { vault } = this.plugin.app;
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error && error.stack ? `\n\`\`\`\n${error.stack}\n\`\`\`` : '';
        const entry = `## ${timestamp} — ${context}\n${message}${stack}\n`;
        const existing = vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await vault.process(existing, (content) => content + '\n' + entry);
        } else {
            await vault.create('log.md', entry);
        }
    }
}

class ProjectRemoveModal extends Modal {
    constructor(
        app: App,
        private closurePaths: string[],
        private existingDates: string,
        private projectDisplayName: string,
        private currentCopyCount: number,
        private onConfirm: () => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('프로젝트에서 내리기');

        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });
        const summaryEl = infoEl.createDiv({ cls: 'project-modal-summary-count' });
        summaryEl.setText(`${this.projectDisplayName} (${this.currentCopyCount}) -${this.closurePaths.length}`);
        if (this.existingDates) {
            infoEl.createEl('div', {
                text: `업로드: ${this.existingDates}`,
                cls: 'project-modal-date'
            });
        }

        const pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        for (const path of this.closurePaths) {
            pathListEl.createEl('div', { text: path, cls: 'project-modal-path-item project-modal-path-item--remove' });
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '내리기', cls: 'mod-warning' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            await this.onConfirm();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() { this.contentEl.empty(); }
}
