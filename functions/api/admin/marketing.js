import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRangeRust } from '../../_shared/admin-analytics-range.js';
import { logApiError } from '../../_shared/ops-log.js';
import { SITE_PATH_TITLE_FALLBACKS } from '../../_shared/site-structure.mjs';

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'marketing', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  let range;
  try { range = await resolveAdminAnalyticsRangeRust(url.searchParams, env, { days: 7 }); }
  catch (err) { return json({ error: err.message }, 400); }
  const chosen = rangeStartEnd(range);

  try {
    const response = await queryRust({request, env}, 'analytics-marketing', {start:chosen.start, end:chosen.endExclusive, range, pathTitles:SITE_PATH_TITLE_FALLBACKS});
    if (!response.ok) throw new Error('Rust marketing analytics query failed');
    return json(await response.json());
  } catch (err) {
    console.error('GET /api/admin/marketing error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

function rangeStartEnd(range) {
  return {
    start: `${range.startDate} 00:00:00`,
    endExclusive: `${shiftKstDate(range.endDate, 1)} 00:00:00`,
  };
}

function shiftKstDate(dateStr, offsetDays) {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return getKstDateString(date);
}

function getKstDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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
