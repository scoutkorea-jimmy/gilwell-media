import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, bucket, term_ko, term_en, term_fr, sort_order, created_at, updated_at
      FROM glossary_terms
      ORDER BY CASE bucket
        WHEN '가' THEN 1 WHEN '나' THEN 2 WHEN '다' THEN 3 WHEN '라' THEN 4
        WHEN '마' THEN 5 WHEN '바' THEN 6 WHEN '사' THEN 7 WHEN '아' THEN 8
        WHEN '자' THEN 9 WHEN '차' THEN 10 WHEN '카' THEN 11 WHEN '타' THEN 12
        WHEN '파' THEN 13 WHEN '하' THEN 14 ELSE 99 END,
        sort_order ASC,
        term_ko COLLATE NOCASE ASC,
        id ASC
    `).all();
    return json({ buckets: BUCKETS, items: results || [] }, 200, {
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
      INSERT INTO glossary_terms (bucket, term_ko, term_en, term_fr, sort_order)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, bucket, term_ko, term_en, term_fr, sort_order, created_at, updated_at
    `).bind(
      normalized.bucket,
      normalized.term_ko,
      normalized.term_en,
      normalized.term_fr,
      normalized.sort_order
    ).first();
    return json({ item: row }, 201);
  } catch (err) {
    console.error('POST /api/glossary error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeGlossaryInput(body) {
  const bucket = String(body.bucket || '').trim();
  const term_ko = String(body.term_ko || '').trim().slice(0, 120);
  const term_en = String(body.term_en || '').trim().slice(0, 160);
  const term_fr = String(body.term_fr || '').trim().slice(0, 160);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? Math.max(0, Math.min(9999, parseInt(body.sort_order, 10))) : 0;
  if (!BUCKETS.includes(bucket)) return { error: '올바른 분류를 선택해주세요' };
  if (!term_ko && !term_en && !term_fr) return { error: '한국어, 영어, 프랑스어 중 하나 이상 입력해주세요' };
  return { bucket, term_ko, term_en, term_fr, sort_order };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
