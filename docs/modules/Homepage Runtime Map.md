---
tags: [map, runtime, homepage]
aliases: [Homepage Runtime Map, 런타임 맵]
scope: homepage
---
# Homepage Runtime Map

## 목적

이 문서는 “어떤 HTML/SSR 페이지가 어떤 JS 모듈을 어떤 순서로 로드하는지”를 한 번에 보여주는 맵입니다.

## 공통 로드 규칙

- 대부분의 공개 페이지는 아래 순서를 따릅니다.
  - `js/main.js`
  - `js/site-chrome.js`
  - 페이지 전용 JS
- 이유
  - `main.js`가 `window.GW`와 공용 유틸을 만듭니다.
  - `site-chrome.js`가 공개 셸 기능을 붙입니다.
  - 페이지 전용 JS가 마지막에 화면 기능을 초기화합니다.

## 페이지별 로드 맵

| 페이지 | 엔트리 | 로드 순서 | 비고 |
| --- | --- | --- | --- |
| 홈 | `index.html` | `main.js` → `site-chrome.js` → `home.js` | 홈 전용 데이터 렌더 |
| 게시판 | `latest.html`, `korea.html`, `apr.html`, `wosm.html`, `people.html` | `main.js` → `site-chrome.js` → `board.js` → `board-write.js` | `GW.bootstrapStandardPage()` 후 `new GW.Board()` |
| 검색 | `search.html` | `main.js` → `site-chrome.js` → `search.js` | 검색 전용 UI |
| 용어집 | `glossary.html` | `main.js` → `site-chrome.js` → `glossary.js` | 공개 + 일부 로그인 액션 |
| 캘린더 | `calendar.html` | `main.js` → `site-chrome.js` → `calendar.js` | 지도/필터/상세 포함 |
| 회원국 현황 | `wosm-members.html` | `main.js` → `site-chrome.js` → `wosm-members.js` | 표/검색/필터 |
| 기사 상세 | `functions/post/[id].js` | `main.js` → `site-chrome.js` → `post-page.js` | SSR + 클라이언트 상호작용 |
| 특집 페이지 | `functions/feature/[category]/[slug].js` | `main.js` → `site-chrome.js` | 별도 전용 JS 없음 |
| 도움 페이지 | `contributors.html` | `main.js` → `site-chrome.js` | 인라인 fetch 사용 |
| 관리자 | `admin.html` | `main.js` → `shared-country-name-ko.js` → `admin-v3.js` | 공개 셸 미사용 |
| KMS | `kms.html` | `main.js` → `kms.js` | 별도 관리자 도구 |

## 따라가기 링크

- Libraries:
  - [[Templates Library]]
  - [[API Library]]
- Foundation: [[GW Foundation]]
- Public Shell: [[Public Site Chrome]]
- Page Runtime:
  - [[Homepage Runtime]]
  - [[Board Runtime]]
  - [[Board Write Runtime]]
  - [[Post Page Runtime]]
  - [[Search Runtime]]
  - [[Glossary Runtime]]
  - [[Calendar Runtime]]
  - [[WOSM Members Runtime]]
- Admin:
  - [[Admin V3 Runtime]]

## 코드 확인 포인트

- `index.html`
- `latest.html`
- `functions/post/[id].js`
- `functions/feature/[category]/[slug].js`

## Obsidian 팁

- 이 문서는 그래프뷰에서 허브 역할을 합니다.
- 새 모듈 노트를 추가할 때는 이 표에 먼저 등록합니다.
