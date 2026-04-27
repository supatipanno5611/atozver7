import type ATOZVER6Plugin from '../main';
import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import { moment } from 'obsidian';
import { parseDocument, buildDocument, DATE_PATTERN, INTERNAL_LINK_PATTERN, sortBase } from '../utils';

export class ProjectIngest {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        const displayName = projectPath.split('/').pop() ?? projectPath;
        return { path: projectPath, displayName };
    }

    private getCopiedFile(file: TFile, projectPath: string): TFile | null {
        const target = `${projectPath}/${file.basename}.md`;
        const f = this.plugin.app.vault.getAbstractFileByPath(target);
        return f instanceof TFile ? f : null;
    }

    private getCopiedUploadTime(copiedFile: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(copiedFile);
        const uploadtime = cache?.frontmatter?.['date'];
        return typeof uploadtime === 'string' ? uploadtime : '';
    }

    private computeClosure(start: TFile): TFile[] {
        const visited = new Set<string>();
        const result: TFile[] = [];
        const queue: TFile[] = [start];

        while (queue.length > 0) {
            const file = queue.shift()!;
            if (visited.has(file.path)) continue;
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
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }
        if (activeFile.extension !== 'md') { new Notice('마크다운 파일이 아닙니다.'); return; }

        if (activeFile.path.startsWith(proj.path + '/')) {
            new Notice('보관소 안의 파일입니다. 올리기는 원본에서만 가능합니다.');
            return;
        }

        const raw = await this.plugin.app.vault.read(activeFile);
        const { frontmatter } = parseDocument(raw);
        if (Object.keys(frontmatter).length === 0) { new Notice('프론트매터가 없습니다.'); return; }

        if (!(this.plugin.app.vault.getAbstractFileByPath(proj.path) instanceof TFolder)) {
            new Notice('대상 폴더가 없습니다.');
            return;
        }

        const closure = this.computeClosure(activeFile);
        const allUploadPaths = closure.map(f => `${proj.path}/${f.basename}.md`);

        const activeFileCopy = this.getCopiedFile(activeFile, proj.path);
        const isReupload = activeFileCopy instanceof TFile;
        const existingDates = isReupload ? this.getCopiedUploadTime(activeFileCopy) : '';

        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;

        let newFileCount = 0;
        for (const f of closure) {
            if (!(this.getCopiedFile(f, proj.path) instanceof TFile)) newFileCount++;
        }

        new ProjectUploadModal(
            this.plugin.app,
            allUploadPaths,
            isReupload,
            existingDates,
            newFileCount,
            proj.displayName,
            currentCopyCount,
            async () => {
                await this.executeUpload(closure, proj, isReupload);
            }
        ).open();
    }

    private async executeUpload(
        closure: TFile[],
        proj: { path: string; displayName: string },
        isReupload: boolean
    ): Promise<void> {
        try {
            for (const file of closure) {
                const targetPath = `${proj.path}/${file.basename}.md`;
                await this.createProcessedCopy(file, targetPath);
            }
            await this.appendUploadLog(closure, proj);
            new Notice(`${closure.length}개 파일을 ${proj.displayName}에 ${isReupload ? '업데이트했습니다' : '추가했습니다'}.`);
        } catch (error) {
            console.error('executeUpload 실패:', error);
            await this.appendErrorLog('executeUpload', error);
            new Notice('업로드 중 오류가 발생했습니다. log.md를 확인해주세요.');
        }
    }

    private async createProcessedCopy(file: TFile, targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;

        const existing = vault.getAbstractFileByPath(targetPath);
        if (existing instanceof TFile) {
            await vault.delete(existing);
        } else if (await vault.adapter.exists(targetPath)) {
            await vault.adapter.remove(targetPath);
        }

        const raw = await vault.read(file);
        const { frontmatter, body } = parseDocument(raw);
        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
        const filtered = base.filter(v => {
            if (typeof v !== 'string') return true;
            if (DATE_PATTERN.test(v)) return false;
            if (v.startsWith('.')) return false;
            if (INTERNAL_LINK_PATTERN.test(v)) return false;
            return true;
        });
        sortBase(filtered);
        frontmatter['base'] = filtered;
        frontmatter['title'] = file.basename;
        frontmatter['date'] = moment().format('YYYY-MM-DD');

        await vault.create(targetPath, buildDocument(frontmatter, body));
    }

    private async appendUploadLog(files: TFile[], proj: { path: string; displayName: string }): Promise<void> {
        const { vault } = this.plugin.app;
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const lines = files.map(f => `- ${f.basename}`).join('\n');
        const entry = `## ${timestamp} — ${proj.displayName}\n${lines}\n`;
        const existing = vault.getAbstractFileByPath('log.md');
        if (existing instanceof TFile) {
            await vault.process(existing, (content) => content + '\n' + entry);
        } else {
            await vault.create('log.md', entry);
        }
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

class ProjectUploadModal extends Modal {
    constructor(
        app: App,
        private allUploadPaths: string[],
        private isReupload: boolean,
        private existingDates: string,
        private newFileCount: number,
        private projectDisplayName: string,
        private currentCopyCount: number,
        private onConfirm: () => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(this.isReupload ? '재업로드' : '프로젝트에 추가');

        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });
        const summaryEl = infoEl.createDiv({ cls: 'project-modal-summary-count' });
        summaryEl.setText(`${this.projectDisplayName} (${this.currentCopyCount}) +${this.newFileCount}`);

        infoEl.createEl('div', {
            text: `업로드 날짜: ${moment().format('YYYY년 M월 D일 HH:mm')}`,
            cls: 'project-modal-date'
        });

        if (this.isReupload) {
            const reuploadRow = infoEl.createDiv({ cls: 'project-modal-reupload-row' });
            reuploadRow.createEl('span', { text: '재업로드', cls: 'project-modal-badge' });
            if (this.existingDates) {
                reuploadRow.createEl('span', {
                    text: `기존 업로드: ${this.existingDates}`,
                    cls: 'project-modal-reupload-dates'
                });
            }
        }

        const pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        for (const path of this.allUploadPaths) {
            pathListEl.createEl('div', { text: path, cls: 'project-modal-path-item' });
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '업로드', cls: 'mod-cta' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            await this.onConfirm();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() { this.contentEl.empty(); }
}
