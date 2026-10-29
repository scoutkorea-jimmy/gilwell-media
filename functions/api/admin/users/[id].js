/**
 * Gilwell Media · /api/admin/users/:id
 *
 *   GET    — fetch one user (owner only; members access themselves via /users/me)
 *   PUT    — patch fields: display_name, editor_code, ai_daily_limit, status,
 *            permissions, must_change_password (owner only)
 *   DELETE — soft delete by default (status='deleted', deleted_at=now,
 *            token_min_iat bump). `?hard=1` performs hard DELETE but preserves
 *            posts.author_user_id as an orphan snapshot.
 *            Owner cannot delete themselves or the last active owner.
 *
 * Posts are never cascaded. The owner promise is: users go away, articles stay.
 */
import { bumpAdminUserTokenEpoch } from '../../../_shared/auth.js';
import { countActiveOwners, loadAdminUserById, serializeAdminUser, parsePermissions } from '../../../_shared/admin-users.js';
import { requireOwner } from '../../../_shared/admin-permissions.js';
import {
  validateIdentityRust,
  validatePermissionsRust,
} from '../../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../../_shared/ops-log.js';
import { queryRust } from '../../../_shared/rust-server.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestGet({ params, request, env }) {
  const { error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const result = await queryRust({request, env}, 'admin-user-read', {operation:'detail', id});
  if (!result.ok) throw new Error('Rust admin detail failed');
  const {row} = await result.json();
  if (!row) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);

  return json({ user: serializeAdminUser(row) });
}

export async function onRequestPut({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const target = await loadAdminUserById(env, id);
  if (!target) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (body.permissions !== undefined && body.if_permissions !== undefined) {
    const previous = await validatePermissionsRust(env, body.if_permissions);
    const parsed = parsePermissions(target.permissions);
    const current = { ok: true, value: { access_admin: parsed.access_admin, permissions: Array.from(parsed.permissions) } };
    const canonical = (value) => JSON.stringify({ access_admin: value.access_admin, permissions: [...value.permissions].sort() });
    if (!previous.ok || !current.ok || canonical(previous.value) !== canonical(current.value)) {
      return json({ error: '사용자 권한이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 권한을 다시 확인해주세요.' }, 409);
    }
  }

  const fields = [];
  const values = [];
  const changes = [];

  if (body.username !== undefined) {
    const v = await validateIdentityRust(env, 'username', body.username, target.role === 'owner');
    if (!v.ok) return json({ error: v.error }, 400);
    if (v.value !== target.username) {
      const response = await queryRust({request, env}, 'admin-user-read', {operation:'username-clash', username:v.value, id});
      if (!response.ok) throw new Error('Rust admin username check failed');
      const {row:clash} = await response.json();
      if (clash) return json({ error: '이미 존재하는 아이디입니다.' }, 409);
      fields.push('username = ?'); values.push(v.value);
      changes.push('username(' + target.username + '→' + v.value + ')');
    }
  }
  // Owner may restore a member's self-rename quota at any time.
  if (body.reset_member_self_rename === true && target.role !== 'owner') {
    fields.push('member_self_rename_used = 0');
    changes.push('reset_self_rename_quota');
  }
  if (body.display_name !== undefined) {
    const v = await validateIdentityRust(env, 'display', body.display_name);
    if (!v.ok) return json({ error: v.error }, 400);
    fields.push('display_name = ?'); values.push(v.value);
    changes.push('display_name');
  }
  if (body.editor_code !== undefined) {
    const v = await validateIdentityRust(env, 'editor', body.editor_code);
    if (!v.ok) return json({ error: v.error }, 400);
    if (v.value) {
      const response = await queryRust({request, env}, 'admin-user-read', {operation:'editor-clash', editor_code:v.value, id});
      if (!response.ok) throw new Error('Rust admin editor code check failed');
      const {row:codeClash} = await response.json();
      if (codeClash) {
        return json({ error: `편집자 코드 "${v.value}"가 이미 다른 사용자에게 할당되어 있습니다.` }, 409);
      }
    }
    fields.push('editor_code = ?'); values.push(v.value);
    changes.push('editor_code');
  }
  if (body.ai_daily_limit !== undefined) {
    const v = await validateIdentityRust(env, 'ai-limit', body.ai_daily_limit);
    if (!v.ok) return json({ error: v.error }, 400);
    fields.push('ai_daily_limit = ?'); values.push(v.value);
    changes.push('ai_daily_limit');
  }
  if (body.permissions !== undefined) {
    const v = await validatePermissionsRust(env, body.permissions);
    if (!v.ok) return json({ error: v.error }, 400);
    fields.push('permissions = ?'); values.push(JSON.stringify(v.value));
    changes.push('permissions');
  }
  if (body.must_change_password !== undefined) {
    fields.push('must_change_password = ?');
    values.push(body.must_change_password ? 1 : 0);
    changes.push('must_change_password');
  }

  let statusChanged = false;
  let newStatus = null;
  if (body.status !== undefined) {
    const v = await validateIdentityRust(env, 'status', body.status);
    if (!v.ok) return json({ error: v.error }, 400);
    newStatus = v.value;

    // Last-owner protection: can't disable the last active owner (including self).
    if (target.role === 'owner' && v.value === 'disabled') {
      const owners = await countActiveOwners(env);
      if (owners <= 1) {
        return json({ error: '마지막 활성 오너는 비활성화할 수 없습니다.' }, 409);
      }
    }
    if (v.value === 'disabled' && session.uid && Number(session.uid) === Number(id)) {
      return json({ error: '본인 계정은 비활성화할 수 없습니다.' }, 409);
    }
    fields.push('status = ?'); values.push(v.value);
    changes.push('status');
    statusChanged = v.value !== target.status;
  }

  if (!fields.length) {
    return json({ error: '변경할 내용이 없습니다.' }, 400);
  }
  fields.push("updated_at = datetime('now')");

  try {
    const guarded = body.permissions !== undefined && body.if_permissions !== undefined;
    const result = await queryRust({request, env}, 'admin-user-update', {fields, values, id, guarded, previous:target.permissions});
    if (!result.ok) throw new Error('Rust admin user update failed');
    const {changes:updated} = await result.json();
    if (guarded && updated !== 1) return json({ error: '동시 권한 변경이 감지되었습니다. 입력을 보존하고 최신 권한을 다시 확인해주세요.' }, 409);

    // status → disabled should invalidate every outstanding session for that user.
    if (statusChanged && newStatus === 'disabled') {
      await bumpAdminUserTokenEpoch(env, id);
    }

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_updated', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/users/${id}`,
      message: `사용자 수정 — ${target.username} (필드: ${changes.join(', ')})`,
    });

    const rowResponse = await queryRust({request, env}, 'admin-user-read', {operation:'updated-row', id});
    if (!rowResponse.ok) throw new Error('Rust updated user lookup failed');
    const {row} = await rowResponse.json();
    return json({ user: serializeAdminUser(row) });
  } catch (err) {
    console.error(`PUT /api/admin/users/${id} error:`, err);
    return json({ error: '사용자 수정 중 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const targetResponse = await queryRust({request, env}, 'admin-user-read', {operation:'delete-target', id});
  if (!targetResponse.ok) throw new Error('Rust admin delete lookup failed');
  const {row:target} = await targetResponse.json();
  if (!target) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);

  if (session.uid && Number(session.uid) === Number(id)) {
    return json({ error: '본인 계정은 삭제할 수 없습니다.' }, 409);
  }
  if (target.role === 'owner') {
    const owners = await countActiveOwners(env);
    if (owners <= 1) {
      return json({ error: '마지막 활성 오너는 삭제할 수 없습니다.' }, 409);
    }
  }

  const url = new URL(request.url);
  const hard = url.searchParams.get('hard') === '1';

  try {
    if (hard) {
      // Hard delete — GDPR Art. 17 right to erasure. Drop the row but:
      //   1. Preserve posts.author_user_id as an orphan pointer (posts live on).
      //   2. Anonymize the username in every audit/log table so we retain the
      //      record of *what happened* (security requirement) while erasing
      //      the personally identifying key (*who did it*). The replacement
      //      token is '[deleted:<uid>]' so the log stays internally consistent.
      const anonToken = `[deleted:${id}]`;
      const deleted = await queryRust({request, env}, 'admin-user-delete', {id, hard, username:target.username, anonymized:anonToken});
      if (!deleted.ok) throw new Error('Rust admin hard delete failed');
      await logOperationalEvent(env, {
        channel: 'admin', type: 'admin_user_hard_deleted', level: 'warn',
        actor: session.username || 'owner', path: `/api/admin/users/${id}`,
        message: `사용자 완전 삭제 — ${target.username} → ${anonToken} (GDPR Art.17 · 감사 로그는 익명화 후 보존, 게시글은 유지)`,
      });
      return json({ success: true, hard: true, anonymized_as: anonToken });
    }

    const deleted = await queryRust({request, env}, 'admin-user-delete', {id, hard, username:target.username, anonymized:''});
    if (!deleted.ok) throw new Error('Rust admin soft delete failed');
    await bumpAdminUserTokenEpoch(env, id);

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_user_soft_deleted', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/users/${id}`,
      message: `사용자 삭제 (soft) — ${target.username} · 30일 이내 복구 가능`,
    });

    return json({ success: true, hard: false });
  } catch (err) {
    console.error(`DELETE /api/admin/users/${id} error:`, err);
    return json({ error: '사용자 삭제 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
