# CHATGPT.md — Gilwell Media Homepage Guide

> 이 문서는 `DreamPath`를 제외한 **BP미디어 메인 홈페이지 개발 기준**만 정리한 AI 작업 가이드입니다.
> 홈페이지 관련 작업에서는 이 문서를 우선 기준으로 따릅니다.

---

## Scope

- 대상: `bpmedia.net` 메인 사이트
- 제외: `DreamPath`, `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/*`
- 공개 표면: 홈, 카테고리 보드, 기사 상세, 검색, 용어집, 도움 페이지, 관리자

---

## Core Principle

- 변경은 항상 안정성 우선으로 진행합니다.
- 새 기능이나 기존 기능 수정 전에는 관리자 `기능 정의서 / KMS`를 먼저 확인합니다.
- 운영 기준의 원본은 관리자 KMS이며, `docs/feature-definition.md`는 보조 스냅샷으로만 봅니다.
- AI 작업 기준 문서의 원본은 저장소 루트의 `CHATGPT.md`입니다.
- 기존 `ai-guide.html`은 폐기되었으며, 관련 기준은 `CHATGPT.md`와 KMS 문서로 이관되었습니다.
- 홈페이지 UI/코드 모듈 분해 기준은 `docs/homepage-module-inventory.md`를 함께 참고합니다.
- `DreamPath` 규칙을 메인 사이트에 섞지 않습니다.

---

## Key Files

- `index.html`: 홈
- `korea.html`, `apr.html`, `wosm.html`, `people.html`: 공개 카테고리 보드
- `glossary.html`: 용어집
- `search.html`: 검색
- `admin.html`: 관리자
- `kms.html`: 기능 정의서 / KMS
- `css/style.css`: 메인 사이트 공유 스타일
- `js/main.js`: `window.GW` 네임스페이스 및 공용 유틸
- `js/board.js`: 게시판 렌더링
- `js/post-page.js`: 기사 상세 페이지 로직
- `js/admin-v3.js`: 관리자 로직
- `functions/api/*`: 메인 사이트 API
- `functions/[[path]].js`: 일반 페이지 공유 메타 주입
- `functions/post/[id].js`: 기사 상세 서버 렌더링

---

## Architecture

- Hosting: Cloudflare Pages
- API: Cloudflare Functions
- Database: Cloudflare D1
- Images: R2 사용 가능
- Frontend: Plain HTML / CSS / Vanilla JS
- Auth: HMAC-SHA256 signed admin session cookie
- 메인 사이트 관리자 인증은 24시간 signed cookie를 사용하고, 클라이언트는 `sessionStorage`에 lightweight 상태만 보조 저장합니다.

---

## Frontend Rules

- 메인 사이트 네임스페이스는 `window.GW`를 사용합니다.
- 메인 사이트 JS/CSS는 `DreamPath`와 공유하지 않습니다.
- 메인 사이트 스타일은 `css/style.css`를 기준으로 유지합니다.
- 메인 사이트 에디터는 `Editor.js` 기반이며, `DreamPath`의 Tiptap 규칙과 무관합니다.
- 게시글 렌더링은 `GW.renderEditorContent()` 기준을 따릅니다.

---

## Module Layers

- 홈페이지는 `Foundation / Component / Pattern / Template / Code Module` 단위로 나눠서 생각합니다.
- 새 UI를 만들 때는 먼저 기존 `Component`나 `Pattern`을 재사용할 수 있는지부터 확인합니다.
- `Foundation`은 색상, 타이포, 간격, 상태 언어처럼 전체가 공유하는 기준입니다.
- `Component`는 버튼, 태그, 카드, 입력처럼 독립적으로 재사용 가능한 UI입니다.
- `Pattern`은 마스트헤드, 히어로, 섹션 레일, 검색 패널처럼 여러 컴포넌트를 묶은 구조입니다.
- `Template`은 홈, 게시판, 기사 상세, 검색, 용어집 같은 페이지 수준 조합입니다.
- `Code Module`은 constants, utils, renderers, feature init, API helper처럼 책임이 분리된 코드 단위입니다.
- 모듈 분해 기준 문서는 `docs/homepage-module-inventory.md`를 사용합니다.

---

## Module Priorities

- P0 공통화 우선순위는 `section rail`, `post card shell`, `button/chip family` 입니다.
- 홈의 `latest / popular / picks / category rail`은 하나의 section rail 패턴으로 봅니다.
- 카드류는 shell과 content variant를 분리하고, 제목/요약/메타의 순서를 공통화합니다.
- 버튼은 `primary / secondary / chip` 위계로 통일하고, 상태는 `default / active / disabled / danger` 기준으로 맞춥니다.
- 공개 화면과 관리자/KMS에서 역할이 겹치는 버튼·칩·페이지 토글은 같은 위계와 상태 언어를 유지합니다.
- category/tag/route/date formatting 같은 구조값은 점진적으로 constants / utils 모듈로 분리합니다.
- 큰 파일은 panel, section, feature slice 기준으로 나눕니다.

---

## Site Structure

- 홈은 마스트헤드, 티커, 히어로, 메인 스토리, 최신 소식, 인기 소식, 에디터 추천, 카테고리 보드, 푸터 통계로 구성합니다.
- 공개 표면은 홈, Korea, APR, WOSM, Scout People, 검색, 용어집, 기사 상세, 도움 페이지로 유지합니다.
- 관리자 정보 구조는 `운영 개요 / 콘텐츠 / 사이트 설정` 세 축을 유지합니다.
- 중요 URL은 `/admin.html`, `/glossary`, `/post/:id`, `/sitemap.xml`, `/robots.txt`를 기준으로 봅니다.

---

## Content And Date Rules

- 게시글 데이터는 `created_at`과 `publish_at`을 분리해 다룹니다.
- 공개 정렬은 기본적으로 `publish_at` 우선, 없으면 `created_at` fallback입니다.
- Korea, APR, WOSM, Scout People, `1개월 소식` 모두 같은 정렬 원칙을 따릅니다.
- 공개 페이지의 날짜 표시는 `YYYY년 M월 D일` 형식으로 맞춥니다.
- 관리자에서는 Created / Published / Modified를 모두 `YYYY년 MM월 DD일 HH시 MM분 SS초` 형식으로 노출합니다.
- RSS 날짜는 `publish_at`이 아니라 `created_at` 기준을 유지합니다.
- RSS에는 작성자 실명을 노출하지 않습니다.

---

## Home Rules

- 홈 `최신 소식`은 첫 진입 시 항상 새 데이터를 다시 불러옵니다.
- 브라우저 탭 복귀, 페이지 복귀, 포커스 복귀 시에도 최신 소식을 재조회합니다.
- 강력 새로고침 없이도 최근 게시글 반영이 보여야 합니다.
- 최소한 latest rail은 `no-store` 기준으로 갱신합니다.
- 섹션 헤더 높이와 `더보기` 규칙은 홈 전체에서 일관되게 유지합니다.

---

## Design Rules

- 공개 페이지 기본 서체는 `AliceDigitalLearning`을 기준으로 유지합니다.
- 관리자 V3는 현재 구현 기준으로 시스템 서체를 사용합니다.
- 상단 메뉴 크기와 카드 제목 크기를 공통 타이포 기준으로 삼습니다.
- 버튼은 같은 기능 계층이면 높이, 패딩, 폰트, 자간, 테두리 굵기를 통일합니다.
- `더보기` 링크는 모든 섹션에서 같은 스타일을 사용합니다.
- 한글 본문과 제목은 기본적으로 `word-break: keep-all`을 우선합니다.
- 모바일에서는 가로 스크롤을 허용하지 않습니다.

---

## Design Guide

- 디자인은 장식보다 `역할`, `상태`, `재사용 위치`가 먼저 정의돼야 합니다.
- 하나의 모듈은 최소한 `종류`, `설명`, `토큰/클래스`, `코드`, `미리보기`, `모바일 규칙`을 가져야 합니다.
- 코드와 미리보기는 분리된 설명이 아니라 같은 모듈의 두 표현입니다.
- KMS에 정의된 공통 액션 모듈은 구현 파일에도 반영돼야 하며, 공개는 `css/style.css`, 관리자는 `css/admin-v3.css`를 함께 봅니다.
- KMS 디자인 탭에서는 각 항목별로 `코드 보기`와 `미리보기`를 바로 전환할 수 있어야 합니다.
- KMS에서 `미리보기`를 눌렀을 때는 해당 코드 구조가 즉시 렌더링된 결과를 보여줘야 합니다.
- KMS에서 `코드 보기`를 누르면 다시 코드 스니펫을 읽을 수 있어야 합니다.
- KMS 디자인 탭은 단순 샘플 모음이 아니라 홈페이지 모듈 시스템의 시각적 레퍼런스입니다.
- 공개/관리 양쪽에 존재하는 모듈은 KMS 카드 안에 구현 대상 파일(`css/style.css`, `css/admin-v3.css`, 필요 시 `css/admin.css`)을 함께 적습니다.
- 새 디자인 추가 시에는 KMS 디자인 탭, `docs/homepage-module-inventory.md`, `CHATGPT.md`를 함께 갱신합니다.

---

## Article And Share Rules

- 공개 기사 상세 수정은 관리자 페이지로 보내지 않고 같은 페이지 안의 모달에서 처리합니다.
- 수정 진입 전에는 full 관리자 비밀번호 검증을 다시 요구합니다.
- 잘못된 비밀번호나 권한 부족 시 수정 모달을 열지 않습니다.
- 홈 카드의 `공유하기`는 날짜 아래에 둡니다.
- 기사 상세의 `공유하기`와 `수정하기`는 태그 줄 바로 아래 같은 줄에 둡니다.
- 기사 상세 액션 버튼은 태그 칩과 같은 높이와 밀도를 유지합니다.

---

## Tag, Hero, And Image Rules

- 메인 슬라이드의 카테고리 칩, 글머리 태그, `NEW` 태그는 같은 높이와 리듬을 유지합니다.
- 글머리 태그는 설정 화면뿐 아니라 글 작성/수정 화면에서도 현재 카테고리 기준으로 바로 추가할 수 있어야 합니다.
- 사용 중인 태그는 삭제할 수 없고, 어떤 글에서 사용 중인지 먼저 안내한 뒤 해당 글에서 제외하도록 유도합니다.
- 공개 페이지의 글쓰기/수정 모달도 관리자와 같은 수준으로 태그를 다뤄야 합니다.
- 게시판 글쓰기 모달과 기사 상세 수정 모달에서는 현재 카테고리에 새 태그를 추가하고 바로 선택할 수 있어야 합니다.
- 권한 없는 계정의 태그 추가 시도는 막고 토스트로 안내합니다.
- 메인 스토리 직접 지정과 히어로 슬라이드는 PC/모바일별 이미지 프레이밍 값을 따로 저장할 수 있어야 합니다.
- 공개 화면은 기기 폭에 맞는 프레이밍 값을 자동 선택해야 합니다.
- 이미지 확대/축소 범위는 60%~150%를 유지합니다.
- `contain` 또는 100% 미만 축소로 여백이 생기면 같은 이미지를 블러 배경으로 보정합니다.

---

## Glossary Rules

- 용어집 검색은 기본적으로 `용어 + 설명`을 함께 검색합니다.
- 검색 범위 체크박스를 모두 해제한 상태에서는 검색을 막고 안내합니다.
- 외부 도구나 AI용 용어집 export가 필요하면 기계용 경로를 별도로 둘 수 있습니다.
- 검색 노출이 목적이면 공개 export와 공개 HTML 원문 색인을 우선합니다.

---

## Data And Safety Rules

- 설정 값 수정 시 `settings_history`에 스냅샷을 남깁니다.
- 충돌 가능성이 있으면 최신 데이터를 다시 불러오도록 처리합니다.
- 게시글 삭제 시 글 row만 지우지 말고 연관 이미지, 기록, 조회/공감 데이터, 상세 URL 로그까지 함께 정리합니다.
- 공유 메타는 `functions/[[path]].js` 기준으로 주입합니다.
- 대표 이미지는 `site_meta.image_url` 또는 기본 이미지를 사용합니다.

---

## Footer Rules

- 푸터 좌측 문구는 raw HTML 직접 수정보다 구조화된 필드 편집기를 우선합니다.
- 푸터는 제목, 소개 문구, 도메인, 기사제보 메일, 문의 메일을 각각 수정할 수 있어야 합니다.
- 공개 푸터에서는 링크 줄바꿈과 줄간격이 과하게 벌어지지 않도록 촘촘한 타이포를 유지합니다.

---

## Admin Rules

- 일부 관리자 계정은 히어로 설정만 접근 가능하고 게시글 작성/삭제 권한은 제한됩니다.
- 관리자 화면은 모바일 단일 폭 · 1단 흐름을 기본 구조로 유지합니다.
- 데스크톱에서도 과도한 2단 구조보다 같은 리듬의 단일 흐름을 우선합니다.
- 관리자 상단 액션은 흩어놓지 말고 한 카드 안에서 정리합니다.
- 공통 카드, 툴바, 입력, 메타 칩, spacing 토큰 중심으로 정돈합니다.

---

## Deployment Rules

- 버전 형식은 `Va.bbb.cc`를 따릅니다.
- `bbb`가 올라가면 `cc`는 `00`으로 초기화합니다.
- 정적 자산 캐시 무효화 쿼리도 같은 버전을 사용합니다.
- Site 버전 원본은 `VERSION`, Admin 버전 원본은 `ADMIN_VERSION`입니다.
- 릴리즈 전에는 `./scripts/sync_versions.sh`로 버전 문자열을 먼저 동기화합니다.
- 관리자 버전은 `GW.ADMIN_VERSION`과 관리자 자산 버전 문자열을 함께 올립니다.
- production 배포는 `./scripts/deploy_production.sh`로 진행합니다.
- 배포 후 점검에는 `./scripts/post_deploy_check.sh <url>`를 사용합니다.
- 오너 확인 전에는 production 배포를 하지 않습니다.
- 예외적으로 관리자 UI만 수정되었거나 관리자/API 계열만 수정된 경우는 바로 production 반영이 가능합니다.
- 공개 규칙 문서 변경 시에는 KMS 원본, `docs/feature-definition.md`, `CHATGPT.md`, changelog를 함께 맞춥니다.

---

## Verification Routine

- 중요한 변경이나 배포 전후에는 최소한 홈, 대표 기사 상세, 카테고리 보드, 검색, 용어집, 관리자 진입 화면, 모바일 레이아웃을 확인합니다.
- 스모크 체크는 단순 HTML 응답만 보지 말고 홈, 관리자, 대표 기사, 카테고리 페이지, RSS 응답까지 함께 확인합니다.
- 공개 posts API의 `publish_at`, 관리자 세션 401 처리, D1의 `created_at`, `publish_at`, `updated_at` 컬럼 존재까지 함께 점검합니다.
- 홈 최신 갱신, 공유 버튼 위치, 수정 모달 같은 상호작용 변경은 hard refresh 없이도 직접 검수합니다.
- 구현 중간에도 실제 UI와 기능 정의서가 어긋나지 않는지 다시 확인합니다.
- production 반영 전 마지막으로 한 번 더 KMS 기준과 대조합니다.

---

## Hard Boundaries

- 홈페이지 개발 논의에서는 `DreamPath`를 기준 문서로 삼지 않습니다.
- `DreamPath` 전용 파일 구조, Tiptap 규칙, IIFE 규칙을 메인 사이트에 적용하지 않습니다.
- 메인 사이트 API는 반드시 `/functions/api/` 기준으로 작업합니다.
- 스타일 변경은 가능한 한 기존 공개 사이트 리듬과 일관성을 유지하는 방향으로 진행합니다.
