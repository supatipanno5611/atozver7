import type ATOZVER6Plugin from '../main';
import { FileView, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

export class SidebarFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async openTaskInLeftSidebar() {
        await this.toggleSidebar(this.plugin.settings.taskFilePath, 'left');
    }

    async openLaterInRightSidebar() {
        await this.toggleSidebar(this.plugin.settings.laterFilePath, 'right');
    }

    private async toggleSidebar(path: string, side: 'left' | 'right') {
        const { workspace, vault } = this.plugin.app;

        if (!path || path.trim() === '') {
            new Notice('설정된 파일 경로가 없습니다. 플러그인 설정을 확인해주세요.');
            return;
        }

        const split = side === 'left' ? workspace.leftSplit : workspace.rightSplit;
        if (!split) {
            new Notice(`${side === 'left' ? '왼쪽' : '오른쪽'} 사이드바를 사용할 수 없는 환경입니다.`);
            return;
        }

        if (!(split as any).collapsed) {
            split.collapse();
            await this.plugin.executes.focusRootLeaf();
            return;
        }

        const file = vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        // 사이드바의 markdown 탭 전부 닫기
        const toClose: WorkspaceLeaf[] = [];
        workspace.iterateAllLeaves((leaf) => {
            if (leaf.getRoot() === split && leaf.view.getViewType() === 'markdown') {
                toClose.push(leaf);
            }
        });
        toClose.forEach(l => l.detach());

        // 새 탭에 파일 열기
        const leaf = side === 'left' ? workspace.getLeftLeaf(true) : workspace.getRightLeaf(true);
        if (!leaf) {
            new Notice(`${side === 'left' ? '왼쪽' : '오른쪽'} 사이드바에 새 탭을 열 수 없습니다.`);
            return;
        }

        try {
            await leaf.openFile(file);
            workspace.revealLeaf(leaf);
            workspace.setActiveLeaf(leaf, { focus: true });
            if (leaf.view instanceof MarkdownView) leaf.view.editor.focus();
        } catch (e) {
            new Notice(`파일 열기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
            leaf.detach();
        }
    }
}
