import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token) {
    return json({ error: '관리자 로그인이 필요합니다.' }, 401);
  }

  const full = await verifyTokenRole(token, env.ADMIN_SECRET, 'full');
  if (full) {
    return json({ authenticated: true, role: 'full' });
  }

  const limited = await verifyTokenRole(token, env.ADMIN_SECRET, ['full', 'limited']);
  if (limited) {
    return json({ authenticated: true, role: 'limited' });
  }

  return json({ error: '관리자 세션이 만료되었거나 유효하지 않습니다.' }, 401);
}

export function onRequestPost(context) {
  return onRequestGet(context);
}
