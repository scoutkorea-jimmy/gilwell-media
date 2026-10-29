/**
 * GET /api/posts/special-features?category=<category>
 * Returns distinct active special_feature values for a category.
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { queryRust } from '../../_shared/rust-server.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = extractToken(request);
  const isAdmin = token ? await verifyTokenRole(token, env, 'full').catch(() => false) : false;

  try {
    const rust = await queryRust(context, 'post-features-query', {url:request.url,isAdmin});
    if (!rust.ok) throw new Error('Rust features query failed');
    return json(await rust.json());
  } catch (err) {
    console.error('GET /api/posts/special-features error:', err);
    return json({ items: [] });
  }
}
