/**
 * Lightweight D1-backed fixed-window rate limiter.
 *
 * Storage schema (created lazily on first use):
 *   CREATE TABLE api_rate_limit (
 *     bucket_key      TEXT PRIMARY KEY,
 *     count           INTEGER NOT NULL,
 *     window_start_at INTEGER NOT NULL   -- unix seconds
 *   );
 *
 * Usage:
 *   const rl = await enforceRateLimit(env, {
 *     route: 'like',
 *     identity: getClientIp(request),
 *     limit: 10,
 *     windowSeconds: 60,
 *   });
 *   if (!rl.ok) return rateLimitResponse(rl);
 *
 * Design choices:
 *   - Fixed window (not sliding) keeps storage O(1) per identity+route.
 *   - 1-2 D1 round trips per request. Hot public paths (home feed) should NOT
 *     be rate-limited by this utility — use Cloudflare's edge cache instead.
 *   - No pruning job: rows are overwritten on the next call after the window
 *     expires. Old entries are harmless (window_start_at check gates them).
 */

import { queryRust } from './rust-server.js';

const schemaReady = new WeakSet();

async function ensureSchema(env) {
  if (schemaReady.has(env.DB)) return;
  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'rate-ensure', {});
    if (!response.ok) throw new Error('Rust rate schema setup failed');
    schemaReady.add(env.DB);
  } catch (err) {
    console.error('[rate-limit] schema init failed:', err);
  }
}

export function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function enforceRateLimit(env, { route, identity, limit, windowSeconds }) {
  if (!env || !env.DB) return { ok: true, remaining: limit };
  const safeRoute = String(route || 'default').slice(0, 64);
  const safeIdentity = String(identity || 'unknown').slice(0, 128);
  const bucketKey = `${safeRoute}:${safeIdentity}`;
  const now = Math.floor(Date.now() / 1000);
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindow = Math.max(1, Math.floor(windowSeconds));

  await ensureSchema(env);

  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'rate-enforce', {
      key:bucketKey, now, limit:safeLimit, window:safeWindow,
    });
    if (!response.ok) throw new Error('Rust rate limit failed');
    return await response.json();
  } catch (err) {
    // D1 hiccup — fail OPEN so real users aren't locked out during a transient
    // database issue. An attacker would still face application-layer validation.
    console.error('[rate-limit] enforce failed:', err);
    return { ok: true, remaining: safeLimit, windowSeconds: safeWindow, error: true };
  }
}

export function rateLimitResponse(rl, message) {
  const retryAfter = Math.max(1, Number(rl?.retryAfter || 60));
  const body = JSON.stringify({
    error: message || '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    retry_after: retryAfter,
  });
  return new Response(body, {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': String(retryAfter),
    },
  });
}
