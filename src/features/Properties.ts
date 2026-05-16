import { Notice } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { AudioFeature } from './Audio';
import { BaseFeature } from './Base';
import { PeopleFeature } from './People';
import { validatePropertyState, type FrontmatterRecord } from './PropertyValidation';
import { YoutubeFeature } from './Youtube';

const ALLOWED_PROPERTIES = new Set([
    'base',
    'youtubeId',
    'audioSrc',
    'audioTitle',
    'teacher',
    'translator',
    'questioner',
    'writer',
]);

function isEmptyProperty(value: unknown): boolean {
    return value === null || value === undefined || value === '' ||
        (Array.isArray(value) && value.length === 0);
}

export class PropertiesFeature {
    private base: BaseFeature;
    private youtube: YoutubeFeature;
    private audio: AudioFeature;
    private people: PeopleFeature;

    constructor(private plugin: ATOZVER6Plugin) {
        this.base = new BaseFeature(plugin);
        this.youtube = new YoutubeFeature(plugin);
        this.audio = new AudioFeature(plugin);
        this.people = new PeopleFeature(plugin);
    }

    async lintProperties(): Promise<void> {
        const files = this.plugin.app.vault.getMarkdownFiles();
        const excluded = new Set([
            'log.md',
            this.plugin.settings.workFilePath,
            this.plugin.settings.laterFilePath,
        ]);

        let cleanedCount = 0;
        let reviewCount = 0;

        for (const file of files) {
            if (excluded.has(file.path)) continue;

            const toReview = new Set<string>();
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const fm = frontmatter as FrontmatterRecord;

                for (const key of Object.keys(fm)) {
                    if (ALLOWED_PROPERTIES.has(key)) continue;

                    const value = fm[key];
                    if (isEmptyProperty(value)) {
                        delete fm[key];
                        cleanedCount++;
                    } else {
                        toReview.add(key);
                    }
                }

                if (fm.audioSrc !== undefined && fm.audioTitle === undefined) {
                    toReview.add('audioTitle');
                }
                if (fm.audioSrc === undefined && fm.audioTitle !== undefined) {
                    toReview.add('audioSrc');
                }

                for (const issue of validatePropertyState(fm, file.path)) {
                    toReview.add(issue.property);
                }
            });

            if (toReview.size > 0) {
                const leaf = this.plugin.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
                reviewCount++;
            }
        }

        if (cleanedCount === 0 && reviewCount === 0) {
            new Notice('정리할 속성이 없습니다.');
            return;
        }

        new Notice(`속성 ${cleanedCount}개를 정리했고, 파일 ${reviewCount}개는 검토가 필요합니다.`);
    }

    async insertBaseProperties(initialItems: string[] = []): Promise<void> {
        await this.base.insertBaseProperties(initialItems);
    }

    insertYoutubeProperties(): void {
        this.youtube.insertYoutubeProperties();
    }

    insertAudioProperties(): void {
        this.audio.insertAudioProperties();
    }

    insertTeacherProperties(): void {
        this.people.insertTeacherProperties();
    }

    insertTranslatorProperties(): void {
        this.people.insertTranslatorProperties();
    }

    insertQuestionerProperties(): void {
        this.people.insertQuestionerProperties();
    }

    insertWriterProperties(): void {
        this.people.insertWriterProperties();
    }
}
