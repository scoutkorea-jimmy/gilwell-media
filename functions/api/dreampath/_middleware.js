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
    return { uid: parsed.uid, username: parsed.username, role: parsed.role, name: parsed.name };
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
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!token || !env.DREAMPATH_SECRET) return json({ error: 'Authentication required.' }, 401);

  const user = await verifyToken(token, env.DREAMPATH_SECRET);
  if (!user) return json({ error: 'Session expired or invalid. Please log in again.' }, 401);

  data.dpUser = user;
  return next();
}
