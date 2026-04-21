/**
 * Gilwell Media · GET /api/admin/users
 *
 * Phase 1 (read-only). Lists all admin users including soft-deleted rows so
 * owners can restore within the 30-day window. Owner only — members get 403.
 *
 * Until owner lazy-seeding runs (Phase 2), this endpoint falls back gracefully:
 * if the current session is the legacy env.ADMIN_PASSWORD flow (no matching
 * admin_users row), we treat that session as owner.
 */
import { extractToken, verifyTokenRole } from '../../../_shared/auth.js';
import {
  ADMIN_MENUS,
  flattenMenuSlugs,
  isOwnerRole,
  MEMBER_DEFAULT_AI_DAILY_LIMIT,
  serializeAdminUser,
} from '../../../_shared/admin-users.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  // Phase 1: the legacy env.ADMIN_PASSWORD session has role='full' in its JWT
  // which we treat as owner-equivalent. Phase 2 will replace this with a proper
  // admin_users row lookup.
  const { results } = await env.DB.prepare(
    `SELECT id, username, display_name, role, permissions, editor_code,
            ai_daily_limit, status, must_change_password, created_at,
            last_login_at, deleted_at
       FROM admin_users
      ORDER BY
        CASE role WHEN 'owner' THEN 0 ELSE 1 END,
        status = 'deleted',
        created_at DESC`
  ).all();

  const users = (results || []).map((row) => serializeAdminUser(row));
  const bootstrapRequired = users.length === 0;

  return json({
    users,
    bootstrap_required: bootstrapRequired,
    member_default_ai_daily_limit: MEMBER_DEFAULT_AI_DAILY_LIMIT,
    menus: ADMIN_MENUS,
    menu_slugs: flattenMenuSlugs(),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
