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

## 참고

- 현재 서비스 도메인: `https://bpmedia.net`
- Pages 프로젝트명: `gilwell-media`
- 현재 버전 규칙: `Va.bbbb.cc`
