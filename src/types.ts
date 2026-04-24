export interface ATOZSettings {
    CertainMdPath: string;
    isCursorCenterEnabled: boolean;
    userproperties: Record<string, string>;
    projectPath: string;
    projectExportPath: string;
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

export interface SnippetsItem { content: string; }
export interface SymbolItem { id: string; symbol: string; closing?: string; }
export interface SwitcherItem { display: string; path: string; }
export interface ParsedDocument {
    frontmatter: Record<string, any>;
    body: string;
}

export const DEFAULT_SETTINGS: ATOZSettings = {
    // CertainMd
    CertainMdPath: '',

    // Cursor Center
    isCursorCenterEnabled: false,

    // Properties
    userproperties: {},

    // Project
    projectPath: '',
    projectExportPath: '',

    // Snippets
    snippetTrigger: "@",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {},
    
    // Symbols
    symbolTrigger: "~",
    symbolLimit: 5,
    symbols: [
        { id: "\"", symbol: "“", closing: "”" },
        { id: "'", symbol: "‘", closing: "’" },
        { id: "...", symbol: "⋯" },
        { id: "-", symbol: "—" },
        { id: ",", symbol: "·" },
        { id: ">>", symbol: "”" },
        { id: ">", symbol: "’" },
        { id: "낫", symbol: "｢", closing: "｣" },
        { id: "end>", symbol: "｣" },
        { id: "겹", symbol: "『", closing: "』" },
        { id: "end>>", symbol: "』" },
    ],
    symbolPairs: {
        "“": "”",
        "‘": "’",
        "｢": "｣",
        "『": "』"
    },
    recentSymbols: {},
        
    // Work
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    workTimestampFormat: 'MM/DD HH:mm:ss'
};
