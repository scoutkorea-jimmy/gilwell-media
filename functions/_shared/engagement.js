export async function getViewerKey(request, env) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
    || '';
  if (!ip) return null;

  const input = `${ip}|${env.ADMIN_SECRET || 'bpmedia'}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hash;
}

export async function recordUniqueView(env, postId, viewerKey) {
  if (!viewerKey) return false;
  const existing = await env.DB.prepare(
    `SELECT 1
       FROM post_views
      WHERE post_id = ?
        AND viewer_key = ?
        AND viewed_at > datetime('now', '-12 hours')
      LIMIT 1`
  ).bind(postId, viewerKey).first();

  if (existing) return false;

  await Promise.all([
    env.DB.prepare(`INSERT INTO post_views (post_id, viewer_key) VALUES (?, ?)`).bind(postId, viewerKey).run(),
    env.DB.prepare(`UPDATE posts SET views = views + 1 WHERE id = ?`).bind(postId).run(),
  ]);
  return true;
}

export async function getLikeStats(env, postId, viewerKey) {
  const [countRow, likedRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?`).bind(postId).first(),
    viewerKey
      ? env.DB.prepare(`SELECT 1 FROM post_likes WHERE post_id = ? AND viewer_key = ? LIMIT 1`).bind(postId, viewerKey).first()
      : Promise.resolve(null),
  ]);

  return {
    likes: countRow?.count || 0,
    liked: !!likedRow,
  };
}
