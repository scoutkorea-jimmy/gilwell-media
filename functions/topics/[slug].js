import { buildShareMetaBlock, getResolvedShareImage, loadSiteMeta } from '../_shared/site-meta.js';
import { ASSET_VERSION } from '../_shared/build-version.js';

export const SCOUT_TOPICS = [
  {
    slug: 'cub-scouts', name: '컵스카우트', english: 'Cub Scouts',
    aliases: ['컵스카우트', 'Cub Scout'],
    intro: '컵스카우트는 어린이들이 함께 활동하며 협동심과 모험심을 기르는 스카우트 단계입니다. 놀이와 체험, 단계별 진급과 취미장 활동을 통해 작은 도전을 경험합니다.',
    focus: '처음 해 보는 활동을 친구들과 함께 시도하고, 서로 돕는 경험이 중심입니다. 한국스카우트연맹은 배려와 소통, 개인의 성취감, 용기 있는 모험활동 등을 컵스카우트의 교육적 지표로 소개합니다.',
    question: '컵스카우트는 어떤 활동을 하나요?',
    answer: '어린이의 관심과 발달 단계에 맞춘 단체 활동과 체험 프로그램에 참여합니다. 아래 기사에서 야외활동, 환경교육, 캠프 등 국내외 컵스카우트의 실제 사례를 찾아볼 수 있습니다.',
  },
  {
    slug: 'scouts', name: '스카우트', english: 'Scouts',
    aliases: ['스카우트', 'Scout'],
    intro: '스카우트는 청소년이 활동의 주체가 되어 배우고 성장하는 교육 운동입니다. 이 페이지에서는 스카우트 운동 전반의 소식과 함께, 컵스카우트 이후의 스카우트 단계도 안내합니다.',
    focus: '한국스카우트연맹의 스카우트 단계 소개는 청소년 중심의 프로그램과 사회봉사 참여를 강조합니다. 대원들은 각자의 개성을 살리는 활동에 참여하며 공동체에 기여하는 경험을 쌓습니다.',
    question: '스카우트와 컵스카우트는 어떻게 다른가요?',
    answer: '한국스카우트연맹은 컵스카우트, 스카우트, 벤처스카우트를 서로 다른 성장 단계로 소개합니다. 스카우트라는 말은 전체 운동을 뜻할 때도 쓰이므로, 기사에 등장하는 국가와 단계, 참가 대상을 함께 살펴보면 좋습니다.',
  },
  {
    slug: 'venture-scouts', name: '벤처스카우트', english: 'Venture Scouts',
    aliases: ['벤처스카우트', 'Venture Scout', 'Venturer'],
    intro: '벤처스카우트는 청소년이 자신의 관심과 목표를 바탕으로 프로그램을 선택하고 구상하는 스카우트 단계입니다. 활동을 스스로 계획하는 과정에서 책임감과 자기관리 능력을 기릅니다.',
    focus: '한국스카우트연맹은 벤처스카우트의 자율적인 프로그램 선택을 설명하며, 진급과제의 목표로 자기관리, 리더십, 환경, 사회공헌 등을 제시합니다. 결과뿐 아니라 활동을 준비하고 함께 실행하는 과정도 중요합니다.',
    question: '벤처스카우트 활동 소식은 어디에서 보나요?',
    answer: '이 페이지는 BP미디어 기사 중 벤처스카우트를 언급한 소식을 최신순으로 모읍니다. 행사와 국제 교류, 청소년 활동의 구체적인 참가 조건은 각 기사에 표시된 원문 공고를 확인하세요.',
  },
  {
    slug: 'rover-scouts', name: '로버스카우트', english: 'Rover Scouts',
    aliases: ['로버스카우트', 'Rover Scout', 'Rover Moot', 'Rovermoot', '로버무트'],
    intro: '로버스카우트는 청년기의 봉사와 도전, 탐험활동에 무게를 두는 스카우트 단계입니다. 지역사회에 기여하는 활동과 스스로 어려움을 극복하는 경험을 통해 진취적인 삶을 준비합니다.',
    focus: '한국스카우트연맹의 소개는 로버스카우트의 역점 분야로 사회봉사와 챌린지, 탐험활동을 설명합니다. BP미디어에서는 로버스카우트와 로버무트 관련 보도를 함께 읽을 수 있습니다.',
    question: '로버스카우트와 로버무트는 같은 뜻인가요?',
    answer: '로버스카우트는 활동 단계와 대원을 가리키며, 로버무트는 로버 대원들이 모이는 행사 맥락에서 쓰입니다. 국제 행사에서는 국가별 운영 기준과 참가 연령이 다를 수 있으므로 주최 측 안내를 확인하세요.',
  },
];

export function renderTopicLinks(text = '', currentSlug = '') {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  return SCOUT_TOPICS.filter(topic => !text || topic.aliases.some(alias => normalized.includes(alias.replace(/\s+/g, '').toLowerCase())))
    .map(topic => `<a href="/topics/${topic.slug}"${topic.slug === currentSlug ? ' aria-current="page"' : ''}>${topic.name}</a>`).join('');
}

export async function onRequestGet(context) {
  return renderTopicPage(context);
}

export async function onRequestHead(context) {
  return renderTopicPage(context, true);
}

async function renderTopicPage({ params, request, env }, headOnly = false) {
  const topic = SCOUT_TOPICS.find(item => item.slug === params.slug);
  if (!topic) return new Response('Not Found', { status: 404, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });
  const origin = new URL(request.url).origin;
  const url = `${origin}/topics/${topic.slug}`;
  // 한국어 띄어쓰기 변형과 영문 명칭을 함께 찾되 사용자 입력은 SQL로 받지 않는다.
  const searchable = "replace(COALESCE(title,'') || ' ' || COALESCE(subtitle,'') || ' ' || COALESCE(tag,'') || ' ' || COALESCE(meta_tags,'') || ' ' || COALESCE(content,''), ' ', '')";
  let posts, siteMeta;
  try {
    const result = await env.DB.prepare(`SELECT id, title, subtitle, publish_at, created_at FROM posts
      WHERE published = 1 AND (${topic.aliases.map(() => `${searchable} LIKE ?`).join(' OR ')})
      ORDER BY datetime(COALESCE(NULLIF(publish_at, ''), created_at)) DESC, id DESC LIMIT 18`)
      .bind(...topic.aliases.map(alias => `%${alias.replace(/\s+/g, '')}%`)).all();
    posts = result.results || [];
    siteMeta = await loadSiteMeta(env);
  } catch (error) {
    console.error('GET /topics/:slug error:', error);
    return new Response('기사를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
  const title = `${topic.name} 뜻·활동·최신 소식 | BP미디어`;
  const description = `${topic.intro} BP미디어에서 ${topic.name} 관련 국내외 기사와 활동 기록을 확인하세요.`;
  const meta = buildShareMetaBlock({
    pageKey: 'topics', title, description, url, imageUrl: getResolvedShareImage(siteMeta, origin),
    googleVerification: siteMeta.google_verification, naverVerification: siteMeta.naver_verification,
  });
  const articleList = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', name: `${topic.name} 관련 최신 소식`,
    itemListElement: posts.map((post, index) => ({ '@type': 'ListItem', position: index + 1, url: `${origin}/post/${post.id}`, name: post.title })),
  }).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="ko"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${meta}
  <script type="application/ld+json">${articleList}</script>
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/style.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/m3-site.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/topics.css?v=${ASSET_VERSION}">
</head><body class="topic-page">
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="topic-header"><a href="/" class="topic-brand">BP미디어</a><a href="/latest">최신 스카우트 소식 →</a></header>
  <main id="main-content" class="topic-wrap">
    <nav aria-label="스카우트 활동 단계" class="topic-links">${renderTopicLinks('', topic.slug)}</nav>
    <section class="topic-intro" aria-labelledby="topic-title">
      <p class="topic-eyebrow">스카우트 활동 안내 · ${topic.english}</p>
      <h1 id="topic-title">${topic.name}</h1><p>${topic.intro}</p>
      <div class="topic-links"><a href="#topic-news">관련 소식 읽기 ↓</a><a href="/glossary">스카우트 용어집 →</a></div>
    </section>
    <div class="topic-guide">
      <section><h2>${topic.name}의 활동과 성장</h2><p>${topic.focus}</p></section>
      <section><h2>${topic.question}</h2><p>${topic.answer}</p></section>
      <section><h2>가입과 참가 조건은 어떻게 확인하나요?</h2>
        <p>가입을 알아보고 있다면 거주 지역에서 참여할 수 있는 단위대와 활동 일정을 확인해 보세요. 국가와 프로그램마다 연령과 운영 기준이 다를 수 있습니다. 정확한 등록 대상과 신청 절차는 해당 연맹 또는 행사 주최 측에 확인하세요.</p>
        <p><a href="https://scout.or.kr/intro/scouts">한국스카우트연맹 부문별 공식 소개 ↗</a> · <a href="https://www.scout.or.kr/login">한국스카우트연맹 가입 상담 안내 ↗</a></p>
        <p class="topic-note">설명 자료: 한국스카우트연맹 부문별 소개${topic.slug === 'rover-scouts' ? ' · <a href="https://www.scout.org/what-we-do/world-scout-events/world-scout-moot">WOSM 세계스카우트무트 안내</a>' : ''} · 확인일 2026년 10월 1일. BP미디어는 독립 미디어이며 연맹의 공식 가입 접수처가 아닙니다.</p>
      </section>
    </div>
    <section id="topic-news" aria-labelledby="news-heading"><h2 id="news-heading">${topic.name} 관련 최신 소식</h2>
      <p>국내외 기사에서 이 주제를 언급한 소식을 최신순으로 모았습니다. 행사 일정과 참가 대상은 기사 원문에서 확인하세요.</p>
      <div class="topic-news-grid">${posts.length ? posts.map(post => `<article class="topic-news-card">
        <p class="topic-note">${escapeHtml(formatPublicDate(post))}</p>
        <h3><a href="/post/${post.id}">${escapeHtml(post.title)}</a></h3>
        ${post.subtitle ? `<p>${escapeHtml(post.subtitle)}</p>` : ''}
        <a href="/post/${post.id}" class="topic-read">기사 읽기 →</a>
      </article>`).join('') : '<p>아직 관련 기사가 없습니다. 새로운 소식이 올라오면 여기에 표시됩니다.</p>'}</div>
      <p><a href="/search?q=${encodeURIComponent(topic.name)}">${topic.name} 기사 더 찾아보기 →</a></p>
    </section>
  </main>
  <footer class="topic-footer"><p>BP미디어 · 스카우트 뉴스와 활동 기록</p><div class="topic-links"><a href="/">홈</a><a href="/about">운영 주체</a><a href="/editorial-policy">편집 정책</a><a href="/rss.xml">RSS</a></div></footer>
</body></html>`;
  return new Response(headOnly ? null : html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

function formatPublicDate(post) {
  const raw = String(post.publish_at || post.created_at || '');
  const date = new Date(raw.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(raw) ? '' : (post.publish_at ? '+09:00' : 'Z')));
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
