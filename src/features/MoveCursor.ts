import type ATOZVER6Plugin from '../main';
import { Editor, EditorPosition } from 'obsidian';

export class MoveCursorFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    moveCursorToEnd(editor: Editor) {
        editor.focus();
        const line = editor.lineCount() - 1;
        const pos: EditorPosition = { line, ch: editor.getLine(line).length };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }

    moveCursorToStart(editor: Editor) {
        editor.focus();
        const pos: EditorPosition = { line: 0, ch: 0 };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }

    goToLineStart(editor: Editor) {
    		const cursor = editor.getCursor();
    		editor.setCursor({ line: cursor.line, ch: 0 });
  	}

  	goToLineEnd(editor: Editor) {
  			const cursor = editor.getCursor();
  			editor.setCursor({ line: cursor.line, ch: editor.getLine(cursor.line).length });
  	}
}
