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
  // NOTE: `exp` is stored in milliseconds (Date.now()), not the JWT-standard seconds.
  // readToken() compares against Date.now() as well. Do not hand these tokens to
  // external JWT libraries that assume seconds without converting first.
  const payload = b64url(JSON.stringify({
    sub: 'admin',
    role: normalizeRole(role),
    exp: Date.now() + 86_400_000, // 24 h in ms
  }));
  const data = `${header}.${payload}`;
  const key  = await importKey(secret, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc(data));
  return `${data}.${bufToB64url(sigBuf)}`;
}

/**
 * Verify a session token.
 * @param {string} token   Token from Authorization header
 * @param {string} secret  ADMIN_SECRET environment variable value
 * @returns {Promise<boolean>}
 */
export async function verifyToken(token, secret) {
  const payload = await readToken(token, secret);
  return !!payload;
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

export async function verifyTokenRole(token, secret, allowedRoles = ['full']) {
  const payload = await readToken(token, secret);
  if (!payload) return false;
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(payload.role);
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
