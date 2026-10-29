import { settingSnapshot, saveRevisionedSetting } from '../../_shared/rust-server.js';
/**
 * BP미디어 · Contributors Settings
 *
 * GET /api/settings/contributors  ← public, returns contributor list
 * PUT /api/settings/contributors  ← admin only, update list
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const { results } = await settingSnapshot(env, 'contributors');
    const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
    const items = values.contributors ? JSON.parse(values.contributors) : [];
    const revision = parseInt(values.contributors_rev, 10) || 0;
    return json({ items, revision });
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    console.error('GET /api/settings/contributors error:', err);
    return json({ items: [] });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'contributors', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { items, if_revision } = body;
  if (!Array.isArray(items)) {
    return json({ error: '항목 배열을 입력해주세요' }, 400);
  }

  const safe = items
    .map(function (item) {
      const dateVal = String(item.date || '').trim();
      return {
        name: String(item.name || '').trim().slice(0, 60),
        note: String(item.note || '').trim().slice(0, 200),
        date: /^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : '',
      };
    })
    .filter(function (item) { return item.name.length > 0; });

  try {
    const { results } = await settingSnapshot(env, 'contributors');
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const currentRev = rows.contributors_rev ? parseInt(rows.contributors_rev.value, 10) || 0 : 0;
    if (Number.isFinite(if_revision) && parseInt(if_revision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const prev = rows.contributors;
    const nextRev = currentRev + 1;

    const changes = await saveRevisionedSetting(env, 'contributors', currentRev, nextRev, [JSON.stringify(safe)]);
    if (changes !== 1) return json({ error: '동시 변경이 감지되었습니다. 입력을 보존하고 최신 명단을 확인해주세요.' }, 409);
    await recordSettingChange(env, {
      key: 'contributors',
      previousValue: prev && prev.value,
      path: '/api/settings/contributors',
      message: '기고자 설정 변경',
      details: { revision: nextRev, count: safe.length },
    });
    return json({ items: safe, revision: nextRev });
  } catch (err) {
    console.error('PUT /api/settings/contributors error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
