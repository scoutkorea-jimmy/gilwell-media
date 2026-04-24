---
tags: [dreampath, history, case-studies, version-log]
aliases: [Dreampath History, Dreampath Case Studies, Version Log]
scope: dreampath
sibling: DREAMPATH.md
---

# DREAMPATH-HISTORY.md — Dreampath 버전 히스토리 · 케이스 스터디

> [!important] 이 파일의 역할
> Dreampath 에서 발생한 **모든** 의미있는 변경 / 사고 / 회귀 / 비자명한
> 결정의 상세 기록입니다. `DREAMPATH.md` 가 "지금 지켜야 할 규칙" 이라면
> 이 파일은 "**왜 그 규칙이 생겼는가**" 의 원본입니다.
>
> **국문 + 영문 병기**: 향후 독립 도메인에서 내부 팀 / 외부 기여자
> 양쪽이 동일 정보를 공유할 수 있도록 매 엔트리에 한국어 + 영어 병기합니다.
>
> **코드 주석 연동**: 각 케이스 스터디에는 `code_refs` 필드가 있어, 해당
> 사건의 재발 방지 주석이 어느 파일의 어느 함수에 남아 있는지 명시합니다.
> `DREAMPATH.md` Section 17 의 규칙에 의거합니다.

---

## 인덱스 / Index

날짜 역순.

- [2026-04-24 · D](#2026-04-24--d) · v01.040.00 — 홈 전면 개편 + 모바일 접근성 + 새 로고 + B1~B5
- [2026-04-24 · C](#2026-04-24--c) · 디자인 시스템 도입 + 문서 완전 분리
- [2026-04-24 · B](#2026-04-24--b) · Dreampath 홈 UX · 접근성 검토 (계획)
- [2026-04-24 · A](#2026-04-24--a) · CSP 회귀 · 사이드바 전체 마비 (P0)

---

## 2026-04-24 · D

### v01.040.00 (feature) — Dreampath 홈 전면 개편

**국문 요약**
홈 화면을 모바일 접근성을 최우선으로 전면 개편. Today/Week 요약 스트립 · 미확인 변경 표시 · 검색 결과 타입별 그룹화 · 홈에서 바로 할 일 상태 전환 · 내 승인 대기 카드 5개 기능 추가. BP미디어 톤앤매너로 그레이스케일 neutrals 토큰 이식 + 새 로고 SVG 적용 + 전역 키보드 위임으로 인라인 onclick 구조를 유지하면서 WCAG 2.1 AA / 3.0 APCA 기준 충족.

**English Summary**
Full home redesign with mobile accessibility as the top priority. Added five new home features: Today/Week summary strip, unread indicator for recent changes, typed search-result grouping, inline task status toggle, and my pending-approvals card. Imported BP Media grayscale neutral tokens, adopted the new logo SVG, and installed a global keyboard delegate so inline onclick structure is preserved while meeting WCAG 2.1 AA / 3.0 APCA targets.

**변경 상세 / Changes**

- `functions/api/dreampath/home.js` — `today_summary`, `events_current_month`, `pending_approvals` 세 필드 추가. 현재 월 이벤트 번들로 홈 최초 페인트의 `/events?month=` 별도 왕복 제거.
- `dreampath.html` — BP-style grayscale 토큰 (`--gray-900`~`--gray-100`), `--touch-min`, `--focus-ring` 추가. `--text-3` #8A9FAF → #5A6B77 (APCA Lc 45 → 65). Today strip / 승인 카드 / unread dot / task quick button / 검색 그룹 CSS 신설. Skip link, 사이드바 SVG mask 아이콘 컨테이너 추가.
- `js/dreampath.js` — 전역 `keydown` 리스너 (`Enter`/`Space` → click), `renderTodaySummary`, `renderPendingApprovals`, `_homeTaskQuick`, 검색 그룹화 renderer, recent unread 추적 (`localStorage.dp_home_last_seen_at`), `_recentItemHtml` unread 표시.

**교훈 / Lessons**

- "홈 = 가장 처음 보는 화면" 이므로 기능 추가보다 접근성 기본값 (대비, 터치 타겟, 키보드 경로) 을 먼저 확보.
- `_homeTaskQuick` 초안에 `PATCH /tasks` 로 썼다가 `tasks.js` 가 `PUT` 만 구현한 것을 확인하고 수정. → 새로운 frontend helper 작성 전 backend 메서드 확인 루틴 필요. ([DREAMPATH.md](DREAMPATH.md) Section 12 B4 의 "PATCH 아닙니다" 주석 배경)

**관련 커밋 / Commits**
- `843b7a5` — Dreampath 홈 전면 개편 — 모바일 접근성 우선 + B1~B5 기능 + 새 로고

**code_refs**
- [js/dreampath.js](js/dreampath.js) — `init()` 전역 keydown delegator
- [js/dreampath.js](js/dreampath.js) — `renderTodaySummary`, `renderPendingApprovals`, `_homeTaskQuick`, `_recentItemHtml`
- [functions/api/dreampath/home.js](functions/api/dreampath/home.js) — `events_current_month`, `pending_approvals` 쿼리

---

## 2026-04-24 · C

### 디자인 시스템 도입 + 문서 완전 분리

**국문 요약**
사용자가 DreamPath Design System (18개 스트로크 아이콘 + 6종 로고 변형) 을 제공. Dreampath 에 없는 아이콘 (home, megaphone, note, phone, settings, user-single, users-admin) 은 동일 톤앤매너로 신규 생성. 사이드바 이모지를 전부 SVG 아이콘으로 교체 (CSS `mask-image` 로 `currentColor` 상속). 동시에 `CLAUDE.md` Section 5 를 `DREAMPATH.md` 포인터로 슬림화하고, 버전 히스토리 / 케이스 스터디를 `DREAMPATH-HISTORY.md` 로 완전 분리. 섹션 기호(section-sign 글리프, U+00A7) 도 문서에서 전면 폐기 — "Section N" 표기로 대체.

**English Summary**
User supplied a DreamPath Design System (18 stroke icons + 6 logo variants). Generated additional icons (home, megaphone, note, phone, settings, user-single, users-admin) in the same tone and manner for Dreampath-specific needs. Replaced all sidebar emoji with SVG icons rendered via CSS `mask-image`, inheriting `currentColor`. Slimmed `CLAUDE.md` Section 5 to a pointer to `DREAMPATH.md`, and split version history / case studies out to `DREAMPATH-HISTORY.md`. Fully retired the section-sign glyph (U+00A7) from Dreampath documentation — replaced with "Section N" prose everywhere.

**변경 상세 / Changes**

- `img/dreampath/icons/*.svg` — 18 원본 + 7 신규 아이콘.
- `img/dreampath/favicon.svg`, `logo-dreampath-app-icon.svg`, `logo-dreampath-mono-black.svg`, `logo-dreampath-mono-white.svg`, `logo-dreampath-horizontal-light.svg` — 로고 변형 5종 적재.
- `dreampath.html` — 사이드바 12개 nav 아이콘을 `<span class="dp-nav-icon-svg" style="--dp-icon:url(...)">` 로 교체. favicon 32×32 전용 변형으로, apple-touch-icon app-icon 변형으로 교체.
- `js/dreampath.js` `_refreshSidebar` — 동적 생성 board / team nav 도 SVG mask 아이콘.
- `DREAMPATH.md` 재작성 — 개발 규칙만 남기고, Section 14 (Identity) 아이콘 디자인 스펙 + Section 17 (케이스 스터디 코드 주석 규칙) 신설.
- `DREAMPATH-HISTORY.md` 신설 — 이 파일.
- 모든 section-sign (U+00A7) 글리프 제거 → "Section N" 표기.

**교훈 / Lessons**

- 아이콘 컴포넌트는 `<img>` 가 아닌 `mask-image` 로 렌더해야 `currentColor` 상속이 자연스럽고 active state 에서 asset swap 불필요.
- 신규 아이콘이 필요할 때 외부 라이브러리 (lucide, heroicons 등) 로 끌어오면 브랜드 일관성이 깨진다. 반드시 디자인 시스템 톤 (24×24 viewBox, stroke 1.75, currentColor, round cap/join) 으로 손수 작성.
- 문서를 분리할 때 "규칙" 과 "이력" 을 섞으면 규칙이 계속 길어지고 AI가 최신 이력을 찾기 어려워진다. 분리 + 상호 참조 구조가 더 강함.

**code_refs**
- [dreampath.html](dreampath.html) — `.dp-nav-icon-svg` CSS rule
- [dreampath.html](dreampath.html) — 사이드바 12개 nav 항목의 `--dp-icon` 변수
- [js/dreampath.js](js/dreampath.js) — `_refreshSidebar` 내 동적 nav 생성부

---

## 2026-04-24 · B

### Dreampath 홈 UX · 접근성 검토 (계획)

**국문 요약**
Dreampath 홈의 기능적 결함 / 접근성 결함을 체계적으로 검토. Explore 에이전트 2개 병렬로 현재 구조 조사 + BP미디어 접근성 기준 비교. 결과: 버그 7건 (A1~A7), 추가 제안 5건 (B1~B5) 식별. BP미디어의 WCAG 3.0 APCA Lc 기준 / 그레이스케일 토큰 / 접근성 6원칙을 Dreampath 에 이식 가능 판단. CUFS 팔레트와 충돌 없음.

**English Summary**
Systematic review of Dreampath home for functional and accessibility defects. Ran two Explore agents in parallel: one to map current home structure, another to extract BP Media accessibility standards. Outcome: identified 7 bugs (A1-A7) and 5 proposed additions (B1-B5). Concluded that BP Media's WCAG 3.0 APCA Lc thresholds, grayscale tokens, and six accessibility principles can be adopted without colliding with the CUFS palette.

**식별된 버그 / Identified Bugs**

| ID | 증상 | 원인 |
|---|---|---|
| A1 | 메타 · placeholder 텍스트 대비 부족 | `--text-3` Lc ~45 (본문·콘텐츠 기준 미달) |
| A2 | 키보드 조작 불가 | 17개+ 인터랙티브 `<div>` 가 role/tabindex 없이 `onclick` 만 |
| A3 | 이모지 스크린리더 중복 낭독 | `aria-hidden` 미적용 |
| A4 | skip-link 없음 | body 상단 점프 수단 부재 |
| A5 | 포커스 인디케이터 없음 | `:focus-visible` 스타일 비정의 |
| A6 | calendar 데이터 경로 이원화 | `home.js` 와 `/events?month=` 별개 왕복 |
| A7 | 칩 · 배지 색상 인라인 HEX | 토큰화 안 됨 |

**교훈 / Lessons**

- "기능 추가" 와 "접근성 기본값" 이 동시에 논의될 때 순서: **접근성 먼저**. 접근성은 나중에 얹기가 더 어렵다 (키보드 경로를 위해 HTML 구조를 리팩터해야 하는 경우가 많음).
- 인라인 `onclick` 을 유지하고 싶어도 키보드 접근은 별도로 확보 가능하다. 전역 `keydown` 위임이 그 답 → Section 2.3 규칙화.

---

## 2026-04-24 · A

### 🚨 CSP 회귀 · 사이드바 전체 마비 (P0) 🚨

**국문 요약**
공개 사이트의 CSP 가 `nonce + 'strict-dynamic'` 으로 강화되면서, Dreampath (`/dreampath`) 의 인라인 `onclick="DP.*()"` 전체가 **무반응** 이 되던 P0 회귀. 브라우저가 nonce 존재 시 `'unsafe-inline'` 을 무시하는 CSP3 규약 때문. `functions/_middleware.js isLegacyInlinePath()` 가 `/admin`, `/kms` 만 legacy 예외로 처리하고 `/dreampath` 를 누락했던 것이 직접 원인.

**English Summary**
After the public site CSP was tightened to `nonce + 'strict-dynamic'`, **every** inline `onclick="DP.*()"` in Dreampath (`/dreampath`) went unresponsive — a P0 regression. Under CSP3, browsers ignore `'unsafe-inline'` whenever a nonce is present, so the entire sidebar, toolbar, and modal trigger set silently failed. Root cause: `isLegacyInlinePath()` in `functions/_middleware.js` allowlisted only `/admin` and `/kms`, not `/dreampath`.

**증상 / Symptoms**
- 사이드바 클릭 무반응 (네비게이션 실패).
- 모달 트리거 무반응.
- 캘린더 날짜 클릭 무반응.
- 콘솔: `Refused to execute inline event handler because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-...' 'strict-dynamic' ..."`.

**원인 / Root Cause**
1. 2026-04-24 직전 커밋 (244da09 등) 에서 공개 사이트에 CSP 강화 정책 적용. 미들웨어가 응답에 nonce 주입.
2. `isLegacyInlinePath()` 는 `/admin`, `/kms` 와 그 하위 경로만 legacy `'unsafe-inline'` 경로로 편입.
3. Dreampath 는 CLAUDE.md 설계상 `DP.*` 인라인 `onclick` 전면 사용 (지금까지 문제 없던 영역) 이었지만, 새 CSP 는 이 구조와 양립 불가능.

**수정 / Fix**

`functions/_middleware.js` `isLegacyInlinePath()` 에 `/dreampath`, `/dreampath.html` 추가. Admin / KMS 와 동일하게 legacy `'unsafe-inline'` CSP 경로로 편입.

```diff
 function isLegacyInlinePath(pathname) {
   if (!pathname) return false;
   if (pathname === '/admin' || pathname === '/admin.html') return true;
   if (pathname === '/kms' || pathname === '/kms.html') return true;
+  if (pathname === '/dreampath' || pathname === '/dreampath.html') return true;
   if (pathname.startsWith('/admin/') || pathname.startsWith('/kms/')) return true;
   return false;
 }
```

**검증 / Verification**

배포 후 `curl -sI https://gilwell-media.pages.dev/dreampath | grep -i content-security-policy` 로 `'unsafe-inline'` 포함 확인. 공개 사이트 `/` 는 그대로 `'nonce-...' 'strict-dynamic'` 유지 확인 (Dreampath 한정 예외).

**교훈 / Lessons**

1. **공용 미들웨어 변경은 모든 인라인 핸들러 사용 경로에 영향을 준다**. `_middleware.js` 수정 시 `/admin`, `/kms`, `/dreampath` 모두 확인해야 한다.
2. **CSP3 는 nonce 존재 시 `'unsafe-inline'` 을 무시한다**. `_headers` 에 `'unsafe-inline'` 이 있어도, 미들웨어가 nonce 붙이면 무효화된다.
3. **Dreampath 는 `dp_versions` 가 아닌 `VERSION` 에 영향받는 경우가 있다** (공용 인프라 변경일 때). 이 구분이 향후 비슷한 사고를 가장 빨리 추적하는 힌트.
4. **관리자 인증 필수 + X-Frame-Options: DENY + 외부 inline 주입 표면 없음** → Dreampath 가 legacy `'unsafe-inline'` 경로에 머무는 것은 보안상 문제 없음. 공개 사이트와 격리되어 있기 때문.

**영향 / Blast Radius**
- 사이트 버전 00.131.06 → 00.131.07 (hotfix).
- `dp_versions` 테이블에는 **등록되지 않음** (공용 인프라 변경이라 `./deploy.sh` 경로 아님) — 이 사실이 "버전 기록이 업데이트 안 된 것 같다" 는 오해를 낳았고, 그 결과 Section 16 (Version Policy) 와 본 문서 분리 결정으로 이어짐.

**재발 방지 / Prevention**

- [functions/_middleware.js](functions/_middleware.js) `isLegacyInlinePath()` 에 2026-04-24 케이스 스터디 주석 고정 (DREAMPATH.md Section 17 포맷).
- [DREAMPATH.md](DREAMPATH.md) Section 10 "CSP: `/dreampath` 레거시 경로" 신설 — 새 경로 추가 시 `isLegacyInlinePath()` 에도 추가하라는 규칙.
- Critical Prohibitions 12번 항목에 "프로덕션 회귀는 Section 17 주석 + 본 파일 이력 동시 기록" 명문화.

**관련 커밋 / Commits**
- `111415d` — hotfix: Dreampath 사이드바 전체 기능 정지 회귀 복구 (00.131.07)

**code_refs**
- [functions/_middleware.js](functions/_middleware.js) `isLegacyInlinePath()` — 재발 방지 주석
- `_headers` — CSP 기본 정책은 여기 있지만 미들웨어가 override. 둘 다 확인 필수.

---

## 과거 이력 / Earlier History

v01.039.x 이전 버전 기록은 D1 `dp_versions` 테이블 또는 `/dreampath` 사이드바
"Dev Rules" 메뉴를 참조합니다. Git 로그로는 다음 명령:

```bash
git log --oneline -- 'dreampath.html' 'js/dreampath.js' 'functions/api/dreampath/**'
```

이 문서는 2026-04-24 부터의 이력을 AI 관점에서 세밀하게 기록합니다. 이전 이력은
향후 독립 도메인 이전 시점에 이 포맷으로 역소급 정리 예정.

---

## Entry Template (새 이력 추가 시)

새 엔트리는 **파일 최상단 인덱스 + 그 아래 본문** 에 추가합니다. 날짜 역순.

```markdown
## YYYY-MM-DD · X

### vXX.XXX.XX (type) — 제목 / Title

**국문 요약**
...

**English Summary**
...

**변경 상세 / Changes**
- ...

**교훈 / Lessons**
- ...

**관련 커밋 / Commits**
- `<short-sha>` — ...

**code_refs**
- [파일:라인](경로) — 재발 방지 주석 위치
```

Case study 성격 (회귀 / 비자명 결정) 이면 **증상 / 원인 / 수정 / 검증** 4개
섹션을 추가로 포함합니다 (2026-04-24 A 참조).
