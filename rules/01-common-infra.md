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
> 6. `js/dreampath.js` IIFE 구조 분리/모듈화 금지
> 7. CDN URL 변경 시 버전 고정 확인 필수
> 8. `.env` 또는 시크릿 값 커밋 금지
> 9. `dp_post_approvals` INSERT 시 `approver_id` (NOT NULL) 필수

## 공용 인프라 파일 — 교차 영향 주의

`functions/_middleware.js`, `functions/_shared/**`, `_headers` 는 **Site / Admin / KMS / Dreampath 전부**에 영향을 준다.
이 파일들을 수정할 때는 [40-dreampath.md](40-dreampath.md) 와 `DREAMPATH.md` Section 10 (CSP 레거시 경로) · Section 15.2 (공용 인프라 예외) 를 반드시 함께 확인한다.

## Documentation Axis (공통)

- Obsidian 문서 구조는 **feature / module-first** 원칙.
- 페이지는 최상위 축이 아니라 기능 조합의 **surface node**.
- 동일 기능을 여러 페이지 설명으로 복제하지 말고 Feature Hub + Module 라이브러리로 링크 집약.
- **규칙 문서는 `rules/` 가 단일 원본** — 같은 규칙을 `CLAUDE.md` 나 docs 에 중복 기술하지 않는다.
