import { Notice } from 'obsidian';
import type ATOZVER6Plugin from '../main';

const STYLE_ID = 'atoz-project-visibility-style';

export class ProjectVisibility {
    private styleEl: HTMLStyleElement | null = null;

    constructor(private plugin: ATOZVER6Plugin) {}

    install(): void {
        this.styleEl = document.createElement('style');
        this.styleEl.id = STYLE_ID;
        document.head.appendChild(this.styleEl);
        this.refresh();
    }

    uninstall(): void {
        this.styleEl?.remove();
        this.styleEl = null;
    }

    async toggleProjectFolderHidden(): Promise<void> {
        const nextValue = !this.plugin.settings.isProjectFolderHidden;

        if (nextValue && !this.plugin.settings.projectPath) {
            new Notice('프로젝트 폴더 경로가 설정되어 있지 않습니다. 설정에서 프로젝트 폴더 경로를 입력해주세요.');
            return;
        }

        this.plugin.settings.isProjectFolderHidden = nextValue;
        this.refresh();
        await this.plugin.saveSettings();

        new Notice(nextValue ? '프로젝트 폴더가 숨겨졌습니다.' : '프로젝트 폴더가 표시됩니다.');
    }

    refresh(): void {
        const { isProjectFolderHidden, projectPath } = this.plugin.settings;

        if (!this.styleEl) return;

        if (!isProjectFolderHidden || !projectPath) {
            this.styleEl.textContent = '';
            return;
        }

        const path = CSS.escape(projectPath);
        const childPath = CSS.escape(`${projectPath}/`);

        this.styleEl.textContent = `
.nav-folder-title[data-path="${path}"],
.nav-folder-title[data-path^="${childPath}"],
.nav-folder-title[data-path="${path}"] + .nav-folder-children,
.nav-folder-title[data-path^="${childPath}"] + .nav-folder-children {
    display: none;
}`;
    }
}
