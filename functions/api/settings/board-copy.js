import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { DEFAULT_BOARD_COPY, normalizeBoardCopy } from '../../_shared/board-copy.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const [row, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_copy'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_copy_rev'`).first(),
    ]);
    const copy = normalizeBoardCopy(row && row.value);
    copy.revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json(copy);
  } catch (err) {
    console.error('GET /api/settings/board-copy error:', err);
    return json(Object.assign({ revision: 0 }, DEFAULT_BOARD_COPY));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'board-copy', 'view'); if (__gate) return __gate

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const normalized = normalizeBoardCopy(body || {});
  const ifRevision = body && body.if_revision;

  try {
    const [revRow, prevRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_copy_rev'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_copy'`).first(),
    ]);
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const payload = JSON.stringify(normalized);
    await Promise.all([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('board_copy', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(payload).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('board_copy_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(nextRev)).run(),
    ]);
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
