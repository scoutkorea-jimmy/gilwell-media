import { queryRust } from './rust-server.js';

/**
 * 홈 '에디터 추천' · '인기 소식' 산출 (2026-07-22)
 *
 * 두 레일은 서로를 알아야 한다 — 인기 소식은 에디터 추천에 이미 뽑힌 기사를
 * 제외한다. 그래서 한 곳에서 함께 계산한다.
 *
 * ── 에디터 추천 ──────────────────────────────────────────────
 *   최근 30일 페이지뷰 상위. 조회 기록이 없으면 최신 공개글로 채운다.
 *
 * ── 인기 소식 (시간 감쇠 점수) ───────────────────────────────
 *   score = v7×3 + v8_14×1 − v_older_30d×0.05
 *
 *   · 최근 7일 조회에 가점(×3)을 주고, 8~14일은 기본(×1)
 *   · 30일보다 오래된 조회는 **감점**(−0.05) — 누적 조회수가 많은 옛 기사가
 *     인기 레일을 영구 점유하는 것을 막는다
 *   · 15~30일 구간은 가점도 감점도 없는 중립 구간
 *
 *   왜 감점이 필요한가: 실측(2026-07-22) 30일 이전 조회가 15,919건으로 최근
 *   7일(1,327건)의 12배다. 감쇠 없이 누적 조회수로 줄 세우면 몇 달 전 기사가
 *   영원히 상위를 차지한다.
 *
 * 쿼리는 2회다 — (1) 전체 공개글의 구간별 조회수 집계(가벼움, content 미포함),
 * (2) 실제로 뽑힌 소수 기사만 카드 컬럼 조회. 이전 구조(추천 1회 + 인기 1회)와
 * 왕복 횟수가 같으면서 두 레일의 중복을 없앨 수 있다.
 */

/** 인기 점수 가중치 — 바꿀 때는 이 상수만 손대면 된다 */
export const POPULAR_WEIGHTS = {
  recent7: 3,      // 최근 7일 조회 가점
  days8to14: 1,    // 8~14일 기본
  olderThan30: -0.05, // 30일 이전 조회 감점
};

/**
 * @returns {{ pickIds: number[], popularIds: number[] }}
 */
export async function selectHomeRailIds(env, limit = 4) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-rails', {
    limit, weights: POPULAR_WEIGHTS,
  });
  if (!rust.ok) throw new Error('Rust home rails query failed');
  return rust.json();
}

/**
 * id 목록 순서를 그대로 유지해 카드 데이터를 붙인다.
 * @param {(row:any)=>any} serialize  행 → 카드 객체 변환기 (호출부 규약이 달라 주입받는다)
 */
export async function hydrateByIds(env, ids, columns, serialize, card = false, origin) {
  if (!ids.length) return [];
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-hydrate', { ids, columns, card, origin });
  if (!rust.ok) throw new Error('Rust home card hydration query failed');
  const { posts: results } = await rust.json();
  const byId = new Map((results || []).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map(serialize);
}
