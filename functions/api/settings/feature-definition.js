import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { loadFeatureDefinition, DEFAULT_FEATURE_DEFINITION, normalizeFeatureDefinitionContent } from '../../_shared/feature-definition.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const content = await loadFeatureDefinition(env);
    return json({ content }, 200);
  } catch (err) {
    console.error('GET /api/settings/feature-definition error:', err);
    return json({ content: DEFAULT_FEATURE_DEFINITION, error: 'Database error' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  const content = normalizeFeatureDefinitionContent(body && body.content || '').trim();
  if (!content) return json({ error: '기능 정의서 내용이 비어 있습니다.' }, 400);
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'feature_definition'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('feature_definition', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(content).run();
    await recordSettingChange(env, {
      key: 'feature_definition',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/feature-definition',
      message: '기능 정의서 설정 변경',
    });
    return json({ ok: true, content }, 200);
  } catch (err) {
    console.error('PUT /api/settings/feature-definition error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
