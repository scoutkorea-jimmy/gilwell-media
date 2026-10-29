/**
 * Dreampath · Team board sub-tabs
 *
 * Sub-tabs let a single team board (team_korea, team_nepal, ...) host up to 5
 * distinct streams with optional per-tab write permissions. Posts remember
 * their tab via dp_board_posts.tab_slug; moving a post is a scoped update
 * (same board_slug enforced server-side).
 *
 * GET    /api/dreampath/board-tabs?board=team_korea
 *   → { tabs: [...] } for a specific board. Requires view:<board scope>.
 *
 * POST   /api/dreampath/board-tabs       (admin)
 *   body: { board_slug, title, slug?, allowed_users? }
 *   Enforces the 5-tab cap per board.
 *
 * PUT    /api/dreampath/board-tabs?id=N  (admin)
 *   body: { title?, sort_order?, allowed_users? }
 *
 * DELETE /api/dreampath/board-tabs?id=N  (admin)
 *   Posts carrying the tab's slug are NOT auto-deleted; their tab_slug is
 *   reset to NULL so they fall back to the implicit "All" tab.
 */

import { hasPerm, requireAdmin, boardScope } from '../../_shared/dreampath-perm.js';

const MAX_TABS_PER_BOARD = 5;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function slugify(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'tab';
}

function parseAllowedUsers(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(s => String(s || '').trim().toLowerCase()).filter(Boolean)));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseAllowedUsers(parsed);
    } catch (_) {}
  }
  return null;
}

function normalizeBoardSlug(slug) {
  // Tabs are only meaningful for team boards. Keep the door open for
  // user-created boards (board_type='board') too — everything except the core
  // announcements/documents/minutes triplet.
  const core = ['announcements', 'documents', 'minutes'];
  if (!slug || core.includes(slug)) return null;
  return String(slug).toLowerCase();
}

export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const board = normalizeBoardSlug(url.searchParams.get('board'));
  if (!board) return json({ error: 'Valid team/custom board slug is required.' }, 400);

  if (!hasPerm(data.dpUser, boardScope(board, 'view'))) {
    return json({ error: 'You do not have permission to view this board.' }, 403);
  }

  const rows = await env.DB.prepare(
    `SELECT id, board_slug, slug, title, sort_order, allowed_users, created_at, updated_at
       FROM dp_board_tabs WHERE board_slug = ?
    ORDER BY sort_order ASC, id ASC`
  ).bind(board).all();

  const tabs = (rows.results || []).map(row => {
    let allowed = null;
    if (row.allowed_users) {
      try { allowed = JSON.parse(row.allowed_users); } catch (_) { allowed = null; }
    }
    return { ...row, allowed_users: allowed };
  });
  return json({ tabs, max: MAX_TABS_PER_BOARD });
}

export async function onRequestPost({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const board = normalizeBoardSlug(body.board_slug);
  if (!board) return json({ error: 'board_slug required (team/custom board).' }, 400);
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'title required.' }, 400);

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dp_board_tabs WHERE board_slug = ?`
  ).bind(board).first();
  if ((count && count.n) >= MAX_TABS_PER_BOARD) {
    return json({ error: `This board already has ${MAX_TABS_PER_BOARD} tabs (max). Delete one first.` }, 400);
  }

  const slug = slugify(body.slug || title);
  const existing = await env.DB.prepare(
    `SELECT id FROM dp_board_tabs WHERE board_slug = ? AND slug = ?`
  ).bind(board, slug).first();
  if (existing) return json({ error: `Tab "${slug}" already exists on ${board}.` }, 409);

  const maxOrder = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM dp_board_tabs WHERE board_slug = ?`
  ).bind(board).first();

  const allowed = parseAllowedUsers(body.allowed_users);
  const allowedJson = allowed === null ? null : JSON.stringify(allowed);

  const result = await env.DB.prepare(
    `INSERT INTO dp_board_tabs (board_slug, slug, title, sort_order, allowed_users)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(board, slug, title.slice(0, 80), (maxOrder?.m || 0) + 1, allowedJson).run();

  return json({ id: result.meta.last_row_id, slug, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);

  // Bulk reorder: PUT /board-tabs?reorder=1
  // body: { board_slug: "team_korea", slugs: ["tech", "general", "social"] }
  // Rewrites sort_order for every tab on this board in a single transaction.
  // Used by the drag-to-reorder UI; single-tab PUT still works for
  // title/allowed_users/individual sort_order edits.
  if (url.searchParams.get('reorder') === '1') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const boardSlug = normalizeBoardSlug(body.board_slug);
    const slugs = Array.isArray(body.slugs) ? body.slugs.map(s => String(s || '').toLowerCase()).filter(Boolean) : [];
    if (!boardSlug || !slugs.length) return json({ error: 'board_slug and slugs[] required.' }, 400);
    // Sanity check every slug exists on the board. Prevents a typo from
    // silently zeroing out the sort_order of an unrelated tab.
    const placeholders = slugs.map(() => '?').join(',');
    const existing = await env.DB.prepare(
      `SELECT slug FROM dp_board_tabs WHERE board_slug = ? AND slug IN (${placeholders})`
    ).bind(boardSlug, ...slugs).all();
    const known = new Set((existing.results || []).map(r => r.slug));
    const unknown = slugs.filter(s => !known.has(s));
    if (unknown.length) return json({ error: `Unknown tab slugs: ${unknown.join(', ')}` }, 400);
    // Assign sort_order = index+1 in given order. We don't touch tabs not in
    // the list — they keep their existing order (edge case: if a new tab was
    // added between client fetch and drop, it stays at its original position).
    for (let i = 0; i < slugs.length; i++) {
      await env.DB.prepare(
        `UPDATE dp_board_tabs SET sort_order = ?, updated_at = datetime('now')
          WHERE board_slug = ? AND slug = ?`
      ).bind(i + 1, boardSlug, slugs[i]).run();
    }
    return json({ ok: true, reordered: slugs.length });
  }

  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];
  if (body.title !== undefined) {
    fields.push('title = ?'); values.push(String(body.title || '').trim().slice(0, 80));
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?'); values.push(parseInt(body.sort_order, 10) || 0);
  }
  if (body.allowed_users !== undefined) {
    const allowed = parseAllowedUsers(body.allowed_users);
    fields.push('allowed_users = ?');
    values.push(allowed === null ? null : JSON.stringify(allowed));
  }
  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE dp_board_tabs SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const err = requireAdmin(data); if (err) return err;
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);

  const tab = await env.DB.prepare(
    `SELECT board_slug, slug, title FROM dp_board_tabs WHERE id = ?`
  ).bind(id).first();
  if (!tab) return json({ error: 'Tab not found.' }, 404);

  // Refuse deletion while the tab still has posts — per 2026-04-24 owner spec
  // posts should NOT be silently orphaned to the Default bucket because that
  // loses their categorization. Operator has to move/remove them first.
  const postCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dp_board_posts WHERE board = ? AND tab_slug = ?`
  ).bind(tab.board_slug, tab.slug).first();
  const n = (postCount && postCount.n) || 0;
  if (n > 0) {
    return json({
      error: `Cannot delete "${tab.title}" — it still has ${n} post${n === 1 ? '' : 's'}. Move or delete the posts first.`,
      post_count: n,
    }, 409);
  }

  await env.DB.prepare(`DELETE FROM dp_board_tabs WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
