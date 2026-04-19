import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { buildTagInsights } from '../../_shared/tag-insights.js';

/**
 * GET /api/admin/tag-insights
 *
 * 태그 인사이트 전면 분석 API. 관리자 패널 panel-analytics-tags가 소비한다.
 * 파라미터:
 *   - days=N (1~365, 기본 전체 범위)
 *   - start=YYYY-MM-DD&end=YYYY-MM-DD (커스텀, §3.11 v3-period-bar 규약)
 *   - all=1 (전체 기간, 기본)
 * 반환: functions/_shared/tag-insights.js buildTagInsights() 결과.
 *
 * 주의:
 *  - 분석 자체는 published=1 기사에 한정.
 *  - 태그 이름 원문 보존. 자동 통합/삭제 없음.
 */
export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get('start');
  const endParam   = url.searchParams.get('end');
  const allFlag    = url.searchParams.get('all') === '1';
  const daysParam  = url.searchParams.get('days');

  let sql = `SELECT id, category, title, tag, meta_tags, special_feature, published, publish_at, created_at, updated_at, views
             FROM posts
             WHERE published = 1`;
  const args = [];

  if (!allFlag) {
    if (startParam || endParam) {
      if (startParam) {
        sql += ` AND date(COALESCE(publish_at, created_at)) >= date(?)`;
        args.push(startParam);
      }
      if (endParam) {
        sql += ` AND date(COALESCE(publish_at, created_at)) <= date(?)`;
        args.push(endParam);
      }
    } else if (daysParam) {
      const days = Math.max(1, Math.min(365, Number(daysParam) || 30));
      sql += ` AND datetime(COALESCE(publish_at, created_at)) >= datetime(?, ?)`;
      args.push('now', '-' + days + ' days');
    }
    // 파라미터 없으면 전체(= all) 로 fallback
  }
  sql += ` ORDER BY id ASC`;

  try {
    const stmt = env.DB.prepare(sql);
    const { results } = await (args.length ? stmt.bind(...args).all() : stmt.all());
    const insights = buildTagInsights(results || []);
    return json(insights, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('GET /api/admin/tag-insights error:', err);
    return json({ error: 'Database error', detail: String(err && err.message || err) }, 500);
  }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
