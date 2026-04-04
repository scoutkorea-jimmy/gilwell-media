/**
 * Gilwell Media · Shared Utilities
 * Exposes a global GW namespace used by board.js and admin-v3.js.
 */
(function () {
  'use strict';

  const GW = window.GW = {};
  GW.APP_VERSION = '00.107.00';
  GW.ADMIN_VERSION = '03.046.12';
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
  function _getKstDateParts(dateStr) {
    if (!dateStr) return null;
    const normalized = String(dateStr).trim().replace(' ', 'T');
    const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+00:00';
    const d = new Date(withZone);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const out = {};
    parts.forEach(function (part) {
      if (part.type !== 'literal') out[part.type] = part.value;
    });
    return out;
  }

  /** Format an ISO date string as Korean: 2026년 3월 12일 */
  GW.formatDate = function (dateStr) {
    var parts = _getKstDateParts(dateStr);
    if (!parts) return dateStr || '';
    return Number(parts.year) + '년 ' + Number(parts.month) + '월 ' + Number(parts.day) + '일';
  };

  GW.formatDateTime = function (dateStr) {
    var parts = _getKstDateParts(dateStr);
    if (!parts) return dateStr || '';
    return [
      parts.year + '년',
      parts.month + '월',
      parts.day + '일',
      parts.hour + '시',
      parts.minute + '분',
      parts.second + '초',
      'KST'
    ].join(' ');
  };

  GW.formatDateTimeCompactKst = function (dateStr) {
    var parts = _getKstDateParts(dateStr);
    if (!parts) return dateStr || '';
    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute + ' KST';
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

  GW.getKstDateTimeInputValue = function () {
    var now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    function pad(value) {
      return String(value).padStart(2, '0');
    }
    return [
      now.getUTCFullYear(),
      '-',
      pad(now.getUTCMonth() + 1),
      '-',
      pad(now.getUTCDate()),
      'T',
      pad(now.getUTCHours()),
      ':',
      pad(now.getUTCMinutes())
    ].join('');
  };

  GW.toDatetimeLocalValue = function (dateStr) {
    if (!dateStr) return '';
    var normalized = String(dateStr).trim().replace(' ', 'T');
    if (!normalized) return '';
    var withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+09:00';
    var date = new Date(withZone);
    if (isNaN(date.getTime())) {
      return normalized.slice(0, 16);
    }
    function pad(value) {
      return String(value).padStart(2, '0');
    }
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      'T',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes())
    ].join('');
  };

  GW.normalizePublishAtValue = function (value) {
    var trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed + ' 12:00:00';
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed.replace('T', ' ') + ':00';
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
      return trimmed + ':00';
    }
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed.replace('T', ' ');
    }
    return '';
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
      return '<option value="Editor.' + l + '">' + GW.escapeHtml(label) + '</option>';
    }).join('');
  };

  GW.validatePostEditorOutput = function (outputData, opts) {
    var blocks = (outputData && outputData.blocks) || [];
    var allowEmpty = !!(opts && opts.allowEmpty);
    if (!blocks.length && !allowEmpty) {
      return { ok: false, error: '내용을 입력해주세요' };
    }
    var imageCount = blocks.filter(function (b) { return b.type === 'image'; }).length;
    if (imageCount > 10) {
      return { ok: false, error: '본문 이미지는 최대 10개까지 가능합니다' };
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

  GW.uniqueTagStrings = function (items) {
    var seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map(function (item) { return String(item || '').trim(); })
      .filter(function (item) {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  };

  GW.addManagedTagToCategory = function (tagValue, category) {
    var value = String(tagValue || '').trim();
    var target = GW.TAG_CATEGORIES.indexOf(category) >= 0 ? category : 'korea';
    if (!value) {
      return Promise.reject(new Error('태그명을 입력해주세요'));
    }
    if (!(GW.getToken && GW.getToken() && GW.getAdminRole && GW.getAdminRole() === 'full')) {
      return Promise.reject(new Error('이 계정은 태그 추가 권한이 없습니다'));
    }

    return fetch('/api/settings/tags', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('태그 설정을 불러오지 못했습니다');
        return response.json();
      })
      .then(function (data) {
        var settings = GW.normalizeTagSettings({
          common: data && data.common,
          categories: data && data.categories,
        });
        var available = GW.getTagsForCategory(settings, target);
        if (available.indexOf(value) >= 0) {
          return {
            created: false,
            selectedTag: value,
            common: settings.common,
            categories: settings.categories,
          };
        }
        settings.categories[target] = GW.uniqueTagStrings((settings.categories[target] || []).concat(value));
        return GW.apiFetch('/api/settings/tags', {
          method: 'PUT',
          body: JSON.stringify({
            common: settings.common,
            categories: settings.categories,
          }),
        }).then(function (saved) {
          return {
            created: true,
            selectedTag: value,
            common: saved && saved.common,
            categories: saved && saved.categories,
          };
        });
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
    var siteVer  = 'V' + GW.APP_VERSION;
    var adminVer = 'V' + GW.ADMIN_VERSION;
    document.querySelectorAll('.site-build-version').forEach(function (el) {
      el.textContent = siteVer;
    });
    document.querySelectorAll('.admin-build-version').forEach(function (el) {
      el.textContent = adminVer;
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
          if (!ctx) {
            reject(new Error('이미지 캔버스를 준비하지 못했습니다'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          var preserveTransparency = /^image\/png$/i.test(file.type || '') || /^image\/webp$/i.test(file.type || '');
          var forcePng = !!options.forcePng || GW.isSvgFile(file) || preserveTransparency;
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

  GW.renderText = function (str) {
    return GW.renderTextWithMedia(str).html;
  };

  GW.renderEditorInlineText = function (value) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  };

  GW.renderEditorListItems = function (items, listTag) {
    var childTag = listTag === 'ol' ? 'ol' : 'ul';
    return (Array.isArray(items) ? items : []).map(function (item) {
      if (typeof item === 'string') {
        return '<li>' + GW.renderEditorInlineText(item) + '</li>';
      }
      if (!item || typeof item !== 'object') return '';
      var nested = Array.isArray(item.items) && item.items.length
        ? '<' + childTag + '>' + GW.renderEditorListItems(item.items, childTag) + '</' + childTag + '>'
        : '';
      return '<li>' + GW.renderEditorInlineText(item.content || '') + nested + '</li>';
    }).join('');
  };

  GW.renderTextWithMedia = function (str) {
    if (!str) return '';
    const trimmed = str.trim();

    // Editor.js JSON: {"time":...,"blocks":[...],"version":...}
    if (trimmed.charAt(0) === '{') {
      try {
        const doc = JSON.parse(trimmed);
        if (Array.isArray(doc.blocks)) {
          var html = doc.blocks.map(function (b) {
            switch (b.type) {
              case 'paragraph':
                return '<p>' + GW.renderEditorInlineText(b.data.text || '') + '</p>';
              case 'header': {
                var lvl = b.data.level || 2;
                return '<h' + lvl + '>' + GW.renderEditorInlineText(b.data.text || '') + '</h' + lvl + '>';
              }
              case 'list': {
                var tag = b.data.style === 'ordered' ? 'ol' : 'ul';
                var items = GW.renderEditorListItems(b.data.items || [], tag);
                return '<' + tag + '>' + items + '</' + tag + '>';
              }
              case 'quote':
                return '<blockquote>' + GW.renderEditorInlineText(b.data.text || '') + '</blockquote>';
              case 'image': {
                var url = (b.data.file && b.data.file.url) ? b.data.file.url : (b.data.url || '');
                var cap = GW.escapeHtml(b.data.caption || '');
                var html = '<div class="post-inline-media"><img src="' + GW.escapeHtml(url) + '" alt="' + cap + '" style="max-width:100%;height:auto;display:block;margin:0 auto;"></div>';
                if (cap) html += '<p class="post-image-caption">' + cap + '</p>';
                return html;
              }
              default: return '';
            }
          }).join('');
          return { html: html, gallery: [] };
        }
      } catch (e) { /* fall through */ }
    }

    // Quill HTML output starts with a block tag
    if (/^<(p|h[1-6]|ul|ol|blockquote|div)/i.test(trimmed)) {
      return { html: str, gallery: [] };
    }
    return { html: GW.escapeHtml(str).replace(/\n/g, '<br>'), gallery: [] };
  };

  GW.renderContentGallery = function (items, options) {
    var slides = Array.isArray(items) ? items.filter(function (item) { return item && item.url; }) : [];
    if (slides.length < 2) return '';
    var className = (options && options.className) ? ' ' + options.className : '';
    return '<section class="content-gallery' + className + '" data-gallery-interval="3000">' +
      '<div class="content-gallery-track">' +
        '<div class="content-gallery-slides">' +
        slides.map(function (item, index) {
          var cap = GW.escapeHtml(item.caption || '');
          return '<figure class="content-gallery-slide' + (index === 0 ? ' is-active' : '') + '">' +
            '<div class="content-gallery-media"><img src="' + GW.escapeHtml(item.url) + '" alt="' + cap + '"></div>' +
            (cap ? '<figcaption class="post-image-caption">' + cap + '</figcaption>' : '') +
          '</figure>';
        }).join('') +
        '</div>' +
        '<div class="content-gallery-controls">' +
          '<div class="content-gallery-dots">' +
            slides.map(function (_, index) {
              return '<button type="button" class="content-gallery-dot' + (index === 0 ? ' is-active' : '') + '" data-gallery-index="' + index + '" aria-label="슬라이드 ' + (index + 1) + '"></button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="content-gallery-pause" aria-label="슬라이드 일시정지" aria-pressed="false">일시정지</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="content-gallery-nav content-gallery-prev" aria-label="이전 사진">‹</button>' +
      '<button type="button" class="content-gallery-nav content-gallery-next" aria-label="다음 사진">›</button>' +
    '</section>';
  };

  GW.initContentGalleries = function (root) {
    var scope = root || document;
    scope.querySelectorAll('.content-gallery').forEach(function (gallery) {
      if (gallery.dataset.galleryReady === '1') return;
      gallery.dataset.galleryReady = '1';
      var track = gallery.querySelector('.content-gallery-track');
      var slidesWrap = gallery.querySelector('.content-gallery-slides');
      var slides = Array.prototype.slice.call(gallery.querySelectorAll('.content-gallery-slide'));
      var dots = Array.prototype.slice.call(gallery.querySelectorAll('.content-gallery-dot'));
      var prevBtn = gallery.querySelector('.content-gallery-prev');
      var nextBtn = gallery.querySelector('.content-gallery-next');
      var pauseBtn = gallery.querySelector('.content-gallery-pause');
      if (slides.length < 2) return;
      var current = 0;
      var intervalMs = parseInt(gallery.getAttribute('data-gallery-interval') || '3000', 10) || 3000;
      var timer = null;
      var paused = false;
      var dragStartX = 0;
      var dragDeltaX = 0;
      var dragging = false;
      function updateTrackPosition(offsetPx) {
        if (!slidesWrap || !track) return;
        var trackWidth = track.clientWidth || 1;
        var percentage = (-current * trackWidth + (offsetPx || 0)) / trackWidth * 100;
        slidesWrap.style.transform = 'translateX(' + percentage + '%)';
      }
      function sync(next) {
        current = (next + slides.length) % slides.length;
        slides.forEach(function (slide, idx) { slide.classList.toggle('is-active', idx === current); });
        dots.forEach(function (dot, idx) { dot.classList.toggle('is-active', idx === current); });
        updateTrackPosition(0);
      }
      function advance() { sync((current + 1) % slides.length); }
      function retreat() { sync((current - 1 + slides.length) % slides.length); }
      function clearTimer() {
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      }
      function startTimer() {
        clearTimer();
        if (paused) return;
        timer = window.setInterval(advance, intervalMs);
      }
      dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          var index = parseInt(dot.getAttribute('data-gallery-index') || '0', 10);
          sync(index);
          startTimer();
        });
      });
      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          retreat();
          startTimer();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          advance();
          startTimer();
        });
      }
      if (pauseBtn) {
        pauseBtn.addEventListener('click', function () {
          paused = !paused;
          pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
          pauseBtn.textContent = paused ? '재생' : '일시정지';
          if (paused) clearTimer();
          else startTimer();
        });
      }
      function onPointerDown(clientX) {
        dragging = true;
        dragStartX = clientX;
        dragDeltaX = 0;
        clearTimer();
        gallery.classList.add('is-dragging');
      }
      function onPointerMove(clientX) {
        if (!dragging) return;
        dragDeltaX = clientX - dragStartX;
        updateTrackPosition(dragDeltaX);
      }
      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        gallery.classList.remove('is-dragging');
        if (Math.abs(dragDeltaX) > 40) {
          if (dragDeltaX < 0) advance();
          else retreat();
        } else {
          updateTrackPosition(0);
        }
        dragDeltaX = 0;
        startTimer();
      }
      gallery.addEventListener('touchstart', function (event) {
        if (!event.touches || !event.touches[0]) return;
        onPointerDown(event.touches[0].clientX);
      }, { passive: true });
      gallery.addEventListener('touchmove', function (event) {
        if (!event.touches || !event.touches[0]) return;
        onPointerMove(event.touches[0].clientX);
      }, { passive: true });
      gallery.addEventListener('touchend', onPointerUp);
      gallery.addEventListener('mousedown', function (event) {
        if (event.button !== 0) return;
        onPointerDown(event.clientX);
      });
      gallery.addEventListener('mousemove', function (event) {
        onPointerMove(event.clientX);
      });
      gallery.addEventListener('mouseup', onPointerUp);
      gallery.addEventListener('mouseleave', function () {
        if (dragging) onPointerUp();
      });
      sync(0);
      startTimer();
      gallery.addEventListener('mouseenter', clearTimer);
      gallery.addEventListener('mouseleave', function () {
        if (!dragging) startTimer();
      });
    });
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

  GW.KAKAO_JS_KEY = window.GW_KAKAO_JS_KEY || (window.GW_BOOT_RUNTIME && window.GW_BOOT_RUNTIME.kakao_js_key) || window.KAKAO_JS_KEY || '';
  GW._shareModalState = null;
  GW._kakaoSdkPromise = null;

  GW.isMobileShareContext = function () {
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return true;
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  };

  GW.buildShareUrl = function (url, source) {
    var raw = String(url || window.location.href || '').trim();
    var channel = String(source || 'share').trim().toLowerCase() || 'share';
    var parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch (_) {
      return raw;
    }
    parsed.searchParams.set('utm_source', channel);
    parsed.searchParams.set('utm_medium', 'social-share');
    parsed.searchParams.set('utm_campaign', 'bpmedia-share');
    return parsed.toString();
  };

  GW.ensureShareModal = function () {
    if (document.getElementById('share-modal')) return;
    var overlay = document.createElement('div');
    overlay.id = 'share-modal';
    overlay.className = 'share-modal';
    overlay.innerHTML =
      '<div class="share-modal-card" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">' +
        '<button type="button" class="share-modal-close" id="share-modal-close" aria-label="닫기">×</button>' +
        '<div class="share-modal-kicker">공유하기</div>' +
        '<h3 id="share-modal-title" class="share-modal-title"></h3>' +
        '<p class="share-modal-help">공유하기에 맞는 링크가 자동으로 준비됩니다.</p>' +
        '<div class="share-modal-actions">' +
          '<button type="button" class="share-modal-btn share-modal-btn-kakao" data-share-channel="kakaotalk">' +
            '<span class="share-modal-btn-label">카카오톡</span><span class="share-modal-btn-help">메신저 공유</span>' +
          '</button>' +
          '<button type="button" class="share-modal-btn share-modal-btn-facebook" data-share-channel="facebook">' +
            '<span class="share-modal-btn-label">페이스북</span><span class="share-modal-btn-help">공개 링크 공유</span>' +
          '</button>' +
          '<button type="button" class="share-modal-btn share-modal-btn-copy" data-share-channel="copy">' +
            '<span class="share-modal-btn-label">URL 복사</span><span class="share-modal-btn-help">복사 후 직접 공유</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) GW.closeShareModal();
    });
    document.body.appendChild(overlay);
    document.getElementById('share-modal-close').addEventListener('click', GW.closeShareModal);
    overlay.querySelectorAll('[data-share-channel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        GW.handleShareChannel(btn.getAttribute('data-share-channel') || '');
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') GW.closeShareModal();
    });
  };

  GW.openShareModal = function (options) {
    options = options || {};
    GW._shareModalState = {
      url: String(options.url || window.location.href || '').trim(),
      title: String(options.title || document.title || '').trim(),
      text: String(options.text || options.title || document.title || '').trim()
    };
    GW.ensureShareModal();
    var overlay = document.getElementById('share-modal');
    var titleEl = document.getElementById('share-modal-title');
    if (!overlay || !titleEl) return;
    titleEl.textContent = GW._shareModalState.title || '이 글을 공유합니다';
    overlay.classList.add('open');
    document.body.classList.add('share-modal-open');
  };

  GW.closeShareModal = function () {
    var overlay = document.getElementById('share-modal');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('share-modal-open');
  };

  GW.loadKakaoSdk = function () {
    if (window.Kakao && window.Kakao.Share) {
      if (GW.KAKAO_JS_KEY && !window.Kakao.isInitialized()) {
        window.Kakao.init(GW.KAKAO_JS_KEY);
      }
      return Promise.resolve(window.Kakao);
    }
    if (!GW.KAKAO_JS_KEY) {
      return Promise.reject(new Error('kakao-unconfigured'));
    }
    if (GW._kakaoSdkPromise) return GW._kakaoSdkPromise;
    GW._kakaoSdkPromise = new Promise(function (resolve, reject) {
      var existing = document.getElementById('kakao-share-sdk');
      if (existing) {
        existing.addEventListener('load', function () {
          try {
            if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(GW.KAKAO_JS_KEY);
            resolve(window.Kakao);
          } catch (err) {
            reject(err);
          }
        }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.id = 'kakao-share-sdk';
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.0/kakao.min.js';
      script.async = true;
      script.onload = function () {
        try {
          if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(GW.KAKAO_JS_KEY);
          resolve(window.Kakao);
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return GW._kakaoSdkPromise;
  };

  GW.shareViaKakao = function (state) {
    var trackedUrl = GW.buildShareUrl(state.url, 'kakaotalk');
    return GW.loadKakaoSdk()
      .then(function (Kakao) {
        if (!Kakao || !Kakao.Share || !Kakao.Share.sendScrap) {
          throw new Error('kakao-sdk-unavailable');
        }
        Kakao.Share.sendScrap({
          requestUrl: trackedUrl
        });
        GW.showToast('카카오톡 공유 창을 열었습니다.', 'success');
      })
      .catch(function () {
        if (navigator.share && GW.isMobileShareContext()) {
          return navigator.share({
            title: state.title,
            text: state.text,
            url: trackedUrl
          }).then(function () {
            GW.showToast('공유 시트를 열었습니다. 카카오톡을 선택해주세요.', 'success');
          }).catch(function (err) {
            if (err && err.name === 'AbortError') return;
            return GW.copyText(trackedUrl).then(function () {
              GW.showToast('카카오 설정이 연결되지 않아 링크를 복사했습니다.', 'success');
            });
          });
        }
        return GW.copyText(trackedUrl).then(function () {
            GW.showToast('카카오 설정이 연결되지 않아 링크를 복사했습니다.', 'success');
          });
      });
    };

  GW.handleShareChannel = function (channel) {
    var state = GW._shareModalState;
    if (!state || !state.url) return;
    var trackedUrl = GW.buildShareUrl(state.url, channel || 'share');
    if (channel === 'facebook') {
      window.open(
        'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(trackedUrl),
        '_blank',
        'noopener,noreferrer,width=640,height=680'
      );
      GW.showToast('페이스북 공유 창을 열었습니다.', 'success');
      GW.closeShareModal();
      return;
    }
    if (channel === 'copy') {
      GW.copyText(trackedUrl)
        .then(function () {
          GW.showToast('URL을 복사했습니다. 원하는 곳에 직접 공유해주세요.', 'success');
          GW.closeShareModal();
        })
        .catch(function () {
          GW.showToast('링크 복사에 실패했습니다.', 'error');
        });
      return;
    }
    if (channel === 'kakaotalk') {
      GW.shareViaKakao(state).finally(function () {
        GW.closeShareModal();
      });
      return;
    }
  };

  GW.sharePostLink = function (options) {
    GW.openShareModal(options || {});
    return Promise.resolve();
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
  GW.readCookie = function (name) {
    var cookie = document.cookie || '';
    var parts = cookie ? cookie.split(/;\s*/) : [];
    for (var i = 0; i < parts.length; i += 1) {
      var item = parts[i];
      var eqIdx = item.indexOf('=');
      if (eqIdx <= 0) continue;
      if (item.slice(0, eqIdx) !== name) continue;
      return decodeURIComponent(item.slice(eqIdx + 1));
    }
    return '';
  };
  GW.getToken  = function () {
    return sessionStorage.getItem('admin_session') || GW.readCookie('admin_session') || '';
  };
  GW.setToken  = function () {
    sessionStorage.setItem('admin_session', '1');
  };
  GW.clearToken = function () {
    sessionStorage.removeItem('admin_session');
    sessionStorage.removeItem('admin_role');
    document.cookie = 'admin_session=; Path=/; Max-Age=0; Secure; SameSite=Lax';
    document.cookie = 'admin_role=; Path=/; Max-Age=0; Secure; SameSite=Lax';
    fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
    }).catch(function () {});
  };
  GW.getAdminRole = function () { return sessionStorage.getItem('admin_role') || GW.readCookie('admin_role') || 'full'; };
  GW.setAdminRole = function (role) {
    sessionStorage.setItem('admin_role', role === 'full' ? 'full' : 'full');
  };

  // ── API fetch ─────────────────────────────────────────────
  /**
   * Fetch a JSON API endpoint.
   * Uses same-origin cookies for admin auth.
   * Throws an Error with .status if the response is not ok.
   */
  GW.apiFetch = async function (url, options) {
    const headers = Object.assign({ 'Content-Type': 'application/json' },
                                   (options && options.headers) || {});
    const res  = await fetch(url, Object.assign({}, options, {
      headers,
      credentials: 'same-origin',
    }));
    const data = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      const err = new Error(data.error || 'API 오류가 발생했습니다');
      err.status = res.status;
      err.data = data;
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(function (key) {
          if (!(key in err)) err[key] = data[key];
        });
      }
      if (res.status === 401 && typeof document !== 'undefined' && document.body && (document.body.classList.contains('admin-page') || document.body.classList.contains('admin-v3'))) {
        try {
          GW.clearToken();
        } catch (_) {}
        document.dispatchEvent(new CustomEvent('gw:admin-auth-required', {
          detail: {
            message: err.message || '관리자 로그인이 필요합니다.',
            source: url,
          },
        }));
      }
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
        current_url: window.location.href || '',
        referrer: document.referrer || '',
      }),
      keepalive: true,
    }).catch(function () {});
  };

  GW.trackPostEngagement = function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var match = /^\/post\/(\d+)(?:\/)?$/.exec(window.location.pathname || '');
    if (!match) return;
    if (GW.getToken && GW.getToken()) return;

    var postId = parseInt(match[1], 10);
    if (!Number.isFinite(postId) || postId < 1) return;

    var sessionKey = 'post-' + postId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    var totalMs = 0;
    var activeStartedAt = 0;
    var lastSentSeconds = 0;

    function beginActive(now) {
      if (document.visibilityState !== 'visible') return;
      if (!activeStartedAt) activeStartedAt = now || Date.now();
    }

    function sampleActive(now) {
      if (!activeStartedAt) return;
      var current = now || Date.now();
      totalMs += Math.max(0, current - activeStartedAt);
      activeStartedAt = current;
    }

    function currentSeconds() {
      return Math.floor(totalMs / 1000);
    }

    function sendPayload(seconds) {
      if (seconds <= lastSentSeconds) return;
      lastSentSeconds = seconds;
      var payload = JSON.stringify({
        post_id: postId,
        session_key: sessionKey,
        engaged_seconds: seconds,
      });
      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/analytics/post-engagement', blob);
          return;
        }
      } catch (_) {}
      fetch('/api/analytics/post-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }

    function flush(force) {
      sampleActive(Date.now());
      var seconds = currentSeconds();
      if (!force && seconds < 5) return;
      if (force && seconds < 1) return;
      sendPayload(seconds);
    }

    beginActive(Date.now());

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flush(true);
        activeStartedAt = 0;
      } else {
        beginActive(Date.now());
      }
    });

    window.addEventListener('pagehide', function () {
      flush(true);
      activeStartedAt = 0;
    });

    window.addEventListener('beforeunload', function () {
      flush(true);
      activeStartedAt = 0;
    });

    window.setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      flush(false);
    }, 15000);
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
      GW.trackPostEngagement();
    }, { once: true });
  } else {
    GW.trackPageVisit();
    GW.trackPostEngagement();
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

  GW._customStrings = window.GW_BOOT_CUSTOM_STRINGS || {};
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
    GW.CATEGORIES.korea.label = GW.t('nav.korea');
    GW.CATEGORIES.apr.label = GW.t('nav.apr');
    GW.CATEGORIES.wosm.label = GW.t('nav.wosm');
    GW.CATEGORIES.people.label = GW.t('nav.people');
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
    if (GW._customStrings && Object.keys(GW._customStrings).length) {
      GW.applyLang();
      if (GW._statsData) GW._renderStats();
    }
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

  GW.setupMastheadSearch = function () {
    var input = document.getElementById('mh-search-input');
    var btn = document.getElementById('mh-search-btn');
    if (!input || !btn) return;

    ensureSearchModal();

    function go(query) {
      var q = String(query || '').trim();
      if (!q) return;
      window.location.href = '/search?q=' + encodeURIComponent(q);
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
    GW.initContentGalleries(document);
  });

})();
