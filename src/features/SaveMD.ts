import type ATOZVER6Plugin from '../main';
import { Notice, TFile, moment, normalizePath } from 'obsidian';

export class SaveMDFeature {
    private lastKey: string = "";
    private repeatCount: number = 0;
    totalKeyCount: number = 0;

    constructor(private plugin: ATOZVER6Plugin) {}

    // 세이브 파일 명령어 활성화 반환 메서드
    checkCreateSaveFile(checking: boolean) {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
            if (!checking) {
                this.createSaveFile(activeFile);
            }
            return true;
        }
        return false;
    }

    // 자동 저장 대상 지정 메서드
    async handleSetAutoSaveTarget() {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("마크다운 문서가 아닙니다.");
            return;
        }

        // 이미 다른 문서가 지정되어 있는지 확인
        if (this.plugin.settings.saveMdAutoSaveTarget !== "") {
            // 경로에서 파일명만 추출해서 보여줌
            const currentTargetName = this.plugin.settings.saveMdAutoSaveTarget.split('/').pop();
            new Notice(`이미 지정된 문서가 있습니다: ${currentTargetName}\n먼저 해제해주세요.`);
            return;
        }

        // 설정 저장
        this.plugin.settings.saveMdAutoSaveTarget = activeFile.path;
        this.totalKeyCount = 0; // 카운트 초기화
        await this.plugin.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 시작되었습니다.\n(${this.plugin.settings.saveMdAutoSaveTrigger}타 마다 저장)`);
    }

    // 자동 저장 대상 해제 메서드
    async handleUnsetAutoSaveTarget() {
        const activeFile = this.plugin.app.workspace.getActiveFile();

        // 현재 지정된 타겟이 없는 경우
        if (this.plugin.settings.saveMdAutoSaveTarget === "") {
            new Notice("⚠️ 현재 자동 저장 대상으로 지정된 문서가 없습니다.");
            return;
        }

        // 활성 파일이 없거나, 지정된 타겟과 경로가 다를 경우
        if (!activeFile || activeFile.path !== this.plugin.settings.saveMdAutoSaveTarget) {
            const currentTargetName = this.plugin.settings.saveMdAutoSaveTarget.split('/').pop();
            new Notice(`⚠️ 이 문서는 자동 저장 대상이 아닙니다.\n(현재 대상: ${currentTargetName})`);
            return;
        }

        // 해제 로직
        this.plugin.settings.saveMdAutoSaveTarget = "";
        this.totalKeyCount = 0; // 카운트 초기화
        await this.plugin.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 해제되었습니다.`);
    }

    // 비정상 입력 감지 관련 코드
    handleAbnormalInput(evt: KeyboardEvent) {
        // 현재 활성화된 뷰가 마크다운 에디터인지 확인
        const activeView = this.plugin.app.workspace.getActiveFile();
        if (!activeView || activeView.extension !== "md") return;

        // 포커스가 실제 에디터 입력창(.cm-content)에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 조합 중인 키(한글 입력 등)나 특수 기능키(Shift, Ctrl 등)는 1차 제외
        if (evt.isComposing || evt.key.length > 1) {
            // 단, 백스페이스나 엔터는 연속 입력 감지에 포함하고 싶다면 예외 처리 가능
            if (evt.key !== "Backspace" && evt.key !== "Enter") return;
        }

        // 연속 입력 로직
        if (this.lastKey === evt.key) {
            this.repeatCount++;
        } else {
            this.lastKey = evt.key;
            this.repeatCount = 1;
        }

        // 임계치 도달 시 긴급 조치
        if (this.repeatCount >= this.plugin.settings.saveMdMaxRepeat) {
            this.emergencyAction(activeView);
        }
    }

    // 자동 저장 입력 감지 로직
    handleAutoSaveInput(evt: KeyboardEvent) {
        // 1. 기능이 비활성화(0)거나 타겟이 설정되지 않았으면 즉시 종료
        if (this.plugin.settings.saveMdAutoSaveTrigger <= 0 || this.plugin.settings.saveMdAutoSaveTarget === "") return;

        // 2. Modifier 키 제외
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return;

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return;

        // 3. [핵심] 현재 문서가 지정된 타겟 문서와 일치하는지 확인 (경로 비교)
        if (activeFile.path !== this.plugin.settings.saveMdAutoSaveTarget) return;

        // 포커스가 에디터에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 4. 카운트 증가 및 저장 실행
        this.totalKeyCount++;

        if (this.totalKeyCount >= this.plugin.settings.saveMdAutoSaveTrigger) {
            this.totalKeyCount = 0; // 카운트 리셋
            this.createSaveFile(activeFile);
            // Notice 메시지에 자동 저장됨을 명시하면 더 좋습니다 (선택사항)
            new Notice(`${this.plugin.settings.saveMdAutoSaveTrigger}타 자동 저장`);
        }
    }

    private async emergencyAction(file: TFile) {
        // 무한 루프 방지를 위한 카운트 초기화
        this.repeatCount = 0;
        this.lastKey = "";

        // 1. 즉시 백업 파일 생성
        await this.createSaveFile(file);

        // 2. 에디터 포커스 강제 해제 (추가 입력 방지)
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        new Notice(`⚠️ 비정상 입력 감지: '${file.basename}' 백업 후 포커스를 해제했습니다.`);
    }

    // 세이브 파일 생성 로직
    async createSaveFile(file: TFile) {
        const folderPath = this.plugin.settings.saveMdFolderPath;
        const ts = moment().format(this.plugin.settings.saveMdDateFormat);
        const newPath = normalizePath(`${folderPath}/${file.basename}_save_${ts}.md`);

        try {
            const { vault } = this.plugin.app;

            // 폴더가 없으면 생성
            if (!(await vault.adapter.exists(folderPath))) {
                await vault.createFolder(folderPath);
            }

            // 파일 복사
            await vault.copy(file, newPath);
            new Notice(`세이브 파일 저장됨: ${file.basename}_save_${ts}`);
        } catch (error) {
            new Notice("파일 복사 중 오류가 발생했습니다.");
        }
    }

    resetState() {
        this.lastKey = "";
        this.repeatCount = 0;
        this.totalKeyCount = 0;
    }
}
