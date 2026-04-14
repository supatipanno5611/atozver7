import type ATOZVER6Plugin from '../main';
import { App, Editor, MarkdownView, Modal, Notice, Setting, normalizePath } from 'obsidian';

export class CutCreateNewMdFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    async cutAndCreateNewMd(editor: Editor) {
        // 1. 내용 추출 (선택 범위 우선, 없으면 전체)
        const hasSelection = editor.somethingSelected();
        let contentToMove: string;
        let startLine: number;
        let endLine: number;

        if (hasSelection) {
            const sel = editor.listSelections()[0];
            if (!sel) return;
            startLine = Math.min(sel.anchor.line, sel.head.line);
            endLine = Math.max(sel.anchor.line, sel.head.line);
            const lines: string[] = [];
            for (let i = startLine; i <= endLine; i++) lines.push(editor.getLine(i));
            contentToMove = lines.join('\n');
        } else {
            startLine = 0;
            endLine = editor.lineCount() - 1;
            contentToMove = editor.getValue();
        }

        // 2. 빈 내용 가드
        if (!contentToMove.trim()) {
            new Notice('이동할 내용이 없습니다.');
            return;
        }

        // 3. 원본 파일 참조 저장
        const originalFile = this.plugin.app.workspace.getActiveFile();
        if (!originalFile) return;

        const isFullContent = !hasSelection;

        // 4. 모달 열기
        new CutAndCreateModal(this.plugin.app, async (filename: string) => {
            try {
                const newPath = normalizePath(`${filename}.md`);

                // 5. vault 루트에 contentToMove를 내용으로 파일 생성
                const newFile = await this.plugin.app.vault.create(newPath, contentToMove);

                // 6. 현재 탭을 새 파일로 교체
                const leaf = this.plugin.app.workspace.getLeaf(false);
                await leaf.openFile(newFile);
                this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

                // 7. 원본에서 내용 삭제
                if (isFullContent) {
                    await this.plugin.app.vault.modify(originalFile, '');
                } else {
                    await this.plugin.app.vault.process(originalFile, (data) => {
                        const lines = data.split('\n');
                        lines.splice(startLine, endLine - startLine + 1);
                        return lines.join('\n');
                    });
                }

            } catch (error) {
                console.error(error);
                new Notice('새 노트 생성 중 오류가 발생했습니다.');
            }
        }).open();
    }
}

export class CutAndCreateModal extends Modal {
    private onSubmit: (filename: string) => void;
    private inputEl: HTMLInputElement;
    private errorEl: HTMLElement;

    constructor(app: App, onSubmit: (filename: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.modalEl.addClass('prompt');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('새 노트 만들기');

        new Setting(contentEl)
            .addText(text => {
                this.inputEl = text.inputEl;
                text.setPlaceholder('파일명');
                text.inputEl.addEventListener('input', () => this.clearError());
                setTimeout(() => text.inputEl.focus(), 0);
            });

        this.errorEl = contentEl.createEl('div', { cls: 'cut-create-error' });

        this.scope.register([], 'Enter', () => {
            this.handleSubmit();
            return false;
        });
    }

    private handleSubmit() {
        const raw = this.inputEl.value.trim();

        if (!raw) {
            this.showError('파일명을 입력해주세요.');
            return;
        }
        if (/[\\/:*?"<>|]/.test(raw)) {
            this.showError('사용할 수 없는 문자가 포함되어 있습니다: \\ / : * ? " < > |');
            return;
        }
        if (this.app.vault.getAbstractFileByPath(normalizePath(`${raw}.md`))) {
            this.showError('같은 이름의 파일이 이미 존재합니다.');
            return;
        }

        this.close();
        this.onSubmit(raw);
    }

    private showError(msg: string) {
        this.errorEl.setText(msg);
        this.errorEl.addClass('is-visible');
    }

    private clearError() {
        this.errorEl.removeClass('is-visible');
    }

    onClose() { this.contentEl.empty(); }
}
