import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { createWeeklyIssue, isoWeekPeriod } from '../../../_shared/card-news-weekly.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;
  return json({ schedule: null, last: null, auto_generate: false, auto_publish: false });
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;
  try {
    let body = {};
    if (request.headers.get('content-type')?.includes('application/json')) {
      try { body = await request.json(); } catch { return json({ error: 'invalid_week', reason: '주차를 확인해 주세요.' }, 400); }
      if (!body || typeof body !== 'object' || typeof body.week !== 'string') return json({ error: 'invalid_week', reason: '주차를 선택해 주세요.' }, 400);
      try { isoWeekPeriod(body.week); } catch (error) { return json({ error: 'invalid_week', reason: error.message }, 400); }
    }
    const result = await createWeeklyIssue(env, { rolling: !body.week, week: body.week || null, origin: new URL(request.url).origin });
    if (result.id) await recordSettingChange(env, { key: 'card_news', path: '/api/admin/card-news/weekly', message: body.week ? '선택한 주차의 카드뉴스를 준비했습니다.' : '최근 한 주의 카드뉴스를 준비했습니다.', details: { id: result.id } });
    return json(result);
  } catch (error) {
    console.error('Weekly card-news preparation failed:', error);
    return json({ error: 'weekly_failed', reason: '카드뉴스를 준비하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 503);
  }
}
