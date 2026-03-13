/**
 * GET /api/posts/popular
 * Returns top posts by view count in the last 7 days.
 */
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT p.id, p.category, p.title, p.subtitle, p.image_url, p.created_at, p.tag, p.views,
             COUNT(pv.post_id) AS week_views
      FROM posts p
      LEFT JOIN post_views pv ON pv.post_id = p.id AND pv.viewed_at > datetime('now', '-7 days')
      WHERE p.published = 1
      GROUP BY p.id
      ORDER BY week_views DESC, p.views DESC
      LIMIT 8
    `).all();

    return new Response(JSON.stringify({ posts: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('GET /api/posts/popular error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
