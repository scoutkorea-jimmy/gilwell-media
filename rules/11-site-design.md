---
tags: [ai-guide, rules, site, design, accessibility]
aliases: [Design Rules, Color Palette, 디자인 규칙, 접근성]
scope: project
---

# 11 · [Site] 디자인 · 컬러 · 접근성

> [!abstract] Scope
> 공개 사이트의 서체·버튼·레이아웃 규칙과 브랜드 팔레트, WCAG 3.0 APCA 명암비 기준.
> 색/서체/간격을 건드리는 모든 작업에서 [10-site.md](10-site.md) 와 함께 읽는다.

## Design Rules

- 기본 서체: `NixgonFont` (3중량 300 Light / 500 Medium / 700 Bold, `@font-face`는 `css/style.css` 최상단). 본문 기본 `font-weight: 500`, 제목·강조는 `700`, 메타·장식은 `300`
- 공개 메뉴: `data-managed-nav` — 초기 숨김 → 렌더 완료 후 노출 (flash 방지)
- 버튼: 같은 계층이면 높이/패딩/폰트 통일
- 한글: `word-break: keep-all`
- 모바일: 가로 스크롤 금지

> [!tip] Design Guide
> KMS 디자인 탭 = 시각적 레퍼런스. 새 디자인 추가 시 KMS + Module Inventory + 이 문서 함께 갱신.

## Color Palette & Accessibility (WCAG 3.0 APCA)

**브랜드 팔레트 (10색)** — Canvas White 배경 기준 APCA Lc

| 이름 | HEX | White Lc | 용도 |
|---|---|---|---|
| Midnight Purple | `#4D006E` | 100.2 | ✅ 본문 텍스트 / 다크 배경 |
| Scouting Purple | `#622599` | 92.4 | ✅ 본문 텍스트 / 주 브랜드 배경 |
| Forest Green | `#248737` | 73.0 | ✅ 콘텐츠 텍스트 / 성공 상태 |
| Ocean Blue | `#0094B4` | 64.3 | ✅ 콘텐츠·UI (Lc 60+) |
| Fire Red | `#FF5655` | 58.9 | ⚠ 대형·헤더·UI만 (Lc 45+) / 경고 |
| Canvas White | `#FFFFFF` | — | 기본 배경 |
| Blossom Pink | `#FF8DFF` | 40.0 | ⚠ UI·spot 전용 (본문 금지) |
| Ember Orange | `#FFAE80` | 35.1 | ⚠ UI·spot 전용 (본문 금지) |
| River Blue | `#82E6DE` | 23.6 | ❌ spot 전용 (본문·UI 모두 부족) |
| Leaf Green | `#9FED8F` | 21.0 | ❌ spot 전용 (본문·UI 모두 부족) |

**그레이스케일 (5단계, Black = `#030303` 기반)**

| 토큰 | HEX | White Lc | 용도 |
|---|---|---|---|
| `--gray-900` (= `--black`) | `#030303` | 107.7 | 최대 대비 emphasis |
| `--gray-700` | `#3F3F3F` | 96.2 | 보조 텍스트·아이콘 |
| `--gray-500` | `#8F8F8F` | 61.3 | 콘텐츠·UI 테두리 |
| `--gray-300` | `#C4C4C4` | 33.5 | UI·구분선 (텍스트 금지) |
| `--gray-100` | `#EBEBEB` | 11.1 | 섹션 배경·tint (본문 금지) |

본문 기본은 `--ink`(#1F1F1F, Lc 105.1). RGB/CMYK/PMS 풀표와 배경-텍스트 조합 표는 KMS `3.4 브랜드 컬러 팔레트 및 웹 접근성 원칙` 참조.

**WCAG 3.0 APCA Lc 기준 (프로젝트 공식 명암비 알고리즘):**
- 본문 텍스트(15px+ / 400wt): **|Lc| 75+** 필수, 핵심 표면 90+ 권장
- 콘텐츠 텍스트(14px+ medium): **|Lc| 60+**
- 대형·헤더(18px bold / 24px+): **|Lc| 45+**
- UI·테두리·아이콘·포커스: **|Lc| 30+**
- WCAG 2.1의 4.5:1·3:1 비율 체계는 사용하지 않음 (지각 기반 Lc로 대체)

**색상 선택 원칙:**

1. **색상만으로 정보 전달 금지** — 에러/성공/경고/링크는 색 + 아이콘 + 텍스트 3중 표기. 색각이상자·그레이스케일 모드에서도 구분 가능해야 함.
2. **파스텔 4색(Blossom Pink / Ember Orange / River Blue / Leaf Green)은 본문 텍스트 금지** — 카테고리 태그 배경, 일러스트 전용. 그 위 텍스트는 Midnight Purple 또는 Black.
3. **Fire Red · Ocean Blue는 본문 불가** — 18px bold 이상 헤딩, 버튼 라벨, 아이콘, 테두리에만 (|Lc| 45+/60+).
4. **리터럴 HEX 금지** — 모두 CSS 변수로만 참조 (`var(--color-scouting-purple)`, `var(--gray-700)` 등). 토큰은 `css/style.css` `:root`. 새 색 추가 시 KMS + Module Inventory + `:root` 동시 갱신.
5. **키보드 포커스 인디케이터 필수** — 배경과 `|Lc| 30` 이상 (`outline` 또는 `box-shadow`). 기본 outline 제거 시 대체 표시 필수.
6. **다크/고대비 모드 대응** — `prefers-color-scheme: dark`, `prefers-contrast: more`에서도 Lc 유지.

**검증 (새 UI·색 적용 시):**

- [ ] APCA Contrast Calculator(`https://apcacontrast.com/`)로 모든 텍스트-배경 조합 Lc 검증
- [ ] Chrome DevTools → Rendering → Emulate vision deficiencies (Protanopia / Deuteranopia / Tritanopia / Achromatopsia) 통과
- [ ] 그레이스케일 모드에서 상태·링크·에러가 구분되는지 확인
- [ ] 포커스 인디케이터가 배경과 |Lc| 30 이상인지 확인
- [ ] 모바일 반투명 배경 처리 시 대비 저하 주의
