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
- 타겟 확정 후에는 \`CLAUDE.md\` (= \`AGENTS.md\` 심볼릭 링크)의 해당 \`§\` 섹션만 참조하고, 다른 타겟 규칙을 섞지 않는다.
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
- 운영 섹션에는 \`분석\`, \`접속 국가/도시\`, \`마케팅\`, \`버전기록\`, \`사이트 오류/이슈 기록\` 패널이 포함된다.
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
- 관리자 화면 날짜 표시는 \`YYYY년 MM월 DD일 HH시 MM분 SS초\`

#### 각주
- 방문자에게는 읽기 쉬운 일 단위 표기만 노출한다.
- 관리자에게는 감사(audit) 가능한 시각 단위 정보를 유지한다.

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
  font-family: NixgonFont, sans-serif;
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
- 메인 스토리와 에디터 추천은 동시에 같은 게시글을 가리킬 수 없다.
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

**분석**
- \`GET /api/admin/analytics\` — 관리자 통계 대시보드. 방문/조회/유입 경로와 함께 최근 기간 기준 \`요일 × 시간 방문 히트맵\`, 히트맵 아래 자동 인사이트 요약, \`글머리 태그 워드 클라우드\`, \`태그 관계도\`를 포함한다. 방문 히트맵은 월요일부터 일요일까지 시간대별 방문 집중도를 진한색/옅은색으로 보여주고, 셀 우상단에는 같은 시간대의 공개 게시글 발행 수를 함께 표시한다. 히트맵 기간은 \`1주\`, \`1개월\`, \`직접 지정\`, \`전체\`로 독립 조절되며, 모바일에서는 가로 스크롤로 전체 시간대를 탐색할 수 있다. 태그 인사이트 기간은 방문 분석 기간과 별도로 조절할 수 있고, 관계도는 \`글머리 태그 + 메타 태그\`를 합친 키워드 중심 그래프로 동작한다. 연결선은 기본적으로 보이고 hover 시 관련 관계가 더 선명해지며, 키워드를 클릭하면 선택 상태가 유지된 채 관련 기사 모달이 열린다. 다른 영역을 클릭하면 선택이 해제된다. 워드 클라우드 크기는 기사 수와 관련 기사 조회수를 함께 반영하며, 그래프는 drag/zoom 상호작용을 지원한다. 분석 패널은 \`마지막 갱신 시각\`을 표시하고 \`30초 자동 새로고침\`을 지원하며, 카카오/페이스북 유입은 UTM과 리퍼러를 기준으로 최대한 분리하되 앱 브라우저가 정보를 넘기지 않으면 \`직접 방문\`으로 잡힐 수 있다는 안내를 함께 노출한다.
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
