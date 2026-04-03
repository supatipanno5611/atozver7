import type ATOZVER6Plugin from '../main';
import { Editor, Notice, parseYaml, stringifyYaml } from 'obsidian';
import { ParsedDocument } from '../types';
import { moment } from 'obsidian';

export class PropertiesFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    // ──────────────────────────────────────────────
    // [parseDocument]
    //
    // 에디터의 raw 텍스트를 받아 프론트매터와 본문을 분리합니다.
    //
    // 규칙:
    //   - 문서가 "---\n" 으로 시작하고, 이후 어딘가에 닫는 "---" 가 있으면
    //     그 사이를 YAML로 파싱합니다.
    //   - 위 조건을 만족하지 않으면 프론트매터가 없는 것으로 간주하고
    //     전체를 body로 봅니다.
    //   - YAML 파싱 실패 시에도 프론트매터 없는 것으로 간주합니다.
    // ──────────────────────────────────────────────
    parseDocument(raw: string): ParsedDocument {
        const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;
        const match = raw.match(FRONTMATTER_REGEX);

        if (!match) {
            return { frontmatter: {}, body: raw };
        }

        const yamlString = match[1] ?? '';
        const afterBlock = raw.slice(match[0].length);

        try {
            const parsed = parseYaml(yamlString);
            const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? parsed as Record<string, any>
                : {};
            return { frontmatter, body: afterBlock };
        } catch {
            // YAML 파싱 실패 시 프론트매터 없는 것으로 취급
            return { frontmatter: {}, body: raw };
        }
    }

    // ──────────────────────────────────────────────
    // [buildDocument]
    //
    // 프론트매터 객체와 본문을 받아 완성된 마크다운 문자열을 만듭니다.
    // ──────────────────────────────────────────────
    private buildDocument(frontmatter: Record<string, any>, body: string): string {
        const yamlString = stringifyYaml(frontmatter).trimEnd();
        const frontmatterBlock = `---\n${yamlString}\n---`;

        if (body.trim().length === 0) {
            return frontmatterBlock;
        }

        // 본문 앞의 불필요한 빈 줄을 제거하고, 프론트매터와 사이에 빈 줄 하나를 둡니다.
        const trimmedBody = body.replace(/^\n+/, '');
        return `${frontmatterBlock}\n${trimmedBody}`;
    }
    
    // ──────────────────────────────────────────────
    // [dateInsert]
    //
	// 오늘 날짜를 ["2026년", "4월", "1일"] 형태로 반환
	// ──────────────────────────────────────────────
    private buildTodayBase(): string[] {
        const m = moment();
        return [
            m.format('YYYY년'),
            m.format('M월'),
            m.format('D일'),
        ];
    }

    // ──────────────────────────────────────────────
    // [mergeProperties]
    //
    // 기존 프론트매터에 설정의 속성을 병합합니다.
    //
    // 규칙:
    //   - 이미 존재하는 키는 절대 건드리지 않습니다. (사용자 데이터 보호)
    //   - 없는 키만 추가합니다.
    //   - 최종 결과는 키를 알파벳 순으로 정렬합니다.
    // ──────────────────────────────────────────────
    private mergeProperties(frontmatter: Record<string, any>): Record<string, any> {
        const result = { ...frontmatter };

        for (const [key, yamlValue] of Object.entries(this.plugin.settings.userproperties)) {
            if (result[key] === undefined) {
                try {
                    result[key] = parseYaml(yamlValue.trim());
                } catch {
                    new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                    result[key] = yamlValue;
                }
            }
        }

        // base가 없을 때만 오늘 날짜 배열 삽입
        if (result['base'] === undefined) {
        	result['base'] = this.buildTodayBase();
        }

        // 알파벳 순 정렬
        return Object.fromEntries(
            Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
        );
    }

    // ──────────────────────────────────────────────
    // [insertProperties]  ← 진입점
    //
    // 전체 흐름:
    //   1. editor.getValue() 로 현재 문서 전체를 가져옴
    //   2. parseDocument() 로 프론트매터와 본문을 분리
    //   3. mergeProperties() 로 설정 속성 병합 + 정렬
    //   4. buildDocument() 로 새 문자열 조립
    //   5. editor.setValue() 로 에디터를 한 번에 교체
    // ──────────────────────────────────────────────
    insertProperties(editor: Editor): void {
        const raw = editor.getValue();

        const { frontmatter, body } = this.parseDocument(raw);
        const merged = this.mergeProperties(frontmatter);
        const newContent = this.buildDocument(merged, body);

        // 변경 사항이 없으면 에디터를 건드리지 않습니다.
        if (newContent === raw) {
            new Notice("이미 모든 속성이 존재합니다.");
            return;
        }

        // 커서 위치를 기억했다가 setValue 후 복원합니다.
        // 프론트매터가 새로 생긴 경우, 삽입된 줄만큼 커서를 아래로 보정합니다.
        const cursorBefore = editor.getCursor();
        const oldHadFrontmatter = /^---\n/.test(raw);

        editor.setValue(newContent);

        if (!oldHadFrontmatter) {
            // 프론트매터가 새로 삽입됐으므로 삽입된 줄 수를 계산해 커서를 이동합니다.
            const insertedLineCount = newContent.split('\n').findIndex(l => l === '') + 1;
            editor.setCursor({
                line: cursorBefore.line + insertedLineCount,
                ch: cursorBefore.ch
            });
        } else {
            editor.setCursor(cursorBefore);
        }
    }
}
