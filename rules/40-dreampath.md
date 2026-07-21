---
tags: [ai-guide, rules, dreampath, pointer]
aliases: [Dreampath Pointer]
scope: project
---

# 40 · [Dreampath] CUFS 내부 앱 — 포인터

> [!important] 이 파일은 포인터입니다
> Dreampath 관련 **모든** AI 작업 규칙은 **[DREAMPATH.md](../DREAMPATH.md)** 에 있습니다.
> 케이스 스터디 / 버전 히스토리는 **[DREAMPATH-HISTORY.md](../DREAMPATH-HISTORY.md)** 에 있습니다.
> `rules/` 의 나머지 파일은 Site / Admin / KMS 전용입니다.
>
> **왜 분리했는가**: Dreampath 는 별도 도메인 독립 예정. 지금부터 문서 경계를 잘라 두면,
> 이전 시점에 두 파일만 새 저장소로 옮기면 됩니다. Dreampath 규칙을 `rules/` 안에 적지 마세요.

## Dreampath 판별 (빠른 참조)

| 경로 | 문서 원본 |
|---|---|
| `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/**`, `img/dreampath/**` | **[DREAMPATH.md](../DREAMPATH.md)** (Dev Rules) |
| `functions/_middleware.js`, `functions/_shared/**`, `_headers` | **[01-common-infra.md](01-common-infra.md)** (공용 인프라) — Dreampath 영향 주의 |

`functions/_middleware.js` 등 공용 인프라를 만질 때 Dreampath 가 영향을 받을 수 있습니다.
이때는 `DREAMPATH.md` Section 10 ("CSP: `/dreampath` 레거시 경로") 와 Section 15.2
("공용 인프라 예외") 를 반드시 함께 확인합니다.

## 공용 인프라 변경이 Dreampath 에 미치는 영향 (역사적 사례)

- 2026-04-24 CSP 회귀: `isLegacyInlinePath()` 에 `/dreampath` 누락 → 사이드바 전체 마비.
  상세: `DREAMPATH-HISTORY.md` 2026-04-24 · A.

이런 변경을 반영할 때는 `VERSION` bump + `data/changelog.json` 엔트리에
"Dreampath 영향: ..." 명시 필수 (`dp_versions` 에는 기록되지 않음).

## 배포

Dreampath 는 `./deploy.sh feature/fix "..."` 로 **자동 배포**한다 (질문 없이 진행).
자체 버전 bump(`dp_versions` 테이블)와 cache-bust 를 스크립트가 처리하며,
`sync_versions.sh` / `data/changelog.json` 경로는 사용하지 않는다.
배포 명령은 wrangler 배너 문제 때문에 `CI=1` 을 앞에 붙인다 ([03-deploy.md](03-deploy.md)).
