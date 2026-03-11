import type ATOZVER6Plugin from '../main';
import { FileView, MarkdownView, Notice, TFile, WorkspaceLeaf, moment } from 'obsidian';

export class WorkFeature {
    private isWorkLaterToggling = false;

    constructor(private plugin: ATOZVER6Plugin) {}

    /**
     * [메서드 1] cleanupTabs
     * 메인 워크스페이스의 탭을 정리합니다.
     * 단, '고정된(Pinned)' 탭은 닫지 않고 유지합니다.
     */
    async cleanupTabs() {
        const { workspace } = this.plugin.app;
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
        const { vault, workspace } = this.plugin.app;
        const workPath = this.plugin.settings.workFilePath;

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
        const { vault } = this.plugin.app;
        const laterPath = this.plugin.settings.laterFilePath;

        try {
            // 백업 파일 존재 여부 확인 — 없으면 데이터 유실 방지를 위해 중단
            const laterFile = vault.getAbstractFileByPath(laterPath);
            if (!(laterFile instanceof TFile)) {
                new Notice(`백업 파일(${laterPath})이 존재하지 않습니다. 작업이 중단되고 내용이 유지됩니다.`);
                return false;
            }

            // 백업 내용 포맷팅 후 later.md에 추가
            const timestamp = moment().format(this.plugin.settings.workTimestampFormat);
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
     */
    async openWorkFile() {
        const { workspace, vault } = this.plugin.app;
        const path = this.plugin.settings.workFilePath;

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
     * [메서드 5] toggleLaterFileInRightSidebar
     * later.md 파일이 오른쪽 사이드바에 있다면 닫고(detach), 없다면 엽니다.
     */
    async toggleLaterFileInRightSidebar() {
        // Race Condition 방지: 명령어가 빠르게 여러 번 실행되는 경우를 대비해, 실행 중에는 잠금(lock)을 걸어서 중복 실행을 방지할 수 있습니다.
        if (this.isWorkLaterToggling) return;
        this.isWorkLaterToggling = true;

        try {
            const { workspace, vault } = this.plugin.app;
            const path = this.plugin.settings.laterFilePath;

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
                (existingLeaf as WorkspaceLeaf).detach();

                // 닫은 후 메인 에디터 포커스 복구
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
