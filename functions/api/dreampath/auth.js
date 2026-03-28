/**
 * Dreampath · Auth v3
 * POST   /api/dreampath/auth  { username, password } → { user }
 * DELETE /api/dreampath/auth  → clears session cookie
 */

const enc = (s) => new TextEncoder().encode(s);
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const bufToB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 900;
const PBKDF2_ITERATIONS = 100000;

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

async function hashPasswordLegacy(password, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc(password));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string' || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hashPasswordModern(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: hexToBytes(saltHex),
    iterations,
  }, baseKey, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const hashHex = await hashPasswordModern(password, saltHex, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

async function verifyStoredPassword(password, storedHash, secret) {
  const value = String(storedHash || '').trim();
  if (!value) return { ok: false, upgradedHash: '' };

  if (value.startsWith('pbkdf2$')) {
    const parts = value.split('$');
    if (parts.length !== 4) return { ok: false, upgradedHash: '' };
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expected = parts[3];
    if (!Number.isFinite(iterations) || !saltHex || !expected) return { ok: false, upgradedHash: '' };
    const actual = await hashPasswordModern(password, saltHex, iterations);
    return { ok: safeCompare(actual, expected), upgradedHash: '' };
  }

  const legacy = await hashPasswordLegacy(password, secret);
  if (!safeCompare(legacy, value)) return { ok: false, upgradedHash: '' };
  return { ok: true, upgradedHash: await createPasswordHash(password) };
}

async function createToken(secret, user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: 'dreampath',
    uid: user.id,
    username: user.username,
    role: user.role,
    name: user.display_name,
    exp: Date.now() + 30 * 86_400_000,
  }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(data));
  return `${data}.${bufToB64url(sig)}`;
}

async function getRateLimit(env, ip) {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS dp_login_attempts (
        ip TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        first_attempt_at INTEGER NOT NULL DEFAULT 0
      )`
    ).run();
    const row = await env.DB.prepare(
      `SELECT attempt_count, first_attempt_at
         FROM dp_login_attempts
        WHERE ip = ?`
    ).bind(ip).first();
    if (!row) return { count: 0, first: 0 };
    return {
      count: parseInt(row.attempt_count, 10) || 0,
      first: parseInt(row.first_attempt_at, 10) || 0,
    };
  } catch {
    return { count: 0, first: 0 };
  }
}

async function incrementRateLimit(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await getRateLimit(env, ip);
    const nextCount = existing.count > 0 ? existing.count + 1 : 1;
    const firstAttemptAt = existing.count > 0 && existing.first ? existing.first : now;
    await env.DB.prepare(
      `INSERT INTO dp_login_attempts (ip, attempt_count, first_attempt_at)
       VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET
         attempt_count = excluded.attempt_count,
         first_attempt_at = excluded.first_attempt_at`
    ).bind(ip, nextCount, firstAttemptAt).run();
  } catch {}
}

async function clearRateLimit(env, ip) {
  try {
    await env.DB.prepare(`DELETE FROM dp_login_attempts WHERE ip = ?`).bind(ip).run();
  } catch {}
}

function buildSessionCookies(token, role, maxAgeSeconds = 30 * 86400) {
  const attrs = [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return [
    `dp_token=${encodeURIComponent(token)}; ${attrs.join('; ')}`,
    `dp_session=1; Path=/; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
    `dp_role=${encodeURIComponent(role || 'member')}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  ];
}

function clearSessionCookies() {
  const expired = 'Path=/; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  return [
    `dp_token=; ${expired}; HttpOnly`,
    `dp_session=; ${expired}`,
    `dp_role=; ${expired}`,
  ];
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

export async function onRequestPost({ request, env }) {
  if (!env.DREAMPATH_SECRET) {
    return json({ error: 'Server not configured. Set DREAMPATH_SECRET.' }, 500);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await getRateLimit(env, ip);
  const now = Math.floor(Date.now() / 1000);
  if (rl.count > 0 && (now - rl.first) >= WINDOW_SECONDS) {
    await clearRateLimit(env, ip);
  } else if (rl.count >= MAX_ATTEMPTS) {
    const retry = WINDOW_SECONDS - (now - rl.first);
    return json({ error: `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute(s).` }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { username, password } = body;
  if (!username || !password) return json({ error: 'Username and password are required.' }, 400);

  const safeUsername = username.trim().toLowerCase().slice(0, 50);
  const user = await env.DB.prepare(
    `SELECT id, username, display_name, password_hash, role, is_active FROM dp_users WHERE username = ?`
  ).bind(safeUsername).first();

  if (!user || !user.is_active) {
    await incrementRateLimit(env, ip);
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'Invalid username or password.' }, 401);
  }

  let upgradedHash = '';
  if (!user.password_hash && user.role === 'admin' && user.username === 'jimmy') {
    if (!env.JIMMY_PASSWORD || !safeCompare(password, env.JIMMY_PASSWORD)) {
      await incrementRateLimit(env, ip);
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: 'Invalid username or password.' }, 401);
    }
    upgradedHash = await createPasswordHash(password);
  } else {
    if (!user.password_hash) {
      await incrementRateLimit(env, ip);
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: 'Account not set up. Contact admin.' }, 401);
    }
    const verification = await verifyStoredPassword(password, user.password_hash, env.DREAMPATH_SECRET);
    if (!verification.ok) {
      await incrementRateLimit(env, ip);
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: 'Invalid username or password.' }, 401);
    }
    upgradedHash = verification.upgradedHash;
  }

  if (upgradedHash) {
    await env.DB.prepare(`UPDATE dp_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(upgradedHash, user.id).run();
  }

  await clearRateLimit(env, ip);

  const token = await createToken(env.DREAMPATH_SECRET, user);
  return json({
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
  }, 200, {
    'Set-Cookie': buildSessionCookies(token, user.role),
  });
}

export function onRequestDelete() {
  return json({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookies(),
  });
}

export function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}
