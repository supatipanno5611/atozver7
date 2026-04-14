import type ATOZVER6Plugin from '../main';
import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch } from 'obsidian';

export class TitleSuggestions extends EditorSuggest<{ title: string; filePath: string }> {
    private plugin: ATOZVER6Plugin;

    constructor(plugin: ATOZVER6Plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        const match = line.match(/\|([^\|\s]*)$/);
        if (!match) return null;
        return {
            start: { line: cursor.line, ch: match.index! },
            end: cursor,
            query: match[1] ?? ''
        };
    }

    getSuggestions(ctx: EditorSuggestContext): { title: string; filePath: string }[] {
        const query = ctx.query.toLowerCase();

        let suggestions: { title: string; filePath: string }[];

        if (!query) {
            suggestions = [...this.plugin.titleCandidates.entries()]
                .map(([title, filePath]) => ({ title, filePath }));
        } else {
            const fuzzy = prepareFuzzySearch(query);
            const results: { title: string; filePath: string; score: number }[] = [];
            for (const [title, filePath] of this.plugin.titleCandidates) {
                const result = fuzzy(title.toLowerCase());
                if (result) results.push({ title, filePath, score: result.score });
            }
            results.sort((a, b) => b.score - a.score);
            suggestions = results.map(r => ({ title: r.title, filePath: r.filePath }));
        }

        return suggestions;
    }

    renderSuggestion(item: { title: string; filePath: string }, el: HTMLElement) {
        const fileName = item.filePath.split('/').pop()?.replace(/\.md$/, '') ?? item.filePath;
        el.setText(`${item.title} (${fileName})`);
    }

    selectSuggestion(item: { title: string; filePath: string }) {
        if (!this.context) return;
        const { editor, start, end } = this.context;
        const fileName = item.filePath.split('/').pop()?.replace(/\.md$/, '') ?? item.filePath;
        editor.replaceRange(`[[${fileName}|${item.title}]]`, start, end);
    }
}
