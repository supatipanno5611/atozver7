import type ATOZVER6Plugin from '../main';
import { WorkspaceLeaf } from 'obsidian';

export class CyclePinTabFeature {
    private lastPinnedPath: string | null = null;
    private lastUnpinnedPath: string | null = null;
    isInternalNavigation: boolean = false;

    constructor(private plugin: ATOZVER6Plugin) {}

    // --- [핵심 로직 1] 상황별 순환 (Context-Aware Cycle) ---
    cycleTabsContextAware() {
        const activeLeaf = this.plugin.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isPinned = this.getLeafPinnedState(activeLeaf);
        const targetLeaves = this.getLeavesByState(isPinned);

        if (targetLeaves.length <= 1) return;

        const currentIndex = targetLeaves.indexOf(activeLeaf);

        // [엣지 케이스] currentIndex가 -1이면 getMostRecentLeaf()가 반환한 leaf가
        // iterateRootLeaves 범위 밖(사이드바, 특수 뷰 등)에 있는 것이므로 동작 중단
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + 1) % targetLeaves.length;
        const targetLeaf = targetLeaves[nextIndex];

        if (targetLeaf) {
            this.activateLeafSafe(targetLeaf);
        }
    }

    // --- [핵심 로직 2] 영역 건너가기 (Smart Jump) ---
    smartJump() {
        const activeLeaf = this.plugin.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isCurrentPinned = this.getLeafPinnedState(activeLeaf);

        if (isCurrentPinned) {
            // [상황 A] 고정 -> 일반으로 점프
            // 1순위: 마지막으로 사용했던 일반 탭 경로로 leaf 탐색
            const lastUnpinned = this.findLeafByPath(this.lastUnpinnedPath, false);
            if (lastUnpinned) {
                this.activateLeafSafe(lastUnpinned);
                return;
            }
            // 2순위: 가장 최근 사용된 일반 탭
            const fallback = this.pickMostRecentLeaf(this.getLeavesByState(false));
            if (fallback) this.activateLeafSafe(fallback);

        } else {
            // [상황 B] 일반 -> 고정으로 점프
            // 1순위: 마지막으로 사용했던 고정 탭 경로로 leaf 탐색
            const lastPinned = this.findLeafByPath(this.lastPinnedPath, true);
            if (lastPinned) {
                this.activateLeafSafe(lastPinned);
                return;
            }
            // 2순위: 가장 최근 사용된 고정 탭
            const fallback = this.pickMostRecentLeaf(this.getLeavesByState(true));
            if (fallback) this.activateLeafSafe(fallback);
        }
    }

    // --- [헬퍼 함수] ---

    // 탭의 고정 여부를 안전하게 반환
    getLeafPinnedState(leaf: WorkspaceLeaf): boolean {
        const state = leaf.getViewState ? leaf.getViewState() : null;
        return state ? (state.pinned ?? false) : false;
    }

    // 특정 상태(고정/일반)인 탭들만 리스트로 반환
    private getLeavesByState(wantPinned: boolean): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [];
        this.plugin.app.workspace.iterateRootLeaves((leaf) => {
            if (this.getLeafPinnedState(leaf) === wantPinned) {
                leaves.push(leaf);
            }
        });
        return leaves;
    }

    // 현재 열린 파일의 경로를 추출 (파일이 없는 특수 뷰는 null 반환)
    private getLeafPath(leaf: WorkspaceLeaf): string | null {
        const file = (leaf.view as any)?.file;
        return file?.path ?? null;
    }

    // 이력 기록: leaf 참조 대신 파일 경로만 저장
    // 파일이 없는 특수 뷰(그래프, 캘린더 등)는 기록하지 않음
    recordLeafHistory(leaf: WorkspaceLeaf) {
        const path = this.getLeafPath(leaf);
        if (!path) return;
        // 고정/일반 탭 기록
        if (this.getLeafPinnedState(leaf)) {
            this.lastPinnedPath = path;
        } else {
            this.lastUnpinnedPath = path;
        }
    }

    // 저장된 경로를 기반으로 현재 열린 leaf를 탐색
    // 경로가 null이거나 해당 경로의 탭이 닫혀있으면 null 반환 -> 유효성 문제 자체를 우회
    private findLeafByPath(path: string | null, wantPinned: boolean): WorkspaceLeaf | null {
        if (!path) return null;

        let found: WorkspaceLeaf | null = null;
        this.plugin.app.workspace.iterateRootLeaves((leaf) => {
            if (found) return; // 이미 찾았으면 순회 중단
            if (this.getLeafPinnedState(leaf) !== wantPinned) return;
            if (this.getLeafPath(leaf) === path) {
                found = leaf;
            }
        });
        return found;
    }

    // 주어진 leaf 목록 중 가장 최근 사용된 탭을 반환
    // iterateRootLeaves의 순회 순서(UI 순서)가 아닌 사용 이력 기준으로 선택
    private pickMostRecentLeaf(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
        if (leaves.length === 0) return null;

        const recentLeaves: WorkspaceLeaf[] = (this.plugin.app.workspace as any).getRecentLeaves?.() ?? [];
        for (const recent of recentLeaves) {
            if (leaves.includes(recent)) return recent;
        }

        // getRecentLeaves를 지원하지 않는 버전에서의 최후 폴백
        return leaves[0] ?? null;
    }

    // 안전하게 탭 활성화 (이벤트 루프 차단)
    // Obsidian의 workspace 이벤트는 동기적으로 발생하므로,
    // setActiveLeaf 호출 전후로 플래그를 관리하면 setTimeout 없이 처리 가능
    activateLeafSafe(leaf: WorkspaceLeaf) {
        this.isInternalNavigation = true;
        this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
        this.isInternalNavigation = false;
    }

    reset() {
        this.lastPinnedPath = null;
        this.lastUnpinnedPath = null;
    }
}
