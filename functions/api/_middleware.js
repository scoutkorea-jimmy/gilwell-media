/**
 * Gilwell Media · API Middleware
 * Runs for every request under /api/*.
 * Adds CORS headers, handles OPTIONS preflight, and enforces a same-origin
 * check on cookie-authenticated mutating requests (CSRF defense).
 */
export async function onRequest(context) {
  const { request, next, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const csrfBlocked = enforceSameOriginForMutations(request);
  if (csrfBlocked) return csrfBlocked;

  const response = await next();

  for (const [k, v] of Object.entries(corsHeaders(request, env))) {
    response.headers.set(k, v);
  }
  return response;
}

// CSRF defense — for cookie-authenticated mutating methods, require the
// request to come from our own origin (or one of the ALLOWED_PROD_HOSTS /
// *.pages.dev preview hosts). Browsers always send Origin or Referer on
// cross-site fetches that carry cookies. Server-to-server clients using
// Bearer tokens (which don't come with cookies anyway) are exempt.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function enforceSameOriginForMutations(request) {
  if (!MUTATING_METHODS.has(request.method)) return null;

  const authHeader = request.headers.get('Authorization') || '';
  const usesBearer = authHeader.trim().toLowerCase().startsWith('bearer ');
  const hasCookie = !!request.headers.get('Cookie');
  // No cookie and not a browser form request — treat as server-to-server.
  if (!hasCookie && !usesBearer) return null;
  // Explicit Bearer flow has its own CSRF resistance (not auto-sent by browsers).
  if (usesBearer && !hasCookie) return null;

  const originHeader = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (!originHeader) {
    // Browsers should always send at least Referer on cookie-carrying POSTs.
    // Missing both means either an ancient client or a CSRF probe — reject.
    return csrfReject('Missing Origin/Referer on cookie-authenticated request.');
  }

  let originHost;
  try {
    originHost = new URL(originHeader).hostname;
  } catch {
    return csrfReject('Malformed Origin/Referer.');
  }

  try {
    const requestHost = new URL(request.url).hostname;
    if (originHost === requestHost) return null;
    if (ALLOWED_PROD_HOSTS.has(originHost)) return null;
    if (PREVIEW_HOST_SUFFIXES.some((suffix) => originHost.endsWith(suffix))) return null;
  } catch {
    return csrfReject('Unable to evaluate request origin.');
  }

  return csrfReject(`Cross-site cookie-authenticated request blocked (origin=${originHost}).`);
}

function csrfReject(reason) {
  return new Response(
    JSON.stringify({ error: '보안 검사에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.' }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Csrf-Reason': reason.slice(0, 120),
      },
    }
  );
}

function corsHeaders(request, env) {
  // Public machine-readable glossary endpoints are intentionally open to any origin
  // so external apps and server-to-server clients can consume the term list without
  // being on the prod allowlist.
  if (isPublicGlossaryEndpoint(request)) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  const allowOrigin = getAllowedOrigin(request, env);
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function isPublicGlossaryEndpoint(request) {
  try {
    return new URL(request.url).pathname.startsWith('/api/glossary');
  } catch {
    return false;
  }
}

const ALLOWED_PROD_HOSTS = new Set(['bpmedia.net', 'www.bpmedia.net']);
const PREVIEW_HOST_SUFFIXES = ['.pages.dev'];

function getAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const host = originUrl.hostname;

    if (host === requestUrl.hostname) return origin;
    if (ALLOWED_PROD_HOSTS.has(host)) return origin;
    if (PREVIEW_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return origin;

    const extra = String((env && env.CORS_EXTRA_ORIGINS) || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (extra.includes(host)) return origin;

    return '';
  } catch (err) {
    console.warn('[CORS] malformed origin:', origin, err?.message);
    return '';
  }
}
