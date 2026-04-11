---
tags: [module, runtime, homepage, board]
aliases: [Board Write Runtime, 게시판 쓰기 런타임]
scope: homepage
layer: runtime
---
# Board Write Runtime

## 역할

- 공개 게시판의 글쓰기 런타임입니다.
- 권한 확인, 비밀번호 모달, Turnstile, Editor.js, 임시저장, 대표 이미지/슬라이드 업로드를 담당합니다.

## Code Entry

- `js/board-write.js`

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]
- [[Board Runtime]]

## 관련 템플릿

- [[Board Template]]

## 관련 API

- [[Posts API]]
- [[Settings API]]
- [[Admin Session API]]

## 이 파일에서 담당하는 것

- `_setupWriteFeature()`
- `_showPasswordModal()`
- `_checkPassword()`
- `_showWriteForm()`
- `_submitPost()`
- `_saveDraft()`
- `_startDraftAutosave()`
- `_uploadCoverImage()`
- `_uploadGalleryImages()`
- `_loadEditorJs()`
- `_initEditorJs()`

## 왜 분리했는가

- 목록 읽기와 글쓰기의 변경 주기가 다릅니다.
- 향후 다른 AI나 외부 API가 붙어도, 글쓰기 흐름만 따로 수정하고 검증할 수 있습니다.
- 인증/에디터/임시저장 이슈가 목록 렌더 코드까지 흔들지 않게 범위를 줄입니다.

## 다음 분리 후보

- board auth runtime
- board editor adapter
- board draft persistence
