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

export async function onRequestGet({ request, env }) {
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
        const { results } = await env.DB.prepare(`
          SELECT memorabilia_id, bm25(memorabilia_fts) AS score
            FROM memorabilia_fts
           WHERE memorabilia_fts MATCH ?
           ORDER BY score ASC
           LIMIT ?
        `).bind(expanded, FTS_CANDIDATE_CAP).all();
        candidateIds = (results || []).map((r) => ({ id: r.memorabilia_id, score: r.score }));
      } catch (err) {
        console.warn('FTS search error, falling back to no-q:', err?.message);
        candidateIds = [];
      }
    } else {
      candidateIds = [];
    }
  }

  // 2) 메인 SELECT — 필터를 SQL 로 적용
  const whereParts = [`m.status = 'public'`];
  const bindings = [];

  if (candidateIds !== null) {
    if (!candidateIds.length) {
      return json({ results: [], facets: emptyFacets(), total: 0, page, page_size: pageSize });
    }
    const placeholders = candidateIds.map(() => '?').join(',');
    whereParts.push(`m.id IN (${placeholders})`);
    bindings.push(...candidateIds.map((c) => c.id));
  }

  if (countries.length) {
    whereParts.push(`m.id IN (SELECT memorabilia_id FROM memorabilia_countries WHERE country_code IN (${countries.map(() => '?').join(',')}))`);
    bindings.push(...countries);
  }
  if (categories.length) {
    whereParts.push(`m.category_id IN (SELECT id FROM memorabilia_categories WHERE slug IN (${categories.map(() => '?').join(',')}))`);
    bindings.push(...categories);
  }
  // event_id 필터 — 콤마 다중(OR) 또는 단일 정수
  if (eventParam) {
    const eventIds = eventParam.split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (eventIds.length) {
      whereParts.push(`m.event_id IN (${eventIds.map(() => '?').join(',')})`);
      bindings.push(...eventIds);
    }
  }
  for (const tagLabel of tags) {
    whereParts.push(`m.id IN (SELECT mt.memorabilia_id FROM memorabilia_tags mt JOIN memorabilia_tag_pool tp ON tp.id = mt.tag_id WHERE tp.label = ?)`);
    bindings.push(tagLabel);
  }
  if (issuer) {
    whereParts.push(`(m.issuer_ko LIKE ? OR m.issuer_en LIKE ?)`);
    bindings.push(`%${issuer}%`, `%${issuer}%`);
  }
  if (Number.isFinite(yearFrom)) {
    whereParts.push(`m.year >= ?`);
    bindings.push(yearFrom);
  }
  if (Number.isFinite(yearTo)) {
    whereParts.push(`m.year <= ?`);
    bindings.push(yearTo);
  }

  const where = `WHERE ${whereParts.join(' AND ')}`;
  let orderBy;
  switch (sort) {
    case 'newest':    orderBy = `COALESCE(m.published_at, m.updated_at) DESC, m.id DESC`; break;
    case 'year_asc':  orderBy = `m.year ASC NULLS LAST, m.id DESC`; break;
    case 'year_desc': orderBy = `m.year DESC NULLS LAST, m.id DESC`; break;
    case 'title':     orderBy = `COALESCE(NULLIF(m.title_en, ''), m.title_ko) ASC, m.id DESC`; break;
    case 'relevance':
    default:
      // 검색어 있으면 후보 순서대로 (BM25 score), 없으면 최신순
      orderBy = candidateIds && candidateIds.length
        ? `CASE m.id ${candidateIds.map((c, i) => `WHEN ${c.id} THEN ${i}`).join(' ')} ELSE 999999 END ASC`
        : `COALESCE(m.published_at, m.updated_at) DESC, m.id DESC`;
      break;
  }

  const sql = `
    SELECT m.id, m.slug, m.title_en, m.title_ko, m.event_name_en, m.event_name_ko,
           m.year, m.has_event, m.view_count,
           c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko,
           (SELECT url FROM memorabilia_images
             WHERE memorabilia_id = m.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) AS primary_image_url
      FROM memorabilia m
      LEFT JOIN memorabilia_categories c ON c.id = m.category_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
  `;

  try {
    const rowsRes = await env.DB.prepare(sql).bind(...bindings, pageSize, offset).all();
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM memorabilia m ${where}`).bind(...bindings).first();
    const facets = await computeFacets(env.DB, where, bindings);

    // 검색 로그 (zero-result 추적)
    if (q) {
      env.DB.prepare(`
        INSERT INTO memorabilia_search_log (query, hits, filters_json, client_ip)
        VALUES (?, ?, ?, ?)
      `).bind(
        q.slice(0, 200),
        totalRow?.n || 0,
        JSON.stringify({ countries, categories, tags, issuer, yearFrom, yearTo, sort }).slice(0, 2000),
        request.headers.get('cf-connecting-ip') || null,
      ).run().catch(() => {});
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

async function computeFacets(db, baseWhere, baseBindings) {
  const facets = emptyFacets();
  try {
    const countryRes = await db.prepare(`
      SELECT mc.country_code, COUNT(DISTINCT m.id) AS n
        FROM memorabilia m
        JOIN memorabilia_countries mc ON mc.memorabilia_id = m.id
        LEFT JOIN memorabilia_categories c ON c.id = m.category_id
        ${baseWhere}
        GROUP BY mc.country_code
        ORDER BY n DESC LIMIT 30
    `).bind(...baseBindings).all();
    for (const r of (countryRes.results || [])) {
      facets.country[r.country_code] = { count: r.n, label_ko: COUNTRY_CODE_LABELS_KO[r.country_code] || r.country_code };
    }

    const catRes = await db.prepare(`
      SELECT c.slug, c.label_en, c.label_ko, COUNT(*) AS n
        FROM memorabilia m
        LEFT JOIN memorabilia_categories c ON c.id = m.category_id
        ${baseWhere}
        AND c.id IS NOT NULL
        GROUP BY c.slug
        ORDER BY n DESC
    `).bind(...baseBindings).all();
    for (const r of (catRes.results || [])) {
      facets.category[r.slug] = { count: r.n, label_en: r.label_en, label_ko: r.label_ko };
    }

    const tagRes = await db.prepare(`
      SELECT tp.label, COUNT(*) AS n
        FROM memorabilia m
        JOIN memorabilia_tags mt ON mt.memorabilia_id = m.id
        JOIN memorabilia_tag_pool tp ON tp.id = mt.tag_id
        LEFT JOIN memorabilia_categories c ON c.id = m.category_id
        ${baseWhere}
        GROUP BY tp.label
        ORDER BY n DESC LIMIT 20
    `).bind(...baseBindings).all();
    for (const r of (tagRes.results || [])) {
      facets.tag[r.label] = r.n;
    }
  } catch (err) {
    console.warn('facet compute failed:', err?.message);
  }
  return facets;
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
