import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { buildTagInsights } from '../../_shared/tag-insights.js';
import { resolveAdminAnalyticsRange, analyticsRangeMeta } from '../../_shared/admin-analytics-range.js';
import { queryTagAnalysisPosts } from '../../_shared/admin-tag-analysis.js';

/**
 * GET /api/admin/tag-insights
 *
 * 태그 인사이트 전면 분석 API. 관리자 패널 panel-analytics-tags가 소비한다.
 * 파라미터:
 *   - days=N (1~180, KST 날짜 경계; 기본 전체 범위)
 *   - start=YYYY-MM-DD&end=YYYY-MM-DD (커스텀, §3.11 v3-period-bar 규약)
 *   - all=1 (전체 기간, 기본)
 * 반환: functions/_shared/tag-insights.js buildTagInsights() 결과.
 *
 * 주의:
 *  - 분석 자체는 published=1 기사에 한정.
 *  - 태그 이름 원문 보존. 자동 통합/삭제 없음.
 */
export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'analytics-tags', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  let range;
  try { range = resolveAdminAnalyticsRange(url.searchParams, { allowAll: true, defaultAll: true }); }
  catch (err) { return json({ error: err.message }, 400); }

  try {
    const insights = buildTagInsights(await queryTagAnalysisPosts(env, range));
    return json({ ...insights, range: analyticsRangeMeta(range), population: 'published_exact_meta_tag' }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('GET /api/admin/tag-insights error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
