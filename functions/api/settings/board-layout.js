import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_GAP = 6;

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_card_gap'`).first();
    return json({ gap_px: sanitizeGap(row && row.value) });
  } catch (err) {
    console.error('GET /api/settings/board-layout error:', err);
    return json({ gap_px: DEFAULT_GAP });
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

  const gap = sanitizeGap(body && body.gap_px);
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_card_gap'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('board_card_gap', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(String(gap)).run();
    await recordSettingChange(env, {
      key: 'board_card_gap',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/board-layout',
      message: '게시판 간격 설정 변경',
      details: { gap_px: gap },
    });
    return json({ gap_px: gap });
  } catch (err) {
    console.error('PUT /api/settings/board-layout error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function sanitizeGap(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_GAP;
  return Math.min(40, Math.max(5, parsed));
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
