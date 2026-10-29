import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRangeRust } from '../../_shared/admin-analytics-range.js';
import { ensureSiteVisitColumns } from '../../_shared/analytics.js';
import { COUNTRY_CODE_LABELS_KO } from '../../_shared/country-code-labels.js';
import { GLOBAL_CITY_NAME_KO_MAP, COUNTRY_CITY_NAME_KO_MAP } from '../../_shared/city-name-ko.js';
import { logApiError } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'geo-audience', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  // 기간 선택 통일: days 프리셋 또는 custom start/end 둘 다 허용. 마케팅/분석/대시보드와 동일 규약.
  let range;
  try { range = await resolveAdminAnalyticsRangeRust(url.searchParams, env); }
  catch (err) { return json({ error: err.message }, 400); }

  try {
    await ensureSiteVisitColumns(env);
    const start = kstDateTimeStart(range.startDate);
    const endExclusive = kstDateTimeStart(shiftKstDate(range.endDate, 1));

    const queryGeo = kind => queryRust({request, env}, 'analytics-geo', {kind, start, end:endExclusive})
      .then(response => { if (!response.ok) throw new Error('Rust geographic analytics failed'); return response.json(); });
    const [countryRows, cityRows, totals] = await Promise.all([
      queryGeo('country').then(data => ({results:data.rows})),
      queryGeo('city').then(data => ({results:data.rows})),
      queryGeo('totals').then(data => data.row),
    ]);

    const response = await queryRust({request, env}, 'analytics-geo-response', {
      range, totals, countries:countryRows.results || [], cities:cityRows.results || [],
      countryNames:COUNTRY_CODE_LABELS_KO, globalCities:GLOBAL_CITY_NAME_KO_MAP, countryCities:COUNTRY_CITY_NAME_KO_MAP,
    });
    if (!response.ok) throw new Error('Rust geographic response failed');
    return json(await response.json());
  } catch (err) {
    console.error('GET /api/admin/geo-audience error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

function getKstDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftKstDate(dateString, offsetDays) {
  const base = new Date(dateString + 'T00:00:00+09:00');
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return getKstDateString(base);
}

function kstDateTimeStart(dateString) {
  return dateString + ' 00:00:00';
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
