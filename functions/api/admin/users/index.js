/**
 * Gilwell Media · /api/admin/users
 *
 *   GET   — list all admin users (owner only)
 *   POST  — create a new member (owner only)
 *
 * Owner creates members with role='member' (never another owner — Phase 3
 * enforces single-owner model; promote/demote is a future scope).
 *
 * Body for POST:
 *   {
 *     username, display_name, password,        // required
 *     editor_code?, ai_daily_limit?,
 *     permissions?: {access_admin:bool, permissions:[]},  // defaults: {access_admin:true, permissions:[]}
 *     must_change_password?: bool               // default true
 *   }
 */
import { extractToken, hashAdminPassword, verifyTokenRole } from '../../../_shared/auth.js';
import {
  ADMIN_MENUS,
  flattenMenuSlugs,
  MEMBER_DEFAULT_AI_DAILY_LIMIT,
  loadAdminUserByUsername,
  serializeAdminUser,
} from '../../../_shared/admin-users.js';
import { requireOwner } from '../../../_shared/admin-permissions.js';
import {
  validateAiDailyLimit,
  validateDisplayName,
  validateEditorCode,
  validatePassword,
  validatePermissions,
  validateUsername,
} from '../../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '오너 권한이 필요합니다.' }, 403);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, username, display_name, role, permissions, editor_code,
            ai_daily_limit, status, must_change_password,
            member_self_rename_used, created_at, last_login_at, deleted_at
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

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const usernameV = validateUsername(body.username);
  if (!usernameV.ok) return json({ error: usernameV.error }, 400);
  const displayV = validateDisplayName(body.display_name);
  if (!displayV.ok) return json({ error: displayV.error }, 400);
  const passwordV = validatePassword(body.password);
  if (!passwordV.ok) return json({ error: passwordV.error }, 400);
  const editorCodeV = validateEditorCode(body.editor_code);
  if (!editorCodeV.ok) return json({ error: editorCodeV.error }, 400);
  const aiLimitV = validateAiDailyLimit(body.ai_daily_limit);
  if (!aiLimitV.ok) return json({ error: aiLimitV.error }, 400);

  // Permissions default to access_admin=true + empty list (owner must explicitly
  // grant view/write on menus via the permission modal). Safer default than
  // inheriting the current operator's permissions.
  const permSource = body.permissions || { access_admin: true, permissions: [] };
  const permV = validatePermissions(permSource);
  if (!permV.ok) return json({ error: permV.error }, 400);

  // Reject duplicate username regardless of soft-delete state — we want the
  // owner to intentionally restore rather than accidentally mask a deleted row.
  const existing = await env.DB.prepare(
    `SELECT id, status FROM admin_users WHERE username = ?`
  ).bind(usernameV.value).first();
  if (existing) {
    return json({
      error: existing.status === 'deleted'
        ? '이전에 삭제된 아이디입니다. 복구 후 사용하거나 다른 아이디를 쓰세요.'
        : '이미 존재하는 아이디입니다.',
    }, 409);
  }

  // editor_code uniqueness — uq index also catches this, but surface a clean
  // message before we hit the DB error path.
  if (editorCodeV.value) {
    const codeExists = await env.DB.prepare(
      `SELECT id FROM admin_users WHERE editor_code = ? AND status != 'deleted'`
    ).bind(editorCodeV.value).first();
    if (codeExists) {
      return json({ error: `편집자 코드 "${editorCodeV.value}"가 이미 다른 사용자에게 할당되어 있습니다.` }, 409);
    }
  }

  const mustChange = body.must_change_password === false ? 0 : 1;
  const hash = await hashAdminPassword(passwordV.value);

  try {
    const insert = await env.DB.prepare(
      `INSERT INTO admin_users
         (username, display_name, password_hash, role, permissions, editor_code,
          ai_daily_limit, status, must_change_password, created_by)
       VALUES (?, ?, ?, 'member', ?, ?, ?, 'active', ?, ?)`
    ).bind(
      usernameV.value,
      displayV.value,
      JSON.stringify(hash),
      JSON.stringify(permV.value),
      editorCodeV.value,
      aiLimitV.value,
      mustChange,
      session.uid || null,
    ).run();
    const newId = insert && insert.meta && insert.meta.last_row_id;

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_created', level: 'info',
      actor: session.username || 'owner', path: '/api/admin/users',
      message: `사용자 생성 — ${usernameV.value} (${displayV.value})`,
    });

    const row = await env.DB.prepare(
      `SELECT id, username, display_name, role, permissions, editor_code,
              ai_daily_limit, status, must_change_password, created_at, last_login_at
         FROM admin_users WHERE id = ?`
    ).bind(newId).first();

    return json({ user: serializeAdminUser(row) }, 201);
  } catch (err) {
    console.error('POST /api/admin/users error:', err);
    return json({ error: '사용자 생성 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
