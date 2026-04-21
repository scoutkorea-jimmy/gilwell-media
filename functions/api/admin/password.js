/**
 * Gilwell Media · Admin Password Change
 * POST /api/admin/password
 *
 * Body: { currentPassword, newPassword, confirmPassword }
 *
 * Flow (Phase 2):
 *   1. Require a valid admin session (HttpOnly cookie).
 *   2. If session carries `uid` → update that admin_users row's password_hash,
 *      clear must_change_password, bump that user's token_min_iat.
 *   3. Legacy path (no uid in token — pre-Phase-2 session) → still write to
 *      settings.admin_password_hash so the legacy auth flow keeps working
 *      until the next login upgrades the session.
 *   4. Re-issue a fresh token for the operator's current browser so they stay
 *      signed in. All OTHER devices holding the old token are invalidated
 *      (global bump for legacy, per-user bump for uid sessions).
 */
import {
  buildAdminSessionCookie,
  bumpAdminTokenEpoch,
  bumpAdminUserTokenEpoch,
  createToken,
  extractToken,
  hashAdminPassword,
  loadAdminPasswordHash,
  readToken,
  safeCompare,
  storeAdminPasswordHash,
  verifyAdminPasswordHash,
  verifyTokenRole,
} from '../../_shared/auth.js';
import { loadAdminUserById } from '../../_shared/admin-users.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

export async function onRequestPost({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, ['full', 'member']))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const currentPassword = String(body?.currentPassword || '');
  const newPassword = String(body?.newPassword || '');
  const confirmPassword = String(body?.confirmPassword || '');

  if (!currentPassword) return json({ error: '현재 비밀번호를 입력해주세요.' }, 400);
  if (!newPassword) return json({ error: '새 비밀번호를 입력해주세요.' }, 400);
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `새 비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` }, 400);
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return json({ error: `새 비밀번호는 최대 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.` }, 400);
  }
  if (newPassword !== confirmPassword) {
    return json({ error: '새 비밀번호와 확인 값이 일치하지 않습니다.' }, 400);
  }
  if (currentPassword === newPassword) {
    return json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' }, 400);
  }

  const payload = await readToken(token, env.ADMIN_SECRET);
  const uid = payload && payload.uid ? Number(payload.uid) : null;

  // ── Path A: per-user row update (Phase 2 sessions) ──
  if (uid) {
    const userRow = await env.DB.prepare(
      `SELECT id, username, display_name, role, password_hash, status FROM admin_users WHERE id = ?`
    ).bind(uid).first();
    if (!userRow || userRow.status !== 'active') {
      return json({ error: '계정을 찾을 수 없거나 비활성화되었습니다.' }, 404);
    }

    let stored = null;
    try { stored = JSON.parse(userRow.password_hash || 'null'); } catch {}
    const ok = stored ? await verifyAdminPasswordHash(currentPassword, stored) : false;
    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await logOperationalEvent(env, {
        channel: 'admin', type: 'admin_password_change_failed', level: 'warn',
        actor: userRow.username, path: '/api/admin/password',
        message: `관리자 비밀번호 변경 실패 (${userRow.username})`,
      });
      return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
    }

    try {
      const nextHash = await hashAdminPassword(newPassword);
      const nowMs = Date.now();
      await env.DB.prepare(
        `UPDATE admin_users
            SET password_hash = ?,
                must_change_password = 0,
                token_min_iat = ?,
                updated_at = datetime('now')
          WHERE id = ?`
      ).bind(JSON.stringify(nextHash), nowMs, uid).run();

      const role = userRow.role === 'owner' ? 'full' : 'member';
      const newToken = await createToken(env.ADMIN_SECRET, {
        role,
        uid: userRow.id,
        username: userRow.username,
      });

      await logOperationalEvent(env, {
        channel: 'admin', type: 'admin_password_changed', level: 'info',
        actor: userRow.username, path: '/api/admin/password',
        message: `관리자 비밀번호 변경 성공 (${userRow.username} · 다른 기기 세션 전체 무효화)`,
      });

      return json(
        { success: true, message: '비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.' },
        200,
        { 'Set-Cookie': buildAdminSessionCookie(newToken, 86400, role) }
      );
    } catch (err) {
      console.error('POST /api/admin/password (user row) error:', err);
      return json({ error: '비밀번호 저장 중 오류가 발생했습니다.' }, 500);
    }
  }

  // ── Path B: legacy session (no uid in token) — pre-Phase-2 compat ──
  const storedLegacy = await loadAdminPasswordHash(env);
  let currentOk = false;
  if (storedLegacy) {
    currentOk = await verifyAdminPasswordHash(currentPassword, storedLegacy);
  } else if (env.ADMIN_PASSWORD) {
    currentOk = safeCompare(currentPassword, env.ADMIN_PASSWORD);
  }

  if (!currentOk) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_password_change_failed', level: 'warn',
      actor: 'owner-legacy', path: '/api/admin/password',
      message: '관리자 비밀번호 변경 실패 — 현재 비밀번호 불일치 (legacy session)',
    });
    return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
  }

  try {
    const nextHash = await hashAdminPassword(newPassword);
    await storeAdminPasswordHash(env, nextHash);
    await bumpAdminTokenEpoch(env);
    const newToken = await createToken(env.ADMIN_SECRET, 'full');

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_password_changed', level: 'info',
      actor: 'owner-legacy', path: '/api/admin/password',
      message: '관리자 비밀번호 변경 성공 (legacy · 전체 세션 무효화)',
    });

    return json(
      { success: true, message: '비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.' },
      200,
      { 'Set-Cookie': buildAdminSessionCookie(newToken) }
    );
  } catch (err) {
    console.error('POST /api/admin/password (legacy) error:', err);
    return json({ error: '비밀번호 저장 중 오류가 발생했습니다.' }, 500);
  }
}

export function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      continue;
    }
    headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}
