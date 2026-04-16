import type ATOZVER6Plugin from '../main';
import { Notice, TFile, TFolder } from 'obsidian';
import { moment } from 'obsidian';
import { parseDocument, buildDocument, DATE_PATTERN, INTERNAL_LINK_PATTERN, sortBase } from '../utils';

const VIRIYA_MD_PATH = 'viriya/content/pages';

export class Viriya {
    constructor(private plugin: ATOZVER6Plugin) {}

    async addActiveFileToViriya(): Promise<void> {
        const { vault, workspace } = this.plugin.app;

        const activeFile = workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성 파일이 없습니다.');
            return;
        }

        if (activeFile.extension !== 'md') {
            new Notice('마크다운 파일이 아닙니다.');
            return;
        }

        const raw = await vault.read(activeFile);
        const { frontmatter } = parseDocument(raw);
        if (Object.keys(frontmatter).length === 0) {
            new Notice('프론트매터가 없습니다.');
            return;
        }

        const targetFolder = vault.getAbstractFileByPath(VIRIYA_MD_PATH);
        if (!(targetFolder instanceof TFolder)) {
            new Notice('대상 폴더가 없습니다.');
            return;
        }

        const targetPath = `${VIRIYA_MD_PATH}/${activeFile.name}`;

        try {
            await this.copyFile(activeFile, targetPath);
            await this.processCopiedBase(targetPath);
            await this.updateOriginalBase(activeFile, targetPath);
            new Notice(`${activeFile.basename}을 viriya에 추가했습니다.`);
        } catch (e) {
            new Notice(e instanceof Error ? e.message : '오류가 발생했습니다.');
        }
    }

    private async copyFile(file: TFile, targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;
        const content = await vault.read(file);
        const existing = vault.getAbstractFileByPath(targetPath);
        if (existing instanceof TFile) {
            await vault.modify(existing, content);
        } else {
            await vault.create(targetPath, content);
        }
    }

    private async processCopiedBase(targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;

        const copiedFile = vault.getAbstractFileByPath(targetPath);
        if (!(copiedFile instanceof TFile)) throw new Error('복사된 파일을 찾을 수 없습니다.');

        const raw = await vault.read(copiedFile);
        const { frontmatter, body } = parseDocument(raw);

        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];

        const filtered = base.filter(v => {
            if (typeof v !== 'string') return true;
            if (DATE_PATTERN.test(v)) return false;
            if (v.startsWith('.')) return false;
            if (INTERNAL_LINK_PATTERN.test(v)) return false;
            return true;
        });

        const m = moment();
        filtered.push(m.format('YYYY년'), m.format('M월'), m.format('D일'));

        sortBase(filtered);
        frontmatter['base'] = filtered;

        await vault.modify(copiedFile, buildDocument(frontmatter, body));
    }

    private async updateOriginalBase(file: TFile, targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;

        const raw = await vault.read(file);
        const { frontmatter, body } = parseDocument(raw);

        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];

        const filtered = base.filter(v =>
            !(typeof v === 'string' && v.startsWith(`[[${VIRIYA_MD_PATH}`))
        );

        const linkPath = targetPath.replace(/\.md$/, '');
        filtered.push(`[[${linkPath}]]`);

        sortBase(filtered);
        frontmatter['base'] = filtered;

        await vault.modify(file, buildDocument(frontmatter, body));
    }
}
