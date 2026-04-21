/**
 * Gilwell Media · POST /api/admin/users/:id/restore
 *
 * Owner brings a soft-deleted user back to 'active'. Permissions, editor_code,
 * and other fields are preserved as-stored; the operator can edit afterward.
 */
import { loadAdminUserById, serializeAdminUser } from '../../../../_shared/admin-users.js';
import { requireOwner } from '../../../../_shared/admin-permissions.js';
import { logOperationalEvent } from '../../../../_shared/ops-log.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestPost({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, username, status FROM admin_users WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);
  if (row.status !== 'deleted') {
    return json({ error: '삭제된 사용자만 복구할 수 있습니다.' }, 409);
  }

  try {
    await env.DB.prepare(
      `UPDATE admin_users
          SET status = 'active',
              deleted_at = NULL,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(id).run();

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_restored', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/users/${id}/restore`,
      message: `사용자 복구 — ${row.username}`,
    });

    const updated = await loadAdminUserById(env, id);
    return json({ user: serializeAdminUser(updated) });
  } catch (err) {
    console.error(`POST /api/admin/users/${id}/restore error:`, err);
    return json({ error: '사용자 복구 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
