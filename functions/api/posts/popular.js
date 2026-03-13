/**
 * GET /api/posts/popular
 * Returns top posts by weighted popularity.
 * Score = 50% likes + 50% views, normalized across published posts.
 */
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT p.id, p.category, p.title, p.subtitle, p.image_url, p.created_at, p.tag, p.views,
             COUNT(pl.post_id) AS likes
      FROM posts p
      LEFT JOIN post_likes pl ON pl.post_id = p.id
      WHERE p.published = 1
      GROUP BY p.id
    `).all();

    const maxViews = results.reduce((max, post) => Math.max(max, Number(post.views || 0)), 0) || 1;
    const maxLikes = results.reduce((max, post) => Math.max(max, Number(post.likes || 0)), 0) || 1;
    const scored = results.map((post) => {
      const viewScore = (Number(post.views || 0) / maxViews) * 50;
      const likeScore = (Number(post.likes || 0) / maxLikes) * 50;
      return Object.assign({}, post, {
        popularity_score: Math.round((viewScore + likeScore) * 100) / 100,
      });
    }).sort((a, b) => {
      if (b.popularity_score !== a.popularity_score) return b.popularity_score - a.popularity_score;
      if ((b.likes || 0) !== (a.likes || 0)) return (b.likes || 0) - (a.likes || 0);
      return (b.views || 0) - (a.views || 0);
    }).slice(0, 8);

    return new Response(JSON.stringify({ posts: scored }), {
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
