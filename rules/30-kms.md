---
tags: [ai-guide, rules, kms]
aliases: [KMS Rules, 운영 기준 원본]
scope: project
---

# 30 · [KMS] 운영 기준 원본

> [!abstract] Scope
> KMS = 운영 기준의 **정식 원본**. 코드가 아니라 운영 문서 영역.

## 원본 우선순위

| 위치 | 역할 | 우선순위 |
|---|---|---|
| 관리자 페이지 KMS (`/admin.html` → KMS 메뉴) | **정식 원본** | 1순위 |
| [[docs/feature-definition\|Feature Definition]] | KMS 보조 스냅샷 | 2순위 |
| [[docs/features/README\|Homepage Features Hub]] | 기능 중심 탐색 | 참고 |

## KMS 작업 규칙

- 코드 변경으로 KMS 기준을 역산하지 말 것 — KMS가 1순위 원본
- KMS 변경 → Feature Definition 스냅샷 갱신 → Site/Admin 코드 반영 순서
- `kms.html`은 공개 뷰어 (편집은 관리자 KMS에서)
- KMS 변경은 `ADMIN_VERSION` bump + changelog 엔트리 대상 ([02-versioning.md](02-versioning.md))

## D1 갱신 시 주의 (100KB 한계)

`settings.feature_definition` 전체 블롭을 단일 SQL로 넣으면 `SQLITE_TOOBIG` 이 난다.
- 관리자 PUT API(파라미터 바인딩) 또는 값 분할 `INSERT + UPDATE value||'...'` 사용
- **D1 을 먼저 갱신**한 뒤 `sync_kms_snapshot.mjs` 로 md·default.js 재생성
- `docs/feature-definition.md` 를 직접 편집하면 다음 sync 에 덮인다

## 프로덕션 영향 버그 → 케이스 스터디 기록

프로덕션에 영향을 준 버그를 고친 뒤에는 KMS 에 **원인 + 재발 방지 규칙**을 남긴다.
- 해당 기능 섹션 `X.Y.1` 에 케이스 스터디 추가
- Section 14 체크리스트에 방지 항목 추가
- D1 동기화까지 완료해야 기록이 끝난 것으로 본다
