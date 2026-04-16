import type ATOZVER6Plugin from '../main';
import { MarkdownView, Notice, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { pickMostRecentLeaf } from '../utils';

export class WorkFeature {
    private isWorkLaterToggling = false;

    constructor(private plugin: ATOZVER6Plugin) {}

    /**
     * [메서드 1] cleanupTabs
     * 메인 워크스페이스의 탭을 정리합니다.
     * 단, '고정된(Pinned)' 탭은 닫지 않고 유지합니다.
     */
    async cleanupTabs() {
        const { workspace } = this.plugin.app;
        const leavesToClose: WorkspaceLeaf[] = [];

        workspace.iterateAllLeaves((leaf) => {
            // 1. 메인 영역(rootSplit)에 있는 탭인지 확인
            // 2. 고정(Pinned) 상태가 아닌지 확인
            const isPinned = leaf.getViewState().pinned;
            // rootSplit 하위이면서 고정되지 않은 탭만 수집
            // leftSplit, rightSplit은 제외됩니다.
            if (leaf.getRoot() === workspace.rootSplit && !isPinned) {
                leavesToClose.push(leaf);
            }
        });

        // 수집된 탭들을 일괄 제거
        leavesToClose.forEach(leaf => leaf.detach());
        await new Promise(resolve => setTimeout(resolve, 0)); // 마이크로태스크 flush
    }

    /**
     * [메서드 2] readWorkContent
     * work.md 파일 객체와 내용을 읽어 반환합니다.
     * - 에디터가 해당 파일을 열고 있으면 에디터 내용을 우선합니다 (가장 최신 데이터).
     * - 파일이 없거나 오류 발생 시 Notice를 띄우고 null을 반환합니다.
     */
    async readWorkContent(): Promise<{ file: TFile; content: string } | null> {
        const { vault, workspace } = this.plugin.app;
        const workPath = this.plugin.settings.workFilePath;

        try {
            const workFile = vault.getAbstractFileByPath(workPath);
            if (!(workFile instanceof TFile)) {
                new Notice(`작업 파일을 찾을 수 없습니다: ${workPath}`);
                return null;
            }

            // 에디터 우선 탐색: 현재 활성 탭이 work.md라면 에디터 내용을 사용
            const activeLeaf = workspace.getActiveViewOfType(MarkdownView);
            if (activeLeaf && activeLeaf.file?.path === workPath) {
                return { file: workFile, content: activeLeaf.editor.getValue() };
            }

            // 아니라면 vault에서 읽기
            const content = await vault.read(workFile);
            return { file: workFile, content };

        } catch (error) {
            console.error(error);
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return null;
        }
    }

    /**
     * [메서드 3] backupAndClear
     * readWorkContent()에서 전달받은 content를 later.md에 백업하고 work.md를 비웁니다.
     * - later.md가 없으면 데이터 유실 방지를 위해 중단하고 false를 반환합니다.
     * - 파일 I/O 오류 발생 시 사용자에게 알리고 false를 반환합니다.
     */
    async backupAndClear(workFile: TFile, content: string): Promise<boolean> {
        const { vault } = this.plugin.app;
        const laterPath = this.plugin.settings.laterFilePath;

        try {
            // 백업 파일 존재 여부 확인 — 없으면 데이터 유실 방지를 위해 중단
            const laterFile = vault.getAbstractFileByPath(laterPath);
            if (!(laterFile instanceof TFile)) {
                new Notice(`백업 파일(${laterPath})이 존재하지 않습니다. 작업이 중단되고 내용이 유지됩니다.`);
                return false;
            }

            // 백업 내용 포맷팅 후 later.md에 추가
            const timestamp = moment().format(this.plugin.settings.workTimestampFormat);
            await vault.append(laterFile, `\n\n${timestamp}\n${content}`);

            // 백업 완료 후 work.md 비우기
            await vault.modify(workFile, '');
            return true;

        } catch (error) {
            console.error(error);
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return false;
        }
    }

    /**
     * [메서드 4] openWorkFile
     * work.md 파일을 현재 탭에 엽니다.
     */
    async openWorkFile() {
        const { workspace, vault } = this.plugin.app;
        const path = this.plugin.settings.workFilePath;
    
        try {
            const targetFile = vault.getAbstractFileByPath(path);
    
            if (!(targetFile instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }
    
            // 사이드바를 제외한 메인 영역(rootSplit)에서만 탐색합니다.
            // getLeavesOfType('markdown')은 사이드바까지 포함하므로 사용하지 않습니다.
            let existingLeaf: WorkspaceLeaf | null = null;
            workspace.iterateRootLeaves((leaf) => {
                if (!existingLeaf && leaf.view instanceof MarkdownView &&
                    leaf.view.file?.path === path) {
                    existingLeaf = leaf;
                }
            });
    
            // 이미 열린 탭이 있으면 openFile() 없이 포커스만 이동합니다.
            // openFile()을 다시 호출하면 vault에서 파일을 재로드하여 미저장 변경사항이 사라질 수 있습니다.
            const leaf = existingLeaf ?? workspace.getLeaf(true);
            if (!existingLeaf) await leaf.openFile(targetFile);
    
            workspace.setActiveLeaf(leaf, { focus: true });
    
            const view = leaf.view;
            if (view instanceof MarkdownView) {
                view.editor.focus();
            }
    
        } catch (error) {
            new Notice('작업 문서를 여는 중 오류가 발생했습니다.');
        }
    }
    
    async focusMainEditor() {
        const { workspace } = this.plugin.app;
    
        const activeLeaf = workspace.getMostRecentLeaf();
        const isMainArea = activeLeaf?.view.containerEl.closest('.mod-root') !== null;
    
        if (isMainArea) {
            this.plugin.cycleTab.cycleAllTabs(true);
            return;
        }
    
        const leaves: WorkspaceLeaf[] = [];
        workspace.iterateRootLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file) leaves.push(leaf);
        });
    
        const leaf = pickMostRecentLeaf(leaves, this.plugin.app);
    
        if (!leaf) {
            await this.openWorkFile();
            return;
        }
    
        workspace.setActiveLeaf(leaf, { focus: true });
        if (leaf.view instanceof MarkdownView) leaf.view.editor.focus();
    }
}
