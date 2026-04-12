---
tags: [map, features, surfaces, homepage]
aliases: [Page Composition Map, 페이지 구성 맵]
---

# Page Composition Map

> 페이지를 최상위 축으로 보지 않고, **어떤 feature 조합이 어떤 surface를 만든다**는 관점에서 정리한 맵입니다.

## 공개 surface

| Surface | 실제 페이지 | 연결 feature |
|---|---|---|
| [[Home Surface]] | `/` | [[Public Site Chrome Feature]], [[Homepage Feed Feature]] |
| [[Latest Board Surface]] | `/latest` | [[Public Site Chrome Feature]], [[Board Read Feature]], [[Board Write Feature]] |
| [[Korea Board Surface]] | `/korea` | [[Public Site Chrome Feature]], [[Board Read Feature]], [[Board Write Feature]] |
| [[APR Board Surface]] | `/apr` | [[Public Site Chrome Feature]], [[Board Read Feature]], [[Board Write Feature]] |
| [[WOSM Board Surface]] | `/wosm` | [[Public Site Chrome Feature]], [[Board Read Feature]], [[Board Write Feature]] |
| [[People Board Surface]] | `/people` | [[Public Site Chrome Feature]], [[Board Read Feature]], [[Board Write Feature]] |
| [[Search Surface]] | `/search` | [[Public Site Chrome Feature]], [[Search Feature]] |
| [[Glossary Surface]] | `/glossary` | [[Public Site Chrome Feature]], [[Glossary Feature]] |
| [[Calendar Surface]] | `/calendar` | [[Public Site Chrome Feature]], [[Calendar Feature]] |
| [[WOSM Members Surface]] | `/wosm-members` | [[Public Site Chrome Feature]], [[WOSM Members Feature]] |
| [[Contributors Surface]] | `/contributors` | [[Public Site Chrome Feature]] |
| [[Post Detail Surface]] | `/post/:id`, `/feature/:category/:slug` | [[Public Site Chrome Feature]], [[Post Detail Feature]] |

## 관리자 surface

| Surface | 실제 페이지 | 연결 feature |
|---|---|---|
| [[Admin Console Surface]] | `/admin` | [[Admin Session Feature]], [[Admin Operations Feature]] |
| [[KMS Surface]] | `/kms` | [[Admin Session Feature]], [[Admin Operations Feature]] |

## 같이 보는 문서

- [[Homepage Features Hub]]
- [[Feature Map]]
- [[Feature Module Graph]]
- [[Surface Library]]
