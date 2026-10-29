---
tags: [module, runtime, admin]
aliases: [Admin V3 Runtime, 관리자 런타임]
scope: admin
layer: runtime
---
# Admin V3 Runtime

## 역할

- 관리자 메인 앱 런타임입니다.
- 현재 저장소에서 가장 큰 단일 JS 파일 중 하나입니다.

## Code Entry

- 저장소 코드: `public/js/admin-v3.js` (공개 자산 경로 `/js/admin-v3.js`)
- 계정・권한 탐색: `public/js/admin-account.js`
- 도감・댓글・카드뉴스: `public/js/admin-memorabilia.js`, `public/js/admin-memorabilia-comments.js`, `public/js/admin-cardnews.js`
- 보조 데이터: `public/js/shared-country-name-ko.js`
- 페이지 엔트리: `public/admin.html` (관리자 URL `/admin`)
- 관리자 스타일: `public/css/admin-v3.css`

## 선행 의존

- [[GW Foundation]]

## 관련 템플릿

- [[Admin Template]]

## 관련 API

- [[Posts API]]
- [[Settings API]]
- [[Calendar API]]
- [[Admin Session API]]

## 주 책임

- 대시보드
- 게시글 관리
- 작성/수정
- 캘린더 관리
- 용어집 관리
- 히어로/홈 설정
- 마케팅/브랜딩 설정
- WOSM 회원국 관리
- 사이트 설정 전반

## 읽는 방법

1. DOMContentLoaded 초기화
2. 탭/패널 바인딩
3. 각 설정 섹션 로더
4. 저장 액션

## 분리 우선순위

- settings panels
- post editor
- calendar admin tools
- glossary admin tools
- home settings

## 관리자 탐색 재정리 · 2026-10-15

승인된 후속 작업은 탐색 순서를 대시보드→성과 분석→기사 운영→자료 관리→노출 관리→운영·설정으로 변경하고 내부 기능을 함께 개선한다. 공통 진입은 `V3.showPanel(panel, settingsSection, entry)`에서 콘텐츠·설정 이탈 보호와 OTP를 처리한다. 기존 글 편집의 `entry.editing`은 `V3.canEditPost()`로 기존 서버 편집 권한에 맞추며 새 글의 권한을 확대하지 않는다. `contentHasUnsaved`/`settingsHasUnsaved`는 확인 없는 boolean 훅으로 브라우저 이탈에도 적용한다.

관리자 모달은 기존 열기/닫기 콜백을 유지하면서 `_initAdminDialogs()`가 표시된 overlay의 제목·초점·Tab 순환·Escape 취소·원래 조작으로 복원을 처리한다. 중첩 모달은 상위 화면과 배경의 조작을 막고 원래 inert 상태를 복원한다. 기능별 저장·취소·업로드·충돌 보호와 실제 검증 결과는 [[Admin Operations Feature]]에 모은다.

`03.157.00` 내부 구현은 콘텐츠의 요청 세대/미저장 훅, EditorJS render 직렬화와 이미지 pending, 설정의 정상 조회/dirty/busy/스냅샷, 분석의 최신 기간/독립 보고서 상태를 각 기존 로더에 연결한다. 새 모듈은 관리자 KST 기간·태그 모집단 helper 두 개와 정확한 태그 상세 endpoint에 한정한다. 설정의 원자적 revision/snapshot과 메인 스토리 API/cron/기사 삭제 정리는 기존 D1 batch·settings 테이블을 사용한다. 태그 그래프는 실제 표시 배율로 글자 크기를 보정하고 노드 bounds에 맞추며 겹치는 낮은 순위 이름만 숨긴다. 모든 노드의 초점·검색·상세 접근은 유지한다.

`03.158.00`은 같은 업무·저장 계약에서 본문 구성을 교정한다. 주요 입력/설명과 히트맵·지도·마케팅 차트를 semantic section으로 기본 노출한다. 방문 추세/AI 사용량·마케팅 SVG는 실제 컨테이너 폭과 resize를 좌표계에 반영하고 전체 날짜/점·기간·tooltip·키보드 조작을 보존한다. 태그 관계도는 상단 분포와 나란히 배치하며 연결은0.6~1.5px non-scaling-stroke로 유지한다. 국가/도시의 기존 집계와 좌표 검증을 재사용해 목록과 지도 위치를 연결한다. 새 운영/계정 현황 요약은 성공한 조회의 자료만 렌더하고 pending/실패 때 이전 숫자를 현재 요약으로 표시하지 않는다. 새 의존성·모듈 분리·API/권한 변경은 없다.

이번 변경은 [[Admin Operations Feature]]의 전 기능 대응표와 [[Admin Console Surface]]의 여섯 영역을 기존 런타임에 연결한다. 위 모듈 분리 목록은 기존 후보이며 이번 구현에서 큰 파일 분리・새 라우터・새 공통 프레임워크를 도입하지 않는다.

- `V3.showPanel(panel, settingsSection)`와 기존 패널/설정 식별자를 재사용한다. 하위 `details`는 `name="admin-tools"`로 배타적으로 펼친다. 메뉴 그룹・접기 상태・현재 메뉴 표시가 권한 카탈로그를 대체하지 않는다.
- `ADMIN_MENUS`의 35개 슬러그・`data-perm-slug`・`data-owner-only`・직접 패널 접근 검사・API의 보기/쓰기 게이트를 함께 유지한다. 계정 세션 로드 전 메뉴 숨김과 빈 하위 그룹 숨김도 확인한다.
- 설정 내부의 숨긴 보조 메뉴는 제거하고, 구형 `account-security` 진입은 `account-me`로 연결한다. 내 계정의 비밀번호・OTP・백업코드와 서버 API를 재사용한다.
- `picks`는 자동 추천 선정 기준 안내로 유지하며 현재 선정 결과를 조회하는 화면이라고 설명하지 않는다. 구형 검색・선택・해제・정렬에서 `featured`와 `picks_order`를 변경하던 호출부는 더는 도달하거나 실행할 수 없어야 한다. 공개 `loadHomePicks` 선정 로직과 실제 저장 데이터는 변경하지 않는다.
- `nav-labels`는 오너 전용 공개 메뉴명 진입점으로 복원한다. 기존 서버 계약의 `translations` 슬러그를 재사용하고 PUT은 `write` 권한으로 검사한다.
- `showPanel`의 작성 패널 이동/임시저장 타이머・분석 자동 갱신・OTP 재진입・설정 데이터 로더를 보존한다. 도감・댓글・카드뉴스는 `gw:admin-panel-shown` 성공 이벤트로 초기화하고 계정은 실제 허용된 `active` 패널을 관찰하는 기존 방식을 유지한다. 접근 거절・미저장 이동 취소・OTP 취소 때 숨긴 패널을 조회하지 않는다. 댓글은 OTP 재진입 시 목록/대기 수를 다시 조회한다. 기존 바인딩과 겹친 인라인 refresh/filter/save/modal 폴백은 제거한다.
- 작성 변경 감지는 Editor.js `onChange`에서 처리하고 프로그램 초기화는 `render({blocks:[]})`로 한다. 원시 DOM 변화 때문에 빈 편집기가 미저장 상태가 되는 문제를 피하며 실제 편집기 입력/빈 재설정・작성・복원・이동을 로컬 합성 환경에서 검증했다.
- 자동저장 응답은 변경 순번을 확인하여 그동안 추가한 입력/이미지를 덮지 않는다. 임시저장/발행 동시 실행・진행 중 이동을 막고 발행 성공 뒤 초안 ID를 비운다. 발행 중 추가 입력은 미저장 상태로 보존하며 실패 시 저장을 다시 예약한다. 100ms 재시도도 기존 자동저장 취소 경로에서 해제한다.

`03.156.00` 탐색 릴리스의 Playwright 18/18・production 함수 의미 검사・댓글 OTP 재진입・공개 메뉴명 권한 API 6개 검사는 통과했다. KMS 원본/사례/검증 항목 동기화, runtime 커밋 `d5461520` 표준 배포와 관리자 자산 6개 해시 일치, 새 운영 오너 화면의 버튼 39개 도달/민감 메뉴 OTP 취소 보호를 확인했다. 로컬 합성 검증과 인증된 프로덕션・KMS 동기화・배포는 서로 다른 단계이며 실제 상태와 증거는 [[Admin Operations Feature]]에서 관리한다. 실데이터 CRUD・OTP 성공・유료 AI 실행・실제 멤버 로그인・실제 모바일 기기 검수는 확인/실행하지 않았다.
