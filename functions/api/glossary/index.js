import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { normalizeGlossaryInput } from '../../_shared/glossary-buckets.mjs';
import { runGlossary } from '../../_shared/rust-server.js';

export const onRequestGet = runGlossary;

export async function onRequestPost(context) {
  const { request, env } = context;
  const __gate = await gateMenuAccess(request, env, 'glossary', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeGlossaryInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);

  return runGlossary(context, normalized);
}

function json(data, status = 200, extraHeaders = {}) {
  // CORS headers are applied globally by functions/api/_middleware.js.
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
    }, extraHeaders),
  });
}
