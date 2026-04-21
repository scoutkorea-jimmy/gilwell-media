import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { normalizeWosmImportMapping, normalizeWosmMembersColumns, normalizeWosmMembersResponse, normalizeWosmPublicCopy, normalizeWosmRegisteredCount, parseWosmImportMapping, parseWosmMembersColumns, parseWosmMembersPayload, parseWosmPublicCopy, sanitizeWosmMembersItems } from '../../_shared/wosm-members.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const [row, columnsRow, mappingRow, countRow, copyRow, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_columns'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_import_mapping'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_registered_count'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_public_copy'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_rev'`).first(),
    ]);
    const items = parseWosmMembersPayload(row && row.value);
    const columns = parseWosmMembersColumns(columnsRow && columnsRow.value);
    const importMapping = parseWosmImportMapping(mappingRow && mappingRow.value);
    const registeredCount = normalizeWosmRegisteredCount(countRow && countRow.value);
    const publicCopy = parseWosmPublicCopy(copyRow && copyRow.value);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json(normalizeWosmMembersResponse(items, columns, importMapping, registeredCount, revision, publicCopy));
  } catch (err) {
    console.error('GET /api/settings/wosm-members error:', err);
    return json(normalizeWosmMembersResponse([], [], {}, 176, 0, {}));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'wosm-members', 'view'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const items = sanitizeWosmMembersItems(body && body.items);
  const columns = normalizeWosmMembersColumns(body && body.columns);
  const importMapping = normalizeWosmImportMapping(body && body.import_mapping);
  const registeredCount = normalizeWosmRegisteredCount(body && body.registered_count);
  const publicCopy = normalizeWosmPublicCopy(body && body.public_copy);
  const ifRevision = body && body.if_revision;

  try {
    const [revRow, prevRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_rev'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members'`).first(),
    ]);
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const payload = JSON.stringify(items);
    await Promise.all([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(payload).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(nextRev)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_columns', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(columns)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_import_mapping', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(importMapping)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_registered_count', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(registeredCount)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_public_copy', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(publicCopy)).run(),
    ]);
    await recordSettingChange(env, {
      key: 'wosm_members',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/wosm-members',
      message: '세계연맹 회원국 현황 설정 변경',
      details: { revision: nextRev, count: items.length, registered_count: registeredCount, columns: columns, import_mapping: importMapping, public_copy: publicCopy },
    });
    return json(normalizeWosmMembersResponse(items, columns, importMapping, registeredCount, nextRev, publicCopy));
  } catch (err) {
    console.error('PUT /api/settings/wosm-members error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
