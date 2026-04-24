/**
 * Dreampath · Permission Presets (admin only)
 *
 * GET    /api/dreampath/presets          — list presets with user counts
 * POST   /api/dreampath/presets          — create preset
 * PUT    /api/dreampath/presets?id=N     — update preset (not builtin name/slug)
 * DELETE /api/dreampath/presets?id=N     — delete preset (builtin + assigned users block)
 */

import { requireAdmin } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function slugify(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'preset';
}

function cleanPermissions(raw) {
  // Accepts {"permissions":["view:home", ...]} OR just ["view:home", ...]
  let list;
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.permissions)) list = raw.permissions;
  else list = [];
  const allowedPrefix = /^(view|write):[a-z0-9_-]+$/i;
  const unique = Array.from(new Set(list.map(s => String(s || '').trim()).filter(s => allowedPrefix.test(s))));
  return JSON.stringify({ permissions: unique });
}

export async function onRequestGet({ env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const rows = await env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.description, p.permissions, p.is_builtin,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM dp_users u WHERE u.preset_id = p.id) AS user_count
       FROM dp_permission_presets p
     ORDER BY p.is_builtin DESC, p.name ASC`
  ).all();
  return json({ presets: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, description, permissions } = body;
  if (!name || !String(name).trim()) return json({ error: 'Name is required.' }, 400);

  const slug = slugify(body.slug || name);
  const existing = await env.DB.prepare(`SELECT id FROM dp_permission_presets WHERE slug = ?`).bind(slug).first();
  if (existing) return json({ error: `A preset with slug "${slug}" already exists.` }, 409);

  const permsJson = cleanPermissions(permissions);
  const result = await env.DB.prepare(
    `INSERT INTO dp_permission_presets (slug, name, description, permissions, is_builtin)
     VALUES (?, ?, ?, ?, 0)`
  ).bind(
    slug,
    String(name).trim().slice(0, 80),
    description ? String(description).trim().slice(0, 400) : null,
    permsJson
  ).run();
  return json({ id: result.meta.last_row_id, slug, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  const preset = await env.DB.prepare(`SELECT is_builtin FROM dp_permission_presets WHERE id = ?`).bind(id).first();
  if (!preset) return json({ error: 'Preset not found.' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];
  // Built-in presets allow permission updates but preserve name/slug identity.
  if (!preset.is_builtin) {
    if (body.name !== undefined) { fields.push('name = ?'); values.push(String(body.name).trim().slice(0, 80)); }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description ? String(body.description).trim().slice(0, 400) : null);
    }
  }
  if (body.permissions !== undefined) {
    fields.push('permissions = ?');
    values.push(cleanPermissions(body.permissions));
  }
  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE dp_permission_presets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  const preset = await env.DB.prepare(`SELECT is_builtin FROM dp_permission_presets WHERE id = ?`).bind(id).first();
  if (!preset) return json({ error: 'Preset not found.' }, 404);
  if (preset.is_builtin) return json({ error: 'Built-in presets cannot be deleted.' }, 400);

  const usage = await env.DB.prepare(`SELECT COUNT(*) AS n FROM dp_users WHERE preset_id = ?`).bind(id).first();
  if (usage && usage.n > 0) {
    return json({ error: `Cannot delete: ${usage.n} user(s) still assigned to this preset. Reassign first.` }, 409);
  }

  await env.DB.prepare(`DELETE FROM dp_permission_presets WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
