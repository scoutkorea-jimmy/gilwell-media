# Board Runtime

## 역할

- 공개 게시판 페이지 공통 런타임입니다.
- 게시글 목록, 태그 필터, 검색, 페이지네이션, 공개 글쓰기 흐름까지 담당합니다.

## Code Entry

- `js/board.js`

## 핵심 정의

- `GW.Board`

## 사용하는 페이지

- `latest.html`
- `korea.html`
- `apr.html`
- `wosm.html`
- `people.html`

## 주 책임

- 목록 API 호출
- 태그 바 로딩
- 게시판 배너 정보 로딩
- 페이지네이션
- 검색
- 상세 모달
- 공개 글쓰기/비밀번호 확인
- Editor.js 로딩과 제출

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]

## 읽는 순서

1. 생성자
2. `init()`
3. `_load()`
4. `_setupModal()`
5. `_setupWriteFeature()`

## 분리 후보

- board list runtime
- board modal runtime
- board write runtime
- board editor adapter
