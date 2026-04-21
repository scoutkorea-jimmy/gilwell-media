/**
 * Gilwell Media · Admin permission gates
 *
 * Phase 2 helpers for inspecting the authenticated admin user and enforcing
 * menu-level permissions on admin APIs. Owner (role='full'/'owner') short-
 * circuits every check. Members must have the specific `view:<menu>` or
 * `write:<menu>` entry in their permissions blob.
 *
 * Used by handlers introduced in Phase 3 (user/preset CRUD) and the retrofit
 * of existing handlers in Phase 4.
 */
import { extractToken, readToken, verifyToken } from './auth.js';
import {
  hasMenuPermission,
  isOwnerRole,
  loadAdminUserById,
  parsePermissions,
} from './admin-users.js';

/**
 * Load the full admin session context in one call: token payload, matching
 * admin_users row (if any), parsed permissions. Returns null for any
 * unauthenticated or malformed session.
 */
export async function loadAdminSession(request, env) {
  const token = extractToken(request);
  if (!token) return null;
  const valid = await verifyToken(token, env);
  if (!valid) return null;
  const payload = await readToken(token, env.ADMIN_SECRET);
  if (!payload) return null;

  const tokenRole = payload.role || 'full';
  const uid = payload.uid ? Number(payload.uid) : null;

  let user = null;
  if (uid) {
    user = await loadAdminUserById(env, uid);
    if (!user) return null; // token references a deleted/nonexistent user
    if (user.status !== 'active') return null;
  }

  // Owner sessions skip the permissions blob entirely.
  const isOwner = isOwnerRole((user && user.role) || tokenRole) || tokenRole === 'full';

  const permissions = user
    ? parsePermissions(user.permissions)
    : { access_admin: true, permissions: new Set() }; // legacy owner session

  return {
    token,
    payload,
    user,                          // admin_users row (null for legacy session)
    uid: user ? user.id : null,
    username: (user && user.username) || payload.username || (isOwner ? 'owner' : null),
    role: user ? user.role : (tokenRole === 'member' ? 'member' : 'owner'),
    jwtRole: tokenRole,
    isOwner,
    permissions,                   // { access_admin, permissions: Set<string> }
    legacySession: !user,
  };
}

/**
 * 401 if not signed in, 403 if not owner. Returns session on success.
 */
export async function requireOwner(request, env) {
  const session = await loadAdminSession(request, env);
  if (!session) return { session: null, error: unauthorized() };
  if (!session.isOwner) return { session, error: forbidden('오너 권한이 필요합니다.') };
  return { session, error: null };
}

/**
 * Any authenticated admin (owner or active member with access_admin=true).
 */
export async function requireAnyAdmin(request, env) {
  const session = await loadAdminSession(request, env);
  if (!session) return { session: null, error: unauthorized() };
  if (!session.isOwner && !session.permissions.access_admin) {
    return { session, error: forbidden('관리자 접근 권한이 없습니다.') };
  }
  return { session, error: null };
}

/**
 * Require a specific menu action. `action` is 'view' or 'write'.
 * Owner passes unconditionally.
 */
export async function requireMenu(request, env, menuSlug, action) {
  const session = await loadAdminSession(request, env);
  if (!session) return { session: null, error: unauthorized() };
  if (session.isOwner) return { session, error: null };
  if (!session.permissions.access_admin) {
    return { session, error: forbidden('관리자 접근 권한이 없습니다.') };
  }
  if (!hasMenuPermission(session.permissions, menuSlug, action)) {
    return { session, error: forbidden(`이 메뉴의 ${action === 'write' ? '쓰기' : '보기'} 권한이 없습니다.`) };
  }
  return { session, error: null };
}

/**
 * Writer self-check: the post must belong to the session user. Owner bypasses.
 */
export function sessionOwnsPost(session, postRow) {
  if (!session || !postRow) return false;
  if (session.isOwner) return true;
  if (!session.uid) return false;
  return Number(postRow.author_user_id) === Number(session.uid);
}

/**
 * Publish kill switch: when global setting is 'on', only owner can flip a
 * post's `published` flag to 1 (or set publish_at into the future for scheduling).
 * Read the current switch state once per request.
 */
export async function isPublishKillSwitchOn(env) {
  if (!env || !env.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'publish_kill_switch'`
    ).first();
    return row && String(row.value).toLowerCase() === 'on';
  } catch {
    return false;
  }
}

export async function requirePublishAllowed(env, session) {
  if (!session) return { error: unauthorized() };
  if (session.isOwner) return { error: null };
  const on = await isPublishKillSwitchOn(env);
  if (on) {
    return { error: forbidden('현재 공개 전환이 차단되어 있습니다. 오너 승인 후 다시 시도해주세요.') };
  }
  return { error: null };
}

function unauthorized() {
  return jsonResponse({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
}

function forbidden(message) {
  return jsonResponse({ error: message || '권한이 없습니다.' }, 403);
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Phase 5 retrofit helper — mirrors the shape of the original
 * `if (!token || !verifyTokenRole(...)) return 401` pattern but switches to
 * menu-level checks so member sessions can reach endpoints within their
 * permission matrix.
 *
 * Usage at the top of a handler:
 *   const gate = await gateMenuAccess(request, env, 'hero', 'view');
 *   if (gate) return gate;
 *
 * Returns:
 *   null            — authorized (owner or member with the specific token)
 *   401 Response    — no valid session
 *   403 Response    — session exists but lacks access_admin or the menu token
 */
export async function gateMenuAccess(request, env, menuSlug, action) {
  const session = await loadAdminSession(request, env);
  if (!session) return unauthorized();
  if (session.isOwner) return null;
  if (!session.permissions.access_admin) {
    return forbidden('관리자 접근 권한이 없습니다.');
  }
  if (!hasMenuPermission(session.permissions, menuSlug, action)) {
    const actionLabel = action === 'write' ? '쓰기' : '보기';
    return forbidden(`이 메뉴의 ${actionLabel} 권한이 없습니다. 오너에게 요청하세요.`);
  }
  return null;
}

/**
 * Minimum-bar gate — any authenticated admin session with access_admin=true.
 * For endpoints that don't map cleanly to one of the 27 menu slugs (e.g.
 * /api/admin/session, /api/admin/users/me, /api/admin/presets GET).
 */
export async function gateAnyAdmin(request, env) {
  const session = await loadAdminSession(request, env);
  if (!session) return unauthorized();
  if (session.isOwner) return null;
  if (!session.permissions.access_admin) {
    return forbidden('관리자 접근 권한이 없습니다.');
  }
  return null;
}
