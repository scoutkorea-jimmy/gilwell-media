import { verifyTokenRole, extractToken } from '../_shared/auth.js';
import { getLikeStats, getViewerKey, isLikelyNonHumanRequest, recordUniqueView } from '../_shared/engagement.js';
import { getYouTubeEmbedUrl } from '../_shared/youtube.js';
import { ADSENSE_ACCOUNT } from '../_shared/site-meta.js';
import { findRelatedPosts } from '../_shared/related-posts.js';
import { findSpecialFeaturePosts, slugifySpecialFeature } from '../_shared/special-features.js';

/**
 * Gilwell Media · Individual Post Page
 *
 * GET /post/:id  — server-side rendered HTML for SEO
 *
 * Returns a full HTML page with:
 *  - <title> set to the post title
 *  - <meta name="description"> from subtitle
 *  - <meta name="keywords"> from meta_tags
 *  - Open Graph tags (og:title, og:description, og:image)
 *  - Full post content rendered from Editor.js JSON
 */

const CATEGORIES = {
  korea: { label: 'Korea / KSA', color: '#0094B4' },
  apr:   { label: 'APR',         color: '#FF5655' },
  wosm:  { label: 'WOSM', color: '#248737' },
  people:{ label: 'Scout People', color: '#8A5A2B' },
  glossary:{ label: 'Glossary', color: '#5D6F2B' },
};

export async function onRequestGet({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return notFound();
  }

  let post, disclaimerRow;
  try {
    [post, disclaimerRow] = await Promise.all([
      env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first(),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_disclaimer'").first(),
    ]);
  } catch (err) {
    console.error('GET /post/:id DB error:', err);
    return errorPage();
  }
  const aiDisclaimer = disclaimerRow?.value || '본 글은 AI의 도움을 받아 작성되었습니다.';

  if (!post) return notFound();
  let isAdmin = false;
  if (post.published === 0) {
    const token = extractToken(request);
    isAdmin = token ? await verifyTokenRole(token, env.ADMIN_SECRET, 'full').catch(() => false) : false;
    if (!isAdmin) return notFound();
  }
  const viewerKey = await getViewerKey(request, env);
  if (!isAdmin && !isLikelyNonHumanRequest(request)) {
    const counted = await recordUniqueView(env, id, viewerKey).catch(() => false);
    if (counted) post.views = (post.views || 0) + 1;
  }
  const [likeStats, relatedPosts, specialFeaturePosts] = await Promise.all([
    getLikeStats(env, id, viewerKey),
    findRelatedPosts(env, post, 5),
    findSpecialFeaturePosts(env, post, 50),
  ]);

  const siteUrl  = new URL(request.url).origin;
  const cat      = CATEGORIES[post.category] || CATEGORIES.korea;
  const titleText = post.title || '';
  const subtitleText = post.subtitle || '';
  const title    = escapeHtml(titleText);
  const subtitle = escapeHtml(subtitleText);
  const descText = subtitleText || truncatePlain(post.content || '', 160);
  const desc     = escapeHtml(descText);
  const keywords = post.meta_tags ? escapeHtml(post.meta_tags) : '';
  const publicDateValue = post.publish_at || post.created_at;
  const publishedIso = toIsoString(publicDateValue);
  const modifiedIso = toIsoString(post.updated_at || post.created_at);
  const ogImage  = post.image_url
    ? (post.image_url.startsWith('http')
        ? escapeHtml(post.image_url)
        : `${siteUrl}/api/posts/${id}/image`)
    : '';
  const dateStr  = formatDate(publicDateValue);
  const renderedContent = renderContent(post.content || '');
  const bodyHtml = renderedContent.html;
  const bodyGalleryHtml = renderContentGallery(parseGalleryImages(post.gallery_images));
  const locationSectionHtml = renderPostLocationSection(post);
  const youtubeEmbedUrl = getYouTubeEmbedUrl(post.youtube_url);
  const postUrl  = `${siteUrl}/post/${id}`;
  const categoryUrl = `${siteUrl}/${post.category}.html`;
  const editSeed = serializeForScript({
    id,
    category: post.category,
    title: post.title || '',
    subtitle: post.subtitle || '',
    content: post.content || '',
    image_url: post.image_url || '',
    gallery_images: post.gallery_images || '',
    image_caption: post.image_caption || '',
    youtube_url: post.youtube_url || '',
    location_name: post.location_name || '',
    location_address: post.location_address || '',
    meta_tags: post.meta_tags || '',
    tag: post.tag || '',
    special_feature: post.special_feature || '',
    author: post.author || 'Editor A',
    ai_assisted: !!post.ai_assisted,
    publish_at: String(publicDateValue || '').replace(' ', 'T').slice(0, 16),
    publish_date: String(publicDateValue || '').slice(0, 10),
  });
  const isNew    = isTodayKst(publicDateValue);
  const articleJsonLd = buildArticleStructuredData({
    title: post.title,
    description: descText,
    url: postUrl,
    categoryUrl,
    image: ogImage,
    datePublished: publishedIso,
    dateModified: modifiedIso,
    author: post.author,
    category: cat.label,
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — BP미디어</title>
  <meta name="google-adsense-account" content="${ADSENSE_ACCOUNT}"/>
  <meta name="robots" content="index,follow,max-image-preview:large"/>
  <meta name="description" content="${desc}"/>
  <meta name="author" content="${escapeHtml(post.author || 'Editor.A')}"/>
  ${keywords ? `<meta name="keywords" content="${keywords}"/>` : ''}
  <meta property="og:locale"      content="ko_KR"/>
  <meta property="og:type"        content="article"/>
  <meta property="og:title"       content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:url"         content="${postUrl}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:site_name"   content="BP미디어 · bpmedia.net"/>
  <meta property="article:published_time" content="${escapeHtml(publishedIso)}"/>
  <meta property="article:modified_time" content="${escapeHtml(modifiedIso)}"/>
  <meta property="article:section" content="${escapeHtml(cat.label)}"/>
  <meta name="twitter:card"       content="${ogImage ? 'summary_large_image' : 'summary'}"/>
  <meta name="twitter:title"      content="${title}"/>
  <meta name="twitter:description" content="${desc}"/>
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}"/>` : ''}
  <link rel="canonical" href="${postUrl}"/>
  ${ogImage ? `<link rel="preload" as="image" href="${ogImage}"/>` : ''}
  <script type="application/ld+json">${articleJsonLd}</script>
  <link rel="icon" type="image/svg+xml" href="/img/favicon.svg"/>
  <link rel="icon" type="image/png" sizes="48x48" href="/img/favicon-48.png"/>
  <link rel="apple-touch-icon" href="/img/logo.png"/>
  <link rel="shortcut icon" href="/img/favicon-48.png"/>
  <link rel="stylesheet" href="/css/style.css?v=0.074.00">
</head>
<body class="post-page">
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>

  <div class="post-mobile-header" aria-label="기사 페이지 모바일 상단">
    <div class="post-mobile-header-bar">
      <a href="javascript:history.back()" class="post-mobile-back" aria-label="뒤로가기">←</a>
      <a href="/" class="post-mobile-brand" aria-label="BP미디어 홈으로 이동">
        <img src="/img/logo.svg" alt="" class="post-mobile-brand-mark" aria-hidden="true">
        <span class="post-mobile-brand-text">BP미디어</span>
      </a>
      <div class="post-mobile-header-actions">
        <a href="/${post.category}.html" class="post-mobile-section-chip">${cat.label}</a>
        <a href="/search.html" class="post-mobile-search" aria-label="검색">⌕</a>
      </div>
    </div>
    <nav class="post-mobile-quicknav" aria-label="빠른 이동">
      <a href="/latest">최신</a>
      <a href="/korea">Korea</a>
      <a href="/apr">APR</a>
      <a href="/wosm">WOSM</a>
      <a href="/people">인물</a>
    </nav>
  </div>

  <!-- ── MASTHEAD ── -->
  <header class="masthead">
    <div class="masthead-top">
      <div class="masthead-date" id="today-date"></div>
      <div class="masthead-logo">
        <a href="/">
          <div class="masthead-logo-row">
            <img src="/img/logo.svg" alt="" class="masthead-logo-img" aria-hidden="true">
            <h1>BP미디어</h1>
          </div>
          <div class="sub">bpmedia.net</div>
        </a>
      </div>
      <div class="masthead-right">
        <div class="masthead-stats" id="masthead-stats"></div>
        <div class="lang-toggle">
          <button class="lang-btn active" id="lang-btn-ko" onclick="GW.setLang('ko')">KOR</button>
          <button class="lang-btn" id="lang-btn-en" onclick="GW.setLang('en')">ENG</button>
        </div>
        <div class="masthead-search">
          <input type="text" id="mh-search-input" class="mh-search-input" placeholder="검색…" autocomplete="off" aria-label="사이트 검색어 입력" />
          <button class="mh-search-btn" id="mh-search-btn" aria-label="검색"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
        </div>
      </div>
    </div>
    <nav class="nav">
      <a href="/contributors.html" data-i18n="nav.contributors">도움을 주신 분들</a>
      <a href="/" data-i18n="nav.home">홈</a>
      <a href="/latest" data-i18n="nav.latest">1개월 소식</a>
      <a href="/korea" data-i18n="nav.korea">Korea</a>
      <a href="/apr" data-i18n="nav.apr">APR</a>
      <a href="/wosm" data-i18n="nav.wosm">WOSM</a>
      <a href="/people" data-i18n="nav.people">스카우트 인물</a>
      <a href="/glossary" data-i18n="nav.glossary">용어집</a>
    </nav>
  </header>

  <!-- ── TICKER ── -->
  <div class="ticker">
    <div class="ticker-inner" id="ticker-inner">
      길웰 미디어 · The BP Post · bpmedia.net
      &nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;
      길웰 미디어 · The BP Post · bpmedia.net
      &nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;
    </div>
  </div>

  <!-- ── ARTICLE ── -->
  <main id="main-content" class="post-page-wrap">
    <div class="post-page-layout">

      <!-- ── Main Content ── -->
      <div class="post-page-main">

        <div class="post-page-back">
          <a href="javascript:history.back()" class="post-page-back-link">← 뒤로가기</a>
          <a href="/${post.category}.html" class="post-page-back-link" style="margin-left:16px;">
            <span style="display:inline-block;background:${cat.color};color:#fff;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;padding:2px 7px;font-family: AliceDigitalLearning, sans-serif;">${cat.label}</span>
          </a>
        </div>

        <h1 class="post-page-title">${title}</h1>
        ${subtitle ? `<p class="post-page-subtitle">${subtitle}</p>` : ''}
        <div class="post-page-meta">
          <span class="category-tag" style="background:${cat.color};">${cat.label}</span>
          ${isNew ? `<span class="post-kicker post-kicker-new">NEW</span>` : ''}
          ${post.tag ? post.tag.split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="post-kicker tag-${post.category}-kicker">${escapeHtml(t)}</span>`).join('') : ''}
          <span>${dateStr}</span>
          ${post.author ? `<span>by ${escapeHtml(post.author)}</span>` : ''}
        </div>
        <div class="post-page-share">
          <button id="post-share-btn" class="post-action-btn" type="button">공유하기</button>
          <button id="post-edit-btn" class="post-action-btn" type="button">수정하기</button>
        </div>

        ${post.image_url ? renderPostCover(post, id, title) : ''}
        ${youtubeEmbedUrl ? `<div class="post-page-video">${renderYouTubeEmbed(youtubeEmbedUrl, post.title)}</div>` : ''}

        <div class="post-page-body modal-body">
          ${bodyHtml}
        </div>
        ${bodyGalleryHtml}
        ${locationSectionHtml}

        ${keywords ? `<div class="post-page-tags"><span style="font-family: AliceDigitalLearning, sans-serif;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;">Tags:</span> ${post.meta_tags.split(',').map(t => `<span class="post-page-tag">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
        ${renderSpecialFeatureSection(post, specialFeaturePosts)}
        ${renderRelatedPostsSection(relatedPosts, false)}

        ${post.ai_assisted ? `<div class="ai-disclaimer">${escapeHtml(aiDisclaimer)}</div>` : ''}

        <div class="post-byline">
          ${post.author ? `<span class="post-byline-author">작성자 · ${escapeHtml(post.author)}</span>` : ''}
          <span class="post-like-wrap">
            <button id="post-like-btn" class="post-like-btn${likeStats.liked ? ' liked' : ''}"${likeStats.liked ? ' disabled' : ''}>❤ 공감 <span id="post-like-count">${likeStats.likes}</span></button>
            <span class="post-like-help">${likeStats.liked ? '이미 공감한 기사입니다' : '한 IP당 1회 공감할 수 있습니다'}</span>
          </span>
          <span class="post-byline-report">오류제보 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></span>
        </div>

      </div>

      ${renderRelatedPostsSection(relatedPosts, true)}

      <!-- ── Sidebar ── -->
      <aside class="post-page-sidebar">

        <div class="pps-section">
          <p class="pps-label">섹션</p>
          <a href="/${post.category}.html" class="pps-category" style="background:${cat.color};">${cat.label}</a>
        </div>

        <div class="pps-section">
          <p class="pps-label">정보</p>
          ${post.author ? `<div class="pps-row"><span class="pps-key">작성자</span><span class="pps-val">${escapeHtml(post.author)}</span></div>` : ''}
          <div class="pps-row"><span class="pps-key">게시일</span><span class="pps-val">${dateStr}</span></div>
          <div class="pps-row"><span class="pps-key">조회수</span><span class="pps-val">${post.views || 0}</span></div>
          ${post.ai_assisted ? `<div class="pps-row"><span class="pps-key">AI</span><span class="pps-val" style="color:#622599;">AI 지원 작성</span></div>` : ''}
        </div>

        ${post.meta_tags ? `
        <div class="pps-section">
          <p class="pps-label">태그</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${post.meta_tags.split(',').map(t => `<span class="post-page-tag">${escapeHtml(t.trim())}</span>`).join('')}
          </div>
        </div>` : ''}

      </aside>

    </div>
  </main>

  <!-- ── FOOTER ── -->
  <footer>
    <div class="footer-inner">
      <div class="footer-brand">
        <h4 data-footer-role="title">BP미디어</h4>
        <p data-footer-role="description">BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.</p>
        <p data-footer-role="domain" style="margin-top:6px;">bpmedia.net</p>
        <p>기사제보: <a data-footer-role="tip-email" href="mailto:story@bpmedia.net">story@bpmedia.net</a></p>
        <p>문의: <a data-footer-role="contact-email" href="mailto:info@bpmedia.net">info@bpmedia.net</a></p>
      </div>
      <div class="footer-admin">
        <h4>관리자</h4>
        <a href="/admin.html">관리자 페이지 →</a>
        <a href="/glossary-raw">용어집 RAW로 보기 →</a>
        <p class="footer-build">Build <span class="site-build-version">V0.074.00</span></p>
      </div>
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">© 2026 BP미디어 · bpmedia.net</p>
        <p data-i18n="footer.disclaimer">BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다.</p>
      </div>
    </div>
  </footer>

  <!-- ── 수정 로그인 모달 ── -->
  <div id="post-login-modal" class="board-pw-overlay" aria-hidden="true">
    <div class="board-pw-box" role="dialog" aria-modal="true" aria-labelledby="post-login-title">
      <h3 id="post-login-title" class="board-pw-header">관리자 인증</h3>
      <p class="board-pw-desc">수정하려면 관리자 비밀번호를 입력하세요.</p>
      <input id="post-login-pw" type="password" placeholder="비밀번호" autocomplete="current-password">
      <div id="post-login-turnstile" style="margin-top:12px;"></div>
      <div class="board-pw-actions">
        <button id="post-login-submit-btn" type="button" onclick="window._postLoginSubmit()">확인</button>
        <button type="button" onclick="window._closePostLogin()">취소</button>
      </div>
      <p id="post-login-err" class="board-pw-error"></p>
    </div>
  </div>

  <div id="post-edit-overlay" class="board-write-overlay" aria-hidden="true">
    <div class="board-write-box post-edit-box" role="dialog" aria-modal="true" aria-labelledby="post-edit-title">
      <button class="board-write-close" type="button" aria-label="수정 모달 닫기" onclick="window._closePostEdit()">×</button>
      <div class="board-write-header" id="post-edit-title">기사 수정</div>
      <div class="board-write-cat" id="post-edit-category-chip" style="background:${cat.color};">${cat.label}</div>

      <div class="form-row">
        <div class="form-group">
          <label for="post-edit-category">카테고리</label>
          <select id="post-edit-category">
            <option value="korea">Korea</option>
            <option value="apr">APR</option>
            <option value="wosm">WOSM</option>
            <option value="people">Scout People</option>
          </select>
        </div>
        <div class="form-group">
          <label for="post-edit-author">작성자</label>
          <select id="post-edit-author"><option>불러오는 중…</option></select>
        </div>
      </div>

      <div class="form-group">
        <label for="post-edit-title-input">제목</label>
        <input type="text" id="post-edit-title-input" maxlength="200" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="post-edit-date">퍼블리싱 시각</label>
          <input type="datetime-local" id="post-edit-date" />
        </div>
        <div class="form-group">
          <label for="post-edit-youtube">유튜브 링크</label>
          <input type="url" id="post-edit-youtube" placeholder="https://youtu.be/..." />
        </div>
      </div>

      <div class="form-group">
        <label for="post-edit-subtitle-input">부제목</label>
        <textarea id="post-edit-subtitle-input" rows="3" maxlength="300"></textarea>
      </div>

      <div class="form-group">
        <label for="post-edit-special-feature">특집 기사 묶음명</label>
        <input type="text" id="post-edit-special-feature" maxlength="120" placeholder="예: 세계잼버리 리더십 특집">
      </div>

      <div class="form-group">
        <label>글머리 태그</label>
        <div id="post-tag-selector" class="tag-pill-group"><span class="post-edit-note">불러오는 중…</span></div>
        <div class="public-tag-add-tools">
          <input type="text" id="post-tag-new-input" maxlength="30" placeholder="현재 카테고리에 새 태그 추가" />
          <button type="button" id="post-tag-new-btn" class="public-inline-tag-add">태그 추가</button>
        </div>
      </div>

      <div class="form-group">
        <label>대표 이미지</label>
        <div class="cover-upload-wrap">
          <button id="post-cover-btn" type="button" class="cover-upload-btn">이미지 선택</button>
          <div id="post-cover-preview"></div>
          <p class="post-edit-note">대표 이미지는 유지하거나 새 이미지로 교체할 수 있습니다.</p>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="post-edit-image-caption">이미지 캡션</label>
          <input type="text" id="post-edit-image-caption" maxlength="300" />
        </div>
        <div class="form-group">
          <label for="post-edit-metatags-input">SEO 해시태그</label>
          <input type="text" id="post-edit-metatags-input" placeholder="쉼표로 구분" maxlength="500" />
        </div>
      </div>

      <div class="form-group">
        <label>본문</label>
        <div id="post-edit-editorjs" class="post-edit-editor-holder"></div>
      </div>

      <div class="form-group">
        <label>슬라이드 전용 이미지 <span class="admin-label-note" id="post-gallery-count">0/10</span></label>
        <div class="cover-upload-wrap">
          <button type="button" class="cover-upload-btn" onclick="window._postUploadGallery()">🖼 슬라이드 이미지 선택</button>
          <div id="post-gallery-preview" class="gallery-upload-preview"><p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에서만 별도 슬라이드로 노출됩니다.</p></div>
        </div>
        <p class="post-edit-note">본문 아래 별도 슬라이드로 노출되며 2장 이상일 때만 활성화됩니다.</p>
      </div>

      <details class="location-form-toggle" id="post-location-toggle">
        <summary>위치 정보 추가</summary>
        <div class="location-form-fields">
          <div class="form-group">
            <label for="post-edit-location-name">위치 이름</label>
            <input type="text" id="post-edit-location-name" maxlength="120" placeholder="예: 강원특별자치도 세계잼버리수련장" />
          </div>
          <div class="form-group">
            <label for="post-edit-location-address">주소</label>
            <input type="text" id="post-edit-location-address" maxlength="300" placeholder="예: 강원특별자치도 고성군 토성면 ..." />
            <p class="post-edit-note">기사 하단에 접힘형 지도 섹션으로 노출됩니다. 비워두면 표시되지 않습니다.</p>
          </div>
        </div>
      </details>

      <div class="post-edit-check">
        <input type="checkbox" id="post-edit-ai-assisted" />
        <label for="post-edit-ai-assisted">AI 지원 여부</label>
      </div>

      <div class="post-edit-actions">
        <button id="post-edit-submit" class="submit-btn" type="button" onclick="window._postSaveEdit()">수정 완료</button>
        <button id="post-edit-cancel" class="cancel-btn visible" type="button" onclick="window._closePostEdit()">취소</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script src="/js/main.js?v=0.074.00"></script>
  <script>
    GW.bootstrapStandardPage();

    var _editPostId = ${id};
    var _sharePostUrl = ${JSON.stringify(postUrl)};
    var _sharePostTitle = ${JSON.stringify(titleText)};
    var _postEditSeed = ${editSeed};
    var _postTurnstileWidgetId = null;
    var _postEditState = {
      editor: null,
      editorLoading: false,
      coverImage: _postEditSeed.image_url || null,
      galleryImages: [],
      selectedTags: [],
      activeCategory: _postEditSeed.category || 'korea'
    };

    function _setBodyModalLock(locked) {
      document.body.style.overflow = locked ? 'hidden' : '';
    }

    function _parsePostTags(value) {
      return String(value || '')
        .split(',')
        .map(function (tag) { return tag.trim(); })
        .filter(Boolean);
    }

    function _stripLegacyHtml(html) {
      if (!html) return '';
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      return (tmp.textContent || tmp.innerText || '').trim();
    }

    function _createParagraphBlocks(text) {
      var normalized = String(text || '').replace(/\\r\\n/g, '\\n').trim();
      if (!normalized) return [];
      return normalized.split(/\\n{2,}/).map(function (chunk) {
        return {
          type: 'paragraph',
          data: {
            text: GW.escapeHtml(chunk).replace(/\\n/g, '<br>')
          }
        };
      });
    }

    function _parseEditorSeed(raw) {
      var text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) return { time: Date.now(), blocks: [] };
      if (text.charAt(0) === '{') {
        try {
          var parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.blocks)) return parsed;
        } catch (_) {}
      }
      if (/^</.test(text)) {
        text = _stripLegacyHtml(text);
      }
      return {
        time: Date.now(),
        blocks: _createParagraphBlocks(text)
      };
    }

    function _loadPostEditorAssets(callback) {
      if (window.EditorJS && window.Header && window.List && window.Quote) {
        callback();
        return;
      }
      if (_postEditState.editorLoading) {
        setTimeout(function () { _loadPostEditorAssets(callback); }, 120);
        return;
      }
      _postEditState.editorLoading = true;

      function loadScript(src, done) {
        var exists = document.querySelector('script[src="' + src + '"]');
        if (exists) {
          if (exists.dataset.loaded === '1') {
            done();
            return;
          }
          exists.addEventListener('load', done, { once: true });
          return;
        }
        var script = document.createElement('script');
        script.src = src;
        script.addEventListener('load', function () {
          script.dataset.loaded = '1';
          done();
        }, { once: true });
        document.head.appendChild(script);
      }

      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
        var pending = 3;
        function done() {
          pending -= 1;
          if (pending === 0) {
            _postEditState.editorLoading = false;
            callback();
          }
        }
        loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
        loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js', done);
        loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js', done);
      });
    }

    function _initPostEditor(callback) {
      _loadPostEditorAssets(function () {
        if (!_postEditState.editor) {
          _postEditState.editor = new window.EditorJS({
            holder: 'post-edit-editorjs',
            placeholder: '내용을 수정하세요...',
            tools: {
              header: {
                class: window.Header,
                config: { levels: [2, 3, 4], defaultLevel: 2 }
              },
              list: {
                class: window.List,
                inlineToolbar: true
              },
              quote: {
                class: window.Quote,
                inlineToolbar: true
              },
              image: {
                class: GW.makeEditorImageTool()
              }
            }
          });
        }
        _postEditState.editor.isReady
          .then(function () { callback(); })
          .catch(function () {
            GW.showToast('에디터를 불러오지 못했습니다', 'error');
          });
      });
    }

    function _fillPostAuthorOptions(editors) {
      var select = document.getElementById('post-edit-author');
      if (!select) return;
      var current = _postEditSeed.author || 'Editor A';
      select.innerHTML = GW.buildEditorOptions(editors || {});
      select.value = current;
    }

    function _syncPostCategoryChip(category) {
      var chip = document.getElementById('post-edit-category-chip');
      var meta = (GW.CATEGORIES && GW.CATEGORIES[category]) || GW.CATEGORIES.korea;
      if (!chip || !meta) return;
      chip.textContent = meta.label;
      chip.style.background = meta.color;
    }

    function _syncPostTagPills(selectedTags) {
      var selector = document.getElementById('post-tag-selector');
      if (!selector) return;
      selector.querySelectorAll('.tag-pill').forEach(function (pill) {
        var value = pill.getAttribute('data-tag') || '';
        if (!value) {
          pill.classList.toggle('active', selectedTags.length === 0);
          return;
        }
        pill.classList.toggle('active', selectedTags.indexOf(value) >= 0);
      });
    }

    function _renderPostTagSelector(items) {
      var selector = document.getElementById('post-tag-selector');
      if (!selector) return;
      var selected = _postEditState.selectedTags.filter(function (tag) {
        return items.indexOf(tag) >= 0;
      });
      _postEditState.selectedTags = selected;
      var html = '<button type="button" class="tag-pill' + (!selected.length ? ' active' : '') + '" data-tag="">없음</button>';
      items.forEach(function (tag) {
        var active = selected.indexOf(tag) >= 0 ? ' active' : '';
        html += '<button type="button" class="tag-pill' + active + '" data-tag="' + GW.escapeHtml(tag) + '">' + GW.escapeHtml(tag) + '</button>';
      });
      selector.innerHTML = html;
      selector.querySelectorAll('.tag-pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          var value = pill.getAttribute('data-tag') || '';
          if (!value) {
            _postEditState.selectedTags = [];
          } else {
            var idx = _postEditState.selectedTags.indexOf(value);
            if (idx >= 0) _postEditState.selectedTags.splice(idx, 1);
            else _postEditState.selectedTags.push(value);
          }
          _syncPostTagPills(_postEditState.selectedTags);
        });
      });
      _syncPostTagPills(_postEditState.selectedTags);
    }

    function _loadPostTagOptions(category) {
      var selector = document.getElementById('post-tag-selector');
      if (selector) selector.innerHTML = '<span class="post-edit-note">불러오는 중…</span>';
      fetch('/api/settings/tags?category=' + encodeURIComponent(category), { cache: 'no-store' })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          _renderPostTagSelector((data && data.items) || []);
        })
        .catch(function () {
          if (selector) selector.innerHTML = '<span class="post-edit-note">태그를 불러오지 못했습니다.</span>';
        });
    }

    function _addPostManagedTag() {
      var input = document.getElementById('post-tag-new-input');
      var value = (input && input.value || '').trim();
      if (!value) {
        GW.showToast('태그명을 입력해주세요', 'error');
        if (input) input.focus();
        return;
      }
      GW.addManagedTagToCategory(value, _postEditState.activeCategory)
        .then(function (result) {
          var selectedTag = result && result.selectedTag ? result.selectedTag : value;
          if (_postEditState.selectedTags.indexOf(selectedTag) < 0) {
            _postEditState.selectedTags.push(selectedTag);
          }
          return fetch('/api/settings/tags?category=' + encodeURIComponent(_postEditState.activeCategory), { cache: 'no-store' })
            .then(function (response) { return response.json(); })
            .then(function (data) {
              _renderPostTagSelector((data && data.items) || []);
              if (input) input.value = '';
              GW.showToast(result && result.created ? '태그를 추가하고 바로 선택했습니다' : '이미 있는 태그라서 바로 선택했습니다', 'success');
            });
        })
        .catch(function (err) {
          GW.showToast((err && err.message) || '태그를 추가하지 못했습니다', 'error');
        });
    }

    function _renderPostCoverPreview() {
      var preview = document.getElementById('post-cover-preview');
      if (!preview) return;
      if (!_postEditState.coverImage) {
        preview.innerHTML = '';
        return;
      }
      preview.innerHTML =
        '<img src="' + GW.escapeHtml(_postEditState.coverImage) + '" class="cover-preview-img" alt="대표 이미지 미리보기">' +
        '<button type="button" class="cover-remove-btn" id="post-cover-remove">이미지 제거</button>';
      var removeBtn = document.getElementById('post-cover-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          _postEditState.coverImage = null;
          _renderPostCoverPreview();
        });
      }
    }

    function _parsePostGallerySeed(raw) {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.map(function (item) {
          if (typeof item === 'string') return { url: item, caption: '' };
          return {
            url: item && typeof item.url === 'string' ? item.url : '',
            caption: item && typeof item.caption === 'string' ? item.caption : ''
          };
        }).filter(function (item) { return item.url; }).slice(0, 10);
      }
      try {
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(function (item) {
          if (typeof item === 'string') return { url: item, caption: '' };
          return {
            url: item && typeof item.url === 'string' ? item.url : '',
            caption: item && typeof item.caption === 'string' ? item.caption : ''
          };
        }).filter(function (item) { return item.url; }).slice(0, 10);
      } catch (_) {
        return [];
      }
    }

    function _renderPostGalleryPreview() {
      var preview = document.getElementById('post-gallery-preview');
      var count = document.getElementById('post-gallery-count');
      if (!preview) return;
      if (count) count.textContent = (_postEditState.galleryImages.length || 0) + '/10';
      if (!_postEditState.galleryImages.length) {
        preview.innerHTML = '<p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에서만 별도 슬라이드로 노출됩니다.</p>';
        return;
      }
      preview.innerHTML = _postEditState.galleryImages.map(function (item, idx) {
        return '' +
          '<div class="gallery-upload-item">' +
            '<img class="gallery-upload-thumb" src="' + GW.escapeHtml(item.url) + '" alt="슬라이드 이미지 ' + (idx + 1) + '">' +
            '<button type="button" class="gallery-upload-remove" data-idx="' + idx + '">제거</button>' +
          '</div>';
      }).join('');
      preview.querySelectorAll('.gallery-upload-remove').forEach(function (button) {
        button.addEventListener('click', function () {
          var idx = parseInt(button.getAttribute('data-idx') || '-1', 10);
          if (idx < 0) return;
          _postEditState.galleryImages.splice(idx, 1);
          _renderPostGalleryPreview();
        });
      });
    }

    window._postUploadCover = function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 })
          .then(function (result) {
            _postEditState.coverImage = result.dataUrl;
            _renderPostCoverPreview();
          })
          .catch(function (err) {
            GW.showToast((err && err.message) || '대표 이미지 처리에 실패했습니다', 'error');
          });
      });
      input.click();
    };

    window._postUploadGallery = function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call((input.files || []));
        if (!files.length) return;
        if ((_postEditState.galleryImages.length + files.length) > 10) {
          GW.showToast('슬라이드 이미지는 최대 10장까지 등록할 수 있습니다', 'error');
          return;
        }
        Promise.all(files.map(function (file) {
          return GW.optimizeImageFile(file, { maxW: 1800, maxH: 1800, quality: 0.84 });
        }))
          .then(function (results) {
            results.forEach(function (result) {
              _postEditState.galleryImages.push({ url: result.dataUrl, caption: '' });
            });
            _renderPostGalleryPreview();
          })
          .catch(function (err) {
            GW.showToast((err && err.message) || '슬라이드 이미지 처리에 실패했습니다', 'error');
          });
      });
      input.click();
    };

    function _populatePostEditForm() {
      document.getElementById('post-edit-category').value = _postEditSeed.category || 'korea';
      document.getElementById('post-edit-title-input').value = _postEditSeed.title || '';
      document.getElementById('post-edit-subtitle-input').value = _postEditSeed.subtitle || '';
      document.getElementById('post-edit-special-feature').value = _postEditSeed.special_feature || '';
      document.getElementById('post-edit-date').value = GW.toDatetimeLocalValue(_postEditSeed.publish_at || _postEditSeed.publish_date || '') || GW.getKstDateTimeInputValue();
      document.getElementById('post-edit-youtube').value = _postEditSeed.youtube_url || '';
      document.getElementById('post-edit-location-name').value = _postEditSeed.location_name || '';
      document.getElementById('post-edit-location-address').value = _postEditSeed.location_address || '';
      var locationToggle = document.getElementById('post-location-toggle');
      if (locationToggle) locationToggle.open = !!(_postEditSeed.location_name || _postEditSeed.location_address);
      document.getElementById('post-edit-image-caption').value = _postEditSeed.image_caption || '';
      document.getElementById('post-edit-metatags-input').value = _postEditSeed.meta_tags || '';
      document.getElementById('post-edit-ai-assisted').checked = !!_postEditSeed.ai_assisted;
      _postEditState.coverImage = _postEditSeed.image_url || null;
      _postEditState.galleryImages = _parsePostGallerySeed(_postEditSeed.gallery_images);
      _postEditState.selectedTags = _parsePostTags(_postEditSeed.tag);
      _postEditState.activeCategory = _postEditSeed.category || 'korea';
      _syncPostCategoryChip(_postEditState.activeCategory);
      _renderPostCoverPreview();
      _renderPostGalleryPreview();
      _loadPostTagOptions(_postEditState.activeCategory);
      _fillPostAuthorOptions({});
      GW.apiFetch('/api/settings/editors')
        .then(function (data) {
          _fillPostAuthorOptions((data && data.editors) || {});
        })
        .catch(function () {
          _fillPostAuthorOptions({});
        });
      _initPostEditor(function () {
        _postEditState.editor.render(_parseEditorSeed(_postEditSeed.content || '')).catch(function () {});
      });
    }

    window._closePostLogin = function () {
      var modal = document.getElementById('post-login-modal');
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      _setBodyModalLock(false);
      var err = document.getElementById('post-login-err');
      if (err) err.style.display = 'none';
      if (window.turnstile && _postTurnstileWidgetId != null) {
        window.turnstile.reset(_postTurnstileWidgetId);
      }
    };

    function _openPostLogin() {
      var modal = document.getElementById('post-login-modal');
      if (!modal) return;
      document.getElementById('post-login-pw').value = '';
      var err = document.getElementById('post-login-err');
      if (err) err.style.display = 'none';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      _setBodyModalLock(true);
      setTimeout(function () {
        var input = document.getElementById('post-login-pw');
        if (input) input.focus();
      }, 80);
      GW.loadTurnstile(function () {
        if (window.turnstile && GW.TURNSTILE_SITE_KEY && _postTurnstileWidgetId == null) {
          _postTurnstileWidgetId = window.turnstile.render('#post-login-turnstile', {
            sitekey: GW.TURNSTILE_SITE_KEY,
            theme: 'light'
          });
        }
      });
    }

    window._closePostEdit = function () {
      var overlay = document.getElementById('post-edit-overlay');
      if (!overlay) return;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      _setBodyModalLock(false);
    };

    function _openPostEdit() {
      var overlay = document.getElementById('post-edit-overlay');
      if (!overlay) return;
      _populatePostEditForm();
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      _setBodyModalLock(true);
      setTimeout(function () {
        var input = document.getElementById('post-edit-title-input');
        if (input) input.focus();
      }, 100);
    }

    window._sharePostLink = function() {
      GW.sharePostLink({
        url: _sharePostUrl,
        title: _sharePostTitle,
        text: _sharePostTitle
      }).catch(function(err) {
        GW.showToast((err && err.message) || '링크 공유에 실패했습니다', 'error');
      });
    };

    window._postEdit = function() {
      if (GW.getToken && GW.getToken() && GW.getAdminRole && GW.getAdminRole() === 'full') {
        _openPostEdit();
        return;
      }
      if (GW.getToken && GW.getToken()) {
        GW.clearToken();
        GW.showToast('수정 권한이 있는 관리자 비밀번호를 다시 입력해주세요', 'error');
      } else {
        GW.showToast('수정하려면 관리자 비밀번호를 입력해주세요', 'error');
      }
      _openPostLogin();
    };

    window._postLoginSubmit = function() {
      var pw = (document.getElementById('post-login-pw').value || '').trim();
      var err = document.getElementById('post-login-err');
      var submitBtn = document.getElementById('post-login-submit-btn');
      err.style.display = 'none';
      if (!pw) {
        err.textContent = '비밀번호를 입력하세요';
        err.style.display = 'block';
        GW.showToast('관리자 비밀번호를 입력해주세요', 'error');
        return;
      }
      var cfToken = '';
      if (_postTurnstileWidgetId != null && window.turnstile) {
        cfToken = window.turnstile.getResponse(_postTurnstileWidgetId) || '';
      }
      if (GW.TURNSTILE_SITE_KEY && !cfToken) {
        err.textContent = 'CAPTCHA를 완료해주세요';
        err.style.display = 'block';
        GW.showToast('CAPTCHA를 완료해주세요', 'error');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '확인 중…';
      GW.apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          password: pw,
          cf_turnstile_response: cfToken || undefined
        })
      })
        .then(function(data) {
          if (!data || !data.token || data.role !== 'full') {
            GW.clearToken();
            err.textContent = '수정 권한이 있는 관리자 계정만 사용할 수 있습니다';
            err.style.display = 'block';
            GW.showToast('수정 권한이 있는 관리자 비밀번호가 아닙니다', 'error');
            if (window.turnstile && _postTurnstileWidgetId != null) window.turnstile.reset(_postTurnstileWidgetId);
            return;
          }
          GW.setToken(data.token);
          GW.setAdminRole(data.role || 'full');
          window._closePostLogin();
          GW.showToast('관리자 인증이 확인되었습니다', 'success');
          _openPostEdit();
        })
        .catch(function(errObj) {
          var message = (errObj && errObj.message) || '비밀번호가 올바르지 않습니다';
          err.textContent = message;
          err.style.display = 'block';
          GW.showToast(message, 'error');
          if (window.turnstile && _postTurnstileWidgetId != null) window.turnstile.reset(_postTurnstileWidgetId);
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = '확인';
        });
    };

    window._postSaveEdit = function() {
      var submitBtn = document.getElementById('post-edit-submit');
      var category = document.getElementById('post-edit-category').value || 'korea';
      var title = (document.getElementById('post-edit-title-input').value || '').trim();
      var subtitle = (document.getElementById('post-edit-subtitle-input').value || '').trim();
      var specialFeature = (document.getElementById('post-edit-special-feature').value || '').trim();
      var publishDate = (document.getElementById('post-edit-date').value || '').trim();
      var youtubeUrl = (document.getElementById('post-edit-youtube').value || '').trim();
      var locationName = (document.getElementById('post-edit-location-name').value || '').trim();
      var locationAddress = (document.getElementById('post-edit-location-address').value || '').trim();
      var imageCaption = (document.getElementById('post-edit-image-caption').value || '').trim();
      var metaTags = (document.getElementById('post-edit-metatags-input').value || '').trim();
      var author = (document.getElementById('post-edit-author').value || '').trim();
      var aiAssisted = !!document.getElementById('post-edit-ai-assisted').checked;

      if (!title) {
        GW.showToast('제목을 입력해주세요', 'error');
        return;
      }
      if (!_postEditState.editor) {
        GW.showToast('에디터가 준비되지 않았습니다', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '저장 중…';

      _postEditState.editor.save()
        .then(function (outputData) {
          var validation = GW.validatePostEditorOutput(outputData);
          if (!validation.ok) {
            GW.showToast(validation.error, 'error');
            throw new Error('__post_validation__');
          }
          return GW.apiFetch('/api/posts/' + _editPostId, {
            method: 'PUT',
            body: JSON.stringify({
              category: category,
              title: title,
              subtitle: subtitle || null,
              special_feature: specialFeature || null,
              content: JSON.stringify(outputData),
              image_url: _postEditState.coverImage || null,
              gallery_images: _postEditState.galleryImages || [],
              image_caption: imageCaption || null,
              youtube_url: youtubeUrl || null,
              location_name: locationName || null,
              location_address: locationAddress || null,
              tag: _postEditState.selectedTags.length ? _postEditState.selectedTags.join(',') : null,
              meta_tags: metaTags || null,
              author: author || null,
              ai_assisted: aiAssisted,
              publish_at: publishDate ? GW.normalizePublishAtValue(publishDate) : undefined
            })
          });
        })
        .then(function () {
          GW.showToast('기사 수정이 저장되었습니다', 'success');
          window._closePostEdit();
          window.location.reload();
        })
        .catch(function (errObj) {
          if (errObj && errObj.message === '__post_validation__') return;
          if (errObj && errObj.status === 401) {
            GW.clearToken();
            window._closePostEdit();
            GW.showToast('수정 권한을 다시 확인해주세요', 'error');
            _openPostLogin();
            return;
          }
          GW.showToast((errObj && errObj.message) || '기사 수정에 실패했습니다', 'error');
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = '수정 완료';
        });
    };

    var _postShareBtn = document.getElementById('post-share-btn');
    if (_postShareBtn) {
      _postShareBtn.addEventListener('click', function (event) {
        event.preventDefault();
        window._sharePostLink();
      });
    }

    var _postEditBtn = document.getElementById('post-edit-btn');
    if (_postEditBtn) {
      _postEditBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        window._postEdit();
      });
    }

    var _specialFeatureToggle = document.getElementById('post-special-feature-toggle');
    if (_specialFeatureToggle) {
      _specialFeatureToggle.addEventListener('click', function () {
        var list = document.querySelector('.post-special-feature-list');
        if (!list) return;
        var collapsed = list.classList.toggle('expanded');
        _specialFeatureToggle.textContent = collapsed ? '목록 접기' : '전체 목록보기';
      });
    }

    document.getElementById('post-login-pw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') window._postLoginSubmit();
    });
    document.getElementById('post-login-modal').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) window._closePostLogin();
    });
    document.getElementById('post-edit-overlay').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) window._closePostEdit();
    });
    document.getElementById('post-edit-category').addEventListener('change', function (event) {
      _postEditState.activeCategory = event.target.value || 'korea';
      _postEditState.selectedTags = [];
      _syncPostCategoryChip(_postEditState.activeCategory);
      _loadPostTagOptions(_postEditState.activeCategory);
    });
    document.getElementById('post-tag-new-btn').addEventListener('click', function () {
      _addPostManagedTag();
    });
    document.getElementById('post-tag-new-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        _addPostManagedTag();
      }
    });
    document.getElementById('post-cover-btn').addEventListener('click', function () {
      window._postUploadCover();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var loginModal = document.getElementById('post-login-modal');
      var editOverlay = document.getElementById('post-edit-overlay');
      if (editOverlay && editOverlay.classList.contains('open')) {
        window._closePostEdit();
        return;
      }
      if (loginModal && loginModal.classList.contains('open')) {
        window._closePostLogin();
      }
    });

    var _postLikeBtn = document.getElementById('post-like-btn');
    if (_postLikeBtn) {
      _postLikeBtn.addEventListener('click', function() {
        if (_postLikeBtn.disabled) return;
        GW.apiFetch('/api/posts/' + _editPostId + '/like', { method: 'POST' })
          .then(function(data) {
            var countEl = document.getElementById('post-like-count');
            if (countEl) countEl.textContent = data.likes || 0;
            _postLikeBtn.disabled = true;
            _postLikeBtn.classList.add('liked');
            var help = document.querySelector('.post-like-help');
            if (help) help.textContent = '이미 공감한 기사입니다';
          })
          .catch(function(err) {
            GW.showToast(err.message || '공감 처리에 실패했습니다', 'error');
          });
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': isAdmin ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────

function notFound() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/404.html' },
  });
}

function errorPage() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/404.html' },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoString(dateStr) {
  if (!dateStr) return '';
  const normalized = String(dateStr).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? normalized : d.toISOString();
}

/** Render Editor.js JSON or plain text to HTML (server-side). */
function renderContent(str) {
  if (!str) return { html: '', gallery: [] };
  const trimmed = str.trim();

  if (trimmed.charAt(0) === '{') {
    try {
      const doc = JSON.parse(trimmed);
      if (Array.isArray(doc.blocks)) {
        const html = doc.blocks.map(b => {
          switch (b.type) {
            case 'paragraph':
              return '<p>' + (b.data.text || '') + '</p>';
            case 'header': {
              const lvl = b.data.level || 2;
              return `<h${lvl}>${b.data.text || ''}</h${lvl}>`;
            }
            case 'list': {
              const tag   = b.data.style === 'ordered' ? 'ol' : 'ul';
              const items = (b.data.items || []).map(i => {
                const txt = typeof i === 'string' ? i : (i.content || '');
                return `<li>${txt}</li>`;
              }).join('');
              return `<${tag}>${items}</${tag}>`;
            }
            case 'quote':
              return `<blockquote>${b.data.text || ''}</blockquote>`;
            case 'image': {
              const url = (b.data.file && b.data.file.url) ? b.data.file.url : (b.data.url || '');
              const cap = escapeHtml(b.data.caption || '');
              let html = `<div class="post-inline-media"><img src="${escapeHtml(url)}" alt="${cap}" style="max-width:100%;height:auto;display:block;margin:0 auto;"></div>`;
              if (cap) html += `<p class="post-image-caption">${cap}</p>`;
              return html;
            }
            default: return '';
          }
        }).join('');
        return { html, gallery: [] };
      }
    } catch (e) { /* fall through */ }
  }

  if (/^<(p|h[1-6]|ul|ol|blockquote|div)/i.test(trimmed)) return { html: str, gallery: [] };
  return { html: escapeHtml(str).replace(/\n/g, '<br>'), gallery: [] };
}

/** Strip tags/JSON and return plain text truncated to maxLen chars. */
function truncatePlain(str, maxLen) {
  if (!str) return '';
  if (str.trim().charAt(0) === '{') {
    try {
      const doc = JSON.parse(str.trim());
      if (Array.isArray(doc.blocks)) {
        str = doc.blocks.map(b => {
          if (b.type === 'paragraph' || b.type === 'header') return b.data.text || '';
          if (b.type === 'list') return (b.data.items || []).map(i => typeof i === 'string' ? i : (i.content || '')).join(' ');
          if (b.type === 'quote') return b.data.text || '';
          return '';
        }).join(' ');
      }
    } catch (e) { /* fall through */ }
  }
  const plain = str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + '…';
}

function isTodayKst(dateStr) {
  if (!dateStr) return false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return String(dateStr).slice(0, 10) === today;
}

function renderYouTubeEmbed(embedUrl, title) {
  return `<div class="youtube-embed-wrap">
    <iframe class="youtube-embed" src="${escapeHtml(embedUrl)}" title="${escapeHtml((title || '유튜브 영상') + ' 영상')}"
      loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>`;
}

function renderImageCaption(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return `<p class="post-image-caption">${escapeHtml(text)}</p>`;
}

function renderPostCover(post, id, title) {
  const src = post.image_url.startsWith('http') ? escapeHtml(post.image_url) : `/api/posts/${id}/image`;
  const pngClass = isTransparentPng(post.image_url) ? ' is-png' : '';
  return `<div class="post-page-cover-frame${pngClass}">
    <img class="post-page-cover" src="${src}" alt="${title}" fetchpriority="high" decoding="async">
  </div>${renderImageCaption(post.image_caption)}`;
}

function renderContentGallery(items) {
  const slides = Array.isArray(items) ? items.filter((item) => item && item.url) : [];
  if (slides.length < 2) return '';
  return `<section class="content-gallery post-content-gallery" data-gallery-interval="3000">
    <div class="content-gallery-track">
      <div class="content-gallery-slides">
        ${slides.map((item, index) => {
          const cap = escapeHtml(item.caption || '');
          return `<figure class="content-gallery-slide${index === 0 ? ' is-active' : ''}">
            <div class="content-gallery-media"><img src="${escapeHtml(item.url)}" alt="${cap}"></div>
            ${cap ? `<figcaption class="post-image-caption">${cap}</figcaption>` : ''}
          </figure>`;
        }).join('')}
      </div>
      <div class="content-gallery-controls">
        <div class="content-gallery-dots">
          ${slides.map((_, index) => `<button type="button" class="content-gallery-dot${index === 0 ? ' is-active' : ''}" data-gallery-index="${index}" aria-label="슬라이드 ${index + 1}"></button>`).join('')}
        </div>
        <button type="button" class="content-gallery-pause" aria-label="슬라이드 일시정지" aria-pressed="false">일시정지</button>
      </div>
    </div>
    <button type="button" class="content-gallery-nav content-gallery-prev" aria-label="이전 사진">‹</button>
    <button type="button" class="content-gallery-nav content-gallery-next" aria-label="다음 사진">›</button>
  </section>`;
}

function renderPostLocationSection(post) {
  const locationAddress = String(post && post.location_address || '').trim();
  if (!locationAddress) return '';
  const locationName = String(post && post.location_name || '').trim();
  const mapTitle = locationName || locationAddress;
  const mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(locationAddress) + '&output=embed';
  return `<details class="post-location-section">
    <summary>위치 정보 보기</summary>
    <div class="post-location-body">
      ${locationName ? `<div class="post-location-name">${escapeHtml(locationName)}</div>` : ''}
      <div class="post-location-address">${escapeHtml(locationAddress)}</div>
      <div class="post-location-map-frame">
        <iframe class="post-location-map" src="${mapUrl}" title="${escapeHtml(mapTitle)} 지도" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
    </div>
  </details>`;
}

function parseGalleryImages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function renderSpecialFeatureSection(post, items) {
  if (!post || !post.special_feature || !Array.isArray(items) || !items.length) return '';
  const slug = slugifySpecialFeature(post.special_feature);
  const featureUrl = `/feature/${post.category}/${slug}`;
  const visibleCount = 5;
  return `<section class="post-special-feature-posts">
    <div class="post-special-feature-heading-row">
      <div>
        <h3 class="post-related-heading">특집 기사 몰아보기</h3>
        <p class="post-special-feature-name">${escapeHtml(post.special_feature)}</p>
      </div>
      <a class="post-special-feature-page-link" href="${featureUrl}">컬렉션 페이지로 보기</a>
    </div>
    <ul class="post-related-list post-special-feature-list" data-initial-limit="${visibleCount}">
      ${items.map((item, index) => {
        const publicDate = item.publish_at || item.created_at || '';
        return `<li class="${index >= visibleCount ? 'is-collapsed' : ''}">
          <a href="/post/${item.id}">
            <span class="post-related-title">[${escapeHtml(resolveCategoryLabel(item.category))}] ${escapeHtml(item.title || '')}</span>
            <span class="post-related-date">${escapeHtml(formatDateShort(publicDate))}</span>
          </a>
        </li>`;
      }).join('')}
    </ul>
    ${items.length > visibleCount ? `<button type="button" class="post-special-feature-toggle" id="post-special-feature-toggle">전체 목록보기</button>` : ''}
  </section>`;
}

function renderRelatedPostsSection(items, mobileOnly) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section class="post-related-posts${mobileOnly ? ' post-related-posts-mobile' : ' post-related-posts-desktop'}">
    <h3 class="post-related-heading">유관기사 읽어보기</h3>
    <ul class="post-related-list">
      ${items.map((item) => {
        const publicDate = item.publish_at || item.created_at || '';
        return `<li>
          <a href="/post/${item.id}">
            <span class="post-related-title">[${escapeHtml(resolveCategoryLabel(item.category))}] ${escapeHtml(item.title || '')}</span>
            <span class="post-related-date">${escapeHtml(formatDateShort(publicDate))}</span>
          </a>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

function resolveCategoryLabel(category) {
  return (CATEGORIES[category] && CATEGORIES[category].label) || CATEGORIES.korea.label;
}

function isTransparentPng(value) {
  const source = String(value || '').trim().toLowerCase();
  return source.startsWith('data:image/png') || /\.png(?:$|[?#])/i.test(source);
}

function buildArticleStructuredData(meta) {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: meta.title || '',
      description: meta.description || '',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': meta.url || '',
      },
      url: meta.url || '',
      image: meta.image ? [meta.image] : undefined,
      datePublished: meta.datePublished || '',
      dateModified: meta.dateModified || meta.datePublished || '',
      articleSection: meta.category || '',
      isAccessibleForFree: true,
      author: {
        '@type': 'Person',
        name: meta.author || 'BP미디어',
      },
      publisher: {
        '@type': 'Organization',
        name: 'BP미디어',
        url: 'https://bpmedia.net',
        logo: {
          '@type': 'ImageObject',
          url: 'https://bpmedia.net/img/logo.svg',
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: '홈',
          item: 'https://bpmedia.net/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: meta.category || '기사',
          item: meta.categoryUrl || 'https://bpmedia.net/',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: meta.title || '기사',
          item: meta.url || '',
        },
      ],
    },
  ]).replace(/</g, '\\u003c');
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
