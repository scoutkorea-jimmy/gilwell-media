/**
 * Dreampath · Activity Log (admin only)
 *
 * GET /api/dreampath/activity?limit=20&offset=0
 *   → paginated feed of recent_changes (post edits + event edits + comments)
 *   Response: { items: [...], total, limit, offset }
 *
 * Shape mirrors home.recent_changes so the frontend can reuse the same renderer.
 * Each item: { kind: 'post'|'event'|'comment', ref_id, title, meta, note, created_at, board }
 */

import { requireAdmin } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;

  const url = new URL(request.url);
  const limit  = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit')  || '20', 10) || 20));
  const offset = Math.max(0,            parseInt(url.searchParams.get('offset') || '0',  10) || 0);
  // Pull more than limit from each source so we can merge-sort the union before
  // slicing. 3 sources × (offset+limit) is plenty for anything under ~1000.
  const perSource = offset + limit + 20;

  const [postRows, eventRows, commentRows] = await Promise.all([
    env.DB.prepare(
      `SELECT h.post_id, h.editor_name, h.edit_note, h.edited_at, p.title, p.board
         FROM dp_post_history h
         JOIN dp_board_posts p ON p.id = h.post_id
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT ?`
    ).bind(perSource).all(),
    env.DB.prepare(
      `SELECT h.event_id, h.editor_name, h.edit_note, h.edited_at, e.title
         FROM dp_event_history h
         JOIN dp_events e ON e.id = h.event_id
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT ?`
    ).bind(perSource).all(),
    env.DB.prepare(
      `SELECT c.id, c.post_id, c.author_name, c.content, c.created_at, p.title, p.board
         FROM dp_post_comments c
         JOIN dp_board_posts p ON p.id = c.post_id
        ORDER BY datetime(c.created_at) DESC, c.id DESC
        LIMIT ?`
    ).bind(perSource).all(),
  ]);

  const merged = []
    .concat((postRows.results || []).map(r => ({
      kind: 'post',
      ref_id: r.post_id,
      title: r.title || '',
      meta: r.editor_name || '',
      note: r.edit_note || '',
      board: r.board || '',
      created_at: r.edited_at || '',
    })))
    .concat((eventRows.results || []).map(r => ({
      kind: 'event',
      ref_id: r.event_id,
      title: r.title || '',
      meta: r.editor_name || '',
      note: r.edit_note || '',
      board: '',
      created_at: r.edited_at || '',
    })))
    .concat((commentRows.results || []).map(r => ({
      kind: 'comment',
      ref_id: r.post_id,
      title: r.title || '',
      meta: r.author_name || '',
      note: (r.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
      board: r.board || '',
      created_at: r.created_at || '',
    })))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  // Total rows across the 3 sources — sum of row counts is exact because the
  // three tables are disjoint (no row belongs to two sources). We only need
  // an approximation of merge-sorted uniqueness if the same event were
  // logged in two tables, which never happens in this schema.
  const [{ n: postsN } = {}, { n: eventsN } = {}, { n: commentsN } = {}] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM dp_post_history`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM dp_event_history`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM dp_post_comments`).first(),
  ]).then(rows => rows.map(r => r || { n: 0 }));
  const total = (postsN || 0) + (eventsN || 0) + (commentsN || 0);

  const items = merged.slice(offset, offset + limit);
  return json({ items, total, limit, offset });
}
