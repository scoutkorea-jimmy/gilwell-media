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
