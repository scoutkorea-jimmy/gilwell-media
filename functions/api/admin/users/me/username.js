/**
 * Gilwell Media · PUT /api/admin/users/me/username
 *
 * Self-service username rename for members. Quota: exactly 1 successful change
 * per account. After the member uses their quota, further changes require an
 * owner to either rename the account (/api/admin/users/:id) or reset the
 * `member_self_rename_used` flag via the same endpoint.
 *
 * Owners do not hit this endpoint — they change their own username through
 * the owner endpoint (/api/admin/users/:id with uid=self). Owners' renames
 * do not consume any quota.
 *
 * Body: { username }
 */
import { loadAdminSession } from '../../../../_shared/admin-permissions.js';
import { loadAdminUserById, serializeAdminUser } from '../../../../_shared/admin-users.js';
import { validateUsername } from '../../../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../../../_shared/ops-log.js';

export async function onRequestPut({ request, env }) {
  const session = await loadAdminSession(request, env);
  if (!session || !session.uid) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  if (session.isOwner) {
    // Owners rename themselves via /api/admin/users/:id (no quota, no
    // member_self_rename_used semantics). Reject here to keep the single
    // responsibility clear and avoid confusing audit log entries.
    return json({ error: '오너 계정은 사용자 관리에서 직접 아이디를 변경하세요.' }, 409);
  }

  const target = await loadAdminUserById(env, session.uid);
  if (!target) return json({ error: '계정을 찾을 수 없습니다.' }, 404);
  if (target.status !== 'active') {
    return json({ error: '활성 계정만 아이디를 변경할 수 있습니다.' }, 403);
  }
  if (Number(target.member_self_rename_used) === 1) {
    return json({
      error: '아이디는 1회만 직접 변경할 수 있습니다. 오너에게 요청하세요.',
      already_used: true,
    }, 409);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const v = validateUsername(body && body.username);
  if (!v.ok) return json({ error: v.error }, 400);
  if (v.value === target.username) {
    return json({ error: '현재 아이디와 다른 값을 입력해주세요.' }, 400);
  }

  // Uniqueness — include soft-deleted rows so members can't collide with a
  // future restore.
  const clash = await env.DB.prepare(
    `SELECT id, status FROM admin_users WHERE username = ? AND id != ?`
  ).bind(v.value, target.id).first();
  if (clash) {
    return json({ error: '이미 존재하는 아이디입니다.' }, 409);
  }

  try {
    await env.DB.prepare(
      `UPDATE admin_users
          SET username = ?,
              member_self_rename_used = 1,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(v.value, target.id).run();

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_self_rename', level: 'info',
      actor: v.value,                // use new username for future correlation
      path: '/api/admin/users/me/username',
      message: `사용자 셀프 아이디 변경 — ${target.username} → ${v.value} (quota 소진)`,
    });

    const updated = await loadAdminUserById(env, target.id);
    return json({ user: serializeAdminUser(updated) });
  } catch (err) {
    console.error('PUT /api/admin/users/me/username error:', err);
    return json({ error: '아이디 변경 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
