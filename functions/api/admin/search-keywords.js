import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRangeRust, analyticsRangeMeta, shiftAnalyticsDate } from '../../_shared/admin-analytics-range.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * GET /api/admin/search-keywords
 *
 * site_visits의 검색엔진 유입을 집계하고, referer URL에 남은 검색어만 추출한다.
 * 기간: ?days=30 (기본 30, 최대 365) 또는 ?start=YYYY-MM-DD&end=YYYY-MM-DD.
 *
 * 반환:
 *   {
 *     range: { start, end, days },
 *     total_visits:        <검색엔진 유입 기록>,
 *     known_visits:        <검색어가 확인된 기록>,
 *     hidden_visits:       <검색어가 제공되지 않은 기록>,
 *     total_unique:        <고유 검색어 개수>,
 *     by_engine:           [{ engine, visits }],
 *     keywords:            [{ keyword, engine, visits }],  // 상위 100
 *   }
 *
 * 주의: 검색엔진 호스트는 referrer_host에서도 식별한다.
 *       검색어 길이 2자 미만·100자 초과는 노이즈 필터.
 */

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'analytics-visits', 'view'); if (__gate) return __gate
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const url = new URL(request.url);
  let applied;
  try { applied = await resolveAdminAnalyticsRangeRust(url.searchParams, env); }
  catch (err) { return json({ error: err.message }, 400); }
  const custom = !!(url.searchParams.get('start') || url.searchParams.get('end'));
  const range = { ...analyticsRangeMeta(applied), start: custom ? applied.startDate : null, end: custom ? applied.endDate : null,
    days: custom ? null : applied.days, effective_days: applied.days };
  const limit = Math.max(10, Math.min(500, Number(url.searchParams.get('limit')) || 100));

  try {
    const response = await queryRust({request, env}, 'search-referrers', {
      start:applied.startDate, end:shiftAnalyticsDate(applied.endDate, 1),
    });
    if (!response.ok) throw new Error('Rust search referrer query failed');
    const { rows: results } = await response.json();

    const summary = await queryRust({request, env}, 'search-keywords-summary', {rows:results, limit});
    if (!summary.ok) throw new Error('Rust search keyword summary failed');
    return json({range, ...await summary.json()});
  } catch (err) {
    console.error('GET /api/admin/search-keywords error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}
