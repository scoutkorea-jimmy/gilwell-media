# Admin V3 Runtime

## 역할

- 관리자 메인 앱 런타임입니다.
- 현재 저장소에서 가장 큰 단일 JS 파일 중 하나입니다.

## Code Entry

- `js/admin-v3.js`
- 보조 데이터: `js/shared-country-name-ko.js`
- 페이지 엔트리: `admin.html`

## 선행 의존

- [[GW Foundation]]

## 주 책임

- 대시보드
- 게시글 관리
- 작성/수정
- 캘린더 관리
- 용어집 관리
- 히어로/홈 설정
- 마케팅/브랜딩 설정
- WOSM 회원국 관리
- 사이트 설정 전반

## 읽는 방법

1. DOMContentLoaded 초기화
2. 탭/패널 바인딩
3. 각 설정 섹션 로더
4. 저장 액션

## 분리 우선순위

- settings panels
- post editor
- calendar admin tools
- glossary admin tools
- home settings
