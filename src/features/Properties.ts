import type ATOZVER6Plugin from '../main';
import { App, Editor, Notice, SuggestModal, parseYaml, stringifyYaml } from 'obsidian';
import { ParsedDocument } from '../types';
import { moment } from 'obsidian';
import { URL_PATTERN, INTERNAL_LINK_PATTERN, DATE_PATTERN, sortBase } from '../utils';

export class PropertiesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    parseDocument(raw: string): ParsedDocument {
        const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;
        const match = raw.match(FRONTMATTER_REGEX);

        if (!match) {
            return { frontmatter: {}, body: raw };
        }

        const yamlString = match[1] ?? '';
        const afterBlock = raw.slice(match[0].length);

        try {
            const parsed = parseYaml(yamlString);
            const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? parsed as Record<string, any>
                : {};
            return { frontmatter, body: afterBlock };
        } catch {
            return { frontmatter: {}, body: raw };
        }
    }

    private buildDocument(frontmatter: Record<string, any>, body: string): string {
        const yamlString = stringifyYaml(frontmatter).trimEnd();
        const frontmatterBlock = `---\n${yamlString}\n---`;

        if (body.trim().length === 0) {
            return frontmatterBlock;
        }

        const trimmedBody = body.replace(/^\n+/, '');
        return `${frontmatterBlock}\n${trimmedBody}`;
    }

    private buildTodayBase(): string[] {
        const m = moment();
        return [
            m.format('YYYY년'),
            m.format('M월'),
            m.format('D일'),
        ];
    }

    private mergeProperties(frontmatter: Record<string, any>): Record<string, any> {
        const result = { ...frontmatter };

        for (const [key, yamlValue] of Object.entries(this.plugin.settings.userproperties)) {
            if (result[key] === undefined) {
                try {
                    result[key] = parseYaml(yamlValue.trim());
                } catch {
                    new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                    result[key] = yamlValue;
                }
            }
        }

        if (result['base'] === undefined) {
            result['base'] = this.buildTodayBase();
        }

        if (Array.isArray(result['base'])) {
            sortBase(result['base']);
        }

        return Object.fromEntries(
            Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
        );
    }

    insertProperties(editor: Editor): void {
        const raw = editor.getValue();

        const { frontmatter, body } = this.parseDocument(raw);
        const merged = this.mergeProperties(frontmatter);
        const newContent = this.buildDocument(merged, body);

        if (newContent !== raw) {
            const cursorBefore = editor.getCursor();
            const oldHadFrontmatter = /^---\n/.test(raw);

            editor.setValue(newContent);

            if (!oldHadFrontmatter) {
                const insertedLineCount = newContent.split('\n').findIndex(l => l === '') + 1;
                editor.setCursor({
                    line: cursorBefore.line + insertedLineCount,
                    ch: cursorBefore.ch
                });
            } else {
                editor.setCursor(cursorBefore);
            }
        }
        new BaseInputModal(this.plugin.app, editor, this.plugin.baseCandidates).open();
    }
}

const NEW_ITEM_PREFIX = "+ '";

export class BaseInputModal extends SuggestModal<string> {
    private editor: Editor;
    private candidates: string[];

    constructor(app: App, editor: Editor, candidates: string[]) {
        super(app);
        this.editor = editor;
        this.candidates = candidates;
        this.setPlaceholder('base에 추가할 항목을 입력하세요.');
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();
        const currentBase = this.getCurrentBase();

        const filtered = this.candidates.filter(c =>
            !DATE_PATTERN.test(c) &&
            c.toLowerCase().includes(trimmed.toLowerCase())
        );

        const newItem = (trimmed && !this.candidates.includes(trimmed))
            ? `${NEW_ITEM_PREFIX}${trimmed}' 추가`
            : null;

        const mappedFiltered = filtered.map(c =>
            currentBase.includes(c) ? `[done] ${c}` : c
        );
        const done = '✓ 완료';

        return filtered.length === 1
            ? [...(newItem ? [newItem] : []), ...mappedFiltered, done]
            : [...(newItem ? [newItem] : []), done, ...mappedFiltered];
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    onChooseSuggestion(value: string) {
        if (value === '✓ 완료') {
            return;
        }

        const isDone = value.startsWith('[done] ');
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const cleaned = isDone ? value.slice(7) : value;
        const item = isNew
            ? cleaned.slice(NEW_ITEM_PREFIX.length, -4)
            : cleaned;

        if (isDone) {
            this.removeFromBase(item);
        } else {
            this.addToBase(item);
        }

        new BaseInputModal(this.app, this.editor, this.candidates).open();
    }

    private getCurrentBase(): string[] {
        const raw = this.editor.getValue();
        const match = raw.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
        if (!match) return [];
        try {
            const parsed = parseYaml(match[1] ?? '');
            return (parsed && Array.isArray(parsed['base'])) ? parsed['base'] : [];
        } catch {
            return [];
        }
    }

    private parseFrontmatter(raw: string): { match: RegExpMatchArray; frontmatter: Record<string, any> } | null {
        const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;
        const match = raw.match(FRONTMATTER_REGEX);
        if (!match) return null;

        try {
            const parsed = parseYaml(match[1] ?? '');
            const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? parsed as Record<string, any>
                : {};
            return { match, frontmatter };
        } catch {
            return null;
        }
    }

    private saveContent(raw: string, match: RegExpMatchArray, frontmatter: Record<string, any>) {
        const newYaml = stringifyYaml(frontmatter).trimEnd();
        const newFrontmatter = `---\n${newYaml}\n---`;
        const body = raw.slice(match[0].length);
        const trimmedBody = body.replace(/^\n+/, '');
        const newContent = trimmedBody.length > 0
            ? `${newFrontmatter}\n${trimmedBody}`
            : newFrontmatter;

        this.editor.setValue(newContent);

        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.app.vault.modify(activeFile, newContent);
        }
    }

    private addToBase(item: string) {
        const raw = this.editor.getValue();
        const result = this.parseFrontmatter(raw);
        if (!result) return;

        const { match, frontmatter } = result;
        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];

        if (base.includes(item)) {
            new Notice(`이미 존재하는 항목입니다: ${item}`);
            return;
        }

        base.push(item);
        sortBase(base);
        frontmatter['base'] = base;

        this.saveContent(raw, match, frontmatter);

        if (!this.candidates.includes(item)) {
            this.candidates.push(item);
        }

        new Notice(`base에 추가됨: ${item}`);
    }

    private removeFromBase(item: string) {
        const raw = this.editor.getValue();
        const result = this.parseFrontmatter(raw);
        if (!result) return;

        const { match, frontmatter } = result;
        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
        frontmatter['base'] = base.filter(v => v !== item);

        this.saveContent(raw, match, frontmatter);

        new Notice(`base에서 제거됨: ${item}`);
    }
}
