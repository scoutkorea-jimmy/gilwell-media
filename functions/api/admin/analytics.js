import { extractToken, verifyToken } from '../../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  try {
    const [todayRow, yesterdayRow, weekRow, todayVisitsRow, weekVisitsRow, topPaths, referrers] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(DISTINCT viewer_key) AS count
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT viewer_key) AS count
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-1 day'))
            AND datetime(visited_at, '+9 hours') < datetime(date('now', '+9 hours'))`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT viewer_key) AS count
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))`
      ).first(),
      env.DB.prepare(
        `SELECT path, COUNT(*) AS visits, COUNT(DISTINCT viewer_key) AS visitors
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))
          GROUP BY path
          ORDER BY visits DESC, visitors DESC, path ASC
          LIMIT 8`
      ).all(),
      env.DB.prepare(
        `SELECT referrer_host, COUNT(*) AS visits, COUNT(DISTINCT viewer_key) AS visitors
           FROM site_visits
          WHERE datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours', '-6 day'))
          GROUP BY referrer_host
          ORDER BY visits DESC, visitors DESC, referrer_host ASC
          LIMIT 10`
      ).all(),
    ]);

    return json({
      visitors: {
        today_unique: todayRow?.count || 0,
        yesterday_unique: yesterdayRow?.count || 0,
        last7_unique: weekRow?.count || 0,
        today_visits: todayVisitsRow?.count || 0,
        last7_visits: weekVisitsRow?.count || 0,
      },
      top_paths: topPaths.results || [],
      referrers: (referrers.results || []).map((item) => ({
        referrer_host: item.referrer_host || 'direct',
        visits: item.visits || 0,
        visitors: item.visitors || 0,
      })),
      tracking_note: '유입 경로는 document.referrer 기준입니다. 앱 내부 브라우저, 메신저, 복사/직접입력 유입은 direct 또는 unknown으로 보일 수 있습니다.',
    });
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
