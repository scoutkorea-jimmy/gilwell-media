import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'releases', 'view'); if (__gate) return __gate

  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(origin + '/data/changelog.json', {
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!res.ok) {
      return json({ items: [] });
    }
    const data = await res.json();
    return json(Array.isArray(data) ? { items: data } : data);
  } catch (err) {
    console.error('GET /api/admin/changelog error:', err);
    return json({ items: [] });
  }
}
