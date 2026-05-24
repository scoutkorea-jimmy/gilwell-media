/**
 * Gilwell Media · Admin Login
 * POST /api/admin/login
 *
 * Body:   { "username"?: "owner", "password": "..." }
 * Returns 200: { "token": "...", "role": "full"|"member", "user": {...} }
 * Returns 401/403/429/400: { "error": "...", "code": "rejected"|"throttled"|"bad_request"|"server_unavailable" }
 *
 * Security model (2026-05-20 update):
 *   - Rate limit is per-IP with **exponential backoff**: after 3 consecutive
 *     failures the next attempt is blocked for 60s, then 120s, 240s, 480s,
 *     …, doubling each subsequent failure (cap 24h).
 *   - Counter resets on (a) any successful login or (b) 72h with no attempt.
 *   - All authentication-rejection responses share the SAME opaque code
 *     `"rejected"` and message — wrong-password, disabled-account,
 *     no-admin-access, and email-style input are indistinguishable to the
 *     caller. Detailed reasons stay in `operational_events` for audit.
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
import { loadAdminUserByUsername, parsePermissions } from '../../_shared/admin-users.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';

// --- Backoff constants ----------------------------------------------------
//   FAIL_FREE_ATTEMPTS — how many failures trigger no wait (allows for the
//                       occasional typo without locking out).
//   BASE_DELAY_SECONDS — first wait once backoff kicks in.
//   MAX_DELAY_SECONDS  — upper bound on a single wait (24 h prevents lockout
//                       from compounding past the natural idle reset).
//   IDLE_RESET_SECONDS — no attempt for this long → counter wiped to 0 on
//                       the next request (regardless of failure history).
const FAIL_FREE_ATTEMPTS = 3;
const BASE_DELAY_SECONDS = 60;
const MAX_DELAY_SECONDS = 24 * 60 * 60; // 24h
const IDLE_RESET_SECONDS = 72 * 60 * 60; // 72h

function requiredDelaySeconds(attemptCount) {
  if (attemptCount < FAIL_FREE_ATTEMPTS) return 0;
  const power = attemptCount - FAIL_FREE_ATTEMPTS;
  // 60 * 2^power; clamp to avoid Number overflow and exceed MAX.
  const safePower = Math.min(power, 24); // 60 * 2^24 ≈ 1B s; cap before that
  const delay = BASE_DELAY_SECONDS * Math.pow(2, safePower);
  return Math.min(delay, MAX_DELAY_SECONDS);
}

async function getRateLimit(env, key) {
  try {
    const row = await env.DB.prepare(
      `SELECT attempt_count, first_attempt_at, last_attempt_at
         FROM admin_login_attempts
        WHERE ip = ?`
    ).bind(key).first();
    if (!row) return { count: 0, first: 0, last: 0 };
    return {
      count: parseInt(row.attempt_count, 10) || 0,
      first: parseInt(row.first_attempt_at, 10) || 0,
      last: parseInt(row.last_attempt_at, 10) || 0,
    };
  } catch { return { count: 0, first: 0, last: 0 }; }
}

async function recordFailedAttempt(env, key) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await getRateLimit(env, key);
    const nextCount = existing.count > 0 ? existing.count + 1 : 1;
    const firstAttemptAt = existing.count > 0 && existing.first ? existing.first : now;
    await env.DB.prepare(
      `INSERT INTO admin_login_attempts (ip, attempt_count, first_attempt_at, last_attempt_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         first_attempt_at = excluded.first_attempt_at,
         last_attempt_at = excluded.last_attempt_at`
    ).bind(key, nextCount, firstAttemptAt, now).run();
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

// Opaque "rejected" response — never reveal which auth check failed.
// `reasonForAudit` is logged to operational_events but never returned to the
// caller. `extraLog` lets the caller add account/path-level context.
async function rejected(env, request, ip, username, reasonForAudit, extraLog) {
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'admin_login_failed',
    level: 'warn',
    actor: username || null,
    ip,
    path: '/api/admin/login',
    message: reasonForAudit || '관리자 로그인 실패',
    details: extraLog || undefined,
  });
  // Constant-ish timing — small randomized delay frustrates timing oracles.
  await new Promise(r => setTimeout(r, 350 + Math.floor(Math.random() * 200)));
  return json({ error: '로그인할 수 없습니다.', code: 'rejected' }, 401);
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
    return json({ error: '서버 설정이 완료되지 않았습니다.', code: 'server_unavailable' }, 500);
  }

  // Parse body — opaque on malformed JSON.
  let body;
  try { body = await request.json(); } catch {
    return json({ error: '잘못된 요청입니다.', code: 'bad_request' }, 400);
  }
  const username = normalizeUsername(body && body.username) || 'owner';
  const password = body && body.password;
  const cfToken = body && body.cf_turnstile_response;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (!password || typeof password !== 'string') {
    return json({ error: '잘못된 요청입니다.', code: 'bad_request' }, 400);
  }

  // Rate limit by IP only — random-password sprays from one source are the
  // threat model the operator asked us to defend against. The per-account
  // dimension lives in operational_events for audit, not in the lockout key.
  const rlKey = ip;
  let rl = await getRateLimit(env, rlKey);
  const now = Math.floor(Date.now() / 1000);

  // Idle reset: 72h with no further attempts wipes the counter clean.
  if (rl.count > 0 && rl.last && (now - rl.last) >= IDLE_RESET_SECONDS) {
    await clearRateLimit(env, rlKey);
    rl = { count: 0, first: 0, last: 0 };
  }

  // Backoff gate: if the next allowed attempt is still in the future, block.
  if (rl.count >= FAIL_FREE_ATTEMPTS && rl.last) {
    const delay = requiredDelaySeconds(rl.count);
    const earliest = rl.last + delay;
    if (now < earliest) {
      const retryAfter = earliest - now;
      await logOperationalEvent(env, {
        channel: 'admin', type: 'admin_login_throttled', level: 'warn',
        actor: username, ip, path: '/api/admin/login',
        message: '관리자 로그인 차단 (지수 백오프)',
        details: { attempt_count: rl.count, retry_after_seconds: retryAfter },
      });
      return json(
        { error: '잠시 후 다시 시도해주세요.', code: 'throttled', retry_after: retryAfter },
        429,
        { 'Retry-After': String(retryAfter) }
      );
    }
  }

  const turnstileOk = await verifyTurnstile(cfToken, env);
  if (!turnstileOk) {
    // CAPTCHA failure is a separate signal — it's not a credential test, so
    // it doesn't increment the backoff counter, but it shares the opaque
    // rejection envelope so probes can't distinguish "wrong password" from
    // "missing CAPTCHA" by error code.
    return rejected(env, request, ip, username, '관리자 로그인 실패 — CAPTCHA');
  }

  // Email-style input — historically returned a hint; now silently rejected
  // (with audit note) to avoid leaking that admin_users keys on local-part.
  if (username.indexOf('@') >= 0) {
    await recordFailedAttempt(env, rlKey);
    return rejected(env, request, ip, username, '관리자 로그인 실패 — 이메일 형식 입력');
  }

  let sessionUser = null;
  const userRow = await loadAdminUserByUsername(env, username);
  if (userRow) {
    if (userRow.status === 'disabled') {
      // Disabled account looks identical to wrong password externally.
      await recordFailedAttempt(env, rlKey);
      return rejected(env, request, ip, username, '관리자 로그인 실패 — 비활성화된 계정');
    }
    if (userRow.status === 'active') {
      let stored = null;
      try { stored = JSON.parse(userRow.password_hash || 'null'); } catch {}
      const ok = stored ? await verifyAdminPasswordHash(password, stored) : false;
      if (ok) sessionUser = userRow;
    }
  } else if (username === 'owner') {
    // Bootstrap path — only on the canonical 'owner' username so attackers
    // can't probe env.ADMIN_PASSWORD against arbitrary usernames.
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
    await recordFailedAttempt(env, rlKey);
    return rejected(env, request, ip, username, '관리자 로그인 실패 — 자격 증명 불일치');
  }

  // Phase 5 gate: reject members whose `permissions.access_admin` is false.
  // Without this, the user's credential is valid but every admin API returns
  // 401/403, causing an infinite login-kick loop after a successful sign-in.
  // Owner role bypasses this check unconditionally.
  if (sessionUser.role !== 'owner') {
    const parsed = parsePermissions(sessionUser.permissions);
    if (!parsed.access_admin) {
      // Valid credential but no admin access — treat as a rejection from
      // the caller's POV (same code + message). Does NOT increment the
      // backoff counter — the user proved they own the account.
      return rejected(env, request, ip, sessionUser.username, '관리자 로그인 거부 — 관리자 접근 권한 없음');
    }
  }

  // Success → wipe the counter for this IP.
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
    // Login IP is sealed into the token so /api/admin/session-grace can verify
    // a refresh comes from the same network within the 10-minute window.
    ip,
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
  return json({ error: '잘못된 요청입니다.', code: 'bad_request' }, 405);
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
