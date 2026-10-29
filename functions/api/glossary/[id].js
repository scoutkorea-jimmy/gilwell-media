import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { normalizeGlossaryInput } from '../../_shared/glossary-buckets.mjs';
import { runGlossary } from '../../_shared/rust-server.js';

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const __gate = await gateMenuAccess(request, env, 'glossary', 'write'); if (__gate) return __gate
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'Invalid ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeGlossaryInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);

  return runGlossary(context, { ...normalized, expected_updated_at: String(body.expected_updated_at || '') }, id);
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const __gate = await gateMenuAccess(request, env, 'glossary', 'write'); if (__gate) return __gate
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'Invalid ID' }, 400);
  return runGlossary(context, undefined, id);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
