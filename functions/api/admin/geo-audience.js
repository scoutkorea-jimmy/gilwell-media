import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';
import { ensureSiteVisitColumns } from '../../_shared/analytics.js';
import { resolveCountryLabelKo } from '../../_shared/country-code-labels.js';
import { logApiError } from '../../_shared/ops-log.js';

const VISIT_SCOPE_SQL = "(path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))";

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days') || 30) || 30));
  const today = getKstDateString(new Date());
  const range = resolveAnalyticsRange(shiftKstDate(today, -(days - 1)), today);

  try {
    await ensureSiteVisitColumns(env);
    const start = kstDateTimeStart(range.startDate);
    const endExclusive = kstDateTimeStart(shiftKstDate(range.endDate, 1));

    const [countryRows, cityRows, totals] = await Promise.all([
      env.DB.prepare(
        `SELECT
            COALESCE(country_code, 'ZZ') AS country_code,
            COALESCE(NULLIF(country_name, ''), COALESCE(country_code, 'Unknown')) AS country_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT NULLIF(city_name, '')) AS city_count,
            ROUND(AVG(latitude), 6) AS latitude,
            ROUND(AVG(longitude), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
            AND COALESCE(country_code, '') != ''
          GROUP BY COALESCE(country_code, 'ZZ'), COALESCE(NULLIF(country_name, ''), COALESCE(country_code, 'Unknown'))
          ORDER BY visits DESC, pageviews DESC, country_name ASC`
      ).bind(start, endExclusive).all(),
      env.DB.prepare(
        `SELECT
            COALESCE(country_code, 'ZZ') AS country_code,
            COALESCE(NULLIF(country_name, ''), COALESCE(country_code, 'Unknown')) AS country_name,
            COALESCE(NULLIF(city_name, ''), '도시 미확인') AS city_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            ROUND(AVG(latitude), 6) AS latitude,
            ROUND(AVG(longitude), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
            AND COALESCE(country_code, '') != ''
          GROUP BY COALESCE(country_code, 'ZZ'), COALESCE(NULLIF(country_name, ''), COALESCE(country_code, 'Unknown')), COALESCE(NULLIF(city_name, ''), '도시 미확인')
          ORDER BY visits DESC, pageviews DESC, country_name ASC, city_name ASC
          LIMIT 300`
      ).bind(start, endExclusive).all(),
      env.DB.prepare(
        `SELECT
            COUNT(DISTINCT CASE WHEN COALESCE(country_code, '') != '' THEN country_code END) AS country_count,
            COUNT(DISTINCT CASE WHEN COALESCE(city_name, '') != '' THEN country_code || '::' || city_name END) AS city_count,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews
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
      },
      countries: normalizeRows(countryRows.results || []),
      cities: normalizeRows(cityRows.results || []),
      tracking_note: '사용자 추가 입력 없이 Cloudflare 요청 메타의 국가/도시/좌표를 바탕으로 집계합니다. IP 원문은 저장하지 않습니다.',
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
    return {
      country_code: row.country_code || '',
      country_name: resolveCountryLabelKo(row.country_code || '', row.country_name || row.country_code || 'Unknown'),
      city_name: row.city_name || '',
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
