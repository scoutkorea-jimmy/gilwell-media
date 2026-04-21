import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * GET /api/admin/search-keywords
 *
 * site_visits.referrer_url에서 주요 검색엔진 referer를 찾아 검색어 파라미터를
 * 파싱·집계한다. 기간: ?days=30 (기본 30, 최대 365) 또는 ?start=YYYY-MM-DD&end=YYYY-MM-DD.
 *
 * 반환:
 *   {
 *     range: { start, end, days },
 *     total_visits:        <검색엔진에서 유입된 총 방문>,
 *     total_unique:        <고유 검색어 개수>,
 *     by_engine:           [{ engine, visits }],
 *     keywords:            [{ keyword, engine, visits }],  // 상위 100
 *   }
 *
 * 주의: referrer_url이 NULL이거나 검색엔진 호스트가 아니면 제외.
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

function resolveRange(searchParams) {
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  if (start && end) return { start, end, days: null };
  const daysParam = Number(searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(365, Math.round(daysParam)) : 30;
  return { start: null, end: null, days };
}

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const url = new URL(request.url);
  const range = resolveRange(url.searchParams);
  const limit = Math.max(10, Math.min(500, Number(url.searchParams.get('limit')) || 100));

  try {
    let sql, args;
    if (range.start && range.end) {
      sql = `
        SELECT referrer_url, referrer_host
          FROM site_visits
         WHERE referrer_url IS NOT NULL AND referrer_url <> ''
           AND date(visited_at) >= date(?)
           AND date(visited_at) <= date(?)
      `;
      args = [range.start, range.end];
    } else {
      sql = `
        SELECT referrer_url, referrer_host
          FROM site_visits
         WHERE referrer_url IS NOT NULL AND referrer_url <> ''
           AND datetime(visited_at) >= datetime('now', ?)
      `;
      args = [`-${range.days} days`];
    }
    const { results } = await env.DB.prepare(sql).bind(...args).all();

    const keywordCounts = new Map();
    const engineCounts  = new Map();
    let totalVisits = 0;

    (results || []).forEach((row) => {
      const info = extractKeyword(row.referrer_url);
      if (!info) return;
      totalVisits++;
      engineCounts.set(info.engine, (engineCounts.get(info.engine) || 0) + 1);
      const normalizedKey = info.keyword.toLowerCase();
      const existing = keywordCounts.get(normalizedKey);
      if (existing) {
        existing.visits++;
      } else {
        keywordCounts.set(normalizedKey, {
          keyword: info.keyword,
          engine: info.engine,
          visits: 1,
        });
      }
    });

    const keywords = Array.from(keywordCounts.values())
      .sort((a, b) => b.visits - a.visits || a.keyword.localeCompare(b.keyword, 'ko'))
      .slice(0, limit);
    const by_engine = Array.from(engineCounts.entries())
      .map(([engine, visits]) => ({ engine, visits }))
      .sort((a, b) => b.visits - a.visits);

    return json({
      range,
      total_visits: totalVisits,
      total_unique: keywordCounts.size,
      by_engine,
      keywords,
    });
  } catch (err) {
    return json({ error: 'DB 오류', detail: String((err && err.message) || err) }, 500);
  }
}
