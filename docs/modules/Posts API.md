# Posts API

## 역할

- 게시글 목록, 상세, 생성, 수정, 정렬, 태그, 특집, 공감 관련 API 묶음입니다.

## 대표 엔드포인트

- `/api/posts`
- `/api/posts/:id`
- `/api/posts/:id/history`
- `/api/posts/:id/like`
- `/api/posts/popular`
- `/api/posts/reorder`
- `/api/posts/tags`
- `/api/posts/special-features`

## 주 사용 모듈

- [[Board Runtime]]
- [[Board Write Runtime]]
- [[Post Page Runtime]]
- [[Homepage Runtime]]
- [[Search Runtime]]

## 대표 코드 위치

- `functions/api/posts/index.js`
- `functions/api/posts/[id].js`
- `functions/api/posts/popular.js`
- `functions/api/posts/tags.js`
- `functions/api/posts/special-features.js`
