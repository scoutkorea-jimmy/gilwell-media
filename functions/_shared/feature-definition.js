export const DEFAULT_FEATURE_DEFINITION = `# BP미디어 기능정의서 / KMS

이 문서는 BP미디어의 공개 홈페이지, 관리자, 운영 데이터 규칙, 배포 규칙을 통합해서 관리하는 기준 문서다.
앞으로 새 기능을 개발하거나 기존 기능을 수정할 때는 이 문서를 먼저 확인하고, 구현이 끝나면 반드시 이 문서도 함께 갱신한다.

## 0. 문서 목적과 사용 순서

### 0.1 문서의 역할

#### 기능 세부 설명
- 이 문서는 "현재 사이트가 무엇을 하는가"를 정리하는 설명서가 아니라, "앞으로도 어떻게 만들어야 하는가"를 결정하는 기준서다.
- 운영자, 디자이너, 인간 개발자, AI 개발자 모두 같은 기준을 보기 위해 KMS를 단일 진실 원본(single source of truth)으로 사용한다.
- 관리자 페이지의 \`KMS\` 메뉴가 원본이며, 저장소의 \`docs/feature-definition.md\`는 스냅샷이다.
- 저장소 루트의 \`CHATGPT.md\`는 메인 홈페이지 AI 작업 기준 문서이며, 기존 \`ai-guide.html\` 기준은 모두 이 문서와 KMS로 이관되었다.

#### 각주
- 구현이 문서와 다르면 코드를 맞추거나 문서를 업데이트해야 한다. "문서와 실제가 다른 상태"를 방치하지 않는다.

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
- \`./scripts/sync_versions.sh\`가 \`js/main.js\`의 \`GW.APP_VERSION\`, \`GW.ADMIN_VERSION\`, 관리자 자산 쿼리 버전, 공개 HTML 자산 쿼리 버전을 함께 맞춘다.

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

### 1.2 관리자 구조

#### 기능 세부 설명
- \`/admin\` : 관리자 콘솔 V3 (사이드바 기반 단일 페이지)
- \`/kms\` : 관리자만 접근 가능한 KMS (기능정의서)
- 관리자 콘솔은 좌측 고정 사이드바 + 우측 콘텐츠 패널 구조다.
- 사이드바 섹션: \`개요\`, \`콘텐츠\`, \`사이트 설정\`
- 패널 전환은 사이드바 항목 클릭으로 이루어지며, URL 변경 없이 단일 페이지 내에서 전환된다.

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
- 공개 사이트 기본 서체는 \`AliceDigitalLearning\` 단일 사용을 원칙으로 한다.
- 관리자 콘솔(V3)은 시스템 서체(\`-apple-system, BlinkMacSystemFont, system-ui, sans-serif\`)를 사용한다.
- 한글 줄바꿈은 \`word-break: keep-all\` 우선으로 처리한다.
- 제목은 과하게 압축하지 않고, 본문은 읽기 위주의 line-height를 유지한다.

#### 코드 예시
\`\`\`css
/* 공개 사이트 */
font-family: AliceDigitalLearning, sans-serif;
word-break: keep-all;
line-height: 1.7;

/* 관리자 콘솔 */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
\`\`\`

### 3.2 공통 여백 규칙

#### 기능 세부 설명
- 미세 간격: \`8px\`
- 기본 요소 간격: \`12px\`
- 카드 내부 기본 간격: \`16px\`
- 섹션 내부 기본 여백: \`24px\`
- 섹션과 섹션 사이: \`24px ~ 32px\`

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

### 3.4 관리자 컬러 토큰 (V3)

#### 기능 세부 설명
- \`--v3-primary\` : \`#4f46e5\` (인디고) — 핵심 행동, 활성 상태
- \`--v3-danger\`  : \`#ef4444\` (레드) — 삭제, 위험 행동
- \`--v3-success\` : \`#22c55e\` (그린) — 공개 상태, 성공
- \`--v3-sidebar-bg\` : \`#161c2d\` (다크 네이비) — 사이드바 배경
- \`--v3-content-bg\` : \`#f1f5f9\` (라이트 슬레이트) — 콘텐츠 영역 배경

### 3.5 모듈 레이어 기준

#### 기능 세부 설명
- 홈페이지는 \`Foundation / Component / Pattern / Template / Code Module\` 레이어로 나눠서 설계한다.
- \`Foundation\`은 색상, 타이포, 간격, 상태 언어처럼 전역 기준을 다룬다.
- \`Component\`는 버튼, 태그, 카드, 입력 요소처럼 독립적으로 재사용 가능한 UI 블록이다.
- \`Pattern\`은 마스트헤드, 히어로, 섹션 레일, 검색 패널처럼 여러 컴포넌트를 묶은 구조다.
- \`Template\`은 홈, 게시판, 기사 상세, 검색, 용어집처럼 페이지 단위 조합이다.
- \`Code Module\`은 constants, utils, renderers, feature init, API helper처럼 책임 단위가 분리된 코드 구조다.
- 모듈 분해와 우선순위 판단은 \`docs/homepage-module-inventory.md\`를 함께 기준으로 본다.

### 3.6 디자인 모듈 계약

#### 기능 세부 설명
- 하나의 디자인 모듈은 최소한 \`종류\`, \`설명\`, \`토큰/클래스\`, \`코드\`, \`미리보기\`, \`모바일 규칙\`을 가져야 한다.
- 새 UI는 먼저 기존 \`Component\` 또는 \`Pattern\`으로 흡수 가능한지 검토하고, 불가능할 때만 신규 모듈로 추가한다.
- 같은 역할의 버튼은 같은 위계 체계(\`primary / secondary / chip\`)를 따른다.
- 공개 화면과 관리자/KMS에서 역할이 겹치는 버튼, 칩, 페이지 토글은 같은 위계와 상태 언어를 공유한다.
- 카드류는 shell과 content variant를 분리하고 제목, 요약, 메타의 순서를 공통화한다.
- 상태는 최소한 \`default / active / disabled / danger\` 언어를 공유한다.
- 공통 액션 모듈은 공개 구현(\`css/style.css\`)과 관리자 구현(\`css/admin-v3.css\`)을 함께 갱신한다.

### 3.7 KMS 디자인 탭 동작 규칙

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
- 카드의 버튼/태그/날짜 위치는 공통 규칙을 따른다.

## 6. 게시판 페이지

### 6.1 게시판의 의도

#### 기능 세부 설명
- 카테고리별 최신 기사 접근성 확보
- 제목 길이와 상관없이 카드 하단 메타 정렬 유지
- 공유, 공감, 날짜, 작성자 메타는 하단 고정

### 6.2 글 작성 (관리자 패널)

#### 기능 세부 설명
- 관리자 콘솔 \`콘텐츠 > 새 글 작성\` 패널에서 작성한다.
- 필드: 카테고리, 글머리 태그, 제목, 부제목, 본문(Editor.js), 대표 이미지, 갤러리, 유튜브 URL, 메타 태그, 위치, 특집 묶음, 관련 기사
- 저장 상태: \`임시저장\`(비공개) / \`공개 저장\`(공개)

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
- \`DELETE /api/posts/:id\` — 삭제 (인증 필요)
- \`GET /api/posts/:id/image\` — 대표 이미지 응답 (OG 이미지 용도)
- \`GET /api/posts/:id/history\` — 수정 기록 (\`before_snapshot\`, \`after_snapshot\` 포함)
- \`POST /api/posts/:id/like\` — 공감
- \`GET /api/posts/popular\` — 인기 기사
- \`PUT /api/posts/reorder\` — 순서 변경

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
- \`GET /api/admin/analytics\` — 관리자 통계 대시보드
- \`GET /api/admin/marketing\` — 마케팅 퍼널 데이터
- \`GET /api/admin/operations\` — 운영 대시보드/릴리스 이력
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
- 배포 전 \`VERSION\`, \`ADMIN_VERSION\`을 확인하고 \`./scripts/sync_versions.sh\`로 버전 문자열을 동기화한다.
- production 배포는 \`main\`의 깨끗한 워크트리에서만 진행한다.

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
  const stored = row && row.value ? String(row.value) : '';
  if (!stored || isLegacyFeatureDefinition(stored)) {
    return DEFAULT_FEATURE_DEFINITION;
  }
  return stored;
}
