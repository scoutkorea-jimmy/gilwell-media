import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { LLAMA_PRICING } from '../../_shared/ai-usage.js';

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
  const __gate = await gateMenuAccess(request, env, 'article-scorer', 'view'); if (__gate) return __gate

  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  // 추이 차트용 일별 조회 기간.
  //   1순위: ?start=YYYY-MM-DD & ?end=YYYY-MM-DD (사용자 지정 범위, KST 자정 경계)
  //   2순위: ?days=N (기본 14, 1–365 클램프)
  const url = new URL(request.url);
  const {nowSec,dayAgo,weekAgo,monthAgo,chartFrom,chartTo,effectiveDays,rangeMode} = await resolveAiUsageRangeRust(url.searchParams, Math.floor(Date.now()/1000), env);

  try {
    const query = (kind, start, end) => queryRust({request, env}, 'analytics-ai-usage', {kind, start, end, pricing:LLAMA_PRICING})
      .then(response => { if (!response.ok) throw new Error('Rust AI usage query failed'); return response.json(); });
    const [today, week, month, byEndpoint, byDay, recent] = await Promise.all([
      query('period',dayAgo).then(data=>data.row),
      query('period',weekAgo).then(data=>data.row),
      query('period',monthAgo).then(data=>data.row),
      query('endpoints',monthAgo).then(data=>data.rows || []),
      query('days',chartFrom,chartTo).then(data=>data.rows || []),
      query('recent').then(data=>data.rows || []),
    ]);

    const response = await queryRust({request, env}, 'analytics-ai-usage-response', {
      today, week, month, byEndpoint, byDay, recent, chartDays:effectiveDays, rangeMode,
      chartFrom, chartTo, pricing:LLAMA_PRICING, nowSec,
    });
    if (!response.ok) throw new Error('Rust AI usage response failed');
    return json(await response.json());
  } catch (err) {
    console.error('GET /api/admin/ai-usage error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}

export function resolveAiUsageRangeLegacy(params, now) {
  const rawDays = parseInt(params.get('days') || '14', 10);
  const chartDays = Math.max(1, Math.min(365, Number.isFinite(rawDays) ? rawDays : 14));
  const customStart = String(params.get('start') || '').trim();
  const customEnd   = String(params.get('end')   || '').trim();

  const nowSec    = now;
  const dayAgo    = nowSec -  86400;
  const weekAgo   = nowSec -  86400 * 7;
  const monthAgo  = nowSec -  86400 * 30;

  let chartFrom = nowSec - 86400 * chartDays;
  let chartTo   = nowSec;
  let effectiveDays = chartDays;
  let rangeMode = 'days';
  if (/^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
    // KST 자정 ~ KST 23:59:59를 unix seconds로
    const startUnix = Math.floor(new Date(customStart + 'T00:00:00+09:00').getTime() / 1000);
    const endUnix   = Math.floor(new Date(customEnd   + 'T23:59:59+09:00').getTime() / 1000);
    if (Number.isFinite(startUnix) && Number.isFinite(endUnix) && endUnix > startUnix) {
      const spanDays = Math.ceil((endUnix - startUnix) / 86400);
      if (spanDays >= 1 && spanDays <= 365) {
        chartFrom = startUnix;
        chartTo   = endUnix;
        effectiveDays = spanDays;
        rangeMode = 'custom';
      }
    }
  }

  return {nowSec,dayAgo,weekAgo,monthAgo,chartFrom,chartTo,effectiveDays,rangeMode};
}

export async function resolveAiUsageRangeRust(params, now, env = {}, run = queryRust) {
  const original=resolveAiUsageRangeLegacy(params,now);
  try {
    const response=await run({env,request:{url:'https://internal.invalid/'}},'ai-usage-range',{
      days:params.get('days'), start:String(params.get('start')||'').trim(), end:String(params.get('end')||'').trim(), nowSec:now,
    });
    if(!response.ok) return original;
    const result=await response.json();
    return result && Object.keys(result).length===Object.keys(original).length && Object.keys(original).every(key=>result[key]===original[key]) ? result : original;
  } catch {return original;}
}
