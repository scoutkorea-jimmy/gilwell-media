/**
 * Gilwell Media · Root middleware — CSP nonce injector
 *
 * Runs for every request to the Pages project. For HTML responses it:
 *   1. Generates a per-request random nonce.
 *   2. Uses HTMLRewriter to stamp `nonce="$NONCE"` on every <script> element
 *      so inline scripts & nonced CDN scripts can execute under the stricter
 *      policy.
 *   3. Sets a tight Content-Security-Policy whose script-src is nonce-based
 *      and uses `'strict-dynamic'`. 'unsafe-inline' is deliberately omitted —
 *      CSP3 browsers ignore it whenever a nonce is present anyway.
 *
 * Admin pages (/admin, /admin.html, /kms, /kms.html) still carry a handful of
 * legacy inline event handlers (onclick="V3.openWrite()" etc.), so we fall
 * back to the legacy 'unsafe-inline' policy there until those handlers are
 * migrated. Nonce enforcement for the admin surface is tracked as a follow-up.
 *
 * Non-HTML responses (JS, CSS, JSON, images, etc.) pass through untouched so
 * API latency and static asset caching are unaffected.
 */

export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();
  const pathname = getPathname(request);

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('text/html')) {
    return response;
  }

  const nonce = generateNonce();

  const rewritten = new HTMLRewriter()
    .on('script', {
      element(el) {
        el.setAttribute('nonce', nonce);
      },
    })
    .transform(response);

  const headers = new Headers(rewritten.headers);
  headers.set('Content-Security-Policy', buildCsp(request, nonce));
  if (isDreampathTemplatePath(pathname)) {
    headers.set('X-Frame-Options', 'SAMEORIGIN');
  }
  headers.set('Vary', appendVary(headers.get('Vary'), 'Cookie'));

  // Cache-Control:
  //   - Admin/KMS/Dreampath (인증 표면): 'no-store' 유지 — 강제 재로그인/세션 보안상
  //     캐시·bfcache 모두 금지해야 한다(CLAUDE.md §3 Admin 권한 게이팅).
  //   - 공개 사이트: 'private, no-cache' — 공유(CDN) 캐시는 막아 per-request nonce
  //     누출을 방지하되, 'no-store' 가 아니므로 브라우저 bfcache(뒤로/앞으로 즉시
  //     복원)는 살아난다. bfcache 는 사용자가 이미 받은 페이지 인스턴스(이미 실행된
  //     스크립트 + 일치하는 nonce)를 그대로 복원하므로 nonce 불일치 위험이 없다.
  //     'no-cache' 라 실제 네비게이션 시에는 매번 Worker 재실행(새 nonce) 후 응답.
  //     [2026-06-06] 전 HTML 'no-store' 가 bfcache 를 죽여 전반적 반응성/뒤로가기
  //     체감 저하를 유발하던 회귀를 교정 (00.128.00 도입분).
  let cachePathname = '/';
  try { cachePathname = new URL(request.url).pathname; } catch {}
  headers.set(
    'Cache-Control',
    isLegacyInlinePath(cachePathname) ? 'no-store' : 'private, no-cache'
  );

  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}

function generateNonce() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let bin = '';
  for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// [CASE STUDY 2026-04-24 — Dreampath sidebar total outage]
// Symptom: Every onclick on /dreampath silently died — sidebar, toolbar,
//          modal triggers, calendar cells all unresponsive.
// Root cause: When a nonce is present, CSP3 browsers ignore 'unsafe-inline'.
//             This function allowlisted /admin and /kms but NOT /dreampath,
//             so Dreampath's DP.* inline onclick (by design — see
//             DREAMPATH.md Section 2.2) was blocked.
// Lesson: Any new route that depends on inline event handlers MUST also
//         be added here. Dreampath, Admin, KMS, and future sibling apps
//         share this contract. Removing /dreampath from this list will
//         reproduce the P0 outage instantly.
// Ref: DREAMPATH-HISTORY.md → 2026-04-24 · A, commit 111415d.
function isLegacyInlinePath(pathname) {
  if (!pathname) return false;
  // Admin / KMS / Dreampath surfaces still carry inline onclick/onmousedown
  // handlers (by design for Dreampath's DP.* IIFE pattern — see
  // DREAMPATH.md Section 2.2), so they run under the legacy 'unsafe-inline'
  // policy. Nonce enforcement on admin/kms is tracked as a follow-up;
  // Dreampath stays on inline handlers permanently (closed surface: auth
  // required + X-Frame-Options DENY + no external inline-injection vector).
  if (pathname === '/admin' || pathname === '/admin.html') return true;
  if (pathname === '/kms' || pathname === '/kms.html') return true;
  if (pathname === '/dreampath' || pathname === '/dreampath.html') return true;
  // [CASE STUDY 2026-04-24 — /dreampath-v2 staging route RETIRED]
  // The /dreampath-v2 alias was the staging home of the new design system
  // while /dreampath still served the legacy UI. After cutover + a
  // release of verification (v01.051 → v01.053) the v2 route + source
  // files were deleted. Leaving this note so a future grep finds the
  // history; the allowlist entry is gone.
  // Ref: DREAMPATH-HISTORY.md 2026-04-24 · F (staging), v01.054 (retire).
  if (pathname.startsWith('/admin/') || pathname.startsWith('/kms/')) return true;
  return false;
}

function isDreampathTemplatePath(pathname) {
  return String(pathname || '').startsWith('/dist-homepage/');
}

function buildCsp(request, nonce) {
  const pathname = getPathname(request);

  const legacy = isLegacyInlinePath(pathname);
  const template = isDreampathTemplatePath(pathname);

  // Script policy:
  //   - Public site: nonce + strict-dynamic. 'unsafe-inline' omitted — CSP3
  //     browsers ignore it when a nonce is present anyway. Host allowlists
  //     (cdn.jsdelivr.net etc.) are also largely ignored under
  //     'strict-dynamic', but we keep them for older browsers that don't
  //     understand 'strict-dynamic'.
  //   - Admin/KMS: legacy 'unsafe-inline' until every inline handler in
  //     admin.html is migrated.
  const scriptSrc = template
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com"
    : legacy
    ? "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://adservice.google.com`;

  // Style policy is left as-is — inline `style="..."` attributes are sprinkled
  // throughout the markup (both admin and public) and tightening style-src
  // would break layout. Low priority compared to script-src.
  // fonts.googleapis.com is added for @import of Google Sans Flex / Noto Sans.
  const styleSrc = "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com";

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: https:",
    // fonts.gstatic.com is where Google Fonts actually serves .woff2 files.
    "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
    // Kakao AdFit SDK fetches ad banners from serv.ds.kakao.com, health-reports
    // to *.onkakao.net, and loads aux assets from t1.kakaocdn.net.
    // cdn.jsdelivr.net 은 DOMPurify sourcemap(.map) 요청 때문에 필요. script-src에는
    // 이미 있지만 sourcemap은 brower devtools가 fetch로 가져와 connect-src 적용을 받는다.
    // unpkg.com 도 동일 이유 (leaflet.js.map). leaflet 자체는 script-src 로 통과.
    // Google AdSense beacons/config: pagead2 + googleads doubleclick + csi.gstatic.
    "connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://nominatim.openstreetmap.org https://challenges.cloudflare.com https://cloudflareinsights.com https://display.ad.daum.net https://t1.daumcdn.net https://t1.kakaocdn.net https://serv.ds.kakao.com https://*.onkakao.net https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://csi.gstatic.com",
    // Kakao ad iframes are served from t1.kakaocdn.net. AdSense ad iframes from
    // googleads.g.doubleclick.net / tpc.googlesyndication.com / www.google.com.
    "frame-src 'self' https://www.youtube-nocookie.com https://www.openstreetmap.org https://challenges.cloudflare.com https://t1.daumcdn.net https://display.ad.daum.net https://t1.kakaocdn.net https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
    "media-src 'self' data: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    template ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  ].join('; ');
}

function getPathname(request) {
  try { return new URL(request.url).pathname; } catch {}
  return '/';
}

function appendVary(existing, extra) {
  const list = String(existing || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.includes(extra)) list.push(extra);
  return list.join(', ');
}
