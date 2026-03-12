/**
 * Gilwell Media · API Middleware
 * Runs for every request under /api/*.
 * Adds CORS headers and handles OPTIONS preflight.
 */
export async function onRequest(context) {
  const { request, next } = context;

  // Handle CORS preflight immediately — no auth needed
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Continue to the actual route handler
  const response = await next();

  // Clone and attach CORS headers to every response
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders())) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
