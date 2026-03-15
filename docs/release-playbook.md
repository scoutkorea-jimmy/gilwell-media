# Release Playbook

## 목적

배포가 Git 자동 반영에만 의존하지 않도록, 수동 배포와 검증 절차를 고정한다.

## 표준 순서

1. `git status --short`로 워크트리 확인
2. `cat VERSION`으로 현재 버전 확인
3. 필요한 경우 기능 변경 커밋 반영
4. Cloudflare Pages 수동 배포
5. 배포 후 라이브 검증

## 수동 배포

```bash
./scripts/deploy_pages.sh
```

직접 실행이 필요하면:

```bash
wrangler pages deploy . --project-name gilwell-media
```

## 배포 후 확인

```bash
./scripts/post_deploy_check.sh
```

## 운영 DB 적용 / 복구

- 신규 설치는 `db/schema.sql`만 적용한다.
- 기존 운영 DB는 `db/migration_*.sql` 중 누락된 파일만 순서대로 적용한다.
- 로컬 초기화는 `./scripts/bootstrap_local_db.sh gilwell-posts`를 사용한다.
- 스키마/시드 점검은 `./scripts/smoke_check.sh gilwell-posts`로 확인한다.
- 현재 최신 마이그레이션 기준은 `db/migration_016.sql`까지다.
- R2를 사용할 경우 Pages Functions에 `POST_IMAGES` 버킷 바인딩을 추가한다.
- 기존 D1 base64 이미지를 R2로 옮길 때는 `node ./scripts/migrate_existing_images_to_r2.mjs gilwell-posts gilwell-media-images https://bpmedia.net`를 사용한다.
- Cloudflare 기반 분석을 쓰려면 Pages secret `CF_ANALYTICS_API_TOKEN`을 설정한다.

예시:

```bash
wrangler d1 execute gilwell-posts --remote --file=./db/migration_016.sql
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
- 현재 버전 규칙: `Va.bbb.cc`
- `a`는 오너가 직접 올리라고 한 경우에만 증가한다.
- `bbb`는 기능 추가가 있을 때만 증가한다.
- `cc`는 버그 수정, 배너 위치 조정 같은 사소한 수정에만 증가한다.
- `bbb`가 올라가면 `cc`는 반드시 `00`으로 초기화한다.
- Git 자동 배포가 지연되거나 누락될 수 있으므로, 릴리스 직후에는 `Deployments`의 커밋 SHA와 라이브 응답 버전을 반드시 같이 확인한다.
