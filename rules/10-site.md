---
tags: [ai-guide, rules, site]
aliases: [Site Rules, 공개 홈페이지 규칙]
scope: project
---

# 10 · [Site] 공개 홈페이지

> [!abstract] Scope
> 공개 페이지 (방문자 대상) — 홈, 카테고리 보드, 기사 상세, 검색, 용어집, 회원국 현황 등
> 디자인·색상·접근성 규칙은 [11-site-design.md](11-site-design.md) 에 분리되어 있다.

## Core Principle

- **안정성 우선** — 새 기능보다 기존 기능의 안정적 동작이 중요
- 네임스페이스: `window.GW` (Dreampath의 `window.DP`와 무관)
- 에디터: **Editor.js** (Dreampath의 Tiptap과 무관)
- 스타일: `css/style.css` 기준 유지

## Key Files

| 파일 | 역할 |
|---|---|
| `index.html` | 홈 |
| `korea.html`, `apr.html`, `wosm.html`, `people.html` | 공개 카테고리 보드 |
| `wosm-members.html` | 세계연맹 회원국 현황 |
| `glossary.html` | 용어집 |
| `search.html` | 검색 |
| `css/style.css` | 공유 스타일 |
| `js/main.js` | `window.GW` + 공용 유틸 |
| `js/board.js` | 게시판 렌더링 |
| `js/post-page.js` | 기사 상세 |
| `functions/api/*` (dreampath 제외) | 사이트 API |
| `functions/[[path]].js` | 공유 메타 주입 |
| `functions/post/[id].js` | 기사 상세 SSR |

## Module Layers

> Foundation → Component → Pattern → Template → Code Module

| Layer | 예시 |
|---|---|
| Foundation | 색상, 타이포, 간격, 상태 언어 |
| Component | 버튼, 태그, 카드, 입력 |
| Pattern | 마스트헤드, 히어로, 섹션 레일 |
| Template | 홈, 게시판, 기사 상세 |
| Code Module | constants, utils, renderers, API helpers |

- P0 공통화: `section rail`, `post card shell`, `button/chip family`
- 모듈 분해 기준: [[docs/homepage-module-inventory|Module Inventory]]

## Site Structure

- 공개 표면: 홈, Korea, APR, WOSM, Scout People, 검색, 용어집, 회원국 현황, 기사 상세, 도움
- 홈 구성: 마스트헤드 → 티커 → 히어로 → 메인 스토리 → 최신 → 인기 → 에디터 추천 → 카테고리 → 푸터 통계
- 에디터 추천: 최대 4개, 서버에서도 강제
- 메인 스토리 ↔ 에디터 추천 **동시 지정 허용** (2026-04-19 배타 제약 해제). 같은 기사를 두 슬롯 모두에 노출할 수 있음. 상세는 KMS 5.5.

## Content & Date Rules

| 기준 | 규칙 |
|---|---|
| 공개 정렬 | `publish_at` 우선, 없으면 `created_at` |
| 공개 날짜 | `YYYY년 M월 D일` |
| RSS 날짜 | `created_at` 기준, 작성자 실명 비노출 |

## Home Rules

- 최신 소식: 첫 진입 + 탭 복귀 + 포커스 복귀 시 항상 재조회
- latest rail: `no-store`
- 접근성: skip-link, 랜드마크, heading 구조, 히어로 일시정지, 티커 정지
- 메인 스토리 저장/해제 후 캐시 즉시 퍼지
- 하드코딩 정리는 `운영값 / 구조상수 / fallback`으로 먼저 분류
- nav fallback, ticker 기본 문구, 공통 경로 제목 → `functions/_shared/site-structure.mjs`, `functions/_shared/site-copy.mjs`
- 공개 HTML fallback 동기화: `scripts/sync_public_fallbacks.mjs` (release 전 자동 반영)
- 홈 런타임 분리 유지: `home-helpers → home-render → home-hero → home-runtime → home.js`

## Article & Share Rules

- 기사 수정: 같은 페이지 모달 (관리자 세션 검증 필수)
- 공유 `share_ref`: 매 클릭 새로 생성 (캐시 오류 방지)
- 예약 공개: overdue 보정 + Cloudflare scheduled worker 5분 주기

## Tag & Image Rules

- 사용 중인 태그 삭제 불가 → 어떤 글에서 사용 중인지 안내
- 히어로: PC/모바일별 이미지 프레이밍 값 개별 저장
- 이미지 확대/축소: 60%~150%, 100% 미만 시 블러 배경 보정

## Glossary Rules

- 검색: 용어 + 설명 함께 검색
- 검색 범위 체크박스 전체 해제 시 → 검색 차단 + 안내

## Footer Rules

- 구조화된 필드 편집기 우선 (raw HTML 직접 수정 지양)
- 제목, 소개, 도메인, 기사제보 메일, 문의 메일 각각 수정 가능

## Data Safety

> [!important]
> - 게시글 삭제 시 연관 이미지/기록/조회·공감/URL 로그 함께 정리
> - 공유 메타: `functions/[[path]].js` 기준 주입
> - `canonical` + `robots.txt` + `sitemap.xml` 한 세트로 관리
> - sitemap에는 공개 canonical 경로만 포함

## 성장 기능 제안 자제

뉴스레터 / 프로필 / 아카이브 / 멤버십 / 북마크 / 페르소나 내비게이션 등 성장 기능은 **규모 신호(10K MAU, 500+ 게시글, 오너의 명시적 요청)** 가 오기 전까지 먼저 제안하지 않는다.

## Deployment

배포 순서·버전 bump·changelog 규칙은 [02-versioning.md](02-versioning.md) + [03-deploy.md](03-deploy.md) 참조.

Site 전용 추가 규칙:
- 공개 UI 변경은 오너 확인 후 production 배포 (AI Deployment Protocol: Site = 질문 후 진행)
- `wrangler pages deploy ...`를 직접 쓰더라도 `release_preflight.sh`를 먼저 통과해야 한다
- `VERSION` bump 시 `data/changelog.json`에 사이트 버전 엔트리 prepend 필수

## Verification Checklist (배포 전후)

- [ ] 홈, 대표 기사 상세, 카테고리 보드
- [ ] 검색, 용어집
- [ ] 모바일 레이아웃
- [ ] RSS 응답
- [ ] `robots.txt`, `sitemap.xml` 접근
- [ ] OG meta (`og:title`, `og:image`, `canonical`)
- [ ] 홈 최신 갱신, 공유 버튼, 수정 모달
