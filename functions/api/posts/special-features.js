/**
 * GET /api/posts/special-features?category=<category>
 * Returns distinct active special_feature values for a category.
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const VALID_CATEGORIES = ['korea', 'apr', 'wosm', 'people'];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || null;

  const token = extractToken(request);
  const isAdmin = token ? await verifyTokenRole(token, env.ADMIN_SECRET, 'full').catch(() => false) : false;

  try {
    let query;
    let args;
    if (category && VALID_CATEGORIES.includes(category)) {
      query = `SELECT DISTINCT special_feature FROM posts WHERE special_feature IS NOT NULL AND special_feature != '' AND category = ? ${isAdmin ? '' : 'AND published = 1'} ORDER BY special_feature ASC`;
      args = [category];
    } else {
      query = `SELECT DISTINCT special_feature FROM posts WHERE special_feature IS NOT NULL AND special_feature != '' ${isAdmin ? '' : 'AND published = 1'} ORDER BY special_feature ASC`;
      args = [];
    }
    const { results } = await env.DB.prepare(query).bind(...args).all();
    const items = (results || []).map(r => r.special_feature).filter(Boolean);
    return json({ items });
  } catch (err) {
    console.error('GET /api/posts/special-features error:', err);
    return json({ items: [] });
  }
}
