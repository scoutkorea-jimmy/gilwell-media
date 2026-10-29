import { BOARD_KEYS, loadPublicPage, applyPublicParts, pageNumber } from './_shared/public-page-ssr.js';
import { buildShareMetaBlockRust, getResolvedShareImage, getSitePageKey, loadSiteMeta, getPageSeoDescriptor } from './_shared/site-meta.js';
import { POPULAR_WEIGHTS } from './_shared/home-rails.js';
import { loadNavLabels, getNavLabel } from './_shared/nav-labels.js';
import { ensureDuePostsPublished } from './_shared/publish-due-posts.js';
import { getPostExcerpt } from './_shared/post-excerpt.js';
import { queryRust, singleSetting } from './_shared/rust-server.js';

const PUBLIC_DATE_EXPR = "CASE WHEN publish_at IS NOT NULL AND trim(publish_at) <> '' THEN CASE WHEN instr(publish_at, 'Z') > 0 OR instr(substr(publish_at, 11), '+') > 0 THEN datetime(replace(publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(publish_at, 'T', ' ')) END ELSE CASE WHEN created_at IS NOT NULL AND trim(created_at) <> '' THEN datetime(replace(created_at, 'T', ' '), '+9 hours') ELSE NULL END END";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pageKey = getSitePageKey(url.pathname);

  // 자동 게시 트리거는 (1) HTML 페이지 요청에만 (2) waitUntil 로 비차단 실행.
  // /js/*, /css/*, /img/* 등 정적 자산은 [[path]] catch-all 에 매칭되긴 하지만
  // 자동 게시 로직을 돌릴 필요가 없다 — DB 라운드트립이 Worker CPU 한도(1102)
  // 를 갉아먹어 정적 자산이 간헐적 503 으로 응답되는 회귀(2026-05-26 발견)를
  // 방지. 페이지 요청에서도 await 로 응답 시간을 늘리는 대신 waitUntil 로
  // 다음 요청까지만 결과가 반영되도록 한다.
  if (pageKey && typeof context.waitUntil === 'function') {
    context.waitUntil(
      ensureDuePostsPublished(env, url.origin).catch((err) => {
        console.error('[[path]] auto publish error:', err);
      })
    );
  }

  const response = await context.next();
  if (!pageKey) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const siteMeta = await loadSiteMeta(env);
  // navLabels 는 한 번만 읽어 (1) 부트스트랩 주입과 (2) 홈 SSR 양쪽이 공유한다.
  // 이전에는 loadHomeSsrContent 안에서만 읽어 클라이언트가 /api/home 응답 전까지
  // 라벨을 알 수 없었고, 그 탓에 nav 노출이 /api/home 성공에 묶여 있었다.
  // 프로미스를 그대로 넘겨 기존 병렬성은 유지한다.
  const navLabelsPromise = loadNavLabels(env).catch(() => ({}));
  const [translationStrings, publicRuntime, homeSsr, pageExtraSchema, navLabels] = await Promise.all([
    loadTranslationStrings(env),
    loadPublicRuntime(env),
    pageKey === 'home' ? loadHomeSsrContent(env, url.origin, navLabelsPromise) : Promise.resolve(null),
    loadPageExtraSchema(env, url.origin, pageKey),
    navLabelsPromise,
  ]);
  const pageMeta = siteMeta.pages[pageKey] || siteMeta.pages.home;
  const publicPage = await loadPublicPage(env, url, pageKey, request).catch(err => { console.error('Public SSR failed:', pageKey, err); return null; });
  const page = pageNumber(url);
  const canonical = await resolveCanonical(context, url.pathname, pageKey, page, pageMeta.title);
  const canonicalPath = canonical.path;
  const itemListElements = publicPage?.posts ? publicPage.posts.map(post => ({url: `${url.origin}/post/${post.id}`, title: post.title})) : await loadPageItemList(env, url.origin, pageKey);
  const resolvedTitle = canonical.title;
  const shareMeta = await buildShareMetaBlockRust({
    pageKey,
    title: resolvedTitle,
    description: pageMeta.description,
    url: url.origin + canonicalPath,
    imageUrl: getResolvedShareImage(siteMeta, url.origin),
    googleVerification: siteMeta.google_verification,
    naverVerification: siteMeta.naver_verification,
    itemListElements,
    descriptor: canonical.descriptor,
  }, context);

  const updated = applyPublicParts(html, publicPage)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(resolvedTitle)}</title>`)
    .replace('<!-- SHARE_META -->', shareMeta + pageExtraSchema);

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  let baseResponse = new Response(updated, {
    status: publicPage?.status || response.status,
    statusText: response.statusText,
    headers,
  });
  if (pageKey === 'home' && homeSsr) {
    baseResponse = applyHomeSsrContent(baseResponse, homeSsr);
  }
  return applyTranslationBootstrap(baseResponse, translationStrings, publicRuntime, navLabels);
}

export async function resolveCanonical(context, pathname, pageKey, page, title, run = queryRust) {
  const fallback = () => ({
    path:getCanonicalPath(pathname, pageKey) + (BOARD_KEYS.includes(pageKey) && page > 1 ? '?page=' + page : ''),
    title:title + (BOARD_KEYS.includes(pageKey) && page > 1 ? ' · '+page+'페이지' : ''),
    descriptor:getPageSeoDescriptor(pageKey),
  });
  // shortcut: isolated UTF-16 surrogates retain the existing page metadata path.
  if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify({pathname,pageKey,title}))) return fallback();
  try {
    const response = await run(context, 'public-canonical', {pathname,pageKey,page,title});
    if (!response.ok) throw new Error('Rust canonical metadata failed');
    const result = await response.json();
    if (typeof result.path !== 'string' || typeof result.title !== 'string' || !result.descriptor || !['schema','breadcrumb','topic','keywords'].every(key => typeof result.descriptor[key] === 'string')) throw new Error('Invalid Rust canonical metadata');
    return result;
  } catch (_) { return fallback(); }
}

function getCanonicalPath(pathname, pageKey) {
  if (pathname === '/index.html' || pathname === '/') return '/';
  if (pageKey === 'latest') return '/latest';
  if (pageKey === 'jamboree16') return '/jamboree16';
  if (pageKey === 'korea') return '/korea';
  if (pageKey === 'apr') return '/apr';
  if (pageKey === 'wosm') return '/wosm';
  if (pageKey === 'wosm_members') return '/wosm-members';
  if (pageKey === 'people') return '/people';
  if (pageKey === 'glossary') return '/glossary';
  if (pageKey === 'calendar') return '/calendar';
  // 도감은 `/memorabilia/<id>` 딥링크가 전부 같은 셸을 반환하므로 대표 URL 하나로 통합.
  if (pageKey === 'memorabilia') return '/memorabilia';
  if (pageKey === 'privacy') return '/privacy';
  return pathname;
}

async function loadPageItemList(env, origin, pageKey) {
  if (!['home', 'latest', 'korea', 'apr', 'wosm', 'people', 'glossary'].includes(pageKey)) return [];
  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'public-schema', {key:pageKey});
    if (!response.ok) throw new Error('Rust page item list query failed');
    const result = await response.json();
    return (result.results || []).map((item) => ({
      url: `${origin}/post/${item.id}`,
      title: item.title || `post-${item.id}`,
    }));
  } catch (err) {
    console.error('[path] DB query failed for page:', pageKey, err);
    return [];
  }
}

// Page-specific schema.org JSON-LD appended after the shared meta block.
// Currently covers:
//   - /glossary       → DefinedTermSet with every term (ko/en/fr + 설명)
//   - /wosm-members   → Dataset describing the member-country table
// Returns "" for pages without extra schema so concatenation stays cheap.
async function loadPageExtraSchema(env, origin, pageKey) {
  if (!pageKey) return '';
  try {
    if (pageKey === 'glossary') return await buildGlossarySchema(env, origin);
    if (pageKey === 'wosm_members') return await buildWosmMembersSchema(env, origin);
  } catch (err) {
    console.error('[path] extra schema build failed for', pageKey, err);
  }
  return '';
}

async function buildGlossarySchema(env, origin) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'public-schema', {key:'glossary-schema', origin});
  if (!response.ok) throw new Error('Rust glossary schema query failed');
  return (await response.json()).html || '';
}

async function buildWosmMembersSchema(env, origin) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'public-schema', {key:'wosm-schema', origin});
  if (!response.ok) throw new Error('Rust WOSM schema query failed');
  return (await response.json()).html || '';
}

async function loadTranslationStrings(env) {
  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-setting', {key:'translations',normalize:true});
    if (!response.ok) throw new Error('Rust translations query failed');
    const {normalized, row, error} = await response.json();
    if (normalized !== undefined) return normalized;
    if (!row || error) return {};
    const parsed = JSON.parse(row.value || '{}');
    const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed.strings && typeof parsed.strings === 'object' && !Array.isArray(parsed.strings) ? parsed.strings : parsed)
      : {};
    const sanitized = {};
    Object.keys(source).forEach(key => { if (!key.startsWith('nav.')) sanitized[key] = source[key]; });
    return sanitized;
  } catch {
    return {};
  }
}

function applyTranslationBootstrap(response, strings, runtime, navLabels) {
  const safeStrings = strings && typeof strings === 'object' ? strings : {};
  const safeRuntime = runtime && typeof runtime === 'object' ? runtime : {};
  // GW_BOOT_NAV_LABELS 가 있어야 site-chrome.js 가 첫 스크립트 실행 시점에 정확한
  // 라벨로 nav 를 그릴 수 있다. 없으면 GW.STRINGS 기본값으로 그렸다가 데이터
  // 도착 후 교체돼 영문 라벨이 한 번 바뀌어 보인다.
  const safeNavLabels = navLabels && typeof navLabels === 'object' ? navLabels : {};
  const bootstrap = `<script>window.GW_BOOT_CUSTOM_STRINGS=${serializeForInlineScript(safeStrings)};window.GW_BOOT_NAV_LABELS=${serializeForInlineScript(safeNavLabels)};window.GW_BOOT_RUNTIME=${serializeForInlineScript(safeRuntime)};window.GW_KAKAO_JS_KEY=${serializeForInlineScript(String(safeRuntime.kakao_js_key || ''))};</script>`;
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
    const row = await singleSetting(env, 'public_runtime');
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

async function loadHomeSsrContent(env, origin, navLabelsPromise) {
  try {
    const railsPromise = loadSsrRails(env, origin);
    const [navLabels, leadData, latestPosts, popularPosts, picksPosts, koreaPosts, aprPosts, wosmPosts, peoplePosts, footerAnalytics] = await Promise.all([
      navLabelsPromise,
      loadHomeLead(env, origin).catch(() => ({ post: null })),
      loadLatestPosts(env, origin, 4).catch(() => []),
      // 추천·인기는 /api/home 과 같은 기준을 써야 초기 페인트 후 목록이 바뀌지 않는다.
      railsPromise.then((r) => r.popular).catch(() => []),
      railsPromise.then((r) => r.picks).catch(() => []),
      loadPostList(env, origin, { category: 'korea', limit: 4 }).catch(() => []),
      loadPostList(env, origin, { category: 'apr', limit: 4 }).catch(() => []),
      loadPostList(env, origin, { category: 'wosm', limit: 4 }).catch(() => []),
      loadPostList(env, origin, { category: 'people', limit: 4 }).catch(() => []),
      loadFooterAnalytics(env).catch(() => ({
        totalVisitors: '0',
        totalViews: '0',
        todayVisitors: '0',
      })),
    ]);

    const minis = await renderHomeParts(env,navLabels,{lead:leadData.post,latest:latestPosts,popular:popularPosts,picks:picksPosts,korea:koreaPosts,apr:aprPosts,wosm:wosmPosts,people:peoplePosts});

    const payload = {
      ...minis,
      footer: footerAnalytics,
    };
    if (hasMeaningfulHomeSsrPayload(payload)) return payload;
    const emergencyPosts = latestPosts.length ? latestPosts : await loadLatestPosts(env, origin, 4).catch(() => []);
    return buildEmergencyHomeSsrPayload(emergencyPosts, navLabels);
  } catch (err) {
    console.error('[home-ssr] failed to build fallback:', err);
    return buildEmergencyHomeSsrPayload([], {});
  }
}

export async function renderHomeParts(env, navLabels, data, run = queryRust) {
  const {lead,latest,popular,picks,korea,apr,wosm,people} = data;
  try {
    const sections = {
      latest:miniInput(latest,navLabels,{}),popular:miniInput(popular,navLabels,{}),picks:miniInput(picks,navLabels,{}),
      korea:miniInput(korea,navLabels,{hideCategoryChip:true}),apr:miniInput(apr,navLabels,{hideCategoryChip:true}),
      wosm:miniInput(wosm,navLabels,{hideCategoryChip:true}),people:miniInput(people,navLabels,{hideCategoryChip:true}),
    };
    const categoryLabels = Object.fromEntries(['korea','apr','wosm','people'].map(key=>[key,String(getNavLabel(navLabels,key,'ko') || '')]));
    const leadCandidates = [lead,picks[0],latest[0]].map(post=>leadInput(post,navLabels));
    const response = await run({env,request:{url:'https://internal.invalid/'}}, 'home-ssr-minis', {sections,categoryLabels,leadCandidates});
    if (!response.ok) throw new Error('Rust home SSR rendering failed');
    const parts = await response.json();
    if (!['lead','latest','popular','picks','korea','apr','wosm','people','heroPreloadUrl'].every(key=>typeof parts[key] === 'string')) throw new Error('Invalid Rust home SSR response');
    return parts;
  } catch (error) {
    console.error('[home-ssr] Rust rendering failed:',error);
    const post = lead || picks[0] || latest[0] || null;
    const html = (rows,options={}) => renderMiniList(rows,navLabels,options).toWellFormed();
    return {
      lead:renderHomeLeadStory(post,navLabels).toWellFormed(),
      latest:html(latest.slice(0,3)),popular:html((popular.length ? popular : latest).slice(0,4)),picks:html(picks.slice(0,4)),
      korea:html(korea.slice(0,4),{hideCategoryChip:true}),apr:html(apr.slice(0,4),{hideCategoryChip:true}),
      wosm:html(wosm.slice(0,4),{hideCategoryChip:true}),people:html(people.slice(0,4),{hideCategoryChip:true}),
      heroPreloadUrl:post && post.image_url && !post.image_is_placeholder ? String(post.image_url) : '',
    };
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
  const footerStats = payload.footer || {};
  let rewriter = new HTMLRewriter();
  Object.entries(sections).forEach(([selector, html]) => {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setInnerContent(html || '<div class="mini-empty">게시글이 없습니다</div>', { html: true });
      }
    });
  });
  rewriter = rewriter
    .on('#home-total-visitors', {
      element(element) {
        element.setInnerContent(String(footerStats.totalVisitors || '0'));
      }
    })
    .on('#home-total-views', {
      element(element) {
        element.setInnerContent(String(footerStats.totalViews || '0'));
      }
    })
    .on('#home-today-visitors', {
      element(element) {
        element.setInnerContent(String(footerStats.todayVisitors || '0'));
      }
    });
  // 메인 스토리 hero를 head에 preload — placeholder/로고 fallback일 때는 추가 안 함 (필요한 트래픽만).
  if (payload.heroPreloadUrl) {
    const safeHero = escapeHtml(payload.heroPreloadUrl);
    rewriter = rewriter.on('head', {
      element(element) {
        element.append(
          `<link rel="preload" as="image" href="${safeHero}" fetchpriority="high">`,
          { html: true }
        );
      }
    });
  }
  return rewriter.transform(response);
}

async function loadFooterAnalytics(env) {
  const context = { env, request: { url: 'https://internal.invalid/' } };
  const response = await queryRust(context, 'home-footer-analytics', {strict:true});
  if (!response.ok) throw new Error('Rust SSR footer query failed');
  const {ssr_footer} = await response.json();
  if (!ssr_footer || !['totalVisitors','totalViews','todayVisitors'].every(key => typeof ssr_footer[key] === 'string')) throw new Error('Invalid Rust SSR footer');
  return ssr_footer;
}

const SSR_CARD_COLUMNS = 'id, category, title, subtitle, content, image_url, created_at, publish_at, tag, author';

async function loadHomeLead(env, origin) {
  const row = await singleSetting(env, 'home_lead_post');
  const postId = row ? parseInt(row.value, 10) : 0;
  if (!postId) return { post: null };
  const rust = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-lead-post', {id:postId, columns:SSR_CARD_COLUMNS, origin});
  if (!rust.ok) throw new Error('Rust SSR lead query failed');
  const { post } = await rust.json();
  return { post };
}

async function loadLatestPosts(env, origin, limit) {
  return loadPostList(env, origin, { limit });
}

/**
 * SSR 폴백용 추천·인기 레일. functions/_shared/home-rails.js 의 기준을 그대로 쓴다.
 * 요청 안에서 한 번만 계산해 두 섹션이 나눠 쓴다.
 */
async function loadSsrRails(env, origin) {
  const rust = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'home-rails-cards', {limit:4,weights:POPULAR_WEIGHTS,columns:SSR_CARD_COLUMNS,origin});
  if (!rust.ok) throw new Error('Rust SSR rails query failed');
  return rust.json();
}

async function loadPostList(env, origin, opts = {}) {
  const limit = Math.max(1, Math.min(10, parseInt(opts.limit || 4, 10)));
  const rust = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-posts', {
    category: opts.category || null, featured: !!opts.featured, limit,
    columns: SSR_CARD_COLUMNS, publicDateExpr: PUBLIC_DATE_EXPR, origin,
  });
  if (!rust.ok) throw new Error('Rust SSR posts query failed');
  const { posts } = await rust.json();
  return posts || [];
}

export function renderHomeLeadStory(post, navLabels) {
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

export function miniInput(posts, navLabels, options) {
  return posts.map(post=>({id:String(post.id),title:String(post.title || ''),image:String(post.image_url || ''),placeholder:!!post.image_is_placeholder,category:String(post.category || 'korea'),tag:String(post.tag || ''),hide_category:!!options.hideCategoryChip,date:String(post.publish_at || post.created_at || '')}));
}

export function leadInput(post, navLabels) {
  if (!post) return null;
  return {...miniInput([post],navLabels,{})[0],subtitle:String(post.subtitle || '').trim(),author:String(post.author || ''),has_author:!!post.author,content:String(post.content || '')};
}

export function renderMiniList(posts, navLabels, options) {
  const opts = options || {};
  if (!Array.isArray(posts) || !posts.length) {
    return '<div class="mini-empty">게시글이 없습니다</div>';
  }
  return posts.map((post) => renderMiniItem(post, navLabels, opts)).join('');
}

function hasMeaningfulHomeSsrPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return ['lead', 'latest', 'popular', 'picks', 'korea', 'apr', 'wosm', 'people'].some((key) => {
    return String(payload[key] || '').indexOf('/post/') >= 0;
  });
}

function buildEmergencyHomeSsrPayload(posts, navLabels) {
  const safePosts = Array.isArray(posts) ? posts.slice(0, 4) : [];
  const latestHtml = renderMiniList(safePosts, navLabels, {});
  const emptyHtml = '<div class="mini-empty">게시글을 준비 중입니다</div>';
  return {
    lead: renderHomeLeadStory(safePosts[0] || null, navLabels),
    latest: latestHtml,
    popular: emptyHtml,
    picks: emptyHtml,
    korea: emptyHtml,
    apr: emptyHtml,
    wosm: emptyHtml,
    people: emptyHtml,
    footer: {
      totalVisitors: '0',
      totalViews: '0',
      todayVisitors: '0',
    },
  };
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
  const label = String(getNavLabel(navLabels, key, 'ko') || '').trim();
  if (label) {
    if (key === 'apr') return label.toUpperCase();
    if (key === 'wosm') return label.toUpperCase();
    if (key === 'korea') return label.charAt(0).toUpperCase() + label.slice(1);
    return label;
  }
  return {
    korea: 'Korea',
    apr: 'APR',
    wosm: 'WOSM',
    people: '스카우트 인물',
  }[key] || 'Korea';
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
