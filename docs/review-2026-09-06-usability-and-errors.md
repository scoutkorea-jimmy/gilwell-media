---
tags: [review, incident, stability, site, homepage]
aliases: [2026-09 사용성·오류 검토, D1 과부하 검토]
scope: project
status: 보고서 (조사 완료 · 수정 미착수)
target: Site
created: 2026-09-06
---

# 사용성·오류 검토 보고서 — 2026-08-06 ~ 2026-09-06

> [!important] 이 문서는 **조사 결과와 수정 계획**이다. 코드 수정·배포는 하지 않았다.
> 작성 시점 기준 `VERSION` = `00.183.00`, `HEAD` = `541bf1cf`.
> 수정 착수 시 [rules/00-target-protocol.md](../rules/00-target-protocol.md) 부터 다시 밟을 것.

## 0. 한 줄 요약

최근 한 달 오류 9건 중 **8건이 2026-09-01 09:53 KST 단 한 순간의 D1 일시 과부하** 하나에서 나왔다.
문제는 과부하 자체가 아니라 **그 뒤에 붙은 다섯 개의 증폭·고착 장치**다. 그것을 그대로 두면 다음 과부하 때 똑같이 재현된다.

---

## 1. 집계 — 무엇이 얼마나 났나

### 1.1 오류 기록 (`homepage_issues`, 최근 30일)

| id | 심각도 | 상태 | 제목 | 발생횟수 | 최종 관측(UTC) |
|---|---|---|---|---|---|
| 42 | high | open | 홈 히어로 로드 실패 | 2 | 2026-09-01 00:53:28 |
| 44 | high | open | 홈 메인 스토리 로드 실패 | 1 | 2026-09-01 00:53:28 |
| 45 | high | open | 홈 최신 소식 로드 실패 | 1 | 2026-09-01 00:53:28 |
| 40 | medium | open | 홈 APR 섹션 로드 실패 | 2 | 2026-09-01 00:53:28 |
| 41 | medium | open | 홈 Scout People 섹션 로드 실패 | 2 | 2026-09-01 00:53:28 |
| 43 | medium | open | 홈 통계 로드 실패 | 1 | 2026-09-01 00:53:28 |
| 46 | low | open | 홈 티커 로드 실패 | 1 | 2026-09-01 00:53:28 |
| 39 | low | monitoring | 홈 백그라운드 새로고침 실패 | 1 | 2026-09-01 00:53:04 |
| 38 | medium | monitoring | 홈 비동기 처리 오류 (`unhandledrejection`) | 1 | 2026-08-17 10:05:05 |

- **#40~46 (7건) 의 `cause` 가 글자 하나까지 동일**하다:
  `D1_ERROR: D1 DB is overloaded. Requests queued for too long.`
- #39 는 같은 사건의 **클라이언트 쪽 그림자**다(00:53:04, `/api/home` `Load failed`). 서버 기록보다 24초 앞선다.
- 실질 독립 사건은 **2건뿐** — ① 09-01 D1 과부하, ② 08-17 `unhandledrejection` 1회.
- KST 환산: `2026-09-01 00:53 UTC` = **2026-09-01 09:53 KST**. (`homepage_issues` 의 시각 컬럼은 UTC 저장 — 규칙 00 Step 1)

### 1.2 운영 이벤트 (`operational_events`, 2026-08-06~)

| level | type | 건수 |
|---|---|---|
| info | admin_login_success | 32 |
| info | post_created | 26 |
| info | post_updated | 7 |
| info | settings_change | 4 |
| warn | admin_login_failed | 1 |
| warn | dreampath_login_failed | 1 |
| warn | homepage_issue_report | 1 |
| info | dreampath_login_success | 1 |
| **error** | — | **0** |

> [!warning] 관측 공백 — 09-01 사건이 `operational_events` 에 `error` 로 한 줄도 남지 않았다
> `homepage_issues` 에는 7건이 찍혔는데 운영 로그에는 `warn/homepage_issue_report` 1건뿐이다.
> `recordHomeSectionIssue` 경로가 `logApiError` 를 부르지 않기 때문이다(전체 실패 경로만 부른다).
> **두 장부가 같은 사건을 다르게 기록한다** — 한쪽만 보면 사건 규모를 잘못 읽는다.

### 1.3 코드 변경 (최근 한 달)

```
541bf1cf 2026-08-27 feat(site): 기록·편집 크레딧 전 페이지 노출 + 인물 엔티티 연결 (00.183.00)
f342fa54 2026-08-27 feat(site): 운영 주체 영문명 병기 + 전 기사 meta_tags 에 매체명 추가 (00.182.02)
3d71114c 2026-08-27 fix(seo): 당일 기사 뉴스 사이트맵 누락 + 메타·robots·구조화데이터 7건 (00.182.01)
02bf84ef 2026-08-24 feat(site,admin): 메인 스토리 자동 선정 (00.182.00 / 03.153.00)
32d2206c 2026-08-24 feat(site): 잼버리 특별관 히어로 배경 (00.181.01)
299b586e 2026-08-24 feat(site): 제16회 한국잼버리 특별관 갤러리 (00.181.00)
```

- 09-01 사건은 **마지막 배포(08-27)로부터 5일 뒤**에 났다. 배포 회귀가 아니라 **부하 사건**이다.
- 08-27 이후 코드 변경 없음. 즉 이 보고서가 다루는 문제는 지금도 그대로 살아 있다.

### 1.4 누적 관점

`homepage_issues` 전체 46건(2026-04-10 ~ 2026-09-01) 중 37건 `resolved`. 장부는 실제로 굴러가고 있다.
**남은 미해결 7건이 전부 09-01 한 사건** — 즉 평소엔 잘 닫는데, 이번 것만 닫히지 않았다.

---

## 2. 근본 원인 — 왜 한 번의 과부하가 7건이 되고 5일째 남아 있나

### 원인 1 — 오류 처리 경로가 과부하를 스스로 증폭한다 (치명)

[`functions/api/home.js:96-103`](../functions/api/home.js#L96-L103) 의 `resolveSection` 은 섹션이 실패할 때마다
`recordHomeSectionIssue()` → [`functions/_shared/homepage-issues.js:112`](../functions/_shared/homepage-issues.js#L112) `recordHomepageIssue()` 를 부른다.
그런데 `recordHomepageIssue` 는 **호출마다** `ensureHomepageIssuesTable(env)` 를 실행한다:

| 문장 | 출처 |
|---|---|
| `CREATE TABLE IF NOT EXISTS homepage_issues …` | `ensureHomepageIssuesTable` |
| `PRAGMA table_info(homepage_issues)` | `listHomepageIssueColumns` |
| `CREATE INDEX IF NOT EXISTS idx_homepage_issues_status_updated` | 〃 |
| `CREATE INDEX IF NOT EXISTS idx_homepage_issues_severity_updated` | 〃 |
| `SELECT … WHERE title=? AND issue_type=? AND area=? …` | 중복 판정 |
| `UPDATE homepage_issues SET …` (또는 `INSERT`) | 기록 |
| `SELECT * FROM homepage_issues WHERE id=?` | 기록 후 재조회 |

**= 이슈 1건당 D1 문장 7개.**
09-01 에는 섹션 7개가 동시에 실패했으므로 **이미 큐가 꽉 찬 D1 에 약 49개의 문장을 더 던졌다.**

> **D1 이 밀릴수록 홈이 더 많은 쓰기를 D1 에 던지는 양(+)의 피드백 고리다.**
> 오류가 커질수록 오류 처리 비용이 커지는 구조라, 한 번 임계를 넘으면 스스로 회복하기 어렵다.

### 원인 2 — 일시적(transient) D1 오류에 재시도가 아예 없다

`functions/` 전체에서 백오프 재시도를 하는 곳은 `functions/api/admin/login.js` 하나뿐이다.
`D1 DB is overloaded. Requests queued for too long.` 은 수십~수백 ms 뒤 재시도하면 대개 통과하는 **대표적 일시 오류**인데,
현재 코드는 **첫 실패에 즉시** fallback + 이슈 기록으로 떨어진다.

즉 "잠깐 붐볐다"가 곧바로 "high 등급 장애 3건"으로 승격된다.

### 원인 3 — 요청 1건당 D1 팬아웃이 무제한이다

[`functions/api/home.js:110-165`](../functions/api/home.js#L110-L165) 는 16개 섹션을 `Promise.all` 로 한꺼번에 던진다. 각 섹션 안에도 다시 병렬 쿼리가 있다.

| 로더 | D1 문장 수 | 비고 |
|---|---|---|
| `loadStats` | 5 | 카테고리별 `COUNT(*)` 4 + 오늘자 1 |
| `loadHero` | 3 + N | settings 3 + 수동 히어로 N건을 **직렬 루프**로 1건씩 |
| `loadHomeLead` | 3 | settings 2 + 글 1 |
| `loadFooterAnalytics` | 2 | `site_visits` **풀스캔 2회** |
| `loadRails` | 2+ | `home-rails.js` |
| `loadTicker` / `loadTranslations` / `loadSiteMeta` / `loadNavLabels` | 각 1 | |
| `loadActiveHomeBanners` | 2 | |
| `loadPostList` ×4 (korea/apr/wosm/people) | 4 | |
| `loadLatestPosts` | 1 | |

`home.js` 안에서만 `DB.prepare` 가 **20곳**, 여기에 `_shared` 로더가 더해진다.
**응답 헤더는 `Cache-Control: no-store`** — HTTP 캐시가 없으므로 **방문 1건마다 이 비용을 그대로 치른다.**

게다가 홈 HTML 자체(SSR, [`functions/[[path]].js`](../functions/[[path]].js), `DB.prepare` 11곳)도 D1 을 친다.
**홈 1회 방문 = SSR 쿼리 + `/api/home` 쿼리** 두 벌. 동시 접속이 몇 겹만 겹쳐도 큐가 찬다.

- 참고: `loadStats` 의 4개 `COUNT(*)` 는 `GROUP BY category` 한 문장으로 줄일 수 있다(5 → 2).
- `loadManualHeroPosts` 의 직렬 `for` 루프는 `IN (?, ?)` 한 문장으로 줄일 수 있다.
- `loadFooterAnalytics` 의 `site_visits` 풀스캔 2회는 방문 수에 비례해 무거워진다(현재 DB 23MB).

### 원인 4 — 레일 메모이즈가 요청 범위가 아니라 **isolate 범위**다 (별건 버그)

```js
// functions/api/home.js:440
function loadRails(env, origin) {
  if (!env.__homeRailsPromise) {
    env.__homeRailsPromise = (async () => { ... })();
  }
  return env.__homeRailsPromise;
}
```

같은 패턴이 [`functions/[[path]].js:463`](../functions/[[path]].js#L463) `env.__ssrRailsPromise` 에도 있다.

주석은 "요청 안에서 한 번만 계산"이라고 적혀 있지만, **Cloudflare Workers 의 `env` 는 isolate 안의 모든 요청이 공유하는 객체**다.
`resolveSection` 이 `popular`·`picks` 두 번 부르는 것을 막으려던 의도는 맞지만 **저장 위치가 틀렸다.** 결과:

| # | 결과 | 성격 |
|---|---|---|
| (a) | 추천·인기 레일이 isolate 재활용 전까지 **갱신되지 않는다** — 운영자가 픽을 바꿔도 즉시 반영 안 됨 | 확인된 동작 |
| (b) | **거부된 promise 도 그대로 캐시된다** — 레일 계산이 한 번 실패하면 그 isolate 로 들어오는 이후 모든 요청이 같은 rejection 을 재사용해 picks/popular 가 isolate 수명 내내 실패 | 잠재 결함 (09-01 에는 picks/popular 가 실패 목록에 없어 **실제 발현은 미확인**) |
| (c) | `origin` 이 최초 요청 값으로 고정 — 프리뷰 도메인·커스텀 도메인이 섞이면 이미지 URL 이 다른 origin 을 가리킨다 | 잠재 결함 |

(b) 는 정확히 **"동일 오류가 계속 재발"** 하는 형태다. 이번엔 안 터졌을 뿐, 구조는 그대로 놓여 있다.

### 원인 5 — 회복해도 이슈가 닫히지 않는다 → P0 게이트 영구 점거

- 09-01 이후 홈은 정상인데 **7건이 `open` 인 채 그대로**, 그중 3건이 `severity=high`.
- [rules/00-target-protocol.md](../rules/00-target-protocol.md) Step 1 은 `status IN ('open','monitoring') AND severity IN ('high','critical')` 이면 **신규 작업을 멈추라**고 규정한다.
- 즉 **일시 장애 1회가 5일째 P0 게이트를 막고 있다.** (이번 검토 세션에서 실제로 걸렸다.)
- `recordHomepageIssue` 에는 자동 회복(성공이 이어지면 닫기) 경로가 없다. 사람이 관리자 화면에서 손으로 닫아야만 풀린다.

**소음 문제도 같은 뿌리다** — 한 사건이 7행. `homepage_issues` 에 incident 묶음(그룹 키)이 없어 원인이 같은 실패도 제목별로 흩어진다.

---

## 3. 사용성 검토 — 방문자 체감은 어땠나

나쁘지 않았다. 이미 들어가 있는 방어가 실제로 일했다.

| 방어 | 위치 | 09-01 때 역할 |
|---|---|---|
| 섹션별 fallback | `resolveSection` | 홈 전체 500 대신 일부 섹션만 기본값으로 |
| SSR 선렌더 | `functions/[[path]].js` | `/api/home` 실패해도 기사 목록이 남음 |
| localStorage SWR | `home-runtime.js:598-608` | 직전 페이로드로 첫 페인트를 채움 |
| 실패 시 stale 유지 | `home-runtime.js:617` | 캐시로 그렸으면 오류 문구로 덮지 않음 |
| 이슈 리포트 dedup | `home-helpers.js:113-142` | 세션 + 5분 localStorage 쿨다운 |

- 회귀 테스트도 이미 있다 — `tests/smoke-home-resilience.spec.ts` 가 `/api/home` 을 죽인 채 nav·SSR 목록·통계를 검증한다.
- 사용자 대면 오류는 한 달간 #38 `unhandledrejection` **1건뿐**. 반복도 확산도 없었다.

> [!note] 결론
> **표면(사용성)은 이미 잘 막아 뒀다. 문제는 그 아래 — 실패를 겪은 뒤 "회복"과 "학습"이 없다는 것**이다.
> 지금 구조는 실패를 **잘 견디지만**, 실패에서 **잘 빠져나오지 못한다.**

### 3.1 남은 사용성 관찰 (낮은 우선순위)

- `home-runtime.js` 의 `renderLoadFailure()` 는 캐시가 없는 **첫 방문자**에게만 뜬다. 첫 방문 + 과부하가 겹치면 그 사람은 빈 홈을 본다 — 현재 재시도가 없으므로 새로고침 외에 회복 수단이 없다.
- 홈 통계가 `today: 0` 으로 fallback 되면 "오늘 0건"으로 **읽힌다** — 실패와 실제 0건을 화면에서 구분할 수 없다. (테스트는 `한국소식 0건` 만 본다.)
- `functions/api/home.js` 의 `scalar()`, `publicCacheHeaders()` 는 호출부가 없다(죽은 코드).

---

## 4. 권고 수정안

우선순위대로. **A·B·C 가 재발을 막는 본체**이고, D·E 는 게이트 정상화, F·G 는 같은 벽에 다시 안 부딪히기 위한 것이다.

### A. transient D1 재시도 도입 — `functions/_shared/d1-retry.js` (신규)

```
withD1Retry(fn, { attempts: 3, baseDelayMs: 60 })
  - isTransientD1Error(err): /overload|queued for too long|timed out|Network connection lost|storage operation/i
  - 지수 백오프 + jitter (60ms → 180ms). transient 가 아니면 즉시 throw.
```

`resolveSection(key, loader, fallback)` 이 `loader` 를 이 래퍼로 감싼다.
→ **"잠깐 붐빔"이 high 장애로 승격되지 않는다.** 원인 2 해소.

⚠ 주의: 재시도는 팬아웃을 늘린다. **원인 3(팬아웃 축소)과 반드시 같이** 가야 하고, 재시도 횟수는 보수적으로.

### B. 오류 경로 비용 절감 — `functions/_shared/homepage-issues.js`

1. `ensureHomepageIssuesTable` 을 **isolate 당 1회**로 (모듈 스코프 `let ensured = false`; 실패 시 플래그 되돌림).
2. 기록 직후 `SELECT * WHERE id=?` 재조회 제거 — 반환값을 안 쓰는 호출부(`recordHomeSectionIssue`)에는 `{ skipReadback: true }`.

→ 이슈 1건당 D1 문장 **7 → 2**. 7섹션 동시 실패 시 **49 → 14**. 원인 1 해소.

### C. 레일 메모를 요청 스코프로 — `home.js` + `[[path]].js`

`env.__homeRailsPromise` / `env.__ssrRailsPromise` 를 **`onRequestGet` 지역 변수**(또는 요청마다 새로 만드는 컨텍스트 객체)로 옮긴다.
→ (a) staleness · (b) rejection 캐시 · (c) origin 고정 세 가지가 한 번에 사라진다. 원인 4 해소.

> `functions/_shared/cache-purge.js:57` 의 `env.__PURGE_WARNED__` 는 **의도적으로** isolate 스코프(경고 1회)라 그대로 둔다.
> 판별 기준은 "요청마다 달라져야 하는 값인가" — 그렇다면 `env` 에 두면 안 된다.

### D. auto-reported 이슈 자동 회복

`reporter LIKE 'system:auto-%'` 이고 `last_seen_at` 이 **N일(권장 3일) 이상 재발하지 않은** `open` 건을 `resolved` 로 내린다.
성공 응답 경로에 D1 쓰기를 더하지 않도록 **기존 cron 에 붙이는 것을 권장** — `wrangler.alert-high-severity.toml` 이 이미 있다.
→ 원인 5 해소. 일시 장애가 영구 P0 로 굳지 않는다.

### E. 현재 열린 7건 정리

#40~46 을 `resolved` 로 내리고 `action_items` 에 이 보고서 경로를 남긴다. **단, A·B·C 를 적용한 뒤에** 닫는다 — 먼저 닫으면 원인이 남은 채 게이트만 열린다.

### F. 회귀 테스트 — 단위 테스트가 현재 0개다

`package.json` 의 `test` 는 Playwright(브라우저 E2E)뿐이라 **서버 로직을 잴 방법이 없다.**
`node:test` 기반 `tests/unit/` 을 신설하고 최소 3개:

1. `isTransientD1Error` 가 실제 D1 메시지를 transient 로 판정하는가 (그리고 `no such column` 은 아닌가).
2. `withD1Retry` 가 2회 실패 후 성공하면 성공을 돌려주는가 / non-transient 는 재시도하지 않는가.
3. 레일 로더가 **요청 2건에서 서로 다른 결과**를 계산하는가(= isolate 캐시가 없는가), 첫 요청이 실패해도 **두 번째 요청이 새로 시도**하는가.

> 3번이 이 보고서의 핵심 회귀다. **고친 것을 일부러 되돌려 실패하는지 확인할 것.**

### G. 규칙에 못 박기 — `rules/10-site.md`

- **"D1 호출은 transient 재시도 래퍼를 거친다."**
- **"`env` 에 요청 단위 상태를 저장하지 않는다 — `env` 는 isolate 공유 객체다."**
- **"오류 처리 경로는 정상 경로보다 무거우면 안 된다."**

세 줄이 없어서 같은 구조가 두 파일에 복제됐다.

---

## 5. 착수 시 체크리스트

- [ ] `rules/00` Step 0(git 동기화) → Step 1(P0) → 타겟 선언
- [ ] A·B·C 를 **각각 별도 커밋**으로 (한 번에 섞으면 무엇이 효과였는지 못 가린다)
- [ ] F 의 단위 테스트를 **수정 전에** 작성해 실패를 확인 (`superpowers:test-driven-development`)
- [ ] 팬아웃 축소(원인 3)는 A 와 같은 릴리즈에
- [ ] `VERSION` bump + `data/changelog.json` 엔트리 (규칙 02) — 배포 preflight 가 검증한다
- [ ] Site 배포는 **질문 후 진행** (CLAUDE.md)
- [ ] 배포 후 라이브 검증 → 그 다음에 E(이슈 닫기)

## 6. 조사에 쓴 근거

| 근거 | 출처 |
|---|---|
| 이슈 9건·원인 문자열 | `homepage_issues` 원격 D1 조회 (2026-09-06) |
| 운영 이벤트 집계 | `operational_events` 원격 D1 조회 |
| D1 문장 수 | `grep -c 'DB.prepare'` + 각 로더 코드 정독 |
| 커밋 이력 | `git log --since=2026-08-06` |
| 기존 방어 | `home-runtime.js`, `home-helpers.js`, `tests/smoke-home-resilience.spec.ts` 정독 |

**미검증으로 남긴 것** — 09-01 당시 실제 동시 접속 수와 Cloudflare Functions 로그(보존 기간 밖). 따라서 "무엇이 과부하를 촉발했는가"는 **모른다**. 이 보고서는 촉발 원인이 아니라 **촉발된 뒤의 증폭·고착 구조**를 다룬다.
