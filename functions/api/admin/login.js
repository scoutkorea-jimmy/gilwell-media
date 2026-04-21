/**
 * Gilwell Media · Admin Login
 * POST /api/admin/login
 *
 * Body:   { "username"?: "owner", "password": "..." }
 * Returns 200: { "token": "...", "role": "full"|"member", "user": {...} }
 * Returns 401: { "error": "..." }
 *
 * Phase 2 behavior:
 *   1. `username` defaults to 'owner' when omitted (legacy UI compatibility).
 *   2. Look up admin_users by username. Active row → verify password hash.
 *   3. If no row AND username === 'owner', fall back to:
 *        a) settings.admin_password_hash (pre-Phase-2 stored hash)
 *        b) env.ADMIN_PASSWORD (bootstrap secret)
 *      On success, lazy-seed the owner row with this password hashed fresh.
 *      This makes first sign-in after Phase 2 upgrade transparent.
 *   4. Tokens now carry { uid, username, role }. Permissions are resolved
 *      server-side per request from admin_users.permissions.
 *
 * Required Cloudflare secrets:
 *   ADMIN_PASSWORD  — bootstrap password (retained for disaster recovery)
 *   ADMIN_SECRET    — HMAC signing key
 */
import {
  buildAdminSessionCookie,
  createToken,
  hashAdminPassword,
  loadAdminPasswordHash,
  safeCompare,
  verifyAdminPasswordHash,
} from '../../_shared/auth.js';
import { loadAdminUserByUsername } from '../../_shared/admin-users.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 900; // 15 minutes

async function getRateLimit(env, key) {
  try {
    const row = await env.DB.prepare(
      `SELECT attempt_count, first_attempt_at
         FROM admin_login_attempts
        WHERE ip = ?`
    ).bind(key).first();
    if (!row) return { count: 0, first: 0 };
    return {
      count: parseInt(row.attempt_count, 10) || 0,
      first: parseInt(row.first_attempt_at, 10) || 0,
    };
  } catch { return { count: 0, first: 0 }; }
}

async function incrementRateLimit(env, key) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await getRateLimit(env, key);
    const nextCount = existing.count > 0 ? existing.count + 1 : 1;
    const firstAttemptAt = existing.count > 0 && existing.first ? existing.first : now;
    await env.DB.prepare(
      `INSERT INTO admin_login_attempts (ip, attempt_count, first_attempt_at)
       VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         first_attempt_at = excluded.first_attempt_at`
    ).bind(key, nextCount, firstAttemptAt).run();
  } catch {}
}

async function clearRateLimit(env, key) {
  try {
    await env.DB.prepare(`DELETE FROM admin_login_attempts WHERE ip = ?`)
      .bind(key).run();
  } catch {}
}

function normalizeUsername(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase();
}

function jwtRoleFor(userRow) {
  return userRow && userRow.role === 'owner' ? 'full' : 'member';
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
    return json({ error: 'Server not configured. Set ADMIN_PASSWORD and ADMIN_SECRET secrets.' }, 500);
  }

  // Parse body early so we have username for rate-limit key
  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const username = normalizeUsername(body && body.username) || 'owner';
  const password = body && body.password;
  const cfToken = body && body.cf_turnstile_response;

  if (!password || typeof password !== 'string') {
    return json({ error: '비밀번호를 입력해주세요' }, 400);
  }

  // Rate limit by ip+username to prevent per-account brute force without
  // locking the whole IP on one typo.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `${ip}:${username}`;
  const rl = await getRateLimit(env, rlKey);
  const now = Math.floor(Date.now() / 1000);

  if (rl.count > 0 && (now - rl.first) >= WINDOW_SECONDS) {
    await clearRateLimit(env, rlKey);
  } else if (rl.count >= MAX_ATTEMPTS) {
    const retry = WINDOW_SECONDS - (now - rl.first);
    return json({ error: `너무 많은 시도입니다. ${Math.ceil(retry / 60)}분 후 다시 시도해주세요.` }, 429);
  }

  const turnstileOk = await verifyTurnstile(cfToken, env);
  if (!turnstileOk) {
    return json({ error: 'CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.' }, 400);
  }

  let sessionUser = null;

  const userRow = await loadAdminUserByUsername(env, username);
  if (userRow) {
    if (userRow.status === 'disabled') {
      await logOperationalEvent(env, {
        channel: 'admin', type: 'admin_login_blocked', level: 'warn',
        actor: username, ip, path: '/api/admin/login',
        message: `비활성화된 계정 로그인 시도 (${username})`,
      });
      return json({ error: '비활성화된 계정입니다. 관리자에게 문의해주세요.' }, 403);
    }
    if (userRow.status === 'active') {
      let stored = null;
      try { stored = JSON.parse(userRow.password_hash || 'null'); } catch {}
      const ok = stored ? await verifyAdminPasswordHash(password, stored) : false;
      if (ok) sessionUser = userRow;
    }
  } else if (username === 'owner') {
    // Bootstrap path — only accept on the canonical 'owner' username so
    // attackers can't use arbitrary usernames to probe the env secret.
    const legacyHash = await loadAdminPasswordHash(env);
    const ok = legacyHash
      ? await verifyAdminPasswordHash(password, legacyHash)
      : safeCompare(password, env.ADMIN_PASSWORD);
    if (ok) {
      try {
        const nextHash = await hashAdminPassword(password);
        const insert = await env.DB.prepare(
          `INSERT INTO admin_users (username, display_name, password_hash, role, permissions, status, must_change_password)
           VALUES (?, ?, ?, 'owner', ?, 'active', 0)`
        ).bind(
          'owner',
          'Owner',
          JSON.stringify(nextHash),
          JSON.stringify({ access_admin: true, permissions: [] })
        ).run();
        const ownerId = insert && insert.meta && insert.meta.last_row_id;
        sessionUser = {
          id: ownerId,
          username: 'owner',
          display_name: 'Owner',
          role: 'owner',
          status: 'active',
          must_change_password: 0,
        };
        await logOperationalEvent(env, {
          channel: 'admin', type: 'admin_owner_bootstrapped', level: 'info',
          actor: 'owner', ip, path: '/api/admin/login',
          message: '관리자 계정 자동 생성 (lazy bootstrap from env.ADMIN_PASSWORD)',
        });
      } catch (err) {
        console.error('Owner lazy-seed failed:', err);
        // Fall through to auth failure — safer than letting them in without a row.
      }
    }
  }

  if (!sessionUser) {
    await incrementRateLimit(env, rlKey);
    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_login_failed', level: 'warn',
      actor: username, ip, path: '/api/admin/login',
      message: `관리자 로그인 실패 (${username})`,
    });
    await new Promise(r => setTimeout(r, 400));
    return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401);
  }

  await clearRateLimit(env, rlKey);

  try {
    await env.DB.prepare(
      `UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`
    ).bind(sessionUser.id).run();
  } catch {}

  const role = jwtRoleFor(sessionUser);
  const token = await createToken(env.ADMIN_SECRET, {
    role,
    uid: sessionUser.id,
    username: sessionUser.username,
  });

  await logOperationalEvent(env, {
    channel: 'admin', type: 'admin_login_success', level: 'info',
    actor: sessionUser.username, ip, path: '/api/admin/login',
    message: `관리자 로그인 성공 (${sessionUser.username} / ${sessionUser.role})`,
  });

  return json({
    token,
    role,
    user: {
      id: sessionUser.id,
      username: sessionUser.username,
      display_name: sessionUser.display_name,
      role: sessionUser.role,
      must_change_password: !!sessionUser.must_change_password,
    },
  }, 200, {
    'Set-Cookie': buildAdminSessionCookie(token, 86400, role),
  });
}

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
  return new Response(JSON.stringify(data), { status, headers });
}
