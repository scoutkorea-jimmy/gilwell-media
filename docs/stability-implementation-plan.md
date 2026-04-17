---
tags: [ops, stability, roadmap]
aliases: [Stability Plan, 안정성 계획]
---

# Homepage Stability Implementation Plan

## 목적

현재 홈페이지 코드베이스에서 확인된 주요 위험 요소를 실제 수정 작업 단위로 분해한 실행 계획서다. 본 문서는 구현 순서, 파일별 책임, 선행 조건, 검증 포인트를 한 번에 확인하기 위한 기준 문서로 사용한다.

## 결정 사항

- `post_history`는 `before_snapshot`과 `after_snapshot`을 둘 다 저장한다.
- pretty URL 메타 처리는 경로 정규화 레이어를 도입해 해결한다.
- 게시글 API 입력 검증은 공통 헬퍼로 통합한다.
- 버전 하드코딩은 장기적으로 단일 소스 + 자동 동기화 스크립트 구조로 전환한다.
- preview 시스템은 완전 삭제한다.
- 관리자 인증 관련 문서는 쿠키 기반 세션 구조로 통일한다.
- 하드코딩은 먼저 인벤토리를 만들고, 정책을 정의한 뒤, 운영값은 `settings`, 구조값은 공통 상수로 정리한다.

## 권장 실행 순서

1. 하드코딩 인벤토리 작성
2. preview 시스템 완전 삭제
3. `post_history` 스키마 및 API 확장
4. site meta pretty URL 정규화
5. posts API 공통 입력 검증 도입
6. 관리자 인증 문서 현행화
7. 운영 하드코딩을 `settings`로 이전
8. 구조 상수 공통화
9. 버전 자동 동기화 스크립트 도입

## 작업 스트림

### 1. Hardcoding Inventory

목표:
- 하드코딩된 운영값, 구조값, 릴리즈값, 레거시값을 전수 분류한다.

대상 파일:
- `README.md`
- `CLAUDE.md`
- `functions/_shared/site-meta.js`
- `functions/_shared/feature-definition.js`
- `functions/api/settings/*.js`
- `js/main.js`
- `js/admin-v3.js`
- `admin.html`
- `index.html`
- `latest.html`
- `korea.html`
- `apr.html`
- `wosm.html`
- `people.html`
- `glossary.html`
- `contributors.html`
- `search.html`
- `calendar.html`
- `kms.html`
- `functions/post/[id].js`
- `functions/feature/[category]/[slug].js`
- `functions/glossary-raw.js`

산출물:
- `docs/hardcoding-inventory.md`

정리 기준:
- 운영에서 자주 바뀌는 값: `settings`로 이동
- 구조적으로 거의 변하지 않는 값: 공통 constants 모듈로 이동
- 버전/릴리즈 값: `VERSION` 및 자동 동기화 스크립트 기준으로 정리
- preview/폐기 기능 값: 삭제

검증:
- 인벤토리 문서에 각 항목별 위치, 값, 위험도, 이전 대상이 기록되어야 한다.

### 2. Preview System Removal

목표:
- 더 이상 사용하지 않는 preview 검수, 승격, 롤백 관련 기능을 코드베이스에서 제거한다.

삭제 대상 파일:
- `functions/api/preview/history.js`
- `functions/api/preview/promote.js`
- `functions/api/preview/release.js`
- `functions/api/preview/rollback.js`
- `functions/_shared/preview-ops.js`
- `functions/_shared/preview-release-data.js`

수정 대상 파일:
- `js/main.js`
- `css/style.css`
- `js/kms.js`
- `functions/api/admin/operations.js`
- `data/changelog.json`

세부 작업:
- `js/main.js`에서 preview runtime state, modal, launcher, promote, rollback, history fetch 로직 제거
- `css/style.css`에서 `.preview-*` 관련 스타일 제거
- `js/kms.js`에서 preview API 설명 제거
- `functions/api/admin/operations.js`에서 preview snapshot/deployment 의존성 제거 또는 production용 history 기능으로 분리
- `data/changelog.json`은 기존 히스토리를 유지하되, 이후 운영 문구는 preview 종료 기준으로 정리

결정 필요:
- `functions/api/admin/operations.js`의 deployment/snapshot 조회는 preview 기능이 아니라 운영 복구 정보로 재정의할지 함께 판단

검증:
- `rg -n "api/preview|preview-ops|preview-release-data|preview-review|preview-runtime"` 결과가 운영 허용 범위 밖에서 남지 않아야 한다.

### 3. Post History Before/After Snapshots

목표:
- 게시글 이력에 수정 전과 수정 후 상태를 모두 남겨 복구 및 감사 신뢰도를 높인다.

대상 파일:
- `db/migration_025.sql`
- `db/schema.sql`
- `functions/_shared/post-history.js`
- `functions/api/posts/index.js`
- `functions/api/posts/[id].js`
- `functions/api/posts/[id]/history.js`

권장 DB 변경:
- `post_history.before_snapshot` TEXT
- `post_history.after_snapshot` TEXT
- 기존 `snapshot`은 호환 레이어로 잠시 유지한 뒤 후속 정리 가능

세부 작업:
- 새 migration 파일 추가
- `recordPostHistory(env, postId, action, beforePost, afterPost, summary)` 형태로 시그니처 확장
- 게시글 생성 시 `before=null`, `after=insertedPost`
- 게시글 수정 시 update 전 전체 row 조회 후 `before=currentPost`, `after=updatedPost`
- 게시글 상태 변경 시에도 동일하게 전/후 snapshot 저장
- history 조회 API는 `before_snapshot`, `after_snapshot`, legacy `snapshot` fallback을 함께 반환

주의:
- 현재 `PUT /api/posts/:id`는 수정 전에 `image_url`, `gallery_images`만 읽고 있어 snapshot 용도로 부족하다.
- 수정 전 full row 조회를 별도로 수행해야 한다.

검증:
- 같은 게시글 수정 후 `/api/posts/:id/history` 응답에서 수정 전/후 값이 실제로 다르게 보이는지 확인

### 4. Pretty URL Site Meta Normalization

목표:
- `/contributors`, `/contributors/`, `/contributors.html`처럼 같은 페이지가 하나의 메타 키로 정규화되게 만든다.

대상 파일:
- `functions/_shared/site-meta.js`
- 메타 주입을 호출하는 SSR/Function 진입점 일체

정규화 범위:
- `/`
- `/index.html`
- `/latest`, `/latest/`, `/latest.html`
- `/korea`, `/korea/`, `/korea.html`
- `/apr`, `/apr/`, `/apr.html`
- `/wosm`, `/wosm/`, `/wosm.html`
- `/people`, `/people/`, `/people.html`
- `/glossary`, `/glossary/`, `/glossary.html`
- `/contributors`, `/contributors/`, `/contributors.html`
- `/search`, `/search/`, `/search.html`

세부 작업:
- `normalizePagePath(pathname)` 도입
- `getSitePageKey()`는 정규화된 값만 받도록 변경
- canonical URL 생성 로직이 있다면 같은 정규화 함수를 재사용

검증:
- 각 pretty URL과 `.html` URL이 동일한 `pageKey`를 반환해야 한다.

### 5. Posts API Validation Helpers

목표:
- 잘못된 타입 입력 시 500 대신 400으로 처리하고, 게시글 생성/수정 규칙을 한 군데로 모은다.

대상 파일:
- `functions/api/posts/index.js`
- `functions/api/posts/[id].js`
- 필요 시 신규 헬퍼 파일 추가:
  - `functions/_shared/post-input.js`

권장 헬퍼:
- `requireNonEmptyString(value, fieldName)`
- `optionalTrimmedString(value, maxLength)`
- `optionalIntegerOrNull(value, fieldName)`
- `optionalBooleanFlag(value)`
- `normalizePublishAtInput(...)` 호출 전 타입 정리 헬퍼

세부 작업:
- `POST /api/posts`
- `PUT /api/posts/:id`
- `PATCH /api/posts/:id`
위 세 경로에서 같은 검증 규칙 사용

검증 대상 필드:
- `title`
- `content`
- `subtitle`
- `tag`
- `meta_tags`
- `author`
- `sort_order`
- `publish_at`

검증:
- 숫자/객체/배열 등 비문자열 payload 입력 시 400을 반환해야 한다.

### 6. Auth Documentation Alignment

목표:
- 관리자 인증 흐름 설명을 실제 구현과 일치시킨다.

대상 파일:
- `CLAUDE.md`
- `README.md`
- `docs/feature-definition.md`

정리 기준:
- 로그인 성공 시 signed admin session cookie 발급
- 클라이언트는 lightweight 상태만 `sessionStorage`에 보조 저장
- 인증 요청은 same-origin cookie 기반
- `Authorization: Bearer <token>` 중심 설명 삭제

검증:
- 세 문서 모두 같은 인증 구조를 설명해야 한다.

### 7. Operational Hardcodes to Settings

목표:
- 운영 중 자주 수정되는 값은 코드 밖으로 이동해 관리자/설정 API에서 관리 가능하게 만든다.

1차 이전 후보:
- 사이트 기본 메타 문구
- 푸터 제목/설명/도메인/문의 이메일
- 홈 리드 문구
- 보드 배너 문구
- AI 고지 문구
- 관리자 안내 카피 중 운영값 성격이 강한 항목

주요 파일:
- `functions/_shared/site-meta.js`
- `functions/_shared/feature-definition.js`
- `functions/api/settings/site-meta.js`
- `functions/api/settings/home-lead.js`
- `functions/api/settings/board-banner.js`
- `functions/api/settings/ai-disclaimer.js`
- `js/admin-v3.js`
- `js/main.js`

세부 작업:
- 코드상 기본 fallback은 유지
- 실제 운영에서 바꾸는 값은 `settings` DB 기준으로 노출
- 관리자 UI가 이미 있는 항목은 그 UI를 기준으로 정리
- 관리자 UI가 없는 항목은 우선 API/DB만 정리한 뒤 후속 화면 추가 검토

검증:
- settings 값이 비어 있어도 사이트가 안전하게 fallback으로 동작해야 한다.

### 8. Structural Constants Consolidation

목표:
- 바뀌지 않는 구조값은 상수 모듈로 모아 중복 수정 위험을 줄인다.

후보 값:
- 게시글 카테고리 키
- 공개 페이지 route key
- 메타 page key
- 기본 role/action key
- 내부 enum 성격의 문자열

대상 파일:
- `functions/api/posts/index.js`
- `functions/api/posts/[id].js`
- `functions/_shared/site-meta.js`
- `js/main.js`
- `js/admin-v3.js`
- 필요 시 신규 모듈:
  - `functions/_shared/constants.js`
  - `js/shared/constants.js`

주의:
- Functions와 브라우저 JS가 같은 파일을 공유하기 어렵다면 서버/클라이언트 전용 상수 파일로 나눠도 된다.

검증:
- 카테고리/route 추가 시 수정 포인트가 분산되지 않아야 한다.

### 9. Version Auto Sync

목표:
- 버전 하드코딩을 수동 편집에서 벗어나 단일 소스 + 동기화 스크립트 구조로 바꾼다.

소스 오브 트루스 제안:
- 사이트 버전: `VERSION`
- 관리자 버전: 별도 `ADMIN_VERSION` 파일 또는 `VERSION`에서 파생 규칙 명시

대상 파일:
- `VERSION`
- `js/main.js`
- `js/admin-v3.js`
- `admin.html`
- `kms.html`
- `index.html`
- `latest.html`
- `korea.html`
- `apr.html`
- `wosm.html`
- `people.html`
- `glossary.html`
- `contributors.html`
- `search.html`
- `calendar.html`
- `functions/post/[id].js`
- `functions/feature/[category]/[slug].js`
- `functions/glossary-raw.js`
- `scripts/verify_release_metadata.sh`
- 신규 스크립트 예시:
  - `scripts/sync_versions.sh`

권장 방식:
- `sync_versions.sh`가 각 파일의 버전 문자열과 `?v=` 쿼리를 일괄 갱신
- `verify_release_metadata.sh`는 “수정”이 아니라 “검증”만 담당

검증:
- `rg`로 버전 문자열을 검색했을 때 허용된 위치만 남아야 한다.
- 배포 전 `sync_versions.sh` → `verify_release_metadata.sh` 순서가 고정되어야 한다.

## 테스트 및 검증 체크리스트

- 게시글 생성, 수정, 상태 변경 후 history 응답 확인
- `/contributors`, `/contributors.html`, `/search`, `/search.html` 메타 동일성 확인
- posts API malformed payload에 대한 400 응답 확인
- preview 관련 API 경로 제거 확인
- 관리자 로그인 후 cookie 기반 세션 유지 확인
- 버전 동기화 후 site/admin 자산 쿼리 문자열 일치 확인

## 메모

- 현재 워크트리에는 이미 아래 변경이 남아 있다.
- `README.md`
- `docs/release-playbook.md`
- `docs/preview-release-checklist.md` 삭제

위 변경과 충돌하지 않도록, 실제 구현 단계에서는 새 작업 브랜치 또는 단계별 커밋으로 나누는 편이 안전하다.
