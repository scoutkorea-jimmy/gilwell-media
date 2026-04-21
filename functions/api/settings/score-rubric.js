import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { loadScoreRubric, normalizeScoreRubric, DEFAULT_SCORE_RUBRIC, RUBRIC_MAX_CHARS } from '../../_shared/score-rubric.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * GET /api/settings/score-rubric
 *   → 인증 불필요 (관리자만 볼 수 있는 관리자 UI 내부에서 쓰지만 공개해도 무방한 기준 텍스트)
 *   반환: { content, isDefault, maxChars }
 * PUT /api/settings/score-rubric
 *   → Full admin 필요. body.content 저장.
 */

export async function onRequestGet({ env }) {
  try {
    const content = await loadScoreRubric(env);
    const isDefault = content === DEFAULT_SCORE_RUBRIC;
    return json({ content, isDefault, maxChars: RUBRIC_MAX_CHARS });
  } catch (_) {
    return json({ content: DEFAULT_SCORE_RUBRIC, isDefault: true, maxChars: RUBRIC_MAX_CHARS, error: 'DB 조회 실패 · 기본값 반환' }, 200);
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: '요청 형식 오류' }, 400); }

  const content = normalizeScoreRubric(body && body.content || '');
  if (!content) return json({ error: '평가 기준이 비어 있습니다. 기본값으로 복원하려면 DELETE를 사용하세요.' }, 400);

  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'score_rubric'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('score_rubric', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(content).run();
    await recordSettingChange(env, {
      key: 'score_rubric',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/score-rubric',
      message: 'AI 채점 평가 기준 변경',
    });
    return json({ ok: true, content, isDefault: content === DEFAULT_SCORE_RUBRIC });
  } catch (err) {
    return json({ error: 'DB 저장 실패', detail: String((err && err.message) || err) }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'score_rubric'`).first();
    await env.DB.prepare(`DELETE FROM settings WHERE key = 'score_rubric'`).run();
    await recordSettingChange(env, {
      key: 'score_rubric',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/score-rubric',
      message: 'AI 채점 평가 기준 기본값 복원',
    });
    return json({ ok: true, content: DEFAULT_SCORE_RUBRIC, isDefault: true });
  } catch (err) {
    return json({ error: 'DB 초기화 실패', detail: String((err && err.message) || err) }, 500);
  }
}
