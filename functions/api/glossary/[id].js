import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const MISC_BUCKET = '기타';
const UNMATCHED_BUCKET = '국문 미확정 용어';
const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', MISC_BUCKET, UNMATCHED_BUCKET];
const CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

export async function onRequestPut({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'Invalid ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeGlossaryInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);

  try {
    const row = await env.DB.prepare(`
      UPDATE glossary_terms
      SET bucket = ?, term_ko = ?, term_en = ?, term_fr = ?, description_ko = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at
    `).bind(
      normalized.bucket,
      normalized.term_ko,
      normalized.term_en,
      normalized.term_fr,
      normalized.description_ko,
      normalized.sort_order,
      id
    ).first();
    if (!row) return json({ error: '항목을 찾을 수 없습니다' }, 404);
    return json({ item: row });
  } catch (err) {
    console.error('PUT /api/glossary/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'Invalid ID' }, 400);
  try {
    await env.DB.prepare(`DELETE FROM glossary_terms WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/glossary/:id error:', err);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
