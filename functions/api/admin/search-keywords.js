import { gateMenuAccess } from '../../_shared/admin-permissions.js';

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

// 호스트 suffix 매칭 + 쿼리 파라미터 이름
const SEARCH_ENGINES = [
  { match: /(^|\.)google\./i,        engine: 'Google',     params: ['q'] },
  { match: /(^|\.)search\.naver\./i, engine: 'Naver',      params: ['query'] },
  { match: /(^|\.)naver\./i,         engine: 'Naver',      params: ['query'] },
  { match: /(^|\.)search\.daum\./i,  engine: 'Daum',       params: ['q'] },
  { match: /(^|\.)daum\./i,          engine: 'Daum',       params: ['q'] },
  { match: /(^|\.)bing\./i,          engine: 'Bing',       params: ['q'] },
  { match: /(^|\.)search\.yahoo\./i, engine: 'Yahoo',      params: ['p'] },
  { match: /(^|\.)yahoo\./i,         engine: 'Yahoo',      params: ['p'] },
  { match: /(^|\.)duckduckgo\./i,    engine: 'DuckDuckGo', params: ['q'] },
  { match: /(^|\.)baidu\./i,         engine: 'Baidu',      params: ['wd', 'word'] },
  { match: /(^|\.)yandex\./i,        engine: 'Yandex',     params: ['text'] },
  { match: /(^|\.)ecosia\./i,        engine: 'Ecosia',     params: ['q'] },
  { match: /(^|\.)zum\./i,           engine: 'Zum',        params: ['query'] },
  { match: /(^|\.)nate\./i,          engine: 'Nate',       params: ['q'] },
];

function detectEngine(host) {
  if (!host) return null;
  for (const spec of SEARCH_ENGINES) {
    if (spec.match.test(host)) return spec;
  }
  return null;
}

function extractKeyword(referrerUrl) {
  if (!referrerUrl) return null;
  let parsed;
  try { parsed = new URL(referrerUrl); }
  catch (_) { return null; }
  const engine = detectEngine(parsed.hostname);
  if (!engine) return null;
  for (const paramName of engine.params) {
    const raw = parsed.searchParams.get(paramName);
    if (raw) {
      const kw = String(raw).trim();
      if (kw.length >= 2 && kw.length <= 100) {
        return { keyword: kw, engine: engine.engine };
      }
    }
  }
  return null;
}

export function summarizeSearchRows(rows, limit = 100) {
  const keywordCounts = new Map();
  const engineCounts = new Map();
  let totalVisits = 0;
  let knownVisits = 0;

  (rows || []).forEach((row) => {
    const referrerHost = String(row.referrer_host || '').toLowerCase();
    const info = extractKeyword(row.referrer_url);
    let engine = detectEngine(referrerHost);
    if (!engine && row.referrer_url) {
      try { engine = detectEngine(new URL(row.referrer_url).hostname); }
      catch (_) { /* 기존의 잘못된 URL은 제외 */ }
    }
    if (!engine) return;
    const visits = Number(row.visits) || 0;
    totalVisits += visits;
    engineCounts.set(engine.engine, (engineCounts.get(engine.engine) || 0) + visits);
    if (!info) return;
    knownVisits += visits;
    const normalizedKey = info.keyword.toLowerCase();
    const existing = keywordCounts.get(normalizedKey);
    if (existing) existing.visits += visits;
    else keywordCounts.set(normalizedKey, { keyword: info.keyword, engine: info.engine, visits });
  });

  return {
    total_visits: totalVisits,
    known_visits: knownVisits,
    hidden_visits: totalVisits - knownVisits,
    total_unique: keywordCounts.size,
    by_engine: Array.from(engineCounts.entries()).map(([engine, visits]) => ({ engine, visits })).sort((a, b) => b.visits - a.visits),
    keywords: Array.from(keywordCounts.values()).sort((a, b) => b.visits - a.visits || a.keyword.localeCompare(b.keyword, 'ko')).slice(0, limit),
  };
}

function resolveRange(searchParams) {
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  if (start && end) return { start, end, days: null };
  const daysParam = Number(searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(365, Math.round(daysParam)) : 30;
  return { start: null, end: null, days };
}

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'analytics-visits', 'view'); if (__gate) return __gate
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const url = new URL(request.url);
  const range = resolveRange(url.searchParams);
  const limit = Math.max(10, Math.min(500, Number(url.searchParams.get('limit')) || 100));

  try {
    let sql, args;
    if (range.start && range.end) {
      sql = `
        SELECT referrer_url, referrer_host, COUNT(*) AS visits
          FROM site_visits
         WHERE datetime(visited_at) >= datetime(?, '-9 hours')
           AND datetime(visited_at) < datetime(?, '+1 day', '-9 hours')
         GROUP BY referrer_url, referrer_host
      `;
      args = [range.start, range.end];
    } else {
      sql = `
        SELECT referrer_url, referrer_host, COUNT(*) AS visits
          FROM site_visits
         WHERE datetime(visited_at) >= datetime('now', '+9 hours', 'start of day', ?, '-9 hours')
         GROUP BY referrer_url, referrer_host
      `;
      args = [`-${range.days - 1} days`];
    }
    const { results } = await env.DB.prepare(sql).bind(...args).all();

    return json({
      range,
      ...summarizeSearchRows(results, limit),
    });
  } catch (err) {
    console.error('GET /api/admin/search-keywords error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}
