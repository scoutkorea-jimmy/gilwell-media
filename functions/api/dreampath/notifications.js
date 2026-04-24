/**
 * Dreampath · In-app notifications
 *
 * Created server-side by other endpoints (currently just posts.js when a
 * Minutes post is published — every approver gets a "please review" entry).
 *
 * GET  /api/dreampath/notifications            — my notifications, newest first
 * GET  /api/dreampath/notifications?unread=1   — only unread
 * PUT  /api/dreampath/notifications?id=N       — mark one read
 * PUT  /api/dreampath/notifications?all=1      — mark every unread read
 * DELETE /api/dreampath/notifications?id=N     — dismiss
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const rows = unreadOnly
    ? await env.DB.prepare(
        `SELECT id, kind, title, body, ref_type, ref_id, actor_name, read_at, created_at
           FROM dp_notifications
          WHERE user_id = ? AND read_at IS NULL
          ORDER BY created_at DESC LIMIT 50`
      ).bind(user.uid).all()
    : await env.DB.prepare(
        `SELECT id, kind, title, body, ref_type, ref_id, actor_name, read_at, created_at
           FROM dp_notifications
          WHERE user_id = ?
          ORDER BY created_at DESC LIMIT 50`
      ).bind(user.uid).all();
  const countRes = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dp_notifications WHERE user_id = ? AND read_at IS NULL`
  ).bind(user.uid).first();
  return json({
    notifications: rows.results || [],
    unread_count: (countRes && countRes.n) || 0,
  });
}

export async function onRequestPut({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);

  if (url.searchParams.get('all') === '1') {
    await env.DB.prepare(
      `UPDATE dp_notifications SET read_at = datetime('now')
        WHERE user_id = ? AND read_at IS NULL`
    ).bind(user.uid).run();
    return json({ ok: true });
  }

  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);
  const owner = await env.DB.prepare(
    `SELECT user_id FROM dp_notifications WHERE id = ?`
  ).bind(id).first();
  if (!owner || owner.user_id !== user.uid) return json({ error: 'Notification not found.' }, 404);
  await env.DB.prepare(
    `UPDATE dp_notifications SET read_at = datetime('now') WHERE id = ?`
  ).bind(id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id required.' }, 400);
  const owner = await env.DB.prepare(
    `SELECT user_id FROM dp_notifications WHERE id = ?`
  ).bind(id).first();
  if (!owner || owner.user_id !== user.uid) return json({ error: 'Notification not found.' }, 404);
  await env.DB.prepare(`DELETE FROM dp_notifications WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
