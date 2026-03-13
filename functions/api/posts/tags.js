/**
 * Gilwell Media · Post Tags
 *
 * GET /api/posts/tags?category=korea  ← public, returns unique tags used in posts
 */

export async function onRequestGet({ request, env }) {
  const url      = new URL(request.url);
  const category = url.searchParams.get('category') || null;

  const VALID = ['korea', 'apr', 'worm', 'people'];
  if (category && !VALID.includes(category)) {
    return json({ tags: [] });
  }

  try {
    const query = category
      ? `SELECT tag FROM posts WHERE published = 1 AND tag IS NOT NULL AND tag != '' AND category = ?`
      : `SELECT tag FROM posts WHERE published = 1 AND tag IS NOT NULL AND tag != ''`;

    const { results } = category
      ? await env.DB.prepare(query).bind(category).all()
      : await env.DB.prepare(query).all();

    const tagSet = new Set();
    results.forEach(function (row) {
      if (row.tag) {
        row.tag.split(',').forEach(function (t) {
          const trimmed = t.trim();
          if (trimmed) tagSet.add(trimmed);
        });
      }
    });

    return json({ tags: Array.from(tagSet).sort() });
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
