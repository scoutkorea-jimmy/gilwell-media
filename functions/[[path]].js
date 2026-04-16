import { buildShareMetaBlock, getResolvedShareImage, getSitePageKey, loadSiteMeta } from './_shared/site-meta.js';
import { serializePostImage } from './_shared/images.js';
import { loadNavLabels, getNavLabel } from './_shared/nav-labels.js';
import { ensureDuePostsPublished } from './_shared/publish-due-posts.js';

const PUBLIC_DATE_EXPR = "CASE WHEN publish_at IS NOT NULL AND trim(publish_at) <> '' THEN CASE WHEN instr(publish_at, 'Z') > 0 OR instr(substr(publish_at, 11), '+') > 0 THEN datetime(replace(publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(publish_at, 'T', ' ')) END ELSE CASE WHEN created_at IS NOT NULL AND trim(created_at) <> '' THEN datetime(replace(created_at, 'T', ' '), '+9 hours') ELSE NULL END END";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pageKey = getSitePageKey(url.pathname);
  await ensureDuePostsPublished(env, url.origin).catch((err) => {
    console.error('[[path]] auto publish error:', err);
  });

  const response = await context.next();
  if (!pageKey) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const siteMeta = await loadSiteMeta(env);
  const [translationStrings, publicRuntime, homeSsr] = await Promise.all([
    loadTranslationStrings(env),
    loadPublicRuntime(env),
    pageKey === 'home' ? loadHomeSsrContent(env, url.origin) : Promise.resolve(null),
  ]);
  const pageMeta = siteMeta.pages[pageKey] || siteMeta.pages.home;
  const canonicalPath = getCanonicalPath(url.pathname, pageKey);
  const itemListElements = await loadPageItemList(env, url.origin, pageKey);
  const shareMeta = buildShareMetaBlock({
    pageKey,
    title: pageMeta.title,
    description: pageMeta.description,
    url: url.origin + canonicalPath,
    imageUrl: getResolvedShareImage(siteMeta, url.origin),
    googleVerification: siteMeta.google_verification,
    naverVerification: siteMeta.naver_verification,
    itemListElements,
  });

  const updated = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageMeta.title)}</title>`)
    .replace('<!-- SHARE_META -->', shareMeta);

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  let baseResponse = new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (pageKey === 'home' && homeSsr) {
    baseResponse = applyHomeSsrContent(baseResponse, homeSsr);
  }
  return applyTranslationBootstrap(baseResponse, translationStrings, publicRuntime);
}

function getCanonicalPath(pathname, pageKey) {
  if (pathname === '/index.html' || pathname === '/') return '/';
  if (pageKey === 'latest') return '/latest';
  if (pageKey === 'korea') return '/korea';
  if (pageKey === 'apr') return '/apr';
  if (pageKey === 'wosm') return '/wosm';
  if (pageKey === 'wosm_members') return '/wosm-members';
  if (pageKey === 'people') return '/people';
  if (pageKey === 'glossary') return '/glossary';
  return pathname;
}

async function loadPageItemList(env, origin, pageKey) {
  if (!['home', 'latest', 'korea', 'apr', 'wosm', 'people', 'glossary'].includes(pageKey)) return [];
  try {
    const category = pageKey === 'home' || pageKey === 'latest' ? null : pageKey;
    const query = category
      ? `SELECT id, title FROM posts WHERE published = 1 AND category = ? ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`
      : pageKey === 'latest'
        ? `SELECT id, title FROM posts WHERE published = 1 AND datetime(COALESCE(publish_at, created_at)) >= datetime('now', '-30 days') ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`
        : `SELECT id, title FROM posts WHERE published = 1 ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`;
    const result = category
      ? await env.DB.prepare(query).bind(category).all()
      : await env.DB.prepare(query).all();
    return (result.results || []).map((item) => ({
      url: `${origin}/post/${item.id}`,
      title: item.title || `post-${item.id}`,
    }));
  } catch (err) {
    console.error('[path] DB query failed for page:', pageKey, err);
    return [];
  }
}

async function loadTranslationStrings(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'translations'`).first();
    const parsed = row ? JSON.parse(row.value || '{}') : {};
    return parsed && typeof parsed === 'object' ? (parsed.strings || {}) : {};
  } catch {
    return {};
  }
}

function applyTranslationBootstrap(response, strings, runtime) {
  const safeStrings = strings && typeof strings === 'object' ? strings : {};
  const safeRuntime = runtime && typeof runtime === 'object' ? runtime : {};
  const bootstrap = `<script>window.GW_BOOT_CUSTOM_STRINGS=${serializeForInlineScript(safeStrings)};window.GW_BOOT_RUNTIME=${serializeForInlineScript(safeRuntime)};window.GW_KAKAO_JS_KEY=${serializeForInlineScript(String(safeRuntime.kakao_js_key || ''))};</script>`;
  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(bootstrap, { html: true });
      }
    })
    .on('[data-i18n]', {
      element(element) {
        const key = element.getAttribute('data-i18n');
        if (!key) return;
        const entry = safeStrings[key];
        if (!entry || typeof entry.ko === 'undefined') return;
        element.setInnerContent(String(entry.ko), {
          html: false,
        });
      }
    })
    .transform(response);
}

async function loadPublicRuntime(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'public_runtime'`).first();
    const parsed = row ? JSON.parse(row.value || '{}') : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

async function loadHomeSsrContent(env, origin) {
  try {
    const [navLabels, leadData, latestPosts, popularPosts, picksPosts, koreaPosts, aprPosts, wosmPosts, peoplePosts] = await Promise.all([
      loadNavLabels(env),
      loadHomeLead(env, origin),
      loadLatestPosts(env, origin, 4),
      loadPopularPosts(env, origin, 4),
      loadPostList(env, origin, { featured: true, limit: 4 }),
      loadPostList(env, origin, { category: 'korea', limit: 4 }),
      loadPostList(env, origin, { category: 'apr', limit: 4 }),
      loadPostList(env, origin, { category: 'wosm', limit: 4 }),
      loadPostList(env, origin, { category: 'people', limit: 4 }),
    ]);

    const latestRail = latestPosts.slice(0, 3);
    const popularRail = (popularPosts.length ? popularPosts : latestPosts).slice(0, 4);
    const picksRail = picksPosts.slice(0, 4);
    const leadPost = leadData.post || picksPosts[0] || latestPosts[0] || null;

    return {
      lead: renderHomeLeadStory(leadPost, navLabels),
      latest: renderMiniList(latestRail, navLabels, {}),
      popular: renderMiniList(popularRail, navLabels, {}),
      picks: renderMiniList(picksRail, navLabels, {}),
      korea: renderMiniList(koreaPosts.slice(0, 4), navLabels, { hideCategoryChip: true }),
      apr: renderMiniList(aprPosts.slice(0, 4), navLabels, { hideCategoryChip: true }),
      wosm: renderMiniList(wosmPosts.slice(0, 4), navLabels, { hideCategoryChip: true }),
      people: renderMiniList(peoplePosts.slice(0, 4), navLabels, { hideCategoryChip: true }),
    };
  } catch (err) {
    console.error('[home-ssr] failed to build fallback:', err);
    return null;
  }
}

function applyHomeSsrContent(response, payload) {
  if (!payload) return response;
  const sections = {
    '#home-lead-story': payload.lead,
    '#latest-list': payload.latest,
    '#popular-list': payload.popular,
    '#popular-list-mobile': payload.popular,
    '#picks-list': payload.picks,
    '#picks-list-mobile': payload.picks,
    '#col-korea': payload.korea,
    '#col-apr': payload.apr,
    '#col-wosm': payload.wosm,
    '#col-people': payload.people,
  };
  let rewriter = new HTMLRewriter();
  Object.entries(sections).forEach(([selector, html]) => {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setInnerContent(html || '<div class="mini-empty">게시글이 없습니다</div>', { html: true });
      }
    });
  });
  return rewriter.transform(response);
}

async function loadHomeLead(env, origin) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first();
  const postId = row ? parseInt(row.value, 10) : 0;
  if (!postId) return { post: null };
  const post = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, created_at, publish_at, tag, author
       FROM posts
      WHERE id = ? AND published = 1`
  ).bind(postId).first();
  return { post: post ? serializePostImage(post, origin) : null };
}

async function loadLatestPosts(env, origin, limit) {
  const safeLimit = Math.max(1, Math.min(10, parseInt(limit || 4, 10)));
  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, created_at, publish_at, tag, author
       FROM posts
      WHERE published = 1
      ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC
      LIMIT ?`
  ).bind(safeLimit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

async function loadPopularPosts(env, origin, limit) {
  const safeLimit = Math.max(1, Math.min(10, parseInt(limit || 4, 10)));
  const { results } = await env.DB.prepare(`
    WITH recent_views AS (
      SELECT CAST(SUBSTR(path, 7) AS INTEGER) AS post_id,
             COUNT(*) AS recent_views
        FROM site_visits
       WHERE path LIKE '/post/%'
         AND datetime(visited_at, '+9 hours') >= datetime('now', '+9 hours', '-72 hours')
       GROUP BY CAST(SUBSTR(path, 7) AS INTEGER)
    ),
    recent_totals AS (
      SELECT COALESCE(SUM(recent_views), 0) AS total_recent_views
        FROM recent_views
    )
    SELECT p.id, p.category, p.title, p.subtitle, p.content, p.image_url, p.created_at, p.publish_at, p.tag, p.author,
           COALESCE(rv.recent_views, 0) AS recent_views
      FROM posts p
      LEFT JOIN recent_views rv ON rv.post_id = p.id
      CROSS JOIN recent_totals rt
     WHERE p.published = 1
     ORDER BY
       CASE WHEN rt.total_recent_views > 0 THEN 0 ELSE 1 END ASC,
       CASE WHEN rt.total_recent_views > 0 THEN COALESCE(rv.recent_views, 0) END DESC,
       CASE WHEN rt.total_recent_views > 0 THEN ${PUBLIC_DATE_EXPR} END DESC,
       CASE WHEN rt.total_recent_views = 0 THEN ${PUBLIC_DATE_EXPR} END DESC,
       p.id DESC
     LIMIT ?
  `).bind(safeLimit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

async function loadPostList(env, origin, opts = {}) {
  const conditions = ['published = 1'];
  const bindings = [];
  if (opts.category) {
    conditions.push('category = ?');
    bindings.push(opts.category);
  }
  if (opts.featured) conditions.push('featured = 1');
  const safeLimit = Math.max(1, Math.min(10, parseInt(opts.limit || 4, 10)));
  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, content, image_url, created_at, publish_at, tag, author
       FROM posts
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC
      LIMIT ?`
  ).bind(...bindings, safeLimit).all();
  return (results || []).map((post) => serializePostImage(post, origin));
}

function renderHomeLeadStory(post, navLabels) {
  if (!post) return '<div class="mini-empty">대표 기사를 준비 중입니다</div>';
  const excerpt = escapeHtml(getPostExcerpt(post, 220));
  const subtitle = escapeHtml(String(post.subtitle || '').trim());
  const categoryLabel = escapeHtml(getCategoryLabel(post.category, navLabels));
  const tagClass = escapeHtml(getCategoryTagClass(post.category));
  const tags = getSortedPostTags(post).map((tag) => `<span class="post-kicker tag-${escapeHtml(post.category || 'korea')}-kicker">${escapeHtml(tag)}</span>`).join('');
  const image = post.image_url
    ? `<a class="home-lead-thumb-link${post.image_is_placeholder ? ' is-placeholder' : ''}" href="/post/${post.id}"><img class="home-lead-thumb${post.image_is_placeholder ? ' is-placeholder' : ''}" src="${escapeHtml(post.image_url)}" alt="${escapeHtml(post.title)}" loading="eager" fetchpriority="high"></a>`
    : '';
  return (
    `<article class="home-lead-card">` +
      image +
      `<div class="home-lead-body">` +
        `<div class="home-lead-copy">` +
          `<div class="home-lead-labels">` +
            `<span class="category-tag ${tagClass}">${categoryLabel}</span>` +
            tags +
            `<span class="home-lead-kicker">메인 스토리</span>` +
          `</div>` +
          `<h3><a class="home-lead-link" href="/post/${post.id}">${escapeHtml(post.title)}</a></h3>` +
          (subtitle ? `<p class="home-lead-subtitle">${subtitle}</p>` : '') +
          (excerpt ? `<p class="home-lead-excerpt">${excerpt}</p>` : '') +
        `</div>` +
        `<div class="home-lead-footer">` +
          `<div class="home-lead-meta">${escapeHtml(formatPostDate(post))}${post.author ? ` · ${escapeHtml(post.author)}` : ''}</div>` +
          `<div class="home-lead-actions"><a class="home-subscribe-btn" href="/post/${post.id}">기사 읽기</a></div>` +
        `</div>` +
      `</div>` +
    `</article>`
  );
}

function renderMiniList(posts, navLabels, options) {
  const opts = options || {};
  if (!Array.isArray(posts) || !posts.length) {
    return '<div class="mini-empty">게시글이 없습니다</div>';
  }
  return posts.map((post) => renderMiniItem(post, navLabels, opts)).join('');
}

function renderMiniItem(post, navLabels, options) {
  const opts = options || {};
  const thumb = post.image_url
    ? `<img class="mini-thumb${post.image_is_placeholder ? ' is-placeholder' : ''}" src="${escapeHtml(post.image_url)}" loading="lazy" alt="${escapeHtml(post.title || '')}">`
    : '';
  return (
    `<article class="mini-item">` +
      `<div class="mini-item-row">` +
        `<div class="mini-item-text">` +
          `<div class="mini-item-labels">${buildMiniLabels(post, navLabels, opts)}</div>` +
          `<h4><a class="mini-item-link" href="/post/${post.id}">${escapeHtml(post.title)}</a></h4>` +
          `<div class="mini-meta">${escapeHtml(formatPostDate(post))}</div>` +
        `</div>` +
        thumb +
      `</div>` +
    `</article>`
  );
}

function buildMiniLabels(post, navLabels, options) {
  const opts = options || {};
  const labels = [];
  if (!opts.hideCategoryChip) {
    labels.push(`<span class="category-tag ${escapeHtml(getCategoryTagClass(post.category))}">${escapeHtml(getCategoryLabel(post.category, navLabels))}</span>`);
  }
  getSortedPostTags(post).forEach((tag) => {
    labels.push(`<span class="post-kicker tag-${escapeHtml(post.category || 'korea')}-kicker">${escapeHtml(tag)}</span>`);
  });
  return labels.join('');
}

function getCategoryLabel(category, navLabels) {
  const keyMap = {
    korea: 'korea',
    apr: 'apr',
    wosm: 'wosm',
    people: 'people',
  };
  const key = keyMap[String(category || '').trim()] || 'korea';
  return getNavLabel(navLabels, key, 'ko');
}

function getCategoryTagClass(category) {
  const safe = String(category || 'korea').trim();
  return {
    korea: 'tag-korea',
    apr: 'tag-apr',
    wosm: 'tag-wosm',
    people: 'tag-people',
  }[safe] || 'tag-korea';
}

function getSortedPostTags(post) {
  return String((post && post.tag) || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

function getPostExcerpt(post, limit) {
  const subtitle = String(post && post.subtitle || '').trim();
  const plain = stripHtml(String(post && post.content || '')).replace(/\s+/g, ' ').trim();
  const base = plain || subtitle;
  if (!base) return '';
  const safeLimit = Math.max(80, Math.min(420, parseInt(limit || 220, 10)));
  return base.length > safeLimit ? `${base.slice(0, safeLimit - 1).trim()}…` : base;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function formatPostDate(post) {
  const value = String(post && (post.publish_at || post.created_at) || '').trim();
  if (!value) return '';
  const normalized = value.replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+00:00`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}.${parts.month}.${parts.day}`;
}
