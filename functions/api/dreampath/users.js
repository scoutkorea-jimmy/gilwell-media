/**
 * Dreampath · User Management (admin only)
 * GET    /api/dreampath/users          — list all users
 * POST   /api/dreampath/users          — create user
 * PUT    /api/dreampath/users?id=N     — update user
 * DELETE /api/dreampath/users?id=N     — delete user
 */

const enc = s => new TextEncoder().encode(s);
const PBKDF2_ITERATIONS = 100000;
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: PBKDF2_ITERATIONS,
  }, baseKey, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function requireAdmin(data) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  return null;
}

export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  if (url.searchParams.get('picker') === '1') {
    // Any authenticated user can get basic user list for approver picker
    const rows = await env.DB.prepare(
      `SELECT id, display_name FROM dp_users WHERE is_active = 1 ORDER BY display_name ASC`
    ).all();
    return json({ users: rows.results || [] });
  }
  const err = requireAdmin(data); if (err) return err;
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, u.email, u.phone, u.department,
            u.is_active, u.created_at, u.last_login_at,
            u.preset_id, p.name AS preset_name, p.slug AS preset_slug
       FROM dp_users u
  LEFT JOIN dp_permission_presets p ON p.id = u.preset_id
    ORDER BY u.role DESC, u.username ASC`
  ).all();
  return json({ users: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { username, display_name, password, role, email, phone, department, preset_id } = body;
  if (!username || !display_name || !password) return json({ error: 'username, display_name, and password are required.' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);

  const safeUsername = username.trim().toLowerCase().slice(0, 50);
  const existing = await env.DB.prepare(`SELECT id FROM dp_users WHERE username = ?`).bind(safeUsername).first();
  if (existing) return json({ error: `Username "${safeUsername}" is already taken.` }, 409);

  const hash = await hashPassword(password);
  const safeRole = role === 'admin' ? 'admin' : 'member';
  const pid = preset_id ? parseInt(preset_id, 10) : null;
  const safePresetId = Number.isFinite(pid) ? pid : null;

  const result = await env.DB.prepare(
    `INSERT INTO dp_users (username, display_name, password_hash, role, email, phone, department, preset_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    safeUsername,
    display_name.trim().slice(0, 100),
    hash, safeRole,
    email ? email.trim().slice(0, 200) : null,
    phone ? phone.trim().slice(0, 50) : null,
    department ? department.trim().slice(0, 100) : null,
    safePresetId
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
  if (body.preset_id !== undefined) {
    const pid = body.preset_id ? parseInt(body.preset_id, 10) : null;
    fields.push('preset_id = ?'); values.push(Number.isFinite(pid) ? pid : null);
  }
  if (body.new_password) {
    const hash = await hashPassword(body.new_password);
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
