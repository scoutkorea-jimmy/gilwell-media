/**
 * PATCH  /api/memorabilia/event-categories/:id  — 분류 수정 (admin write)
 * DELETE /api/memorabilia/event-categories/:id  — 분류 삭제 (admin write)
 *
 * 삭제 시 ON DELETE SET NULL 로 memorabilia_events.category_id 가 NULL 처리됨
 * (행사 자체는 보존). 사용 중이라도 삭제 가능하지만 운영자가 의도해서만 실행.
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

export async function onRequestPatch({ request, params, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const existing = await env.DB.prepare(
    `SELECT id, slug, label_en, label_ko, sort_order, archived FROM memorabilia_event_categories WHERE id = ?`
  ).bind(id).first();
  if (!existing) return json({ error: 'not_found' }, 404);

  const label_en   = body.label_en   !== undefined ? String(body.label_en   || '').trim().slice(0, 100) : existing.label_en;
  const label_ko   = body.label_ko   !== undefined ? String(body.label_ko   || '').trim().slice(0, 100) : existing.label_ko;
  const sort_order = body.sort_order !== undefined ? (parseInt(body.sort_order, 10) || 999) : existing.sort_order;
  const archived   = body.archived   !== undefined ? (body.archived ? 1 : 0) : existing.archived;

  if (!label_en && !label_ko) return json({ error: 'validation', detail: '영문/국문 라벨 중 하나는 필요합니다.' }, 400);

  try {
    await env.DB.prepare(
      `UPDATE memorabilia_event_categories
          SET label_en = ?, label_ko = ?, sort_order = ?, archived = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(label_en, label_ko, sort_order, archived, id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/memorabilia/event-categories/:id error:', err);
    return json({ error: 'update_failed' }, 500);
  }
}

export async function onRequestDelete({ request, params, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  try {
    await env.DB.prepare(`DELETE FROM memorabilia_event_categories WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/memorabilia/event-categories/:id error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
