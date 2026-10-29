import { queryRust } from '../../_shared/rust-server.js';
/**
 * GET /api/memorabilia/search
 *
 * Query params:
 *   q              — 검색어
 *   country        — ISO-2 코드 콤마 다중 (OR)
 *   category       — category slug 콤마 다중 (OR)
 *   year_from, year_to
 *   tag            — 태그 라벨 콤마 다중 (AND)
 *   issuer         — 제작기관 부분 일치
 *   sort           — relevance | newest | year_asc | year_desc | title
 *   page, limit
 *
 * Response: { results, facets, total, page, page_size }
 */

import { COUNTRY_CODE_LABELS_KO } from '../../_shared/country-code-labels.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../_shared/rate-limit.js';
import { loadAdminSession } from '../../_shared/admin-permissions.js';
import {
  buildSearchQuery,
  findGlossaryAliases,
  expandWithAliases,
} from '../../_shared/memorabilia-search.js';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;
// FTS 후보 상한 — bm25 관련도 상위 N개만 IN(...)/CASE 에 펼친다. 무제한일 때
// 광범위 검색어가 전체 공개 id 를 거대 SQL(IN + per-id CASE)로 만들던 문제를 차단.
// 동시에 ORDER BY bm25 를 적용해 후보가 관련도순으로 들어오도록 교정 (기존엔 rowid 순).
const FTS_CANDIDATE_CAP = 500;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();

  // Search-heavy workload rate limit (non-admins only). 30 searches/IP/min —
  // 사람에겐 넉넉, 스크래퍼·DoS 시도에는 즉시 제동.
  const session = await loadAdminSession(request, env).catch(() => null);
  if (!session) {
    const rl = await enforceRateLimit(env, {
      route: 'memorabilia-search',
      identity: getClientIp(request),
      limit: 30,
      windowSeconds: 60,
    });
    if (!rl.ok) return rateLimitResponse(rl, '검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
  const countryParam = String(url.searchParams.get('country') || '').trim();
  const categoryParam = String(url.searchParams.get('category') || '').trim();
  const eventParam = String(url.searchParams.get('event') || '').trim();
  const tagParam = String(url.searchParams.get('tag') || '').trim();
  const issuer = String(url.searchParams.get('issuer') || '').trim();
  const yearFrom = parseInt(url.searchParams.get('year_from') || '', 10);
  const yearTo = parseInt(url.searchParams.get('year_to') || '', 10);
  const sort = String(url.searchParams.get('sort') || 'relevance').trim();
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  const pageSize = Math.min(
    parseInt(url.searchParams.get('limit') || '', 10) || DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const offset = (page - 1) * pageSize;

  const countries = countryParam ? countryParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
  const categories = categoryParam ? categoryParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const tags = tagParam ? tagParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

  // 1) FTS5 matched id 후보 — 검색어가 있으면 FTS, 없으면 전체 공개 항목
  let candidateIds = null; // null 이면 "전체"
  let baseMatch = null;
  if (q) {
    baseMatch = buildSearchQuery(q);
    if (baseMatch) {
      try {
        const tokens = q.split(/\s+/).filter(Boolean);
        const aliasGroups = await findGlossaryAliases(env.DB, tokens);
        const expanded = expandWithAliases(baseMatch, aliasGroups);
        const response = await queryRust({env,request}, 'memorabilia-search-candidates', {query:expanded,limit:FTS_CANDIDATE_CAP});
        if (!response.ok) throw new Error('Rust search candidates failed');
        const {items:results} = await response.json();
        candidateIds = (results || []).map((r) => ({ id: r.memorabilia_id, score: r.score }));
      } catch (err) {
        console.warn('FTS search error, falling back to no-q:', err?.message);
        candidateIds = [];
      }
    } else {
      candidateIds = [];
    }
  }

  if (candidateIds !== null && !candidateIds.length) {
    return json({ results: [], facets: emptyFacets(), total: 0, page, page_size: pageSize });
  }
  const eventIds = eventParam ? eventParam.split(',').map(s => parseInt(s.trim(),10)).filter(Number.isFinite) : [];
  const searchOptions = {
    candidateIds: candidateIds === null ? null : candidateIds.map(c => c.id),
    countries,categories,eventIds,tags,issuer,yearFrom:Number.isFinite(yearFrom) ? yearFrom : null,
    yearTo:Number.isFinite(yearTo) ? yearTo : null,sort,pageSize,offset,
  };
  try {
    const response = await queryRust({env,request}, 'memorabilia-search-results', searchOptions);
    if (!response.ok) throw new Error('Rust search results failed');
    const data = await response.json();
    const rowsRes = {results:data.results};
    const totalRow = {n:data.total};
    const facets = emptyFacets();
    for (const r of data.countries || []) facets.country[r.country_code] = {count:r.n,label_ko:COUNTRY_CODE_LABELS_KO[r.country_code] || r.country_code};
    for (const r of data.categories || []) facets.category[r.slug] = {count:r.n,label_en:r.label_en,label_ko:r.label_ko};
    for (const r of data.tags || []) facets.tag[r.label] = r.n;
    // 검색 로그 (zero-result 추적)
    if (q) {
      const logPromise = queryRust({env,request}, 'memorabilia-search-log', {
        query:q.slice(0, 200), hits:totalRow?.n || 0,
        filters:JSON.stringify({ countries, categories, tags, issuer, yearFrom, yearTo, sort }).slice(0, 2000),
        ip:request.headers.get('cf-connecting-ip') || null,
      }).then(response => { if (!response.ok) throw new Error('Rust search log failed'); }).catch(() => {});
      if (context.waitUntil) context.waitUntil(logPromise);
    }

    return json({
      results: rowsRes.results || [],
      facets,
      total: totalRow?.n || 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error('GET /api/memorabilia/search error:', err);
    return json({ results: [], facets: emptyFacets(), total: 0, error: 'search_failed' }, 500);
  }
}

function emptyFacets() {
  return { country: {}, category: {}, tag: {} };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
