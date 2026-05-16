import { App, Notice, SuggestModal } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { PERSON_PROPERTIES, type FrontmatterRecord } from './PropertyValidation';

type PersonProperty = typeof PERSON_PROPERTIES[number];

const NEW_ITEM_PREFIX = "+ '";
const NEW_ITEM_SUFFIX = "' 추가";

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    return Array.isArray(value) ? value.length > 0 : true;
}

function collectPersonCandidates(app: App): string[] {
    const candidates = new Set<string>();

    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as FrontmatterRecord | undefined;
        if (!frontmatter) continue;

        for (const property of PERSON_PROPERTIES) {
            for (const value of readStringArray(frontmatter[property])) {
                candidates.add(value);
            }
        }
    }

    return [...candidates];
}

export class PeopleFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    insertTeacherProperties(): void {
        this.insertPersonProperty('teacher', '법문자');
    }

    insertTranslatorProperties(): void {
        this.insertPersonProperty('translator', '번역자');
    }

    insertQuestionerProperties(): void {
        this.insertPersonProperty('questioner', '질문자');
    }

    insertWriterProperties(): void {
        this.insertPersonProperty('writer', '저자');
    }

    private insertPersonProperty(property: PersonProperty, label: string): void {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성 파일이 없습니다.');
            return;
        }

        const cache = this.plugin.app.metadataCache.getFileCache(activeFile);
        const frontmatter = cache?.frontmatter as FrontmatterRecord | undefined;
        if (frontmatter) {
            if (property === 'writer' && (
                hasMeaningfulValue(frontmatter.teacher) ||
                hasMeaningfulValue(frontmatter.translator) ||
                hasMeaningfulValue(frontmatter.questioner)
            )) {
                new Notice('저자는 법문자, 번역자, 질문자와 함께 사용할 수 없습니다.');
                return;
            }

            if (property !== 'writer' && hasMeaningfulValue(frontmatter.writer)) {
                new Notice('법문 속성은 저자와 함께 사용할 수 없습니다.');
                return;
            }
        }

        new PersonInputModal(
            this.plugin.app,
            label,
            collectPersonCandidates(this.plugin.app),
            (name) => {
                void this.addPersonProperty(property, label, name);
            },
        ).open();
    }

    private async addPersonProperty(property: PersonProperty, label: string, name: string): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return;

        let alreadyExists = false;
        await this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
            const fm = frontmatter as FrontmatterRecord;
            const values = readStringArray(fm[property]);
            if (values.includes(name)) {
                alreadyExists = true;
                return;
            }

            values.push(name);
            fm[property] = values;
        });

        if (alreadyExists) {
            new Notice(`이미 ${label}에 있습니다: ${name}`);
            return;
        }

        new Notice(`${label}에 추가했습니다: ${name}`);
    }
}

class PersonInputModal extends SuggestModal<string> {
    constructor(
        app: App,
        private label: string,
        private candidates: string[],
        private onSubmit: (name: string) => void,
    ) {
        super(app);
        this.setPlaceholder(`${label} 이름 추가`);
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();
        const filtered = this.candidates.filter((candidate) =>
            candidate.toLowerCase().includes(trimmed.toLowerCase()),
        );

        if (!trimmed) return filtered;

        const newItem = this.candidates.includes(trimmed)
            ? null
            : `${NEW_ITEM_PREFIX}${trimmed}${NEW_ITEM_SUFFIX}`;

        return [...(newItem ? [newItem] : []), ...filtered];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    onChooseSuggestion(value: string): void {
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const name = isNew ? value.slice(NEW_ITEM_PREFIX.length, -NEW_ITEM_SUFFIX.length) : value;
        this.onSubmit(name);
    }
}
