---
tags: [ai-guide, rules, common, infrastructure]
aliases: [Common Infrastructure, 공통 인프라]
scope: project
---

# 01 · Common Infrastructure (모든 타겟 공통)

## Architecture

| Layer | Stack |
|---|---|
| Hosting | Cloudflare Pages (static, no build step) |
| API | Cloudflare Workers (`/functions/api/`) |
| Database | Cloudflare D1 (SQLite, binding: `env.DB`) |
| Storage | Cloudflare R2 (`POST_IMAGES` 버킷) |
| Auth | HMAC-SHA256 signed cookie (`functions/_shared/auth.js`) |

- Wrangler: `/opt/homebrew/bin/wrangler` (필요 시 `export PATH="/opt/homebrew/bin:$PATH"`)

## Database Rules

> [!important] DB 변경 규칙
> - D1 binding: `env.DB`
> - 테이블 접두사: Dreampath = `dp_`, Site/Admin = 접두사 없음
> - **기존 컬럼 삭제/변경 금지** — `ALTER TABLE ADD COLUMN`만 허용
> - 스키마 변경 시 마이그레이션 계획 필요

## Authentication

| 타겟 | 방식 |
|---|---|
| Site/Admin | HMAC-SHA256 signed admin cookie (24h) |
| Dreampath | `dp_session=1` httpOnly cookie (1h) + localStorage profile, 5분 전 갱신 경고 |

- Dreampath 미들웨어: `functions/api/dreampath/_middleware.js`
- 인증 코어: `functions/_shared/auth.js`

## Critical Prohibitions (모든 타겟)

> [!danger] 절대 금지 사항
> 1. `functions/_shared/auth.js` — 승인 없이 수정 금지
> 2. 사용자 입력 HTML → **DOMPurify 없이 `innerHTML` 금지**
> 3. 인증 토큰을 `localStorage`에 저장 금지 (httpOnly 쿠키 사용)
> 4. 기존 DB 컬럼 삭제/타입 변경 금지
> 5. 배포 스크립트 우회 및 버전 등록 생략 금지
> 6. `dreampath/app.js` IIFE 구조 분리/모듈화 금지
> 7. CDN URL 변경 시 버전 고정 확인 필수
> 8. `.env` 또는 시크릿 값 커밋 금지
> 9. `dp_post_approvals` INSERT 시 `approver_id` (NOT NULL) 필수

## 공용 인프라 파일 — 교차 영향 주의

`functions/_middleware.js`, `functions/_shared/**`, `_headers` 는 **Site / Admin / KMS / Dreampath 전부**에 영향을 준다.
이 파일들을 수정할 때는 [40-dreampath.md](40-dreampath.md) 와 `dreampath/DREAMPATH.md` Section 10 (CSP 레거시 경로) · Section 15.2 (공용 인프라 예외) 를 반드시 함께 확인한다.

## 저장소 구조 — 공개 / 내부 경계

> [!important] 저장소 루트 = 사이트 루트
> Pages 는 저장소 루트를 그대로 서빙한다. **아래 "공개" 항목은 이름이 곧 URL 이므로 이동·개명 금지** —
> 옮기는 순간 캐시 토큰(`?v=`)·canonical·sitemap·외부 링크·`sync_versions.sh` 정규식이 전부 깨진다.

| 구분 | 항목 | 비고 |
|---|---|---|
| **공개 (이동 금지)** | `*.html`, `css/`, `js/`, `img/`, `data/`, `functions/` | 이름 = URL |
| | `card-news-app/` | `functions/card-news/[id].js` 가 `.jsx` 를 브라우저 Babel 로 변환 |
| | `dreampath/` | Dreampath 앱 일체 (index.html·app.js·img·templates·vendor·DREAMPATH.md). 2026-07-21 통합 |
| | `_headers`, `_redirects`, `VERSION` 계열 | |
| **내부 (차단 대상)** | `rules/`, `docs/`, `db/`, `scripts/`, `workers/`, `tests/` | 미들웨어가 404 |
| | `CLAUDE.md`, `README.md`, `wrangler*.toml`, `package.json` 등 | |

- **Dreampath 는 `dreampath/` 한 곳** — 2026-07-21 통합. 별도 도메인 분리 시 이 디렉토리와 `functions/api/dreampath/` 만 옮기면 된다.
- **DB 마이그레이션은 `db/` 한 곳** — 과거 루트 `migrations/` 와 이원화돼 있던 것을 2026-07-21 통합.
- **분석 산출물(`output/` 등)은 커밋 금지** — `.gitignore` 에 두고 재생성 스크립트만 남긴다.
- `scripts/`(190곳)·`docs/`(146곳)는 KMS 본문에까지 경로가 박혀 있어 **이동 비용이 이득을 압도한다**. 건드리지 말 것.

## 배포 노출 경계 (2026-07-21 확립)

> [!danger] `wrangler pages deploy .` 는 저장소 루트를 통째로 업로드한다
> 저장소에 파일을 추가하면 **기본적으로 공개 URL 로 읽힌다**. 내부 파일을 새로 추가할 때는
> 반드시 차단 목록에 넣는다.

- **차단 지점**: [`functions/_middleware.js`](../functions/_middleware.js) `isBlockedInternalPath()` — `next()` 호출 전에 404 반환. `BLOCKED_PREFIXES` / `BLOCKED_FILES` 에 추가한다.
- **`.assetsignore` 는 쓰지 말 것** — Cloudflare Pages 배포 경로에서 **무시된다**(2026-07-21 실측: 배포 후에도 전 경로 200). 차단했다고 착각하게 만들 뿐이다.
- **차단하면 안 되는 것** (런타임이 fetch 함 — 넣으면 기능이 죽는다):
  `/dreampath/*`(앱 일체 — app.js·img·templates·DREAMPATH.md) · `/card-news-app/*`(브라우저 Babel 변환) ·
  `/data/*`(changelog) · `/VERSION` 계열
  단, `/dreampath/DREAMPATH-HISTORY.md` 와 `/dreampath/deploy.sh` 는 내부 문서라 개별 차단한다.
- **검증은 반드시 라이브 curl 로** — 차단 대상은 404, 위 목록은 200 인지 배포 후 확인한다.
- **한계**: Pages 는 과거 배포를 해시 URL 로 영구 보존한다. 차단은 신규 노출만 막고 이미 나간 것은 회수하지 못한다. → 애초에 민감 파일을 커밋하지 않는 것이 유일한 예방책.
- **D1 덤프 금지**: 분석 산출물(`output/` 등)은 `.gitignore` 에 두고 커밋하지 않는다. 재생성 스크립트만 저장소에 남긴다.

## Documentation Axis (공통)

- Obsidian 문서 구조는 **feature / module-first** 원칙.
- 페이지는 최상위 축이 아니라 기능 조합의 **surface node**.
- 동일 기능을 여러 페이지 설명으로 복제하지 말고 Feature Hub + Module 라이브러리로 링크 집약.
- **규칙 문서는 `rules/` 가 단일 원본** — 같은 규칙을 `CLAUDE.md` 나 docs 에 중복 기술하지 않는다.
