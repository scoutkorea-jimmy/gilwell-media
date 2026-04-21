/**
 * Gilwell Media · GET /api/admin/users/:id/activity
 *
 * GDPR Art. 15 (right of access) lightweight inline view — returns the
 * user's most recent operational_events so they can see what we've logged
 * about their actions without downloading the full export blob.
 *
 * Query:   ?limit=<n>  (default 100, max 500)
 *          ?before=<id> (cursor — return entries with id < before)
 *
 * Access: owner any user, member only themselves.
 */
import { loadAdminSession } from '../../../../_shared/admin-permissions.js';
import { loadAdminUserById } from '../../../../_shared/admin-users.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestGet({ params, request, env }) {
  const session = await loadAdminSession(request, env);
  if (!session) return json({ error: '인증이 필요합니다.' }, 401);

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const isSelf = session.uid && Number(session.uid) === id;
  if (!session.isOwner && !isSelf) {
    return json({ error: '본인 활동 기록만 조회할 수 있습니다.' }, 403);
  }

  const target = await loadAdminUserById(env, id);
  if (!target) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 100));
  const before = parseInt(url.searchParams.get('before'), 10);

  let sql = `SELECT id, channel, type, level, ip, path, message, details, created_at
               FROM operational_events
              WHERE actor = ?`;
  const bindings = [target.username];
  if (Number.isFinite(before) && before > 0) {
    sql += ` AND id < ?`;
    bindings.push(before);
  }
  sql += ` ORDER BY id DESC LIMIT ?`;
  bindings.push(limit);

  try {
    const { results } = await env.DB.prepare(sql).bind(...bindings).all();
    const entries = results || [];
    const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;
    return json({
      username: target.username,
      count: entries.length,
      next_cursor: nextCursor,
      entries,
    });
  } catch (err) {
    console.error(`GET /api/admin/users/${id}/activity error:`, err);
    return json({ error: '활동 기록 조회 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
