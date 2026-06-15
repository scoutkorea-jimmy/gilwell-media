/**
 * /api/admin/totp  — 2단계 인증(TOTP) 등록 상태·시작·해제 (본인 계정)
 *
 *   GET    현재 사용자의 등록 상태 { enrolled, otp_active, legacy }
 *   POST   등록 시작 — 새 시크릿 생성(pending, 미활성) → { secret, secret_grouped, otpauth }
 *          (확인은 /api/admin/totp/confirm 에서 첫 코드 검증 후 활성화)
 *   DELETE 해제 — body { code } 유효한 TOTP/백업코드 필요(세션 탈취 방어)
 *
 * 시크릿은 admin_users.totp_secret(base32)에 저장. 백업코드는 SHA-256 해시 저장.
 */
import { loadAdminSession } from '../../../_shared/admin-permissions.js';
import { generateSecret, otpauthUri, verifyTotp, matchBackupCode } from '../../../_shared/totp.js';
import { readCookie } from '../../../_shared/auth.js';
import { OTP_COOKIE, readOtpToken } from '../../../_shared/otp-session.js';

const ISSUER = 'BP미디어 관리자';

function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extraHeaders || {}),
  });
}
function group4(s) { return String(s || '').replace(/(.{4})/g, '$1 ').trim(); }

async function requireSelf(request, env) {
  const session = await loadAdminSession(request, env);
  if (!session) return { session: null, error: json({ error: 'unauthorized', reason: '로그인이 필요합니다.' }, 401) };
  if (!session.uid) return { session, error: json({ error: 'legacy_session', reason: '계정으로 로그인해야 2단계 인증을 설정할 수 있습니다.' }, 400) };
  return { session, error: null };
}

export async function onRequestGet({ request, env }) {
  const { session, error } = await requireSelf(request, env);
  if (error) return error;
  const row = await env.DB.prepare(`SELECT totp_enabled FROM admin_users WHERE id = ?`).bind(session.uid).first();
  const enrolled = !!(row && Number(row.totp_enabled));
  let otpActive = false;
  if (enrolled) {
    const cookie = readCookie(request, OTP_COOKIE);
    otpActive = !!(cookie && await readOtpToken(cookie, env.ADMIN_SECRET, session.uid));
  }
  return json({ enrolled, otp_active: otpActive, legacy: false, username: session.username });
}

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireSelf(request, env);
  if (error) return error;
  // 이미 활성화된 경우 재시작 금지(해제 후 다시).
  const row = await env.DB.prepare(`SELECT totp_enabled FROM admin_users WHERE id = ?`).bind(session.uid).first();
  if (row && Number(row.totp_enabled)) {
    return json({ error: 'already_enabled', reason: '이미 2단계 인증이 켜져 있습니다. 먼저 해제하세요.' }, 409);
  }
  const secret = generateSecret(20);
  await env.DB.prepare(
    `UPDATE admin_users SET totp_secret = ?, totp_enabled = 0, totp_backup_codes = NULL, updated_at = datetime('now') WHERE id = ?`
  ).bind(secret, session.uid).run();
  const otpauth = otpauthUri({ secret, account: session.username || ('user-' + session.uid), issuer: ISSUER });
  return json({ secret, secret_grouped: group4(secret), otpauth, issuer: ISSUER });
}

export async function onRequestDelete({ request, env }) {
  const { session, error } = await requireSelf(request, env);
  if (error) return error;
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
  if (!ok) ok = await matchBackupCode(row.totp_backup_codes, code) != null;
  if (!ok) return json({ error: 'bad_code', reason: '코드가 올바르지 않습니다.' }, 401);
  await env.DB.prepare(
    `UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL, totp_enrolled_at = NULL, updated_at = datetime('now') WHERE id = ?`
  ).bind(session.uid).run();
  return json({ ok: true });
}
