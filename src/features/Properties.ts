import type ATOZVER6Plugin from '../main';
import { App, Editor, Modal, Notice, SuggestModal, parseYaml, stringifyYaml } from 'obsidian';
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
    //   6. BaseInputModal 오픈
    // ──────────────────────────────────────────────
    insertProperties(editor: Editor): void {
        const raw = editor.getValue();
    
        const { frontmatter, body } = this.parseDocument(raw);
        const merged = this.mergeProperties(frontmatter);
        const newContent = this.buildDocument(merged, body);
    
        if (newContent !== raw) {
            const cursorBefore = editor.getCursor();
            const oldHadFrontmatter = /^---\n/.test(raw);
    
            editor.setValue(newContent);
    
            if (!oldHadFrontmatter) {
                const insertedLineCount = newContent.split('\n').findIndex(l => l === '') + 1;
                editor.setCursor({
                    line: cursorBefore.line + insertedLineCount,
                    ch: cursorBefore.ch
                });
            } else {
                editor.setCursor(cursorBefore);
            }
        }
            // 프론트매터 삽입 여부와 무관하게 항상 모달 오픈
        new BaseInputModal(this.plugin.app, editor, this.plugin.baseCandidates).open();
    }
    
}

// ──────────────────────────────────────────────
// [BaseInputModal]
//
// base 배열에 항목을 반복 입력하는 SuggestModal.
//
// 동작:
//   - 후보 목록: plugin.baseCandidates (로드 시 수집된 vault 전체 base 값)
//   - 날짜 형식(YYYY년 / M월 / D일)은 후보에서 제외
//   - 없는 값 입력 시 "+ '입력값' 추가" 항목 노출
//   - 선택 즉시 editor의 base 배열에 반영 (중복 스킵)
//   - 모달은 닫히지 않고 반복 입력, Escape로 종료
// ──────────────────────────────────────────────
export const DATE_PATTERN = /^\d{4}년$|^\d{1,2}월$|^\d{1,2}일$/;
const NEW_ITEM_PREFIX = "+ '";

export class BaseInputModal extends SuggestModal<string> {
    private editor: Editor;
    private candidates: string[];

    constructor(app: App, editor: Editor, candidates: string[]) {
        super(app);
        this.editor = editor;
        this.candidates = candidates;
        this.setPlaceholder('base에 추가할 항목을 입력하세요.');
    }

    getSuggestions(query: string): string[] {
        const trimmed = query.trim();

        // 후보 필터링: 날짜 형식 제외, 퍼지 검색
        const filtered = this.candidates.filter(c =>
            !DATE_PATTERN.test(c) &&
            c.toLowerCase().includes(trimmed.toLowerCase())
        );

        // 완료 항목 맨 위 고정
        const suggestions: string[] = ['✓ 완료'];

        // 새 항목 추가 옵션: 입력값이 있고 후보에 없을 때 상단에 노출
        if (trimmed && !this.candidates.includes(trimmed)) {
            suggestions.push(`${NEW_ITEM_PREFIX}${trimmed}' 추가`);
        }

        return [...suggestions, ...filtered];
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    onChooseSuggestion(value: string) {
    	// 완료 선택 시 플래그 false 유지 → onClose에서 재오픈 안 함
    	if (value === '✓ 완료') return;
    	
        // "+" 항목이면 실제 값 추출
        const isNew = value.startsWith(NEW_ITEM_PREFIX);
        const item = isNew
            ? value.slice(NEW_ITEM_PREFIX.length, -4) // "+ '" 와 "' 추가" 제거
            : value;

        this.addToBase(item);

        new BaseInputModal(this.app, this.editor, this.candidates).open();
    }

    // editor에서 현재 base 배열을 읽어 항목 추가 후 다시 씀
    private addToBase(item: string) {
        const raw = this.editor.getValue();
        const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;
        const match = raw.match(FRONTMATTER_REGEX);
        if (!match) return;

        const yamlString = match[1] ?? '';
        let frontmatter: Record<string, any>;
        try {
            const parsed = parseYaml(yamlString);
            frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                ? parsed as Record<string, any>
                : {};
        } catch {
            return;
        }

        const base: unknown[] = Array.isArray(frontmatter['base']) ? frontmatter['base'] : [];

        // 중복 스킵
        if (base.includes(item)) {
            new Notice(`이미 존재하는 항목입니다: ${item}`);
            return;
        }

        // 날짜 뒤에 append
        base.push(item);
        frontmatter['base'] = base;

        const newYaml = stringifyYaml(frontmatter).trimEnd();
        const newFrontmatter = `---\n${newYaml}\n---`;
        const body = raw.slice(match[0].length);
        const trimmedBody = body.replace(/^\n+/, '');
        const newContent = trimmedBody.length > 0
            ? `${newFrontmatter}\n${trimmedBody}`
            : newFrontmatter;

        const cursorBefore = this.editor.getCursor();
        this.editor.setValue(newContent);
        this.editor.setCursor(cursorBefore);

        // 현재 세션 캐시에도 추가
        if (!this.candidates.includes(item)) {
            this.candidates.push(item);
        }

        new Notice(`base에 추가됨: ${item}`);
    }
}
