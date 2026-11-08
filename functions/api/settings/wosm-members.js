import { queryRust } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { normalizeWosmFieldsRust, normalizeWosmMembersColumnsRust, normalizeWosmMembersResponse, normalizeWosmMembersResponseRust, sanitizeWosmMembersItemsRust } from '../../_shared/wosm-members.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

// Parse stored JSON; the Rust normalizer applies the original first pass.
function parseStoredJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

export async function onRequestGet({ request, env }) {
  try {
    const rust = await queryRust({env, request: request || {url:'https://internal.invalid/'}}, 'settings-read', {target:'wosm_members'});
    if (!rust.ok) throw new Error('Rust WOSM settings read failed');
    const {rows} = await rust.json();
    const [row, columnsRow, mappingRow, countRow, copyRow, revRow] = rows;
    const [items, columns, fields] = await Promise.all([
      sanitizeWosmMembersItemsRust(parseStoredJson(row && row.value, []), env),
      normalizeWosmMembersColumnsRust(parseStoredJson(columnsRow && columnsRow.value, []), env),
      normalizeWosmFieldsRust(parseStoredJson(mappingRow && mappingRow.value, {}), parseStoredJson(copyRow && copyRow.value, {}), countRow && countRow.value, env),
    ]);
    const {mapping:importMapping,copy:publicCopy,count:registeredCount} = fields;
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json(await normalizeWosmMembersResponseRust(items, columns, importMapping, registeredCount, revision, publicCopy, env));
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

  const [items, columns, fields] = await Promise.all([
    sanitizeWosmMembersItemsRust(body && body.items, env),
    normalizeWosmMembersColumnsRust(body && body.columns, env),
    normalizeWosmFieldsRust(body && body.import_mapping, body && body.public_copy, body && body.registered_count, env),
  ]);
  const {mapping:importMapping,copy:publicCopy,count:registeredCount} = fields;
  const ifRevision = body && body.if_revision;

  try {
    const snapshot = await queryRust({request, env}, 'settings-read', {target:'wosm_save'});
    if (!snapshot.ok) throw new Error('Rust settings snapshot failed');
    const {rows} = await snapshot.json();
    const [prevRow, revRow] = rows;
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const payload = JSON.stringify(items);
    const values = [payload, JSON.stringify(columns), JSON.stringify(importMapping), String(registeredCount), JSON.stringify(publicCopy)];
    const rust = await queryRust({request, env}, 'settings-save', {target:'wosm_members', currentRev, nextRev:String(nextRev), values});
    if (!rust.ok) throw new Error('Rust WOSM settings write failed');
    const {changes} = await rust.json();
    if (changes !== 1) return json({ error: '다른 변경이 감지되었습니다. 입력은 유지됩니다.' }, 409);
    await recordSettingChange(env, {
      key: 'wosm_members',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/wosm-members',
      message: '세계연맹 회원국 현황 설정 변경',
      details: { revision: nextRev, count: items.length, registered_count: registeredCount, columns: columns, import_mapping: importMapping, public_copy: publicCopy },
    });
    return json(await normalizeWosmMembersResponseRust(items, columns, importMapping, registeredCount, nextRev, publicCopy, env));
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
