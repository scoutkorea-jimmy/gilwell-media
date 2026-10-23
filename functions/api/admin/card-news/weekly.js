import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { createWeeklyIssue } from '../../../_shared/card-news-weekly.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;
  const status = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('card_news_weekly_status').first();
  let last = null;
  try { last = JSON.parse(status?.value || 'null'); } catch {}
  return json({ schedule: '매주 월요일 09:00 KST', last, auto_publish: false });
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;
  try {
    const result = await createWeeklyIssue(env, { rolling: true, origin: new URL(request.url).origin });
    if (result.id) await recordSettingChange(env, { key: 'card_news', path: '/api/admin/card-news/weekly', message: '최근 한 주의 카드뉴스를 준비했습니다.', details: { id: result.id } });
    return json(result);
  } catch (error) {
    console.error('Weekly card-news preparation failed:', error);
    return json({ error: 'weekly_failed', reason: '카드뉴스를 준비하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 503);
  }
}
