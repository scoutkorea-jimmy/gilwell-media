import { buildShareMetaBlock, getResolvedShareImage, loadSiteMeta } from './_shared/site-meta.js';

const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

export async function onRequestGet(context) {
  return renderGlossaryRawPage(context);
}

export async function onRequestHead(context) {
  return renderGlossaryRawPage(context, true);
}

async function renderGlossaryRawPage({ request, env }, headOnly = false) {
  const origin = new URL(request.url).origin;
  const siteMeta = await loadSiteMeta(env);
  const title = '스카우트 용어집 원문 색인 · BP미디어';
  const description = 'BP미디어 용어집의 모든 스카우트 용어를 한국어·영어·프랑스어와 설명까지 한 페이지에서 원문 그대로 볼 수 있는 공개 색인 페이지입니다.';
  const imageUrl = getResolvedShareImage(siteMeta, origin);
  let items = [];

  try {
    const result = await env.DB.prepare(`
      SELECT id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at
      FROM glossary_terms
    `).all();
    items = normalizeGlossaryRows(result.results || []);
  } catch (err) {
    console.error('GET /glossary-raw error:', err);
  }

  const metaBlock = buildShareMetaBlock({
    pageKey: 'glossary',
    title,
    description,
    url: origin + '/glossary-raw',
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
  <link rel="stylesheet" href="/css/style.css?v=20260419112623">
  <style>
    body.glossary-raw-page {
      margin: 0;
      background: #f7f3ef;
      color: #1f1c1a;
    }
    .glossary-raw-wrap {
      max-width: 1040px;
      margin: 0 auto;
      padding: 40px 20px 72px;
    }
    .glossary-raw-hero {
      background: #fff;
      border: 1px solid rgba(31, 28, 26, 0.08);
      padding: 28px 28px 24px;
      box-shadow: 0 14px 40px rgba(31, 28, 26, 0.06);
    }
    .glossary-raw-hero h1 {
      margin: 0 0 12px;
      font-size: 36px;
      line-height: 1.18;
    }
    .glossary-raw-hero p {
      margin: 0;
      font-size: 18px;
      line-height: 1.7;
      color: rgba(31, 28, 26, 0.8);
    }
    .glossary-raw-meta {
      margin-top: 14px;
      font-size: 14px;
      color: rgba(31, 28, 26, 0.65);
      letter-spacing: 0.04em;
    }
    .glossary-raw-list {
      display: grid;
      gap: 18px;
      margin-top: 28px;
    }
    .glossary-raw-card {
      background: #fff;
      border: 1px solid rgba(31, 28, 26, 0.08);
      padding: 20px;
      box-shadow: 0 10px 28px rgba(31, 28, 26, 0.05);
    }
    .glossary-raw-card h2 {
      margin: 0 0 14px;
      font-size: 14px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #6a2aa3;
    }
    .glossary-raw-card dl {
      margin: 0;
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 10px 18px;
    }
    .glossary-raw-card dt {
      font-size: 13px;
      letter-spacing: 0.08em;
      color: rgba(31, 28, 26, 0.56);
      text-transform: uppercase;
    }
    .glossary-raw-card dd {
      margin: 0;
      font-size: 19px;
      line-height: 1.6;
      word-break: keep-all;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    .glossary-raw-desc {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(31, 28, 26, 0.08);
      font-size: 18px;
      line-height: 1.8;
      color: rgba(31, 28, 26, 0.86);
      white-space: pre-wrap;
      word-break: keep-all;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    .glossary-raw-links {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      font-size: 14px;
    }
    .glossary-raw-links a {
      color: #6a2aa3;
      text-decoration: none;
    }
    @media (max-width: 720px) {
      .glossary-raw-wrap {
        padding: 24px 14px 56px;
      }
      .glossary-raw-hero h1 {
        font-size: 30px;
      }
      .glossary-raw-card {
        padding: 16px;
      }
      .glossary-raw-card dl {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .glossary-raw-card dd {
        font-size: 17px;
      }
      .glossary-raw-desc {
        font-size: 16px;
      }
    }
  </style>
</head>
<body class="glossary-raw-page">
  <main class="glossary-raw-wrap">
    <section class="glossary-raw-hero">
      <span class="category-tag tag-glossary">용어집 원문 색인</span>
      <h1>스카우트 용어집 원문 색인</h1>
      <p>검색엔진과 사람, 그리고 외부 도구가 용어집의 원문을 한 번에 읽을 수 있도록 만든 공개 색인 페이지입니다. 한국어·영어·프랑스어 용어와 한국어 설명을 그대로 모아 보여줍니다.</p>
      <div class="glossary-raw-meta">총 ${items.length}개 용어 · 공개 데이터 원문 보기 · 업데이트 ${escapeHtml(new Date().toISOString().slice(0, 10))}</div>
      <div class="glossary-raw-links">
        <a href="/glossary">일반 용어집 보기</a>
        <a href="/api/glossary">공개 JSON API</a>
        <a href="/api/glossary/bot?format=text">텍스트 내보내기</a>
      </div>
    </section>
    <section class="glossary-raw-list">
      ${items.map(renderItemCard).join('\n')}
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

function renderItemCard(item) {
  return `<article class="glossary-raw-card" id="term-${item.id}">
    <h2>${escapeHtml(item.bucket)}</h2>
    <dl>
      <dt>한국어</dt>
      <dd lang="ko">${escapeHtml(item.term_ko || '-')}</dd>
      <dt>English</dt>
      <dd lang="en">${escapeHtml(item.term_en || '-')}</dd>
      <dt>Français</dt>
      <dd lang="fr">${escapeHtml(item.term_fr || '-')}</dd>
    </dl>
    <div class="glossary-raw-desc" lang="ko">${escapeHtml(item.description_ko || '-')}</div>
  </article>`;
}

function inferBucket(termKo) {
  if (!termKo) return '';
  const first = termKo.trim().charAt(0);
  if (!first) return '';
  const code = first.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '';
  const choseongIndex = Math.floor((code - 0xac00) / 588);
  return CHOSEONG_BUCKETS[choseongIndex] || '';
}

function normalizeGlossaryRows(rows) {
  return rows
    .map(function (row) {
      return Object.assign({}, row, {
        bucket: inferBucket(row.term_ko) || row.bucket || '가',
      });
    })
    .sort(function (a, b) {
      var bucketDiff = BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket);
      if (bucketDiff !== 0) return bucketDiff;
      var sortDiff = (a.sort_order || 0) - (b.sort_order || 0);
      if (sortDiff !== 0) return sortDiff;
      var aTerm = String(a.term_ko || a.term_en || a.term_fr || '');
      var bTerm = String(b.term_ko || b.term_en || b.term_fr || '');
      var termDiff = aTerm.localeCompare(bTerm, 'ko');
      if (termDiff !== 0) return termDiff;
      return (a.id || 0) - (b.id || 0);
    });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
