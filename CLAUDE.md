---
tags: [ai-guide, dreampath, entry-point, project-root]
aliases: [Claude Rules, AI Dev Rules, 프로젝트 규칙]
scope: project
---

# CLAUDE.md — Gilwell Media

## 이 문서의 목적

> [!abstract] Purpose & Scope
> **목적**: Claude Code가 자동 로드하는 **프로젝트 전체 규칙** 파일
> **범위**: 아키텍처, 배포, DB, 인증 등 **공통 인프라** + **Dreampath 전용 규칙**
> **대상 독자**: AI 개발 도구 (Claude Code, ChatGPT 등)
>
> 이 문서는 홈페이지와 Dreampath **양쪽에 공통**되는 기술 규칙을 정의합니다.
> 각 도메인의 세부 규칙은 아래 전용 문서에서 관리합니다.

### 문서 계층 구조

```
CLAUDE.md (이 문서) ← 프로젝트 공통 + Dreampath 규칙
├── CHATGPT.md         ← 메인 홈페이지 전용 규칙
├── Dreampath Hub      ← Dreampath 기능/API 레퍼런스
├── Homepage Features Hub ← 홈페이지 기능 중심 문서
└── KMS (admin page)   ← 운영 기준 원본 (코드 외부)
```

| 작업 대상 | 우선 문서 | 비고 |
|---|---|---|
| **프로젝트 공통** | 이 문서 (`CLAUDE.md`) | 아키텍처, DB, 배포, 인증 |
| **메인 홈페이지** | [[CHATGPT]] | UI, 모듈, 디자인, 컨텐츠 규칙 |
| **Dreampath** | [[docs/dreampath/README\|Dreampath Hub]] + Dev Rules | 기능/API/DB 레퍼런스 |
| **기능 정의 원본** | 관리자 KMS (`/admin.html`) | 운영 기준 정식 출처 |

> [!warning] 경계 규칙
> 홈페이지 작업에 Dreampath 규칙을 적용하지 마십시오.
> Dreampath 작업에 홈페이지 모듈/디자인 규칙을 적용하지 마십시오.

---

## Architecture

| Layer | Stack |
|---|---|
| Hosting | Cloudflare Pages (static, no build step) |
| API | Cloudflare Workers (`/functions/api/`) |
| Database | Cloudflare D1 (SQLite, binding: `env.DB`) |
| Auth | HMAC-SHA256 signed tokens (`functions/_shared/auth.js`) |
| Storage | Cloudflare R2 (`POST_IMAGES` bucket) |

### Deploy

```bash
./deploy.sh feature "설명"   # 신기능
./deploy.sh fix "설명"       # 버그픽스
```

- 자동 버전 증가 + D1 `dp_versions` 등록
- Wrangler: `/opt/homebrew/bin/wrangler` (필요 시 `export PATH="/opt/homebrew/bin:$PATH"`)
- `deploy.sh`는 HTML cache-bust 후 `git checkout`으로 원복하므로 **HTML 변경은 반드시 커밋 후 deploy**

> [!important] 버전 형식
> `aa.bbb.cc` — Major(수동) . Feature(자동) . Fix(자동, Feature 시 00 초기화)

---

## Key Files

```
# ── Dreampath ─────────────────────────────────────────
dreampath.html                        — 전용 인라인 CSS
js/dreampath.js                       — 프론트엔드 IIFE (window.DP)
functions/api/dreampath/posts.js      — 게시글 CRUD + 접근 제어
functions/api/dreampath/boards.js     — 게시판 CRUD (동적 관리)
functions/api/dreampath/events.js     — 캘린더 이벤트 + 반복 일정
functions/api/dreampath/approvals.js  — 회의록 다중 승인
functions/api/dreampath/upload.js     — 파일 업로드 + 확장자 차단
functions/api/dreampath/home.js       — 홈 데이터 (접근 가능 게시판 필터)
functions/api/dreampath/notes.js      — Notes & Issues CRUD
functions/api/dreampath/_middleware.js — 인증 미들웨어
functions/_shared/auth.js             — 인증 코어 (수정 금지)
deploy.sh                             — 배포 + 버전 등록

# ── 메인 홈페이지 ────────────────────────────────────
index.html, korea.html, apr.html ...  — 공개 페이지
js/main.js                            — window.GW 네임스페이스
css/style.css                         — 공개 사이트 스타일
functions/api/*                       — 메인 사이트 API
```

---

## Dreampath Frontend Rules

### 구조

- **IIFE 패턴**: `const DP = (() => { ... })()` → `window.DP`
- IIFE를 **절대 분리하거나 모듈화하지 말 것**
- 모든 public 메서드는 `return {}` 블록에 포함
- 인라인 이벤트: `onclick="DP.method()"` — 반드시 `DP.` 프리픽스
- 툴바 버튼: `onmousedown` 사용 (focus 유지)

### CSS

- Dreampath CSS는 `dreampath.html` 내 `<style>` 태그에만 위치
- 색상은 `:root` CSS 변수: `var(--accent)`, `var(--text)` 등
- CUFS 브랜드: Green `#146E7A` · Navy `#002D56` · Gold `#8D714E`

### Rich Text Editor

- **에디터**: Tiptap (esm.sh CDN, `@tiptap/core@2` + starter-kit + table extensions)
- **뷰어**: DOMPurify (cdnjs CDN) — 모든 HTML 출력에 필수
- **비동기 초기화**: `_waitForTiptap(cb)` 헬퍼 사용
- 에디터 탑재: `createPost`, `editPost`, `createNote`, `editNote` (4곳)
- 새 extension 추가 시: import + `_initTiptap()` + `_execTiptapCmd()` + 툴바 HTML (4곳 모두)

---

## Board System

> [!note] 동적 게시판 시스템
> 게시판은 `dp_boards` 테이블에서 DB 기반으로 관리됩니다.
> Settings 페이지에서 관리자가 Board / Team Board를 생성·삭제할 수 있습니다.

### DB 스키마: `dp_boards`

| Column | Type | 설명 |
|---|---|---|
| `slug` | TEXT UNIQUE | 게시판 식별자 (e.g. `team_korea`) |
| `title` | TEXT | 표시 이름 |
| `board_type` | TEXT | `board` 또는 `team` |

### 접근 제어

| 역할 | General Board | Team Board |
|---|---|---|
| admin | 전체 읽기/쓰기 | 전체 읽기/쓰기 |
| 일반 유저 | 읽기만 | 자기 팀만 읽기/쓰기 |

### Team Board 매칭

```javascript
// team_xxx → department에 'xxx' 포함 여부로 자동 매칭
function _deptMatchesBoard(department, board) {
  if (!board.startsWith('team_')) return false;
  const country = board.slice(5);
  return department.toLowerCase().includes(country);
}
```

> [!warning] department는 JWT에 없음
> `data.dpUser`: `{ uid, username, role, name }` — department 미포함.
> 팀 보드 접근 판별 시 항상 DB 조회: `SELECT department FROM dp_users WHERE id = ?`

---

## API Access Control

### 게시글

| Method | Admin | 일반 유저 |
|---|---|---|
| GET (목록) | 전체 | Team 보드는 자기 팀만 |
| GET (단건) | 전체 | Team 보드는 자기 팀만 |
| POST | 모든 게시판 | Team 보드 자기 팀만, 나머지 403 |
| PUT | 모든 게시글 | `author_id = uid`인 본인 글만 |
| DELETE | 전체 | 불가 |

### 회의록 잠금

- `approval_status = 'approved'` → content 수정 불가 → **HTTP 423 LOCKED**
- 프론트엔드에서 423 수신 시 잠금 안내 표시

### 파일 업로드

- 차단 확장자: `exe, sh, bat, cmd, ps1, vbs, jar, app, dmg, pkg, msi, dll` 등
- 최대 100MB / 파일, 최대 5개 / 게시글

---

## Meeting Minutes Approval

### `dp_post_approvals` 테이블

| Column | 설명 |
|---|---|
| `post_id` | 연결된 게시글 |
| `approver_id` | 승인자 (NOT NULL) |
| `status` | `pending` / `approved` / `rejected` |
| `voted_at` | 투표 시각 (UTC) |
| `override_by` | 어드민 강제 변경자 |

### 로직

- **과반수 초과** approved → 게시글 잠금
- 승인자 추가/제거 후 자동 재계산
- 어드민 Override: **2026-04-01 이전** 생성 게시글만 허용

---

## Calendar Events

- 반복 일정 지원: `recurrence_type` (daily / weekly / biweekly / monthly / yearly)
- `recurrence_end`로 반복 종료일 지정
- 월별 조회 시 서버에서 반복 인스턴스 자동 확장 (최대 60회)

---

## Database Rules

> [!important] DB 변경 규칙
> - D1 binding: `env.DB`
> - Dreampath 테이블 접두사: `dp_`
> - **기존 컬럼 삭제/변경 금지** — `ALTER TABLE ADD COLUMN`만 허용
> - 스키마 변경 시 마이그레이션 계획 필요

---

## Critical Prohibitions

> [!danger] 절대 금지 사항
> 1. `functions/_shared/auth.js` — 승인 없이 수정 금지
> 2. 사용자 입력 HTML → DOMPurify 없이 `innerHTML` 금지
> 3. 인증 토큰을 `localStorage`에 저장 금지 (httpOnly 쿠키 사용)
> 4. 기존 DB 컬럼 삭제/타입 변경 금지
> 5. `./deploy.sh` 버전 등록 생략 금지
> 6. `js/dreampath.js` IIFE 구조 분리/모듈화 금지
> 7. CDN URL 변경 시 버전 고정 확인 필수
> 8. `.env` 또는 시크릿 값 커밋 금지
> 9. `dp_post_approvals` INSERT 시 `approver_id` (NOT NULL) 필수

---

## Authentication

| 항목 | 내용 |
|---|---|
| Session | cookie `dp_session=1` (httpOnly, 1h) |
| Profile | `localStorage`에 user profile |
| Timer | 1h, 5분 전 경고 → 서버 확인 후 연장 |
| Middleware | `functions/api/dreampath/_middleware.js` |

---

## Related Docs

### 홈페이지 (scope: homepage)
- [[CHATGPT]] — 메인 홈페이지 개발 가이드
- [[docs/features/README|Homepage Features Hub]] — 기능 중심 문서 진입점
- [[docs/modules/README|Homepage Modules Hub]] — 모듈 참고 라이브러리
- [[docs/features/Feature Map|Feature Map]] — 전체 기능 맵

### Dreampath (scope: dreampath)
- [[docs/dreampath/README|Dreampath Hub]] — 기능/API/DB 레퍼런스

### 운영 (scope: ops)
- [[docs/release-playbook|Release Playbook]] — 배포 절차
- [[docs/stability-implementation-plan|Stability Plan]] — 안정성 개선 로드맵
- [[docs/hardcoding-inventory|Hardcoding Inventory]] — 하드코딩 감사

### KMS (scope: kms)
- [[docs/feature-definition|Feature Definition]] — KMS 보조 스냅샷
- [[docs/homepage-module-inventory|Module Inventory]] — 모듈 인벤토리

> [!tip] Dev Rules 정식 출처
> Dreampath → `/dreampath` 사이드바 "Dev Rules"
> 홈페이지 → 관리자 KMS (`/admin.html` → KMS 메뉴)
