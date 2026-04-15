import { parseYaml, stringifyYaml } from 'obsidian';
import { ParsedDocument } from './types';
import { WorkspaceLeaf } from 'obsidian';

export function pickMostRecentLeaf(leaves: WorkspaceLeaf[], app: any): WorkspaceLeaf | null {
    if (leaves.length === 0) return null;
    const recentLeaves: WorkspaceLeaf[] = app.workspace.getRecentLeaves?.() ?? [];
    for (const recent of recentLeaves) {
        if (leaves.includes(recent)) return recent;
    }
    return leaves[0] ?? null;
}

export function parseDocument(raw: string): ParsedDocument {
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

export function buildDocument(frontmatter: Record<string, any>, body: string): string {
    const yamlString = stringifyYaml(frontmatter).trimEnd();
    const frontmatterBlock = `---\n${yamlString}\n---`;

    if (body.trim().length === 0) {
        return frontmatterBlock;
    }

    const trimmedBody = body.replace(/^\n+/, '');
    return `${frontmatterBlock}\n${trimmedBody}`;
}

export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);
    const first = escaped[0];
    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}

export const ATTACHMENT_FOLDER = 'attachment';
export const URL_PATTERN = /^https?:\/\//i;
export const INTERNAL_LINK_PATTERN = /^\[\[.*\]\]$/;
export const DATE_PATTERN = /^\d{4}년$|^\d{1,2}월$|^\d{1,2}일$/;
export const ENGLISH_ONLY_PATTERN = /^[a-zA-Z\s\-]+$/;

export function sortBase(base: unknown[]): void {
    const isKorean = (s: string) => /[가-힣]/.test(s);
    const isLink = (s: string) => URL_PATTERN.test(s) || INTERNAL_LINK_PATTERN.test(s);
    const isDate = (s: string) => DATE_PATTERN.test(s);

    const dateOrder = (v: string) => {
        if (/^\d{4}년$/.test(v)) return 0;
        if (/^\d{1,2}월$/.test(v)) return 1;
        if (/^\d{1,2}일$/.test(v)) return 2;
        return 3;
    };

    const groupOf = (v: string) => {
        if (isDate(v)) return 0;
        if (isLink(v)) return 2;
        return 1;
    };

    base.sort((a, b) => {
        const aStr = String(a);
        const bStr = String(b);
        const gA = groupOf(aStr);
        const gB = groupOf(bStr);

        if (gA !== gB) return gA - gB;

        if (gA === 0) return dateOrder(aStr) - dateOrder(bStr);

        const aKo = isKorean(aStr);
        const bKo = isKorean(bStr);
        if (aKo !== bKo) return aKo ? 1 : -1;
        return aStr.localeCompare(bStr);
    });
}
