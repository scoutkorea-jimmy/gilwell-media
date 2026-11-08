/**
 * Dreampath · API Middleware v2
 * Verifies JWT for all /api/dreampath/* except /auth
 * Attaches parsed token payload to context.data.dpUser
 */

const enc = s => new TextEncoder().encode(s);
function b64urlToBuf(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.sub !== 'dreampath') return null;
    const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlToBuf(sig), enc(`${header}.${payload}`));
    if (!valid) return null;
    return { uid: parsed.uid, username: parsed.username, role: parsed.role, name: parsed.name, exp: parsed.exp };
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest({ request, env, next, data }) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/auth')) return next();
  if (request.method === 'OPTIONS') return next();

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : readCookie(request, 'dp_token');

  if (!token || !env.DREAMPATH_SECRET) return json({ error: 'Authentication required.' }, 401);

  const user = await verifyToken(token, env.DREAMPATH_SECRET);
  if (!user) return json({ error: 'Session expired or invalid. Please log in again.' }, 401);

  // Load the user's current role + preset permissions from D1 so handlers
  // don't have to re-query and the JWT can stay lean. Admin role bypasses
  // preset checks entirely. Members without a preset get an EMPTY permission
  // set — deny-by-default, regression from the earlier "no preset = all view"
  // fallback that leaked access when an owner forgot to assign a preset.
  let permissions = [];
  let currentRole = user.role;
  let presetId = null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.role, u.preset_id, u.is_active, p.permissions AS preset_perms
         FROM dp_users u
    LEFT JOIN dp_permission_presets p ON p.id = u.preset_id
        WHERE u.id = ?`
    ).bind(user.uid).first();
    if (row) {
      if (row.is_active === 0) return json({ error: 'Your account has been disabled.' }, 403);
      currentRole = row.role || user.role;
      presetId = row.preset_id || null;
      if (row.preset_perms) {
        try {
          const parsed = JSON.parse(row.preset_perms);
          if (Array.isArray(parsed.permissions)) permissions = parsed.permissions;
        } catch (_) {}
      }
    }
  } catch (_) {
    // Fail CLOSED on transient DB errors — the alternative is silently
    // granting access during outages, which undermines the whole gate.
    return json({ error: 'Permission service unavailable. Try again shortly.' }, 503);
  }

  data.dpUser = {
    ...user,
    role: currentRole,
    preset_id: presetId,
    permissions,
  };
  return next();
}

function readCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    if (part.slice(0, eqIdx).trim() !== name) continue;
    return decodeURIComponent(part.slice(eqIdx + 1));
  }
  return null;
}
