import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { logAiUsage } from '../../_shared/ai-usage.js';

const MODEL_ID = '@cf/meta/llama-3.1-8b-instruct';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const STANDARD = `
BP미디어 기사 작성 표준 v2.1 평가 기준:

[Title 규칙]
- 주체(연맹명/국가명) + 실제 행동(방문/체결/개최/시작 등) + 사건명 구조여야 함
- 해석, 감정, 평가, 미래 예측 표현 금지
- 제목만 보고 사건이 복원 가능해야 함
- 금지 표현: 의미 있는, 뜻깊은, 중요한 계기, 성공적으로, 훌륭한

[Subtitle 규칙]
- 기사의 해석 방향 또는 구조 흐름을 제시
- 감정 표현, 단정적 해석 금지

[Body 구조]
- 문단 구분이 명확해야 함 (빈 줄로 구분)
- 1문단: 사건 설명, 2문단: 배경, 3문단: 전개(인물·행동), 4문단: 확장(가능성만 서술)
- 문단당 하나의 메시지, 3~5문장 권장
- 시간 흐름 유지
- 금지 표현: 의미 있는, 뜻깊은, 중요한 계기, 성공적으로

[번역·표기 원칙]
- 연맹명/인명은 국문(영문) 병기 최초 1회 후 국문만 사용
- 임의 해석·창작 금지, 원문 사실 기반

[문체·홍보 원칙]
- 겸손하고 다정한 톤, 행위·관계·흐름 중심
- 직접 평가 금지 (훌륭한, 대단한, 역사적 등)
- 협력 구조·청소년 참여·프로그램 흐름으로 의미를 간접적으로 드러냄

[Tags]
- 7~10개 권장: 브랜드(스카우트 등) + 사건(국제교류 등) + 대상(연맹명/국가명)
`;

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  if (!env.AI) {
    return json({ error: 'Workers AI 바인딩이 설정되지 않았습니다. Cloudflare Pages 대시보드에서 AI 바인딩을 추가해주세요.' }, 503);
  }

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: '요청 형식 오류' }, 400); }

  const { title = '', subtitle = '', content = '', tags = '' } = body;
  const inputChars = (String(title) + String(subtitle) + String(content) + String(tags)).length;
  if (!title && !content) {
    await logAiUsage(env, {
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, status: 'invalid', errorCode: 'empty_input',
    });
    return json({ error: '제목과 본문 중 하나 이상을 입력해주세요.' }, 400);
  }

  const prompt = `당신은 BP미디어 기사 편집장입니다. 아래 기사를 BP미디어 작성 표준 v2.1에 따라 평가해주세요.

${STANDARD}

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
    await logAiUsage(env, {
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
    await logAiUsage(env, {
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_no_json',
    });
    return json({ error: 'AI 응답 파싱 실패', raw }, 502);
  }

  let result;
  try { result = JSON.parse(jsonMatch[1]); }
  catch (_) {
    await logAiUsage(env, {
      endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
      inputChars, outputChars, promptTokens, completionTokens, totalTokens,
      latencyMs, status: 'error', errorCode: 'parse_invalid_json',
    });
    return json({ error: 'AI 응답 JSON 파싱 실패', raw }, 502);
  }

  await logAiUsage(env, {
    endpoint: 'score-article', model: MODEL_ID, ip, actor: 'admin',
    inputChars, outputChars, promptTokens, completionTokens, totalTokens,
    latencyMs, status: 'success',
  });
  return json({ ok: true, result });
}
