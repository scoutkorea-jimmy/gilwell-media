import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * GET /api/admin/ai-usage
 *
 * Workers AI 호출 로그 집계. 관리자 패널 AI 사용량 배너가 소비한다.
 * 모든 집계는 ai_usage_log 테이블 기준.
 *
 * 응답:
 *   { today, week, month, byEndpoint[], byDay[], recent[], model }
 *
 * 주의: 집계는 내부 로그 기반이라 Cloudflare 빌링 neuron 단위와 정확히 일치하지 않는다.
 *       정확한 비용은 Cloudflare 대시보드 Workers AI 페이지 참조.
 */
export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const nowSec    = Math.floor(Date.now() / 1000);
  const dayAgo    = nowSec -  86400;
  const weekAgo   = nowSec -  86400 * 7;
  const monthAgo  = nowSec -  86400 * 30;

  try {
    const aggStmt = `
      SELECT
        COUNT(*)                                                AS calls,
        SUM(CASE WHEN status='success' THEN 1 ELSE 0 END)       AS success,
        SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END)       AS errors,
        COALESCE(SUM(input_chars), 0)                            AS input_chars,
        COALESCE(SUM(output_chars), 0)                           AS output_chars,
        COALESCE(SUM(prompt_tokens), 0)                          AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)                      AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)                           AS total_tokens,
        COALESCE(AVG(latency_ms), 0)                             AS avg_latency_ms
      FROM ai_usage_log
      WHERE created_at >= ?
    `;

    const [today, week, month, byEndpoint, byDay, recent] = await Promise.all([
      env.DB.prepare(aggStmt).bind(dayAgo).first(),
      env.DB.prepare(aggStmt).bind(weekAgo).first(),
      env.DB.prepare(aggStmt).bind(monthAgo).first(),
      env.DB.prepare(`
        SELECT endpoint, COUNT(*) AS calls,
               COALESCE(SUM(total_tokens), 0) AS total_tokens,
               COALESCE(SUM(input_chars + output_chars), 0) AS chars
        FROM ai_usage_log
        WHERE created_at >= ?
        GROUP BY endpoint
        ORDER BY calls DESC
      `).bind(monthAgo).all().then((r) => r.results || []),
      env.DB.prepare(`
        SELECT strftime('%Y-%m-%d', datetime(created_at, 'unixepoch', '+9 hours')) AS date,
               COUNT(*) AS calls,
               COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_log
        WHERE created_at >= ?
        GROUP BY date
        ORDER BY date ASC
      `).bind(nowSec - 86400 * 14).all().then((r) => r.results || []),
      env.DB.prepare(`
        SELECT id, created_at, endpoint, model, status, error_code,
               input_chars, output_chars, total_tokens, latency_ms
        FROM ai_usage_log
        ORDER BY created_at DESC
        LIMIT 20
      `).all().then((r) => r.results || []),
    ]);

    return json({
      today,
      week,
      month,
      byEndpoint,
      byDay,
      recent,
      pricing: {
        model: '@cf/meta/llama-3.1-8b-instruct',
        note: 'Cloudflare Workers AI는 neuron 단위로 청구됩니다. 정확한 비용은 Cloudflare 대시보드 참조.',
        dashboardUrl: 'https://dash.cloudflare.com/?to=/:account/ai/overview',
      },
      generated_at: nowSec,
    });
  } catch (err) {
    return json({ error: 'DB 오류', detail: String((err && err.message) || err) }, 500);
  }
}
