/**
 * POST /api/admin/totp/verify — 민감 메뉴 진입 시 OTP 확인.
 *
 * body { code } : 6자리 TOTP 또는 백업코드(XXXX-XXXX).
 * 성공 시 10분짜리 admin_otp 서명 쿠키를 발급 → 4개 민감 메뉴 API 통과.
 * 백업코드는 일회용 — 사용 즉시 저장 해시에서 제거한다.
 */
import { loadAdminSession } from '../../../_shared/admin-permissions.js';
import { verifyTotp, matchBackupCode } from '../../../_shared/totp.js';
import { enforceRateLimit, rateLimitResponse } from '../../../_shared/rate-limit.js';
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

  const rl = await enforceRateLimit(env, { route: 'totp-verify', identity: 'u' + session.uid, limit: 10, windowSeconds: 60 });
  if (!rl.ok) return rateLimitResponse(rl, '시도가 너무 많습니다. 잠시 후 다시 시도하세요.');

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const code = String(body.code || '').trim();

  const row = await env.DB.prepare(
    `SELECT totp_secret, totp_enabled, totp_backup_codes FROM admin_users WHERE id = ?`
  ).bind(session.uid).first();
  if (!row || !Number(row.totp_enabled) || !row.totp_secret) {
    return json({ error: 'not_enrolled', reason: '2단계 인증이 설정되어 있지 않습니다.' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  let ok = await verifyTotp(row.totp_secret, code, now, { window: 1 });
  let usedBackup = false;
  if (!ok) {
    const matched = await matchBackupCode(row.totp_backup_codes, code);
    if (matched) {
      ok = true; usedBackup = true;
      // 일회용 소비 — 사용된 해시 제거
      let list = [];
      try { list = JSON.parse(row.totp_backup_codes) || []; } catch (_) { list = []; }
      list = list.filter((h) => h !== matched);
      await env.DB.prepare(`UPDATE admin_users SET totp_backup_codes = ? WHERE id = ?`)
        .bind(JSON.stringify(list), session.uid).run();
    }
  }
  if (!ok) return json({ error: 'bad_code', reason: '코드가 올바르지 않습니다.' }, 401);

  const token = await issueOtpToken(env.ADMIN_SECRET, session.uid);
  return json({ ok: true, used_backup: usedBackup }, 200, { 'Set-Cookie': buildOtpCookie(token) });
}
