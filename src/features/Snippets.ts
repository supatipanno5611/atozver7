import type ATOZVER6Plugin from '../main';
import { Notice, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch } from 'obsidian';
import { SnippetsItem } from '../types';
import { buildTriggerRegex } from '../utils';

export class SnippetsFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async addSnippet(content: string) {
        // 1. 내용이 아예 없는 경우만 체크합니다.
        if (!content || content.length === 0) {
            new Notice("추가할 텍스트를 선택해주세요.");
            return;
        }

        // 2. .trim()을 제거하여 사용자가 선택한 공백/줄바꿈을 그대로 보존합니다.
        if (this.plugin.settings.snippets.includes(content)) {
            new Notice("이미 존재하는 조각글입니다.");
            return;
        }

        // 3. 배열에 추가하고 저장합니다.
        this.plugin.settings.snippets.push(content);
        await this.plugin.saveSettings();

        // 알림창에서는 가독성을 위해 앞뒤 공백을 제거하고 보여줄 수 있습니다.
        new Notice(`조각글 등록 완료: "${content.trim()}"`);
    }

    async removeSnippet(content: string) {
        if (!content || content.length === 0) {
            new Notice("제거할 텍스트를 선택해주세요.");
            return;
        }

        // 목록에 존재하는지 확인
        if (!this.plugin.settings.snippets.includes(content)) {
            new Notice("조각글 목록에 일치하는 텍스트가 없습니다.");
            return;
        }

        // 해당 텍스트를 제외한 나머지만 남김
        this.plugin.settings.snippets = this.plugin.settings.snippets.filter(item => item !== content);

        await this.plugin.saveSettings();
        new Notice(`조각글 제거 완료: "${content.trim()}"`);
    }
}

// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
export class SnippetsSuggestions extends EditorSuggest<SnippetsItem> {
    plugin: ATOZVER6Plugin;
    private autoInserted = false;

    constructor(plugin: ATOZVER6Plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        this.autoInserted = false;
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        const trigger = this.plugin.settings.snippetTrigger;
        const match = line.match(buildTriggerRegex(trigger));
        return match ? {
            start: { line: cursor.line, ch: match.index! },
            end: cursor,
            query: match[1] ?? ""
        } : null;
    }

    getSuggestions(ctx: EditorSuggestContext): SnippetsItem[] {
        if (this.plugin.settings.snippetLimit < 1) return [];
        const query = ctx.query.toLowerCase();
        const fuzzy = prepareFuzzySearch(query);

        const SNIPPETS_RECENT_WEIGHT = 0.0000001;
        const suggestions = this.plugin.settings.snippets
            .map(text => {
                const result = fuzzy(text.toLowerCase());
                const lastUsed = this.plugin.settings.recentSnippets[text] ?? 0;
                return {
                    item: { content: text },
                    score: result ? result.score : -1,
                    recent: lastUsed
                };
            })
            .filter(res => res.score !== -1)
            .map(res => ({
                item: res.item,
                finalScore: res.score + res.recent * SNIPPETS_RECENT_WEIGHT
            }))
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, this.plugin.settings.snippetLimit)
            .map(res => res.item);

        if (query.length > 0 && suggestions.length === 1 && !this.autoInserted) {
            const targetItem = suggestions[0];
            if (!targetItem) return suggestions;

            const triggerChar = this.plugin.settings.snippetTrigger;
            if (targetItem.content.includes(triggerChar)) {
                return suggestions;
            }

            this.autoInserted = true;

            setTimeout(() => {
                if (!this.context) return;
                this.selectSuggestion(targetItem);
                this.close();
            }, 0);

            return suggestions;
        }

        return suggestions;
    }

    renderSuggestion(item: SnippetsItem, el: HTMLElement) {
        el.setText(`${item.content}`);
    }

    selectSuggestion(item: SnippetsItem) {
        if (!this.context) return;

        const { editor, start, end } = this.context;
        editor.replaceRange(item.content, start, end);
        this.recordRecent(item.content);
    }

    private recordRecent(content: string) {
        const recent = this.plugin.settings.recentSnippets;
        recent[content] = Date.now();
        const limit = this.plugin.settings.snippetLimit;
        this.plugin.settings.recentSnippets = Object.fromEntries(
            Object.entries(recent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
        );
        this.plugin.debouncedSave();
    }
}
