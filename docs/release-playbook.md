---
tags: [ops, deployment, playbook]
aliases: [Release Playbook, 배포 절차]
---

# Release Playbook

## 목적

배포가 Git 자동 반영에만 의존하지 않도록, 현재 운영 기준의 production 배포와 실환경 검수 절차를 고정한다.

## 표준 순서

1. `git status --short`로 워크트리 확인
2. `cat VERSION`으로 현재 Site 버전 확인
3. `cat ADMIN_VERSION`으로 현재 Admin 버전 확인
4. `./scripts/sync_versions.sh`로 버전 문자열 동기화
5. `./scripts/release_preflight.sh`로 `main` 브랜치 / 깨끗한 워크트리 / 버전 정합성 확인
6. 필요한 경우 기능 변경 커밋 반영
7. 필요하면 `./scripts/post_deploy_check.sh <url>` 기준 점검 항목을 먼저 준비
8. `접속 국가/도시` 관련 변경이면 `./scripts/ensure_site_visits_geo_columns.sh gilwell-posts --remote` 선실행
9. `main` 기준 production 배포
10. 라이브 검증

관리자 콘솔과 KMS 변경은 공개 사이트 production 검수 게이트와 분리한다.
관리자(KMS 포함) 변경은 관리자 실환경에서 직접 확인하며, 공개 페이지 변경이 없으면 production 체크리스트 통과를 완료 조건으로 삼지 않는다.

## Production 배포

항상 `main` 브랜치의 깨끗한 워크트리에서 진행한다.

기본 경로:

1. `git switch main`
2. `git status --short`가 비어 있는지 확인
3. `./scripts/release_preflight.sh` 실행
4. `./scripts/deploy_production.sh` 실행
5. 배포 직후 `./scripts/post_deploy_check.sh https://bpmedia.net` 실행
6. 홈, 대표 기사, 카테고리, 검색, 용어집, 관리자 핵심 화면을 직접 확인

직접 실행이 필요하면:

```bash
./scripts/release_preflight.sh
wrangler pages deploy . --project-name gilwell-media --branch main
```

## Production 배포 후 확인

```bash
./scripts/post_deploy_check.sh https://bpmedia.net
```

추가 확인:

- 홈, 대표 기사, 카테고리, 검색, 용어집, 관리자 화면 응답
- RSS 응답
- 공개 posts API의 `publish_at`
- 관리자 세션 401
- D1의 `created_at` / `publish_at` / `updated_at` 컬럼 존재

## 운영 DB 적용 / 복구

- 신규 설치는 `db/schema.sql`만 적용한다.
- 기존 운영 DB는 `db/migration_*.sql` 중 누락된 파일만 순서대로 적용한다.
- 로컬 초기화는 `./scripts/bootstrap_local_db.sh gilwell-posts`를 사용한다.
- 스키마/시드 점검은 `./scripts/smoke_check.sh gilwell-posts`로 확인한다.
- 현재 저장소 기준 최신 마이그레이션은 `db/migration_055.sql`이다.
- R2를 사용할 경우 Pages Functions에 `POST_IMAGES` 버킷 바인딩을 추가한다.
- 기존 D1 base64 이미지를 R2로 옮길 때는 `node ./scripts/migrate_existing_images_to_r2.mjs gilwell-posts gilwell-media-images https://bpmedia.net`를 사용한다.
- Cloudflare 기반 분석을 쓰려면 Pages secret `CF_ANALYTICS_API_TOKEN`을 설정한다.
- `접속 국가/도시` 관련 배포 전에는 `./scripts/ensure_site_visits_geo_columns.sh gilwell-posts --remote`로 원격 D1 지리 컬럼과 인덱스를 먼저 선반영한다.

```bash
wrangler d1 execute gilwell-posts --remote --file=./db/migration_055.sql
```

## Functions 로그 확인 루틴

1. Cloudflare Dashboard → Workers & Pages → `gilwell-media`
2. `Observability` 또는 배포 상세의 로그 화면 진입
3. `/api/admin/*`, `/api/posts/*`, `/api/analytics/visit` 실패 로그 확인
4. 배포 직후에는 로그인, 글쓰기, 메타 설정, 분석 탭 API를 우선 점검

CLI 예시:

```bash
wrangler pages deployment list --project-name gilwell-media
```

## 참고

- 현재 서비스 도메인: `https://bpmedia.net`
- Pages 프로젝트명: `gilwell-media`
- Release snapshot 브랜치명: `release-history`
- 현재 버전 규칙: `Va.bbb.cc`
- `a`는 오너가 직접 올리라고 한 경우에만 증가한다.
- `bbb`는 기능 추가가 있을 때만 증가한다.
- `cc`는 버그 수정, 배너 위치 조정 같은 사소한 수정에만 증가한다.
- `bbb`가 올라가면 `cc`는 반드시 `00`으로 초기화한다.
- production 배포는 `main`의 깨끗한 워크트리에서만 진행한다.
- `wrangler pages deploy ...`를 직접 사용할 때도 반드시 `./scripts/release_preflight.sh`를 먼저 통과해야 한다.
- Git 자동 배포가 지연되거나 누락될 수 있으므로, production `Deployments`의 커밋 SHA와 응답 버전을 같이 확인한다.
- 관리자(KMS 포함) 변경은 공개 사이트 production QA를 필수 게이트로 두지 않는다.
