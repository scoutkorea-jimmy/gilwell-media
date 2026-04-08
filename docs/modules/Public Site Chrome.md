# Public Site Chrome

## 역할

- 공개 페이지 공통 셸입니다.
- 상단 메뉴, 언어 전환, 모바일 축소 헤더, 푸터, 티커, 통계, 검색 모달을 담당합니다.
- 공개 페이지의 공통 초기화 진입점은 `GW.bootstrapStandardPage()`입니다.

## Code Entry

- `js/site-chrome.js`

## 핵심 정의

- `GW.STRINGS`
- `GW._customStrings`
- `GW._navLabels`
- `GW.NAV_ITEMS`
- `GW.t()`
- `GW.setLang()`
- `GW.applySiteChrome()`
- `GW.renderManagedNav()`
- `GW.setupMobileCompactHeader()`
- `GW.loadTranslations()`
- `GW.loadStats()`
- `GW.loadTicker()`
- `GW.bootstrapStandardPage()`

## 주 책임

- managed nav 렌더
- 번역 적용
- 모바일 햄버거/축소 헤더
- 공개 푸터 데이터 적용
- 홈/게시판 상단 통계
- 상단 티커
- 게시판 공통 보조 설정 로딩

## 이 파일을 읽어야 하는 경우

- 상단 메뉴가 바뀔 때
- 언어 버튼이나 번역값이 바뀔 때
- 모바일 축소 헤더 동작을 고칠 때
- 푸터/티커/상단 통계가 깨질 때

## 이 레이어 아래에 있는 노트

- [[Templates Library]]
- [[API Library]]
- [[Homepage Runtime]]
- [[Board Runtime]]
- [[Board Write Runtime]]
- [[Post Page Runtime]]
- [[Search Runtime]]
- [[Glossary Runtime]]
- [[Calendar Runtime]]
- [[WOSM Members Runtime]]

## 의존성

- 선행 의존
  - [[GW Foundation]]
- 후행 소비
  - 대부분의 공개 페이지 런타임

## 관련 API

- [[Settings API]]
- [[Home and Stats API]]

## 분리 후보

- nav runtime
- i18n runtime
- mobile shell runtime
- footer runtime
