/**
 * GET  /api/memorabilia/events           — 공개+관리자 (활성 행사 목록)
 * POST /api/memorabilia/events           — 행사 생성 (admin write)
 *
 * 응답: { items: [{id, slug, name_en, name_ko, start_year, …, period_text, usage_count, …}] }
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { listEvents, createEvent, normalizeEventInput } from '../../_shared/memorabilia-events.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('include_archived') === '1';
  try {
    const items = await listEvents(env.DB, { archived: includeArchived });
    return json({ items });
  } catch (err) {
    console.error('GET /api/memorabilia/events error:', err);
    return json({ items: [], error: 'list_failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { errors, input } = normalizeEventInput(body || {});
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  try {
    const id = await createEvent(env.DB, input);
    return json({ id }, 201);
  } catch (err) {
    console.error('POST /api/memorabilia/events error:', err);
    return json({ error: 'create_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
