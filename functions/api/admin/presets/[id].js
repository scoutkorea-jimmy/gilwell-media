/**
 * Gilwell Media · /api/admin/presets/:id
 *
 *   PUT    — update a custom preset's name/description/permissions (owner only).
 *            Built-in slugs are immutable; their names and permissions are editable.
 *   DELETE — delete a custom preset (owner only). Built-ins cannot be removed.
 */
import { requireOwner } from '../../../_shared/admin-permissions.js';
import { validatePermissions } from '../../../_shared/admin-user-validation.js';
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

  const row = await env.DB.prepare(
    `SELECT id, slug, name, description, is_builtin, permissions, updated_at FROM admin_user_presets WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  // NOTE: owner may edit built-in presets (rebalancing permission defaults is
  // a legitimate operator task). Only slug is protected — changing it would
  // break the seeding contract with migrations.

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (body.if_permissions !== undefined && canonicalizePerms(body.if_permissions) !== canonicalizePerms(parsePermBlob(row.permissions))) {
    return json({ error: '프리셋 권한이 다른 화면에서 변경되었습니다. 최신 값을 다시 확인해주세요.' }, 409);
  }

  const fields = [];
  const values = [];
  const changes = [];
  let validatedNewPerms = null;

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return json({ error: '프리셋 이름은 비워둘 수 없습니다.' }, 400);
    fields.push('name = ?'); values.push(name); changes.push('name');
  }
  if (body.description !== undefined) {
    const desc = String(body.description || '').trim().slice(0, 500);
    fields.push('description = ?'); values.push(desc); changes.push('description');
  }
  if (body.permissions !== undefined) {
    const v = validatePermissions(body.permissions);
    if (!v.ok) return json({ error: v.error }, 400);
    validatedNewPerms = v.value;
    fields.push('permissions = ?'); values.push(JSON.stringify(v.value));
    changes.push('permissions');
  }

  if (!fields.length) return json({ error: '변경할 내용이 없습니다.' }, 400);
  fields.push("updated_at = datetime('now')");

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
    const statements = [];
    if (validatedNewPerms) {
      const oldCanonical = canonicalizePerms(parsePermBlob(row.permissions));
      const members = await env.DB.prepare(
        `SELECT id, username, permissions FROM admin_users
           WHERE status = 'active' AND role = 'member'`
      ).all();
      for (const m of (members.results || [])) {
        const parsed = parsePermBlob(m.permissions);
        if (canonicalizePerms(parsed) === oldCanonical) {
          const newSerialized = JSON.stringify({ access_admin: !!parsed.access_admin, permissions: validatedNewPerms.permissions });
          statements.push(env.DB.prepare(
            `UPDATE admin_users SET permissions = ?, updated_at = datetime('now') WHERE id = ? AND role = 'member' AND status = 'active' AND permissions = ?
             AND EXISTS (SELECT 1 FROM admin_user_presets WHERE id = ? AND permissions = ? AND updated_at = ? AND name = ? AND COALESCE(description, '') = ?)`
          ).bind(newSerialized, m.id, m.permissions, id, row.permissions, row.updated_at, row.name, row.description || ''));
        }
      }
    }

    // D1 batch is transactional: no partially updated preset/member cohort.
    statements.push(env.DB.prepare(
      `UPDATE admin_user_presets SET ${fields.join(', ')} WHERE id = ? AND permissions = ? AND updated_at = ? AND name = ? AND COALESCE(description, '') = ?`
    ).bind(...values, id, row.permissions, row.updated_at, row.name, row.description || ''));
    const results = await env.DB.batch(statements);
    if (!results[results.length - 1].meta || results[results.length - 1].meta.changes !== 1) return json({ error: '동시 프리셋 변경이 감지되었습니다. 입력을 보존하고 최신 값을 다시 확인해주세요.' }, 409);
    propagatedCount = results.slice(0, -1).reduce((sum, result) => sum + ((result.meta && result.meta.changes) || 0), 0);

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

function parsePermBlob(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return { access_admin: false, permissions: [] };
  try { return JSON.parse(raw); } catch { return { access_admin: false, permissions: [] }; }
}

// Stable JSON shape for exact-match comparison. Sorting the permissions array
// makes the string representation deterministic regardless of insertion order.
function canonicalizePerms(perms) {
  const list = Array.isArray(perms && perms.permissions) ? perms.permissions : [];
  const sorted = [...list].filter((x) => typeof x === 'string').sort();
  return JSON.stringify({ access_admin: !!(perms && perms.access_admin), permissions: sorted });
}

export async function onRequestDelete({ params, request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 프리셋 ID입니다.' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, slug, is_builtin FROM admin_user_presets WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: '프리셋을 찾을 수 없습니다.' }, 404);
  if (row.is_builtin) {
    return json({ error: '빌트인 프리셋은 삭제할 수 없습니다.' }, 409);
  }

  try {
    await env.DB.prepare(`DELETE FROM admin_user_presets WHERE id = ?`).bind(id).run();
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
