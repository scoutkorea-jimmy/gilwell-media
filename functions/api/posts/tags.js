import { queryRust } from '../../_shared/rust-server.js';

/**
 * Gilwell Media · Post Tags
 *
 * GET /api/posts/tags?category=korea  ← public, returns unique tags used in posts
 */

export async function onRequestGet(context) {
  try {
    const rust = await queryRust(context, 'post-tags-query', {url:context.request.url});
    if (!rust.ok) throw new Error('Rust tags query failed');
    return json(await rust.json());
  } catch (err) {
    console.error('GET /api/posts/tags error:', err);
    return json({ tags: [] });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
