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

// 한글 → QWERTY 변환
const DISASSEMBLED_CONSONANTS: Record<string, string> = {
    '': '', ㄱ: 'ㄱ', ㄲ: 'ㄲ', ㄳ: 'ㄱㅅ', ㄴ: 'ㄴ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ',
    ㄷ: 'ㄷ', ㄸ: 'ㄸ', ㄹ: 'ㄹ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ',
    ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅁ: 'ㅁ', ㅂ: 'ㅂ', ㅃ: 'ㅃ', ㅄ: 'ㅂㅅ',
    ㅅ: 'ㅅ', ㅆ: 'ㅆ', ㅇ: 'ㅇ', ㅈ: 'ㅈ', ㅉ: 'ㅉ', ㅊ: 'ㅊ', ㅋ: 'ㅋ',
    ㅌ: 'ㅌ', ㅍ: 'ㅍ', ㅎ: 'ㅎ',
};

const DISASSEMBLED_VOWELS: Record<string, string> = {
    ㅏ: 'ㅏ', ㅐ: 'ㅐ', ㅑ: 'ㅑ', ㅒ: 'ㅒ', ㅓ: 'ㅓ', ㅔ: 'ㅔ', ㅕ: 'ㅕ', ㅖ: 'ㅖ',
    ㅗ: 'ㅗ', ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅛ: 'ㅛ',
    ㅜ: 'ㅜ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅠ: 'ㅠ',
    ㅡ: 'ㅡ', ㅢ: 'ㅡㅣ', ㅣ: 'ㅣ',
};

const CHOSEONGS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNGSEONGS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONGSEONGS = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const HANGUL_TO_QWERTY: Record<string, string> = {
    ㄱ:'r', ㄲ:'R', ㄴ:'s', ㄷ:'e', ㄸ:'E', ㄹ:'f', ㅁ:'a', ㅂ:'q', ㅃ:'Q',
    ㅅ:'t', ㅆ:'T', ㅇ:'d', ㅈ:'w', ㅉ:'W', ㅊ:'c', ㅋ:'z', ㅌ:'x', ㅍ:'v', ㅎ:'g',
    ㅏ:'k', ㅐ:'o', ㅑ:'i', ㅒ:'O', ㅓ:'j', ㅔ:'p', ㅕ:'u', ㅖ:'P',
    ㅗ:'h', ㅛ:'y', ㅜ:'n', ㅠ:'b', ㅡ:'m', ㅣ:'l',
};

const HANGUL_START = '가'.charCodeAt(0);
const HANGUL_END = '힣'.charCodeAt(0);

function disassemble(str: string): string {
    let result = '';
    for (const letter of str) {
        const code = letter.charCodeAt(0);
        if (code >= HANGUL_START && code <= HANGUL_END) {
            const offset = code - HANGUL_START;
            const jongseongIndex = offset % 28;
            const jungseongIndex = Math.floor(offset / 28) % 21;
            const choseongIndex = Math.floor(offset / 28 / 21);
            const choseong = CHOSEONGS[choseongIndex] ?? '';
            const jungseong = JUNGSEONGS[jungseongIndex] ?? '';
            const jongseong = JONGSEONGS[jongseongIndex] ?? '';
            result += choseong;
            result += DISASSEMBLED_VOWELS[jungseong] ?? jungseong;
            result += DISASSEMBLED_CONSONANTS[jongseong] ?? jongseong;
        } else if (letter in DISASSEMBLED_CONSONANTS) {
            result += DISASSEMBLED_CONSONANTS[letter] ?? letter;
        } else if (letter in DISASSEMBLED_VOWELS) {
            result += DISASSEMBLED_VOWELS[letter] ?? letter;
        } else {
            result += letter;
        }
    }
    return result;
}

export function convertHangulToQwerty(str: string): string {
    return disassemble(str).split('').map(ch => HANGUL_TO_QWERTY[ch] ?? ch).join('');
}
