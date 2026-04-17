---
tags: [modules, inventory, architecture]
aliases: [Module Inventory, 모듈 인벤토리]
---

# Homepage Module Inventory

> [!tip] Obsidian 탐색
> [[Homepage Modules Hub]]와 [[Homepage Runtime Map]]을 함께 여는 것을 권장합니다.

## 목적

이 문서는 BP미디어 홈페이지를 디자인과 코드 양쪽에서 모듈 단위로 다시 바라보기 위한 기준 인벤토리다.
KMS 디자인 탭은 이 인벤토리를 시각적으로 보여주는 시작 장치이고, 실제 리팩터링과 공통화 판단은 이 문서를 기준으로 진행한다.

핵심 목표:

- 디자인을 재사용 가능한 모듈 단위로 분리
- 코드를 공통 책임 단위로 분리
- 새 기능 추가 시 기존 모듈 우선 재사용
- AI와 인간 개발자가 같은 단위로 구조를 판단
- KMS, `CLAUDE.md`, 실제 코드 구조를 같은 방향으로 수렴
- 페이지는 독립 축이 아니라 feature와 module이 조합된 surface로만 본다

## 분류 정책

- `Foundation`: 토큰, 타입 스케일, 간격, 공통 상태값
- `Component`: 버튼, 칩, 카드, 입력 요소처럼 독립 재사용 가능한 UI
- `Pattern`: 헤더, 히어로, 검색 패널처럼 여러 컴포넌트를 조합한 구조
- `Template`: 홈, 게시판, 기사 상세처럼 페이지 수준 레이아웃
- `Code Module`: JS 유틸, 렌더러, API helper, constants, feature slice

## 1. 디자인 모듈 인벤토리

| 레이어 | 모듈 | 현재 주 사용 위치 | 공통화 상태 | 다음 조치 |
| --- | --- | --- | --- | --- |
| Foundation | Color tokens | `css/style.css`, category/tag colors, section gradients | 부분적 공통화 | 색상 토큰 이름과 사용처 맵 정리 |
| Foundation | Typography scale | `css/style.css`, masthead, cards, meta | 암묵적 공통화 | 제목/본문/메타 scale 명시 상수화 |
| Foundation | Spacing tokens | 홈 레일, 카드, 버튼, 칩 간격 | 암묵적 공통화 | spacing alias 문서화 및 CSS token 정리 |
| Foundation | State language | active, disabled, danger, empty, loading | 분산됨 | 공통 상태 명명 규칙 정리 |
| Component | Category tag | 히어로, 카드, 보드, 검색 | 재사용 중 | 클래스와 색상 연결표 고정 |
| Component | Post kicker | 카드, 상세, latest rail | 재사용 중 | 지역/NEW/feature 상태 변형 정리 |
| Component | Button family | `write`, `submit`, `cancel`, `page`, `filter` | 부분적 통일 | primary / secondary / chip 체계로 재정의 |
| Component | Tag / pill family | 태그, 상태배지, 대상칩 | 부분적 통일 | 공통 base + modifier 구조 정리 |
| Component | Post card | 홈, 게시판, 검색 일부 | 유사 반복 | 카드 shell 공통화 후보 |
| Component | Mini item | 홈 사이드, related, feed rail | 유사 반복 | mini card 공통 렌더러 후보 |
| Component | Form block | 관리자, 모달, glossary search | 분산됨 | input/select/textarea wrapper 공통화 |
| Component | Share action row | 기사 상세, 카드 하단, mini share | 분산됨 | action group 공통화 |
| Pattern | Masthead | 모든 공개 페이지 | 공통 사용 | nav/search/lang 제어 분리 |
| Pattern | Ticker | 홈/상단 정보 띠 | 단일 패턴 | 데이터 소스와 표현 분리 |
| Pattern | Hero slider | 홈 메인 | 단일 패턴 | slide schema와 view 분리 |
| Pattern | Home section rail | latest / popular / picks / category columns | 반복 구조 | section rail 공통 모듈 우선 후보 |
| Pattern | Search panel | masthead search / search page | 유사 반복 | search shell 공통화 |
| Pattern | Modal shell | 기사 상세 / 공유 / 로그인 계열 | 분산됨 | modal frame 공통화 |
| Pattern | Feedback states | loading / empty / toast | 분산됨 | 상태 UI 집합 공통화 |
| Template | Homepage | `index.html` | 단일 템플릿 | 섹션별 블록 모듈화 필요 |
| Template | Board page | `korea.html`, `apr.html`, `wosm.html`, `people.html` | 같은 구조 | board template 공통화 가능 |
| Template | Post detail | `functions/post/[id].js`, `js/post-page.js` | SSR + client 혼합 | detail sections 공통 partial 정리 |
| Template | Glossary | `glossary.html` | 독립 템플릿 | search/table/admin toggle 모듈화 필요 |
| Template | Search results | `search.html` | 독립 템플릿 | result card와 filter bar 공통화 가능 |

## 2. 코드 모듈 인벤토리

| 타입 | 모듈 후보 | 현재 위치 | 상태 | 다음 조치 |
| --- | --- | --- | --- | --- |
| Constants | Site category constants | `js/main.js` 내 `GW.CATEGORIES`, 관련 분기 | 분산됨 | `js/modules/constants/categories.js` 후보 |
| Constants | Tag/category mapping | `js/main.js`, admin tag logic | 분산됨 | 태그 정의 공통 상수화 |
| Constants | Route/meta keys | `functions/_shared/site-meta.js` | 부분 공통화 | route/meta constants 분리 |
| Constants | Version metadata | `VERSION`, `ADMIN_VERSION`, sync scripts | 공통화 진행 중 | sync 범위 유지, 코드 직접 하드코딩 축소 |
| Utils | Date formatting | `js/main.js`, functions helpers | 분산됨 | date util 집합 정리 |
| Utils | HTML escaping / sanitizing | `js/main.js`, functions | 부분 공통화 | 클라이언트/서버 util 경계 정리 |
| Utils | Fetch wrapper / auth handling | `js/main.js`, admin fetch 흐름 | 분산됨 | admin/public fetch wrapper 분리 |
| Renderer | Editor content renderer | `GW.renderEditorContent()` | 핵심 공용 | block renderer 분할 가능 |
| Renderer | Post card renderer | 홈/보드/검색에서 유사 반복 | 중복 많음 | 공통 card renderer 우선 후보 |
| Renderer | Mini list renderer | sidebar/related feed | 중복 있음 | 공통 mini renderer 후보 |
| Renderer | Hero renderer | 홈 히어로 | 단일 | schema + render 분리 후보 |
| Renderer | Section header / rail renderer | 홈 각 섹션 | 반복 많음 | 공통 section rail renderer 우선 후보 |
| Feature | Homepage bootstrap | `index.html` + `js/main.js` | 거대 진입점 | 섹션별 init 분리 필요 |
| Feature | Board bootstrap | `js/board.js` | 비교적 분리 | board UI 하위 모듈 세분화 가능 |
| Feature | Post detail interactions | `js/post-page.js` | 비교적 분리 | action/share/edit 하위 분리 가능 |
| Feature | Search | `search.html`, `js/main.js` 일부 | 분산됨 | search module 독립 필요 |
| Feature | Glossary | 공개/관리자 로직 혼합 | 분산됨 | search, list, admin action 분리 필요 |
| Feature | Admin post management | `js/admin-v3.js` | 대형 단일 파일 | panel 단위 모듈화 필요 |
| Feature | KMS | `kms.html`, `js/kms.js` | 현재 리디자인 시작 | data-driven module catalog 확장 |
| API Helper | Post input validation | `functions/_shared/post-input.js` | 공통화 시작 | 다른 mutation input에도 확장 |
| API Helper | Post history handling | `functions/_shared/post-history.js` | 공통화 시작 | admin UI history consumer 연결 강화 |
| API Helper | Release/history helpers | `functions/_shared/release-history.js` 등 | 제한적 | 운영 스냅샷 helper 역할 고정 |

## 3. 지금 가장 먼저 모듈화해야 할 우선순위

### P0. 즉시 효과가 큰 공통 UI

1. Section rail
   - 대상: 홈의 latest, popular, picks, category headers
   - 이유: 반복이 많고 디자인 일관성 영향이 큼
   - 결과물: 공통 header/rail markup + style contract

2. Post card shell
   - 대상: 홈 카드, 검색 결과 카드, 관련 카드
   - 이유: 콘텐츠 표면이 여기저기 흩어져 있음
   - 결과물: 공통 카드 구조와 variant 규칙

3. Button / chip family
   - 대상: write, submit, cancel, filter, tag, status, admin more/page controls
   - 이유: 상태와 높이 체계가 전체 UX 밀도를 결정
   - 결과물: primary / secondary / chip base + modifiers, public/admin 구현 파일 매핑

### P1. 구조를 가볍게 만드는 코드 공통화

1. Category / tag constants
2. Route / meta constants
3. Date / formatting utils
4. Search module 분리
5. Mini list renderer 공통화

### P2. 페이지 단위 리팩터링

1. Homepage bootstrap 분해
2. Admin V3 panel 단위 분리
3. Glossary 공개/관리 분리
4. KMS data source와 view layer 분리

## 4. 최근 반영 구조

- 홈 런타임은 다음 5개 파일로 분리
  - `js/home-helpers.js`
  - `js/home-render.js`
  - `js/home-hero.js`
  - `js/home-runtime.js`
  - `js/home.js`
- 목적
  - 오류 보고와 fallback 로직 분리
  - 홈 카드/리드 렌더와 히어로 렌더 분리
  - 새로고침/초기화 라이프사이클을 별도 진입점으로 축소

## 4. KMS가 맡아야 하는 역할

KMS는 단순 문서가 아니라 아래 6가지를 한 화면에서 보여주는 기준 장치가 되어야 한다.

1. 이 모듈이 어떤 종류인가
2. 어떤 토큰과 클래스에 의존하는가
3. 코드 구조가 어떻게 생겼는가
4. 실제 프리뷰가 어떻게 보이는가
5. 어디에서 재사용되는가
6. 모바일에서 어떻게 접히는가

즉 KMS의 다음 단계 목표는:

- 디자인 카탈로그
- 모듈 사전
- 코드 스니펫 레퍼런스
- 재사용 추적기

를 동시에 만족하는 것이다.

## 5. 공통화 원칙

### 디자인

- 새 UI를 만들기 전에 기존 component / pattern부터 재사용 검토
- 같은 역할의 버튼은 높이와 상태 언어를 통일
- 카드류는 shell과 content variant를 분리
- 모바일은 사후 대응이 아니라 최초 설계 조건으로 포함

### 코드

- 자주 바뀌는 운영값은 `settings`
- 구조적으로 고정인 값은 constants
- 마크업 반복은 renderer/helper
- 페이지 초기화는 feature module
- 큰 파일은 panel/section/feature slice로 쪼갠다

## 6. 제안 파일 구조

이 구조는 즉시 적용이 아니라 목표 구조다.

```text
js/
  modules/
    constants/
      categories.js
      routes.js
      tags.js
    utils/
      dates.js
      formatters.js
      fetch.js
    renderers/
      section-rail.js
      post-card.js
      mini-item.js
      tags.js
    features/
      home/
      board/
      post/
      search/
      glossary/
      admin/
      kms/
```

```text
css/
  tokens.css
  components.css
  patterns.css
  pages.css
```

현재는 `css/style.css`와 대형 JS 파일 구조를 유지하되, 새 작업부터 위 경계를 의식해서 점진적으로 이동하는 방식이 현실적이다.

## 7. 다음 작업 순서

1. `section rail` 공통 모듈 정의
2. `post card shell` 공통 구조 정의
3. `button/chip` base + modifier 정의
4. category / tag / route constants 분리
5. KMS에 “사용 위치 / 재사용 위치” 필드 추가
6. 그 다음부터 페이지 단위 리팩터링 시작

## 8. 문서 연계

- AI 작업 기준: `CLAUDE.md` (= `AGENTS.md`) §2 Site / §3 Admin
- 운영 원본: 관리자 KMS
- 저장소 스냅샷: `docs/feature-definition.md`
- 하드코딩 정리 기준: `docs/hardcoding-inventory.md`
- 모듈 분해 기준: `docs/homepage-module-inventory.md`
- Obsidian 허브: `docs/modules/README.md`
- 런타임 맵: `docs/modules/Homepage Runtime Map.md`
