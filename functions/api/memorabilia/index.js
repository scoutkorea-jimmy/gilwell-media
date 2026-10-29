import { queryRust } from '../../_shared/rust-server.js';
/**
 * GET  /api/memorabilia          — 목록 (공개=공개 항목만, 관리자=드래프트 포함)
 * POST /api/memorabilia          — 신규 생성 (관리자 전용)
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import { hasMenuPermission } from '../../_shared/admin-users.js';
import {
  normalizeMemorabiliaInput,
  createMemorabilia,
  loadCategoryMap,
} from '../../_shared/memorabilia-store.js';

const PUBLIC_PAGE_SIZE = 24;
const ADMIN_PAGE_SIZE = 50;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const session = await loadAdminSession(request, env).catch(() => null);
  const isAdmin = !!(session && (session.isOwner || (session.permissions.access_admin && hasMenuPermission(session.permissions, 'memorabilia', 'view'))));
  if (url.searchParams.get('scope') === 'admin' && !isAdmin) return (await gateMenuAccess(request, env, 'memorabilia', 'view')) || json({ error: '관리자 권한을 확인하지 못했습니다. 다시 시도해주세요.' }, 503);
  const includeDrafts = isAdmin && url.searchParams.get('include_drafts') === '1';

  const pageSize = Math.min(
    parseInt(url.searchParams.get('limit') || '', 10) || (isAdmin ? ADMIN_PAGE_SIZE : PUBLIC_PAGE_SIZE),
    100
  );
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  const query = isAdmin && url.searchParams.get('scope') === 'admin' ? String(url.searchParams.get('q') || '').trim().slice(0, 200) : '';
  const pattern = query ? '%' + query.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%' : null;
  const parsedEvent = parseInt(url.searchParams.get('event_id') || '', 10);
  const eventId = Number.isFinite(parsedEvent) ? parsedEvent : null;
  const random = url.searchParams.get('random') === '1';

  try {
    const rust = await queryRust({request, env}, 'memorabilia-list', {includeDrafts, pattern, eventId, random, pageSize, offset});
    if (!rust.ok) throw new Error('Rust memorabilia list failed');
    const {rows:results, total:totalRow} = await rust.json();
    // tags_json (SQLite json array) → string[] 배열로 정규화
    const items = (results || []).map((row) => {
      let tags = [];
      if (row.tags_json) {
        try { tags = JSON.parse(row.tags_json) || []; } catch {}
      }
      const { tags_json, ...rest } = row;
      return { ...rest, tags };
    });

    return json({
      items,
      page,
      page_size: pageSize,
      total: totalRow?.n || 0,
    }, 200, isAdmin ? { 'Cache-Control': 'no-store' } : {});
  } catch (err) {
    console.error('GET /api/memorabilia error:', err);
    return json({ items: [], error: 'list_failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const { errors, input } = normalizeMemorabiliaInput(body || {});
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  // category_id 가 주어졌으면 유효성 체크
  if (input.category_id) {
    const cats = await loadCategoryMap(env.DB);
    if (!cats.byId[input.category_id]) return json({ error: 'invalid_category' }, 400);
  }

  try {
    const session = await loadAdminSession(request, env).catch(() => null);
    const id = await createMemorabilia(env.DB, input, { createdBy: session?.username || null });
    return json({ id }, 201);
  } catch (err) {
    console.error('POST /api/memorabilia error:', err);
    return json({ error: 'create_failed' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
