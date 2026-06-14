/**
 * /api/admin/card-news  — 카드뉴스 관리 (관리자 전용)
 *
 *   GET   목록 조회        gateMenuAccess('card-news','view')
 *   POST  업로드 (신규)    gateMenuAccess('card-news','write')
 *
 * 카드뉴스는 24MB 안팎의 "자체 포함형 단일 HTML 앱"(gzip+base64 번들러 산출물)이다.
 * D1 에는 메타데이터만 저장하고, HTML 본문은 R2(POST_IMAGES) `card-news/<slug>.html` 에 둔다.
 * 본문 서빙은 별도 라우트 `functions/card-news/[id].js` 가 완화된 CSP 로 처리한다.
 *
 * 업로드 형식: POST /api/admin/card-news?title=<URL인코딩 제목>
 *   - body = 원문 HTML (Content-Type 무관, 원문 바이트 그대로 R2 에 저장)
 *   - multipart 가 아니라 raw body — 24MB formData 버퍼링/오버헤드 회피
 *
 * 에러 응답: { error: <code>, reason: <한국어 사유> }
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

const MAX_BYTES = 30 * 1024 * 1024; // 30MB — 카드뉴스 번들 여유 한도

const REASONS = {
  bucket_unavailable: '저장소(R2)가 연결돼 있지 않습니다. 운영자에게 알려주세요.',
  missing_title: '제목을 입력해주세요.',
  empty_body: '업로드할 HTML 파일이 비어 있습니다.',
  not_html: 'HTML 파일이 아닙니다. 카드뉴스로 내보낸 .html 파일을 올려주세요.',
  too_large: '파일이 너무 큽니다 (최대 30MB).',
  store_failed: '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  db_error: '데이터베이스 오류가 발생했습니다.',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function errorJson(code, status, extra) {
  const payload = { error: code, reason: REASONS[code] || code };
  if (extra && typeof extra === 'object') Object.assign(payload, extra);
  return json(payload, status);
}

function hasBucket(env) {
  return !!(env && env.POST_IMAGES && typeof env.POST_IMAGES.put === 'function');
}

// 제목 → URL/R2 안전 슬러그(한글 허용) + 짧은 uuid 접미사로 유일성 보장.
function makeSlug(title) {
  const base = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = (crypto.randomUUID().split('-')[0] || 'cn');
  return (base ? base + '-' : 'card-news-') + suffix;
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;
  try {
    const rs = await env.DB.prepare(
      `SELECT id, title, slug, size_bytes, published, created_at, updated_at
         FROM card_news ORDER BY created_at DESC, id DESC`
    ).all();
    const items = (rs && rs.results ? rs.results : []).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      size_bytes: row.size_bytes,
      published: !!row.published,
      created_at: row.created_at,
      updated_at: row.updated_at,
      view_url: `/card-news/${row.id}`,
    }));
    return json({ items });
  } catch (err) {
    console.error('GET /api/admin/card-news error:', err);
    return errorJson('db_error', 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;
  if (!hasBucket(env)) return errorJson('bucket_unavailable', 503);

  const url = new URL(request.url);
  const title = String(url.searchParams.get('title') || '').trim();
  if (!title) return errorJson('missing_title', 400);

  // Content-Length 선검사(있으면) — 큰 본문을 메모리에 올리기 전에 거른다.
  const declaredLen = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declaredLen && declaredLen > MAX_BYTES) {
    return errorJson('too_large', 413, { received_bytes: declaredLen, limit_bytes: MAX_BYTES });
  }

  const buf = await request.arrayBuffer();
  const bytes = buf.byteLength;
  if (!bytes) return errorJson('empty_body', 400);
  if (bytes > MAX_BYTES) {
    return errorJson('too_large', 413, { received_bytes: bytes, limit_bytes: MAX_BYTES });
  }

  // 앞부분만 디코딩해 HTML 인지 가볍게 확인 (전체 24MB 디코딩 회피).
  const head = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf, 0, Math.min(bytes, 1024))).toLowerCase();
  if (!head.includes('<!doctype html') && !head.includes('<html')) {
    return errorJson('not_html', 400);
  }

  const slug = makeSlug(title);
  const r2Key = `card-news/${slug}.html`;
  try {
    await env.POST_IMAGES.put(r2Key, buf, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('card-news R2 put failed:', err);
    return errorJson('store_failed', 502);
  }

  try {
    const res = await env.DB.prepare(
      `INSERT INTO card_news (title, slug, r2_key, size_bytes) VALUES (?, ?, ?, ?)`
    ).bind(title, slug, r2Key, bytes).run();
    const id = res && res.meta ? res.meta.last_row_id : null;
    await recordSettingChange(env, {
      key: 'card_news',
      path: '/api/admin/card-news',
      message: `카드뉴스 업로드: ${title}`,
      details: { id, slug, size_bytes: bytes },
    }).catch(() => {});
    return json({ ok: true, id, title, slug, size_bytes: bytes, view_url: `/card-news/${id}` }, 201);
  } catch (err) {
    console.error('card-news D1 insert failed:', err);
    // D1 실패 시 방금 올린 R2 객체 정리 (고아 방지).
    try { await env.POST_IMAGES.delete(r2Key); } catch (_) {}
    return errorJson('db_error', 500);
  }
}
