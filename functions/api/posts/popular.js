import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';
import { queryRust } from '../../_shared/rust-server.js';

/**
 * GET /api/posts/popular
 * Returns top posts by weighted popularity.
 * Score = 50% likes + 50% views, normalized across published posts.
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const origin = new URL(request.url).origin;
    await ensureDuePostsPublished(env, origin).catch((err) => {
      console.error('GET /api/posts/popular auto publish error:', err);
    });
    const rust = await queryRust(context, 'post-popular', {origin});
    if (!rust.ok) throw new Error('Rust popular query failed');
    const { posts } = await rust.json();
    return new Response(JSON.stringify({ posts: posts || [] }), {
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
