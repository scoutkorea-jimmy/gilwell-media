/**
 * /api/admin/card-news  — 카드뉴스 관리 (관리자 전용)
 *
 *   GET   목록 조회          gateMenuAccess('card-news','view')
 *   POST  새 카드뉴스 생성    gateMenuAccess('card-news','write')
 *
 * 카드뉴스 본문은 D1 card_news.data(tweaks JSON: 호 설정 + articles[])에 저장한다.
 * 생성 시 기본 호 설정 + 빈 articles 로 시작하고, 편집은 /card-news/:id 에디터에서.
 * (legacy: 과거 업로드 방식 행은 r2_key 를 가질 수 있음 — 삭제 시 함께 정리)
 *
 * 생성 형식: POST /api/admin/card-news?title=<URL인코딩 제목>  (title 선택)
 *   응답: { ok, id, title, slug, view_url, edit_url }
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

// 새 카드뉴스 기본 데이터(BP미디어 상수 + 레이아웃 기본값, articles 는 비움).
// 편집기에서 '기사 불러오기'로 articles 를 채운다.
const DEFAULT_DATA = {
  primary: 'midnight', aspect: '4:5', showImage: true, bgPattern: true,
  fontScale: 1.05, cardRadius: 0, embed: false, lang: 'kr',
  covPadT: 56, covPadR: 54, covPadB: 38, covPadL: 54, covVAlign: 'center',
  covScaleEyebrow: 1, covScaleLabel: 1.35, covScaleTitle: 1.6, covScaleSubtitle: 1.4, covScaleRegions: 1, covScaleFooter: 1,
  covAlignLabel: 'left', covAlignTitle: 'left', covAlignSubtitle: 'left', covAlignRegions: 'left',
  artPadT: 42, artPadR: 44, artPadB: 44, artPadL: 44,
  artScaleRank: 1.2, artScaleChips: 0.85, artScaleTitle: 0.9, artScaleBody: 0.8, artScaleMeta: 0.8,
  endPadT: 58, endPadR: 32, endPadB: 34, endPadL: 32,
  endScaleTop: 1, endScaleTitle: 1, endScaleCaption: 1, endScaleContacts: 1, endScaleBottom: 1,
  weekLabel: '', weekLabelEn: '',
  coverTitle: '주요 소식', coverTitleEn: 'Weekly Highlights',
  coverSubtitle: '한주간의 스카우트 소식을 한눈에', coverSubtitleEn: "This week's scouting news at a glance",
  coverSwipe: '자세히 보기 →', coverSwipeEn: 'SWIPE →',
  issueNo: '', issueDate: '',
  endingLine1: 'BP미디어에서 더 다양한', endingLine1En: 'Get more',
  endingLine2: '스카우트 소식', endingLine2En: 'scouting stories',
  endingLine2Suffix: '을 받아보세요.', endingLine2SuffixEn: ' every week on BP Media.',
  articleCta: 'BP미디어에서 자세히 보기 →', articleCtaEn: 'Read the full story on BP Media →',
  endingCta: '팔로우하고 매주 받아보기 →', endingCtaEn: 'Subscribe for weekly updates →',
  contactWeb: 'bpmedia.net', contactWebEn: 'bpmedia.net',
  contactInsta: '@bpmedia2016', contactInstaEn: '@bpmedia2016',
  contactStory: 'story@bpmedia.net', contactStoryEn: 'story@bpmedia.net',
  contactInfo: 'info@bpmedia.net', contactInfoEn: 'info@bpmedia.net',
  editing: 0,
  // 시작 카드 1장(빈 articles 면 편집기가 크래시) — '기사 불러오기'로 채우거나 직접 편집.
  articles: [{
    name: '', nameEn: '', region: '', nso: '', nsoEn: '', date: '',
    title: '', titleEn: '', summary: '', summaryEn: '',
    likes: 0, hint: '', hintEn: '', imgHeight: 24, image: '',
  }],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// 제목 → URL 안전 슬러그(한글 허용) + 짧은 uuid 접미사로 유일성 보장.
function makeSlug(title) {
  const base = String(title || '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = (crypto.randomUUID().split('-')[0] || 'cn');
  return (base ? base + '-' : 'card-news-') + suffix;
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;
  try {
    const rs = await env.DB.prepare(
      `SELECT id, title, slug, size_bytes, published, created_at, updated_at,
              (data IS NOT NULL AND data != '') AS has_data
         FROM card_news ORDER BY created_at DESC, id DESC`
    ).all();
    const items = (rs && rs.results ? rs.results : []).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      published: !!row.published,
      has_data: !!row.has_data,
      created_at: row.created_at,
      updated_at: row.updated_at,
      view_url: `/card-news/${row.id}`,
      edit_url: `/card-news/${row.id}?edit=1`,
    }));
    return json({ items });
  } catch (err) {
    console.error('GET /api/admin/card-news error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;

  const url = new URL(request.url);
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  if (!body || typeof body !== 'object') body = {};

  let title = String(body.title || url.searchParams.get('title') || '').trim();

  // 복사(clone): ?from=<id> 또는 body.from — 기존 카드뉴스 data 를 통째로 복제.
  const fromId = parseInt(body.from || url.searchParams.get('from'), 10);
  let data;
  if (fromId && fromId > 0) {
    try {
      const src = await env.DB.prepare(`SELECT title, data FROM card_news WHERE id = ?`).bind(fromId).first();
      if (!src) return json({ error: 'not_found', reason: '복사할 카드뉴스를 찾을 수 없습니다.' }, 404);
      try { data = JSON.parse(src.data || '{}'); } catch (_) { data = { ...DEFAULT_DATA }; }
      if (!data || typeof data !== 'object') data = { ...DEFAULT_DATA };
      if (!Array.isArray(data.articles) || !data.articles.length) data.articles = DEFAULT_DATA.articles.map((a) => ({ ...a }));
      if (!title) title = (src.title || '카드뉴스') + ' (사본)';
    } catch (err) {
      console.error('card-news clone error:', err);
      return json({ error: 'db_error', reason: '복사 중 오류가 발생했습니다.' }, 500);
    }
  } else {
    data = { ...DEFAULT_DATA, articles: DEFAULT_DATA.articles.map((a) => ({ ...a })) };
    // 표지 자동 계산값(클라이언트가 발행일로 계산해 전달) 반영.
    const cover = (body.cover && typeof body.cover === 'object') ? body.cover : {};
    ['weekLabel', 'weekLabelEn', 'issueNo', 'issueDate'].forEach((k) => {
      if (typeof cover[k] === 'string' && cover[k].trim()) data[k] = cover[k].trim();
    });
    if (!data.issueNo && title) data.issueNo = title;
  }
  if (!title) {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    title = `새 카드뉴스 (${now.toISOString().slice(0, 10)})`;
  }

  const slug = makeSlug(title);
  const serialized = JSON.stringify(data);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO card_news (title, slug, r2_key, size_bytes, data) VALUES (?, ?, '', 0, ?)`
    ).bind(title, slug, serialized).run();
    const id = res && res.meta ? res.meta.last_row_id : null;
    await recordSettingChange(env, {
      key: 'card_news',
      path: '/api/admin/card-news',
      message: `카드뉴스 생성: ${title}`,
      details: { id, slug },
    }).catch(() => {});
    return json({ ok: true, id, title, slug, view_url: `/card-news/${id}`, edit_url: `/card-news/${id}?edit=1` }, 201);
  } catch (err) {
    console.error('POST /api/admin/card-news error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}
