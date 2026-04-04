# CLAUDE.md — Gilwell Media / Dreampath

> **⚠️ AI 개발자 필독 (AI Developer: Read This First)**
>
> 이 파일은 Claude Code 및 모든 AI 개발 도구가 자동으로 로드하는 프로젝트 규칙 파일입니다.
> **코드를 단 한 줄도 수정하기 전에** 반드시 아래 내용을 읽고,
> 작업 대상에 따라 아래 우선 문서를 먼저 확인하십시오.
> - **메인 홈페이지 작업:** `CHATGPT.md`
> - **Dreampath 작업:** Dreampath 앱 내의 **Dev Rules 페이지** (`/dreampath` → 사이드바 "Dev Rules")
>
> _This file is auto-loaded by Claude Code and AI tools. You MUST read it fully before any code change._

---

## MANDATORY FIRST STEP

**메인 홈페이지 개발 작업 시:** 저장소 루트의 `CHATGPT.md`를 먼저 확인하십시오. 메인 사이트 규칙의 우선 기준 문서입니다.

**홈페이지 관련 작업에서는 `DreamPath` 규칙을 기본값으로 적용하지 마십시오.**

**메인 홈페이지 관련 파일, 디자인, 배포, 관리자, 게시글, 문서 기준은 모두 `CHATGPT.md`를 따르십시오.**

**Dreampath 개발 작업 시:** `/dreampath` 사이트에 로그인 → 사이드바 "Dev Rules" 섹션에서 전체 핸드북을 확인하십시오. 그 곳이 모든 규칙의 정식 출처입니다.

---

## Architecture Overview

| Layer | Technology |
|---|---|
| Hosting | Cloudflare Pages (static files, no build step) |
| API | Cloudflare Workers (Functions in `/functions/api/`) |
| Database | Cloudflare D1 (SQLite, binding: `env.DB`) |
| Auth | HMAC-SHA256 signed tokens (`functions/_shared/auth.js`) |

**Deploy:** `./deploy.sh feature "설명"` or `./deploy.sh fix "설명"`
- Auto-increments version and registers in D1 `dp_versions` table
- Do NOT deploy without running `./deploy.sh`
- Wrangler 위치: `/opt/homebrew/bin/wrangler` (PATH에 없을 경우 `export PATH="/opt/homebrew/bin:$PATH"`)

---

## Key Files

```
# ── Dreampath ─────────────────────────────────────────────────────
dreampath.html                        — Dreampath 전용 인라인 CSS 전체
js/dreampath.js                       — Dreampath 프론트엔드 로직 전체 (IIFE)
functions/api/dreampath/posts.js      — 게시글 CRUD (게시판 접근 제어 포함)
functions/api/dreampath/approvals.js  — 회의록 다중 승인 투표
functions/api/dreampath/upload.js     — 파일 업로드 + 확장자 차단
functions/api/dreampath/             — Dreampath API 엔드포인트 전체
functions/_shared/auth.js             — 인증 코어 (수정 금지 without sign-off)
deploy.sh                             — 배포 + 버전 자동 등록 스크립트

```

---

## ══════════════════════════════════════════
##  DREAMPATH
## ══════════════════════════════════════════

## Dreampath Frontend Rules

### 구조 (Structure)
- **IIFE 패턴**: `const DP = (() => { ... })()` → `window.DP`
- 이 구조를 **절대 분리하거나 모듈화하지 말 것**
- 모든 public 메서드는 반드시 `return {}` 블록에 포함해야 함
- 인라인 이벤트: `onclick="DP.method()"` — 반드시 `DP.` 프리픽스 사용
- 툴바 버튼: `onmousedown="event.preventDefault(); DP._teCmd('x')"` — focus 유지를 위해 `onmousedown` 사용

### CSS
- 모든 Dreampath CSS는 `dreampath.html` 내 `<style>` 태그에만 위치
- 색상은 반드시 `:root` CSS 변수 사용: `var(--accent)`, `var(--text)`, etc.
- CUFS 브랜드 색상: Green `#146E7A` · Navy `#002D56` · Gold `#8D714E`

### Rich Text Editor (게시글 + 노트)
- **에디터**: Tiptap (esm.sh CDN) — 아래 extensions 모두 로드됨
  ```
  @tiptap/core@2
  @tiptap/starter-kit@2
  @tiptap/extension-table@2
  @tiptap/extension-table-row@2
  @tiptap/extension-table-header@2
  @tiptap/extension-table-cell@2
  ```
- **에디터 탑재 위치**: `createPost`, `editPost`, `createNote`, `editNote` (4곳)
- **뷰어**: DOMPurify (cdnjs CDN) — 모든 HTML 출력에 적용 필수
- **비동기 초기화**: Tiptap은 비동기 로드 → 반드시 `_waitForTiptap(cb)` 헬퍼를 통해 초기화
- 기존 plain-text 게시글 → `_legacyToHtml()` 자동 변환 (하위 호환)
- `_destroyTiptap()`은 `closeModal()`에서 자동 호출됨
- 새 extension 추가 시: `dreampath.html` import + `_initTiptap()` extensions 배열 + `_execTiptapCmd()` + 툴바 HTML (4곳 모두) 동시에 수정

---

## Team Boards

게시판 목록: `announcements`, `documents`, `minutes`, `team_korea`, `team_nepal`, `team_indonesia`

```javascript
const VALID_BOARDS = ['announcements', 'documents', 'minutes', 'team_korea', 'team_nepal', 'team_indonesia'];
const TEAM_BOARDS  = ['team_korea', 'team_nepal', 'team_indonesia'];
```

### 접근 제어 규칙
| 역할 | 읽기 | 쓰기 |
|---|---|---|
| admin | 모든 게시판 | 모든 게시판 |
| 일반 유저 | 자기 팀 보드만 | 자기 팀 보드만 |

### 중요: department는 JWT에 없음
`data.dpUser` 미들웨어 주입 필드: `{ uid, username, role, name }` — **`department` 없음**

팀 보드 접근 판별이 필요한 경우 항상 DB에서 별도 조회해야 함:
```javascript
const u = await env.DB.prepare(`SELECT department FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
```

### department 매칭 패턴 (`_deptMatchesBoard`)
```javascript
const d = (department || '').toLowerCase();
board === 'team_korea'     && d.includes('korea')
board === 'team_nepal'     && d.includes('nepal')
board === 'team_indonesia' && d.includes('indonesia')
```

프론트엔드에서도 동일 로직 사용: `_teamBoard(department)` in `js/dreampath.js`

---

## API Access Control Patterns

### 게시글 작성 (POST /api/dreampath/posts)
- **admin**: 모든 게시판 작성 가능
- **일반 유저**: `TEAM_BOARDS`에 속한 자기 팀 보드에만 작성 가능. 그 외 게시판 → 403

### 게시글 수정 (PUT /api/dreampath/posts?id=N)
- **admin**: 모든 게시글 수정 가능
- **일반 유저**: `author_id = data.dpUser.uid`인 본인 게시글만 수정 가능 → 403

### 회의록 잠금 (Minutes Content Lock)
- `approval_status = 'approved'`인 회의록은 content 수정 불가
- `title`, `content`, `pinned` 변경 시도 → **HTTP 423** 반환
  ```json
  { "error": "LOCKED", "message": "This meeting minutes has been approved..." }
  ```
- 프론트엔드에서 423 수신 시 잠금 안내 메시지 표시

### 파일 업로드 차단 확장자
`upload.js`의 `BLOCKED_EXTENSIONS` — 실행 가능한 파일 유형 전체 차단:
```
exe, sh, bat, cmd, com, ps1, vbs, jar, app, deb, rpm, dmg, pkg, msi, dll, sys, reg, lnk 등
```
최대 100MB / 파일당, 최대 5개 / 게시글당

---

## Meeting Minutes Approval System

### 테이블: `dp_post_approvals`
| 컬럼 | 설명 |
|---|---|
| `post_id` | 연결된 게시글 ID |
| `approver_id` | 승인자 `dp_users.id` |
| `approver_name` | 승인자 display_name |
| `status` | `pending` / `approved` / `rejected` |
| `voted_at` | 투표 시각 (UTC) |
| `override_by` | 어드민 강제 변경자 이름 |
| `override_note` | 강제 변경 사유 |

### 승인 로직
- 총 승인자 중 **과반수 초과** `approved` → `dp_board_posts.approval_status = 'approved'` + 게시글 잠금
- 승인자 추가/제거 후 자동 재계산
- 투표/재계산 시 `dp_post_history`에 자동 로그 기록

### 어드민 강제 투표 변경 (Override)
- **2026-04-01 이전** 생성된 회의록에 한해서만 허용 (`CUTOFF = '2026-04-01'`)
- 이후 생성 게시글의 타인 투표 변경 → 403

---

## Database Rules

- D1 binding: `env.DB` (모든 Function 파일)
- Dreampath 테이블 접두사: `dp_`
- **기존 컬럼 삭제/변경 금지** — `ALTER TABLE ADD COLUMN`으로 추가만 허용
- 스키마 변경 시 마이그레이션 계획 필요

---

## Version Convention (MANDATORY)

형식: `aa.bbb.cc`

| 세그먼트 | 설명 |
|---|---|
| `aa` | Major — 프로젝트 오너가 수동으로 올림 |
| `bbb` | Feature — 신기능 추가 시 증가, `./deploy.sh feature "설명"` |
| `cc` | Fix — 버그픽스 시 증가, `./deploy.sh fix "설명"`, Feature 시 00 초기화 |

의미 있는 모든 변경 후 반드시 `./deploy.sh`를 실행하여 버전을 등록할 것.

---

## CRITICAL PROHIBITIONS (절대 금지)

1. `functions/_shared/auth.js` — 책임자 승인 없이 수정 금지
2. 사용자 입력 HTML → DOMPurify 없이 `innerHTML` 사용 금지
3. 인증 토큰을 `localStorage`에 저장 금지 (sessionStorage 또는 httpOnly 쿠키 사용)
4. 기존 DB 컬럼 삭제 또는 타입 변경 금지
5. 의미 있는 변경 후 `./deploy.sh` 버전 등록 생략 금지
6. `js/dreampath.js` IIFE 구조를 분리하거나 ES 모듈로 변환 금지
7. CDN URL 변경 시 반드시 버전 고정 여부 확인 필수
8. `.env` 또는 시크릿 값을 절대 커밋 금지
9. `dp_post_approvals`에 직접 `INSERT` 시 `approver_id` (NOT NULL) 반드시 포함

---

## Authentication Details

- **Dreampath**: cookie `dp_session=1` (httpOnly, 1h) + `localStorage` user profile
- 세션 타이머: 1h, 5분 전 경고 팝업 → 연장 가능 (서버 세션 유효성 확인 후 연장)
- `functions/api/dreampath/_middleware.js` — 모든 Dreampath API 인증 미들웨어

---

_Dev Rules 풀 버전은 Dreampath 앱 (`/dreampath` → Dev Rules)에서 항상 최신본을 확인하십시오._
_Full Dev Rules: always check the Dreampath app (`/dreampath` → Dev Rules sidebar) for the canonical up-to-date version._
