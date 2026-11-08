---
tags: [module, runtime, homepage, post]
aliases: [Post Page Runtime, 기사 런타임]
scope: homepage
layer: runtime
---
# Post Page Runtime

## 역할

- 기사 상세 공개 페이지의 상호작용을 담당합니다.
- 같은 페이지 안에서 수정 모달, 관련 글 연결, 이미지 업로드, 특집 전환 등을 처리합니다.

## Code Entry

- `js/post-page.js`
- SSR 엔트리: `functions/post/[id].js`

## 주 책임

- 상세 페이지 초기화
- 수정 UI
- 관련 글 검색/추가
- 커버/갤러리 업로드
- Turnstile 로그인 확인
- 특집 지정 관련 액션

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]

## 같이 보면 좋은 코드

- `functions/post/[id].js`
- `functions/api/posts/*`

## 관련 템플릿

- [[Post Detail Template]]

## 관련 API

- [[Posts API]]
- [[Settings API]]
- [[Admin Session API]]

## 분리 후보

- post edit runtime
- related-post picker
- gallery/cover uploader
