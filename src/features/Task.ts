import type ATOZVER6Plugin from '../main';
import { FileView, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

export class TaskFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async openTaskInLeftSidebar() {
        const { workspace, vault } = this.plugin.app;
        const path = this.plugin.settings.taskFilePath;

        if (!path || path.trim() === '') {
            new Notice('설정된 파일 경로가 없습니다. 플러그인 설정을 확인해주세요.');
            return;
        }

        if (!workspace.leftSplit) {
            new Notice('왼쪽 사이드바를 사용할 수 없는 환경입니다.');
            return;
        }

        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        let existingLeaf: WorkspaceLeaf | null = null;
        workspace.iterateAllLeaves((leaf) => {
            if (existingLeaf) return;
            const view = leaf.view as FileView;
            if (
                leaf.getRoot() === workspace.leftSplit &&
                leaf.view.getViewType() === 'markdown' &&
                view.file?.path === path
            ) {
                existingLeaf = leaf;
            }
        });

        const leaf = existingLeaf ?? workspace.getLeftLeaf(true);

        if (!leaf) {
            new Notice('왼쪽 사이드바에 새 탭을 열 수 없습니다.');
            return;
        }

        if (!existingLeaf) {
            try {
                await leaf.openFile(file);
                workspace.revealLeaf(leaf);
            } catch (e) {
                new Notice(`파일 열기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
                leaf.detach();
                return;
            }
        }

        workspace.setActiveLeaf(leaf, { focus: true });
        const view = leaf.view;
        if (view instanceof MarkdownView) view.editor.focus();
    }
}
