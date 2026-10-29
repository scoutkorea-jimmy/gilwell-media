import { queryRust } from '../../../_shared/rust-server.js';
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
    if (bindings.some(value => typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid sort order');
    const response = await queryRust({env,request}, 'memorabilia-category-update', {id,label_en:label_en || null,label_ko:label_ko || null,sort_order,archived});
    if (!response.ok) throw new Error('Rust category update failed');
    const {row} = await response.json();
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
    const response = await queryRust({env,request}, 'memorabilia-category-delete', {id});
    if (!response.ok) throw new Error('Rust category delete failed');
    const {in_use} = await response.json();
    if (in_use > 0) return json({ ok: true, archived: true, in_use });
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
