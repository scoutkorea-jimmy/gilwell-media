/**
 * GET /api/memorabilia/autocomplete?type=issuer|tag&q=...
 *
 * 관리자 입력 자동완성용. 인증 없이 동작 (도감 항목 자체가 공개되므로 노출 OK).
 */

import { suggestIssuers, suggestTags } from '../../_shared/memorabilia-store.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const type = String(url.searchParams.get('type') || 'issuer').trim();
  const q = String(url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '8', 10) || 8, 20);

  try {
    let items = [];
    if (type === 'issuer')   items = await suggestIssuers(env.DB, q, limit);
    else if (type === 'tag') items = await suggestTags(env.DB, q, limit);
    return json({ items });
  } catch (err) {
    console.error('autocomplete error:', err);
    return json({ items: [] }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
