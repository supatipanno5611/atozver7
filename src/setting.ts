import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from './types';
import type ATOZVER6Plugin from './main';

export class ATOZSettingTab extends PluginSettingTab {
    plugin: ATOZVER6Plugin;

    constructor(app: App, plugin: ATOZVER6Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ── 특정 마크다운 ──────────────────────────────
        new Setting(containerEl).setName('특정 마크다운').setHeading();

        new Setting(containerEl)
            .setName('파일 경로 (CertainMdPath)')
            .setDesc("‘특정 마크다운 파일 열기’ 명령이 열어줄 파일의 vault 기준 상대 경로. 메인 탭에 이미 열려 있으면 해당 탭으로 포커스만 이동합니다. 예: 'index.md', 'folder/note.md'")
            .addText((t) =>
                t.setPlaceholder('index.md')
                    .setValue(this.plugin.settings.CertainMdPath)
                    .onChange(async (v) => {
                        this.plugin.settings.CertainMdPath = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // ── 커서 중앙 유지 ─────────────────────────────
        new Setting(containerEl).setName('커서 중앙 유지').setHeading();

        new Setting(containerEl)
            .setName('자동 활성화 (isCursorCenterEnabled)')
            .setDesc("켜두면 편집 중 커서가 항상 화면 중앙에 머물도록 자동 스크롤됩니다. ‘커서 중앙 유지 토글’ 명령으로 즉시 끄고 켤 수 있으며, 이 토글은 그 초기값을 결정합니다.")
            .addToggle((t) =>
                t.setValue(this.plugin.settings.isCursorCenterEnabled)
                    .onChange(async (v) => {
                        this.plugin.settings.isCursorCenterEnabled = v;
                        await this.plugin.saveSettings();
                    })
            );

        // ── 속성 관리 ──────────────────────────────────
        new Setting(containerEl).setName('속성 관리').setHeading();

        this.addJsonSetting(
            containerEl,
            '기본 사용자 속성 (userproperties)',
            "‘속성 삽입’ 명령이 노트 frontmatter에 자동으로 채워줄 항목들. JSON 객체이며 키는 속성명, 값은 YAML로 파싱될 문자열입니다. ‘속성 정리’ 명령은 여기에 정의된 키를 ‘필수 키’로 간주해, 빠진 노트를 log.md에 기록합니다.",
            'userproperties'
        );

        // ── 프로젝트 ───────────────────────────────────
        new Setting(containerEl).setName('프로젝트').setHeading();

        new Setting(containerEl)
            .setName('프로젝트 폴더 (projectPath)')
            .setDesc("‘현재 파일을 프로젝트에 추가’ 명령이 가공된 사본을 만드는 vault 내 폴더 경로. 폴더는 미리 만들어져 있어야 합니다. 비워두면 프로젝트 명령이 비활성화됩니다. 예: '_publish'")
            .addText((t) =>
                t.setPlaceholder('_publish')
                    .setValue(this.plugin.settings.projectPath)
                    .onChange(async (v) => {
                        this.plugin.settings.projectPath = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // ── 조각글 ─────────────────────────────────────
        new Setting(containerEl).setName('조각글').setHeading();

        new Setting(containerEl)
            .setName('트리거 문자 (snippetTrigger)')
            .setDesc("이 문자를 입력하면 조각글 자동완성이 뜹니다. 트리거 뒤에 검색어를 이어서 적으면 일치하는 조각글이 추천되며, 결과가 단 하나면 자동 삽입됩니다.")
            .addText((t) =>
                t.setPlaceholder('@')
                    .setValue(this.plugin.settings.snippetTrigger)
                    .onChange(async (v) => {
                        this.plugin.settings.snippetTrigger = v;
                        await this.plugin.saveSettings();
                    })
            );

        this.addNumberSetting(
            containerEl,
            '표시 개수 (snippetLimit)',
            "자동완성 팝업에 한 번에 노출되는 조각글 최대 개수. 1 미만으로 설정하면 자동완성이 동작하지 않습니다.",
            'snippetLimit'
        );

        this.addLineListSetting(
            containerEl,
            '조각글 목록 (snippets)',
            "자동완성에 노출할 조각글들을 한 줄에 하나씩 적어주세요. 빈 줄은 무시됩니다. ‘조각글 추가/제거’ 명령으로도 관리할 수 있습니다.",
            'snippets'
        );

        // ── 기호 ───────────────────────────────────────
        new Setting(containerEl).setName('기호').setHeading();

        new Setting(containerEl)
            .setName('트리거 문자 (symbolTrigger)')
            .setDesc("이 문자를 입력하면 기호 자동완성이 뜹니다. 각 기호의 id를 검색해 실제 기호로 치환하며, 결과가 단 하나면 자동 삽입됩니다.")
            .addText((t) =>
                t.setPlaceholder('~')
                    .setValue(this.plugin.settings.symbolTrigger)
                    .onChange(async (v) => {
                        this.plugin.settings.symbolTrigger = v;
                        await this.plugin.saveSettings();
                    })
            );

        this.addNumberSetting(
            containerEl,
            '표시 개수 (symbolLimit)',
            "자동완성 팝업에 한 번에 노출되는 기호 최대 개수. 1 미만으로 설정하면 자동완성이 동작하지 않습니다.",
            'symbolLimit'
        );

        this.addJsonSetting(
            containerEl,
            '기호 목록 (symbols)',
            "자동완성으로 입력 가능한 기호 목록. JSON 배열이며 각 항목은 { id, symbol, closing? } 형식입니다. id는 검색용 키워드, symbol은 삽입할 기호이고, closing이 있으면 선택 텍스트를 양쪽으로 감싸거나 커서 양옆에 함께 삽입합니다.",
            'symbols'
        );

        this.addJsonSetting(
            containerEl,
            '쌍 기호 (symbolPairs)',
            "Backspace 한 번으로 시작과 끝을 함께 지울 짝꿍 기호 표. JSON 객체이며 키는 시작 문자, 값은 짝이 되는 끝 문자입니다. 커서가 키-값 쌍 사이에 있을 때만 동작합니다.",
            'symbolPairs'
        );

        // ── 작업/보관 노트 ─────────────────────────────
        new Setting(containerEl).setName('작업 / 보관 노트').setHeading();

        new Setting(containerEl)
            .setName('작업 노트 경로 (workFilePath)')
            .setDesc("‘작업 문서 열기’ 명령과 좌측 리본 아이콘이 여는 임시 메모용 노트의 vault 기준 상대 경로. 이미 메인 탭에 열려 있으면 새로 열지 않고 포커스만 이동합니다. 예: 'work.md'")
            .addText((t) =>
                t.setPlaceholder('work.md')
                    .setValue(this.plugin.settings.workFilePath)
                    .onChange(async (v) => {
                        this.plugin.settings.workFilePath = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('보관 노트 경로 (laterFilePath)')
            .setDesc("‘작업 문서 정리’ 명령 실행 시 작업 노트의 본문이 타임스탬프와 함께 누적될 보관 노트의 vault 기준 상대 경로. 이 파일이 존재하지 않으면 데이터 손실 방지를 위해 정리 작업이 즉시 중단됩니다. 예: 'later.md'")
            .addText((t) =>
                t.setPlaceholder('later.md')
                    .setValue(this.plugin.settings.laterFilePath)
                    .onChange(async (v) => {
                        this.plugin.settings.laterFilePath = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('백업 타임스탬프 형식 (workTimestampFormat)')
            .setDesc("작업 노트를 보관 노트로 이전할 때 본문 앞에 붙일 시각 표기. moment.js 토큰을 사용합니다. 예: 'MM/DD HH:mm:ss', 'YYYY-MM-DD HH:mm'")
            .addText((t) =>
                t.setPlaceholder('MM/DD HH:mm:ss')
                    .setValue(this.plugin.settings.workTimestampFormat)
                    .onChange(async (v) => {
                        this.plugin.settings.workTimestampFormat = v;
                        await this.plugin.saveSettings();
                    })
            );

        // ── 초기화 ─────────────────────────────────────
        new Setting(containerEl).setName('초기화').setHeading();

        new Setting(containerEl)
            .setName('모든 설정 초기화')
            .setDesc("모든 항목을 기본값으로 되돌립니다. 등록한 조각글·기호·사용자 속성·경로 설정 등 사용자 데이터까지 함께 초기화되니 주의해주세요.")
            .addButton((btn) =>
                btn.setButtonText('초기화')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                        await this.plugin.saveSettings();
                        new Notice('설정이 초기값으로 복구되었습니다.');
                        this.display();
                    })
            );
    }

    private addNumberSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: 'snippetLimit' | 'symbolLimit'
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((t) => {
                t.inputEl.type = 'number';
                t.setValue(String(this.plugin.settings[key]))
                    .onChange(async (v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        this.plugin.settings[key] = Math.floor(n);
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addLineListSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: 'snippets'
    ): void {
        const setting = new Setting(containerEl).setName(name).setDesc(desc);
        setting.settingEl.addClass('atoz-setting-vertical');
        const initial = this.plugin.settings[key].join('\n');

        setting.addTextArea((ta) => {
            ta.inputEl.addClass('atoz-setting-textarea');
            ta.setValue(initial);
            ta.inputEl.addEventListener('blur', async () => {
                this.plugin.settings[key] = ta.getValue().split('\n').filter((l) => l.length > 0);
                await this.plugin.saveSettings();
            });
        });
    }

    private addJsonSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        key: 'userproperties' | 'symbols' | 'symbolPairs'
    ): void {
        const setting = new Setting(containerEl).setName(name).setDesc(desc);
        setting.settingEl.addClass('atoz-setting-vertical');
        const initial = JSON.stringify(this.plugin.settings[key], null, 2);
        const errorEl = setting.settingEl.createDiv({ cls: 'atoz-setting-error' });

        setting.addTextArea((ta) => {
            ta.inputEl.addClass('atoz-setting-textarea');
            ta.setValue(initial);
            ta.inputEl.addEventListener('blur', async () => {
                try {
                    const parsed = JSON.parse(ta.getValue());
                    (this.plugin.settings as any)[key] = parsed;
                    await this.plugin.saveSettings();
                    errorEl.setText('');
                } catch {
                    errorEl.setText('JSON 형식이 올바르지 않아 저장되지 않았습니다. 문법을 확인해주세요.');
                }
            });
        });
    }
}
