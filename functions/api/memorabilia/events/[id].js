/**
 * GET    /api/memorabilia/events/:id  — 행사 상세 (공개)
 * PATCH  /api/memorabilia/events/:id  — 행사 수정 (admin write)
 * DELETE /api/memorabilia/events/:id  — 행사 삭제 (admin write)
 *
 * 삭제 시 ON DELETE SET NULL 로 memorabilia.event_id 가 NULL 됨.
 * 단 denormalized event_name_en/ko 는 그대로 유지 (legacy 표시용).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import {
  getEvent,
  updateEvent,
  deleteEvent,
  normalizeEventInput,
} from '../../../_shared/memorabilia-events.js';

export async function onRequestGet({ params, env }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);
  try {
    const item = await getEvent(env.DB, id);
    if (!item) return json({ error: 'not_found' }, 404);
    return json({ item });
  } catch (err) {
    console.error('GET /api/memorabilia/events/:id error:', err);
    return json({ error: 'load_failed' }, 500);
  }
}

export async function onRequestPatch({ request, params, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const existing = await getEvent(env.DB, id);
  if (!existing) return json({ error: 'not_found' }, 404);

  // PATCH 패턴: existing 위에 body 덮어쓰기
  const merged = { ...existing, ...body };
  const { errors, input } = normalizeEventInput(merged);
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  try {
    await updateEvent(env.DB, id, input);
    return json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/memorabilia/events/:id error:', err);
    return json({ error: 'update_failed' }, 500);
  }
}

export async function onRequestDelete({ request, params, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);
  try {
    await deleteEvent(env.DB, id);
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/memorabilia/events/:id error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
