import type ATOZVER6Plugin from '../main';
import { Editor, EditorPosition, MarkdownView, Notice, TFile, WorkspaceLeaf, moment } from 'obsidian';

export class OrdinaryFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async openFileOrdinary() {
        const path = this.plugin.settings.ordinaryFilePath;
        const file = this.plugin.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        // 원래 값 보존, 메모리상에서만 임시로 false
        const originalCursorCenter = this.plugin.settings.isCursorCenterEnabled;
        this.plugin.settings.isCursorCenterEnabled = false;

        // 이미 열려 있는 탭이 있다면 focus, 없으면 현재 탭에서 열기
        const existingLeaf = this.plugin.app.workspace.getLeavesOfType("markdown")
            .find(leaf => (leaf.view as MarkdownView).file?.path === path);
        let targetLeaf: WorkspaceLeaf;

        if (existingLeaf) {
        	targetLeaf = existingLeaf;
        	this.plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
        } else {
        	targetLeaf = this.plugin.app.workspace.getLeaf(false);
        	await targetLeaf.openFile(file);
        }

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

    async scrollToBottom(editor: Editor, restoreCursorCenter?: boolean) {
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
            this.plugin.settings.isCursorCenterEnabled = restoreCursorCenter;
        }
    }
}
