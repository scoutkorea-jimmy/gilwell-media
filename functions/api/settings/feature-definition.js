import { settingSnapshot, saveRevisionedSetting, queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { DEFAULT_FEATURE_DEFINITION, analyzeFeatureDefinitionRust } from '../../_shared/feature-definition.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const [snapshot, updatedRow] = await Promise.all([
      settingSnapshot(env, 'feature_definition'),
      queryRust({env, request:{url:'https://internal.invalid/'}}, 'feature-history', {}).then(async response => {
        if (!response.ok) throw new Error('Rust feature history query failed');
        return (await response.json()).row;
      }).catch(() => null),
    ]);
    const values = Object.fromEntries((snapshot.results || []).map((row) => [row.key, row.value]));
    const {text:stored,legacy} = await analyzeFeatureDefinitionRust(values.feature_definition || '', env);
    const content = legacy ? DEFAULT_FEATURE_DEFINITION : stored;
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
  const {text} = await analyzeFeatureDefinitionRust(body && body.content || '', env);
  const content = text.trim();
  if (!content) return json({ error: '기능 정의서 내용이 비어 있습니다.' }, 400);
  try {
    const { results } = await settingSnapshot(env, 'feature_definition');
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const prevRow = rows.feature_definition;
    const revision = rows.feature_definition_rev ? parseInt(rows.feature_definition_rev.value, 10) || 0 : 0;
    if (!Number.isInteger(body.if_revision) || body.if_revision !== revision) {
      return json({ error: '다른 변경이 감지되었습니다. 입력을 보존하고 최신 운영 기준을 다시 확인해주세요.', revision }, 409);
    }
    const changes = await saveRevisionedSetting(env, 'feature_definition', revision, revision + 1, [content]);
    if (changes !== 1) {
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
