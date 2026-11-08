/**
 * 기사 본문 → 평문 발췌.
 *
 * functions/[[path]].js 의 홈 SSR 에만 있던 구현을 공유 모듈로 옮긴 것.
 * /api/home 이 카드 목록에 content 전문을 실어 보내는 대신 여기서 만든
 * excerpt 만 보내도록 하면서 두 곳이 같은 규칙을 쓰도록 통합했다.
 *
 * 본문은 Editor.js JSON 이거나 레거시 HTML 문자열 두 형태가 모두 존재한다.
 */

const MIN_EXCERPT_LEN = 80;
const MAX_EXCERPT_LEN = 420;

export function extractEditorJsText(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.charAt(0) !== '{' || raw.indexOf('"blocks"') === -1) return '';
  try {
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed && parsed.blocks) ? parsed.blocks : [];
    return blocks.map((block) => {
      if (!block || typeof block !== 'object') return '';
      const data = block.data && typeof block.data === 'object' ? block.data : {};
      if (typeof data.text === 'string') return data.text;
      if (Array.isArray(data.items)) return data.items.join(' ');
      return '';
    }).filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

export function stripHtml(value) {
  const raw = String(value || '');
  const editorText = extractEditorJsText(raw);
  const source = editorText || raw;
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function getPostExcerpt(post, limit) {
  const subtitle = String(post && post.subtitle || '').trim();
  const plain = stripHtml(String(post && post.content || '')).replace(/\s+/g, ' ').trim();
  const base = plain || subtitle;
  if (!base) return '';
  const safeLimit = Math.max(MIN_EXCERPT_LEN, Math.min(MAX_EXCERPT_LEN, parseInt(limit || 220, 10)));
  return base.length > safeLimit ? `${base.slice(0, safeLimit - 1).trim()}…` : base;
}

/**
 * 카드 목록용 직렬화 — content 전문을 응답에서 빼고 excerpt 로 대체한다.
 * 홈 렌더러가 실제로 쓰는 건 최대 420자 발췌 한 곳뿐인데, 이전에는 25건의
 * 본문 전체(약 55KB, 응답의 42%)를 매 방문마다 내려보내고 있었다.
 */
export function toCardPost(post, excerptLimit = MAX_EXCERPT_LEN) {
  if (!post || typeof post !== 'object') return post;
  const { content, ...rest } = post;
  return { ...rest, excerpt: getPostExcerpt(post, excerptLimit) };
}
