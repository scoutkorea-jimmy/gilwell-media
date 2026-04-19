/**
 * AI 기사 채점 평가 기준(rubric) 관리
 *
 * settings 테이블 key='score_rubric'에 사용자 지정 기준을 저장한다.
 * 값이 없으면 DEFAULT_SCORE_RUBRIC 폴백.
 * score-article 엔드포인트가 매 호출 시 loadScoreRubric()로 최신 값을 읽어
 * Workers AI 프롬프트에 주입한다.
 */

export const DEFAULT_SCORE_RUBRIC = `BP미디어 기사 작성 표준 v2.1 평가 기준:

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

export const RUBRIC_MAX_CHARS = 20000;

export function normalizeScoreRubric(raw) {
  if (raw == null) return '';
  // \r\n을 \n으로 정규화, 줄 끝 공백 정리, 과도한 빈 줄 압축(최대 2연속)
  const text = String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > RUBRIC_MAX_CHARS) return text.slice(0, RUBRIC_MAX_CHARS);
  return text;
}

export async function loadScoreRubric(env) {
  if (!env || !env.DB) return DEFAULT_SCORE_RUBRIC;
  try {
    const row = await env.DB
      .prepare(`SELECT value FROM settings WHERE key = 'score_rubric'`)
      .first();
    const stored = row && typeof row.value === 'string' ? row.value.trim() : '';
    if (stored) return stored;
  } catch (_) { /* fall through */ }
  return DEFAULT_SCORE_RUBRIC;
}
