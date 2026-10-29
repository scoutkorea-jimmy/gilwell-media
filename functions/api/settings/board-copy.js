import { settingSnapshot, saveRevisionedSetting, queryRust } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { DEFAULT_BOARD_COPY } from '../../_shared/board-copy.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const { results } = await settingSnapshot(env, 'board_copy');
    const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
    const copy = await normalizeBoardCopy(env, values.board_copy);
    copy.revision = parseInt(values.board_copy_rev, 10) || 0;
    return json(copy);
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    console.error('GET /api/settings/board-copy error:', err);
    return json(Object.assign({ revision: 0 }, DEFAULT_BOARD_COPY));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'board-copy', 'write'); if (__gate) return __gate

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const ifRevision = body && body.if_revision;

  try {
    const normalized = await normalizeBoardCopy(env, body || {});
    const { results } = await settingSnapshot(env, 'board_copy');
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const prevRow = rows.board_copy;
    const currentRev = rows.board_copy_rev ? parseInt(rows.board_copy_rev.value, 10) || 0 : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const payload = JSON.stringify(normalized);
    const changes = await saveRevisionedSetting(env, 'board_copy', currentRev, nextRev, [payload]);
    if (changes !== 1) {
      return json({ error: '다른 변경이 감지되었습니다. 입력을 보존하고 최신 설정을 다시 확인해주세요.', revision: currentRev }, 409);
    }
    await recordSettingChange(env, {
      key: 'board_copy',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/board-copy',
      message: '게시판 설명 설정 변경',
      details: { revision: nextRev },
    });
    normalized.revision = nextRev;
    return json(normalized);
  } catch (err) {
    console.error('PUT /api/settings/board-copy error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function normalizeBoardCopy(env, raw) {
  const defaults = Object.entries(DEFAULT_BOARD_COPY).map(([key,value]) => ({key,description:value.description}));
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'board-copy-normalize', {raw:raw === undefined ? null : raw, defaults});
  if (!response.ok) throw new Error('Rust board copy normalization failed');
  const {entries} = await response.json();
  const result = {};
  for (const entry of entries) result[entry.key] = {description:entry.description};
  return result;
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
