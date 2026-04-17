import { buildShareMetaBlock, getResolvedShareImage, loadSiteMeta } from '../../_shared/site-meta.js';
import { getSpecialFeatureCollection } from '../../_shared/special-features.js';
import { getNavLabel, loadNavLabels } from '../../_shared/nav-labels.js';
import { getCategoryMeta } from '../../_shared/category-meta.mjs';

export async function onRequestGet(context) {
  return renderFeaturePage(context);
}

export async function onRequestHead(context) {
  return renderFeaturePage(context, true);
}

async function renderFeaturePage({ params, request, env }, headOnly = false) {
  const category = normalizeCategory(params.category);
  const slug = String(params.slug || '').trim();
  if (!category || !slug) return notFound();

  const collection = await getSpecialFeatureCollection(env, category, slug);
  if (!collection) return notFound();

  const origin = new URL(request.url).origin;
  const siteMeta = await loadSiteMeta(env);
  const navLabels = await loadNavLabels(env);
  const categoryMeta = getCategoryMeta(navLabels, category, 'ko');
  const leadItem = collection.items[0];
  const restItems = collection.items.slice(1);
  const title = `${collection.special_feature} · 특집 기사 컬렉션 · BP미디어`;
  const description = `${categoryMeta.label} 카테고리에서 "${collection.special_feature}"를 주제로 묶인 기사 ${collection.items.length}건을 한 페이지에서 읽을 수 있는 특집 컬렉션입니다.`;
  const imageUrl = resolveFeatureImage(origin, leadItem) || getResolvedShareImage(siteMeta, origin);
  const url = `${origin}/feature/${category}/${slug}`;
  const metaBlock = buildShareMetaBlock({
    pageKey: category,
    title,
    description,
    url,
    imageUrl,
    googleVerification: siteMeta.google_verification,
    naverVerification: siteMeta.naver_verification,
  });
  const latestDate = formatDate(leadItem && (leadItem.publish_at || leadItem.created_at || ''));
  const footerTitle = escapeHtml((siteMeta && siteMeta.footer && siteMeta.footer.title) || 'BP미디어');
  const footerDescription = escapeHtml((siteMeta && siteMeta.footer && siteMeta.footer.description) || 'BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.');
  const footerDomain = escapeHtml((siteMeta && siteMeta.footer && siteMeta.footer.domain_label) || 'bpmedia.net');
  const footerTipEmail = escapeHtml((siteMeta && siteMeta.footer && siteMeta.footer.tip_email) || 'story@bpmedia.net');
  const footerContactEmail = escapeHtml((siteMeta && siteMeta.footer && siteMeta.footer.contact_email) || 'info@bpmedia.net');
  const navContributors = getNavLabel(navLabels, 'nav.contributors', 'ko');
  const navHome = getNavLabel(navLabels, 'nav.home', 'ko');
  const navLatest = getNavLabel(navLabels, 'nav.latest', 'ko');
  const navKorea = getNavLabel(navLabels, 'nav.korea', 'ko');
  const navApr = getNavLabel(navLabels, 'nav.apr', 'ko');
  const navWosm = getNavLabel(navLabels, 'nav.wosm', 'ko');
  const navWosmMembers = getNavLabel(navLabels, 'nav.wosm_members', 'ko');
  const navPeople = getNavLabel(navLabels, 'nav.people', 'ko');
  const navCalendar = getNavLabel(navLabels, 'nav.calendar', 'ko');
  const navGlossary = getNavLabel(navLabels, 'nav.glossary', 'ko');

  const body = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${metaBlock}
  <link rel="alternate" type="application/rss+xml" title="BP미디어 RSS" href="/rss.xml">
  <link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
  <link rel="icon" type="image/png" sizes="48x48" href="/img/favicon-48.png">
  <link rel="apple-touch-icon" href="/img/logo.png">
  <link rel="shortcut icon" href="/img/favicon-48.png">
  <link rel="stylesheet" href="/css/style.css?v=20260417074556">
  <style>
    .feature-page {
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.9), rgba(255,255,255,0) 34%),
        linear-gradient(180deg, #f7f3ef 0%, #f3eee8 42%, #f7f3ef 100%);
    }
    .feature-page-shell {
      max-width: 1366px;
      margin: 0 auto;
      padding: 0 48px 72px;
    }
    .feature-page-intro {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.9fr);
      gap: 18px;
      align-items: stretch;
      margin-top: 20px;
    }
    .feature-page-hero-card,
    .feature-page-summary-card,
    .feature-page-lead,
    .feature-page-rail {
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(31,31,31,0.08);
      box-shadow: 0 14px 36px rgba(31,31,31,0.06);
      backdrop-filter: blur(4px);
    }
    .feature-page-hero-card {
      padding: 32px;
      position: relative;
      overflow: hidden;
    }
    .feature-page-hero-card::after {
      content: '';
      position: absolute;
      inset: auto -12% -28% auto;
      width: 240px;
      height: 240px;
      border-radius: 999px;
      background: ${hexToRgba(categoryMeta.color, 0.12)};
      pointer-events: none;
    }
    .feature-page-breadcrumb {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .feature-page-breadcrumb a {
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid rgba(31,31,31,0.16);
    }
    .feature-page-kicker-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
    }
    .feature-page-hero-card h1 {
      margin: 0 0 14px;
      font-size: clamp(32px, 4vw, 54px);
      line-height: 1.05;
      letter-spacing: -0.04em;
      max-width: 11ch;
    }
    .feature-page-hero-card p {
      max-width: 62ch;
      margin: 0;
      font-size: 17px;
      line-height: 1.75;
      color: rgba(31,31,31,0.78);
    }
    .feature-page-summary-card {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .feature-page-summary-head strong,
    .feature-page-rail-head strong {
      display: block;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .feature-page-summary-head h2 {
      margin: 0;
      font-size: 28px;
      line-height: 1.12;
      letter-spacing: -0.03em;
    }
    .feature-page-summary-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .feature-page-stat {
      padding: 12px 14px;
      border: 1px solid rgba(31,31,31,0.08);
      background: #f7f5f0;
    }
    .feature-page-stat span {
      display: block;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .feature-page-stat strong {
      display: block;
      font-size: 22px;
      line-height: 1.1;
      letter-spacing: -0.02em;
      color: var(--black);
    }
    .feature-page-summary-links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .feature-page-summary-links a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border: 1px solid rgba(31,31,31,0.12);
      background: #fff;
      color: var(--black);
      text-decoration: none;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .feature-page-content {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.9fr);
      gap: 18px;
      margin-top: 18px;
      align-items: start;
    }
    .feature-page-lead {
      overflow: hidden;
    }
    .feature-page-lead-media {
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, ${hexToRgba(categoryMeta.color, 0.22)}, rgba(31,31,31,0.04));
      border-bottom: 1px solid rgba(31,31,31,0.08);
    }
    .feature-page-lead-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .feature-page-lead-copy {
      padding: 26px 28px 30px;
    }
    .feature-page-lead-copy h2 {
      margin: 0 0 12px;
      font-size: clamp(28px, 3vw, 42px);
      line-height: 1.08;
      letter-spacing: -0.04em;
    }
    .feature-page-lead-copy h2 a {
      color: inherit;
      text-decoration: none;
    }
    .feature-page-lead-copy p {
      margin: 0 0 16px;
      font-size: 16px;
      line-height: 1.75;
      color: rgba(31,31,31,0.82);
    }
    .feature-page-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 11px;
      letter-spacing: 0.08em;
      color: var(--muted);
      text-transform: uppercase;
    }
    .feature-page-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 14px;
    }
    .feature-page-grid .post-card {
      min-height: 100%;
    }
    .feature-page-grid .post-card-thumb.placeholder,
    .feature-page-lead-media.placeholder {
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      padding: 20px;
      color: rgba(31,31,31,0.72);
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .feature-page-rail {
      padding: 24px;
      position: sticky;
      top: 18px;
    }
    .feature-page-rail-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .feature-page-rail-item {
      padding: 14px 0;
      border-top: 1px solid rgba(31,31,31,0.08);
    }
    .feature-page-rail-item:first-child {
      border-top: none;
      padding-top: 0;
    }
    .feature-page-rail-item a {
      display: block;
      text-decoration: none;
      color: inherit;
    }
    .feature-page-rail-item strong {
      display: block;
      font-size: 16px;
      line-height: 1.45;
      margin-bottom: 6px;
      color: var(--black);
    }
    .feature-page-rail-item span {
      display: block;
      font-family: AliceDigitalLearning, sans-serif;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    @media (max-width: 960px) {
      .feature-page-shell {
        padding: 0 18px 56px;
      }
      .feature-page-intro,
      .feature-page-content {
        grid-template-columns: 1fr;
      }
      .feature-page-rail {
        position: static;
      }
    }
    @media (max-width: 720px) {
      .feature-page-hero-card,
      .feature-page-summary-card,
      .feature-page-lead-copy,
      .feature-page-rail {
        padding: 20px;
      }
      .feature-page-grid {
        grid-template-columns: 1fr;
      }
      .feature-page-summary-stats {
        grid-template-columns: 1fr 1fr;
      }
    }
  </style>
</head>
<body class="feature-page">
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="masthead">
    <div class="masthead-top">
      <div class="masthead-date" id="today-date"></div>
      <div class="masthead-logo">
        <a href="/">
          <div class="masthead-logo-row">
            <img src="/img/logo.svg" alt="" class="masthead-logo-img" aria-hidden="true">
            <h1>BP미디어</h1>
          </div>
          <div class="sub">The BP Post · bpmedia.net</div>
        </a>
      </div>
      <div class="masthead-right">
        <div class="masthead-stats" id="masthead-stats"></div>
        <div class="lang-toggle">
          <button class="lang-btn active" id="lang-btn-ko" onclick="GW.setLang('ko')">KOR</button>
          <button class="lang-btn" id="lang-btn-en" onclick="GW.setLang('en')">ENG</button>
        </div>
        <div class="masthead-search">
          <input type="text" id="mh-search-input" class="mh-search-input" placeholder="검색…" autocomplete="off" aria-label="사이트 검색어 입력" />
          <button class="mh-search-btn" id="mh-search-btn" aria-label="검색"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
        </div>
      </div>
    </div>
    <nav class="nav">
      <a href="/contributors" data-i18n="nav.contributors">${escapeHtml(navContributors)}</a>
      <a href="/" data-i18n="nav.home">${escapeHtml(navHome)}</a>
      <a href="/latest" data-i18n="nav.latest">${escapeHtml(navLatest)}</a>
      <a href="/korea" data-i18n="nav.korea">${escapeHtml(navKorea)}</a>
      <a href="/apr" data-i18n="nav.apr">${escapeHtml(navApr)}</a>
      <a href="/wosm" data-i18n="nav.wosm">${escapeHtml(navWosm)}</a>
      <a href="/wosm-members" data-i18n="nav.wosm_members">${escapeHtml(navWosmMembers)}</a>
      <a href="/people" data-i18n="nav.people">${escapeHtml(navPeople)}</a>
      <a href="/calendar" data-i18n="nav.calendar">${escapeHtml(navCalendar)}</a>
      <a href="/glossary" data-i18n="nav.glossary">${escapeHtml(navGlossary)}</a>
    </nav>
  </header>

  <div class="ticker">
    <div class="ticker-inner" id="ticker-inner">
      길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다
      &nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;
      한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다
      &nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;
      The BP Post · bpmedia.net
    </div>
  </div>

  <main id="main-content" class="feature-page-shell">
    <section class="feature-page-intro">
      <article class="feature-page-hero-card">
        <div class="feature-page-breadcrumb">
          <a href="/${category}">${escapeHtml(categoryMeta.label)}</a>
          <span>•</span>
          <a href="/post/${leadItem.id}">최신 기사 바로가기</a>
        </div>
        <div class="feature-page-kicker-row">
          <span class="category-tag" style="background:${categoryMeta.color};">${escapeHtml(categoryMeta.label)}</span>
          <span class="post-page-tag">특집 기사 컬렉션</span>
        </div>
        <h1>${escapeHtml(collection.special_feature)}</h1>
        <p>${escapeHtml(description)}</p>
      </article>
      <aside class="feature-page-summary-card">
        <div class="feature-page-summary-head">
          <strong>Collection Brief</strong>
          <h2>${escapeHtml(categoryMeta.label)} 큐레이션</h2>
        </div>
        <div class="feature-page-summary-stats">
          <div class="feature-page-stat">
            <span>총 기사 수</span>
            <strong>${collection.items.length}건</strong>
          </div>
          <div class="feature-page-stat">
            <span>최신 발행</span>
            <strong>${escapeHtml(latestDate || '미정')}</strong>
          </div>
        </div>
        <div class="feature-page-summary-links">
          <a href="/${category}">${escapeHtml(categoryMeta.label)} 전체 보기</a>
          <a href="/post/${leadItem.id}">리드 기사 읽기</a>
        </div>
      </aside>
    </section>

    <section class="feature-page-content">
      <div>
        ${renderFeatureLead(leadItem, categoryMeta, origin)}
        ${restItems.length ? `<div class="feature-page-grid">${restItems.map((item) => renderFeatureCard(item, categoryMeta, origin)).join('')}</div>` : ''}
      </div>
      <aside class="feature-page-rail">
        <div class="feature-page-rail-head">
          <strong>Story Lineup</strong>
          <p class="post-card-excerpt" style="margin-bottom:0;">이 특집에 묶인 기사 흐름을 최신순으로 빠르게 훑어볼 수 있습니다.</p>
        </div>
        <div class="feature-page-rail-list">
          ${collection.items.map((item, index) => renderFeatureRailItem(item, index === 0)).join('')}
        </div>
      </aside>
    </section>
  </main>

  <footer>
    <div class="footer-inner">
      <div class="footer-brand">
        <h4 data-footer-role="title">${footerTitle}</h4>
        <p data-footer-role="description">${footerDescription}</p>
        <p data-footer-role="domain" style="margin-top:6px;">${footerDomain}</p>
        <p>기사제보: <a data-footer-role="tip-email" href="mailto:${footerTipEmail}">${footerTipEmail}</a></p>
        <p>문의: <a data-footer-role="contact-email" href="mailto:${footerContactEmail}">${footerContactEmail}</a></p>
      </div>
      <div class="footer-admin">
        <h4>바로가기</h4>
        <a href="/${category}">${escapeHtml(categoryMeta.label)} 목록 →</a>
        <a href="/latest">최신 기사 보기 →</a>
        <p class="footer-build">Site <span class="site-build-version">—</span> · Admin <span class="admin-build-version">—</span></p>
      </div>
      <div class="footer-bottom">
        <p>© 2026 BP미디어 · bpmedia.net</p>
        <p>BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다.</p>
      </div>
    </div>
  </footer>
  <script src="/js/main.js?v=20260417074556"></script>
  <script src="/js/site-chrome.js?v=20260417074556"></script>
  <script>GW.bootstrapStandardPage();</script>
</body>
</html>`;

  return new Response(headOnly ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800',
    },
  });
}

function renderFeatureLead(item, categoryMeta, origin) {
  const image = resolveFeatureImage(origin, item);
  const excerpt = item.subtitle || truncatePlain(item.content || '', 220);
  const imageBlock = image
    ? `<div class="feature-page-lead-media"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.title || '')}"></div>`
    : `<div class="feature-page-lead-media placeholder">Feature Lead</div>`;
  return `<article class="feature-page-lead">
    ${imageBlock}
    <div class="feature-page-lead-copy">
      <div class="feature-page-meta-row">
        <span class="category-tag" style="background:${categoryMeta.color};">${escapeHtml(categoryMeta.label)}</span>
        ${item.tag ? `<span class="post-page-tag">${escapeHtml(item.tag)}</span>` : ''}
        <span>${escapeHtml(formatDate(item.publish_at || item.created_at || ''))}</span>
        ${item.author ? `<span>${escapeHtml(item.author)}</span>` : ''}
      </div>
      <h2><a href="/post/${item.id}">${escapeHtml(item.title || '')}</a></h2>
      ${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''}
      <a class="read-more" href="/post/${item.id}">기사 읽기</a>
    </div>
  </article>`;
}

function renderFeatureCard(item, categoryMeta, origin) {
  const image = resolveFeatureImage(origin, item);
  const excerpt = item.subtitle || truncatePlain(item.content || '', 120);
  const thumb = image
    ? `<img class="post-card-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(item.title || '')}">`
    : `<div class="post-card-thumb placeholder" style="background:linear-gradient(135deg, ${hexToRgba(categoryMeta.color, 0.24)}, rgba(31,31,31,0.04));">Feature Story</div>`;
  return `<article class="post-card" style="--card-accent:${categoryMeta.color};">
    <a href="/post/${item.id}" aria-label="${escapeHtml(item.title || '')}">
      ${thumb}
    </a>
    <div class="post-card-body">
      <div class="post-card-labels">
        <span class="category-tag" style="background:${categoryMeta.color};">${escapeHtml(categoryMeta.label)}</span>
        ${item.tag ? `<span class="post-kicker">${escapeHtml(item.tag)}</span>` : ''}
      </div>
      <div class="post-card-head">
        <h3><a href="/post/${item.id}" style="color:inherit;text-decoration:none;">${escapeHtml(item.title || '')}</a></h3>
        ${excerpt ? `<p class="post-card-excerpt">${escapeHtml(excerpt)}</p>` : ''}
      </div>
      <div class="post-card-footer">
        <div class="post-card-meta">${escapeHtml(formatDate(item.publish_at || item.created_at || ''))}${item.author ? ' · ' + escapeHtml(item.author) : ''}</div>
        <a class="read-more" href="/post/${item.id}">기사 읽기</a>
      </div>
    </div>
  </article>`;
}

function renderFeatureRailItem(item, isLead) {
  return `<article class="feature-page-rail-item">
    <a href="/post/${item.id}">
      <strong>${escapeHtml(item.title || '')}</strong>
      <span>${isLead ? 'Lead Story · ' : ''}${escapeHtml(formatDate(item.publish_at || item.created_at || ''))}</span>
    </a>
  </article>`;
}

function resolveFeatureImage(origin, item) {
  const raw = String(item && item.image_url || '').trim();
  if (!raw) return '';
  return raw.startsWith('http') ? raw : origin + raw;
}

function truncatePlain(value, maxLen) {
  const text = String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || '').replace('#', '').trim();
  const normalized = raw.length === 3
    ? raw.split('').map((part) => part + part).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(31,31,31,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeCategory(value) {
  if (value === 'worm') return 'wosm';
  return ['korea', 'apr', 'wosm', 'people'].includes(value) ? value : null;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(String(dateStr).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(dateStr).slice(0, 10);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notFound() {
  return new Response('Not Found', { status: 404 });
}
