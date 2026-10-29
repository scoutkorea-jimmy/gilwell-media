---
tags: [ai-guide, common, entry-point, project-root]
aliases: [AI Rules, Dev Rules, AGENTS, 프로젝트 규칙]
scope: project
---

# CLAUDE.md / AGENTS.md — Gilwell Media 진입점

> [!danger] 이 파일은 진입점일 뿐입니다 — 규칙 원본은 `rules/` 디렉토리입니다
> **모든 AI(Claude Code / Codex / ChatGPT 등)는 코드를 한 줄이라도 수정하기 전에 반드시**
> **1) [`rules/README.md`](rules/README.md) 를 읽고 → 2) 라우팅 표에 따라 해당 규칙 파일을 실제로 읽은 뒤 작업한다.**
> "대충 기억나는 규칙"으로 진행 금지. 규칙 파일을 읽지 않은 작업은 무효이며, 되돌려야 한다.
> 이 파일은 **100줄을 넘기지 않는다** — 새 규칙은 여기가 아니라 `rules/` 안에 추가한다.

## 필수 3단계 (예외 없음)

1. **[rules/00-target-protocol.md](rules/00-target-protocol.md)** — ① `git fetch origin` 동기화 점검 → ② P0 이슈 점검 → ③ 타겟 식별·선언
2. **[rules/01-common-infra.md](rules/01-common-infra.md)** — 아키텍처 / DB / 인증 / 절대 금지 사항
3. 타겟별 규칙 파일 (아래 표) — 배포가 포함되면 `02` + `03` 추가

## 규칙 파일 라우팅

| 타겟 | 대표 경로 | 읽을 파일 |
|---|---|---|
| **Site** — 공개 홈페이지 | `index.html`, `korea.html`, `apr.html`, `wosm.html`, `people.html`, `js/main.js`, `js/board.js`, `js/post-page.js`, `functions/api/*` | [10-site.md](rules/10-site.md) |
| **Site (디자인)** — 색·서체·대비 | `css/style.css`, 팔레트·APCA | + [11-site-design.md](rules/11-site-design.md) |
| **Admin** — 관리자 페이지 | `admin.html`, `js/admin-v3.js`, `js/admin-*.js`, `css/admin.css` | [20-admin.md](rules/20-admin.md) |
| **KMS** — 운영 기준 원본 | 관리자 KMS 메뉴, `kms.html`, `js/kms.js`, `docs/feature-definition.md` | [30-kms.md](rules/30-kms.md) |
| **Dreampath** — CUFS 내부 앱 | `dreampath/index.html`, `dreampath/app.js`, `functions/api/dreampath/**` | [40-dreampath.md](rules/40-dreampath.md) → **[dreampath/DREAMPATH.md](dreampath/DREAMPATH.md)** |
| **공용 인프라** | `functions/_middleware.js`, `functions/_shared/**`, `_headers` | [01](rules/01-common-infra.md) + [40](rules/40-dreampath.md) (Dreampath 영향 확인) |
| **배포·버전** | `VERSION`, `ADMIN_VERSION`, `data/changelog.json`, `scripts/*` | [02-versioning.md](rules/02-versioning.md) + [03-deploy.md](rules/03-deploy.md) |

전체 목록·상세 라우팅: **[rules/README.md](rules/README.md)**

## 잊지 말 것 (요약 — 상세는 규칙 파일에)

> [!danger] 절대 금지 (전문: [rules/01-common-infra.md](rules/01-common-infra.md))
> `functions/_shared/auth.js` 무단 수정 · DOMPurify 없는 `innerHTML` · 토큰 `localStorage` 저장 ·
> 기존 DB 컬럼 삭제/타입 변경 · 배포 스크립트 우회 · `dreampath/app.js` 모듈화 · 시크릿 커밋

- **타겟 규칙 혼용 금지** — Site/Admin 에 Dreampath 규칙(IIFE, `DP.`, `dp_`, Tiptap)을 섞지 않는다. 반대도 금지.
- **배포 = 버전 bump + changelog 엔트리** 한 세트. 하나라도 빠지면 preflight 가 차단한다.
- **AI 배포 프로토콜** — Site 는 질문 후 진행 / Admin·KMS·Dreampath 는 자동 진행.
- **KMS 가 1순위 원본** — 코드 변경으로 운영 기준을 역산하지 않는다.

## 이 파일을 수정할 때

- 규칙 본문을 여기에 다시 적지 않는다. **`rules/` 안의 해당 파일에만** 적고, 필요하면 위 표에 링크 한 줄을 추가한다.
- 100줄 상한을 넘기면 내용을 `rules/` 로 옮긴다.
- Codex 는 `AGENTS.md`(이 파일의 심볼릭 링크)로 접근하므로 별도 동기화가 필요 없다.
