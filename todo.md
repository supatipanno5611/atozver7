# Refactoring Todo: main.ts 기능별 분리

## 목표
main.ts에 모여있는 기능을 `src/features/` 폴더 아래 기능별 파일로 분리.
각 기능은 클래스로 감싸고, 생성자에서 `plugin: ATOZVER6Plugin`을 받아 app/settings에 접근.
main.ts는 각 feature 인스턴스를 생성하고 위임하는 역할만 담당.

---

## 공통 패턴

```ts
// src/features/SomeFeature.ts
import type ATOZVER6Plugin from '../main';

export class SomeFeature {
    constructor(private plugin: ATOZVER6Plugin) {}

    doSomething() {
        const { app, settings } = this.plugin;
        // ...
    }
}
```

```ts
// main.ts
import { SomeFeature } from './features/SomeFeature';

export default class ATOZVER6Plugin extends Plugin {
    someFeature: SomeFeature;

    async onload() {
        this.someFeature = new SomeFeature(this);
        // 커맨드: () => this.someFeature.doSomething()
    }
}
```

---

## 분리 대상 목록

### [ ] 1. CertainMd → `src/features/CertainMd.ts`
- 메서드: `openCertainMdFile()`
- 상태: 없음

### [ ] 2. CursorCenter → `src/features/CursorCenter.ts`
- 메서드: `toggleCursorCenter()`, `scrollToCursorCenter()`
- 상태: `settings.isCursorCenterEnabled`만 사용 (settings에 위임)

### [ ] 3. CutCopy → `src/features/CutCopy.ts`
- 메서드: `copyAll()`, `cutAll()`, `handleCutCopy()`
- 상태: 없음

### [ ] 4. CutCreateNewMd → `src/features/CutCreateNewMd.ts`
- 메서드: `cutAndCreateNewMd()`
- 모달: `CutAndCreateModal` (같은 파일에 유지)
- 상태: 없음

### [ ] 5. CyclePinTab → `src/features/CyclePinTab.ts`
- 메서드: `cycleTabsContextAware()`, `smartJump()`, `recordLeafHistory()`,
  `getLeafPinnedState()`, `getLeavesByState()`, `getLeafPath()`,
  `findLeafByPath()`, `pickMostRecentLeaf()`, `activateLeafSafe()`
- 상태: `lastPinnedPath`, `lastUnpinnedPath`, `isInternalNavigation`
  → 클래스 프로퍼티로 이동

### [ ] 6. Executes → `src/features/Executes.ts`
- 메서드: `executeDeleteParagraph()`
- 상태: 없음

### [ ] 7. Graph → `src/features/Graph.ts`
- 메서드: `toggleLocalGraphInSidebar()`, `toggleGlobalGraphInSidebar()`
- 상태: 없음

### [ ] 8. HeadingNavigater → `src/features/HeadingNavigater.ts`
- 메서드: `moveHeading()`
- 상태: 없음

### [ ] 9. MoveCursor → `src/features/MoveCursor.ts`
- 메서드: `moveCursorToEnd()`, `moveCursorToStart()`, `scrollToBottom()`
- 상태: 없음
- 참고: `scrollToBottom()`은 Ordinary에서도 호출됨 → MoveCursor에 두고 공유

### [ ] 10. Ordinary → `src/features/Ordinary.ts`
- 메서드: `openFileOrdinary()`
- 상태: 없음
- 의존: `MoveCursor.scrollToBottom()` 호출 필요

### [ ] 11. Properties → `src/features/Properties.ts`
- 메서드: `insertProperties()`, `parseDocument()`
- 상태: 없음

### [ ] 12. SaveMD → `src/features/SaveMD.ts`
- 메서드: `checkCreateSaveFile()`, `handleSetAutoSaveTarget()`, `handleUnsetAutoSaveTarget()`,
  `handleAbnormalInput()`, `handleAutoSaveInput()`, `emergencyAction()`, `createSaveFile()`
- 상태: `lastKey`, `repeatCount`, `totalKeyCount` → 클래스 프로퍼티로 이동

### [ ] 13. Selection → `src/features/Selection.ts`
- 메서드: `expandRight()`, `expandLeft()`, `expandRightEnd()`, `expandLeftEnd()`
- 상태: 없음

### [ ] 14. Snippets → `src/features/Snippets.ts`
- 메서드: `addSnippet()`, `removeSnippet()`
- 클래스: `SnippetsSuggestions` (같은 파일에 유지)
- 상태: 없음 (debouncedSave는 plugin에 위임)

### [ ] 15. Symbols → `src/features/Symbols.ts`
- 메서드: `handleSmartBackspace()`
- 클래스: `SymbolSuggestions` (같은 파일에 유지)
- 상태: 없음

### [ ] 16. TaskPlan → `src/features/TaskPlan.ts`
- 메서드: `openTaskPlanSmart()`, `openTaskPlanFile()`, `handleLineMove()`,
  `resolveRoute()`, `extractSelection()`, `getTargetFile()`, `moveContent()`,
  `appendToEndOfFile()`, `prependToTopOfFile()`, `finalizeMove()`,
  `openFileInLeaf()`, `openFileInNewTab()`, `ensureFocus()`
- 모달: `MoveLinetoPlanSuggestModal` (같은 파일에 유지)
- 상태: 없음

### [ ] 17. Trash → `src/features/Trash.ts`
- 메서드: `toggleTrashFileInRightSidebar()`
- 상태: `isTrashToggling` → 클래스 프로퍼티로 이동

### [ ] 18. Work → `src/features/Work.ts`
- 메서드: `cleanupTabs()`, `readWorkContent()`, `backupAndClear()`,
  `openWorkFile()`, `toggleLaterFileInRightSidebar()`
- 상태: `isWorkLaterToggling` → 클래스 프로퍼티로 이동

---

## main.ts 변경 내용

1. 상태 변수들 → 각 feature 클래스로 이동
2. 메서드들 → 각 feature 클래스로 이동
3. feature 인스턴스 선언 추가 (`certainMd`, `cursorCenter`, ...)
4. `onload()`에서 feature 인스턴스 생성
5. 커맨드/이벤트/리본 콜백을 `this.featureX.method()` 형태로 교체
6. 불필요해진 import 정리

---

## 진행 순서 (권장)

상호 의존 없는 단순한 것부터 시작:

1. Selection, MoveCursor, Executes (가장 단순, 상태 없음)
2. CursorCenter, Graph, CertainMd
3. CutCopy, HeadingNavigater, Properties
4. Ordinary (MoveCursor 의존)
5. SaveMD (상태 이동 포함)
6. CyclePinTab (상태 이동 포함)
7. Trash, Work (상태 + 비동기 로직)
8. Snippets, Symbols (EditorSuggest 클래스 포함)
9. CutCreateNewMd, TaskPlan (Modal 클래스 포함)

---

## 완료 후 확인사항

- [ ] `tsc --noEmit` 타입 에러 없음
- [ ] 각 커맨드/이벤트 정상 동작
- [ ] main.ts 라인 수 크게 감소 확인
