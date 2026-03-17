import { extractToken, safeCompare } from '../../_shared/auth.js';

const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

export async function onRequestGet({ request, env }) {
  const botToken = resolveBotToken(request);
  if (!env.GLOSSARY_BOT_TOKEN) {
    return json({ error: 'Server not configured. Set GLOSSARY_BOT_TOKEN secret.' }, 500);
  }
  if (!botToken || !safeCompare(botToken, env.GLOSSARY_BOT_TOKEN)) {
    return json({ error: '이 엔드포인트는 인증된 봇 전용입니다.' }, 401, {
      'WWW-Authenticate': 'Bearer realm="bpmedia-glossary-bot"',
    });
  }

  const format = String(new URL(request.url).searchParams.get('format') || 'json').trim().toLowerCase();

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at
      FROM glossary_terms
    `).all();
    const items = normalizeGlossaryRows(results || []).map(function (item) {
      return {
        id: item.id,
        bucket: item.bucket,
        term_ko: item.term_ko,
        term_en: item.term_en,
        term_fr: item.term_fr,
        description_ko: item.description_ko,
        search_text: [item.term_ko, item.term_en, item.term_fr, item.description_ko].filter(Boolean).join(' | '),
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    if (format === 'txt' || format === 'text') {
      return new Response(renderText(items), {
        status: 200,
        headers: baseHeaders({
          'Content-Type': 'text/plain; charset=utf-8',
        }),
      });
    }

    return json({
      source: 'BP미디어 스카우트 용어집',
      audience: 'authorized-bots-only',
      generated_at: new Date().toISOString(),
      buckets: BUCKETS,
      count: items.length,
      items,
    }, 200);
  } catch (err) {
    console.error('GET /api/glossary/bot error:', err);
    return json({ error: '용어집 데이터를 불러오지 못했습니다.' }, 500);
  }
}

function resolveBotToken(request) {
  const bearer = extractToken(request);
  if (bearer) return bearer;
  const headerToken = request.headers.get('X-BP-Bot-Token') || '';
  return String(headerToken).trim();
}

function renderText(items) {
  return items.map(function (item) {
    return [
      '[' + item.bucket + ']',
      'KO: ' + String(item.term_ko || '-'),
      'EN: ' + String(item.term_en || '-'),
      'FR: ' + String(item.term_fr || '-'),
      'DESC: ' + String(item.description_ko || '-'),
      '',
    ].join('\n');
  }).join('\n');
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

function baseHeaders(extraHeaders = {}) {
  return Object.assign({
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Vary': 'Authorization, X-BP-Bot-Token',
  }, extraHeaders);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: baseHeaders(Object.assign({ 'Content-Type': 'application/json' }, extraHeaders)),
  });
}
