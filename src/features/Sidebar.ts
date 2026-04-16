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

	async toggleLocalGraphInSidebar() {
        const { workspace } = this.plugin.app;

        // 1. 오른쪽 사이드바(Right Split)에 'localgraph' 뷰가 있는지 확인
        const existingLeaf = workspace.getLeavesOfType('localgraph').find(
            (l) => l.getRoot() === workspace.rightSplit
        );

        if (existingLeaf) {
            // [Case A] 이미 열려 있다면 -> 닫기 (Detach)
            existingLeaf.detach();
        } else {
            // [Case B] 열려 있지 않다면 -> 열기 (Open)
            // 오른쪽 사이드바의 빈 잎을 가져오거나 생성
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: 'localgraph', active: true });
                // 사이드바가 접혀 있다면 펼쳐서 보여줌
                workspace.revealLeaf(leaf);
            }
        }
    }

    async toggleGlobalGraphInSidebar() {
        const { workspace } = this.plugin.app;

        // 1. 오른쪽 사이드바(Right Split)에 'graph' 뷰가 있는지 확인
        // 'graph'는 전체 그래프의 내부 ID입니다.
        const existingLeaf = workspace.getLeavesOfType('graph').find(
            (l) => l.getRoot() === workspace.rightSplit
        );

        if (existingLeaf) {
            // [Case A] 이미 열려 있다면 -> 닫기 (Detach)
            existingLeaf.detach();
        } else {
            // [Case B] 열려 있지 않다면 -> 열기 (Open)
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: 'graph', active: true });
                // 사이드바가 접혀 있다면 펼쳐서 보여줌
                workspace.revealLeaf(leaf);
            }
        }
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
