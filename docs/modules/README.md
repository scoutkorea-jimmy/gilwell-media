# Homepage Modules Hub

> Obsidian에서 BP미디어 메인 사이트 모듈을 따라가기 위한 허브 문서입니다.
> 이 문서는 `[[Homepage Runtime Map]]`과 각 개별 모듈 노트의 진입점입니다.

## 읽는 순서

1. [[Homepage Runtime Map]]
2. [[GW Foundation]]
3. [[Public Site Chrome]]
4. [[Homepage Runtime]]
5. [[Board Runtime]]
6. [[Board Write Runtime]]
7. [[Post Page Runtime]]
8. [[Glossary Runtime]]
9. [[Search Runtime]]
10. [[Calendar Runtime]]
11. [[WOSM Members Runtime]]
12. [[Admin V3 Runtime]]

## 레이어 요약

- Foundation
  - `js/main.js`
  - 전역 `window.GW` 네임스페이스와 공용 유틸의 시작점
- Public Shell
  - `js/site-chrome.js`
  - 공개 페이지 공통 셸, 상단 메뉴, 번역, 푸터, 통계
- Page Runtime
  - `js/home.js`, `js/board.js`, `js/board-write.js`, `js/post-page.js`, `js/search.js`, `js/glossary.js`, `js/calendar.js`, `js/wosm-members.js`
  - 페이지별 기능 구현
- Admin Runtime
  - `js/admin-v3.js`, `js/kms.js`
  - 관리자와 KMS 전용 로직

## 빠른 규칙

- 새 기능을 볼 때는 먼저 “이게 Foundation인지, Public Shell인지, Page Runtime인지”를 분류합니다.
- 공통 기능이 두 페이지 이상에서 반복되면 `js/main.js` 또는 `js/site-chrome.js`로 올릴 수 있는지 먼저 봅니다.
- Obsidian에서는 이 문서에서 시작해 위키링크로 이동하고, 코드 확인은 각 노트의 `Code Entry` 섹션을 따라갑니다.

## 관련 문서

- [[Homepage Runtime Map]]
- `docs/homepage-module-inventory.md`
- `CHATGPT.md`
