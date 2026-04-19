import { verifyTokenRole, extractToken } from '../_shared/auth.js';
import { getLikeStats, getViewerKey, isLikelyNonHumanRequest, recordUniqueView } from '../_shared/engagement.js';
import { getYouTubeEmbedUrl } from '../_shared/youtube.js';
import { ADSENSE_ACCOUNT } from '../_shared/site-meta.js';
import { findManualRelatedPosts, findRelatedPosts } from '../_shared/related-posts.js';
import { findSpecialFeaturePosts, slugifySpecialFeature } from '../_shared/special-features.js';
import { ensureDuePostsPublished } from '../_shared/publish-due-posts.js';
import { getNavLabel, loadNavLabels } from '../_shared/nav-labels.js';
import { getCategoryMeta, listEditablePostCategories } from '../_shared/category-meta.mjs';
import { SITE_BRAND_NAME, SITE_DOMAIN_LABEL, DEFAULT_CONTACT_EMAILS } from '../_shared/site-copy.mjs';

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

export async function onRequestGet({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return notFound();
  }

  await ensureDuePostsPublished(env, new URL(request.url).origin).catch((err) => {
    console.error('GET /post/:id auto publish error:', err);
  });

  let post, disclaimerRow, publicRuntimeRow, navLabels;
  try {
    [post, disclaimerRow, publicRuntimeRow, navLabels] = await Promise.all([
      env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first(),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_disclaimer'").first(),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'public_runtime'").first(),
      loadNavLabels(env),
    ]);
  } catch (err) {
    console.error('GET /post/:id DB error:', err);
    return errorPage();
  }
  const aiDisclaimer = disclaimerRow?.value || '본 글은 AI의 도움을 받아 작성되었습니다.';
  const publicRuntime = parseJsonObject(publicRuntimeRow && publicRuntimeRow.value);
  if (!publicRuntimeRow) console.warn('[post/:id] public_runtime setting not found — using empty fallback');
  const navContributors = getNavLabel(navLabels, 'nav.contributors', 'ko');
  const navHome = getNavLabel(navLabels, 'nav.home', 'ko');
  const navLatest = getNavLabel(navLabels, 'nav.latest', 'ko');
  const navKorea = getNavLabel(navLabels, 'nav.korea', 'ko');
  const navApr = getNavLabel(navLabels, 'nav.apr', 'ko');
  const navWosm = getNavLabel(navLabels, 'nav.wosm', 'ko');
  const navWosmMembers = getNavLabel(navLabels, 'nav.wosm_members', 'ko');
  const navPeople = getNavLabel(navLabels, 'nav.people', 'ko');
  const navCalendar = getNavLabel(navLabels, 'nav.calendar', 'ko');
  const navGlossary = getNavLabel(navLabels, 'nav.glossary', 'ko');
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
  const [likeStats, relatedPosts, manualRelatedPosts, specialFeaturePosts] = await Promise.all([
    getLikeStats(env, id, viewerKey),
    findRelatedPosts(env, post, 5),
    findManualRelatedPosts(env, post, 5),
    findSpecialFeaturePosts(env, post, 50),
  ]);

  const requestUrlObj = new URL(request.url);
  const siteUrl  = requestUrlObj.origin;
  const cat = getCategoryMeta(navLabels, post.category, 'ko');
  const editableCategories = listEditablePostCategories(navLabels, 'ko');
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
  const visibleTags = collectVisiblePostTags(post);
  const postUrl  = `${siteUrl}/post/${id}`;
  const isShareMetaRequest = requestUrlObj.searchParams.has('share_ref') || requestUrlObj.searchParams.has('fb_share_ref');
  const shareMetaUrl = isShareMetaRequest
    ? requestUrlObj.toString()
    : postUrl;
  const categoryUrl = `${siteUrl}/${post.category}`;
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
    manual_related_posts: manualRelatedPosts || [],
    author: post.author || 'Editor.A',
    ai_assisted: !!post.ai_assisted,
    publish_at: String(publicDateValue || '').replace(' ', 'T').slice(0, 16),
    publish_date: String(publicDateValue || '').slice(0, 10),
  });
  const isNew    = isTodayKst(publicDateValue);
  const articleJsonLd = buildArticleStructuredData({
    title: post.title,
    description: descText,
    siteUrl,
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
  <meta property="og:url"         content="${escapeHtml(shareMetaUrl)}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:site_name"   content="${SITE_BRAND_NAME} · ${SITE_DOMAIN_LABEL}"/>
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
  <link rel="stylesheet" href="/css/style.css?v=20260419034537">
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
        <a href="/${post.category}" class="post-mobile-section-chip">${cat.label}</a>
        <a href="/search" class="post-mobile-search" aria-label="검색">⌕</a>
      </div>
    </div>
    <nav class="post-mobile-quicknav" aria-label="빠른 이동">
      <a href="/latest">${escapeHtml(navLatest)}</a>
      <a href="/korea">${escapeHtml(navKorea)}</a>
      <a href="/apr">${escapeHtml(navApr)}</a>
      <a href="/wosm">${escapeHtml(navWosm)}</a>
      <a href="/people">${escapeHtml(navPeople)}</a>
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
          <div class="sub">${SITE_DOMAIN_LABEL}</div>
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
      <a href="/contributors" data-i18n="nav.contributors">${escapeHtml(navContributors)}</a>
      <a href="/" data-i18n="nav.home">${escapeHtml(navHome)}</a>
      <a href="/latest" data-i18n="nav.latest">${escapeHtml(navLatest)}</a>
      <a href="/korea" data-i18n="nav.korea">${escapeHtml(navKorea)}</a>
      <a href="/apr" data-i18n="nav.apr">${escapeHtml(navApr)}</a>
      <a href="/wosm" data-i18n="nav.wosm">${escapeHtml(navWosm)}</a>
      <a href="/wosm-members" data-i18n="nav.wosm_members">${escapeHtml(navWosmMembers)}</a>
      <a href="/people" data-i18n="nav.people">${escapeHtml(navPeople)}</a>
      <a href="/calendar" data-i18n="nav.calendar">${escapeHtml(navCalendar)}</a>
      <a href="/glossary" data-i18n="nav.glossary">${escapeHtml(navGlossary)}</a>
    </nav>
  </header>

  <!-- ── TICKER ── -->
  <div class="ticker">
    <div class="ticker-inner" id="ticker-inner">
      길웰 미디어 · The BP Post · ${SITE_DOMAIN_LABEL}
      &nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;
      길웰 미디어 · The BP Post · ${SITE_DOMAIN_LABEL}
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
          <a href="/${post.category}" class="post-page-back-link" style="margin-left:16px;">
            <span style="display:inline-block;background:${cat.color};color:#fff;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;padding:2px 7px;font-family: NixgonFont, sans-serif;">${cat.label}</span>
          </a>
        </div>

        <h1 class="post-page-title">${title}</h1>
        ${subtitle ? `<p class="post-page-subtitle">${subtitle}</p>` : ''}
        <div class="post-page-meta">
          <span class="category-tag" style="background:${cat.color};">${cat.label}</span>
          ${isNew ? `<span class="post-kicker post-kicker-new">NEW</span>` : ''}
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
        ${locationSectionHtml}
        ${bodyGalleryHtml}

        ${visibleTags.length ? `<div class="post-page-tags"><span class="post-page-tags-label">Tags:</span> ${visibleTags.map((tag) => `<button type="button" class="post-page-tag post-page-tag-btn" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>` : ''}
        ${renderSpecialFeatureSection(post, specialFeaturePosts)}
        ${renderRelatedPostsSection(relatedPosts, false, navLabels)}

        ${post.ai_assisted ? `<div class="ai-disclaimer">${escapeHtml(aiDisclaimer)}</div>` : ''}

        <div class="post-byline">
          ${post.author ? `<span class="post-byline-author">작성자 · ${escapeHtml(post.author)}</span>` : ''}
          <span class="post-like-wrap">
            <button id="post-like-btn" class="post-like-btn${likeStats.liked ? ' liked' : ''}"${likeStats.liked ? ' disabled' : ''}>❤ 공감 <span id="post-like-count">${likeStats.likes}</span></button>
            <span class="post-like-help">${likeStats.liked ? '이미 공감한 기사입니다' : '한 IP당 1회 공감할 수 있습니다'}</span>
          </span>
          <span class="post-byline-report">오류제보 <a href="mailto:${DEFAULT_CONTACT_EMAILS.contact}">${DEFAULT_CONTACT_EMAILS.contact}</a></span>
        </div>

      </div>

      ${renderRelatedPostsSection(relatedPosts, true, navLabels)}

      <!-- ── Sidebar ── -->
      <aside class="post-page-sidebar">

        <div class="pps-section">
          <p class="pps-label">섹션</p>
          <a href="/${post.category}" class="pps-category" style="background:${cat.color};">${cat.label}</a>
        </div>

        <div class="pps-section">
          <p class="pps-label">정보</p>
          ${post.author ? `<div class="pps-row"><span class="pps-key">작성자</span><span class="pps-val">${escapeHtml(post.author)}</span></div>` : ''}
          <div class="pps-row"><span class="pps-key">게시일</span><span class="pps-val">${dateStr}</span></div>
          <div class="pps-row"><span class="pps-key">조회수</span><span class="pps-val">${post.views || 0}</span></div>
          ${post.ai_assisted ? `<div class="pps-row"><span class="pps-key">AI</span><span class="pps-val" style="color:#622599;">AI 지원 작성</span></div>` : ''}
        </div>
      </aside>

    </div>
  </main>

  <!-- ── FOOTER ── -->
  <footer>
    <div class="footer-inner">
      <div class="footer-brand">
        <h4 data-footer-role="title">${SITE_BRAND_NAME}</h4>
        <p data-footer-role="description">${SITE_BRAND_NAME}는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.</p>
        <p data-footer-role="domain" style="margin-top:6px;">${SITE_DOMAIN_LABEL}</p>
        <p>기사제보: <a data-footer-role="tip-email" href="mailto:${DEFAULT_CONTACT_EMAILS.tip}">${DEFAULT_CONTACT_EMAILS.tip}</a></p>
        <p>문의: <a data-footer-role="contact-email" href="mailto:${DEFAULT_CONTACT_EMAILS.contact}">${DEFAULT_CONTACT_EMAILS.contact}</a></p>
      </div>
      <div class="footer-admin">
        <h4>관리자</h4>
        <a href="/admin.html">관리자 페이지 →</a>
        <a href="/glossary-raw">용어집 RAW로 보기 →</a>
        <p class="footer-build">Site <span class="site-build-version">V00.116.01</span> · Admin <span class="admin-build-version">V03.079.01</span></p>
      </div>
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">© 2026 ${SITE_BRAND_NAME} · ${SITE_DOMAIN_LABEL}</p>
        <p data-i18n="footer.disclaimer">${SITE_BRAND_NAME}는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다.</p>
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
            ${editableCategories.map((item) => `<option value="${item.key}">${escapeHtml(item.label)}</option>`).join('')}
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

      <div class="form-group post-edit-related-group">
        <label for="post-edit-related-search">유관기사 직접 설정 <span class="admin-label-note">(최대 5개)</span></label>
        <div id="post-edit-related-selected" class="calendar-related-post-selected"></div>
        <div class="calendar-related-post-search">
          <input type="text" id="post-edit-related-search" placeholder="기사 제목으로 검색…" />
        </div>
        <div id="post-edit-related-results" class="calendar-related-post-results"></div>
        <p class="post-edit-note">직접 연결한 기사 수만큼 우선 노출되고, 부족한 수는 자동 추천으로 채워집니다.</p>
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

  <div id="post-tag-modal" class="modal-overlay" aria-hidden="true">
    <div class="modal post-tag-modal" role="dialog" aria-modal="true" aria-labelledby="post-tag-modal-title">
      <button class="modal-close" type="button" aria-label="태그 관련 기사 모달 닫기" onclick="window._closePostTagModal()">×</button>
      <div class="modal-header">
        <div class="category-tag tag-korea" id="post-tag-modal-chip">TAG</div>
        <h2 id="post-tag-modal-title">태그 관련 기사</h2>
        <div class="modal-date" id="post-tag-modal-desc">선택한 태그와 연결된 기사를 보여줍니다.</div>
      </div>
      <div class="modal-body">
        <div id="post-tag-modal-list" class="modal-related-posts"></div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>window.GW_BOOT_RUNTIME=${serializeForScript(publicRuntime)};window.GW_KAKAO_JS_KEY=${serializeForScript(String(publicRuntime.kakao_js_key || ''))};window.GW_POST_BOOT=${serializeForScript({ editPostId: id, sharePostUrl: postUrl, sharePostTitle: titleText, editSeed: JSON.parse(editSeed), visibleTags })};</script>
  <script src="/js/main.js?v=20260419034537"></script>
  <script src="/js/site-chrome.js?v=20260419034537"></script>
  <script src="/js/post-page.js?v=20260419034537"></script>
</body>
</html>`;

  const isFacebookShareRequest = isShareMetaRequest || requestUrlObj.searchParams.get('utm_medium') === 'social-share';
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': (isAdmin || isFacebookShareRequest) ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  const headers = new Headers(response.headers);
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers,
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

function parseTranslationStrings(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed.strings || {}) : {};
  } catch (_) {
    return {};
  }
}

function getKoString(strings, key, fallback) {
  const entry = strings && typeof strings === 'object' ? strings[key] : null;
  if (entry && typeof entry.ko !== 'undefined') return String(entry.ko);
  return fallback;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeInlineHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (/^(\/|#|\?|\.\.?\/)/.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf('//') === 0) return '';
  return '/' + raw.replace(/^\/+/, '');
}

function sanitizeEditorInlineHtml(value) {
  const source = String(value || '')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n');
  if (!source) return '';
  const tokens = [];
  let anchorDepth = 0;
  const tokenized = source.replace(/<(\/?)(a|strong|b|em|i|u|s|mark|code|br)\b([^>]*)>/gi, (_, closing, tagName, attrs) => {
    const tag = String(tagName || '').toLowerCase();
    let replacement = '';
    if (tag === 'br') {
      replacement = '<br>';
    } else if (closing) {
      if (tag === 'a') {
        if (!anchorDepth) {
          return '';
        }
        anchorDepth -= 1;
      }
      replacement = `</${tag}>`;
    } else if (tag === 'a') {
      const hrefMatch = String(attrs || '').match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const normalizedHref = normalizeInlineHref(hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '') : '');
      if (!normalizedHref) {
        return '';
      }
      anchorDepth += 1;
      const external = /^https?:/i.test(normalizedHref);
      replacement = `<a href="${escapeHtml(normalizedHref)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>`;
    } else {
      replacement = `<${tag}>`;
    }
    const token = `%%INLINE_${tokens.length}%%`;
    tokens.push({ token, html: replacement });
    return token;
  });
  let escaped = escapeHtml(tokenized).replace(/\n/g, '<br>');
  tokens.forEach((entry) => {
    escaped = escaped.replace(entry.token, entry.html);
  });
  return escaped;
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
              return '<p>' + renderEditorInlineText(b.data.text || '') + '</p>';
            case 'header': {
              const lvl = b.data.level || 2;
              return `<h${lvl}>${renderEditorInlineText(b.data.text || '')}</h${lvl}>`;
            }
            case 'list': {
              const tag   = b.data.style === 'ordered' ? 'ol' : 'ul';
              const items = renderEditorListItems(b.data.items || [], tag);
              return `<${tag}>${items}</${tag}>`;
            }
            case 'quote':
              return `<blockquote>${renderEditorInlineText(b.data.text || '')}</blockquote>`;
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

  return { html: escapeHtml(str).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>'), gallery: [] };
}

function renderEditorInlineText(value) {
  return sanitizeEditorInlineHtml(value);
}

function renderEditorListItems(items, listTag) {
  const childTag = listTag === 'ol' ? 'ol' : 'ul';
  return (Array.isArray(items) ? items : []).map((item) => {
    if (typeof item === 'string') return `<li>${renderEditorInlineText(item)}</li>`;
    if (!item || typeof item !== 'object') return '';
    const nested = Array.isArray(item.items) && item.items.length
      ? `<${childTag}>${renderEditorListItems(item.items, childTag)}</${childTag}>`
      : '';
    return `<li>${renderEditorInlineText(item.content || '')}${nested}</li>`;
  }).join('');
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
  // Map is loaded async by post-page.js via Nominatim (OpenStreetMap)
  return `<details class="post-location-section" open>
    <summary>위치 정보 보기</summary>
    <div class="post-location-body">
      ${locationName ? `<div class="post-location-name">${escapeHtml(locationName)}</div>` : ''}
      <div class="post-location-address">${escapeHtml(locationAddress)}</div>
      <div class="post-location-map-frame" data-location-addr="${escapeHtml(locationAddress)}" data-location-title="${escapeHtml(mapTitle)}">
        <div class="post-location-map-loading" style="display:flex;align-items:center;justify-content:center;height:280px;color:#888;font-size:13px;">지도를 불러오는 중…</div>
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

function renderRelatedPostsSection(items, mobileOnly, navLabels) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section class="post-related-posts post-related-surface${mobileOnly ? ' post-related-posts-mobile' : ' post-related-posts-desktop'}">
    <h3 class="post-related-heading">유관기사 읽어보기</h3>
    <ul class="post-related-list">
      ${items.map((item) => {
        const publicDate = item.publish_at || item.created_at || '';
        return `<li>
          <a href="/post/${item.id}">
            <span class="post-related-title">[${escapeHtml(resolveCategoryLabel(item.category, navLabels))}] ${escapeHtml(item.title || '')}</span>
            <span class="post-related-date">${escapeHtml(formatDateShort(publicDate))}</span>
          </a>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

function collectVisiblePostTags(post) {
  const seen = new Set();
  return [post && post.tag, post && post.meta_tags]
    .join(',')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 16);
}

function resolveCategoryLabel(category, navLabels) {
  return getCategoryMeta(navLabels, category, 'ko').label;
}

function isTransparentPng(value) {
  const source = String(value || '').trim().toLowerCase();
  return source.startsWith('data:image/png') || /\.png(?:$|[?#])/i.test(source);
}

function buildArticleStructuredData(meta) {
  const siteOrigin = String(meta.siteUrl || '').replace(/\/+$/, '');
  const homeUrl = siteOrigin ? `${siteOrigin}/` : '';
  const logoUrl = siteOrigin ? `${siteOrigin}/img/logo.svg` : '';
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
        url: siteOrigin || undefined,
        logo: logoUrl ? {
          '@type': 'ImageObject',
          url: logoUrl,
        } : undefined,
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
          item: homeUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: meta.category || '기사',
          item: meta.categoryUrl || homeUrl,
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

function parseJsonObject(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}
