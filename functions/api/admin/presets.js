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
import { queryRust } from '../../_shared/rust-server.js';
import { requireOwner } from '../../_shared/admin-permissions.js';
import { requireOtp } from '../../_shared/otp-session.js';
import { validatePermissionsRust } from '../../_shared/admin-user-validation.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  // Preset catalog exposes every role's permission structure — strictly
  // owner-only to prevent members from enumerating escalation targets.
  const { error } = await requireOwner(request, env);
  if (error) return error;
  const __otp = await requireOtp(request, env); if (__otp) return __otp;

  const response = await queryRust({request, env}, 'preset-catalog', {operation:'list'});
  if (!response.ok) throw new Error('Rust preset list failed');
  const { presets } = await response.json();
  return json({ presets });
}

export async function onRequestPost({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;
  const __otp = await requireOtp(request, env); if (__otp) return __otp;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const normalized = await queryRust({request,env}, 'preset-normalize', {operation:'create',body});
  if (!normalized.ok) throw new Error('Rust preset input validation failed');
  const {slug,name,description,error:inputError,status} = await normalized.json();
  if (inputError) return json({error:inputError},status);

  const permV = await validatePermissionsRust(env, body && body.permissions);
  if (!permV.ok) return json({ error: permV.error }, 400);

  try {
    const response = await queryRust({request, env}, 'preset-catalog', {
      operation:'create', slug, name, description, permissions:JSON.stringify(permV.value),
    });
    if (!response.ok) throw new Error('Rust preset creation failed');
    const { created, preset: row } = await response.json();
    if (!created) return json({ error: '이미 존재하는 slug입니다.' }, 409);

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_preset_created', level: 'info',
      actor: session.username || 'owner', path: '/api/admin/presets',
      message: `권한 프리셋 생성 — ${slug} (${name})`,
    });

    return json({ preset: row }, 201);
  } catch (err) {
    if (String(err && err.message || '').includes('UNIQUE')) {
      return json({ error: '이미 존재하는 slug입니다.' }, 409);
    }
    console.error('POST /api/admin/presets error:', err);
    return json({ error: '프리셋 생성 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
