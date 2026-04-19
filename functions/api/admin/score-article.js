import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { logAiUsage } from '../../_shared/ai-usage.js';
import { loadScoreRubric } from '../../_shared/score-rubric.js';

const MODEL_ID = '@cf/meta/llama-3.1-8b-instruct';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env, waitUntil }) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  if (!env.AI) {
    return json({ error: 'Workers AI 바인딩이 설정되지 않았습니다. Cloudflare Pages 대시보드에서 AI 바인딩을 추가해주세요.' }, 503);
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
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
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
  "improvement": "<가장 중요한 개선 방향 2~3줄>"
}`;

  const startTs = Date.now();
  let aiResp;
  try {
    aiResp = await env.AI.run(MODEL_ID, {
      messages: [
        {
          role: 'system',
          content: 'You are a Korean journalism editor. Always respond with valid JSON only, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1200,
    });
  } catch (err) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, latencyMs: Date.now() - startTs,
      status: 'error', errorCode: 'ai_call_failed',
    });
    return json({ error: 'AI 호출 실패: ' + (err.message || String(err)) }, 502);
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
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_no_json',
    });
    return json({ error: 'AI 응답 파싱 실패', raw }, 502);
  }

  let result;
  try { result = JSON.parse(jsonMatch[1]); }
  catch (_) {
    logAsync({
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_invalid_json',
    });
    return json({ error: 'AI 응답 JSON 파싱 실패', raw }, 502);
  }

  logAsync({
    endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
    inputChars, outputChars, promptTokens, completionTokens, totalTokens,
    latencyMs, status: 'success',
  });
  return json({ ok: true, result });
}
