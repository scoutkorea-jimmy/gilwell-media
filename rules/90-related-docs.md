---
tags: [ai-guide, rules, docs, map]
aliases: [Related Docs, 보조 문서 지도]
scope: project
---

# 90 · 보조 문서 지도

> 규칙의 **원본은 `rules/`**. 아래 문서들은 규칙이 아니라 **레퍼런스·인벤토리·이력**이다.

## 작업 효율성 노트 (Site / Admin)

> [!info] 매 턴 자동 로드되지 않음 — 필요 시 직접 읽기
> 실작업 인사이트(Enum 카탈로그 동기화, PUT 권한 게이트, 모달 패턴, P0 transient 판별 등)는
> 토큰 절감을 위해 **[docs/working-notes.md](../docs/working-notes.md)** 로 분리되어 있다.
>
> **언제 읽어야 하나:**
> - 신규 admin 패널 / 모달 / 카탈로그 추가
> - Site/Admin 회귀 버그 디버깅
> - `homepage_issues` 에 새 severity·code 추가
> - P0 점검 시 transient 패턴 판별
>
> 새 인사이트 발견 시 working-notes.md 상단에 prepend.

## Site / Admin

- [[docs/working-notes|작업 효율성 노트]] — 실작업 인사이트 (회귀 디버깅·신규 기능 착수 시 직접 읽기)
- [[docs/features/README|Homepage Features Hub]] — 기능 중심 진입점
- [[docs/features/Feature Map|Feature Map]] — 전체 기능 맵
- [[docs/modules/README|Homepage Modules Hub]] — 모듈 라이브러리
- [[docs/modules/Homepage Runtime Map|Runtime Map]] — 런타임 의존성

## KMS

- [[docs/feature-definition|Feature Definition]] — KMS 보조 스냅샷
- [[docs/homepage-module-inventory|Module Inventory]] — 모듈 인벤토리

## Dreampath

- **[dreampath/DREAMPATH.md](../dreampath/DREAMPATH.md)** — AI 작업 규칙 (단일 원본)
- **[dreampath/DREAMPATH-HISTORY.md](../dreampath/DREAMPATH-HISTORY.md)** — 버전 히스토리 / 케이스 스터디 (국·영 병기)
- [[docs/dreampath/README|Dreampath Hub]] — 기능/API/DB 레퍼런스 (공용 문서)

## 운영 (공통)

- [[docs/release-playbook|Release Playbook]] — 배포 절차
- [[docs/ops-runbook|Ops Runbook]] — 운영 런북
- [[docs/stability-implementation-plan|Stability Plan]] — 안정성 로드맵
- [[docs/hardcoding-inventory|Hardcoding Inventory]] — 하드코딩 감사

## Obsidian Graph Map

```
[entry]     CLAUDE.md (= AGENTS.md) ── rules/README.md ← 규칙 원본
                │
[common]        ├─ 00 Target Protocol ── 01 Common Infra ── 02 Versioning ── 03 Deploy
                │
[site]          ├─ 10 Site ── 11 Site Design
                │       └─ Features Hub ── Modules Hub
                │
[admin]         ├─ 20 Admin ── Admin V3 Runtime ── Module Inventory
                │
[kms]           ├─ 30 KMS ── Feature Definition (snapshot)
                │
[dreampath]     └─ 40 Dreampath (pointer) ── DREAMPATH.md ── DREAMPATH-HISTORY.md
                │
[ops]       Release Playbook ── Ops Runbook ── Stability Plan ── Hardcoding Inventory
```
