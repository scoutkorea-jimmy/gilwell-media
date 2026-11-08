/**
 * Dreampath · PMO Risk / Issue Register
 * GET    /api/dreampath/risks           (view:notes)
 * POST   /api/dreampath/risks           (write:notes)
 * PUT    /api/dreampath/risks?id=N      (write:notes)
 * DELETE /api/dreampath/risks?id=N      (write:notes)
 */

import { requirePerm } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const KINDS = ['risk', 'issue', 'dependency', 'blocker'];
const STATUSES = ['open', 'monitoring', 'mitigated', 'closed'];
const LEVELS = ['low', 'medium', 'high', 'critical'];

function text(value, max, fallback = null) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : fallback;
}

async function safePostId(env, value) {
  const id = value ? parseInt(value, 10) || 0 : 0;
  if (!id) return null;
  const row = await env.DB.prepare(`SELECT id FROM dp_board_posts WHERE id = ?`).bind(id).first();
  return row ? id : null;
}

export async function onRequestGet({ env, data }) {
  const denied = requirePerm(data, 'view:notes'); if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT r.id, r.title, r.description, r.kind, r.status,
            r.probability, r.impact, r.severity, r.owner, r.mitigation,
            r.due_date, r.related_post_id, r.created_by, r.created_at, r.updated_at,
            p.title AS related_post_title,
            p.board AS related_post_board
       FROM dp_risks r
       LEFT JOIN dp_board_posts p ON p.id = r.related_post_id
      ORDER BY
        CASE r.status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 WHEN 'mitigated' THEN 2 ELSE 3 END,
        CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        datetime(r.updated_at) DESC`
  ).all();
  return json({ risks: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const denied = requirePerm(data, 'write:notes'); if (denied) return denied;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const title = text(body.title, 200);
  if (!title) return json({ error: 'Title is required.' }, 400);
  const relatedPostId = await safePostId(env, body.related_post_id);
  const result = await env.DB.prepare(
    `INSERT INTO dp_risks
      (title, description, kind, status, probability, impact, severity, owner, mitigation, due_date, related_post_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title,
    text(body.description, 5000),
    KINDS.includes(body.kind) ? body.kind : 'risk',
    STATUSES.includes(body.status) ? body.status : 'open',
    LEVELS.includes(body.probability) ? body.probability : 'medium',
    LEVELS.includes(body.impact) ? body.impact : 'medium',
    LEVELS.includes(body.severity) ? body.severity : 'medium',
    text(body.owner, 100),
    text(body.mitigation, 5000),
    text(body.due_date, 20),
    relatedPostId,
    data.dpUser?.name || data.dpUser?.username || 'Anonymous'
  ).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const denied = requirePerm(data, 'write:notes'); if (denied) return denied;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(text(body.title, 200, 'Untitled risk')); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(text(body.description, 5000)); }
  if (body.kind !== undefined && KINDS.includes(body.kind)) { fields.push('kind = ?'); values.push(body.kind); }
  if (body.status !== undefined && STATUSES.includes(body.status)) { fields.push('status = ?'); values.push(body.status); }
  if (body.probability !== undefined && LEVELS.includes(body.probability)) { fields.push('probability = ?'); values.push(body.probability); }
  if (body.impact !== undefined && LEVELS.includes(body.impact)) { fields.push('impact = ?'); values.push(body.impact); }
  if (body.severity !== undefined && LEVELS.includes(body.severity)) { fields.push('severity = ?'); values.push(body.severity); }
  if (body.owner !== undefined) { fields.push('owner = ?'); values.push(text(body.owner, 100)); }
  if (body.mitigation !== undefined) { fields.push('mitigation = ?'); values.push(text(body.mitigation, 5000)); }
  if (body.due_date !== undefined) { fields.push('due_date = ?'); values.push(text(body.due_date, 20)); }
  if (body.related_post_id !== undefined) { fields.push('related_post_id = ?'); values.push(await safePostId(env, body.related_post_id)); }
  if (!fields.length) return json({ error: 'No fields to update.' }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE dp_risks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requirePerm(data, 'write:notes'); if (denied) return denied;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_risks WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
