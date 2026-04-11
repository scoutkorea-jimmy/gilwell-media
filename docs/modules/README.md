---
tags: [hub, modules, homepage]
aliases: [Homepage Modules Hub, 모듈 허브]
---

# Homepage Modules Hub

> [!note] 참고 라이브러리
> 이 문서는 [[Homepage Features Hub]] 아래의 참고 라이브러리입니다.
> Obsidian에서는 먼저 기능 허브를 보고, 필요한 모듈로 내려오는 흐름을 권장합니다.

## 읽는 순서

1. [[Homepage Features Hub]] — 기능 진입점
2. [[Feature Map]] — 전체 기능 맵
3. [[Homepage Runtime Map]] — 런타임 의존성 맵
4. [[Templates Library]] — 템플릿 문서
5. [[API Library]] — API 문서
6. [[GW Foundation]] — 전역 기반
7. [[Public Site Chrome]] — 공개 셸
8. [[Homepage Runtime]] → [[Board Runtime]] → [[Board Write Runtime]]
9. [[Post Page Runtime]] → [[Glossary Runtime]] → [[Search Runtime]]
10. [[Calendar Runtime]] → [[WOSM Members Runtime]]
11. [[Admin V3 Runtime]]

## 레이어 구조

```
Foundation    → js/main.js (window.GW, 공용 유틸)
Public Shell  → js/site-chrome.js (상단 메뉴, 번역, 푸터, 통계)
Page Runtime  → js/home.js, js/board.js, js/post-page.js, js/search.js ...
Admin Runtime → js/admin-v3.js, js/kms.js
```

## 빠른 규칙

- 새 기능은 먼저 **Foundation / Public Shell / Page Runtime** 중 어디인지 분류
- 두 페이지 이상에서 반복되면 `js/main.js` 또는 `js/site-chrome.js`로 올릴 수 있는지 확인
- Obsidian에서는 위키링크로 이동, 코드 확인은 각 노트의 `Code Entry` 섹션

## 관련 문서

- [[Homepage Features Hub]]
- [[Feature Map]]
- [[Homepage Runtime Map]]
- [[Templates Library]]
- [[API Library]]
- [[CHATGPT]] — 홈페이지 개발 가이드
