/**
 * /card-news/:id  — 카드뉴스 본문 서빙 (관리자 iframe 임베드용)
 *
 * 카드뉴스는 인라인 unpacker 스크립트 + Blob + 문서 전체 교체로 동작하는
 * "자체 포함형 단일 HTML 앱"이다. 사이트 표준 CSP(nonce/strict-dynamic,
 * unsafe-inline·unsafe-eval 미허용)에서는 절대 실행되지 않으므로, 이 라우트는
 * 완화된 CSP 를 직접 설정하고 `functions/_middleware.js` 가 이 경로(`/card-news/`)
 * 를 건드리지 않도록 우회시켜 둔다(거기서 HTMLRewriter+strict CSP 재적용 방지).
 *
 * 접근 통제: 관리자 전용. iframe 은 same-origin 쿠키를 실어 보내므로
 * gateMenuAccess('card-news','view') 로 게이팅된다. dist-homepage 의 Dreampath
 * 템플릿 앱과 동일한 "완화 CSP + frame-ancestors self" 패턴.
 */
import { gateMenuAccess } from '../_shared/admin-permissions.js';

// 자체 포함형 번들 앱이 필요로 하는 완화 CSP. 관리자 전용 + 신뢰된 업로드라 허용.
const CARD_NEWS_CSP = [
  "default-src 'self' blob: data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://unpkg.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "connect-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

export async function onRequestGet({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;

  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return new Response('잘못된 ID', { status: 400 });

  let row;
  try {
    row = await env.DB.prepare(`SELECT r2_key, title FROM card_news WHERE id = ?`).bind(id).first();
  } catch (err) {
    console.error('card-news serve D1 error:', err);
    return new Response('데이터베이스 오류', { status: 500 });
  }
  if (!row || !row.r2_key) return new Response('카드뉴스를 찾을 수 없습니다.', { status: 404 });

  if (!env.POST_IMAGES || typeof env.POST_IMAGES.get !== 'function') {
    return new Response('저장소(R2)가 연결돼 있지 않습니다.', { status: 503 });
  }
  const object = await env.POST_IMAGES.get(row.r2_key);
  if (!object) return new Response('본문 객체를 찾을 수 없습니다.', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Security-Policy', CARD_NEWS_CSP);
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  // 관리자 인증 표면 — 캐시/bfcache 금지(세션 보안), 검색 비노출.
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Vary', 'Cookie');

  return new Response(object.body, { status: 200, headers });
}
