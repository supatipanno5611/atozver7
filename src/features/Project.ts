import type ATOZVER6Plugin from '../main';
import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import { moment } from 'obsidian';
import { parseDocument, buildDocument, DATE_PATTERN, INTERNAL_LINK_PATTERN, sortBase } from '../utils';

const CHUNK_SIZE = 25;

export class Project {
    constructor(private plugin: ATOZVER6Plugin) {}

    private getSettings(): { path: string; displayName: string } | null {
        const { projectPath } = this.plugin.settings;
        if (!projectPath) return null;
        const displayName = projectPath.split('/').pop() ?? projectPath;
        return { path: projectPath, displayName };
    }

    private getSetFromFile(file: TFile): string | null {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return null;
        return base.find((v): v is string => typeof v === 'string' && v.startsWith('.')) ?? null;
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
        const uploadtime = cache?.frontmatter?.['uploadtime'];
        if (typeof uploadtime === 'string') return uploadtime;
        const base = cache?.frontmatter?.['base'];
        if (!Array.isArray(base)) return '';
        return base.filter((v): v is string => typeof v === 'string' && DATE_PATTERN.test(v)).join(' ');
    }

    private isValidCopyBasename(basename: string, set: string): boolean {
        const pattern = new RegExp(`^${set.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`);
        return pattern.test(basename);
    }

    // set별 vault max를 한 번 스캔하고 메모리에서 증가
    private buildUploadedNameMap(allFiles: TFile[], projectPath: string): Map<TFile, string> {
        const map = new Map<TFile, string>();
        const setMax = new Map<string, number>();

        const scanSetMax = (set: string): number => {
            const prefix = `${set}-`;
            const files = this.plugin.app.vault.getMarkdownFiles()
                .filter(f => f.path.startsWith(projectPath + '/'));
            let max = 0;
            for (const f of files) {
                if (!f.basename.startsWith(prefix)) continue;
                const n = parseInt(f.basename.slice(prefix.length), 10);
                if (!isNaN(n) && n > max) max = n;
            }
            return max;
        };

        for (const file of allFiles) {
            // 기존 사본 있으면 재사용
            const existing = this.getCopiedFileFromBase(file, projectPath);
            if (existing instanceof TFile) {
                map.set(file, existing.basename);
                continue;
            }

            // 없으면 새 번호 할당
            const set = this.getSetFromFile(file);
            if (!set) continue; // 호출자가 보장하지만 방어

            if (!setMax.has(set)) setMax.set(set, scanSetMax(set));
            const next = setMax.get(set)! + 1;
            setMax.set(set, next);
            map.set(file, `${set}-${next}`);
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

        if (!this.getSetFromFile(activeFile)) {
            new Notice('base에 set(.으로 시작하는 값)이 없습니다.');
            return;
        }

        // bodyLinks 분리
        const bodyLinks = this.getBodyLinks(activeFile);
        const validBodyLinks: TFile[] = [];
        const excludedBodyLinks: TFile[] = [];
        for (const f of bodyLinks) {
            if (this.getSetFromFile(f)) validBodyLinks.push(f);
            else excludedBodyLinks.push(f);
        }

        // 번호 맵 구축
        const allFiles = [activeFile, ...validBodyLinks];
        const fileToBasename = this.buildUploadedNameMap(allFiles, proj.path);

        // 규칙 위반 감지 (기존 사본이 {set}-숫자 패턴이 아니면 중단)
        const violations: string[] = [];
        for (const file of allFiles) {
            const existing = this.getCopiedFileFromBase(file, proj.path);
            if (!(existing instanceof TFile)) continue;
            const set = this.getSetFromFile(file)!;
            if (!this.isValidCopyBasename(existing.basename, set)) {
                violations.push(existing.basename);
            }
        }
        if (violations.length > 0) {
            new Notice(`수동 편집된 사본이 있어 중단합니다: ${violations.join(', ')}`);
            return;
        }

        // nameMap 파생
        const nameToBasename = new Map(
            [...fileToBasename].map(([f, b]) => [f.name, b])
        );

        // 모달 표시용 데이터
        const activeFileCopy = this.getCopiedFileFromBase(activeFile, proj.path);
        const isReupload = activeFileCopy instanceof TFile;
        const existingDates = isReupload ? this.getCopiedUploadTime(activeFileCopy) : '';
        const mainTitle = frontmatter['title'] ?? '';

        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;

        const allUploadPaths = allFiles.map(f => {
            const cache = this.plugin.app.metadataCache.getFileCache(f);
            const t = cache?.frontmatter?.['title'] ?? '';
            return {
                title: typeof t === 'string' ? t : '',
                path: `${proj.path}/${fileToBasename.get(f)!}.md`
            };
        });

        // newFileCount: 새로 생기는 사본 개수
        let newFileCount = isReupload ? 0 : 1;
        for (const f of validBodyLinks) {
            if (!(this.getCopiedFileFromBase(f, proj.path) instanceof TFile)) newFileCount++;
        }

        new ProjectUploadModal(
            this.plugin.app,
            mainTitle,
            allUploadPaths,
            excludedBodyLinks,
            isReupload,
            existingDates,
            newFileCount,
            proj.displayName,
            currentCopyCount,
            async () => {
                await this.executeUpload(allFiles, proj, fileToBasename, nameToBasename);
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

        // uploadedLinks와 사본 경로를 한 번에 구성
        const bodyLinks = this.getBodyLinks(activeFile);
        const copiedPathMap = new Map<TFile, string>();
        const uploadedLinks: TFile[] = [];
        for (const f of bodyLinks) {
            const copy = this.getCopiedFileFromBase(f, proj.path);
            if (copy instanceof TFile) {
                uploadedLinks.push(f);
                copiedPathMap.set(f, copy.path);
            }
        }

        const currentCopyCount = this.plugin.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(proj.path + '/')).length;

        new ProjectRemoveModal(
            this.plugin.app,
            typeof title === 'string' ? title : '',
            existingCopy.path,
            existingDates,
            uploadedLinks,
            copiedPathMap,
            proj.displayName,
            currentCopyCount,
            async (selectedFiles: TFile[]) => {
                await this.executeRemove([activeFile, ...selectedFiles], proj);
            }
        ).open();
    }

    private async executeUpload(
        allFiles: TFile[],
        proj: { path: string; displayName: string },
        fileToBasename: Map<TFile, string>,
        nameToBasename: Map<string, string>
    ): Promise<void> {
        // 주의: 이 함수는 metadataCache를 쓰지 않음.
        // 모든 정보는 주입받은 Map과 vault 직접 read로 처리하여
        // 파일 수정 직후 캐시 갱신 지연의 영향을 받지 않음.
        try {
            // 1. 사본 생성
            for (const file of allFiles) {
                const targetPath = `${proj.path}/${fileToBasename.get(file)!}.md`;
                await this.copyFile(file, targetPath);
                await this.processCopiedBase(targetPath);
            }
    
            // 2. 사본 본문 링크 재작성
            for (const file of allFiles) {
                const targetPath = `${proj.path}/${fileToBasename.get(file)!}.md`;
                await this.rewriteBodyLinks(targetPath, nameToBasename);
            }
    
            // 3. 기존 사본 링크 갱신
            await this.updateExistingCopies(nameToBasename, proj);
    
            // 4. 원본 base 갱신
            for (const file of allFiles) {
                const targetPath = `${proj.path}/${fileToBasename.get(file)!}.md`;
                await this.updateOriginalBase(file, targetPath);
            }
    
            new Notice(`${allFiles.length}개 파일을 ${proj.displayName}에 추가했습니다.`);
        } catch (error) {
            console.error('executeUpload 실패:', error);
            new Notice(`업로드 중 오류 발생: ${error instanceof Error ? error.message : String(error)}. 재업로드를 시도해주세요.`);
        }
    }

    private async executeRemove(
        allFiles: TFile[],
        proj: { path: string; displayName: string }
    ): Promise<void> {
        try {
            for (const file of allFiles) {
                const copiedFile = this.getCopiedFileFromBase(file, proj.path);
                if (!(copiedFile instanceof TFile)) continue;
                const linkPath = copiedFile.path.replace(/\.md$/, '');
                await this.plugin.app.vault.delete(copiedFile);
                await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    const base = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
                    frontmatter['base'] = base.filter(
                        (v: unknown) => !(typeof v === 'string' && v === `[[${linkPath}]]`)
                    );
                });
            }
            new Notice(`${allFiles.length}개 파일을 ${proj.displayName}에서 내렸습니다.`);
        } catch (error) {
            console.error('executeRemove 실패:', error);
            new Notice(`내리기 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
        }
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
            sortBase(filtered);
            frontmatter['base'] = filtered;
            frontmatter['uploadtime'] = moment().format('YYYY-MM-DD HH:mm');
            return buildDocument(frontmatter, body);
        });
    }

    private async rewriteBodyLinks(targetPath: string, nameToBasename: Map<string, string>): Promise<void> {
        const { vault } = this.plugin.app;
        const copiedFile = vault.getAbstractFileByPath(targetPath);
        if (!(copiedFile instanceof TFile)) return;

        await vault.process(copiedFile, (data) => {
            return data.replace(/\[\[([^\]|#^]+)((?:#[^\]|^]*)|(?:\^[^\]|]*))?(?:\|[^\]]*)?\]\]/g, (match, name, frag) => {
                const trimmed = (name as string).trim();
                const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
                const newBasename = nameToBasename.get(fileName);
                if (!newBasename) return match;
                return frag ? `[[${newBasename}${frag}]]` : `[[${newBasename}]]`;
            });
        });
    }

    private async updateExistingCopies(
        nameToBasename: Map<string, string>,
        proj: { path: string }
    ): Promise<void> {
        const { vault } = this.plugin.app;
        const folder = vault.getAbstractFileByPath(proj.path);
        if (!(folder instanceof TFolder)) return;

        // 이번에 올린 사본은 제외 (사본의 basename이 nameToBasename의 값에 포함됨)
        const newBasenames = new Set(nameToBasename.values());
        const existingCopies = vault.getMarkdownFiles().filter(f =>
            f.path.startsWith(proj.path + '/') && !newBasenames.has(f.basename)
        );

        const contents = await Promise.all(existingCopies.map(f => vault.read(f)));
        const toWrite: { file: TFile; content: string }[] = [];

        for (let i = 0; i < existingCopies.length; i++) {
            const file = existingCopies[i];
            const original = contents[i];
            if (!file || !original) continue;

            const rewritten = original.replace(/\[\[([^\]|#^]+)((?:#[^\]|^]*)|(?:\^[^\]|]*))?(?:\|[^\]]*)?\]\]/g, (match, name, frag) => {
                const trimmed = (name as string).trim();
                const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
                const newBasename = nameToBasename.get(fileName);
                if (!newBasename) return match;
                return frag ? `[[${newBasename}${frag}]]` : `[[${newBasename}]]`;
            });

            if (rewritten !== original) toWrite.push({ file, content: rewritten });
        }

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
    constructor(
        app: App,
        private title: string,
        private allUploadPaths: { title: string; path: string }[],
        private excludedBodyLinks: TFile[],
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

        // 헤더 정보
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

        // 경로 목록
        const pathListEl = contentEl.createDiv({ cls: 'project-modal-path-list' });
        for (const { title, path } of this.allUploadPaths) {
            const text = title ? `${title}: ${path}` : path;
            pathListEl.createEl('div', { text, cls: 'project-modal-path-item' });
        }

        // 제외된 노트
        if (this.excludedBodyLinks.length > 0) {
            const excludedEl = contentEl.createDiv({ cls: 'project-modal-excluded' });
            excludedEl.createEl('div', {
                text: '⚠ 아래 노트는 set이 없어 제외됩니다',
                cls: 'project-modal-excluded-header'
            });
            for (const file of this.excludedBodyLinks) {
                excludedEl.createEl('div', {
                    text: `· ${file.basename}`,
                    cls: 'project-modal-excluded-item'
                });
            }
        }

        // 버튼
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
class ProjectRemoveModal extends Modal {
    private checkboxes: Map<TFile, HTMLInputElement> = new Map();
    private pathListEl!: HTMLElement;
    private summaryCountEl!: HTMLElement;

    constructor(
        app: App,
        private title: string,
        private copiedPath: string,
        private existingDates: string,
        private uploadedLinks: TFile[],
        private copiedPathMap: Map<TFile, string>,
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
        this.summaryCountEl.setText(`${this.projectDisplayName} (${this.currentCopyCount}) -${n}`);
    }

    private renderPathList() {
        this.pathListEl.empty();
        const mainEntry = { title: this.title, path: this.copiedPath };
        const selectedEntries = this.uploadedLinks
            .filter(f => this.checkboxes.get(f)?.checked)
            .map(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                const t = cache?.frontmatter?.['title'];
                return {
                    title: typeof t === 'string' ? t : '',
                    path: this.copiedPathMap.get(f) ?? ''
                };
            });

        for (const { title, path } of [mainEntry, ...selectedEntries]) {
            const text = title ? `${title}: ${path}` : path;
            this.pathListEl.createEl('div', { text, cls: 'project-modal-path-item project-modal-path-item--remove' });
        }
    }

    onClose() { this.contentEl.empty(); }
}
