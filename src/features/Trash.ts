import type ATOZVER6Plugin from '../main';
import { FileView, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

export class TrashFeature {
    private isTrashToggling = false;

    constructor(private plugin: ATOZVER6Plugin) {}

    /**
     * toggleTrashFileInRightSidebar
     * trash.md 파일이 오른쪽 사이드바에 있다면 닫고(detach), 없다면 엽니다.
     * - 이미 오른쪽 사이드바에 열려 있다면 해당 패널을 닫습니다.
     * - 열려 있지 않다면 오른쪽 사이드바에 새로 엽니다.
     * - 사이드바가 접혀 있다면 자동으로 펼쳐서 보여줍니다.
     */
    async toggleTrashFileInRightSidebar() {
        if (this.isTrashToggling) return;
        this.isTrashToggling = true;

        try {
            const { workspace, vault } = this.plugin.app;
            const path = this.plugin.settings.trashFilePath;

            if (!path || path.trim() === "") {
                new Notice('설정된 파일 경로가 없습니다. 플러그인 설정을 확인해주세요.');
                return;
            }

            if (!workspace.rightSplit) {
                new Notice('오른쪽 사이드바를 사용할 수 없는 환경입니다.');
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
                const viewType = leaf.view.getViewType();
                const view = leaf.view as FileView;
                if (
                    leaf.getRoot() === workspace.rightSplit &&
                    viewType === 'markdown' &&
                    view.file?.path === path
                ) {
                    existingLeaf = leaf;
                }
            });

            if (existingLeaf) {
                // [Case A] 닫기 (Detach)
                (existingLeaf as WorkspaceLeaf).detach();

                const mainLeaf = workspace.getMostRecentLeaf();
                if (mainLeaf) {
                    workspace.setActiveLeaf(mainLeaf, { focus: true });
                    const view = mainLeaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }
                }
            } else {
                // [Case B] 열기 (Open)
                let leaf: WorkspaceLeaf | null | undefined = workspace.getLeavesOfType('empty').find(l => l.getRoot() === workspace.rightSplit);

                if (!leaf) {
                    leaf = workspace.getRightLeaf(true);
                }

                if (!leaf) {
                    new Notice('오른쪽 사이드바에 새 탭을 열 수 없습니다.');
                    return;
                }

                try {
                    await leaf.openFile(file);
                    workspace.revealLeaf(leaf);
                    workspace.setActiveLeaf(leaf, { focus: true });
                    const view = leaf.view;
                    if (view instanceof MarkdownView) {
                        view.editor.focus();
                    }
                } catch (e) {
                    console.error(e);
                    new Notice(`파일 열기 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
                    leaf.detach();
                }
            }
        } catch (err) {
            console.error("Toggle Error:", err);
        } finally {
            this.isTrashToggling = false;
        }
    }
}
