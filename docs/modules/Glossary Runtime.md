---
tags: [module, runtime, homepage, glossary]
aliases: [Glossary Runtime, 용어집 런타임]
scope: homepage
layer: runtime
---
# Glossary Runtime

## 역할

- 공개 용어집 페이지의 검색, 정렬, 로그인 후 액션 일부를 담당합니다.

## Code Entry

- `js/glossary.js`
- 페이지 엔트리: `glossary.html`

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]

## 주 책임

- 용어집 목록 로딩
- 공개 검색과 필터
- 로그인 후 편집/관리 보조 흐름

## 관련 템플릿

- [[Glossary Template]]

## 관련 API

- [[Settings API]]
- [[Admin Session API]]

## 분리 후보

- glossary search runtime
- glossary table renderer
- glossary admin bridge
