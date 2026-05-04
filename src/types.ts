export type FrontmatterValue =
    | string
    | number
    | boolean
    | null
    | FrontmatterValue[]
    | { [key: string]: FrontmatterValue };

export type FrontmatterData = Record<string, FrontmatterValue>;

export interface ATOZSettings {
    CertainMdPath: string;
    isCursorCenterEnabled: boolean;
    userproperties: Record<string, string>;
    projectPath: string;
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    symbolPairs: Record<string, string>;
    recentSymbols: Record<string, number>;
    workFilePath: string;
    laterFilePath: string;
    workTimestampFormat: string;
}

export interface SnippetsItem {
    content: string;
}

export interface SymbolItem {
    id: string;
    symbol: string;
    closing?: string;
}

export interface SwitcherItem {
    display: string;
    path: string;
}

export interface ParsedDocument {
    frontmatter: FrontmatterData;
    body: string;
}

export const DEFAULT_SETTINGS: ATOZSettings = {
    CertainMdPath: '',
    isCursorCenterEnabled: false,
    userproperties: {},
    projectPath: '',
    snippetTrigger: '@',
    snippetLimit: 5,
    snippets: [],
    recentSnippets: {},
    symbolTrigger: '~',
    symbolLimit: 5,
    symbols: [
        { id: '"', symbol: '"', closing: '"' },
        { id: "'", symbol: "'", closing: "'" },
        { id: '...', symbol: '…' },
        { id: '-', symbol: '—' },
        { id: ',', symbol: '‚' },
        { id: '>>', symbol: '《', closing: '》' },
        { id: 'end>', symbol: '》' },
        { id: '[[', symbol: '「', closing: '」' },
        { id: 'end]]', symbol: '」' },
        { id: '(', symbol: '（', closing: '）' },
        { id: 'end)', symbol: '）' },
    ],
    symbolPairs: {
        '“': '”',
        '‘': '’',
        '《': '》',
        '（': '）',
    },
    recentSymbols: {},
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    workTimestampFormat: 'MM/DD HH:mm:ss',
};
