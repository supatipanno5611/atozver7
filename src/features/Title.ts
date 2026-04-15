import type ATOZVER6Plugin from '../main';
import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Notice } from 'obsidian';
import { escapeRegex } from '../utils';

const EMPTY_QUERY = '__EMPTY_QUERY__';
const NO_RESULT_PREFIX = '__NO_RESULT__:';

export class TitleFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    private buildFileToTitleMap(): Map<string, string> {
        const fileToTitle = new Map<string, string>();
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const title = cache?.frontmatter?.['title'];
            if (typeof title === 'string' && title.trim()) {
                fileToTitle.set(file.basename, title.trim());
            }
        }
        return fileToTitle;
    }

    private replaceLinksInString(text: string, fileToTitle: Map<string, string>): { newStr: string; count: number } {
        let count = 0;
        const newStr = text.replace(/\[\[([^\]|#^]+)((?:#[^\]|^]*)|(?:\^[^\]|]*))?\]\]/g, (match, name, frag) => {
            const title = fileToTitle.get(name.trim());
            if (!title) return match;
            count++;
            return `[[${name.trim()}${frag ?? ''}|${title}]]`;
        });
        return { newStr, count };
    }

    async convertWikilinks(): Promise<void> {
        const { vault, metadataCache, fileManager } = this.plugin.app;
        const files = vault.getMarkdownFiles();
        const fileToTitle = this.buildFileToTitleMap();

        let totalLinks = 0;
        const changedFiles = new Set<string>();

        // 1패스: 본문 처리 (metadataCache.links + 역방향 offset 치환)
        for (const file of files) {
            const cache = metadataCache.getFileCache(file);
            const links = cache?.links;
            if (!links || links.length === 0) continue;

            const content = await vault.read(file);
            const sortedLinks = [...links].sort((a, b) => b.position.start.offset - a.position.start.offset);

            let modifiedContent = content;
            let bodyChanged = false;

            for (const linkCache of sortedLinks) {
                if (linkCache.original.includes('|')) continue;
                const baseFileName = linkCache.link.split(/[#^]/)[0]?.trim() ?? '';
                const targetTitle = fileToTitle.get(baseFileName);
                if (!targetTitle) continue;

                const newLinkText = `[[${linkCache.link}|${targetTitle}]]`;
                modifiedContent =
                    modifiedContent.substring(0, linkCache.position.start.offset) +
                    newLinkText +
                    modifiedContent.substring(linkCache.position.end.offset);

                totalLinks++;
                bodyChanged = true;
            }

            if (bodyChanged) {
                await vault.modify(file, modifiedContent);
                changedFiles.add(file.path);
            }
        }

        // 2패스: 프론트매터 처리 (processFrontMatter + 정규식)
        for (const file of files) {
            await fileManager.processFrontMatter(file, (frontmatter) => {
                for (const key in frontmatter) {
                    const value = frontmatter[key];
                    if (typeof value === 'string') {
                        const { newStr, count } = this.replaceLinksInString(value, fileToTitle);
                        if (count > 0) {
                            frontmatter[key] = newStr;
                            totalLinks += count;
                            changedFiles.add(file.path);
                        }
                    } else if (Array.isArray(value)) {
                        frontmatter[key] = value.map(item => {
                            if (typeof item === 'string') {
                                const { newStr, count } = this.replaceLinksInString(item, fileToTitle);
                                if (count > 0) {
                                    totalLinks += count;
                                    changedFiles.add(file.path);
                                    return newStr;
                                }
                            }
                            return item;
                        });
                    }
                }
            });
        }

        new Notice(`위키링크 변환 완료: ${totalLinks}개 링크 (${changedFiles.size}개 파일)`);
    }
}

export class TitleSuggestions extends EditorSuggest<{ title: string; filePath: string }> {
    private plugin: ATOZVER6Plugin;

    constructor(plugin: ATOZVER6Plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const trigger = this.plugin.settings.titleTrigger;
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        const match = line.match(new RegExp(`${escapeRegex(trigger)}([^${escapeRegex(trigger)}\\s]*)$`));
        if (!match) return null;
        return {
            start: { line: cursor.line, ch: match.index! },
            end: cursor,
            query: match[1] ?? ''
        };
    }

    getSuggestions(ctx: EditorSuggestContext): { title: string; filePath: string }[] {
        const query = ctx.query.toLowerCase();
        if (!query) return [{ title: EMPTY_QUERY, filePath: '' }];
        const results: { title: string; filePath: string; score: number }[] = [];
        for (const [title, filePath] of this.plugin.titleCandidates) {
            const idx = title.toLowerCase().indexOf(query);
            if (idx !== -1) results.push({ title, filePath, score: idx });
        }
        if (results.length === 0) return [{ title: `${NO_RESULT_PREFIX}${ctx.query}`, filePath: '' }];
        results.sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return a.title.length - b.title.length;
        });
        return results.map(r => ({ title: r.title, filePath: r.filePath }));
    }

    renderSuggestion(item: { title: string; filePath: string }, el: HTMLElement) {
        if (item.title === EMPTY_QUERY) { el.setText('검색어를 입력하세요'); return; }
        if (item.title.startsWith(NO_RESULT_PREFIX)) { el.setText(`${item.title.slice(NO_RESULT_PREFIX.length)}가 없습니다.`); return; }
        el.setText(item.title);
    }

    selectSuggestion(item: { title: string; filePath: string }) {
        if (item.filePath === '') return;
        if (!this.context) return;
        const { editor, start, end } = this.context;
        const fileName = item.filePath.split('/').pop()?.replace(/\.md$/, '') ?? item.filePath;
        editor.replaceRange(`[[${fileName}|${item.title}]]`, start, end);
    }
}
