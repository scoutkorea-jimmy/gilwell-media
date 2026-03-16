/**
 * Gilwell Media · Shared Utilities
 * Exposes a global GW namespace used by board.js and admin.js.
 */
(function () {
  'use strict';

  const GW = window.GW = {};
  GW.APP_VERSION = '0.062.01';
  GW.EDITOR_LETTERS = ['A', 'B', 'C'];
  GW.TAG_CATEGORIES = ['korea', 'apr', 'wosm', 'people'];

  // ── Category metadata ─────────────────────────────────────
  GW.CATEGORIES = {
    latest:{ label: 'Latest', tagClass: 'tag-latest', color: '#111111' },
    korea: { label: 'Korea', tagClass: 'tag-korea', color: '#0094B4' },
    apr:   { label: 'APR',   tagClass: 'tag-apr',   color: '#FF5655' },
    wosm:  { label: 'WOSM',  tagClass: 'tag-wosm',  color: '#248737' },
    people:{ label: 'Scout People', tagClass: 'tag-people', color: '#8A5A2B' },
    glossary:{ label: 'Glossary', tagClass: 'tag-glossary', color: '#5D6F2B' },
  };

  // ── Date formatting ───────────────────────────────────────
  /** Format an ISO date string as Korean: 2026년 3월 12일 */
  GW.formatDate = function (dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  GW.formatDateTime = function (dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    function pad(value) {
      return String(value).padStart(2, '0');
    }
    return [
      d.getFullYear() + '년',
      pad(d.getMonth() + 1) + '월',
      pad(d.getDate()) + '일',
      pad(d.getHours()) + '시',
      pad(d.getMinutes()) + '분',
      pad(d.getSeconds()) + '초'
    ].join(' ');
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

  GW.getPostPublicDate = function (post) {
    if (!post || typeof post !== 'object') return '';
    return post.publish_at || post.created_at || '';
  };

  GW.formatPostDate = function (post) {
    return GW.formatDate(GW.getPostPublicDate(post));
  };

  GW.isPostNew = function (post) {
    return GW.isTodayKst(GW.getPostPublicDate(post));
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
    const resolvedTimeZone = (function () {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      } catch (_) {
        return undefined;
      }
    })();

    function getLocalParts(date) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: resolvedTimeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const map = {};
        parts.forEach(function (part) {
          if (part.type !== 'literal') map[part.type] = part.value;
        });
        return {
          year: map.year,
          month: map.month,
          day: map.day,
          hour: map.hour,
          minute: map.minute,
          second: map.second,
        };
      } catch (_) {
        return {
          year: String(date.getFullYear()),
          month: String(date.getMonth() + 1).padStart(2, '0'),
          day: String(date.getDate()).padStart(2, '0'),
          hour: String(date.getHours()).padStart(2, '0'),
          minute: String(date.getMinutes()).padStart(2, '0'),
          second: String(date.getSeconds()).padStart(2, '0'),
        };
      }
    }

    function update() {
      const d = new Date();
      const parts = getLocalParts(d);
      el.innerHTML =
        `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 (${days[d.getDay()]})<span class="masthead-time">${parts.hour}:${parts.minute}:${parts.second}</span>`;
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

  GW.readCachedPayload = function (key, maxAgeMs) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.savedAt || (Date.now() - parsed.savedAt) > maxAgeMs) return null;
      return parsed.data;
    } catch (_) {
      return null;
    }
  };

  GW.writeCachedPayload = function (key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        data: data,
      }));
    } catch (_) {}
  };

  GW.isSvgFile = function (file) {
    return !!(file && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '')));
  };

  GW.optimizeImageFile = function (file, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('이미지 파일이 없습니다'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('이미지를 읽지 못했습니다')); };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { reject(new Error('이미지를 불러오지 못했습니다')); };
        img.onload = function () {
          var maxW = options.maxW || 1600;
          var maxH = options.maxH || 1600;
          var ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          var width = Math.max(1, Math.round(img.width * ratio));
          var height = Math.max(1, Math.round(img.height * ratio));
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          var forcePng = !!options.forcePng || GW.isSvgFile(file);
          var mime = forcePng ? 'image/png' : 'image/jpeg';
          var quality = forcePng ? 0.92 : (options.quality || 0.82);
          resolve({
            dataUrl: canvas.toDataURL(mime, quality),
            width: width,
            height: height,
            mime: mime,
            sourceWidth: img.width,
            sourceHeight: img.height,
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  GW.applyMobileTypeScale = function () {
    var raw = '1';
    try {
      raw = localStorage.getItem('gw_mobile_type_scale') || '1';
    } catch (_) {}
    var scaleNum = parseFloat(raw);
    if (!Number.isFinite(scaleNum)) scaleNum = 1;
    scaleNum = Math.max(0.84, Math.min(1.32, Math.round(scaleNum * 100) / 100));
    var scale = String(scaleNum);
    document.documentElement.style.setProperty('--mobile-user-scale', scale);
    document.querySelectorAll('.masthead-type-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-action') === 'reset' && scaleNum === 1);
    });
    document.querySelectorAll('.masthead-type-value').forEach(function (el) {
      el.textContent = Math.round(scaleNum * 100) + '%';
    });
  };

  GW.initMobileTypeControls = function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.innerWidth > 640) return;
    var logo = document.querySelector('.masthead-logo');
    if (!logo || logo.querySelector('.masthead-type-controls') || document.body.classList.contains('admin-page')) return;
    var controls = document.createElement('div');
    controls.className = 'masthead-type-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '글자 크기 조절');
    controls.innerHTML =
      '<button type="button" class="masthead-type-btn" data-action="decrease" aria-label="글자 크기 줄이기">A-</button>' +
      '<button type="button" class="masthead-type-btn" data-action="reset" aria-label="기본 글자 크기로 되돌리기">A <span class="masthead-type-value">100%</span></button>' +
      '<button type="button" class="masthead-type-btn" data-action="increase" aria-label="글자 크기 키우기">A+</button>';
    logo.appendChild(controls);
    controls.querySelectorAll('.masthead-type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action') || 'reset';
        var current = 1;
        try {
          current = parseFloat(localStorage.getItem('gw_mobile_type_scale') || '1');
        } catch (_) {}
        if (!Number.isFinite(current)) current = 1;
        var scale = current;
        if (action === 'decrease') scale = current - 0.08;
        else if (action === 'increase') scale = current + 0.08;
        else scale = 1;
        scale = Math.max(0.84, Math.min(1.32, Math.round(scale * 100) / 100));
        try {
          localStorage.setItem('gw_mobile_type_scale', String(scale));
        } catch (_) {}
        GW.applyMobileTypeScale();
      });
    });
    GW.applyMobileTypeScale();
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

  GW.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        area.style.pointerEvents = 'none';
        document.body.appendChild(area);
        area.focus();
        area.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('copy-failed');
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };

  GW.isMobileShareContext = function () {
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return true;
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  };

  GW.sharePostLink = function (options) {
    options = options || {};
    var url = String(options.url || window.location.href || '').trim();
    var title = String(options.title || document.title || '').trim();
    var text = String(options.text || title || '').trim();
    var useNativeShare = !!(navigator.share && GW.isMobileShareContext());

    if (useNativeShare) {
      return navigator.share({ title: title, text: text, url: url }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        return GW.copyText(url).then(function () {
          GW.showToast('기사 링크가 저장되었습니다. 붙여넣을 곳에서 Ctrl + V를 눌러주세요.', 'success');
        });
      });
    }

    return GW.copyText(url).then(function () {
      GW.showToast('기사 링크가 저장되었습니다. 붙여넣을 곳에서 Ctrl + V를 눌러주세요.', 'success');
    });
  };

  GW.applySiteChrome = function () {
    GW.syncBuildVersion();
    GW.ensureFavicon();
    GW.initMobileTypeControls();
    GW.applyMobileTypeScale();
    if (!GW._responsiveChromeBound) {
      GW._responsiveChromeBound = true;
      window.addEventListener('resize', function () {
        GW.initMobileTypeControls();
        GW.applyMobileTypeScale();
      });
    }
    if (document.body && document.body.hasAttribute('data-home-bootstrap')) return;
    GW.applyManagedFooter();
  };

  GW.applyManagedFooterData = function (data) {
    var footer = document.querySelector('footer');
    if (!footer) return;
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
  };

  GW.applyManagedFooter = function () {
    var cacheKey = 'gw_cache_site_meta_v1';
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached) {
      GW.applyManagedFooterData(cached);
    }
    fetch('/api/settings/site-meta', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.applyManagedFooterData(data);
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
    'nav.latest': { ko: '1개월 소식', en: 'Last 30 Days' },
    'nav.korea':  { ko: 'Korea', en: 'Korea' },
    'nav.apr':    { ko: 'APR',   en: 'APR' },
    'nav.wosm':   { ko: 'WOSM',  en: 'WOSM' },
    'nav.people': { ko: '스카우트 인물', en: 'Scout People' },
    'nav.glossary': { ko: '용어집', en: 'Glossary' },

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
      ko: 'BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다.',
      en: 'BPmedia is not an official channel of KSA or WOSM. Operated by volunteer contributors.',
    },
    'link.latest': { ko: '1개월 소식 — 최근 30일간의 세계 스카우트 소식', en: 'Last 30 Days — Scout news from the last month' },
    'link.korea': { ko: 'Korea — 한국스카우트연맹', en: 'Korea — Korea Scout Association' },
    'link.apr':   { ko: 'APR — 아시아태평양',     en: 'APR — Asia-Pacific' },
    'link.wosm':  { ko: 'WOSM — 세계스카우트연맹',  en: 'WOSM — World Scout Organization' },
    'link.people':{ ko: '스카우트 인물 — 국내외 스카우트 인물', en: 'Scout People — Scouts Around the World' },
    'link.glossary':{ ko: '용어집 — 국문·영문·불어 스카우트 용어', en: 'Glossary — Korean, English, French Scout Terms' },

    'board.latest.banner': { ko: '30 Days', en: '30 Days' },
    'board.latest.title': { ko: '최근 1개월 소식', en: 'Last 30 Days' },
    'board.latest.desc': { ko: '최근 30일 동안 한국을 포함한 세계의 스카우트 소식을 한 번에 모아봅니다.', en: 'Scout news from Korea and around the world from the last 30 days.' },
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
    'board.glossary.banner': { ko: '용어집', en: 'Glossary' },
    'board.glossary.title': { ko: '스카우트 용어집', en: 'Scout Glossary' },
    'board.glossary.desc': { ko: '스카우트 용어를 국문·영문·불어 3개 국어 기준으로 정리합니다.', en: 'A trilingual glossary of Scout terms in Korean, English, and French.' },

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
    var cacheKey = 'gw_cache_translations_v1';
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 60 * 12);
    if (cached && cached.strings) {
      GW._customStrings = cached.strings || {};
      GW.applyLang();
      if (GW._statsData) GW._renderStats();
    }
    fetch('/api/settings/translations')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW._customStrings = data.strings || {};
        GW.applyLang();
        // Re-render stats if already loaded
        if (GW._statsData) GW._renderStats();
      })
      .catch(function () { GW.applyLang(); });
  };

  /** Fetch article counts and show in masthead stats bar. */
  GW.loadStats = function () {
    var cacheKey = 'gw_cache_stats_v1';
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 5);
    if (cached) {
      GW._statsData = cached;
      GW._renderStats();
    }
    fetch('/api/stats')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        GW.writeCachedPayload(cacheKey, d);
        GW._statsData = d;
        GW._renderStats();
      })
      .catch(function () {});
  };

  GW.applyBoardLayoutSettings = function (data) {
    var parsed = parseInt(data && data.gap_px, 10);
    var gap = Number.isFinite(parsed) ? Math.min(40, Math.max(5, parsed)) : 6;
    var root = document.documentElement;
    if (!root || !root.style) return;
    root.style.setProperty('--board-card-gap', gap + 'px');
    root.style.setProperty('--home-section-gap', gap + 'px');
    root.style.setProperty('--home-grid-gap', gap + 'px');
    root.style.setProperty('--home-block-bottom', gap + 'px');
    root.style.setProperty('--home-title-gap', gap + 'px');
  };

  GW.loadBoardLayoutSettings = function () {
    var cacheKey = 'gw_cache_board_layout_v1';
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached) {
      GW.applyBoardLayoutSettings(cached);
    }
    fetch('/api/settings/board-layout', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.applyBoardLayoutSettings(data);
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
    var cacheKey = 'gw_cache_ticker_v1';
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached && Array.isArray(cached.items)) {
      GW.renderTickerItems(innerId, cached.items || []);
    }

    fetch('/api/settings/ticker')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.renderTickerItems(innerId, data.items || []);
      })
      .catch(function () { /* keep static fallback */ });
  };

  GW.renderTickerItems = function (innerId, items) {
    var inner = document.getElementById(innerId || 'ticker-inner');
    if (!inner) return;
    var list = (items && items.length) ? items : [
      '길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다',
      '한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다',
      'The BP Post · bpmedia.net',
    ];
    var sep = '&nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;';
    var run = list.map(function (t) { return GW.escapeHtml(t); }).join(sep);
    inner.innerHTML = run + sep + run + sep;
    var dur = Math.max(40, list.length * 16);
    inner.style.animationDuration = dur + 's';
  };

  GW.isMobileViewport = function () {
    return window.innerWidth <= 640;
  };

  GW.bootstrapStandardPage = function (opts) {
    opts = opts || {};
    if (opts.setDate !== false) GW.setMastheadDate();
    if (opts.markActiveNav !== false) GW.markActiveNav();
    GW.loadBoardLayoutSettings();
    if (opts.loadTicker !== false) GW.loadTicker(opts.tickerId || 'ticker-inner');
    if (opts.loadStats !== false) GW.loadStats();
    if (opts.loadTranslations !== false) GW.loadTranslations();
  };

  GW._previewRuntimeState = {
    loaded: false,
    loading: false,
    modalReady: false,
    release: null,
    history: null,
  };
  GW._previewChecklistState = {};

  GW.decoratePreviewTitle = function (prefix) {
    if (typeof document === 'undefined') return;
    var appliedPrefix = String(prefix || '[프리뷰]').trim();
    var current = String(document.title || '').trim();
    if (!current || current.indexOf(appliedPrefix) === 0) return;
    document.title = appliedPrefix + ' ' + current;
  };

  GW.getPreviewChecklistStorageKey = function () {
    var version = GW._previewRuntimeState.release && GW._previewRuntimeState.release.version;
    return 'gw_preview_checks_' + String(version || 'draft');
  };

  GW.loadPreviewChecklistState = function () {
    try {
      var raw = localStorage.getItem(GW.getPreviewChecklistStorageKey());
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  GW.savePreviewChecklistState = function () {
    try {
      localStorage.setItem(GW.getPreviewChecklistStorageKey(), JSON.stringify(GW._previewChecklistState || {}));
    } catch (_) {}
  };

  GW.isPreviewAdminReady = function () {
    return !!(GW.getToken && GW.getToken() && GW.getAdminRole && GW.getAdminRole() === 'full');
  };

  GW.initPreviewRuntime = function () {
    if (GW._previewRuntimeState.loaded || GW._previewRuntimeState.loading) return;
    GW._previewRuntimeState.loading = true;
    fetch('/api/preview/release', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('not-preview');
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.preview || !data.release) return;
        GW._previewRuntimeState.loaded = true;
        GW._previewRuntimeState.release = data.release;
        GW._previewChecklistState = GW.loadPreviewChecklistState();
        document.body.classList.add('preview-runtime');
        GW.decoratePreviewTitle(data.release.title_prefix || '[프리뷰]');
        GW.openPreviewReviewModal();
      })
      .catch(function () {})
      .finally(function () {
        GW._previewRuntimeState.loading = false;
      });
  };

  GW.ensurePreviewReviewModal = function () {
    if (typeof document === 'undefined' || document.getElementById('preview-review-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'preview-review-modal';
    modal.className = 'preview-review-modal';
    modal.innerHTML =
      '<div class="preview-review-backdrop" data-preview-close></div>' +
      '<div class="preview-review-card" role="dialog" aria-modal="true" aria-labelledby="preview-review-title">' +
        '<div class="preview-review-head">' +
          '<div class="preview-review-head-copy">' +
            '<strong id="preview-review-title">[프리뷰] 검수 센터</strong>' +
            '<p id="preview-review-summary" class="preview-review-summary">이번 프리뷰 변경 사항을 불러오는 중입니다.</p>' +
          '</div>' +
          '<button type="button" class="preview-review-close" data-preview-close>닫기</button>' +
        '</div>' +
        '<div id="preview-review-body" class="preview-review-body">' +
          '<div class="preview-review-loading">체크리스트를 준비하는 중입니다…</div>' +
        '</div>' +
        '<div class="preview-review-history">' +
          '<div class="preview-review-history-head">' +
            '<div>' +
              '<strong>최근 20개 개발 히스토리</strong>' +
              '<span>배포 이력과 코드 스냅샷을 함께 보관하고, 필요하면 여기서 복구를 시작할 수 있습니다.</span>' +
            '</div>' +
            '<button type="button" id="preview-history-refresh-btn" class="preview-history-refresh-btn">히스토리 새로고침</button>' +
          '</div>' +
          '<div id="preview-history-list" class="preview-history-list">' +
            '<div class="preview-review-loading">히스토리를 불러오는 중입니다…</div>' +
          '</div>' +
        '</div>' +
        '<div class="preview-review-actions">' +
          '<div id="preview-auth-panel" class="preview-auth-panel">' +
            '<div class="preview-auth-title">관리자 인증을 확인하는 중입니다…</div>' +
          '</div>' +
          '<div class="preview-review-action-row">' +
            '<p class="preview-review-note">모든 체크박스를 완료하고, 관리자 인증까지 끝난 뒤에만 본 페이지 반영을 시작할 수 있습니다.</p>' +
            '<button type="button" id="preview-promote-btn" class="preview-promote-btn" aria-disabled="true">본 페이지에 반영하기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-preview-close]').forEach(function (node) {
      node.addEventListener('click', GW.closePreviewReviewModal);
    });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) GW.closePreviewReviewModal();
    });

    var promoteBtn = document.getElementById('preview-promote-btn');
    if (promoteBtn) {
      promoteBtn.addEventListener('click', GW.handlePreviewPromotion);
    }

    var refreshBtn = document.getElementById('preview-history-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        GW.loadPreviewHistory(true);
      });
    }

    var historyList = document.getElementById('preview-history-list');
    if (historyList) {
      historyList.addEventListener('click', function (event) {
        var deploymentBtn = event.target.closest('[data-preview-rollback-deployment]');
        if (deploymentBtn) {
          GW.handlePreviewRollback({
            mode: 'deployment',
            id: deploymentBtn.getAttribute('data-preview-rollback-deployment') || '',
          });
          return;
        }
        var snapshotBtn = event.target.closest('[data-preview-rollback-snapshot]');
        if (snapshotBtn) {
          GW.handlePreviewRollback({
            mode: 'snapshot',
            id: snapshotBtn.getAttribute('data-preview-rollback-snapshot') || '',
          });
        }
      });
    }

    GW._previewRuntimeState.modalReady = true;
  };

  GW.ensurePreviewReviewLauncher = function () {
    if (typeof document === 'undefined' || document.getElementById('preview-review-fab')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'preview-review-fab';
    button.className = 'preview-review-fab';
    button.setAttribute('aria-label', '검수리스트 열기');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<span class="preview-review-fab-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
          '<path d="M7 6.5h10M7 12h10M7 17.5h6m6-12.2v13.4a1.3 1.3 0 0 1-1.3 1.3H6.3A1.3 1.3 0 0 1 5 18.7V5.3A1.3 1.3 0 0 1 6.3 4h11.4A1.3 1.3 0 0 1 19 5.3Zm-2.5 7.1 1.6 1.6 3.4-3.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
      '</span>' +
      '<span class="preview-review-fab-copy">' +
        '<strong>검수리스트</strong>' +
        '<span>다시 열기</span>' +
      '</span>';
    button.addEventListener('click', GW.openPreviewReviewModal);
    document.body.appendChild(button);
  };

  GW.openPreviewReviewModal = function () {
    if (!GW._previewRuntimeState.loaded || !GW._previewRuntimeState.release) return;
    GW.ensurePreviewReviewModal();
    GW.ensurePreviewReviewLauncher();
    var modal = document.getElementById('preview-review-modal');
    var launcher = document.getElementById('preview-review-fab');
    if (!modal) return;
    GW.renderPreviewReviewModal();
    GW.syncPreviewAuthPanel();
    GW.loadPreviewHistory(false);
    modal.classList.add('open');
    document.body.classList.add('preview-review-modal-open');
    if (launcher) launcher.setAttribute('aria-expanded', 'true');
  };

  GW.closePreviewReviewModal = function () {
    var modal = document.getElementById('preview-review-modal');
    if (modal) modal.classList.remove('open');
    document.body.classList.remove('preview-review-modal-open');
    var launcher = document.getElementById('preview-review-fab');
    if (launcher) launcher.setAttribute('aria-expanded', 'false');
  };

  GW.renderPreviewReviewModal = function () {
    var release = GW._previewRuntimeState.release;
    var title = document.getElementById('preview-review-title');
    var summary = document.getElementById('preview-review-summary');
    var body = document.getElementById('preview-review-body');
    if (!release || !title || !summary || !body) return;

    title.textContent = release.title || '[프리뷰] 검수 센터';
    summary.textContent = release.summary || '';

    var html = (release.sections || []).map(function (section) {
      return '<section class="preview-review-section">' +
        '<div class="preview-review-section-head">' + GW.escapeHtml(section.title || '') + '</div>' +
        '<div class="preview-review-checklist">' +
          (section.items || []).map(function (item) {
            var checked = !!GW._previewChecklistState[item.id];
            return '<label class="preview-review-item">' +
              '<input type="checkbox" class="preview-review-checkbox" data-preview-check="' + GW.escapeHtml(item.id) + '"' + (checked ? ' checked' : '') + '>' +
              '<span class="preview-review-copy">' +
                '<strong>' + GW.escapeHtml(item.label || '') + '</strong>' +
                '<span>' + GW.escapeHtml(item.description || '') + '</span>' +
              '</span>' +
            '</label>';
          }).join('') +
        '</div>' +
      '</section>';
    }).join('');

    html += '<div class="preview-review-footnote">' + GW.escapeHtml(release.promotion_note || '') + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.preview-review-checkbox').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        var id = checkbox.getAttribute('data-preview-check') || '';
        GW._previewChecklistState[id] = !!checkbox.checked;
        GW.savePreviewChecklistState();
        GW.syncPreviewPromoteButton();
      });
    });
    GW.syncPreviewPromoteButton();
  };

  GW.syncPreviewAuthPanel = function () {
    var panel = document.getElementById('preview-auth-panel');
    if (!panel) return;

    if (GW.isPreviewAdminReady()) {
      panel.className = 'preview-auth-panel is-ready';
      panel.innerHTML =
        '<div class="preview-auth-title">관리자 인증 완료</div>' +
        '<p class="preview-auth-copy">현재 브라우저에는 본 페이지 반영과 복구를 실행할 수 있는 full 관리자 세션이 연결되어 있습니다.</p>';
      return;
    }

    panel.className = 'preview-auth-panel';
    panel.innerHTML =
      '<div class="preview-auth-title">관리자 인증</div>' +
      '<p class="preview-auth-copy">본 페이지 반영과 복구는 full 관리자 비밀번호가 필요합니다.</p>' +
      '<div class="preview-auth-form">' +
        '<input type="password" id="preview-admin-password" class="preview-auth-input" placeholder="관리자 비밀번호" autocomplete="current-password">' +
        '<button type="button" id="preview-admin-auth-btn" class="preview-auth-btn">인증</button>' +
      '</div>';

    var authBtn = document.getElementById('preview-admin-auth-btn');
    var authInput = document.getElementById('preview-admin-password');
    if (authBtn) authBtn.addEventListener('click', GW.handlePreviewAuth);
    if (authInput) {
      authInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          GW.handlePreviewAuth();
        }
      });
    }
  };

  GW.handlePreviewAuth = function () {
    var input = document.getElementById('preview-admin-password');
    var button = document.getElementById('preview-admin-auth-btn');
    var password = input ? String(input.value || '').trim() : '';
    if (!password) {
      GW.showToast('관리자 비밀번호를 입력해주세요.', 'error');
      if (input) input.focus();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = '인증 중…';
    }

    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: password }),
    })
      .then(function (data) {
        if (!data || data.role !== 'full') {
          GW.showToast('본 페이지 반영 권한이 있는 관리자 비밀번호가 아닙니다.', 'error');
          return;
        }
        GW.setToken(data.token);
        GW.setAdminRole(data.role || 'full');
        GW.showToast('프리뷰 반영용 관리자 인증이 완료되었습니다.', 'success');
        GW.syncPreviewAuthPanel();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '관리자 인증에 실패했습니다.', 'error');
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.textContent = '인증';
        }
        if (input) input.value = '';
      });
  };

  GW.loadPreviewHistory = function (force) {
    var list = document.getElementById('preview-history-list');
    if (!list) return;
    if (!force && GW._previewRuntimeState.history) {
      GW.renderPreviewHistory();
      return;
    }
    list.innerHTML = '<div class="preview-review-loading">히스토리를 불러오는 중입니다…</div>';
    fetch('/api/preview/history', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('history-failed');
        return response.json();
      })
      .then(function (data) {
        GW._previewRuntimeState.history = data || { deployments: [], snapshots: [] };
        GW.renderPreviewHistory();
      })
      .catch(function () {
        list.innerHTML = '<div class="preview-history-empty">히스토리를 불러오지 못했습니다.</div>';
      });
  };

  GW.renderPreviewHistory = function () {
    var list = document.getElementById('preview-history-list');
    if (!list) return;
    var history = GW._previewRuntimeState.history || {};
    var deployments = Array.isArray(history.deployments) ? history.deployments.slice(0, 20) : [];
    var snapshots = Array.isArray(history.snapshots) ? history.snapshots.slice(0, 20) : [];

    if (!deployments.length && !snapshots.length) {
      list.innerHTML = '<div class="preview-history-empty">아직 저장된 히스토리가 없습니다.</div>';
      return;
    }

    var blocks = [];
    if (deployments.length) {
      blocks.push(
        '<div class="preview-history-group">' +
          '<h4>배포 히스토리</h4>' +
          deployments.map(function (item) {
            var canRollback = String(item.environment || '').toLowerCase() === 'production' && item.id;
            return '<article class="preview-history-item">' +
              '<div class="preview-history-copy">' +
                '<div class="preview-history-title">' + GW.escapeHtml(item.environment || '') + ' · ' + GW.escapeHtml(item.branch || '') + '</div>' +
                '<div class="preview-history-meta">' + GW.escapeHtml(item.source || '') + '</div>' +
                '<div class="preview-history-meta">' + GW.escapeHtml(item.created_on || '') + '</div>' +
              '</div>' +
              '<div class="preview-history-actions">' +
                (item.url ? '<a class="preview-history-link" href="' + GW.escapeHtml(item.url) + '" target="_blank" rel="noopener">열기</a>' : '') +
                (canRollback ? '<button type="button" class="preview-history-btn" data-preview-rollback-deployment="' + GW.escapeHtml(item.id) + '">배포 롤백</button>' : '') +
              '</div>' +
            '</article>';
          }).join('') +
        '</div>'
      );
    }

    if (snapshots.length) {
      blocks.push(
        '<div class="preview-history-group">' +
          '<h4>코드 스냅샷</h4>' +
          snapshots.map(function (item) {
            return '<article class="preview-history-item">' +
              '<div class="preview-history-copy">' +
                '<div class="preview-history-title">V' + GW.escapeHtml(item.version || '') + ' · ' + GW.escapeHtml(item.id || '') + '</div>' +
                '<div class="preview-history-meta">' + GW.escapeHtml(item.commit_short || '') + ' · ' + GW.escapeHtml(item.commit_message || '') + '</div>' +
                '<div class="preview-history-meta">' + GW.escapeHtml(item.archived_at || '') + '</div>' +
              '</div>' +
              '<div class="preview-history-actions">' +
                '<button type="button" class="preview-history-btn" data-preview-rollback-snapshot="' + GW.escapeHtml(item.id || '') + '">코드 복구</button>' +
              '</div>' +
            '</article>';
          }).join('') +
        '</div>'
      );
    }

    list.innerHTML = blocks.join('');
  };

  GW.syncPreviewPromoteButton = function () {
    var button = document.getElementById('preview-promote-btn');
    var release = GW._previewRuntimeState.release;
    if (!button || !release) return;
    var requiredIds = [];
    (release.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        requiredIds.push(item.id);
      });
    });
    var ready = requiredIds.length > 0 && requiredIds.every(function (id) {
      return !!GW._previewChecklistState[id];
    });
    button.classList.toggle('ready', ready);
    button.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };

  GW.handlePreviewPromotion = function () {
    var button = document.getElementById('preview-promote-btn');
    var release = GW._previewRuntimeState.release;
    if (!button || !release) return;

    var requiredIds = [];
    (release.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        requiredIds.push(item.id);
      });
    });
    var checkedIds = requiredIds.filter(function (id) {
      return !!GW._previewChecklistState[id];
    });

    if (checkedIds.length !== requiredIds.length) {
      GW.showToast('체크 항목을 꼼꼼히 확인하고 체크박스를 모두 선택해주세요.', 'error');
      return;
    }
    if (!GW.isPreviewAdminReady()) {
      GW.showToast('반영 전에 full 관리자 인증을 먼저 완료해주세요.', 'error');
      var input = document.getElementById('preview-admin-password');
      if (input) input.focus();
      return;
    }
    if (!window.confirm('이 선택은 돌이킬 수 없습니다. 본 페이지에 반영하시겠습니까?')) {
      return;
    }

    button.classList.add('is-loading');
    button.textContent = '반영 작업 시작 중…';
    GW.apiFetch('/api/preview/promote', {
      method: 'POST',
      body: JSON.stringify({ checked_ids: checkedIds }),
    })
      .then(function (data) {
        GW.showToast('본 페이지 반영 워크플로우를 시작했습니다.', 'success');
        button.textContent = '반영 요청됨';
        if (data && data.actions_url) {
          window.open(data.actions_url, '_blank', 'noopener');
        }
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '반영을 시작하지 못했습니다.', 'error');
        button.classList.remove('is-loading');
        button.textContent = '본 페이지에 반영하기';
      });
  };

  GW.handlePreviewRollback = function (payload) {
    payload = payload || {};
    var mode = payload.mode || '';
    var id = payload.id || '';
    if (!mode || !id) return;
    if (!GW.isPreviewAdminReady()) {
      GW.showToast('복구 작업도 full 관리자 인증이 필요합니다.', 'error');
      var input = document.getElementById('preview-admin-password');
      if (input) input.focus();
      return;
    }
    var message = mode === 'deployment'
      ? '선택한 production 배포로 롤백을 시작할까요?'
      : '선택한 코드 스냅샷으로 복구를 시작할까요?';
    if (!window.confirm(message)) return;

    var body = mode === 'deployment'
      ? { deployment_id: id }
      : { snapshot_id: id };

    GW.apiFetch('/api/preview/rollback', {
      method: 'POST',
      body: JSON.stringify(body),
    })
      .then(function (data) {
        GW.showToast((data && data.message) || '복구 작업을 시작했습니다.', 'success');
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '복구를 시작하지 못했습니다.', 'error');
      });
  };

  GW.setupMastheadSearch = function () {
    var input = document.getElementById('mh-search-input');
    var btn = document.getElementById('mh-search-btn');
    if (!input || !btn) return;

    ensureSearchModal();

    function go(query) {
      var q = String(query || '').trim();
      if (!q) return;
      window.location.href = '/search.html?q=' + encodeURIComponent(q);
    }

    function submitFromInput() {
      go(input.value || '');
    }

    btn.addEventListener('click', function (e) {
      if (GW.isMobileViewport()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openSearchModal(input.value || '');
        return;
      }
      submitFromInput();
    }, true);

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (GW.isMobileViewport()) {
        e.preventDefault();
        openSearchModal(input.value || '');
        return;
      }
      submitFromInput();
    }, true);

    input.addEventListener('focus', function () {
      if (!GW.isMobileViewport()) return;
      openSearchModal(input.value || '');
      input.blur();
    });

    input.addEventListener('click', function (e) {
      if (!GW.isMobileViewport()) return;
      e.preventDefault();
      openSearchModal(input.value || '');
    });

    function ensureSearchModal() {
      if (document.getElementById('mobile-search-modal')) return;
      var modal = document.createElement('div');
      modal.id = 'mobile-search-modal';
      modal.className = 'mobile-search-modal';
      modal.innerHTML =
        '<div class="mobile-search-modal-backdrop" data-search-close></div>' +
        '<div class="mobile-search-modal-card" role="dialog" aria-modal="true" aria-labelledby="mobile-search-title">' +
          '<div class="mobile-search-modal-head">' +
            '<strong id="mobile-search-title">검색</strong>' +
            '<button type="button" class="mobile-search-close-btn" data-search-close aria-label="검색 닫기">닫기</button>' +
          '</div>' +
          '<div class="mobile-search-modal-body">' +
            '<input type="search" id="mobile-search-input" class="mobile-search-input" placeholder="검색어를 입력하세요" autocomplete="off" />' +
            '<button type="button" id="mobile-search-submit" class="mobile-search-submit">검색</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-search-close]').forEach(function (node) {
        node.addEventListener('click', closeSearchModal);
      });

      document.getElementById('mobile-search-submit').addEventListener('click', function () {
        var modalInput = document.getElementById('mobile-search-input');
        go(modalInput && modalInput.value || '');
      });

      document.getElementById('mobile-search-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          go(e.target.value || '');
        }
        if (e.key === 'Escape') closeSearchModal();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSearchModal();
      });
    }

    function openSearchModal(value) {
      var modal = document.getElementById('mobile-search-modal');
      var modalInput = document.getElementById('mobile-search-input');
      if (!modal || !modalInput) return;
      modal.classList.add('open');
      document.body.classList.add('search-modal-open');
      modalInput.value = String(value || '').trim();
      setTimeout(function () { modalInput.focus(); }, 10);
    }

    function closeSearchModal() {
      var modal = document.getElementById('mobile-search-modal');
      if (!modal) return;
      modal.classList.remove('open');
      document.body.classList.remove('search-modal-open');
    }
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
        GW.optimizeImageFile(file, { maxW: 1200, maxH: 1200, quality: 0.8 })
          .then(function (result) {
            self._data = { url: result.dataUrl, caption: '' };
            self._showImage(result.dataUrl, '');
          })
          .catch(function () {
            GW.showToast('본문 이미지 최적화 실패', 'error');
          });
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

  document.addEventListener('DOMContentLoaded', function () {
    GW.setupMastheadSearch();
    GW.initPreviewRuntime();
  });

})();
