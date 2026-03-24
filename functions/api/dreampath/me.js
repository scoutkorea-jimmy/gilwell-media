/**
 * Dreampath · My Account
 * GET /api/dreampath/me           — current user profile
 * PUT /api/dreampath/me           — change own password
 */

const enc = s => new TextEncoder().encode(s);
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
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ env, data }) {
  const user = await env.DB.prepare(
    `SELECT id, username, display_name, role, email, phone, department, created_at FROM dp_users WHERE id = ?`
  ).bind(data.dpUser.uid).first();
  if (!user) return json({ error: 'User not found.' }, 404);
  return json({ user });
}

export async function onRequestPut({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { current_password, new_password } = body;
  if (!current_password || !new_password) return json({ error: 'current_password and new_password are required.' }, 400);
  if (new_password.length < 6) return json({ error: 'New password must be at least 6 characters.' }, 400);

  const user = await env.DB.prepare(`SELECT password_hash FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
  if (!user) return json({ error: 'User not found.' }, 404);

  // Allow if hash is null (first login bootstrap for jimmy) OR hash matches
  if (user.password_hash) {
    const currentHash = await hashPassword(current_password, env.DREAMPATH_SECRET);
    if (!safeCompare(currentHash, user.password_hash)) {
      return json({ error: 'Current password is incorrect.' }, 401);
    }
  }

  const newHash = await hashPassword(new_password, env.DREAMPATH_SECRET);
  await env.DB.prepare(`UPDATE dp_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(newHash, data.dpUser.uid).run();
  return json({ ok: true });
}
