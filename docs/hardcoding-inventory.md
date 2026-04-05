# Hardcoding Inventory

## 목적

운영 중 자주 바뀌는 값과 구조상 고정값, 릴리즈 값, 폐기 대상 하드코딩을 분리해 이후 `settings`, 공통 상수, 자동 동기화 스크립트로 정리하기 위한 기준 문서다.

## 정책

- 운영값: `settings` 또는 관리자 UI/API로 이동
- 구조상수: 공통 constants 모듈로 이동
- 릴리즈값: `VERSION`, `ADMIN_VERSION`, 자동 동기화 스크립트로 관리
- 폐기 기능값: 코드와 문서에서 삭제

## Version Hardcodes

| 위치 | 현재 값 예시 | 위험도 | 권장 조치 |
| --- | --- | --- | --- |
| `VERSION` | `00.111.13` | 중간 | Site 버전 소스 오브 트루스로 유지 |
| `ADMIN_VERSION` | `03.052.09` | 낮음 | Admin 버전 소스 오브 트루스로 유지 |
| `js/main.js` | `GW.APP_VERSION`, `GW.ADMIN_VERSION` | 높음 | sync 스크립트로 자동 주입 |
| `admin.html` | `admin-v3.css/js?v=03.052.09`, 화면 표시 버전 | 높음 | sync 스크립트로 자동 주입 |
| `kms.html` | `style/admin.css/main.js/kms.js` 쿼리 버전 | 높음 | sync 스크립트로 자동 주입 |
| 공개 HTML (`index.html`, `latest.html`, `korea.html`, `apr.html`, `wosm.html`, `wosm-members.html`, `people.html`, `glossary.html`, `contributors.html`, `search.html`, `calendar.html`) | `?v=00.111.13` | 높음 | sync 스크립트로 자동 주입 |
| SSR 파일 (`functions/post/[id].js`, `functions/feature/[category]/[slug].js`, `functions/glossary-raw.js`) | `?v=00.111.13` | 높음 | sync 스크립트로 자동 주입 |
| `js/admin-v3.js` | header 주석 버전 | 중간 | sync 스크립트로 자동 주입 |

## Route And Meta Hardcodes

| 위치 | 현재 값 예시 | 위험도 | 권장 조치 |
| --- | --- | --- | --- |
| `functions/_shared/site-meta.js` | 페이지 key와 경로 매핑 | 중간 | 공통 route 상수화 + 정규화 함수 유지 |
| `js/main.js` | `GW.CATEGORIES`, `GW.TAG_CATEGORIES`, `GW.EDITOR_LETTERS` | 중간 | 구조상수로 이동 |
| 공개 HTML 내 nav, 링크 경로 | `/korea`, `/apr`, `/wosm`, `/people` | 낮음 | 구조상수로 정리 검토 |

## Site Copy And Settings Hardcodes

| 위치 | 현재 값 예시 | 위험도 | 권장 조치 |
| --- | --- | --- | --- |
| `functions/_shared/site-meta.js` | 기본 title/description/footer/email fallback | 높음 | 운영값은 `settings.site_meta`, fallback만 코드 유지 |
| `db/schema.sql` seed | ticker, tags, author, ai_disclaimer, site_meta | 중간 | 초기 fallback만 유지 |
| `functions/api/settings/*` | 기본 문구 fallback | 중간 | 운영값은 settings, 기본값만 코드 유지 |
| `CHATGPT.md`, `README.md`, `docs/feature-definition.md` | 운영 규칙 문구 | 중간 | 문서 원본은 KMS와 `CHATGPT.md`로 유지 |

## Legacy And Delete Targets

| 위치 | 현재 값 예시 | 위험도 | 권장 조치 |
| --- | --- | --- | --- |
| `data/changelog.json` 내 preview 기록 | 과거 프리뷰/승격 변경 이력 | 낮음 | 역사 보존, 수정하지 않음 |
| preview API/런타임/CSS | 과거 프리뷰 검수/승격 시스템 | 높음 | 삭제 완료 |

## 1차 실행 우선순위

1. 버전 문자열 자동 동기화
2. site meta/푸터 운영값의 settings 중심 정리
3. 카테고리와 route key 공통 상수화
4. 남은 문서 내 레거시 인증/preview 표현 제거
