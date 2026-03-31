# CLAUDE.md — Gilwell Media / Dreampath

> **⚠️ AI 개발자 필독 (AI Developer: Read This First)**
>
> 이 파일은 Claude Code 및 모든 AI 개발 도구가 자동으로 로드하는 프로젝트 규칙 파일입니다.
> **코드를 단 한 줄도 수정하기 전에** 반드시 아래 내용을 읽고,
> Dreampath 앱 내의 **Dev Rules 페이지** (`/dreampath` → 사이드바 "Dev Rules")를 확인하십시오.
>
> _This file is auto-loaded by Claude Code and AI tools. You MUST read it fully before any code change._

---

## MANDATORY FIRST STEP

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

---

## Key Files

```
dreampath.html              — Dreampath 전용 인라인 CSS 전체
js/dreampath.js             — Dreampath 프론트엔드 로직 전체 (IIFE)
functions/api/dreampath/    — Dreampath API 엔드포인트 전체
functions/_shared/auth.js   — 인증 코어 (수정 금지 without sign-off)
deploy.sh                   — 배포 + 버전 자동 등록 스크립트
css/style.css               — 메인 사이트 공유 스타일시트
js/main.js                  — 메인 사이트 공유 유틸리티 (GW namespace)
js/board.js                 — 게시판 렌더링 (GW.Board)
js/admin.js                 — 어드민 패널 로직
```

---

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

### Rich Text Editor (게시글)
- **에디터**: Tiptap (esm.sh CDN) — `@tiptap/core@2`, `@tiptap/starter-kit@2`
- **뷰어**: DOMPurify (cdnjs CDN) — 모든 HTML 출력에 적용 필수
- 기존 plain-text 게시글 → `_legacyToHtml()` 자동 변환 (하위 호환)
- `_destroyTiptap()`은 `closeModal()`에서 자동 호출됨

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

---

## Authentication Details

- **Main site admin**: HMAC-SHA256 token → `sessionStorage` (24h)
- **Dreampath**: cookie `dp_session=1` (httpOnly, 1h) + `localStorage` user profile
- 세션 타이머: 1h, 5분 전 경고 팝업 → 연장 가능
- `functions/api/dreampath/_middleware.js` — 모든 Dreampath API 인증 미들웨어

---

## Main Site (BP Post / 길웰 미디어) Overview

- URL: `bpmedia.net`
- 게시판: `korea`, `apr`, `worm` (3개 카테고리)
- 에디터: Editor.js (block-based, 메인 사이트 기사 작성용)
- 게시글 렌더러: `GW.renderEditorContent()` in `js/main.js`
- 관련 파일: `js/board.js`, `js/post-page.js`, `js/admin-v3.js`

---

_Dev Rules 풀 버전은 Dreampath 앱 (`/dreampath` → Dev Rules)에서 항상 최신본을 확인하십시오._
_Full Dev Rules: always check the Dreampath app (`/dreampath` → Dev Rules sidebar) for the canonical up-to-date version._
