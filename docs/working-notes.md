---
tags: [ai-guide, working-notes, site, admin]
aliases: [작업 효율성 노트, Working Notes]
scope: site-admin
---

# 작업 효율성 노트 (Site / Admin)

> [!info] 세션 인사이트 누적
> 실제 작업 중 반복적으로 발견한 함정·패턴을 모은 체크리스트. 새 기능 착수 전이나 회귀 디버깅 전에 한 번 훑으면 30분~1시간 절약됨. 새 인사이트는 발견 즉시 이 파일에 prepend로 추가.
>
> 이 노트는 매 턴마다 컨텍스트에 자동 로드되지는 않습니다. CLAUDE.md에서 포인터만 유지하고, AI는 회귀 디버깅·신규 기능 착수 시 직접 읽도록 합니다.

## 13 배포·문서 작업 함정 (changelog 들여쓰기 · 순차 배포 · KMS 100KB)

기념품 조회수(00.169.00) 배포가 여러 번 막힌 케이스. 상세·재발 방지는 KMS 13.1.7.

- **changelog.json 들여쓰기**: `items[]` 요소 2-space(`  {`), 필드 4-space. Edit을 다른 들여쓰기로 쓰면 조용히 실패 → 엔트리 누락 → `verify_release_metadata.sh`가 전 배포 차단. 추가 후 `grep`/JSON 카운트로 실제 삽입 확인. `JSON.parse` 통과 ≠ 추가됨.
- **순차 배포**: D1 마이그레이션 → commit → push → deploy를 병렬 호출 금지. 앞 단계 차단 시 뒤 단계 전부 취소됨.
- **라이브 검증**: 배포 성공 판단은 출력이 아니라 `curl .../VERSION` + 엔드포인트 응답으로.
- **KMS D1 CLI 100KB 한계**: `settings.feature_definition` 전체 블롭 단일 SQL은 `SQLITE_TOOBIG`. 값 분할 `INSERT + UPDATE value||'...'`(history는 서브쿼리 스냅샷) 또는 관리자 PUT API. D1 먼저 갱신 → `sync_kms_snapshot.mjs` 재생성(md 직접 편집은 다음 sync에 덮임).
- **편집 전 실제 파일 읽기**: 탐색/추정 구조로 Edit `old_string`을 쓰면 "string not found"로 실패. 항상 실제 내용에서 복사.

## 1 Enum / 카탈로그 변경은 "원본 1곳 → 동기화 N곳"

backend 상수 한 줄을 바꾸면 항상 **검증·렌더·CSS** 사본까지 함께 확인해야 한다. grep으로 모든 사본을 찾기 전엔 커밋하지 말 것.

| 카탈로그 | 동기화 대상 |
|---|---|
| 지역연맹 (Africa/Arab/Asia-Pacific/European/Interamerican/WOSM/Unclassified) | `functions/api/settings/reference-sites.js` `ALLOWED_FEDERATIONS` + `canonicalFederation` / `js/admin-v3.js` `_getGeoRegionCatalog` + `_canonicalGeoRegion` + `_getGeoRegionTone` / `css/admin-v3.css` `.v3-geo-region-badge.is-XXX` (3개 셀렉터 + legend dot) |
| Editor 슬롯 (A·B·C 잠금 + D~Z 자유) | `functions/api/settings/editors.js` `REQUIRED_LETTERS` + `normalizeEditors` / `js/admin-v3.js` `EDITOR_REQUIRED_LETTERS` + `_normalizeEditorsResponse` + `_addEditorRow` + `_renderEditors` |
| Editor.A 기본값 (publish byline fallback) | `functions/post/[id].js` / `functions/api/posts/[id].js` / `functions/api/posts/index.js` / `functions/api/settings/author.js` |

확인 명령:
```bash
grep -rn "ALLOWED_FEDERATIONS\|REQUIRED_LETTERS\|Editor\.A" --include="*.js" --include="*.css" .
```

## 2 `functions/api/settings/*` PUT 권한 게이트 정렬

`onRequestGet` → `gateMenuAccess(..., '<slug>', 'view')` / `onRequestPut`·`Post`·`Delete` → `'write'`. `'view'`로 잘못 적힌 PUT은 보기 권한자가 저장 가능한 잠재 버그.

확인 명령 (PUT인데 `view`인 곳이 있으면 출력):
```bash
grep -A2 "onRequestPut\|onRequestPost\|onRequestDelete" functions/api/settings/*.js | grep -B1 "gateMenuAccess.*'view'"
```

실제 사례: `functions/api/settings/contributors.js` PUT이 `'view'`로 잘못돼 있어 03.109.01에서 `'write'`로 수정.

## 3 공개 페이지 ↔ admin 메뉴 라벨 정합성

공개 페이지 제목이 admin 메뉴/카드 제목과 다르면 사용자는 "기능 누락"으로 보고한다. **사용자가 어떤 admin 기능이 사라졌다고 할 때 첫 번째 의심은 라벨 불일치.**

| 공개 페이지 | 공개 라벨 | admin 라벨 (현재) |
|---|---|---|
| `/contributors` | 도움을 주신 분들 | 도움 주신 분들 ✅ (이전 `기고자` → 수정) |
| `/wosm-members` | 세계연맹 회원국 현황 | 세계연맹 회원국 ✅ |
| `/glossary` | 용어집 | 용어집 ✅ |

새 admin 패널 만들 때: 카드 제목·사이드바·`v3-settings-nav-btn` 3곳 모두 공개 라벨과 동일하게.

## 4 admin은 `css/style.css`를 로드하지 않음

`admin.html`은 `css/admin-v3.css`만 로드. 따라서 **공용 UI 컴포넌트(banner, toast, overlay 등)는 양쪽 CSS에 중복 정의** 필요. 변경 시 한 곳만 고치면 다른 쪽에서 깨진다.

- 신규 컴포넌트 추가 시 `grep -n "<클래스명>" css/style.css css/admin-v3.css`로 양쪽 존재 여부 먼저 확인
- admin에서 z-index는 모달(8000) 밑(`< 8000`)으로 두어 폼 입력 차단 방지

실제 사례: `.gw-update-banner`(새 빌드 알림)는 style.css(공개, z=10000) + admin-v3.css(admin, z=7000) 둘 다 정의됨.

## 5 모달 패턴 — `v3-overlay` + `v3-modal`

표준 구조:
```html
<div class="v3-overlay" id="my-modal" style="display:none;">
  <div class="v3-modal v3-modal-lg">
    <div class="v3-modal-head">제목 <button data-close="my-modal">×</button></div>
    <div class="v3-modal-body">…</div>
    <div class="v3-modal-foot">…</div>
  </div>
</div>
```

- 오픈: `el.style.display = 'flex'`
- 닫기: `el.style.display = 'none'`
- `[data-close="<id>"]` 버튼은 **글로벌 delegator**(`js/admin-account.js:934-948`)가 자동 처리 → 별도 바인딩 불필요
- **backdrop 클릭으로 닫기는 4개 모달만 자동 동작** (account-user, account-permission, account-temp-password, account-preset). 새 모달은 자체 backdrop listener 필요:
  ```js
  el.addEventListener('click', e => { if (e.target === el) close(); });
  ```

실제 사례: 03.109.00의 `#refsite-modal`은 자체 backdrop 핸들러 추가했음.

## 6 Prod D1 직접 write는 차단됨

Bash로 `wrangler d1 execute ... UPDATE/INSERT/DELETE`를 시도하면 auto-mode 분류기가 거부. 대안 (우선순위 순):
1. 관리자 UI에서 사용자가 직접 처리
2. 기존 `/api/admin/*` 엔드포인트를 통해 인증된 변경
3. 사용자에게 명시 허가 요청 후 한 번만 실행

`SELECT`는 자유 허용. P0 이슈 해결도 D1 직접 UPDATE 대신 관리자 → `사이트 오류/이슈 기록` 패널에서 처리.

## 7 배포 후 검증은 apex 도메인 사용

`www.bpmedia.net`은 라우팅 차이로 522 응답할 수 있음. `https://bpmedia.net`(apex)이 신뢰 가능.

```bash
curl -s 'https://bpmedia.net/api/version' | python3 -m json.tool
```

`scripts/post_deploy_check.sh`도 apex를 BASE_URL 기본값(`https://bpmedia.net`)으로 사용 중.

## 8 `homepage_issues` 자동 보고 severity 표준

| 코드 | severity | 사용자 영향 |
|---|---|---|
| `home_initial_fetch_failed` | high | 첫 로드 차단 |
| `home_client_runtime_error` | high | JS 깨짐 |
| `home_latest_refresh_failed` | **low** | 배경 새로고침만, 자연 복구 |
| `admin_client_runtime_error` | high | 운영자 작업 차단 |
| `admin_client_promise_rejection` | medium | 일부 비동기만 실패 |
| `admin_client_api_error` | medium | 운영자만 |

원칙: **사용자가 새로고침으로 복구 가능한 백그라운드 이벤트는 `low`**. 새 보고 코드 추가 시 이 표를 갱신.

## 9 버전·자산 동기화 4곳

`./scripts/sync_versions.sh` 실행 시 갱신되는 파일들:
1. `js/main.js` — `GW.APP_VERSION` / `GW.ADMIN_VERSION` / `GW.ASSET_VERSION`
2. 모든 공개 HTML + `admin.html` + `kms.html` — `?v=<ASSET_VERSION>` 토큰
3. `js/admin-v3.js` — `Version: <ADMIN_VERSION>` 주석
4. `functions/_shared/build-version.js` — `/api/version` 응답 (사용자 새 빌드 알림 배너)

새 버전 배포 시 사용자에게 알림이 자동 표시됨 (00.135.00+). 신규 운영 자산(HTML/JS)을 추가하면 sync_versions.sh의 perl 라인에도 등록 필요.

## 10 변경 배치 vs 분할 배포

각 배포 = preflight ~30s + wrangler deploy ~30s + post-deploy check ~30s ≈ 1.5분. 관련 변경은 **한 커밋으로 모아서 1회 deploy**. 사용자 검증이 필요한 큰 변경만 단계별 분할.

이번 세션(03.109.00 → 03.111.00, 5회 배포)은 사용자 incremental 요청 때문에 분할했지만, 단일 작업이라면 1회면 충분했을 변경량.

## 11 시간대 처리 (재확인)

- `homepage_issues.created_at / occurred_at / updated_at` **= UTC 저장값**
- 사용자가 KST 시각을 말하면 -9시간 변환 후 D1 쿼리
- changelog `released_at`은 **KST**로 기록 (`TZ='Asia/Seoul' date '+%Y-%m-%d %H:%M:%S KST'`)

## 12 P0 점검 시 transient 패턴 구분

`homepage_issues` `severity=high status=open` 이라도 `occurrence_count <= 2` + `reporter = system:auto-home` + `summary = Load failed` 단일 메시지면 **일시 네트워크 단절** 가능성이 높다 (CLAUDE.md §0 Step 1 단서). 5분 디듀프 윈도우 (00.135.00+)로 이 패턴 추가 억제.
