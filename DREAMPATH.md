---
tags: [ai-guide, dreampath, entry-point]
aliases: [Dreampath AI Guide, Dreampath Dev Rules, Dreampath AGENTS]
scope: dreampath
sibling: DREAMPATH-HISTORY.md
---

# DREAMPATH.md — Dreampath AI 작업 가이드 (Dev Rules)

> [!important] 이 파일은 Dreampath **개발 규칙**의 단일 원본입니다
> Dreampath 관련 **모든** 작업 — 기능 추가, 버그 수정, API 변경, CSS 조정,
> 접근성 개선, 배포 — 은 이 문서를 정식 원본으로 삼습니다. `CLAUDE.md`는
> Site / Admin / KMS 전용이며 Dreampath 작업 시 "section 5"에서 여기로
> 리다이렉트됩니다.
>
> **과거 이력 / 케이스 스터디는 [DREAMPATH-HISTORY.md](DREAMPATH-HISTORY.md)** 에
> 별도로 적재합니다. 이 파일은 "**지금 지켜야 할 것**" 만 담습니다.
>
> **왜 분리했는가**: Dreampath 는 별도 도메인 독립 예정. 지금부터 문서 경계를
> 잘라 두면, 이전 시점에 이 파일을 신규 저장소로 옮기는 것만으로 가이드
> 전체가 따라옵니다.

---

## Section 0 — 작업 전 필수 확인

### 0.1 경로 판별

Dreampath 범위인지 먼저 확인합니다.

| 경로 | Dreampath 여부 |
|---|---|
| `dreampath.html` | Dreampath |
| `js/dreampath.js` | Dreampath |
| `functions/api/dreampath/**` | Dreampath |
| `img/dreampath/**` | Dreampath |
| `DREAMPATH.md`, `DREAMPATH-HISTORY.md` | Dreampath |
| `functions/_middleware.js` | 공용 인프라 (Site 배포 경로) |
| `functions/_shared/**` | 공용 인프라 |
| `_headers`, `wrangler.toml` | 공용 인프라 |

**원칙**: Dreampath 기능이 영향을 받더라도 파일 자체가 공용 인프라에 있으면
`CLAUDE.md` 공통 인프라 규칙 (`VERSION` bump + changelog) 을 따릅니다.
`dp_versions` 가 아니라 `VERSION` 에 기록됩니다. 이 경계를 놓치면 2026-04-24
CSP 회귀가 재발합니다 (DREAMPATH-HISTORY.md 2026-04-24 A 참조).

### 0.2 Git 동기화

```bash
git fetch origin
git status
git log --oneline origin/main..HEAD
git log --oneline HEAD..origin/main
```

diverged 면 사용자 선택 요청 후 진행. 묵시적 처리 금지.

### 0.3 P0 이슈 선행 처리

`homepage_issues` 테이블에 `status IN ('open','monitoring')` 이면서
`severity IN ('high','critical')` 인 건이 있으면 신규 작업 전에 해결합니다.

---

## Section 1 — 아키텍처 요약

| Layer | Stack |
|---|---|
| Hosting | Cloudflare Pages (빌드 없음) |
| API | Cloudflare Workers Functions (`functions/api/dreampath/*`) |
| DB | Cloudflare D1 (binding `env.DB`, 접두사 `dp_`) |
| Storage | R2 버킷 `POST_IMAGES` (공용 버킷 재사용) |
| Auth | `dp_session=1` httpOnly 쿠키 1h TTL + localStorage profile + client idle countdown |

- Wrangler 실행 전: `export PATH="/opt/homebrew/bin:$PATH"`.
- 인증 미들웨어: `functions/api/dreampath/_middleware.js`.
- 비밀번호: PBKDF2 100k + safeCompare + 10회 실패 lockout.
- 클라이언트 유휴 타이머: `js/dreampath.js` 가 `localStorage.dp_session_expires_at`
  로 카운트다운을 유지합니다. `click` / `touchstart` 는 매번 남은 시간을
  **즉시 1시간으로 리셋**하고, `keydown` / `scroll` 은 15초 throttle +
  잔여 30분 미만일 때만 연장합니다. 5분 미만이면 연장 모달, 0이면 자동 로그아웃.

**JWT 페이로드 `data.dpUser`**: `{ uid, username, role, name }`
`department` 는 JWT 에 포함되지 않습니다. 팀 보드 판별 시 반드시 DB 재조회:

```sql
SELECT department FROM dp_users WHERE id = ?
```

---

## Section 2 — Frontend: IIFE 단일 모듈

### 2.1 구조

```javascript
const DP = (() => {
  // state, helpers, render, API
  return { init, login, logout, navigate, /* ... */ };
})();

document.addEventListener('DOMContentLoaded', () => DP.init());
```

규칙:
- **IIFE 를 분리하거나 모듈화하지 않습니다.** 설계 원본입니다. 깨면 인라인 onclick 전체가 참조를 잃습니다.
- 모든 public API 는 `return {}` 블록에 포함됩니다.
- 인라인 이벤트: `onclick="DP.method()"` — `DP.` 프리픽스 필수.
- 툴바 버튼은 `onmousedown` 으로 (focus 유지).

### 2.2 왜 인라인 onclick 을 유지하는가

공개 사이트는 event delegation 으로 전환했지만 Dreampath 는 내부 전용 + 관리자
인증 필수 + `X-Frame-Options: DENY` 이므로 외부 inline 주입 표면이 없습니다.
리팩터 ROI 가 낮고, IIFE 단일 모듈 특성상 `DP.*` 프리픽스가 명확해 유지보수성이 높습니다.

이 결정은 `functions/_middleware.js` 의 `isLegacyInlinePath()` 에 `/dreampath`,
`/dreampath.html` 을 등록해 CSP 호환을 확보합니다. Section 10 참조.

### 2.3 전역 키보드 위임 (표준)

`DP.init()` 에서 전역 `keydown` 리스너를 설치합니다:

- `Enter` / `Space` → `role="button"` 이거나 하기 legacy 클래스를 가진 요소에서 `target.click()` 발화.
- 대상 클래스: `dp-nav-item`, `dp-preview-item`, `dp-search-hit`, `dp-home-item`, `dp-today-chip`, `dp-approval-card`, `dp-task-quick-btn`, `dp-cal-day`, `dp-cal-event-strip`, `dp-cal-bar`, `dp-cal-more`.
- 네이티브 `<button>`/`<a>`/`<input>`/`<textarea>`/`<select>` 는 제외해 이중 발화 방지.
- 신규 인터랙티브 `<div>` 생성 시 반드시:
  ```html
  <div role="button" tabindex="0" aria-label="..." onclick="DP.foo()">
  ```

---

## Section 3 — CSS: 인라인 single-source

### 3.1 위치

Dreampath CSS 는 전부 `dreampath.html` 의 `<style>` 태그 안에만 존재합니다.
별도 `.css` 파일 없음.

### 3.2 Token 계층

**브랜드 (CUFS) — primary**

```
--sidebar-bg   #002D56   CUFS Navy
--accent       #146E7A   CUFS Green
--accent-mid   #1A9BAA   lighter teal
--gold         #8D714E   CUFS Gold
```

**중립 (BP미디어 준용 neutrals)**

```
--gray-900  #030303   Lc 107.7   강조 텍스트
--gray-700  #3F3F3F   Lc 96.2    보조 텍스트
--gray-500  #6B7B85   Lc ~60     메타 / 아이콘
--gray-300  #C4C4C4   Lc 33.5    구분선 (텍스트 금지)
--gray-100  #EBEBEB   Lc 11.1    배경 tint (텍스트 금지)
```

**접근성 토큰**

```
--touch-min   44px              WCAG 2.5.5 터치 타겟
--focus-ring  box-shadow        포커스 링 통일
```

**규칙**
- 리터럴 HEX 금지. 신규 색은 `:root` 에 토큰으로 추가 후 참조합니다.
- 본문·콘텐츠 텍스트는 `--text`, `--text-2`, `--text-3` 만 사용.
- `--text-3` 는 현재 `#5A6B77` (APCA Lc ~65). 이 값을 내리려면 대비 재검증 필수.
- 파스텔·spot 색은 배경·일러스트 전용. 본문 텍스트 금지.

### 3.3 반응형

- `@media (max-width: 900px)`: 홈 그리드 1열, 사이드바 200px.
- `@media (max-width: 640px)`: 모바일 topbar 노출 + 사이드바 drawer.
- `@media (max-width: 520px)`: today-strip 2열, 검색바 세로.
- `@media (prefers-contrast: more)`: 텍스트 토큰 강화.
- `@media (prefers-reduced-motion: reduce)`: 애니메이션 0.001ms.

---

## Section 4 — Rich Text: Tiptap 4-spot rule

### 4.1 CDN

```html
<script type="module">
  import { Editor } from 'https://esm.sh/@tiptap/core@2';
  import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2';
  // table extensions...
  // window.__DP_Tiptap = { Editor, StarterKit, Table, ... }
  // window.dispatchEvent(new CustomEvent('tiptap-ready'));
</script>
```

CDN URL / 버전은 함부로 바꾸지 않습니다. SRI 리스크는 CLAUDE.md 13.1.2.

### 4.2 초기화 헬퍼

`_waitForTiptap(cb)` — Tiptap 로드 완료까지 대기.

### 4.3 4곳 동시 갱신 (Critical Rule)

에디터는 다음 **4 곳** 에서 탑재됩니다. 새 extension 추가 시 4곳 **모두** 갱신 필수:

1. `createPost`
2. `editPost`
3. `createNote`
4. `editNote`

각 위치에서:
- `import` 추가
- `_initTiptap()` 호출 위치 확인
- `_execTiptapCmd()` 케이스 추가
- 툴바 HTML 에 버튼 추가

한 곳만 빠지면 해당 경로에서만 조용히 기능이 죽습니다. 코드 리뷰 시 4곳 grep 필수.

### 4.4 뷰어 살균

모든 HTML 출력은 **DOMPurify** 경유. `cdnjs` CDN.
사용자 입력을 `innerHTML` 로 직접 넣는 것 금지.

---

## Section 5 — Backend API 레이아웃

| 파일 | 역할 |
|---|---|
| `_middleware.js` | 인증 검증, `data.dpUser` 주입 |
| `auth.js` | 로그인 / 로그아웃 / 세션 연장 |
| `me.js` | 현재 사용자 |
| `home.js` | 홈 데이터 (alerts, my_tasks, recent_changes, today_summary, events_current_month, pending_approvals) |
| `posts.js` | 게시글 CRUD + 접근제어 |
| `boards.js` | 게시판 CRUD (동적 관리) |
| `events.js` | 캘린더 이벤트 + 반복 일정 |
| `approvals.js` | 회의록 다중 승인 (`approver_name` 기준 투표 / `?mine=1` 내 표 조회) |
| `notes.js` | Notes & Issues CRUD |
| `tasks.js` | 할 일 CRUD (PUT 으로 상태 전환 — PATCH 아님) |
| `comments.js` | 게시글 댓글 |
| `users.js` | 사용자 관리 (admin only) |
| `departments.js` | 부서 관리 |
| `contacts.js` | 프로젝트 팀 연락처 |
| `search.js` | 통합 검색 |
| `upload.js` | 파일 업로드 |
| `milestones.js`, `resources.js` | 부가 기능 |
| `versions.js` | `dp_versions` 조회 |

공통 응답 규약: JSON + `Cache-Control: no-store` + 에러 시 `{ error: "..." }`.

---

## Section 6 — Database: `dp_*` 테이블

### 6.1 규칙

- **모든 Dreampath 테이블은 `dp_` 접두사.**
- 기존 컬럼 **삭제·타입 변경 금지**. `ALTER TABLE ADD COLUMN` 만 허용.
- 스키마 변경은 마이그레이션 계획 문서화 후 진행.
- 값은 `.bind(...)` 로만 전달. 컬럼명·PRAGMA 만 interpolation 허용.

### 6.2 핵심 테이블

| 테이블 | 주요 컬럼 |
|---|---|
| `dp_users` | `id, username, password_hash, department, role, name` |
| `dp_boards` | `slug, title, board_type ('board'\|'team')` |
| `dp_board_posts` | `id, board, title, content, author_id, author_name, created_at, updated_at, pinned, approval_status` |
| `dp_post_history` | `post_id, editor_name, edit_note, edited_at` |
| `dp_post_comments` | `id, post_id, parent_id, author_name, content, created_at` |
| `dp_post_approvals` | `post_id, approver_id (NOT NULL), approver_name, status, voted_at, override_by, override_note` |
| `dp_tasks` | `id, title, assignee, status, priority, due_date, related_post_id, source_type, source_ref_id, updated_at` |
| `dp_notes` | `id, title, type, status, priority, updated_at` |
| `dp_decisions` | `id, title, decision, status, decided_by, decision_date, next_review_date, related_post_id` |
| `dp_events` | `id, title, start_date, end_date, start_time, end_time, type, recurrence_type, recurrence_end` |
| `dp_event_history` | `event_id, editor_name, edit_note, edited_at` |
| `dp_versions` | `version, aa, bbb, cc, type, description, released_at` |

---

## Section 7 — Board 시스템

### 7.1 Board types

- `board`: 일반 게시판 (공지 / 문서 / 회의록 등). 슬러그 자유.
- `team`: 팀 전용 게시판. 슬러그는 `team_xxx` 규약.

### 7.2 접근 제어

| 역할 | General Board | Team Board |
|---|---|---|
| admin | 전체 읽기 / 쓰기 | 전체 읽기 / 쓰기 |
| 일반 유저 | 읽기만 | 자기 팀만 읽기 / 쓰기 |

### 7.3 Team 매칭 로직

```javascript
function _deptMatchesBoard(department, board) {
  if (!board.startsWith('team_')) return false;
  const country = board.slice(5);
  return department.toLowerCase().includes(country);
}
```

### 7.4 API Access Matrix (posts)

| Method | Admin | 일반 유저 |
|---|---|---|
| GET 목록 | 전체 | Team 보드는 자기 팀만 |
| GET 단건 | 전체 | Team 보드는 자기 팀만 |
| POST | 모든 게시판 | Team 자기 팀만, 나머지 403 |
| PUT | 모든 게시글 | `author_id = uid` 본인 글만 |
| DELETE | 전체 | 불가 |

---

## Section 8 — 회의록 승인

### 8.1 테이블: `dp_post_approvals`

`approver_id` NOT NULL. INSERT 시 반드시 값 제공.

### 8.2 로직

- 승인자 중 **과반수 초과** 가 `approved` 되면 post 의 `approval_status = 'approved'`.
- `approved` 상태 post 는 content 수정 불가 → **HTTP 423 LOCKED** 반환.
- 프론트가 423 수신 시 잠금 안내 표시.
- 승인자 추가 / 제거 후 자동 재계산 (`posts.js` PUT 경로).
- 관리자 override: **2026-04-01 이전** 생성된 회의록만 허용.

### 8.3 홈에서의 노출 (B5)

`home.js` 가 현재 사용자가 approver 이면서 `status='pending'` 인 건을 모아
`pending_approvals` 배열로 반환. 프론트 `renderPendingApprovals()` 가 홈 최상단에
카드 형태로 출력. 카드 클릭 시 `viewPost()`.

- `pending_approvals[]` shape:
  `{ post_id, approver_name, title, board, post_created_at }`
- 프론트 승인 버튼은 `_displayName()` 을 다시 계산하지 말고,
  **서버가 내려준 `approver_name` 을 그대로** `approvals?post_id=&approver=...`
  에 전달합니다. `dp_post_approvals.approver_name` 은 display name 또는 username
  어느 형태로든 저장될 수 있기 때문입니다.
- `approvals.js` PUT 는 `LOWER(approver_name)` 으로 case-insensitive 매칭합니다.
  즉, caller 는 저장된 문자열을 넘기고 서버가 대소문자 차이만 흡수합니다.

---

## Section 9 — Calendar

### 9.1 이벤트 필드

`id, title, start_date, end_date, start_time, end_time, type, description,
recurrence_type, recurrence_end, created_at`

`type`: `general | deadline | meeting | milestone`.

### 9.2 반복 일정

- `recurrence_type`: `daily | weekly | biweekly | monthly | yearly`.
- `recurrence_end` 로 종료일 지정.
- 월별 조회 시 서버에서 반복 인스턴스 자동 확장 (최대 60회).

### 9.3 Home 번들 (왕복 최소화)

`home.js` 는 **현재 월** 이벤트를 `events_current_month` 에 포함해 반환합니다.
프론트 `loadHome()` 은 현재 월 조회 시 번들 재사용, 다른 월 이동할 때만
`/events?month=YYYY-MM` fallback 호출. 홈 최초 페인트에서 별도 왕복 제거.

필드 shape 는 `/events` API 와 동일하게 유지해야 합니다 (`renderCalendar()` 가 양쪽 모두 소비).

---

## Section 10 — CSP: `/dreampath` 레거시 경로

### 10.1 왜 예외인가

`functions/_middleware.js` 는 전 사이트에 `nonce + 'strict-dynamic'` CSP 를 적용합니다.
이 정책은 `'unsafe-inline'` 을 무시하므로 모든 인라인 `onclick` 이 차단됩니다.
Dreampath 의 `DP.*` 인라인 onclick 구조 (Section 2.2) 와 양립 불가능.

**해결책**: `isLegacyInlinePath()` 함수에 `/dreampath`, `/dreampath.html` 을 등록해
Admin / KMS 와 동일한 legacy `'unsafe-inline'` CSP 경로로 편입.

### 10.2 새 경로 추가 시

Dreampath 가 새 루트 경로를 노출하면 **그 경로도** `isLegacyInlinePath()` 에 추가합니다.
빠뜨리면 사이드바 전체가 죽는 회귀 발생 (DREAMPATH-HISTORY.md 2026-04-24 A).

### 10.3 공용 인프라 변경은 Site 배포

`functions/_middleware.js` 수정은 `./deploy.sh` 가 아니라 `scripts/deploy_production.sh`
경로로 배포됩니다. `VERSION` bump + changelog 필요. 절차는 `CLAUDE.md` Release &
Deploy Flow.

---

## Section 11 — Upload 제한

- 최대 **100MB / 파일**, 최대 **5개 / 게시글**.
- 차단 확장자: `exe, sh, bat, cmd, ps1, vbs, jar, app, dmg, pkg, msi, dll` 등.
- R2 업로드 → `POST_IMAGES` 버킷. 경로: `dreampath/{timestamp}_{name}`.

---

## Section 12 — Home UX Contract (B1~B5)

홈 화면의 기능 단위 계약. 추가 / 수정 시 이 목록 갱신 필수.

### B1 — Today / Week 요약 스트립

- 위치: 홈 최상단 (`#dp-today-strip`).
- 데이터: `home.js` → `today_summary` 객체
  ```
  { tasks_due_today, tasks_overdue, meetings_this_week,
    pending_approvals, high_priority_notes, today }
  ```
- 렌더: `renderTodaySummary(summary)` — 5개 chip.
- 각 chip: `role="button" tabindex="0"`, `DP.navigate('<target>')`.
- Tone 규칙: 값 > 0 일 때만 `alert` (빨강) / `warn` (노랑) / `info` (accent) 강조.
- `my_tasks` 는 전사 task 상위 N건을 프론트에서 거르는 방식이 아니라,
  **현재 사용자 assignee 기준으로 서버에서 직접 조회한 결과** 를 사용합니다.
  홈 통계(`tasks_due_today`, `tasks_overdue`, 진행률)도 이 slice 와 같은 소스를 씁니다.

### B2 — Recent Changes unread 표시

- 키: `localStorage.dp_home_last_seen_at`.
- 규칙: `item.created_at > last_seen_at` 인 항목에 `.dp-unread` 점 + sr-only "(새 항목)".
- 갱신 타이밍: 페인트 **1.2초 후** 최신 타임스탬프로 갱신 (첫 방문에도 점 렌더 보장).
- 홈 패널의 `Recent activity last 24h` 라벨은 literal contract 입니다.
  `home.js` 는 `dp_post_history`, `dp_event_history`, `dp_post_comments` 를
  각각 `datetime('now', '-1 day')` 이후만 집계해야 합니다.

### B3 — 검색 결과 그룹화

- `runHomeSearch()` 가 결과를 `post / comment / task / note / event` 5그룹으로 분리.
- 그룹당 최대 6건 + 초과 시 `+N more`.
- 각 그룹 `<section aria-label="... 검색 결과">`.
- 상세 라우팅: post/comment → `viewPost`, task → `viewTask`, note → `viewNote`, event → `viewEvent`.

### B4 — 인라인 Task 상태 전환

- `renderHomeAlerts` 의 my_tasks 카드에 "시작 / 완료 / 열기" quick 버튼.
- `_homeTaskQuick(id, newStatus)` — PUT `/api/dreampath/tasks?id=N`.
  **PATCH 가 아닙니다**. tasks.js 는 PUT 만 구현되어 있습니다.
- 성공 시 `loadHome()` 재호출 (Today strip + alerts 재계산).

### B5 — 내 승인 대기

- 데이터: `home.js` → `pending_approvals`.
- 조건: `dp_post_approvals.status='pending'` + `approver_name` 이 현재 사용자 이름 / 유저네임과 일치 + post 가 아직 `approved` 아님.
- 렌더: `renderPendingApprovals(list)` — 카드. 클릭 시 `viewPost()`.
- 액션: Review 는 `viewPost()`, Approve/Reject/Change 는 **현재 row 의 `approver_name`**
  을 그대로 넘겨 `_inlineApprove/_inlineReject/_revertMyVote` 를 호출합니다.
- Minutes 목록 / 상세 모달 / 홈 카드의 세 투표 진입점은 모두 같은 규칙을 써야 합니다.
- 빈 목록이면 컨테이너 자체 `.dp-hidden`.

---

## Section 13 — 접근성 Contract (A1~A5)

### A1 — 대비 (WCAG 3.0 APCA)

- 본문 `|Lc| 75+`, 콘텐츠 `60+`, 대형 `45+`, UI `30+`.
- 메타 텍스트는 `--text-3` (Lc ~65).
- 파스텔 · Fire Red · Ocean Blue 는 본문 텍스트 금지.

### A2 — 키보드 조작

- 인터랙티브 `<div>` 는 항상 `role="button" tabindex="0" aria-label="..."` + `onclick`.
- 전역 `keydown` 위임이 Enter / Space → click 변환 (Section 2.3).

### A3 — 스크린리더

- 장식 이모지 · 아이콘 SVG 는 `aria-hidden="true"`.
- 상태 메시지 영역은 `aria-live="polite"` (검색 결과, alerts, recent, 세션 타이머).
- 사이드바 `<nav aria-label="주 메뉴">`, 활성 항목 `aria-current="page"`.

### A4 — Skip link

- `<body>` 최상단에 `<a class="dp-skip-link" href="#dp-main">`.
- `<main id="dp-main">` 이 타겟.

### A5 — Focus

- `:focus-visible` 전역 정의 — `outline: 2px solid var(--accent-mid)` + `--focus-ring`.

### 모바일 추가 규칙

- `.dp-input` 모바일 `font-size: 16px` (iOS 자동 줌 방지), 데스크톱 14px.
- 터치 타겟 `min-height: var(--touch-min)` = 44px.
- 모바일 사이드바 열림: 첫 nav 항목 auto-focus. 닫힘: 햄버거로 복귀.
- 햄버거 `aria-controls`, `aria-expanded` 동기화.

---

## Section 14 — Identity: 로고 / 아이콘 / 파비콘

### 14.1 로고 변형 (`img/dreampath/`)

| 파일 | 용도 |
|---|---|
| `logo-mark.svg` | 컬러 마크 (120×120) — 로그인 / 사이드바 / 모바일 topbar |
| `logo-dreampath-app-icon.svg` | iOS 홈스크린 아이콘 (120×120 + 라운드 다크 배경) |
| `logo-dreampath-mono-black.svg` | 흑백 변형 — 인쇄 / 워터마크 |
| `logo-dreampath-mono-white.svg` | 흰색 변형 — 다크 배경용 |
| `logo-dreampath-horizontal-light.svg` | 가로 락업 (텍스트 + 마크) |
| `favicon.svg` | 32×32 브라우저 탭 전용 |

### 14.2 아이콘 시스템 (`img/dreampath/icons/`)

**디자인 스펙 (신규 생성 시 반드시 준수)**

```html
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 24 24" width="24" height="24"
     fill="none" stroke="currentColor"
     stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round"
     role="img" aria-label="...">
  <!-- paths -->
</svg>
```

- viewBox `0 0 24 24` 고정.
- `fill="none"` 기본, 포인트 요소만 `fill="currentColor"` 허용.
- `stroke="currentColor"` — CSS mask 로 렌더 시 부모 `color` 상속.
- `stroke-width="1.75"` — 모든 아이콘 통일 두께.
- `stroke-linecap`·`stroke-linejoin` `"round"` — 부드러운 모서리.
- `role="img"` + `aria-label` — 스크린리더용 (장식 용도면 `aria-hidden="true"` 로 덮어쓰기).

**제공 아이콘**

`book, calendar, campus, check, community, compass, essay, globe, graduation,
language, mentor, path, scholarship, scout-fleur, send, spark, target, video` —
DreamPath Design System 원본.

`home, megaphone, note, phone, settings, user-single, users-admin` — 같은 톤으로 신규 생성 (Dreampath 내부용).

**추가 아이콘이 필요하면 위 톤앤매너로 새로 생성합니다.**
외부 아이콘 라이브러리 import 금지 — 브랜드 일관성 훼손.

### 14.3 사이드바 nav 아이콘 렌더 (CSS mask)

```html
<span class="dp-nav-icon-svg" aria-hidden="true"
      style="--dp-icon:url('/img/dreampath/icons/home.svg')"></span>
```

```css
.dp-nav-icon-svg {
  display: inline-block;
  width: 20px; height: 20px;
  background-color: currentColor;     /* 부모 .dp-nav-item 색상 상속 */
  mask-image: var(--dp-icon);
  mask-size: 20px 20px;
  mask-repeat: no-repeat;
  mask-position: center;
}
```

이 접근법이 `<img>` 보다 우선합니다. 이유:
- `currentColor` 자동 상속 → 활성 상태에서 별도 asset 교체 불필요.
- 필터 hack 없음.
- 디자인 시스템 `stroke="currentColor"` 계약과 정합.

`<img>` + `filter: invert(1)` 같은 hack 으로 교체하지 않습니다.

### 14.4 Favicon / Meta

```html
<link rel="icon" type="image/svg+xml" href="/img/dreampath/favicon.svg" />
<link rel="alternate icon" type="image/png" sizes="48x48" href="/img/favicon-48.png" />
<link rel="apple-touch-icon" href="/img/dreampath/logo-dreampath-app-icon.svg" />
<meta name="theme-color" content="#002D56" />
```

---

## Section 15 — Deployment

### 15.1 Dreampath 전용 — `./deploy.sh`

```bash
./deploy.sh feature "설명"   # 신기능 (bbb +1, cc=00)
./deploy.sh fix "설명"       # 버그픽스 (cc +1)
./deploy.sh --skip-version   # 버전 기록 없이 배포만
./deploy.sh                  # git 커밋 메시지로 type 자동 감지
```

스크립트가 하는 일:
1. `dp_versions` 최신 버전 조회.
2. 타입에 따라 다음 버전 계산 (aa.bbb.cc).
3. HTML 파일 `?v=` 토큰을 새 버전으로 치환 (cache-bust).
4. `wrangler pages deploy .`.
5. HTML 을 `git checkout` 으로 원복 (worktree clean 유지).
6. `dp_versions` 에 INSERT.
7. `git push`.

**주의**: HTML 변경은 반드시 **deploy 전** 커밋해야 `git checkout` 원복에 안 덮입니다.

### 15.2 공용 인프라 예외

`functions/_middleware.js`, `functions/_shared/*`, `_headers`, `wrangler.toml`,
`scripts/*` 변경은 Dreampath 가 영향을 받더라도 **사이트 배포 경로** 를 씁니다:

```bash
# CLAUDE.md Release & Deploy Flow 전체 따름
VERSION bump → data/changelog.json prepend → scripts/sync_versions.sh
→ git add/commit/push → scripts/deploy_production.sh
```

이때는 `dp_versions` 에 기록되지 않습니다. commit 메시지 + changelog 엔트리에
"Dreampath 영향: ..." 명시해 추적성 확보합니다.

### 15.3 독립 도메인 이전 대비 (TBD)

- 이전 시 `functions/_middleware.js` 의 `isLegacyInlinePath` 에서 `/dreampath` 제거 가능 (자체 도메인 루트 = 모두 Dreampath 라 CSP 전체를 legacy 로 전환).
- `functions/_shared/auth.js` 의존 → Dreampath 저장소에 독립 복제 필요.
- `img/dreampath/**` 는 저장소 이동 시 함께 이전.
- `DREAMPATH.md`, `DREAMPATH-HISTORY.md` 두 파일도 함께 이전.

---

## Section 16 — Version Policy

| 파일 / 테이블 | 범위 | 무엇을 기록 |
|---|---|---|
| `dp_versions` (D1) | Dreampath 전용 | `./deploy.sh` 실행 시 자동 등록 |
| `VERSION` + `data/changelog.json` | 공용 사이트 | 공용 인프라 변경 (미들웨어, _shared, _headers) |
| `ADMIN_VERSION` | 관리자 콘솔 | Dreampath 와 무관 |

**원칙**: "파일이 어디에 있는가" 로 판단. `functions/api/dreampath/**` →
`dp_versions`. `functions/_middleware.js` → `VERSION`.

---

## Section 17-PRE — 🚨 Why v2 exists (2026-04-24 기록)

Dreampath 는 현재 **두 개의 프론트 레일**을 병렬 운영합니다:

- **`/dreampath`** — 프로덕션. 안정화된 원본. 실사용자 트래픽을 전부 받음.
- **`/dreampath-v2`** — ERP-density 디자인 시스템 기반 새 UI 스테이징. 실 API 에
  배선됨 (prod DB / R2 / 28 endpoint 그대로 사용). 현재는 검증·피드백 루프.

**v2 를 만든 이유 (언젠가 "왜?" 를 다시 묻게 될 때 읽을 것):**

1. 공개 사이트 (BP Media) 와 동일한 토큰 체계·타이포그래피·모션·시그니처 스레드 (PMO Style Tokens v2) 를 Dreampath 에도 적용. 운영 일관성.
2. `/dreampath` 는 모바일 접근성 개편(v01.040.00) 후에도 ERP 운영 관점에서 정보 밀도가 낮고, 감사로그·승인 상태·다중 승인자 시각화가 표면에 안 드러남.
3. 커맨드 팔레트 (⌘K), 밀도 스위처 (Tight/Normal/Spacious), 프린트 스타일시트, focus mode 등 award-level ERP 기본기를 처음부터 담기 위해.
4. **독립 도메인 이전 준비**: 새 디자인 + 새 문서 + 완전 배선 된 상태에서 스테이징을 완성시켜 두면, 이전 시점에 파일 move + 도메인 swap 만 남음.

**Phase 4 컷오버 조건** (이 조건을 만족하기 전엔 prod `/dreampath` 는 그대로 유지):

- [ ] v2 상에서 프로덕션 사용자의 1주 회귀 테스트 통과 (모든 게시판 / 승인 / 업로드 / 검색)
- [ ] 모바일 접근성 회귀 없음 (skip link, focus ring, 44px touch target, APCA Lc)
- [ ] 남아있는 데모 `DATA` 상수 제거 (`/tasks`, `/notes` 등 Phase 3.6+ 이후 전부 실 API)
- [ ] DREAMPATH-HISTORY.md 2026-04-24 · V2 의 케이스 10건 전부 재발 방지 주석 고정 확인
- [ ] 사용자 OK 사인

이 조건 중 하나라도 미충족이면 `/dreampath-v2` 는 스테이징 그대로 유지.

## Section 17 — 🚨 케이스 스터디 코드 주석 규칙 🚨 (NEW)

### 17.1 왜 이 규칙이 존재하는가

Dreampath 에서 발생한 **모든 프로덕션 사고 / 버그 / 회귀** 는 그 원인이 이미
문서 어딘가에 적혀 있었는데도 코드를 만지는 AI / 개발자가 그 문서를 못 찾아
같은 실수를 반복해왔습니다. 문서는 소스가 아닌 곳에 있고, 코드를 수정할 때
항상 읽히지 않기 때문입니다.

**해결책**: 사고 / 회귀 / 비자명한 판단이 있었던 **그 줄 근처** 에 짧은
case-study 주석을 남깁니다. 그 코드를 고치는 사람이 반드시 마주하는 위치에
붙여서 같은 실수를 물리적으로 막습니다.

### 17.2 주석을 남기는 시점

다음 상황마다 **필수**:

1. **프로덕션 회귀를 수정할 때** — "왜 이렇게 고쳤는가" 를 회귀 일자와 함께 남깁니다.
2. **비자명한 의존성이 있을 때** — "이 줄을 바꾸면 X 가 죽는다" 를 명시합니다.
3. **외부/공용 인프라와 계약이 있을 때** — CSP, `_shared/auth.js`, R2 경로 등.
4. **API shape 가 프론트 / 백 양쪽에서 계약으로 쓰일 때** — 한쪽만 고치면 조용히 깨지는 곳.
5. **DB 마이그레이션 불가능한 결정을 내릴 때** — `approver_id NOT NULL` 같은 것.
6. **"이거 왜 이렇게 생겼어?" 가 나올 것 같은 구조** — IIFE 유지 이유, 인라인 onclick 유지 이유 등.

### 17.3 주석 포맷

```javascript
// [CASE STUDY YYYY-MM-DD — 제목]
// 증상: 무슨 일이 일어났는가 (사용자 관점).
// 원인: 왜 일어났는가 (기술 원인).
// 교훈: 이 코드를 만질 때 뭘 조심해야 하는가.
// 참고: DREAMPATH-HISTORY.md (해당 일자), 관련 커밋.
```

- 위 4줄 구조를 유지합니다 (길이는 짧아도 4줄 슬롯 다 채움).
- 주석은 영어 혹은 한국어 아무거나. 단 한 주석 안에서는 통일.
- `DREAMPATH-HISTORY.md` 에 동일 일자의 상세 이력이 반드시 함께 존재해야 합니다. 주석은 pointer, 이력 원본은 그 파일.

### 17.3.1 Dev Rules 섹션 3-필드 템플릿 (문서 규칙)

**이 문서의 모든 신규 Section / 서브섹션은 아래 3가지를 갖추어야 합니다.**
(앱 내 `/rules` 뷰어가 우측 TOC 로 각 섹션을 안내합니다.)

```markdown
### Section N.M — {제목}

**개발 배경 / Development background**
왜 이 규칙 / 구조 / 제약이 필요하게 되었는가. 촉발 사건·사용자 요청·관측된 문제.

**개발 목적 / Development purpose**
이 규칙을 통해 시스템 또는 사용자가 얻는 것. 성공 기준.

**특이사항 / Remarks**
비자명한 함정·예외·앞으로 바뀔 여지·관련 케이스 스터디 포인터.
```

- 셋 중 하나라도 비워 두지 않습니다. 내용이 자명해 보여도 **"자명함"** 이라도 한 줄 적습니다.
- "특이사항" 에 `DREAMPATH-HISTORY.md` 의 관련 일자 / 케이스 번호를 linking 하면 자동 연결됩니다.
- Remarks 의 대표 형식: "이 규칙을 깨뜨리면 X 가 터진다" / "대체 방법 A 가 있지만 Y 때문에 배제" / "Phase N 에서 재검토 예정".

### 17.4 주석 유지 관리

- 해당 코드 경로를 리팩터 / 삭제하면 주석도 함께 옮기거나 삭제합니다.
- 주석이 참조하는 `DREAMPATH-HISTORY.md` 항목이 사라지면 주석도 해당 항목 제거.
- 리뷰 시: "이 변경으로 기존 case study 가 무효화되지 않는가?" 필수 확인.

### 17.5 기존 코드에 소급 적용

아래 지점은 이미 사고 / 회귀가 있었습니다. 각 줄 위에 Section 17.3 포맷으로 주석이 붙어 있어야 합니다 (2026-04-24 초기 적용 + v2 10건 추가):

| 위치 | 일자 | 사건 요약 |
|---|---|---|
| `functions/_middleware.js` `isLegacyInlinePath()` | 2026-04-24 | `/dreampath`, `/dreampath-v2` 누락 → 인라인 onclick 전체 차단 |
| `js/dreampath.js` / `js/dreampath-v2.js` IIFE 선언부 | 설계 원본 | IIFE 분리 시 인라인 onclick 참조 증발 |
| `js/dreampath.js` / `js/dreampath-v2.js` Tiptap 초기화 | 설계 원본 | 한 곳만 고치면 해당 경로에서만 조용히 기능 죽음 |
| `js/dreampath.js` `_homeTaskQuick` | 2026-04-24 | tasks API 는 PUT 만 있음 (PATCH 아님) |
| `js/dreampath.js` `_recentItems` unread 로직 | 2026-04-24 | localStorage 키 `dp_home_last_seen_at` 계약 |
| `js/dreampath.js` `_installSessionActivityExtension` | 2026-04-24 | `click` / `touchstart` 는 세션 유휴 시간을 즉시 1시간으로 리셋 |
| `functions/api/dreampath/home.js` `events_current_month` 쿼리 | 2026-04-24 | `/events` API 와 shape 호환 필수 |
| `functions/api/dreampath/home.js` `pending_approvals` 쿼리 | 2026-04-24 | 현재 사용자 이름 / 유저네임 모두 매칭 필요 |
| `functions/api/dreampath/home.js` `my_tasks` / `recent_changes` | 2026-04-24 | `my_tasks` 는 현재 사용자 직접 조회, `recent_changes` 는 진짜 최근 24h 만 |
| `functions/api/dreampath/approvals.js` PUT vote lookup | 2026-04-24 | caller 는 stored `approver_name` 전달, 서버는 LOWER 매칭 |
| `functions/api/dreampath/posts.js` `dp_post_approvals` INSERT | 설계 원본 | `approver_id` NOT NULL |
| `js/dreampath-v2.js` `_displayName()` / `_avatarChar()` / `_roleLine()` | 2026-04-24 V2/케이스 2 | legacy `dp_user.name` 이 null/undefined 일 수 있음 — 직접 dereference 금지 |
| `js/dreampath-v2.js` `_rawApi()` / `_renderPostError()` | 2026-04-24 V2/케이스 5 | 404/403 은 모달 내부 inline 에러로, 조용히 닫기 금지 |
| `js/dreampath-v2.js` `_handlePickerChange` | 2026-04-24 V2/케이스 7 | 파일 total 100MB · 10개 제한은 프론트 전담 |
| `dreampath-v2.html` `.dp-modal` 정의 | 2026-04-24 V2/케이스 8 | 우측 드로어 금지 — 중앙 dialog 유지 |
| `dreampath-v2.html` `.dp-page` 정의 | 2026-04-24 V2/케이스 9 | `max-width` 고정 금지 — ERP 는 횡을 다 써야 함 |
| `deploy.sh` 상단 주석 | 2026-04-24 V2/케이스 3 | `--skip-version` 은 캐시 버스트 안 됨 |

---

## Section 18 — Critical Prohibitions (Dreampath 전용)

1. **IIFE 분리 / 모듈화 금지** — `const DP = (() => {...})()` 단일 블록 유지.
2. **`DP.*` 인라인 onclick 구조 유지** — delegation 으로 대체하지 말 것 (Section 2.2).
3. **Tiptap 4 곳 동시 갱신** — createPost / editPost / createNote / editNote (Section 4.3).
4. **DOMPurify 없이 사용자 입력 `innerHTML` 금지.**
5. **`dp_post_approvals` INSERT 시 `approver_id` 필수** (NOT NULL).
6. **기존 DB 컬럼 삭제 · 타입 변경 금지** — `ALTER TABLE ADD COLUMN` 만.
7. **CDN URL 변경 시 버전 고정 확인** (Tiptap `@2`, DOMPurify `3.1.6`).
8. **`.env` / 시크릿 값 커밋 금지.**
9. **HTML 변경 후 deploy 전 커밋 필수** (`./deploy.sh` 의 `git checkout` 원복 주의).
10. **`functions/_middleware.js` 의 `isLegacyInlinePath` 변경 시** `/dreampath` 경로가 계속 포함되는지 검증.
11. **외부 아이콘 라이브러리 import 금지** — Section 14.2 디자인 스펙으로 신규 생성.
12. **프로덕션 회귀 / 비자명 결정은 Section 17 포맷으로 코드 주석 + `DREAMPATH-HISTORY.md` 동시 기록 필수.**

---

## Section 21 — 📝 Version Logging Discipline (NEW · 2026-04-24)

> [!important] Every deploy must leave a detailed trail in `dp_versions`.
> "Fix CSS" / "minor tweak" entries are disallowed. A version row has to
> read like a patch-note that the owner could show to a stakeholder.

### 21.1 Rule

1. **Every `./deploy.sh` run creates a `dp_versions` row**. No silent deploys.
   Use `--skip-version` only when backfilling or re-deploying unchanged code.
2. **Description must be actionable + specific.** Banned openings:
   - "Minor fixes", "polish", "small updates", "refactor"
   - Anything shorter than one clause
3. **Format**: `summary line\n- change 1\n- change 2\n- ...`
   - First line = owner-readable summary (≤ 160 chars)
   - Bullets = concrete changes. Include file paths / module names where it
     clarifies scope. Numbers beat adjectives ("4 new tabs" > "added tabs").
4. **`deploy.sh` auto-appends git commits** since the last version to the
   description as additional bullets. Do NOT strip those — they are the
   authoritative change list for anyone reviewing the release later.
5. **Bumps by change type**:
   - `feature` → `bbb` bumps, `cc` resets to 00. New capability, new UI,
     new endpoint, new DB column.
   - `fix` → `cc` bumps. Bug fix, copy tweak, accessibility repair.
6. **Backfill** — if a deploy slipped without a version row, land a backfill
   PR that recreates the row via `wrangler d1 execute ... INSERT`. Don't
   leave gaps.

### 21.2 Checklist (AI / operator self-check before `deploy.sh`)

- [ ] Is every code change I'm shipping committed to `origin/main`?
      (deploy.sh can only auto-scrape commits that are pushed; stash
      changes won't show up in the version description.)
- [ ] Does my summary line tell a product-owner what changed in under
      15 words?
- [ ] If this is a bug fix, does at least one bullet name the root cause
      + the mitigation? (e.g. "dp_notifications schema collision; drop +
      recreate in migration 063")
- [ ] If I introduced a new API surface or DB migration, does a bullet
      call that out by filename?

### 21.3 Why this exists

Several 2026-04 deploys went out as `./deploy.sh fix "minor"` which made
post-mortems impossible — nobody could tell which release broke what.
The new rule + auto-appended commit bullets should make the `dp_versions`
table self-explanatory to anyone opening the Versions page in /dreampath.

---

## Section 20 — 🎨 Dark Mode & Accessibility Design Rules (NEW · 2026-04-24)

**배경**: v2 다크 모드 첫 릴리스 (v01.045.00) 직후 일부 게시판 제목이 배경에 묻히고
Pinned NOTICE 행 제목이 보이지 않는 회귀가 발견됐음. 원인은 하드코딩된 컬러 리터럴과
`var(--navy)` 를 텍스트 색으로 직접 쓴 곳들이었다. 아래 규칙은 이 회귀가 재발하지
않도록 다크모드 안전성을 코드 수준에서 강제한다.

### 20.1 컬러 사용 3원칙

| 규칙 | 예시 ✔️ | 예시 ✘ |
|---|---|---|
| **1. 리터럴 컬러 금지** — 모든 색은 `var(--...)` 토큰으로 | `background: var(--surface)` | `background: #fff` |
| **2. Navy를 텍스트 색으로 쓰지 말 것** — `--navy` 는 어두워 다크모드에서 소실. 반드시 `--accent` 사용 | `color: var(--accent)` | `color: var(--navy)` |
| **3. Status 행 틴트는 토큰으로** — `--ok-bg` / `--warn-bg` / `--alert-bg` / `--info-bg` 만 사용 | `background: var(--warn-bg)` | `background: #FEF8EC` |

**Why**: `--accent` 는 라이트 모드에서 `--navy` (#002D56), 다크 모드에서 `#5AA9E6`
로 자동 전환되는 theme-aware 토큰이다. `--navy` 를 하드코딩하면 다크모드에서
navy on dark navy → 명도 대비 실질 실명. `--surface` 도 마찬가지로 라이트에서
`#FFFFFF`, 다크에서 `#111827` 로 전환된다.

### 20.2 대비 기준 (WCAG 3.0 APCA)

| 텍스트 유형 | 최소 명도 대비 (Lc 절댓값) |
|---|---|
| 본문 (13-14px / 400wt) | 75+ |
| UI 보조 (12px) | 60+ |
| 대형·헤딩 (16px+ 또는 700wt) | 45+ |
| 테두리·아이콘 | 30+ |

신규 컬러 조합 추가 시 `https://apcacontrast.com` 으로 **라이트 + 다크 양쪽 검증**.
한쪽만 통과하면 토큰 구조가 잘못된 것.

### 20.3 신규 컴포넌트 체크리스트

- [ ] 모든 색상이 `var(--...)` 인가? `#` literal 이 남아있는지 grep.
- [ ] Status 표시(승인/거부/경고)가 **색 + 아이콘 + 레이블** 3중 표기인가? (색각 이상 대응)
- [ ] 다크 모드에서 직접 시각 확인 (상단바 토글 → Dark).
- [ ] `prefers-color-scheme: dark` 시스템 follow 도 작동하는가? (토글 "Auto")
- [ ] 포커스 링(`--focus-ring`)이 배경과 대비 충분한가?

### 20.4 회귀 방지 — 코드 리뷰 시 반드시 grep

```bash
grep -nE "#fff\b|#FFFFFF\b|color:\s*var\(--navy\)|background:\s*#" dreampath-v2.html js/dreampath-v2.js
```

새 항목이 잡히면 토큰으로 바꾸거나 허용 사유를 주석으로 명기.
현재 허용된 하드코딩 `#fff`:
- 네비 사이드바 내부 (`.dp-side` 는 항상 navy bg 라 텍스트 고정)
- Primary 버튼 전경색 (항상 navy bg)
- 로그인 카드 outer gradient

### 20.5 Case Studies

- **2026-04-24 · Pinned row 제목 소실 (라이트에선 보이나 다크에선 안 보임)**
  - 원인: `.dp-row-pinned td:first-child` 가 `color: var(--navy)` 로 하드고정.
  - 수정: `color: var(--accent)` 로 교체 + `--accent` 는 다크에서 `#5AA9E6` 로 재정의.
  - 교훈: 브랜드 네이비를 텍스트로 쓰려면 반드시 `--accent` 경유.

- **2026-04-24 · 승인 상태 행 (pending/approved/rejected) 이 다크에서 light-on-light**
  - 원인: `.dp-row-approved { background: #F3FAF5 }` 등 리터럴. 다크 모드에서 배경이
    그대로 밝은 민트색, 텍스트는 `--text` (white) 로 자동 전환 → 보이지 않음.
  - 수정: `--ok-bg` / `--warn-bg` / `--g-100` 토큰으로 교체 (다크 모드 override 존재).
  - 교훈: 모든 status 표시는 theme-aware 토큰만 사용.

---

## Section 19 — In-app Dev Rules 관계

- `/dreampath` 사이드바 "Dev Rules" 메뉴 = 운영자 · 사용자용 정식 원본.
- **이 파일 (DREAMPATH.md)** = AI 작업 전용 규칙.
- **[DREAMPATH-HISTORY.md](DREAMPATH-HISTORY.md)** = 케이스 스터디 / 버전 히스토리 원본.
- 운영 기준이 바뀌면 세 곳 모두 갱신합니다. 운영 원본이 우선이지만, AI 가이드가
  stale 하면 AI 가 잘못된 경계로 작업하므로 셋 다 중요합니다.

관련 문서:
- [[docs/dreampath/README|Dreampath Hub]] — 기능 / API / DB 레퍼런스 (공용 문서)
- `CLAUDE.md` Section 0 — Target Confirmation Protocol (공통 최상위 규칙)
- `CLAUDE.md` Section 1 — Common Infrastructure (공용 인프라 배포)
