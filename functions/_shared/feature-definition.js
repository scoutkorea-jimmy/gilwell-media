export const DEFAULT_FEATURE_DEFINITION = `# BP미디어 기능정의서 / KMS

이 문서는 BP미디어의 공개 홈페이지, 관리자, 운영 데이터 규칙, 배포 규칙을 통합해서 관리하는 기준 문서다.
앞으로 새 기능을 개발하거나 기존 기능을 수정할 때는 이 문서를 먼저 확인하고, 구현이 끝나면 반드시 이 문서도 함께 갱신한다.

## 0. 문서 목적과 사용 순서

### 0.1 문서의 역할

#### 기능 세부 설명
- 이 문서는 "현재 사이트가 무엇을 하는가"를 정리하는 설명서가 아니라, "앞으로도 어떻게 만들어야 하는가"를 결정하는 기준서다.
- 운영자, 디자이너, 인간 개발자, AI 개발자 모두 같은 기준을 보기 위해 KMS를 단일 진실 원본(single source of truth)으로 사용한다.
- 관리자 페이지의 \`KMS\` 메뉴가 원본이며, 저장소의 \`docs/feature-definition.md\`는 스냅샷이다.
- 저장소 루트의 \`CLAUDE.md\` (= \`AGENTS.md\` 심볼릭 링크)는 모든 AI의 공통 작업 기준 문서이며, Site / Admin / KMS / Dreampath 타겟별로 구성된다. 기존 \`ai-guide.html\` 기준은 모두 이 문서와 KMS로 이관되었다.

#### 각주
- 구현이 문서와 다르면 코드를 맞추거나 문서를 업데이트해야 한다. "문서와 실제가 다른 상태"를 방치하지 않는다.

### 0.1.1 AI 개발 공통 프로토콜

#### 기능 세부 설명
- 규칙은 AI 도구 종류(Claude, Codex, ChatGPT 등)가 아니라 **개발 목적지(Target)** 단위로 관리한다.
- 모든 AI는 작업을 시작하기 전에 아래 4개 타겟 중 **하나**를 먼저 식별·선언한다.
  - \`Site\` : 공개 홈페이지 (방문자용)
  - \`Admin\` : 관리자 페이지 (운영 도구)
  - \`KMS\` : 운영 기준 원본 (이 문서)
  - \`Dreampath\` : CUFS 내부 앱 (별도 도메인)
- 타겟이 모호하면 AI는 코드를 수정하기 전에 반드시 사용자에게 질문한다.
- 타겟 확정 후에는 \`CLAUDE.md\` (= \`AGENTS.md\` 심볼릭 링크)의 해당 \`\` 섹션만 참조하고, 다른 타겟 규칙을 섞지 않는다.
- KMS 변경은 Site/Admin의 코드 변경에 우선한다. 코드 변경으로 KMS 기준을 역산하지 않는다.

#### 각주
- AI별로 규칙을 분리하면 규칙 드리프트와 중복 관리 비용이 생긴다. AI는 교체될 수 있지만 타겟은 바뀌지 않는다.
- 타겟 경계를 지키지 않으면 Dreampath의 IIFE/Tiptap 패턴이 Site에 섞이거나, Site의 \`GW\` 네임스페이스가 Dreampath에 섞이는 식으로 아키텍처가 무너진다.

### 0.2 개발자가 반드시 지켜야 할 순서

#### 기능 세부 설명
- 1단계: 구현 전에 KMS 문서를 읽고 현재 규칙을 확인한다.
- 2단계: 문서에 없는 기능이라면 먼저 문서에 추가한다.
- 3단계: 구현 중간에 UI 이름, 데이터 정의, 정렬 기준, 권한 흐름이 문서와 같은지 다시 확인한다.
- 4단계: 배포 전 마지막으로 문서와 실제 화면을 대조한다.
- 5단계: 배포 후 KMS 기준 문구를 갱신한다.

#### 각주
- 이 순서를 지키지 않으면 용어 충돌, UI 명칭 불일치, 스파게티 코드, 기준 없는 예외 처리, 분석 데이터 오염이 반복된다.

### 0.2.1 관리자 변경 배포 원칙

#### 기능 세부 설명
- 관리자 콘솔과 KMS 변경은 공개 사이트 production 검수 게이트의 대상이 아니다.
- 관리자(KMS 포함) 변경은 관리자 실환경에서 직접 검수하고, 공개 사이트 production 체크리스트 통과 여부와 분리해서 판단한다.
- 공개 페이지 변경이 없는 관리자 작업이라면 Site production 반영 여부를 기준으로 완료 판단하지 않는다.

#### 각주
- 관리자 화면은 운영자 전용 도구이므로, 공개 사용자 기준 production QA와 같은 규칙으로 묶지 않는다.

### 0.2.2 사이트 오류·이슈 기록의 절대 우선순위 (P0)

#### 기능 세부 설명

**관리자 \`사이트 오류/이슈 기록\` 패널 또는 \`homepage_issues\` 테이블에 \`status = 'open'\`인 항목이 있으면, 어떤 신규 작업보다 먼저 해결한다.**

- 새 기능, 리팩터, 디자인 개선, 문서 갱신 등 어떤 작업 요청이 들어와도 **작업 시작 전 \`/admin\` → \`사이트 오류/이슈 기록\` 또는 \`/api/homepage-issues?status=open\` 확인이 필수.**
- 해결 대상 조건: \`status IN ('open', 'monitoring')\` 이면서 \`severity IN ('high', 'critical')\`인 항목은 P0. \`medium\` 이하는 P1 (신규 작업 전 고려). \`low\`·\`resolved\`는 정보 참고.
- 해결 후 이슈 \`status = 'resolved'\`로 업데이트하고, 다음 배포의 changelog에 **어떤 이슈를 어떻게 해결했는지** 명시.
- 사용자가 신규 요청을 주더라도 P0 open 이슈가 있으면 **먼저 "P0 이슈 N건 있음, 이것부터 처리하겠다"고 선언하고 처리 → 완료 후 신규 요청 착수.**
- 이슈 상태 업데이트 API: \`PATCH /api/homepage-issues/:id\` (status/severity/resolution_notes). admin UI에서도 수동 업데이트 가능.

**신규 작업 시작 전 체크리스트**
1. \`/api/homepage-issues?status=open\` GET → open 이슈 목록 확인
2. \`severity='high'\` 또는 \`'critical'\` 있으면 P0 처리 우선
3. 없으면 신규 작업 착수
4. 작업 중 새 오류를 발견하면 즉시 \`homepage_issues\`에 기록(코드에서 \`_reportSiteIssue\` 또는 직접 INSERT)

#### 각주

- 이 조항은 2026-04-19에 관리자 검색·필터 전면 불가 이슈가 여러 날 동안 열려 있었음에도 KMS/디자인 토큰 정리 같은 "덜 시급한" 작업을 먼저 진행하면서 사용자 신뢰가 손상된 사건 이후 명문화됐다.
- "P0 이슈가 있는데 신규 작업을 요청받음" 상황에서 AI는 **"신규 작업을 P0보다 뒤로 미룬다"고 먼저 선언**해야 한다. 사용자가 P0를 무시하고 신규만 진행하라고 명시 지시한 경우에만 예외.
- 사이트 오류·이슈 기록은 AI의 작업 이력이 아니라 **사용자가 보는 품질 지표**다. open 상태의 P0 이슈는 사용자 관점에서 "지금 망가진 기능"이다.

### 0.3 문서 구조 규칙

#### 기능 세부 설명
- \`##\`는 대목차다.
- \`###\`는 세목차이며, 기능의 의도와 운영 목적을 설명한다.
- \`####\`는 실제 동작 규칙, 필드 정의, 예외 조건, 상태 변화, 개발 메모를 적는다.
- 디자인 규칙은 코드 예시와 사람이 읽는 설명을 같이 둔다.

### 0.3.1 기능/모듈 우선 문서 원칙

#### 기능 세부 설명
- Obsidian 기준의 최상위 탐색 축은 페이지가 아니라 \`기능(Feature)\`과 \`모듈(Module)\`이다.
- 페이지는 단일 진실 원본이 아니라, 여러 기능이 조합된 \`surface\`로 취급한다.
- 같은 기능이 여러 페이지에 걸치면 페이지별 설명을 복제하지 않고, 기능 허브와 모듈 라이브러리 문서에 위키링크를 모은다.
- 새 문서가 필요할 때는 먼저 기능 허브에 연결하고, 그 다음 모듈/API/Template/Surface 순서로 연결한다.

#### 각주
- 이렇게 해야 동일한 기능이 서로 다른 페이지 설명으로 다시 쓰이면서 기준이 갈라지는 것을 막고, AI가 읽는 문맥도 더 짧게 유지할 수 있다.

### 0.4 버전 스킴

#### 기능 세부 설명
- Site 버전 형식: \`aa.bbb.cc\`
  - \`aa\` : 제품 단계 / 대버전
  - \`bbb\` : 기능 추가 / 구조 변경
  - \`cc\` : Hotfix / Bugfix
- Admin 버전 형식: \`dd.eee.ff\`
  - \`dd\` : 관리자 제품 단계
  - \`eee\` : 관리자 기능 추가 / 구조 변경
  - \`ff\` : 관리자 Hotfix / Bugfix
- 예시
  - Site: \`00.101.01\`
  - Admin: \`03.011.00\`
- \`VERSION\` 파일에는 항상 현재 Site 버전을 저장한다.
- \`ADMIN_VERSION\` 파일에는 항상 현재 Admin 버전을 저장한다.
- \`ASSET_VERSION\` 파일에는 현재 배포 자산 캐시 버스팅 토큰을 저장한다.
- \`./scripts/sync_versions.sh\`가 \`js/main.js\`의 \`GW.APP_VERSION\`, \`GW.ADMIN_VERSION\`, \`GW.ASSET_VERSION\`, 관리자 자산 쿼리 버전, 공개 HTML 자산 쿼리 버전을 함께 맞추고 새로운 자산 토큰을 생성한다.

#### 각주
- 공개 홈페이지만 바뀌면 Site 버전만 올린다.
- 관리자만 바뀌면 Admin 버전만 올린다.
- 둘 다 바뀌면 두 버전을 각각 올린다.

## 1. 사이트 전체 구조

### 1.1 공개 페이지 구조

#### 기능 세부 설명
- \`/\` : 홈
- \`/latest\` : 최근 소식
- \`/korea\`, \`/apr\`, \`/wosm\`, \`/people\` : 카테고리 게시판
- \`/post/:id\` : 기사 상세
- \`/calendar\` : 일정 캘린더
- \`/glossary\` : 용어집
- \`/wosm-members\` : 세계연맹 회원국 현황
- \`/contributors\` : 도움을 주신 분들
- \`/search\` : 검색 결과
- \`/feature/:category/:slug\` : 특집 기사 컬렉션
- 위 페이지들은 최상위 설계 단위가 아니라, \`기능 + 모듈 + API\`를 묶어 보여주는 surface다.
- 기능 관계는 \`docs/features/*\`, 모듈 관계는 \`docs/modules/*\`, surface 관계는 \`docs/surfaces/*\`를 기준으로 본다.

### 1.2 관리자 구조

#### 기능 세부 설명
- \`/admin\` : 관리자 콘솔 V3 (사이드바 기반 단일 페이지)
- \`/kms\` : 관리자만 접근 가능한 KMS (기능정의서)
- 관리자 콘솔은 좌측 고정 사이드바 + 우측 콘텐츠 패널 구조다.
- 사이드바 섹션: \`운영\`, \`콘텐츠 제작\`, \`콘텐츠 데이터\`, \`홈 · 노출\`, \`시스템 설정\`
- 운영 섹션에는 \`방문 분석\`, \`태그 인사이트\`, \`접속 국가/도시\`, \`마케팅\`, \`버전기록\`, \`사이트 오류/이슈 기록\`, \`사이트 히스토리\` 패널이 포함된다. 분석은 방문 분석(방문/조회/인기 기사/유입)과 태그 인사이트(워드 클라우드/관계도)로 **두 개의 독립 사이드바 메뉴**로 분리되어 있다 (2026-04-19 분리). 두 패널은 \`/api/admin/analytics\` 단일 엔드포인트를 공유하되 각 패널이 필요한 데이터(방문 분석 → 기간 \`days\` / 태그 인사이트 → \`tag_days\` 또는 \`tag_start/tag_end\`)만 요청한다.
- \`사이트 오류/이슈 기록\`은 공개 홈의 자동 오류 보고와 사이트/관리자 전역 API 오류 로그를 함께 자동 집계한다.
- 운영자는 새 이슈를 수동 생성하거나 삭제하지 않지만, 누적된 항목의 상태(\`열림 → 모니터링 → 해결됨 → 보관\`)는 현재 운영 판단에 맞게 직접 갱신할 수 있다.
- 패널 전환은 사이드바 항목 클릭으로 이루어지며, URL 변경 없이 단일 페이지 내에서 전환된다.
- 사이트 설정 내부의 보조 섹션 메뉴는 메인 영역에 중복 노출하지 않고, 좌측 사이드바와 상단 패널 제목을 기준 탐색으로 사용한다.

## 2. 공통 데이터 규칙

### 2.1 날짜 필드 정의

#### 기능 세부 설명
- \`created_at\` : 실제 생성 시각
- \`publish_at\` : 공개 기준 시각
- \`updated_at\` : 마지막 수정 시각
- 공개 정렬은 기본적으로 \`publish_at DESC\`, 없으면 \`created_at DESC\`
- 공개 화면 날짜 표시는 \`YYYY년 M월 D일\`
- 관리자 화면 날짜 표시는 **ISO 기반 KST 표기**를 표준으로 한다.
  - 감사 컨텍스트(설정 이력·버전 \`released_at\`·"마지막 갱신" 상태줄): \`YYYY-MM-DD HH:MM:SS KST\` — 초 단위 포함, 프로젝트 전반(\`changelog.json\` \`released_at\`, 서버 audit log, 배포 스크립트)과 동일 포맷.
  - 테이블 고밀도 셀(게시글 목록·방문 로그·분석 그리드): \`YYYY-MM-DD HH:MM\` — 초 생략, 행 높이 보정. 구현 헬퍼: \`GW.formatDateTimeCompactKst\` / \`_formatDateTimeCompact\` / \`_formatAdminTimestamp\`.
  - 장문 서술 맥락(기사 미리보기 등)에서 한글 포맷이 필요하면 \`YYYY년 M월 D일 HH시 MM분\` 변형을 허용. 공개 사이트와 동일한 표기.

#### 각주
- 방문자에게는 읽기 쉬운 일 단위 표기만 노출한다.
- 관리자에게는 감사(audit) 가능한 시각 단위 정보를 유지한다.
- ISO 기반 KST 표기를 표준으로 정한 이유: \`changelog.json\` \`released_at\`, 배포 스크립트(\`sync_versions.sh\` / \`deploy_production.sh\`), 서버 audit 로그, SQL \`DATETIME\` 등 시스템 전반이 이미 ISO 형식을 쓰고 있어 프론트엔드 표기만 한글 변환하면 grep·diff·로그 대조가 깨진다. 27자 한글 포맷은 관리자 테이블 행 높이도 과하게 잡는다. 필요한 경우 상세 뷰에서만 한글 변환.

### 2.2 방문/조회 정의

#### 기능 세부 설명
- 운영 분석의 기준은 \`site_visits\` 중심으로 맞춘다.
- \`site_visits\`에는 국가/도시/좌표 같은 익명 위치 정보가 저장될 수 있지만, IP 원문은 저장하지 않는다.
- 국가/도시 집계는 Cloudflare 요청 메타를 사용하며, 사용자의 별도 위치 권한 요청 없이 서버 기준으로 기록한다.
- \`접속 국가/도시\` 패널의 위치 데이터는 기능 배포 이후 새 방문부터 누적될 수 있으므로, 초기에는 국가/도시 목록이 비어 있을 수 있다.
- 국가명 표시는 주요 ISO 국가코드에 대한 고정 한국어 매핑을 우선 사용하고, 없는 경우에만 환경 fallback을 쓴다.
- \`누적 기사 조회수\`는 마케팅/노출 기준으로 볼 수 있다.
- 기사 상세 평균 체류시간은 \`post_engagement\`에 쌓인 활성 체류시간을 기준으로 계산하고, 관리자 자신의 편집 세션은 제외한다.
- \`방문자수\`와 \`조회수\`는 같은 의미가 아니므로 혼용하지 않는다.
- 공유 링크에는 채널 구분을 위한 UTM을 붙인다.

### 2.3 삭제와 연관 정리

#### 기능 세부 설명
- 게시글 삭제 시 게시글 row만 삭제하면 안 된다.
- 대표 이미지, 슬라이드 이미지, 본문 연관 이미지, 조회 데이터, 공감 데이터, 기록 데이터까지 정리한다.
- 게시글 수정 이력은 \`post_history\`에 남기며, 생성/수정/상태 변경 모두 \`before_snapshot\`과 \`after_snapshot\` 기준으로 저장한다.
- 태그 삭제는 실제 사용 중인 게시글이 없을 때만 허용한다.

## 3. 디자인 시스템

### 3.1 기본 서체와 타이포

#### 기능 세부 설명
- 공개 사이트 기본 서체는 **\`NixgonFont\`** 단일 사용을 원칙으로 한다. 세 중량(300 Light / 500 Medium / 700 Bold)을 사용하며 \`@font-face\`는 \`css/style.css\` 최상단에 일괄 선언되어 있다.
- 관리자 콘솔(V3)은 시스템 서체(\`-apple-system, BlinkMacSystemFont, system-ui, sans-serif\`)를 사용한다. 관리자 V1/KMS는 \`NixgonFont\`를 사이트와 동일하게 사용.
- 한글 줄바꿈은 \`word-break: keep-all\` 우선으로 처리한다.
- 제목은 과하게 압축하지 않고, 본문은 읽기 위주의 line-height(1.7 ~ 1.85)를 유지한다.
- 중량 선택 기준: **300 Light** = 부가 정보·메타·장식 텍스트, **500 Medium** = 본문·라벨·일반 UI 텍스트, **700 Bold** = 제목·강조·버튼 라벨.

#### 코드 예시
\`\`\`css
/* 공개 사이트 @font-face (css/style.css 최상단) */
@font-face {
  font-family: 'NixgonFont';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/NIXGONL-Vb.woff') format('woff');
  font-weight: 300;
  font-display: swap;
}
@font-face {
  font-family: 'NixgonFont';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/NIXGONM-Vb.woff') format('woff');
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: 'NixgonFont';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/NIXGONB-Vb.woff') format('woff');
  font-weight: 700;
  font-display: swap;
}

/* 공개 사이트 본문 */
body {
  font-family: 'Google Sans Flex', NixgonFont, sans-serif;
  font-weight: 500;
  word-break: keep-all;
  line-height: 1.75;
}

/* 관리자 콘솔 V3 */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
\`\`\`

#### 각주
- 이전 서체(\`AliceDigitalLearning\`, noonfonts_elice)는 단일 중량만 지원해 타이포 위계가 약했다. \`NixgonFont\`는 3중량을 제공해 KMS 디자인 가이드의 display / title / body / meta 4단계 위계를 서체 자체로 구현할 수 있다.
- CDN은 동일 \`cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2\` 기준. \`font-display: swap\`으로 FOIT(Flash of Invisible Text) 방지.

### 3.2 공통 여백 규칙 (Spacing 토큰 시스템)

#### 기능 세부 설명

**간격은 4px 그리드 기반의 9개 의미 토큰으로 관리한다.** \`padding\`, \`margin\`, \`gap\` 속성에는 아래 토큰 중 하나를 사용하며, 리터럴(\`8px\`/\`16px\`/\`24px\` 등) 직접 사용은 점진적으로 제거한다. 엣지 케이스(\`3px\`, \`6px\` 등)만 리터럴 허용.

**수직·일반 간격 토큰** (\`css/style.css\` \`:root\`)

| 토큰 | 값 | 용도 |
|---|---|---|
| \`--gap-micro\` | \`4px\` | 아이콘-글자 간격, 얇은 구분선 |
| \`--gap-tight\` | \`8px\` | 칩 안 padding, 인라인 요소 간격 |
| \`--gap-element\` | \`12px\` | 컴포넌트 내부 요소 간격 |
| \`--gap-card\` | \`16px\` | 카드 내부 padding, 리스트 항목 |
| \`--gap-section\` | \`24px\` | 섹션 내부 블록 간격 |
| \`--gap-section-out\` | \`32px\` | 섹션과 섹션 사이 |

**페이지 좌우 거터 토큰** (반응형, \`padding-inline\`)

| 토큰 | 값 | 적용 뷰포트 |
|---|---|---|
| \`--pad-page-desktop\` | \`48px\` | 데스크톱 본문 |
| \`--pad-page-tablet\` | \`32px\` | 태블릿 |
| \`--pad-page-mobile\` | \`16px\` | 모바일 |

**타이포그래피 크기 토큰** (\`font-size\`, \`css/style.css\` \`:root\`)

간격과 마찬가지로 \`font-size\`도 토큰으로 관리한다. 리터럴 px 값을 \`font-size\`에 직접 쓰지 않는다.

| 토큰 | 값 | 용도 |
|---|---|---|
| \`--fs-micro\` | \`10px\` | 아주 작은 부기 (캡션 미만) |
| \`--fs-meta\` | \`11px\` | 메타 라벨, h5 칩, 날짜 배지 |
| \`--fs-caption\` | \`12px\` | 작은 보조 라벨, 인라인 코드 |
| \`--fs-small\` | \`13.5px\` | 테이블 셀, 고밀도 영역 |
| \`--fs-body\` | \`14px\` | 기본 본문 (사이트 공통) |
| \`--fs-reading\` | \`15px\` | 긴 문서 본문 (KMS 기능정의서) |
| \`--fs-lead\` | \`16px\` | 섹션 리드 문단 (h4 직후 첫 문단) |
| \`--fs-title\` | \`18px\` | 세부 섹션 제목 (h4 = ###) |
| \`--fs-section\` | \`20px\` | 중간 섹션 제목 |
| \`--fs-chapter\` | \`22px\` | 대장 섹션 제목 (h3 = ##) |
| \`--fs-document\` | \`24px\` | 문서 제목 (h2 = #) |
| \`--fs-display\` | \`32px\` | 디스플레이/히어로 제목 |

**사용 원칙**
- 새 CSS 작성 시 \`padding\`·\`margin\`·\`gap\`에 **반드시 토큰 사용**. 리터럴 값 직접 입력 금지.
- 토큰에 없는 값(예: \`20px\`, \`28px\`)이 필요하면 먼저 **기존 토큰으로 대체 가능한지 재검토**. 불가능하면 용도를 KMS에 추가하고 토큰으로 승격.
- 관리자 콘솔은 인라인 \`margin/gap/width\`를 늘리기보다 공통 토큰과 카드 규칙을 우선 사용한다.
- 같은 역할의 검색창, 필터행, 카드 헤더, 보조 설명, 사이드 카드 제목은 같은 간격 체계를 공유해야 한다.
- 관리자 패널 간격 수정은 한 화면만 맞추는 것이 아니라 \`대시보드 / 작성 / 설정 / 분석 / 버전기록 / 오류기록\` 전체에서 같은 언어로 보이는지 함께 확인한다.
- 페이지 좌우 거터는 **컨테이너 단위로만 적용**하고, 내부 요소는 별도 \`padding-inline\`을 겹쳐 쓰지 않는다.

**코드 예시**

\`\`\`css
/* ✅ 토큰 사용 */
.article-card        { padding: var(--gap-card); gap: var(--gap-element); }
.home-section        { padding: var(--gap-section); margin-bottom: var(--gap-section-out); }
.page-container      { padding-inline: var(--pad-page-desktop); }
@media (max-width: 768px) {
  .page-container    { padding-inline: var(--pad-page-mobile); }
}

/* ❌ 리터럴 직접 사용 (점진적 제거 대상) */
.article-card-bad    { padding: 16px; gap: 12px; }
\`\`\`

#### 각주
- 토큰 도입 배경: 같은 값이 \`8px\`·\`16px\`·\`24px\` 리터럴로 수백 군데 흩어져 있어 디자인 리듬 조정이 불가능했다. 토큰으로 승격해 한 곳에서 값을 바꾸면 전체가 함께 움직인다.
- 리터럴 전면 치환은 2026-04-18 세션에서 \`padding\`/\`margin\`/\`gap\` 속성 한정으로 551건 처리 완료. \`border-radius\`, \`width\`, \`height\`, \`line-height\` 등 비-간격 속성은 대상 외.

### 3.3 버튼 위계 규칙

#### 기능 세부 설명
- Primary: 핵심 행동, 진한 배경, 흰색 텍스트
- Secondary(Outline): 보조 행동, 흰 배경 + 테두리
- Ghost: 파괴적이지 않은 작은 보조 행동
- 같은 위계의 버튼은 높이와 패딩을 통일한다.

#### 코드 예시 (관리자 V3 클래스 기준)
\`\`\`html
<button class="v3-btn v3-btn-primary">저장</button>
<button class="v3-btn v3-btn-outline">취소</button>
<button class="v3-btn v3-btn-ghost">더보기</button>
<button class="v3-btn v3-btn-danger">삭제</button>
\`\`\`

### 3.4 브랜드 컬러 팔레트 및 웹 접근성 원칙

#### 기능 세부 설명

**브랜드 컬러 팔레트 (10색)**

공개 사이트와 관리자 콘솔이 공통으로 사용하는 기본 색상이다. 같은 색이라도 용도(텍스트 / 배경 / 강조 / 장식)에 따라 사용 가능 여부가 달라진다. 새 색상 추가·변경은 이 표를 먼저 갱신하고 \`css/style.css\` \`:root\` CSS 변수 토큰을 함께 바꾼다.

| 이름 | HEX | RGB | CMYK | PMS-C |
|---|---|---|---|---|
| Scouting Purple | \`#622599\` | 98, 37, 153 | 79, 94, 0, 0 | 527 |
| Canvas White | \`#FFFFFF\` | 255, 255, 255 | 0, 0, 0, 0 | — |
| Midnight Purple | \`#4D006E\` | 77, 0, 110 | 80, 100, 0, 45 | 2607 |
| Blossom Pink | \`#FF8DFF\` | 255, 141, 255 | 5, 45, 0, 0 | 236 |
| Fire Red | \`#FF5655\` | 255, 86, 85 | 0, 80, 60, 0 | 178 |
| Ember Orange | \`#FFAE80\` | 255, 174, 128 | 0, 30, 40, 0 | 162 |
| Ocean Blue | \`#0094B4\` | 0, 148, 180 | 100, 0, 30, 0 | 632 |
| River Blue | \`#82E6DE\` | 130, 230, 222 | 45, 0, 15, 0 | 318 |
| Forest Green | \`#248737\` | 36, 135, 55 | 95, 0, 90, 20 | 348 |
| Leaf Green | \`#9FED8F\` | 159, 237, 143 | 40, 0, 50, 0 | 2267 |

**그레이스케일 5단계 (Black = \`#030303\` 기반)**

브랜드 팔레트와 별개로, 화면 전반의 위계·UI 요소·상태 표현에 사용하는 중립 회색 5단계를 정의한다. \`:root\`의 \`--black\`은 \`#030303\`(진검정)으로, \`--ink\`는 \`#1F1F1F\`(본문 텍스트용 soft black)로 분리되어 있다. 명암비는 APCA(WCAG 3.0) Lc 기준.

| 토큰 | HEX | White 배경 Lc | 용도 |
|---|---|---|---|
| \`--gray-900\` (= \`--black\`) | \`#030303\` | 107.7 | ✅ 최대 대비 emphasis, pure black 액센트 (본문 OK) |
| \`--gray-700\` | \`#3F3F3F\` | 96.2 | ✅ 보조 텍스트, 아이콘, 진한 테두리 (본문 OK) |
| \`--gray-500\` | \`#8F8F8F\` | 61.3 | ✅ 콘텐츠 텍스트(14px+ medium) / UI 테두리 |
| \`--gray-300\` | \`#C4C4C4\` | 33.5 | ⚠ UI 요소·테두리·아이콘 전용 (텍스트 금지) |
| \`--gray-100\` | \`#EBEBEB\` | 11.1 | ❌ 섹션 배경·tint 전용 (본문 절대 금지) |

본문 텍스트는 \`--ink\`(#1F1F1F, soft black, White 배경 Lc 105.1)를 기본으로 사용한다. \`--gray-900\`은 강조 요소(헤드라인, 브랜드 록커 등)에 제한적으로 쓴다.

**WCAG 3.0 APCA Lc 기준**

이 프로젝트는 WCAG 3.0(Silver draft)의 APCA(Accessible Perceptual Contrast Algorithm)를 공식 명암비 기준으로 사용한다. 기존 WCAG 2.1의 4.5:1·3:1 비율 체계는 더 이상 사용하지 않으며, 지각 기반 Lc 값(-108 ~ +108)으로 용도를 결정한다. 양수 Lc는 어두운 텍스트/밝은 배경, 음수 Lc는 밝은 텍스트/어두운 배경이며, 판단은 절대값 \`|Lc|\`로 한다.

| 용도 | \`\|Lc\|\` 최소 | 비고 |
|---|---|---|
| 본문 텍스트 (15px 이상 / 400 weight) | **75** | 핵심 표면은 90+ 권장 |
| 콘텐츠 텍스트 (14px 이상 / medium 이상) | **60** | 메타, 보조 설명 |
| 대형·헤더 텍스트 (18px bold / 24px+ 일반) | **45** | 본문 크기에선 부족 |
| 비텍스트 UI · 테두리 · 아이콘 · 포커스 인디케이터 | **30** | spot 전용, 본문 금지 |

**색상별 접근성 분류 (Canvas White 배경 기준 APCA Lc)**

| 색상 | White 대비 Lc | 사용 가능 범위 |
|---|---|---|
| Midnight Purple \`#4D006E\` | 100.2 | ✅ 본문 (\|Lc\| 75+) · 모든 텍스트 가능 |
| Scouting Purple \`#622599\` | 92.4 | ✅ 본문 (\|Lc\| 75+) · 모든 텍스트 가능 |
| Forest Green \`#248737\` | 73.0 | ✅ 콘텐츠 텍스트 (\|Lc\| 60+, 14px+ medium) |
| Ocean Blue \`#0094B4\` | 64.3 | ✅ 콘텐츠 텍스트 · UI (\|Lc\| 60+) |
| Fire Red \`#FF5655\` | 58.9 | ⚠ 대형·헤더 텍스트 / UI만 (\|Lc\| 45+) |
| Blossom Pink \`#FF8DFF\` | 40.0 | ⚠ UI 요소·spot 전용 (\|Lc\| 30+, 본문 금지) |
| Ember Orange \`#FFAE80\` | 35.1 | ⚠ UI 요소·spot 전용 (\|Lc\| 30+) |
| River Blue \`#82E6DE\` | 23.6 | ❌ spot 전용, 본문·UI 모두 부족 (\|Lc\| < 30) |
| Leaf Green \`#9FED8F\` | 21.0 | ❌ spot 전용, 본문·UI 모두 부족 (\|Lc\| < 30) |

**권장 배경-텍스트 조합** (음수 \`Lc\`는 밝은 텍스트/어두운 배경 조합, 절대값으로 판단)

| 배경 | 안전한 텍스트 색 |
|---|---|
| Canvas White | Ink (Lc 105.1) / Black (Lc 107.7) / Midnight Purple (Lc 100.2) / Scouting Purple (Lc 92.4) / Forest Green (Lc 73.0) |
| Midnight Purple | Canvas White (\|Lc\| 103.6) / Leaf Green (\|Lc\| 79.8) / Blossom Pink (\|Lc\| 60.2) / Ember Orange (\|Lc\| 64.9) |
| Scouting Purple | Canvas White (\|Lc\| 96.8) |
| Forest Green | Canvas White (\|Lc\| 75.6) |
| Fire Red / Ocean Blue | 배경 사용 시 Canvas White 텍스트만 |
| Pastel 4색(Blossom Pink / Ember Orange / River Blue / Leaf Green) | Midnight Purple 또는 Black만 허용 |

**색상 선택 원칙**

1. **색상만으로 정보를 전달하지 않는다.** 에러·성공·경고·링크 등 상태·의미는 색 + 아이콘 + 텍스트의 3중 신호로 표기한다. 색각이상자(남성 8%, 여성 0.5%)와 흑백 인쇄·그레이스케일 모드에서도 구분 가능해야 한다.
2. **파스텔 4색은 본문 텍스트 색으로 쓰지 않는다.** Blossom Pink, Ember Orange, River Blue, Leaf Green은 카테고리 태그 배경·일러스트·장식 도형 전용이다. 그 위에 텍스트를 올려야 하면 텍스트 색은 Midnight Purple 또는 Black.
3. **Fire Red·Ocean Blue는 본문 텍스트 금지.** 18px(14pt) 이상 bold 헤딩, 버튼 라벨, 아이콘, 테두리에만 사용한다 (|Lc| 45+/60+).
4. **리터럴 HEX 금지.** 모든 색은 CSS 변수로만 참조한다 (\`var(--color-scouting-purple)\` 등). 새 색 추가 시 \`:root\` 토큰, 이 문서, KMS, \`docs/homepage-module-inventory.md\`를 동시에 갱신한다.
5. **키보드 포커스 인디케이터는 필수.** 키보드 탐색 중 현재 포커스된 요소는 항상 배경과 \`|Lc| 30\` 이상 대비로 표시한다 (\`outline\` 또는 \`box-shadow\`). 기본 브라우저 outline을 제거했다면 반드시 대체 표시를 제공한다.
6. **다크 모드·고대비 모드 대응.** 색 토큰은 \`prefers-color-scheme: dark\`와 \`prefers-contrast: more\` 미디어 쿼리에서 명암비가 유지되도록 설계한다.

**검증 체크리스트 (새 UI·색 적용 시)**

- [ ] APCA Contrast Calculator(\`https://apcacontrast.com/\`)로 모든 텍스트-배경 조합 Lc 검증
- [ ] Chrome DevTools → Rendering → Emulate vision deficiencies(Protanopia / Deuteranopia / Tritanopia / Achromatopsia) 통과
- [ ] 그레이스케일 모드에서 상태·링크·에러가 구분되는지 확인
- [ ] 키보드 포커스 인디케이터가 배경과 \`|Lc| 30\` 이상인지 확인
- [ ] 모바일 화면에서도 동일 명암비가 유지되는지 확인 (배경 반투명 처리 시 대비 저하 주의)

#### 각주
- APCA(Accessible Perceptual Contrast Algorithm)는 WCAG 3.0(Silver draft)의 공식 명암비 알고리즘이다. WCAG 2.1의 단순 광도 비율(4.5:1, 7:1)은 인간의 실제 가독성을 충분히 반영하지 못해 폐기 수순이며, APCA는 sRGB 선형화 후 배경/텍스트 광도를 다른 지수(^0.56, ^0.57 또는 ^0.65, ^0.62)로 가중해 **지각 기반** Lc를 산출한다.
- 이 프로젝트는 WCAG 2.1 AA/AAA 체계를 사용하지 않는다. 한국 KWCAG 2.2, EU EN 301 549, US ADA 등 법적 최소치는 WCAG 2.1 AA이지만, APCA Lc 60+는 대략 WCAG 2.1 AA 4.5:1을 초과하므로 법적 요구치를 동시에 충족한다.
- 파스텔 4색이 White 배경에서 Lc가 낮은 것은 색 자체의 문제가 아니라 용도가 배경·장식으로 설계되었기 때문이다. 원본 색을 어둡게 조정하지 말고 용도 경계를 지킨다.
- 색상 추가·변경은 브랜드 정합성과 APCA Lc 기준을 동시에 만족해야 한다. 둘 중 하나라도 깨지면 추가하지 않는다.

### 3.5 관리자 컬러 토큰 (V3)

#### 기능 세부 설명
- \`--v3-primary\` : \`#4f46e5\` (인디고) — 핵심 행동, 활성 상태
- \`--v3-danger\`  : \`#ef4444\` (레드) — 삭제, 위험 행동
- \`--v3-success\` : \`#22c55e\` (그린) — 공개 상태, 성공
- \`--v3-sidebar-bg\` : \`#161c2d\` (다크 네이비) — 사이드바 배경
- \`--v3-content-bg\` : \`#f1f5f9\` (라이트 슬레이트) — 콘텐츠 영역 배경

### 3.6 모듈 레이어 기준

#### 기능 세부 설명
- 홈페이지는 \`Foundation / Component / Pattern / Template / Code Module\` 레이어로 나눠서 설계한다.
- \`Foundation\`은 색상, 타이포, 간격, 상태 언어처럼 전역 기준을 다룬다.
- \`Component\`는 버튼, 태그, 카드, 입력 요소처럼 독립적으로 재사용 가능한 UI 블록이다.
- \`Pattern\`은 마스트헤드, 히어로, 섹션 레일, 검색 패널처럼 여러 컴포넌트를 묶은 구조다.
- \`Template\`은 홈, 게시판, 기사 상세, 검색, 용어집처럼 페이지 단위 조합이다.
- \`Code Module\`은 constants, utils, renderers, feature init, API helper처럼 책임 단위가 분리된 코드 구조다.
- 모듈 분해와 우선순위 판단은 \`docs/homepage-module-inventory.md\`를 함께 기준으로 본다.

### 3.7 디자인 모듈 계약

#### 기능 세부 설명
- 하나의 디자인 모듈은 최소한 \`종류\`, \`설명\`, \`토큰/클래스\`, \`코드\`, \`미리보기\`, \`모바일 규칙\`을 가져야 한다.
- 새 UI는 먼저 기존 \`Component\` 또는 \`Pattern\`으로 흡수 가능한지 검토하고, 불가능할 때만 신규 모듈로 추가한다.
- 같은 역할의 버튼은 같은 위계 체계(\`primary / secondary / chip\`)를 따른다.
- 공개 화면과 관리자/KMS에서 역할이 겹치는 버튼, 칩, 페이지 토글은 같은 위계와 상태 언어를 공유한다.
- 카드류는 shell과 content variant를 분리하고 제목, 요약, 메타의 순서를 공통화한다.
- 상태는 최소한 \`default / active / disabled / danger\` 언어를 공유한다.
- 공통 액션 모듈은 공개 구현(\`css/style.css\`)과 관리자 구현(\`css/admin-v3.css\`)을 함께 갱신한다.

### 3.8 KMS 디자인 탭 동작 규칙

#### 기능 세부 설명
- KMS 디자인 탭은 단순 정적 문서가 아니라 홈페이지 모듈 시스템의 시각적 레퍼런스다.
- 각 디자인 항목은 \`코드 보기\`와 \`미리보기\`를 개별적으로 전환할 수 있어야 한다.
- \`미리보기\`를 누르면 해당 모듈의 코드 구조가 즉시 렌더링된 결과를 보여준다.
- \`코드 보기\`를 누르면 같은 항목의 코드 스니펫을 다시 읽을 수 있어야 한다.
- 코드와 미리보기는 같은 모듈의 두 표현이며, 어느 한쪽만 문서화된 상태를 허용하지 않는다.
- 공개/관리 양쪽에 존재하는 모듈은 KMS 카드 안에 구현 대상 파일(\`css/style.css\`, \`css/admin-v3.css\`, 필요 시 \`css/admin.css\`)을 같이 명시한다.

### 3.9 KMS 탭 간 시각 일관성 규칙

#### 기능 세부 설명

**상단 헤더 (\`.kms-header\`)는 모든 탭에서 동일해야 한다.**
- 좌측: 사이드바 토글 + \`KMS\` 뱃지 + 문서 타이틀
- 중앙: 탭 네비게이션 (\`.kms-tab-nav\`)
- 우측: \`관리자 →\` 링크 **1개만** (탭별로 다른 컨트롤을 여기에 올리지 않는다)
- 탭 전용 액션(편집/저장 등)은 해당 탭의 \`.kms-panel-header-side\`에 콤팩트 스타일로 배치한다.

**사이드바 (\`.kms-sidebar\`) 구조는 모든 탭에서 동일하다.**
- 상단 고정: 검색 입력 → 메타 뱃지(Site 버전 / 대목차 수) → 원칙 카드 3개
- 본문: \`kms-section-group-label\` (대분류 구분자) + \`kms-section-link\` (섹션 링크, 들여쓰기 허용)
- 각 탭의 TOC 렌더러는 같은 클래스 / 같은 시각 패턴을 따른다.
  - \`renderSectionList\` (기능정의서): h2 → group-label, h3 → link
  - \`renderApiSectionList\` (API): 'API 그룹' label + 그룹 링크
  - \`renderDesignSectionList\` (디자인): layer header → section link → module sub-link
- 섹션 링크에 \`[소목차]\` / \`[그룹]\` 같은 중복 레이블 prefix를 붙이지 않는다. 시각적 위계는 들여쓰기(\`kms-tree-sub\`)로 표현한다.

**패널 헤더 (\`.kms-panel-header\`)는 모든 탭에서 동일한 구조다.**
- 좌측 텍스트 블록: \`.kms-kicker\` (Meta 11px 대문자 라벨) + \`<h2>\` (Document 24px Midnight Purple) + \`<p>\` (Body 14px muted)
- 우측 사이드: 메타 뱃지 스택. 탭 전용 액션은 그 아래 \`kms-action-row\`로 분리.
- padding 및 gap은 모두 Spacing 토큰(\`--gap-*\`) 사용, 리터럴 금지.

**본문 영역 (\`.kms-main\`)은 모든 탭에서 "카드 스택" 패턴으로 통일한다.**
- 탭 본문은 \`.kms-tab-panel\`(좌우 거터 \`--gap-section-out\`) 안쪽에 카드 스택을 배치한다. 본문 컨테이너에 \`max-width\` + \`margin: 0 auto\`로 **추가 중앙정렬을 넣지 않는다.** 사이드바↔본문 사이 여백은 \`.kms-tab-panel\`의 좌측 패딩(\`--gap-section-out\`, 32px)이 유일한 구분이다.
- 카드 공통 톤: \`Canvas White\` 배경 + \`1px solid var(--kms-border)\` + \`border-radius: 12px\` + 내부 패딩 \`var(--gap-section-out)\` 기준.
  - 기능정의서: 대목차(\`##\`) 단위로 \`js/kms.js → wrapDocSectionsIntoCards\`가 최종 HTML을 분할해 \`<section class="kms-doc-card">\`로 자동 래핑. \`#\` 문서 제목 + 첫 대목차 이전 서문은 \`.kms-doc-card--intro\` 인트로 카드로 분리.
  - API 가이드: API 그룹 단위로 \`.kms-api-group\`.
  - 버전기록: 엔트리 단위로 \`.kms-cl-item\`.
  - 디자인: 레이어 단위로 \`.kms-ds-section\`.
- 본문 컨테이너(\`.kms-document-body\`, \`.kms-api-guide\`, \`.kms-changelog\`, \`.kms-ds-body\`)는 모두 \`display: flex; flex-direction: column; gap: var(--gap-section)\`(24px) 구조로 카드 간격을 통일한다.
- 모바일(≤900px)에서는 카드 내부 패딩을 \`--gap-section / --gap-card\` 로 축소하고 border-radius를 10px로 조정해 좁은 화면 밀도를 보정한다.

**리터럴 금지 확인 사항**
- \`.kms-tab-panel\`, \`.kms-panel-header\`, 사이드바 블록, 본문 카드(\`.kms-doc-card\` / \`.kms-api-group\` / \`.kms-cl-item\` / \`.kms-ds-section\`) 모두에서 \`padding\` / \`margin\` / \`gap\`은 \`--gap-*\` 토큰만 사용.
- \`font-size\`는 \`--fs-*\` 토큰만 사용.
- 색상은 \`--kms-*\` (site 토큰 참조) 또는 site 토큰 직접 사용. 리터럴 hex 금지.

#### 각주
- 탭 간 시각 일관성은 가독성 자체이자 KMS가 "운영 기준 원본"으로 기능하기 위한 전제다. 편집/저장 같은 탭 전용 컨트롤을 공통 헤더에 노출하면 탭 전환마다 헤더 레이아웃이 바뀌어 사용자 초점이 흔들린다.
- 사이드바 항목 앞에 \`[소목차]\` 같은 카테고리 라벨이 붙어있으면 정보가 두 번 반복(라벨 + 번호 매겨진 섹션 제목)되어 스캔 효율이 떨어진다. 시각 위계는 들여쓰기로만 표현한다.
- 기능정의서가 이전에는 \`max-width: 760px\` + \`margin: 0 auto\`로 tab-panel(900px) 안에서 한 번 더 중앙정렬되어 사이드바와 본문 사이에 약 70px의 여분 공간이 생겼다. 다른 탭(API·버전기록·디자인)은 그런 2차 중앙정렬이 없어 기능정의서만 좌측 앵커가 어긋나 보이는 시각 어긋남이 있었다. 본문 카드 스택 + 추가 중앙정렬 금지 원칙으로 네 탭이 같은 좌측 기준선을 공유하게 됐다.

### 3.10 그라데이션 및 투명도 레이어 사용 규칙

#### 기능 세부 설명

**재사용 기준으로 토큰화 여부를 결정한다.**
- **2곳 이상**에서 쓰이는 gradient는 \`:root\`에 \`--gradient-*\` (site) 또는 \`--v3-gradient-*\` (admin) 토큰으로 승격한다.
- 단일 사용처의 glassmorphism·hover tint·드롭다운 상단 조명 등은 인라인 \`linear-gradient(...)\` / \`radial-gradient(...)\`로 직접 쓴다. 재사용 계획 없는 1회성을 토큰으로 만들면 dead token이 누적되어 관리 비용만 늘어난다.

**Gradient 내부 stop 값 규약.**
- **시작·끝 stop**: 가능한 한 브랜드 토큰 참조 — \`var(--scouting-purple)\`, \`var(--v3-text)\`, \`var(--v3-dark-navy-a)\` 등.
- **중간 stop**: gradient 깊이 연출에 필요한 shade(예: \`#562085\`, \`#4e1d7a\`)는 **해당 gradient 토큰 내부에서만** hex 리터럴로 허용한다. 다른 선언에서 그 shade를 별도로 재참조하지 않는다. 재참조가 필요해지는 순간 독립 색 토큰으로 승격.
- **rgba() 투명도 레이어**: 인라인 허용. RGB 값은 브랜드 토큰의 원색(예: scouting-purple \`98, 37, 153\`, indigo-500 \`99, 102, 241\`)을 쓰되, 순수 glassmorphism 덮개는 \`rgba(255,255,255,α)\` / \`rgba(0,0,0,α)\`로 일관화한다. alpha만 조절한다.

**목적별 방향성.**

| 용도 | 권장 |
|---|---|
| 히어로·풀폭 CTA 배경 | 재사용 토큰 (\`--gradient-purple-deep\` 등) |
| 카드 hover 조명 / 드롭다운 상단 highlight | 1회성 rgba 인라인 |
| 섹션 얕은 tint | **단색 토큰 우선** (\`--v3-lav-tint\` 등). gradient는 조명 깊이가 꼭 필요할 때만 |
| Leaflet 지도 polygon 채움 | hex 문자열 JS 데이터 (CSS var 해석 불가) — \`--gw-*\` 토큰 값과 동일하게 유지, 주석 필수 |

**Site vs Admin gradient 분리.**
- 공개 사이트 gradient 토큰: \`--gradient-*\` — \`css/style.css\` \`:root\`.
- Admin V3 gradient 토큰: \`--v3-gradient-*\` — \`css/admin-v3.css\` \`:root\`. admin은 공개 사이트 토큰을 참조하지 않는다 (admin.html이 \`style.css\`를 로드하지 않기 때문 — 3.2 동일 이유).

**정기 감사.**
- **사용 0건인 gradient 토큰은 제거한다.** gradient 토큰은 "재사용될 명확한 계획이 있을 때만" 만든다. 신설 후 다음 감사까지 사용처가 0건이면 즉시 삭제.
- 감사 주기는 관리자 CSS 리터럴 전수 감사(3.2 / 3.4 준수 점검)와 함께 수행.

#### 각주

- 2026-04-19 감사 기준: \`css/style.css\`의 \`--gradient-ink\` / \`--gradient-purple\` / \`--gradient-footer-panel\`은 사용 **0건** (dead token, 제거 대상). \`--gradient-purple-deep\`만 1곳 사용. \`css/admin-v3.css\`는 14개 gradient 선언 중 var() 토큰 사용 3건 / rgba 인라인 11건 / hex 인라인 0건.
- gradient 내부 중간 stop에 대한 "리터럴 금지" 엄격 적용을 포기한 이유: 브랜드 팔레트는 APCA Lc 차이가 크지 않은 shade(~5~10% darker variant)를 중간값으로 자주 필요로 하고, 이를 매번 독립 토큰으로 승격하면 5~10개 shade가 gradient 하나당 생겨 전체 토큰 수가 폭증하고 "한 번도 직접 참조되지 않는" 죽은 토큰이 쌓인다. gradient 자체를 재사용 단위로 묶는 편이 관리 비용이 낮다.
- Admin에서 site gradient 토큰을 못 쓰는 이유는 3.2 말미의 \`--gap-*\`/\`--fs-*\` 이슈와 동일: \`admin.html\`은 \`css/style.css\`를 로드하지 않아 \`var(--gradient-*)\` 참조가 런타임에 undefined로 해석된다.

### 3.11 통일 기간 선택 UI (v3-period-bar)

#### 기능 세부 설명

**기간 필터가 필요한 모든 관리자 패널은 \`.v3-period-bar\` 단일 패턴을 사용한다.**

마케팅이 먼저 채택한 \`.mkt-period-bar\` 구조를 일반화해 \`.v3-period-bar\`로 공유한다. 목적은 운영자가 어느 패널에 들어가든 동일한 방식으로 기간을 지정할 수 있도록 하는 것이다. 패널마다 select/chip/date picker가 다르게 섞여 있으면 스캔 비용이 크고 실수가 늘어난다.

**표준 DOM 구조:**
\`\`\`html
<div class="v3-period-bar" data-v3-period-scope="SCOPE" aria-label="...">
  <span class="v3-period-bar-label">라벨</span>              <!-- 선택 -->
  <div class="v3-presets">
    <button class="v3-preset-btn [is-active]" data-days="7">7일</button>
    <button class="v3-preset-btn" data-days="30">30일</button>
    <button class="v3-preset-btn" data-days="90">90일</button>
  </div>
  <div class="v3-date-range">
    <input type="date" class="v3-date-input-period" data-v3-role="start">
    <span class="v3-date-sep">~</span>
    <input type="date" class="v3-date-input-period" data-v3-role="end">
    <button class="v3-apply-btn" type="button">조회</button>
  </div>
</div>
\`\`\`

**JS 바인딩:** \`_bindPeriodBar(scope, onChange)\` 헬퍼 단일 사용. \`onChange({days})\` 또는 \`onChange({start, end})\`로 호출. preset 클릭 시 date input은 비워지고 onChange({days})가 실행되며, apply 클릭 시 preset 활성이 해제되고 onChange({start, end})가 실행된다.

**서버 API 규약:** 모든 기간 지원 API는 동일한 쿼리 파라미터를 받는다.
- 프리셋 모드: \`?days=N\` (1~180, 기본 30)
- 커스텀 모드: \`?start=YYYY-MM-DD&end=YYYY-MM-DD\`
- 접두사 지원: \`tag_days\`, \`tag_start\`, \`tag_end\` 등 여러 독립 기간 필드를 한 요청에 함께 보낼 수 있다(예: 분석 패널의 방문 분석 + 태그 인사이트).

**적용 범위 (2026-04-19 통일):**

| 패널 | 이전 UI | 통일 후 |
|---|---|---|
| 마케팅 | \`.mkt-period-bar\`(패턴 원조) | 그대로 유지 (CSS 공유) |
| 분석 | \`<select>\` 2개(방문 분석, 태그 인사이트) | \`.v3-period-bar\` 2개 (같은 preset·custom) |
| 접속 국가/도시 | \`<select>\` 1개 | \`.v3-period-bar\` 1개 (geo-audience API가 start/end 수용하도록 확장) |
| 대시보드 히트맵 | 자체 preset(1주/1개월/직접 지정/전체) + hidden custom | \`.v3-period-bar\` 변형 (7일/30일/전체 preset + 항상 노출되는 date range apply) |

**규칙:**

- 신규 기간 필터가 필요한 패널은 반드시 이 패턴을 사용한다. select·chip 등 다른 UI 재사용 금지.
- preset 값은 패널 맥락에 맞게 조정 가능(7/30/90 또는 1/7/30일 등). 단, 버튼 라벨 형식은 \`N일\` 단위로 통일(마케팅의 \`1일/3일/7일/14일/30일\`과 호환).
- "전체"(all) 같은 특수 프리셋이 필요한 패널은 \`data-days\` 대신 패널 전용 속성(예: 대시보드의 \`data-v3-heatmap-mode="all"\`)을 쓸 수 있다. 이때 \`_bindPeriodBar\` 대신 기존 커스텀 바인딩을 유지해도 된다.
- CSS 클래스: \`.v3-period-bar\` / \`.v3-presets\` / \`.v3-preset-btn\` / \`.v3-date-range\` / \`.v3-date-input-period\` / \`.v3-date-sep\` / \`.v3-apply-btn\`. 마케팅의 \`.mkt-*\`와 같은 스타일 규칙을 공유한다(css/admin-v3.css에서 comma-separated selectors).

#### 각주

- 이 패턴 도입 전에는 마케팅(preset), 분석(select 2개), 접속 국가/도시(select 1개), 대시보드(preset + 숨겨진 custom)가 각각 다른 UI 구조였다. 같은 "기간을 고른다"는 작업인데 스캔 비용이 패널마다 달라 운영자 피로도가 높았다.
- \`.mkt-period-bar\` → \`.v3-period-bar\` 일반화 과정에서 마케팅 측 markup을 바꾸지는 않았다. CSS 선택자에 comma로 \`.v3-period-bar\`를 추가해 양쪽이 같은 스타일을 공유하도록 했다. 향후 마케팅도 \`.v3-*\`로 옮기거나 그대로 두거나 선택 가능.
- 대시보드 히트맵의 "전체(all)" 프리셋은 \`days\` 파라미터로 표현할 수 없어 \`heatmap_all=1\` 전용 쿼리를 쓴다. 이 예외는 \`_bindPeriodBar\`를 쓰지 않고 기존 \`_dashboardHeatmapMode\` 상태 머신을 유지했다.

### 3.12 태그 인사이트 패널 (panel-analytics-tags)

#### 기능 세부 설명

관리자 사이드바 \`태그 인사이트\` 메뉴(2026-04-19 분리). 전용 API \`GET /api/admin/tag-insights\` + 공용 분석 모듈 \`functions/_shared/tag-insights.js\` + 오프라인 스크립트 \`scripts/tag-analysis/*.mjs\`가 동일 로직을 공유한다.

**5개 섹션 순서 (위→아래):**

1. **태그 관계도** — 상호작용 중심 카드. 상세는 아래 관계도.
2. **기초 통계** — 전체 기사 수 / 고유 글머리 태그 / 고유 메타 태그 / 평균 메타 태그·기사. 글머리 태그 상위 10 + \`category\`별 평균 메타 태그(SEO 편차 점검) + 메타 태그 상위 20 + 하위 10. 각 표에 **더보기 모달**(페이지네이션 30/페이지) 버튼으로 전체 순위 열람.
3. **태그 체계 건강성 진단** — 1회 등장 고립 태그 / 과다 등장 태그(전체의 30% 이상) / 중복 의심 태그 쌍(편집거리 + 부분 포함 heuristic) / 고립 군집(2~5개 소규모 연결 컴포넌트). 모든 항목 **사람 검토 필요**. 자동 통합/삭제 금지.
4. **콘텐츠 축적 현황** — 글머리 태그별 누적(category 분포 포함) 15 + 더보기 모달, 최근 12개월 월별 발행 추세, 전략적 보강 필요(기사 ≤5건인 글머리).
5. **SEO/AEO 클러스터 + 신규 콘텐츠 제안** — 허브-스포크 클러스터 상위 5(각 허브의 상위 8 공출현 스포크) + 기사 수 부족 글머리 태그 목록 + 신규 콘텐츠 제안 10건(공출현 기반 휴리스틱, 우선순위 상/중/하). 모든 제안 \`human_review_required\`.

**태그 관계도 (2) 상호작용:**

| 축 | 표현 |
|---|---|
| 노드 크기 | 등장 빈도(count) 비례, r = 10~32px |
| 노드 색 | 우세 글머리 태그 기준 **KMS 브랜드 10색**(scouting-purple · midnight-purple · forest-green · ocean-blue · fire-red · blossom-pink · ember-orange · river-blue · leaf-green · gray-700 fallback). SVG fill은 CSS var() 해석 불가라 hex 유지(3.10 Leaflet 예외와 동일). |
| 링크 굵기 | count/maxLinkCount 비선형(\`0.6 + r^0.55 × 5\`) 0.6~5.6px. 약한 연결은 얇고 강한 연결은 훨씬 굵게. |
| 링크 색 | **count 기반 흑백 연속 그라데이션** — \`rgb(v,v,v) where v = 196 - (196-31) * r^0.55\`. 밝은 회색(\`--gray-300\`) → \`--ink\` 검정. 추가로 opacity 0.35~0.80 power 곡선. |
| 가장 약한 연결 | 하위 15%(또는 count=1)는 **점선**(\`stroke-dasharray="4 3"\`). |
| 라벨 | 상위 25개(\`isPrimary\`)만 항상 표시, 나머지 55개는 hover/spotlight 시 노출. halo 렌더(\`paint-order: stroke fill\` + 흰 stroke 3px)로 배경 무관 가독성. |

**상호작용:**

- **마우스 휠 / 핀치 줌** — 커서 위치를 고정점으로 0.25x~4x 확대/축소. 2손가락 핀치 Pointer Events 2개 추적.
- **빈 공간 드래그** — 화면 pan.
- **노드 드래그** — 재배치. 3px 이동 임계값으로 드래그 확정, 미만이면 click으로 간주.
- **노드 클릭** — 해당 태그가 포함된 기사 목록 모달(\`/api/posts?tag=X&page=N&limit=20&scope=admin\`, 20건/페이지 서버 페이지네이션). 제목/subtitle/category 뱃지/공개 여부/발행/조회/글머리/공개 링크(\`/post/<id>\` 새 탭)/관리자 미리보기(\`V3.openPostPreview\`) 포함.
- **hover** — 해당 노드 + 직접 이웃 라벨 노출 + 링크 Scouting Purple 강조 + 비이웃 dim.
- **상단 태그 검색 input** — 부분 일치(case-insensitive)로 노드 스팟라이트(매칭+이웃만 밝게, 나머지 dim). 180ms debounce. hover가 spotlight를 일시 덮어씀(커서 떠나면 spotlight 복귀).
- **원위치 버튼** — zoom/pan 리셋.

**반응형:**

- 데스크톱(>700px): 노드 80개 + 상위 25개 라벨 항상.
- 모바일(≤700px): 노드 50개 + 상위 15개 라벨. 라벨 폰트 키움(\`--fs-caption\`/primary \`--fs-body\`). hint 세로 flex. SVG max-height 78vh→68vh.

**힘 시뮬레이션 (초기 배치):**

- viewBox 1280×720, 시드 RNG 랜덤 초기 위치.
- 500 iteration, alpha 감쇠.
- repulsion \`2800/d²\` (primary끼리는 \`4200/d²\`로 라벨 공간 확보).
- link spring desired 130px, weight boost \`1 + r×1.8\`.
- center gravity 0.001, damping 0.75.
- 경계 clamp(좌우 60px·상하 24px 여백).

**오프라인 동등성:**

- \`scripts/tag-analysis/01_export.mjs\` (D1 → JSON) → \`02_tokenize.mjs\` → \`03_statistics.mjs\` (1만) / \`04_run_all.mjs\` (5 산출물 전체).
- 산출물: \`output/tag-analysis/01_statistics.md\` · \`02_graph.json\` · \`02_graph.html\`(D3.js v7 인터랙티브) · \`03_health_check.md\` · \`04_coverage_map.md\` · \`05_next_actions.md\`.
- 공용 \`buildTagInsights()\`를 서버(API)와 Node 스크립트 양쪽에서 import — 로직 단일 진실 원본.

#### 각주

- 태그 이름은 원문 보존. 한 기사 내 중복만 제거, 전체 집계는 원문 그대로. \`청소년활\` vs \`청소년활동\` 같은 오타/유사어도 자동 병합하지 않고 중복 의심 쌍으로만 플래그.
- SVG \`fill\`/\`stroke\` 속성은 CSS var() 해석 불가라 palette는 hex 문자열로 유지(3.10 Leaflet 팔레트 예외와 동일 패턴).
- 2026-04-19 분석 기준(전체 151건): 고유 글머리 39개, 고유 메타 611개, 1회 등장 고립 태그 468개(76.6%). 주요 허브: 스카우트(46) · 세계스카우트연맹(39) · 한국스카우트연맹(28) · 스카우트운동(23).

## 4. 마케팅 대시보드

### 4.1 의도

#### 기능 세부 설명
- 운영 분석이 \`방문/조회\` 중심이라면, 마케팅 대시보드는 \`유입 → 관심 → 기사 읽기\` 여정을 읽는 용도다.
- 관리자 콘솔 \`개요 > 마케팅\` 패널에서 확인한다.
- 데이터 소스는 \`site_visits\`이며, 공개 페이지 전체 방문을 사용한다.

### 4.2 화면 구성

#### 기능 세부 설명
- 퍼널(Funnel): 단계별 도달 사용자 수와 비율 (바 차트)
- UTM 캠페인: campaign / source / medium 별 방문 수 (테이블)

#### 각주
- 체류시간과 스크롤 깊이는 아직 수집하지 않으므로, 현재는 \`유입 채널 / 단계 도달 / 재읽기 강도\` 중심으로 본다.

## 5. 홈 화면

### 5.1 홈의 의도

#### 기능 세부 설명
- 뉴스 메인 페이지이면서 아카이브 관문 역할을 한다.
- 가장 먼저 보이는 정보는 \`대표 기사\`, \`최신 소식\`, \`카테고리별 진입점\`이다.
- 홈은 탐색, 큐레이션, 공유의 세 역할을 동시에 수행한다.

### 5.2 상단 구성

#### 기능 세부 설명
- 날짜/시간
- 언어 전환
  - 홈 마스트헤드에서는 보조 제어 수준의 밀도로만 노출하며, 검색과 통계 영역을 침범하지 않는다.
- 검색
- 카테고리 네비게이션
- 티커

### 5.3 히어로 슬라이드

#### 기능 세부 설명
- 최대 5개 기사
- 자동 전환 (관리자 설정 간격, 기본 3000ms)
- 일시정지/재생
- PC/모바일 별도 이미지 위치/확대 설정 가능
- 태그, 제목, 요약, CTA
- 데이터가 비정상이거나 렌더링 예외가 발생하면 정적 기본 슬라이드로 즉시 복구한다.

#### 각주
- 히어로는 홈의 광고판이 아니라 "핵심 기사 큐레이션" 영역이다.

### 5.4 메인 스토리

#### 기능 세부 설명
- 대표 기사 1건
- 제목, 부제목, 요약, 날짜, 작성자, CTA
- PC/모바일 이미지 위치 분리

### 5.5 최신 소식 / 인기 소식 / 에디터 추천

#### 기능 세부 설명
- 최신 소식은 진입/복귀 시 다시 조회한다.
- 인기 소식은 운영 정의에 따른 인기 기사 목록이다.
- 에디터 추천은 운영자 수동 추천 영역이다.
- 에디터 추천은 최대 4개까지만 유지하며, 이 제한은 관리자 UI와 서버 저장 API 모두에서 강제한다.
- 메인 스토리와 에디터 추천은 같은 게시글을 **동시에 지정할 수 있다**. 운영자 판단으로 동일 게시글을 상단 스토리와 에디터 추천에 함께 노출할 수 있어야 한다. 이전에는 배타 제약을 걸었으나 운영 유연성을 막는 부작용이 커서 2026-04-19에 해제했다. 동시 지정 시 공개 홈은 메인 스토리 슬롯과 에디터 추천 카드 양쪽에 같은 기사가 표시된다.
- 관리자 추천 목록은 비공개 추천 글도 함께 보여주되, 비공개 배지로 상태를 구분한다.
- 홈의 에디터 추천 / 카테고리 보드 노출 정렬은 게시판 수동 정렬(\`sort_order\`)과 분리하고 \`publish_at\` 기준 최신순을 우선한다.
- 카드의 버튼/태그/날짜 위치는 공통 규칙을 따른다.
- 홈 API 일부 섹션이 fallback 데이터로 내려간 경우, 공개 화면은 해당 사실을 상태 배너로 드러내고 영향 섹션을 요약해서 보여준다.
- 홈 초기 HTML에는 메인 스토리, 최신 소식, 인기 소식, 에디터 추천, 카테고리 컬럼의 실제 기사 링크를 서버 렌더링 fallback으로 포함해야 한다.
- 검색엔진이 자바스크립트를 완전히 실행하지 못해도 홈에서 기사 제목, 링크, 날짜, 요약을 바로 읽을 수 있어야 한다.
- 백그라운드 새로고침 실패 시에도 조용히 무시하지 않고, 현재 내용이 이전 상태일 수 있음을 사용자에게 알린다.

### 5.6 홈 접근성 / 상호작용 규칙

#### 기능 세부 설명
- 홈에는 \`본문으로 건너뛰기\` skip-link와 \`#main-content\` 메인 랜드마크를 유지한다.
- 메인 스토리, 최신 소식, 인기 소식, 에디터 추천 섹션 제목은 실제 heading 구조를 유지한다.
- 히어로 슬라이드는 자동 전환되더라도 항상 일시정지/재생 버튼을 제공하고, 현재 슬라이드 상태를 접근성 속성으로 함께 전달한다.
- 상단 티커는 사용자가 직접 멈출 수 있어야 하며, \`prefers-reduced-motion\` 환경에서는 자동 흐름을 강제하지 않는다.
- 모바일 햄버거 메뉴와 검색 모달은 열릴 때 포커스를 내부로 이동시키고, 닫힐 때는 기존 트리거로 포커스를 돌려준다.
- 홈 전용 스크립트 로드 실패나 치명적 초기 로드 실패는 사용자에게 바로 보이는 경고 배너로 드러나야 하며, 콘솔 로그만으로 끝내지 않는다.
- 상태 배너는 \`다시 시도\` 같은 즉시 복구 행동을 제공하고, 오류가 해소되면 자동으로 숨긴다.

## 6. 게시판 페이지

### 6.1 게시판의 의도

#### 기능 세부 설명
- 카테고리별 최신 기사 접근성 확보
- 제목 길이와 상관없이 카드 하단 메타 정렬 유지
- 공유, 공감, 날짜, 작성자 메타는 하단 고정
- 카테고리 게시판 기본 목록은 검색/필터가 없을 때 관리자 수동 정렬(\`sort_order\`)을 그대로 따른다.

### 6.2 글 작성 (관리자 패널)

#### 기능 세부 설명
- 관리자 콘솔 \`콘텐츠 > 새 글 작성\` 패널에서 작성한다.
- 필드: 카테고리, 글머리 태그, 제목, 부제목, 본문(Editor.js), 대표 이미지, 갤러리, 유튜브 URL, 메타 태그, 위치, 특집 묶음, 관련 기사
- 저장 상태: 기본은 \`공개\`이며, 작성 화면의 \`공개\` 체크를 해제하면 \`비공개\`로 저장한다.

#### 각주
- 갤러리 이미지는 대표 이미지와 별도로 관리한다. 최대 10장.

## 7. 기사 상세

### 7.1 기사 상세의 의도

#### 기능 세부 설명
- 읽기 중심 화면
- 태그와 공유를 상단에서 바로 노출
- 본문 아래 연관 정보(지도, 슬라이드, 해시태그, 특집, 유관기사)를 순차 배치

### 7.2 본문 아래 구성 순서

#### 기능 세부 설명
- 본문
- 지도
- 사진 슬라이드
- 해시태그
- 특집 기사 몰아보기
- 유관 기사

### 7.3 유관 기사 규칙

#### 기능 세부 설명
- 운영자가 최대 5개 직접 설정 가능
- 남는 수는 태그 우선, 제목 보조로 자동 추천
- 제목 오른쪽에 \`YYYY-MM-DD\` 표시
- 모바일은 날짜를 더 작고 연하게 표시

## 8. 특집 기사

### 8.1 특집 기사 의도

#### 기능 세부 설명
- 같은 주제의 기사 묶음을 뉴스 흐름과 별도로 묶어 보는 기능
- 카테고리별로 동작
- 기사 상세 하단에 최신순으로 노출
- 컬렉션 전용 페이지 제공

## 9. 용어집

### 9.1 용어집의 의도

#### 기능 세부 설명
- 검색 가능한 지식 사전
- \`용어 / 설명 / 둘 다\` 검색 대상 전환
- 검색엔진용 RAW 문서 제공

### 9.2 관리자 관점 규칙

#### 기능 세부 설명
- 용어는 한국어(term_ko), 영어(term_en), 프랑스어(term_fr) 3개 언어로 관리한다.
- 가나다 버킷(가/나/다/…/하)으로 자동 그룹화된다.
- 수정/삭제 동선은 인라인 모달에서 명확히 제공한다.

## 10. 일정 캘린더

### 10.1 캘린더의 의도

#### 기능 세부 설명
- 스카우트 활동 일정을 월간/연간으로 보는 공개 안내판
- 일정 관리와 위치 정보, 관련 기사 연결을 함께 다룬다.

### 10.2 월간 보기

#### 기능 세부 설명
- 구글 캘린더처럼 주 단위 row 기준
- 여러 날 일정은 연속 bar
- 과도한 시간/날짜 표시는 제거
- 일정 클릭 시 상세 모달

### 10.3 우측 상태 패널

#### 기능 세부 설명
- 선택 달 기준 \`진행중 / 개최예정 / 행사종료\`
- 지역별 묶음
- KOR 기본 펼침
- 제목 클릭 시 상세 모달

### 10.4 하단 캘린더 지도

#### 기능 세부 설명
- 진행중/개최예정만 표시
- 지역색 기준 배지 사용
- 국가 단위 클러스터에 개수 숫자 표기
- 행사명 클릭 시 상세 모달

### 10.5 행사 상태 정의

#### 기능 세부 설명
- \`개최예정(upcoming)\` : \`start_at\`이 없거나 현재 시각보다 이후인 경우
- \`진행중(ongoing)\`   : \`start_at <= 현재\` AND (\`end_at\`가 없거나 \`end_at >= 현재\`)
- \`행사종료(finished)\` : \`end_at < 현재\`
- 상태는 저장 필드가 아니라 \`start_at\` / \`end_at\` 기준으로 런타임에 계산된다.

### 10.6 지역 코드 정의

#### 기능 세부 설명
- \`KOR\` : 한국 (Korea) — 색상 \`#0f8db3\`
- \`APR\` : 아시아·태평양 지역 (Asia-Pacific Region) — 색상 \`#ff5b5b\`
- \`EUR\` : 유럽 (Europe) — 색상 \`#2f8f5b\`
- \`AFR\` : 아프리카 (Africa) — 색상 \`#b6761b\`
- \`ARB\` : 아랍 지역 (Arab Region) — 색상 \`#7b5cff\`
- \`IAR\` : 미주 지역 (Inter-American Region) — 색상 \`#d44f94\`
- \`WOSM\` : 세계스카우트운동 / 기본값 — 색상 \`#2a8b3b\`
- 유효하지 않은 값은 \`WOSM\`으로 정규화한다.

### 10.7 일정 등록/수정 (관리자)

#### 기능 세부 설명
- 국문 제목 우선, 원문 제목 보조
- 시작일 / 종료일
- 지역 코드 (10.6 기준 7종)
- 국가명, 장소명, 주소
- 외부 링크
- 관련 기사 다중 연결
- 설명
- 행사 분류 태그 (\`/api/settings/calendar-tags\`에서 관리)

#### 각주
- 일정은 중요한 운영 기능이므로 항상 관리자 세션 인증이 필요하다.

### 10.8 관리자 캘린더 필터

#### 기능 세부 설명
- **정렬**: 날짜 최신순(내림차순) / 날짜 오래된순(오름차순)
- **연도 필터**: 실제 데이터 기반 동적 생성
- **지역 필터**: 10.6의 7개 코드
- **행사 상태 필터**: 진행중 / 개최예정 / 행사종료
- **날짜 범위**: 시작일 이후 ~ 시작일 이전 (YYYY-MM-DD)

## 11. 관리자 콘솔 (V3)

### 11.1 구조

#### 기능 세부 설명
- 인증: 비밀번호 + HMAC-SHA256 signed cookie session (24시간 유효)
- 레이아웃: 좌측 고정 사이드바(248px) + 우측 스크롤 가능 콘텐츠 영역
- 패널 목록:
  - 개요: \`대시보드\`, \`분석\`, \`마케팅\`
  - 콘텐츠: \`게시글 목록\`, \`새 글 작성\`, \`캘린더\`, \`용어집\`
  - 사이트 설정: \`히어로 기사\`, \`메인 스토리\`, \`에디터 추천\`, \`태그/글머리\`, \`메타태그/SEO\`, \`저자/고지\`, \`게시판 배너\`, \`티커\`, \`기고자\`, \`세계연맹 회원국\`, \`편집자/접근\`, \`UI 번역\`
- 대시보드 하단 운영 카드에는 \`발행 예정 / 초안\`, \`오류 / 로그인 시도\`, \`최근 설정 변경\`, \`릴리스 이력\`을 표시한다.

### 11.2 관리자 UI 규칙

#### 기능 세부 설명
- 관리자 콘솔은 운영 밀도 높은 단일 업무 도구다.
- 클릭 가능한 정렬/필터 기능은 실제 시각적으로 보이는 인터랙션이 반드시 동작해야 한다.
- hover 색은 글자가 사라지지 않게 유지한다.
- 삭제 전에는 반드시 확인 다이얼로그를 거친다.

### 11.3 게시글 API 파라미터

#### 기능 세부 설명
\`GET /api/posts\` 지원 파라미터:
- \`page\` : 페이지 번호 (기본 1)
- \`limit\` : 페이지당 건수 (기본 20)
- \`category\` : \`korea\` / \`apr\` / \`wosm\` / \`people\`
- \`published\` : \`1\`(공개만) / \`0\`(비공개만) / 미지정(전체, 관리자만)
- \`q\` : 검색어 (제목 > 부제목 > 태그 > 메타태그 > 본문 순으로 스코어링)
- \`sort\` : \`latest\`(기본) / \`oldest\` / \`views\` / \`relevance\`
- \`start_date\` / \`end_date\` : \`YYYY-MM-DD\` 범위 필터

## 12. API 호출 방법

### 12.1 인증 구조

#### 기능 세부 설명
- 로그인(\`POST /api/admin/login\`) 성공 시 서버가 signed 24시간 관리자 세션 쿠키를 발급한다.
- 클라이언트는 \`sessionStorage\`에 lightweight 로그인 상태만 보조 저장한다.
- 관리자 API 인증은 same-origin cookie 기반으로 처리한다.
- \`Authorization: Bearer <token>\` 흐름을 기준으로 새 기능을 설계하지 않는다.
- 공개 읽기 API(\`GET /api/posts\`, \`GET /api/calendar\` 등)는 인증 불필요.

### 12.2 GW.apiFetch 사용법

#### 기능 세부 설명
- 프론트엔드 API 호출은 모두 \`GW.apiFetch(url, options)\`를 사용한다.
- same-origin cookie 유지, 에러 파싱, JSON 직렬화를 자동 처리한다.
- \`options.body\`는 \`JSON.stringify()\` 후 전달한다.

#### 코드 예시
\`\`\`javascript
// GET (읽기)
GW.apiFetch('/api/posts?limit=20&category=korea')
  .then(function(data) {
    var posts = data.posts; // 배열
  })
  .catch(function(err) {
    GW.showToast(err.message, 'error');
  });

// POST (생성)
GW.apiFetch('/api/posts', {
  method: 'POST',
  body: JSON.stringify({ title: '제목', category: 'korea', published: true }),
}).then(function(data) {
  var newPost = data.post;
});

// PUT (수정)
GW.apiFetch('/api/posts/42', {
  method: 'PUT',
  body: JSON.stringify({ published: false }),
});

// DELETE (삭제)
GW.apiFetch('/api/posts/42', { method: 'DELETE' });
\`\`\`

### 12.3 API 응답 형식

#### 기능 세부 설명
- 성공: HTTP 200, JSON 객체 반환
- 실패: HTTP 4xx/5xx, \`{ error: "메시지" }\` 형태

#### 코드 예시
\`\`\`json
// GET /api/posts
{
  "posts": [ { "id": 1, "title": "...", "category": "korea", ... } ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}

// GET /api/posts/:id
{ "post": { "id": 1, "title": "...", "content": "...", ... } }

// POST /api/posts (성공)
{ "post": { "id": 99, "title": "...", ... } }

// 에러
{ "error": "Unauthorized" }
\`\`\`

### 12.4 주요 API 엔드포인트 목록

#### 기능 세부 설명

**인증**
- \`POST /api/admin/login\` — 로그인, \`{ password, cf_turnstile_response }\` → \`{ token, role }\`
- \`GET /api/admin/session\` — 세션 확인 → \`{ authenticated: true/false }\`

**게시글**
- \`GET /api/posts\` — 목록 (파라미터: 11.3 참조)
- \`POST /api/posts\` — 생성 (인증 필요)
- \`GET /api/posts/:id\` — 상세
- \`PUT /api/posts/:id\` — 수정 (인증 필요)
- \`PATCH /api/posts/:id\` — 공개/추천/정렬 상태 변경 (인증 필요)
- \`PATCH /api/posts/:id\` 에서 \`featured=1\` 저장 시 공개 추천 글이 이미 4개면 \`409\`로 거부한다.
- \`DELETE /api/posts/:id\` — 삭제 (인증 필요)
- \`GET /api/posts/:id/image\` — 대표 이미지 응답 (OG 이미지 용도)
- \`GET /api/posts/:id/history\` — 수정 기록 (\`before_snapshot\`, \`after_snapshot\` 포함)
- \`POST /api/posts/:id/like\` — 공감
- \`GET /api/posts/popular\` — 인기 기사
- \`PUT /api/posts/reorder\` — 순서 변경
- \`GET /api/posts\`, \`GET /api/posts/popular\`, \`GET /api/home\`, \`GET /api/stats\` 는 게시글 반영 지연을 줄이기 위해 \`no-store\` 기준으로 응답한다.

**캘린더**
- \`GET /api/calendar\` — 전체 일정
- \`POST /api/calendar\` — 생성 (인증 필요)
- \`GET /api/calendar/:id\` — 상세
- \`PUT /api/calendar/:id\` — 수정 (인증 필요)
- \`DELETE /api/calendar/:id\` — 삭제 (인증 필요)

**용어집**
- \`GET /api/glossary\` — 전체 용어. 외부 앱 참조용 공개 API, \`bucket\`, \`q\`, \`view=grouped\` 지원
- \`POST /api/glossary\` — 생성 (인증 필요)
- \`PUT /api/glossary/:id\` — 수정 (인증 필요)
- \`DELETE /api/glossary/:id\` — 삭제 (인증 필요)

**설정**
- \`GET/PUT /api/settings/hero\` — 히어로 기사 설정
- \`GET/PUT /api/settings/tags\` — 글머리 태그 설정
- \`GET/PUT /api/settings/site-meta\` — 메타태그/SEO/푸터
- \`POST /api/settings/site-meta/image\` — 사이트 메타 대표 이미지 업로드
- \`GET/PUT /api/settings/author\` — 저자명
- \`GET/PUT /api/settings/ai-disclaimer\` — AI 고지 문구
- \`GET/PUT /api/settings/home-lead\` — 홈 메인 스토리 프레이밍 설정
- \`GET/PUT /api/settings/board-banner\` — 게시판 배너
- \`GET/PUT /api/settings/board-layout\` — 게시판 레이아웃/페이지 사이즈
- \`GET/PUT /api/settings/ticker\` — 뉴스 티커
- \`GET/PUT /api/settings/contributors\` — 기고자 목록
- \`GET/PUT /api/settings/board-copy\` — 공개 게시판 상단 설명 문구 설정
- \`GET/PUT /api/settings/wosm-members\` — 세계연맹 회원국 현황. WOSM 제공 \`xlsx\`를 관리자에서 가져온 뒤 시트/열 매핑을 선택하고 한국어 / 영어 / 프랑스어 / 회원 자격 / 상태 설명 및 커스텀 열 값을 계속 수정한다. 공개 표에 보일 열 정의는 관리자에서 추가/삭제할 수 있고, 업로드 모달은 그 열 정의를 기준으로 매핑과 미리보기를 만든다. 설명 아래에 붙는 \`등록 국가 N개국\` 값도 관리자에서 직접 수정한다.
- \`GET/PUT /api/settings/editors\` — 편집자 접근 관리
- \`GET/PUT /api/settings/translations\` — UI 번역
- \`GET/PUT /api/settings/calendar-copy\` — 캘린더 카피 설정
- \`GET/PUT /api/settings/calendar-tags\` — 캘린더 분류 태그
- \`GET/PUT /api/settings/feature-definition\` — KMS 문서

**분석 (방문 분석 + 태그 인사이트 · 2026-04-19 사이드바 2메뉴 분리)**
- \`GET /api/admin/analytics\` — 방문 분석 전용 엔드포인트(\`panel-analytics-visits\`). \`days\`/\`start\`/\`end\` (프리셋+커스텀 범위) + \`tag_*\` 프리픽스 동시 허용. 오늘 방문·조회, 기간 합계, 인기 기사, 유입 경로, 평균 체류, 방문 히트맵(월~일 × 시간대, 셀 우상단에 같은 시간대 공개 게시글 발행 수), 유입 해석 노트(UTM + 리퍼러 기반으로 카카오톡/페이스북/검색/직접 세분화). 히트맵 기간은 \`1주\` · \`1개월\` · \`직접 지정\` · \`전체\` 독립 조절. \`panel-analytics-visits\`는 \`마지막 갱신 시각\`을 표시하고 \`30초 자동 새로고침\`을 지원한다.
- \`GET /api/admin/tag-insights\` — **태그 인사이트 전용 엔드포인트**(\`panel-analytics-tags\`, 2026-04-19 신설). \`days\`/\`start\`/\`end\`/\`all=1\` 파라미터. \`functions/_shared/tag-insights.js\` \`buildTagInsights()\` 공용 모듈이 \`published=1\` posts에서 \`tag\`(글머리) + \`meta_tags\`(메타) 필드를 쉼표로 토큰화해 계산. 반환: \`statistics\`(전체/누락/고유/평균/카테고리별 평균) · \`header_ranking\` · \`meta_ranking\`(태그별 등장 수 + 우세 글머리/카테고리) · \`graph{ nodes, links }\`(메타 태그 공출현) · \`health{ isolated_tags, overly_common, duplicate_suspects, isolated_clusters }\`(모두 \`human_review_required\` 플래그) · \`coverage{ by_header, monthly, gaps }\` · \`suggestions{ hub_clusters, thin_headers, suggestions }\`(휴리스틱 콘텐츠 제안). 같은 모듈이 \`scripts/tag-analysis/*.mjs\`에서 오프라인 분석 산출물(\`output/tag-analysis/01~05_*.md\` + \`02_graph.html\` D3.js)을 생성한다.
- \`GET /api/admin/geo-audience\` — 관리자 접속 국가/도시 지도 및 테이블 집계
- \`GET /api/admin/marketing\` — 마케팅 퍼널 데이터
- \`GET /api/admin/operations\` — 운영 대시보드/릴리스 이력
- \`GET /api/admin/homepage-issues\` — 사이트 오류/이슈 기록 조회
- \`PATCH /api/admin/homepage-issues/:id\` — 사이트 오류/이슈 기록 상태 변경
- \`POST /api/homepage-issues/report\` — 공개 홈 자동 오류 보고와 관리자 클라이언트 API 실패 보고. 이 기록과 전역 API 오류 로그가 함께 \`사이트 오류/이슈 기록\` 패널에 누적된다.
- \`POST /api/analytics/visit\` — 방문 기록 (공개)
- \`POST /api/analytics/post-engagement\` — 체류시간 기록 (공개)
- \`GET /api/analytics/today\` — 오늘 방문자/조회수

**피드/메타**
- \`GET /api/home\` — 홈 화면 데이터
- \`GET /api/stats\` — 사이트 통계
- \`GET /rss.xml\` — RSS 피드
- \`GET /sitemap.xml\` — 사이트맵

### 12.5 에러 처리 규칙

#### 기능 세부 설명
- API 에러는 \`GW.showToast(err.message, 'error')\`로 사용자에게 표시한다.
- 401 응답 시 \`GW.clearToken()\`을 호출하고 로그인 화면으로 이동한다. (GW.apiFetch 자동 처리)
- 저장 버튼은 요청 중 \`disabled\`로 설정해 중복 제출을 막는다.
- 성공 후에는 항상 \`GW.showToast('저장했습니다', 'success')\`로 피드백을 준다.

## 13. 배포와 검수

### 13.1 기본 원칙

#### 기능 세부 설명
- 배포 기본 경로: \`./scripts/deploy_production.sh\`
- 공개 UI 변경은 production 배포 전후 실환경 기준으로 직접 검수한다.
- 관리자/API만 변경되면 예외적으로 바로 production 가능
- 배포 전 \`VERSION\`, \`ADMIN_VERSION\`, \`ASSET_VERSION\`을 확인하고 \`./scripts/sync_versions.sh\`로 버전 문자열과 새 자산 토큰을 동기화한다.
- \`접속 국가/도시\` 기능이 포함된 배포에서는 \`./scripts/ensure_site_visits_geo_columns.sh gilwell-posts --remote\`로 원격 D1의 \`site_visits\` 지리 컬럼과 인덱스를 먼저 선반영한다.
- production 배포는 \`main\`의 깨끗한 워크트리에서만 진행한다.
- 선택 사항: \`CF_ZONE_ID\`, \`CF_PURGE_API_TOKEN\` 이 설정돼 있으면 게시글 생성/수정/삭제 시 관련 공개 경로 캐시를 자동 퍼지한다.

### 13.2 스모크 체크 기준

#### 기능 세부 설명
- 홈
- 게시판
- 기사 상세
- 캘린더
- 용어집
- 관리자 핵심 기능
- RSS 응답
- 공개 posts API의 \`publish_at\`
- 관리자 세션 401
- 게시글 history API의 \`before_snapshot\` / \`after_snapshot\`
- D1의 \`created_at\` / \`publish_at\` / \`updated_at\` 컬럼 존재
- 배포 후 버전 문자열 확인 (\`V3.aaa.bb\` 형식)

## 14. 개발자 체크리스트

### 14.1 구현 전 체크

#### 기능 세부 설명
- 이 기능이 KMS에 정의돼 있는가
- 문구/버튼/상태명이 기존 규칙과 충돌하지 않는가
- 날짜/정렬/권한 규칙이 이미 정의돼 있는가

### 14.2 구현 후 체크

#### 기능 세부 설명
- 문서와 화면이 같은가
- 관리자와 공개 화면이 같은 용어를 쓰는가
- 버튼 높이/폰트/간격이 공통 규칙을 따르는가
- 예외 흐름(권한 없음, 저장 실패, 삭제 차단)이 문서대로 작동하는가

### 14.3 각주

#### 각주
- 이 문서는 "설명서"가 아니라 "기준서"다.
- 앞으로 개발할 때 AI와 인간 개발자 모두 이 문서를 먼저 보고, 이 문서를 무시한 구현은 허용하지 않는다.
`;

function isLegacyFeatureDefinition(value) {
  var text = String(value || '').trim();
  if (!text) return true;
  if (text.indexOf('# Feature Definition') === 0) return true;
  if (text.indexOf('## Calendar') >= 0 && text.indexOf('## Development Rule') >= 0) return true;
  if (text.indexOf('## 0. 문서 목적과 사용 순서') < 0) return true;
  return false;
}

export async function loadFeatureDefinition(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'feature_definition'`).first();
  const stored = normalizeFeatureDefinitionContent(row && row.value ? String(row.value) : '');
  if (!stored || isLegacyFeatureDefinition(stored)) {
    return DEFAULT_FEATURE_DEFINITION;
  }
  return stored;
}

export function normalizeFeatureDefinitionContent(value) {
  let text = String(value || '');
  if (!text) return '';
  text = text.replace(/\r\n/g, '\n');
  if (text.indexOf('\n') === -1 && /\\n/.test(text)) {
    text = text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
  }
  return text;
}
