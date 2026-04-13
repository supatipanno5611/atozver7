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

        // iterateRootLeaves로 사이드바 제외
        let existingLeaf: WorkspaceLeaf | null = null;
        this.plugin.app.workspace.iterateRootLeaves((leaf) => {
            if (!existingLeaf && (leaf.view as MarkdownView).file?.path === path) {
                existingLeaf = leaf;
            }
        });

        // 이미 열린 탭이 있으면 포커스만 이동하고 종료
        if (existingLeaf) {
            this.plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
            const view = (existingLeaf as WorkspaceLeaf).view;
            if (view instanceof MarkdownView) view.editor.focus();
            return;
        }

        // 열린 탭이 없으면 현재 탭에서 열기
        const leaf = this.plugin.app.workspace.getLeaf(false);
        await leaf.openFile(file, { active: true });

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            view.editor.focus();

            const lastLineIndex = view.editor.lineCount() - 1;
            const lastLineLength = view.editor.getLine(lastLineIndex).length;
            const cursorPosition = { line: lastLineIndex, ch: lastLineLength };
            view.editor.setCursor(cursorPosition);
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
                if (isPinned) activeLeaf.setPinned(false);
                await this.openFileInLeaf(activeLeaf, planFile);
            }
        }
        // [상황 B] 현재 탭 == Plan 파일
        else if (currentPath === planPath) {
            if (existingTaskLeaf && existingTaskLeaf !== activeLeaf) {
                workspace.setActiveLeaf(existingTaskLeaf, { focus: true });
            } else {
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
            } else {
                if (isPinned) {
                    await this.openFileInNewTab(taskFile);
                } else {
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
                editor, targetFile, contentToMove, startLine, endLine
            );
        } else {
            await this.prependToTopOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine);
        }
    }

    // task → plan: 섹션 목록을 읽고 모달로 삽입 위치를 결정
    private async moveToplan(
        editor: Editor,
        targetFile: TFile,
        contentToMove: string,
        startLine: number,
        endLine: number
    ) {
        const content = await this.plugin.app.vault.read(targetFile);
        const sections = content.split('\n').filter(l => l.startsWith('#'));

        if (sections.length === 0) {
            await this.appendToEndOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine);
            return;
        }

        new MoveLinetoPlanSuggestModal(
            this.plugin.app,
            sections,
            async (selectedSection) => {
                await this.insertAfterSection(targetFile, selectedSection, contentToMove);
                this.finalizeMove(editor, startLine, endLine);
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
        endLine: number
    ) {
        const from: EditorPosition = { line: startLine, ch: 0 };
        const to: EditorPosition = { line: endLine + 1, ch: 0 };

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
