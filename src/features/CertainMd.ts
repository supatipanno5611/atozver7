import type ATOZVER6Plugin from '../main';
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';

export class CertainMdFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async openCertainMdFile() {
        const { CertainMdPath } = this.plugin.settings;

        if (!CertainMdPath) {
            new Notice('CertainMdPath가 설정되지 않았습니다.');
            return;
        }

        // 1. 파일 객체 가져오기
        const file = this.plugin.app.vault.getAbstractFileByPath(CertainMdPath);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${CertainMdPath}`);
            return;
        }

        // 2. Root 영역의 리프들만 조사하여 이미 열려있는지 확인
        let targetLeaf: WorkspaceLeaf | null = null;

        this.plugin.app.workspace.iterateRootLeaves((leaf) => {
            if (!targetLeaf && leaf.view instanceof MarkdownView &&
                leaf.view.file?.path === CertainMdPath) {
                targetLeaf = leaf;
            }
        });

        // 3. 결과에 따른 동작
        if (targetLeaf) {
            // 이미 열려 있다면 해당 탭으로 포커스
            this.plugin.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        } else {
        	// 어디에도 열려있지 않다면 새 탭에 열기
            const newLeaf = this.plugin.app.workspace.getLeaf('tab');
            await newLeaf.openFile(file);
        }
    }
}
