/**
 * GET /api/admin/ai-score-history
 *
 * AI 채점 기록을 페이지네이션/검색 가능한 형태로 반환.
 *
 * Query params:
 *   limit     — 페이지당 항목 수 (기본 30, 최대 100)
 *   offset    — 시작 오프셋 (기본 0)
 *   q         — 제목 부분 일치 검색
 *   grade     — 등급 필터 (S/A/B/C/D)
 *   min_score — 최소 점수 (0-100)
 *
 * 관리자 인증 필수. 등급별·점수 기반 정렬·검색으로 품질 추이 파악용.
 */
import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'ai-score-history', 'view'); if (__gate) return __gate
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);

  const url = new URL(request.url);
  const {limit,offset,q,grade,minScore} = await resolveScoreHistoryFiltersRust(url.searchParams, env);

  try {
    const query = kind => queryRust({request, env}, 'ai-score-history', {kind, q, grade, min_score:minScore, limit, offset})
      .then(response => { if (!response.ok) throw new Error('Rust AI score history query failed'); return response.json(); });
    const [page, stats] = await Promise.all([
      query('page'),
      query('stats').then(data=>data.row),
    ]);
    if (!Array.isArray(page.rows) || !page.row || !Number.isInteger(page.row.total) || page.row.total < 0) throw new Error('Invalid Rust AI score page');
    const items=page.rows, totalRow=page.row;

    const legacyCategories = [];
    for (const [index, row] of items.entries()) {
      if (!Object.hasOwn(row, 'categories')) {
        let categories = [];
        if (row.categories_json) {
          try { categories = JSON.parse(row.categories_json); } catch (_) {}
        }
        // shortcut: unusual JSON uses the legacy parser, remove after parser compatibility is proven.
        legacyCategories.push([index, categories]);
      }
      delete row.categories_json;
    }
    const response = await queryRust({request, env}, 'ai-score-history-response', {
      items, total_row: totalRow, stats, limit, offset, generated_at: Math.floor(Date.now() / 1000),
    });
    if (!response.ok) throw new Error('Rust AI score history response failed');
    const result = await response.json();
    for (const [index, categories] of legacyCategories) result.items[index].categories = categories;
    return json(result);
  } catch (err) {
    console.error('GET /api/admin/ai-score-history error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}


export function resolveScoreHistoryFiltersLegacy(params) {
  const limit = clamp(parseInt(params.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0);
  const q = String(params.get('q') || '').trim().slice(0, 120);
  const grade = String(params.get('grade') || '').trim().toUpperCase();
  const minScoreRaw = parseInt(params.get('min_score') || '', 10);
  const minScore = Number.isFinite(minScoreRaw) ? clamp(minScoreRaw, 0, 100) : null;
  return {limit,offset,q,grade,minScore};
}

export async function resolveScoreHistoryFiltersRust(params, env = {}, run = queryRust) {
  const original=resolveScoreHistoryFiltersLegacy(params);
  try {
    const response=await run({env,request:{url:'https://internal.invalid/'}},'score-history-filters',{
      limit:params.get('limit'),offset:params.get('offset'),q:params.get('q'),grade:params.get('grade'),min_score:params.get('min_score'),
    });
    if(!response.ok) return original;
    const result=await response.json();
    if(!Array.isArray(result.q_units)||result.q_units.length>120||!result.q_units.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)) return original;
    const normalized={limit:result.limit,offset:result.offset,q:String.fromCharCode(...result.q_units),grade:result.grade,minScore:result.minScore};
    return Object.keys(original).every(key=>normalized[key]===original[key])?normalized:original;
  } catch {return original;}
}
