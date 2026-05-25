import { Notice } from 'obsidian';
import type ATOZVER6Plugin from '../main';
import { AudioFeature } from './Audio';
import { BaseMigrationFeature } from './BaseMigration';
import { PublishNoteFeature } from './PublishNote';
import { YoutubeFeature } from './Youtube';

type FrontmatterRecord = Record<string, unknown>;

const ALLOWED_PROPERTIES = new Set([
    'base',
    'date',
    'topics',
    'type',
    'parent',
    'order',
    'youtubeId',
    'audioSrc',
    'audioTitle',
    // Legacy fields are removed by the explicit migration command, not lint.
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
    private publishNote: PublishNoteFeature;
    private baseMigration: BaseMigrationFeature;
    private youtube: YoutubeFeature;
    private audio: AudioFeature;

    constructor(private plugin: ATOZVER6Plugin) {
        this.publishNote = new PublishNoteFeature(plugin);
        this.baseMigration = new BaseMigrationFeature(plugin);
        this.youtube = new YoutubeFeature(plugin);
        this.audio = new AudioFeature(plugin);
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

    async configurePublishNote(): Promise<void> {
        await this.publishNote.configurePublishNote();
    }

    async editTopics(): Promise<void> {
        await this.publishNote.editTopics();
    }

    async migrateBaseProperties(): Promise<void> {
        await this.baseMigration.migrateBaseProperties();
    }

    insertYoutubeProperties(): void {
        this.youtube.insertYoutubeProperties();
    }

    insertAudioProperties(): void {
        this.audio.insertAudioProperties();
    }
}
