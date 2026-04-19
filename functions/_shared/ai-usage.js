/**
 * AI 호출 로깅 헬퍼
 * 모든 Workers AI 호출(score-article 등)은 성공/실패 여부와 무관하게
 * ai_usage_log 테이블에 한 행을 append해서 빌링 가시성·남용 감시에 사용한다.
 *
 * 실패는 non-fatal: 로그 실패가 본 API 응답을 막지 않는다.
 */

export async function logAiUsage(env, entry) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT INTO ai_usage_log
        (created_at, endpoint, model, ip, actor,
         input_chars, output_chars, prompt_tokens, completion_tokens, total_tokens,
         latency_ms, status, error_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      Math.floor(Date.now() / 1000),
      String(entry.endpoint || 'unknown'),
      String(entry.model || 'unknown'),
      entry.ip || null,
      entry.actor || null,
      Number(entry.inputChars || 0),
      Number(entry.outputChars || 0),
      entry.promptTokens     != null ? Number(entry.promptTokens)     : null,
      entry.completionTokens != null ? Number(entry.completionTokens) : null,
      entry.totalTokens      != null ? Number(entry.totalTokens)      : null,
      entry.latencyMs        != null ? Number(entry.latencyMs)        : null,
      String(entry.status || 'unknown'),
      entry.errorCode || null
    ).run();
  } catch (_) {
    // 로그 실패는 무시
  }
}
