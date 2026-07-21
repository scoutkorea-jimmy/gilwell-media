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

  // [내부 파일 차단] `wrangler pages deploy .` 는 저장소 루트를 통째로 업로드하므로
  // 개발·운영 파일(규칙 문서, DB 스키마, 배포 스크립트, wrangler.toml 의 D1
  // database_id, 오프라인 분석 산출물의 게시글 덤프)이 공개 URL 로 읽힌다.
  // `.assetsignore` 는 Pages 배포 경로에서 무시되므로(2026-07-21 실측: 배포 후에도
  // 전부 200) 여기서 차단하는 것이 유일하게 검증 가능한 방법이다. next() 보다
  // 먼저 반환해 자산 서빙 자체를 막는다.
  if (isBlockedInternalPath(getPathname(request))) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  const response = await next();
  const pathname = getPathname(request);

  // [card-news] /card-news/:id 는 "자체 포함형 단일 HTML 앱"(인라인 unpacker +
  // Blob + 문서 전체 교체)을 R2 에서 서빙한다. 라우트가 직접 완화 CSP +
  // X-Frame-Options 를 설정하므로 여기서 손대면(HTMLRewriter nonce 주입 + strict
  // CSP 재적용) 앱이 깨진다. 24MB 본문에 HTMLRewriter 스트리밍을 태우는 비용도
  // 피한다. 새 경로라 기존 라우트와 겹치지 않음(dist-homepage 템플릿과 동일 취지).
  if (pathname.startsWith('/card-news/')) return response;

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

// ── 내부 파일 차단 목록 ──────────────────────────────────────────────────
// [!] 여기에 경로를 추가하기 전에 런타임이 그 파일을 fetch 하지 않는지 확인할 것.
//     아래는 "브라우저가 읽어야 하므로 절대 차단하면 안 되는" 경로들이다:
//       /DREAMPATH.md        js/dreampath.js `_renderRulesMarkdown()` 이 fetch
//       /card-news-app/*     functions/card-news/[id].js 가 .jsx 를 직접 참조
//                            (빌드 없음 — @babel/standalone 이 브라우저에서 변환)
//       /dist-homepage/*     js/dreampath.js 가 문서 템플릿을 iframe 으로 로드
//       /data/*              js/kms.js 가 changelog.json 을 fetch
//       /VERSION, /ADMIN_VERSION, /ASSET_VERSION   배포 검증 · 외부 모니터링
const BLOCKED_PREFIXES = [
  '/rules/',
  '/docs/',
  '/db/',
  '/scripts/',
  '/migrations/',
  '/workers/',
  '/tests/',
  '/test-results/',
  '/playwright-report/',
  '/output/',
  '/.git/',
  '/.github/',
  '/.claude/',
  '/.obsidian/',
  '/.wrangler/',
  '/node_modules/',
];

const BLOCKED_FILES = new Set([
  '/claude.md',
  '/agents.md',
  '/readme.md',
  '/dreampath-history.md',
  '/package.json',
  '/package-lock.json',
  '/playwright.config.ts',
  '/deploy.sh',
  '/.gitignore',
  '/.assetsignore',
  '/.dev.vars',
  '/.dev.vars.example',
  '/.ds_store',
]);

// `scripts/audit_public_exposure.mjs` 가 preflight 에서 이 함수를 직접 import 해
// 검증한다 (Pages 는 onRequest* 만 보므로 추가 export 는 런타임에 영향 없음).
export function isBlockedInternalPath(pathname) {
  // 대소문자 무시 — Pages 는 경로를 구분하지만, 차단은 넓게 거는 편이 안전하다.
  const p = String(pathname || '').toLowerCase();
  if (!p || p === '/') return false;
  if (BLOCKED_FILES.has(p)) return true;
  // wrangler.toml / wrangler.publish-due.toml 등 (D1 database_id 노출)
  if (p.startsWith('/wrangler') && p.endsWith('.toml')) return true;
  for (const prefix of BLOCKED_PREFIXES) {
    if (p.startsWith(prefix)) return true;
  }
  return false;
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
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com https://static.cloudflareinsights.com"
    : legacy
    ? "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://adservice.google.com`;
  const scriptSrcElem = template
    ? "script-src-elem 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://esm.sh https://cdnjs.cloudflare.com https://static.cloudflareinsights.com"
    : legacy
    ? "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://t1.kakaocdn.net https://t1.daumcdn.net https://static.cloudflareinsights.com"
    : "";

  // Style policy is left as-is — inline `style="..."` attributes are sprinkled
  // throughout the markup (both admin and public) and tightening style-src
  // would break layout. Low priority compared to script-src.
  // fonts.googleapis.com is added for @import of Google Sans Flex / Noto Sans.
  const styleSrc = "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com";

  return [
    "default-src 'self'",
    scriptSrc,
    scriptSrcElem,
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
    // ep1.adtrafficquality.google 은 AdSense 의 Sodar(무효 트래픽·광고 품질 측정)
    // 설정 요청지다. 없으면 매 공개 페이지에서 CSP 위반이 콘솔에 쌓여 스모크
    // 테스트가 상시 실패하고, 진짜 회귀가 그 노이즈에 묻힌다. 광고 표시 자체는
    // 이것 없이도 되지만 품질 측정 신호가 빠진다. 실제로 관측된 도메인만 넣는다
    // (ep2 등은 관측되면 그때 추가).
    "connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://nominatim.openstreetmap.org https://challenges.cloudflare.com https://cloudflareinsights.com https://display.ad.daum.net https://t1.daumcdn.net https://t1.kakaocdn.net https://serv.ds.kakao.com https://*.onkakao.net https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://csi.gstatic.com https://ep1.adtrafficquality.google",
    // Kakao ad iframes are served from t1.kakaocdn.net. AdSense ad iframes from
    // googleads.g.doubleclick.net / tpc.googlesyndication.com / www.google.com.
    "frame-src 'self' https://www.youtube-nocookie.com https://www.openstreetmap.org https://challenges.cloudflare.com https://t1.daumcdn.net https://display.ad.daum.net https://t1.kakaocdn.net https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
    "media-src 'self' data: https:",
    "object-src 'none'",
    "base-uri 'self'",
    // sharer.kakao.com: Kakao Share SDK(sendScrap/sendDefault)는 숨김 <form>을
    // sharer.kakao.com 으로 POST 제출해 공유 팝업을 띄운다. 'self' 만으로는 이
    // 제출이 차단되어 공유 팝업이 빈 화면으로 뜬다(성공 토스트만 표시).
    "form-action 'self' https://sharer.kakao.com",
    template ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  ].filter(Boolean).join('; ');
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
