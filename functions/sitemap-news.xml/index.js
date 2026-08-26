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

  let posts = [];
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
    // public_date_kst 를 그대로 뽑아 toIso() 가 KST 로 해석하게 한다.
    // (예전 toIso 는 publish_at·created_at 을 가리지 않고 naive=KST 로 봐서
    //  publish_at 이 없는 글의 공개 시각이 9시간 앞당겨져 나갔다.)
    const rs = await env.DB.prepare(
      `SELECT id, title, category, ${PUBLIC_DATE_EXPR} AS public_date_kst
         FROM posts
         WHERE published = 1
           AND ${PUBLIC_DATE_EXPR} <= datetime('now', '+9 hours')
           AND ${PUBLIC_DATE_EXPR} >= datetime('now', '+9 hours', '-2 days')
         ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC
         LIMIT 1000`
    ).all();
    posts = rs.results || [];
  } catch (err) {
    console.error('GET /sitemap-news.xml query error:', err);
  }

  const body = renderNewsSitemap(origin, posts);

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

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIso(dateStr) {
  if (!dateStr) return '';
  const normalized = String(dateStr).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function categoryLabel(cat) {
  // Google News genre suggestion. Not strictly required but helps the
  // news index classify content.
  const slug = String(cat || '').toLowerCase();
  if (slug === 'korea')  return 'Korea Scouts';
  if (slug === 'apr')    return 'Asia-Pacific Scouts';
  if (slug === 'wosm')   return 'World Organization of the Scout Movement';
  if (slug === 'people') return 'Scout People';
  return 'Scouting News';
}

function renderNewsSitemap(origin, posts) {
  const rows = posts.map((p) => {
    const loc = `${origin}/post/${p.id}`;
    // public_date_kst 는 SQL 에서 이미 KST 로 정규화된 naive 문자열이다.
    // toIso() 의 "naive = +09:00" 가정과 정확히 일치한다.
    const pubDate = toIso(p.public_date_kst);
    const title = xmlEscape(p.title || '');
    const section = xmlEscape(categoryLabel(p.category));
    return [
      '  <url>',
      `    <loc>${xmlEscape(loc)}</loc>`,
      '    <news:news>',
      '      <news:publication>',
      '        <news:name>BP미디어</news:name>',
      '        <news:language>ko</news:language>',
      '      </news:publication>',
      `      <news:publication_date>${xmlEscape(pubDate)}</news:publication_date>`,
      `      <news:title>${title}</news:title>`,
      section ? `      <news:genres>${section}</news:genres>` : '',
      '    </news:news>',
      '  </url>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${rows}
</urlset>
`;
}
