import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { DEFAULT_FEATURE_DEFINITION, normalizeFeatureDefinitionContent, isLegacyFeatureDefinition } from '../../_shared/feature-definition.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const [snapshot, updatedRow] = await Promise.all([
      env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('feature_definition', 'feature_definition_rev')`).all(),
      env.DB.prepare(
        `SELECT saved_at FROM settings_history WHERE key = 'feature_definition' ORDER BY saved_at DESC LIMIT 1`
      ).first().catch(() => null),
    ]);
    const values = Object.fromEntries((snapshot.results || []).map((row) => [row.key, row.value]));
    const stored = normalizeFeatureDefinitionContent(values.feature_definition || '');
    const content = isLegacyFeatureDefinition(stored) ? DEFAULT_FEATURE_DEFINITION : stored;
    const updated_at = updatedRow && updatedRow.saved_at ? String(updatedRow.saved_at) : null;
    return json({ content, updated_at, revision: parseInt(values.feature_definition_rev, 10) || 0 }, 200);
  } catch (err) {
    console.error('GET /api/settings/feature-definition error:', err);
    return json({ content: DEFAULT_FEATURE_DEFINITION, error: 'Database error' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  // 보안: 운영 원본(KMS) 편집은 write 권한 필수. 과거 'view' 로 게이팅돼 보기 권한만 있는
  // 멤버가 KMS 를 수정할 수 있었던 결함 교정. write 액션은 분당 60회 rate-limit 도 함께 적용된다.
  const __gate = await gateMenuAccess(request, env, 'kms', 'write'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  const content = normalizeFeatureDefinitionContent(body && body.content || '').trim();
  if (!content) return json({ error: '기능 정의서 내용이 비어 있습니다.' }, 400);
  try {
    const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('feature_definition', 'feature_definition_rev')`).all();
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const prevRow = rows.feature_definition;
    const revision = rows.feature_definition_rev ? parseInt(rows.feature_definition_rev.value, 10) || 0 : 0;
    if (!Number.isInteger(body.if_revision) || body.if_revision !== revision) {
      return json({ error: '다른 변경이 감지되었습니다. 입력을 보존하고 최신 운영 기준을 다시 확인해주세요.', revision }, 409);
    }
    const writes = await env.DB.batch([
      env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('feature_definition_rev', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`).bind(String(revision + 1), revision),
      env.DB.prepare(`INSERT INTO settings (key, value) SELECT 'feature_definition', ? WHERE changes() = 1
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(content),
    ]);
    if (!writes[0] || !writes[0].meta || writes[0].meta.changes !== 1) {
      return json({ error: '동시 수정이 감지되었습니다. 입력을 보존하고 최신 운영 기준을 다시 확인해주세요.', revision }, 409);
    }
    await recordSettingChange(env, {
      key: 'feature_definition',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/feature-definition',
      message: '기능 정의서 설정 변경',
    });
    return json({ ok: true, content, revision: revision + 1 }, 200);
  } catch (err) {
    console.error('PUT /api/settings/feature-definition error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
