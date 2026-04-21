import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import {
  estimateLlamaTokens,
  estimateLlamaCostUsd,
  estimateLlamaCostKrw,
  LLAMA_PRICING,
} from '../../_shared/ai-usage.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function annotatePeriod(row) {
  if (!row) return { calls: 0, success: 0, errors: 0, input_chars: 0, output_chars: 0, total_tokens: 0, est_tokens: 0, est_usd: 0, est_krw: 0, avg_latency_ms: 0 };
  const recordedTokens = Number(row.total_tokens || 0);
  const charsTotal = Number(row.input_chars || 0) + Number(row.output_chars || 0);
  // total_tokens 컬럼이 이미 Llama 추정치로 채워져 있지만, 0인 과거 행(03.086.00 이전 없음)을 위해 fallback 한 번 더
  const effectiveTokens = recordedTokens > 0 ? recordedTokens : estimateLlamaTokens(charsTotal);
  return {
    calls: Number(row.calls || 0),
    success: Number(row.success || 0),
    errors: Number(row.errors || 0),
    input_chars: Number(row.input_chars || 0),
    output_chars: Number(row.output_chars || 0),
    total_tokens: recordedTokens,
    est_tokens: effectiveTokens,
    est_usd: estimateLlamaCostUsd(effectiveTokens),
    est_krw: estimateLlamaCostKrw(effectiveTokens),
    avg_latency_ms: Number(row.avg_latency_ms || 0),
  };
}

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
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
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
      today: annotatePeriod(today),
      week:  annotatePeriod(week),
      month: annotatePeriod(month),
      byEndpoint,
      byDay,
      recent,
      pricing: Object.assign({}, LLAMA_PRICING, {
        dashboardUrl: 'https://dash.cloudflare.com/?to=/:account/ai/overview',
      }),
      generated_at: nowSec,
    });
  } catch (err) {
    return json({ error: 'DB 오류', detail: String((err && err.message) || err) }, 500);
  }
}
