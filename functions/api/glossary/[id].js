import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

export async function onRequestPut({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
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
      SET bucket = ?, term_ko = ?, term_en = ?, term_fr = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING id, bucket, term_ko, term_en, term_fr, sort_order, created_at, updated_at
    `).bind(
      normalized.bucket,
      normalized.term_ko,
      normalized.term_en,
      normalized.term_fr,
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
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
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
  const bucket = String(body.bucket || '').trim();
  const term_ko = String(body.term_ko || '').trim().slice(0, 120);
  const term_en = String(body.term_en || '').trim().slice(0, 160);
  const term_fr = String(body.term_fr || '').trim().slice(0, 160);
  const sort_order = Number.isFinite(Number(body.sort_order)) ? Math.max(0, Math.min(9999, parseInt(body.sort_order, 10))) : 0;
  if (!BUCKETS.includes(bucket)) return { error: '올바른 분류를 선택해주세요' };
  if (!term_ko || !term_en || !term_fr) return { error: '한국어, 영어, 프랑스어를 모두 입력해주세요' };
  return { bucket, term_ko, term_en, term_fr, sort_order };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
