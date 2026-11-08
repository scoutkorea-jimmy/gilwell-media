/**
 * GET /api/memorabilia/autocomplete?type=issuer|tag&q=...
 *
 * 관리자 입력 자동완성용. 인증 없이 동작 (도감 항목 자체가 공개되므로 노출 OK).
 */

import { queryRust } from '../../_shared/rust-server.js';

export async function onRequestGet({ request, env }) {
  try {
    const response = await queryRust({request, env}, 'memorabilia-autocomplete', {url:request.url});
    if (!response.ok) throw new Error('Rust autocomplete failed');
    return json(await response.json());
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
