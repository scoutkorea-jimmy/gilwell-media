/**
 * Gilwell Media · Article Stats
 *
 * GET /api/stats  ← public, returns post counts by category + today
 */
export async function onRequestGet({ env }) {
  try {
    // Use KST (UTC+9) for "today" so the count matches Korean local midnight
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = nowKST.toISOString().slice(0, 10); // YYYY-MM-DD in KST

    const [koreaRow, aprRow, wosmRow, peopleRow, todayRow] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'korea' AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'apr'   AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'wosm'  AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'people' AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE DATE(created_at) = ? AND published = 1`).bind(today).first(),
    ]);

    return json({
      korea: koreaRow?.n ?? 0,
      apr:   aprRow?.n  ?? 0,
      wosm:  wosmRow?.n ?? 0,
      worm:  wosmRow?.n ?? 0,
      people: peopleRow?.n ?? 0,
      today: todayRow?.n ?? 0,
    });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
