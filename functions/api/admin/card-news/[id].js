/**
 * /api/admin/card-news/:id  — 카드뉴스 단건 (관리자 전용)
 *
 *   GET     데이터(tweaks JSON) 조회   gateMenuAccess('card-news','view')
 *   PUT     데이터 저장(에디터→서버)   gateMenuAccess('card-news','write')
 *   DELETE  단건 삭제                  gateMenuAccess('card-news','write')
 *
 * 저장 모델: 카드뉴스 본문은 D1 card_news.data(tweaks JSON: 호 설정 + articles[]).
 * 카드 편집은 이 data 만 갱신하며 원본 게시글(posts)은 절대 건드리지 않는다.
 * (legacy: 업로드 방식으로 만든 행은 r2_key 를 가질 수 있고, 삭제 시 R2 객체도 정리)
 */
import { queryRust } from '../../../_shared/rust-server.js';
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { WEEKLY_TEMPLATE, withSelection, cleanPhotoViews, cleanWeeklyDesign } from '../../../_shared/card-news-weekly.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

const MAX_DATA_BYTES = 2 * 1024 * 1024; // tweaks JSON 상한(이미지는 URL 참조라 작음)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
  });
}

export async function onRequestGet({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;
  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return json({ error: 'invalid_id', reason: '잘못된 카드뉴스 ID 입니다.' }, 400);
  try {
    const { row } = await cardOperation(request, env, {operation:'detail', id});
    if (!row) return json({ error: 'not_found', reason: '카드뉴스를 찾을 수 없습니다.' }, 404);
    let data = {};
    try { data = JSON.parse(row.data || '{}'); } catch (_) { data = {}; }
    return json({
      id: row.id, title: row.title, slug: row.slug, data,
      published: !!row.published, created_at: row.created_at, updated_at: row.updated_at,
    });
  } catch (err) {
    console.error('GET /api/admin/card-news/:id error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestPut({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;
  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return json({ error: 'invalid_id', reason: '잘못된 카드뉴스 ID 입니다.' }, 400);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'invalid_json', reason: '요청 본문이 JSON 형식이 아닙니다.' }, 400); }
  const { row } = await cardOperation(request, env, {operation:'edit-source', id});
  if (!row) return json({ error: 'not_found', reason: '카드뉴스를 찾을 수 없습니다.' }, 404);
  let previous = {};
  try { previous = JSON.parse(row.data || '{}'); } catch {}
  if (previous.template === WEEKLY_TEMPLATE) {
    if (body?.expected_revision !== previous.revision) return json({ error: 'version_mismatch', reason: '다른 곳에서 저장한 내용이 있습니다. 새로고침한 뒤 다시 살펴봐 주세요.' }, 409);
    if (!body.weekly || typeof body.weekly !== 'object' || Array.isArray(body.weekly)) return json({ error: 'invalid_weekly', reason: '저장할 카드뉴스 정보를 다시 확인해 주세요.' }, 400);
    let next;
    try {
      next = withSelection(previous, body.weekly.selected_ids === undefined ? previous.articles.map(article => article.id) : body.weekly.selected_ids);
      if (body.weekly.photo_views !== undefined) next.photo_views = cleanPhotoViews(body.weekly.photo_views);
      if (body.weekly.design !== undefined) next.design = cleanWeeklyDesign(body.weekly.design, previous.candidates);
      next.revision = previous.revision + 1;
      next.auto_publish = false;
    } catch (error) { return json({ error: 'invalid_weekly', reason: error.message }, 400); }
    const serialized = JSON.stringify(next);
    const changed = await cardOperation(request, env, {operation:'weekly-update', id, data:serialized, size:serialized.length, expected:row.data});
    if (!changed.changes) return json({ error: 'version_mismatch', reason: '저장 중 새 변경이 확인됐습니다. 내용을 다시 불러와 주세요.' }, 409);
    await recordSettingChange(env, { key: 'card_news', path: '/api/admin/card-news/' + id, previousValue: row.data, message: '주간 카드뉴스의 기사와 디자인을 저장했습니다.', details: { id } }).catch(() => {});
    return json({ ok: true, id, revision: next.revision });
  }
  const data = body && body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ error: 'invalid_data', reason: '저장할 카드뉴스 데이터가 올바르지 않습니다.' }, 400);
  }
  let serialized;
  try { serialized = JSON.stringify(data); } catch (_) { return json({ error: 'invalid_data', reason: '데이터 직렬화에 실패했습니다.' }, 400); }
  if (serialized.length > MAX_DATA_BYTES) {
    return json({ error: 'too_large', reason: '카드뉴스 데이터가 너무 큽니다. 이미지는 업로드 URL 로 참조하세요.' }, 413);
  }

  // 제목 자동 동기화: 표지(발행일+주차)로 파생 → "BP미디어 카드뉴스 — YYYY.MM W주차".
  // 표지를 바꾸면 목록 제목도 자동으로 따라온다. (index.js deriveCardNewsTitle 과 동일 규칙)
  const ymM = String(data.issueDate || '').match(/^(\d{4})\.(\d{2})/);
  const wkM = String(data.weekLabel || '').match(/(\d+)\s*주차/);
  const titleFromData = (ymM && wkM)
    ? `BP미디어 카드뉴스 — ${ymM[1]}.${ymM[2]} ${wkM[1]}주차`
    : (typeof body.title === 'string' && body.title.trim() ? body.title.trim()
      : (typeof data.issueNo === 'string' && data.issueNo.trim() ? data.issueNo.trim() : null));

  try {
    const result = await cardOperation(request, env, {operation:'update', id, data:serialized, title:titleFromData});
    if (!result.changes) return json({ error: 'not_found', reason: '카드뉴스를 찾을 수 없습니다.' }, 404);
    await recordSettingChange(env, {
      key: 'card_news',
      path: `/api/admin/card-news/${id}`,
      message: `카드뉴스 편집 저장: #${id}`,
      details: { id, bytes: serialized.length },
    }).catch(() => {});
    return json({ ok: true, id, bytes: serialized.length });
  } catch (err) {
    console.error('PUT /api/admin/card-news/:id error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;

  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return json({ error: 'invalid_id', reason: '잘못된 카드뉴스 ID 입니다.' }, 400);

  try {
    const { row } = await cardOperation(request, env, {operation:'delete-source', id});
    if (!row) return json({ error: 'not_found', reason: '카드뉴스를 찾을 수 없습니다.' }, 404);

    if (row.r2_key && env.POST_IMAGES && typeof env.POST_IMAGES.delete === 'function') {
      try { await env.POST_IMAGES.delete(row.r2_key); } catch (err) {
        console.error('card-news R2 delete failed:', err);
        return json({ error: 'store_failed', reason: 'R2 객체 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502);
      }
    }

    await cardOperation(request, env, {operation:'delete', id});
    await recordSettingChange(env, {
      key: 'card_news',
      path: `/api/admin/card-news/${id}`,
      message: `카드뉴스 삭제: ${row.title}`,
      details: { id, r2_key: row.r2_key },
    }).catch(() => {});
    return json({ ok: true, id });
  } catch (err) {
    console.error('DELETE /api/admin/card-news/:id error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}

async function cardOperation(request, env, options) {
  const response = await queryRust({request, env}, 'card-news-admin', options);
  if (!response.ok) throw new Error('Rust card news operation failed');
  return response.json();
}
