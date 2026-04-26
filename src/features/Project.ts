import type ATOZVER6Plugin from '../main';
import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import { moment } from 'obsidian';
import { parseDocument, buildDocument, DATE_PATTERN, INTERNAL_LINK_PATTERN, sortBase } from '../utils';

export class Project {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        const displayName = projectPath.split('/').pop() ?? projectPath;
        return { path: projectPath, displayName };
    }

    private getCopiedFileFromBase(file: TFile, projectPath: string): TFile | null {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return null;
        for (const v of base) {
            if (typeof v !== 'string') continue;
            const match = v.match(/^\[\[(.+)\]\]$/);
            if (!match) continue;
            const linkPath = match[1] + '.md';
            if (!linkPath.startsWith(projectPath + '/')) continue;
            const f = this.plugin.app.vault.getAbstractFileByPath(linkPath);
            if (f instanceof TFile) return f;
        }
        return null;
    }

    private getBodyLinks(file: TFile): TFile[] {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const links = cache?.links ?? [];
        const result: TFile[] = [];
        for (const link of links) {
            const linkedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
            if (linkedFile instanceof TFile) result.push(linkedFile);
        }
        return result;
    }

    private getCopiedUploadTime(copiedFile: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(copiedFile);
        const uploadtime = cache?.frontmatter?.['date'];
        if (typeof uploadtime === 'string') return uploadtime;
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return '';
        return base.filter((v): v is string => typeof v === 'string' && DATE_PATTERN.test(v)).join(' ');
    }

    // base에 프로젝트 링크가 있지만 파일이 없는 경우(부분 실패) basename을 반환
    private getProjectBasenameFromBase(file: TFile, projectPath: string): string | null {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return null;
        for (const v of base) {
            if (typeof v !== 'string') continue;
            const match = v.match(/^\[\[(.+)\]\]$/);
            if (!match) continue;
            const linkPath = match[1];
            if (!linkPath) continue;
            if (!linkPath.startsWith(projectPath + '/')) continue;
            const basename = linkPath.split('/').pop();
            if (!basename) continue;
            return basename;
        }
        return null;
    }

    private async appendLog(context: string, error: unknown): Promise<void> {
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

    private buildUploadedNameMap(allFiles: TFile[], projectPath: string): Map<TFile, string> {
        const map = new Map<TFile, string>();
        for (const file of allFiles) {
            const existing = this.getCopiedFileFromBase(file, projectPath);
            if (existing instanceof TFile) {
                map.set(file, existing.basename);
                continue;
            }
            const linkedBasename = this.getProjectBasenameFromBase(file, projectPath);
            if (linkedBasename) {
                map.set(file, linkedBasename);
                continue;
            }
            map.set(file, file.basename);
        }
        return map;
    }

    async addActiveFileToProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }
        if (activeFile.extension !== 'md') { new Notice('마크다운 파일이 아닙니다.'); return; }

        const raw = await this.plugin.app.vault.read(activeFile);
        const { frontmatter } = parseDocument(raw);
        if (Object.keys(frontmatter).length === 0) { new Notice('프론트매터가 없습니다.'); return; }

        if (!(this.plugin.app.vault.getAbstractFileByPath(proj.path) instanceof TFolder)) {
            new Notice('대상 폴더가 없습니다.');
            return;
        }

        const bodyLinks = this.getBodyLinks(activeFile);
        const allFiles = [activeFile, ...bodyLinks];
        const fileToBasename = this.buildUploadedNameMap(allFiles, proj.path);

        const activeFileCopy = this.getCopiedFileFromBase(activeFile, proj.path);
        const isReupload = activeFileCopy instanceof TFile;
        const existingDates = isReupload ? this.getCopiedUploadTime(activeFileCopy) : '';

        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;

        const allUploadPaths = allFiles.map(f => `${proj.path}/${fileToBasename.get(f)!}.md`);

        let newFileCount = isReupload ? 0 : 1;
        for (const f of bodyLinks) {
            if (!(this.getCopiedFileFromBase(f, proj.path) instanceof TFile)) newFileCount++;
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
                await this.executeUpload(allFiles, proj, fileToBasename, isReupload);
            }
        ).open();
    }

    async exportProjectToPath(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

        const exportPath = this.plugin.settings.projectExportPath;
        if (!exportPath) { new Notice('내보내기 경로를 설정에서 지정해주세요.'); return; }

        const files = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/'));

        if (files.length === 0) { new Notice('프로젝트에 파일이 없습니다.'); return; }

        new ProjectExportModal(
            this.plugin.app,
            files,
            exportPath,
            async () => {
                try {
                    const fs = require('fs').promises;
                    for (const file of files) {
                        const content = await this.plugin.app.vault.read(file);
                        await fs.writeFile(`${exportPath}/${file.basename}.mdx`, content, 'utf8');
                    }
                    new Notice(`${files.length}개 파일을 내보냈습니다.`);
                } catch (error) {
                    console.error('exportProjectToPath 실패:', error);
                    await this.appendLog('exportProjectToPath', error);
                    new Notice('내보내기 중 오류가 발생했습니다. log.md를 확인해주세요.');
                }
            }
        ).open();
    }

    async removeActiveFileFromProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) { new Notice('프로젝트 경로를 설정에서 지정해주세요.'); return; }

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }

        const existingCopy = this.getCopiedFileFromBase(activeFile, proj.path);
        if (!(existingCopy instanceof TFile)) {
            new Notice('프로젝트에 올라가 있는 파일이 아닙니다.');
            return;
        }

        const cache = this.plugin.app.metadataCache.getFileCache(activeFile);
        const title = cache?.frontmatter?.['title'] ?? '';
        const existingDates = this.getCopiedUploadTime(existingCopy);

        const bodyLinks = this.getBodyLinks(activeFile);
        const copiedFileMap = new Map<TFile, TFile>();
        for (const f of bodyLinks) {
            const copy = this.getCopiedFileFromBase(f, proj.path);
            if (copy instanceof TFile) copiedFileMap.set(f, copy);
        }
        const uploadedLinks = [...copiedFileMap.keys()];

        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;

        const uploadedLinkData = uploadedLinks.map(f => {
            const c = this.plugin.app.metadataCache.getFileCache(f);
            const t = c?.frontmatter?.['title'];
            return {
                file: f,
                title: typeof t === 'string' ? t : '',
                copiedPath: copiedFileMap.get(f)!.path
            };
        });

        new ProjectRemoveModal(
            this.plugin.app,
            typeof title === 'string' ? title : '',
            existingCopy.path,
            existingDates,
            uploadedLinkData,
            proj.displayName,
            currentCopyCount,
            async (selectedFiles: TFile[]) => {
                const toRemove = new Map<TFile, TFile>();
                toRemove.set(activeFile, existingCopy);
                for (const f of selectedFiles) {
                    const copy = copiedFileMap.get(f);
                    if (copy) toRemove.set(f, copy);
                }
                await this.executeRemove(toRemove, proj);
            }
        ).open();
    }

    private async executeUpload(
        allFiles: TFile[],
        proj: { path: string; displayName: string },
        fileToBasename: Map<TFile, string>,
        isReupload: boolean
    ): Promise<void> {
        try {
            for (const file of allFiles) {
                const targetPath = `${proj.path}/${fileToBasename.get(file)!}.md`;
                await this.updateOriginalBase(file, targetPath);
            }
            for (const file of allFiles) {
                const targetPath = `${proj.path}/${fileToBasename.get(file)!}.md`;
                await this.createProcessedCopy(file, targetPath);
            }
            await this.appendUploadLog(allFiles, proj);
            new Notice(`${allFiles.length}개 파일을 ${proj.displayName}에 ${isReupload ? '업데이트했습니다' : '추가했습니다'}.`);
        } catch (error) {
            console.error('executeUpload 실패:', error);
            await this.appendLog('executeUpload', error);
            new Notice('업로드 중 오류가 발생했습니다. log.md를 확인해주세요.');
        }
    }

    private async executeRemove(
        fileToRemove: Map<TFile, TFile>,
        proj: { path: string; displayName: string }
    ): Promise<void> {
        try {
            for (const [file, copiedFile] of fileToRemove) {
                const linkPath = copiedFile.path.replace(/\.md$/, '');
                await this.plugin.app.vault.delete(copiedFile);
                await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    const base = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
                    frontmatter['base'] = base.filter(
                        (v: unknown) => !(typeof v === 'string' && v === `[[${linkPath}]]`)
                    );
                });
            }
            new Notice(`${fileToRemove.size}개 파일을 ${proj.displayName}에서 내렸습니다.`);
        } catch (error) {
            console.error('executeRemove 실패:', error);
            await this.appendLog('executeRemove', error);
            new Notice('내리기 중 오류가 발생했습니다. log.md를 확인해주세요.');
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

    private async updateOriginalBase(file: TFile, targetPath: string): Promise<void> {
        const linkPath = targetPath.replace(/\.md$/, '');
        await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
            const filtered = base.filter(v => !(typeof v === 'string' && v === `[[${linkPath}]]`));
            filtered.push(`[[${linkPath}]]`);
            sortBase(filtered);
            frontmatter['base'] = filtered;
        });
    }
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
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

// ─── Remove Modal ─────────────────────────────────────────────────────────────
type UploadedLinkEntry = { file: TFile; title: string; copiedPath: string };

class ProjectRemoveModal extends Modal {
    private checkboxes: Map<TFile, HTMLInputElement> = new Map();
    private pathListEl!: HTMLElement;
    private summaryCountEl!: HTMLElement;

    constructor(
        app: App,
        private title: string,
        private copiedPath: string,
        private existingDates: string,
        private uploadedLinks: UploadedLinkEntry[],
        private projectDisplayName: string,
        private currentCopyCount: number,
        private onConfirm: (selectedFiles: TFile[]) => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('프로젝트에서 내리기');

        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });
        this.summaryCountEl = infoEl.createDiv({ cls: 'project-modal-summary-count' });
        if (this.existingDates) {
            infoEl.createEl('div', {
                text: `업로드: ${this.existingDates}`,
                cls: 'project-modal-date'
            });
        }

        this.renderSummaryCount();

        this.pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        this.renderPathList();

        const linksEl = contentEl.createDiv({ cls: 'project-modal-links' });
        linksEl.createEl('div', { text: '함께 내릴 노트', cls: 'project-modal-links-header' });

        if (this.uploadedLinks.length === 0) {
            linksEl.createEl('div', { text: '연결된 노트 없음', cls: 'project-modal-empty' });
        } else {
            const toggleEl = linksEl.createEl('label', { cls: 'project-modal-toggle' });
            const toggleInput = toggleEl.createEl('input', { type: 'checkbox' });
            toggleEl.createSpan({ text: '전체 선택' });
            toggleInput.addEventListener('change', () => {
                for (const input of this.checkboxes.values()) {
                    input.checked = toggleInput.checked;
                }
                this.renderPathList();
                this.renderSummaryCount();
            });

            for (const entry of this.uploadedLinks) {
                const label = linksEl.createEl('label', { cls: 'project-modal-link-item' });
                const input = label.createEl('input', { type: 'checkbox' });
                label.createSpan({ text: entry.file.basename });
                input.addEventListener('change', () => {
                    this.renderPathList();
                    this.renderSummaryCount();
                });
                this.checkboxes.set(entry.file, input);
            }
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '내리기', cls: 'mod-warning' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            const selected = this.uploadedLinks
                .filter(e => this.checkboxes.get(e.file)?.checked)
                .map(e => e.file);
            await this.onConfirm(selected);
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    private renderSummaryCount() {
        const n = 1 + [...this.checkboxes.values()].filter(i => i.checked).length;
        this.summaryCountEl.setText(`${this.projectDisplayName} (${this.currentCopyCount}) -${n}`);
    }

    private renderPathList() {
        this.pathListEl.empty();
        const mainEntry = { title: this.title, path: this.copiedPath };
        const selectedEntries = this.uploadedLinks
            .filter(e => this.checkboxes.get(e.file)?.checked)
            .map(e => ({ title: e.title, path: e.copiedPath }));

        for (const { title, path } of [mainEntry, ...selectedEntries]) {
            const text = title ? `${title}: ${path}` : path;
            this.pathListEl.createEl('div', { text, cls: 'project-modal-path-item project-modal-path-item--remove' });
        }
    }

    onClose() { this.contentEl.empty(); }
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
class ProjectExportModal extends Modal {
    constructor(
        app: App,
        private files: TFile[],
        private exportPath: string,
        private onConfirm: () => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(`내보내기 (${this.files.length}개)`);

        contentEl.createEl('div', { text: this.exportPath, cls: 'project-modal-date' });

        const listEl = contentEl.createDiv({ cls: 'project-modal-export-list' });
        for (const file of this.files) {
            listEl.createEl('div', { text: `${file.basename}.mdx`, cls: 'project-modal-path-item' });
        }

        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '내보내기', cls: 'mod-cta' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            await this.onConfirm();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() { this.contentEl.empty(); }
}
