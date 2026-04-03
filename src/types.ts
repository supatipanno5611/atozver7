export interface ATOZSettings {
    CertainMdPath: string;
    isCursorCenterEnabled: boolean;
    ordinaryFilePath: string;
    userproperties: Record<string, string>;
    saveMdMaxRepeat: number;
    saveMdAutoSaveTrigger: number;
    saveMdAutoSaveTarget: string;
    saveMdFolderPath: string;
    saveMdDateFormat: string;
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    symbolPairs: Record<string, string>;
    recentSymbols: Record<string, number>;
    taskFilePath: string;
    planFilePath: string;
    trashFilePath: string;
    workFilePath: string;
    laterFilePath: string;
    workTimestampFormat: string;
}

export interface SnippetsItem { content: string; }
export interface SymbolItem { id: string; symbol: string; closing?: string; }
export interface ParsedDocument {
    frontmatter: Record<string, any>;
    body: string;
}

export const DEFAULT_SETTINGS: ATOZSettings = {
    // CertainMd
    CertainMdPath: 'how/termux.md',

    // Cursor Center
    isCursorCenterEnabled: false,
    
    // Ordinary
    ordinaryFilePath: 'ordinary.md',
    
    // Properties
    userproperties: {
        "aliases": "[]"
    },
    
    // SaveMD
    saveMdMaxRepeat: 150,
    saveMdAutoSaveTrigger: 500,
    saveMdAutoSaveTarget: "",
    saveMdFolderPath: "save",
    saveMdDateFormat: "YYYYMMDDHHmmss",
    
    // Snippets
    snippetTrigger: "\\",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {},
    
    // Symbols
    symbolTrigger: "/",
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
    
    // TaskPlan
    taskFilePath: 'task.md',
    planFilePath: 'plan.md',

    // Trash
    trashFilePath: 'trash.md',
    
    // Work
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    workTimestampFormat: 'MM/DD HH:mm:ss'
};
