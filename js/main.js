/**
 * Gilwell Media · Shared Utilities
 * Exposes a global GW namespace used by board.js and admin.js.
 */
(function () {
  'use strict';

  const GW = window.GW = {};
  GW.APP_VERSION = '0.040.00';
  GW.EDITOR_LETTERS = ['A', 'B', 'C'];
  GW.TAG_CATEGORIES = ['korea', 'apr', 'wosm', 'people'];

  // ── Category metadata ─────────────────────────────────────
  GW.CATEGORIES = {
    korea: { label: 'Korea', tagClass: 'tag-korea', color: '#0094B4' },
    apr:   { label: 'APR',   tagClass: 'tag-apr',   color: '#FF5655' },
    wosm:  { label: 'WOSM',  tagClass: 'tag-wosm',  color: '#248737' },
    people:{ label: 'Scout People', tagClass: 'tag-people', color: '#8A5A2B' },
  };

  // ── Date formatting ───────────────────────────────────────
  /** Format an ISO date string as Korean: 2026년 3월 12일 */
  GW.formatDate = function (dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  GW.formatNumber = function (value) {
    return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
  };

  /** Return YYYY-MM-DD using Korea Standard Time for date inputs. */
  GW.getKstDateInputValue = function () {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  };

  GW.isTodayKst = function (dateStr) {
    if (!dateStr) return false;
    var current = GW.getKstDateInputValue();
    var source = String(dateStr).slice(0, 10);
    return source === current;
  };

  GW.buildEditorOptions = function (editors) {
    return GW.EDITOR_LETTERS.map(function (l) {
      var name  = (editors && editors[l]) || '';
      var label = 'Editor ' + l + (name ? ' — ' + name : '');
      return '<option value="Editor ' + l + '">' + GW.escapeHtml(label) + '</option>';
    }).join('');
  };

  GW.validatePostEditorOutput = function (outputData, opts) {
    var blocks = (outputData && outputData.blocks) || [];
    var allowEmpty = !!(opts && opts.allowEmpty);
    if (!blocks.length && !allowEmpty) {
      return { ok: false, error: '내용을 입력해주세요' };
    }
    var imageCount = blocks.filter(function (b) { return b.type === 'image'; }).length;
    if (imageCount > 5) {
      return { ok: false, error: '본문 이미지는 최대 5개까지 가능합니다' };
    }
    return { ok: true };
  };

  GW.getYouTubeEmbedUrl = function (value) {
    if (!value || typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (!trimmed) return '';
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      return '';
    }
    var host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    var videoId = '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
      else if (parsed.pathname.indexOf('/shorts/') === 0 || parsed.pathname.indexOf('/embed/') === 0) videoId = parsed.pathname.split('/')[2] || '';
    } else if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/')[1] || '';
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return '';
    return 'https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0';
  };

  GW.buildYouTubeEmbed = function (value, title) {
    var embedUrl = GW.getYouTubeEmbedUrl(value);
    if (!embedUrl) return '';
    return '<div class="youtube-embed-wrap">' +
      '<iframe class="youtube-embed" src="' + GW.escapeHtml(embedUrl) + '" title="' + GW.escapeHtml((title || '유튜브 영상') + ' 영상') + '"' +
      ' loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
    '</div>';
  };

  GW.normalizeTagSettings = function (raw) {
    var normalized = {
      common: [],
      categories: {
        korea: [],
        apr: [],
        wosm: [],
        people: [],
      },
    };

    function sanitize(items) {
      var seen = new Set();
      return (Array.isArray(items) ? items : [])
        .map(function (item) { return String(item || '').trim(); })
        .filter(function (item) {
          if (!item || seen.has(item)) return false;
          seen.add(item);
          return true;
        })
        .slice(0, 100);
    }

    if (Array.isArray(raw)) {
      normalized.common = sanitize(raw);
      return normalized;
    }

    if (raw && typeof raw === 'object') {
      normalized.common = sanitize(raw.common);
      GW.TAG_CATEGORIES.forEach(function (category) {
        normalized.categories[category] = sanitize(raw.categories && raw.categories[category]);
      });
    }

    return normalized;
  };

  GW.getTagsForCategory = function (raw, category) {
    var normalized = GW.normalizeTagSettings(raw);
    var chosen = GW.TAG_CATEGORIES.indexOf(category) >= 0 ? category : 'korea';
    var seen = new Set();
    return normalized.common
      .concat(normalized.categories[chosen] || [])
      .filter(function (item) {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  };

  /** Set today's date + live clock in the masthead element. */
  GW.setMastheadDate = function (id) {
    const el = document.getElementById(id || 'today-date');
    if (!el) return;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    function update() {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      el.innerHTML =
        `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})<span class="masthead-time">${h}:${m}:${s}</span>`;
    }
    update();
    setInterval(update, 1000);
  };

  // ── XSS protection ────────────────────────────────────────
  /** Escape HTML special characters to prevent XSS. */
  GW.escapeHtml = function (str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  GW.buildImageCaption = function (value) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    return '<p class="post-image-caption">' + GW.escapeHtml(text) + '</p>';
  };

  GW.syncBuildVersion = function () {
    var version = 'V' + GW.APP_VERSION;
    document.querySelectorAll('.site-build-version').forEach(function (el) {
      el.textContent = version;
    });
  };

  GW.ensureFavicon = function () {
    var href = '/img/favicon.svg';
    [
      { rel: 'icon', type: 'image/svg+xml' },
      { rel: 'shortcut icon', type: 'image/svg+xml' }
    ].forEach(function (spec) {
      var selector = 'link[rel="' + spec.rel + '"]';
      var link = document.head ? document.head.querySelector(selector) : null;
      if (!link && document.head) {
        link = document.createElement('link');
        link.rel = spec.rel;
        document.head.appendChild(link);
      }
      if (link) {
        link.type = spec.type;
        link.href = href;
      }
    });
  };

  /** Render content: Editor.js JSON, Quill HTML, or plain text. */
  GW.renderText = function (str) {
    if (!str) return '';
    const trimmed = str.trim();

    // Editor.js JSON: {"time":...,"blocks":[...],"version":...}
    if (trimmed.charAt(0) === '{') {
      try {
        const doc = JSON.parse(trimmed);
        if (Array.isArray(doc.blocks)) {
          return doc.blocks.map(function (b) {
            switch (b.type) {
              case 'paragraph':
                return '<p>' + (b.data.text || '') + '</p>';
              case 'header': {
                var lvl = b.data.level || 2;
                return '<h' + lvl + '>' + (b.data.text || '') + '</h' + lvl + '>';
              }
              case 'list': {
                var tag = b.data.style === 'ordered' ? 'ol' : 'ul';
                var items = (b.data.items || []).map(function (i) {
                  var txt = typeof i === 'string' ? i : (i.content || '');
                  return '<li>' + txt + '</li>';
                }).join('');
                return '<' + tag + '>' + items + '</' + tag + '>';
              }
              case 'quote':
                return '<blockquote>' + (b.data.text || '') + '</blockquote>';
              case 'image': {
                var url = (b.data.file && b.data.file.url) ? b.data.file.url : (b.data.url || '');
                var cap = GW.escapeHtml(b.data.caption || '');
                var html = '<img src="' + GW.escapeHtml(url) + '" alt="' + cap + '" style="max-width:100%;height:auto;display:block;margin:12px 0;">';
                if (cap) html += '<p class="post-image-caption">' + cap + '</p>';
                return html;
              }
              default: return '';
            }
          }).join('');
        }
      } catch (e) { /* fall through */ }
    }

    // Quill HTML output starts with a block tag
    if (/^<(p|h[1-6]|ul|ol|blockquote|div)/i.test(trimmed)) {
      return str;
    }
    return GW.escapeHtml(str).replace(/\n/g, '<br>');
  };

  /** Strip HTML/JSON and truncate plain text for excerpts. */
  GW.truncate = function (str, maxLen) {
    if (!str) return '';
    // Handle Editor.js JSON
    if (str.trim().charAt(0) === '{') {
      try {
        const doc = JSON.parse(str.trim());
        if (Array.isArray(doc.blocks)) {
          str = doc.blocks.map(function (b) {
            if (b.type === 'paragraph' || b.type === 'header') return b.data.text || '';
            if (b.type === 'list') return (b.data.items || []).map(function (i) {
              return typeof i === 'string' ? i : (i.content || '');
            }).join(' ');
            if (b.type === 'quote') return b.data.text || '';
            return '';
          }).join(' ');
        }
      } catch (e) { /* fall through */ }
    }
    var plain = str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + '…';
  };

  // ── Toast notifications ───────────────────────────────────
  /** Show a toast message. type: 'success' | 'error' */
  GW.showToast = function (msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className   = 'toast ' + (type || 'success') + ' show';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.className = 'toast'; }, 2800);
  };

  GW.applySiteChrome = function () {
    GW.syncBuildVersion();
    GW.ensureFavicon();
    GW.applyManagedFooter();
  };

  GW.applyManagedFooter = function () {
    var footer = document.querySelector('footer');
    if (!footer) return;
    fetch('/api/settings/site-meta', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var info = data && data.footer ? data.footer : {};
        var footerBrand = footer.querySelector('.footer-brand');
        var title = document.querySelector('[data-footer-role="title"]');
        var description = document.querySelector('[data-footer-role="description"]');
        var domain = document.querySelector('[data-footer-role="domain"]');
        var tipEmail = document.querySelector('[data-footer-role="tip-email"]');
        var contactEmail = document.querySelector('[data-footer-role="contact-email"]');
        if (footerBrand && info.raw_text) {
          footerBrand.innerHTML = GW.renderManagedFooterHtml(info.raw_text);
          return;
        }
        if (title && info.title) title.textContent = info.title;
        if (description && info.description) description.textContent = info.description;
        if (domain && info.domain_label) domain.textContent = info.domain_label;
        if (tipEmail && info.tip_email) {
          tipEmail.textContent = info.tip_email;
          tipEmail.href = 'mailto:' + info.tip_email;
        }
        if (contactEmail && info.contact_email) {
          contactEmail.textContent = info.contact_email;
          contactEmail.href = 'mailto:' + info.contact_email;
        }
      })
      .catch(function () {});
  };

  GW.renderManagedFooterHtml = function (rawText) {
    return String(rawText || '').trim();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GW.applySiteChrome, { once: true });
  } else {
    GW.applySiteChrome();
  }

  // ── Session token ─────────────────────────────────────────
  GW.getToken  = function () { return localStorage.getItem('admin_token'); };
  GW.setToken  = function (t) { localStorage.setItem('admin_token', t); };
  GW.clearToken = function () {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_role');
  };
  GW.getAdminRole = function () { return localStorage.getItem('admin_role') || 'full'; };
  GW.setAdminRole = function (role) {
    localStorage.setItem('admin_role', role === 'limited' ? 'limited' : 'full');
  };

  // ── API fetch ─────────────────────────────────────────────
  /**
   * Fetch a JSON API endpoint.
   * Automatically attaches the admin token if present.
   * Throws an Error with .status if the response is not ok.
   */
  GW.apiFetch = async function (url, options) {
    const token   = GW.getToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' },
                                   (options && options.headers) || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res  = await fetch(url, Object.assign({}, options, { headers }));
    const data = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      const err = new Error(data.error || 'API 오류가 발생했습니다');
      err.status = res.status;
      throw err;
    }
    return data;
  };

  GW.trackPageVisit = function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var path = window.location.pathname || '/';
    if (!path || path === '/admin.html' || path.indexOf('/api/') === 0) return;
    var key = 'gw_visit_tracked_' + path;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (_) {}

    fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: path,
        referrer: document.referrer || '',
      }),
      keepalive: true,
    }).catch(function () {});
  };

  // ── Cloudflare Turnstile ──────────────────────────────────
  /**
   * Set this to your Cloudflare Turnstile Site Key.
   * Get it at: dash.cloudflare.com → Turnstile → Add site (bpmedia.net)
   * Leave empty ('') to disable CAPTCHA until you're ready to configure it.
   */
  GW.TURNSTILE_SITE_KEY = ''; // ← Replace with your Turnstile Site Key

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      GW.trackPageVisit();
    }, { once: true });
  } else {
    GW.trackPageVisit();
  }

  /** Lazily load the Turnstile script once, then call cb(). */
  GW.loadTurnstile = function (cb) {
    if (!GW.TURNSTILE_SITE_KEY) { cb(); return; }
    if (window.turnstile) { cb(); return; }
    if (document.querySelector('script[data-turnstile]')) {
      // Script already loading — wait for it
      var wait = setInterval(function () {
        if (window.turnstile) { clearInterval(wait); cb(); }
      }, 100);
      return;
    }
    var s  = document.createElement('script');
    s.src  = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.defer = true;
    s.setAttribute('data-turnstile', '1');
    s.onload = function () { cb(); };
    document.head.appendChild(s);
  };

  // ── DOM helpers ───────────────────────────────────────────
  GW.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };

  // ── Mark active nav link ──────────────────────────────────
  /** Add .active to the nav link whose href matches the current page. */
  GW.markActiveNav = function () {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(function (a) {
      const href = (a.getAttribute('href') || '').split('/').pop();
      if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });
  };

  // ── Translation strings (i18n) ────────────────────────────
  GW.STRINGS = {
    'nav.contributors': { ko: '도움을 주신 분들', en: 'Contributors' },
    'nav.home':   { ko: '홈',    en: 'Home' },
    'nav.korea':  { ko: 'Korea', en: 'Korea' },
    'nav.apr':    { ko: 'APR',   en: 'APR' },
    'nav.wosm':   { ko: 'WOSM',  en: 'WOSM' },
    'nav.people': { ko: '스카우트 인물', en: 'Scout People' },

    'hero.eyebrow': { ko: 'BP미디어 · bpmedia.net', en: 'BPmedia · bpmedia.net' },
    'hero.title':   { ko: '스카우트 운동의 소식을\n기록합니다', en: 'Recording the\nScout Movement' },
    'hero.sub':     { ko: '한국스카우트연맹과 세계스카우트연맹의 소식을 자발적인 봉사로 전합니다', en: 'Delivering Scout news through volunteer effort.' },
    'hero.cta':     { ko: '소식 읽기 →', en: 'Read More →' },

    'section.latest':  { ko: '최신 소식',      en: 'Latest News' },
    'section.popular': { ko: '인기 소식',      en: 'Popular News' },
    'section.picks':   { ko: '에디터 추천',    en: "Editor's Picks" },
    'home.more':       { ko: '더보기 →',       en: 'More →' },

    'footer.title':    { ko: 'BP미디어',    en: 'BPmedia' },
    'footer.sections': { ko: '섹션',        en: 'Sections' },
    'footer.join':     { ko: '봉사자 모집', en: 'Join Us' },
    'footer.join.text': {
      ko: 'BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다. 함께 글을 작성해 주실 봉사자를 모집하고 있습니다. 관심 있으신 분들은 이메일로 연락해 주세요.',
      en: 'BPmedia is operated by Scout network volunteers. We are looking for contributors. Please contact us by email.',
    },
    'footer.copyright': {
      ko: '© 2026 BP미디어 · bpmedia.net',
      en: '© 2026 BPmedia · bpmedia.net',
    },
    'footer.disclaimer': {
      ko: 'BP미디어는 한국스카우트연맹 및 세계스카우트연맹의 공식 채널이 아닙니다. 본 미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.',
      en: 'BPmedia is not an official channel of KSA or WOSM. Operated by volunteer contributors.',
    },
    'link.korea': { ko: 'Korea — 한국스카우트연맹', en: 'Korea — Korea Scout Association' },
    'link.apr':   { ko: 'APR — 아시아태평양',     en: 'APR — Asia-Pacific' },
    'link.wosm':  { ko: 'WOSM — 세계스카우트연맹',  en: 'WOSM — World Scout Organization' },
    'link.people':{ ko: '스카우트 인물 — 국내외 스카우트 인물', en: 'Scout People — Scouts Around the World' },

    'board.korea.banner': { ko: 'Korea / KSA',     en: 'Korea / KSA' },
    'board.korea.title':  { ko: '한국스카우트연맹', en: 'Korea Scout Association' },
    'board.korea.desc':   { ko: '국내 스카우트 운동의 소식과 기록을 전합니다.', en: 'News and records from domestic Scout activities.' },
    'board.apr.banner':   { ko: 'APR',              en: 'APR' },
    'board.apr.title':    { ko: '아시아태평양 지역', en: 'Asia-Pacific Region' },
    'board.apr.desc':     { ko: '아시아태평양 스카우트 지역의 동향과 소식을 전합니다.', en: 'Trends and news from the Asia-Pacific Scout Region.' },
    'board.wosm.banner':  { ko: 'WOSM',             en: 'WOSM' },
    'board.wosm.title':   { ko: '세계스카우트연맹',  en: 'World Scout Organization (WOSM)' },
    'board.wosm.desc':    { ko: '세계스카우트연맹(WOSM)의 글로벌 소식과 동향을 전합니다.', en: 'Global news and trends from WOSM.' },
    'board.translation.note': { ko: '일부 게시글은 번역 자료를 바탕으로 작성되어 표현이 완전히 정확하지 않을 수 있습니다. 더 나은 번역 제안은 언제든 환영합니다.', en: 'Some posts are based on translated source materials, so wording may not be perfectly exact. Suggestions for better translations are always welcome.' },
    'board.people.banner': { ko: 'Scout People', en: 'Scout People' },
    'board.people.title': { ko: '스카우트 인물', en: 'Scout People' },
    'board.people.desc': { ko: '국내외 스카우트 출신 인물과 활동 중인 스카우트, 먼저 떠난 스카우트 선배들을 조명합니다.', en: 'Spotlighting Scouts around the world, including active Scouts, Scout alumni, and departed Scout seniors.' },

    'write.btn':    { ko: '✏ 글쓰기', en: '✏ Write' },
    'loadmore.btn': { ko: '더 보기',  en: 'Load More' },

    'stat.korea': { ko: '한국소식',        en: 'Korea' },
    'stat.apr':   { ko: 'APR소식',         en: 'APR' },
    'stat.wosm':  { ko: 'WOSM소식',        en: 'WOSM' },
    'stat.people':{ ko: '인물소식',        en: 'People' },
    'stat.today': { ko: '오늘 공유된 소식', en: 'Today' },
    'stat.unit':  { ko: '건', en: '' },
  };

  GW.lang = localStorage.getItem('gw_lang') || 'ko';

  /** Return the translated string for the current language. */
  GW.t = function (key) {
    var custom = GW._customStrings || {};
    var lang   = GW.lang;
    var entry  = (custom[key]) ? custom[key] : (GW.STRINGS[key] || {});
    return entry[lang] !== undefined ? entry[lang] : (entry.ko || key);
  };

  /** Switch language and reload (guarantees consistent state). */
  GW.setLang = function (lang) {
    localStorage.setItem('gw_lang', lang);
    location.reload();
  };

  /** Apply translations to all [data-i18n] elements in the DOM. */
  GW.applyLang = function () {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key  = el.getAttribute('data-i18n');
      var text = GW.t(key);
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = GW.escapeHtml(text).replace(/\n/g, '<br>');
      } else {
        el.textContent = text;
      }
    });
    // Sync lang button active states
    ['ko', 'en'].forEach(function (l) {
      var btn = document.getElementById('lang-btn-' + l);
      if (btn) btn.classList.toggle('active', l === GW.lang);
    });
    document.documentElement.lang = GW.lang === 'en' ? 'en' : 'ko';
  };

  /** Load custom translation overrides from API then apply. */
  GW.loadTranslations = function () {
    fetch('/api/settings/translations')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        GW._customStrings = data.strings || {};
        GW.applyLang();
        // Re-render stats if already loaded
        if (GW._statsData) GW._renderStats();
      })
      .catch(function () { GW.applyLang(); });
  };

  /** Fetch article counts and show in masthead stats bar. */
  GW.loadStats = function () {
    fetch('/api/stats')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        GW._statsData = d;
        GW._renderStats();
      })
      .catch(function () {});
  };

  GW._renderStats = function () {
    var d   = GW._statsData;
    if (!d) return;
    var el  = document.getElementById('masthead-stats');
    if (!el) return;
    var u   = GW.t('stat.unit');
    function statItem(label, value) {
      return '<span class="masthead-stat-item">' + label + ' <strong>' + value + u + '</strong></span>';
    }
    el.innerHTML =
      statItem(GW.t('stat.korea'), d.korea) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.apr'), d.apr) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.wosm'), d.wosm) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.people'), d.people) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.today'), d.today);
  };

  // ── Ticker loader ─────────────────────────────────────────
  /**
   * Load ticker items from API and build a seamless looping ticker.
   * innerId = id of the .ticker-inner element.
   */
  GW.loadTicker = function (innerId) {
    var inner = document.getElementById(innerId || 'ticker-inner');
    if (!inner) return;

    fetch('/api/settings/ticker')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data.items && data.items.length) ? data.items : [
          '길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다',
          '한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다',
          'The BP Post · bpmedia.net',
        ];
        // Build one run of items separated by diamonds
        var sep  = '&nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;';
        var run  = items.map(function (t) { return GW.escapeHtml(t); }).join(sep);
        // Two identical runs → animate translateX(-50%) for a seamless infinite loop
        inner.innerHTML = run + sep + run + sep;
        // Slow ticker to roughly 50% of the previous speed, regardless of copy length.
        var dur = Math.max(40, items.length * 16);
        inner.style.animationDuration = dur + 's';
      })
      .catch(function () { /* keep static fallback */ });
  };


  // ── Shared Editor.js Image Tool ───────────────────────────
  GW.makeEditorImageTool = function () {
    function ImageTool(opts) {
      this._data = opts.data || {};
      this._api  = opts.api;
    }
    ImageTool.toolbox = {
      title: '이미지',
      icon: '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 29-81-72-66 44v46c0 19 15 34 34 34h178c17 0 31-13 34-30zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>',
    };
    ImageTool.prototype.render = function () {
      var self = this;
      this._wrapper = document.createElement('div');
      this._wrapper.className = 'editorjs-image-tool';
      if (this._data && this._data.url) { this._showImage(this._data.url, this._data.caption); return this._wrapper; }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editorjs-image-btn';
      btn.textContent = '📷 이미지 업로드';
      btn.addEventListener('click', function () { self._upload(); });
      this._wrapper.appendChild(btn);
      return this._wrapper;
    };
    ImageTool.prototype._upload = function () {
      var self = this;
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = function () {
        var file = input.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var canvas = document.createElement('canvas');
            var maxW = 1200; var ratio = Math.min(maxW / img.width, 1);
            canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            self._data = { url: dataUrl, caption: '' }; self._showImage(dataUrl, '');
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };
    ImageTool.prototype._showImage = function (url, caption) {
      this._wrapper.innerHTML = '';
      var img = document.createElement('img'); img.src = url; img.style = 'max-width:100%;display:block;margin:8px 0;';
      this._wrapper.appendChild(img);
      var cap = document.createElement('input'); cap.type = 'text'; cap.placeholder = '사진 출처 또는 캡션 (선택)'; cap.value = caption || ''; cap.className = 'editorjs-image-caption';
      var self = this; cap.addEventListener('input', function () { self._data.caption = cap.value; });
      this._wrapper.appendChild(cap);
    };
    ImageTool.prototype.save = function () { return { url: this._data.url || '', caption: this._data.caption || '' }; };
    ImageTool.prototype.validate = function (data) { return !!data.url; };
    return ImageTool;
  };

})();
