/**
 * Gilwell Media · API Middleware
 * Runs for every request under /api/*.
 * Adds CORS headers and handles OPTIONS preflight.
 */
export async function onRequest(context) {
  const { request, next } = context;

  // Handle CORS preflight immediately — no auth needed
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Continue to the actual route handler
  const response = await next();

  // Mutate the original response so Set-Cookie headers survive intact.
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    response.headers.set(k, v);
  }
  return response;
}

function corsHeaders(request) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  const allowOrigin = getAllowedOrigin(request);
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const allowedHosts = new Set([
      requestUrl.hostname,
      'bpmedia.net',
      'www.bpmedia.net',
    ]);
    return allowedHosts.has(originUrl.hostname) ? origin : '';
  } catch {
    return '';
  }
}
