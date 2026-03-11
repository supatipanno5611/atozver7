import type ATOZVER6Plugin from '../main';
import { App, Editor, EditorPosition, MarkdownView, Notice, SuggestModal, TFile, WorkspaceLeaf } from 'obsidian';

export class TaskPlanFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    // 파일 열기: 이미 열린 leaf가 있으면 활성화, 없으면 현재 leaf에서 열기 (리본 아이콘용)
    async openTaskPlanFile(path: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        const existingLeaf = this.plugin.app.workspace
            .getLeavesOfType('markdown')
            .find(l => (l.view as MarkdownView).file?.path === path);

        const leaf = existingLeaf ?? this.plugin.app.workspace.getLeaf(false);
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
        const { workspace, vault } = this.plugin.app;
        const taskPath = this.plugin.settings.taskFilePath;
        const planPath = this.plugin.settings.planFilePath;

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
        const leaf = this.plugin.app.workspace.getLeaf('tab');
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
    async handleLineMove(editor: Editor, view: MarkdownView) {
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

        const isFromTask = currentPath === this.plugin.settings.taskFilePath;
        const isFromPlan = currentPath === this.plugin.settings.planFilePath;
        if (!isFromTask && !isFromPlan) return null;

        const targetPath = isFromTask
            ? this.plugin.settings.planFilePath
            : this.plugin.settings.taskFilePath;

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
        const file = this.plugin.app.vault.getAbstractFileByPath(targetPath);
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
        const content = await this.plugin.app.vault.read(targetFile);
        const sections = content.split('\n').filter(l => l.startsWith('#'));

        if (sections.length === 0) {
            await this.appendToEndOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, targetPath);
            return;
        }

        new MoveLinetoPlanSuggestModal(
            this.plugin.app,
            sections,
            async (selectedSection) => {
                await this.insertAfterSection(targetFile, selectedSection, contentToMove);
                this.finalizeMove(editor, startLine, endLine, targetPath);
            }
        ).open();
    }

    // 선택한 섹션의 마지막 비어있지 않은 줄 직후에 삽입
    private async insertAfterSection(file: TFile, section: string, text: string) {
        await this.plugin.app.vault.process(file, (data) => {
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
        await this.plugin.app.vault.process(file, (data) => {
            const needsNewline = data.length > 0 && !data.endsWith('\n');
            return data + (needsNewline ? '\n' : '') + text;
        });
    }

    // task 파일 맨 윗줄에 삽입
    private async prependToTopOfFile(file: TFile, text: string) {
        await this.plugin.app.vault.process(file, (data) => {
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
}

// [TaskPlan] Modal
export class MoveLinetoPlanSuggestModal extends SuggestModal<string> {
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
