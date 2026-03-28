export async function onRequestGet({ env }) {
  try {
    const [todayUnique, todayViews, totalUnique, totalViews] = await Promise.all([
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE path NOT LIKE '/api/%'
                      AND path NOT IN ('/admin', '/admin.html')
                      AND datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM site_visits
                    WHERE path NOT LIKE '/api/%'
                      AND path NOT IN ('/admin', '/admin.html')
                      AND datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE path NOT LIKE '/api/%'
                      AND path NOT IN ('/admin', '/admin.html')`),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM site_visits
                    WHERE path NOT LIKE '/api/%'
                      AND path NOT IN ('/admin', '/admin.html')`),
    ]);

    return json({
      provider: 'site_visits',
      provider_label: '공개 페이지 전체 방문 집계',
      today_unique: todayUnique,
      today_views: todayViews,
      total_unique: totalUnique,
      today_visits: todayUnique,
      total_visits: totalUnique,
      total_pageviews: totalViews,
      measured_basis: 'site_visits',
      measured_timezone: 'Asia/Seoul',
      measured_date: getKstDateString(new Date()),
    });
  } catch (err) {
    console.error('GET /api/analytics/today error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function scalar(env, sql) {
  const row = await env.DB.prepare(sql).first();
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
