---
tags: [ai-guide, rules, common, deploy, release]
aliases: [Release Flow, Deploy Rules, 배포 규칙]
scope: project
---

# 03 · Release & Deploy Flow (Site / Admin / KMS)

> [!important] 표준 배포 순서 (생략 금지)
> 이 순서를 지키지 않으면 preflight가 실패하거나 브라우저 캐시 문제로 변경이 반영되지 않는다.
> 버전 bump·changelog 작성 규칙은 [02-versioning.md](02-versioning.md) 참조.

```
1. 코드 변경 (CSS/JS/HTML)
2. VERSION / ADMIN_VERSION 적절히 bump
3. data/changelog.json 맨 앞에 엔트리 prepend (bump된 모든 버전에 대해)
4. ./scripts/sync_versions.sh         # ASSET_VERSION 갱신 + HTML·JS 버전 문자열 전파
5. git add . && git commit            # 코드 + 버전 + changelog + 동기화된 HTML 한 번에
6. git push origin main               # preflight가 main 브랜치 요구
7. ./scripts/deploy_production.sh     # preflight + wrangler pages deploy + post-deploy checks
```

## 각 스크립트 역할

| 스크립트 | 역할 |
|---|---|
| `sync_versions.sh` | `ASSET_VERSION` UTC 타임스탬프 갱신, 모든 HTML의 `?v=` 토큰과 `GW.APP_VERSION` / `GW.ADMIN_VERSION` / `GW.ASSET_VERSION` 값 일괄 치환 |
| `verify_release_metadata.sh` | VERSION/ADMIN_VERSION/ASSET_VERSION ↔ `js/main.js`·HTML·changelog 정합성 검증. 실패 시 배포 차단 |
| `release_preflight.sh` | `main` 브랜치 + clean tracked worktree + 메타데이터 검증. 실패 시 배포 차단 |
| `deploy_production.sh` | preflight → `wrangler pages deploy` → `post_deploy_check` → `audit_public_posts` → release snapshot |
| `post_deploy_check.sh` | 라이브 사이트의 VERSION 일치 확인 |

**환경:** wrangler 호출 전 `export PATH="/opt/homebrew/bin:$PATH"`

## 흔한 배포 실패 & 방지

> [!warning] KMS 13.1.7 케이스
> - **순서 의존 단계는 순차 실행** — D1 마이그레이션 → commit → push → deploy를 한 번에 병렬 호출하지 말 것. 앞 단계가 권한 게이트·오류로 막히면 뒤따르는 단계가 모두 취소된다.
> - **배포 전 메타데이터 게이트 먼저** — 전체 `deploy_production.sh`를 돌리기 전에 `./scripts/verify_release_metadata.sh`를 단독 실행해 통과시킨다(특히 changelog 엔트리 누락 조기 발견).
> - **배포 "성공"은 라이브로 검증** — 스크립트 출력 텍스트가 아니라 `curl .../VERSION` + 대상 엔드포인트 응답으로 확정한다.
> - **KMS(`settings.feature_definition`) CLI 갱신은 100KB 한계 주의** — 전체 블롭 단일 SQL은 `SQLITE_TOOBIG`. 관리자 PUT API(파라미터 바인딩) 또는 값 분할 `INSERT + UPDATE value||'...'` 사용. D1을 먼저 갱신한 뒤 `sync_kms_snapshot.mjs`로 md·default.js 재생성(md 직접 편집은 다음 sync에 덮인다).

> [!warning] wrangler 배너가 `deploy.sh` JSON 파싱을 깨뜨림
> wrangler 4.97 이후 skills 안내 배너가 stdout에 섞여 `deploy.sh` 파싱이 실패한다. 배포 명령은 `CI=1` 을 앞에 붙여 실행한다.

> [!warning] Cloudflare 커밋 메시지 제한
> `./deploy.sh` 가 `Invalid commit message` 로 실패하면 커밋 메시지를 **ASCII 전용 · 약 1.2KB 미만**으로 amend 한 뒤 재시도한다.

## AI Deployment Protocol (Target별)

| Target | 작업 완료 시 |
|---|---|
| **Site** (공개 홈페이지) | ⚠ 사용자에게 **배포·커밋 여부 질문 후 진행** |
| **Admin** | ✅ 자동 (질문 없이 commit + push + deploy) |
| **KMS** | ✅ 자동 (코드 + D1 변경 포함) |
| **Dreampath** | ✅ 자동 (`./deploy.sh feature/fix "..."`) |

- **복합 타겟 작업 (Site 포함):** Site 규칙 우선 — 질문 후 진행.
- 승인이 떨어진 뒤에는 **미루지 말고 즉시** commit → push → deploy 한다. **프리뷰 배포는 사용하지 않는다** — 바로 프로덕션에 올리고 검증은 배포 후 라이브로 수행한다.
- **Dreampath는 별도 배포** — `./deploy.sh`가 자체 버전 bump(`dp_versions` 테이블)와 cache-bust를 처리하며, `sync_versions.sh` / `changelog.json` 경로를 사용하지 않는다. 상세는 [DREAMPATH.md](../DREAMPATH.md) 참조.

## 프로덕션 영향 버그를 고친 뒤

원인과 재발 방지 규칙을 **KMS 에 케이스 스터디로 기록**한다 (해당 Section X.Y.1 + Section 14 체크리스트 + D1 동기화). 자세한 절차는 [30-kms.md](30-kms.md).
