/**
 * PATCH  /api/memorabilia/categories/:id   — 분류 수정 (관리자)
 * DELETE /api/memorabilia/categories/:id   — 분류 삭제 (사용 중이면 archive)
 */

import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

export async function onRequestPatch({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-categories', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const label_en = String(body.label_en || '').trim().slice(0, 80);
  const label_ko = String(body.label_ko || '').trim().slice(0, 80);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? parseInt(body.sort_order, 10) : null;
  const archived = body.archived == null ? null : (body.archived ? 1 : 0);

  const sets = [];
  const bindings = [];
  if (label_en) { sets.push(`label_en = ?`); bindings.push(label_en); }
  if (label_ko) { sets.push(`label_ko = ?`); bindings.push(label_ko); }
  if (sort_order != null) { sets.push(`sort_order = ?`); bindings.push(sort_order); }
  if (archived != null) { sets.push(`archived = ?`); bindings.push(archived); }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  sets.push(`updated_at = datetime('now')`);

  try {
    const row = await env.DB.prepare(`
      UPDATE memorabilia_categories SET ${sets.join(', ')}
       WHERE id = ?
       RETURNING id, slug, label_en, label_ko, sort_order, archived
    `).bind(...bindings, id).first();
    if (!row) return json({ error: 'not_found' }, 404);
    return json({ item: row });
  } catch (err) {
    console.error('PATCH category error:', err);
    return json({ error: 'update_failed' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-categories', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  try {
    const usage = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM memorabilia WHERE category_id = ?`
    ).bind(id).first();
    if (usage && usage.n > 0) {
      // 사용 중 → 아카이브로 변경 (실제 삭제 금지)
      await env.DB.prepare(
        `UPDATE memorabilia_categories SET archived = 1, updated_at = datetime('now') WHERE id = ?`
      ).bind(id).run();
      return json({ ok: true, archived: true, in_use: usage.n });
    }
    await env.DB.prepare(`DELETE FROM memorabilia_categories WHERE id = ?`).bind(id).run();
    return json({ ok: true, deleted: true });
  } catch (err) {
    console.error('DELETE category error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
