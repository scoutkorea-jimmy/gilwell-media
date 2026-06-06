import { PUBLIC_DATE_EXPR } from '../_shared/post-public-date.js';

/**
 * Gilwell Media · Article Stats
 *
 * GET /api/stats  ← public, returns post counts by category + today
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const { ensureDuePostsPublished } = await import('../_shared/publish-due-posts.js');
    // 예약 공개 보정을 응답 경로에서 분리 — origin 을 넘겨 발행 시 캐시 퍼지가 실제로
    // 동작하게 하고(이전엔 origin 누락으로 purge 가 조용히 스킵됐다), waitUntil 로 비차단
    // 실행. /api/home·[[path]] 와 동일 패턴. (안정성 검토 00.170.07)
    const origin = new URL(request.url).origin;
    const runDuePublish = () =>
      ensureDuePostsPublished(env, origin).catch((err) => {
        console.error('GET /api/stats auto publish error (bg):', err);
      });
    if (context.waitUntil) context.waitUntil(runDuePublish());
    else await runDuePublish();
    // Use KST (UTC+9) for "today" so the count matches Korean local midnight
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = nowKST.toISOString().slice(0, 10); // YYYY-MM-DD in KST

    const [koreaRow, aprRow, wosmRow, peopleRow, todayRow] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'korea' AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'apr'   AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'wosm'  AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'people' AND published = 1`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE date(${PUBLIC_DATE_EXPR}) = date(?) AND published = 1`).bind(today).first(),
    ]);

    return json({
      korea: koreaRow?.n ?? 0,
      apr:   aprRow?.n  ?? 0,
      wosm:  wosmRow?.n ?? 0,
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
      'Cache-Control': 'no-store',
    },
  });
}
