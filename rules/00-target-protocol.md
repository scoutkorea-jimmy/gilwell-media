---
tags: [ai-guide, rules, common, protocol]
aliases: [Target Protocol, 타겟 확인 절차]
scope: project
---

# 00 · Target Confirmation Protocol

> [!danger] 모든 작업 시작 전 필수
> AI는 코드를 한 줄이라도 수정하기 전에 아래 절차를 수행한다. 이 절차를 건너뛰면 안 된다.

## Step 0 — 로컬/원격 Git 동기화 점검

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

## Step 1 — P0 사이트 오류·이슈 점검 (신규 작업 전 필수)

> [!danger] P0 이슈 처리가 신규 작업보다 우선
> `homepage_issues` 테이블에 `status IN ('open','monitoring')` + `severity IN ('high','critical')`인 항목이 있으면 **신규 작업을 멈추고 이것부터 해결**한다. KMS 0.2.2에 명문화됨.

- 점검 방법:
  - `wrangler d1 execute gilwell-posts --remote --command "SELECT id, title, severity, status, created_at FROM homepage_issues WHERE status IN ('open','monitoring') AND severity IN ('high','critical') ORDER BY created_at DESC"`
  - 또는 `/api/homepage-issues?status=open` GET
  - 또는 관리자 `사이트 오류/이슈 기록` 패널
- 시간 해석 규칙:
  - `homepage_issues.created_at / occurred_at / updated_at` 는 **UTC 저장값**이다. 사용자가 KST 시각(예: `2026-04-25 21:28 KST`)을 말하면 **UTC(`2026-04-25 12:28 UTC`)로 변환해 함께 조회**한다.
- 원인 판별 규칙:
  - `Failed to fetch` 단일 기록만으로 서버 장애로 단정하지 말고, 같은 시각의 `/api/home` 응답 실패·운영 로그·반복 발생 여부를 함께 확인한다. 특히 **홈 백그라운드 새로고침**은 일시 네트워크 단절로도 기록될 수 있다. transient 패턴 판별은 [docs/working-notes.md](../docs/working-notes.md) 참조.
- P0 이슈 있으면: 사용자에게 **"P0 이슈 N건 있음. 신규 요청을 뒤로 미루고 먼저 해결하겠다"고 선언** → 해결 → changelog에 해결 내용 기록 → 신규 요청 착수
- P0 이슈 없으면: 신규 요청 바로 진행
- 사용자가 "P0 무시하고 신규만 진행해"라고 명시한 경우에만 예외. 묵시적 우선순위 변경 금지.

## Step 2 — Target 식별

모든 작업은 다음 4개 타겟 중 **정확히 하나**에 속한다. (복수 타겟 걸침은 Step 3에서 선언)

| Target | 범위 | 대표 파일 |
|---|---|---|
| **Site** | 공개 홈페이지 (방문자용) | `index.html`, `korea.html`, `apr.html`, `wosm.html`, `people.html`, `js/main.js`, `js/board.js`, `js/post-page.js`, `css/style.css`, `functions/api/*` (dreampath 제외) |
| **Admin** | 관리자 페이지 (운영 도구) | `admin.html`, `js/admin-v3.js`, 관리자 전용 API |
| **KMS** | 운영 기준 원본 (Knowledge Management) | `admin.html` → KMS 메뉴, `kms.html`, `docs/feature-definition.md` |
| **Dreampath** | CUFS 내부 앱 (별도 도메인) | `dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/*` |

## Step 3 — Target 확인 응답

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

## Step 4 — Target별 규칙 로드

타겟 확정 후 해당 규칙 파일**만** 적용한다. **타겟 간 규칙 혼용 금지.**

| Target | 읽을 규칙 파일 | 보조 원본 |
|---|---|---|
| Site | [01-common-infra.md](01-common-infra.md) + [10-site.md](10-site.md) (+ 디자인이면 [11-site-design.md](11-site-design.md)) | [[docs/features/README\|Homepage Features Hub]], [[docs/modules/README\|Homepage Modules Hub]] |
| Admin | [01-common-infra.md](01-common-infra.md) + [20-admin.md](20-admin.md) | [[docs/homepage-module-inventory\|Module Inventory]] |
| KMS | [01-common-infra.md](01-common-infra.md) + [30-kms.md](30-kms.md) | 관리자 페이지 KMS 메뉴 (정식 원본), [[docs/feature-definition\|Feature Definition]] (스냅샷) |
| **Dreampath** | **[DREAMPATH.md](../DREAMPATH.md)** (Dev Rules) + **[DREAMPATH-HISTORY.md](../DREAMPATH-HISTORY.md)** (이력 / 케이스 스터디) | [[docs/dreampath/README\|Dreampath Hub]], `/dreampath` Dev Rules |

## Step 5 — 경계 검증

> [!warning] 절대 경계
> - Site/Admin 작업에 **Dreampath 규칙(IIFE, `DP.` 프리픽스, `dp_` 테이블, Tiptap 등)** 적용 금지
> - Dreampath 작업에 **Site/Admin 규칙(GW 네임스페이스, Editor.js, feature/module 허브 등)** 적용 금지
> - KMS는 **운영 기준**이지 코드가 아님 — 코드 변경으로 KMS 기준을 역으로 바꾸려 하지 말 것 (관리자 KMS가 1순위 원본)

**경로로 타겟 판별:**
- `functions/api/dreampath/**`, `dreampath.html`, `js/dreampath.js` → **Dreampath**
- `admin.html`, `js/admin-v3.js` → **Admin**
- `kms.html`, KMS 관련 → **KMS**
- 그 외 `*.html`, `js/main.js`, `css/style.css`, `functions/api/*` → **Site**

## Interaction Checklist

- [ ] `rules/` 디렉토리의 해당 규칙 파일을 **실제로 읽었는가?**
- [ ] Git 동기화 상태를 확인했는가? 차이가 있으면 사용자에게 물었는가?
- [ ] P0 이슈를 점검했는가?
- [ ] 타겟을 식별했는가?
- [ ] 모호하면 질문, 명확하면 선언했는가?
- [ ] 해당 타겟 규칙 파일만 참조했는가?
- [ ] 타 타겟 규칙을 섞지 않았는가?
- [ ] [01-common-infra.md](01-common-infra.md) 공통 인프라 규칙을 준수했는가?

## 예시

**Case 1 — 명확:**
> "`dreampath.html`의 툴바에 이탤릭 버튼 추가"
> → "**Dreampath** 타겟으로 이해했습니다. `DREAMPATH.md`의 Tiptap 4곳 수정 규칙을 따르겠습니다."

**Case 2 — 모호:**
> "게시판 UI 고쳐줘"
> → "Site(공개 게시판)와 Dreampath(사내 게시판) 양쪽에 있습니다. 어느 쪽인가요?"

**Case 3 — 정정:**
> 사용자 "index.html 수정" → AI "Site 진행" → 사용자 "KMS 기준 변경에 따른 반영이야"
> → "이해했습니다. **KMS가 원본**이므로 KMS 기준을 먼저 확인한 뒤 Site에 반영합니다."
