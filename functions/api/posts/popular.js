import { serializePostImage } from '../../_shared/images.js';
import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';

/**
 * GET /api/posts/popular
 * Returns top posts by weighted popularity.
 * Score = 50% likes + 50% views, normalized across published posts.
 */
export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    await ensureDuePostsPublished(env, origin).catch((err) => {
      console.error('GET /api/posts/popular auto publish error:', err);
    });
    const { results } = await env.DB.prepare(`
      WITH likes_by_post AS (
        SELECT post_id, COUNT(*) AS likes
        FROM post_likes
        GROUP BY post_id
      ),
      base AS (
        SELECT p.id, p.category, p.title, p.subtitle, p.image_url, p.created_at, p.publish_at, p.tag, p.views,
               COALESCE(l.likes, 0) AS likes
        FROM posts p
        LEFT JOIN likes_by_post l ON l.post_id = p.id
        WHERE p.published = 1
      ),
      maxima AS (
        SELECT
          MAX(views) AS max_views,
          MAX(likes) AS max_likes
        FROM base
      )
      SELECT
        base.*,
        ROUND(
          ((CAST(base.views AS REAL) / CASE WHEN COALESCE(maxima.max_views, 0) > 0 THEN maxima.max_views ELSE 1 END) * 50) +
          ((CAST(base.likes AS REAL) / CASE WHEN COALESCE(maxima.max_likes, 0) > 0 THEN maxima.max_likes ELSE 1 END) * 50),
          2
        ) AS popularity_score
      FROM base
      CROSS JOIN maxima
      ORDER BY popularity_score DESC, likes DESC, views DESC, id DESC
      LIMIT 8
    `).all();

    const scored = (results || []).map((post) => serializePostImage(post, origin));

    return new Response(JSON.stringify({ posts: scored }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/posts/popular error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
