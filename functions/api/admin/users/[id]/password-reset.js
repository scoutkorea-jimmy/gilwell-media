/**
 * Gilwell Media · POST /api/admin/users/:id/password-reset
 *
 * Owner generates a fresh temporary password for a member. The plaintext is
 * returned ONCE in the response body (for the owner to share out-of-band),
 * hashed in admin_users.password_hash, and the member is flagged
 * must_change_password=1 so their first subsequent login is forced to rotate it.
 *
 * All existing sessions for that member are invalidated via per-user
 * token_min_iat bump.
 */
import { bumpAdminUserTokenEpoch, hashAdminPassword } from '../../../../_shared/auth.js';
import { loadAdminUserById } from '../../../../_shared/admin-users.js';
import { requireOwner } from '../../../../_shared/admin-permissions.js';
import { generateTempPassword, validatePassword } from '../../../../_shared/admin-user-validation.js';
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

  const target = await loadAdminUserById(env, id);
  if (!target) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);
  if (target.status !== 'active') {
    return json({ error: '활성 상태의 사용자만 비밀번호를 재설정할 수 있습니다.' }, 409);
  }
  // Owner cannot reset their own password through this endpoint — they use
  // /api/admin/password with their current password.
  if (target.role === 'owner') {
    return json({ error: '오너 계정은 이 경로로 리셋할 수 없습니다. 비밀번호 변경 메뉴를 사용하세요.' }, 409);
  }

  // Allow optional body.password for "set this exact password" flow. If absent,
  // generate a 12-char temp password.
  let body = null;
  try { body = await request.json(); } catch { /* no body OK */ }
  let tempPassword;
  if (body && typeof body.password === 'string' && body.password.length > 0) {
    const v = validatePassword(body.password);
    if (!v.ok) return json({ error: v.error }, 400);
    tempPassword = v.value;
  } else {
    tempPassword = generateTempPassword(12);
  }

  try {
    const hash = await hashAdminPassword(tempPassword);
    await env.DB.prepare(
      `UPDATE admin_users
          SET password_hash = ?,
              must_change_password = 1,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(JSON.stringify(hash), id).run();
    await bumpAdminUserTokenEpoch(env, id);

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_password_reset', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/users/${id}/password-reset`,
      message: `사용자 비밀번호 리셋 — ${target.username} · 다음 로그인 시 변경 강제`,
    });

    return json({
      success: true,
      temp_password: tempPassword,
      must_change_password: true,
      notice: '이 임시 비밀번호는 단 한 번 노출됩니다. 안전한 채널로 전달한 뒤 즉시 창을 닫아주세요. 사용자는 첫 로그인 후 반드시 새 비밀번호로 변경해야 합니다.',
    });
  } catch (err) {
    console.error(`POST /api/admin/users/${id}/password-reset error:`, err);
    return json({ error: '비밀번호 리셋 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
