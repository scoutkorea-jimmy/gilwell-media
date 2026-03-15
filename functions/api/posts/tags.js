/**
 * Gilwell Media · Post Tags
 *
 * GET /api/posts/tags?category=korea  ← public, returns unique tags used in posts
 */

export async function onRequestGet({ request, env }) {
  const url      = new URL(request.url);
  const category = normalizeCategory(url.searchParams.get('category') || null);
  const daysFilter = Math.max(0, parseInt(url.searchParams.get('days') || '0', 10));

const VALID = ['korea', 'apr', 'wosm', 'people'];
  if (category && !VALID.includes(category)) {
    return json({ tags: [] });
  }

  try {
    const conditions = [`published = 1`, `tag IS NOT NULL`, `tag != ''`];
    const bindings = [];
    if (category) {
      conditions.push('category = ?');
      bindings.push(category);
    }
    if (daysFilter > 0) {
      conditions.push('datetime(created_at) >= datetime(?, ?)');
      bindings.push('now', '-' + daysFilter + ' days');
    }
    const query = `SELECT tag FROM posts WHERE ${conditions.join(' AND ')}`;
    const { results } = await env.DB.prepare(query).bind(...bindings).all();

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

function normalizeCategory(value) {
  if (value === 'worm') return 'wosm';
  return value;
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
