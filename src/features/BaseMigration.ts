import { Notice, TFile } from 'obsidian';
import type ATOZVER6Plugin from '../main';

type FrontmatterRecord = Record<string, unknown>;

const YEAR_PATTERN = /^(\d{4})년$/;
const MONTH_PATTERN = /^(\d{1,2})월$/;
const DAY_PATTERN = /^(\d{1,2})일$/;
const LEGACY_PEOPLE_PROPERTIES = ['teacher', 'translator', 'questioner', 'writer'];

function readStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
    return value as string[];
}

function twoDigits(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

export class BaseMigrationFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async migrateBaseProperties(): Promise<void> {
        if (!this.plugin.settings.projectPath) {
            new Notice('프로젝트 폴더 경로를 먼저 설정해주세요.');
            return;
        }
        const excluded = new Set([
            'log.md',
            this.plugin.settings.workFilePath,
            this.plugin.settings.laterFilePath,
        ]);
        const projectPrefix = `${this.plugin.settings.projectPath}/`;
        let migratedCount = 0;
        let reviewCount = 0;

        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            if (excluded.has(file.path) || file.path.startsWith(projectPrefix)) continue;
            const fm = this.getFrontmatter(file);
            if (fm.base === undefined) continue;

            const migratedDate = this.getMigratedDate(fm.base);
            if (migratedDate === null || (fm.date !== undefined && fm.date !== migratedDate)) {
                await this.openForReview(file);
                reviewCount++;
                continue;
            }

            const base = readStringArray(fm.base);
            if (base === null) {
                await this.openForReview(file);
                reviewCount++;
                continue;
            }
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const updated = frontmatter as FrontmatterRecord;
                updated.date = migratedDate;
                updated.topics = base.filter((item) =>
                    !YEAR_PATTERN.test(item) && !MONTH_PATTERN.test(item) && !DAY_PATTERN.test(item),
                );
                delete updated.base;
                for (const property of LEGACY_PEOPLE_PROPERTIES) {
                    delete updated[property];
                }
            });
            migratedCount++;
        }

        if (migratedCount === 0 && reviewCount === 0) {
            new Notice('이전할 기존 속성이 없습니다.');
            return;
        }
        new Notice(`파일 ${migratedCount}개를 이전했고, 파일 ${reviewCount}개는 검토가 필요합니다.`);
    }

    private getFrontmatter(file: TFile): FrontmatterRecord {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        return (cache?.frontmatter as FrontmatterRecord | undefined) ?? {};
    }

    private getMigratedDate(value: unknown): string | null {
        const base = readStringArray(value);
        if (base === null) return null;
        const years = base.filter((item) => YEAR_PATTERN.test(item));
        const months = base.filter((item) => MONTH_PATTERN.test(item));
        const days = base.filter((item) => DAY_PATTERN.test(item));
        if (years.length !== 1 || months.length !== 1 || days.length !== 1) return null;

        const yearMatch = YEAR_PATTERN.exec(years[0] ?? '');
        const monthMatch = MONTH_PATTERN.exec(months[0] ?? '');
        const dayMatch = DAY_PATTERN.exec(days[0] ?? '');
        if (!yearMatch || !monthMatch || !dayMatch) return null;
        const year = Number(yearMatch[1]);
        const month = Number(monthMatch[1]);
        const day = Number(dayMatch[1]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
    }

    private async openForReview(file: TFile): Promise<void> {
        const leaf = this.plugin.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
    }
}
