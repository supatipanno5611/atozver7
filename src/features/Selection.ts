import type ATOZVER6Plugin from '../main';
import { Editor, EditorSelection } from 'obsidian';

export class SelectionFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

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
