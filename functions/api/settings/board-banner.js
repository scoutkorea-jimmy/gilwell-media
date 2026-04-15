import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_BOARD_BANNER = Object.freeze({
  items: {
    korea: { event_name: '', event_date: '' },
    apr: { event_name: '', event_date: '' },
    wosm: { event_name: '', event_date: '' },
    people: { event_name: '', event_date: '' },
  },
});

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_banner_events'`).first();
    return json(normalizeBoardBannerSettings(row && row.value));
  } catch (err) {
    console.error('GET /api/settings/board-banner error:', err);
    return json(DEFAULT_BOARD_BANNER);
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const normalized = normalizeBoardBannerSettings(body);
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'board_banner_events'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('board_banner_events', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(normalized)).run();
    await recordSettingChange(env, {
      key: 'board_banner_events',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/board-banner',
      message: '게시판 배너 설정 변경',
    });
    return json(normalized);
  } catch (err) {
    console.error('PUT /api/settings/board-banner error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeBoardBannerSettings(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
  }

  const items = {};
  Object.keys(DEFAULT_BOARD_BANNER.items).forEach((category) => {
    const source = parsed && parsed.items ? (parsed.items[category] || (category === 'wosm' ? parsed.items.worm : null)) : null;
    items[category] = {
      event_name: sanitizeName(source && source.event_name),
      event_date: sanitizeDate(source && source.event_date),
    };
  });

  return { items };
}

function sanitizeName(value) {
  return String(value || '').trim().slice(0, 80);
}

function sanitizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
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
