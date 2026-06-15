/**
 * POST /api/admin/totp/confirm — 등록 마무리.
 *
 * pending 시크릿(totp_secret, enabled=0)에 대해 첫 6자리 코드를 검증한다.
 * 성공 시 totp_enabled=1 로 활성화하고 일회용 백업코드 8개를 생성·해시 저장한 뒤
 * 평문 백업코드를 1회 반환(이후 재조회 불가). 즉시 OTP 쿠키도 발급해 바로 통과 상태로.
 */
import { loadAdminSession } from '../../../_shared/admin-permissions.js';
import { verifyTotp, generateBackupCodes, hashBackupCode } from '../../../_shared/totp.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../../_shared/rate-limit.js';
import { issueOtpToken, buildOtpCookie } from '../../../_shared/otp-session.js';

function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extraHeaders || {}),
  });
}

export async function onRequestPost({ request, env }) {
  const session = await loadAdminSession(request, env);
  if (!session) return json({ error: 'unauthorized', reason: '로그인이 필요합니다.' }, 401);
  if (!session.uid) return json({ error: 'legacy_session', reason: '계정으로 로그인해야 합니다.' }, 400);

  const rl = await enforceRateLimit(env, { route: 'totp-confirm', identity: 'u' + session.uid, limit: 10, windowSeconds: 60 });
  if (!rl.ok) return rateLimitResponse(rl, '시도가 너무 많습니다. 잠시 후 다시 시도하세요.');

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const code = String(body.code || '').trim();

  const row = await env.DB.prepare(
    `SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ?`
  ).bind(session.uid).first();
  if (!row || !row.totp_secret) return json({ error: 'no_pending', reason: '먼저 등록을 시작하세요.' }, 400);
  if (Number(row.totp_enabled)) return json({ error: 'already_enabled', reason: '이미 활성화되어 있습니다.' }, 409);

  const now = Math.floor(Date.now() / 1000);
  const ok = await verifyTotp(row.totp_secret, code, now, { window: 1 });
  if (!ok) return json({ error: 'bad_code', reason: '코드가 올바르지 않습니다. 인증기 시간을 확인하세요.' }, 401);

  const backupCodes = generateBackupCodes(8);
  const hashes = [];
  for (const c of backupCodes) hashes.push(await hashBackupCode(c));
  await env.DB.prepare(
    `UPDATE admin_users SET totp_enabled = 1, totp_backup_codes = ?, totp_enrolled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(hashes), session.uid).run();

  const token = await issueOtpToken(env.ADMIN_SECRET, session.uid);
  return json({ ok: true, backup_codes: backupCodes }, 200, { 'Set-Cookie': buildOtpCookie(token) });
}
