import type ATOZVER6Plugin from '../main';
import { MarkdownView } from 'obsidian';

export class ExecutesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    executeDeleteParagraph() {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
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
}
