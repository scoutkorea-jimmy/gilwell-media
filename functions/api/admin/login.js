/**
 * Gilwell Media · Admin Login
 * POST /api/admin/login
 *
 * Body:   { "password": "..." }
 * Returns 200: { "token": "...", "role": "full|limited" }
 * Returns 401: { "error": "..." }
 *
 * Required Cloudflare secrets (set in Pages dashboard):
 *   ADMIN_PASSWORD  — the admin password you choose
 *   ADMIN_SECRET    — random string for signing tokens (openssl rand -hex 32)
 */
import { createToken, safeCompare } from '../../_shared/auth.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';

const MAX_ATTEMPTS   = 10;
const WINDOW_SECONDS = 900; // 15 minutes
const LIMITED_ADMIN_PASSWORD = 'scout1922';

async function getRateLimit(env, ip) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = ?`
    ).bind(`ratelimit:${ip}`).first();
    if (!row) return { count: 0, first: 0 };
    const parts = row.value.split(':');
    return { count: parseInt(parts[0], 10) || 0, first: parseInt(parts[1], 10) || 0 };
  } catch { return { count: 0, first: 0 }; }
}

async function incrementRateLimit(env, ip) {
  const key = `ratelimit:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = ?`
    ).bind(key).first();
    if (row) {
      const parts = row.value.split(':');
      const count = (parseInt(parts[0], 10) || 0) + 1;
      await env.DB.prepare(`UPDATE settings SET value = ? WHERE key = ?`)
        .bind(`${count}:${parts[1]}`, key).run();
    } else {
      await env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .bind(key, `1:${now}`).run();
    }
  } catch {}
}

async function clearRateLimit(env, ip) {
  try {
    await env.DB.prepare(`DELETE FROM settings WHERE key = ?`)
      .bind(`ratelimit:${ip}`).run();
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

  let role = null;
  if (safeCompare(password, env.ADMIN_PASSWORD)) {
    role = 'full';
  } else if (safeCompare(password, LIMITED_ADMIN_PASSWORD)) {
    role = 'limited';
  }

  // Timing-safe comparison — prevents brute-force timing attacks
  if (!role) {
    await incrementRateLimit(env, ip);
    // Artificial delay further discourages automated brute-force
    await new Promise(r => setTimeout(r, 400));
    return json({ error: '비밀번호가 올바르지 않습니다' }, 401);
  }

  // Clear rate limit on success
  await clearRateLimit(env, ip);

  // Issue a signed 24-hour session token
  const token = await createToken(env.ADMIN_SECRET, role);
  return json({ token, role });
}

// Only POST is allowed on this endpoint
export function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
