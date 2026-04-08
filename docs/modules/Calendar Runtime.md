# Calendar Runtime

## 역할

- 공개 캘린더 페이지의 월간 보기, 상세 보기, 필터, 관련 게시글 연결, 일부 로그인 액션을 담당합니다.

## Code Entry

- `js/calendar.js`
- 페이지 엔트리: `calendar.html`

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]

## 주 책임

- 월 이동
- 일정 목록/상세 렌더
- 카테고리/기간/검색 필터
- 지도/장소 표현
- 로그인 후 일정 추가/수정 보조 흐름

## 관련 템플릿

- [[Calendar Template]]

## 관련 API

- [[Calendar API]]
- [[Settings API]]
- [[Posts API]]
- [[Admin Session API]]

## 분리 후보

- calendar public renderer
- calendar auth bridge
- calendar filters
- calendar detail panel
