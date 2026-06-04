/**
 * Dreampath · Knowledge Base comments
 *
 * GET    /api/dreampath/wiki-comments?page_id=N  — list comments (view:wiki)
 * POST   /api/dreampath/wiki-comments            — add comment (view:wiki)
 * DELETE /api/dreampath/wiki-comments?id=N       — delete (own comment or admin)
 *
 * Mirror of comments.js but keyed by dp_wiki_pages.id instead of a board post.
 * Anyone who can VIEW the wiki can comment — write:wiki is for editing the
 * document body, not for discussing it.
 */

import { hasPerm, requirePerm } from '../../_shared/dreampath-perm.js';
import { enforceRateLimit, rateLimitResponse } from '../../_shared/rate-limit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function _ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    parent_id INTEGER,
    author_id INTEGER,
    author_name TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}

export async function onRequestGet({ request, env, data }) {
  const denied = requirePerm(data, 'view:wiki');
  if (denied) return denied;
  await _ensureTable(env);
  const url = new URL(request.url);
  const pageId = parseInt(url.searchParams.get('page_id') || '', 10);
  if (!pageId) return json({ error: 'page_id is required.' }, 400);

  const rows = await env.DB.prepare(
    `SELECT id, author_id, author_name, content, parent_id, created_at
       FROM dp_wiki_comments
      WHERE page_id = ?
      ORDER BY created_at ASC`
  ).bind(pageId).all();
  return json({ comments: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const denied = requirePerm(data, 'view:wiki');
  if (denied) return denied;
  await _ensureTable(env);

  const uidForRl = data && data.dpUser && data.dpUser.uid;
  if (uidForRl) {
    const rl = await enforceRateLimit(env, {
      route: 'dreampath-wiki-comments',
      identity: `uid:${uidForRl}`,
      limit: 15,
      windowSeconds: 60,
    });
    if (!rl.ok) return rateLimitResponse(rl, '댓글이 너무 빠르게 등록되고 있습니다. 잠시 후 다시 시도해주세요.');
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { page_id, content, parent_id } = body;
  if (!page_id || !content || !content.trim()) {
    return json({ error: 'page_id and content are required.' }, 400);
  }

  const page = await env.DB.prepare(`SELECT id FROM dp_wiki_pages WHERE id = ?`).bind(page_id).first();
  if (!page) return json({ error: 'Wiki page not found.' }, 404);

  const safeParentId = parent_id ? parseInt(parent_id, 10) || null : null;
  if (safeParentId) {
    const parent = await env.DB.prepare(`SELECT id, page_id FROM dp_wiki_comments WHERE id = ?`).bind(safeParentId).first();
    if (!parent) return json({ error: 'Parent comment not found.' }, 400);
    if (Number(parent.page_id) !== Number(page_id)) {
      return json({ error: 'Parent comment does not belong to this page.' }, 400);
    }
  }

  const uid = data.dpUser.uid;
  const name = data.dpUser.name || data.dpUser.username;
  const result = await env.DB.prepare(
    `INSERT INTO dp_wiki_comments (page_id, author_id, author_name, content, parent_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(page_id, uid, name, content.trim().slice(0, 2000), safeParentId).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requirePerm(data, 'view:wiki');
  if (denied) return denied;
  await _ensureTable(env);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  const comment = await env.DB.prepare(`SELECT author_id FROM dp_wiki_comments WHERE id = ?`).bind(id).first();
  if (!comment) return json({ error: 'Comment not found.' }, 404);
  if (data.dpUser.role !== 'admin' && comment.author_id !== data.dpUser.uid) {
    return json({ error: 'Not authorized.' }, 403);
  }

  const result = await env.DB.prepare(
    `WITH RECURSIVE comment_tree(id) AS (
       SELECT id FROM dp_wiki_comments WHERE id = ?
       UNION ALL
       SELECT c.id FROM dp_wiki_comments c JOIN comment_tree t ON c.parent_id = t.id
     )
     DELETE FROM dp_wiki_comments WHERE id IN (SELECT id FROM comment_tree)`
  ).bind(id).run();
  return json({ ok: true, deleted_count: result.meta.changes || 0 });
}
