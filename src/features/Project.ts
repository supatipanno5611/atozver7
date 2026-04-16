import type ATOZVER6Plugin from '../main';
import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import { moment } from 'obsidian';
import { parseDocument, buildDocument, DATE_PATTERN, INTERNAL_LINK_PATTERN, sortBase } from '../utils';

const CHUNK_SIZE = 25;

export class Project {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { name: string; path: string } | null {
        const { projectName, projectPath } = this.plugin.settings;
        if (!projectName || !projectPath) {
            new Notice('프로젝트 이름과 경로를 설정에서 지정해주세요.');
            return null;
        }
        return { name: projectName, path: projectPath };
    }

    private getCopiedFilePath(originalName: string, projectName: string, projectPath: string): string {
        return `${projectPath}/${projectName}-${originalName}`;
    }

    // 파일의 본문 링크 중 vault에 실제 존재하는 것들 반환
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

    // 사본의 날짜 항목 추출 (재업로드 여부 확인용)
    private getCopiedBaseDates(copiedFile: TFile): string[] {
        const cache = this.plugin.app.metadataCache.getFileCache(copiedFile);
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return [];
        return base.filter((v): v is string => typeof v === 'string' && DATE_PATTERN.test(v));
    }

    async addActiveFileToProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) return;
    
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }
        if (activeFile.extension !== 'md') { new Notice('마크다운 파일이 아닙니다.'); return; }
    
        const raw = await this.plugin.app.vault.read(activeFile);
        const { frontmatter } = parseDocument(raw);
        if (Object.keys(frontmatter).length === 0) { new Notice('프론트매터가 없습니다.'); return; }
    
        const targetFolder = this.plugin.app.vault.getAbstractFileByPath(proj.path);
        if (!(targetFolder instanceof TFolder)) { new Notice('대상 폴더가 없습니다.'); return; }
    
        const copiedPath = this.getCopiedFilePath(activeFile.name, proj.name, proj.path);
        const existingCopy = this.plugin.app.vault.getAbstractFileByPath(copiedPath);
        const isReupload = existingCopy instanceof TFile;
        const existingDates = isReupload ? this.getCopiedBaseDates(existingCopy) : [];
    
        const bodyLinks = this.getBodyLinks(activeFile);
        const title = frontmatter['title'] ?? '';
    
        // 현재 사본 수
        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;
    
        // 각 bodyLink의 사본 존재 여부
        const bodyLinkCopyExists = new Map<TFile, boolean>();
        for (const f of bodyLinks) {
            const cp = this.getCopiedFilePath(f.name, proj.name, proj.path);
            bodyLinkCopyExists.set(f, this.plugin.app.vault.getAbstractFileByPath(cp) instanceof TFile);
        }
    
        new ProjectUploadModal(
            this.plugin.app,
            title,
            copiedPath,
            isReupload,
            existingDates,
            bodyLinks,
            bodyLinkCopyExists,
            proj.name,
            currentCopyCount,
            async (selectedFiles: TFile[]) => {
                await this.executeUpload(activeFile, selectedFiles, proj);
            }
        ).open();
    }

    async removeActiveFileFromProject(): Promise<void> {
        const proj = this.getSettings();
        if (!proj) return;
    
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('활성 파일이 없습니다.'); return; }
    
        const copiedPath = this.getCopiedFilePath(activeFile.name, proj.name, proj.path);
        const existingCopy = this.plugin.app.vault.getAbstractFileByPath(copiedPath);
        if (!(existingCopy instanceof TFile)) {
            new Notice('프로젝트에 올라가 있는 파일이 아닙니다.');
            return;
        }
    
        const cache = this.plugin.app.metadataCache.getFileCache(activeFile);
        const title = cache?.frontmatter?.['title'] ?? '';
        const existingDates = this.getCopiedBaseDates(existingCopy);
    
        const bodyLinks = this.getBodyLinks(activeFile);
        const uploadedLinks = bodyLinks.filter(f => {
            const cp = this.getCopiedFilePath(f.name, proj.name, proj.path);
            return this.plugin.app.vault.getAbstractFileByPath(cp) instanceof TFile;
        });
    
        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;
    
        new ProjectRemoveModal(
            this.plugin.app,
            title,
            copiedPath,
            existingDates,
            uploadedLinks,
            proj.name,
            currentCopyCount,
            async (selectedFiles: TFile[]) => {
                await this.executeRemove(activeFile, [activeFile, ...selectedFiles], proj);
            }
        ).open();
    }
    
    private async executeUpload(mainFile: TFile, additionalFiles: TFile[], proj: { name: string; path: string }): Promise<void> {
        const allFiles = [mainFile, ...additionalFiles];
        const uploadedNames = new Set(allFiles.map(f => f.name));

        // 1. 사본 생성
        for (const file of allFiles) {
            const targetPath = this.getCopiedFilePath(file.name, proj.name, proj.path);
            await this.copyFile(file, targetPath);
            await this.processCopiedBase(targetPath);
        }

        // 2. 함께 올리는 파일들끼리 본문 링크 재작성
        for (const file of allFiles) {
            const targetPath = this.getCopiedFilePath(file.name, proj.name, proj.path);
            await this.rewriteBodyLinks(targetPath, uploadedNames, proj);
        }

        // 3. projectPath 내 기존 사본들 링크 갱신
        await this.updateExistingCopies(uploadedNames, proj);

        // 4. 원본 base 갱신
        for (const file of allFiles) {
            const targetPath = this.getCopiedFilePath(file.name, proj.name, proj.path);
            await this.updateOriginalBase(file, targetPath);
        }

        new Notice(`${allFiles.length}개 파일을 ${proj.name}에 추가했습니다.`);
    }

    private async executeRemove(mainFile: TFile, allFiles: TFile[], proj: { name: string; path: string }): Promise<void> {
        for (const file of allFiles) {
            const copiedPath = this.getCopiedFilePath(file.name, proj.name, proj.path);
            const copiedFile = this.plugin.app.vault.getAbstractFileByPath(copiedPath);
            if (copiedFile instanceof TFile) await this.plugin.app.vault.delete(copiedFile);

            const linkPath = copiedPath.replace(/\.md$/, '');
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const base = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
                frontmatter['base'] = base.filter(
                    (v: unknown) => !(typeof v === 'string' && v === `[[${linkPath}]]`)
                );
            });
        }

        new Notice(`${allFiles.length}개 파일을 ${proj.name}에서 내렸습니다.`);
    }

    private async copyFile(file: TFile, targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;
        const existing = vault.getAbstractFileByPath(targetPath);
        if (existing instanceof TFile) await vault.delete(existing);
        await vault.copy(file, targetPath);
    }

    private async processCopiedBase(targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;
        const copiedFile = vault.getAbstractFileByPath(targetPath);
        if (!(copiedFile instanceof TFile)) throw new Error('복사된 파일을 찾을 수 없습니다.');

        await vault.process(copiedFile, (data) => {
            const { frontmatter, body } = parseDocument(data);
            const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];

            const filtered = base.filter(v => {
                if (typeof v !== 'string') return true;
                if (DATE_PATTERN.test(v)) return false;
                if (v.startsWith('.')) return false;
                if (INTERNAL_LINK_PATTERN.test(v)) return false;
                return true;
            });

            const m = moment();
            filtered.push(m.format('YYYY년'), m.format('M월'), m.format('D일'));
            sortBase(filtered);
            frontmatter['base'] = filtered;

            return buildDocument(frontmatter, body);
        });
    }

    // 사본 본문에서 uploadedNames에 포함된 링크를 {project}-{파일명} 형식으로 재작성
    private async rewriteBodyLinks(targetPath: string, uploadedNames: Set<string>, proj: { name: string; path: string }): Promise<void> {
        const { vault } = this.plugin.app;
        const copiedFile = vault.getAbstractFileByPath(targetPath);
        if (!(copiedFile instanceof TFile)) return;

        await vault.process(copiedFile, (data) => {
            return data.replace(/\[\[([^\]|#^]+)((?:#[^\]|^]*)|(?:\^[^\]|]*))?(?:\|[^\]]*)?\]\]/g, (match, name, frag) => {
                const trimmed = (name as string).trim();
                const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
                if (!uploadedNames.has(fileName)) return match;
                const newName = `${proj.name}-${trimmed}`;
                return frag ? `[[${newName}${frag}]]` : `[[${newName}]]`;
            });
        });
    }

    // projectPath 내 기존 사본들 중 이번에 올라온 파일을 링크하는 것들 갱신
    private async updateExistingCopies(uploadedNames: Set<string>, proj: { name: string; path: string }): Promise<void> {
        const { vault } = this.plugin.app;
        const folder = vault.getAbstractFileByPath(proj.path);
        if (!(folder instanceof TFolder)) return;

        // 기존 사본 파일 목록 (이번에 새로 올린 것 제외)
        const existingCopies = vault.getMarkdownFiles().filter(f =>
            f.path.startsWith(proj.path + '/') &&
            !uploadedNames.has(f.name.replace(new RegExp(`^${proj.name}-`), ''))
        );

        // 병렬 읽기
        const contents = await Promise.all(existingCopies.map(f => vault.read(f)));

        // 변경 필요한 파일만 추림
        const toWrite: { file: TFile; content: string }[] = [];
        for (let i = 0; i < existingCopies.length; i++) {
            const file = existingCopies[i];
            const original = contents[i];
            if (!file || !original) continue;

            const rewritten = original.replace(/\[\[([^\]|#^]+)((?:#[^\]|^]*)|(?:\^[^\]|]*))?(?:\|[^\]]*)?\]\]/g, (match, name, frag) => {
                const trimmed = (name as string).trim();
                const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
                if (!uploadedNames.has(fileName)) return match;
                const newName = `${proj.name}-${trimmed}`;
                return frag ? `[[${newName}${frag}]]` : `[[${newName}]]`;
            });

            if (rewritten !== original) toWrite.push({ file, content: rewritten });
        }

        // 25개 청크로 쓰기
        for (let i = 0; i < toWrite.length; i += CHUNK_SIZE) {
            const chunk = toWrite.slice(i, i + CHUNK_SIZE);
            for (const { file, content } of chunk) {
                await vault.modify(file, content);
            }
            new Notice(`기존 사본 링크 갱신 중... ${Math.min(i + CHUNK_SIZE, toWrite.length)}/${toWrite.length}`);
        }
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
    private checkboxes: Map<TFile, HTMLInputElement> = new Map();
    private pathListEl!: HTMLElement;
    private summaryCountEl!: HTMLElement;

    constructor(
        app: App,
        private title: string,
        private copiedPath: string,
        private isReupload: boolean,
        private existingDates: string[],
        private bodyLinks: TFile[],
        private bodyLinkCopyExists: Map<TFile, boolean>,
        private projectName: string,
        private currentCopyCount: number,
        private onConfirm: (selectedFiles: TFile[]) => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(this.isReupload ? '재업로드' : '프로젝트에 추가');

        // 파일 정보 (맨 위, 배경색 없음)
        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });

        this.summaryCountEl = infoEl.createDiv({ cls: 'project-modal-summary-count' });
        infoEl.createEl('div', {
            text: `업로드 날짜: ${moment().format('YYYY년 M월 D일')}`,
            cls: 'project-modal-date'
        });

        if (this.isReupload) {
            const reuploadRow = infoEl.createDiv({ cls: 'project-modal-reupload-row' });
            reuploadRow.createEl('span', { text: '재업로드', cls: 'project-modal-badge' });
            if (this.existingDates.length > 0) {
                reuploadRow.createEl('span', {
                    text: `기존 업로드: ${this.existingDates.join(' ')}`,
                    cls: 'project-modal-reupload-dates'
                });
            }
        }

        this.renderSummaryCount();

        // 경로 목록
        this.pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        this.renderPathList();

        // 연결 노트
        const linksEl = contentEl.createDiv({ cls: 'project-modal-links' });
        linksEl.createEl('div', { text: '연결된 노트', cls: 'project-modal-links-header' });

        if (this.bodyLinks.length === 0) {
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

            for (const file of this.bodyLinks) {
                const label = linksEl.createEl('label', { cls: 'project-modal-link-item' });
                const input = label.createEl('input', { type: 'checkbox' });
                label.createSpan({ text: file.basename });
                input.addEventListener('change', () => {
                    this.renderPathList();
                    this.renderSummaryCount();
                });
                this.checkboxes.set(file, input);
            }
        }

        // 버튼
        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '업로드', cls: 'mod-cta' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            const selected = this.bodyLinks.filter(f => this.checkboxes.get(f)?.checked);
            await this.onConfirm(selected);
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    private getSelectedNewCount(): number {
        let count = this.isReupload ? 0 : 1;
        for (const [file, input] of this.checkboxes) {
            if (input.checked && !this.bodyLinkCopyExists.get(file)) count++;
        }
        return count;
    }

    private renderSummaryCount() {
        const n = this.getSelectedNewCount();
        const sign = n > 0 ? `+${n}` : '+0';
        this.summaryCountEl.setText(`${this.projectName} (${this.currentCopyCount}) ${sign}`);
    }

    private renderPathList() {
        this.pathListEl.empty();
        const basePath = this.copiedPath.substring(0, this.copiedPath.lastIndexOf('/'));
        const allFiles = [
            { title: this.title, path: this.copiedPath },
            ...this.bodyLinks
                .filter(f => this.checkboxes.get(f)?.checked)
                .map(f => {
                    const cache = this.app.metadataCache.getFileCache(f);
                    const t = cache?.frontmatter?.['title'] ?? '';
                    const p = `${basePath}/${this.projectName}-${f.name}`;
                    return { title: t, path: p };
                })
        ];
        for (const { title, path } of allFiles) {
            const text = title ? `${title}: ${path}` : path;
            this.pathListEl.createEl('div', { text, cls: 'project-modal-path-item' });
        }
    }

    onClose() { this.contentEl.empty(); }
}

// ─── Remove Modal ─────────────────────────────────────────────────────────────

class ProjectRemoveModal extends Modal {
    private checkboxes: Map<TFile, HTMLInputElement> = new Map();
    private pathListEl!: HTMLElement;
    private summaryCountEl!: HTMLElement;

    constructor(
        app: App,
        private title: string,
        private copiedPath: string,
        private existingDates: string[],
        private uploadedLinks: TFile[],
        private projectName: string,
        private currentCopyCount: number,
        private onConfirm: (selectedFiles: TFile[]) => Promise<void>,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('프로젝트에서 내리기');

        // 파일 정보 (맨 위, 배경색 없음)
        const infoEl = contentEl.createDiv({ cls: 'project-modal-info' });

        this.summaryCountEl = infoEl.createDiv({ cls: 'project-modal-summary-count' });
        if (this.existingDates.length > 0) {
            infoEl.createEl('div', {
                text: `업로드: ${this.existingDates.join(' ')}`,
                cls: 'project-modal-date'
            });
        }

        this.renderSummaryCount();

        // 경로 목록
        this.pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        this.renderPathList();

        // 연결 노트
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

            for (const file of this.uploadedLinks) {
                const label = linksEl.createEl('label', { cls: 'project-modal-link-item' });
                const input = label.createEl('input', { type: 'checkbox' });
                label.createSpan({ text: file.basename });
                input.addEventListener('change', () => {
                    this.renderPathList();
                    this.renderSummaryCount();
                });
                this.checkboxes.set(file, input);
            }
        }

        // 버튼
        const btnEl = contentEl.createDiv({ cls: 'project-modal-buttons' });
        const cancelBtn = btnEl.createEl('button', { text: '취소' });
        const confirmBtn = btnEl.createEl('button', { text: '내리기', cls: 'mod-warning' });

        confirmBtn.addEventListener('click', async () => {
            this.close();
            const selected = this.uploadedLinks.filter(f => this.checkboxes.get(f)?.checked);
            await this.onConfirm(selected);
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    private renderSummaryCount() {
        const n = 1 + [...this.checkboxes.values()].filter(i => i.checked).length;
        this.summaryCountEl.setText(`${this.projectName} (${this.currentCopyCount}) -${n}`);
    }

    private renderPathList() {
        this.pathListEl.empty();
        const basePath = this.copiedPath.substring(0, this.copiedPath.lastIndexOf('/'));
        const allFiles = [
            { title: this.title, path: this.copiedPath },
            ...this.uploadedLinks
                .filter(f => this.checkboxes.get(f)?.checked)
                .map(f => {
                    const cache = this.app.metadataCache.getFileCache(f);
                    const t = cache?.frontmatter?.['title'] ?? '';
                    const p = `${basePath}/${this.projectName}-${f.name}`;
                    return { title: t, path: p };
                })
        ];
        for (const { title, path } of allFiles) {
            const text = title ? `${title}: ${path}` : path;
            this.pathListEl.createEl('div', { text, cls: 'project-modal-path-item project-modal-path-item--remove' });
        }
    }

    onClose() { this.contentEl.empty(); }
}
