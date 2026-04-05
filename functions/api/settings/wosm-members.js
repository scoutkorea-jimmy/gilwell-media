import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { normalizeWosmImportMapping, normalizeWosmMembersColumns, normalizeWosmMembersResponse, parseWosmImportMapping, parseWosmMembersColumns, parseWosmMembersPayload, sanitizeWosmMembersItems } from '../../_shared/wosm-members.js';

export async function onRequestGet({ env }) {
  try {
    const [row, columnsRow, mappingRow, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_columns'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_import_mapping'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'wosm_members_rev'`).first(),
    ]);
    const items = parseWosmMembersPayload(row && row.value);
    const columns = parseWosmMembersColumns(columnsRow && columnsRow.value);
    const importMapping = parseWosmImportMapping(mappingRow && mappingRow.value);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json(normalizeWosmMembersResponse(items, columns, importMapping, revision));
  } catch (err) {
    console.error('GET /api/settings/wosm-members error:', err);
    return json(normalizeWosmMembersResponse([], [], {}, 0));
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const items = sanitizeWosmMembersItems(body && body.items);
  const columns = normalizeWosmMembersColumns(body && body.columns);
  const importMapping = normalizeWosmImportMapping(body && body.import_mapping);
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
      prevRow ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('wosm_members', prevRow.value).run() : null,
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
    ]);
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'settings_change',
      level: 'info',
      actor: 'admin',
      path: '/api/settings/wosm-members',
      message: '세계연맹 회원국 현황 설정 변경',
      details: { key: 'wosm_members', revision: nextRev, count: items.length, columns: columns, import_mapping: importMapping },
    });
    return json(normalizeWosmMembersResponse(items, columns, importMapping, nextRev));
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
