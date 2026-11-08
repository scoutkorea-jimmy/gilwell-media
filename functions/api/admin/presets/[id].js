/**
 * Gilwell Media · /api/admin/presets/:id
 *
 *   PUT    — update a custom preset's name/description/permissions (owner only).
 *            Built-in slugs are immutable; their names and permissions are editable.
 *   DELETE — delete a custom preset (owner only). Built-ins cannot be removed.
 */
import { queryRust } from '../../../_shared/rust-server.js';
import { requireOwner } from '../../../_shared/admin-permissions.js';
import { validatePermissionsRust } from '../../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../../_shared/ops-log.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestPut({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 프리셋 ID입니다.' }, 400);

  const { row } = await presetMutation(request, env, {operation:'get', id});
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  // NOTE: owner may edit built-in presets (rebalancing permission defaults is
  // a legitimate operator task). Only slug is protected — changing it would
  // break the seeding contract with migrations.

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (body.if_permissions !== undefined) {
    const comparison = await queryRust({request,env}, 'preset-permissions-compare', {expected:body.if_permissions,stored:row.permissions});
    if (!comparison.ok) throw new Error('Rust preset permission comparison failed');
    if (!(await comparison.json()).matches) return json({ error: '프리셋 권한이 다른 화면에서 변경되었습니다. 최신 값을 다시 확인해주세요.' }, 409);
  }

  const fields = [];
  const values = [];
  const changes = [];
  let validatedNewPerms = null;
  const normalized = await queryRust({request,env}, 'preset-normalize', {operation:'update',body});
  if (!normalized.ok) throw new Error('Rust preset input validation failed');
  const input = await normalized.json();
  if (input.error) return json({error:input.error},input.status);

  if (body.name !== undefined) {
    fields.push('name = ?'); values.push(input.name); changes.push('name');
  }
  if (body.description !== undefined) {
    fields.push('description = ?'); values.push(input.description); changes.push('description');
  }
  if (body.permissions !== undefined) {
    const v = await validatePermissionsRust(env, body.permissions);
    if (!v.ok) return json({ error: v.error }, 400);
    validatedNewPerms = v.value;
    fields.push('permissions = ?'); values.push(JSON.stringify(v.value));
    changes.push('permissions');
  }

  if (!fields.length) return json({ error: '변경할 내용이 없습니다.' }, 400);

  try {
    // Preset-to-user auto propagation. When permissions change, find every
    // active member whose permissions matched the *previous* preset exactly
    // and push the new permissions down to them. Resolves the "I edited the
    // preset but the member didn't update" surprise — the owner's mental
    // model is that presets are the source of truth.
    // Safeguards:
    //   - Owner rows are never touched (only role='member').
    //   - Each matched member keeps their existing access_admin state.
    //   - A conditional update preserves independently changed member data.
    let propagatedCount = 0;
    let membersToUpdate = [];
    if (validatedNewPerms) {
      const { members } = await presetMutation(request, env, {operation:'matching-members', id, old_permissions:row.permissions, next_permissions:validatedNewPerms.permissions});
      membersToUpdate = members || [];
    }

    const result = await presetMutation(request, env, {operation:'update', id, snapshot:row, fields:changes, values, members:membersToUpdate});
    if (result.changed !== 1) return json({ error: '동시 프리셋 변경이 감지되었습니다. 입력을 보존하고 최신 값을 다시 확인해주세요.' }, 409);
    propagatedCount = result.propagated;

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_updated', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/presets/${id}`,
      message: `권한 프리셋 수정 — ${row.slug} (필드: ${changes.join(', ')})` +
        (propagatedCount > 0 ? ` · ${propagatedCount}명의 멤버에게 자동 반영` : ''),
    });

    return json({ success: true, propagated_members: propagatedCount });
  } catch (err) {
    console.error(`PUT /api/admin/presets/${id} error:`, err);
    return json({ error: '프리셋 수정 중 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 프리셋 ID입니다.' }, 400);

  const { row } = await presetMutation(request, env, {operation:'get', id});
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  if (row.is_builtin) {
    return json({ error: '빌트인 프리셋은 삭제할 수 없습니다.' }, 409);
  }

  try {
    const result = await presetMutation(request, env, {operation:'delete', id});
    if (!result.changes) return json({ error: '프리셋을 찾을 수 없거나 삭제할 수 없습니다.' }, 409);
    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_deleted', level: 'info',
      actor: session.username || 'owner', path: `/api/admin/presets/${id}`,
      message: `권한 프리셋 삭제 — ${row.slug}`,
    });
    return json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/admin/presets/${id} error:`, err);
    return json({ error: '프리셋 삭제 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function presetMutation(request, env, options) {
  const response = await queryRust({request, env}, 'preset-mutation', options);
  if (!response.ok) throw new Error('Rust preset mutation failed');
  return response.json();
}
