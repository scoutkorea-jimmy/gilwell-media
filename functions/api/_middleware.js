/**
 * Gilwell Media · API Middleware
 * Runs for every request under /api/*.
 * Adds CORS headers and handles OPTIONS preflight.
 */
export async function onRequest(context) {
  const { request, next, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const response = await next();

  for (const [k, v] of Object.entries(corsHeaders(request, env))) {
    response.headers.set(k, v);
  }
  return response;
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
