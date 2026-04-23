/**
 * Gilwell Media · /api/admin/presets
 *
 *   GET   — list all presets (3 builtin + owner's custom) [OWNER ONLY]
 *   POST  — create a custom preset (owner only)
 *
 * Custom preset shape matches built-in: { slug, name, description, permissions }.
 * Builtins cannot be overwritten from this endpoint (the slug must be unique
 * and builtin slugs are reserved). Owners can edit/delete customs via
 * /api/admin/presets/:id.
 */
import { requireOwner } from '../../_shared/admin-permissions.js';
import { validatePermissions } from '../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
const BUILTIN_SLUGS = new Set(['writer', 'reader', 'marketing']);

export async function onRequestGet({ request, env }) {
  // Preset catalog exposes every role's permission structure — strictly
  // owner-only to prevent members from enumerating escalation targets.
  const { error } = await requireOwner(request, env);
  if (error) return error;

  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, description, permissions, is_builtin, created_at, updated_at
       FROM admin_user_presets
      ORDER BY is_builtin DESC, id ASC`
  ).all();

  const presets = (results || []).map((row) => shapePreset(row));
  return json({ presets });
}

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const slug = String(body && body.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'slug는 영문 소문자·숫자·하이픈 2~40자여야 합니다.' }, 400);
  }
  if (BUILTIN_SLUGS.has(slug)) {
    return json({ error: '이 slug는 빌트인 프리셋으로 예약되어 있습니다.' }, 409);
  }
  const name = String(body && body.name || '').trim();
  if (!name) return json({ error: '프리셋 이름을 입력해주세요.' }, 400);
  const description = String(body && body.description || '').trim().slice(0, 500);

  const permV = validatePermissions(body && body.permissions);
  if (!permV.ok) return json({ error: permV.error }, 400);

  try {
    await env.DB.prepare(
      `INSERT INTO admin_user_presets (slug, name, description, permissions, is_builtin)
       VALUES (?, ?, ?, ?, 0)`
    ).bind(slug, name, description, JSON.stringify(permV.value)).run();

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_created', level: 'info',
      actor: session.username || 'owner', path: '/api/admin/presets',
      message: `권한 프리셋 생성 — ${slug} (${name})`,
    });

    const row = await env.DB.prepare(
      `SELECT id, slug, name, description, permissions, is_builtin, created_at, updated_at
         FROM admin_user_presets WHERE slug = ?`
    ).bind(slug).first();
    return json({ preset: shapePreset(row) }, 201);
  } catch (err) {
    if (String(err && err.message || '').includes('UNIQUE')) {
      return json({ error: '이미 존재하는 slug입니다.' }, 409);
    }
    console.error('POST /api/admin/presets error:', err);
    return json({ error: '프리셋 생성 중 오류가 발생했습니다.' }, 500);
  }
}

function shapePreset(row) {
  if (!row) return null;
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
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
