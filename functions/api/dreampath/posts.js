/**
 * Dreampath · Board Posts
 * GET    /api/dreampath/posts?board=X&limit=N  — list posts
 * GET    /api/dreampath/posts?id=N             — single post with files + history
 * POST   /api/dreampath/posts                  — create (needs write:<board-scope>)
 * PUT    /api/dreampath/posts?id=N             — update, saves history (needs write scope OR author)
 * DELETE /api/dreampath/posts?id=N             — delete (admin only)
 *
 * Permission model (enforced server-side, Phase 5):
 *   - GET list/detail  → view:<board-scope>
 *   - POST / PUT       → write:<board-scope>
 *   - DELETE           → admin role
 *   Board-scope mapping: announcements/documents/minutes have their own scope;
 *   every other board (team_*, custom) maps to view:teams / write:teams.
 *   Admin role bypasses preset scopes entirely.
 *
 * File objects in POST/PUT body.files:
 *   { url, name, type, size, is_image }
 */

import { hasPerm, requireAdmin, boardScope } from '../../_shared/dreampath-perm.js';

// Hardcoded fallbacks — overridden at runtime by DB lookup
const FALLBACK_VALID_BOARDS = ['announcements', 'documents', 'minutes', 'team_korea', 'team_nepal', 'team_indonesia', 'team_pakistan'];
const FALLBACK_TEAM_BOARDS  = ['team_korea', 'team_nepal', 'team_indonesia', 'team_pakistan'];

// Load boards from DB, falling back to hardcoded lists
async function _loadBoards(env) {
  try {
    const rows = await env.DB.prepare(`SELECT slug, board_type FROM dp_boards`).all();
    const all = (rows.results || []);
    return {
      valid: all.map(b => b.slug),
      teams: all.filter(b => b.board_type === 'team').map(b => b.slug),
    };
  } catch {
    return { valid: FALLBACK_VALID_BOARDS, teams: FALLBACK_TEAM_BOARDS };
  }
}

// Returns whether a user's department matches a team board
function _deptMatchesBoard(department, board) {
  const d = (department || '').toLowerCase();
  // For team_xxx boards, check if department contains the country keyword
  if (!board.startsWith('team_')) return false;
  const country = board.slice(5); // e.g. 'korea', 'nepal', 'pakistan'
  return d.includes(country);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ request, env, data }) {
  const url   = new URL(request.url);
  const id    = parseInt(url.searchParams.get('id') || '', 10);
  const board = url.searchParams.get('board');
  const tab   = url.searchParams.get('tab');   // optional, only meaningful with board
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  const { valid: VALID_BOARDS, teams: TEAM_BOARDS } = await _loadBoards(env);

  // Permission scope check FIRST — view:<scope> must be in the user's preset.
  // Admin bypasses. Then, for team_* boards, department must match (keeps the
  // legacy per-country gating on top of the preset system).
  if (board) {
    if (!hasPerm(data.dpUser, boardScope(board, 'view'))) {
      return json({ error: 'You do not have permission to view this board.' }, 403);
    }
    if (TEAM_BOARDS.includes(board) && data.dpUser.role !== 'admin') {
      const u = await env.DB.prepare(`SELECT department FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
      if (!_deptMatchesBoard(u?.department, board)) return json({ error: 'Access denied.' }, 403);
    }
  }

  // ── Single post with files + history + linked event ───────────
  if (id) {
    // Increment view count and fetch post in one go
    await env.DB.prepare(`UPDATE dp_board_posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?`).bind(id).run();
    const post = await env.DB.prepare(
      `SELECT id, board, tab_slug, title, content, file_url, file_name,
              author_id, author_name, pinned, linked_event_id, approver_name, approval_status, view_count, created_at, updated_at
         FROM dp_board_posts WHERE id = ?`
    ).bind(id).first();
    if (!post) return json({ error: 'Post not found.' }, 404);

    // Preset scope check — view:<scope> for the post's board must be granted.
    if (!hasPerm(data.dpUser, boardScope(post.board, 'view'))) {
      return json({ error: 'You do not have permission to view this post.' }, 403);
    }
    // Team board additional department check (legacy per-country gate).
    if (TEAM_BOARDS.includes(post.board) && data.dpUser.role !== 'admin') {
      const u = await env.DB.prepare(`SELECT department FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
      if (!_deptMatchesBoard(u?.department, post.board)) return json({ error: 'Access denied.' }, 403);
    }

    const filesRes = await env.DB.prepare(
      `SELECT id, file_url, file_name, file_type, file_size, is_image
         FROM dp_post_files WHERE post_id = ? ORDER BY created_at ASC`
    ).bind(id).all();

    const historyRes = await env.DB.prepare(
      `SELECT id, editor_name, edit_note, edited_at
         FROM dp_post_history WHERE post_id = ? ORDER BY edited_at DESC`
    ).bind(id).all();

    // Fetch linked calendar event if present
    let linkedEvent = null;
    if (post.linked_event_id) {
      linkedEvent = await env.DB.prepare(
        `SELECT id, title, start_date, end_date, start_time, type FROM dp_events WHERE id = ?`
      ).bind(post.linked_event_id).first();
    }

    const approvalsRes = await env.DB.prepare(
      `SELECT id, approver_name, status, voted_at, override_by, override_note, created_at
         FROM dp_post_approvals WHERE post_id = ? ORDER BY created_at ASC`
    ).bind(id).all();

    return json({
      post: {
        ...post,
        files:        filesRes.results   || [],
        history:      historyRes.results || [],
        linked_event: linkedEvent || null,
        approvals:    approvalsRes.results || [],
      },
    });
  }

  // ── List posts ─────────────────────────────────────────────────
  if (board && !VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  let rows;
  if (board) {
    // `tab=<slug>` scopes results to a single sub-tab. `tab=__none` filters to
    // legacy posts with NULL tab_slug (implicit "All" bucket). Empty / missing
    // tab returns every post regardless of tab.
    if (tab === '__none') {
      rows = await env.DB.prepare(
        `SELECT p.id, p.board, p.tab_slug, p.title, p.content, p.file_url, p.file_name,
                p.author_name, p.pinned, p.approval_status, p.parent_post_id, p.version_number, p.reply_to_id, p.view_count, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM dp_post_comments c WHERE c.post_id = p.id) AS comment_count
           FROM dp_board_posts p WHERE p.board = ? AND p.tab_slug IS NULL
          ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?`
      ).bind(board, limit).all();
    } else if (tab) {
      rows = await env.DB.prepare(
        `SELECT p.id, p.board, p.tab_slug, p.title, p.content, p.file_url, p.file_name,
                p.author_name, p.pinned, p.approval_status, p.parent_post_id, p.version_number, p.reply_to_id, p.view_count, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM dp_post_comments c WHERE c.post_id = p.id) AS comment_count
           FROM dp_board_posts p WHERE p.board = ? AND p.tab_slug = ?
          ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?`
      ).bind(board, tab, limit).all();
    } else {
      rows = await env.DB.prepare(
        `SELECT p.id, p.board, p.tab_slug, p.title, p.content, p.file_url, p.file_name,
                p.author_name, p.pinned, p.approval_status, p.parent_post_id, p.version_number, p.reply_to_id, p.view_count, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM dp_post_comments c WHERE c.post_id = p.id) AS comment_count
           FROM dp_board_posts p WHERE p.board = ?
          ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?`
      ).bind(board, limit).all();
    }
  } else {
    rows = await env.DB.prepare(
      `SELECT p.id, p.board, p.title, p.content, p.file_url, p.file_name,
              p.author_name, p.pinned, p.approval_status, p.parent_post_id, p.version_number, p.reply_to_id, p.view_count, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM dp_post_comments c WHERE c.post_id = p.id) AS comment_count
         FROM dp_board_posts p
        ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?`
    ).bind(limit).all();
  }
  return json({ posts: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const { valid: VALID_BOARDS, teams: TEAM_BOARDS } = await _loadBoards(env);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { board, title, content, pinned, files, linked_event_id, approver_name, approval_status, approvers, parent_post_id, reply_to_id, tab_slug } = body;
  if (!board || !title) return json({ error: 'board and title are required.' }, 400);
  if (!VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  // Preset scope check — write:<scope> required. Admin bypasses.
  if (!hasPerm(data.dpUser, boardScope(board, 'write'))) {
    return json({ error: 'You do not have permission to post to this board.' }, 403);
  }
  // Team boards additionally require department match (legacy per-country gate).
  if (TEAM_BOARDS.includes(board) && data.dpUser.role !== 'admin') {
    const u = await env.DB.prepare(`SELECT department FROM dp_users WHERE id = ?`).bind(data.dpUser.uid).first();
    if (!_deptMatchesBoard(u?.department, board)) return json({ error: 'Access denied.' }, 403);
  }

  // Tab validation: tab must belong to the same board. Empty / null is fine —
  // the post goes into the implicit "All" bucket. If allowed_users is set on
  // the tab, the caller (non-admin) must appear in it.
  let safeTabSlug = null;
  if (tab_slug) {
    const row = await env.DB.prepare(
      `SELECT allowed_users FROM dp_board_tabs WHERE board_slug = ? AND slug = ?`
    ).bind(board, String(tab_slug).toLowerCase()).first();
    if (!row) return json({ error: `Tab "${tab_slug}" does not belong to ${board}.` }, 400);
    safeTabSlug = String(tab_slug).toLowerCase();
    if (data.dpUser.role !== 'admin' && row.allowed_users) {
      let allowed = [];
      try { allowed = JSON.parse(row.allowed_users) || []; } catch (_) { allowed = []; }
      const me = String(data.dpUser.username || '').toLowerCase();
      if (allowed.length && !allowed.includes(me)) {
        return json({ error: 'You do not have permission to post in this tab.' }, 403);
      }
    }
  }

  const safeLinkedEventId = linked_event_id ? parseInt(linked_event_id, 10) || null : null;
  const safeApprovalStatus = ['pending','approved','rejected'].includes(approval_status) ? approval_status : 'pending';
  const safeParentId = parent_post_id ? parseInt(parent_post_id, 10) || null : null;
  const safeReplyToId = reply_to_id ? parseInt(reply_to_id, 10) || null : null;

  // Reply chain + revision chain are mutually exclusive (DB constraint also
  // enforces this at the schema level, but the API should reject early with
  // a clearer error message).
  if (safeParentId && safeReplyToId) {
    return json({ error: 'A post cannot be both a revision (parent_post_id) and a reply (reply_to_id).' }, 400);
  }

  // Minutes enforcement — if the board is "minutes" and no approvers list is
  // provided, refuse to publish. Previously the UI let users skip this and the
  // post went out with approval_status='pending' but nobody assigned, which
  // looked like everyone should act but nobody could. Revisions (safeParentId
  // set) inherit their parent's approver list via the approvers copy below,
  // so the check is skipped for them.
  if (board === 'minutes' && !safeParentId) {
    const approverList = Array.isArray(approvers)
      ? approvers.map(n => String(n || '').trim()).filter(Boolean)
      : [];
    if (approverList.length === 0) {
      return json({
        error: 'Meeting Minutes require at least one approver. Open the editor and pick approvers before publishing.',
      }, 400);
    }
  }

  // Validate reply_to_id exists
  if (safeReplyToId) {
    const parent = await env.DB.prepare(`SELECT id FROM dp_board_posts WHERE id = ?`).bind(safeReplyToId).first();
    if (!parent) return json({ error: 'Parent post does not exist.' }, 400);
  }

  // Calculate version_number for revisions
  let version_number = 1;
  if (safeParentId) {
    const parent = await env.DB.prepare(
      `SELECT version_number FROM dp_board_posts WHERE id = ?`
    ).bind(safeParentId).first();
    if (parent) version_number = (parent.version_number || 1) + 1;
  }

  const result = await env.DB.prepare(
    `INSERT INTO dp_board_posts (board, title, content, author_id, author_name, pinned, linked_event_id, approver_name, approval_status, parent_post_id, version_number, reply_to_id, tab_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    board,
    title.trim().slice(0, 200),
    content ? content.trim().slice(0, 50000) : null,
    data.dpUser.uid,
    data.dpUser.name,
    pinned ? 1 : 0,
    safeLinkedEventId,
    approver_name ? approver_name.trim().slice(0, 100) : null,
    safeApprovalStatus,
    safeParentId,
    version_number,
    safeReplyToId,
    safeTabSlug
  ).run();

  const postId = result.meta.last_row_id;

  // Insert approvers for minutes board (batch lookup to avoid N+1)
  if (board === 'minutes' && Array.isArray(approvers) && approvers.length > 0) {
    const names = approvers.map(n => String(n || '').trim().slice(0, 100)).filter(Boolean);
    if (names.length > 0) {
      const placeholders = names.map(() => '?').join(',');
      const usersRes = await env.DB.prepare(
        `SELECT id, display_name FROM dp_users WHERE display_name IN (${placeholders})`
      ).bind(...names).all();
      const userMap = Object.fromEntries((usersRes.results || []).map(u => [u.display_name, u.id]));
      // [CASE STUDY — approver_id is NOT NULL by schema]
      // Symptom (risk): INSERT throws FOREIGN KEY / NOT NULL constraint error
      //                 if we let `uid` be undefined (user not found in dp_users).
      // Root cause: `dp_post_approvals.approver_id` is NOT NULL by design so
      //             we can always resolve back to a user row even if the
      //             approver's display_name changes later.
      // Lesson: ALWAYS resolve `uid` before INSERT and skip rows where it's
      //   missing (see `if (!uid) continue`). Never default to 0 or NULL.
      //   If you ever relax this constraint, update DREAMPATH.md Section 8.1
      //   and Critical Prohibitions simultaneously.
      // Ref: DREAMPATH.md Section 8, Critical Prohibitions #5.
      for (const name of names) {
        const uid = userMap[name];
        if (!uid) continue;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO dp_post_approvals (post_id, approver_id, approver_name) VALUES (?, ?, ?)`
        ).bind(postId, uid, name).run();
      }
    }
  }

  // Insert file attachments
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      if (!f.url || !f.name) continue;
      await env.DB.prepare(
        `INSERT INTO dp_post_files (post_id, file_url, file_name, file_type, file_size, is_image)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        postId,
        f.url.slice(0, 2000),
        f.name.slice(0, 300),
        (f.type || 'application/octet-stream').slice(0, 100),
        parseInt(f.size, 10) || 0,
        f.is_image ? 1 : 0
      ).run();
    }
  }

  return json({ id: postId, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }


  // Save edit history before making changes
  const current = await env.DB.prepare(
    `SELECT title, content, board, approval_status, author_id FROM dp_board_posts WHERE id = ?`
  ).bind(id).first();
  if (!current) return json({ error: 'Post not found.' }, 404);

  // Permission check (composite):
  //   1. Admin can edit anything.
  //   2. Non-admin: must have write:<scope> AND be the post author. Having the
  //      preset scope alone is NOT enough to edit someone else's post — that
  //      stays admin-only. The scope just gates who may edit their OWN posts.
  if (data.dpUser.role !== 'admin') {
    if (!hasPerm(data.dpUser, boardScope(current.board, 'write'))) {
      return json({ error: 'You do not have permission to edit posts on this board.' }, 403);
    }
    if (current.author_id !== data.dpUser.uid) {
      return json({ error: 'You can only edit your own posts.' }, 403);
    }
  }

  // Content lock: approved minutes cannot be edited
  if (current.board === 'minutes' && current.approval_status === 'approved') {
    const hasContentChange = body.title !== undefined || body.content !== undefined || body.pinned !== undefined;
    if (hasContentChange) {
      return json({
        error: 'LOCKED',
        message: 'This meeting minutes has been approved by majority vote and is locked. Contact Sonny or Jimmy to request changes.',
      }, 423);
    }
  }

  await env.DB.prepare(
    `INSERT INTO dp_post_history (post_id, editor_name, prev_title, prev_content, edit_note)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    data.dpUser.name,
    current.title,
    current.content,
    (body.edit_note || '').trim().slice(0, 500)
  ).run();

  // Build update fields
  const fields = [];
  const values = [];
  if (body.title            !== undefined) { fields.push('title = ?');            values.push(body.title.trim().slice(0, 200)); }
  if (body.content          !== undefined) { fields.push('content = ?');          values.push(body.content ? body.content.trim().slice(0, 50000) : null); }
  if (body.pinned           !== undefined) { fields.push('pinned = ?');           values.push(body.pinned ? 1 : 0); }
  if (body.linked_event_id  !== undefined) { fields.push('linked_event_id = ?'); values.push(body.linked_event_id ? parseInt(body.linked_event_id, 10) || null : null); }
  if (body.approver_name !== undefined) { fields.push('approver_name = ?'); values.push(body.approver_name ? body.approver_name.trim().slice(0, 100) : null); }
  if (body.approval_status !== undefined) {
    const safeStatus = ['pending','approved','rejected'].includes(body.approval_status) ? body.approval_status : null;
    if (safeStatus) { fields.push('approval_status = ?'); values.push(safeStatus); }
  }
  // Tab move — only within the same board. null clears the tab (post falls
  // back to the implicit "All" bucket). Cross-board moves are refused.
  if (body.tab_slug !== undefined) {
    const raw = body.tab_slug;
    if (raw == null || raw === '') {
      fields.push('tab_slug = ?'); values.push(null);
    } else {
      const slug = String(raw).toLowerCase();
      const row = await env.DB.prepare(
        `SELECT allowed_users FROM dp_board_tabs WHERE board_slug = ? AND slug = ?`
      ).bind(current.board, slug).first();
      if (!row) return json({ error: `Tab "${slug}" does not belong to ${current.board}.` }, 400);
      if (data.dpUser.role !== 'admin' && row.allowed_users) {
        let allowed = [];
        try { allowed = JSON.parse(row.allowed_users) || []; } catch (_) {}
        const me = String(data.dpUser.username || '').toLowerCase();
        if (allowed.length && !allowed.includes(me)) {
          return json({ error: 'You do not have permission to move posts into this tab.' }, 403);
        }
      }
      fields.push('tab_slug = ?'); values.push(slug);
    }
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await env.DB.prepare(`UPDATE dp_board_posts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  // Sync approvers list (admin only, minutes board)
  if (current.board === 'minutes' && data.dpUser.role === 'admin' && Array.isArray(body.approvers)) {
    const existingRes = await env.DB.prepare(
      `SELECT approver_name, status FROM dp_post_approvals WHERE post_id = ?`
    ).bind(id).all();
    const existing = existingRes.results || [];
    const existingNames = existing.map(a => a.approver_name);
    const newNames = body.approvers.map(n => String(n).trim()).filter(Boolean);

    // Add new approvers (batch lookup to avoid N+1)
    const toAdd = newNames.filter(n => !existingNames.includes(n));
    if (toAdd.length > 0) {
      const placeholders = toAdd.map(() => '?').join(',');
      const usersRes = await env.DB.prepare(
        `SELECT id, display_name FROM dp_users WHERE display_name IN (${placeholders})`
      ).bind(...toAdd.map(n => n.slice(0, 100))).all();
      const userMap = Object.fromEntries((usersRes.results || []).map(u => [u.display_name, u.id]));
      for (const name of toAdd) {
        const uid = userMap[name.slice(0, 100)];
        if (!uid) continue;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO dp_post_approvals (post_id, approver_id, approver_name) VALUES (?, ?, ?)`
        ).bind(id, uid, name.slice(0, 100)).run();
      }
    }
    // Remove pending approvers not in new list
    for (const ea of existing) {
      if (ea.status === 'pending' && !newNames.includes(ea.approver_name)) {
        await env.DB.prepare(
          `DELETE FROM dp_post_approvals WHERE post_id = ? AND approver_name = ? AND status = 'pending'`
        ).bind(id, ea.approver_name).run();
      }
    }
    // Recompute approval_status
    const allA = await env.DB.prepare(`SELECT status FROM dp_post_approvals WHERE post_id = ?`).bind(id).all();
    const aRows = allA.results || [];
    const total = aRows.length;
    const approvedCount = aRows.filter(r => r.status === 'approved').length;
    const newApprovalStatus = (total > 0 && approvedCount > total / 2) ? 'approved' : 'pending';
    await env.DB.prepare(`UPDATE dp_board_posts SET approval_status = ? WHERE id = ?`).bind(newApprovalStatus, id).run();
  }

  // Replace file attachments if provided
  if (body.files !== undefined) {
    // Detect file changes and add to history
    const oldFiles = await env.DB.prepare(
      `SELECT file_name FROM dp_post_files WHERE post_id = ?`
    ).bind(id).all();
    const oldNames = (oldFiles.results || []).map(f => f.file_name).sort();
    const newNames = (Array.isArray(body.files) ? body.files : []).map(f => f.name).sort();
    const filesChanged = JSON.stringify(oldNames) !== JSON.stringify(newNames);
    if (filesChanged) {
      const removed = oldNames.filter(n => !newNames.includes(n));
      const added   = newNames.filter(n => !oldNames.includes(n));
      const fileNote = [
        removed.length ? `Removed: ${removed.join(', ')}` : null,
        added.length   ? `Added: ${added.join(', ')}` : null,
      ].filter(Boolean).join(' / ');
      await env.DB.prepare(
        `INSERT INTO dp_post_history (post_id, editor_name, prev_title, prev_content, edit_note)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, data.dpUser.name, current.title, current.content, `[Files changed] ${fileNote}`).run();
    }

    await env.DB.prepare(`DELETE FROM dp_post_files WHERE post_id = ?`).bind(id).run();
    if (Array.isArray(body.files)) {
      for (const f of body.files) {
        if (!f.url || !f.name) continue;
        await env.DB.prepare(
          `INSERT INTO dp_post_files (post_id, file_url, file_name, file_type, file_size, is_image)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          f.url.slice(0, 2000),
          f.name.slice(0, 300),
          (f.type || 'application/octet-stream').slice(0, 100),
          parseInt(f.size, 10) || 0,
          f.is_image ? 1 : 0
        ).run();
      }
    }
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_board_posts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
