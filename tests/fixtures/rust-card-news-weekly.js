import { PUBLIC_DATE_EXPR } from '../../functions/_shared/post-public-date.js';

export const WEEKLY_TEMPLATE = 'bpmedia-weekly-v1';
export const COVER_VARIANTS = ['classic', 'editorial', 'panorama', 'mosaic', 'diagonal', 'poster', 'stacked', 'focus'];
const DAY = 86400000;
const LABELS = { korea: '한국소식', apr: '아태소식', wosm: '세계소식', people: '인물소식' };

export function cleanWeeklyDesign(value, candidates) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('디자인 설정을 다시 확인해 주세요.');
  const choice = (item, fallback, choices) => {
    if (item === undefined) return fallback;
    if (!choices.includes(item)) throw new Error('제공된 디자인과 레이아웃에서 골라 주세요.');
    return item;
  };
  const size = (item, fallback, min, max) => {
    if (item === undefined) return fallback;
    if (!Number.isFinite(item) || item < min || item > max) throw new Error('글자와 사진 크기를 허용 범위 안에서 골라 주세요.');
    return item;
  };
  const text = (item, fallback, max, required = false) => {
    if (item === undefined) return fallback;
    if (typeof item !== 'string' || item.length > max || (required && !item.trim())) throw new Error('표지 문구의 길이를 다시 확인해 주세요.');
    if (item.split(/\r\n?|\n/).length > 3) throw new Error('표지 제목과 소개는 각각 3줄 안에서 작성해 주세요.');
    return item;
  };
  const controls = value.articles === undefined ? {} : value.articles;
  if (!controls || typeof controls !== 'object' || Array.isArray(controls) || Object.keys(controls).length > 20) throw new Error('기사별 디자인 설정을 다시 확인해 주세요.');
  const articles = {};
  for (const [id, control] of Object.entries(controls)) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !candidates.some(article => article.id === Number(id)) || !control || typeof control !== 'object' || Array.isArray(control)) throw new Error('이번 기간에 확인한 기사에만 레이아웃을 지정할 수 있습니다.');
    articles[id] = {
      layout: choice(control.layout, 'wide', ['wide', 'split-left', 'split-right', 'portrait']),
      title_size: size(control.title_size, 58, 44, 72),
      body_size: size(control.body_size, 31, 24, 36),
      image_height: size(control.image_height, 390, 260, 560),
      image_fit: choice(control.image_fit, 'cover', ['cover', 'contain']),
    };
  }
  return {
    cover_variant: choice(value.cover_variant, 'classic', COVER_VARIANTS),
    cover_title: text(value.cover_title, '이번 주\n스카우트 소식', 36, true),
    cover_subtitle: text(value.cover_subtitle, '세계의 스카우트는 지금?', 80),
    cover_title_size: size(value.cover_title_size, 111, 88, 120),
    articles,
  };
}

export function weeklyPeriod(now = new Date(), rolling = false) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  let end;
  if (rolling) end = kst.toISOString().slice(0, 19).replace('T', ' ');
  else {
    const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    end = new Date(monday.getTime()-3600000).toISOString().slice(0,19).replace('T',' ');
  }
  const start = new Date(Date.parse(end.replace(' ', 'T') + 'Z') - 7 * DAY + (rolling ? 0 : 3600000)).toISOString().slice(0, 19).replace('T', ' ');
  return { start, end, timezone: 'Asia/Seoul', key: `${start.slice(0, 10)}_${end.slice(0, 10)}` };
}

function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

export function paragraphs(content) {
  let raw = String(content || '').trim();
  if (raw.startsWith('{')) {
    try {
      const doc = JSON.parse(raw);
      return (doc.blocks || []).flatMap(b => {
        if (typeof b?.data?.text === 'string') return [plain(b.data.text)];
        if (Array.isArray(b?.data?.items)) return b.data.items.map(x => plain(typeof x === 'string' ? x : x?.content));
        return [];
      }).filter(Boolean);
    } catch { return []; }
  }
  return raw.split(/\n\s*\n|<\/p>|<br\s*\/?\s*>/i).map(plain).filter(Boolean);
}

function firstSentences(text, limit = 210) {
  const sentences = String(text).match(/[^.!?]+[.!?]+(?:[”’"])?|[^.!?]+$/g) || [];
  let result = '';
  for (const sentence of sentences) {
    if ((result + sentence).length > limit) break;
    result += sentence;
  }
  return result.trim();
}

export function articleSnapshot(row, origin) {
  const parts = paragraphs(row.content);
  const summary = firstSentences(parts.find(x => x.length > 35) || '', 210);
  if (!summary || !row.image_url || !LABELS[row.category]) return null;
  const title = plain(row.title);
  const shortTitle = title.split('…')[0].trim();
  const tags = String(row.tag || '').split(',').map(plain).filter(Boolean).slice(0, 3);
  return {
    id: Number(row.id), category: row.category, header_category: LABELS[row.category],
    display_tags: tags, title: shortTitle.length <= 40 ? shortTitle : title,
    original_title: title, subtitle: plain(row.subtitle), summary,
    note: parts.find(x => /가입이 최종 확정|구체적인 운영 기준|현재는.*절차/.test(x) && x.length <= 220) || '',
    url: `${origin}/post/${row.id}`, image: `${origin}/api/posts/${row.id}/image`,
    image_source_url: `${origin}/api/posts/${row.id}/image`, credit: plain(row.image_caption) || '사진: 해당 BP미디어 기사 게재 이미지',
    mode: 'photo', region: { korea: 'KOREA', apr: 'APR', wosm: 'WOSM', people: 'EUR' }[row.category],
    published_at: row.public_date, source_modified_at: row.updated_at,
    attention_score: Number(row.attention_score || 0),
  };
}

export function selectWeekly(candidates, ids) {
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(x => !Number.isSafeInteger(x))) throw new Error('기사 1~5건을 중복 없이 골라 주세요.');
    const chosen = ids.map(id => candidates.find(a => a.id === id));
    if (chosen.some(x => !x)) throw new Error('이번 기간에 확인한 이미지 있는 기사에서 골라 주세요.');
    return chosen;
  }
  const chosen = [];
  for (const category of ['korea', 'apr', 'wosm']) {
    const article = candidates.find(a => a.category === category);
    if (article) chosen.push(article);
  }
  for (const article of candidates) if (chosen.length < 5 && !chosen.some(a => a.id === article.id)) chosen.push(article);
  return chosen;
}

export function withSelection(issue, ids) {
  const articles = selectWeekly(issue.candidates, ids);
  return {
    ...issue, articles,
    additional_news: ['korea', 'apr', 'wosm'].map(category => ({
      category: category === 'wosm' ? 'world' : category,
      label: LABELS[category],
      articles: issue.candidates.filter(a => a.category === category && !articles.some(x => x.id === a.id)).slice(0, 4).map(a => ({ id: a.id, title: a.original_title, url: a.url })),
    })),
  };
}

async function imageAvailable(origin, id, fetcher) {
  // Only inspect our published image route; redirects stay on the same origin.
  let url = `${origin}/api/posts/${id}/image`;
  for (let i = 0; i < 2; i++) {
    const response = await fetcher(url, { method: 'GET', headers: { Range: 'bytes=0-31' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get('Location') || '', url);
      if (next.origin !== origin) return false;
      url = next.href;
    } else return response.ok && /^image\/(jpeg|png|webp|gif|avif)/i.test(response.headers.get('Content-Type') || '');
  }
  return false;
}

export async function loadWeeklyCandidates(env, period, origin, fetcher = fetch) {
  const utcStart = new Date(period.start.replace(' ', 'T') + '+09:00').toISOString().slice(0, 19).replace('T', ' ');
  const utcEnd = new Date(period.end.replace(' ', 'T') + '+09:00').toISOString().slice(0, 19).replace('T', ' ');
  const rs = await env.DB.prepare(`SELECT id, category, title, subtitle, content, image_url, image_caption, tag, updated_at,
    ${PUBLIC_DATE_EXPR} AS public_date,
    ((SELECT COUNT(*) FROM site_visits WHERE path LIKE '/post/%' AND CAST(SUBSTR(path,7) AS INTEGER)=posts.id AND datetime(visited_at)>=datetime(?) AND datetime(visited_at)<=datetime(?))
    +3*(SELECT COUNT(*) FROM post_likes WHERE post_id=posts.id AND datetime(liked_at)>=datetime(?) AND datetime(liked_at)<=datetime(?))) AS attention_score
    FROM posts WHERE published=1 AND ${PUBLIC_DATE_EXPR}>=? AND ${PUBLIC_DATE_EXPR}<=? AND image_url IS NOT NULL AND trim(image_url)<>''
    AND category IN ('korea','apr','wosm','people') ORDER BY attention_score DESC, public_date DESC, id DESC LIMIT 60`)
    .bind(utcStart, utcEnd, utcStart, utcEnd, period.start, period.end).all();
  const rows = (rs.results || []).filter(row => !/\/img\/logo\.(png|svg)(?:\?|$)/i.test(row.image_url)).slice(0, 20);
  const result = [];
  // Small batches bound scheduled subrequests and avoid a single failed image stopping the issue.
  for (let i = 0; i < rows.length && result.length < 20; i += 3) {
    const batch = await Promise.all(rows.slice(i, i + 3).map(async row => {
      const article = articleSnapshot(row, origin);
      if (!article) return null;
      try { return await imageAvailable(origin, row.id, fetcher) ? article : null; } catch { return null; }
    }));
    result.push(...batch.filter(Boolean));
  }
  return result.slice(0, 20);
}

export async function createWeeklyIssue(env, { now = new Date(), rolling = false, origin = 'https://bpmedia.net', fetcher = fetch } = {}) {
  const period = weeklyPeriod(now, rolling);
  const slug = `weekly-${period.key}${rolling ? '-manual' : ''}`;
  const existing = await env.DB.prepare('SELECT id,title FROM card_news WHERE slug=?').bind(slug).first();
  if (existing) return { ok: true, ...existing, existing: true };
  const candidates = await loadWeeklyCandidates(env, period, origin, fetcher);
  if (!candidates.length) return { ok: true, status: 'no_articles', reason: '이번 기간에 이미지와 본문을 확인한 기사가 아직 없습니다.', period };
  const date = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const title = `함께 읽는 스카우트 소식 · ${period.start.slice(5, 10)}–${period.end.slice(5, 10)}`;
  const data = withSelection({ template: WEEKLY_TEMPLATE, revision: 1, title, period,
    issueDate: date.replaceAll('-', '.'), date: date.replaceAll('-', '.'),
    candidates, photo_views: {}, auto_publish: false,
    design: cleanWeeklyDesign({ cover_variant: COVER_VARIANTS[crypto.getRandomValues(new Uint8Array(1))[0] % COVER_VARIANTS.length] }, candidates),
  });
  await env.DB.prepare('INSERT OR IGNORE INTO card_news(title,slug,r2_key,size_bytes,published,data) VALUES(?,?,\'\',?,0,?)')
    .bind(title, slug, JSON.stringify(data).length, JSON.stringify(data)).run();
  const saved = await env.DB.prepare('SELECT id,title FROM card_news WHERE slug=?').bind(slug).first();
  if (!saved) throw new Error('카드뉴스 저장을 확인하지 못했습니다.');
  return { ok: true, ...saved, period, status: 'ready' };
}

export function cleanPhotoViews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 30) throw new Error('사진 위치 정보를 다시 확인해 주세요.');
  const clean = {};
  for (const [key, view] of Object.entries(value)) {
    if (!/^(cover|article:\d+):\d$/.test(key) || !view || ![view.x, view.y, view.z].every(Number.isFinite) || view.x < 0 || view.x > 100 || view.y < 0 || view.y > 100 || view.z < 1 || view.z > 3) throw new Error('사진 위치와 확대 범위를 다시 확인해 주세요.');
    if (![view.w ?? 100, view.h ?? 100].every(n => Number.isFinite(n) && n >= 50 && n <= 100)) throw new Error('사진 크기는 50~100% 범위로 골라 주세요.');
    clean[key] = { x: view.x, y: view.y, z: view.z, w: view.w ?? 100, h: view.h ?? 100 };
  }
  return clean;
}
