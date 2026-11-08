/**
 * Dreampath · Post drafts (per user, per board)
 *
 * Backs the "save as draft" confirmation that fires when a user abandons
 * the New Post modal with unsaved content. Drafts are scoped to
 * (user_id, board) and capped at 3 rows per pair — attempting to save a
 * 4th returns 409 with a hint so the client can prompt the user to
 * delete/overwrite an older one.
 *
 * GET    /api/dreampath/drafts?board=<slug>   — list my drafts (optionally
 *                                                scoped to a board)
 * POST   /api/dreampath/drafts                — create a new draft
 *                                                body: { board, tab_slug?, title?,
 *                                                        content?, files?,
 *                                                        approvers?,
 *                                                        overwrite_id? }
 * PUT    /api/dreampath/drafts?id=N           — update an existing draft
 * DELETE /api/dreampath/drafts?id=N           — discard
 *
 * Every row is scoped to the calling user — a draft never reads or writes
 * across accounts.
 */

import { requirePerm, boardScope, hasPerm } from '../../_shared/dreampath-perm.js';

const MAX_DRAFTS_PER_BOARD = 3;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function jsonSafe(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 100_000);
  try { return JSON.stringify(value).slice(0, 100_000); } catch { return null; }
}

export async function onRequestGet({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);
  const board = url.searchParams.get('board');
  let rows;
  if (board) {
    rows = await env.DB.prepare(
      `SELECT id, board, tab_slug, title, content, files, approvers, created_at, updated_at
         FROM dp_post_drafts WHERE user_id = ? AND board = ?
       ORDER BY updated_at DESC`
    ).bind(user.uid, board).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT id, board, tab_slug, title, content, files, approvers, created_at, updated_at
         FROM dp_post_drafts WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT 50`
    ).bind(user.uid).all();
  }
  const drafts = (rows.results || []).map(r => {
    let files = null, approvers = null;
    try { files = r.files ? JSON.parse(r.files) : null; } catch (_) { files = null; }
    try { approvers = r.approvers ? JSON.parse(r.approvers) : null; } catch (_) { approvers = null; }
    return { ...r, files, approvers };
  });
  return json({ drafts, max: MAX_DRAFTS_PER_BOARD });
}

export async function onRequestPost({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const board = String(body.board || '').trim();
  if (!board) return json({ error: 'board is required.' }, 400);
  // Require at least the view scope — author can't draft on a board they
  // can't see. (write:scope is checked at real-publish time.)
  if (!hasPerm(user, boardScope(board, 'view'))) {
    return json({ error: 'You do not have permission to draft on this board.' }, 403);
  }

  // Overwrite mode: caller passes overwrite_id to replace a specific draft.
  // Used by the client when the 3-draft cap is hit and the user opts to
  // overwrite the oldest one.
  if (body.overwrite_id) {
    const id = parseInt(body.overwrite_id, 10);
    if (!id) return json({ error: 'Invalid overwrite_id.' }, 400);
    const owner = await env.DB.prepare(
      `SELECT user_id, board FROM dp_post_drafts WHERE id = ?`
    ).bind(id).first();
    if (!owner || owner.user_id !== user.uid || owner.board !== board) {
      return json({ error: 'Draft not found.' }, 404);
    }
    await env.DB.prepare(
      `UPDATE dp_post_drafts
          SET tab_slug = ?, title = ?, content = ?, files = ?, approvers = ?, updated_at = datetime('now')
        WHERE id = ?`
    ).bind(
      body.tab_slug ? String(body.tab_slug).toLowerCase().slice(0, 40) : null,
      body.title ? String(body.title).slice(0, 200) : null,
      body.content ? String(body.content).slice(0, 100_000) : null,
      jsonSafe(body.files),
      jsonSafe(body.approvers),
      id
    ).run();
    return json({ id, ok: true, overwritten: true });
  }

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dp_post_drafts WHERE user_id = ? AND board = ?`
  ).bind(user.uid, board).first();
  if ((count && count.n) >= MAX_DRAFTS_PER_BOARD) {
    // Include the full draft list so the client can show a "which one do you
    // want to overwrite?" picker without a second round-trip.
    const existingRes = await env.DB.prepare(
      `SELECT id, title, updated_at FROM dp_post_drafts
        WHERE user_id = ? AND board = ? ORDER BY updated_at ASC`
    ).bind(user.uid, board).all();
    return json({
      error: `Draft slot full — ${MAX_DRAFTS_PER_BOARD} drafts already saved for this board. Overwrite or delete one first.`,
      existing: existingRes.results || [],
      max: MAX_DRAFTS_PER_BOARD,
    }, 409);
  }

  const result = await env.DB.prepare(
    `INSERT INTO dp_post_drafts (user_id, board, tab_slug, title, content, files, approvers)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.uid,
    board,
    body.tab_slug ? String(body.tab_slug).toLowerCase().slice(0, 40) : null,
    body.title ? String(body.title).slice(0, 200) : null,
    body.content ? String(body.content).slice(0, 100_000) : null,
    jsonSafe(body.files),
    jsonSafe(body.approvers)
  ).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const owner = await env.DB.prepare(
    `SELECT user_id FROM dp_post_drafts WHERE id = ?`
  ).bind(id).first();
  if (!owner || owner.user_id !== user.uid) return json({ error: 'Draft not found.' }, 404);

  const fields = [], values = [];
  if (body.title    !== undefined) { fields.push('title = ?');    values.push(body.title ? String(body.title).slice(0, 200) : null); }
  if (body.content  !== undefined) { fields.push('content = ?');  values.push(body.content ? String(body.content).slice(0, 100_000) : null); }
  if (body.tab_slug !== undefined) { fields.push('tab_slug = ?'); values.push(body.tab_slug ? String(body.tab_slug).toLowerCase().slice(0, 40) : null); }
  if (body.files    !== undefined) { fields.push('files = ?');    values.push(jsonSafe(body.files)); }
  if (body.approvers!== undefined) { fields.push('approvers = ?');values.push(jsonSafe(body.approvers)); }
  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE dp_post_drafts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);
  const owner = await env.DB.prepare(
    `SELECT user_id FROM dp_post_drafts WHERE id = ?`
  ).bind(id).first();
  if (!owner || owner.user_id !== user.uid) return json({ error: 'Draft not found.' }, 404);
  await env.DB.prepare(`DELETE FROM dp_post_drafts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
