import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { loadAdminSession } from '../../_shared/admin-permissions.js';
import { logAiUsage } from '../../_shared/ai-usage.js';
import { logAiScore } from '../../_shared/ai-score-log.js';
import { loadScoreRubric } from '../../_shared/score-rubric.js';
import { MEMBER_DEFAULT_AI_DAILY_LIMIT, hasMenuPermission } from '../../_shared/admin-users.js';

const MODEL_ID = '@cf/meta/llama-3.1-8b-instruct';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env, waitUntil }) {
  const ip = request.headers.get('CF-Connecting-IP') || '';

  // Phase 4 auth: owner unrestricted. Member needs write:article-scorer AND
  // must stay within their daily call limit (default 10, per-user override).
  const session = await loadAdminSession(request, env);
  if (!session) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  if (!session.isOwner && !hasMenuPermission(session.permissions, 'article-scorer', 'write')) {
    return json({ error: 'AI 채점 권한이 없습니다.' }, 403);
  }

  const actor = session.username || 'admin';

  if (!env.AI) {
    return json({ error: 'Workers AI 바인딩이 설정되지 않았습니다. Cloudflare Pages 대시보드에서 AI 바인딩을 추가해주세요.' }, 503);
  }

  // Daily limit enforcement for non-owner. ai_usage_log.created_at is a unix
  // second timestamp; count today's (KST) window.
  if (!session.isOwner) {
    const limit = (session.user && session.user.ai_daily_limit != null)
      ? Number(session.user.ai_daily_limit)
      : MEMBER_DEFAULT_AI_DAILY_LIMIT;
    if (limit === 0) {
      return json({ error: 'AI 채점 일일 한도가 0으로 설정되어 있습니다. 오너에게 한도 상향을 요청하세요.' }, 429);
    }
    try {
      // Compute today's KST window in unix seconds.
      const now = new Date();
      const kstOffsetMin = 9 * 60;
      const nowKstMs = now.getTime() + kstOffsetMin * 60_000;
      const kstStart = new Date(nowKstMs);
      kstStart.setUTCHours(0, 0, 0, 0);
      const startSec = Math.floor((kstStart.getTime() - kstOffsetMin * 60_000) / 1000);
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ai_usage_log
          WHERE endpoint = 'score-article' AND actor = ? AND created_at >= ? AND status = 'ok'`
      ).bind(actor, startSec).first();
      const used = Number(countRow && countRow.n) || 0;
      if (used >= limit) {
        return json({
          error: `AI 채점 일일 한도(${limit}회)를 초과했습니다. 내일 KST 자정에 초기화됩니다. 한도 상향은 오너에게 요청하세요.`,
          limit, used, remaining: 0,
        }, 429);
      }
    } catch (err) {
      // DB error — fail open rather than block the operator. Log for audit.
      console.error('[score-article] daily-limit check failed:', err);
    }
  }

  // 로깅은 fire-and-forget. waitUntil이 없으면 promise만 발사하고 catch만 처리.
  const logAsync = (entry) => {
    const p = logAiUsage(env, entry);
    if (typeof waitUntil === 'function') waitUntil(p.catch(() => {}));
    else p.catch(() => {});
  };

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: '요청 형식 오류' }, 400); }

  const { title = '', subtitle = '', content = '', tags = '' } = body;
  const inputChars = (String(title) + String(subtitle) + String(content) + String(tags)).length;
  if (!title && !content) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor,
      inputChars, status: 'invalid', errorCode: 'empty_input',
    });
    return json({ error: '제목과 본문 중 하나 이상을 입력해주세요.' }, 400);
  }

  const rubric = await loadScoreRubric(env);
  const prompt = `당신은 BP미디어 기사 편집장입니다. 아래 기사를 운영자가 지정한 평가 기준에 따라 평가해주세요.

${rubric}

---
[평가할 기사]
Title: ${title || '(없음)'}
Subtitle: ${subtitle || '(없음)'}
Body:
${content || '(없음)'}
Tags: ${tags || '(없음)'}
---

각 항목을 평가하고 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 출력하지 마세요.

"revision_suggestion" 필드는 이 기사를 어떻게 수정하면 더 좋아질지 **약 300자(한글 기준) 분량의 구체적이고 실행 가능한 제안**으로 작성하세요. 어떤 문장을 어떻게 바꿀지, 무엇을 추가/삭제할지 명확히 제시하고 한국어로 자연스러운 문장을 사용하세요.

{
  "overall": {
    "score": <0-100 정수>,
    "grade": "<S|A|B|C|D>",
    "summary": "<전체 평가 한 문장>"
  },
  "categories": [
    {
      "label": "Title",
      "score": <0-30 정수>,
      "max": 30,
      "issues": ["<문제점>"],
      "strengths": ["<잘된 점>"]
    },
    {
      "label": "Subtitle",
      "score": <0-15 정수>,
      "max": 15,
      "issues": [],
      "strengths": []
    },
    {
      "label": "Body 구조·흐름",
      "score": <0-35 정수>,
      "max": 35,
      "issues": [],
      "strengths": []
    },
    {
      "label": "Tags",
      "score": <0-10 정수>,
      "max": 10,
      "issues": [],
      "strengths": []
    },
    {
      "label": "표기·문체·겸손도",
      "score": <0-10 정수>,
      "max": 10,
      "issues": [],
      "strengths": []
    }
  ],
  "improvement": "<가장 중요한 개선 방향 2~3줄>",
  "revision_suggestion": "<약 300자 분량의 구체적인 수정 제안(한국어)>"
}`;

  const startTs = Date.now();
  const aiInput = {
    messages: [
      {
        role: 'system',
        content: 'You are a Korean journalism editor. Always respond with valid JSON only, no extra text.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1500,
  };

  // 1 automatic retry on transient Workers AI hiccups (short back-off).
  // Common transient failures: 5xx from the AI gateway, queue pressure, or
  // one-off network blips. A single retry halves the probability that a user
  // sees a red error without doubling worst-case latency for steady-state.
  let aiResp;
  let aiError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      aiResp = await env.AI.run(MODEL_ID, aiInput);
      aiError = null;
      break;
    } catch (err) {
      aiError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  if (aiError) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor,
      inputChars, latencyMs: Date.now() - startTs,
      status: 'error', errorCode: 'ai_call_failed',
    });
    return json({
      error: 'AI 호출이 2회 모두 실패했습니다. 잠시 후 다시 시도해주세요. · ' + (aiError.message || String(aiError)),
    }, 502);
  }

  const latencyMs = Date.now() - startTs;
  const raw = (aiResp.response || '').trim();
  const outputChars = raw.length;
  // Workers AI가 usage 메타데이터를 돌려주면 그대로 기록 (없으면 null)
  const usage = (aiResp && aiResp.usage) || null;
  const promptTokens     = usage ? Number(usage.prompt_tokens     || usage.input_tokens  || 0) || null : null;
  const completionTokens = usage ? Number(usage.completion_tokens || usage.output_tokens || 0) || null : null;
  const totalTokens      = usage ? Number(usage.total_tokens || ((promptTokens || 0) + (completionTokens || 0))) || null : null;

  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ||
                    raw.match(/```\s*([\s\S]*?)```/) ||
                    raw.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor,
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_no_json',
    });
    return json({ error: 'AI 응답 파싱 실패', raw }, 502);
  }

  let result;
  try { result = JSON.parse(jsonMatch[1]); }
  catch (_) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor,
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_invalid_json',
    });
    return json({ error: 'AI 응답 JSON 파싱 실패', raw }, 502);
  }

  logAsync({
    endpoint: 'score-article', model: MODEL_ID, ip, actor,
    inputChars, outputChars, promptTokens, completionTokens, totalTokens,
    latencyMs, status: 'success',
  });

  // 채점 상세 결과는 별도 ai_score_log에 축약 저장 — /api/admin/ai-score-history가 소비.
  const scoreLogEntry = {
    actor: 'admin',
    ip,
    inputTitle: title,
    inputSubtitle: subtitle,
    inputBodyChars: String(content || '').length,
    inputTags: tags,
    overallScore: result && result.overall ? Number(result.overall.score) : null,
    overallGrade: result && result.overall ? result.overall.grade : null,
    overallSummary: result && result.overall ? result.overall.summary : null,
    improvement: result && result.improvement ? result.improvement : null,
    revisionSuggestion: result && result.revision_suggestion ? result.revision_suggestion : null,
    categories: result && Array.isArray(result.categories) ? result.categories : null,
    latencyMs,
    totalTokens,
    status: 'success',
  };
  const scoreLogPromise = logAiScore(env, scoreLogEntry);
  if (typeof waitUntil === 'function') waitUntil(scoreLogPromise.catch(() => {}));
  else scoreLogPromise.catch(() => {});

  return json({ ok: true, result });
}
