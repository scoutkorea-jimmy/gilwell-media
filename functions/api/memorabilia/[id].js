/**
 * GET    /api/memorabilia/:id   — 관리자 상세 (드래프트 포함)
 * PATCH  /api/memorabilia/:id   — 수정 (관리자 전용)
 * DELETE /api/memorabilia/:id   — 삭제 (관리자 전용)
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import {
  normalizeMemorabiliaInput,
  getMemorabiliaById,
  updateMemorabilia,
  deleteMemorabilia,
  loadCategoryMap,
} from '../../_shared/memorabilia-store.js';

export async function onRequestGet({ request, env, params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const session = await loadAdminSession(request, env).catch(() => null);
  const includeDrafts = !!session;

  const item = await getMemorabiliaById(env.DB, id, { includeDrafts });
  if (!item) return json({ error: 'not_found' }, 404);
  return json({ item });
}

export async function onRequestPatch({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const { errors, input } = normalizeMemorabiliaInput(body || {});
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  if (input.category_id) {
    const cats = await loadCategoryMap(env.DB);
    if (!cats.byId[input.category_id]) return json({ error: 'invalid_category' }, 400);
  }

  try {
    const result = await updateMemorabilia(env.DB, id, input);
    if (!result) return json({ error: 'not_found' }, 404);
    return json({ id });
  } catch (err) {
    console.error('PATCH /api/memorabilia error:', err);
    return json({ error: 'update_failed' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  try {
    await deleteMemorabilia(env.DB, id);
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/memorabilia error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
