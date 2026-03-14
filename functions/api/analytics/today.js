export async function onRequestGet({ env }) {
  try {
    const [todayUnique, todayViews, totalUnique] = await Promise.all([
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits
                    WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(*) AS count
                     FROM post_views
                    WHERE datetime(viewed_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
      scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                     FROM site_visits`),
    ]);

    return json({
      today_unique: todayUnique,
      today_views: todayViews,
      total_unique: totalUnique,
      measured_timezone: 'Asia/Seoul',
      measured_date: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
