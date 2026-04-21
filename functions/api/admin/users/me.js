/**
 * Gilwell Media · GET /api/admin/users/me
 *
 * Returns the currently authenticated admin user's profile + permission set.
 * During Phase 1 (before owner lazy-seed), a legacy env.ADMIN_PASSWORD session
 * is reported as a synthetic owner profile so the admin UI has something to
 * render.
 */
import { extractToken, readToken, verifyToken } from '../../../_shared/auth.js';
import {
  ADMIN_MENUS,
  flattenMenuSlugs,
  ROLES,
  serializeAdminUser,
} from '../../../_shared/admin-users.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const payload = await readToken(token, env.ADMIN_SECRET);
  const uid = Number(payload && payload.uid) || null;

  let userRow = null;
  if (uid) {
    userRow = await env.DB.prepare(
      `SELECT id, username, display_name, role, permissions, editor_code,
              ai_daily_limit, status, must_change_password, created_at,
              last_login_at
         FROM admin_users
        WHERE id = ? AND status != 'deleted'`
    ).bind(uid).first();
  }

  if (userRow) {
    if (userRow.status === 'disabled') {
      return json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, 403);
    }
    return json({
      user: serializeAdminUser(userRow),
      menus: ADMIN_MENUS,
      menu_slugs: flattenMenuSlugs(),
      legacy_session: false,
    });
  }

  // Legacy env.ADMIN_PASSWORD session (JWT has no uid). Surface a synthetic
  // owner profile — Phase 2 login will upgrade this on next sign-in.
  return json({
    user: {
      id: null,
      username: 'owner',
      display_name: 'Owner',
      role: ROLES.OWNER,
      editor_code: null,
      ai_daily_limit: null,
      status: 'active',
      must_change_password: false,
      created_at: null,
      last_login_at: null,
      permissions: { access_admin: true, permissions: [] },
    },
    menus: ADMIN_MENUS,
    menu_slugs: flattenMenuSlugs(),
    legacy_session: true,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
