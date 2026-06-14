/**
 * /card-news/:id  — 카드뉴스 React 에디터/미리보기 (관리자 전용)
 *
 * 24MB 베이크 번들을 버리고, 원본 소스(card-news-app/*.jsx)를 CDN 라이브러리로
 * 조립해 네이티브로 렌더한다. 카드 데이터(tweaks JSON)는 D1 card_news.data 에서
 * 읽어 window.TWEAK_DEFAULTS 로 주입한다.
 *
 *   기본            : 에디터(전체 chrome + Tweaks 패널). ?edit=1 → Tweaks 자동 오픈.
 *   ?embed=1        : 클린 임베드(미리보기/홈페이지용 — chrome·Tweaks 제거).
 *
 * 자체 포함형 React 앱(인라인 부트 + Babel-standalone in-browser + blob)이라
 * 사이트 strict CSP 에서 실행 불가 → 완화 CSP 직접 설정. functions/_middleware.js
 * 가 /card-news/ 를 우회시켜 이 헤더가 보존된다.
 */
import { gateMenuAccess } from '../_shared/admin-permissions.js';
import { ASSET_VERSION } from '../_shared/build-version.js';

const CSP = [
  "default-src 'self' blob: data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://unpkg.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
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

// 인라인 <script> 안에 JSON 을 안전하게 박기 위한 직렬화. </script> 조기종료를
// 막도록 < > 만 유니코드 이스케이프(JSON.stringify 결과는 ES2019+ 에서 그대로 유효).
function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderShell({ id, title, data, v, edit }) {
  const a = (p) => `/card-news-app/${p}?v=${v}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title || '카드뉴스')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Archivo+Black&display=swap">
  <link rel="stylesheet" href="${a('styles.css')}">
  <script>
    window.CARD_NEWS_ID = ${Number(id)};
    window.TWEAK_DEFAULTS = ${serializeForScript(data)};
  </script>
</head>
<body>
  <div id="root"></div>

  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>

  <script src="${a('image-slot.js')}"></script>
  <script type="text/babel" data-presets="react" src="${a('tweaks-panel.jsx')}"></script>
  <script type="text/babel" data-presets="react" src="${a('data.jsx')}"></script>
  <script type="text/babel" data-presets="react" src="${a('cards.jsx')}"></script>
  <script type="text/babel" data-presets="react" src="${a('app.jsx')}"></script>
${edit ? `  <script>
    // 에디터 모드: 앱 마운트 후 Tweaks 패널 자동 오픈(호스트 프로토콜 셀프 트리거).
    (function () {
      var tries = 0;
      var t = setInterval(function () {
        window.postMessage({ type: '__activate_edit_mode' }, '*');
        if (++tries > 40) clearInterval(t);
      }, 250);
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === '__edit_mode_available') {
          window.postMessage({ type: '__activate_edit_mode' }, '*');
        }
      });
    })();
  </script>
` : ''}</body>
</html>`;
}

export async function onRequestGet({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;

  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return new Response('잘못된 카드뉴스 ID', { status: 400 });

  const url = new URL(request.url);
  const embed = url.searchParams.get('embed') === '1';
  const edit = url.searchParams.get('edit') === '1';

  let row;
  try {
    row = await env.DB.prepare(`SELECT title, data FROM card_news WHERE id = ?`).bind(id).first();
  } catch (err) {
    console.error('card-news serve D1 error:', err);
    return new Response('데이터베이스 오류', { status: 500 });
  }
  if (!row) return new Response('카드뉴스를 찾을 수 없습니다.', { status: 404 });

  let data = {};
  try { data = JSON.parse(row.data || '{}'); } catch (_) { data = {}; }
  if (!data || typeof data !== 'object') data = {};
  // 에디터에선 전체 chrome + Tweaks, 미리보기(?embed=1)에선 클린 임베드.
  data.embed = embed;

  const html = renderShell({ id, title: row.title, data, v: ASSET_VERSION, edit: edit && !embed });
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Vary': 'Cookie',
    },
  });
}
