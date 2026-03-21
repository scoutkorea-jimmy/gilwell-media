import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const MISC_BUCKET = '기타';
const UNMATCHED_BUCKET = '국문 미확정 용어';
const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', MISC_BUCKET, UNMATCHED_BUCKET];
const CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at
      FROM glossary_terms
    `).all();
    const items = normalizeGlossaryRows(results || []);
    return json({ buckets: BUCKETS, items }, 200, {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800',
    });
  } catch (err) {
    console.error('GET /api/glossary error:', err);
    return json({ buckets: BUCKETS, items: [] }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeGlossaryInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);

  try {
    const row = await env.DB.prepare(`
      INSERT INTO glossary_terms (bucket, term_ko, term_en, term_fr, description_ko, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at
    `).bind(
      normalized.bucket,
      normalized.term_ko,
      normalized.term_en,
      normalized.term_fr,
      normalized.description_ko,
      normalized.sort_order
    ).first();
    return json({ item: row }, 201);
  } catch (err) {
    console.error('POST /api/glossary error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeGlossaryInput(body) {
  const requestedBucket = String(body.bucket || '').trim();
  const term_ko = normalizeTermValue(body.term_ko, 120);
  const term_en = normalizeTermValue(body.term_en, 160);
  const term_fr = normalizeTermValue(body.term_fr, 160);
  const description_ko = String(body.description_ko || '').trim().slice(0, 800);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? Math.max(0, Math.min(9999, parseInt(body.sort_order, 10))) : 0;
  const bucket = isMiscTerm(term_ko, term_en, term_fr)
    ? MISC_BUCKET
    : (isUnmatchedTerm(term_ko, term_en, term_fr) ? UNMATCHED_BUCKET : (inferBucket(term_ko) || requestedBucket));
  if (!BUCKETS.includes(bucket)) return { error: '올바른 분류를 선택해주세요' };
  if (!term_ko && !term_en && !term_fr) return { error: '한국어, 영어, 프랑스어 중 하나 이상 입력해주세요' };
  return { bucket, term_ko, term_en, term_fr, description_ko, sort_order };
}

function isNumericStart(value) {
  const first = normalizeTermValue(value, 200).charAt(0);
  return first >= '0' && first <= '9';
}

function isMiscTerm(termKo, termEn, termFr) {
  return isNumericStart(termKo) || isNumericStart(termEn) || isNumericStart(termFr);
}

function isUnmatchedTerm(termKo, termEn, termFr) {
  return !normalizeTermValue(termKo, 200) && (!!normalizeTermValue(termEn, 200) || !!normalizeTermValue(termFr, 200));
}

function inferBucket(termKo) {
  const normalized = normalizeTermValue(termKo, 200);
  if (!normalized) return '';
  const first = normalized.charAt(0);
  if (!first) return '';
  const code = first.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '';
  const choseongIndex = Math.floor((code - 0xac00) / 588);
  return CHOSEONG_BUCKETS[choseongIndex] || '';
}

function normalizeTermValue(value, limit) {
  const raw = String(value || '').trim();
  const normalized = (raw === '-' || raw === '—') ? '' : raw;
  return normalized.slice(0, limit);
}

function normalizeGlossaryRows(rows) {
  return rows
    .map(function (row) {
      return Object.assign({}, row, {
        bucket: isMiscTerm(row.term_ko, row.term_en, row.term_fr)
          ? MISC_BUCKET
          : (isUnmatchedTerm(row.term_ko, row.term_en, row.term_fr)
            ? UNMATCHED_BUCKET
            : (inferBucket(row.term_ko) || row.bucket || '가')),
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
