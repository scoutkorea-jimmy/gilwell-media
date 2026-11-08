/**
 * Dreampath · PMO Decision Log
 * GET    /api/dreampath/decisions           (view:notes)
 * POST   /api/dreampath/decisions           (write:notes)
 * PUT    /api/dreampath/decisions?id=N      (write:notes)
 * DELETE /api/dreampath/decisions?id=N      (write:notes)
 *
 * Decision Log starts on the existing Notes/Issues permission surface so
 * current presets keep working while PMO features are added one by one.
 */

import { requirePerm } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STATUSES = ['active', 'closed', 'superseded'];

function str(value, max, fallback = null) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : fallback;
}

async function relatedPostExists(env, id) {
  if (!id) return null;
  const safeId = parseInt(id, 10) || 0;
  if (!safeId) return null;
  const row = await env.DB.prepare(`SELECT id FROM dp_board_posts WHERE id = ?`).bind(safeId).first();
  return row ? safeId : null;
}

export async function onRequestGet({ env, data }) {
  const denied = requirePerm(data, 'view:notes'); if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT d.id, d.title, d.decision, d.context, d.impact, d.status,
            d.decided_by, d.decision_date, d.next_review_date, d.related_post_id,
            d.created_at, d.updated_at,
            p.title AS related_post_title,
            p.board AS related_post_board
       FROM dp_decisions d
       LEFT JOIN dp_board_posts p ON p.id = d.related_post_id
      ORDER BY
        CASE d.status WHEN 'active' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END,
        date(d.decision_date) DESC,
        datetime(d.created_at) DESC`
  ).all();
  return json({ decisions: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const denied = requirePerm(data, 'write:notes'); if (denied) return denied;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const title = str(body.title, 200);
  const decision = str(body.decision, 5000);
  if (!title || !decision) return json({ error: 'Title and decision are required.' }, 400);

  const status = VALID_STATUSES.includes(body.status) ? body.status : 'active';
  const relatedPostId = await relatedPostExists(env, body.related_post_id);
  const decidedBy = data.dpUser?.name || data.dpUser?.username || 'Anonymous';

  const result = await env.DB.prepare(
    `INSERT INTO dp_decisions
      (title, decision, context, impact, status, decided_by, decision_date, next_review_date, related_post_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title,
    decision,
    str(body.context, 5000),
    str(body.impact, 2000),
    status,
    decidedBy,
    str(body.decision_date, 20, new Date().toISOString().slice(0, 10)),
    str(body.next_review_date, 20),
    relatedPostId
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
  if (body.title !== undefined) { fields.push('title = ?'); values.push(str(body.title, 200, 'Untitled decision')); }
  if (body.decision !== undefined) { fields.push('decision = ?'); values.push(str(body.decision, 5000, '')); }
  if (body.context !== undefined) { fields.push('context = ?'); values.push(str(body.context, 5000)); }
  if (body.impact !== undefined) { fields.push('impact = ?'); values.push(str(body.impact, 2000)); }
  if (body.status !== undefined && VALID_STATUSES.includes(body.status)) { fields.push('status = ?'); values.push(body.status); }
  if (body.decision_date !== undefined) { fields.push('decision_date = ?'); values.push(str(body.decision_date, 20, new Date().toISOString().slice(0, 10))); }
  if (body.next_review_date !== undefined) { fields.push('next_review_date = ?'); values.push(str(body.next_review_date, 20)); }
  if (body.related_post_id !== undefined) {
    fields.push('related_post_id = ?');
    values.push(await relatedPostExists(env, body.related_post_id));
  }
  if (!fields.length) return json({ error: 'No fields to update.' }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE dp_decisions SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requirePerm(data, 'write:notes'); if (denied) return denied;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_decisions WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
