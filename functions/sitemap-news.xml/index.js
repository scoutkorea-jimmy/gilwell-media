import { queryRust } from '../_shared/rust-server.js';
/**
 * Gilwell Media · /sitemap-news.xml
 *
 * Google News-compatible sitemap scoped to the most recent 48 hours of
 * published articles (hard cap 1000 entries). Separate from the general
 * /sitemap.xml because Google News + AI news retrieval systems only
 * ingest URLs from a sitemap that uses the news:news schema.
 */

import { PUBLIC_DATE_EXPR } from '../_shared/post-public-date.js';

export async function onRequestGet(context) {
  return buildNewsSitemapResponse(context, false);
}

export async function onRequestHead(context) {
  return buildNewsSitemapResponse(context, true);
}

async function buildNewsSitemapResponse({ request, env }, headOnly) {
  const origin = new URL(request.url).origin;
  const { ensureDuePostsPublished } = await import('../_shared/publish-due-posts.js');
  await ensureDuePostsPublished(env, origin).catch((err) => {
    console.error('GET /sitemap-news.xml auto publish error:', err);
  });

  let body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">

</urlset>
`;
  try {
    // 공개 시각은 반드시 PUBLIC_DATE_EXPR(KST 정규화)로 비교한다.
    //
    // 예전 조건은 `COALESCE(publish_at, created_at) <= datetime('now')` 였다.
    // publish_at 은 KST naive('2026-08-26 23:52:00'), datetime('now') 는 UTC 라
    // 9시간이 어긋나 **KST 15시 이후 공개된 기사가 그날 내내 누락**됐다.
    // 2026-08-26 실측: 당일 5건이 RSS 에는 있는데 뉴스 사이트맵엔 0건,
    // 조건 교체 후 같은 시점 4건 → 9건. Google News 는 신선도가 거의 전부라
    // 당일 노출 기회를 매일 통째로 버리고 있었다.
    //
    // created_at 은 반대로 UTC 저장이고, publish_at 도 'T' 구분자나 오프셋이
    // 붙은 변형이 섞여 있다. 이 정규화를 한곳에서 처리하라고 만들어 둔 것이
    // PUBLIC_DATE_EXPR 이므로(`[[path]].js`·publish-due-posts.js 도 같은 것을
    // 쓴다) 여기서만 raw 컬럼을 비교하던 것을 되돌린다.
    //
    // public_date_kst 를 그대로 뽑아 Rust가 KST로 해석하게 한다.
    // (예전 toIso 는 publish_at·created_at 을 가리지 않고 naive=KST 로 봐서
    //  publish_at 이 없는 글의 공개 시각이 9시간 앞당겨져 나갔다.)
    const rust = await queryRust({ request, env }, 'sitemap-news', { publicDateExpr: PUBLIC_DATE_EXPR, origin });
    if (!rust.ok) throw new Error('Rust news sitemap query failed');
    body = await rust.text();
  } catch (err) {
    console.error('GET /sitemap-news.xml query error:', err);
  }


  const headers = {
    'Content-Type': 'application/xml; charset=UTF-8',
    // Keep fresh — news sitemaps are only useful if indexed promptly.
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  };

  if (headOnly) {
    return new Response(null, { headers });
  }
  return new Response(body, { headers });
}
