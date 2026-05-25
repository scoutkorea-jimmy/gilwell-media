/**
 * GET  /api/memorabilia/categories  — 분류 enum 목록 (공개·관리자 공용)
 * POST /api/memorabilia/categories  — 새 분류 추가 (관리자 전용)
 */

import { gateMenuAccess } from '../../_shared/admin-permissions.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, slug, label_en, label_ko, sort_order, archived
        FROM memorabilia_categories
       ORDER BY archived ASC, sort_order ASC, id ASC
    `).all();
    return json({ items: results || [] });
  } catch (err) {
    console.error('GET /api/memorabilia/categories error:', err);
    return json({ items: [], error: 'list_failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-categories', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const label_en = String(body.label_en || '').trim().slice(0, 80);
  const label_ko = String(body.label_ko || '').trim().slice(0, 80);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? parseInt(body.sort_order, 10) : 999;

  if (!slug) return json({ error: 'slug_required' }, 400);
  if (!label_en && !label_ko) return json({ error: 'label_required' }, 400);

  try {
    const row = await env.DB.prepare(`
      INSERT INTO memorabilia_categories (slug, label_en, label_ko, sort_order)
      VALUES (?, ?, ?, ?)
      RETURNING id, slug, label_en, label_ko, sort_order, archived
    `).bind(slug, label_en, label_ko, sort_order).first();
    return json({ item: row }, 201);
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return json({ error: 'slug_exists' }, 409);
    }
    console.error('POST /api/memorabilia/categories error:', err);
    return json({ error: 'create_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
