import { loadSiteMeta, normalizeSiteMeta } from '../_shared/site-meta.js';
import { POPULAR_WEIGHTS } from '../_shared/home-rails.js';
import { logApiError } from '../_shared/ops-log.js';
import { ensureDuePostsPublished } from '../_shared/publish-due-posts.js';
import { loadNavLabels } from '../_shared/nav-labels.js';
import { loadActiveHomeBanners } from '../_shared/home-banners.js';
import { PUBLIC_DATE_EXPR } from '../_shared/post-public-date.js';
import { recordHomepageIssue } from '../_shared/homepage-issues.js';
import { DEFAULT_TICKER_ITEMS } from '../_shared/site-copy.mjs';
import { queryRust } from '../_shared/rust-server.js';

// 카드 목록(lead/picks/latest/popular/columns)용 직렬화.
// 홈 렌더러가 본문에서 실제로 쓰는 건 메인 스토리의 420자 발췌 한 곳뿐인데
// 이전에는 25건의 content 전문(약 55KB, 응답의 42%)을 매번 내려보냈다.
// 히어로는 애초에 content 를 SELECT 하지 않으므로 이 경로를 타지 않는다.
const DEFAULT_HOME_LEAD_MEDIA = {
  fit: 'cover',
  desktop: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
  mobile: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
};

// 카드용 게시글 컬럼 단일 정의 — loadHomeLead/loadHomePicks/loadPostList/loadLatestPosts
// 가 동일한 SELECT 목록을 4곳에 복제하던 것을 통합. 컬럼 추가/변경을 한 곳에서만 한다.
// (loadPopular 는 CTE 기반 별도 컬럼셋이라 제외)
const POST_CARD_COLUMNS = `id, category, title, subtitle, content, image_url, image_caption, image_frame, created_at, publish_at, featured, tag, views, author, published, sort_order, youtube_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes`;

const HOME_SECTION_ISSUE_DEFS = {
  site_meta: { title: '홈 사이트 메타 로드 실패', severity: 'medium', area: 'seo', source_path: '/api/home /api/settings/site-meta' },
  nav_labels: { title: '홈 메뉴명 로드 실패', severity: 'high', area: 'ui', source_path: '/api/home /api/settings/nav-labels' },
  translations: { title: '홈 번역 문자열 로드 실패', severity: 'medium', area: 'ui', source_path: '/api/home /api/settings/translations' },
  ticker: { title: '홈 티커 로드 실패', severity: 'low', area: 'homepage', source_path: '/api/home /api/settings/ticker' },
  stats: { title: '홈 통계 로드 실패', severity: 'medium', area: 'analytics', source_path: '/api/home' },
  analytics: { title: '홈 푸터 분석 로드 실패', severity: 'medium', area: 'analytics', source_path: '/api/home /site_visits' },
  hero: { title: '홈 히어로 로드 실패', severity: 'high', area: 'homepage', source_path: '/api/home' },
  lead: { title: '홈 메인 스토리 로드 실패', severity: 'high', area: 'homepage', source_path: '/api/home' },
  latest: { title: '홈 최신 소식 로드 실패', severity: 'high', area: 'homepage', source_path: '/api/home' },
  popular: { title: '홈 인기 소식 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
  banners: { title: '홈 배너 로드 실패', severity: 'low', area: 'homepage', source_path: '/api/home' },
  picks: { title: '홈 에디터 추천 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
  korea: { title: '홈 Korea 섹션 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
  apr: { title: '홈 APR 섹션 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
  wosm: { title: '홈 WOSM 섹션 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
  people: { title: '홈 Scout People 섹션 로드 실패', severity: 'medium', area: 'homepage', source_path: '/api/home' },
};

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const origin = new URL(request.url).origin;
    // 예약 공개 보정을 응답 경로에서 분리 — due 글이 있을 때 UPDATE + purgeContentCache
    // (네트워크 퍼지)까지 동기로 기다리며 홈 응답이 수초 튀던 원인(8s 스파이크). 동일
    // 작업을 5분 주기 publish-due cron(wrangler.publish-due.toml)이 이미 담당하므로
    // 즉시성은 약간 양보(예약글 최대 ~수분 지연, 운영자 승인). waitUntil 로 응답 후
    // 백그라운드 실행해 opportunistic 하게 계속 처리. (KMS feature-definition 의
    // "트래픽/지연 증가 시 inline 호출 제거" 트리거 도달분)
    const runDuePublish = () =>
      ensureDuePostsPublished(env, origin).catch((err) => {
        console.error('GET /api/home auto publish error (bg):', err);
      });
    if (context.waitUntil) context.waitUntil(runDuePublish());
    else runDuePublish();

    const issues = {};
    let railsPromise;
    const getRails = () => (railsPromise ||= loadRails(env, origin));
    let sectionsPromise;
    const getSection = async (key) => {
      sectionsPromise ||= loadHomeSections(context, origin).catch(() => null);
      const sections = await sectionsPromise;
      if (!sections) return loadPostList(context, origin, key === 'latest' ? {} : {category: key});
      if (!Array.isArray(sections[key])) throw new Error('Rust home section query failed: ' + key);
      return sections[key];
    };
    const resolveSection = (key, loader, fallback) =>
      Promise.resolve()
        .then(loader)
        .catch(async (err) => {
          issues[key] = true;
          console.error(`GET /api/home section "${key}" failed:`, err);
          // 이슈 기록 자체가 실패해도(예: DB 쓰기 오류) resolveSection 이 reject 되어
          // Promise.all → 홈 API 전체 500 으로 번지지 않도록 swallow. (안정성 검토 00.170.07)
          await recordHomeSectionIssue(env, key, err).catch(() => {});
          return fallback;
        });

    const [
      siteMeta,
      navLabels,
      translations,
      ticker,
      stats,
      footerAnalytics,
      hero,
      lead,
      latest,
      popular,
      picks,
      banners,
      korea,
      apr,
      wosm,
      people,
    ] = await Promise.all([
      resolveSection('site_meta', () => loadSiteMeta(env), normalizeSiteMeta(null)),
      resolveSection('nav_labels', () => loadNavLabels(env), {}),
      resolveSection('translations', () => loadTranslations(env), {}),
      resolveSection('ticker', () => loadTicker(env), DEFAULT_TICKER_ITEMS),
      resolveSection('stats', () => loadStats(context), {
        korea: 0,
        apr: 0,
        wosm: 0,
        people: 0,
        today: 0,
      }),
      resolveSection('analytics', () => loadFooterAnalytics(env), {
        provider: 'site_visits',
        provider_label: '공개 페이지 전체 방문 집계',
        today_unique: 0,
        today_views: 0,
        total_unique: 0,
        today_visits: 0,
        total_visits: 0,
        total_pageviews: 0,
        measured_basis: 'site_visits',
      }),
      resolveSection('hero', () => loadHero(env, origin), { posts: [], interval_ms: 3000 }),
      resolveSection('lead', () => loadHomeLead(env, origin), { post: null, media: DEFAULT_HOME_LEAD_MEDIA }),
      resolveSection('latest', () => getSection('latest'), []),
      // 추천·인기는 서로를 알아야 하므로(인기가 추천과 중복 제거) 함께 계산한다.
      resolveSection('popular', () => getRails().then((r) => r.popular), []),
      resolveSection('picks', () => getRails().then((r) => r.picks), []),
      resolveSection('banners', () => loadActiveHomeBanners(env), []),
      resolveSection('korea', () => getSection('korea'), []),
      resolveSection('apr', () => getSection('apr'), []),
      resolveSection('wosm', () => getSection('wosm'), []),
      resolveSection('people', () => getSection('people'), []),
    ]);

    const body = await assembleHomeResponse(context, {
      siteMeta, navLabels, translations, ticker, stats, footerAnalytics, hero, lead,
      latest, popular, picks, banners, korea, apr, wosm, people, issues,
    });
    return json(body, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('GET /api/home error:', err);
    await recordHomepageIssue(env, {
      title: '홈 API 전체 응답 실패',
      issue_type: 'error',
      status: 'open',
      severity: 'high',
      area: 'api',
      source_path: '/api/home',
      summary: '홈 API가 전체적으로 실패해 주요 데이터 응답을 만들지 못했습니다.',
      impact: '홈페이지 전체가 초기 fallback 상태로 보이거나 데이터가 비어 보일 수 있습니다.',
      cause: trimMessage(err && err.message),
      action_items: 'Functions 로그와 D1 응답 상태, 최근 배포 변경사항을 우선 점검합니다.',
      reporter: 'system:auto-home',
      occurred_at: nowUtcText(),
    }).catch((diagnosticError) => console.error('GET /api/home issue recording failed:', diagnosticError));
    await logApiError(env, request, err, { channel: 'site' })
      .catch((diagnosticError) => console.error('GET /api/home error logging failed:', diagnosticError));
    return json({ error: 'Database error' }, 500);
  }
}


export async function assembleHomeResponse(context, data, run = queryRust) {
  const fallback = () => ({
    site_meta:data.siteMeta, nav_labels:data.navLabels, translations:{strings:data.translations},
    ticker:{items:data.ticker}, stats:data.stats, analytics:data.footerAnalytics, hero:data.hero, lead:data.lead,
    latest:{posts:data.latest}, popular:{posts:data.popular}, picks:{posts:data.picks}, banners:data.banners,
    columns:{korea:{posts:data.korea},apr:{posts:data.apr},wosm:{posts:data.wosm},people:{posts:data.people}}, issues:data.issues,
  });
  // shortcut: isolated UTF-16 surrogates use the legacy response until Wasm supports them.
  if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(data))) return fallback();
  try {
    const response = await run(context, 'home-response', data);
    if (!response.ok) throw new Error('Rust home response failed');
    const result = await response.json();
    if (!result || !result.columns || !result.latest || !result.issues) throw new Error('Invalid Rust home response');
    return result;
  } catch (_) { return fallback(); }
}

async function recordHomeSectionIssue(env, key, err) {
  const meta = HOME_SECTION_ISSUE_DEFS[key];
  if (!meta) return null;
  return recordHomepageIssue(env, {
    title: meta.title,
    issue_type: 'error',
    status: 'open',
    severity: meta.severity,
    area: meta.area,
    source_path: meta.source_path,
    summary: meta.title + '가 감지되어 해당 섹션은 fallback 데이터로 내려갔습니다.',
    impact: '홈 일부 영역이 비어 보이거나 기본값으로 대체될 수 있습니다.',
    cause: trimMessage(err && err.message),
    action_items: '해당 로더와 관련 settings/posts 쿼리, Functions 로그를 점검합니다.',
    reporter: 'system:auto-home',
    occurred_at: nowUtcText(),
  });
}

async function loadHomeSetting(env, key, normalize = false) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-setting', { key, normalize });
  if (!rust.ok) throw new Error('Rust home setting query failed');
  const result = await rust.json();
  return normalize ? result : result.row;
}

async function loadTranslations(env) {
  const { row, normalized, error } = await loadHomeSetting(env, 'translations', true);
  if (error) throw new Error(error);
  if (normalized !== undefined) return normalized;
  const parsed = row ? JSON.parse(row.value || '{}') : {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return sanitizeTranslationStrings(
      parsed.strings && typeof parsed.strings === 'object' && !Array.isArray(parsed.strings)
        ? parsed.strings
        : parsed
    );
  }
  throw new Error('Translations settings must be an object');
}

function sanitizeTranslationStrings(strings) {
  if (!strings || typeof strings !== 'object') return {};
  const sanitized = {};
  Object.keys(strings).forEach((key) => {
    if (key.indexOf('nav.') === 0) return;
    sanitized[key] = strings[key];
  });
  return sanitized;
}

async function loadTicker(env) {
  const { row, normalized, error } = await loadHomeSetting(env, 'ticker', true);
  if (error) throw new Error(error);
  if (normalized !== undefined) return normalized;
  if (!row) return DEFAULT_TICKER_ITEMS;
  const parsed = JSON.parse(row.value || '[]');
  if (Array.isArray(parsed)) return parsed;
  throw new Error('Ticker settings must be an array');
}

async function loadStats(context) {
  const rust = await queryRust(context, 'post-stats', { publicDateExpr: PUBLIC_DATE_EXPR, today: null });
  if (!rust.ok) throw new Error('Rust home stats query failed');
  return rust.json();
}

async function loadFooterAnalytics(env) {
  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-footer-analytics', {});
    if (response.ok) return await response.json();
  } catch (_) {}
  return {provider:'site_visits',provider_label:'공개 페이지 전체 방문 집계',today_unique:0,today_views:0,total_unique:0,today_visits:0,total_visits:0,total_pageviews:0,measured_basis:'site_visits'};
}

async function loadHero(env, origin) {
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'home-hero-from-settings', {
    origin, publicDateExpr:PUBLIC_DATE_EXPR,
  });
  if (!response.ok) throw new Error('Rust home hero query failed');
  return response.json();
}

async function loadHomeLead(env, origin) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-lead', {
    columns: POST_CARD_COLUMNS, origin,
  });
  if (!rust.ok) throw new Error('Rust home lead query failed');
  return rust.json();
}

function safeParsePickOrder(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch (_) { return []; }
}

async function loadPostList(context, origin, opts = {}) {
  const limit = Math.max(1, Math.min(10, parseInt(opts.limit || 4, 10)));
  const rust = await queryRust(context, 'home-posts', {
    category: opts.category || null,
    featured: !!opts.featured,
    limit,
    columns: POST_CARD_COLUMNS,
    card: true,
    origin,
    publicDateExpr: PUBLIC_DATE_EXPR,
  });
  if (!rust.ok) throw new Error('Rust home posts query failed');
  const { posts } = await rust.json();
  return posts || [];
}

async function loadHomeSections(context, origin) {
  const rust = await queryRust(context, 'home-sections', {columns: POST_CARD_COLUMNS, publicDateExpr: PUBLIC_DATE_EXPR, origin});
  if (!rust.ok) throw new Error('Rust home sections query failed');
  const sections = await rust.json();
  if (!sections || typeof sections !== 'object' || !['latest', 'korea', 'apr', 'wosm', 'people'].every(key => sections[key] === null || Array.isArray(sections[key]))) {
    throw new Error('Invalid Rust home sections response');
  }
  return sections;
}

/**
 * 홈 추천·인기 레일 — 한 번만 계산해 요청 안에서 재사용한다.
 * resolveSection 이 두 번 호출하므로 메모이즈하지 않으면 집계 쿼리가 두 번 나간다.
 */
async function loadRails(env, origin) {
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'home-rails-cards', {limit:4,weights:POPULAR_WEIGHTS,columns:POST_CARD_COLUMNS,origin,card:true});
  if (!response.ok) throw new Error('Rust home rails query failed');
  return response.json();
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function trimMessage(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > 500 ? text.slice(0, 500) : text;
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
