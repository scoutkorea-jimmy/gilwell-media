---
tags: [dreampath, history, case-studies, version-log]
aliases: [Dreampath History, Dreampath Case Studies, Version Log]
scope: dreampath
sibling: DREAMPATH.md
---

# DREAMPATH-HISTORY.md — Dreampath 버전 히스토리 · 케이스 스터디

> [!important] 이 파일의 역할
> Dreampath 에서 발생한 **모든** 의미있는 변경 / 사고 / 회귀 / 비자명한
> 결정의 상세 기록입니다. `DREAMPATH.md` 가 "지금 지켜야 할 규칙" 이라면
> 이 파일은 "**왜 그 규칙이 생겼는가**" 의 원본입니다.
>
> **국문 + 영문 병기**: 향후 독립 도메인에서 내부 팀 / 외부 기여자
> 양쪽이 동일 정보를 공유할 수 있도록 매 엔트리에 한국어 + 영어 병기합니다.
>
> **코드 주석 연동**: 각 케이스 스터디에는 `code_refs` 필드가 있어, 해당
> 사건의 재발 방지 주석이 어느 파일의 어느 함수에 남아 있는지 명시합니다.
> `DREAMPATH.md` Section 17 의 규칙에 의거합니다.

---

## 인덱스 / Index

날짜 역순.

- [2026-04-24 · V2](#2026-04-24--v2) · **/dreampath-v2 마이그레이션 전수 케이스 박제** (P0 10건 · 설계 근거)
- [2026-04-24 · D](#2026-04-24--d) · v01.040.00 — 홈 전면 개편 + 모바일 접근성 + 새 로고 + B1~B5
- [2026-04-24 · C](#2026-04-24--c) · 디자인 시스템 도입 + 문서 완전 분리
- [2026-04-24 · B](#2026-04-24--b) · Dreampath 홈 UX · 접근성 검토 (계획)
- [2026-04-24 · A](#2026-04-24--a) · CSP 회귀 · 사이드바 전체 마비 (P0)

---

## 2026-04-24 · V2

### /dreampath-v2 마이그레이션 전수 케이스 박제

**국문 요약**
Claude 디자인 세션으로 만든 ERP-밀도 기반 새 UI를 `/dreampath-v2` 스테이징
루트로 배포하면서 발견한 10개 이슈를 한 엔트리에 박제. 목적: Dreampath의
독립 도메인 이전 또는 v3 리디자인 때 같은 함정을 다시 밟지 않기. 프로덕션
`/dreampath` 는 끝까지 미변경 — D1 · R2 · 28 API 전부 보존된 상태로 v2 는
스테이징에서 실 API 와 배선까지 완료.

**English Summary**
Recording every issue hit while migrating the Claude-design ERP UI to the
`/dreampath-v2` staging route — 10 cases, one entry, so the next Dreampath
overhaul (v3, independent-domain split, etc.) never steps on the same mines.
Production `/dreampath` was not touched; D1 / R2 / 28 API endpoints remain
byte-identical. v2 is a parallel surface wired to the real backend.

**왜 v2 를 만들었는가 / Why v2 exists**
- 공개 사이트(BP Media) 의 ERP-density 디자인 토큰 시스템 (PMO Style Tokens v2) 적용 — 13px UI 기본, 2px 라운드, flat, 32px 행 높이, ⌘K command palette, motion 120ms 철학.
- 기존 `/dreampath` UI 는 모바일 접근성 개편(v01.040.00) 직후에도 시각적 밀도 · 정보 위계 · 감사로그 가시성이 ERP 운영 기준에 비해 느슨했음.
- 독립 도메인 이전 전에 "새 디자인 + 새 문서" 를 스테이징 레일 위에서 완성해 두면, 이전 시점에 파일만 옮기면 되도록.

### 케이스 1 — `/dreampath-v2` CSP 누락으로 인라인 onclick 전면 차단

**증상**: 로그인 직후 사이드바 · 스탯 칩 · 모달 트리거 전부 무반응. 콘솔에 `Refused to execute inline event handler because it violates … 'nonce-…' 'strict-dynamic'`.
**원인**: 공개 사이트 CSP 가 nonce + strict-dynamic 이라 `'unsafe-inline'` 이 무시됨. `functions/_middleware.js isLegacyInlinePath()` 가 `/admin` `/kms` `/dreampath` 만 예외로 등록되어 있었고 `/dreampath-v2` 는 빠져 있었음.
**수정**: `isLegacyInlinePath()` 에 `/dreampath-v2` / `/dreampath-v2.html` 추가. Admin / KMS / Dreampath / Dreampath-v2 는 legacy `'unsafe-inline'` 을 공유.
**교훈**: **Dreampath 파생 경로를 새로 만들 때마다 `isLegacyInlinePath()` 를 동시에 업데이트.** 추가 안 하면 전체 surface 가 조용히 죽는다. `functions/_middleware.js` 상단 주석이 이 규칙의 상주 체크포인트.
**code_refs**: `functions/_middleware.js` `isLegacyInlinePath()`.

### 케이스 2 — legacy `dp_user` 에 `name` 없는 계정 → `slice()` 터짐

**증상**: `/dreampath` 에서 먼저 로그인한 사용자가 `/dreampath-v2` 접근 시 blank page + `TypeError: Cannot read properties of undefined (reading 'slice')` at `_renderSidebar`.
**원인**: 구 `/dreampath` me.js 응답 중 `display_name` 이 비어 `localStorage.dp_user` 에 `name: null` 로 저장된 계정이 존재. 새 v2 `_renderSidebar` 가 `state.user.name.slice(0,1)` 직접 호출.
**수정**: `_displayName()` / `_avatarChar()` / `_roleLine()` 3 헬퍼 신설. `display_name → name → username → 'User'` 폴백 체인. 5곳의 직접 접근 전부 헬퍼 경유로 교체.
**교훈**: **user 객체의 임의 필드를 직접 dereference 하지 않는다.** 특히 `state.user.name.x` 같은 depth-2 접근은 legacy 세션에서 언제든 터진다.
**code_refs**: `js/dreampath-v2.js` `_displayName` / `_avatarChar` / `_roleLine`.

### 케이스 3 — `./deploy.sh --skip-version` 은 캐시 버스트가 안 된다

**증상**: v2 JS 를 수정하고 `--skip-version` 으로 배포했는데 사용자 브라우저가 이전 JS 를 계속 실행. 수정한 내용이 프로덕션에 "안 보임".
**원인**: `deploy.sh` 는 `VERSION` 이 바뀌어야 HTML 의 `?v=` 쿼리가 바뀌고 브라우저가 새로 fetch. `--skip-version` 은 `dp_versions` 를 건드리지 않아 쿼리값이 직전과 동일 → 브라우저가 캐시된 JS 그대로 사용.
**수정**: 반복 수정 배포 시 `./deploy.sh fix "..."` 를 쓴다 (cc 만 증가 — 의미적 부담 최소). 또는 HTML 의 `?v=` 를 타임스탬프 등 매 배포 유니크값으로 만들도록 스크립트 개조 (미적용).
**교훈**: **`--skip-version` 은 "로그 없이 배포 테스트" 용, 사용자 피드백이 필요한 수정에는 쓰지 않는다.** HTML 자체에 `Cache-Control: no-store` 가 있어도 서브리소스 (JS/CSS) 는 기본 캐시를 탄다.
**code_refs**: `deploy.sh` 상단 주석에 언급. `dreampath-v2.html` 의 `<script src="/js/dreampath-v2.js?v=...">` 아래 주석.

### 케이스 4 — Cloudflare Pages 가 긴 한글 커밋 메시지 거부

**증상**: `wrangler pages deploy` 단계에서 `Invalid commit message, it must be a valid UTF-8 string. [code: 8000111]`. 1604 바이트 한글 + 1476 바이트 한글 둘 다 거부. 1476 바이트 ASCII-only 는 즉시 성공.
**원인**: Cloudflare 측 파이프라인 내부 처리에서 한글 포함 다중 라인 커밋 메시지를 잘못 해석. (정확한 경계 조건은 공개 안 됨.)
**수정**: 커밋 메시지는 ASCII-only + ~1.2KB 미만으로 제한. 풍부한 변경 내역은 커밋 본문보다는 `data/changelog.json` / `DREAMPATH-HISTORY.md` 에 기록.
**교훈**: **Dreampath 커밋 메시지는 짧은 영문 1행 + optional 영문 본문**. 상세 한글 변경 내역은 changelog / history 파일로 분리. `git commit --amend -m` 으로 구제 가능하지만 `./deploy.sh` 가 이미 부분 실행된 상태면 `git push` 가 앞서 나가므로 신중히.
**code_refs**: memory `feedback_cloudflare_commit_msg.md` (사용자 로컬).

### 케이스 5 — `viewPost` 404 시 모달이 조용히 닫히는 UX

**증상**: 사용자가 승인 대기 카드의 Review 또는 홈 announcements 를 눌렀을 때, 서버가 404 (post 가 삭제됨 / team board 접근 거부) 를 반환하면 모달이 사라지고 우상단 토스트만 잠깐 뜸. "클릭했는데 왜 아무것도 안 뜨지?" 가 반복.
**원인**: 공통 `api()` 헬퍼가 모든 non-2xx 를 토스트 + return null 로 처리했고, `viewPost` 가 null 을 받으면 `_closeModal()` 호출.
**수정**: `_rawApi()` 저수준 클라이언트 분리. `viewPost` 는 raw 사용해 404 / 403 / 500 별로 모달 **내부** 에 `_renderPostError()` 로 inline error 카드를 그림. 모달은 명시적 Close 버튼으로만 닫힘.
**교훈**: **조용히 사라지는 UI 는 금지.** 사용자가 클릭한 결과는 반드시 어떤 형태로든 피드백되어야 한다. "토스트 뿌리고 닫기" 는 사용자가 눈을 떼면 놓친다.
**code_refs**: `js/dreampath-v2.js` `_rawApi`, `_renderPostError`, `viewPost`.

### 케이스 6 — Tiptap 마운트 지점 2곳 (create / edit) 동기화

**증상**: 새 포스트 에디터와 편집 에디터가 각각 `_openPostEditor` / `_editPost` 에 분리되어 있어, 툴바 버튼 추가 시 한쪽만 고쳐 누락되는 risk 가 프로덕션 `/dreampath` 의 "Tiptap 4-spot rule" 과 동일하게 반복.
**원인**: v2 는 production 의 6 spot (createPost / editPost / replyToPost / createNote / editNote / replyToNote) 중 지금은 create / edit 2 곳만 구현했지만 구조적으로 같은 함정.
**수정**: `_initTiptap` 위에 케이스 스터디 주석 고정. 툴바 버튼·extension 추가 시 **두 함수 모두** 업데이트하는 것을 grep 루틴으로 강제.
**교훈**: Tiptap 마운트는 Dreampath 에서 영구 risk 영역. 새 기능을 한 곳에 넣을 때마다 "다른 마운트 지점은?" 을 체크.
**code_refs**: `js/dreampath-v2.js` `_initTiptap`, `_openPostEditor`, `_editPost`.

### 케이스 7 — 파일 용량 제한: per-file vs total

**증상**: 사용자가 "최대 10개, 총 100MB" 를 요구. 서버 `upload.js` 는 **파일당** 100MB 만 검사. 사용자 기대는 10개 합쳐서 100MB.
**원인**: 프로덕션 `/dreampath` 는 "5개 / 파일당 100MB" 규약이었고 서버가 파일당만 검증. 총량 검사 책임이 불분명.
**수정**: 프론트 `_handlePickerChange` 에서 `MAX_FILES = 10` + `MAX_TOTAL_BYTES = 100 * 1024 * 1024` 이중 검증. 초과 시 해당 파일 skip + 토스트. 서버는 그대로 per-file 만 검증.
**교훈**: **서버가 per-file cap, 프론트가 total cap** 의 이중 방어. 프론트에서 먼저 차단하되, 악의적 클라이언트에 대비해 서버도 최소 per-file 은 유지.
**code_refs**: `js/dreampath-v2.js` `_handlePickerChange`, `_uploadPending`.

### 케이스 8 — 모달을 우측 드로어로 만들었더니 "이건 모달이 아니다"

**증상**: v2 초안에서 모달을 `position: fixed; right: 0; top: 0; bottom: 0; width: 720px;` 우측 드로어로 구현. 사용자 피드백 "모달로 띄워야지 우측에 띄우는게 아니라".
**원인**: ERP 도구 (Linear, Jira 등) 가 우측 드로어를 애용해 관성으로 채택. 하지만 Dreampath 는 모달 중심 UX (확인 → 실행 → 닫기) 라 드로어는 맥락상 이질적.
**수정**: `.dp-modal` 을 중앙 정렬 dialog 로 복귀. `.dp-modal-backdrop` 이 flex container 로 center alignment.
**교훈**: **디자인 시스템 컴포넌트는 이 제품의 UX 관성에 맞춰 결정.** 업계 트렌드만 보고 결정하지 않는다. 사용자 기대치 반영 우선.
**code_refs**: `dreampath-v2.html` `.dp-modal` / `.dp-modal-backdrop` CSS.

### 케이스 9 — 페이지 `max-width: 1600px` 로 고정 → 오른쪽 공백

**증상**: 대형 모니터에서 Team Boards / Contacts / Versions 가 오른쪽에 빈 공간 남고 콘텐츠가 가운데 모임. 사용자 피드백 "횡으로 꽉 채웠으면 좋겠어 채우다 마는게 아니라".
**원인**: `.dp-page { max-width: 1600px; }` 로 시각적 중심 이동 방지하려 했으나, ERP 테이블의 정보 밀도를 희생.
**수정**: `max-width` 제거, `width: 100%` 만. 사이드바 (232px) 이후 모든 가로폭 채움.
**교훈**: **ERP 는 정보 밀도 최대화가 우선.** "pretty narrow center" 는 브로셔 사이트에는 맞지만 운영 도구에는 부적절.
**code_refs**: `dreampath-v2.html` `.dp-page` rule.

### 케이스 10 — `DATA` 상수 vs 실 API 의 데이터 shape 불일치

**증상**: Phase 3 배선 전에 데모 `DATA.posts.notice` / `DATA.tasks` 로 UI 작성 → 실 API 는 `announcements` 슬러그 + 다른 필드 (author_id 등) 를 반환 → 배선 후 `_renderAnnouncementsPanel` 등이 빈 상태 / 이상 값으로 렌더.
**원인**: 데모 데이터 객체 필드 이름을 개발자 편의로 짓고 (notice 등), API 레퍼런스와 대조 안 함.
**수정**: Phase 3.2 배선 시점에 모든 데모 필드를 API shape 에 맞게 교정. DATA 는 아직 일부 남아있지만 API 로 대체 가능한 곳은 모두 교체. 잔존 DATA 는 Phase 4 cutover 이전에 완전 제거 예정.
**교훈**: **데모 데이터 작성 시 API spec 을 먼저 고정.** shape mismatch 는 UI 전체를 다시 고쳐야 할 수 있음 — 데모는 API 의 부분 집합으로만.
**code_refs**: `functions/api/dreampath/home.js` 의 case study 주석, `js/dreampath-v2.js` 의 현재 남은 `DATA` 참조 (향후 제거 대상).

---

## 2026-04-24 · D

### v01.040.00 (feature) — Dreampath 홈 전면 개편

**국문 요약**
홈 화면을 모바일 접근성을 최우선으로 전면 개편. Today/Week 요약 스트립 · 미확인 변경 표시 · 검색 결과 타입별 그룹화 · 홈에서 바로 할 일 상태 전환 · 내 승인 대기 카드 5개 기능 추가. BP미디어 톤앤매너로 그레이스케일 neutrals 토큰 이식 + 새 로고 SVG 적용 + 전역 키보드 위임으로 인라인 onclick 구조를 유지하면서 WCAG 2.1 AA / 3.0 APCA 기준 충족.

**English Summary**
Full home redesign with mobile accessibility as the top priority. Added five new home features: Today/Week summary strip, unread indicator for recent changes, typed search-result grouping, inline task status toggle, and my pending-approvals card. Imported BP Media grayscale neutral tokens, adopted the new logo SVG, and installed a global keyboard delegate so inline onclick structure is preserved while meeting WCAG 2.1 AA / 3.0 APCA targets.

**변경 상세 / Changes**

- `functions/api/dreampath/home.js` — `today_summary`, `events_current_month`, `pending_approvals` 세 필드 추가. 현재 월 이벤트 번들로 홈 최초 페인트의 `/events?month=` 별도 왕복 제거.
- `dreampath.html` — BP-style grayscale 토큰 (`--gray-900`~`--gray-100`), `--touch-min`, `--focus-ring` 추가. `--text-3` #8A9FAF → #5A6B77 (APCA Lc 45 → 65). Today strip / 승인 카드 / unread dot / task quick button / 검색 그룹 CSS 신설. Skip link, 사이드바 SVG mask 아이콘 컨테이너 추가.
- `js/dreampath.js` — 전역 `keydown` 리스너 (`Enter`/`Space` → click), `renderTodaySummary`, `renderPendingApprovals`, `_homeTaskQuick`, 검색 그룹화 renderer, recent unread 추적 (`localStorage.dp_home_last_seen_at`), `_recentItemHtml` unread 표시.

**교훈 / Lessons**

- "홈 = 가장 처음 보는 화면" 이므로 기능 추가보다 접근성 기본값 (대비, 터치 타겟, 키보드 경로) 을 먼저 확보.
- `_homeTaskQuick` 초안에 `PATCH /tasks` 로 썼다가 `tasks.js` 가 `PUT` 만 구현한 것을 확인하고 수정. → 새로운 frontend helper 작성 전 backend 메서드 확인 루틴 필요. ([DREAMPATH.md](DREAMPATH.md) Section 12 B4 의 "PATCH 아닙니다" 주석 배경)

**관련 커밋 / Commits**
- `843b7a5` — Dreampath 홈 전면 개편 — 모바일 접근성 우선 + B1~B5 기능 + 새 로고

**code_refs**
- [js/dreampath.js](js/dreampath.js) — `init()` 전역 keydown delegator
- [js/dreampath.js](js/dreampath.js) — `renderTodaySummary`, `renderPendingApprovals`, `_homeTaskQuick`, `_recentItemHtml`
- [functions/api/dreampath/home.js](functions/api/dreampath/home.js) — `events_current_month`, `pending_approvals` 쿼리

---

## 2026-04-24 · C

### 디자인 시스템 도입 + 문서 완전 분리

**국문 요약**
사용자가 DreamPath Design System (18개 스트로크 아이콘 + 6종 로고 변형) 을 제공. Dreampath 에 없는 아이콘 (home, megaphone, note, phone, settings, user-single, users-admin) 은 동일 톤앤매너로 신규 생성. 사이드바 이모지를 전부 SVG 아이콘으로 교체 (CSS `mask-image` 로 `currentColor` 상속). 동시에 `CLAUDE.md` Section 5 를 `DREAMPATH.md` 포인터로 슬림화하고, 버전 히스토리 / 케이스 스터디를 `DREAMPATH-HISTORY.md` 로 완전 분리. 섹션 기호(section-sign 글리프, U+00A7) 도 문서에서 전면 폐기 — "Section N" 표기로 대체.

**English Summary**
User supplied a DreamPath Design System (18 stroke icons + 6 logo variants). Generated additional icons (home, megaphone, note, phone, settings, user-single, users-admin) in the same tone and manner for Dreampath-specific needs. Replaced all sidebar emoji with SVG icons rendered via CSS `mask-image`, inheriting `currentColor`. Slimmed `CLAUDE.md` Section 5 to a pointer to `DREAMPATH.md`, and split version history / case studies out to `DREAMPATH-HISTORY.md`. Fully retired the section-sign glyph (U+00A7) from Dreampath documentation — replaced with "Section N" prose everywhere.

**변경 상세 / Changes**

- `img/dreampath/icons/*.svg` — 18 원본 + 7 신규 아이콘.
- `img/dreampath/favicon.svg`, `logo-dreampath-app-icon.svg`, `logo-dreampath-mono-black.svg`, `logo-dreampath-mono-white.svg`, `logo-dreampath-horizontal-light.svg` — 로고 변형 5종 적재.
- `dreampath.html` — 사이드바 12개 nav 아이콘을 `<span class="dp-nav-icon-svg" style="--dp-icon:url(...)">` 로 교체. favicon 32×32 전용 변형으로, apple-touch-icon app-icon 변형으로 교체.
- `js/dreampath.js` `_refreshSidebar` — 동적 생성 board / team nav 도 SVG mask 아이콘.
- `DREAMPATH.md` 재작성 — 개발 규칙만 남기고, Section 14 (Identity) 아이콘 디자인 스펙 + Section 17 (케이스 스터디 코드 주석 규칙) 신설.
- `DREAMPATH-HISTORY.md` 신설 — 이 파일.
- 모든 section-sign (U+00A7) 글리프 제거 → "Section N" 표기.

**교훈 / Lessons**

- 아이콘 컴포넌트는 `<img>` 가 아닌 `mask-image` 로 렌더해야 `currentColor` 상속이 자연스럽고 active state 에서 asset swap 불필요.
- 신규 아이콘이 필요할 때 외부 라이브러리 (lucide, heroicons 등) 로 끌어오면 브랜드 일관성이 깨진다. 반드시 디자인 시스템 톤 (24×24 viewBox, stroke 1.75, currentColor, round cap/join) 으로 손수 작성.
- 문서를 분리할 때 "규칙" 과 "이력" 을 섞으면 규칙이 계속 길어지고 AI가 최신 이력을 찾기 어려워진다. 분리 + 상호 참조 구조가 더 강함.

**code_refs**
- [dreampath.html](dreampath.html) — `.dp-nav-icon-svg` CSS rule
- [dreampath.html](dreampath.html) — 사이드바 12개 nav 항목의 `--dp-icon` 변수
- [js/dreampath.js](js/dreampath.js) — `_refreshSidebar` 내 동적 nav 생성부

---

## 2026-04-24 · B

### Dreampath 홈 UX · 접근성 검토 (계획)

**국문 요약**
Dreampath 홈의 기능적 결함 / 접근성 결함을 체계적으로 검토. Explore 에이전트 2개 병렬로 현재 구조 조사 + BP미디어 접근성 기준 비교. 결과: 버그 7건 (A1~A7), 추가 제안 5건 (B1~B5) 식별. BP미디어의 WCAG 3.0 APCA Lc 기준 / 그레이스케일 토큰 / 접근성 6원칙을 Dreampath 에 이식 가능 판단. CUFS 팔레트와 충돌 없음.

**English Summary**
Systematic review of Dreampath home for functional and accessibility defects. Ran two Explore agents in parallel: one to map current home structure, another to extract BP Media accessibility standards. Outcome: identified 7 bugs (A1-A7) and 5 proposed additions (B1-B5). Concluded that BP Media's WCAG 3.0 APCA Lc thresholds, grayscale tokens, and six accessibility principles can be adopted without colliding with the CUFS palette.

**식별된 버그 / Identified Bugs**

| ID | 증상 | 원인 |
|---|---|---|
| A1 | 메타 · placeholder 텍스트 대비 부족 | `--text-3` Lc ~45 (본문·콘텐츠 기준 미달) |
| A2 | 키보드 조작 불가 | 17개+ 인터랙티브 `<div>` 가 role/tabindex 없이 `onclick` 만 |
| A3 | 이모지 스크린리더 중복 낭독 | `aria-hidden` 미적용 |
| A4 | skip-link 없음 | body 상단 점프 수단 부재 |
| A5 | 포커스 인디케이터 없음 | `:focus-visible` 스타일 비정의 |
| A6 | calendar 데이터 경로 이원화 | `home.js` 와 `/events?month=` 별개 왕복 |
| A7 | 칩 · 배지 색상 인라인 HEX | 토큰화 안 됨 |

**교훈 / Lessons**

- "기능 추가" 와 "접근성 기본값" 이 동시에 논의될 때 순서: **접근성 먼저**. 접근성은 나중에 얹기가 더 어렵다 (키보드 경로를 위해 HTML 구조를 리팩터해야 하는 경우가 많음).
- 인라인 `onclick` 을 유지하고 싶어도 키보드 접근은 별도로 확보 가능하다. 전역 `keydown` 위임이 그 답 → Section 2.3 규칙화.

---

## 2026-04-24 · A

### 🚨 CSP 회귀 · 사이드바 전체 마비 (P0) 🚨

**국문 요약**
공개 사이트의 CSP 가 `nonce + 'strict-dynamic'` 으로 강화되면서, Dreampath (`/dreampath`) 의 인라인 `onclick="DP.*()"` 전체가 **무반응** 이 되던 P0 회귀. 브라우저가 nonce 존재 시 `'unsafe-inline'` 을 무시하는 CSP3 규약 때문. `functions/_middleware.js isLegacyInlinePath()` 가 `/admin`, `/kms` 만 legacy 예외로 처리하고 `/dreampath` 를 누락했던 것이 직접 원인.

**English Summary**
After the public site CSP was tightened to `nonce + 'strict-dynamic'`, **every** inline `onclick="DP.*()"` in Dreampath (`/dreampath`) went unresponsive — a P0 regression. Under CSP3, browsers ignore `'unsafe-inline'` whenever a nonce is present, so the entire sidebar, toolbar, and modal trigger set silently failed. Root cause: `isLegacyInlinePath()` in `functions/_middleware.js` allowlisted only `/admin` and `/kms`, not `/dreampath`.

**증상 / Symptoms**
- 사이드바 클릭 무반응 (네비게이션 실패).
- 모달 트리거 무반응.
- 캘린더 날짜 클릭 무반응.
- 콘솔: `Refused to execute inline event handler because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-...' 'strict-dynamic' ..."`.

**원인 / Root Cause**
1. 2026-04-24 직전 커밋 (244da09 등) 에서 공개 사이트에 CSP 강화 정책 적용. 미들웨어가 응답에 nonce 주입.
2. `isLegacyInlinePath()` 는 `/admin`, `/kms` 와 그 하위 경로만 legacy `'unsafe-inline'` 경로로 편입.
3. Dreampath 는 CLAUDE.md 설계상 `DP.*` 인라인 `onclick` 전면 사용 (지금까지 문제 없던 영역) 이었지만, 새 CSP 는 이 구조와 양립 불가능.

**수정 / Fix**

`functions/_middleware.js` `isLegacyInlinePath()` 에 `/dreampath`, `/dreampath.html` 추가. Admin / KMS 와 동일하게 legacy `'unsafe-inline'` CSP 경로로 편입.

```diff
 function isLegacyInlinePath(pathname) {
   if (!pathname) return false;
   if (pathname === '/admin' || pathname === '/admin.html') return true;
   if (pathname === '/kms' || pathname === '/kms.html') return true;
+  if (pathname === '/dreampath' || pathname === '/dreampath.html') return true;
   if (pathname.startsWith('/admin/') || pathname.startsWith('/kms/')) return true;
   return false;
 }
```

**검증 / Verification**

배포 후 `curl -sI https://gilwell-media.pages.dev/dreampath | grep -i content-security-policy` 로 `'unsafe-inline'` 포함 확인. 공개 사이트 `/` 는 그대로 `'nonce-...' 'strict-dynamic'` 유지 확인 (Dreampath 한정 예외).

**교훈 / Lessons**

1. **공용 미들웨어 변경은 모든 인라인 핸들러 사용 경로에 영향을 준다**. `_middleware.js` 수정 시 `/admin`, `/kms`, `/dreampath` 모두 확인해야 한다.
2. **CSP3 는 nonce 존재 시 `'unsafe-inline'` 을 무시한다**. `_headers` 에 `'unsafe-inline'` 이 있어도, 미들웨어가 nonce 붙이면 무효화된다.
3. **Dreampath 는 `dp_versions` 가 아닌 `VERSION` 에 영향받는 경우가 있다** (공용 인프라 변경일 때). 이 구분이 향후 비슷한 사고를 가장 빨리 추적하는 힌트.
4. **관리자 인증 필수 + X-Frame-Options: DENY + 외부 inline 주입 표면 없음** → Dreampath 가 legacy `'unsafe-inline'` 경로에 머무는 것은 보안상 문제 없음. 공개 사이트와 격리되어 있기 때문.

**영향 / Blast Radius**
- 사이트 버전 00.131.06 → 00.131.07 (hotfix).
- `dp_versions` 테이블에는 **등록되지 않음** (공용 인프라 변경이라 `./deploy.sh` 경로 아님) — 이 사실이 "버전 기록이 업데이트 안 된 것 같다" 는 오해를 낳았고, 그 결과 Section 16 (Version Policy) 와 본 문서 분리 결정으로 이어짐.

**재발 방지 / Prevention**

- [functions/_middleware.js](functions/_middleware.js) `isLegacyInlinePath()` 에 2026-04-24 케이스 스터디 주석 고정 (DREAMPATH.md Section 17 포맷).
- [DREAMPATH.md](DREAMPATH.md) Section 10 "CSP: `/dreampath` 레거시 경로" 신설 — 새 경로 추가 시 `isLegacyInlinePath()` 에도 추가하라는 규칙.
- Critical Prohibitions 12번 항목에 "프로덕션 회귀는 Section 17 주석 + 본 파일 이력 동시 기록" 명문화.

**관련 커밋 / Commits**
- `111415d` — hotfix: Dreampath 사이드바 전체 기능 정지 회귀 복구 (00.131.07)

**code_refs**
- [functions/_middleware.js](functions/_middleware.js) `isLegacyInlinePath()` — 재발 방지 주석
- `_headers` — CSP 기본 정책은 여기 있지만 미들웨어가 override. 둘 다 확인 필수.

---

## 과거 이력 / Earlier History

v01.039.x 이전 버전 기록은 D1 `dp_versions` 테이블 또는 `/dreampath` 사이드바
"Dev Rules" 메뉴를 참조합니다. Git 로그로는 다음 명령:

```bash
git log --oneline -- 'dreampath.html' 'js/dreampath.js' 'functions/api/dreampath/**'
```

이 문서는 2026-04-24 부터의 이력을 AI 관점에서 세밀하게 기록합니다. 이전 이력은
향후 독립 도메인 이전 시점에 이 포맷으로 역소급 정리 예정.

---

## Entry Template (새 이력 추가 시)

새 엔트리는 **파일 최상단 인덱스 + 그 아래 본문** 에 추가합니다. 날짜 역순.

```markdown
## YYYY-MM-DD · X

### vXX.XXX.XX (type) — 제목 / Title

**국문 요약**
...

**English Summary**
...

**변경 상세 / Changes**
- ...

**교훈 / Lessons**
- ...

**관련 커밋 / Commits**
- `<short-sha>` — ...

**code_refs**
- [파일:라인](경로) — 재발 방지 주석 위치
```

Case study 성격 (회귀 / 비자명 결정) 이면 **증상 / 원인 / 수정 / 검증** 4개
섹션을 추가로 포함합니다 (2026-04-24 A 참조).
