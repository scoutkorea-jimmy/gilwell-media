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
  // Keep the request-specific Cache-Control — CSP must not be cached by shared
  // caches because nonce is unique per response.
  headers.set('Vary', appendVary(headers.get('Vary'), 'Cookie'));
  headers.set('Cache-Control', 'no-store');

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

function isLegacyInlinePath(pathname) {
  if (!pathname) return false;
  // Admin and KMS surface still carries inline onclick/ontouchstart/onmousedown
  // handlers, so it runs under the legacy 'unsafe-inline' policy for now.
  if (pathname === '/admin' || pathname === '/admin.html') return true;
  if (pathname === '/kms' || pathname === '/kms.html') return true;
  if (pathname.startsWith('/admin/') || pathname.startsWith('/kms/')) return true;
  return false;
}

function buildCsp(request, nonce) {
  let pathname = '/';
  try { pathname = new URL(request.url).pathname; } catch {}

  const legacy = isLegacyInlinePath(pathname);

  // Script policy:
  //   - Public site: nonce + strict-dynamic. 'unsafe-inline' omitted — CSP3
  //     browsers ignore it when a nonce is present anyway. Host allowlists
  //     (cdn.jsdelivr.net etc.) are also largely ignored under
  //     'strict-dynamic', but we keep them for older browsers that don't
  //     understand 'strict-dynamic'.
  //   - Admin/KMS: legacy 'unsafe-inline' until every inline handler in
  //     admin.html is migrated.
  const scriptSrc = legacy
    ? "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com`;

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
    "connect-src 'self' https://esm.sh https://nominatim.openstreetmap.org https://challenges.cloudflare.com https://cloudflareinsights.com https://display.ad.daum.net https://t1.daumcdn.net https://t1.kakaocdn.net https://serv.ds.kakao.com https://*.onkakao.net",
    // Kakao ad iframes are served from t1.kakaocdn.net.
    "frame-src 'self' https://www.youtube-nocookie.com https://www.openstreetmap.org https://challenges.cloudflare.com https://t1.daumcdn.net https://display.ad.daum.net https://t1.kakaocdn.net",
    "media-src 'self' data: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function appendVary(existing, extra) {
  const list = String(existing || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.includes(extra)) list.push(extra);
  return list.join(', ');
}
