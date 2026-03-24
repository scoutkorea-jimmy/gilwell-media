/**
 * Dreampath · Auth v2
 * POST /api/dreampath/auth  { username, password } → { token, user }
 */

const enc = s => new TextEncoder().encode(s);
const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const bufToB64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < len; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

async function hashPassword(password, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createToken(secret, user) {
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  if (!env.DREAMPATH_SECRET) {
    return json({ error: 'Server not configured. Set DREAMPATH_SECRET.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { username, password } = body;
  if (!username || !password) return json({ error: 'Username and password are required.' }, 400);

  const safeUsername = username.trim().toLowerCase().slice(0, 50);

  // Fetch user
  const user = await env.DB.prepare(
    `SELECT id, username, display_name, password_hash, role, is_active FROM dp_users WHERE username = ?`
  ).bind(safeUsername).first();

  if (!user || !user.is_active) {
    await new Promise(r => setTimeout(r, 400));
    return json({ error: 'Invalid username or password.' }, 401);
  }

  // Bootstrap: if admin has no password hash yet, check JIMMY_PASSWORD env var
  if (!user.password_hash && user.role === 'admin' && user.username === 'jimmy') {
    if (!env.JIMMY_PASSWORD || !safeCompare(password, env.JIMMY_PASSWORD)) {
      await new Promise(r => setTimeout(r, 400));
      return json({ error: 'Invalid username or password.' }, 401);
    }
    // Set the hash now
    const hash = await hashPassword(password, env.DREAMPATH_SECRET);
    await env.DB.prepare(`UPDATE dp_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(hash, user.id).run();
    user.password_hash = hash;
  } else {
    // Normal password check
    if (!user.password_hash) {
      await new Promise(r => setTimeout(r, 400));
      return json({ error: 'Account not set up. Contact admin.' }, 401);
    }
    const hash = await hashPassword(password, env.DREAMPATH_SECRET);
    if (!safeCompare(hash, user.password_hash)) {
      await new Promise(r => setTimeout(r, 400));
      return json({ error: 'Invalid username or password.' }, 401);
    }
  }

  const token = await createToken(env.DREAMPATH_SECRET, user);
  return json({
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
  });
}

export function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  });
}
