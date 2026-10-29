import { clearAdminSessionCookie, extractToken, readToken, verifyToken } from '../../_shared/auth.js';
import { loadAdminUserById, serializeAdminUser } from '../../_shared/admin-users.js';

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

  const valid = await verifyToken(token, env);
  if (!valid) {
    return json({ error: '관리자 세션이 만료되었거나 유효하지 않습니다.' }, 401);
  }

  const payload = await readToken(token, env.ADMIN_SECRET);
  const role = (payload && payload.role) || 'full';
  const uid = payload && payload.uid ? Number(payload.uid) : null;

  // Phase 2: surface the authenticated user's identity + role so the frontend
  // can show the right username and gate UI without a second round trip.
  let user = null;
  if (uid) {
    const row = await loadAdminUserById(env, uid);
    if (row) user = serializeAdminUser(row);
  }

  return json({
    authenticated: true,
    role,
    user,
    legacy_session: !uid,
  });
}

export function onRequestPost(context) {
  return onRequestGet(context);
}

export function onRequestDelete() {
  return json({ ok: true }, 200, {
    'Set-Cookie': clearAdminSessionCookie(),
  });
}
