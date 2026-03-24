/**
 * Dreampath · User Management (admin only)
 * GET    /api/dreampath/users          — list all users
 * POST   /api/dreampath/users          — create user
 * PUT    /api/dreampath/users?id=N     — update user
 * DELETE /api/dreampath/users?id=N     — delete user
 */

const enc = s => new TextEncoder().encode(s);
async function hashPassword(password, secret) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function requireAdmin(data) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  return null;
}

export async function onRequestGet({ env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const rows = await env.DB.prepare(
    `SELECT id, username, display_name, role, email, phone, department, is_active, created_at FROM dp_users ORDER BY role DESC, username ASC`
  ).all();
  return json({ users: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { username, display_name, password, role, email, phone, department } = body;
  if (!username || !display_name || !password) return json({ error: 'username, display_name, and password are required.' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);

  const safeUsername = username.trim().toLowerCase().slice(0, 50);
  const existing = await env.DB.prepare(`SELECT id FROM dp_users WHERE username = ?`).bind(safeUsername).first();
  if (existing) return json({ error: `Username "${safeUsername}" is already taken.` }, 409);

  const hash = await hashPassword(password, env.DREAMPATH_SECRET);
  const safeRole = role === 'admin' ? 'admin' : 'member';

  const result = await env.DB.prepare(
    `INSERT INTO dp_users (username, display_name, password_hash, role, email, phone, department)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    safeUsername,
    display_name.trim().slice(0, 100),
    hash, safeRole,
    email ? email.trim().slice(0, 200) : null,
    phone ? phone.trim().slice(0, 50) : null,
    department ? department.trim().slice(0, 100) : null
  ).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  // Prevent editing yourself via this endpoint (use /me instead)
  if (id === data.dpUser.uid) return json({ error: 'Use /api/dreampath/me to edit your own account.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];

  if (body.display_name !== undefined) { fields.push('display_name = ?'); values.push(body.display_name.trim().slice(0, 100)); }
  if (body.email !== undefined) { fields.push('email = ?'); values.push(body.email ? body.email.trim().slice(0, 200) : null); }
  if (body.phone !== undefined) { fields.push('phone = ?'); values.push(body.phone ? body.phone.trim().slice(0, 50) : null); }
  if (body.department !== undefined) { fields.push('department = ?'); values.push(body.department ? body.department.trim().slice(0, 100) : null); }
  if (body.role !== undefined) { fields.push('role = ?'); values.push(body.role === 'admin' ? 'admin' : 'member'); }
  if (body.is_active !== undefined) { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
  if (body.new_password) {
    const hash = await hashPassword(body.new_password, env.DREAMPATH_SECRET);
    fields.push('password_hash = ?');
    values.push(hash);
  }

  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE dp_users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  if (id === data.dpUser.uid) return json({ error: 'Cannot delete your own account.' }, 400);

  // Check not deleting jimmy
  const target = await env.DB.prepare(`SELECT username FROM dp_users WHERE id = ?`).bind(id).first();
  if (target?.username === 'jimmy') return json({ error: 'Cannot delete the primary admin account.' }, 400);

  await env.DB.prepare(`DELETE FROM dp_users WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
