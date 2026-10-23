import { createWeeklyIssue } from '../functions/_shared/card-news-weekly.js';

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runWeekly(env, new Date(controller.scheduledTime)));
  },
};

export async function runWeekly(env, now) {
  try {
    const result = await createWeeklyIssue(env, { now, origin: env.SITE_ORIGIN || 'https://bpmedia.net' });
    await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('card_news_weekly_status', JSON.stringify({ ...result, ran_at: now.toISOString() })).run();
    return result;
  } catch (error) {
    await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('card_news_weekly_status', JSON.stringify({ status: 'failed', ran_at: now.toISOString(), reason: '자동 제작을 마치지 못했습니다. 최근 기사로 다시 만들어 주세요.' })).run();
    throw error;
  }
}
