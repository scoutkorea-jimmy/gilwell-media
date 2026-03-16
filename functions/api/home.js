import { loadSiteMeta } from '../_shared/site-meta.js';
import { serializePostImage } from '../_shared/images.js';

const DEFAULT_TICKER_ITEMS = [
  '길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다',
  '한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다',
  'The BP Post · bpmedia.net',
];

const DEFAULT_HOME_LEAD_MEDIA = {
  fit: 'cover',
  position_x: 50,
  position_y: 50,
  zoom: 100,
};

export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;

    const [
      siteMeta,
      translations,
      ticker,
      stats,
      footerAnalytics,
      hero,
      lead,
      latest,
      popular,
      picks,
      korea,
      apr,
      wosm,
      people,
    ] = await Promise.all([
      loadSiteMeta(env),
      loadTranslations(env),
      loadTicker(env),
      loadStats(env),
      loadFooterAnalytics(env),
      loadHero(env, origin),
      loadHomeLead(env, origin),
      loadLatestPosts(env, origin, 4),
      loadPopular(env, origin, 4),
      loadPostList(env, origin, { featured: true, limit: 4 }),
      loadPostList(env, origin, { category: 'korea', limit: 4 }),
      loadPostList(env, origin, { category: 'apr', limit: 4 }),
      loadPostList(env, origin, { category: 'wosm', limit: 4 }),
      loadPostList(env, origin, { category: 'people', limit: 4 }),
    ]);

    return json({
      site_meta: siteMeta,
      translations: { strings: translations },
      ticker: { items: ticker },
      stats,
      analytics: footerAnalytics,
      hero,
      lead,
      latest: { posts: latest },
      popular: { posts: popular },
      picks: { posts: picks },
      columns: {
        korea: { posts: korea },
        apr: { posts: apr },
        wosm: { posts: wosm },
        people: { posts: people },
      },
    }, 200, publicCacheHeaders(120, 600));
  } catch (err) {
    console.error('GET /api/home error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function loadTranslations(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'translations'`).first();
    return row ? JSON.parse(row.value || '{}') : {};
  } catch {
    return {};
  }
}

async function loadTicker(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ticker'`).first();
    return row ? JSON.parse(row.value || '[]') : DEFAULT_TICKER_ITEMS;
  } catch {
    return DEFAULT_TICKER_ITEMS;
  }
}

async function loadStats(env) {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = nowKST.toISOString().slice(0, 10);
  const [koreaRow, aprRow, wosmRow, peopleRow, todayRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'korea' AND published = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'apr' AND published = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'wosm' AND published = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE category = 'people' AND published = 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE DATE(COALESCE(publish_at, created_at)) = ? AND published = 1`).bind(today).first(),
  ]);
  return {
    korea: koreaRow?.n ?? 0,
    apr: aprRow?.n ?? 0,
    wosm: wosmRow?.n ?? 0,
    people: peopleRow?.n ?? 0,
    today: todayRow?.n ?? 0,
  };
}

async function loadFooterAnalytics(env) {
  const [todayUnique, todayViews, totalUnique, totalViews] = await Promise.all([
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count
                   FROM post_views
                  WHERE datetime(viewed_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
    scalar(env, `SELECT COUNT(*) AS count
                   FROM post_views
                  WHERE datetime(viewed_at, '+9 hours') >= datetime(date('now', '+9 hours'))`),
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM post_views`),
    scalar(env, `SELECT COUNT(*) AS count FROM post_views`),
  ]);
  return {
    provider: 'post_views',
    provider_label: '기사 조회 집계',
    today_unique: todayUnique,
    today_views: todayViews,
    total_unique: totalUnique,
    today_visits: todayUnique,
    total_visits: totalUnique,
    total_pageviews: totalViews,
    measured_basis: 'post_views',
  };
}

async function loadHero(env, origin) {
  const [row, intervalRow] = await Promise.all([
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first(),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_interval'`).first(),
  ]);
  const interval_ms = getSafeInterval(intervalRow && intervalRow.value);
  if (!row) return { posts: [], interval_ms };

  let postIds = [];
  const val = String(row.value || '').trim();
  if (val.startsWith('[')) {
    try { postIds = JSON.parse(val).filter(Number.isFinite); } catch { postIds = []; }
  } else {
    const single = parseInt(val, 10);
    if (single > 0) postIds = [single];
  }
  postIds = postIds.slice(0, 5);
  if (!postIds.length) return { posts: [], interval_ms };

  const placeholders = postIds.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, image_url, created_at, publish_at
       FROM posts
      WHERE published = 1
        AND id IN (${placeholders})`
  ).bind(...postIds).all();

  const byId = new Map((results || []).map((post) => [post.id, serializePostImage(post, origin)]));
  return {
    posts: postIds.map((id) => byId.get(id)).filter(Boolean),
    interval_ms,
  };
}

async function loadHomeLead(env, origin) {
  const [row, mediaRow] = await Promise.all([
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first(),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_media'`).first(),
  ]);
  const postId = row ? parseInt(row.value, 10) : 0;
  const media = normalizeHomeLeadMedia(parseJsonValue(mediaRow && mediaRow.value));
  if (!postId) return { post: null, media };
  const post = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, publish_at, featured, tag, views, author, published, sort_order, youtube_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes
       FROM posts
      WHERE id = ? AND published = 1`
  ).bind(postId).first();
  return { post: post ? serializePostImage(post, origin) : null, media };
}

async function loadPostList(env, origin, opts = {}) {
  const conditions = ['published = 1'];
  const bindings = [];
  if (opts.category) {
    conditions.push('category = ?');
    bindings.push(opts.category);
  }
  if (opts.featured) {
    conditions.push('featured = 1');
  }
  const limit = Math.max(1, Math.min(10, parseInt(opts.limit || 4, 10)));
  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, publish_at, featured, tag, views, author, published, sort_order, youtube_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes
       FROM posts
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order IS NULL ASC, sort_order ASC, created_at DESC, id DESC
      LIMIT ?`
  ).bind(...bindings, limit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

async function loadLatestPosts(env, origin, limit) {
  const safeLimit = Math.max(1, Math.min(10, parseInt(limit || 4, 10)));
  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, publish_at, featured, tag, views, author, published, sort_order, youtube_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes
       FROM posts
      WHERE published = 1
      ORDER BY created_at DESC, id DESC
      LIMIT ?`
  ).bind(safeLimit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

async function loadPopular(env, origin, limit) {
  const { results } = await env.DB.prepare(`
    WITH likes_by_post AS (
      SELECT post_id, COUNT(*) AS likes
      FROM post_likes
      GROUP BY post_id
    ),
    base AS (
      SELECT p.id, p.category, p.title, p.subtitle, p.image_url, p.image_caption, p.created_at, p.publish_at, p.tag, p.views, p.author, p.youtube_url,
             COALESCE(l.likes, 0) AS likes
      FROM posts p
      LEFT JOIN likes_by_post l ON l.post_id = p.id
      WHERE p.published = 1
    ),
    maxima AS (
      SELECT MAX(views) AS max_views, MAX(likes) AS max_likes FROM base
    )
    SELECT base.*,
           ROUND(
             ((CAST(base.views AS REAL) / CASE WHEN COALESCE(maxima.max_views, 0) > 0 THEN maxima.max_views ELSE 1 END) * 50) +
             ((CAST(base.likes AS REAL) / CASE WHEN COALESCE(maxima.max_likes, 0) > 0 THEN maxima.max_likes ELSE 1 END) * 50),
             2
           ) AS popularity_score
      FROM base
      CROSS JOIN maxima
     ORDER BY popularity_score DESC, likes DESC, views DESC, id DESC
     LIMIT ?
  `).bind(limit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

async function scalar(env, sql) {
  const row = await env.DB.prepare(sql).first();
  return row?.count || 0;
}

function getSafeInterval(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15000, Math.max(2000, parsed));
}

function parseJsonValue(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeHomeLeadMedia(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    fit: raw.fit === 'contain' ? 'contain' : 'cover',
    position_x: clampNumber(raw.position_x, 0, 100, DEFAULT_HOME_LEAD_MEDIA.position_x),
    position_y: clampNumber(raw.position_y, 0, 100, DEFAULT_HOME_LEAD_MEDIA.position_y),
    zoom: clampNumber(raw.zoom, 100, 150, DEFAULT_HOME_LEAD_MEDIA.zoom),
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
