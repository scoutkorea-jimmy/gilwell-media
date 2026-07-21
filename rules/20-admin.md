---
tags: [ai-guide, rules, admin]
aliases: [Admin Rules, 관리자 규칙]
scope: project
---

# 20 · [Admin] 관리자 페이지

> [!abstract] Scope
> `admin.html` + `js/admin-v3.js` — 운영자 대상 관리 도구

## Admin Rules

- 일부 계정은 히어로 설정만 접근 가능 (게시글 권한 제한)
- 모바일: 단일 폭 1단 흐름 기본
- 탐색 기준: 좌측 사이드바 (메인 영역에 보조 메뉴 중복 금지)
- 운영 섹션: 분석, 접속 국가/도시, 마케팅, 버전기록, 오류/이슈 기록
- 관리자 날짜 형식: **ISO 기반 KST** — 감사 `YYYY-MM-DD HH:MM:SS KST` / 테이블 `YYYY-MM-DD HH:MM` / 필요 시 한글 변형. 상세는 KMS 2.1.
- 관리자 기본 서체: 시스템 서체 (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`) — `NixgonFont` 사용 금지
- `admin.html` 은 `css/style.css` 를 로드하지 않는다 — `style.css` 안의 `body.admin-page` 규칙은 죽은 코드이며 공개 사이트 용량만 늘린다.

## Admin 권한 게이팅 (Phase 5 · 03.100.00)

> [!important] 사이드바 + API 이중 게이팅
> 권한 없는 사용자가 메뉴를 보지도·누르지도 않도록 **프론트엔드 가시성 + 백엔드 401/403**을 함께 적용한다.

- **단일 카탈로그 원본**: [`functions/_shared/admin-users.js`](../functions/_shared/admin-users.js) `ADMIN_MENUS` (27개 슬러그). 사이드바와 백엔드 `gateMenuAccess`는 이 카탈로그의 슬러그를 **1:1로** 참조한다.
- **프론트엔드 가시성** (`admin.html` 사이드바):
  - 각 메뉴 버튼에 `data-perm-slug="<slug>" data-perm-action="view"` 속성. 예: `<button data-panel="list" data-perm-slug="list" data-perm-action="view">`
  - 오너 전용 메뉴는 `data-owner-only="1" hidden` (예: 사용자 관리 / 프리셋 관리 / 개인정보 처리방침)
  - 필터링은 [`js/admin-account.js`](../js/admin-account.js) `_syncOwnerOnlyNav()` + `_syncPermissionNav()`. 세션 로드 후 자동 실행.
  - 그룹 전체가 비면 섹션 헤더까지 숨김 (`_collapseEmptyNavSections()`)
- **백엔드 게이팅**: [`functions/_shared/admin-permissions.js`](../functions/_shared/admin-permissions.js) `gateMenuAccess(request, env, slug, action)`. 오너는 무조건 통과, 멤버는 `view:<slug>` 또는 `write:<slug>` 토큰 필수. 32개 admin/settings API가 이를 사용.
- **세션 TTL / 강제 재로그인 + 10분 grace** (2026-05-24 핫픽스): 서버 HMAC 쿠키는 24시간 유효. 관리자 콘솔은 매 `/admin` 페이지 접근 시 [`/api/admin/session-grace`](../functions/api/admin/session-grace.js) 를 먼저 호출 — **(1) 로그인 시점 IP 와 현재 IP 동일 AND (2) 토큰 iat 이후 10분 이내** 두 조건 모두 만족하면 200 응답을 받고 [`_tryAdminSessionGrace`](../js/admin-v3.js) 가 `_purgeAdminClientState` 를 건너뛰고 `_showApp()` 으로 바로 진입한다 (사용자가 모르게 세션 유지). grace 실패 시(IP 변경/10분 초과/네트워크 실패/구버전 토큰)에는 기존 정책 — 캐시·쿠키·Cache API·Service Worker 퍼지 + 로그인 화면 강제. 로그인 성공 후 클라이언트 유휴 타이머는 **30분**(`_SESSION_MS`). 활동(click/keydown/touch/scroll)이 있으면 리셋, 5분 전 경고, 30분 초과 시 자동 로그아웃.
- **브라우저 캐시**: `/admin`·`/admin.html` 응답에 `Cache-Control: no-store, no-cache, must-revalidate` 설정 ([`_headers`](../_headers)). HTML meta 태그(`<meta http-equiv="Cache-Control" ...>`)로 이중 방어. 새로고침이나 뒤로가기 후에도 항상 서버에서 새 HTML 요청.
- **403 UX**: 멤버가 권한 없는 API를 호출해도 서버는 `"이 메뉴의 보기 권한이 없습니다. 오너에게 요청하세요."` 토스트를 노출. 403은 `homepage-issues/report` 자동 보고 대상에서 제외 (버그가 아니므로).

## Admin Data Safety

> [!important]
> - 설정 수정 시 `settings_history` 스냅샷 필수 — 구현: `functions/_shared/settings-audit.js` → `recordSettingChange`, 21개 `functions/api/settings/*.js` 엔드포인트에서 호출.
> - 태그 삭제 시 사용 중인 글 안내 필수 — 구현: `functions/api/settings/tags.js` (사용 중인 태그는 403 + 사용 글 수 반환).
> - 인증은 HMAC-SHA256 signed httpOnly 쿠키 세션(24h)으로 단일화. 기사 수정은 세션 토큰만 검증하고 별도 비밀번호 재입력은 요구하지 않는다 — 세션 만료 시 재로그인만 거친다.
> - 클라이언트 유휴 타이머(`_SESSION_MS`)는 **30분 고정**. 서버 HMAC 쿠키 TTL(24h)보다 짧게 유지해 무활동 세션을 조기 종료한다. 단, 매 `/admin` 접근 시 쿠키 자체를 강제 만료·로그인 강제 적용하므로 쿠키 만료 시간과 불일치해도 UX 문제가 생기지 않는다.

## 신규 패널·모달·카탈로그를 추가할 때

Enum 카탈로그 동기화, PUT 권한 게이트, 모달 패턴 등 실작업 함정은 [docs/working-notes.md](../docs/working-notes.md) 에 정리되어 있다. 새 admin 패널/모달/카탈로그 추가 전 반드시 읽는다.

## Admin 관련 문서

- [[docs/homepage-module-inventory|Module Inventory]] — 관리자 포함 모듈 인벤토리
- Admin V3 런타임 — `js/admin-v3.js`
