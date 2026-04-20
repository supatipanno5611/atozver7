import {
    Plugin, App, Editor, MarkdownView, WorkspaceLeaf, Notice, TFile,
    PluginSettingTab, Setting
} from 'obsidian';
import { ATOZSettings, DEFAULT_SETTINGS } from './types';
import { SelectionFeature } from './features/Selection';
import { MoveCursorFeature } from './features/MoveCursor';
import { ExecutesFeature } from './features/Executes';
import { CertainMdFeature } from './features/CertainMd';
import { CursorCenterFeature } from './features/CursorCenter';
import { HeadingNavigaterFeature } from './features/HeadingNavigater';
import { PropertiesFeature } from './features/Properties';
import { CutCopyFeature } from './features/CutCopy';
import { CycleTabFeature } from './features/CycleTab';
import { SaveMDFeature } from './features/SaveMD';
import { SnippetsFeature, SnippetsSuggestions } from './features/Snippets';
import { SymbolsFeature, SymbolSuggestions } from './features/Symbols';
import { WorkFeature } from './features/Work';
import { CutCreateNewMdFeature } from './features/CutCreateNewMd';
import { DATE_PATTERN, URL_PATTERN, INTERNAL_LINK_PATTERN } from './utils';
import { Project } from './features/Project';
import { MobileFeature } from './features/Mobile';

export default class ATOZVER6Plugin extends Plugin {
    settings: ATOZSettings;
    selection: SelectionFeature;
    moveCursor: MoveCursorFeature;
    executes: ExecutesFeature;
    certainMd: CertainMdFeature;
    cursorCenter: CursorCenterFeature;
    headingNavigater: HeadingNavigaterFeature;
    properties: PropertiesFeature;
    cutCopy: CutCopyFeature;
    cycleTab: CycleTabFeature;
    saveMD: SaveMDFeature;
    snippets: SnippetsFeature;
    symbols: SymbolsFeature;
    work: WorkFeature;
    cutCreateNewMd: CutCreateNewMdFeature;
    project: Project;
    mobile: MobileFeature;

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
        this.saveMD = new SaveMDFeature(this);
        this.snippets = new SnippetsFeature(this);
        this.symbols = new SymbolsFeature(this);
        this.work = new WorkFeature(this);
        this.cutCreateNewMd = new CutCreateNewMdFeature(this);
        this.project = new Project(this);
        this.mobile = new MobileFeature(this);

        this.addSettingTab(new ATOZSettingTab(this.app, this));
        this.registerRibbonIcon();
        this.registerCommands();
        this.registerEvents();

        this.registerEditorSuggest(new SnippetsSuggestions(this));
        this.registerEditorSuggest(new SymbolSuggestions(this));

        this.app.workspace.onLayoutReady(() => {
            this.baseCandidates = this.collectBaseCandidates();
            this.mobile.install();
        });
    }

    onunload() {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
            this.saveSettings();
        }
        this.mobile.uninstall();
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    debouncedSave() {
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveSettings();
            this.saveTimer = null;
        }, 300);
    }

    collectBaseCandidates(): string[] {
        const candidates = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(file);
            const base = cache?.frontmatter?.['base'];
            if (Array.isArray(base)) {
                for (const v of base) {
                    if (
                        typeof v === 'string' &&
                        !DATE_PATTERN.test(v) &&
                        !URL_PATTERN.test(v) &&
                        !INTERNAL_LINK_PATTERN.test(v)
                    ) {
                        candidates.add(v);
                    }
                }
            }
        }
        return [...candidates];
    }

    registerRibbonIcon() {
        this.addRibbonIcon("lucide-save", "세이브 파일 만들기", () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.saveMD.createSaveFile(activeFile);
            } else {
                new Notice("활성화된 파일이 없습니다.");
            }
        });
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', () => this.work.openWorkFile());
    }

    registerCommands() {
        // [CertainMd]
        this.addCommand({ id: 'open-certain-md', name: '특정 마크다운 파일 열기', callback: () => this.certainMd.openCertainMdFile() });

        // [CursorCenter]
        this.addCommand({ id: 'toggle-cursor-center', name: '커서 중앙 유지 토글', callback: () => this.cursorCenter.toggleCursorCenter() });

        // [CutCopy]
        this.addCommand({ id: 'copy-all-document', name: '문서 전체 복사', editorCallback: (editor) => this.cutCopy.copyAll(editor) });
        this.addCommand({ id: 'cut-all-document', name: '문서 전체 잘라내기', editorCallback: (editor: Editor) => this.cutCopy.cutAll(editor) });
        this.addCommand({ id: "cut-to-clipboard", name: "잘라내기", icon: "lucide-scissors", hotkeys: [{ modifiers: ["Mod"], key: "X" }], editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, true) });
        this.addCommand({ id: "copy-to-clipboard", name: "복사하기", icon: "copy", hotkeys: [{ modifiers: ["Mod"], key: "C" }], editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, false) });

        // [CutCreateNewMd]
        this.addCommand({ id: 'cut-and-create-new-md', name: '내용을 잘라내어 새 노트 만들기', icon: 'lucide-file-input', editorCallback: (editor: Editor) => this.cutCreateNewMd.cutAndCreateNewMd(editor) });

        // [CycleTab]
        this.addCommand({ id: 'cycle-tabs', name: '탭 순환', callback: () => this.cycleTab.cycleAllTabs() });

        // [Executes]
        this.addCommand({ id: 'execute-delete-paragraph', name: '단락 제거', icon: 'lucide-trash-2', hotkeys: [{ modifiers: ["Mod"], key: "Delete" }], callback: () => this.executes.executeDeleteParagraph() });
        this.addCommand({ id: 'focus-root-leaf', name: '메인 에디터에 포커스', callback: () => this.executes.focusRootLeaf() });

        // [HeadingNavigater]
        this.addCommand({ id: 'go-to-previous-heading', name: '이전 heading으로 이동', icon: 'lucide-square-chevron-up', editorCallback: (editor: Editor, view: MarkdownView) => this.headingNavigater.moveHeading(editor, view, 'prev') });
        this.addCommand({ id: 'go-to-next-heading', name: '다음 heading으로 이동', icon: 'lucide-square-chevron-down', editorCallback: (editor: Editor, view: MarkdownView) => this.headingNavigater.moveHeading(editor, view, 'next') });

        // [MoveCursor]
        this.addCommand({ id: 'move-cursor-to-end', name: '커서를 문서 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToEnd(editor) });
        this.addCommand({ id: 'move-cursor-to-start', name: '커서를 문서 처음으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToStart(editor) });
        this.addCommand({ id: 'go-to-line-start', name: '커서를 행 시작으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineStart(editor) });
        this.addCommand({ id: 'go-to-line-end', name: '커서를 행 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineEnd(editor) });

        // [Project]
        this.addCommand({ id: 'add-file-to-project', name: '현재 파일을 프로젝트에 추가', callback: () => this.project.addActiveFileToProject() });
        this.addCommand({ id: 'remove-file-from-project', name: '현재 파일을 프로젝트에서 내리기', callback: () => this.project.removeActiveFileFromProject() });

        // [Properties]
        this.addCommand({ id: "insert-properties", name: "속성 삽입", icon: "lucide-table-of-contents", callback: () => this.properties.insertProperties() });
        this.addCommand({ id: "lint-properties", name: "속성 정리", icon: "lucide-list-x", callback: () => this.properties.lintProperties() });
        this.addCommand({
            id: 'refresh-base-candidates',
            name: 'base 후보 캐시 재수집',
            callback: () => {
                this.baseCandidates = this.collectBaseCandidates();
                new Notice('base 후보를 재수집했습니다.');
            }
        });

        // [SaveMD]
        this.addCommand({ id: "create-save-file", name: "현재 문서의 세이브 파일 만들기", checkCallback: (checking: boolean) => this.saveMD.checkCreateSaveFile(checking) });
        this.addCommand({ id: 'set-auto-save-target', name: '현재 문서를 n타마다 자동 세이브 대상으로 지정', callback: () => this.saveMD.handleSetAutoSaveTarget() });
        this.addCommand({ id: 'unset-auto-save-target', name: '현재 문서를 n타마다 자동 세이브 대상에서 해제', callback: () => this.saveMD.handleUnsetAutoSaveTarget() });

        // [Selection]
        this.addCommand({ id: 'expand-selection-left-end', name: '선택 범위 행 시작까지 늘리기', icon: "lucide-chevrons-left", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowLeft" }], editorCallback: (editor: Editor) => this.selection.expandLeftEnd(editor) });
        this.addCommand({ id: 'expand-selection-right-end', name: '선택 범위 행 끝까지 늘리기', icon: "lucide-chevrons-right", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowRight" }], editorCallback: (editor: Editor) => this.selection.expandRightEnd(editor) });

        // [Snippets]
        this.addCommand({ id: 'add-to-snippets', name: '조각글 추가', icon: 'lucide-clipboard-plus', editorCallback: (editor: Editor) => { this.snippets.addSnippet(editor.getSelection()); } });
        this.addCommand({ id: 'remove-from-snippets', name: '조각글 제거', icon: 'lucide-clipboard-minus', editorCallback: (editor: Editor) => { this.snippets.removeSnippet(editor.getSelection()); } });

        // [Work]
        this.addCommand({ id: 'open-work-file', name: '작업 문서 열기', callback: () => this.work.openWorkFile() });
        this.addCommand({ id: 'open-later-file', name: '보관 문서 열기', callback: () => this.work.openLaterFile() });
        this.addCommand({ id: 'close-all-tabs', name: '모든 탭 닫기', callback: () => this.work.cleanupTabs() });
        this.addCommand({ id: 'backup-and-clear-work', name: '작업 문서 정리', icon: 'lucide-brush-cleaning', callback: async () => {
            const result = await this.work.readWorkContent();
            if (!result) return;
            if (result.content.trim()) {
                await this.work.backupAndClear(result.file, result.content);
            }
        }});
    }

    registerEvents() {
        // [CursorCenter]
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.settings.isCursorCenterEnabled) {
                    this.cursorCenter.scrollToCursorCenter(editor);
                }
            })
        );

        // [CutCopy] file menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                menu.addItem((item) => {
                    item.setTitle("문서 전체 복사").setIcon("copy").onClick(async () => {
                        if (file instanceof TFile) {
                            const content = await this.app.vault.read(file);
                            await navigator.clipboard.writeText(content);
                            new Notice(`${file.name} 문서 전체가 복사되었습니다.`);
                        }
                    });
                });
            })
        );

        // [SaveMD] Keyboard Events
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.saveMD.handleAbnormalInput(evt);
            this.saveMD.handleAutoSaveInput(evt);
        });

        // [Symbols] Backspace Event
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.symbols.handleSmartBackspace(evt);
        }, true);
    }
}

// =========================================================================
// Setting Tab
// =========================================================================

export class ATOZSettingTab extends PluginSettingTab {
    plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(statusMsg?: { text: string; isError?: boolean }): void {
        const { containerEl } = this;
        containerEl.empty();

        let jsonString = JSON.stringify(this.plugin.settings, null, 2);

        const textarea = containerEl.createEl('textarea', { cls: 'atoz-settings-textarea' });
        textarea.value = jsonString;
        textarea.addEventListener('input', () => { jsonString = textarea.value; });

        const statusSetting = new Setting(containerEl)
            .setName('저장 및 초기화')
            .setDesc(statusMsg?.text ?? '변경 사항을 적용하거나 되돌립니다.')
            .addButton((btn) =>
                btn.setButtonText('변경 사항 적용').setCta().onClick(async () => {
                    try {
                        const parsedSettings = JSON.parse(jsonString);
                        this.plugin.settings = Object.assign({}, this.plugin.settings, parsedSettings);
                        await this.plugin.saveSettings();
                        this.display({ text: '✅ 설정이 성공적으로 저장되었습니다.' });
                    } catch (e) {
                        statusSetting.setDesc('⚠️ JSON 문법 오류로 설정을 저장할 수 없습니다.');
                    }
                })
            )
            .addButton((btn) =>
                btn.setButtonText('초기화').setWarning().onClick(async () => {
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    await this.plugin.saveSettings();
                    this.display({ text: '🔄 초기값으로 복구 완료' });
                })
            );
    }
}
