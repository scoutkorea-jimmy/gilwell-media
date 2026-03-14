import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, ['full', 'limited']))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const range = resolveAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));

  try {
    const internalData = await getInternalMetrics(env, range);
    return json(internalData);
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function getInternalMetrics(env, range) {
  const today = rangeStartEnd(resolveAnalyticsRange(getKstDateString(new Date()), getKstDateString(new Date())));
  const allTime = rangeStartEnd(resolveAnalyticsRange(env.CF_ANALYTICS_START_DATE || '2026-03-12', range.endDate));
  const chosen = rangeStartEnd(range);

  const [
    todayVisits,
    todayViews,
    totalVisits,
    totalViews,
    visitSeriesRows,
    viewSeriesRows,
    topPaths,
    referrers,
  ] = await Promise.all([
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [allTime.start, allTime.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [allTime.start, allTime.endExclusive]),
    env.DB.prepare(
      `SELECT date(viewed_at, '+9 hours') AS visit_date, COUNT(DISTINCT viewer_key) AS visits
         FROM post_views
        WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
          AND datetime(viewed_at, '+9 hours') < datetime(?)
        GROUP BY visit_date
        ORDER BY visit_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT date(viewed_at, '+9 hours') AS view_date, COUNT(*) AS views
         FROM post_views
        WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
          AND datetime(viewed_at, '+9 hours') < datetime(?)
        GROUP BY view_date
        ORDER BY view_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT '/post/' || p.id AS path,
              p.title AS title,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT pv.viewer_key) AS visits
         FROM post_views pv
         JOIN posts p ON p.id = pv.post_id
        WHERE datetime(pv.viewed_at, '+9 hours') >= datetime(?)
          AND datetime(pv.viewed_at, '+9 hours') < datetime(?)
        GROUP BY p.id, p.title
        ORDER BY pageviews DESC, visits DESC, p.id DESC
        LIMIT 10`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT referrer_host, COUNT(*) AS pageviews, COUNT(DISTINCT viewer_key) AS visits
         FROM site_visits
        WHERE datetime(visited_at, '+9 hours') >= datetime(?)
          AND datetime(visited_at, '+9 hours') < datetime(?)
          AND path LIKE '/post/%'
        GROUP BY referrer_host
        ORDER BY visits DESC, pageviews DESC, referrer_host ASC
        LIMIT 10`
    ).bind(chosen.start, chosen.endExclusive).all(),
  ]);

  const visitSeries = fillDateSeries(range, visitSeriesRows.results || [], 'visit_date', (row) => ({
    visits: row.visits || 0,
  }));
  const viewSeries = fillDateSeries(range, viewSeriesRows.results || [], 'view_date', (row) => ({
    views: row.views || 0,
  }));
  const rangeVisits = visitSeries.reduce((sum, item) => sum + Number(item.visits || 0), 0);
  const rangeViews = viewSeries.reduce((sum, item) => sum + Number(item.views || 0), 0);

  return {
    provider: 'post_views',
    provider_label: '기사 조회 집계',
    range: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      days: range.days,
    },
    summary: {
      today_visits: todayVisits,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      average_daily_visits: range.days ? Math.round((rangeVisits / range.days) * 10) / 10 : 0,
      average_daily_pageviews: range.days ? Math.round((rangeViews / range.days) * 10) / 10 : 0,
    },
    visitors: {
      today_visits: todayVisits,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      series: visitSeries,
    },
    views: {
      total: rangeViews,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      series: viewSeries,
      top_paths: (topPaths.results || []).map((item) => ({
        path: item.path || '/',
        title: item.title || '',
        visits: item.visits || 0,
        pageviews: item.pageviews || 0,
      })),
    },
    top_paths: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || '',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
    })),
    referrers: (referrers.results || []).map((item) => ({
      referrer_host: item.referrer_host || 'direct',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
    })),
    tracking_note: `${range.label} 기준 게시글 조회 로그 집계입니다. 방문 수는 게시글을 실제로 연 고유 사용자 수, 조회수는 게시글 실제 조회 누적 수를 뜻합니다. 알려진 봇, 소셜 미리보기 크롤러, 프리페치 요청은 제외하며, 유입 경로 목록만 별도로 site_visits 기준 참고값을 보여줍니다.`,
  };
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

function fillDateSeries(range, rows, dateKey, valueBuilder) {
  const byDate = new Map();
  rows.forEach((row) => byDate.set(row[dateKey], row));
  const out = [];
  for (let i = 0; i < range.days; i += 1) {
    const key = shiftKstDate(range.startDate, i);
    const row = byDate.get(key);
    out.push(Object.assign({ date: key }, row ? valueBuilder(row) : valueBuilder({})));
  }
  return out;
}

async function scalar(env, sql, binds = []) {
  const row = await env.DB.prepare(sql).bind(...binds).first();
  return row?.count || 0;
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
