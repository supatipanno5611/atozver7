export interface ATOZSettings {
    CertainMdPath: string;
    isCursorCenterEnabled: boolean;
    sets: Record<string, number>;
    ordinaryFilePath: string;
    userproperties: Record<string, string>;
    saveMdMaxRepeat: number;
    saveMdAutoSaveTrigger: number;
    saveMdAutoSaveTarget: string;
    saveMdFolderPath: string;
    saveMdDateFormat: string;
    titleTrigger: string;
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
    recentSwitcher: Record<string, number>;
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    symbolPairs: Record<string, string>;
    recentSymbols: Record<string, number>;
    taskFilePath: string;
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

    // New Note
    sets: {},
    
    // Ordinary
    ordinaryFilePath: 'ordinary.md',
    
    // Properties
    userproperties: {
        "title": "[]"
    },
    
    // SaveMD
    saveMdMaxRepeat: 150,
    saveMdAutoSaveTrigger: 500,
    saveMdAutoSaveTarget: "",
    saveMdFolderPath: "save",
    saveMdDateFormat: "YYYYMMDDHHmmss",

    // Title
    titleTrigger: '/',
    
    // Snippets
    snippetTrigger: "@",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {},

    // Switcher
    recentSwitcher: {},
    
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
    
    // Task
    taskFilePath: 'task.md',
    
    // Work
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    workTimestampFormat: 'MM/DD HH:mm:ss'
};
