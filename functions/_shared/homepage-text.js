/**
 * Gilwell Media · Homepage Text (편집 가능한 홈페이지 본문)
 *
 * Single source of truth for the editable copy that appears on `/` outside of
 * navigation, post lists, and the i18n translation table. Anything an operator
 * should be able to tune from the admin "홈페이지 본문" panel lives here.
 *
 * Storage: settings(key='homepage_text', value=JSON). Missing keys fall back
 * to the defaults below so a fresh DB renders the same as the static HTML.
 */

export const HOMEPAGE_TEXT_SETTINGS_KEY = 'homepage_text';

export const HOMEPAGE_TEXT_FIELDS = Object.freeze([
  { key: 'masthead_brand', label: '상단 로고 텍스트', note: '페이지 상단 가운데 H1 (예: BP미디어)', default: 'BP미디어', max: 60 },
  { key: 'masthead_tagline', label: '상단 로고 하단 부제', note: '로고 아래 한 줄', default: 'The BP Post · bpmedia.net', max: 120 },
  { key: 'hero_eyebrow', label: '히어로 상단 작은 라벨', note: 'Eyebrow', default: 'BP미디어 · bpmedia.net', max: 120 },
  { key: 'hero_title', label: '히어로 메인 문구', note: '줄바꿈 OK', default: '스카우트 운동의 소식을\n기록합니다', max: 200, multiline: true },
  { key: 'hero_sub', label: '히어로 보조 문구', note: '한 두 문장', default: '한국스카우트연맹과 세계스카우트연맹의 소식을 자발적인 봉사로 전합니다', max: 240, multiline: true },
  { key: 'hero_pause_label', label: '히어로 일시정지 버튼', default: '일시정지', max: 24 },
  { key: 'hero_play_label', label: '히어로 재생 버튼', default: '재생', max: 24 },
  { key: 'section_main_story', label: '메인 스토리 섹션 제목', default: '메인 스토리', max: 60 },
  { key: 'section_latest', label: '최신 소식 섹션 제목', default: '최신 소식', max: 60 },
  { key: 'section_picks', label: '에디터 추천 섹션 제목', default: '에디터 추천', max: 60 },
  { key: 'section_popular', label: '인기 소식 섹션 제목', default: '인기 소식', max: 60 },
  { key: 'cta_rss', label: 'RSS 구독 버튼', default: 'RSS 구독', max: 24 },
  { key: 'cta_search', label: '사이트 검색 버튼', default: '사이트 검색', max: 24 },
  { key: 'more_label', label: '더보기 링크 텍스트', default: '더보기 →', max: 24 },
  { key: 'search_placeholder', label: '상단 검색창 안내', default: '검색…', max: 40 },
  { key: 'skip_link', label: '본문 바로가기 (스킵 링크)', default: '본문으로 건너뛰기', max: 40 },
  { key: 'pull_refresh', label: '모바일 당겨서 새로고침 라벨', default: '당겨서 새로고침', max: 40 },
  { key: 'privacy_link', label: '개인정보 처리방침 링크 텍스트', default: '개인정보 처리방침', max: 60 },
]);

const FIELD_BY_KEY = Object.freeze(
  HOMEPAGE_TEXT_FIELDS.reduce((acc, f) => { acc[f.key] = f; return acc; }, {})
);

export function defaultHomepageText() {
  const out = {};
  HOMEPAGE_TEXT_FIELDS.forEach((f) => { out[f.key] = f.default; });
  return out;
}

function trimToMax(value, max) {
  const trimmed = String(value).trim();
  if (!trimmed.length) return '';
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function normalizeHomepageText(raw) {
  const defaults = defaultHomepageText();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const out = {};
  HOMEPAGE_TEXT_FIELDS.forEach((field) => {
    const incoming = raw[field.key];
    if (typeof incoming === 'string') {
      const cleaned = trimToMax(incoming, field.max);
      out[field.key] = cleaned.length ? cleaned : field.default;
    } else {
      out[field.key] = field.default;
    }
  });
  return out;
}

export function sanitizeHomepageTextPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('홈페이지 텍스트는 객체 형태로 보내주세요.');
  }
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = FIELD_BY_KEY[key];
    if (!field) continue;
    if (typeof value !== 'string') continue;
    const cleaned = trimToMax(value, field.max);
    out[key] = cleaned.length ? cleaned : field.default;
  }
  return out;
}

export async function loadHomepageText(env) {
  try {
    const row = await env.DB
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(HOMEPAGE_TEXT_SETTINGS_KEY)
      .first();
    if (!row || !row.value) return defaultHomepageText();
    let parsed = null;
    try { parsed = JSON.parse(row.value); } catch { parsed = null; }
    return normalizeHomepageText(parsed);
  } catch {
    return defaultHomepageText();
  }
}
