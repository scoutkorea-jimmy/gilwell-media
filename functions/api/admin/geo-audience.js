import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAdminAnalyticsRange } from '../../_shared/admin-analytics-range.js';
import { ensureSiteVisitColumns } from '../../_shared/analytics.js';
import { resolveCountryLabelKo } from '../../_shared/country-code-labels.js';
import { resolveCityLabelKo } from '../../_shared/city-name-ko.js';
import { logApiError } from '../../_shared/ops-log.js';

const VISIT_SCOPE_SQL = "(path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))";

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'geo-audience', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  // 기간 선택 통일: days 프리셋 또는 custom start/end 둘 다 허용. 마케팅/분석/대시보드와 동일 규약.
  let range;
  try { range = resolveAdminAnalyticsRange(url.searchParams); }
  catch (err) { return json({ error: err.message }, 400); }

  try {
    await ensureSiteVisitColumns(env);
    const start = kstDateTimeStart(range.startDate);
    const endExclusive = kstDateTimeStart(shiftKstDate(range.endDate, 1));

    const [countryRows, cityRows, totals] = await Promise.all([
      env.DB.prepare(
        `SELECT
            COALESCE(NULLIF(country_code, ''), 'ZZ') AS country_code,
            MAX(COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), '국가 미확인')) AS country_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT NULLIF(city_name, '')) AS city_count,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN latitude END), 6) AS latitude,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN longitude END), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY COALESCE(NULLIF(country_code, ''), 'ZZ')
          ORDER BY visits DESC, pageviews DESC, country_name ASC`
      ).bind(start, endExclusive).all(),
      env.DB.prepare(
        `SELECT
            COALESCE(NULLIF(country_code, ''), 'ZZ') AS country_code,
            MAX(COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), '국가 미확인')) AS country_name,
            COALESCE(NULLIF(city_name, ''), '도시 미확인') AS city_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN latitude END), 6) AS latitude,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN longitude END), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY COALESCE(NULLIF(country_code, ''), 'ZZ'), COALESCE(NULLIF(city_name, ''), '도시 미확인')
          ORDER BY visits DESC, pageviews DESC, country_name ASC, city_name ASC`
      ).bind(start, endExclusive).all(),
      env.DB.prepare(
        `SELECT
            COUNT(DISTINCT CASE WHEN COALESCE(country_code, '') != '' THEN country_code END) AS country_count,
            COUNT(DISTINCT CASE WHEN COALESCE(city_name, '') != '' THEN COALESCE(NULLIF(country_code, ''), 'ZZ') || '::' || city_name END) AS city_count,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            COUNT(CASE WHEN COALESCE(country_code, '') = '' THEN 1 END) AS unknown_country_pageviews,
            COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 THEN 1 END) AS missing_coordinate_pageviews
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)`
      ).bind(start, endExclusive).first(),
    ]);

    return json({
      range: {
        start_date: range.startDate,
        end_date: range.endDate,
        label: range.label,
        days: range.days,
      },
      summary: {
        countries: Number((totals && totals.country_count) || 0),
        cities: Number((totals && totals.city_count) || 0),
        visits: Number((totals && totals.visits) || 0),
        pageviews: Number((totals && totals.pageviews) || 0),
        unknown_country_pageviews: Number((totals && totals.unknown_country_pageviews) || 0),
        missing_coordinate_pageviews: Number((totals && totals.missing_coordinate_pageviews) || 0),
      },
      countries: normalizeRows(countryRows.results || []),
      cities: normalizeRows(cityRows.results || []),
      list_scope: '전체 국가·도시 집계',
      tracking_note: '방문은 선택 기간의 고유 사용자, 페이지뷰는 전체 조회입니다. 국가·도시별 고유 사용자는 이동으로 중복될 수 있어 합산하지 않습니다. 위치는 Cloudflare의 추정 위치이며 실제 거주지나 정확한 좌표를 뜻하지 않습니다. IP 원문은 저장하지 않습니다.',
      warmup_note: '위치 데이터는 2026-04-09 배포 이후 새 방문부터 누적됩니다. 초기에는 국가/도시 목록이 비어 있을 수 있습니다.',
    });
  } catch (err) {
    console.error('GET /api/admin/geo-audience error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    const countryCode = row.country_code || '';
    const countryNameOriginal = row.country_name || row.country_code || 'Unknown';
    const cityNameOriginal = row.city_name || '';
    return {
      country_code: countryCode,
      country_name: countryCode === 'ZZ' ? '국가 미확인' : resolveCountryLabelKo(countryCode, countryNameOriginal),
      country_name_original: countryNameOriginal,
      city_name: resolveCityLabelKo(countryCode, cityNameOriginal),
      city_name_original: cityNameOriginal,
      visits: Number(row.visits || 0),
      pageviews: Number(row.pageviews || 0),
      city_count: Number(row.city_count || 0),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      last_visit_at: row.last_visit_at || '',
    };
  });
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
