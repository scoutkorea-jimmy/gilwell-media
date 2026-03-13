import { extractToken, verifyToken } from '../../_shared/auth.js';

const COHORTS = {
  '1d': { days: 1, startModifier: '0 day', label: '최근 1일' },
  '7d': { days: 7, startModifier: '-6 day', label: '최근 7일' },
  '30d': { days: 30, startModifier: '-29 day', label: '최근 30일' },
};

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const cohortKey = COHORTS[url.searchParams.get('cohort')] ? url.searchParams.get('cohort') : '7d';
  const cohort = COHORTS[cohortKey];

  try {
    const [
      todayUnique,
      todayVisits,
      yesterdayUnique,
      last7Unique,
      last7Visits,
      visitSeriesRows,
      viewSeriesRows,
      topPaths,
      referrers,
      topPosts,
      viewsTotal,
    ] = await Promise.all([
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-1 day'))
                      AND datetime(visited_at, '+9 hours') < datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))`),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))`),
      env.DB.prepare(
        `SELECT date(visited_at, '+9 hours') AS visit_date,
                COUNT(*) AS visits,
                COUNT(DISTINCT viewer_key) AS unique_visitors
           FROM site_visits
          WHERE date(visited_at, '+9 hours') >= date('now', '+9 hours', ?)
          GROUP BY visit_date
          ORDER BY visit_date ASC`
      ).bind(cohort.startModifier).all(),
      env.DB.prepare(
        `SELECT date(viewed_at, '+9 hours') AS view_date,
                COUNT(*) AS views
           FROM post_views
          WHERE date(viewed_at, '+9 hours') >= date('now', '+9 hours', ?)
          GROUP BY view_date
          ORDER BY view_date ASC`
      ).bind(cohort.startModifier).all(),
      env.DB.prepare(
        `SELECT path, COUNT(*) AS visits, COUNT(DISTINCT viewer_key) AS visitors
           FROM site_visits
          WHERE date(visited_at, '+9 hours') >= date('now', '+9 hours', ?)
          GROUP BY path
          ORDER BY visits DESC, visitors DESC, path ASC
          LIMIT 8`
      ).bind(cohort.startModifier).all(),
      env.DB.prepare(
        `SELECT referrer_host, COUNT(*) AS visits, COUNT(DISTINCT viewer_key) AS visitors
           FROM site_visits
          WHERE date(visited_at, '+9 hours') >= date('now', '+9 hours', ?)
          GROUP BY referrer_host
          ORDER BY visits DESC, visitors DESC, referrer_host ASC
          LIMIT 10`
      ).bind(cohort.startModifier).all(),
      env.DB.prepare(
        `SELECT p.id, p.title, p.category, COUNT(*) AS views
           FROM post_views pv
           JOIN posts p ON p.id = pv.post_id
          WHERE date(pv.viewed_at, '+9 hours') >= date('now', '+9 hours', ?)
          GROUP BY p.id, p.title, p.category
          ORDER BY views DESC, p.id DESC
          LIMIT 10`
      ).bind(cohort.startModifier).all(),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM post_views
                    WHERE date(viewed_at, '+9 hours') >= date('now', '+9 hours', ?)`, [cohort.startModifier]),
    ]);

    const visitSeries = fillDateSeries(cohort.days, visitSeriesRows.results || [], 'visit_date', (row) => ({
      visits: row.visits || 0,
      unique_visitors: row.unique_visitors || 0,
    }));
    const viewSeries = fillDateSeries(cohort.days, viewSeriesRows.results || [], 'view_date', (row) => ({
      views: row.views || 0,
    }));

    return json({
      cohort: cohortKey,
      cohort_label: cohort.label,
      visitors: {
        today_unique: todayUnique,
        today_visits: todayVisits,
        yesterday_unique: yesterdayUnique,
        last7_unique: last7Unique,
        last7_visits: last7Visits,
        series: visitSeries,
      },
      views: {
        total: viewsTotal,
        series: viewSeries,
        top_posts: topPosts.results || [],
      },
      top_paths: topPaths.results || [],
      referrers: (referrers.results || []).map((item) => ({
        referrer_host: item.referrer_host || 'direct',
        visits: item.visits || 0,
        visitors: item.visitors || 0,
      })),
      tracking_note: `${cohort.label} 기준입니다. 유입 경로는 document.referrer 기준이며 앱 내부 브라우저, 메신저, 복사/직접입력 유입은 direct 또는 unknown으로 보일 수 있습니다.`,
    });
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function scalar(env, sql, binds = []) {
  const row = await env.DB.prepare(sql).bind(...binds).first();
  return row?.count || 0;
}

function fillDateSeries(days, rows, dateKey, valueBuilder) {
  const byDate = new Map();
  rows.forEach((row) => byDate.set(row[dateKey], row));

  const out = [];
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(kstNow);
    date.setUTCDate(kstNow.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    const row = byDate.get(key);
    out.push(Object.assign({ date: key }, row ? valueBuilder(row) : valueBuilder({})));
  }
  return out;
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
