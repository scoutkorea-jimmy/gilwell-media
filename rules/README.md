---
tags: [ai-guide, rules, index, entry-point]
aliases: [Rules Index, 규칙 인덱스]
scope: project
---

# rules/ — Gilwell Media 개발 규칙 원본

> [!danger] 이 디렉토리가 유일한 규칙 원본입니다
> 모든 AI(Claude Code / Codex / ChatGPT 등)와 사람은 **코드를 한 줄이라도 수정하기 전에**
> 아래 라우팅 표에 따라 해당 규칙 파일을 **실제로 읽고** 작업한다.
> `CLAUDE.md` / `AGENTS.md` 는 이 디렉토리를 가리키는 **진입점**일 뿐이며, 규칙 본문을 담지 않는다.

## 읽는 순서 (모든 작업 공통)

1. **[00-target-protocol.md](00-target-protocol.md)** — Git 동기화 → P0 점검 → 타겟 식별. **예외 없이 항상 먼저.**
2. **[01-common-infra.md](01-common-infra.md)** — 아키텍처 / DB / 인증 / 절대 금지 사항.
3. 타겟별 규칙 파일 (아래 표).
4. 배포가 포함되면 **[02-versioning.md](02-versioning.md)** + **[03-deploy.md](03-deploy.md)**.

## 라우팅 표 — 무엇을 만질 때 무엇을 읽나

| 건드리는 대상 | 타겟 | 반드시 읽을 파일 |
|---|---|---|
| `index.html`, `korea.html`, `apr.html`, `wosm.html`, `people.html`, `js/main.js`, `js/board.js`, `js/post-page.js`, `functions/api/*` (dreampath 제외) | **Site** | `00` + `01` + [10-site.md](10-site.md) |
| `css/style.css`, 색상·서체·간격·대비 변경 | **Site** | 위 + [11-site-design.md](11-site-design.md) |
| `admin.html`, `js/admin-v3.js`, `js/admin-*.js`, `css/admin.css`, 관리자 전용 API | **Admin** | `00` + `01` + [20-admin.md](20-admin.md) |
| 관리자 KMS 메뉴, `kms.html`, `js/kms.js`, `docs/feature-definition.md` | **KMS** | `00` + `01` + [30-kms.md](30-kms.md) |
| `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/**`, `img/dreampath/**` | **Dreampath** | [40-dreampath.md](40-dreampath.md) → **[DREAMPATH.md](../DREAMPATH.md)** |
| `functions/_middleware.js`, `functions/_shared/**`, `_headers` | **공용 인프라** | `01` + [40-dreampath.md](40-dreampath.md) (Dreampath 영향 확인 필수) |
| `VERSION`, `ADMIN_VERSION`, `data/changelog.json`, `scripts/*` | **배포** | [02-versioning.md](02-versioning.md) + [03-deploy.md](03-deploy.md) |

## 파일 목록

| 파일 | 내용 |
|---|---|
| [00-target-protocol.md](00-target-protocol.md) | Target Confirmation Protocol (Step 0~5, 체크리스트, 예시) |
| [01-common-infra.md](01-common-infra.md) | 아키텍처 / DB / 인증 / **절대 금지 9개** / 문서 축 |
| [02-versioning.md](02-versioning.md) | VERSION·ADMIN_VERSION·ASSET_VERSION bump 규칙 + changelog 포맷 |
| [03-deploy.md](03-deploy.md) | 표준 배포 7단계 / 스크립트 역할 / AI 배포 프로토콜 / 흔한 실패 |
| [10-site.md](10-site.md) | [Site] 공개 홈페이지 규칙 |
| [11-site-design.md](11-site-design.md) | [Site] 디자인 규칙 + 브랜드 팔레트 + APCA 접근성 |
| [20-admin.md](20-admin.md) | [Admin] 관리자 페이지 규칙 + 권한 게이팅 |
| [30-kms.md](30-kms.md) | [KMS] 운영 기준 원본 규칙 |
| [40-dreampath.md](40-dreampath.md) | [Dreampath] 포인터 + 공용 인프라 영향 |
| [90-related-docs.md](90-related-docs.md) | 보조 문서 지도 / 작업 효율성 노트 / Obsidian 그래프 |

## 규칙 파일을 수정할 때

- **규칙 본문은 반드시 이 디렉토리 안에서만** 늘린다. `CLAUDE.md` 에 규칙을 다시 적지 않는다 (100줄 상한).
- 새 규칙 파일을 추가하면 이 README 의 **파일 목록 + 라우팅 표**를 함께 갱신한다.
- KMS 기준과 충돌하면 **관리자 KMS 가 1순위 원본** — 자세한 건 [30-kms.md](30-kms.md).
- Dreampath 규칙은 여기가 아니라 `DREAMPATH.md` 에 적는다 (별도 저장소 분리 예정).
