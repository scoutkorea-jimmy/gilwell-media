import { clearAdminSessionCookie, extractToken, verifyTokenRole } from '../../_shared/auth.js';

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
      continue;
    }
    headers.set(key, value);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token) {
    return json({ error: '관리자 로그인이 필요합니다.' }, 401);
  }

  const full = await verifyTokenRole(token, env, 'full');
  if (full) {
    return json({ authenticated: true, role: 'full' });
  }

  return json({ error: '관리자 세션이 만료되었거나 유효하지 않습니다.' }, 401);
}

export function onRequestPost(context) {
  return onRequestGet(context);
}

export function onRequestDelete() {
  return json({ ok: true }, 200, {
    'Set-Cookie': clearAdminSessionCookie(),
  });
}
