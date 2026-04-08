# Homepage Modules Hub

> 이 문서는 기능 허브 아래의 참고 라이브러리입니다.
> Obsidian에서는 먼저 `[[Homepage Features Hub]]`를 보고, 그 다음에 이 문서로 내려오는 흐름을 권장합니다.

## 읽는 순서

1. [[Homepage Features Hub]]
2. [[Feature Map]]
3. [[Homepage Runtime Map]]
4. [[Templates Library]]
5. [[API Library]]
6. [[GW Foundation]]
7. [[Public Site Chrome]]
8. [[Homepage Runtime]]
9. [[Board Runtime]]
10. [[Board Write Runtime]]
11. [[Post Page Runtime]]
12. [[Glossary Runtime]]
13. [[Search Runtime]]
14. [[Calendar Runtime]]
15. [[WOSM Members Runtime]]
16. [[Admin V3 Runtime]]

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

- [[Homepage Features Hub]]
- [[Feature Map]]
- [[Homepage Runtime Map]]
- [[Templates Library]]
- [[API Library]]
- `docs/homepage-module-inventory.md`
- `CHATGPT.md`
