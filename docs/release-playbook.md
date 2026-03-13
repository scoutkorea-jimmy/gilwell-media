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

예시:

```bash
wrangler d1 execute gilwell-posts --remote --file=./db/migration_013.sql
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
- 현재 버전 규칙: `Va.bbbb.cc`
