/**
 * Gilwell Media · /api/admin/presets/:id
 *
 *   PUT    — update a custom preset's name/description/permissions (owner only).
 *            Built-in presets are read-only at this endpoint.
 *   DELETE — delete a custom preset (owner only). Built-ins cannot be removed.
 */
import { requireOwner } from '../../../_shared/admin-permissions.js';
import { validatePermissions } from '../../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../../_shared/ops-log.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestPut({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 프리셋 ID입니다.' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, slug, is_builtin FROM admin_user_presets WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  if (row.is_builtin) {
    return json({ error: '빌트인 프리셋은 수정할 수 없습니다. 새 프리셋으로 복제해 저장하세요.' }, 409);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const fields = [];
  const values = [];
  const changes = [];

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return json({ error: '프리셋 이름은 비워둘 수 없습니다.' }, 400);
    fields.push('name = ?'); values.push(name); changes.push('name');
  }
  if (body.description !== undefined) {
    const desc = String(body.description || '').trim().slice(0, 500);
    fields.push('description = ?'); values.push(desc); changes.push('description');
  }
  if (body.permissions !== undefined) {
    const v = validatePermissions(body.permissions);
    if (!v.ok) return json({ error: v.error }, 400);
    fields.push('permissions = ?'); values.push(JSON.stringify(v.value));
    changes.push('permissions');
  }

  if (!fields.length) return json({ error: '변경할 내용이 없습니다.' }, 400);
  fields.push("updated_at = datetime('now')");

  try {
    await env.DB.prepare(
      `UPDATE admin_user_presets SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_updated', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/presets/${id}`,
      message: `권한 프리셋 수정 — ${row.slug} (필드: ${changes.join(', ')})`,
    });

    return json({ success: true });
  } catch (err) {
    console.error(`PUT /api/admin/presets/${id} error:`, err);
    return json({ error: '프리셋 수정 중 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 프리셋 ID입니다.' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, slug, is_builtin FROM admin_user_presets WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  if (row.is_builtin) {
    return json({ error: '빌트인 프리셋은 삭제할 수 없습니다.' }, 409);
  }

  try {
    await env.DB.prepare(`DELETE FROM admin_user_presets WHERE id = ?`).bind(id).run();
    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_deleted', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/presets/${id}`,
      message: `권한 프리셋 삭제 — ${row.slug}`,
    });
    return json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/admin/presets/${id} error:`, err);
    return json({ error: '프리셋 삭제 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
