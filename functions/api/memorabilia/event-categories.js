/**
 * GET  /api/memorabilia/event-categories          — 행사 카테고리 목록 (공개+관리자)
 * POST /api/memorabilia/event-categories          — 카테고리 생성 (admin write)
 *
 * 응답: { items: [{id, slug, label_en, label_ko, sort_order, archived, usage_count, ...}] }
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { listEventCategories } from '../../_shared/memorabilia-events.js';

function slugify(text, fallback) {
  const cleaned = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || (fallback || 'cat-' + Math.random().toString(36).slice(2, 8));
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('include_archived') === '1';
  try {
    const items = await listEventCategories(env.DB, { includeArchived });
    return json({ items });
  } catch (err) {
    console.error('GET /api/memorabilia/event-categories error:', err);
    return json({ items: [], error: 'list_failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const label_en = String(body?.label_en || '').trim().slice(0, 100);
  const label_ko = String(body?.label_ko || '').trim().slice(0, 100);
  const sort_order = parseInt(body?.sort_order, 10);
  const archived = body?.archived ? 1 : 0;
  if (!label_en && !label_ko) return json({ error: 'validation', detail: '영문 또는 국문 라벨 중 하나는 필수.' }, 400);

  let slug = String(body?.slug || '').trim().toLowerCase();
  if (slug && !/^[a-z0-9-]+$/.test(slug)) return json({ error: 'validation', detail: '슬러그는 영문 소문자·숫자·하이픈만 허용.' }, 400);
  if (!slug) slug = slugify(label_en || label_ko);

  // slug 중복 회피
  for (let i = 0; i < 5; i += 1) {
    const ex = await env.DB.prepare(`SELECT 1 FROM memorabilia_event_categories WHERE slug = ?`).bind(slug).first();
    if (!ex) break;
    slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
  }

  try {
    const res = await env.DB.prepare(
      `INSERT INTO memorabilia_event_categories (slug, label_en, label_ko, sort_order, archived)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(slug, label_en, label_ko, Number.isFinite(sort_order) ? sort_order : 999, archived).run();
    return json({ id: res.meta.last_row_id, slug }, 201);
  } catch (err) {
    console.error('POST /api/memorabilia/event-categories error:', err);
    return json({ error: 'create_failed', detail: String(err && err.message || err) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
