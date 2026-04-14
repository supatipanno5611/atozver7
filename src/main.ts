import {
    Plugin, App, Editor, MarkdownView, WorkspaceLeaf, Notice, TFile,
    PluginSettingTab, Setting, Platform
} from 'obsidian';
import { ATOZSettings, DEFAULT_SETTINGS } from './types';
import { SelectionFeature } from './features/Selection';
import { MoveCursorFeature } from './features/MoveCursor';
import { ExecutesFeature } from './features/Executes';
import { GraphFeature } from './features/Graph';
import { CertainMdFeature } from './features/CertainMd';
import { CursorCenterFeature } from './features/CursorCenter';
import { HeadingNavigaterFeature } from './features/HeadingNavigater';
import { OrdinaryFeature } from './features/Ordinary';
import { PropertiesFeature } from './features/Properties';
import { CutCopyFeature } from './features/CutCopy';
import { CyclePinTabFeature } from './features/CyclePinTab';
import { SaveMDFeature } from './features/SaveMD';
import { SnippetsFeature, SnippetsSuggestions } from './features/Snippets';
import { SymbolsFeature, SymbolSuggestions } from './features/Symbols';
import { TrashFeature } from './features/Trash';
import { WorkFeature } from './features/Work';
import { TaskPlanFeature } from './features/TaskPlan';
import { CutCreateNewMdFeature } from './features/CutCreateNewMd';
import { URL_PATTERN, INTERNAL_LINK_PATTERN, DATE_PATTERN } from './utils';
import { ViriyaFeature } from './features/ViriyaFeature';
import { TitleSuggestions } from './features/Title';
import { NewNoteFeature } from './features/NewNote';
import { SwitcherFeature } from './features/Switcher';
import { MobileFeature } from './features/Mobile';

export default class ATOZVER6Plugin extends Plugin {
    settings: ATOZSettings;
    selection: SelectionFeature;
    moveCursor: MoveCursorFeature;
    executes: ExecutesFeature;
    graph: GraphFeature;
    certainMd: CertainMdFeature;
    cursorCenter: CursorCenterFeature;
    headingNavigater: HeadingNavigaterFeature;
    ordinary: OrdinaryFeature;
    properties: PropertiesFeature;
    cutCopy: CutCopyFeature;
    cyclePinTab: CyclePinTabFeature;
    saveMD: SaveMDFeature;
    snippets: SnippetsFeature;
    symbols: SymbolsFeature;
    trash: TrashFeature;
    work: WorkFeature;
    taskPlan: TaskPlanFeature;
    cutCreateNewMd: CutCreateNewMdFeature;
    viriya: ViriyaFeature;
    newNote: NewNoteFeature;
    switcher: SwitcherFeature;
    mobile: MobileFeature;
    
    baseCandidates: string[] = [];
    titleCandidates: Map<string, string> = new Map();

    // Snippets/Symbols debounced save timer
    private saveTimer: number | null = null;

    // 플러그인 로드 시 실행
    async onload() {
        await this.loadSettings();
        this.selection = new SelectionFeature(this);
        this.moveCursor = new MoveCursorFeature(this);
        this.executes = new ExecutesFeature(this);
        this.graph = new GraphFeature(this);
        this.certainMd = new CertainMdFeature(this);
        this.cursorCenter = new CursorCenterFeature(this);
        this.headingNavigater = new HeadingNavigaterFeature(this);
        this.ordinary = new OrdinaryFeature(this);
        this.properties = new PropertiesFeature(this);
        this.cutCopy = new CutCopyFeature(this);
        this.cyclePinTab = new CyclePinTabFeature(this);
        this.saveMD = new SaveMDFeature(this);
        this.snippets = new SnippetsFeature(this);
        this.symbols = new SymbolsFeature(this);
        this.trash = new TrashFeature(this);
        this.work = new WorkFeature(this);
        this.taskPlan = new TaskPlanFeature(this);
        this.cutCreateNewMd = new CutCreateNewMdFeature(this);
        this.viriya = new ViriyaFeature(this);
        this.newNote = new NewNoteFeature(this);
        this.switcher = new SwitcherFeature(this);
        this.mobile = new MobileFeature(this);
        // --- 설정 탭 등록 ---
        this.addSettingTab(new ATOZSettingTab(this.app, this));

        // --- 리본 아이콘 등록 ---
        this.registerRibbonIcon();

        // --- 명령어 등록 ---
        this.registerCommands();

        // --- 이벤트 등록 ---
        this.registerEvents();

        // --- Editor Suggesters 등록 ---
        this.registerEditorSuggest(new SnippetsSuggestions(this));
        this.registerEditorSuggest(new SymbolSuggestions(this));
        this.registerEditorSuggest(new TitleSuggestions(this));

        // --- Startup Logic (Work Plugin) ---
        /**
         * 시작 시 실행되는 순차 로직.
         * setTimeout 대신 onLayoutReady 이후 바로 실행하되,
         * 각 단계를 명시적으로 순서대로 await 처리합니다.
         */
        this.app.workspace.onLayoutReady(async () => {

        	// [Properties] vault 전체 base, title  값 수집
        	this.baseCandidates = this.collectBaseCandidates();
        	this.titleCandidates = this.collectTitleCandidates();

        	// [Mobile] add mobile override
        	this.mobile.install({
        	    onTitleSwitcher: () => this.switcher.openTitleSwitcher(),
        	    onNewNote: () => this.newNote.open(),
        	});

            // [Ordinary] 시작 시 ordinary 탭이 열려 있으면 닫기
            const ordinaryPath = this.settings.ordinaryFilePath;
            const ordinaryLeaves: WorkspaceLeaf[] = [];
            this.app.workspace.iterateRootLeaves((leaf) => {
                if (leaf.view instanceof MarkdownView &&
                    leaf.view.file?.path === ordinaryPath) {
                    ordinaryLeaves.push(leaf);
                }
            });
            ordinaryLeaves.forEach(leaf => leaf.detach());
        });
    }

    // 플러그인 언로드 시 실행
    onunload() {
        // 저장 대기 중인 타이머가 있으면 즉시 실행 후 정리
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
            this.saveSettings();
        }

        // 플러그인 비활성화 시 스타일이 남아있지 않도록 클래스 제거
        this.mobile.uninstall();
    }

    // 설정 로드/저장
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

    // --- base 캐시 수집 메서드 ---
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

    // --- title 캐시 수집 메서드 ---
    collectTitleCandidates(): Map<string, string> {
        const map = new Map<string, string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(file);
            const title = cache?.frontmatter?.['title'];
            if (typeof title === 'string' && title.trim()) {
                map.set(title, file.path);
            }
        }
        return map;
    }

    // =========================================================================
    // 1. Register Methods
    // =========================================================================

    registerRibbonIcon() {
    	// [CertainMd]
    	this.addRibbonIcon("lucide-code", "특정 마크다운 파일 열기", () => this.certainMd.openCertainMdFile())
        // [Graph]
        this.addRibbonIcon("lucide-git-branch", "오른쪽 사이드바에 로컬 그래프뷰 열기", () => this.graph.toggleLocalGraphInSidebar());
        this.addRibbonIcon("lucide-git-fork", "오른쪽 사이드바에 그래프뷰 열기", () => this.graph.toggleGlobalGraphInSidebar());

        // [Ordinary]
        this.addRibbonIcon('calendar', '일상노트 열기', () => this.ordinary.openFileOrdinary());

        // [SaveMD]
        this.addRibbonIcon("lucide-save", "세이브 파일 만들기", () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.saveMD.createSaveFile(activeFile);
            } else {
                new Notice("활성화된 파일이 없습니다.");
            }
        });

        // [TaskPlan]
        this.addRibbonIcon('lucide-square-check', '할 일 문서 열기', () => {
            this.taskPlan.openTaskPlanFile(this.settings.taskFilePath);
        });
        this.addRibbonIcon('lucide-book-text', '계획 문서 열기', () => {
            this.taskPlan.openTaskPlanFile(this.settings.planFilePath);
        });

        // [Trash]
        this.addRibbonIcon('lucide-trash', '휴지통 문서 사이드바 토글', () => this.trash.toggleTrashFileInRightSidebar());

        // [Work]
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', () => this.work.openWorkFile());
        this.addRibbonIcon('lucide-file-pen-line', '백업 문서 사이드바 토글', () => this.work.toggleLaterFileInRightSidebar());
    }

    registerCommands() {
    	// [CertainMd]
    	this.addCommand({ id: 'open-certain-md', name: '특정 마크다운 파일 열기', callback: () => this.certainMd.openCertainMdFile()});

        // [CursorCenter]
        this.addCommand({ id: 'toggle-cursor-center', name: '커서 중앙 유지 토글', callback: () => this.cursorCenter.toggleCursorCenter()});

        // [CutCopy]
        this.addCommand({ id: 'copy-all-document', name: '문서 전체 복사', editorCallback: (editor) => this.cutCopy.copyAll(editor) });
        this.addCommand({ id: 'cut-all-document', name: '문서 전체 잘라내기', editorCallback: (editor: Editor) => this.cutCopy.cutAll(editor) });
        this.addCommand({ id: "cut-to-clipboard", name: "잘라내기", icon: "lucide-scissors", hotkeys: [{ modifiers: ["Mod"], key: "X" }], editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, true) });
        this.addCommand({ id: "copy-to-clipboard", name: "복사하기", icon: "copy", hotkeys: [{ modifiers: ["Mod"], key: "C" }], editorCallback: (editor) => this.cutCopy.handleCutCopy(editor, false) });

        // [CutCreateNewMd]
        this.addCommand({ id: 'cut-and-create-new-md', name: '내용을 잘라내어 새 노트 만들기', icon: 'lucide-file-input', editorCallback: (editor: Editor) => this.cutCreateNewMd.cutAndCreateNewMd(editor) });

        // [CyclePinTab]
        this.addCommand({ id: 'cycle-tabs-context-aware', name: '상황별 탭 순환', callback: () => this.cyclePinTab.cycleTabsContextAware() });
        this.addCommand({ id: 'jump-between-pinned-unpinned', name: '고정 탭과 일반 탭 사이 건너가기', callback: () => this.cyclePinTab.smartJump() });

        // [Executes]
        this.addCommand({ id: 'execute-delete-paragraph', name: '단락 제거', icon: 'lucide-trash-2', hotkeys: [{ modifiers: ["Mod"], key: "Delete" }], callback: () => this.executes.executeDeleteParagraph() });

        // [Graph]
        this.addCommand({ id: 'open-localgraph-in-sidebar', name: '오른쪽 사이드바에 로컬 그래프뷰 열기', callback: () => this.graph.toggleLocalGraphInSidebar() });
        this.addCommand({ id: 'open-graph-in-sidebar', name: '오른쪽 사이드바에 그래프뷰 열기', callback: () => this.graph.toggleGlobalGraphInSidebar() });

        // [Heading Navigater]
        // 1. 이전 헤딩으로 이동 명령 등록
        this.addCommand({
            id: 'go-to-previous-heading',
            name: '이전 heading으로 이동',
            icon: 'lucide-square-chevron-up',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.headingNavigater.moveHeading(editor, view, 'prev');
            },
        });

        // 2. 다음 헤딩으로 이동 명령 등록
        this.addCommand({
            id: 'go-to-next-heading',
            name: '다음 heading으로 이동',
            icon: 'lucide-square-chevron-down',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.headingNavigater.moveHeading(editor, view, 'next');
            },
        });
        
        // [MoveCursor]
        this.addCommand({ id: 'move-cursor-to-end', name: '커서를 문서 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToEnd(editor) });
        this.addCommand({ id: 'move-cursor-to-start', name: '커서를 문서 처음으로 이동', editorCallback: (editor: Editor) => this.moveCursor.moveCursorToStart(editor) });
        this.addCommand({ id: 'go-to-line-start', name: '커서를 행 시작으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineStart(editor), });
        this.addCommand({ id: 'go-to-line-end', name: '커서를 행 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursor.goToLineEnd(editor), });

        // [NewNote]
        this.addCommand({
            id: 'new-note',
            name: '새 노트 생성',
            icon: 'lucide-file-plus',
            callback: () => this.newNote.open()
        });

        this.addCommand({
            id: 'sync-sets',
            name: 'set 목록 동기화',
            icon: 'lucide-refresh-cw',
            callback: () => this.newNote.syncSets()
        });

        // [Ordinary]
        this.addCommand({ id: 'open-ordinary-file', name: '일상노트 열기', callback: () => this.ordinary.openFileOrdinary() });

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
        this.addCommand({ id: 'expand-selection-left-end', name: '선택 범위 행 시작까지 늘리기', icon: "lucide-chevrons-left", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowLeft"}], editorCallback: (editor: Editor) => this.selection.expandLeftEnd(editor) });
        this.addCommand({ id: 'expand-selection-right-end', name: '선택 범위 행 끝까지 늘리기', icon: "lucide-chevrons-right", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowRight"}], editorCallback: (editor: Editor) => this.selection.expandRightEnd(editor) });

        // [Snippets]
        this.addCommand({ id: 'add-to-snippets', name: '조각글 추가', icon: 'lucide-clipboard-plus', editorCallback: (editor: Editor) => { this.snippets.addSnippet(editor.getSelection()); } });
        this.addCommand({ id: 'remove-from-snippets', name: '조각글 제거', icon: 'lucide-clipboard-minus', editorCallback: (editor: Editor) => { this.snippets.removeSnippet(editor.getSelection()); } });

        // [Switcher]
        this.addCommand({
            id: 'open-title-switcher',
            name: '빠른 탐색기 열기',
            hotkeys: [{ modifiers: ["Mod"], key: "O" }],
            callback: () => this.switcher.openTitleSwitcher()
        });

        // [TaskPlan]
        this.addCommand({ id: 'smart-toggle-task-plan', name: '할 일 계획 스마트 토글', callback: () => this.taskPlan.openTaskPlanSmart() });
        this.addCommand({ id: 'move-line-taskplan', name: '할 일 이동', icon: 'lucide-arrow-left-right', editorCallback: (editor: Editor, view: MarkdownView) => this.taskPlan.handleLineMove(editor, view) });

        // [Trash]
        this.addCommand({ id: 'toggle-trash-file-sidebar', name: '휴지통 문서 사이드바 토글', callback: () => this.trash.toggleTrashFileInRightSidebar() });

        // [Work]
        this.addCommand({ id: 'open-work-file', name: '작업 문서 열기', callback: () => this.work.openWorkFile() });
        this.addCommand({ id: 'toggle-later-file-sidebar', name: '백업 문서 사이드바 토글', callback: () => this.work.toggleLaterFileInRightSidebar() });
        this.addCommand({ id: 'close-all-tabs', name: '모든 탭 닫기', callback: () => this.work.cleanupTabs() });
        this.addCommand({ id: 'backup-and-clear-work', name: '작업 문서 정리', icon: 'lucide-brush-cleaning', callback: async () => {
            const result = await this.work.readWorkContent();
            if (!result) return;
            if (result.content.trim()) {
                await this.work.backupAndClear(result.file, result.content);
            }
        }});

        // [Viriya]
        this.addCommand({
            id: 'add-file-to-viriya',
            name: '현재 파일을 viriya에 추가',
            icon: 'lucide-file-up',
            callback: () => this.viriya.addActiveFileToViriya()
        });
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

        // [CutCopy] 문서 전체 복사 file menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                menu.addItem((item) => {
                    item
                        .setTitle("문서 전체 복사")
                        .setIcon("copy")
                        .onClick(async () => {
                            if (file instanceof TFile) {
                                const content = await this.app.vault.read(file);
                                await navigator.clipboard.writeText(content);
                                new Notice(`${file.name} 문서 전체가 복사되었습니다.`);
                            }
                        });
                })
            })
        );

        // [CyclePinTab]
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (this.cyclePinTab.isInternalNavigation || !leaf) return;
                this.cyclePinTab.recordLeafHistory(leaf);
            })
        );

        // [SaveMD] Keyboard Events
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.saveMD.handleAbnormalInput(evt);
            this.saveMD.handleAutoSaveInput(evt);
        });

        // [SaveMD] File Menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile){
                    menu.addItem((item) => {
                    item.setTitle("현재 문서의 세이브 파일 만들기")
                        .setIcon("save")
                        .onClick(async () => { await this.saveMD.createSaveFile(file); });
                    });
                }
            })
        );

        // [Work] File Menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu) => {
                menu.addItem((item) => {
                    item.setTitle("모든 탭 닫기")
                        .setIcon("lucide-x")
                        .onClick(() => this.work.cleanupTabs());
                });
            })
        );

        // [Symbols] Backspace Event
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.symbols.handleSmartBackspace(evt);
        }, true);
    }
}

// =========================================================================
// 2. Setting Tab
// =========================================================================

// [AtoZ] settingtab class
export class ATOZSettingTab extends PluginSettingTab {
    plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(statusMsg?: { text: string; isError?: boolean }): void {
        const { containerEl } = this;
        containerEl.empty();

        // 현재 설정값을 보기 좋게 들여쓰기 된 JSON 문자열로 변환
        let jsonString = JSON.stringify(this.plugin.settings, null, 2);

        // textarea를 직접 추가
        const textarea = containerEl.createEl('textarea', {
            cls: 'atoz-settings-textarea'
        });
        textarea.value = jsonString;
        textarea.addEventListener('input', () => {
            jsonString = textarea.value;
        });

        // 상태 메시지를 표시할 Setting 요소를 변수로 보관
        const statusSetting = new Setting(containerEl)
            .setName('저장 및 초기화')
            .setDesc(statusMsg?.text ?? '변경 사항을 적용하거나 되돌립니다.') // 초기 안내 문구
            .addButton((btn) =>
                btn
                    .setButtonText('변경 사항 적용')
                    .setCta() // Call To Action (강조 색상)
                    .onClick(async () => {
                    try {
                        // JSON 파싱 시도
                        const parsedSettings = JSON.parse(jsonString);
                        // 설정 객체 업데이트 (기존 설정에 덮어씌우기)
                        this.plugin.settings = Object.assign({}, this.plugin.settings, parsedSettings);
                        // 파일로 저장
                        await this.plugin.saveSettings();
                        // Notice 대신 desc 영역에 메시지 표시
                        this.display({ text: '✅ 설정이 성공적으로 저장되었습니다.' });
                    } catch (e) {
                        // 실패 시엔 display() 없이 desc만 교체 (Notice는 띄우지 않음)
                        statusSetting.setDesc('⚠️ JSON 문법 오류로 설정을 저장할 수 없습니다.');
                    }
                })
            )
            .addButton((btn) =>
                btn
                    .setButtonText('초기화')
                    .setWarning() // 경고 색상
                    .onClick(async () => {
                        // 현재 설정을 기본값(DEFAULT_SETTINGS)으로 덮어씌우기
                        // JSON.parse/stringify를 사용하여 깊은 복사(Deep Copy)를 수행, 참조 문제를 방지합니다.
                        this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

                        // 초기화된 설정을 파일에 저장
                        await this.plugin.saveSettings();

                        // 화면 새로고침 (초기화된 값이 텍스트박스에 표시됨)
                        this.display({ text: '🔄 초기값으로 복구 완료' });
                    })
            );
    }
}
