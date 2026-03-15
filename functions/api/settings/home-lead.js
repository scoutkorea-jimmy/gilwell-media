import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { serializePostImage } from '../../_shared/images.js';

export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first();
    const postId = row ? parseInt(row.value, 10) : 0;
    if (!postId) {
      return json({ post: null }, 200, publicCacheHeaders(180, 900));
    }
    const post = await env.DB.prepare(
      `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, tag, views, author, youtube_url
         FROM posts
        WHERE id = ? AND published = 1`
    ).bind(postId).first();
    return json({ post: post ? serializePostImage(post, origin) : null }, 200, publicCacheHeaders(180, 900));
  } catch (err) {
    console.error('GET /api/settings/home-lead error:', err);
    return json({ post: null }, 500);
  }
}

export async function onRequestPut({ env, request }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const postId = body && body.post_id ? parseInt(body.post_id, 10) : 0;

  try {
    if (!postId) {
      await env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_post'`).run();
      return json({ success: true, post_id: null });
    }
    const post = await env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND published = 1`).bind(postId).first();
    if (!post) return json({ error: '공개된 게시글만 메인 스토리로 지정할 수 있습니다.' }, 400);
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('home_lead_post', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(String(postId)).run();
    return json({ success: true, post_id: postId });
  } catch (err) {
    console.error('PUT /api/settings/home-lead error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
