/**
 * AI 호출 로깅 헬퍼 + Llama 토큰/비용 추정
 *
 * Cloudflare Workers AI 응답에 usage 메타가 없는 경우에도 글자수 기반으로
 * 토큰 수를 대략 산출해 ai_usage_log에 기록한다. 정확한 청구는 CF 대시보드
 * neuron 기준을 따르고, 본 값은 사용 경향·남용 감시용 추정치다.
 *
 * 로깅은 non-fatal: 실패해도 본 API 응답을 막지 않는다.
 * 호출자는 `ctx.waitUntil(logAiUsage(...))`로 fire-and-forget 사용 권장.
 */

/**
 * Llama-3 계열 모델 토큰 수 대략 추정.
 *   - 한글 중심:   1자 ≈ 0.70 token
 *   - 영문 중심:   1자 ≈ 0.25 token
 *   - BP미디어 혼합비(한글 ≈ 70%): 1자 ≈ 0.55 token 사용
 * SentencePiece/BPE 토크나이저 특성상 완전 정확하지 않으나 사용 경향 파악에는 충분.
 */
export function estimateLlamaTokens(chars) {
  const n = Number(chars || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 0.55);
}

/**
 * Cloudflare Workers AI — @cf/meta/llama-3.1-8b-instruct 공시 단가 (2025-Q1 기준, USD).
 *   - Input  : $0.000011 / 1K tokens  (≈ $0.011 / 1M)
 *   - Output : $0.000012 / 1K tokens  (≈ $0.012 / 1M)
 * 단순화 위해 합산 평균 $0.0115 / 1K tokens로 반올림 사용.
 * 환율은 기본 1 USD = 1,360 KRW (단가성 고지용 근사치).
 */
const LLAMA_USD_PER_1K_TOKENS = 0.0115;
const USD_TO_KRW = 1360;

export function estimateLlamaCostUsd(tokens) {
  const n = Number(tokens || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return +(n * LLAMA_USD_PER_1K_TOKENS / 1000).toFixed(6);
}

export function estimateLlamaCostKrw(tokens) {
  return Math.round(estimateLlamaCostUsd(tokens) * USD_TO_KRW);
}

export const LLAMA_PRICING = {
  model: '@cf/meta/llama-3.1-8b-instruct',
  usdPer1kTokens: LLAMA_USD_PER_1K_TOKENS,
  krwPerUsd: USD_TO_KRW,
  note: 'Cloudflare Workers AI neuron 청구의 토큰 환산 추정치. 정확한 비용은 CF 대시보드에서 확인하세요.',
};

export async function logAiUsage(env, entry) {
  if (!env || !env.DB) {
    try { console.warn('[ai-usage] env.DB missing, skip log'); } catch (_) {}
    return;
  }
  try {
    // usage 메타가 없으면 Llama 추정치로 대체
    const inputChars  = Number(entry.inputChars  || 0);
    const outputChars = Number(entry.outputChars || 0);
    let promptTokens     = entry.promptTokens     != null ? Number(entry.promptTokens)     : null;
    let completionTokens = entry.completionTokens != null ? Number(entry.completionTokens) : null;
    let totalTokens      = entry.totalTokens      != null ? Number(entry.totalTokens)      : null;
    if (totalTokens == null || totalTokens === 0) {
      const estIn  = estimateLlamaTokens(inputChars);
      const estOut = estimateLlamaTokens(outputChars);
      if (promptTokens     == null) promptTokens     = estIn;
      if (completionTokens == null) completionTokens = estOut;
      totalTokens = estIn + estOut;
    }

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
      inputChars,
      outputChars,
      promptTokens,
      completionTokens,
      totalTokens,
      entry.latencyMs != null ? Number(entry.latencyMs) : null,
      String(entry.status || 'unknown'),
      entry.errorCode || null
    ).run();
    try { console.log('[ai-usage] logged', entry.endpoint, entry.status, 'tokens≈' + totalTokens); } catch (_) {}
  } catch (err) {
    try { console.error('[ai-usage] log failed:', (err && err.message) || err); } catch (_) {}
  }
}
