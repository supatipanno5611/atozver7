### 기본 뼈대
```ts
import {
} from 'obsidian';

// data.json에 저장할 데이터 구조 정의
interface ATOZSettings {
    
}

// data.json의 기본값 설정
const DEFAULT_SETTINGS: ATOZSettings = {
}

export default class ATOZVER6Plugin extends Plugin {
    settings: ATOZSettings;

    // 플러그인 로드 시 실행
    async onload() {
        // --- 리본 아이콘 등록 ---
        this.registerRibbonIcon();

        // --- 명령어 등록 ---
        this.registerCommands();

        // --- 이벤트 등록 ---
        this.registerEvents();
    }

    // 리본 아이콘 등록
    registerRibbonIcon() {
    }

    // 명령어 등록
    registerCommands() {
    }

    // 이벤트 등록
    registerEvents() {
    }

    // 플러그인 언로드 시 실행
    onunload() {
    }

    // 메서드 등록

}
```
### cursorcenter
```ts
import { Editor, Plugin, MarkdownView } from 'obsidian';

// 1. 저장할 데이터 구조 정의
interface CursorCenterSettings {
    isEnabled: boolean;
}

// 2. 기본값 설정 (처음 설치 시 Off 상태)
const DEFAULT_SETTINGS: CursorCenterSettings = {
    isEnabled: false
}

export default class CursorCenterPlugin extends Plugin {
    settings: CursorCenterSettings;

    async onload() {
        // 설정 로드
        await this.loadSettings();

        // 토글 명령 등록
        this.addCommand({
            id: 'toggle-cursor-center',
            name: '커서 중앙 유지 토글',
            callback: () => this.toggleCursorCenter()
        });

        // 실시간 중앙 유지 이벤트 등록
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.settings.isEnabled) {
                    this.scrollToCursorCenter(editor);
                }
            })
        );
    }

    async toggleCursorCenter() {
        // 상태 반전 및 저장
        this.settings.isEnabled = !this.settings.isEnabled;
        await this.saveSettings();

        // 활성화 시 즉시 중앙 정렬 실행
        if (this.settings.isEnabled) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                this.scrollToCursorCenter(view.editor);
            }
        }
    }

    // 커서 이동 로직
    private scrollToCursorCenter(editor: Editor) {
        const cursor = editor.getCursor();
        // true 인자는 수직 중앙(Center) 정렬을 의미합니다.
        editor.scrollIntoView({ from: cursor, to: cursor }, true);
    }

    // 설정 데이터 로드 함수
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // 설정 데이터 저장 함수
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
```
### cutcopy
```ts
import { Plugin, Editor, Notice } from 'obsidian';

export default class CutCopyPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'copy-all-document',
            name: '문서 전체 복사',
            editorCallback: (editor) => this.copyAll(editor)
        });
        this.addCommand({
            id: 'cut-all-document',
            name: '문서 전체 잘라내기',
            editorCallback: (editor: Editor) => this.cutAll(editor) 
        });
        this.addCommand({
            id: "cut-to-clipboard",
            name: "잘라내기",
            icon: "lucide-scissors",
            hotkeys: [{ modifiers: ["Mod"], key: "X" }],
            editorCallback: (editor) => this.handleCutCopy(editor, true),
        });
        this.addCommand({
            id: "copy-to-clipboard",
            name: "복사하기",
            icon: "copy",
            hotkeys: [{ modifiers: ["Mod"], key: "C" }],
            editorCallback: (editor) => this.handleCutCopy(editor, false),
        });
    }

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
}
```
### cyclepintab
```ts
import { Plugin, WorkspaceLeaf } from 'obsidian';

export default class CyclePinnedTabsPlugin extends Plugin {
    // leaf 참조 대신 파일 경로 문자열을 저장
    // -> 탭이 닫혀도 참조 유효성 문제 자체가 발생하지 않음
    private lastPinnedPath: string | null = null;
    private lastUnpinnedPath: string | null = null;

    // 플러그인에 의한 탭 이동인지 확인하는 플래그 (이벤트 루프 방지)
    private isInternalNavigation: boolean = false;

    async onload() {
        // 1. [이벤트 리스너] 탭 변경 감지 및 경로 기록
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (this.isInternalNavigation || !leaf) return;
                this.recordLeafHistory(leaf);
            })
        );

        // 2. [명령어] 상황별 탭 순환 (Context-Aware Cycle)
        this.addCommand({
            id: 'cycle-tabs-context-aware',
            name: '상황별 탭 순환',
            callback: () => this.cycleTabsContextAware(),
        });

        // 3. [명령어] 영역 건너가기 (Smart Jump)
        this.addCommand({
            id: 'jump-between-pinned-unpinned',
            name: '고정 탭과 일반 탭 사이 건너가기',
            callback: () => this.smartJump(),
        });
    }

    onunload() {
        this.lastPinnedPath = null;
        this.lastUnpinnedPath = null;
    }

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
}
```
### executes
```ts
import { Plugin, MarkdownView } from 'obsidian';

export default class ExecutesPlugin extends Plugin {
    async onload() {
        // executes
        this.addCommand({
            id: 'execute-undo',
            name: '실행 취소',
            icon: 'lucide-undo-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Z" }],
            callback: () => this.executeUndo(),
        });
        this.addCommand({
            id: 'execute-redo',
            name: '다시 실행',
            icon: 'lucide-redo-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Y" },
                { modifiers: ["Mod", "Shift"], key: "Z" }],
            callback: () => this.executeRedo(),
        });
        this.addCommand({
            id: 'execute-delete-paragraph',
            name: '단락 제거',
            icon: 'lucide-trash-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Delete" }],
            callback: () => this.executeDeleteParagraph(),
        });
    }

    // 실행 취소
    private executeUndo() {
        // 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 undo 실행
            (view as any).editor.undo();
        }
    }
    // 다시 실행
    private executeRedo() {
		// 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 redo 실행
            (view as any).editor.redo();
        }
    }
    // 단락 제거
    private executeDeleteParagraph() {
		// 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 단락 제거 실행
            (this.app as any).commands.executeCommandById('editor:delete-paragraph');
        }
    }
}
```
### graph
```ts
import {
    Plugin
} from 'obsidian';

export default class LocalGraphPlugin extends Plugin {
    async onload() {
        this.addRibbonIcon("lucide-git-fork", "로컬 그래프 열기", () => this.openLocalGraphInSidebar());
        this.addCommand({
            id: 'open-localgraph-in-sidebar',
            name: '오른쪽 사이드바에 로컬그래프뷰 열기',
            callback: () => this.openLocalGraphInSidebar(),
        });
        this.addCommand({
            id: 'open-graph-in-sidebar',
            name: '오른쪽 사이드바에 그래프뷰 열기', // 명령어 팔레트에서 검색할 이름
            callback: () => this.openGlobalGraphInSidebar(),
        });
    }
    private async openLocalGraphInSidebar() {
    const leaf = this.app.workspace.getLeavesOfType('localgraph')[0] || this.app.workspace.getRightLeaf(false);

    // leaf가 존재하는지 확인
    if (leaf) {
        await leaf.setViewState({ type: 'localgraph', active: true });
        this.app.workspace.revealLeaf(leaf);
    }
    }

    private async openGlobalGraphInSidebar() {
        // 이미 열려있는 전체 그래프가 있으면 가져오고, 없으면 오른쪽 사이드바 리프를 가져옴
        // 'graph'가 전체 그래프의 내부 ID입니다.
        const leaf = this.app.workspace.getLeavesOfType('graph')[0] || this.app.workspace.getRightLeaf(false);

        if (leaf) {
            await leaf.setViewState({ type: 'graph', active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }
}
```
### mobiletoolbar
```ts
import { Plugin } from 'obsidian';

export default class MobileToolbarOffPlugin extends Plugin {
    async onload() {
        // 명령 등록: 이제 모바일 툴바의 표시 여부만 제어합니다.
        this.addCommand({
            id: 'toggle-mobile-toolbar',
            name: '모바일 툴바 토글',
            callback: () => {
                document.body.classList.toggle('mobile-toolbar-off');
            }
        });
    }

    onunload() {
        // 플러그인 비활성화 시 스타일이 남아있지 않도록 클래스 제거
        document.body.classList.remove('mobile-toolbar-off');
    }
}
```
### movecursor
```ts
import { Plugin, Editor, EditorPosition } from 'obsidian';

export default class MoveCurSorPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'move-cursor-to-end',
            name: '커서를 문서 끝으로 이동',
            editorCallback: (editor: Editor) => this.moveCursorToEnd(editor)
        });
        this.addCommand({
            id: 'move-cursor-to-start',
            name: '커서를 문서 처음으로 이동',
            editorCallback: (editor: Editor) => this.moveCursorToStart(editor)
        });
    }

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
}
```
### ordinary
```ts
import {
    Plugin, TFile, MarkdownView, moment, Notice
} from 'obsidian';

interface OpenOrdinaryFileSettings {
    ordinaryFilePath: string;
}

const DEFAULT_SETTINGS: OpenOrdinaryFileSettings = {
    ordinaryFilePath: 'ordinary.md'
};

export default class OpenOrdinaryFilePlugin extends Plugin {
    settings: OpenOrdinaryFileSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('calendar', '일상노트 열기', () => {
            this.openFileOrdinary();
        });

        this.addCommand({
            id: 'open-ordinary-file',
            name: '일상노트 열기',
            callback: () => this.openFileOrdinary(),
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async openFileOrdinary() {
        const path = this.settings.ordinaryFilePath;
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

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

        // 커서를 마지막 행 끝에 두고 포커스
        editor.setCursor(editor.lineCount(), 0);
        editor.focus();
    }
}
```
### panelcontrol
```ts
import { App, Plugin, SuggestModal, WorkspaceLeaf, Notice } from 'obsidian';

// panelcontrol에서 선택할 패널 옵션과 사이드바 위치 정보를 정의
type PanelOption = { name: string; leaf: WorkspaceLeaf };
type SidebarSide = 'left' | 'right';

/**
 * 메인 플러그인 클래스
 */
export default class PanelControlPlugin extends Plugin {
    async onload() {
        // [명령어 1] 사이드바 패널 이동
        this.addCommand({
            id: 'move-sidebar-panel',
            name: '사이드바 패널 이동 (선택)',
            callback: () => {
                // 1단계: 왼쪽/오른쪽 중 어디서 가져올지 선택
                this.openSidebarSelector((side) => {
                    const placeholder = `${side === 'left' ? '왼쪽' : '오른쪽'}에서 이동할 패널 선택`;
                    // 2단계: 해당 위치의 패널을 선택하고 반대편으로 이동 실행
                    new PanelControlModal(this.app, side, (leaf) => {
                        this.moveLeafToOppositeSidebar(leaf, side);
                    }, placeholder).open();
                });
            }
        });

        // [명령어 2] 사이드바 패널 닫기
        this.addCommand({
            id: 'close-sidebar-panel',
            name: '사이드바 패널 닫기 (선택)',
            callback: () => {
                // 1단계: 대상 사이드바 선택
                this.openSidebarSelector((side) => {
                    const placeholder = `${side === 'left' ? '왼쪽' : '오른쪽'}에서 닫을 패널 선택`;
                    // 2단계: 선택한 패널을 detach(분리/닫기) 처리
                    new PanelControlModal(this.app, side, (leaf) => {
                        leaf.detach();
                        new Notice(`패널이 닫혔습니다.`);
                    }, placeholder).open();
                });
            }
        });
    }

    /**
     * 왼쪽 또는 오른쪽 사이드바를 먼저 고르게 하는 간단한 선택창을 띄웁니다.
     */
    openSidebarSelector(onSelect: (side: SidebarSide) => void) {
        const modal = new (class extends SuggestModal<SidebarSide> {
            getSuggestions() { return ['left', 'right'] as SidebarSide[]; }
            renderSuggestion(value: SidebarSide, el: HTMLElement) {
                el.setText(value === 'left' ? '왼쪽 사이드바' : '오른쪽 사이드바');
            }
            onChooseSuggestion(value: SidebarSide) { onSelect(value); }
        })(this.app);
        
        modal.setPlaceholder("사이드바를 선택하세요");
        modal.open();
    }

    /**
     * 패널(Leaf)을 반대편 사이드바의 새로운 Leaf로 복사한 뒤 기존 것을 삭제합니다.
     */
    moveLeafToOppositeSidebar(leaf: WorkspaceLeaf, currentSide: SidebarSide) {
        const oppositeSide = currentSide === 'left' ? 'right' : 'left';
        
        // 현재 패널의 상태(어떤 뷰인지, 어떤 데이터가 있는지)를 복사합니다.
        const state = leaf.getViewState();

        // 반대편 사이드바에 새로운 빈 자리를 만듭니다.
        const newLeaf = oppositeSide === 'left' 
            ? this.app.workspace.getLeftLeaf(false) 
            : this.app.workspace.getRightLeaf(false);

        if (newLeaf) {
            // 새로운 자리에 상태를 적용하고, 완료되면 기존 자리는 없앱니다.
            newLeaf.setViewState(state).then(() => {
                leaf.detach(); // 기존 위치의 패널 제거
                this.app.workspace.revealLeaf(newLeaf); // 이동된 패널 활성화
                new Notice(`패널이 ${oppositeSide === 'left' ? '왼쪽' : '오른쪽'}으로 이동되었습니다.`);
            });
        }
    }
}

/**
 * 패널 선택 모달 클래스
 * 특정 사이드바에 있는 패널 목록을 보여주고 사용자가 하나를 선택할 수 있게 합니다.
 */
class PanelControlModal extends SuggestModal<PanelOption> {
    constructor(
        app: App, 
        private sidebar: SidebarSide, 
        private action: (leaf: WorkspaceLeaf) => void, // 사용자가 선택했을 때 실행할 동작
        placeholder: string
    ) {
        super(app);
        this.setPlaceholder(placeholder);
    }

    // 사용자가 검색어를 입력할 때마다 필터링된 패널 목록을 가져옵니다.
    getSuggestions(query: string): PanelOption[] {
        const panels: PanelOption[] = [];
        // 대상이 되는 사이드바(왼쪽 혹은 오른쪽)를 가져옵니다.
        const targetSplit = this.sidebar === 'left' ? this.app.workspace.leftSplit : this.app.workspace.rightSplit;

        // 현재 앱의 모든 패널(Leaf)을 돌면서 우리가 선택한 사이드바에 속한 것만 골라냅니다.
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.getRoot() === targetSplit) {
                panels.push({
                    // 패널의 이름이 있으면 쓰고, 없으면 뷰 타입(예: search, file-explorer)을 가져옵니다.
                    name: leaf.getDisplayText() || leaf.view.getViewType(),
                    leaf: leaf
                });
            }
        });

        // 사용자가 입력한 검색어와 일치하는 패널만 필터링해서 반환합니다.
        return panels.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    }

    // 목록에 각 패널 이름을 어떻게 보여줄지 정의합니다.
    renderSuggestion(panel: PanelOption, el: HTMLElement) {
        el.createEl('div', { text: panel.name });
    }

    // 사용자가 항목을 최종 선택했을 때 생성 시 전달받은 action(이동 또는 삭제)을 실행합니다.
    onChooseSuggestion(panel: PanelOption) {
        this.action(panel.leaf);
    }
}
```
### properties
```ts
import { Plugin, Editor, Notice, parseYaml } from 'obsidian';

// 설정 인터페이스 정의
interface PropertiesSettings {
    userproperties: Record<string, string>;
}

// 기본값 정의
const DEFAULT_SETTINGS: PropertiesSettings = {
    userproperties: {
        "aliases": "[]",
        "base": "[]",
        "tags": "[]"
    }
}

export default class AddTagsPlugin extends Plugin {
    settings: PropertiesSettings;

    async onload() {
        const loadedData = await this.loadData();

        // 중첩 객체인 userproperties를 별도로 병합하여 얕은 병합 문제를 방지합니다.
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedData,
            userproperties: {
                ...DEFAULT_SETTINGS.userproperties,
                ...(loadedData?.userproperties ?? {})
            }
        };

        this.addCommand({
            id: "insert-properties",
            name: "속성 삽입",
            icon: "text-cursor-input",
            editorCallback: (editor: Editor) => this.handleInsertProperties(editor),
        });
    }

    // [Properties]
    async handleInsertProperties(editor: Editor) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("속성을 추가할 마크다운 파일을 찾을 수 없습니다.");
            return;
        }

        try {
            await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                const userProps = this.settings.userproperties;

                // [값 추가] 누락된 키에 기본값 채워넣기
                for (const [key, settingVal] of Object.entries(userProps)) {
                    if (frontmatter[key] === undefined) {
                        // startsWith 분기 없이 항상 parseYaml을 시도합니다.
                        // YAML 파서는 단순 문자열도 그대로 반환하므로 안전합니다.
                        try {
                            frontmatter[key] = parseYaml(settingVal.trim());
                        } catch (e) {
                            // 파싱에 실패한 경우, 어떤 키가 문제인지 사용자에게 알립니다.
                            new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                            frontmatter[key] = settingVal;
                        }
                    }
                }

                // [순서 정렬] 키를 알파벳순으로 재배치합니다.
                // V8 엔진의 객체 키 삽입 순서 보장에 의존하는 방식입니다.
                const sortedKeys = Object.keys(frontmatter).sort();

                const tempEntries: Record<string, any> = {};
                for (const key of sortedKeys) {
                    tempEntries[key] = frontmatter[key];
                    delete frontmatter[key];
                }

                for (const key of sortedKeys) {
                    frontmatter[key] = tempEntries[key];
                }
            });

        } catch (error) {
            // 콘솔에 상세 오류를 기록하여 디버깅을 용이하게 합니다.
            console.error("속성 처리 중 오류 발생:", error);
            new Notice("속성 처리 중 오류가 발생했습니다.");
        }
    }
}
```
### savemd
```ts
import {
    Plugin,
    TFile,
    Notice,
    normalizePath,
    moment
 } from 'obsidian';

interface DataJsonSettings {
    MAX_REPEAT: number; // savemd
    autoSaveTrigger: number; // savemd
    autoSaveTarget: string; // savemd
    SAVE_FOLDER_PATH: string; // savemd
    SAVE_DATE_FORMAT: string; // savemd
}

const DEFAULT_SETTINGS: DataJsonSettings = {
    MAX_REPEAT: 80,
    autoSaveTrigger: 500,
    autoSaveTarget: "",
    SAVE_FOLDER_PATH: "save",
    SAVE_DATE_FORMAT: "YYYYMMDDHHmmss"
}

export default class DataJsonPlugin extends Plugin {
    settings: DataJsonSettings;
    // savemd 입력 카운트 초기화
    private lastKey: string = "";
    private repeatCount: number = 0;
    // savemd 누적 입력 카운트
    private totalKeyCount: number = 0;

    async onload() {
        await this.loadSettings();
        // savemd
        // 리본 아이콘: 수동 save 파일 생성
        this.addRibbonIcon("lucide-save", "세이브 파일 만들기", () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.createSaveFile(activeFile);
            } else {
                new Notice("활성화된 파일이 없습니다.");
            }
        });
        // 수동 저장
        this.addCommand({
            id: "create-save-file",
            name: "현재 문서의 세이브 파일 만들기",
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === "md") {
                    if (!checking) {
                        this.createSaveFile(activeFile);
                    }
                    return true;
                }
                return false;
            },
        });
        // 자동 저장 대상 지정
        this.addCommand({
            id: 'set-auto-save-target',
            name: '현재 문서를 n타마다 자동 세이브 대상으로 지정',
            callback: () => this.handleSetAutoSaveTarget()
        });

        // 자동 저장 대상 해제
        this.addCommand({
            id: 'unset-auto-save-target',
            name: '현재 문서를 n타마다 자동 세이브 대상에서 해제',
            callback: () => this.handleUnsetAutoSaveTarget()
        });
       // 키보드 입력 감지 (비정상 입력 & 자동 저장)
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleAbnormalInput(evt);
            this.handleAutoSaveInput(evt);
        });
        // 파일 메뉴에 명령어 등록
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                // file이 TFile인지 검사
                if (file instanceof TFile){
                    menu.addItem((item) => {
                    item
                        .setTitle("현재 문서의 세이브 파일 만들기")
                        .setIcon("save")
                        .onClick(async () => {
                            await this.createSaveFile(file);
                        });
                });
                }
            })
        );
    }
    
    // data 불러오고 저장하는 메서드
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
    await this.saveData(this.settings);
    }

    // 자동 저장 대상 지정 메서드
    async handleSetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("마크다운 문서가 아닙니다.");
            return;
        }

        // 이미 다른 문서가 지정되어 있는지 확인
        if (this.settings.autoSaveTarget !== "") {
            // 경로에서 파일명만 추출해서 보여줌
            const currentTargetName = this.settings.autoSaveTarget.split('/').pop();
            new Notice(`이미 지정된 문서가 있습니다: ${currentTargetName}\n먼저 해제해주세요.`);
            return;
        }

        // 설정 저장
        this.settings.autoSaveTarget = activeFile.path;
        this.totalKeyCount = 0; // 카운트 초기화
        await this.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 시작되었습니다.\n(${this.settings.autoSaveTrigger}타 마다 저장)`);
    }

    // 자동 저장 대상 해제 메서드
    async handleUnsetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        
        // 현재 지정된 타겟이 없는 경우
        if (this.settings.autoSaveTarget === "") {
            new Notice("⚠️ 현재 자동 저장 대상으로 지정된 문서가 없습니다.");
            return;
        }

        // 활성 파일이 없거나, 지정된 타겟과 경로가 다를 경우
        if (!activeFile || activeFile.path !== this.settings.autoSaveTarget) {
            const currentTargetName = this.settings.autoSaveTarget.split('/').pop();
            new Notice(`⚠️ 이 문서는 자동 저장 대상이 아닙니다.\n(현재 대상: ${currentTargetName})`);
            return;
        }

        // 해제 로직
        this.settings.autoSaveTarget = "";
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
        if (this.repeatCount >= this.settings.MAX_REPEAT) {
            this.emergencyAction(activeView);
        }
    }
    // 자동 저장 입력 감지 로직
    private handleAutoSaveInput(evt: KeyboardEvent) {
        // 1. 기능이 비활성화(0)거나 타겟이 설정되지 않았으면 즉시 종료
        if (this.settings.autoSaveTrigger <= 0 || this.settings.autoSaveTarget === "") return;

        // 2. Modifier 키 제외
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        // 3. [핵심] 현재 문서가 지정된 타겟 문서와 일치하는지 확인 (경로 비교)
        if (activeFile.path !== this.settings.autoSaveTarget) return;

        // 포커스가 에디터에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 4. 카운트 증가 및 저장 실행
        this.totalKeyCount++;

        if (this.totalKeyCount >= this.settings.autoSaveTrigger) {
            this.totalKeyCount = 0; // 카운트 리셋
            this.createSaveFile(activeFile);
            // Notice 메시지에 자동 저장됨을 명시하면 더 좋습니다 (선택사항)
            new Notice(`${this.settings.autoSaveTrigger}타 자동 저장`);
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
        const folderPath = this.settings.SAVE_FOLDER_PATH;
        const ts = moment().format(this.settings.SAVE_DATE_FORMAT);
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
}
```
### selection
```ts
import { Plugin, Editor, EditorSelection } from 'obsidian';

export default class SelectionExpander extends Plugin {
    async onload() {

        // 왼쪽 1칸
        this.addCommand({
            id: 'expand-selection-left',
            name: '선택 범위 왼쪽으로 한 칸 늘리기',
            icon: "lucide-chevron-left",
            hotkeys: [{ modifiers: ["Mod"], key: "ArrowLeft"}],
            editorCallback: (editor: Editor) => this.expandLeft(editor),
        });

        // 왼쪽 행 시작까지
        this.addCommand({
            id: 'expand-selection-left-end',
            name: '선택 범위 행 시작까지 늘리기',
            icon: "lucide-chevrons-left",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowLeft"}],
            editorCallback: (editor: Editor) => this.expandLeftEnd(editor),
        });

        // 오른쪽 1칸
        this.addCommand({
            id: 'expand-selection-right',
            name: '선택 범위 오른쪽으로 한 칸 늘리기',
            icon: "lucide-chevron-right",
            hotkeys: [{ modifiers: ["Mod"], key: "ArrowRight"}],
            editorCallback: (editor: Editor) => this.expandRight(editor),
        });

        // 오른쪽 행 끝까지
        this.addCommand({
            id: 'expand-selection-right-end',
            name: '선택 범위 행 끝까지 늘리기',
            icon: "lucide-chevrons-right",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowRight"}],
            editorCallback: (editor: Editor) => this.expandRightEnd(editor),
        });
    }

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
}
```
### snippets
```ts
import { 
    Plugin, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch, Notice
} from 'obsidian';

interface SnippetsSettings {
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
}

interface SnippetsItem { content: string; }

const DEFAULT_SETTINGS: SnippetsSettings = {
    snippetTrigger: "\\",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {}
}

export default class SnippetsPlugin extends Plugin {
    settings: SnippetsSettings;
    // snippets/symbols debounce savesettings 선언
    private saveTimer: number | null = null;
    debouncedSave() {
        if (this.saveTimer) window.clearTimeout(this.saveTimer);

        this.saveTimer = window.setTimeout(() => {
            this.saveSettings();
            this.saveTimer = null;
        }, 300);
    }
    async onload() {
        await this.loadSettings();
        // 서제스트 등록
        this.registerEditorSuggest(new SnippetsSuggestions(this));

        // snippets
        this.addCommand({
            id: 'add-to-snippets',
            name: '조각글 추가',
            icon: 'lucide-clipboard-plus',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                this.addSnippet(selection);
            }
        });
        this.addCommand({
            id: 'remove-from-snippets',
            name: '조각글 제거',
            icon: 'lucide-clipboard-minus',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                this.removeSnippet(selection);
            }
        });
    }
    // [Common] Data
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

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
}
// snippets
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SnippetsSuggestions extends EditorSuggest<SnippetsItem> {
    plugin: SnippetsPlugin; // 메인 플러그인 인스턴스 보관
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그

    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: SnippetsPlugin) { 
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

            // [핵심 2] UI를 띄우지 않기 위해 빈 배열 반환
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

// snippets, symbols 공통 helper 함수
// 트리거 regex 기호 escape 함수
function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);

    // character class 는 반드시 single char 기준
    const first = escaped[0];

    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}
```
### symbols
```ts
import { 
    Plugin, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch, MarkdownView
} from 'obsidian';

interface SymbolsSettings {
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    pairs: Record<string, string>;
    recentSymbols: Record<string, number>;
}

interface SymbolItem { id: string; symbol: string; closing?: string; }

const DEFAULT_SETTINGS: SymbolsSettings = {
    symbolTrigger: "/",
    symbolLimit: 5,
    symbols: [
        { id: ".", symbol: "⋯" },
        { id: "-", symbol: "—" },
        { id: ",", symbol: "·" },
        { id: "\"", symbol: "“", closing: "”" },
        { id: "'", symbol: "‘", closing: "’" },
        { id: ">>", symbol: "”" },
        { id: ">", symbol: "’" },
        { id: "낫", symbol: "｢", closing: "｣" },
        { id: "낫2", symbol: "｣" },
        { id: "겹", symbol: "『", closing: "』" },
        { id: "겹2", symbol: "』" },
    ],
    pairs: {
        "“": "”",
        "‘": "’",
        "｢": "｣",
        "『": "』"
    },
    recentSymbols: {}
}

export default class SymbolPlugin extends Plugin {
    settings: SymbolsSettings;
    // snippets/symbols debounce savesettings 선언
    private saveTimer: number | null = null;
    debouncedSave() {
        if (this.saveTimer) window.clearTimeout(this.saveTimer);

        this.saveTimer = window.setTimeout(() => {
            this.saveSettings();
            this.saveTimer = null;
        }, 300);
    }
    async onload() {
        await this.loadSettings();
        // 서제스트 등록
        this.registerEditorSuggest(new SymbolSuggestions(this));

        // 백스페이스 이벤트 핸들러 분리 등록
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleSmartBackspace(evt);
        }, true);
    }
    // [Common] Data
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

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
            
            if (prevChar && nextChar && this.settings.pairs[prevChar] === nextChar) {
                editor.replaceRange("", 
                    { line: cursor.line, ch: cursor.ch - 1 }, 
                    { line: cursor.line, ch: cursor.ch + 1 }
                );
                evt.preventDefault();
                evt.stopPropagation();
            }
        }
    }
}
// symbols
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SymbolSuggestions extends EditorSuggest<SymbolItem> {
    // 메인 플러그인 인스턴스 보관
    plugin: SymbolPlugin;
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그
    
    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: SymbolPlugin) {
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

            // [핵심] UI 유지를 위해 suggestions 반환 (빈 배열 아님)
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

// snippets, symbols 공통 helper 함수
// 트리거 regex 기호 escape 함수
function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);

    // character class 는 반드시 single char 기준
    const first = escaped[0];

    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}
```
### taskplan
```ts
import {
    Plugin, TFile, Notice, MarkdownView, Editor, SuggestModal, App,
    EditorPosition
} from 'obsidian';

interface TaskPlanSettings {
    taskFilePath: string;
    planFilePath: string;
}

const DEFAULT_SETTINGS: TaskPlanSettings = {
    taskFilePath: 'task.md',
    planFilePath: 'plan.md'
};

export default class TaskPlanPlugin extends Plugin {
    settings: TaskPlanSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('lucide-square-check', '할 일 문서 열기', () => {
            this.openFile(this.settings.taskFilePath);
        });
        this.addRibbonIcon('lucide-book-text', '계획 문서 열기', () => {
            this.openFile(this.settings.planFilePath);
        });

        this.addCommand({
            id: 'open-task-file',
            name: '할 일 문서 열기',
            callback: () => this.openFile(this.settings.taskFilePath),
        });
        this.addCommand({
            id: 'open-plan-file',
            name: '계획 문서 열기',
            callback: () => this.openFile(this.settings.planFilePath),
        });

        this.addCommand({
            id: 'move-line-taskplan',
            name: '할 일 이동',
            icon: 'lucide-arrow-left-right',
            editorCallback: (editor: Editor, view: MarkdownView) =>
                this.handleLineMove(editor, view),
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // 파일 열기: 이미 열린 leaf가 있으면 활성화, 없으면 현재 leaf에서 열기
    private async openFile(path: string) {
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
        this.openFile(targetPath);
    }
}

class MoveLinetoPlanSuggestModal extends SuggestModal<string> {
    sections: string[];
    onSubmit: (selectedSection: string) => void;

    constructor(
        app: App,
        sections: string[],
        onSubmit: (selectedSection: string) => void
    ) {
        super(app);
        this.sections = sections;
        this.onSubmit = onSubmit;
        this.setPlaceholder('이동할 섹션을 선택하세요...');
    }

    getSuggestions(query: string): string[] {
        return this.sections.filter(s =>
            s.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(section: string, el: HTMLElement) {
        el.createEl('div', { text: section.replace(/^#+\s+/, '') });
    }

    onChooseSuggestion(section: string, _evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(section);
    }
}
```
### work
```ts
import {
    Plugin, TFile, Notice, WorkspaceLeaf, moment
} from 'obsidian';

// 설정 데이터 인터페이스 정의
interface OpenWorkFileSettings {
    cleanupOnStartup: boolean;  // 시작 시 정리 로직 실행 여부
    workFilePath: string;       // 작업 파일 경로 (예: work.md)
    laterFilePath: string;      // 백업 파일 경로 (예: later.md)
    timestampFormat: string;    // moment.js 날짜 포맷 (data.json에서 수정 가능)
}

// 기본 설정값 정의
const DEFAULT_SETTINGS: OpenWorkFileSettings = {
    cleanupOnStartup: false,
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    timestampFormat: 'MM/DD HH:mm:ss', // 기본 포맷 (월-일 시:분:초)
};

export default class OpenWorkFilePlugin extends Plugin {
    settings: OpenWorkFileSettings;

    async onload() {
        await this.loadSettings();

        // 리본 아이콘 클릭 시: 작업 문서를 엽니다.
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', async () => {
            await this.cleanupTabs();
            await this.cleanWorkAndBackup();
            await this.openWorkFile();
            await this.openLaterFile();
        });

        // 커맨드 팔레트 명령: 작업 문서를 엽니다.
        this.addCommand({
            id: 'open-work-file',
            name: '작업 문서 열기',
            callback: async () => {
                await this.cleanupTabs();
                await this.openWorkFile();
            },
        });

        this.addCommand({
            id: 'clean-work-file',
            name: '작업 문서 정리',
            callback: async () => {
                await this.cleanWorkAndBackup();
                await this.openWorkFile();
                await this.openLaterFile();
            },
        });

        // 앱이 준비되면 시작 로직 실행
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.cleanupOnStartup) {
                this.runStartupSequence();
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 시작 시 실행되는 순차 로직.
     * setTimeout 대신 onLayoutReady 이후 바로 실행하되,
     * 각 단계를 명시적으로 순서대로 await 처리합니다.
     */
    private async runStartupSequence() {
        await this.cleanupTabs();
        const success = await this.cleanWorkAndBackup();
        if (success) {
            await this.openWorkFile();
        }
    }

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
    }

    /**
     * [메서드 2] cleanWorkAndBackup
     * work.md의 내용을 later.md로 백업한 뒤 work.md를 비웁니다.
     * 백업 성공 여부를 boolean으로 반환합니다.
     * - later.md가 없으면 작업을 중단하고 내용을 유지합니다.
     * - 파일 I/O 오류 발생 시 사용자에게 알리고 false를 반환합니다.
     */
    async cleanWorkAndBackup() {
        const { vault } = this.app;
        const workPath = this.settings.workFilePath;
        const laterPath = this.settings.laterFilePath;

        try {
            // 작업 파일 객체 가져오기
            const workFile = vault.getAbstractFileByPath(workPath);

            // 파일이 존재하고 TFile 인스턴스인지 확인
            if (!(workFile instanceof TFile)) {
                new Notice(`작업 파일을 찾을 수 없습니다: ${workPath}`);
                return false;
            }

            // 현재 작업 내용 읽기
            const content = await vault.read(workFile);

            // 내용이 비어있으면 백업 불필요, 성공으로 처리
            if (!content.trim()) return true;

            // later.md 존재 여부를 먼저 확인 — 없으면 데이터 유실 방지를 위해 중단
            const laterFile = vault.getAbstractFileByPath(laterPath);
            if (!(laterFile instanceof TFile)) {
                new Notice(`백업 파일(${laterPath})이 존재하지 않아 정리를 중단합니다. 먼저 백업 파일을 생성해주세요.`);
                return false;
            }

            // 백업 내용 포맷팅 후 later.md에 추가
            const timestamp = moment().format(this.settings.timestampFormat);
            const isEffectivelyEmpty = content.trim().length === 0;
            const prefix = isEffectivelyEmpty ? '' : '\n';
            const backupContent = `${prefix}${timestamp}\n${content}`;
            await vault.append(laterFile, backupContent);

            // 백업 완료 후 work.md 비우기
            await vault.modify(workFile, '');
            return true;

        } catch (error) {
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return false;
        }
    }

    /**
     * [메서드 3] openWorkFile
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
            // 인자 없이 호출해 항상 유효한 leaf를 확보합니다.
            const leaf = workspace.getLeaf();
            await leaf.openFile(targetFile);
            workspace.setActiveLeaf(leaf, { focus: true });

        } catch (error) {
            new Notice('작업 문서를 여는 중 오류가 발생했습니다.');
        }
    }

    /**
     * [메서드 4] openLaterFile
     * later.md 파일을 현재 탭에 엽니다.
     */
    async openLaterFile() {
        const { workspace, vault } = this.app;
        const path = this.settings.laterFilePath;

        try {
            const targetFile = vault.getAbstractFileByPath(path);

            if (!(targetFile instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            const leaf = workspace.getLeaf(true);
            await leaf.openFile(targetFile);
        } catch (error) {
            new Notice('백업 문서를 여는 중 오류가 발생했습니다.');
        }
    }
}
```