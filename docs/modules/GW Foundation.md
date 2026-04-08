# GW Foundation

## 역할

- 전역 네임스페이스 `window.GW`를 생성합니다.
- 사이트/관리자 공용 유틸의 기반 레이어입니다.
- 다른 거의 모든 런타임이 이 파일에 의존합니다.

## Code Entry

- `js/main.js`

## 여기서 정의되는 것

- 버전 메타
  - `GW.APP_VERSION`
  - `GW.ADMIN_VERSION`
  - `GW.ASSET_VERSION`
- 카테고리 메타
  - `GW.CATEGORIES`
- 날짜/숫자 포맷
- HTML escape, 캐시 유틸, fetch 보조 유틸
- 모바일 타입 조절
- 파비콘 보정
- 공유 모달과 공유 링크 처리
- 관리자 세션/쿠키 처리
- 방문/체류 추적
- Turnstile 로더
- Editor.js 이미지 툴

## 이 레이어에 넣어야 하는 것

- 공개와 관리자 양쪽에서 모두 재사용되는 유틸
- 페이지와 무관한 포맷/보조 함수
- 특정 템플릿에 종속되지 않은 공통 런타임

## 넣지 말아야 하는 것

- 공개 상단 메뉴/푸터/번역 같은 셸 로직
- 홈 전용 렌더링
- 게시판 전용 목록 UI

## 직접 의존하는 대표 노트

- [[Public Site Chrome]]
- [[Homepage Runtime]]
- [[Board Runtime]]
- [[Post Page Runtime]]
- [[Admin V3 Runtime]]

## 확인 순서

1. `window.GW` 생성 위치
2. 공용 상수
3. 공용 유틸
4. 공유/세션/추적 같은 전역 기능

## 분리 후보

- date utilities
- fetch/auth wrapper
- content renderer helper
- share runtime
