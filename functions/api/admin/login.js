/**
 * Gilwell Media · Admin Login
 * POST /api/admin/login
 *
 * Body:   { "password": "..." }
 * Returns 200: { "token": "..." }   ← store in sessionStorage
 * Returns 401: { "error": "..." }
 *
 * Required Cloudflare secrets (set in Pages dashboard):
 *   ADMIN_PASSWORD  — the admin password you choose
 *   ADMIN_SECRET    — random string for signing tokens (openssl rand -hex 32)
 */
import { createToken, safeCompare } from '../../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  // Validate environment is configured
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
    return json({ error: 'Server not configured. Set ADMIN_PASSWORD and ADMIN_SECRET secrets.' }, 500);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { password } = body;
  if (!password || typeof password !== 'string') {
    return json({ error: '비밀번호를 입력해주세요' }, 400);
  }

  // Timing-safe comparison — prevents brute-force timing attacks
  if (!safeCompare(password, env.ADMIN_PASSWORD)) {
    // Artificial delay further discourages automated brute-force
    await new Promise(r => setTimeout(r, 400));
    return json({ error: '비밀번호가 올바르지 않습니다' }, 401);
  }

  // Issue a signed 24-hour session token
  const token = await createToken(env.ADMIN_SECRET);
  return json({ token });
}

// Only POST is allowed on this endpoint
export function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
