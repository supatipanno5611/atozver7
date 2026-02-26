import {
    Plugin, App, Editor, MarkdownView, WorkspaceLeaf, Notice, TFile, 
    moment, normalizePath, parseYaml, EditorPosition, EditorSelection, 
    EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, HeadingCache,
    prepareFuzzySearch, SuggestModal, PluginSettingTab, Setting, FileView, stringifyYaml, Modal
} from 'obsidian';

// --- [Interfaces] ---

// 1. Settings Inteface Integration
interface ATOZSettings {
    // Auto Date
    AutoDateCopyPaths: string[];
    AutoDateCopyFormat: string;

    // Certain Md
    CertainMdPath: string;
    
    // Cursor Center
    isCursorCenterEnabled: boolean;
    
    // Ordinary
    ordinaryFilePath: string;
    
    // Properties
    userproperties: Record<string, string>;
    
    // SaveMD
    saveMdMaxRepeat: number;
    saveMdAutoSaveTrigger: number;
    saveMdAutoSaveTarget: string;
    saveMdFolderPath: string;
    saveMdDateFormat: string;
    
    // Snippets
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
    
    // Symbols
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    symbolPairs: Record<string, string>;
    recentSymbols: Record<string, number>;
    
    // TaskPlan
    taskFilePath: string;
    planFilePath: string;

    // Trash
    trashFilePath: string
    
    // Work
    workFilePath: string;
    laterFilePath: string;
    workTimestampFormat: string;
}

// Sub-interfaces
interface SnippetsItem { content: string; }
interface SymbolItem { id: string; symbol: string; closing?: string; }
interface ParsedDocument {
    frontmatter: Record<string, any>; // 파싱된 프론트매터 객체 (없으면 빈 객체)
    body: string;                     // 프론트매터를 제외한 순수 본문
}

// 2. Default Settings
const DEFAULT_SETTINGS: ATOZSettings = {
    // Auto Date
    AutoDateCopyPaths: [
        "how/viriya 운영법.md"
    ],
    AutoDateCopyFormat: "YYYY-MM-DD",

    // CertainMd
    CertainMdPath: 'how/termux.md',

    // Cursor Center
    isCursorCenterEnabled: false,
    
    // Ordinary
    ordinaryFilePath: 'ordinary.md',
    
    // Properties
    userproperties: {
        "aliases": "[]",
        "base": "[]",
        "tags": "[]"
    },
    
    // SaveMD
    saveMdMaxRepeat: 150,
    saveMdAutoSaveTrigger: 500,
    saveMdAutoSaveTarget: "",
    saveMdFolderPath: "save",
    saveMdDateFormat: "YYYYMMDDHHmmss",
    
    // Snippets
    snippetTrigger: "\\",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {},
    
    // Symbols
    symbolTrigger: "/",
    symbolLimit: 5,
    symbols: [
        { id: "\"", symbol: "“", closing: "”" },
        { id: "'", symbol: "‘", closing: "’" },
        { id: "...", symbol: "⋯" },
        { id: "-", symbol: "—" },
        { id: ",", symbol: "·" },
        { id: ">>", symbol: "”" },
        { id: ">", symbol: "’" },
        { id: "낫", symbol: "｢", closing: "｣" },
        { id: "end>", symbol: "｣" },
        { id: "겹", symbol: "『", closing: "』" },
        { id: "end>>", symbol: "』" },
    ],
    symbolPairs: {
        "“": "”",
        "‘": "’",
        "｢": "｣",
        "『": "』"
    },
    recentSymbols: {},
    
    // TaskPlan
    taskFilePath: 'task.md',
    planFilePath: 'plan.md',

    // Trash
    trashFilePath: 'trash.md',
    
    // Work
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    workTimestampFormat: 'MM/DD HH:mm:ss'
};

export default class ATOZVER6Plugin extends Plugin {
    settings: ATOZSettings;

    // --- State Variables ---

    // Auto Date State
    private originalWriteText: any;
    
    // CyclePinnedTabs State
    private lastPinnedPath: string | null = null;
    private lastUnpinnedPath: string | null = null;
    private isInternalNavigation: boolean = false;

    // SaveMD State
    private lastKey: string = "";
    private repeatCount: number = 0;
    private totalKeyCount: number = 0;

    // Snippets/Symbols State
    private saveTimer: number | null = null;

    // Trash State
    private isTrashToggling = false;

    // Work State
    private isWorkLaterToggling = false;

    // 플러그인 로드 시 실행
    async onload() {
        await this.loadSettings();
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

        // --- Startup Logic (Work Plugin) ---
        /**
         * 시작 시 실행되는 순차 로직.
         * setTimeout 대신 onLayoutReady 이후 바로 실행하되,
         * 각 단계를 명시적으로 순서대로 await 처리합니다.
         */
        this.app.workspace.onLayoutReady(async () => {
            // 이미 열려 있는 탭이 작업 파일이면 초기화 로직 건너뛰기
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file?.path === this.settings.taskFilePath) {
                return;
            }
            
            // 모든 탭 닫기 -> 작업 파일 백업 및 초기화 -> 작업 파일 열기 순으로 진행
            const result = await this.readWorkContent();
            if (!result) return;
            if (result.content.trim()) {
                const success = await this.backupAndClear(result.file, result.content);
                if (!success) return;
            }

            // 이미 열린 work 탭이 있으면 재사용, 없으면 새로 열기
            const workPath = this.settings.workFilePath;
            let existingLeaf: WorkspaceLeaf | null = null;
            this.app.workspace.iterateRootLeaves((leaf) => {
                if (leaf.view instanceof MarkdownView &&
                    leaf.view.file?.path === workPath) {
                    existingLeaf = leaf;
                }
            });

            if (existingLeaf) {
                const leaf = existingLeaf as WorkspaceLeaf;
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                (leaf.view as MarkdownView).editor.focus();
            } else {
                await this.openWorkFile();
            }
        });
    }

    // 플러그인 언로드 시 실행
    onunload() {
        // 저장 대기 중인 타이머가 있으면 즉시 실행 후 정리
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
            // 언로드 시점에 미저장 변경사항이 있을 수 있으므로 동기 저장 시도
            this.saveSettings();
        }

        // CyclePinTab 관련 상태 초기화
        this.lastPinnedPath = null;
        this.lastUnpinnedPath = null;
        // Auto Date 관련 상태 초기화
        if (this.originalWriteText) {
            navigator.clipboard.writeText = this.originalWriteText;
        }
    }

    // 설정 로드/저장
    async loadSettings() {
        const loadedData = await this.loadData();
        // 중첩 객체 병합 (Properties userproperties 등)
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
        if (loadedData?.userproperties) {
            this.settings.userproperties = {
                ...DEFAULT_SETTINGS.userproperties,
                ...loadedData.userproperties
            };
        }
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

    // =========================================================================
    // 1. Register Methods
    // =========================================================================

    registerRibbonIcon() {
        // [Graph]
        this.addRibbonIcon("lucide-git-branch", "오른쪽 사이드바에 로컬 그래프뷰 열기", () => this.toggleLocalGraphInSidebar());
        this.addRibbonIcon("lucide-git-fork", "오른쪽 사이드바에 그래프뷰 열기", () => this.toggleGlobalGraphInSidebar());
        
        // [Ordinary]
        this.addRibbonIcon('calendar', '일상노트 열기', () => this.openFileOrdinary());

        // [SaveMD]
        this.addRibbonIcon("lucide-save", "세이브 파일 만들기", () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.createSaveFile(activeFile);
            } else {
                new Notice("활성화된 파일이 없습니다.");
            }
        });

        // [TaskPlan]
        this.addRibbonIcon('lucide-square-check', '할 일 문서 열기', () => {
            this.openTaskPlanFile(this.settings.taskFilePath);
        });
        this.addRibbonIcon('lucide-book-text', '계획 문서 열기', () => {
            this.openTaskPlanFile(this.settings.planFilePath);
        });

        // [Trash]
        this.addRibbonIcon('lucide-trash', '휴지통 문서 사이드바 토글', () => this.toggleTrashFileInRightSidebar());

        // [Work]
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', async () => {
            await this.cleanupTabs();
            const result = await this.readWorkContent();
            if (!result) return;
            if (result.content.trim()) {
                const success = await this.backupAndClear(result.file, result.content);
                if (!success) return;
            }
            await this.openWorkFile();
        });
        this.addRibbonIcon('lucide-file-pen-line', '백업 문서 사이드바 토글', () => this.toggleLaterFileInRightSidebar());
    }

    registerCommands() {
    	// [CertainMd]
    	this.addCommand({ id: 'open-certain-md', name: '특정 마크다운 파일 열기', callback: () => this.openCertainMdFile()});

        // [CursorCenter]
        this.addCommand({ id: 'toggle-cursor-center', name: '커서 중앙 유지 토글', callback: () => this.toggleCursorCenter()});

        // [CutCopy]
        this.addCommand({ id: 'copy-all-document', name: '문서 전체 복사', editorCallback: (editor) => this.copyAll(editor) });
        this.addCommand({ id: 'cut-all-document', name: '문서 전체 잘라내기', editorCallback: (editor: Editor) => this.cutAll(editor) });
        this.addCommand({ id: "cut-to-clipboard", name: "잘라내기", icon: "lucide-scissors", hotkeys: [{ modifiers: ["Mod"], key: "X" }], editorCallback: (editor) => this.handleCutCopy(editor, true) });
        this.addCommand({ id: "copy-to-clipboard", name: "복사하기", icon: "copy", hotkeys: [{ modifiers: ["Mod"], key: "C" }], editorCallback: (editor) => this.handleCutCopy(editor, false) });

        // [CutCreateNewMd]
        this.addCommand({ id: 'cut-and-create-new-md', name: '내용을 잘라내어 새 노트 만들기', icon: 'lucide-file-input', editorCallback: (editor: Editor) => this.cutAndCreateNewMd(editor) });

        // [CyclePinTab]
        this.addCommand({ id: 'cycle-tabs-context-aware', name: '상황별 탭 순환', callback: () => this.cycleTabsContextAware() });
        this.addCommand({ id: 'jump-between-pinned-unpinned', name: '고정 탭과 일반 탭 사이 건너가기', callback: () => this.smartJump() });

        // [Executes]
        this.addCommand({ id: 'execute-delete-paragraph', name: '단락 제거', icon: 'lucide-trash-2', hotkeys: [{ modifiers: ["Mod"], key: "Delete" }], callback: () => this.executeDeleteParagraph() });

        // [Graph]
        this.addCommand({ id: 'open-localgraph-in-sidebar', name: '오른쪽 사이드바에 로컬 그래프뷰 열기', callback: () => this.toggleLocalGraphInSidebar() });
        this.addCommand({ id: 'open-graph-in-sidebar', name: '오른쪽 사이드바에 그래프뷰 열기', callback: () => this.toggleGlobalGraphInSidebar() });

        // [Heading Navigater]
        // 1. 이전 헤딩으로 이동 명령 등록
        this.addCommand({
            id: 'go-to-previous-heading',
            name: '이전 heading으로 이동',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.moveHeading(editor, view, 'prev');
            },
        });

        // 2. 다음 헤딩으로 이동 명령 등록
        this.addCommand({
            id: 'go-to-next-heading',
            name: '다음 heading으로 이동',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.moveHeading(editor, view, 'next');
            },
        });

        // [MoveCursor]
        this.addCommand({ id: 'move-cursor-to-end', name: '커서를 문서 끝으로 이동', editorCallback: (editor: Editor) => this.moveCursorToEnd(editor) });
        this.addCommand({ id: 'move-cursor-to-start', name: '커서를 문서 처음으로 이동', editorCallback: (editor: Editor) => this.moveCursorToStart(editor) });

        // [Ordinary]
        this.addCommand({ id: 'open-ordinary-file', name: '일상노트 열기', callback: () => this.openFileOrdinary() });

        // [Properties]
        this.addCommand({ id: "insert-properties", name: "속성 삽입", icon: "help", editorCallback: (editor: Editor) => this.insertProperties(editor) });

        // [SaveMD]
        this.addCommand({ id: "create-save-file", name: "현재 문서의 세이브 파일 만들기", checkCallback: (checking: boolean) => this.checkCreateSaveFile(checking) });
        this.addCommand({ id: 'set-auto-save-target', name: '현재 문서를 n타마다 자동 세이브 대상으로 지정', callback: () => this.handleSetAutoSaveTarget() });
        this.addCommand({ id: 'unset-auto-save-target', name: '현재 문서를 n타마다 자동 세이브 대상에서 해제', callback: () => this.handleUnsetAutoSaveTarget() });

        // [Selection]
        this.addCommand({ id: 'expand-selection-left', name: '선택 범위 왼쪽으로 한 칸 늘리기', icon: "lucide-chevron-left", hotkeys: [{ modifiers: ["Mod"], key: "ArrowLeft"}], editorCallback: (editor: Editor) => this.expandLeft(editor) });
        this.addCommand({ id: 'expand-selection-left-end', name: '선택 범위 행 시작까지 늘리기', icon: "lucide-chevrons-left", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowLeft"}], editorCallback: (editor: Editor) => this.expandLeftEnd(editor) });
        this.addCommand({ id: 'expand-selection-right', name: '선택 범위 오른쪽으로 한 칸 늘리기', icon: "lucide-chevron-right", hotkeys: [{ modifiers: ["Mod"], key: "ArrowRight"}], editorCallback: (editor: Editor) => this.expandRight(editor) });
        this.addCommand({ id: 'expand-selection-right-end', name: '선택 범위 행 끝까지 늘리기', icon: "lucide-chevrons-right", hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowRight"}], editorCallback: (editor: Editor) => this.expandRightEnd(editor) });

        // [Snippets]
        this.addCommand({ id: 'add-to-snippets', name: '조각글 추가', icon: 'lucide-clipboard-plus', editorCallback: (editor: Editor) => { this.addSnippet(editor.getSelection()); } });
        this.addCommand({ id: 'remove-from-snippets', name: '조각글 제거', icon: 'lucide-clipboard-minus', editorCallback: (editor: Editor) => { this.removeSnippet(editor.getSelection()); } });

        // [TaskPlan]
        this.addCommand({ id: 'smart-toggle-task-plan', name: '할 일 계획 스마트 토글', callback: () => this.openTaskPlanSmart() });
        this.addCommand({ id: 'move-line-taskplan', name: '할 일 이동', icon: 'lucide-arrow-left-right', editorCallback: (editor: Editor, view: MarkdownView) => this.handleLineMove(editor, view) });

        // [Trash]
        this.addCommand({ id: 'toggle-trash-file-sidebar', name: '휴지통 문서 사이드바 토글', callback: () => this.toggleTrashFileInRightSidebar() });

        // [Work]
        this.addCommand({ id: 'open-work-file', name: '작업 문서 열기', callback: async () => {
            await this.cleanupTabs();
            const result = await this.readWorkContent();
            if (!result) return;
            if (result.content.trim()) {
                const success = await this.backupAndClear(result.file, result.content);
                if (!success) return;
            }
            await this.openWorkFile();
        }});
        this.addCommand({ id: 'toggle-later-file-sidebar', name: '백업 문서 사이드바 토글', callback: () => this.toggleLaterFileInRightSidebar() });
        this.addCommand({ id: 'close-all-tabs', name: '모든 탭 닫기', callback: () => this.cleanupTabs() });
    }

    registerEvents() {
        // [Auto Date]
        // [기능 1] 드래그 + 단축키 복사 처리
        this.registerDomEvent(document, 'copy', (evt: ClipboardEvent) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile || !this.settings.AutoDateCopyPaths.includes(activeFile.path)) return;

            const selectionObj = window.getSelection();
            if (!selectionObj || selectionObj.rangeCount === 0) return;
            
            const selectionText = selectionObj.toString();
            const targetFormat = this.settings.AutoDateCopyFormat;

            // 설정된 포맷 문자열이 포함되어 있는지 확인
            if (!selectionText.includes(targetFormat)) return;

            const today = moment().format(targetFormat);
            
            // 정규식 특수문자 에러를 방지하기 위해 split.join을 사용해 전체 문자열 치환
            const newText = selectionText.split(targetFormat).join(today);

            if (evt.clipboardData) {
                evt.clipboardData.setData('text/plain', newText);
                evt.preventDefault(); 
                evt.stopPropagation(); 
                
                new Notice('단축키 복사: 날짜가 오늘로 변환되었습니다!');
            }
        }, { capture: true }); 

        // [기능 2] '복사' 버튼 처리 (클립보드 API 하이재킹)
        this.originalWriteText = navigator.clipboard.writeText; 
        
        navigator.clipboard.writeText = async (text: string) => {
            const activeFile = this.app.workspace.getActiveFile();
            const targetFormat = this.settings.AutoDateCopyFormat;
            
            // 지정된 경로 파일이고, 복사될 내용에 설정된 포맷이 있다면
            if (activeFile && this.settings.AutoDateCopyPaths.includes(activeFile.path) && text.includes(targetFormat)) {
                const today = moment().format(targetFormat);
                text = text.split(targetFormat).join(today);
                
                new Notice('버튼 복사: 날짜가 오늘로 변환되었습니다!');
            }
            
            return this.originalWriteText.call(navigator.clipboard, text);
        };

        // [CursorCenter]
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.settings.isCursorCenterEnabled) {
                    this.scrollToCursorCenter(editor);
                }
            })
        );
        
        // cutcopy
        // 문서 전체 복사
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
                if (this.isInternalNavigation || !leaf) return;
                this.recordLeafHistory(leaf);
            })
        );

        // [SaveMD] Keyboard Events
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleAbnormalInput(evt);
            this.handleAutoSaveInput(evt);
        });
        
        // [SaveMD] File Menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile){
                    menu.addItem((item) => {
                    item.setTitle("현재 문서의 세이브 파일 만들기")
                        .setIcon("save")
                        .onClick(async () => { await this.createSaveFile(file); });
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
                        .onClick(() => this.cleanupTabs());
                });
            })
        );

        // [Symbols] Backspace Event (combined with SaveMD's listener via separate method call if needed, 
        // but obsidian `registerDomEvent` allows multiple listeners)
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleSmartBackspace(evt);
        }, true);
    }

    // =========================================================================
    // 2. Feature Implementations
    // =========================================================================

	// --- [CertainMd]
	async openCertainMdFile() {
		const { CertainMdPath } = this.settings;

		if (!CertainMdPath) {
			new Notice('CertainMdPath가 설정되지 않았습니다.');
			return;
		}

		// 1. 파일 객체 가져오기
		const file = this.app.vault.getAbstractFileByPath(CertainMdPath);
		
		if (!(file instanceof TFile)) {
			console.error("파일을 찾을 수 없습니다: " + CertainMdPath);
			return;
		}

		// 2. Root 영역의 리프들만 조사하여 이미 열려있는지 확인
		let targetLeaf: WorkspaceLeaf | null = null;
		
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (leaf.view.getState().file === CertainMdPath) {
				targetLeaf = leaf;
			}
		});

		// 3. 결과에 따른 동작
		if (targetLeaf) {
			// 이미 열려 있다면 해당 탭으로 포커스
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
		} else {
			// 어디에도 열려있지 않다면 현재 탭에 열기
			const activeLeaf = this.app.workspace.getLeaf(false);
			if (activeLeaf) {
				await activeLeaf.openFile(file);
			}
		}
	}
	
    // --- [CursorCenter] ---
    async toggleCursorCenter() {
        // 상태 반전 및 저장
        this.settings.isCursorCenterEnabled = !this.settings.isCursorCenterEnabled;
        await this.saveSettings();

        // 활성화 시 즉시 중앙 정렬 실행
        if (this.settings.isCursorCenterEnabled) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) this.scrollToCursorCenter(view.editor);
        }
    }

    // 커서 이동 로직
    private scrollToCursorCenter(editor: Editor) {
        const cursor = editor.getCursor();
        // true 인자는 수직 중앙(Center) 정렬을 의미합니다.
        editor.scrollIntoView({ from: cursor, to: cursor }, true);
    }

    // --- [CutCopy] ---
    // 문서 전체를 복사하는 메서드
    private async copyAll(editor: Editor) {
        // 현재 에디터의 전체 텍스트를 가져옴
        // editor.getValue()는 문서 전체 문자열을 반환
        await navigator.clipboard.writeText(editor.getValue());

        // 사용자에게 복사 완료 알림 표시
        new Notice('문서 전체가 복사되었습니다.');
    }

    // 문서 전체를 잘라내는 메서드 (전체 선택 + 복사 + 삭제와 동일한 동작)
    private async cutAll(editor: Editor) {
        // 현재 문서의 전체 내용을 가져옴
        const content = editor.getValue();

        // 내용이 비어 있으면 아무 작업도 하지 않음
        if (!content) return;

        // 전체 내용을 클립보드에 복사
        await navigator.clipboard.writeText(content);

        // 문서 내용을 전부 비움
        editor.setValue("");

        // 사용자에게 잘라내기 완료 알림 표시
        new Notice('문서 전체를 잘라냈습니다.');
    }

    // 선택 영역이 있으면 해당 영역을,
    // 선택 영역이 없으면 현재 줄 전체를 대상으로 복사/잘라내기 처리
    private async handleCutCopy(editor: Editor, isCut: boolean) {

        // 현재 선택된 텍스트가 있는지 확인
        const hasSelection = editor.getSelection().length > 0;

        // 선택 영역이 없다면
        if (!hasSelection) {
            // 현재 커서 위치를 가져옴
            const cursor = editor.getCursor();

            // 커서가 위치한 "한 줄 전체"를 선택 범위로 설정
            editor.setSelection(
                { line: cursor.line, ch: 0 }, // 줄의 시작
                { line: cursor.line, ch: editor.getLine(cursor.line).length } // 줄의 끝
            );
        }

        // 현재 선택된 텍스트를 가져옴
        const text = editor.getSelection();

        // 선택된 텍스트가 존재하면
        if (text) {

            // 해당 텍스트를 클립보드에 복사
            await navigator.clipboard.writeText(text);

            if (isCut) {
                // 잘라내기 모드라면 선택된 텍스트를 삭제
                editor.replaceSelection("");
            } else if (!hasSelection) {
                // 복사 모드이며, 원래 선택 영역이 없었던 경우
                // (즉, 자동으로 한 줄을 선택했던 경우)
                // 커서를 선택 영역의 끝으로 이동시켜 자연스럽게 정리
                editor.setCursor(editor.getCursor("to"));
            }
        }
    }

    // --- [CutCreateNewMd] ---
    private async cutAndCreateNewMd(editor: Editor) {
        // 1. 내용 추출 (선택 범위 우선, 없으면 전체)
        const hasSelection = editor.somethingSelected();
        let contentToMove: string;
        let startLine: number;
        let endLine: number;

        if (hasSelection) {
            const sel = editor.listSelections()[0];
            if (!sel) return;
            startLine = Math.min(sel.anchor.line, sel.head.line);
            endLine = Math.max(sel.anchor.line, sel.head.line);
            const lines: string[] = [];
            for (let i = startLine; i <= endLine; i++) lines.push(editor.getLine(i));
            contentToMove = lines.join('\n');
        } else {
            startLine = 0;
            endLine = editor.lineCount() - 1;
            contentToMove = editor.getValue();
        }

        // 2. 빈 내용 가드
        if (!contentToMove.trim()) {
            new Notice('이동할 내용이 없습니다.');
            return;
        }

        // 3. 원본 파일 참조 저장 (탭 전환 후에도 사용하기 위해)
        const originalFile = this.app.workspace.getActiveFile();
        if (!originalFile) return;

        const isFullContent = !hasSelection;

        // 4. 모달 열기
        new CutAndCreateModal(this.app, async (filename: string) => {
            try {
                const newPath = normalizePath(`${filename}.md`);

                // 5. vault 루트에 contentToMove를 내용으로 파일 생성
                const newFile = await this.app.vault.create(newPath, contentToMove);

                // 6. 현재 탭을 새 파일로 교체
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(newFile);
                this.app.workspace.setActiveLeaf(leaf, { focus: true });

                // 7. 프로퍼티 삽입 — processFrontMatter가 vault 기준으로 맨 위에 삽입
                const newView = leaf.view as MarkdownView;
                await this.insertProperties(newView.editor);

                // 9. 원본에서 내용 삭제 (모든 작업 성공 후 마지막에 실행)
                if (isFullContent) {
                    await this.app.vault.modify(originalFile, '');
                } else {
                    await this.app.vault.process(originalFile, (data) => {
                        const lines = data.split('\n');
                        lines.splice(startLine, endLine - startLine + 1);
                        return lines.join('\n');
                    });
                }

            } catch (error) {
                console.error(error);
                new Notice('새 노트 생성 중 오류가 발생했습니다.');
            }
        }).open();
    }

    // --- [CyclePinTab] ---
    // --- [핵심 로직 1] 상황별 순환 (Context-Aware Cycle) ---
    private cycleTabsContextAware() {
        const activeLeaf = this.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isPinned = this.getLeafPinnedState(activeLeaf);
        const targetLeaves = this.getLeavesByState(isPinned);

        if (targetLeaves.length <= 1) return;

        const currentIndex = targetLeaves.indexOf(activeLeaf);

        // [엣지 케이스] currentIndex가 -1이면 getMostRecentLeaf()가 반환한 leaf가
        // iterateRootLeaves 범위 밖(사이드바, 특수 뷰 등)에 있는 것이므로 동작 중단
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + 1) % targetLeaves.length;
        const targetLeaf = targetLeaves[nextIndex];

        if (targetLeaf) {
            this.activateLeafSafe(targetLeaf);
        }
    }

    // --- [핵심 로직 2] 영역 건너가기 (Smart Jump) ---
    private smartJump() {
        const activeLeaf = this.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isCurrentPinned = this.getLeafPinnedState(activeLeaf);

        if (isCurrentPinned) {
            // [상황 A] 고정 -> 일반으로 점프
            // 1순위: 마지막으로 사용했던 일반 탭 경로로 leaf 탐색
            const lastUnpinned = this.findLeafByPath(this.lastUnpinnedPath, false);
            if (lastUnpinned) {
                this.activateLeafSafe(lastUnpinned);
                return;
            }
            // 2순위: 가장 최근 사용된 일반 탭
            const fallback = this.pickMostRecentLeaf(this.getLeavesByState(false));
            if (fallback) this.activateLeafSafe(fallback);

        } else {
            // [상황 B] 일반 -> 고정으로 점프
            // 1순위: 마지막으로 사용했던 고정 탭 경로로 leaf 탐색
            const lastPinned = this.findLeafByPath(this.lastPinnedPath, true);
            if (lastPinned) {
                this.activateLeafSafe(lastPinned);
                return;
            }
            // 2순위: 가장 최근 사용된 고정 탭
            const fallback = this.pickMostRecentLeaf(this.getLeavesByState(true));
            if (fallback) this.activateLeafSafe(fallback);
        }
    }

    // --- [헬퍼 함수] ---

    // 탭의 고정 여부를 안전하게 반환
    private getLeafPinnedState(leaf: WorkspaceLeaf): boolean {
        const state = leaf.getViewState ? leaf.getViewState() : null;
        return state ? (state.pinned ?? false) : false;
    }

    // 특정 상태(고정/일반)인 탭들만 리스트로 반환
    private getLeavesByState(wantPinned: boolean): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [];
        this.app.workspace.iterateRootLeaves((leaf) => {
            if (this.getLeafPinnedState(leaf) === wantPinned) {
                leaves.push(leaf);
            }
        });
        return leaves;
    }

    // 현재 열린 파일의 경로를 추출 (파일이 없는 특수 뷰는 null 반환)
    private getLeafPath(leaf: WorkspaceLeaf): string | null {
        const file = (leaf.view as any)?.file;
        return file?.path ?? null;
    }

    // 이력 기록: leaf 참조 대신 파일 경로만 저장
    // 파일이 없는 특수 뷰(그래프, 캘린더 등)는 기록하지 않음
    private recordLeafHistory(leaf: WorkspaceLeaf) {
        const path = this.getLeafPath(leaf);
        if (!path) return;
        // 고정/일반 탭 기록
        if (this.getLeafPinnedState(leaf)) {
            this.lastPinnedPath = path;
        } else {
            this.lastUnpinnedPath = path;
        }
    }

    // 저장된 경로를 기반으로 현재 열린 leaf를 탐색
    // 경로가 null이거나 해당 경로의 탭이 닫혀있으면 null 반환 -> 유효성 문제 자체를 우회
    private findLeafByPath(path: string | null, wantPinned: boolean): WorkspaceLeaf | null {
        if (!path) return null;

        let found: WorkspaceLeaf | null = null;
        this.app.workspace.iterateRootLeaves((leaf) => {
            if (found) return; // 이미 찾았으면 순회 중단
            if (this.getLeafPinnedState(leaf) !== wantPinned) return;
            if (this.getLeafPath(leaf) === path) {
                found = leaf;
            }
        });
        return found;
    }

    // 주어진 leaf 목록 중 가장 최근 사용된 탭을 반환
    // iterateRootLeaves의 순회 순서(UI 순서)가 아닌 사용 이력 기준으로 선택
    private pickMostRecentLeaf(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
        if (leaves.length === 0) return null;

        const recentLeaves: WorkspaceLeaf[] = (this.app.workspace as any).getRecentLeaves?.() ?? [];
        for (const recent of recentLeaves) {
            if (leaves.includes(recent)) return recent;
        }

        // getRecentLeaves를 지원하지 않는 버전에서의 최후 폴백
        return leaves[0] ?? null;
    }

    // 안전하게 탭 활성화 (이벤트 루프 차단)
    // Obsidian의 workspace 이벤트는 동기적으로 발생하므로,
    // setActiveLeaf 호출 전후로 플래그를 관리하면 setTimeout 없이 처리 가능
    private activateLeafSafe(leaf: WorkspaceLeaf) {
        this.isInternalNavigation = true;
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        this.isInternalNavigation = false;
    }

    // --- [Executes] ---
    // 단락 제거
    private executeDeleteParagraph() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();

        // 줄이 하나뿐이면 내용만 지우기
        if (lineCount === 1) {
            editor.setValue('');
            return;
        }

        // 마지막 줄이 아니면: 현재 줄 + 줄바꿈 제거
        if (cursor.line < lineCount - 1) {
            editor.replaceRange('',
                { line: cursor.line, ch: 0 },
                { line: cursor.line + 1, ch: 0 }
            );
        } else {
            // 마지막 줄이면: 앞 줄의 끝부터 현재 줄 끝까지 제거
            editor.replaceRange('',
                { line: cursor.line - 1, ch: editor.getLine(cursor.line - 1).length },
                { line: cursor.line, ch: editor.getLine(cursor.line).length }
            );
        }
    }

    // --- [Graph] ---
    private async toggleLocalGraphInSidebar() {
        const { workspace } = this.app;

        // 1. 오른쪽 사이드바(Right Split)에 'localgraph' 뷰가 있는지 확인
        const existingLeaf = workspace.getLeavesOfType('localgraph').find(
            (l) => l.getRoot() === workspace.rightSplit
        );

        if (existingLeaf) {
            // [Case A] 이미 열려 있다면 -> 닫기 (Detach)
            existingLeaf.detach();
        } else {
            // [Case B] 열려 있지 않다면 -> 열기 (Open)
            // 오른쪽 사이드바의 빈 잎을 가져오거나 생성
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: 'localgraph', active: true });
                // 사이드바가 접혀 있다면 펼쳐서 보여줌
                workspace.revealLeaf(leaf);
            }
        }
    }

    private async toggleGlobalGraphInSidebar() {
        const { workspace } = this.app;

        // 1. 오른쪽 사이드바(Right Split)에 'graph' 뷰가 있는지 확인
        // 'graph'는 전체 그래프의 내부 ID입니다.
        const existingLeaf = workspace.getLeavesOfType('graph').find(
            (l) => l.getRoot() === workspace.rightSplit
        );

        if (existingLeaf) {
            // [Case A] 이미 열려 있다면 -> 닫기 (Detach)
            existingLeaf.detach();
        } else {
            // [Case B] 열려 있지 않다면 -> 열기 (Open)
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: 'graph', active: true });
                // 사이드바가 접혀 있다면 펼쳐서 보여줌
                workspace.revealLeaf(leaf);
            }
        }
    }

    // --- [Heading Navigater]
    private moveHeading(editor: Editor, view: MarkdownView, direction: 'prev' | 'next') {
        const file = view.file;
        if (!file) return;

        // 캐시된 메타데이터에서 헤딩 리스트 가져오기
        const cache = this.app.metadataCache.getFileCache(file);
        const headings = cache?.headings;

        // 예외 처리: 헤딩이 없는 경우
        if (!headings || headings.length === 0) return;

        const currentLine = editor.getCursor().line;
        let targetHeading: HeadingCache | undefined;

        if (direction === 'prev') {
            // [로직] 이전 헤딩 찾기: 현재 줄보다 위(번호가 작은) 헤딩 중 가장 마지막 것
            for (let i = headings.length - 1; i >= 0; i--) {
				const heading = headings[i];
                if (heading && heading.position.start.line < currentLine) {
                    targetHeading = headings[i];
                    break;
                }
            }
            // 찾지 못한 경우(첫 번째 헤딩이거나 그 위일 때) -> 첫 번째 헤딩으로 고정
            if (!targetHeading) targetHeading = headings[0];

        } else {
            // [로직] 다음 헤딩 찾기: 현재 줄보다 아래(번호가 큰) 첫 번째 헤딩
            for (let i = 0; i < headings.length; i++) {
				const heading = headings[i];
                if (heading && heading.position.start.line > currentLine) {
                    targetHeading = headings[i];
                    break;
                }
            }
            // 찾지 못한 경우(마지막 헤딩이거나 그 아래일 때) -> 마지막 헤딩으로 고정
            if (!targetHeading) targetHeading = headings[headings.length - 1];
        }

        // 실제 이동 실행
        if (targetHeading) {
            const targetLine = targetHeading.position.start.line;
            
            // 커서를 해당 줄의 맨 앞으로 이동 {line: 줄번호, ch: 글자위치}
            editor.setCursor({ line: targetLine, ch: 0 });
            
            // 해당 위치가 화면 밖이면 스크롤하여 중앙에 맞춤
            editor.scrollIntoView({
                from: { line: targetLine, ch: 0 },
                to: { line: targetLine, ch: 0 }
            }, true);
        }
    }

    // --- [MoveCursor] ---
    private moveCursorToEnd(editor: Editor) {
        editor.focus();
        const line = editor.lineCount() - 1;
        const pos: EditorPosition = { line, ch: editor.getLine(line).length };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }
    private moveCursorToStart(editor: Editor) {
        editor.focus();
        const pos: EditorPosition = { line: 0, ch: 0 };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }

    // --- [Ordinary] ---
    private async openFileOrdinary() {
        const path = this.settings.ordinaryFilePath;
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        // 원래 값 보존, 메모리상에서만 임시로 false
        const originalCursorCenter = this.settings.isCursorCenterEnabled;
        this.settings.isCursorCenterEnabled = false;

        // 이미 열려 있는 탭이 있다면 focus, 없으면 현재 탭에서 열기
        const existingLeaf = this.app.workspace.getLeavesOfType("markdown")
            .find(leaf => (leaf.view as MarkdownView).file?.path === path);

        const targetLeaf = existingLeaf || this.app.workspace.getLeaf(false);
        await targetLeaf.openFile(file);

        // 헤더 추가
        const editor = (targetLeaf.view as MarkdownView).editor;
        const header = `### ${moment().format("MM월 DD일 (ddd)")}`;
        const content = editor.getValue();

        if (!content.includes(header)) {
            const sep = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "";
            editor.replaceRange(`${sep}${header}\n`, { line: editor.lineCount(), ch: 0 });
        }

        // 스크롤 메서드 호출
        await this.scrollToBottom(editor, originalCursorCenter);
    }

    private async scrollToBottom(editor: Editor, restoreCursorCenter?: boolean) {
        editor.focus();

        // 문서의 가장 마지막 줄과 그 줄의 마지막 글자 위치 계산
        const lastLine = editor.lineCount() - 1;
        const lastChar = editor.getLine(lastLine).length;
        const finalPos: EditorPosition = { line: lastLine, ch: lastChar };

        // 커서 설정 및 스크롤
        editor.setCursor(finalPos);
        editor.scrollIntoView({ from: finalPos, to: finalPos }, true);

        // restoreCursorCenter가 전달된 경우에만 커서 중앙 유지 복원 처리
        if (restoreCursorCenter !== undefined) {
            this.settings.isCursorCenterEnabled = restoreCursorCenter;
        }
    }

    // --- [Properties] ---
    // ──────────────────────────────────────────────
    // [parseDocument]
    //
    // 에디터의 raw 텍스트를 받아 프론트매터와 본문을 분리합니다.
    //
    // 규칙:
    //   - 문서가 "---\n" 으로 시작하고, 이후 어딘가에 닫는 "---" 가 있으면
    //     그 사이를 YAML로 파싱합니다.
    //   - 위 조건을 만족하지 않으면 프론트매터가 없는 것으로 간주하고
    //     전체를 body로 봅니다.
    //   - YAML 파싱 실패 시에도 프론트매터 없는 것으로 간주합니다.
    // ──────────────────────────────────────────────
    private parseDocument(raw: string): ParsedDocument {
        const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;
        const match = raw.match(FRONTMATTER_REGEX);

        if (!match) {
            return { frontmatter: {}, body: raw };
        }

        const yamlString = match[1] ?? '';
        const afterBlock = raw.slice(match[0].length);

        try {
            const parsed = parseYaml(yamlString);
            const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? parsed as Record<string, any>
                : {};
            return { frontmatter, body: afterBlock };
        } catch {
            // YAML 파싱 실패 시 프론트매터 없는 것으로 취급
            return { frontmatter: {}, body: raw };
        }
    }

    // ──────────────────────────────────────────────
    // [buildDocument]
    //
    // 프론트매터 객체와 본문을 받아 완성된 마크다운 문자열을 만듭니다.
    //
    // 출력 형식:
    //   ---
    //   (YAML 내용)
    //   ---
    //                  ← 빈 줄 하나
    //   (본문)
    //
    // 본문이 비어있으면 프론트매터 블록만 반환합니다.
    // ──────────────────────────────────────────────
    private buildDocument(frontmatter: Record<string, any>, body: string): string {
        const yamlString = stringifyYaml(frontmatter).trimEnd();
        const frontmatterBlock = `---\n${yamlString}\n---`;

        if (body.trim().length === 0) {
            return frontmatterBlock;
        }

        // 본문 앞의 불필요한 빈 줄을 제거하고, 프론트매터와 사이에 빈 줄 하나를 둡니다.
        const trimmedBody = body.replace(/^\n+/, '');
        return `${frontmatterBlock}\n${trimmedBody}`;
    }

    // ──────────────────────────────────────────────
    // [mergeProperties]
    //
    // 기존 프론트매터에 설정의 속성을 병합합니다.
    //
    // 규칙:
    //   - 이미 존재하는 키는 절대 건드리지 않습니다. (사용자 데이터 보호)
    //   - 없는 키만 추가합니다.
    //   - 최종 결과는 키를 알파벳 순으로 정렬합니다.
    // ──────────────────────────────────────────────
    private mergeProperties(frontmatter: Record<string, any>): Record<string, any> {
        const result = { ...frontmatter };

        for (const [key, yamlValue] of Object.entries(this.settings.userproperties)) {
            if (result[key] === undefined) {
                try {
                    result[key] = parseYaml(yamlValue.trim());
                } catch {
                    new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                    result[key] = yamlValue;
                }
            }
        }

        // 알파벳 순 정렬
        return Object.fromEntries(
            Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
        );
    }

    // ──────────────────────────────────────────────
    // [insertProperties]  ← 진입점
    //
    // 전체 흐름:
    //   1. editor.getValue() 로 현재 문서 전체를 가져옴
    //   2. parseDocument() 로 프론트매터와 본문을 분리
    //   3. mergeProperties() 로 설정 속성 병합 + 정렬
    //   4. buildDocument() 로 새 문자열 조립
    //   5. editor.setValue() 로 에디터를 한 번에 교체
    //
    // vault / fileManager / metadataCache 에 일절 접근하지 않으므로
    // 캐시 타이밍 문제가 구조적으로 발생하지 않습니다.
    // ──────────────────────────────────────────────
    private insertProperties(editor: Editor): void {
        const raw = editor.getValue();

        const { frontmatter, body } = this.parseDocument(raw);
        const merged = this.mergeProperties(frontmatter);
        const newContent = this.buildDocument(merged, body);

        // 변경 사항이 없으면 에디터를 건드리지 않습니다.
        if (newContent === raw) {
            new Notice("이미 모든 속성이 존재합니다.");
            return;
        }

        // 커서 위치를 기억했다가 setValue 후 복원합니다.
        // 프론트매터가 새로 생긴 경우, 삽입된 줄만큼 커서를 아래로 보정합니다.
        const cursorBefore = editor.getCursor();
        const oldHadFrontmatter = /^---\n/.test(raw);

        editor.setValue(newContent);

        if (!oldHadFrontmatter) {
            // 프론트매터가 새로 삽입됐으므로 삽입된 줄 수를 계산해 커서를 이동합니다.
            const insertedLineCount = newContent.split('\n').findIndex(l => l === '') + 1;
            editor.setCursor({
                line: cursorBefore.line + insertedLineCount,
                ch: cursorBefore.ch
            });
        } else {
            editor.setCursor(cursorBefore);
        }
    }

    // --- [SaveMD] ---
    // 세이브 파일 명령어 활성화 반환 메서드
    private checkCreateSaveFile(checking: boolean) {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
            if (!checking) {
                this.createSaveFile(activeFile);
            }
            return true;
        }
        return false;
    }

    // 자동 저장 대상 지정 메서드
    private async handleSetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("마크다운 문서가 아닙니다.");
            return;
        }

        // 이미 다른 문서가 지정되어 있는지 확인
        if (this.settings.saveMdAutoSaveTarget !== "") {
            // 경로에서 파일명만 추출해서 보여줌
            const currentTargetName = this.settings.saveMdAutoSaveTarget.split('/').pop();
            new Notice(`이미 지정된 문서가 있습니다: ${currentTargetName}\n먼저 해제해주세요.`);
            return;
        }

        // 설정 저장
        this.settings.saveMdAutoSaveTarget = activeFile.path;
        this.totalKeyCount = 0; // 카운트 초기화
        await this.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 시작되었습니다.\n(${this.settings.saveMdAutoSaveTrigger}타 마다 저장)`);
    }

    // 자동 저장 대상 해제 메서드
    private async handleUnsetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        
        // 현재 지정된 타겟이 없는 경우
        if (this.settings.saveMdAutoSaveTarget === "") {
            new Notice("⚠️ 현재 자동 저장 대상으로 지정된 문서가 없습니다.");
            return;
        }

        // 활성 파일이 없거나, 지정된 타겟과 경로가 다를 경우
        if (!activeFile || activeFile.path !== this.settings.saveMdAutoSaveTarget) {
            const currentTargetName = this.settings.saveMdAutoSaveTarget.split('/').pop();
            new Notice(`⚠️ 이 문서는 자동 저장 대상이 아닙니다.\n(현재 대상: ${currentTargetName})`);
            return;
        }

        // 해제 로직
        this.settings.saveMdAutoSaveTarget = "";
        this.totalKeyCount = 0; // 카운트 초기화
        await this.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 해제되었습니다.`);
    }

    // 비정상 입력 감지 관련 코드
    private handleAbnormalInput(evt: KeyboardEvent) {
        // 현재 활성화된 뷰가 마크다운 에디터인지 확인
        const activeView = this.app.workspace.getActiveFile();
        if (!activeView || activeView.extension !== "md") return;

        // 포커스가 실제 에디터 입력창(.cm-content)에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 조합 중인 키(한글 입력 등)나 특수 기능키(Shift, Ctrl 등)는 1차 제외
        if (evt.isComposing || evt.key.length > 1) {
            // 단, 백스페이스나 엔터는 연속 입력 감지에 포함하고 싶다면 예외 처리 가능
            if (evt.key !== "Backspace" && evt.key !== "Enter") return;
        }

        // 연속 입력 로직
        if (this.lastKey === evt.key) {
            this.repeatCount++;
        } else {
            this.lastKey = evt.key;
            this.repeatCount = 1;
        }

        // 임계치 도달 시 긴급 조치
        if (this.repeatCount >= this.settings.saveMdMaxRepeat) {
            this.emergencyAction(activeView);
        }
    }
    // 자동 저장 입력 감지 로직
    private handleAutoSaveInput(evt: KeyboardEvent) {
        // 1. 기능이 비활성화(0)거나 타겟이 설정되지 않았으면 즉시 종료
        if (this.settings.saveMdAutoSaveTrigger <= 0 || this.settings.saveMdAutoSaveTarget === "") return;

        // 2. Modifier 키 제외
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        // 3. [핵심] 현재 문서가 지정된 타겟 문서와 일치하는지 확인 (경로 비교)
        if (activeFile.path !== this.settings.saveMdAutoSaveTarget) return;

        // 포커스가 에디터에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 4. 카운트 증가 및 저장 실행
        this.totalKeyCount++;

        if (this.totalKeyCount >= this.settings.saveMdAutoSaveTrigger) {
            this.totalKeyCount = 0; // 카운트 리셋
            this.createSaveFile(activeFile);
            // Notice 메시지에 자동 저장됨을 명시하면 더 좋습니다 (선택사항)
            new Notice(`${this.settings.saveMdAutoSaveTrigger}타 자동 저장`);
        }
    }
    private async emergencyAction(file: TFile) {
        // 무한 루프 방지를 위한 카운트 초기화
        this.repeatCount = 0;
        this.lastKey = "";

        // 1. 즉시 백업 파일 생성
        await this.createSaveFile(file);

        // 2. 에디터 포커스 강제 해제 (추가 입력 방지)
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        new Notice(`⚠️ 비정상 입력 감지: '${file.basename}' 백업 후 포커스를 해제했습니다.`);
    }
    // 세이브 파일 생성 로직
    private async createSaveFile(file: TFile) {
        const folderPath = this.settings.saveMdFolderPath;
        const ts = moment().format(this.settings.saveMdDateFormat);
        const newPath = normalizePath(`${folderPath}/${file.basename}_save_${ts}.md`);

        try {
            const { vault } = this.app;
            
            // 폴더가 없으면 생성
            if (!(await vault.adapter.exists(folderPath))) {
                await vault.createFolder(folderPath);
            }

            // 파일 복사
            await vault.copy(file, newPath);
            new Notice(`세이브 파일 저장됨: ${file.basename}_save_${ts}`);
        } catch (error) {
            new Notice("파일 복사 중 오류가 발생했습니다.");
        }
    }

    // --- [Selection] ---
    // 오른쪽 1칸
    expandRight(editor: Editor) {
        const selections = editor.listSelections().map(sel => ({
            anchor: sel.anchor,
            head: {
                line: sel.head.line,
                ch: sel.head.ch + 1
            }
        }));

        editor.setSelections(selections);
    }
    // 왼쪽 1칸
    expandLeft(editor: Editor) {
        const selections: EditorSelection[] = editor.listSelections().map(sel => {
            let { line, ch } = sel.head;

            if (ch > 0) {
                ch--;
            } else if (line > 0) {
                line--;
                ch = editor.getLine(line)?.length ?? 0;
            }

            return {
                anchor: sel.anchor,
                head: { line, ch }
            };
        });

        editor.setSelections(selections);
    }

    // 왼쪽 행 시작까지
    expandLeftEnd(editor: Editor) {
        const selections = editor.listSelections().map(sel => ({
            anchor: sel.anchor,
            head: {
                line: sel.head.line,
                ch: 0
            }
        }));

        editor.setSelections(selections);
    }

    // 오른쪽 행 끝까지
    expandRightEnd(editor: Editor) {
        const selections = editor.listSelections().map(sel => {
            const line = sel.head.line;
            const lineLength = editor.getLine(line)?.length ?? 0;

            return {
                anchor: sel.anchor,
                head: {
                    line,
                    ch: lineLength
                }
            };
        });

        editor.setSelections(selections);
    }

    // --- [Snippets] ---
    async addSnippet(content: string) {
        // 1. 내용이 아예 없는 경우만 체크합니다.
        if (!content || content.length === 0) {
            new Notice("추가할 텍스트를 선택해주세요.");
            return;
        }

        // 2. .trim()을 제거하여 사용자가 선택한 공백/줄바꿈을 그대로 보존합니다.
        if (this.settings.snippets.includes(content)) {
            new Notice("이미 존재하는 조각글입니다.");
            return;
        }

        // 3. 배열에 추가하고 저장합니다.
        this.settings.snippets.push(content);
        await this.saveSettings();
    
        // 알림창에서는 가독성을 위해 앞뒤 공백을 제거하고 보여줄 수 있습니다.
        new Notice(`조각글 등록 완료: "${content.trim()}"`);
    }

    async removeSnippet(content: string) {
        if (!content || content.length === 0) {
            new Notice("제거할 텍스트를 선택해주세요.");
            return;
        }

        // 목록에 존재하는지 확인
        if (!this.settings.snippets.includes(content)) {
            new Notice("조각글 목록에 일치하는 텍스트가 없습니다.");
            return;
        }

        // 해당 텍스트를 제외한 나머지만 남김
        this.settings.snippets = this.settings.snippets.filter(item => item !== content);
        
        await this.saveSettings();
        new Notice(`조각글 제거 완료: "${content.trim()}"`);
    }

    // --- [Symbols] ---
    // 스마트 삭제 로직을 별도 메서드로 분리
    private handleSmartBackspace(evt: KeyboardEvent) {
        if (evt.key !== 'Backspace') return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        
        // 커서 앞뒤 문자가 PAIRS에 정의된 쌍인지 확인
        if (cursor.ch > 0 && cursor.ch < line.length) {
            const prevChar = line[cursor.ch - 1];
            const nextChar = line[cursor.ch];
            
            if (prevChar && nextChar && this.settings.symbolPairs[prevChar] === nextChar) {
                editor.replaceRange("", 
                    { line: cursor.line, ch: cursor.ch - 1 }, 
                    { line: cursor.line, ch: cursor.ch + 1 }
                );
                evt.preventDefault();
                evt.stopPropagation();
            }
        }
    }

    // --- [TaskPlan] ---
    // 파일 열기: 이미 열린 leaf가 있으면 활성화, 없으면 현재 leaf에서 열기 (리본 아이콘용)
    private async openTaskPlanFile(path: string) {
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        const existingLeaf = this.app.workspace
            .getLeavesOfType('markdown')
            .find(l => (l.view as MarkdownView).file?.path === path);

        const leaf = existingLeaf ?? this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { active: true });

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            // 에디터 입력창에 포커스를 줍니다 (커서 깜빡임 활성화)
            view.editor.focus();

            // 커서를 문서 맨 마지막 줄의 맨 끝 글자로 이동
            const lastLineIndex = view.editor.lineCount() - 1; // 개수에서 1을 빼야 마지막 줄 인덱스
            const lastLineLength = view.editor.getLine(lastLineIndex).length; // 그 줄의 길이만큼 오른쪽으로 이동

            const cursorPosition = { line: lastLineIndex, ch: lastLineLength };
            
            view.editor.setCursor(cursorPosition);

            // 커서 위치로 화면 스크롤 이동 (문서가 길 경우를 대비)
            view.editor.scrollIntoView({ from: cursorPosition, to: cursorPosition }, true);
        }
    }

    // 파일 열기: 상황에 따라 기존 탭 활성화 또는 현재 탭에서 열기 (명령어용)
    async openTaskPlanSmart() {
        const { workspace, vault } = this.app;
        const taskPath = this.settings.taskFilePath;
        const planPath = this.settings.planFilePath;

        // 0. 사전 검사
        const taskFile = vault.getAbstractFileByPath(taskPath);
        const planFile = vault.getAbstractFileByPath(planPath);

        if (!(taskFile instanceof TFile)) {
            new Notice(`Task 파일을 찾을 수 없습니다: ${taskPath}`);
            return;
        }
        if (!(planFile instanceof TFile)) {
            new Notice(`Plan 파일을 찾을 수 없습니다: ${planPath}`);
            return;
        }

        // 1. 현재 상태 파악
        const activeLeaf = workspace.getMostRecentLeaf();
        
        let existingTaskLeaf: WorkspaceLeaf | null = null;
        let existingPlanLeaf: WorkspaceLeaf | null = null;

        workspace.iterateRootLeaves((leaf) => {
            const path = (leaf.view as MarkdownView).file?.path;
            if (path === taskPath) existingTaskLeaf = leaf;
            if (path === planPath) existingPlanLeaf = leaf;
        });

        if (!activeLeaf) {
            await this.openFileInNewTab(taskFile);
            return;
        }

        const currentPath = (activeLeaf.view as MarkdownView).file?.path;
        const isPinned = activeLeaf.getViewState().pinned;

        // 2. 실행 분기

        // [상황 A] 현재 탭 == Task 파일
        if (currentPath === taskPath) {
            if (existingPlanLeaf && existingPlanLeaf !== activeLeaf) {
                workspace.setActiveLeaf(existingPlanLeaf, { focus: true });
            } else {
                // Task -> Plan 전환은 '문맥 전환'이므로 Pinned여도 해제하고 엽니다.
                if (isPinned) activeLeaf.setPinned(false);
                await this.openFileInLeaf(activeLeaf, planFile);
            }
        }
        // [상황 B] 현재 탭 == Plan 파일
        else if (currentPath === planPath) {
            if (existingTaskLeaf && existingTaskLeaf !== activeLeaf) {
                workspace.setActiveLeaf(existingTaskLeaf, { focus: true });
            } else {
                // Plan -> Task 전환은 '문맥 전환'이므로 Pinned여도 해제하고 엽니다.
                if (isPinned) activeLeaf.setPinned(false);
                await this.openFileInLeaf(activeLeaf, taskFile);
            }
        }
        // [상황 C] 현재 탭 == 기타 파일 (Other)
        else {
            if (existingTaskLeaf) {
                workspace.setActiveLeaf(existingTaskLeaf, { focus: true });
            } else if (existingPlanLeaf) {
                workspace.setActiveLeaf(existingPlanLeaf, { focus: true });
            } 
            else {
                // ★ 수정된 부분 ★
                if (isPinned) {
                    // 고정된 '기타 파일'은 보호해야 합니다. 고정을 풀지 않고 '새 탭'을 엽니다.
                    await this.openFileInNewTab(taskFile);
                } else {
                    // 고정되지 않았다면 현재 탭을 교체합니다.
                    await this.openFileInLeaf(activeLeaf, taskFile);
                }
            }
        }
    }

    // [Helper] 특정 탭에서 파일 열기
    private async openFileInLeaf(leaf: WorkspaceLeaf, file: TFile) {
        await leaf.openFile(file);
        this.ensureFocus(leaf);
    }

    // [Helper] 새 탭에서 파일 열기
    private async openFileInNewTab(file: TFile) {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
        this.ensureFocus(leaf);
    }

    // [Helper] 에디터에 포커스 주기
    private ensureFocus(leaf: WorkspaceLeaf) {
        const view = leaf.view;
        if (view instanceof MarkdownView) {
            // 커서 위치를 건드리지 않고 입력 활성화만 수행
            view.editor.focus();
        }
    }

    // 행(또는 다중 행) 옮기는 로직 — 각 단계를 전용 메서드에 위임
    private async handleLineMove(editor: Editor, view: MarkdownView) {
        const route = this.resolveRoute(view);
        if (!route) return;

        const selection = this.extractSelection(editor);
        if (!selection) return;

        const { contentToMove, startLine, endLine } = selection;

        const targetFile = this.getTargetFile(route.targetPath);
        if (!targetFile) return;

        await this.moveContent(
            editor, route, targetFile, contentToMove, startLine, endLine
        );
    }

    // 현재 파일이 task/plan인지 판별하고 이동 방향을 반환
    private resolveRoute(
        view: MarkdownView
    ): { isFromTask: boolean; targetPath: string } | null {
        const currentPath = view.file?.path;
        if (!currentPath) return null;

        const isFromTask = currentPath === this.settings.taskFilePath;
        const isFromPlan = currentPath === this.settings.planFilePath;
        if (!isFromTask && !isFromPlan) return null;

        const targetPath = isFromTask
            ? this.settings.planFilePath
            : this.settings.taskFilePath;

        return { isFromTask, targetPath };
    }

    // 선택 영역 또는 커서 행의 내용과 범위를 추출
    private extractSelection(
        editor: Editor
    ): { contentToMove: string; startLine: number; endLine: number } | null {
        const selection = editor.listSelections()[0];
        let startLine: number;
        let endLine: number;

        if (editor.somethingSelected() && selection) {
            startLine = Math.min(selection.anchor.line, selection.head.line);
            endLine = Math.max(selection.anchor.line, selection.head.line);
        } else {
            startLine = editor.getCursor().line;
            endLine = startLine;
        }

        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            lines.push(editor.getLine(i));
        }
        const contentToMove = lines.join('\n');

        if (!contentToMove.trim()) return null;

        return { contentToMove, startLine, endLine };
    }

    // 대상 파일을 vault에서 찾아 반환
    private getTargetFile(targetPath: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(targetPath);
        if (!(file instanceof TFile)) {
            new Notice('대상 파일을 찾을 수 없습니다.');
            return null;
        }
        return file;
    }

    // 이동 방향에 따라 내용을 대상 파일에 삽입
    private async moveContent(
        editor: Editor,
        route: { isFromTask: boolean; targetPath: string },
        targetFile: TFile,
        contentToMove: string,
        startLine: number,
        endLine: number
    ) {
        if (route.isFromTask) {
            await this.moveToplan(
                editor, targetFile, route.targetPath, contentToMove, startLine, endLine
            );
        } else {
            await this.prependToTopOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, route.targetPath);
        }
    }

    // task → plan: 섹션 목록을 읽고 모달로 삽입 위치를 결정
    private async moveToplan(
        editor: Editor,
        targetFile: TFile,
        targetPath: string,
        contentToMove: string,
        startLine: number,
        endLine: number
    ) {
        const content = await this.app.vault.read(targetFile);
        const sections = content.split('\n').filter(l => l.startsWith('#'));

        if (sections.length === 0) {
            await this.appendToEndOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, targetPath);
            return;
        }

        new MoveLinetoPlanSuggestModal(
            this.app,
            sections,
            async (selectedSection) => {
                await this.insertAfterSection(targetFile, selectedSection, contentToMove);
                this.finalizeMove(editor, startLine, endLine, targetPath);
            }
        ).open();
    }

    // 선택한 섹션의 마지막 비어있지 않은 줄 직후에 삽입
    private async insertAfterSection(file: TFile, section: string, text: string) {
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const sectionIdx = lines.findIndex(l => l === section);

            if (sectionIdx === -1) {
                lines.push(...text.split('\n'));
                return lines.join('\n');
            }

            // 섹션 범위(sectionIdx+1 ~ 다음 헤더 직전)에서 마지막 비어있지 않은 줄 탐색
            const nextSectionIdx = lines.findIndex(
                (l, i) => i > sectionIdx && l.startsWith('#')
            );
            const sectionEnd = nextSectionIdx === -1 ? lines.length : nextSectionIdx;

            let lastNonEmptyIdx = sectionIdx;
            for (let i = sectionIdx + 1; i < sectionEnd; i++) {
                if ((lines[i] ?? '').trim() !== '') lastNonEmptyIdx = i;
            }

            lines.splice(lastNonEmptyIdx + 1, 0, ...text.split('\n'));
            return lines.join('\n');
        });
    }

    private async appendToEndOfFile(file: TFile, text: string) {
        await this.app.vault.process(file, (data) => {
            const needsNewline = data.length > 0 && !data.endsWith('\n');
            return data + (needsNewline ? '\n' : '') + text;
        });
    }

    // task 파일 맨 윗줄에 삽입
    private async prependToTopOfFile(file: TFile, text: string) {
        await this.app.vault.process(file, (data) => {
            const needsNewline = text.length > 0 && !text.endsWith('\n');
            return text + (needsNewline ? '\n' : '') + data;
        });
    }

    private finalizeMove(
        editor: Editor,
        startLine: number,
        endLine: number,
        targetPath: string
    ) {
        // 삭제 범위 계산
        const from: EditorPosition = { line: startLine, ch: 0 };
        const to: EditorPosition = { line: endLine + 1, ch: 0 };

        // 마지막 줄 포함 시 예외 처리
        if (endLine === editor.lineCount() - 1) {
            if (startLine > 0) {
                from.line = startLine - 1;
                from.ch = editor.getLine(startLine - 1).length;
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            } else {
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            }
        }

        editor.replaceRange('', from, to);

        // 이동 후 대상 파일 열고 포커스
        this.openTaskPlanFile(targetPath);
    }

    // --- [Trash] ---
    /**
     * toggleTrashFileInRightSidebar
     * trash.md 파일이 오른쪽 사이드바에 있다면 닫고(detach), 없다면 엽니다.
     * - 이미 오른쪽 사이드바에 열려 있다면 해당 패널을 닫습니다.
     * - 열려 있지 않다면 오른쪽 사이드바에 새로 엽니다.
     * - 사이드바가 접혀 있다면 자동으로 펼쳐서 보여줍니다.
     */
    async toggleTrashFileInRightSidebar() {
        if (this.isTrashToggling) return;
        this.isTrashToggling = true;

        try {
            const { workspace, vault } = this.app;
            const path = this.settings.trashFilePath;

            if (!path || path.trim() === "") {
                new Notice('설정된 파일 경로가 없습니다. 플러그인 설정을 확인해주세요.');
                return;
            }

            if (!workspace.rightSplit) {
                new Notice('오른쪽 사이드바를 사용할 수 없는 환경입니다.');
                return;
            }

            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            let existingLeaf: WorkspaceLeaf | null = null;
            workspace.iterateAllLeaves((leaf) => {
                if (existingLeaf) return;
                const viewType = leaf.view.getViewType();
                const view = leaf.view as FileView;
                if (
                    leaf.getRoot() === workspace.rightSplit &&
                    viewType === 'markdown' &&
                    view.file?.path === path
                ) {
                    existingLeaf = leaf;
                }
            });

            if (existingLeaf) {
                // [Case A] 닫기 (Detach)
                (existingLeaf as WorkspaceLeaf).detach();

                const mainLeaf = workspace.getMostRecentLeaf();
                if (mainLeaf) {
                    workspace.setActiveLeaf(mainLeaf, { focus: true });
                    const view = mainLeaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }
                }
            } else {
                // [Case B] 열기 (Open)
                let leaf: WorkspaceLeaf | null | undefined = workspace.getLeavesOfType('empty').find(l => l.getRoot() === workspace.rightSplit);

                if (!leaf) {
                    leaf = workspace.getRightLeaf(true);
                }

                if (!leaf) {
                    new Notice('오른쪽 사이드바에 새 탭을 열 수 없습니다.');
                    return;
                }

                try {
                    await leaf.openFile(file);
                    workspace.revealLeaf(leaf);
                    workspace.setActiveLeaf(leaf, { focus: true });
                    const view = leaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }
                } catch (e) {
                    console.error(e);
                    new Notice(`파일 열기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
                    leaf.detach();
                }
            }
        } catch (err) {
            console.error("Toggle Error:", err);
        } finally {
            this.isTrashToggling = false;
        }
    }

    // --- [Work] ---
    /**
     * [메서드 1] cleanupTabs
     * 메인 워크스페이스의 탭을 정리합니다.
     * 단, '고정된(Pinned)' 탭은 닫지 않고 유지합니다.
     */
    async cleanupTabs() {
        const { workspace } = this.app;
        const leavesToClose: WorkspaceLeaf[] = [];

        workspace.iterateAllLeaves((leaf) => {
            // 1. 메인 영역(rootSplit)에 있는 탭인지 확인
            // 2. 고정(Pinned) 상태가 아닌지 확인
            const isPinned = leaf.getViewState().pinned;
            // rootSplit 하위이면서 고정되지 않은 탭만 수집
            // leftSplit, rightSplit은 제외됩니다.
            if (leaf.getRoot() === workspace.rootSplit && !isPinned) {
                leavesToClose.push(leaf);
            }
        });

        // 수집된 탭들을 일괄 제거
        leavesToClose.forEach(leaf => leaf.detach());
        await new Promise(resolve => setTimeout(resolve, 0)); // 마이크로태스크 flush
    }

    /**
     * [메서드 2] readWorkContent
     * work.md 파일 객체와 내용을 읽어 반환합니다.
     * - 에디터가 해당 파일을 열고 있으면 에디터 내용을 우선합니다 (가장 최신 데이터).
     * - 파일이 없거나 오류 발생 시 Notice를 띄우고 null을 반환합니다.
     */
    async readWorkContent(): Promise<{ file: TFile; content: string } | null> {
        const { vault, workspace } = this.app;
        const workPath = this.settings.workFilePath;

        try {
            const workFile = vault.getAbstractFileByPath(workPath);
            if (!(workFile instanceof TFile)) {
                new Notice(`작업 파일을 찾을 수 없습니다: ${workPath}`);
                return null;
            }

            // 에디터 우선 탐색: 현재 활성 탭이 work.md라면 에디터 내용을 사용
            const activeLeaf = workspace.getActiveViewOfType(MarkdownView);
            if (activeLeaf && activeLeaf.file?.path === workPath) {
                return { file: workFile, content: activeLeaf.editor.getValue() };
            }

            // 아니라면 vault에서 읽기
            const content = await vault.read(workFile);
            return { file: workFile, content };

        } catch (error) {
            console.error(error);
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return null;
        }
    }

    /**
     * [메서드 3] backupAndClear
     * readWorkContent()에서 전달받은 content를 later.md에 백업하고 work.md를 비웁니다.
     * - later.md가 없으면 데이터 유실 방지를 위해 중단하고 false를 반환합니다.
     * - 파일 I/O 오류 발생 시 사용자에게 알리고 false를 반환합니다.
     */
    async backupAndClear(workFile: TFile, content: string): Promise<boolean> {
        const { vault } = this.app;
        const laterPath = this.settings.laterFilePath;

        try {
            // 백업 파일 존재 여부 확인 — 없으면 데이터 유실 방지를 위해 중단
            const laterFile = vault.getAbstractFileByPath(laterPath);
            if (!(laterFile instanceof TFile)) {
                new Notice(`백업 파일(${laterPath})이 존재하지 않습니다. 작업이 중단되고 내용이 유지됩니다.`);
                return false;
            }

            // 백업 내용 포맷팅 후 later.md에 추가
            const timestamp = moment().format(this.settings.workTimestampFormat);
            await vault.append(laterFile, `\n\n${timestamp}\n${content}`);

            // 백업 완료 후 work.md 비우기
            await vault.modify(workFile, '');
            return true;

        } catch (error) {
            console.error(error);
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return false;
        }
    }

    /**
     * [메서드 4] openWorkFile
     * work.md 파일을 현재 탭에 엽니다.
     * cleanupTabs 이후 활성 탭이 없을 수 있으므로 getLeaf(false) 대신
     * getLeaf()로 안전하게 탭을 확보합니다.
     */
    async openWorkFile() {
        const { workspace, vault } = this.app;
        const path = this.settings.workFilePath;

        try {
            const targetFile = vault.getAbstractFileByPath(path);

            if (!(targetFile instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            // cleanupTabs 직후에는 활성 탭이 없을 수 있으므로
            // getLeaf(true)로 현재 탭이 없으면 새 탭을 생성하도록 합니다.
            const leaf = workspace.getLeaf(true);
            await leaf.openFile(targetFile);

            // 탭 활성화
            workspace.setActiveLeaf(leaf, { focus: true });

            // 에디터 강제 포커스 및 커서 이동
            const view = leaf.view;
            if (view instanceof MarkdownView) {

                // 에디터 입력창에 포커스를 줍니다 (커서 깜빡임 활성화)
                view.editor.focus();
            }

        } catch (error) {
            new Notice('작업 문서를 여는 중 오류가 발생했습니다.');
        }
    }

    /**
     * [메서드 4 - 수정됨] toggleLaterFileInRightSidebar
     * later.md 파일이 오른쪽 사이드바에 있다면 닫고(detach), 없다면 엽니다.
     * - 이미 오른쪽 사이드바에 열려 있다면 해당 패널을 닫습니다.
     * - 열려 있지 않다면 오른쪽 사이드바에 새로 엽니다.
     * - 사이드바가 접혀 있다면 자동으로 펼쳐서 보여줍니다.
     */
    async toggleLaterFileInRightSidebar() {
        // Race Condition 방지: 명령어가 빠르게 여러 번 실행되는 경우를 대비해, 실행 중에는 잠금(lock)을 걸어서 중복 실행을 방지할 수 있습니다.
        if (this.isWorkLaterToggling) return;
        this.isWorkLaterToggling = true;

        try {
            const { workspace, vault } = this.app;
            const path = this.settings.laterFilePath;

            // 설정값 유효성 검사 (빈 문자열 체크)
            if (!path || path.trim() === "") {
                new Notice('설정된 파일 경로가 없습니다. 플러그인 설정을 확인해주세요.');
                return;
            }

            // 오른쪽 사이드바 지원 환경 체크
            // Obsidian API상 rightSplit은 존재하지만 null일 수도 있는 상황 방어
            if (!workspace.rightSplit) {
                new Notice('오른쪽 사이드바를 사용할 수 없는 환경입니다.');
                return;
            }

            // 파일 객체 확인
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            // 모든 뷰 타입 검색: Markdown이 아닌 경우(이미지, PDF 등)도 감지하기 위해 iterateAllLeaves 사용
            let existingLeaf: WorkspaceLeaf | null = null;
            workspace.iterateAllLeaves((leaf) => {
                // 이미 찾았으면 패스
                if (existingLeaf) return;

                // 오른쪽 사이드바에 있고, 파일 경로가 일치하는지 확인
                // (leaf.view as FileView)로 캐스팅하여 file 속성 접근
                const viewType = leaf.view.getViewType();
                const view = leaf.view as FileView;
                if (
                    leaf.getRoot() === workspace.rightSplit &&
                    viewType === 'markdown' && // Markdown 뷰인지 확인
                    view.file?.path === path
                ) {
                    existingLeaf = leaf;
                }
            });

            // 3. 토글 로직 실행
            if (existingLeaf) {
                // [Case A] 닫기 (Detach)
                // 포커스 복귀를 위해 닫기 전에 최근 리프를 미리 계산할 수도 있으나,
                // Obsidian은 닫힌 후 자동으로 포커스를 이동시키려 노력합니다.
                // 하지만 명시적으로 제어하기 위해 닫은 후 로직을 수행합니다.
                (existingLeaf as WorkspaceLeaf).detach();

                // 닫은 후 메인 에디터 포커스 복구
                // getMostRecentLeaf()가 닫힌 리프를 반환하지 않도록 detach 후 호출
                const mainLeaf = workspace.getMostRecentLeaf();
                if (mainLeaf) {
                    workspace.setActiveLeaf(mainLeaf, { focus: true });
                    // 커서 주기
                    const view = mainLeaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }
                }
            } else {
                // [Case B] 열기 (Open)
                
                // 기존 탭 덮어쓰기 방지
                // getRightLeaf(false)는 빈 탭이 있으면 재활용하지만, 없으면 기존 탭을 덮어쓸 수 있음.
                // 안전하게: 오른쪽의 빈 탭을 찾거나, 없으면 아예 새 탭(true)을 만듦.
                let leaf: WorkspaceLeaf | null | undefined = workspace.getLeavesOfType('empty').find(l => l.getRoot() === workspace.rightSplit);
                
                if (!leaf) {
                    // 빈 탭이 없으면 새 탭 생성
                    leaf = workspace.getRightLeaf(true);
                }

                // leaf 생성 실패 방어
                if (!leaf) {
                    new Notice('오른쪽 사이드바에 새 탭을 열 수 없습니다.');
                    return;
                }

                // 파일 열기 예외 처리
                try {
                    await leaf.openFile(file);
                    
                    // 사이드바가 접혀 있다면 펼치기
                    workspace.revealLeaf(leaf);
                    
                    // 포커스 이동
                    workspace.setActiveLeaf(leaf, { focus: true });
                    // 커서 주기
                    const view = leaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }

                } catch (e) {
                    console.error(e);
                    new Notice(`파일 열기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
                    // 실패한 리프 정리 (빈 탭으로 남기거나 닫음)
                    leaf.detach();
                }
            }
        } catch (err) {
            // 예상치 못한 전체 로직 에러
            console.error("Toggle Error:", err);
        } finally {
            // 플래그 해제 (무조건 실행 보장)
            this.isWorkLaterToggling = false;
        }
    }
}

// =========================================================================
// 3. Helper Classes & Functions
// =========================================================================

// snippets, symbols 공통 helper 함수
// 트리거 regex 기호 escape 함수
function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);

    // character class 는 반드시 single char 기준
    const first = escaped[0]; // 트리거가 여러 글자일 때 첫 글자만 사용

    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}

// snippets
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SnippetsSuggestions extends EditorSuggest<SnippetsItem> {
    plugin: ATOZVER6Plugin; // 메인 플러그인 인스턴스 보관
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그

    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: ATOZVER6Plugin) { 
        super(plugin.app); // Obsidian suggest 시스템 초기화
        this.plugin = plugin; // plugin 참조 저장
    }

    // 커서 이동 / 입력 시 호출
    // suggestion 을 띄울지 판단하는 트리거 함수
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        // 새로운 trigger 가 시작될 때마다 autoInserted 를 리셋
        this.autoInserted = false;
        // 현재 커서 위치까지의 텍스트 추출
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        // 설정에서 트리거 문자 가져오기
        const trigger = this.plugin.settings.snippetTrigger;
        // 트리거 + 이후 단어를 정규식으로 변환(헬퍼 함수 호출)
        const match = line.match(buildTriggerRegex(trigger));
        // 매칭되면 suggestion 시작/끝 위치와 query 반환
        return match ? {
            start: { line: cursor.line, ch: match.index! }, // 트리거 시작 위치
            end: cursor, // 현재 커서 위치
            query: match[1] ?? "" // 입력된 검색어
        } : null; // 매칭 없으면 suggest 안 띄움
    }

    // gestSuggestions에서 자동삽입까지 처리
    getSuggestions(ctx: EditorSuggestContext): SnippetsItem[] {
        // snippetLimit가 0일 경우 가드
        if (this.plugin.settings.snippetLimit < 1) return [];        
        // 입력된 query 소문자화
        const query = ctx.query.toLowerCase();
        // Obsidian fuzzy 검색 준비
        const fuzzy = prepareFuzzySearch(query);

        // 최근 사용 가중치 (아주 작게 줘서 fuzzy 우선 유지)
        const SNIPPETS_RECENT_WEIGHT = 0.0000001;
        // 모든 snippet 을 대상으로 점수 계산
        const suggestions = this.plugin.settings.snippets
            .map(text => {
                const result = fuzzy(text.toLowerCase()); // fuzzy 점수 계산
                const lastUsed = this.plugin.settings.recentSnippets[text] ?? 0; // 최근 사용 timestamp 가져오기
                return {
                    item: { content: text }, // 실제 삽입될 내용
                    score: result ? result.score : -1, // fuzzy 점수
                    recent: lastUsed // 최근 사용 시간
                };
            })
            // fuzzy 실패한 항목 제거
            .filter(res => res.score !== -1)
            // fuzzy 점수 + recent 가중치를 합쳐 최종 점수 생성
            .map(res => ({
                item: res.item,
                finalScore: res.score + res.recent * SNIPPETS_RECENT_WEIGHT
            }))
            // 최종 점수 기준 내림차순 정렬
            .sort((a, b) => b.finalScore - a.finalScore)
            // 최대 표시 개수 제한
            .slice(0, this.plugin.settings.snippetLimit)
            // SnippetsItem 배열로 변환
            .map(res => res.item);
        // 자동 삽입 로직
        // [조건] 검색어 존재, 결과 1개, 아직 자동삽입 안함
        if (query.length > 0 && suggestions.length === 1 && !this.autoInserted) {
            const targetItem = suggestions[0];
            // targetItem이 undefined일 가능성을 TypeScript에게 없다고 확인시켜줌
            if (!targetItem) return suggestions;

            const triggerChar = this.plugin.settings.snippetTrigger;

            // [핵심 4] 삽입할 내용에 트리거가 포함되어 있다면 자동완성 포기 (무한 루프 방지)
            if (targetItem.content.includes(triggerChar)) {
                return suggestions; 
            }

            // 플래그를 먼저 true로 설정하여 후속 호출 차단
            this.autoInserted = true;

            setTimeout(() => {
                // [핵심 3] 실행 시점에 Context가 유효한지, 그리고 사용자가 닫지 않았는지 확인
                // this.context가 없으면(null) 이미 닫힌 상태임
                if (!this.context) return; 
                this.selectSuggestion(targetItem);
                
                // close()는 selectSuggestion 내부 로직이나 Obsidian에 의해 
                // 처리되도록 두는 것이 더 안전할 수 있으나, 명시적으로 닫으려면:
                this.close();
            }, 0);

            // 자동 삽입 결과 반환
            return suggestions;
        }

        return suggestions;
    }

    // suggestion UI 렌더링
    renderSuggestion(item: SnippetsItem, el: HTMLElement) {
        el.setText(`${item.content}`); // 리스트에 snippet 내용 표시
    }

    // 사용자가 suggestion 을 수동 선택했을 때 호출
    selectSuggestion(item: SnippetsItem) {
        // selectSuggestion은 Obsidian이 호출할 때 this.context를 보장하지만,
        // setTimeout에서 직접 호출할 때는 this.context 체크가 필수
        if (!this.context) return;

        const { editor, start, end } = this.context;
        
        // 에디터 수정
        editor.replaceRange(item.content, start, end);

        // 최근 사용 기록 저장 로직
        this.recordRecent(item.content);
    }

    // 최근 사용 기록 로직
    private recordRecent(content: string) {
        // 최근 사용 기록 객체
        const recent = this.plugin.settings.recentSnippets;
        // 현재 선택한 snippet timestamp 저장
        recent[content] = Date.now();
        // recent 최대 개수 = snippetLimit
        const limit = this.plugin.settings.snippetLimit;
        // 최신순 정렬 후 limit 만큼만 유지
        this.plugin.settings.recentSnippets = Object.fromEntries(
            Object.entries(recent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
        );

        // settings 저장
        this.plugin.debouncedSave();
    }
}

// symbols
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SymbolSuggestions extends EditorSuggest<SymbolItem> {
    // 메인 플러그인 인스턴스 보관
    plugin: ATOZVER6Plugin;
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그
    
    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: ATOZVER6Plugin) {
        super(plugin.app); // Obsidian suggest 시스템 초기화
        this.plugin = plugin; // plugin 참조 저장
    }

    // 커서 이동 / 입력 시 호출
    // suggestion 을 띄울지 판단하는 트리거 함수
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        // 새로운 trigger 가 시작될 때마다 autoInserted 를 리셋
        this.autoInserted = false;
        // 현재 커서 위치까지의 텍스트 추출
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        // 설정에서 트리거 문자 가져오기
        const trigger = this.plugin.settings.symbolTrigger;
        // 트리거 + 이후 단어를 정규식으로 변환(헬퍼 함수 호출)
        const match = line.match(buildTriggerRegex(trigger));
        // 매칭되면 suggestion 시작/끝 위치와 query 반환
        return match ? {
            start: { line: cursor.line, ch: match.index! }, // 트리거 시작 위치
            end: cursor, // 현재 커서 위치
            query: match[1] ?? "" // 입력된 검색어
        } : null; // 매칭 없으면 suggest 안 띄움
    }

    // gestSuggestions에서는 fuzzy 계산만 실행
    getSuggestions(ctx: EditorSuggestContext): SymbolItem[] {
        // symbolLimit가 0일 경우 가드
        if (this.plugin.settings.symbolLimit < 1) return [];        
        // 입력된 query 소문자화
        const query = ctx.query.toLowerCase();
        // Obsidian fuzzy 검색 준비
        const fuzzy = prepareFuzzySearch(query);

        // 최근 사용 가중치 (아주 작게 줘서 fuzzy 우선 유지)
        const SYMBOL_RECENT_WEIGHT = 0.0000001;
        // 모든 symbol 을 대상으로 점수 계산
        const suggestions: SymbolItem[] = this.plugin.settings.symbols
            .map(item => {
                const result = fuzzy(item.id.toLowerCase()); // fuzzy 점수 계산
                const lastUsed = this.plugin.settings.recentSymbols[item.id] ?? 0; // 최근 사용 timestamp 가져오기
                return {
                    item, // 실제 삽입될 내용
                    score: result ? result.score : -1, // fuzzy 점수
                    recent: lastUsed // 최근 사용 시간
                };
            })
            // fuzzy 실패한 항목 제거
            .filter(res => res.score !== -1)
            // fuzzy 점수 + recent 가중치를 합쳐 최종 점수 생성
            .map(res => ({
                item: res.item,
                finalScore: res.score + res.recent * SYMBOL_RECENT_WEIGHT
            }))
            // 최종 점수 기준 내림차순 정렬
            .sort((a, b) => b.finalScore - a.finalScore)
            // 최대 표시 개수 제한
            .slice(0, this.plugin.settings.symbolLimit)
            // SymbolsItem 배열로 변환
            .map(res => res.item);

        // [변경됨] 자동 삽입 로직을 onOpen에서 여기로 이동
        if (query.length > 0 && suggestions.length === 1 && !this.autoInserted) {
            const targetItem = suggestions[0];
            
            // TypeScript 방어 코드
            if (!targetItem) return suggestions;

            const trigger = this.plugin.settings.symbolTrigger;

            // 무한 루프 방지: 심볼 자체에 트리거 문자가 포함된 경우 자동완성 스킵
            if (targetItem.symbol.includes(trigger)) {
                return suggestions;
            }

            // 플래그를 true로 설정하여 중복 실행 방지
            this.autoInserted = true;

            setTimeout(() => {
                // 실행 시점에 Context 유효성 체크
                if (!this.context) return;

                // 기존 selectSuggestion 메서드 재활용 (closing 처리 포함)
                this.selectSuggestion(targetItem);
                
                // 명시적으로 UI 닫기
                this.close();
            }, 0);

            // 자동 삽입 결과 반환
            return suggestions;
        }
    return suggestions;
    }

    // suggestion UI 렌더링
    renderSuggestion(item: SymbolItem, el: HTMLElement) {
        el.setText(`${item.id} ${item.symbol}`); // 리스트에 id와 symbol 표시
    }

    // 사용자가 suggestion 을 선택했을 때 호출
    selectSuggestion(item: SymbolItem) {
        if (!this.context) return;

        const { editor, start, end } = this.context;

        // closing 심볼 처리
        if (item.closing) {
            const selection = editor.getSelection();

            if (selection) {
                editor.replaceRange(item.symbol + selection + item.closing, start, end);
            } else {
                editor.replaceRange("", start, end);
                editor.replaceSelection(item.symbol + item.closing);

                // 커서를 중간으로 이동
                const cursor = editor.getCursor();
                editor.setCursor({
                    line: cursor.line,
                    ch: cursor.ch - item.closing.length
                });
            }
        } else {
            editor.replaceRange(item.symbol, start, end);
        }

        this.recordRecent(item);
    }

    // 최근 사용 기록 로직
    private recordRecent(item: SymbolItem) {
        // 최근 사용 기록 객체
        const recent = this.plugin.settings.recentSymbols;
        // 현재 선택한 symbol timestamp 저장
        recent[item.id] = Date.now();
        // recent 최대 개수 = symbolLimit
        const limit = this.plugin.settings.symbolLimit;
        // 최신순 정렬 후 limit 만큼만 유지
        this.plugin.settings.recentSymbols = Object.fromEntries(
            Object.entries(recent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
        );

        // settings 저장
        this.plugin.debouncedSave();
    }
}

// [TaskPlan] Modal
class MoveLinetoPlanSuggestModal extends SuggestModal<string> {
    sections: string[];
    onSubmit: (selectedSection: string) => void;
    constructor(app: App, sections: string[], onSubmit: (selectedSection: string) => void) {
        super(app);
        this.sections = sections;
        this.onSubmit = onSubmit;
        this.setPlaceholder('이동할 섹션을 선택하세요...');
    }
    getSuggestions(query: string): string[] {
        return this.sections.filter(s => s.toLowerCase().includes(query.toLowerCase()));
    }
    renderSuggestion(section: string, el: HTMLElement) { el.createEl('div', { text: section.replace(/^#+\s+/, '') }); }
    onChooseSuggestion(section: string) { this.onSubmit(section); }
}

// [CutCreateNewMd] Modal
class CutAndCreateModal extends Modal {
    private onSubmit: (filename: string) => void;
    private inputEl: HTMLInputElement;
    private errorEl: HTMLElement;

    constructor(app: App, onSubmit: (filename: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.modalEl.addClass('prompt');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('새 노트 만들기');

        new Setting(contentEl)
            .addText(text => {
                this.inputEl = text.inputEl;
                text.setPlaceholder('파일명');
                // 입력 시 에러 상태 초기화
                text.inputEl.addEventListener('input', () => this.clearError());
                setTimeout(() => text.inputEl.focus(), 0);
            });

        // 에러 메시지 전용 div
        this.errorEl = contentEl.createEl('div', { cls: 'cut-create-error' });

        this.scope.register([], 'Enter', () => {
            this.handleSubmit();
            return false;
        });
    }

    private handleSubmit() {
        const raw = this.inputEl.value.trim();

        if (!raw) {
            this.showError('파일명을 입력해주세요.');
            return;
        }
        if (/[\\/:*?"<>|]/.test(raw)) {
            this.showError('사용할 수 없는 문자가 포함되어 있습니다: \\ / : * ? " < > |');
            return;
        }
        if (this.app.vault.getAbstractFileByPath(normalizePath(`${raw}.md`))) {
            this.showError('같은 이름의 파일이 이미 존재합니다.');
            return;
        }

        this.close();
        this.onSubmit(raw);
    }

    private showError(msg: string) {
        this.errorEl.setText(msg);
        this.errorEl.addClass('is-visible');
    }

    private clearError() {
        this.errorEl.removeClass('is-visible');
    }

    onClose() { this.contentEl.empty(); }
}

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
