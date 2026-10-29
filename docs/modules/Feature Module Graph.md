---
tags: [map, modules, features, graph, homepage]
aliases: [Feature Module Graph, 기능-모듈 그래프]
---

# Feature Module Graph

> Obsidian 그래프뷰에서 가장 많이 참고할 연결표입니다.  
> **Feature ↔ Module ↔ API ↔ Template ↔ Surface**를 한 번에 따라갈 수 있게 정리합니다.

| Feature | Module | API | Template | Surface |
|---|---|---|---|---|
| [[Public Site Chrome Feature]] | [[Public Site Chrome]], [[GW Foundation]] | [[Settings API]], [[Home and Stats API]] | [[Homepage Template]], [[Board Template]], [[Search Template]], [[Glossary Template]], [[Calendar Template]], [[WOSM Members Template]], [[Contributors Template]], [[Post Detail Template]] | [[Home Surface]], [[Latest Board Surface]], [[Korea Board Surface]], [[APR Board Surface]], [[WOSM Board Surface]], [[People Board Surface]], [[Search Surface]], [[Glossary Surface]], [[Calendar Surface]], [[WOSM Members Surface]], [[Contributors Surface]], [[Post Detail Surface]] |
| [[Homepage Feed Feature]] | [[Homepage Runtime]], [[Public Site Chrome]], [[GW Foundation]] | [[Home and Stats API]], [[Posts API]], [[Settings API]] | [[Homepage Template]] | [[Home Surface]] |
| [[Board Read Feature]] | [[Board Runtime]], [[GW Foundation]], [[Public Site Chrome]] | [[Posts API]], [[Settings API]] | [[Board Template]] | [[Latest Board Surface]], [[Korea Board Surface]], [[APR Board Surface]], [[WOSM Board Surface]], [[People Board Surface]] |
| [[Board Write Feature]] | [[Board Write Runtime]], [[Board Runtime]], [[GW Foundation]] | [[Posts API]], [[Admin Session API]] | [[Board Template]] | [[Latest Board Surface]], [[Korea Board Surface]], [[APR Board Surface]], [[WOSM Board Surface]], [[People Board Surface]] |
| [[Post Detail Feature]] | [[Post Page Runtime]], [[GW Foundation]], [[Public Site Chrome]] | [[Posts API]], [[Settings API]] | [[Post Detail Template]] | [[Post Detail Surface]] |
| [[Search Feature]] | [[Search Runtime]], [[GW Foundation]], [[Public Site Chrome]] | [[Posts API]], [[Settings API]] | [[Search Template]] | [[Search Surface]] |
| [[Glossary Feature]] | [[Glossary Runtime]], [[GW Foundation]], [[Public Site Chrome]] | [[Settings API]], [[Posts API]] | [[Glossary Template]] | [[Glossary Surface]] |
| [[Calendar Feature]] | [[Calendar Runtime]], [[GW Foundation]], [[Public Site Chrome]] | [[Calendar API]], [[Settings API]] | [[Calendar Template]] | [[Calendar Surface]] |
| [[WOSM Members Feature]] | [[WOSM Members Runtime]], [[Public Site Chrome]], [[GW Foundation]] | [[Settings API]] | [[WOSM Members Template]] | [[WOSM Members Surface]] |
| [[Admin Session Feature]] | [[Admin V3 Runtime]], [[GW Foundation]] | [[Admin Session API]] | [[Admin Template]], [[KMS Template]] | [[Admin Console Surface]], [[KMS Surface]] |
| [[Admin Operations Feature]] | [[Admin V3 Runtime]], [[GW Foundation]] | [[Posts API]], [[Settings API]], [[Calendar API]], [[Admin Session API]] | [[Admin Template]], [[KMS Template]] | [[Admin Console Surface]], [[KMS Surface]] |

## 읽는 순서

1. Feature를 고른다.
2. 연결 Module을 본다.
3. 영향받는 API와 Template을 본다.
4. 마지막에 Surface를 확인한다.

즉, 페이지는 마지막 확인 대상이다.
