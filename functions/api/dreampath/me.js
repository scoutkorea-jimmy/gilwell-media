/**
 * Dreampath · My Account
 * GET /api/dreampath/me   — current user profile
 * PUT /api/dreampath/me   — update profile fields OR change password
 *
 *  Profile update body:  { display_name?, email?, phone?, department?, role_title?, emergency_note? }
 *  Password change body: { current_password, new_password }
 */

const enc = s => new TextEncoder().encode(s);
const PBKDF2_ITERATIONS = 120000;
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < len; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
async function hashPasswordLegacy(password, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string' || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
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
  if (!value) return false;
  if (value.startsWith('pbkdf2$')) {
    const parts = value.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expected = parts[3];
    if (!Number.isFinite(iterations) || !saltHex || !expected) return false;
    const actual = await hashPasswordModern(password, saltHex, iterations);
    return safeCompare(actual, expected);
  }
  const legacy = await hashPasswordLegacy(password, secret);
  return safeCompare(legacy, value);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ env, data }) {
  const user = await env.DB.prepare(
    `SELECT id, username, display_name, role, email, phone, department,
            role_title, emergency_note, avatar_url, avatar_pos, created_at
       FROM dp_users WHERE id = ?`
  ).bind(data.dpUser.uid).first();
  if (!user) return json({ error: 'User not found.' }, 404);
  return json({ user });
}

export async function onRequestPut({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Password change
  if (body.new_password !== undefined) {
    const { current_password, new_password } = body;
    if (!current_password || !new_password) return json({ error: 'current_password and new_password are required.' }, 400);
    if (new_password.length < 6) return json({ error: 'New password must be at least 6 characters.' }, 400);

    const user = await env.DB.prepare(`SELECT password_hash FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
    if (!user) return json({ error: 'User not found.' }, 404);

    if (user.password_hash) {
      const passwordOk = await verifyStoredPassword(current_password, user.password_hash, env.DREAMPATH_SECRET);
      if (!passwordOk) {
        return json({ error: 'Current password is incorrect.' }, 401);
      }
    }

    const newHash = await createPasswordHash(new_password);
    await env.DB.prepare(`UPDATE dp_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(newHash, data.dpUser.uid).run();
    return json({ ok: true, changed: 'password' });
  }

  // Profile update
  const fields = [], values = [];
  if (body.display_name    !== undefined && body.display_name.trim())    { fields.push('display_name = ?');    values.push(body.display_name.trim().slice(0, 100)); }
  if (body.email           !== undefined) { fields.push('email = ?');           values.push(body.email?.trim()  || null); }
  if (body.phone           !== undefined) { fields.push('phone = ?');           values.push(body.phone?.trim()  || null); }
  if (body.department      !== undefined) { fields.push('department = ?');      values.push(body.department?.trim() || null); }
  if (body.role_title      !== undefined) { fields.push('role_title = ?');      values.push(body.role_title?.trim().slice(0, 100)  || null); }
  if (body.emergency_note  !== undefined) { fields.push('emergency_note = ?');  values.push(body.emergency_note?.trim().slice(0, 500) || null); }
  if (body.avatar_url !== undefined) { fields.push('avatar_url = ?'); values.push(body.avatar_url || null); }
  if (body.avatar_pos !== undefined) { fields.push('avatar_pos = ?'); values.push(body.avatar_pos || '50 50'); }

  if (!fields.length) return json({ error: 'No fields to update.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(data.dpUser.uid);

  await env.DB.prepare(`UPDATE dp_users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  // Re-fetch updated user
  const updated = await env.DB.prepare(
    `SELECT id, username, display_name, role, email, phone, department,
            role_title, emergency_note, avatar_url, avatar_pos, created_at
       FROM dp_users WHERE id = ?`
  ).bind(data.dpUser.uid).first();
  return json({ ok: true, changed: 'profile', user: updated });
}
