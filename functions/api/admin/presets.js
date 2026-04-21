/**
 * Gilwell Media · GET /api/admin/presets
 *
 * Phase 1 (read-only). Returns the permission preset catalog — 3 built-in
 * (글쟁이·뷰어·마케팅 담당) plus any owner-authored custom presets stored in
 * admin_user_presets. Phase 3 adds PUT/DELETE for custom preset authoring.
 *
 * Full admin session required. Available to owner + any member with
 * access_admin so the permission modal can populate its "이 프리셋 적용" picker.
 */
import { extractToken, verifyToken } from '../../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, description, permissions, is_builtin,
            created_at, updated_at
       FROM admin_user_presets
      ORDER BY is_builtin DESC, id ASC`
  ).all();

  const presets = (results || []).map((row) => {
    let parsed;
    try { parsed = JSON.parse(row.permissions || '{}'); } catch { parsed = {}; }
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      is_builtin: row.is_builtin ? true : false,
      permissions: {
        access_admin: !!(parsed && parsed.access_admin),
        permissions: Array.isArray(parsed && parsed.permissions)
          ? parsed.permissions.slice().sort()
          : [],
      },
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  });

  return json({ presets });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
