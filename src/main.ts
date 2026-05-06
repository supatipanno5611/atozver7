import { Editor, Notice, Plugin, TFile } from 'obsidian';
import { CertainMdFeature } from './features/CertainMd';
import { CursorCenterFeature } from './features/CursorCenter';
import { CutCopyFeature } from './features/CutCopy';
import { CutCreateNewMdFeature } from './features/CutCreateNewMd';
import { CycleTabFeature } from './features/CycleTab';
import { ExecutesFeature } from './features/Executes';
import { HeadingNavigaterFeature } from './features/HeadingNavigater';
import { MobileFeature } from './features/Mobile';
import { MoveCursorFeature } from './features/MoveCursor';
import { ProjectIngest } from './features/ProjectIngest';
import { ProjectKeeper } from './features/ProjectKeeper';
import { ProjectVisibility } from './features/ProjectVisibility';
import { PropertiesFeature } from './features/Properties';
import { SelectionFeature } from './features/Selection';
import { SnippetsFeature, SnippetsSuggestions } from './features/Snippets';
import { SymbolsFeature, SymbolSuggestions } from './features/Symbols';
import { TimestampFeature } from './features/Timestamp';
import { WorkFeature } from './features/Work';
import { ATOZSettingTab } from './setting';
import { ATOZSettings, DEFAULT_SETTINGS } from './types';
import { DATE_PATTERN, INTERNAL_LINK_PATTERN, URL_PATTERN } from './utils';

export default class ATOZVER6Plugin extends Plugin {
    settings!: ATOZSettings;
    selection!: SelectionFeature;
    moveCursor!: MoveCursorFeature;
    executes!: ExecutesFeature;
    certainMd!: CertainMdFeature;
    cursorCenter!: CursorCenterFeature;
    headingNavigater!: HeadingNavigaterFeature;
    properties!: PropertiesFeature;
    cutCopy!: CutCopyFeature;
    cycleTab!: CycleTabFeature;
    snippets!: SnippetsFeature;
    symbols!: SymbolsFeature;
    work!: WorkFeature;
    cutCreateNewMd!: CutCreateNewMdFeature;
    projectIngest!: ProjectIngest;
    projectKeeper!: ProjectKeeper;
    projectVisibility!: ProjectVisibility;
    mobile!: MobileFeature;
    timestamp!: TimestampFeature;

    baseCandidates: string[] = [];
    private saveTimer: number | null = null;

    async onload() {
        await this.loadSettings();

        this.selection = new SelectionFeature(this);
        this.moveCursor = new MoveCursorFeature(this);
        this.executes = new ExecutesFeature(this);
        this.certainMd = new CertainMdFeature(this);
        this.cursorCenter = new CursorCenterFeature(this);
        this.headingNavigater = new HeadingNavigaterFeature(this);
        this.properties = new PropertiesFeature(this);
        this.cutCopy = new CutCopyFeature(this);
        this.cycleTab = new CycleTabFeature(this);
        this.snippets = new SnippetsFeature(this);
        this.symbols = new SymbolsFeature(this);
        this.work = new WorkFeature(this);
        this.cutCreateNewMd = new CutCreateNewMdFeature(this);
        this.projectIngest = new ProjectIngest(this);
        this.projectKeeper = new ProjectKeeper(this);
        this.projectVisibility = new ProjectVisibility(this);
        this.mobile = new MobileFeature(this);
        this.timestamp = new TimestampFeature(this);

        this.addSettingTab(new ATOZSettingTab(this.app, this));
        this.registerRibbonIcon();
        this.registerCommands();
        this.registerEvents();

        this.registerEditorSuggest(new SnippetsSuggestions(this));
        this.registerEditorSuggest(new SymbolSuggestions(this));

        this.app.workspace.onLayoutReady(() => {
            this.baseCandidates = this.collectBaseCandidates();
            this.projectVisibility.install();
            this.mobile.install();
        });
    }

    onunload() {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
            void this.saveSettings();
        }
        this.projectVisibility.uninstall();
        this.mobile.uninstall();
    }

    async loadSettings() {
        const loadedData: unknown = await this.loadData();
        const data = typeof loadedData === 'object' && loadedData !== null ? loadedData : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data) as ATOZSettings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    debouncedSave() {
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            void this.saveSettings();
            this.saveTimer = null;
        }, 300);
    }

    collectBaseCandidates(): string[] {
        const candidates = new Set<string>();

        for (const file of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            const base = frontmatter?.base;
            if (!Array.isArray(base)) continue;

            for (const value of base) {
                if (
                    typeof value === 'string' &&
                    !DATE_PATTERN.test(value) &&
                    !URL_PATTERN.test(value) &&
                    !INTERNAL_LINK_PATTERN.test(value)
                ) {
                    candidates.add(value);
                }
            }
        }

        return [...candidates];
    }

    registerRibbonIcon() {
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', () => void this.work.openWorkFile());
        this.addRibbonIcon('lucide-inbox', '보관 문서 열기', () => void this.work.openLaterFile());
        this.addRibbonIcon('lucide-folder-sync', '프로젝트 폴더 숨김 토글', () => void this.projectVisibility.toggleProjectFolderHidden());
    }

    registerCommands() {
        this.addCommand({ id: 'open-certain-md', name: '특정 마크다운 파일 열기', callback: () => void this.certainMd.openCertainMdFile() });
        this.addCommand({ id: 'toggle-cursor-center', name: '커서 중앙 유지 토글', callback: () => this.cursorCenter.toggleCursorCenter() });

        this.addCommand({ id: 'copy-all-document', name: '문서 전체 복사', editorCallback: (editor) => this.cutCopy.copyAll(editor) });
        this.addCommand({ id: 'cut-all-document', name: '문서 전체 잘라내기', editorCallback: (editor: Editor) => this.cutCopy.cutAll(editor) });
        this.addCommand({ id: 'cut-to-clipboard', name: '잘라내기', icon: 'lucide-scissors', editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, true) });
        this.addCommand({ id: 'copy-to-clipboard', name: '복사하기', icon: 'copy', editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, false) });

        this.addCommand({ id: 'cut-and-create-new-md', name: '내용을 잘라내어 새 노트 만들기', icon: 'lucide-file-input', editorCallback: (editor: Editor) => void this.cutCreateNewMd.cutAndCreateNewMd(editor) });
        this.addCommand({ id: 'cycle-tabs', name: '탭 순환', callback: () => this.cycleTab.cycleAllTabs() });

        this.addCommand({ id: 'execute-delete-paragraph', name: '단락 제거', icon: 'lucide-trash-2', callback: () => this.executes.executeDeleteParagraph() });
        this.addCommand({ id: 'focus-root-leaf', name: '메인 에디터에 포커스', callback: () => void this.executes.focusRootLeaf() });

        this.addCommand({ id: 'go-to-previous-heading', name: '이전 heading으로 이동', icon: 'lucide-square-chevron-up', editorCallback: (editor, view) => this.headingNavigater.moveHeading(editor, view, 'prev') });
        this.addCommand({ id: 'go-to-next-heading', name: '다음 heading으로 이동', icon: 'lucide-square-chevron-down', editorCallback: (editor, view) => this.headingNavigater.moveHeading(editor, view, 'next') });

        this.addCommand({ id: 'move-cursor-to-end', name: '커서를 문서 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToEnd(editor) });
        this.addCommand({ id: 'move-cursor-to-start', name: '커서를 문서 시작으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToStart(editor) });
        this.addCommand({ id: 'go-to-line-start', name: '커서를 행 시작으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineStart(editor) });
        this.addCommand({ id: 'go-to-line-end', name: '커서를 행 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineEnd(editor) });

        this.addCommand({ id: 'add-file-to-project', name: '현재 파일을 프로젝트에 추가', callback: () => void this.projectIngest.addActiveFileToProject() });
        this.addCommand({ id: 'remove-file-from-project', name: '현재 파일을 프로젝트에서 제거', callback: () => void this.projectKeeper.removeActiveFileFromProject() });
        this.addCommand({ id: 'verify-project-integrity', name: '프로젝트 무결성 검증', callback: () => void this.projectKeeper.verifyIntegrity() });
        this.addCommand({ id: 'toggle-project-folder-visibility', name: '프로젝트 폴더 숨김 토글', icon: 'lucide-folder-sync', callback: () => void this.projectVisibility.toggleProjectFolderHidden() });

        this.addCommand({ id: 'insert-properties', name: '속성 삽입', icon: 'lucide-table-of-contents', callback: () => void this.properties.insertProperties() });
        this.addCommand({ id: 'lint-properties', name: '속성 정리', icon: 'lucide-list-x', callback: () => void this.properties.lintProperties() });
        this.addCommand({
            id: 'refresh-base-candidates',
            name: 'base 후보 캐시 재수집',
            callback: () => {
                this.baseCandidates = this.collectBaseCandidates();
                new Notice('Base candidates refreshed.');
            },
        });

        this.addCommand({ id: 'expand-selection-left-end', name: '선택 범위 행 시작까지 늘리기', icon: 'lucide-chevrons-left', editorCallback: (editor: Editor) => this.selection.expandLeftEnd(editor) });
        this.addCommand({ id: 'expand-selection-right-end', name: '선택 범위 행 끝까지 늘리기', icon: 'lucide-chevrons-right', editorCallback: (editor: Editor) => this.selection.expandRightEnd(editor) });

        this.addCommand({ id: 'merge-timestamp-lines', name: '타임스탬프 행 병합', editorCallback: (editor: Editor) => this.timestamp.mergeTimestampLines(editor) });

        this.addCommand({ id: 'add-to-snippets', name: '조각글 추가', icon: 'lucide-clipboard-plus', editorCallback: (editor: Editor) => { void this.snippets.addSnippet(editor.getSelection()); } });
        this.addCommand({ id: 'remove-from-snippets', name: '조각글 제거', icon: 'lucide-clipboard-minus', editorCallback: (editor: Editor) => { void this.snippets.removeSnippet(editor.getSelection()); } });

        this.addCommand({ id: 'open-work-file', name: '작업 문서 열기', callback: () => void this.work.openWorkFile() });
        this.addCommand({ id: 'open-later-file', name: '보관 문서 열기', callback: () => void this.work.openLaterFile() });
        this.addCommand({ id: 'close-all-tabs', name: '모든 탭 닫기', callback: () => void this.work.cleanupTabs() });
        this.addCommand({
            id: 'backup-and-clear-work',
            name: '작업 문서 정리',
            icon: 'lucide-brush-cleaning',
            callback: () => void this.backupAndClearWork(),
        });
    }

    private async backupAndClearWork(): Promise<void> {
        const result = await this.work.readWorkContent();
        if (!result || !result.content.trim()) return;
        await this.work.backupAndClear(result.file, result.content);
    }

    registerEvents() {
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.settings.isCursorCenterEnabled) {
                    this.cursorCenter.scrollToCursorCenter(editor);
                }
            }),
        );

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                menu.addItem((item) => {
                    item.setTitle('Copy whole document')
                        .setIcon('copy')
                        .onClick(() => {
                            void this.copyWholeDocument(file);
                        });
                });
            }),
        );

        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.symbols.handleSmartBackspace(evt);
        }, true);
    }

    private async copyWholeDocument(file: unknown): Promise<void> {
        if (!(file instanceof TFile)) return;
        const content = await this.app.vault.read(file);
        await navigator.clipboard.writeText(content);
        new Notice(`Copied ${file.name}.`);
    }
}
