import { verifyTokenRole, extractToken } from '../../../functions/_shared/auth.js';
import { gateMenuAccess } from '../../../functions/_shared/admin-permissions.js';
import { normalizeWosmImportMapping, normalizeWosmMembersColumns, normalizeWosmMembersResponse, normalizeWosmPublicCopy, normalizeWosmRegisteredCount, parseWosmImportMapping, parseWosmMembersColumns, parseWosmMembersPayload, parseWosmPublicCopy, sanitizeWosmMembersItems } from '../../../functions/_shared/wosm-members.js';
import { recordSettingChange } from '../../../functions/_shared/settings-audit.js';

export async function onRequestGet({ request, env }) {
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
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') {
      return json({ error: '회원국 현황을 불러오지 못했습니다. 다시 시도해주세요.' }, 503);
    }
    return json(normalizeWosmMembersResponse([], [], {}, 176, 0, {}));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'wosm-members', 'write'); if (__gate) return __gate

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
    const writes = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('wosm_members_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`
      ).bind(String(nextRev), currentRev),
      env.DB.prepare(
        `INSERT INTO settings (key, value) SELECT 'wosm_members', ? WHERE changes() = 1
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(payload),
      env.DB.prepare(
        `INSERT INTO settings (key, value) SELECT 'wosm_members_columns', ? WHERE changes() = 1
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(columns)),
      env.DB.prepare(
        `INSERT INTO settings (key, value) SELECT 'wosm_members_import_mapping', ? WHERE changes() = 1
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(importMapping)),
      env.DB.prepare(
        `INSERT INTO settings (key, value) SELECT 'wosm_members_registered_count', ? WHERE changes() = 1
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(registeredCount)),
      env.DB.prepare(
        `INSERT INTO settings (key, value) SELECT 'wosm_members_public_copy', ? WHERE changes() = 1
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(publicCopy)),
    ]);
    if (!writes[0] || !writes[0].meta || writes[0].meta.changes !== 1) return json({ error: '다른 변경이 감지되었습니다. 입력은 유지됩니다.' }, 409);
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
