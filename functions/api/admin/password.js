/**
 * Gilwell Media · Admin Password Change
 * POST /api/admin/password
 *
 * Body: { currentPassword, newPassword, confirmPassword }
 *
 * Flow:
 *   1. Require a valid admin session (HttpOnly cookie).
 *   2. Verify `currentPassword` against the D1-stored hash if present, otherwise
 *      against env.ADMIN_PASSWORD (bootstrap case).
 *   3. Enforce minimum length (8 chars) and confirmation match.
 *   4. Store a fresh PBKDF2-SHA256 hash in settings('admin_password_hash').
 *   5. Bump settings('admin_token_min_iat') so every pre-existing session token
 *      is invalidated — the caller gets a brand-new token via the rotated
 *      Set-Cookie so their own browser stays logged in.
 */
import {
  buildAdminSessionCookie,
  bumpAdminTokenEpoch,
  createToken,
  extractToken,
  hashAdminPassword,
  loadAdminPasswordHash,
  safeCompare,
  storeAdminPasswordHash,
  verifyAdminPasswordHash,
  verifyTokenRole,
} from '../../_shared/auth.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

export async function onRequestPost({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
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

  // Verify current password — D1 hash first, env fallback
  const storedHash = await loadAdminPasswordHash(env);
  let currentOk = false;
  if (storedHash) {
    currentOk = await verifyAdminPasswordHash(currentPassword, storedHash);
  } else if (env.ADMIN_PASSWORD) {
    currentOk = safeCompare(currentPassword, env.ADMIN_PASSWORD);
  }

  if (!currentOk) {
    // Artificial delay discourages repeated probing
    await new Promise((resolve) => setTimeout(resolve, 400));
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'admin_password_change_failed',
      level: 'warn',
      actor: 'admin',
      path: '/api/admin/password',
      message: '관리자 비밀번호 변경 실패 — 현재 비밀번호 불일치',
    });
    return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
  }

  try {
    const nextHash = await hashAdminPassword(newPassword);
    await storeAdminPasswordHash(env, nextHash);
    // Invalidate ALL outstanding tokens (other devices / stolen cookies).
    await bumpAdminTokenEpoch(env);
    // Re-issue a fresh token for the operator so their own browser stays in.
    const newToken = await createToken(env.ADMIN_SECRET, 'full');

    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'admin_password_changed',
      level: 'info',
      actor: 'admin',
      path: '/api/admin/password',
      message: '관리자 비밀번호 변경 성공 (기존 세션 전체 무효화)',
    });

    return json(
      { success: true, message: '비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.' },
      200,
      { 'Set-Cookie': buildAdminSessionCookie(newToken) }
    );
  } catch (err) {
    console.error('POST /api/admin/password error:', err);
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
