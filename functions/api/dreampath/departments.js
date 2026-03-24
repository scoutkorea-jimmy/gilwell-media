/**
 * Dreampath · Departments
 * GET    /api/dreampath/departments       — list (all users)
 * POST   /api/dreampath/departments       — add (admin only) { name }
 * DELETE /api/dreampath/departments?id=N  — delete (admin only)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(
    `SELECT id, name FROM dp_departments ORDER BY sort_order ASC, name ASC`
  ).all();
  return json({ departments: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { name } = body;
  if (!name || !name.trim()) return json({ error: 'name is required.' }, 400);

  const existing = await env.DB.prepare(`SELECT id FROM dp_departments WHERE name = ?`).bind(name.trim()).first();
  if (existing) return json({ error: 'Department already exists.' }, 409);

  const maxOrder = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order),0) as m FROM dp_departments`).first();
  const result = await env.DB.prepare(
    `INSERT INTO dp_departments (name, sort_order) VALUES (?, ?)`
  ).bind(name.trim().slice(0, 100), (maxOrder?.m || 0) + 1).run();

  return json({ id: result.meta.last_row_id, name: name.trim(), ok: true });
}

export async function onRequestPut({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name } = body;
  if (!name || !name.trim()) return json({ error: 'name is required.' }, 400);

  await env.DB.prepare(`UPDATE dp_departments SET name = ? WHERE id = ?`)
    .bind(name.trim().slice(0, 100), id).run();
  return json({ ok: true, name: name.trim() });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_departments WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
