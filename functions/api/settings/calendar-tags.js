import { singleSetting, queryRust } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
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

export async function onRequestGet({ request, env }) {
  try {
    const row = await singleSetting(env, 'calendar_tags');
    const items = await normalizeCalendarTagsRust(row ? JSON.parse(row.value) : DEFAULT_CALENDAR_TAGS, env);
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/calendar-tags error:', err);
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '태그 목록을 불러오지 못했습니다.' }, 503);
    return json({ items: DEFAULT_CALENDAR_TAGS });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'calendar', 'write'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const items = await normalizeCalendarTagsRust(body && body.items, env);
  try {
    const prevRow = await singleSetting(env, 'calendar_tags', 'put', JSON.stringify(items));
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

export function normalizeCalendarTags(items) {
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

export async function normalizeCalendarTagsRust(raw, env = {}, run = queryRust) {
  const fallback = () => normalizeCalendarTags(raw);
  try {
    const items = (Array.isArray(raw) ? raw : []).map(item => String(item || ''));
    // Rust strings cannot represent unpaired UTF-16 code units. Keep the exact
    // JavaScript behavior for such legacy data without passing it through Wasm.
    if (items.some(item => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(item))) return fallback();
    const response = await run({env, request:{url:'https://internal.invalid/'}}, 'calendar-tags-normalize', {items});
    if (!response.ok) return fallback();
    const result = await response.json();
    if (!Array.isArray(result.items) || result.items.length > 50 ||
        !result.items.every(item => typeof item === 'string' && item.length > 0 && item.length <= 40 && item === item.trim()) ||
        new Set(result.items).size !== result.items.length) return fallback();
    return result.items;
  } catch { return fallback(); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
