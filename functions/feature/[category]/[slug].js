import { buildShareMetaBlock, getResolvedShareImage, loadSiteMeta } from '../../_shared/site-meta.js';
import { getSpecialFeatureCollection } from '../../_shared/special-features.js';

const CATEGORY_META = {
  korea: { label: 'Korea', color: '#0094B4' },
  apr: { label: 'APR', color: '#FF5655' },
  wosm: { label: 'WOSM', color: '#248737' },
  people: { label: 'Scout People', color: '#8A5A2B' },
};

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
  const categoryMeta = CATEGORY_META[category] || CATEGORY_META.korea;
  const title = `${collection.special_feature} · 특집 기사 몰아보기 · BP미디어`;
  const description = `${categoryMeta.label} 게시판의 "${collection.special_feature}" 특집 기사 묶음을 최신순으로 모아보는 페이지입니다.`;
  const imageUrl = getResolvedShareImage(siteMeta, origin);
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

  const body = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${metaBlock}
  <link rel="stylesheet" href="/css/style.css?v=0.073.01">
</head>
<body class="feature-page">
  <main class="feature-page-wrap">
    <div class="feature-page-hero">
      <div class="feature-page-breadcrumb">
        <a href="/${category}.html">${escapeHtml(categoryMeta.label)}</a>
        <span> / </span>
        <a href="/post/${collection.items[0].id}">최신 기사 보기</a>
      </div>
      <div class="feature-page-title-row">
        <span class="category-tag" style="background:${categoryMeta.color};">${escapeHtml(categoryMeta.label)}</span>
        <span class="post-page-tag">특집 기사 몰아보기</span>
      </div>
      <h1>${escapeHtml(collection.special_feature)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
    <section class="feature-page-list">
      ${collection.items.map((item) => renderFeatureItem(item, categoryMeta)).join('')}
    </section>
  </main>
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

function renderFeatureItem(item, categoryMeta) {
  return `<article class="feature-page-item">
    <div class="feature-page-item-top">
      <span class="category-tag" style="background:${categoryMeta.color};">${escapeHtml(categoryMeta.label)}</span>
      <span class="feature-page-date">${escapeHtml(formatDate(item.publish_at || item.created_at || ''))}</span>
    </div>
    <h2><a href="/post/${item.id}">${escapeHtml(item.title || '')}</a></h2>
    ${item.subtitle ? `<p class="feature-page-subtitle">${escapeHtml(item.subtitle)}</p>` : ''}
  </article>`;
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
