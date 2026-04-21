/**
 * Gilwell Media · Auth Utilities
 * Works inside Cloudflare Workers (Web Crypto API).
 *
 * Token format: <base64url-header>.<base64url-payload>.<base64url-sig>
 * (A minimal JWT-like structure using HMAC-SHA256.)
 */

// ── Token lifecycle ───────────────────────────────────────────

/**
 * Create a signed session token valid for 24 hours.
 * @param {string} secret  ADMIN_SECRET environment variable value
 * @param {string} role    full
 * @returns {Promise<string>} token string
 */
export async function createToken(secret, role = 'full') {
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  // NOTE: `exp` and `iat` are stored in milliseconds (Date.now()), not the
  // JWT-standard seconds. readToken() compares against Date.now() as well.
  // Do not hand these tokens to external JWT libraries that assume seconds
  // without converting first.
  // `iat` is used to invalidate tokens issued before the admin password change
  // (see `admin_token_min_iat` setting + _isTokenFresh() below).
  const payload = b64url(JSON.stringify({
    sub: 'admin',
    role: normalizeRole(role),
    iat: Date.now(),
    exp: Date.now() + 86_400_000, // 24 h in ms
  }));
  const data = `${header}.${payload}`;
  const key  = await importKey(secret, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc(data));
  return `${data}.${bufToB64url(sigBuf)}`;
}

export async function readToken(token, secret) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, sig] = parts;
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    // Check subject
    if (parsed.sub !== 'admin') return null;

    // Verify signature
    const key = await importKey(secret, ['verify']);
    const sigBuf = b64urlToBuf(sig);
    const verified = await crypto.subtle.verify('HMAC', key, sigBuf, enc(`${header}.${payload}`));
    if (!verified) return null;
    return {
      sub: parsed.sub,
      exp: parsed.exp,
      iat: Number(parsed.iat) || 0,
      role: normalizeRole(parsed.role),
    };
  } catch {
    return null;
  }
}

export async function getTokenRole(token, secret) {
  const payload = await readToken(token, secret);
  return payload ? payload.role : null;
}

// `secretOrEnv` accepts either the raw ADMIN_SECRET string (legacy call sites)
// or a full env object. When an env is passed, tokens are additionally checked
// against `admin_token_min_iat` — allowing us to invalidate every outstanding
// session after a password change without rotating ADMIN_SECRET.
export async function verifyToken(token, secretOrEnv) {
  const { secret, env } = _resolveSecretEnv(secretOrEnv);
  const payload = await readToken(token, secret);
  if (!payload) return false;
  if (env && !(await _isTokenFresh(env, payload))) return false;
  return true;
}

export async function verifyTokenRole(token, secretOrEnv, allowedRoles = ['full']) {
  const { secret, env } = _resolveSecretEnv(secretOrEnv);
  const payload = await readToken(token, secret);
  if (!payload) return false;
  if (env && !(await _isTokenFresh(env, payload))) return false;
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(payload.role);
}

function _resolveSecretEnv(secretOrEnv) {
  if (secretOrEnv && typeof secretOrEnv === 'object') {
    return { secret: secretOrEnv.ADMIN_SECRET, env: secretOrEnv };
  }
  return { secret: secretOrEnv, env: null };
}

// Cached reader for the "minimum acceptable iat" setting. Any token whose
// `iat` predates this value was issued before the last password rotation and
// is therefore invalid. 60-second TTL keeps this cheap in hot paths.
let _minIatCache = { value: 0, loadedAt: 0 };
const _MIN_IAT_TTL_MS = 60_000;

async function _isTokenFresh(env, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!env || !env.DB) return true; // no DB binding — skip freshness
  const minIat = await _getAdminTokenMinIat(env);
  if (!minIat) return true;
  const iat = Number(payload.iat) || 0;
  return iat >= minIat;
}

async function _getAdminTokenMinIat(env) {
  const now = Date.now();
  if (_minIatCache.loadedAt && (now - _minIatCache.loadedAt) < _MIN_IAT_TTL_MS) {
    return _minIatCache.value;
  }
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'admin_token_min_iat'`
    ).first();
    const parsed = row && row.value ? parseInt(row.value, 10) : 0;
    _minIatCache = { value: Number.isFinite(parsed) ? parsed : 0, loadedAt: now };
  } catch {
    _minIatCache = { value: 0, loadedAt: now };
  }
  return _minIatCache.value;
}

// Invoked by /api/admin/password after a successful password change to boot
// every outstanding session.
export async function bumpAdminTokenEpoch(env) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('admin_token_min_iat', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(String(now)).run();
  _minIatCache = { value: now, loadedAt: Date.now() };
}

/**
 * Extract the Bearer token from a request's Authorization header.
 * @param {Request} request
 * @returns {string|null}
 */
export function extractToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return readCookie(request, 'admin_token');
}

/**
 * Timing-safe string comparison (prevents timing-based brute-force).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Always iterate over the longer string so length difference doesn't leak
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length; // non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

// ── Internal helpers ──────────────────────────────────────────

function enc(str) {
  return new TextEncoder().encode(str);
}

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function bufToB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlToBuf(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function importKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    enc(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

function normalizeRole(role) {
  return role === 'editor' ? 'editor' : 'full';
}

export function readCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eqIdx + 1));
  }
  return null;
}

export function buildAdminSessionCookie(token, maxAgeSeconds = 86400) {
  const attrs = [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return [
    `admin_token=${encodeURIComponent(token)}; ${attrs.join('; ')}`,
    `admin_session=1; Path=/; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
    `admin_role=full; Path=/; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  ];
}

export function clearAdminSessionCookie() {
  const expired = 'Path=/; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  return [
    `admin_token=; ${expired}; HttpOnly`,
    `admin_session=; ${expired}`,
    `admin_role=; ${expired}`,
  ];
}

// ── Admin password hashing (PBKDF2-HMAC-SHA256) ──────────────
// Stored in settings('admin_password_hash') as JSON:
//   {"algo":"PBKDF2-SHA256","iters":150000,"salt":"<b64url>","hash":"<b64url>"}

const PBKDF2_ITERS = 150_000;

export async function hashAdminPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await _pbkdf2(password, salt, PBKDF2_ITERS);
  return {
    algo: 'PBKDF2-SHA256',
    iters: PBKDF2_ITERS,
    salt: bufToB64url(salt),
    hash: bufToB64url(hash),
  };
}

export async function verifyAdminPasswordHash(password, stored) {
  if (!stored || typeof stored !== 'object') return false;
  if (stored.algo !== 'PBKDF2-SHA256') return false;
  const salt = b64urlToBuf(String(stored.salt || ''));
  const iters = Number(stored.iters) || PBKDF2_ITERS;
  const expected = b64urlToBuf(String(stored.hash || ''));
  if (!salt.length || !expected.length) return false;
  const computed = await _pbkdf2(password, salt, iters);
  // Constant-time compare
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= (computed[i] ^ expected[i]);
  }
  return diff === 0;
}

async function _pbkdf2(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc(String(password || '')),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}

export async function loadAdminPasswordHash(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'admin_password_hash'`
    ).first();
    if (!row || !row.value) return null;
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function storeAdminPasswordHash(env, record) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(JSON.stringify(record)).run();
}
