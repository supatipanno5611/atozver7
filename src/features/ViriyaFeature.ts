import type ATOZVER6Plugin from '../main';
import { Notice, TFile } from 'obsidian';
import { parseDocument, buildDocument } from '../utils';

const VIRIYA_MD_PATH = 'viriya/content';
const VIRIYA_ATTACHMENT_PATH = 'viriya/content/attachment';

export class ViriyaFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async addActiveFileToViriya(): Promise<void> {
        const { vault, workspace, metadataCache } = this.plugin.app;

        const activeFile = workspace.getActiveFile();
        if (!activeFile) {
            new Notice('활성 파일이 없습니다.');
            return;
        }

        const raw = await vault.read(activeFile);
        const { frontmatter } = parseDocument(raw);
        if (Object.keys(frontmatter).length === 0) {
            new Notice('프론트매터가 없습니다.');
            return;
        }

        const isMd = activeFile.extension === 'md';
        const targetDir = isMd ? VIRIYA_MD_PATH : VIRIYA_ATTACHMENT_PATH;
        const targetPath = `${targetDir}/${activeFile.name}`;

        if (!vault.getAbstractFileByPath(targetDir)) {
            new Notice('대상 폴더가 없습니다.');
            return;
        }

        await this.copyFile(activeFile, targetPath);
        await this.appendLinkToBase(activeFile, targetPath);
        new Notice(`${activeFile.basename}을 viriya에 추가했습니다.`);
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

    private async appendLinkToBase(file: TFile, targetPath: string): Promise<void> {
        const { vault } = this.plugin.app;
        const raw = await vault.read(file);
        const { frontmatter, body } = parseDocument(raw);

        const linkPath = targetPath.replace(/\.md$/, '');
        const linkValue = `[[${linkPath}]]`;

        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];
        if (!base.includes(linkValue)) {
            base.push(linkValue);
        }
        frontmatter['base'] = base;

        await vault.modify(file, buildDocument(frontmatter, body));
    }
}
