import type ATOZVER6Plugin from '../main';
import { Notice } from 'obsidian';

export class GraphFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

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
}
