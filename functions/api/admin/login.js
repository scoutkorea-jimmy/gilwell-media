/**
 * Gilwell Media · Admin Login
 * POST /api/admin/login
 *
 * Body:   { "password": "..." }
 * Returns 200: { "token": "...", "role": "full" }
 * Returns 401: { "error": "..." }
 *
 * Required Cloudflare secrets (set in Pages dashboard):
 *   ADMIN_PASSWORD  — the admin password you choose
 *   ADMIN_SECRET    — random string for signing tokens (openssl rand -hex 32)
 */
import { buildAdminSessionCookie, createToken, safeCompare, loadAdminPasswordHash, verifyAdminPasswordHash } from '../../_shared/auth.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';

const MAX_ATTEMPTS   = 10;
const WINDOW_SECONDS = 900; // 15 minutes

async function getRateLimit(env, ip) {
  try {
    const row = await env.DB.prepare(
      `SELECT attempt_count, first_attempt_at
         FROM admin_login_attempts
        WHERE ip = ?`
    ).bind(ip).first();
    if (!row) return { count: 0, first: 0 };
    return {
      count: parseInt(row.attempt_count, 10) || 0,
      first: parseInt(row.first_attempt_at, 10) || 0,
    };
  } catch { return { count: 0, first: 0 }; }
}

async function incrementRateLimit(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await getRateLimit(env, ip);
    const nextCount = existing.count > 0 ? existing.count + 1 : 1;
    const firstAttemptAt = existing.count > 0 && existing.first ? existing.first : now;
    await env.DB.prepare(
      `INSERT INTO admin_login_attempts (ip, attempt_count, first_attempt_at)
       VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         first_attempt_at = excluded.first_attempt_at`
    ).bind(ip, nextCount, firstAttemptAt).run();
  } catch {}
}

async function clearRateLimit(env, ip) {
  try {
    await env.DB.prepare(`DELETE FROM admin_login_attempts WHERE ip = ?`)
      .bind(ip).run();
  } catch {}
}

export async function onRequestPost({ request, env }) {
  // Validate environment is configured
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
    return json({ error: 'Server not configured. Set ADMIN_PASSWORD and ADMIN_SECRET secrets.' }, 500);
  }

  // ── Rate limit check ────────────────────────────────────
  const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl  = await getRateLimit(env, ip);
  const now = Math.floor(Date.now() / 1000);

  if (rl.count > 0 && (now - rl.first) >= WINDOW_SECONDS) {
    // Window expired — clear stale entry
    await clearRateLimit(env, ip);
  } else if (rl.count >= MAX_ATTEMPTS) {
    const retry = WINDOW_SECONDS - (now - rl.first);
    return json({ error: `너무 많은 시도입니다. ${Math.ceil(retry / 60)}분 후 다시 시도해주세요.` }, 429);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { password, cf_turnstile_response } = body;
  if (!password || typeof password !== 'string') {
    return json({ error: '비밀번호를 입력해주세요' }, 400);
  }

  // Verify Turnstile CAPTCHA (skipped gracefully if TURNSTILE_SECRET not configured)
  const turnstileOk = await verifyTurnstile(cf_turnstile_response, env);
  if (!turnstileOk) {
    return json({ error: 'CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.' }, 400);
  }

  // Password verification priority:
  //   1. D1-stored hash (set via POST /api/admin/password) — this is the source
  //      of truth once the operator changes their password through the UI.
  //   2. env.ADMIN_PASSWORD — initial bootstrap only. Used when no hash exists
  //      yet (fresh deploy) or when the D1 hash record is corrupt.
  let role = null;
  const storedHash = await loadAdminPasswordHash(env);
  if (storedHash) {
    const ok = await verifyAdminPasswordHash(password, storedHash);
    if (ok) role = 'full';
  } else if (safeCompare(password, env.ADMIN_PASSWORD)) {
    role = 'full';
  }

  // Timing-safe comparison — prevents brute-force timing attacks
  if (!role) {
    await incrementRateLimit(env, ip);
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'admin_login_failed',
      level: 'warn',
      actor: 'unknown',
      ip,
      path: '/api/admin/login',
      message: '관리자 로그인 실패',
    });
    // Artificial delay further discourages automated brute-force
    await new Promise(r => setTimeout(r, 400));
    return json({ error: '비밀번호가 올바르지 않습니다' }, 401);
  }

  // Clear rate limit on success
  await clearRateLimit(env, ip);

  // Issue a signed 24-hour session token
  const token = await createToken(env.ADMIN_SECRET, role);
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'admin_login_success',
    level: 'info',
    actor: role,
    ip,
    path: '/api/admin/login',
    message: '관리자 로그인 성공',
  });
  return json({ token, role }, 200, {
    'Set-Cookie': buildAdminSessionCookie(token),
  });
}

// Only POST is allowed on this endpoint
export function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      continue;
    }
    headers.set(key, value);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}
