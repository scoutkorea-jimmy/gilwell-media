import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_CALENDAR_TAGS = [
  '회의',
  '교육',
  '행사',
  '캠프',
  '포럼',
  '국제교류',
  '모집',
];

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'calendar_tags'`
    ).first();
    const items = normalizeCalendarTags(row ? JSON.parse(row.value) : DEFAULT_CALENDAR_TAGS);
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/calendar-tags error:', err);
    return json({ items: DEFAULT_CALENDAR_TAGS });
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const items = normalizeCalendarTags(body && body.items);
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'calendar_tags'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('calendar_tags', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(items)).run();
    await recordSettingChange(env, {
      key: 'calendar_tags',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/calendar-tags',
      message: '캘린더 태그 설정 변경',
      details: { count: items.length },
    });
    return json({ items });
  } catch (err) {
    console.error('PUT /api/settings/calendar-tags error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeCalendarTags(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(function (item) { return String(item || '').trim(); })
    .filter(function (item) {
      if (!item || item.length > 40 || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 50);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
