/**
 * GET  /api/memorabilia          — 목록 (공개=공개 항목만, 관리자=드래프트 포함)
 * POST /api/memorabilia          — 신규 생성 (관리자 전용)
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import {
  normalizeMemorabiliaInput,
  createMemorabilia,
  loadCategoryMap,
} from '../../_shared/memorabilia-store.js';

const PUBLIC_PAGE_SIZE = 24;
const ADMIN_PAGE_SIZE = 50;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const session = await loadAdminSession(request, env).catch(() => null);
  const isAdmin = !!session;
  const includeDrafts = isAdmin && url.searchParams.get('include_drafts') === '1';

  const pageSize = Math.min(
    parseInt(url.searchParams.get('limit') || '', 10) || (isAdmin ? ADMIN_PAGE_SIZE : PUBLIC_PAGE_SIZE),
    100
  );
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  const whereParts = [];
  const bindings = [];
  if (!includeDrafts) {
    whereParts.push(`m.status = 'public'`);
  }
  const eventIdParam = url.searchParams.get('event_id');
  if (eventIdParam) {
    const eid = parseInt(eventIdParam, 10);
    if (Number.isFinite(eid)) {
      whereParts.push(`m.event_id = ?`);
      bindings.push(eid);
    }
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  // random=1 → 홈 도감 레일 등 무작위 노출용. ORDER BY 를 RANDOM() 으로 교체.
  // (OFFSET 은 의미 없어지지만 LIMIT 만 적용)
  const isRandom = url.searchParams.get('random') === '1';
  const orderClause = isRandom
    ? 'ORDER BY RANDOM()'
    : 'ORDER BY COALESCE(m.published_at, m.updated_at) DESC, m.id DESC';

  const sql = `
    SELECT m.id, m.slug, m.title_en, m.title_ko,
           m.has_event, m.event_id, m.event_name_en, m.event_name_ko,
           m.year, m.status, m.category_id, m.published_at, m.updated_at,
           c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko,
           (SELECT url FROM memorabilia_images
             WHERE memorabilia_id = m.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) AS primary_image_url,
           (SELECT json_group_array(p.label)
              FROM memorabilia_tags mt
              JOIN memorabilia_tag_pool p ON p.id = mt.tag_id
             WHERE mt.memorabilia_id = m.id) AS tags_json
      FROM memorabilia m
      LEFT JOIN memorabilia_categories c ON c.id = m.category_id
      ${where}
     ${orderClause}
     LIMIT ? OFFSET ?
  `;
  // WHERE 절 binding (event_id 등) 은 LIMIT/OFFSET 보다 앞에 와야 한다.
  const whereBindings = bindings.slice();
  bindings.push(pageSize, offset);

  try {
    const { results } = await env.DB.prepare(sql).bind(...bindings).all();
    // tags_json (SQLite json array) → string[] 배열로 정규화
    const items = (results || []).map((row) => {
      let tags = [];
      if (row.tags_json) {
        try { tags = JSON.parse(row.tags_json) || []; } catch {}
      }
      const { tags_json, ...rest } = row;
      return { ...rest, tags };
    });
    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM memorabilia m ${where}`
    ).bind(...whereBindings).first();
    return json({
      items,
      page,
      page_size: pageSize,
      total: totalRow?.n || 0,
    });
  } catch (err) {
    console.error('GET /api/memorabilia error:', err);
    return json({ items: [], error: 'list_failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const { errors, input } = normalizeMemorabiliaInput(body || {});
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  // category_id 가 주어졌으면 유효성 체크
  if (input.category_id) {
    const cats = await loadCategoryMap(env.DB);
    if (!cats.byId[input.category_id]) return json({ error: 'invalid_category' }, 400);
  }

  try {
    const session = await loadAdminSession(request, env).catch(() => null);
    const id = await createMemorabilia(env.DB, input, { createdBy: session?.username || null });
    return json({ id }, 201);
  } catch (err) {
    console.error('POST /api/memorabilia error:', err);
    return json({ error: 'create_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
