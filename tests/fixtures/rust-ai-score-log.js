/**
 * AI 채점(score-article) 상세 결과 로거.
 *
 * ai_usage_log가 토큰/지연 등 메타 수치만 기록하는 반면,
 * 이 로그는 "무엇을 채점했고 어떤 점수·수정 제안이 나왔는지"를 저장해
 * 관리자 채점 기록 페이지에서 추적할 수 있게 한다.
 *
 * 실패해도 본 응답을 막지 않도록 모든 예외를 삼킨다 — 호출측은
 * ctx.waitUntil(logAiScore(env, entry))로 fire-and-forget 사용 권장.
 */

export async function logAiScore(env, entry) {
  if (!env || !env.DB) return;
  try {
    const categoriesJson = entry.categories
      ? (typeof entry.categories === 'string'
          ? entry.categories
          : JSON.stringify(entry.categories))
      : null;

    await env.DB.prepare(
      `INSERT INTO ai_score_log (
        created_at, actor, ip,
        input_title, input_subtitle, input_body_chars, input_tags,
        overall_score, overall_grade, overall_summary,
        improvement, revision_suggestion, categories_json,
        latency_ms, total_tokens, status, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      Math.floor(Date.now() / 1000),
      entry.actor || null,
      entry.ip || null,
      truncate(entry.inputTitle, 300),
      truncate(entry.inputSubtitle, 500),
      Number.isFinite(Number(entry.inputBodyChars)) ? Number(entry.inputBodyChars) : 0,
      truncate(entry.inputTags, 300),
      Number.isFinite(Number(entry.overallScore)) ? Number(entry.overallScore) : null,
      truncate(entry.overallGrade, 4),
      truncate(entry.overallSummary, 500),
      truncate(entry.improvement, 2000),
      truncate(entry.revisionSuggestion, 2000),
      categoriesJson,
      Number.isFinite(Number(entry.latencyMs)) ? Number(entry.latencyMs) : null,
      Number.isFinite(Number(entry.totalTokens)) ? Number(entry.totalTokens) : null,
      String(entry.status || 'unknown'),
      entry.errorCode || null
    ).run();
  } catch (err) {
    try { console.error('[ai-score-log] insert failed:', (err && err.message) || err); } catch (_) {}
  }
}

function truncate(value, max) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  if (!str) return null;
  return str.length > max ? str.slice(0, max) : str;
}
