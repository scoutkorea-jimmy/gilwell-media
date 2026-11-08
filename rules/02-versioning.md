---
tags: [ai-guide, rules, common, versioning, changelog]
aliases: [Version Discipline, Changelog Rules, 버전 규칙]
scope: project
---

# 02 · Version & Changelog Discipline (Site / Admin / KMS)

> [!important] 모든 Site/Admin/KMS 배포에는 버전 bump + changelog 엔트리가 필수
> `verify_release_metadata.sh`가 배포 preflight에서 둘 다 검증한다. 하나라도 빠지면 배포가 차단된다.

## 버전 파일 3개

| 파일 | 포맷 | 의미 |
|---|---|---|
| `VERSION` | `aa.bbb.cc` (e.g. `00.113.22`) | 공개 사이트 버전 |
| `ADMIN_VERSION` | `dd.eee.ff` (e.g. `03.064.00`) | 관리자 / KMS 버전 |
| `ASSET_VERSION` | UTC timestamp `YYYYMMDDHHMMSS` | 캐시 버스트 토큰 (자동 생성) |

## Bump 규칙

- `aa`/`dd` (Major) — 오너 수동 결정, 제품 단계 전환 시
- `bbb`/`eee` (Feature/Update) — 새 기능, 구조적 리팩터, 모듈 신설. **bump 시 `cc`/`ff` = `00`으로 리셋**
- `cc`/`ff` (Fix/Hotfix) — 버그 수정, 소규모 조정

> [!tip] 자릿수 선택은 AI가 직접 판단
> 어느 자릿수를 올릴지 사용자에게 되묻지 않는다. 위 규칙(feature=`bbb`/`eee`, fix=`cc`/`ff`)대로 판단해 진행한다.

**언제 무엇을 bump하는가:**
- 공개 사이트(index, korea, apr, ...)의 UI·동작 변경 → `VERSION`
- 관리자 콘솔(`admin.html`, `js/admin-v3.js`, `css/admin.css`) 변경 → `ADMIN_VERSION`
- KMS 탭(`kms.html`, `js/kms.js`, `docs/feature-definition.md`) 변경 → `ADMIN_VERSION`
- 공통 인프라(배포 스크립트, 라이브러리) 변경 → 영향받는 쪽(들) bump
- 복합 변경은 둘 다 bump, changelog 엔트리도 각각 추가

## Changelog (data/changelog.json)

**엔트리 포맷** (`data/changelog.json` → `items[]` 맨 앞에 prepend) — **3섹션 구조 (2026-05-24+)**:

```json
{
  "version": "00.145.00",
  "date": "2026-05-24",
  "released_at": "2026-05-24 12:00:00 KST",
  "summary": "한 줄 요약 (왜 바꿨는지 중심).",
  "for_users": [
    "비개발자 관점 변경 1 — 무엇이 달라졌고 어떤 가치가 있는지, 방향성·진행사항 위주.",
    "비개발자 관점 변경 2."
  ],
  "for_developers": [
    "기술 상세 1 — 파일·함수·테이블·API·코드 컨텍스트.",
    "기술 상세 2.",
    "사이트 버전 00.144.00 → 00.145.00."
  ]
}
```

**필수 필드:**
- `version` — `VERSION` 또는 `ADMIN_VERSION` 문자열과 **정확히 일치** (v prefix 없이)
- `date` — `YYYY-MM-DD` (KST 기준)
- `released_at` — `YYYY-MM-DD HH:MM:SS KST`
- `summary` — 한국어 1문장. 비개발자도 이해 가능한 톤
- `for_users[]` — 비개발자용. 방향성·진행사항·UX 변경. 빈 배열이어도 키는 항상 포함
- `for_developers[]` — 개발자용. 파일·함수·DB·코드 디테일. **렌더러에서 `<details>` 로 기본 접힘**. 마지막 항목에 버전 번호 전이 명시

**작성 원칙:**
1. **두 독자를 분리** — `for_users` 는 "왜 / 무엇이 달라졌는지" 만 (파일명 금지), `for_developers` 는 "어디를 어떻게" (파일/함수/응답코드 포함)
2. **수치·이름 포함 (for_developers)** — 명암비, 변경된 파일 수, 비교 값 등 검증 가능한 지표
3. **버전 bump 둘 다면 엔트리도 둘** — 사이트·관리자 각각 독립된 엔트리 (같은 `released_at` 공유 OK)
4. **최신이 맨 위** — `items[]` 에 prepend. 기존 순서 보존
5. **legacy 엔트리는 그대로** — 03.117.00 이전 `changes[]` / `items[]` 엔트리는 수정하지 않음. 렌더러가 자동 fallback 처리
6. **들여쓰기 정확히 일치 + 추가 검증** — `items[]` 요소는 **2-space**(`  {`), 필드는 **4-space**(`    "version"`). Edit `old_string`을 다른 들여쓰기로 쓰면 매칭이 조용히 실패해 엔트리가 안 들어가고, `verify_release_metadata.sh`가 `Missing changelog entry`로 **모든 배포를 차단**한다. 추가 후 반드시 버전 문자열이 실제로 들어갔는지 확인(`grep` 또는 JSON 카운트). `JSON.parse` 통과 ≠ 엔트리 추가됨. (KMS 13.1.7 케이스)

**렌더러 위치:**
- 관리자 KMS 뷰: [js/admin-v3.js](../js/admin-v3.js) `_renderReleases`
- 공개 KMS 뷰: [js/kms.js](../js/kms.js) `renderChangelog`
