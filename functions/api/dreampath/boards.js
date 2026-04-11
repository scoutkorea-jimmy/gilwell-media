/**
 * Dreampath · Board Management
 * GET    /api/dreampath/boards          — list all boards
 * POST   /api/dreampath/boards          — create board (admin only)
 * DELETE /api/dreampath/boards?id=N     — delete board (admin only, must be empty)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Slugs that cannot be deleted (core system boards)
const PROTECTED_SLUGS = ['announcements', 'documents', 'minutes'];

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(
    `SELECT b.id, b.slug, b.title, b.board_type, b.created_at,
            (SELECT COUNT(*) FROM dp_board_posts p WHERE p.board = b.slug) AS post_count
       FROM dp_boards b ORDER BY b.board_type ASC, b.title ASC`
  ).all();
  return json({ boards: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, board_type } = body;
  if (!title || !title.trim()) return json({ error: 'Title is required.' }, 400);

  const safeType = board_type === 'team' ? 'team' : 'board';
  // Generate slug from title
  const baseSlug = safeType === 'team'
    ? 'team_' + title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    : title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  if (!baseSlug || baseSlug.length < 2) return json({ error: 'Title must contain at least 2 alphanumeric characters.' }, 400);

  // Check for duplicate slug
  const existing = await env.DB.prepare(`SELECT id FROM dp_boards WHERE slug = ?`).bind(baseSlug).first();
  if (existing) return json({ error: `Board "${baseSlug}" already exists.` }, 409);

  const safeTitle = safeType === 'team'
    ? 'Team ' + title.trim().replace(/^team\s*/i, '').slice(0, 50)
    : title.trim().slice(0, 100);

  const result = await env.DB.prepare(
    `INSERT INTO dp_boards (slug, title, board_type) VALUES (?, ?, ?)`
  ).bind(baseSlug, safeTitle, safeType).run();

  return json({ id: result.meta.last_row_id, slug: baseSlug, title: safeTitle, board_type: safeType, ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  const board = await env.DB.prepare(`SELECT id, slug, title FROM dp_boards WHERE id = ?`).bind(id).first();
  if (!board) return json({ error: 'Board not found.' }, 404);

  if (PROTECTED_SLUGS.includes(board.slug)) {
    return json({ error: `"${board.title}" is a core board and cannot be deleted.` }, 403);
  }

  // Check for existing posts
  const postCount = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM dp_board_posts WHERE board = ?`
  ).bind(board.slug).first();

  if (postCount && postCount.cnt > 0) {
    return json({ error: `Cannot delete "${board.title}" — it has ${postCount.cnt} post(s). Remove all posts first.` }, 409);
  }

  await env.DB.prepare(`DELETE FROM dp_boards WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
