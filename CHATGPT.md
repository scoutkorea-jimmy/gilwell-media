---
tags: [ai-guide, homepage, entry-point, public, admin]
aliases: [Homepage Guide, 홈페이지 가이드, CHATGPT]
scope: homepage
---

# CHATGPT.md — 메인 홈페이지 개발 가이드

## 이 문서의 목적

> [!abstract] Purpose & Scope
> **목적**: **메인 홈페이지**(공개 사이트 + 관리자 V3 + KMS) 전용 AI 작업 가이드
> **범위**: UI, 모듈, 디자인, 컨텐츠, 태그, 배포 등 **홈페이지 도메인의 모든 규칙**
> **제외**: DreamPath 관련 파일 일체 (`dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/*`)
>
> DreamPath 작업 시 → [[CLAUDE]] + [[docs/dreampath/README|Dreampath Hub]] 참조

### 이 문서와 다른 문서의 관계

| 문서 | 역할 | 우선순위 |
|---|---|---|
| **KMS** (관리자 페이지) | 운영 기준 **정식 원본** | 1순위 |
| **이 문서** (`CHATGPT.md`) | AI 작업 기준 원본 | 2순위 |
| [[docs/feature-definition\|Feature Definition]] | KMS 보조 스냅샷 | 3순위 |
| [[docs/features/README\|Homepage Features Hub]] | 기능 중심 탐색 | 참고 |
| [[docs/modules/README\|Homepage Modules Hub]] | 모듈 라이브러리 | 참고 |

---

## Core Principle

- **안정성 우선** — 새 기능보다 기존 기능의 안정적 동작이 중요
- 운영 기준 원본: 관리자 **KMS** (`/admin.html` → KMS 메뉴)
- AI 작업 기준 원본: 이 파일 (`CHATGPT.md`)
- [[docs/feature-definition|Feature Definition]]은 KMS의 보조 스냅샷으로만 참고
- DreamPath 규칙을 메인 사이트에 혼용하지 않음

## Documentation Axis

- Obsidian 최적화 기준의 최상위 축은 **페이지가 아니라 기능과 모듈**이다.
- 페이지 문서는 독립 설계 단위가 아니라, 여러 기능이 조합된 **surface**로 취급한다.
- 새 문서나 리팩터링 메모를 만들 때는 먼저 `[[docs/features/README|Homepage Features Hub]]`에 연결하고, 그 다음 `[[docs/modules/README|Homepage Modules Hub]]`와 연결한다.
- 페이지별 동작을 설명해야 할 때도 페이지 자체를 중심으로 풀지 않고, `어떤 feature가 어떤 module/API/template를 묶어 surface를 만든다`는 순서로 적는다.
- 동일 기능이 다른 페이지에서 반복되면 페이지별 설명을 복사하지 말고 기능 허브와 모듈 노트에 위키링크를 모은다.

---

## Key Files

| 파일 | 역할 |
|---|---|
| `index.html` | 홈 |
| `korea.html`, `apr.html`, `wosm.html`, `people.html` | 공개 카테고리 보드 |
| `wosm-members.html` | 세계연맹 회원국 현황 |
| `glossary.html` | 용어집 |
| `search.html` | 검색 |
| `admin.html` | 관리자 |
| `kms.html` | 기능 정의서 / KMS |
| `css/style.css` | 메인 사이트 공유 스타일 |
| `js/main.js` | `window.GW` 네임스페이스 + 공용 유틸 |
| `js/board.js` | 게시판 렌더링 |
| `js/post-page.js` | 기사 상세 페이지 |
| `js/admin-v3.js` | 관리자 로직 |
| `functions/api/*` | 메인 사이트 API |
| `functions/[[path]].js` | 공유 메타 주입 |
| `functions/post/[id].js` | 기사 상세 서버 렌더링 |

---

## Architecture

| Layer | Stack |
|---|---|
| Hosting | Cloudflare Pages |
| API | Cloudflare Functions |
| DB | Cloudflare D1 |
| Images | R2 |
| Frontend | Plain HTML / CSS / Vanilla JS |
| Auth | HMAC-SHA256 signed admin cookie (24h) |

- 네임스페이스: `window.GW` (DreamPath의 `window.DP`와 공유하지 않음)
- 에디터: **Editor.js** 기반 (DreamPath의 Tiptap과 무관)
- 스타일: `css/style.css` 기준 유지

---

## Module Layers

> [!note] 모듈 구조
> `Foundation → Component → Pattern → Template → Code Module`
> 새 UI는 기존 Component/Pattern 재사용부터 확인

| Layer | 예시 |
|---|---|
| Foundation | 색상, 타이포, 간격, 상태 언어 |
| Component | 버튼, 태그, 카드, 입력 |
| Pattern | 마스트헤드, 히어로, 섹션 레일 |
| Template | 홈, 게시판, 기사 상세 |
| Code Module | constants, utils, renderers, API helpers |

- P0 공통화: `section rail`, `post card shell`, `button/chip family`
- 모듈 분해 기준: `docs/homepage-module-inventory.md`
- Obsidian 문서 구조: `Feature Hub → Module / Template / API Library`

---

## Site Structure

- 공개 표면: 홈, Korea, APR, WOSM, Scout People, 검색, 용어집, 회원국 현황, 기사 상세, 도움
- 홈 구성: 마스트헤드 → 티커 → 히어로 → 메인 스토리 → 최신 → 인기 → 에디터 추천 → 카테고리 → 푸터 통계
- 에디터 추천: 최대 4개, 서버에서도 강제
- 메인 스토리 ↔ 에디터 추천 충돌 방지

---

## Content & Date Rules

| 기준 | 규칙 |
|---|---|
| 공개 정렬 | `publish_at` 우선, 없으면 `created_at` |
| 공개 날짜 형식 | `YYYY년 M월 D일` |
| 관리자 날짜 형식 | `YYYY년 MM월 DD일 HH시 MM분 SS초` |
| RSS 날짜 | `created_at` 기준, 작성자 실명 비노출 |

---

## Home Rules

- 최신 소식: 첫 진입 + 탭 복귀 + 포커스 복귀 시 항상 재조회
- latest rail은 `no-store` 기준
- 접근성: skip-link, 랜드마크, heading 구조, 히어로 일시정지, 티커 정지
- 메인 스토리 저장/해제 후 캐시 즉시 퍼지
- 공개 UX를 바꾸지 않는 하드코딩 정리는 `운영값 / 구조상수 / fallback`으로 먼저 분류
- nav fallback, ticker 기본 문구, 공통 경로 제목은 `functions/_shared/site-structure.mjs`, `functions/_shared/site-copy.mjs`를 우선 참조
- 공개 HTML fallback 동기화는 `scripts/sync_public_fallbacks.mjs`를 통해 release 전에 자동 반영
- 홈 런타임은 `home-helpers → home-render → home-hero → home-runtime → home.js` 순으로 분리 유지

---

## Design Rules

- 기본 서체: `AliceDigitalLearning` (공개), 시스템 서체 (관리자)
- 공개 메뉴: `data-managed-nav` — 초기 숨김 → 렌더 완료 후 노출 (flash 방지)
- 버튼: 같은 계층이면 높이/패딩/폰트 통일
- 한글: `word-break: keep-all`
- 모바일: 가로 스크롤 금지

> [!tip] Design Guide
> KMS 디자인 탭 = 홈페이지 모듈 시스템의 시각적 레퍼런스.
> 새 디자인 추가 시 KMS + `docs/homepage-module-inventory.md` + 이 문서를 함께 갱신.

---

## Article & Share Rules

- 기사 수정: 같은 페이지 모달 (관리자 비밀번호 재검증 필수)
- 공유 `share_ref`: 매 클릭 새로 생성 (캐시 오류 방지)
- 예약 공개: overdue 보정 + Cloudflare scheduled worker 5분 주기

---

## Tag & Image Rules

- 사용 중인 태그 삭제 불가 → 어떤 글에서 사용 중인지 안내
- 히어로: PC/모바일별 이미지 프레이밍 값 개별 저장
- 이미지 확대/축소: 60%~150%, 100% 미만 시 블러 배경 보정

---

## Data Safety

> [!important] 데이터 안전 규칙
> - 설정 수정 시 `settings_history` 스냅샷 필수
> - 게시글 삭제 시 연관 이미지/기록/조회·공감/URL 로그 함께 정리
> - 공유 메타: `functions/[[path]].js` 기준 주입
> - `canonical` + `robots.txt` + `sitemap.xml`은 한 세트로 관리
> - sitemap에는 공개 canonical 경로만 포함

---

## Glossary Rules

- 검색: 용어 + 설명 함께 검색
- 검색 범위 체크박스 전체 해제 시 → 검색 차단 + 안내

---

## Footer Rules

- 구조화된 필드 편집기 우선 (raw HTML 직접 수정 지양)
- 제목, 소개, 도메인, 기사제보 메일, 문의 메일 각각 수정 가능

---

## Admin Rules

- 일부 계정은 히어로 설정만 접근 가능 (게시글 권한 제한)
- 모바일: 단일 폭 1단 흐름 기본
- 탐색 기준: 좌측 사이드바 (메인 영역에 보조 메뉴 중복 금지)
- 운영 섹션: 분석, 접속 국가/도시, 마케팅, 버전기록, 오류/이슈 기록

---

## Deployment

```bash
./scripts/sync_versions.sh          # 버전 동기화
./scripts/deploy_production.sh      # 배포
./scripts/post_deploy_check.sh <url> # 배포 후 점검
```

- 버전: `Va.bbb.cc` (Site: `VERSION`, Admin: `ADMIN_VERSION`, Asset: `ASSET_VERSION`)
- 공개 UI 변경: 오너 확인 후 production 배포
- 관리자/API만 수정: 바로 production 반영 가능

---

## Verification Checklist

배포 전후 최소 확인 항목:

- [ ] 홈, 대표 기사 상세, 카테고리 보드
- [ ] 검색, 용어집, 관리자 진입
- [ ] 모바일 레이아웃
- [ ] RSS 응답
- [ ] `robots.txt`, `sitemap.xml` 접근
- [ ] OG meta (`og:title`, `og:image`, `canonical`)
- [ ] 홈 최신 갱신, 공유 버튼, 수정 모달

---

## Hard Boundaries

> [!danger] 절대 경계
> - DreamPath 규칙을 메인 사이트에 적용하지 않음
> - DreamPath 전용 파일 구조/Tiptap/IIFE를 메인에 적용하지 않음
> - 메인 API는 `/functions/api/` 기준
> - 스타일 변경은 기존 리듬과 일관성 유지

---

## Related Docs

- [[CLAUDE]] — AI 프로젝트 전체 규칙 (Dreampath 포함)
- [[docs/features/README|Homepage Features Hub]] — 기능 중심 진입점
- [[docs/modules/README|Homepage Modules Hub]] — 모듈 라이브러리
### 기능 문서 (scope: homepage)
- [[docs/features/README|Homepage Features Hub]] — 기능 진입점
- [[docs/features/Feature Map|Feature Map]] — 전체 기능 맵
- [[docs/modules/README|Homepage Modules Hub]] — 모듈 라이브러리
- [[docs/modules/Homepage Runtime Map|Runtime Map]] — 런타임 의존성 맵

### KMS / 스냅샷 (scope: kms)
- [[docs/feature-definition|Feature Definition]] — KMS 보조 스냅샷
- [[docs/homepage-module-inventory|Module Inventory]] — 모듈 인벤토리

### 운영 (scope: ops)
- [[docs/release-playbook|Release Playbook]] — 배포 절차
- [[docs/stability-implementation-plan|Stability Plan]] — 안정성 로드맵
- [[docs/hardcoding-inventory|Hardcoding Inventory]] — 하드코딩 감사

### 프로젝트 공통
- [[CLAUDE]] — 프로젝트 전체 AI 규칙
- [[docs/dreampath/README|Dreampath Hub]] — Dreampath 레퍼런스 (별도 도메인)

---

## Obsidian Graph Map

> [!note] 그래프 클러스터
> Obsidian 그래프에서 `scope` 태그로 필터링하면 4개 도메인 클러스터가 보입니다.

```
[homepage]  CHATGPT.md ─── Features Hub ─── 11개 Feature 문서
                │               │
                │          Modules Hub ── 16개 Module 문서 (Runtime/Template/API)
                │
[admin]     Admin Session Feature ── Admin Operations Feature ── Admin V3 Runtime
                │
[kms]       KMS Template ── Feature Definition (snapshot)
                │
[dreampath] CLAUDE.md ── Dreampath Hub ── 기능/API/DB 레퍼런스
                │
[ops]       Release Playbook ── Stability Plan ── Hardcoding Inventory
```
