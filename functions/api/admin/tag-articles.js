import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRange, analyticsRangeMeta } from '../../_shared/admin-analytics-range.js';
import { queryTagAnalysisPosts } from '../../_shared/admin-tag-analysis.js';
import { splitCommaTokens } from '../../_shared/tag-insights.js';

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'analytics-tags', 'view');
  if (gate) return gate;
  const params = new URL(request.url).searchParams;
  const tag = String(params.get('tag') || '').trim();
  if (!tag || tag.length > 500) return json({ error: '조회할 메타 태그를 입력해주세요.' }, 400);
  let range;
  try { range = resolveAdminAnalyticsRange(params, { allowAll: true, defaultAll: true }); }
  catch (err) { return json({ error: err.message }, 400); }
  try {
    const matches = (await queryTagAnalysisPosts(env, range, tag)).filter(row => splitCommaTokens(row.meta_tags).includes(tag));
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 20));
    const totalPages = Math.max(1, Math.ceil(matches.length / limit));
    const page = Math.min(totalPages, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
    return json({ posts: matches.slice((page - 1) * limit, page * limit), total: matches.length, page, limit, range: analyticsRangeMeta(range), population: 'published_exact_meta_tag' });
  } catch (err) {
    console.error('GET /api/admin/tag-articles error:', err);
    return json({ error: '관련 기사를 불러오지 못했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
