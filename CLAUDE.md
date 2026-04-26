ㅣㄹ ---
tags: [ai-guide, common, entry-point, project-root]
aliases: [AI Rules, Dev Rules, AGENTS, 프로젝트 규칙]
scope: project
---

# CLAUDE.md / AGENTS.md — Gilwell Media AI 작업 가이드

> [!info] 단일 AI 가이드
> 이 파일은 **모든 AI (Claude Code / Codex / ChatGPT 등)** 가 공통으로 따르는 **단일 규칙 원본**입니다.
> Codex는 `AGENTS.md`(이 파일의 심볼릭 링크)로 접근합니다.
> 규칙은 **AI가 아니라 개발 목적지(Target)** 단위로 구성됩니다.

**문서 구조:**
- `0` — Target Confirmation Protocol (모든 작업의 최우선)
- `1` — Common Infrastructure (모든 타겟 공통)
- `2` — **[Site]** 공개 홈페이지
- `3` — **[Admin]** 관리자 페이지
- `4` — **[KMS]** 운영 기준 원본
- `5` — **[Dreampath]** CUFS 내부 앱

---

## 0 Target Confirmation Protocol

> [!danger] 모든 작업 시작 전 필수
> AI는 코드를 한 줄이라도 수정하기 전에 아래 절차를 수행한다.
> 이 절차를 건너뛰면 안 된다.

### Step 0 — 로컬/원격 Git 동기화 점검

> [!danger] 잘못된 코드 베이스 위에서 작업하는 것을 방지
> 로컬과 `origin/main`이 diverged 상태이면 이미 배포된 코드와 다른 기반 위에서 작업하게 된다. **반드시 먼저 확인하고, 차이가 있으면 사용자에게 어떻게 할지 물어본다.**

**점검 명령:**
```bash
git fetch origin
git status
git log --oneline origin/main..HEAD   # 로컬에만 있는 커밋 (ahead)
git log --oneline HEAD..origin/main   # 원격에만 있는 커밋 (behind)
```

**결과별 행동:**

| 상태 | 조건 | AI 행동 |
|---|---|---|
| 동기화됨 | `Your branch is up to date with 'origin/main'` | 바로 다음 Step 진행 |
| 로컬만 ahead | 로컬 커밋이 원격에 없음 | 사용자에게 보고 + 선택 요청 |
| 원격만 ahead | 원격 커밋이 로컬에 없음 | 사용자에게 보고 + 선택 요청 |
| Diverged | 양쪽 모두 독자 커밋 존재 | 사용자에게 보고 + 선택 요청 |

**차이 발견 시 보고 템플릿:**
```
📋 Git 동기화 상태: [diverged / 로컬 ahead N커밋 / 원격 ahead N커밋]

• 로컬에만 있는 커밋: [목록 또는 없음]
• 원격에만 있는 커밋: [목록 또는 없음]

어떻게 진행할까요?
  1. 원격 우선 — 로컬 변경 버리고 origin/main 완전 동기화
     (git fetch origin && git reset --hard origin/main)
     ⚠ 로컬 커밋이 있을 경우 영구 삭제됩니다.
  2. 로컬 우선 — 로컬 상태 그대로 원격에 push
     (git push origin main)
  3. 병합 시도 — git pull로 두 브랜치 병합
     ⚠ 충돌 발생 가능성이 있습니다.
  4. 무시하고 진행 — 현재 로컬 상태 그대로 작업
```

- 사용자가 **명시적으로 선택**한 옵션만 실행. 묵시적 처리 금지.
- 사용자가 "무시하고 진행해"라고 명시한 경우에만 Step 0 건너뜀 가능.

### Step 1 — P0 사이트 오류·이슈 점검 (신규 작업 전 필수)

> [!danger] P0 이슈 처리가 신규 작업보다 우선
> `homepage_issues` 테이블에 `status IN ('open','monitoring')` + `severity IN ('high','critical')`인 항목이 있으면 **신규 작업을 멈추고 이것부터 해결**한다. KMS 0.2.2에 명문화됨.

- 점검 방법:
  - `wrangler d1 execute gilwell-posts --remote --command "SELECT id, title, severity, status, created_at FROM homepage_issues WHERE status IN ('open','monitoring') AND severity IN ('high','critical') ORDER BY created_at DESC"`
  - 또는 `/api/homepage-issues?status=open` GET
  - 또는 관리자 `사이트 오류/이슈 기록` 패널
- 시간 해석 규칙:
  - `homepage_issues.created_at / occurred_at / updated_at` 는 **UTC 저장값**이다. 사용자가 KST 시각(예: `2026-04-25 21:28 KST`)을 말하면 **UTC(`2026-04-25 12:28 UTC`)로 변환해 함께 조회**한다.
- 원인 판별 규칙:
  - `Failed to fetch` 단일 기록만으로 서버 장애로 단정하지 말고, 같은 시각의 `/api/home` 응답 실패·운영 로그·반복 발생 여부를 함께 확인한다. 특히 **홈 백그라운드 새로고침**은 일시 네트워크 단절로도 기록될 수 있다.
- P0 이슈 있으면: 사용자에게 **"P0 이슈 N건 있음. 신규 요청을 뒤로 미루고 먼저 해결하겠다"고 선언** → 해결 → changelog에 해결 내용 기록 → 신규 요청 착수
- P0 이슈 없으면: 신규 요청 바로 진행
- 사용자가 "P0 무시하고 신규만 진행해"라고 명시한 경우에만 예외. 묵시적 우선순위 변경 금지.

### Step 2 — Target 식별

모든 작업은 다음 4개 타겟 중 **정확히 하나**에 속한다. (복수 타겟 걸침은 Step 3에서 선언)

| Target | 범위 | 대표 파일 |
|---|---|---|
| **Site** | 공개 홈페이지 (방문자용) | `index.html`, `korea.html`, `apr.html`, `wosm.html`, `people.html`, `js/main.js`, `js/board.js`, `js/post-page.js`, `css/style.css`, `functions/api/*` (dreampath 제외) |
| **Admin** | 관리자 페이지 (운영 도구) | `admin.html`, `js/admin-v3.js`, 관리자 전용 API |
| **KMS** | 운영 기준 원본 (Knowledge Management) | `admin.html` → KMS 메뉴, `kms.html`, `docs/feature-definition.md` |
| **Dreampath** | CUFS 내부 앱 (별도 도메인) | `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/*` |

### Step 3 — Target 확인 응답

| 상황 | AI 행동 |
|---|---|
| 요청에서 타겟이 **명확히 추론됨** | 한 줄로 **선언 후 진행**: "이 작업은 **[Target]** 타겟으로 이해했습니다. ..." |
| 타겟이 **모호함** | 작업 중단하고 **반드시 질문** (아래 템플릿) |
| **복수 타겟** 걸침 | 모든 타겟 선언: "**Site + Admin** 양쪽에 해당합니다. ..." |
| 사용자가 **정정**함 | 즉시 중단 → 재확인 후 새 타겟 기준으로 재시작 |

**질문 템플릿:**
```
이 작업의 개발 목적지(target)를 확인해주세요:
  1. Site      — 공개 홈페이지
  2. Admin     — 관리자 페이지
  3. KMS       — 운영 기준 원본
  4. Dreampath — CUFS 내부 앱
```

### Step 4 — Target별 규칙 로드

타겟 확정 후 이 문서의 해당 `` 섹션만 적용한다. **타겟 간 규칙 혼용 금지.**

| Target | 이 문서 | 보조 원본 |
|---|---|---|
| Site | `1` + `2` | [[docs/features/README\|Homepage Features Hub]], [[docs/modules/README\|Homepage Modules Hub]] |
| Admin | `1` + `3` | [[docs/homepage-module-inventory\|Module Inventory]] |
| KMS | `1` + `4` | 관리자 페이지 KMS 메뉴 (정식 원본), [[docs/feature-definition\|Feature Definition]] (스냅샷) |
| **Dreampath** | **[DREAMPATH.md](DREAMPATH.md)** (Dev Rules) + **[DREAMPATH-HISTORY.md](DREAMPATH-HISTORY.md)** (이력 / 케이스 스터디) | [[docs/dreampath/README\|Dreampath Hub]], `/dreampath` Dev Rules |

### Step 5 — 경계 검증

> [!warning] 절대 경계
> - Site/Admin 작업에 **Dreampath 규칙(IIFE, `DP.` 프리픽스, `dp_` 테이블, Tiptap 등)** 적용 금지
> - Dreampath 작업에 **Site/Admin 규칙(GW 네임스페이스, Editor.js, feature/module 허브 등)** 적용 금지
> - KMS는 **운영 기준**이지 코드가 아님 — 코드 변경으로 KMS 기준을 역으로 바꾸려 하지 말 것 (관리자 KMS가 1순위 원본)

**경로로 타겟 판별:**
- `functions/api/dreampath/**`, `dreampath.html`, `js/dreampath.js` → **Dreampath**
- `admin.html`, `js/admin-v3.js` → **Admin**
- `kms.html`, KMS 관련 → **KMS**
- 그 외 `*.html`, `js/main.js`, `css/style.css`, `functions/api/*` → **Site**

### Interaction Checklist

- [ ] Git 동기화 상태를 확인했는가? 차이가 있으면 사용자에게 물었는가?
- [ ] 타겟을 식별했는가?
- [ ] 모호하면 질문, 명확하면 선언했는가?
- [ ] 해당 `` 섹션만 참조했는가?
- [ ] 타 타겟 규칙을 섞지 않았는가?
- [ ] `1` 공통 인프라 규칙을 준수했는가?

### 예시

**Case 1 — 명확:**
> "`dreampath.html`의 툴바에 이탤릭 버튼 추가"
> → "**Dreampath** 타겟으로 이해했습니다. `5`의 Tiptap 4곳 수정 규칙을 따르겠습니다."

**Case 2 — 모호:**
> "게시판 UI 고쳐줘"
> → "Site(공개 게시판)와 Dreampath(사내 게시판) 양쪽에 있습니다. 어느 쪽인가요?"

**Case 3 — 정정:**
> 사용자 "index.html 수정" → AI "Site 진행" → 사용자 "KMS 기준 변경에 따른 반영이야"
> → "이해했습니다. **KMS가 원본**이므로 KMS 기준을 먼저 확인한 뒤 Site에 반영합니다."

---

## 1 Common Infrastructure

### Architecture

| Layer | Stack |
|---|---|
| Hosting | Cloudflare Pages (static, no build step) |
| API | Cloudflare Workers (`/functions/api/`) |
| Database | Cloudflare D1 (SQLite, binding: `env.DB`) |
| Storage | Cloudflare R2 (`POST_IMAGES` 버킷) |
| Auth | HMAC-SHA256 signed cookie (`functions/_shared/auth.js`) |

- Wrangler: `/opt/homebrew/bin/wrangler` (필요 시 `export PATH="/opt/homebrew/bin:$PATH"`)

### Database Rules

> [!important] DB 변경 규칙
> - D1 binding: `env.DB`
> - 테이블 접두사: Dreampath = `dp_`, Site/Admin = 접두사 없음
> - **기존 컬럼 삭제/변경 금지** — `ALTER TABLE ADD COLUMN`만 허용
> - 스키마 변경 시 마이그레이션 계획 필요

### Authentication

| 타겟 | 방식 |
|---|---|
| Site/Admin | HMAC-SHA256 signed admin cookie (24h) |
| Dreampath | `dp_session=1` httpOnly cookie (1h) + localStorage profile, 5분 전 갱신 경고 |

- Dreampath 미들웨어: `functions/api/dreampath/_middleware.js`
- 인증 코어: `functions/_shared/auth.js`

### Critical Prohibitions (모든 타겟)

> [!danger] 절대 금지 사항
> 1. `functions/_shared/auth.js` — 승인 없이 수정 금지
> 2. 사용자 입력 HTML → **DOMPurify 없이 `innerHTML` 금지**
> 3. 인증 토큰을 `localStorage`에 저장 금지 (httpOnly 쿠키 사용)
> 4. 기존 DB 컬럼 삭제/타입 변경 금지
> 5. 배포 스크립트 우회 및 버전 등록 생략 금지
> 6. `js/dreampath.js` IIFE 구조 분리/모듈화 금지
> 7. CDN URL 변경 시 버전 고정 확인 필수
> 8. `.env` 또는 시크릿 값 커밋 금지
> 9. `dp_post_approvals` INSERT 시 `approver_id` (NOT NULL) 필수

### Documentation Axis (공통)

- Obsidian 문서 구조는 **feature / module-first** 원칙.
- 페이지는 최상위 축이 아니라 기능 조합의 **surface node**.
- 동일 기능을 여러 페이지 설명으로 복제하지 말고 Feature Hub + Module 라이브러리로 링크 집약.

### Version & Changelog Discipline (Site / Admin / KMS)

> [!important] 모든 Site/Admin/KMS 배포에는 버전 bump + changelog 엔트리가 필수
> `verify_release_metadata.sh`가 배포 preflight에서 둘 다 검증한다. 하나라도 빠지면 배포가 차단된다.

**버전 파일 3개:**

| 파일 | 포맷 | 의미 |
|---|---|---|
| `VERSION` | `aa.bbb.cc` (e.g. `00.113.22`) | 공개 사이트 버전 |
| `ADMIN_VERSION` | `dd.eee.ff` (e.g. `03.064.00`) | 관리자 / KMS 버전 |
| `ASSET_VERSION` | UTC timestamp `YYYYMMDDHHMMSS` | 캐시 버스트 토큰 (자동 생성) |

**Bump 규칙:**
- `aa`/`dd` (Major) — 오너 수동 결정, 제품 단계 전환 시
- `bbb`/`eee` (Feature/Update) — 새 기능, 구조적 리팩터, 모듈 신설. **bump 시 `cc`/`ff` = `00`으로 리셋**
- `cc`/`ff` (Fix/Hotfix) — 버그 수정, 소규모 조정

**언제 무엇을 bump하는가:**
- 공개 사이트(index, korea, apr, ...)의 UI·동작 변경 → `VERSION`
- 관리자 콘솔(`admin.html`, `js/admin-v3.js`, `css/admin.css`) 변경 → `ADMIN_VERSION`
- KMS 탭(`kms.html`, `js/kms.js`, `docs/feature-definition.md`) 변경 → `ADMIN_VERSION`
- 공통 인프라(배포 스크립트, 라이브러리) 변경 → 영향받는 쪽(들) bump
- 복합 변경은 둘 다 bump, changelog 엔트리도 각각 추가

### Changelog (data/changelog.json)

**엔트리 포맷** (`data/changelog.json` → `items[]` 맨 앞에 prepend):

```json
{
  "version": "00.113.22",
  "date": "2026-04-18",
  "released_at": "2026-04-18 14:55:51 KST",
  "summary": "한 줄 요약 (왜 바꿨는지 중심).",
  "changes": [
    "구체적 변경 1 (어떤 파일·모듈이 어떻게 바뀌었는지, 가능하면 수치 포함).",
    "구체적 변경 2.",
    "사이트 버전 00.113.21 → 00.113.22."
  ]
}
```

**필수 필드:**
- `version` — `VERSION` 또는 `ADMIN_VERSION` 문자열과 **정확히 일치** (v prefix 없이)
- `date` — `YYYY-MM-DD` (KST 기준)
- `released_at` — `YYYY-MM-DD HH:MM:SS KST`
- `summary` — 한국어 1문장. 사용자·운영자 관점에서 무엇이 달라졌는지
- `changes[]` — 상세 변경 목록. 마지막 항목에 버전 번호 전이를 명시

**작성 원칙:**
1. **사용자 관점으로 기술** — 내부 리팩터도 "어떤 문제를 해결하는가"로 표현
2. **수치·이름 포함** — 명암비, 변경된 파일 수, 비교 값 등 검증 가능한 지표를 포함
3. **버전 bump 둘 다면 엔트리도 둘** — 사이트·관리자 각각 독립된 엔트리 (같은 `released_at` 공유 OK)
4. **최신이 맨 위** — `items[]`에 prepend. 기존 순서 보존

### Release & Deploy Flow (Site / Admin / KMS)

> [!important] 표준 배포 순서 (생략 금지)
> 이 순서를 지키지 않으면 preflight가 실패하거나 브라우저 캐시 문제로 변경이 반영되지 않는다.

```
1. 코드 변경 (CSS/JS/HTML)
2. VERSION / ADMIN_VERSION 적절히 bump
3. data/changelog.json 맨 앞에 엔트리 prepend (bump된 모든 버전에 대해)
4. ./scripts/sync_versions.sh         # ASSET_VERSION 갱신 + HTML·JS 버전 문자열 전파
5. git add . && git commit            # 코드 + 버전 + changelog + 동기화된 HTML 한 번에
6. git push origin main               # preflight가 main 브랜치 요구
7. ./scripts/deploy_production.sh     # preflight + wrangler pages deploy + post-deploy checks
```

**각 스크립트 역할:**

| 스크립트 | 역할 |
|---|---|
| `sync_versions.sh` | `ASSET_VERSION` UTC 타임스탬프 갱신, 모든 HTML의 `?v=` 토큰과 `GW.APP_VERSION` / `GW.ADMIN_VERSION` / `GW.ASSET_VERSION` 값 일괄 치환 |
| `verify_release_metadata.sh` | VERSION/ADMIN_VERSION/ASSET_VERSION ↔ `js/main.js`·HTML·changelog 정합성 검증. 실패 시 배포 차단 |
| `release_preflight.sh` | `main` 브랜치 + clean tracked worktree + 메타데이터 검증. 실패 시 배포 차단 |
| `deploy_production.sh` | preflight → `wrangler pages deploy` → `post_deploy_check` → `audit_public_posts` → release snapshot |
| `post_deploy_check.sh` | 라이브 사이트의 VERSION 일치 확인 |

**환경:** wrangler 호출 전 `export PATH="/opt/homebrew/bin:$PATH"`

### AI Deployment Protocol (Target별)

| Target | 작업 완료 시 |
|---|---|
| **Site** (공개 홈페이지) | ⚠ 사용자에게 **배포·커밋 여부 질문 후 진행** |
| **Admin** | ✅ 자동 (질문 없이 commit + push + deploy) |
| **KMS** | ✅ 자동 (코드 + D1 변경 포함) |
| **Dreampath** | ✅ 자동 (`./deploy.sh feature/fix "..."`) |

**복합 타겟 작업 (Site 포함):** Site 규칙 우선 — 질문 후 진행.

**Dreampath는 별도 배포** — `./deploy.sh`가 자체 버전 bump(`dp_versions` 테이블)와 cache-bust를 처리하며, `sync_versions.sh` / `changelog.json` 경로를 사용하지 않는다. 상세는 `5 Dreampath → Deployment` 참조.

---

## 2 [Site] 공개 홈페이지

> [!abstract] Scope
> 공개 페이지 (방문자 대상) — 홈, 카테고리 보드, 기사 상세, 검색, 용어집, 회원국 현황 등

### Core Principle

- **안정성 우선** — 새 기능보다 기존 기능의 안정적 동작이 중요
- 네임스페이스: `window.GW` (Dreampath의 `window.DP`와 무관)
- 에디터: **Editor.js** (Dreampath의 Tiptap과 무관)
- 스타일: `css/style.css` 기준 유지

### Key Files

| 파일 | 역할 |
|---|---|
| `index.html` | 홈 |
| `korea.html`, `apr.html`, `wosm.html`, `people.html` | 공개 카테고리 보드 |
| `wosm-members.html` | 세계연맹 회원국 현황 |
| `glossary.html` | 용어집 |
| `search.html` | 검색 |
| `css/style.css` | 공유 스타일 |
| `js/main.js` | `window.GW` + 공용 유틸 |
| `js/board.js` | 게시판 렌더링 |
| `js/post-page.js` | 기사 상세 |
| `functions/api/*` (dreampath 제외) | 사이트 API |
| `functions/[[path]].js` | 공유 메타 주입 |
| `functions/post/[id].js` | 기사 상세 SSR |

### Module Layers

> Foundation → Component → Pattern → Template → Code Module

| Layer | 예시 |
|---|---|
| Foundation | 색상, 타이포, 간격, 상태 언어 |
| Component | 버튼, 태그, 카드, 입력 |
| Pattern | 마스트헤드, 히어로, 섹션 레일 |
| Template | 홈, 게시판, 기사 상세 |
| Code Module | constants, utils, renderers, API helpers |

- P0 공통화: `section rail`, `post card shell`, `button/chip family`
- 모듈 분해 기준: [[docs/homepage-module-inventory|Module Inventory]]

### Site Structure

- 공개 표면: 홈, Korea, APR, WOSM, Scout People, 검색, 용어집, 회원국 현황, 기사 상세, 도움
- 홈 구성: 마스트헤드 → 티커 → 히어로 → 메인 스토리 → 최신 → 인기 → 에디터 추천 → 카테고리 → 푸터 통계
- 에디터 추천: 최대 4개, 서버에서도 강제
- 메인 스토리 ↔ 에디터 추천 **동시 지정 허용** (2026-04-19 배타 제약 해제). 같은 기사를 두 슬롯 모두에 노출할 수 있음. 상세는 KMS 5.5.

### Content & Date Rules

| 기준 | 규칙 |
|---|---|
| 공개 정렬 | `publish_at` 우선, 없으면 `created_at` |
| 공개 날짜 | `YYYY년 M월 D일` |
| RSS 날짜 | `created_at` 기준, 작성자 실명 비노출 |

### Home Rules

- 최신 소식: 첫 진입 + 탭 복귀 + 포커스 복귀 시 항상 재조회
- latest rail: `no-store`
- 접근성: skip-link, 랜드마크, heading 구조, 히어로 일시정지, 티커 정지
- 메인 스토리 저장/해제 후 캐시 즉시 퍼지
- 하드코딩 정리는 `운영값 / 구조상수 / fallback`으로 먼저 분류
- nav fallback, ticker 기본 문구, 공통 경로 제목 → `functions/_shared/site-structure.mjs`, `functions/_shared/site-copy.mjs`
- 공개 HTML fallback 동기화: `scripts/sync_public_fallbacks.mjs` (release 전 자동 반영)
- 홈 런타임 분리 유지: `home-helpers → home-render → home-hero → home-runtime → home.js`

### Design Rules

- 기본 서체: `NixgonFont` (3중량 300 Light / 500 Medium / 700 Bold, `@font-face`는 `css/style.css` 최상단). 본문 기본 `font-weight: 500`, 제목·강조는 `700`, 메타·장식은 `300`
- 공개 메뉴: `data-managed-nav` — 초기 숨김 → 렌더 완료 후 노출 (flash 방지)
- 버튼: 같은 계층이면 높이/패딩/폰트 통일
- 한글: `word-break: keep-all`
- 모바일: 가로 스크롤 금지

> [!tip] Design Guide
> KMS 디자인 탭 = 시각적 레퍼런스. 새 디자인 추가 시 KMS + Module Inventory + 이 문서 함께 갱신.

### Color Palette & Accessibility (WCAG 3.0 APCA)

**브랜드 팔레트 (10색)** — Canvas White 배경 기준 APCA Lc

| 이름 | HEX | White Lc | 용도 |
|---|---|---|---|
| Midnight Purple | `#4D006E` | 100.2 | ✅ 본문 텍스트 / 다크 배경 |
| Scouting Purple | `#622599` | 92.4 | ✅ 본문 텍스트 / 주 브랜드 배경 |
| Forest Green | `#248737` | 73.0 | ✅ 콘텐츠 텍스트 / 성공 상태 |
| Ocean Blue | `#0094B4` | 64.3 | ✅ 콘텐츠·UI (|Lc| 60+) |
| Fire Red | `#FF5655` | 58.9 | ⚠ 대형·헤더·UI만 (|Lc| 45+) / 경고 |
| Canvas White | `#FFFFFF` | — | 기본 배경 |
| Blossom Pink | `#FF8DFF` | 40.0 | ⚠ UI·spot 전용 (본문 금지) |
| Ember Orange | `#FFAE80` | 35.1 | ⚠ UI·spot 전용 (본문 금지) |
| River Blue | `#82E6DE` | 23.6 | ❌ spot 전용 (본문·UI 모두 부족) |
| Leaf Green | `#9FED8F` | 21.0 | ❌ spot 전용 (본문·UI 모두 부족) |

**그레이스케일 (5단계, Black = `#030303` 기반)**

| 토큰 | HEX | White Lc | 용도 |
|---|---|---|---|
| `--gray-900` (= `--black`) | `#030303` | 107.7 | 최대 대비 emphasis |
| `--gray-700` | `#3F3F3F` | 96.2 | 보조 텍스트·아이콘 |
| `--gray-500` | `#8F8F8F` | 61.3 | 콘텐츠·UI 테두리 |
| `--gray-300` | `#C4C4C4` | 33.5 | UI·구분선 (텍스트 금지) |
| `--gray-100` | `#EBEBEB` | 11.1 | 섹션 배경·tint (본문 금지) |

본문 기본은 `--ink`(#1F1F1F, Lc 105.1). RGB/CMYK/PMS 풀표와 배경-텍스트 조합 표는 KMS `3.4 브랜드 컬러 팔레트 및 웹 접근성 원칙` 참조.

**WCAG 3.0 APCA Lc 기준 (프로젝트 공식 명암비 알고리즘):**
- 본문 텍스트(15px+ / 400wt): **|Lc| 75+** 필수, 핵심 표면 90+ 권장
- 콘텐츠 텍스트(14px+ medium): **|Lc| 60+**
- 대형·헤더(18px bold / 24px+): **|Lc| 45+**
- UI·테두리·아이콘·포커스: **|Lc| 30+**
- WCAG 2.1의 4.5:1·3:1 비율 체계는 사용하지 않음 (지각 기반 Lc로 대체)

**색상 선택 원칙:**

1. **색상만으로 정보 전달 금지** — 에러/성공/경고/링크는 색 + 아이콘 + 텍스트 3중 표기. 색각이상자·그레이스케일 모드에서도 구분 가능해야 함.
2. **파스텔 4색(Blossom Pink / Ember Orange / River Blue / Leaf Green)은 본문 텍스트 금지** — 카테고리 태그 배경, 일러스트 전용. 그 위 텍스트는 Midnight Purple 또는 Black.
3. **Fire Red · Ocean Blue는 본문 불가** — 18px bold 이상 헤딩, 버튼 라벨, 아이콘, 테두리에만 (|Lc| 45+/60+).
4. **리터럴 HEX 금지** — 모두 CSS 변수로만 참조 (`var(--color-scouting-purple)`, `var(--gray-700)` 등). 토큰은 `css/style.css` `:root`. 새 색 추가 시 KMS + Module Inventory + `:root` 동시 갱신.
5. **키보드 포커스 인디케이터 필수** — 배경과 `|Lc| 30` 이상 (`outline` 또는 `box-shadow`). 기본 outline 제거 시 대체 표시 필수.
6. **다크/고대비 모드 대응** — `prefers-color-scheme: dark`, `prefers-contrast: more`에서도 Lc 유지.

**검증 (새 UI·색 적용 시):**

- [ ] APCA Contrast Calculator(`https://apcacontrast.com/`)로 모든 텍스트-배경 조합 Lc 검증
- [ ] Chrome DevTools → Rendering → Emulate vision deficiencies (Protanopia / Deuteranopia / Tritanopia / Achromatopsia) 통과
- [ ] 그레이스케일 모드에서 상태·링크·에러가 구분되는지 확인
- [ ] 포커스 인디케이터가 배경과 |Lc| 30 이상인지 확인
- [ ] 모바일 반투명 배경 처리 시 대비 저하 주의

### Article & Share Rules

- 기사 수정: 같은 페이지 모달 (관리자 비밀번호 재검증 필수)
- 공유 `share_ref`: 매 클릭 새로 생성 (캐시 오류 방지)
- 예약 공개: overdue 보정 + Cloudflare scheduled worker 5분 주기

### Tag & Image Rules

- 사용 중인 태그 삭제 불가 → 어떤 글에서 사용 중인지 안내
- 히어로: PC/모바일별 이미지 프레이밍 값 개별 저장
- 이미지 확대/축소: 60%~150%, 100% 미만 시 블러 배경 보정

### Glossary Rules

- 검색: 용어 + 설명 함께 검색
- 검색 범위 체크박스 전체 해제 시 → 검색 차단 + 안내

### Footer Rules

- 구조화된 필드 편집기 우선 (raw HTML 직접 수정 지양)
- 제목, 소개, 도메인, 기사제보 메일, 문의 메일 각각 수정 가능

### Data Safety

> [!important]
> - 게시글 삭제 시 연관 이미지/기록/조회·공감/URL 로그 함께 정리
> - 공유 메타: `functions/[[path]].js` 기준 주입
> - `canonical` + `robots.txt` + `sitemap.xml` 한 세트로 관리
> - sitemap에는 공개 canonical 경로만 포함

### Deployment

배포 순서·버전 bump·changelog 규칙은 **1 Common → Version & Changelog Discipline / Release & Deploy Flow** 참조.

Site 전용 추가 규칙:
- 공개 UI 변경은 오너 확인 후 production 배포 (AI Deployment Protocol: Site = 질문 후 진행)
- `wrangler pages deploy ...`를 직접 쓰더라도 `release_preflight.sh`를 먼저 통과해야 한다
- `VERSION` bump 시 `data/changelog.json`에 사이트 버전 엔트리 prepend 필수

### Verification Checklist (배포 전후)

- [ ] 홈, 대표 기사 상세, 카테고리 보드
- [ ] 검색, 용어집
- [ ] 모바일 레이아웃
- [ ] RSS 응답
- [ ] `robots.txt`, `sitemap.xml` 접근
- [ ] OG meta (`og:title`, `og:image`, `canonical`)
- [ ] 홈 최신 갱신, 공유 버튼, 수정 모달

---

## 3 [Admin] 관리자 페이지

> [!abstract] Scope
> `admin.html` + `js/admin-v3.js` — 운영자 대상 관리 도구

### Admin Rules

- 일부 계정은 히어로 설정만 접근 가능 (게시글 권한 제한)
- 모바일: 단일 폭 1단 흐름 기본
- 탐색 기준: 좌측 사이드바 (메인 영역에 보조 메뉴 중복 금지)
- 운영 섹션: 분석, 접속 국가/도시, 마케팅, 버전기록, 오류/이슈 기록
- 관리자 날짜 형식: **ISO 기반 KST** — 감사 `YYYY-MM-DD HH:MM:SS KST` / 테이블 `YYYY-MM-DD HH:MM` / 필요 시 한글 변형. 상세는 KMS 2.1.
- 관리자 기본 서체: 시스템 서체 (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`) — `NixgonFont` 사용 금지

### Admin 권한 게이팅 (Phase 5 · 03.100.00)

> [!important] 사이드바 + API 이중 게이팅
> 권한 없는 사용자가 메뉴를 보지도·누르지도 않도록 **프론트엔드 가시성 + 백엔드 401/403**을 함께 적용한다.

- **단일 카탈로그 원본**: [`functions/_shared/admin-users.js`](functions/_shared/admin-users.js) `ADMIN_MENUS` (27개 슬러그). 사이드바와 백엔드 `gateMenuAccess`는 이 카탈로그의 슬러그를 **1:1로** 참조한다.
- **프론트엔드 가시성** (`admin.html` 사이드바):
  - 각 메뉴 버튼에 `data-perm-slug="<slug>" data-perm-action="view"` 속성. 예: `<button data-panel="list" data-perm-slug="list" data-perm-action="view">`
  - 오너 전용 메뉴는 `data-owner-only="1" hidden` (예: 사용자 관리 / 프리셋 관리 / 개인정보 처리방침)
  - 필터링은 [`js/admin-account.js`](js/admin-account.js) `_syncOwnerOnlyNav()` + `_syncPermissionNav()`. 세션 로드 후 자동 실행.
  - 그룹 전체가 비면 섹션 헤더까지 숨김 (`_collapseEmptyNavSections()`)
- **백엔드 게이팅**: [`functions/_shared/admin-permissions.js`](functions/_shared/admin-permissions.js) `gateMenuAccess(request, env, slug, action)`. 오너는 무조건 통과, 멤버는 `view:<slug>` 또는 `write:<slug>` 토큰 필수. 32개 admin/settings API가 이를 사용.
- **세션 TTL / 강제 재로그인**: 서버 HMAC 쿠키는 24시간 유효하지만 관리자 콘솔은 **매 `/admin` 페이지 접근마다 캐시·쿠키·Cache API·Service Worker 퍼지 후 로그인 화면을 강제**한다 ([`js/admin-v3.js`](js/admin-v3.js) `_purgeAdminClientState`). 쿠키에서 자동 로그인하지 않음. 로그인 성공 후 클라이언트 유휴 타이머는 **30분**(`_SESSION_MS`). 활동(click/keydown/touch/scroll)이 있으면 리셋, 5분 전 경고, 30분 초과 시 자동 로그아웃.
- **브라우저 캐시**: `/admin`·`/admin.html` 응답에 `Cache-Control: no-store, no-cache, must-revalidate` 설정 ([`_headers`](_headers)). HTML meta 태그(`<meta http-equiv="Cache-Control" ...>`)로 이중 방어. 새로고침이나 뒤로가기 후에도 항상 서버에서 새 HTML 요청.
- **403 UX**: 멤버가 권한 없는 API를 호출해도 서버는 `"이 메뉴의 보기 권한이 없습니다. 오너에게 요청하세요."` 토스트를 노출. 403은 `homepage-issues/report` 자동 보고 대상에서 제외 (버그가 아니므로).

### Admin Data Safety

> [!important]
> - 설정 수정 시 `settings_history` 스냅샷 필수 — 구현: `functions/_shared/settings-audit.js` → `recordSettingChange`, 21개 `functions/api/settings/*.js` 엔드포인트에서 호출.
> - 태그 삭제 시 사용 중인 글 안내 필수 — 구현: `functions/api/settings/tags.js` (사용 중인 태그는 403 + 사용 글 수 반환).
> - 인증은 HMAC-SHA256 signed httpOnly 쿠키 세션(24h)으로 단일화. 기사 수정은 세션 토큰만 검증하고 별도 비밀번호 재입력은 요구하지 않는다 — 세션 만료 시 재로그인만 거친다.
> - 클라이언트 유휴 타이머(`_SESSION_MS`)는 **30분 고정**. 서버 HMAC 쿠키 TTL(24h)보다 짧게 유지해 무활동 세션을 조기 종료한다. 단, 매 `/admin` 접근 시 쿠키 자체를 강제 만료·로그인 강제 적용하므로 쿠키 만료 시간과 불일치해도 UX 문제가 생기지 않는다.

### Admin 관련 문서

- [[docs/homepage-module-inventory|Module Inventory]] — 관리자 포함 모듈 인벤토리
- Admin V3 런타임 — `js/admin-v3.js`

---

## 4 [KMS] 운영 기준 원본

> [!abstract] Scope
> KMS = 운영 기준의 **정식 원본**. 코드가 아니라 운영 문서 영역.

### 원본 우선순위

| 위치 | 역할 | 우선순위 |
|---|---|---|
| 관리자 페이지 KMS (`/admin.html` → KMS 메뉴) | **정식 원본** | 1순위 |
| [[docs/feature-definition\|Feature Definition]] | KMS 보조 스냅샷 | 2순위 |
| [[docs/features/README\|Homepage Features Hub]] | 기능 중심 탐색 | 참고 |

### KMS 작업 규칙

- 코드 변경으로 KMS 기준을 역산하지 말 것 — KMS가 1순위 원본
- KMS 변경 → Feature Definition 스냅샷 갱신 → Site/Admin 코드 반영 순서
- `kms.html`은 공개 뷰어 (편집은 관리자 KMS에서)

---

## 5 [Dreampath] CUFS 내부 앱 — 포인터

> [!important] 이 섹션은 포인터입니다
> Dreampath 관련 **모든** AI 작업 규칙은 **[`DREAMPATH.md`](DREAMPATH.md)** 에 있습니다.
> 케이스 스터디 / 버전 히스토리는 **[`DREAMPATH-HISTORY.md`](DREAMPATH-HISTORY.md)** 에 있습니다.
> 이 `CLAUDE.md` 는 Site / Admin / KMS 전용입니다.
>
> **왜 분리했는가**: Dreampath 는 별도 도메인 독립 예정. 지금부터 문서 경계를
> 잘라 두면, 이전 시점에 두 파일만 새 저장소로 옮기면 됩니다.

### Dreampath 판별 (빠른 참조)

| 경로 | 문서 원본 |
|---|---|
| `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/**`, `img/dreampath/**` | **[DREAMPATH.md](DREAMPATH.md)** (Dev Rules) |
| `functions/_middleware.js`, `functions/_shared/**`, `_headers` | **CLAUDE.md § 1** (공용 인프라) — Dreampath 영향 주의 |

`functions/_middleware.js` 등 공용 인프라를 만질 때 Dreampath 가 영향을 받을 수 있습니다.
이때는 `DREAMPATH.md` Section 10 ("CSP: `/dreampath` 레거시 경로") 와 Section 15.2
("공용 인프라 예외") 를 반드시 함께 확인합니다.

### 공용 인프라 변경이 Dreampath 에 미치는 영향 (역사적 사례)

- 2026-04-24 CSP 회귀: `isLegacyInlinePath()` 에 `/dreampath` 누락 → 사이드바 전체 마비.
  상세: `DREAMPATH-HISTORY.md` 2026-04-24 · A.

이런 변경을 반영할 때는 `VERSION` bump + `data/changelog.json` 엔트리에
"Dreampath 영향: ..." 명시 필수 (`dp_versions` 에는 기록되지 않음).

---

## Related Docs

### Site / Admin
- [[docs/features/README|Homepage Features Hub]] — 기능 중심 진입점
- [[docs/features/Feature Map|Feature Map]] — 전체 기능 맵
- [[docs/modules/README|Homepage Modules Hub]] — 모듈 라이브러리
- [[docs/modules/Homepage Runtime Map|Runtime Map]] — 런타임 의존성

### KMS
- [[docs/feature-definition|Feature Definition]] — KMS 보조 스냅샷
- [[docs/homepage-module-inventory|Module Inventory]] — 모듈 인벤토리

### Dreampath
- **[DREAMPATH.md](DREAMPATH.md)** — AI 작업 규칙 (단일 원본)
- **[DREAMPATH-HISTORY.md](DREAMPATH-HISTORY.md)** — 버전 히스토리 / 케이스 스터디 (국·영 병기)
- [[docs/dreampath/README|Dreampath Hub]] — 기능/API/DB 레퍼런스 (공용 문서)

### 운영 (공통)
- [[docs/release-playbook|Release Playbook]] — 배포 절차
- [[docs/stability-implementation-plan|Stability Plan]] — 안정성 로드맵
- [[docs/hardcoding-inventory|Hardcoding Inventory]] — 하드코딩 감사

---

## Obsidian Graph Map

```
[common]    CLAUDE.md (= AGENTS.md) ← 이 문서
                │
[site]      Features Hub ── 11개 Feature 문서
                │
                └─ Modules Hub ── 16개 Module 문서 (Runtime/Template/API)
                │
[admin]     Admin V3 Runtime ── Admin Operations
                │
[kms]       KMS Template ── Feature Definition (snapshot)
                │
[dreampath] Dreampath Hub ── 기능/API/DB 레퍼런스
                │
[ops]       Release Playbook ── Stability Plan ── Hardcoding Inventory
```
