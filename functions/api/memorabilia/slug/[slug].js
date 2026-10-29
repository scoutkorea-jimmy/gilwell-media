/**
 * GET /api/memorabilia/slug/:slug — 공개 상세 (공개 항목만)
 */

import { getMemorabiliaBySlug } from '../../../_shared/memorabilia-store.js';
import { queryRust } from '../../../_shared/rust-server.js';

export async function onRequestGet({ request, env, params }) {
  const raw=String(params.slug || '');
  // shortcut: isolated UTF-16 surrogates use the original slug handling.
  if (!/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(raw))) {
    try {
      const response=await queryRust({request,env},'memorabilia-public-slug',{slug:raw});
      if ([200,400,404].includes(response.status)) return response;
    } catch (_) { /* fallback */ }
  }
  const slug = raw.trim().slice(0, 120);
  if (!slug) return json({ error: 'invalid_slug' }, 400);

  const item = await getMemorabiliaBySlug(env.DB, slug, { includeDrafts: false });
  if (!item) return json({ error: 'not_found' }, 404);
  return json({ item }, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800',
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
