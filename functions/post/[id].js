import { verifyToken, extractToken } from '../_shared/auth.js';
import { getLikeStats, getViewerKey, recordUniqueView } from '../_shared/engagement.js';
import { getYouTubeEmbedUrl } from '../_shared/youtube.js';
import { ADSENSE_ACCOUNT } from '../_shared/site-meta.js';

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
  worm:  { label: 'WOSM', color: '#248737' },
  people:{ label: 'Scout People', color: '#8A5A2B' },
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
    isAdmin = token ? await verifyToken(token, env.ADMIN_SECRET).catch(() => false) : false;
    if (!isAdmin) return notFound();
  }
  const viewerKey = await getViewerKey(request, env);
  if (!isAdmin) {
    const counted = await recordUniqueView(env, id, viewerKey).catch(() => false);
    if (counted) post.views = (post.views || 0) + 1;
  }
  const likeStats = await getLikeStats(env, id, viewerKey);

  const siteUrl  = new URL(request.url).origin;
  const cat      = CATEGORIES[post.category] || CATEGORIES.korea;
  const titleText = post.title || '';
  const subtitleText = post.subtitle || '';
  const title    = escapeHtml(titleText);
  const subtitle = escapeHtml(subtitleText);
  const descText = subtitleText || truncatePlain(post.content || '', 160);
  const desc     = escapeHtml(descText);
  const keywords = post.meta_tags ? escapeHtml(post.meta_tags) : '';
  const ogImage  = post.image_url
    ? (post.image_url.startsWith('http')
        ? escapeHtml(post.image_url)
        : `${siteUrl}/api/posts/${id}/image`)
    : '';
  const dateStr  = formatDate(post.created_at);
  const bodyHtml = renderContent(post.content || '');
  const youtubeEmbedUrl = getYouTubeEmbedUrl(post.youtube_url);
  const postUrl  = `${siteUrl}/post/${id}`;
  const categoryUrl = `${siteUrl}/${post.category}.html`;
  const isNew    = isTodayKst(post.created_at);
  const articleJsonLd = buildArticleStructuredData({
    title: post.title,
    description: descText,
    url: postUrl,
    categoryUrl,
    image: ogImage,
    datePublished: post.created_at,
    dateModified: post.updated_at || post.created_at,
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
  ${keywords ? `<meta name="keywords" content="${keywords}"/>` : ''}
  <meta property="og:locale"      content="ko_KR"/>
  <meta property="og:type"        content="article"/>
  <meta property="og:title"       content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:url"         content="${postUrl}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:site_name"   content="BP미디어 · bpmedia.net"/>
  <meta property="article:published_time" content="${escapeHtml(post.created_at || '')}"/>
  <meta property="article:modified_time" content="${escapeHtml(post.updated_at || post.created_at || '')}"/>
  <meta property="article:section" content="${escapeHtml(cat.label)}"/>
  <meta name="twitter:card"       content="${ogImage ? 'summary_large_image' : 'summary'}"/>
  <meta name="twitter:title"      content="${title}"/>
  <meta name="twitter:description" content="${desc}"/>
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}"/>` : ''}
  <link rel="canonical" href="${postUrl}"/>
  <script type="application/ld+json">${articleJsonLd}</script>
  <link rel="icon" type="image/svg+xml" href="/img/favicon.svg"/>
  <link rel="shortcut icon" type="image/svg+xml" href="/img/favicon.svg"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;600;700&family=Playfair+Display:ital,wght@0,700;1,400&family=Noto+Sans+KR:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=0.023.00">
</head>
<body>
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>

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
      <a href="/korea.html" data-i18n="nav.korea">Korea</a>
      <a href="/apr.html" data-i18n="nav.apr">APR</a>
      <a href="/worm.html" data-i18n="nav.worm">WOSM</a>
      <a href="/people.html" data-i18n="nav.people">스카우트 인물</a>
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
            <span style="display:inline-block;background:${cat.color};color:#fff;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;padding:2px 7px;font-family:'DM Mono',monospace;">${cat.label}</span>
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
          <span class="post-page-action-btns" id="post-action-btns">
            <button id="post-edit-btn" class="post-share-btn" onclick="window._postEdit()">✏ 수정</button>
          </span>
        </div>

        ${post.image_url ? `<img class="post-page-cover" src="${post.image_url.startsWith('http') ? escapeHtml(post.image_url) : `/api/posts/${id}/image`}" alt="${title}">${renderImageCaption(post.image_caption)}` : ''}
        ${youtubeEmbedUrl ? `<div class="post-page-video">${renderYouTubeEmbed(youtubeEmbedUrl, post.title)}</div>` : ''}

        <div class="post-page-body modal-body">
          ${bodyHtml}
        </div>

        ${keywords ? `<div class="post-page-tags"><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;">Tags:</span> ${post.meta_tags.split(',').map(t => `<span class="post-page-tag">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}

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
      <div>
        <h4 data-i18n="footer.title">BP미디어</h4>
        <p data-i18n="footer.join.text">BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.</p>
        <p style="margin-top:6px;">bpmedia.net</p>
        <p>기사제보: <a href="mailto:story@bpmedia.net">story@bpmedia.net</a></p>
        <p>문의: <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></p>
      </div>
      <div>
        <h4>관리자</h4>
        <a href="/admin.html">관리자 페이지 →</a>
        <p class="footer-build">Build <span class="site-build-version">V0.023.00</span></p>
      </div>
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">© 2026 BP미디어 · bpmedia.net</p>
        <p data-i18n="footer.disclaimer">BP미디어는 한국스카우트연맹 및 세계스카우트연맹의 공식 채널이 아닙니다.</p>
      </div>
    </div>
  </footer>

  <!-- ── 수정 로그인 모달 ── -->
  <div id="post-login-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;align-items:center;justify-content:center;">
    <div style="background:#fff;padding:32px;max-width:340px;width:90%;border-top:3px solid #622599;" role="dialog" aria-modal="true" aria-labelledby="post-login-title">
      <h3 id="post-login-title" style="font-family:'AliceDigitalLearning',serif;font-size:18px;margin-bottom:8px;">관리자 인증</h3>
      <p style="font-family:'DM Mono',monospace;font-size:11px;color:#888;margin-bottom:16px;">수정하려면 관리자 비밀번호를 입력하세요.</p>
      <input id="post-login-pw" type="password" placeholder="비밀번호" autocomplete="current-password"
        style="width:100%;border:1px solid #e8e8e8;padding:10px 12px;font-family:'DM Mono',monospace;font-size:13px;outline:none;margin-bottom:12px;box-sizing:border-box;">
      <div id="post-login-turnstile" style="margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <button onclick="window._postLoginSubmit()" style="flex:1;background:#622599;color:#fff;border:none;padding:10px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.06em;">확인</button>
        <button onclick="document.getElementById('post-login-modal').style.display='none'" style="background:none;border:1px solid #e8e8e8;padding:10px 16px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">취소</button>
      </div>
      <p id="post-login-err" style="font-family:'DM Mono',monospace;font-size:11px;color:#FF5655;margin-top:8px;display:none;"></p>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script src="/js/main.js?v=0.023.00"></script>
  <script>
    GW.setMastheadDate();
    GW.markActiveNav();
    GW.loadTicker('ticker-inner');
    GW.loadStats();
    GW.loadTranslations();
    (function(){
      var inp=document.getElementById('mh-search-input'),btn=document.getElementById('mh-search-btn');
      if(!inp||!btn) return;
      function go(){var q=(inp.value||'').trim();if(q)window.location.href='/search.html?q='+encodeURIComponent(q);}
      btn.addEventListener('click',go);
      inp.addEventListener('keydown',function(e){if(e.key==='Enter')go();});
    })();

    // Edit button — always visible, prompts login if not authenticated
    var _editPostId = ${id};
    var _postTurnstileWidgetId = null;
    window._postEdit = function() {
      if (GW.getToken && GW.getToken()) {
        window.location.href = '/admin.html?edit=' + _editPostId;
      } else {
        var modal = document.getElementById('post-login-modal');
        modal.style.display = 'flex';
        setTimeout(function() {
          var pw = document.getElementById('post-login-pw');
          if (pw) pw.focus();
        }, 80);
        // Render Turnstile widget once
        GW.loadTurnstile(function() {
          if (window.turnstile && GW.TURNSTILE_SITE_KEY && _postTurnstileWidgetId == null) {
            _postTurnstileWidgetId = window.turnstile.render('#post-login-turnstile', {
              sitekey: GW.TURNSTILE_SITE_KEY,
              theme: 'light',
            });
          }
        });
      }
    };
    window._postLoginSubmit = function() {
      var pw   = (document.getElementById('post-login-pw').value || '').trim();
      var err  = document.getElementById('post-login-err');
      err.style.display = 'none';
      if (!pw) { err.textContent = '비밀번호를 입력하세요'; err.style.display = ''; return; }
      var cfToken = '';
      if (_postTurnstileWidgetId != null && window.turnstile) {
        cfToken = window.turnstile.getResponse(_postTurnstileWidgetId) || '';
      }
      if (GW.TURNSTILE_SITE_KEY && !cfToken) {
        err.textContent = 'CAPTCHA를 완료해주세요'; err.style.display = ''; return;
      }
      GW.apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw, cf_turnstile_response: cfToken }) })
        .then(function(data) {
          GW.setToken(data.token);
          window.location.href = '/admin.html?edit=' + _editPostId;
        })
        .catch(function() {
          err.textContent = '비밀번호가 올바르지 않습니다';
          err.style.display = '';
          if (window.turnstile && _postTurnstileWidgetId != null) window.turnstile.reset(_postTurnstileWidgetId);
        });
    };
    document.getElementById('post-login-pw').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') window._postLoginSubmit();
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
  return new Response('<h1>서버 오류가 발생했습니다</h1>', {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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

/** Render Editor.js JSON or plain text to HTML (server-side). */
function renderContent(str) {
  if (!str) return '';
  const trimmed = str.trim();

  if (trimmed.charAt(0) === '{') {
    try {
      const doc = JSON.parse(trimmed);
      if (Array.isArray(doc.blocks)) {
        return doc.blocks.map(b => {
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
              let html = `<img src="${escapeHtml(url)}" alt="${cap}" style="max-width:100%;height:auto;display:block;margin:12px 0;">`;
              if (cap) html += `<p class="post-image-caption">${cap}</p>`;
              return html;
            }
            default: return '';
          }
        }).join('');
      }
    } catch (e) { /* fall through */ }
  }

  if (/^<(p|h[1-6]|ul|ol|blockquote|div)/i.test(trimmed)) return str;
  return escapeHtml(str).replace(/\n/g, '<br>');
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
