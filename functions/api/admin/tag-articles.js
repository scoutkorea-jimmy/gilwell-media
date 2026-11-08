import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRangeRust, analyticsRangeMeta } from '../../_shared/admin-analytics-range.js';
import { queryTagAnalysisPosts } from '../../_shared/admin-tag-analysis.js';

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'analytics-tags', 'view');
  if (gate) return gate;
  const params = new URL(request.url).searchParams;
  const tag = String(params.get('tag') || '').trim();
  if (!tag || tag.length > 500) return json({ error: '조회할 메타 태그를 입력해주세요.' }, 400);
  let range;
  try { range = await resolveAdminAnalyticsRangeRust(params, env, { allowAll: true, defaultAll: true }); }
  catch (err) { return json({ error: err.message }, 400); }
  try {
    const result = await queryTagAnalysisPosts(env, range, tag, {limit:params.get('limit'),page:params.get('page')});
    return json({ ...result, range: analyticsRangeMeta(range), population: 'published_exact_meta_tag' });
  } catch (err) {
    console.error('GET /api/admin/tag-articles error:', err);
    return json({ error: '관련 기사를 불러오지 못했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
