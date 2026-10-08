import { buildShareMetaBlock, getResolvedShareImage, loadSiteMeta } from '../_shared/site-meta.js';
import { resolvePostImageUrl } from '../_shared/images.js';
import { normalizeImageFrame } from '../_shared/image-frame.js';
import { ASSET_VERSION, SITE_VERSION, ADMIN_VERSION } from '../_shared/build-version.js';

export const SCOUT_TOPICS = [
  {
    slug: 'cub-scouts', name: '컵스카우트', english: 'Cub Scouts',
    age: '6~12세', tagline: '함께 놀며 배우는 첫 모험', lead: '친구와 함께 발견하고, 작은 도전으로 자신감을 키워요.',
    activities: [["협동과 배려", "단체 활동에서 친구의 생각을 듣고 함께 힘을 모읍니다."], ["모험과 발견", "새로운 환경을 탐색하며 호기심을 활동으로 이어갑니다."], ["진급과 취미장", "관심 있는 과제에 도전하며 성취를 하나씩 쌓습니다."]],
    aliases: ['컵스카우트', 'Cub Scout'],
    intro: '컵스카우트는 한국스카우트연맹 부문별 소개 기준 6~12세 어린이를 위한 단계입니다. 단체 활동과 모험, 진급·취미장 활동을 통해 협동심과 성취감을 기릅니다.',
    focus: '친구들과 함께 도전하고 서로 돕는 경험을 쌓습니다. 배려와 소통, 자기 발전, 모험과 봉사 등 다양한 교육 목표를 활동에 담습니다.',
    question: '컵스카우트는 어떤 활동을 하나요?',
    answer: '어린이의 관심과 발달 단계에 맞춘 단체 활동과 체험 프로그램에 참여합니다. 아래 기사에서 야외활동, 환경교육, 캠프 등 국내외 컵스카우트의 실제 사례를 찾아볼 수 있습니다.',
  },
  {
    slug: 'scouts', name: '스카우트', english: 'Scouts',
    age: '12~15세', tagline: '함께 계획하고 실천하는 성장', lead: '나의 관심과 개성을 살리고, 함께하는 활동으로 세상을 배워요.',
    activities: [["대원이 중심인 활동", "자신의 관심을 표현하고 프로그램에 주도적으로 참여합니다."], ["개성과 협력", "서로 다른 강점을 발견하고 친구들과 힘을 모읍니다."], ["지역사회 봉사", "공동체에 필요한 일을 실천하며 기여하는 기쁨을 배웁니다."]],
    aliases: ['스카우트', 'Scout'],
    intro: '스카우트는 한국스카우트연맹 부문별 소개 기준 12~15세 청소년을 위한 단계입니다. 대원이 중심이 되는 프로그램과 사회봉사로 개성을 살리고 공동체에 기여합니다.',
    focus: '자신의 관심을 활동으로 연결하고 친구들과 함께 실천합니다. 사회봉사에 참여하며 성취감을 얻고 각자의 개성을 발전시킵니다.',
    question: '스카우트와 컵스카우트는 어떻게 다른가요?',
    answer: '한국스카우트연맹은 컵스카우트, 스카우트, 벤처스카우트를 서로 다른 성장 단계로 소개합니다. 스카우트라는 말은 전체 운동을 뜻할 때도 쓰이므로, 기사에 등장하는 국가와 단계, 참가 대상을 함께 살펴보면 좋습니다.',
  },
  {
    slug: 'venture-scouts', name: '벤처스카우트', english: 'Venture Scouts',
    age: '15~18세', tagline: '스스로 선택하고 이끄는 도전', lead: '내가 세운 목표를 직접 계획하고 실행하며 책임감을 키워요.',
    activities: [["자율적인 계획", "목표와 관심에 맞는 프로그램을 선택하고 구상합니다."], ["자기관리와 리더십", "시간·계획·체력을 관리하며 주변의 모범이 되는 경험을 쌓습니다."], ["환경과 사회공헌", "환경보전과 봉사를 활동에 연결해 변화를 실천합니다."]],
    aliases: ['벤처스카우트', 'Venture Scout', 'Venturer'],
    intro: '벤처스카우트는 한국스카우트연맹 부문별 소개 기준 15~18세 청소년을 위한 단계입니다. 관심과 목표에 따라 활동을 선택하고 직접 구상하며 자율성과 책임감을 기릅니다.',
    focus: '대원이 프로그램을 선택하고 계획합니다. 자기관리, 리더십, 환경과 사회공헌 등을 진급과제와 연결하며 활동의 준비부터 실행까지 참여합니다.',
    question: '벤처스카우트 활동 소식은 어디에서 보나요?',
    answer: '이 페이지는 BP미디어 기사 중 벤처스카우트를 언급한 소식을 최신순으로 모읍니다. 행사와 국제 교류, 청소년 활동의 구체적인 참가 조건은 각 기사에 표시된 원문 공고를 확인하세요.',
  },
  {
    slug: 'rover-scouts', name: '로버스카우트', english: 'Rover Scouts',
    age: '18~24세', tagline: '봉사와 탐험으로 넓히는 세계', lead: '사회에 기여하고 새로운 도전에 나서며 나만의 길을 만들어 가요.',
    activities: [["사회에 대한 봉사", "공동체에 필요한 역할을 찾아 적극적으로 참여합니다."], ["챌린지와 탐험", "낯선 도전과 어려움을 스스로 극복하는 경험을 쌓습니다."], ["진취적인 삶의 준비", "봉사와 도전에서 얻은 경험을 앞으로의 삶에 연결합니다."]],
    aliases: ['로버스카우트', 'Rover Scout', 'Rover Moot', 'Rovermoot', '로버무트'],
    intro: '로버스카우트는 한국스카우트연맹 부문별 소개 기준 18~24세 청년층을 안내하는 부문입니다. 사회봉사와 챌린지·탐험활동으로 공동체에 기여하고 진취적인 삶을 준비합니다.',
    focus: '한국스카우트연맹은 로버스카우트를 지도자 소개에서 설명합니다. 봉사를 실천하고 도전과 탐험을 통해 스스로 어려움을 극복하는 경험을 쌓습니다.',
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
    const result = await env.DB.prepare(`SELECT id, title, subtitle, image_url, image_frame, publish_at, created_at FROM posts
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
  <link rel="stylesheet" href="/css/topics.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/chatbot.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/dark-mode.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/css/m3-site.css?v=${ASSET_VERSION}">
  <style>.nav[data-managed-nav]{visibility:hidden;opacity:0}</style>
  <noscript><style>.nav[data-managed-nav]{visibility:visible!important;opacity:1!important}.nav[data-managed-nav] a{font-size:0!important}.nav[data-managed-nav] a::before{content:attr(data-fallback-label);font-size:12px}</style></noscript>
</head><body class="topic-page">
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <header class="masthead">
    <div class="masthead-top">
      <div class="masthead-date" id="today-date"></div>
      <div class="masthead-logo">
        <a href="/">
          <div class="masthead-logo-row">
            <img src="/img/logo.svg" alt="" class="masthead-logo-img" aria-hidden="true">
            <p class="masthead-wordmark">BP미디어</p>
          </div>
          <div class="sub">bpmedia.net</div>
        </a>
      </div>
      <div class="masthead-right">
        <div class="masthead-stats" id="masthead-stats"></div>
        <div class="lang-toggle" role="group" aria-label="언어 선택">
          <button class="lang-btn active" id="lang-btn-ko" data-lang-toggle="ko" aria-pressed="true" aria-label="한국어">KOR</button>
          <button class="lang-btn" id="lang-btn-en" data-lang-toggle="en" aria-pressed="false" aria-label="English">ENG</button>
        </div>
        <div class="masthead-search">
          <input type="text" id="mh-search-input" class="mh-search-input" placeholder="검색…" autocomplete="off" aria-label="사이트 검색어 입력" />
          <button class="mh-search-btn" id="mh-search-btn" aria-label="검색"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
        </div>
      </div>
    </div>
    <nav class="nav" data-managed-nav>
      <a href="/contributors" data-i18n="nav.contributors" data-fallback-label="도움을 주신 분들"></a>
      <a href="/" data-i18n="nav.home" data-fallback-label="홈"></a>
      <a href="/latest" data-i18n="nav.latest" data-fallback-label="최신 소식"></a>
      <a href="/jamboree16" data-i18n="nav.jamboree16" data-fallback-label="제16회 한국잼버리"></a>
      <a href="/korea" data-i18n="nav.korea" data-fallback-label="Korea"></a>
      <a href="/apr" data-i18n="nav.apr" data-fallback-label="APR"></a>
      <a href="/wosm" data-i18n="nav.wosm" data-fallback-label="World"></a>
      <a href="/wosm-members" data-i18n="nav.wosm_members" data-fallback-label="세계연맹 회원국 현황"></a>
      <a href="/people" data-i18n="nav.people" data-fallback-label="스카우트 인물"></a>
      <a href="/calendar" data-i18n="nav.calendar" data-fallback-label="캘린더"></a>
      <a href="/glossary" data-i18n="nav.glossary" data-fallback-label="용어집"></a>
      <a href="/memorabilia" data-i18n="nav.memorabilia" data-fallback-label="스카우트 기념품 도감"></a>
    </nav>
  </header>
  <main id="main-content" class="topic-wrap">
    <nav aria-label="스카우트 활동 단계" class="topic-stage-grid">${SCOUT_TOPICS.map(item => `<a class="topic-stage-card" href="/topics/${item.slug}"${item.slug === topic.slug ? ' aria-current="page"' : ''}>
      <img src="/img/topics/${item.slug}.webp?v=${ASSET_VERSION}" alt="" width="1536" height="1024" decoding="async">
      <span class="topic-stage-body"><span class="topic-stage-heading">${item.name}<span class="topic-age">${item.age}</span></span><span class="topic-stage-caption">${item.tagline}</span><span class="topic-stage-state">${item.slug === topic.slug ? '지금 보고 있어요' : '활동 알아보기'} <span aria-hidden="true">↗</span></span></span>
    </a>`).join('')}</nav>
    <section class="topic-intro" aria-labelledby="topic-title">
      <div class="topic-intro-copy"><p class="topic-eyebrow">스카우트 활동 안내 · ${topic.english}</p>
      <h1 id="topic-title">${topic.name}</h1><p class="topic-lead">${topic.lead}</p>
      <p class="topic-intro-summary">${topic.intro}</p>
      <div class="topic-links"><a href="#topic-activities">활동 살펴보기 ↓</a><a href="#topic-news">관련 소식 읽기 ↓</a></div></div>
      <figure class="topic-hero-art"><img src="/img/topics/${topic.slug}.webp?v=${ASSET_VERSION}" width="1536" height="1024" alt="${topic.tagline}을 표현한 일러스트" fetchpriority="high" decoding="async"><figcaption>활동의 분위기를 담은 AI 일러스트</figcaption></figure>
    </section>
    <div class="topic-guide">
      <section id="topic-activities" aria-labelledby="activities-heading"><p class="topic-eyebrow">활동으로 배우고, 경험으로 성장해요</p><h2 id="activities-heading">${topic.name}의 활동과 성장</h2><p class="topic-section-copy">${topic.focus}</p>
        <div class="topic-activity-grid">${topic.activities.map(([heading,copy],i)=>`<article class="topic-activity-card"><span class="topic-step" aria-hidden="true">0${i+1}</span><h3>${heading}</h3><p>${copy}</p></article>`).join('')}</div>
      </section>
      <div class="topic-practical-grid"><section class="topic-question"><p class="topic-eyebrow">궁금한 이야기</p><h2>${topic.question}</h2><p>${topic.answer}</p><a href="/glossary">스카우트 용어집에서 더 알아보기 →</a></section>
      <section class="topic-join"><p class="topic-eyebrow">첫 활동을 준비한다면</p><h2>참여 전, 이렇게 확인하세요</h2>
        <ol><li><strong>나에게 맞는 부문 찾기</strong><span>이 페이지에서 연령 안내와 활동의 특징을 살펴보세요.</span></li><li><strong>지역의 단위대와 일정 확인하기</strong><span>한국스카우트연맹 가입 상담으로 거주 지역의 활동과 신청 절차를 확인하세요.</span></li><li><strong>행사별 참가 조건 확인하기</strong><span>국내외 행사는 주최 측의 연령·일정·준비물 안내를 따르세요.</span></li></ol>
        <a href="https://www.scout.or.kr/login">한국스카우트연맹 가입 상담 안내 ↗</a>
      </section></div>
      <aside class="topic-source"><strong>안내 기준과 참고 자료</strong><p><a href="https://scout.or.kr/intro/scouts">한국스카우트연맹 부문별 공식 소개 ↗</a>${topic.slug === 'rover-scouts' ? ' · <a href="https://www.scout.org/what-we-do/world-scout-events/world-scout-moot">WOSM 세계스카우트무트 안내 ↗</a>' : ''}</p><p class="topic-note">확인일 2026년 10월 8일. 연령은 부문별 소개의 안내 기준이며, 등록과 행사 참가 조건은 해당 공고를 따릅니다.${topic.slug === 'rover-scouts' ? ' 한국스카우트연맹은 로버스카우트를 지도자 소개에서 설명합니다.' : ''} BP미디어는 독립 미디어이며 연맹의 공식 가입 접수처가 아닙니다.</p></aside>
    </div>
    <section id="topic-news" aria-labelledby="news-heading"><h2 id="news-heading">${topic.name} 관련 최신 소식</h2>
      <p>국내외 기사에서 이 주제를 언급한 소식을 최신순으로 모았습니다. 행사 일정과 참가 대상은 기사 원문에서 확인하세요.</p>
      <div class="topic-news-grid">${posts.length ? posts.map(post => `<article class="topic-news-card">
        ${resolvePostImageUrl(origin,post.id,post.image_url) ? `<a class="topic-news-image" href="/post/${post.id}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(resolvePostImageUrl(origin,post.id,post.image_url))}" alt="" width="640" height="400" loading="lazy" decoding="async" style="object-position:${normalizeImageFrame(post.image_frame)?.x ?? 50}% ${normalizeImageFrame(post.image_frame)?.y ?? 50}%"></a>` : ''}
        <div class="topic-news-body"><p class="topic-note">${escapeHtml(formatPublicDate(post))}</p>
        <h3><a href="/post/${post.id}">${escapeHtml(post.title)}</a></h3>
        ${post.subtitle ? `<p>${escapeHtml(post.subtitle)}</p>` : ''}
        <a href="/post/${post.id}" class="topic-read">기사 읽기 →</a></div>
      </article>`).join('') : '<p>아직 관련 기사가 없습니다. 새로운 소식이 올라오면 여기에 표시됩니다.</p>'}</div>
      <p><a href="/search?q=${encodeURIComponent(topic.name)}">${topic.name} 기사 더 찾아보기 →</a></p>
    </section>
  </main>
    <footer>
    <div class="footer-inner">
      <div class="footer-brand">
        <h4 data-footer-role="title">BP미디어</h4>
        <p data-footer-role="description">BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.</p>
        <p data-footer-role="domain" style="margin-top:6px;">bpmedia.net</p>
        <p>기사제보: <!--email_off--><a data-footer-role="tip-email" href="mailto:story@bpmedia.net">story@bpmedia.net</a><!--/email_off--></p>
        <p>문의: <!--email_off--><a data-footer-role="contact-email" href="mailto:info@bpmedia.net">info@bpmedia.net</a><!--/email_off--></p>
        <p class="footer-about-link"><a href="/about">About us</a></p>
        <p class="footer-privacy-link"><a href="/privacy" data-footer-role="privacy-link">개인정보 처리방침</a></p>
      </div>
      <div class="footer-admin">
        <h4>관리자</h4>
        <a href="/admin.html">관리자 페이지 →</a>
        <a href="/glossary-raw">용어집 RAW로 보기 →</a>
        <p class="footer-build">Site <span class="site-build-version">V${SITE_VERSION}</span> · Admin <span class="admin-build-version">V${ADMIN_VERSION}</span></p>
      </div>
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">© 2026 BP미디어 · bpmedia.net</p>
        <p class="footer-credit">기록·편집 <a href="/about">박지민 (Jimmy Park)</a></p>
        <p data-i18n="footer.disclaimer">BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다.</p>
      </div>
    </div>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js" integrity="sha384-eEu5CTj3qGvu9PdJuS+YlkNi7d2XxQROAFYOr59zgObtlcux1ae1Il3u7jvdCSWu" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="/js/main.js?v=${ASSET_VERSION}"></script>
  <script src="/js/site-chrome.js?v=${ASSET_VERSION}"></script>
  <script src="/js/chatbot.js?v=${ASSET_VERSION}" defer></script>
  <script>GW.bootstrapStandardPage();</script>
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
