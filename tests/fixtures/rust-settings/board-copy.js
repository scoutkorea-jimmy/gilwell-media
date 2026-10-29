import { verifyTokenRole, extractToken } from '../../../functions/_shared/auth.js';
import { gateMenuAccess } from '../../../functions/_shared/admin-permissions.js';
import { DEFAULT_BOARD_COPY, normalizeBoardCopy } from '../../../functions/_shared/board-copy.js';
import { recordSettingChange } from '../../../functions/_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('board_copy', 'board_copy_rev')`).all();
    const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
    const copy = normalizeBoardCopy(values.board_copy);
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

  const normalized = normalizeBoardCopy(body || {});
  const ifRevision = body && body.if_revision;

  try {
    const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('board_copy', 'board_copy_rev')`).all();
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const prevRow = rows.board_copy;
    const currentRev = rows.board_copy_rev ? parseInt(rows.board_copy_rev.value, 10) || 0 : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const payload = JSON.stringify(normalized);
    const writes = await env.DB.batch([
      env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('board_copy_rev', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`).bind(String(nextRev), currentRev),
      env.DB.prepare(`INSERT INTO settings (key, value) SELECT 'board_copy', ? WHERE changes() = 1
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(payload),
    ]);
    if (!writes[0] || !writes[0].meta || writes[0].meta.changes !== 1) {
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
