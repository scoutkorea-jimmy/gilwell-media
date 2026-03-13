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
  worm:  { label: 'Worm / WOSM', color: '#248737' },
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

  const siteUrl  = new URL(request.url).origin;
  const cat      = CATEGORIES[post.category] || CATEGORIES.korea;
  const title    = escapeHtml(post.title || '');
  const subtitle = escapeHtml(post.subtitle || '');
  const desc     = subtitle || truncatePlain(post.content || '', 160);
  const keywords = post.meta_tags ? escapeHtml(post.meta_tags) : '';
  const ogImage  = post.image_url && post.image_url.startsWith('http')
    ? escapeHtml(post.image_url) : '';
  const dateStr  = formatDate(post.created_at);
  const bodyHtml = renderContent(post.content || '');
  const postUrl  = `${siteUrl}/post/${id}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — 길웰 미디어</title>
  <meta name="description" content="${desc}"/>
  ${keywords ? `<meta name="keywords" content="${keywords}"/>` : ''}
  <meta property="og:type"        content="article"/>
  <meta property="og:title"       content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:url"         content="${postUrl}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta property="og:site_name"   content="길웰 미디어 · The BP Post"/>
  <meta name="twitter:card"       content="${ogImage ? 'summary_large_image' : 'summary'}"/>
  <meta name="twitter:title"      content="${title}"/>
  <meta name="twitter:description" content="${desc}"/>
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}"/>` : ''}
  <link rel="canonical" href="${postUrl}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;600;700&family=Playfair+Display:ital,wght@0,700;1,400&family=Noto+Sans+KR:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>

  <!-- ── MASTHEAD ── -->
  <header class="masthead">
    <div class="masthead-top">
      <div class="masthead-date" id="today-date"></div>
      <div class="masthead-logo">
        <a href="/">
          <h1>길웰 미디어</h1>
          <div class="sub">The BP Post · bpmedia.net</div>
        </a>
      </div>
      <div class="masthead-right">
        <div class="masthead-stats" id="masthead-stats"></div>
        <div class="lang-toggle">
          <button class="lang-btn active" id="lang-btn-ko" onclick="GW.setLang('ko')">KOR</button>
          <button class="lang-btn" id="lang-btn-en" onclick="GW.setLang('en')">ENG</button>
        </div>
        <div class="masthead-search">
          <input type="text" id="mh-search-input" class="mh-search-input" placeholder="검색…" autocomplete="off" />
          <button class="mh-search-btn" id="mh-search-btn" aria-label="검색"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
        </div>
      </div>
    </div>
    <nav class="nav">
      <a href="/" data-i18n="nav.home">홈</a>
      <a href="/korea.html" data-i18n="nav.korea">Korea</a>
      <a href="/apr.html" data-i18n="nav.apr">APR</a>
      <a href="/worm.html" data-i18n="nav.worm">Worm</a>
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
  <div class="post-page-wrap">
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
          ${post.tag ? `<span class="post-kicker tag-${post.category}-kicker">${escapeHtml(post.tag)}</span>` : ''}
          <span>${dateStr}</span>
          ${post.author ? `<span>by ${escapeHtml(post.author)}</span>` : ''}
          <span class="post-page-action-btns" id="post-action-btns">
            <button id="post-edit-btn" class="post-share-btn" style="display:none;" onclick="window.location.href='/admin.html?edit=${id}'">✏ 수정</button>
          </span>
        </div>

        ${post.image_url ? `<img class="post-page-cover" src="${escapeHtml(post.image_url)}" alt="${title}">` : ''}

        <div class="post-page-body modal-body">
          ${bodyHtml}
        </div>

        ${keywords ? `<div class="post-page-tags"><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;">Tags:</span> ${post.meta_tags.split(',').map(t => `<span class="post-page-tag">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}

        ${post.ai_assisted ? `<div class="ai-disclaimer">${escapeHtml(aiDisclaimer)}</div>` : ''}

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
  </div>

  <!-- ── FOOTER ── -->
  <footer>
    <div>
      <h4 data-i18n="footer.title">길웰 미디어</h4>
      <p data-i18n="footer.join.text">길웰 미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.</p>
      <p style="margin-top:6px;">The BP Post · bpmedia.net</p>
      <p>기사제보: <a href="mailto:story@bpmedia.net">story@bpmedia.net</a></p>
      <p>문의: <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></p>
    </div>
    <div class="footer-bottom">
      <p data-i18n="footer.copyright">© 2026 길웰 미디어 / The BP Post · bpmedia.net</p>
      <p data-i18n="footer.disclaimer">길웰 미디어는 한국스카우트연맹 및 세계스카우트연맹의 공식 채널이 아닙니다.</p>
    </div>
  </footer>

  <div class="toast" id="toast"></div>

  <script src="/js/main.js"></script>
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
    if (GW.getToken && GW.getToken()) {
      var eb = document.getElementById('post-edit-btn');
      if (eb) eb.style.display = '';
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
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
              if (cap) html += `<p class="img-caption">${cap}</p>`;
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
