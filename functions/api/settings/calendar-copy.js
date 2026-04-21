import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { DEFAULT_CALENDAR_COPY, loadCalendarCopy, sanitizeCalendarCopy } from '../../_shared/calendar-copy.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const copy = await loadCalendarCopy(env);
    return json({ copy }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    console.error('GET /api/settings/calendar-copy error:', err);
    return json({ copy: { ...DEFAULT_CALENDAR_COPY }, error: 'Database error' }, 500, publicCacheHeaders(60, 300));
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const copy = sanitizeCalendarCopy(body && body.copy);
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'calendar_copy'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('calendar_copy', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(copy)).run();
    await recordSettingChange(env, {
      key: 'calendar_copy',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/calendar-copy',
      message: '캘린더 안내문 설정 변경',
    });
    return json({ ok: true, copy }, 200);
  } catch (err) {
    console.error('PUT /api/settings/calendar-copy error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
