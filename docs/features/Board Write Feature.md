---
tags: [feature, public, homepage, board]
aliases: [Board Write Feature, 게시판 글쓰기]
scope: homepage
---
# Board Write Feature

## 기능 역할

- 공개 게시판 글쓰기
- 관리자 비밀번호 확인
- Turnstile
- Editor.js
- 임시저장
- 대표 이미지/슬라이드 업로드

## 연결 모듈

- [[Board Write Runtime]]
- [[Board Runtime]]
- [[GW Foundation]]

## 연결 템플릿

- [[Board Template]]

## 연결 surface

- [[Latest Board Surface]]
- [[Korea Board Surface]]
- [[APR Board Surface]]
- [[WOSM Board Surface]]
- [[People Board Surface]]

## 연결 API

- [[Posts API]]
- [[Settings API]]
- [[Admin Session API]]

## 안정성 이유

- 목록 읽기와 작성 흐름의 변경 주기를 분리합니다.
- 다른 AI나 외부 입력 API가 붙을 때 글쓰기 범위만 좁게 읽고 수정할 수 있습니다.

## 다음 분리 후보

- board auth feature
- board editor adapter feature
- board draft feature
