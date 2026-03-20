/**
 * Gilwell Media · Admin Panel Logic
 * Depends on GW namespace from js/main.js.
 */
(function () {
  'use strict';

  var editingId       = null;
  var _adminEditor    = null;
  var _adminCoverImg  = null;
  var _adminGalleryImages = [];
  var _adminSelTags   = [];   // multi-select tags
  var _adminDraftTimer = null;
  var _adminTurnstileWidgetId = null;
  var _adminTurnstileToken = '';
  var _reorderDirty   = false; // drag-and-drop changed order
  var _heroPostIds    = [];   // current hero post IDs (up to 5)
  var _heroPosts      = [];
  var _heroIntervalMs = 3000;
  var _heroRevision   = null;
  var _tagSettings    = GW.normalizeTagSettings(null);
  var _dragTagValue   = '';
  var _dragTagSource  = '';
  var _siteMeta       = {
    pages: {
      home: { title: '', description: '' },
      latest: { title: '', description: '' },
      korea: { title: '', description: '' },
      apr: { title: '', description: '' },
      wosm: { title: '', description: '' },
      people: { title: '', description: '' },
      glossary: { title: '', description: '' },
      ai_guide: { title: '', description: '' },
      contributors: { title: '', description: '' },
      search: { title: '', description: '' },
    },
    footer: {
      raw_text: '',
      title: 'BP미디어',
      description: '',
      domain_label: 'bpmedia.net',
      tip_email: 'story@bpmedia.net',
      contact_email: 'info@bpmedia.net',
    },
    image_url: null,
    google_verification: '',
    naver_verification: '',
  };
  var _siteMetaRevision = null;

  function getFooterEditorValue(id, fallback) {
    var el = document.getElementById(id);
    var value = el && typeof el.value === 'string' ? el.value.trim() : '';
    return value || (fallback || '');
  }

  function buildSiteFooterHtml(footer) {
    var safe = footer || {};
    var blocks = [];
    if (safe.title) {
      blocks.push('<h4>' + GW.escapeHtml(safe.title) + '</h4>');
    }
    if (safe.description) {
      blocks.push('<p>' + GW.escapeHtml(safe.description) + '</p>');
    }
    if (safe.domain_label) {
      blocks.push('<p>' + GW.escapeHtml(safe.domain_label) + '</p>');
    }
    if (safe.tip_email) {
      blocks.push('<p>기사제보: <a href="mailto:' + GW.escapeHtml(safe.tip_email) + '">' + GW.escapeHtml(safe.tip_email) + '</a></p>');
    }
    if (safe.contact_email) {
      blocks.push('<p>문의: <a href="mailto:' + GW.escapeHtml(safe.contact_email) + '">' + GW.escapeHtml(safe.contact_email) + '</a></p>');
    }
    return blocks.join('');
  }

  function readFooterEditorState() {
    var footer = _siteMeta.footer || {};
    return {
      title: getFooterEditorValue('site-footer-title', footer.title || 'BP미디어'),
      description: getFooterEditorValue('site-footer-description', footer.description || ''),
      domain_label: getFooterEditorValue('site-footer-domain', footer.domain_label || 'bpmedia.net'),
      tip_email: getFooterEditorValue('site-footer-tip-email', footer.tip_email || 'story@bpmedia.net'),
      contact_email: getFooterEditorValue('site-footer-contact-email', footer.contact_email || 'info@bpmedia.net'),
    };
  }

  function renderSiteFooterPreview(footer) {
    var preview = document.getElementById('site-footer-preview');
    if (!preview) return;
    preview.innerHTML = buildSiteFooterHtml(footer);
  }

  function bindSiteFooterEditor() {
    ['site-footer-title', 'site-footer-description', 'site-footer-domain', 'site-footer-tip-email', 'site-footer-contact-email']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.dataset.boundPreview === 'true') return;
        el.dataset.boundPreview = 'true';
        ['input', 'change'].forEach(function (eventName) {
          el.addEventListener(eventName, function () {
            renderSiteFooterPreview(readFooterEditorState());
          });
        });
      });
  }

  // Pagination state
  var _listPage     = 1;
  var _listCat      = 'all';
  var _listTotal    = 0;
  var _listSearch   = '';
  var _listSearchTimer = null;
  var _PAGE_SIZE    = 20;
  var _PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
  var _historyItems = [];
  var _historyPage  = 1;
  var _historyLoaded = false;
  var GLOSSARY_BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  var GLOSSARY_CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];
  var _HISTORY_PAGE_SIZE = 10;
  var _glossaryItems = [];
  var _glossaryEditingId = null;
  var _calendarItems = [];
  var _calendarCopy = null;
  var _calendarEditingId = null;
  var _calendarTags = [];
  var _calendarTagPresets = [];
  var _calendarRelatedPost = null;
  var _calendarRelatedPosts = [];
  var _calendarSearchTimer = null;
  var _calendarGeoMap = null;
  var _calendarGeoMarker = null;
  var _analyticsViewMode = 'chart';
  var _analyticsChartModes = { visitors: 'line', views: 'line' };
  var _analyticsPayload = null;
  var _adminGroup = 'overview';
  var _adminActiveTab = 'dashboard';
  var _adminRole = GW.getAdminRole ? GW.getAdminRole() : 'full';
  var _adminManualRelatedPosts = [];
  var _adminRelatedSearchTimer = null;
  var _boardLayout = { gap_px: 6 };
  var _boardBannerInfo = {
    items: {
      korea: { event_name: '', event_date: '' },
      apr: { event_name: '', event_date: '' },
      wosm: { event_name: '', event_date: '' },
      people: { event_name: '', event_date: '' },
    },
  };
  var _currentListPosts = [];

  // Hero search cache
  var _allPosts = [];
  var _heroSearchPage = 1;
  var _heroSearchHasMore = true;
  var _heroSearchLoading = false;
  var _heroSearchQuery = '';
  var _heroSearchResults = [];
  var _heroSearchBound = false;
  var _featureDefinitionLoaded = false;
  var _homeLeadPost = null;
  var _homeLeadMedia = defaultHomeLeadMedia();
  var _homeLeadSearchTimer = null;
  var _homeLeadSearchResults = [];

  function defaultResponsiveMedia() {
    return {
      fit: 'cover',
      desktop: {
        position_x: 50,
        position_y: 50,
        zoom: 100,
      },
      mobile: {
        position_x: 50,
        position_y: 50,
        zoom: 100,
      },
    };
  }

  function defaultHomeLeadMedia() {
    return defaultResponsiveMedia();
  }

  function normalizeHomeLeadMedia(media) {
    return normalizeResponsiveMedia(media);
  }

  function normalizeHeroMedia(media) {
    return normalizeResponsiveMedia(media);
  }

  function normalizeResponsiveMedia(media) {
    var raw = media && typeof media === 'object' ? media : {};
    var fallbackDesktop = {
      position_x: clampHomeLeadValue(raw.position_x, 0, 100, 50),
      position_y: clampHomeLeadValue(raw.position_y, 0, 100, 50),
      zoom: clampHomeLeadValue(raw.zoom, 60, 150, 100),
    };
    var fallbackMobile = {
      position_x: fallbackDesktop.position_x,
      position_y: fallbackDesktop.position_y,
      zoom: fallbackDesktop.zoom,
    };
    var desktop = raw.desktop && typeof raw.desktop === 'object' ? raw.desktop : raw;
    var mobile = raw.mobile && typeof raw.mobile === 'object' ? raw.mobile : raw;
    return {
      fit: raw.fit === 'contain' ? 'contain' : 'cover',
      desktop: {
        position_x: clampHomeLeadValue(desktop.position_x, 0, 100, fallbackDesktop.position_x),
        position_y: clampHomeLeadValue(desktop.position_y, 0, 100, fallbackDesktop.position_y),
        zoom: clampHomeLeadValue(desktop.zoom, 60, 150, fallbackDesktop.zoom),
      },
      mobile: {
        position_x: clampHomeLeadValue(mobile.position_x, 0, 100, fallbackMobile.position_x),
        position_y: clampHomeLeadValue(mobile.position_y, 0, 100, fallbackMobile.position_y),
        zoom: clampHomeLeadValue(mobile.zoom, 60, 150, fallbackMobile.zoom),
      },
    };
  }

  function clampHomeLeadValue(value, min, max, fallback) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function getResponsivePreviewStyle(media, device) {
    var config = normalizeResponsiveMedia(media);
    var target = config[device === 'mobile' ? 'mobile' : 'desktop'];
    var renderFit = target.zoom < 100 ? 'contain' : config.fit;
    return [
      'object-fit:' + renderFit,
      'object-position:' + target.position_x + '% ' + target.position_y + '%',
      'transform:scale(' + (target.zoom / 100).toFixed(2) + ')',
      'transform-origin:' + target.position_x + '% ' + target.position_y + '%'
    ].join(';');
  }

  function getResponsivePreviewFrameStyle(media, device) {
    var config = normalizeResponsiveMedia(media);
    var target = config[device === 'mobile' ? 'mobile' : 'desktop'];
    var backdropOpacity = target.zoom < 100 ? 0.4 : 0;
    return '--media-backdrop-opacity:' + backdropOpacity.toFixed(2);
  }

  function getHomeLeadPreviewStyle(media, device) {
    return getResponsivePreviewStyle(media, device || 'desktop');
  }

  function buildResponsiveMediaEditor(prefix, media, imageUrl, altText) {
    var config = normalizeResponsiveMedia(media);
    var variantClass = prefix.indexOf('hero-slot-') === 0 ? ' is-hero' : ' is-home-lead';
    var imageStyle = 'background-image:url(' + GW.escapeHtml(imageUrl) + ');';
    function buildDevice(device, label) {
      var current = config[device];
      return '' +
        '<div class="admin-media-device-card" data-media-device="' + device + '">' +
          '<div class="admin-media-device-head">' +
            '<strong>' + label + '</strong>' +
            '<span>' + (device === 'mobile' ? '모바일 화면 기준' : '데스크톱 화면 기준') + '</span>' +
          '</div>' +
          '<div id="' + prefix + '-' + device + '-frame" class="admin-media-preview-frame' + variantClass + (device === 'mobile' ? ' is-mobile' : ' is-desktop') + '" data-media-src="' + GW.escapeHtml(imageUrl) + '" style="' + getResponsivePreviewFrameStyle(config, device) + '">' +
            '<div class="admin-media-preview-backdrop" aria-hidden="true" style="' + imageStyle + '"></div>' +
            '<img id="' + prefix + '-' + device + '-preview" src="' + GW.escapeHtml(imageUrl) + '" alt="' + GW.escapeHtml(altText || '') + '" style="' + getResponsivePreviewStyle(config, device) + '">' +
          '</div>' +
          '<div class="admin-media-control">' +
            '<label for="' + prefix + '-' + device + '-position-x">좌우 위치</label>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="' + prefix + '-' + device + '-position-x" min="0" max="100" step="1" value="' + current.position_x + '">' +
              '<span id="' + prefix + '-' + device + '-position-x-value">' + current.position_x + '%</span>' +
            '</div>' +
          '</div>' +
          '<div class="admin-media-control">' +
            '<label for="' + prefix + '-' + device + '-position-y">상하 위치</label>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="' + prefix + '-' + device + '-position-y" min="0" max="100" step="1" value="' + current.position_y + '">' +
              '<span id="' + prefix + '-' + device + '-position-y-value">' + current.position_y + '%</span>' +
            '</div>' +
          '</div>' +
          '<div class="admin-media-control">' +
            '<label for="' + prefix + '-' + device + '-zoom">이미지 확대</label>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="' + prefix + '-' + device + '-zoom" min="60" max="150" step="1" value="' + current.zoom + '">' +
              '<span id="' + prefix + '-' + device + '-zoom-value">' + current.zoom + '%</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    return '' +
      '<div class="admin-media-editor">' +
        '<div class="admin-media-control admin-media-control-fit">' +
          '<label for="' + prefix + '-fit">이미지 맞춤</label>' +
          '<select id="' + prefix + '-fit">' +
            '<option value="cover"' + (config.fit === 'cover' ? ' selected' : '') + '>꽉 채우기</option>' +
            '<option value="contain"' + (config.fit === 'contain' ? ' selected' : '') + '>원본 비율</option>' +
          '</select>' +
        '</div>' +
        '<div class="admin-media-device-grid">' +
          buildDevice('desktop', 'PC 버전') +
          buildDevice('mobile', '모바일 버전') +
        '</div>' +
      '</div>';
  }

  function bindResponsiveMediaControls(prefix, onChange) {
    var fit = document.getElementById(prefix + '-fit');
    if (!fit) return;
    var devices = ['desktop', 'mobile'];

    function buildNextMedia() {
      return normalizeResponsiveMedia({
        fit: fit.value,
        desktop: {
          position_x: document.getElementById(prefix + '-desktop-position-x').value,
          position_y: document.getElementById(prefix + '-desktop-position-y').value,
          zoom: document.getElementById(prefix + '-desktop-zoom').value,
        },
        mobile: {
          position_x: document.getElementById(prefix + '-mobile-position-x').value,
          position_y: document.getElementById(prefix + '-mobile-position-y').value,
          zoom: document.getElementById(prefix + '-mobile-zoom').value,
        },
      });
    }

    function applyPreview() {
      var nextMedia = buildNextMedia();
      devices.forEach(function (device) {
        ['position-x', 'position-y', 'zoom'].forEach(function (field) {
          var input = document.getElementById(prefix + '-' + device + '-' + field);
          var label = document.getElementById(prefix + '-' + device + '-' + field + '-value');
          if (!input || !label) return;
          label.textContent = input.value + (field === 'zoom' ? '%' : '%');
        });
        var frame = document.getElementById(prefix + '-' + device + '-frame');
        if (frame) frame.style.cssText = getResponsivePreviewFrameStyle(nextMedia, device);
        var preview = document.getElementById(prefix + '-' + device + '-preview');
        if (preview) preview.style.cssText = getResponsivePreviewStyle(nextMedia, device);
      });
      if (typeof onChange === 'function') onChange(nextMedia);
    }

    var nodes = [fit];
    devices.forEach(function (device) {
      nodes.push(document.getElementById(prefix + '-' + device + '-position-x'));
      nodes.push(document.getElementById(prefix + '-' + device + '-position-y'));
      nodes.push(document.getElementById(prefix + '-' + device + '-zoom'));
    });
    nodes.filter(Boolean).forEach(function (node) {
      node.addEventListener('input', applyPreview);
      node.addEventListener('change', applyPreview);
    });
    applyPreview();
  }

  function getAdminRole() {
    return _adminRole === 'limited' ? 'limited' : 'full';
  }

  function isLimitedAdmin() {
    return getAdminRole() === 'limited';
  }

  function isFullAdmin() {
    return !isLimitedAdmin();
  }

  function canAccessAdminTab(tab) {
    if (isFullAdmin()) return true;
    return ['dashboard', 'analytics', 'hero-manager', 'history'].indexOf(tab) >= 0;
  }

  function canAccessAdminGroup(group) {
    if (isFullAdmin()) return true;
    return ['overview', 'site'].indexOf(group) >= 0;
  }

  // ─── Boot ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    bindAdminAuthEvents();
    bootAdminAccess();
    var pwInput = document.getElementById('pw-input');
    if (pwInput) { pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); }
    var tagInput = document.getElementById('tag-new-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addManagedTag();
        }
      });
    }
    _bindHeroSearchUi();

    // Handle ?edit=ID in URL (for edit button on post pages)
    var editParam = new URLSearchParams(location.search).get('edit');
    if (editParam && GW.getToken() && (!GW.getAdminRole || GW.getAdminRole() === 'full')) {
      verifyAdminSession().then(function (session) {
        if (!session || session.authenticated !== true) return;
        showAdmin();
        setTimeout(function () { editPost(parseInt(editParam, 10)); }, 500);
      }).catch(function () {
        showAdminLoginPrompt('관리자 세션을 다시 확인해주세요.');
      });
    }
  });

  // ─── Login ───────────────────────────────────────────────
  window.doLogin = function () {
    var pw  = (document.getElementById('pw-input').value || '').trim();
    var err = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');
    if (!pw) return;

    // Collect Turnstile token if widget is active
    var cfInput = document.querySelector('#login-turnstile input[name="cf-turnstile-response"]');
    var cfToken = cfInput ? cfInput.value : '';
    if (GW.TURNSTILE_SITE_KEY && !cfToken) {
      err.textContent = 'CAPTCHA를 완료해주세요'; err.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '로그인 중…'; err.style.display = 'none';
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw, cf_turnstile_response: cfToken }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        _adminRole = data.role || 'full';
        showAdmin();
        var editParam = new URLSearchParams(location.search).get('edit');
        if (editParam && isFullAdmin()) {
          setTimeout(function () { editPost(parseInt(editParam, 10)); }, 600);
        }
      })
      .catch(function (e) {
        err.textContent = e.message || '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        document.getElementById('pw-input').value = ''; document.getElementById('pw-input').focus();
        if (window.turnstile) window.turnstile.reset();
      })
      .finally(function () { btn.disabled = false; btn.textContent = '관리자 입장'; });
  };

  window.doLogout = function () {
    GW.clearToken();
    _adminRole = 'full';
    showAdminLoginPrompt('');
    document.getElementById('pw-input').value = '';
  };

  function showAdmin() {
    _adminRole = GW.getAdminRole ? GW.getAdminRole() : 'full';
    var login = document.getElementById('login-screen');
    var admin = document.getElementById('admin-screen');
    if (login) login.style.display = 'none';
    if (admin) {
      admin.hidden = false;
      admin.setAttribute('aria-hidden', 'false');
      admin.style.display = 'block';
    }
    syncAdminPreviewLink();
    applyAdminPermissions();
    if (isFullAdmin()) {
      _loadEditorJs(function () {
        _initAdminEditor();
        _startAdminDraftAutosave();
      });
      loadTagsAdmin();
      loadTickerAdmin();
      loadEditorsAdmin();
      loadTranslationsAdmin();
      loadAiDisclaimerAdmin();
      loadContributorsAdmin();
      loadSiteMetaAdmin();
      loadBoardLayoutAdmin();
      loadBoardBannerAdmin();
      loadAdminList();
      _ensureAdminWriteTurnstile();
    }
    loadHeroAdmin();
    loadDashboard();
    if (isFullAdmin()) {
      var dateEl = document.getElementById('art-date');
      if (dateEl && !dateEl.value) dateEl.value = GW.getKstDateTimeInputValue();
      updateCatPreview();
      updateEditorActionState();
    }
    showAdminTab('dashboard');
  }

  function getAdminAccessDeniedMessage(message) {
    return message || '권한이 없는 사이트에요! 부적절한 접근은 안돼요! 관리자 비밀번호를 입력해주세요.';
  }

  function showAdminLoginPrompt(message) {
    var login = document.getElementById('login-screen');
    var admin = document.getElementById('admin-screen');
    var err = document.getElementById('login-error');
    var silent = message === '';
    var nextMessage = silent ? '' : getAdminAccessDeniedMessage(message);
    if (login) login.style.display = 'flex';
    if (admin) {
      admin.hidden = true;
      admin.setAttribute('aria-hidden', 'true');
      admin.style.display = 'none';
    }
    if (err) {
      err.textContent = nextMessage;
      err.style.display = silent ? 'none' : 'block';
    }
    if (!silent) GW.showToast(nextMessage, 'error');
    var pwInput = document.getElementById('pw-input');
    if (pwInput) {
      pwInput.value = '';
      setTimeout(function () { pwInput.focus(); }, 30);
    }
  }

  function bindAdminAuthEvents() {
    if (document.body.dataset.adminAuthBound === 'true') return;
    document.body.dataset.adminAuthBound = 'true';
    document.addEventListener('gw:admin-auth-required', function (event) {
      var detail = event && event.detail ? event.detail : {};
      showAdminLoginPrompt(detail.message || '관리자 로그인이 필요합니다.');
    });
    window.addEventListener('pageshow', function () {
      if (!document.body.classList.contains('admin-page')) return;
      if (!GW.getToken()) {
        showAdminLoginPrompt('');
        return;
      }
      verifyAdminSession().catch(function () {
        showAdminLoginPrompt('관리자 세션을 다시 확인해주세요.');
      });
    });
  }

  function bootAdminAccess() {
    if (!GW.getToken()) {
      showAdminLoginPrompt('');
      return;
    }
    verifyAdminSession().then(function (session) {
      if (!session || session.authenticated !== true) {
        showAdminLoginPrompt('관리자 로그인이 필요합니다.');
        return;
      }
      if (GW.setAdminRole) GW.setAdminRole(session.role || 'full');
      _adminRole = session.role || 'full';
      showAdmin();
    }).catch(function () {
      showAdminLoginPrompt('관리자 세션을 다시 확인해주세요.');
    });
  }

  function verifyAdminSession() {
    return GW.apiFetch('/api/admin/session', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function syncAdminPreviewLink() {
    var link = document.getElementById('admin-preview-link');
    if (!link) return;
    var host = String(window.location.hostname || '').toLowerCase();
    var isPreviewHost = host === 'preview.gilwell-media.pages.dev';
    var previewUrl = isPreviewHost ? (window.location.origin + '/') : 'https://preview.gilwell-media.pages.dev/';
    link.href = previewUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = isPreviewHost ? '프리뷰 홈 보기 ↗' : '프리뷰 보기 ↗';
    link.setAttribute('aria-label', link.textContent);
    if (link.dataset.previewBound === 'true') return;
    link.dataset.previewBound = 'true';
    link.addEventListener('click', function (event) {
      event.preventDefault();
      if (link.dataset.previewChecking === 'true') return;
      link.dataset.previewChecking = 'true';
      var originalText = link.textContent;
      link.textContent = '프리뷰 확인 중…';
      fetch(resolvePreviewReleaseUrl(isPreviewHost), {
        cache: 'no-store',
        credentials: 'omit',
      })
        .then(function (response) {
          if (!response.ok) throw new Error('preview-release-fetch-failed');
          return response.json();
        })
        .then(function (data) {
          var release = data && data.release ? data.release : null;
          var hasPendingChanges = releaseHasPendingChanges(release);
          if (!hasPendingChanges) {
            GW.showToast('아직 추가 수정이나 개발된 사항이 없는 최신버전이에요.', 'success');
            return;
          }
          window.open(previewUrl, '_blank', 'noopener');
        })
        .catch(function () {
          GW.showToast('프리뷰 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
        })
        .finally(function () {
          link.dataset.previewChecking = 'false';
          link.textContent = originalText;
        });
    });
  }

  window.openKmsPage = function () {
    window.location.href = '/kms.html';
  };

  function resolvePreviewReleaseUrl(isPreviewHost) {
    return isPreviewHost
      ? (window.location.origin + '/api/preview/release')
      : 'https://preview.gilwell-media.pages.dev/api/preview/release';
  }

  function releaseHasPendingChanges(release) {
    if (!release || typeof release !== 'object') return true;
    if (release.has_pending_changes === false) return false;
    if (release.has_pending_changes === true) return true;
    var pendingVersions = Array.isArray(release.pending_versions) ? release.pending_versions.filter(Boolean) : [];
    if (pendingVersions.length > 0) return true;
    var liveVersion = String(release.live_version || '').trim();
    var previewVersion = String(release.version || '').trim();
    if (liveVersion && previewVersion && liveVersion === previewVersion) return false;
    return true;
  }

  // ─── Tab navigation ───────────────────────────────────────
  var TAB_GROUPS = {
    dashboard: 'overview',
    analytics: 'overview',
    write: 'content',
    list: 'content',
    glossary: 'content',
    calendar: 'content',
    settings: 'site',
    'feature-definition': 'site',
    'hero-manager': 'site',
    'home-lead': 'site',
    contributors: 'site',
    translations: 'site',
    history: 'site',
  };

  function getAdminTabsForGroup(group) {
    return Object.keys(TAB_GROUPS).filter(function (tab) {
      return TAB_GROUPS[tab] === group && canAccessAdminTab(tab);
    });
  }

  function getDefaultAdminTabForGroup(group) {
    var groupTabs = getAdminTabsForGroup(group);
    return groupTabs.length ? groupTabs[0] : 'dashboard';
  }

  window.showAdminGroup = function (group, activateDefaultTab) {
    var nextGroup = TAB_GROUPS[group] ? TAB_GROUPS[group] : group;
    _adminGroup = canAccessAdminGroup(nextGroup) ? nextGroup : 'overview';
    document.querySelectorAll('.admin-group-btn').forEach(function (btn) {
      var active = btn.id === 'group-btn-' + _adminGroup;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    document.querySelectorAll('.admin-sidebar-group[data-admin-group]').forEach(function (section) {
      syncAdminSidebarGroupVisibility(section, section.getAttribute('data-admin-group') === _adminGroup);
    });

    if (activateDefaultTab) {
      var nextTab = TAB_GROUPS[_adminActiveTab] === _adminGroup ? _adminActiveTab : getDefaultAdminTabForGroup(_adminGroup);
      if (nextTab && nextTab !== _adminActiveTab) {
        showAdminTab(nextTab, true);
        return;
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  };

  window.showAdminTab = function (tab, skipGroupSync) {
    if (!canAccessAdminTab(tab)) {
      tab = isLimitedAdmin() ? 'dashboard' : 'dashboard';
    }
    _adminActiveTab = tab;
    document.querySelectorAll('.admin-tab-panel').forEach(function (p) { p.classList.remove('active'); });
    var panel = document.getElementById('admin-tab-' + tab);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.admin-tab-btn, .admin-sidebar-btn').forEach(function (b) {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.admin-tab-strip-btn').forEach(function (b) {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    var btn = document.getElementById('tab-btn-' + tab);
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }
    var stripBtn = document.getElementById('tab-strip-' + tab);
    if (stripBtn) {
      stripBtn.classList.add('active');
      stripBtn.setAttribute('aria-current', 'page');
    }
    if (!skipGroupSync) showAdminGroup(TAB_GROUPS[tab] || 'overview');
    if (tab === 'list') loadAdminList();
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'analytics') loadAnalyticsPage();
    if (tab === 'write') _maybeRestoreAdminDraft();
    if (tab === 'glossary') loadGlossaryAdmin();
    if (tab === 'calendar') loadCalendarAdmin();
    if (tab === 'history') loadVersionHistory();
    if (tab === 'hero-manager' || tab === 'home-lead') loadHeroAdmin();
    if (tab === 'feature-definition') {
      openKmsPage();
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  window.scrollAdminSection = function (id) {
    if (isLimitedAdmin()) {
      id = 'settings-hero-manager';
      showAdminTab('hero-manager');
    } else if (id === 'settings-hero-manager') {
      showAdminTab('hero-manager');
    } else if (id === 'settings-home-lead') {
      showAdminTab('home-lead');
    } else {
      showAdminTab('settings');
    }
    setTimeout(function () {
      var el = document.getElementById(id);
      if (!el) return;
      var header = document.querySelector('.admin-header');
      var sidebar = document.querySelector('.admin-sidebar');
      var offset = 12;
      if (header) offset += header.getBoundingClientRect().height;
      if (sidebar) offset += Math.min(sidebar.getBoundingClientRect().height, 64);
      var top = window.pageYOffset + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 50);
  };

  function applyAdminPermissions() {
    var limited = isLimitedAdmin();
    document.querySelectorAll('[data-role-min="full"]').forEach(function (el) {
      el.style.display = limited ? 'none' : '';
    });
    document.querySelectorAll('.admin-subnav-btn').forEach(function (btn) {
      var target = btn.getAttribute('data-settings-section');
      if (!target) return;
      var panel = document.getElementById(target);
      var allowed = panel ? panel.style.display !== 'none' : true;
      btn.style.display = allowed ? '' : 'none';
    });
    var contentGroup = document.querySelector('.admin-sidebar-group[data-admin-group="content"]');
    if (contentGroup) syncAdminSidebarGroupVisibility(contentGroup, !limited && _adminGroup === 'content');
    var siteGroup = document.querySelector('.admin-sidebar-group[data-admin-group="site"]');
    if (siteGroup) syncAdminSidebarGroupVisibility(siteGroup, _adminGroup === 'site');
    var overviewGroup = document.querySelector('.admin-sidebar-group[data-admin-group="overview"]');
    if (overviewGroup) syncAdminSidebarGroupVisibility(overviewGroup, _adminGroup === 'overview');
  }

  function loadFeatureDefinitionAdmin() {
    if (_featureDefinitionLoaded) return;
    _featureDefinitionLoaded = true;
    GW.apiFetch('/api/settings/feature-definition')
      .then(function (data) {
        var content = String(data && data.content || '').trim();
        var input = document.getElementById('feature-definition-input');
        if (input) {
          input.value = content;
          if (input.dataset.bound !== 'true') {
            input.dataset.bound = 'true';
            input.addEventListener('input', function () {
              renderFeatureDefinitionPreview(input.value || '');
            });
          }
        }
        renderFeatureDefinitionPreview(content);
      })
      .catch(function (err) {
        var preview = document.getElementById('feature-definition-preview');
        if (preview) preview.innerHTML = '<div class="list-empty">' + GW.escapeHtml(err.message || '기능 정의서를 불러오지 못했습니다.') + '</div>';
      });
  }

  function defaultCalendarCopy() {
    return {
      page_title: '일정 캘린더',
      page_description: '등록된 일정과 행사 정보를 월별로 확인할 수 있습니다.',
      month_view_label: '월간 일정보기',
      month_view_summary: '월간 일정보기입니다. 여러 날 이어지는 일정은 막대형으로 표시됩니다.',
      year_view_label: '연간 일정보기',
      year_view_summary: '연간 일정보기입니다. 월별로 정렬된 일정을 한 번에 확인할 수 있습니다.',
      today_button_label: '오늘로 가기',
      add_event_label: '일정 추가',
      status_panel_label: '상태별 일정',
      ongoing_label: '진행중',
      upcoming_label: '개최예정',
      finished_label: '행사종료',
      ongoing_empty: '진행중인 일정이 없습니다.',
      upcoming_empty: '선택한 달 기준 3개월 안에 예정된 일정이 없습니다.',
      finished_empty: '선택한 달 기준 최근 3개월 안에 종료된 일정이 없습니다.',
      map_title: '캘린더 지도',
      map_help: '축소 시 국가 단위로 묶이고, 확대할수록 세부 행사 위치를 볼 수 있습니다.',
    };
  }

  function populateCalendarCopyEditor(copy) {
    _calendarCopy = Object.assign(defaultCalendarCopy(), copy || {});
    Object.keys(_calendarCopy).forEach(function (key) {
      var input = document.getElementById('calendar-copy-' + key.replace(/_/g, '-'));
      if (input) input.value = _calendarCopy[key] || '';
    });
  }

  function renderFeatureDefinitionPreview(content) {
    var preview = document.getElementById('feature-definition-preview');
    if (!preview) return;
    var text = String(content || '').replace(/\r\n/g, '\n');
    if (!text.trim()) {
      preview.innerHTML = '<div class="list-empty">정의서 내용을 입력하면 여기에서 바로 미리볼 수 있습니다.</div>';
      return;
    }
    var parts = text.split(/```/);
    var html = parts.map(function (part, index) {
      if (index % 2 === 1) {
        var lines = part.replace(/^\n+|\n+$/g, '').split('\n');
        var language = '';
        if (lines.length && /^[A-Za-z0-9_-]+$/.test(lines[0].trim())) {
          language = lines.shift().trim();
        }
        return '<div class="feature-definition-code-wrap">' +
          (language ? '<div class="feature-definition-code-label">' + GW.escapeHtml(language) + '</div>' : '') +
          '<pre class="feature-definition-code"><code>' + GW.escapeHtml(lines.join('\n')) + '</code></pre>' +
        '</div>';
      }
      return renderFeatureDefinitionText(part);
    }).join('');
    preview.innerHTML = html;
  }

  function renderFeatureDefinitionText(text) {
    var lines = String(text || '').split('\n');
    var html = [];
    var inList = false;
    lines.forEach(function (line) {
      var raw = line.trim();
      if (!raw) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        return;
      }
      if (/^###\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h4>' + GW.escapeHtml(raw.replace(/^###\s+/, '')) + '</h4>');
        return;
      }
      if (/^##\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h3>' + GW.escapeHtml(raw.replace(/^##\s+/, '')) + '</h3>');
        return;
      }
      if (/^#\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + GW.escapeHtml(raw.replace(/^#\s+/, '')) + '</h2>');
        return;
      }
      if (/^-\s+/.test(raw)) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push('<li>' + formatFeatureDefinitionInline(raw.replace(/^-\s+/, '')) + '</li>');
        return;
      }
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push('<p>' + formatFeatureDefinitionInline(raw) + '</p>');
    });
    if (inList) html.push('</ul>');
    return html.join('');
  }

  function formatFeatureDefinitionInline(text) {
    return GW.escapeHtml(String(text || '')).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function syncAdminSidebarGroupVisibility(section, visible) {
    if (!section) return;
    section.hidden = !visible;
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
    section.classList.toggle('is-open', !!visible);
  }

  // ─── Editor.js loader ─────────────────────────────────────
  function _loadEditorJs(callback) {
    if (window.EditorJS) { callback(); return; }
    function loadScript(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s); }
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
      var pending = 3;
      function done() { if (--pending === 0) callback(); }
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js',   done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js',  done);
    });
  }

  function _initAdminEditor() {
    if (_adminEditor) return;
    _adminEditor = new window.EditorJS({
      holder: 'admin-editorjs',
      placeholder: '내용을 작성하세요…',
      tools: {
        header: { class: window.Header, config: { levels: [2,3,4], defaultLevel: 2 } },
        list:   { class: window.List,   inlineToolbar: true },
        quote:  { class: window.Quote,  inlineToolbar: true },
        image:  { class: GW.makeEditorImageTool() },
      },
    });
  }

  // ─── Cover image upload ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('admin-cover-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { _uploadAdminCover(); });
    var galleryBtn = document.getElementById('admin-gallery-btn');
    if (galleryBtn) galleryBtn.addEventListener('click', function () { _uploadAdminGalleryImages(); });
  });

  function _uploadAdminCover() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 }).then(function (result) {
        var dataUrl = result.dataUrl;
        _adminCoverImg = dataUrl;
        renderAdminCoverPreview();
      }).catch(function (err) {
        GW.showToast(err && err.message ? err.message : '대표 이미지 최적화 실패', 'error');
      });
    };
    input.click();
  }

  function _uploadAdminGalleryImages() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      var remaining = Math.max(0, 10 - _adminGalleryImages.length);
      if (!files.length) return;
      if (!remaining) {
        GW.showToast('슬라이드 이미지는 최대 10장까지 추가할 수 있습니다', 'error');
        return;
      }
      files.slice(0, remaining).reduce(function (chain, file) {
        return chain.then(function () {
          return GW.optimizeImageFile(file, { maxW: 1800, maxH: 1800, quality: 0.84 }).then(function (result) {
            _adminGalleryImages.push({ url: result.dataUrl, caption: '' });
          });
        });
      }, Promise.resolve()).then(function () {
        renderAdminGalleryPreview();
      }).catch(function (err) {
        GW.showToast(err && err.message ? err.message : '슬라이드 이미지 처리 실패', 'error');
      });
    };
    input.click();
  }

  function _uploadImageAsDataUrl(done) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 }).then(function (result) {
        done(result.dataUrl);
      }).catch(function (err) {
        GW.showToast(err && err.message ? err.message : '이미지 최적화 실패', 'error');
      });
    };
    input.click();
  }

  // ─── Tag selector (multi-select) ─────────────────────────
  function loadTagsForSelector() {
    var sel = document.getElementById('admin-tag-selector');
    if (!sel) return;
    var categoryEl = document.getElementById('art-category');
    var category = categoryEl ? categoryEl.value : 'korea';
    var tags = GW.getTagsForCategory(_tagSettings, category);
    _adminSelTags.forEach(function (tag) {
      if (tags.indexOf(tag) < 0) tags.push(tag);
    });
    var html = '<button type="button" class="tag-pill" data-tag="">없음</button>';
    tags.forEach(function (t) {
      html += '<button type="button" class="tag-pill" data-tag="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</button>';
    });
    sel.innerHTML = html;
    _syncTagPills(sel);
    sel.querySelectorAll('.tag-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tagVal = btn.dataset.tag || '';
        if (tagVal === '') {
          _adminSelTags = [];
        } else {
          var idx = _adminSelTags.indexOf(tagVal);
          if (idx >= 0) { _adminSelTags.splice(idx, 1); }
          else { _adminSelTags.push(tagVal); }
        }
        _syncTagPills(sel);
      });
    });
  }

  function _syncTagPills(sel) {
    if (!sel) return;
    sel.querySelectorAll('.tag-pill').forEach(function (b) {
      var t = b.dataset.tag || '';
      if (t === '') {
        b.classList.toggle('active', _adminSelTags.length === 0);
      } else {
        b.classList.toggle('active', _adminSelTags.indexOf(t) >= 0);
      }
    });
  }

  function _renderTagSettingsManager() {
    ['common', 'korea', 'apr', 'wosm', 'people'].forEach(function (target) {
      var lane = document.getElementById('tag-lane-' + target);
      if (!lane) return;
      var items = target === 'common' ? _tagSettings.common : _tagSettings.categories[target];
      lane.innerHTML = items.length ? items.map(function (tag) {
        return '<div class="tag-admin-chip" draggable="true" data-tag="' + GW.escapeHtml(tag) + '" data-source="' + target + '">' +
          '<span>' + GW.escapeHtml(tag) + '</span>' +
          '<button type="button" class="tag-admin-chip-edit" data-edit-tag="' + GW.escapeHtml(tag) + '" title="태그 수정">수정</button>' +
          '<button type="button" class="tag-admin-chip-remove" data-remove-tag="' + GW.escapeHtml(tag) + '" title="태그 삭제">×</button>' +
        '</div>';
      }).join('') : '<div class="tag-admin-empty">비어 있음</div>';

      lane.querySelectorAll('.tag-admin-chip').forEach(function (chip) {
        chip.addEventListener('dragstart', function () {
          _dragTagValue = chip.dataset.tag || '';
          _dragTagSource = chip.dataset.source || '';
          chip.classList.add('dragging');
        });
        chip.addEventListener('dragend', function () {
          _dragTagValue = '';
          _dragTagSource = '';
          chip.classList.remove('dragging');
          document.querySelectorAll('.tag-admin-lane').forEach(function (el) { el.classList.remove('drag-over'); });
        });
      });

      lane.querySelectorAll('.tag-admin-chip-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          attemptManagedTagRemoval(btn.getAttribute('data-remove-tag') || '');
        });
      });

      lane.querySelectorAll('.tag-admin-chip-edit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var before = btn.getAttribute('data-edit-tag') || '';
          requestTagUsage(before).then(function (usage) {
            if (usage && usage.in_use) {
              GW.showToast(buildTagUsageToast(usage.tag || before, usage), 'error');
              return;
            }
            var after = window.prompt('태그명을 수정하세요', before);
            if (after == null) return;
            after = after.trim();
            if (!after) {
              GW.showToast('태그명을 입력해주세요', 'error');
              return;
            }
            _renameTagEverywhere(before, after);
            _renderTagSettingsManager();
            loadTagsForSelector();
          }).catch(function (err) {
            GW.showToast(err && err.message ? err.message : '태그 사용 여부를 확인하지 못했습니다', 'error');
          });
        });
      });

      lane.ondragover = function (e) {
        e.preventDefault();
        lane.classList.add('drag-over');
      };
      lane.ondragleave = function () {
        lane.classList.remove('drag-over');
      };
      lane.ondrop = function (e) {
        e.preventDefault();
        lane.classList.remove('drag-over');
        var targetKey = lane.getAttribute('data-tag-target') || 'common';
        if (!_dragTagValue || !targetKey || _dragTagSource === targetKey) return;
        _moveTagToTarget(_dragTagValue, targetKey);
        _renderTagSettingsManager();
        loadTagsForSelector();
      };
    });
  }

  function _removeTagEverywhere(tag) {
    if (!tag) return;
    _tagSettings.common = _tagSettings.common.filter(function (item) { return item !== tag; });
    GW.TAG_CATEGORIES.forEach(function (category) {
      _tagSettings.categories[category] = _tagSettings.categories[category].filter(function (item) { return item !== tag; });
    });
    _adminSelTags = _adminSelTags.filter(function (item) { return item !== tag; });
  }

  function _moveTagToTarget(tag, targetKey) {
    if (!tag) return;
    _removeTagEverywhere(tag);
    if (targetKey === 'common') {
      _tagSettings.common.push(tag);
    } else if (_tagSettings.categories[targetKey]) {
      _tagSettings.categories[targetKey].push(tag);
    }
  }

  function _renameTagEverywhere(fromTag, toTag) {
    if (!fromTag || !toTag) return;
    if (fromTag === toTag) return;
    _tagSettings.common = _tagSettings.common.map(function (item) { return item === fromTag ? toTag : item; });
    GW.TAG_CATEGORIES.forEach(function (category) {
      _tagSettings.categories[category] = _tagSettings.categories[category].map(function (item) {
        return item === fromTag ? toTag : item;
      });
      _tagSettings.categories[category] = uniqueStrings(_tagSettings.categories[category]);
    });
    _tagSettings.common = uniqueStrings(_tagSettings.common);
    _adminSelTags = _adminSelTags.map(function (item) { return item === fromTag ? toTag : item; });
    _adminSelTags = uniqueStrings(_adminSelTags);
  }

  function uniqueStrings(items) {
    var seen = Object.create(null);
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var key = String(item || '').trim();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  window.addManagedTag = function () {
    var input = document.getElementById('tag-new-input');
    var target = document.getElementById('tag-new-target');
    if (!input || !target) return;
    var value = (input.value || '').trim();
    if (!value) {
      GW.showToast('태그명을 입력해주세요', 'error');
      return;
    }
    _moveTagToTarget(value, target.value || 'common');
    input.value = '';
    _renderTagSettingsManager();
    loadTagsForSelector();
    GW.showToast('태그가 추가됐습니다', 'success');
  };

  window.addEditorManagedTag = function () {
    if (!isFullAdmin()) {
      GW.showToast('이 계정은 태그 추가 권한이 없습니다', 'error');
      return;
    }
    var input = document.getElementById('art-tag-new-input');
    var categoryEl = document.getElementById('art-category');
    var value = (input && input.value || '').trim();
    var target = categoryEl && categoryEl.value ? categoryEl.value : 'common';
    if (!value) {
      GW.showToast('태그명을 입력해주세요', 'error');
      if (input) input.focus();
      return;
    }
    var available = GW.getTagsForCategory(_tagSettings, target);
    if (available.indexOf(value) >= 0) {
      if (_adminSelTags.indexOf(value) < 0) _adminSelTags.push(value);
      loadTagsForSelector();
      if (input) input.value = '';
      GW.showToast('이미 있는 태그라서 바로 선택했습니다', 'success');
      return;
    }
    _moveTagToTarget(value, target);
    if (_adminSelTags.indexOf(value) < 0) _adminSelTags.push(value);
    persistTagSettings('태그를 추가하고 바로 선택했습니다', function (data) {
      _tagSettings = GW.normalizeTagSettings({
        common: data.common,
        categories: data.categories,
      });
      loadTagsForSelector();
      _renderTagSettingsManager();
      if (input) input.value = '';
    }, function (err) {
      _removeTagEverywhere(value);
      _adminSelTags = _adminSelTags.filter(function (item) { return item !== value; });
      GW.showToast(err && err.message ? err.message : '태그 저장 실패', 'error');
    });
  };

  // ─── Save (create or update) ──────────────────────────────
  window.savePost = function () {
    if (!isFullAdmin()) {
      GW.showToast('이 계정은 게시글 작성 권한이 없습니다', 'error');
      return;
    }
    var category = document.getElementById('art-category').value;
    var title    = (document.getElementById('art-title').value    || '').trim();
    var subtitle = (document.getElementById('art-subtitle').value || '').trim();
    var specialFeature = (document.getElementById('art-special-feature').value || '').trim();
    var author   = (document.getElementById('art-author').value   || '').trim();
    var metaTags = (document.getElementById('art-metatags').value || '').trim();
    var youtubeUrl = (document.getElementById('art-youtube-url').value || '').trim();
    var imageCaption = (document.getElementById('art-image-caption').value || '').trim();
    var locationName = (document.getElementById('art-location-name').value || '').trim();
    var locationAddress = (document.getElementById('art-location-address').value || '').trim();
    var btn      = document.getElementById('submit-btn');

    if (!title)      { GW.showToast('제목을 입력해주세요', 'error'); return; }
    if (!_adminEditor) { GW.showToast('에디터가 준비되지 않았습니다', 'error'); return; }
    if (!editingId && GW.TURNSTILE_SITE_KEY && !_adminTurnstileToken) {
      GW.showToast('CAPTCHA를 완료해주세요', 'error'); return;
    }

    btn.disabled = true; btn.textContent = editingId ? '수정 중…' : '게재 중…';

    _adminEditor.save().then(function (outputData) {
      var validation = GW.validatePostEditorOutput(outputData, { allowEmpty: !!editingId });
      if (!validation.ok) {
        GW.showToast(validation.error, 'error');
        btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기';
        return;
      }
      var content = JSON.stringify(outputData);
      var aiEl = document.getElementById('art-ai-assisted');
      var dateEl = document.getElementById('art-date');
      var body = {
        category: category,
        title: title,
        subtitle: subtitle || null,
        special_feature: specialFeature || null,
        content: content,
        image_url: _adminCoverImg || null,
        gallery_images: _adminGalleryImages,
        image_caption: imageCaption || null,
        youtube_url: youtubeUrl || null,
        location_name: locationName || null,
        location_address: locationAddress || null,
        tag: _adminSelTags.length ? _adminSelTags.join(',') : null,
        meta_tags: metaTags || null,
        manual_related_posts: _adminManualRelatedPosts.slice(),
        author: author || undefined,
        ai_assisted: aiEl ? (aiEl.checked ? 1 : 0) : 0,
        publish_at: (dateEl && dateEl.value) ? GW.normalizePublishAtValue(dateEl.value) : undefined,
        cf_turnstile_response: editingId ? undefined : (_adminTurnstileToken || undefined),
      };
      var url    = editingId ? '/api/posts/' + editingId : '/api/posts';
      var method = editingId ? 'PUT' : 'POST';
      GW.apiFetch(url, { method: method, body: JSON.stringify(body) })
        .then(function () {
          GW.showToast(editingId ? '수정됐습니다' : '게재됐습니다', 'success');
          localStorage.removeItem(_getAdminDraftKey());
          _resetAdminWriteTurnstile();
          cancelEdit();
          loadAdminList();
          showAdminTab('list');
        })
        .catch(function (err) {
          if (err.status === 401) { GW.showToast('세션 만료. 다시 로그인해주세요.', 'error'); doLogout(); }
          else {
            GW.showToast(err.message || '저장 실패', 'error');
            _resetAdminWriteTurnstile();
          }
        })
        .finally(function () { btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기'; });
    }).catch(function () {
      GW.showToast('에디터 오류', 'error');
      btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기';
    });
  };

  // ─── Edit ─────────────────────────────────────────────────
  window.editPost = function (id) {
    if (!isFullAdmin()) {
      GW.showToast('이 계정은 게시글 수정 권한이 없습니다', 'error');
      return;
    }
    // Update URL without reload so browser history reflects the edit
    if (history.replaceState) {
      history.replaceState(null, '', '/admin.html?edit=' + id);
    }
    GW.apiFetch('/api/posts/' + id)
      .then(function (data) {
        var p = data.post;
        editingId = p.id;

        // Switch to write tab
        showAdminTab('write');

        document.getElementById('art-category').value  = p.category;
        document.getElementById('art-title').value     = p.title;
        document.getElementById('art-subtitle').value  = p.subtitle || '';
        document.getElementById('art-special-feature').value = p.special_feature || '';
        document.getElementById('art-author').value    = p.author || '';
        document.getElementById('art-metatags').value  = p.meta_tags || '';
        document.getElementById('art-youtube-url').value = p.youtube_url || '';
        document.getElementById('art-image-caption').value = p.image_caption || '';
        document.getElementById('art-location-name').value = p.location_name || '';
        document.getElementById('art-location-address').value = p.location_address || '';
        var locationToggleEl = document.getElementById('admin-location-toggle');
        if (locationToggleEl) locationToggleEl.open = !!(p.location_name || p.location_address);
        var aiChk = document.getElementById('art-ai-assisted');
        if (aiChk) aiChk.checked = !!p.ai_assisted;
        updateCatPreview();

        // Load cover image
        _adminCoverImg = p.image_url || null;
        renderAdminCoverPreview();
        _adminGalleryImages = parseGalleryImagesSeed(p.gallery_images);
        renderAdminGalleryPreview();
        _adminManualRelatedPosts = Array.isArray(p.manual_related_posts) ? p.manual_related_posts.slice(0, 5) : [];
        renderAdminRelatedPostSelected();
        var relatedInput = document.getElementById('admin-related-search-input');
        var relatedResults = document.getElementById('admin-related-search-results');
        if (relatedInput) relatedInput.value = '';
        if (relatedResults) relatedResults.innerHTML = '<div class="admin-inline-note">기사 제목으로 검색하면 최대 5개까지 직접 연결할 수 있습니다.</div>';

        // Load tag selector (multi-select)
        _adminSelTags = p.tag ? p.tag.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
        var sel = document.getElementById('admin-tag-selector');
        if (sel) _syncTagPills(sel);

        // Load publish date
        var dateEl = document.getElementById('art-date');
        if (dateEl && (p.publish_at || p.created_at)) {
          dateEl.value = GW.toDatetimeLocalValue(p.publish_at || p.created_at);
        }
        var createdMetaEl = document.getElementById('art-created-at-meta');
        if (createdMetaEl) createdMetaEl.textContent = '생성 시각: ' + GW.formatDateTime(p.created_at);

        // Load content into Editor.js
        if (_adminEditor) {
          _adminEditor.isReady.then(function () {
            var content = p.content || '';
            var editorData;
            if (content.trim().charAt(0) === '{') {
              try { editorData = JSON.parse(content); } catch (e) { editorData = null; }
            }
            if (editorData && Array.isArray(editorData.blocks)) {
              _adminEditor.render(editorData).catch(function () {});
            } else {
              // Plain text → single paragraph
              _adminEditor.render({ blocks: [{ type: 'paragraph', data: { text: content } }] }).catch(function () {});
            }
          });
        }

        document.getElementById('form-title').textContent = '게시글 수정';
        document.getElementById('submit-btn').textContent = '수정 완료';
        document.getElementById('submit-btn').classList.add('editing');
        var inlineTagInput = document.getElementById('art-tag-new-input');
        if (inlineTagInput) inlineTagInput.value = '';
        updateEditorActionState();
      })
      .catch(function () { GW.showToast('게시글을 불러오지 못했습니다.', 'error'); });
  };

  // ─── Delete ───────────────────────────────────────────────
  window.deletePost = function (id) {
    if (!isFullAdmin()) {
      GW.showToast('이 계정은 게시글 삭제 권한이 없습니다', 'error');
      return;
    }
    if (!confirm('이 게시글을 삭제할까요?\n삭제된 내용은 복구되지 않습니다.')) return;
    GW.apiFetch('/api/posts/' + id, { method: 'DELETE' })
      .then(function () { GW.showToast('삭제됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) {
        if (err.status === 401) { GW.showToast('세션 만료.', 'error'); doLogout(); }
        else GW.showToast(err.message || '삭제 실패', 'error');
      });
  };

  window.searchAdminRelatedPosts = function () {
    clearTimeout(_adminRelatedSearchTimer);
    _adminRelatedSearchTimer = setTimeout(loadAdminRelatedSearchResults, 180);
  };

  function loadAdminRelatedSearchResults() {
    var input = document.getElementById('admin-related-search-input');
    var list = document.getElementById('admin-related-search-results');
    if (!list) return;
    var query = input ? (input.value || '').trim() : '';
    if (!query) {
      list.innerHTML = '<div class="admin-inline-note">기사 제목으로 검색하면 최대 5개까지 직접 연결할 수 있습니다.</div>';
      return;
    }
    list.innerHTML = '<div class="admin-inline-note">관련 기사를 불러오는 중…</div>';
    GW.apiFetch('/api/posts?page=1&limit=8&q=' + encodeURIComponent(query))
      .then(function (data) {
        var rows = Array.isArray(data && data.posts) ? data.posts : [];
        var currentId = editingId ? Number(editingId) : 0;
        rows = rows.filter(function (item) {
          return Number(item.id) !== currentId;
        });
        if (!rows.length) {
          list.innerHTML = '<div class="admin-inline-note">검색 결과 없음</div>';
          return;
        }
        list.innerHTML = rows.map(function (item) {
          var selected = _adminManualRelatedPosts.some(function (related) { return Number(related.id) === Number(item.id); });
          return '<button type="button" class="calendar-related-post-result' + (selected ? ' is-selected' : '') + '" onclick="addAdminManualRelatedPost(' + Number(item.id) + ')">' +
            '<strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
            '<span>' + GW.escapeHtml((GW.CATEGORIES[item.category] || GW.CATEGORIES.korea).label) + (selected ? ' · 선택됨' : '') + '</span>' +
          '</button>';
        }).join('');
      })
      .catch(function () {
        list.innerHTML = '<div class="admin-inline-note">관련 기사 검색에 실패했습니다</div>';
      });
  }

  window.addAdminManualRelatedPost = function (postId) {
    var numericId = parseInt(postId, 10);
    if (!Number.isFinite(numericId) || numericId < 1) return;
    if (_adminManualRelatedPosts.some(function (item) { return Number(item.id) === numericId; })) return;
    if (_adminManualRelatedPosts.length >= 5) {
      GW.showToast('유관기사는 최대 5개까지 직접 설정할 수 있습니다', 'error');
      return;
    }
    GW.apiFetch('/api/posts/' + numericId)
      .then(function (data) {
        var post = data && data.post ? data.post : null;
        if (!post) throw new Error('관련 기사를 불러오지 못했습니다');
        _adminManualRelatedPosts.push({
          id: post.id,
          title: post.title || '',
          category: post.category || '',
          publish_at: post.publish_at || '',
          created_at: post.created_at || '',
        });
        renderAdminRelatedPostSelected();
        loadAdminRelatedSearchResults();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '관련 기사를 추가하지 못했습니다', 'error');
      });
  };

  window.removeAdminManualRelatedPost = function (postId) {
    var numericId = parseInt(postId, 10);
    _adminManualRelatedPosts = _adminManualRelatedPosts.filter(function (item) {
      return Number(item.id) !== numericId;
    });
    renderAdminRelatedPostSelected();
    loadAdminRelatedSearchResults();
  };

  function renderAdminRelatedPostSelected() {
    var wrap = document.getElementById('admin-related-selected');
    if (!wrap) return;
    if (!_adminManualRelatedPosts.length) {
      wrap.innerHTML = '<div class="admin-inline-note">직접 연결한 유관기사가 없습니다. 비워두면 자동 추천만 사용합니다.</div>';
      return;
    }
    wrap.innerHTML = _adminManualRelatedPosts.map(function (item) {
      return '<div class="calendar-related-post-pill">' +
        '<strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
        '<button type="button" class="calendar-related-post-remove" onclick="removeAdminManualRelatedPost(' + Number(item.id) + ')">제거</button>' +
      '</div>';
    }).join('');
  }

  // ─── Cancel edit ──────────────────────────────────────────
  window.cancelEdit = function () {
    editingId = null;
    if (history.replaceState) history.replaceState(null, '', '/admin.html');
    _adminCoverImg = null;
    _adminGalleryImages = [];
    _adminManualRelatedPosts = [];
    _adminSelTags = [];
    document.getElementById('art-title').value    = '';
    document.getElementById('art-subtitle').value = '';
    document.getElementById('art-special-feature').value = '';
    document.getElementById('art-metatags').value = '';
    document.getElementById('art-youtube-url').value = '';
    document.getElementById('art-image-caption').value = '';
    document.getElementById('art-location-name').value = '';
    document.getElementById('art-location-address').value = '';
    var locationToggleEl = document.getElementById('admin-location-toggle');
    if (locationToggleEl) locationToggleEl.open = false;
    var dateEl = document.getElementById('art-date');
    if (dateEl) dateEl.value = GW.getKstDateTimeInputValue();
    var createdMetaEl = document.getElementById('art-created-at-meta');
    if (createdMetaEl) createdMetaEl.textContent = '생성 시각: 새 글 작성 시 자동 기록';
    var authorEl = document.getElementById('art-author');
    if (authorEl && authorEl.tagName === 'SELECT') authorEl.selectedIndex = 0;

    document.getElementById('art-category').value = 'korea';
    var aiChk = document.getElementById('art-ai-assisted');
    if (aiChk) aiChk.checked = false;
    renderAdminCoverPreview();
    renderAdminGalleryPreview();
    renderAdminRelatedPostSelected();
    var relatedInput = document.getElementById('admin-related-search-input');
    var relatedResults = document.getElementById('admin-related-search-results');
    if (relatedInput) relatedInput.value = '';
    if (relatedResults) relatedResults.innerHTML = '<div class="admin-inline-note">기사 제목으로 검색하면 최대 5개까지 직접 연결할 수 있습니다.</div>';
    var sel = document.getElementById('admin-tag-selector');
    if (sel) _syncTagPills(sel);
    var inlineTagInput = document.getElementById('art-tag-new-input');
    if (inlineTagInput) inlineTagInput.value = '';
    if (_adminEditor) { _adminEditor.isReady.then(function(){_adminEditor.clear();}); }
    document.getElementById('form-title').textContent  = '새 게시글 작성';
    document.getElementById('submit-btn').textContent  = '게재하기';
    document.getElementById('submit-btn').classList.remove('editing');
    updateEditorActionState();
    updateCatPreview();
  };

  window.returnToList = function () {
    cancelEdit();
    showAdminTab('list');
  };

  window.deleteEditingPost = function () {
    if (!isFullAdmin()) {
      GW.showToast('이 계정은 게시글 삭제 권한이 없습니다', 'error');
      return;
    }
    if (!editingId) {
      GW.showToast('수정 중인 게시글이 없습니다', 'error');
      return;
    }
    if (!confirm('이 게시글을 삭제할까요?\n삭제된 내용은 복구되지 않습니다.')) return;
    var deletingId = editingId;
    GW.apiFetch('/api/posts/' + deletingId, { method: 'DELETE' })
      .then(function () {
        GW.showToast('삭제됐습니다', 'success');
        cancelEdit();
        showAdminTab('list');
        loadAdminList();
      })
      .catch(function (err) {
        if (err.status === 401) { GW.showToast('세션 만료.', 'error'); doLogout(); return; }
        GW.showToast(err.message || '삭제 실패', 'error');
      });
  };

  function updateEditorActionState() {
    var draftBtn = document.getElementById('admin-draft-btn');
    var cancelBtn = document.getElementById('cancel-btn');
    var backBtn = document.getElementById('back-to-list-btn');
    var deleteBtn = document.getElementById('edit-delete-btn');
    if (draftBtn) draftBtn.classList.add('visible');
    if (cancelBtn) cancelBtn.classList.toggle('visible', !!editingId);
    if (backBtn) backBtn.classList.toggle('visible', !!editingId);
    if (deleteBtn) deleteBtn.classList.toggle('visible', !!editingId);
  }

  function _getAdminDraftKey() {
    var cat = document.getElementById('art-category');
    return 'gw_draft_admin_' + ((cat && cat.value) || 'korea');
  }

  function _collectAdminDraft() {
    var titleEl = document.getElementById('art-title');
    var subEl   = document.getElementById('art-subtitle');
    var specialFeatureEl = document.getElementById('art-special-feature');
    var metaEl  = document.getElementById('art-metatags');
    var youtubeEl = document.getElementById('art-youtube-url');
    var authorEl = document.getElementById('art-author');
    var dateEl   = document.getElementById('art-date');
    var aiEl     = document.getElementById('art-ai-assisted');
    return {
      title: titleEl ? (titleEl.value || '') : '',
      subtitle: subEl ? (subEl.value || '') : '',
      special_feature: specialFeatureEl ? (specialFeatureEl.value || '') : '',
      meta_tags: metaEl ? (metaEl.value || '') : '',
      youtube_url: youtubeEl ? (youtubeEl.value || '') : '',
      image_caption: (document.getElementById('art-image-caption') || {}).value || '',
      location_name: (document.getElementById('art-location-name') || {}).value || '',
      location_address: (document.getElementById('art-location-address') || {}).value || '',
      author: authorEl ? (authorEl.value || '') : '',
      publish_at: dateEl ? GW.normalizePublishAtValue(dateEl.value || '') : '',
      ai_assisted: aiEl ? !!aiEl.checked : false,
      tags: _adminSelTags.slice(),
      image_url: _adminCoverImg || null,
      gallery_images: _adminGalleryImages.slice(),
      manual_related_posts: _adminManualRelatedPosts.slice(),
      category: (document.getElementById('art-category') || {}).value || 'korea',
    };
  }

  function _applyAdminDraft(draft) {
    if (!draft) return;
    document.getElementById('art-category').value = draft.category || 'korea';
    document.getElementById('art-title').value = draft.title || '';
    document.getElementById('art-subtitle').value = draft.subtitle || '';
    document.getElementById('art-special-feature').value = draft.special_feature || '';
    document.getElementById('art-metatags').value = draft.meta_tags || '';
    document.getElementById('art-youtube-url').value = draft.youtube_url || '';
    document.getElementById('art-image-caption').value = draft.image_caption || '';
    document.getElementById('art-location-name').value = draft.location_name || '';
    document.getElementById('art-location-address').value = draft.location_address || '';
    var locationToggleEl = document.getElementById('admin-location-toggle');
    if (locationToggleEl) locationToggleEl.open = !!(draft.location_name || draft.location_address);
    document.getElementById('art-author').value = draft.author || 'Editor A';
    document.getElementById('art-date').value = GW.toDatetimeLocalValue(draft.publish_at || draft.publish_date || '') || GW.getKstDateTimeInputValue();
    document.getElementById('art-ai-assisted').checked = !!draft.ai_assisted;
    _adminSelTags = Array.isArray(draft.tags) ? draft.tags.slice() : [];
    _adminCoverImg = draft.image_url || null;
    _adminGalleryImages = parseGalleryImagesSeed(draft.gallery_images);
    _adminManualRelatedPosts = Array.isArray(draft.manual_related_posts) ? draft.manual_related_posts.slice(0, 5) : [];
    updateCatPreview();
    renderAdminCoverPreview();
    renderAdminGalleryPreview();
    renderAdminRelatedPostSelected();
    var relatedResults = document.getElementById('admin-related-search-results');
    if (relatedResults) relatedResults.innerHTML = '<div class="admin-inline-note">기사 제목으로 검색하면 최대 5개까지 직접 연결할 수 있습니다.</div>';
    var sel = document.getElementById('admin-tag-selector');
    if (sel) _syncTagPills(sel);
    if (_adminEditor && draft.editorData) {
      _adminEditor.isReady.then(function () {
        _adminEditor.render(draft.editorData).catch(function () {});
      });
    }
  }

  function _maybeRestoreAdminDraft() {
    if (editingId) return;
    var titleEl = document.getElementById('art-title');
    if (titleEl && titleEl.value) return;
    var draftStr = localStorage.getItem(_getAdminDraftKey());
    if (!draftStr) return;
    try {
      var draft = JSON.parse(draftStr);
      if (draft && (draft.title || draft.editorData)) {
        if (confirm('저장된 임시 글이 있습니다. 불러올까요?')) {
          _applyAdminDraft(draft);
        }
      }
    } catch (e) {
      localStorage.removeItem(_getAdminDraftKey());
    }
  }

  window.saveAdminDraft = function () {
    var draft = _collectAdminDraft();
    if (!draft.title && !draft.subtitle) {
      GW.showToast('임시저장할 내용이 없습니다', 'error');
      return;
    }
    if (_adminEditor) {
      _adminEditor.save().then(function (data) {
        draft.editorData = data;
        localStorage.setItem(_getAdminDraftKey(), JSON.stringify(draft));
        GW.showToast('임시저장됐습니다', 'success');
      }).catch(function () {
        GW.showToast('임시저장 실패', 'error');
      });
      return;
    }
    localStorage.setItem(_getAdminDraftKey(), JSON.stringify(draft));
    GW.showToast('임시저장됐습니다', 'success');
  };

  function _startAdminDraftAutosave() {
    if (_adminDraftTimer) return;
    _adminDraftTimer = setInterval(function () {
      if (editingId) return;
      var draft = _collectAdminDraft();
      if (!draft.title && !draft.subtitle) return;
      if (_adminEditor) {
        _adminEditor.save().then(function (data) {
          draft.editorData = data;
          localStorage.setItem(_getAdminDraftKey(), JSON.stringify(draft));
        }).catch(function () {});
      }
    }, 30000);
  }

  function _ensureAdminWriteTurnstile() {
    GW.loadTurnstile(function () {
      if (!window.turnstile || !GW.TURNSTILE_SITE_KEY) return;
      if (_adminTurnstileWidgetId == null) {
        _adminTurnstileWidgetId = window.turnstile.render('#admin-write-turnstile', {
          sitekey: GW.TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: function (token) { _adminTurnstileToken = token; },
          'expired-callback': function () { _adminTurnstileToken = ''; },
        });
      }
    });
  }

  function renderAdminCoverPreview() {
    var preview = document.getElementById('admin-cover-preview');
    if (!preview) return;
    if (!_adminCoverImg) {
      preview.innerHTML = '';
      return;
    }
    var src = _adminCoverImg.startsWith && _adminCoverImg.startsWith('http')
      ? GW.escapeHtml(_adminCoverImg)
      : _adminCoverImg;
    preview.innerHTML = '<img src="' + src + '" class="cover-preview-img">' +
      '<button type="button" class="cover-remove-btn" id="admin-cover-remove">× 제거</button>';
    document.getElementById('admin-cover-remove').addEventListener('click', function () {
      _adminCoverImg = null;
      preview.innerHTML = '';
    });
  }

  function renderAdminGalleryPreview() {
    var preview = document.getElementById('admin-gallery-preview');
    var counter = document.getElementById('admin-gallery-count');
    if (counter) counter.textContent = String(_adminGalleryImages.length) + '/10';
    if (!preview) return;
    if (!_adminGalleryImages.length) {
      preview.innerHTML = '<p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에서만 별도 슬라이드로 노출됩니다.</p>';
      return;
    }
    preview.innerHTML = _adminGalleryImages.map(function (item, index) {
      var src = item.url && item.url.startsWith && item.url.startsWith('http') ? GW.escapeHtml(item.url) : item.url;
      return '<div class="gallery-upload-item">' +
        '<img src="' + src + '" class="gallery-upload-thumb" alt="슬라이드 이미지 ' + (index + 1) + '">' +
        '<button type="button" class="gallery-upload-remove" data-index="' + index + '">제거</button>' +
      '</div>';
    }).join('');
    preview.querySelectorAll('.gallery-upload-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-index') || '-1', 10);
        if (!Number.isFinite(index) || index < 0) return;
        _adminGalleryImages.splice(index, 1);
        renderAdminGalleryPreview();
      });
    });
  }

  function parseGalleryImagesSeed(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.slice(0, 10);
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch (_) {
      return [];
    }
  }

  function _resetAdminWriteTurnstile() {
    _adminTurnstileToken = '';
    if (window.turnstile && _adminTurnstileWidgetId != null) {
      window.turnstile.reset(_adminTurnstileWidgetId);
    }
  }

  // ─── Admin list loading (paginated) ──────────────────────
  function loadAdminList() {
    var reorderMode = _canReorderCurrentList();
    var effectivePage = reorderMode ? 1 : _listPage;
    var effectiveLimit = reorderMode ? 1000 : _PAGE_SIZE;
    var url = '/api/posts?page=' + effectivePage + '&limit=' + effectiveLimit;
    if (_listCat !== 'all') url += '&category=' + _listCat;
    if (_listSearch) url += '&q=' + encodeURIComponent(_listSearch);

    GW.apiFetch(url)
      .then(function (data) {
        _listTotal = data.total;
        _currentListPosts = Array.isArray(data.posts) ? data.posts.slice() : [];
        _allPosts  = _allPosts.concat(data.posts || []); // for hero search — rebuild separately
        renderAdminList(_currentListPosts);
        renderPagination(reorderMode);
        renderReorderControls(reorderMode);
        updateStats(_currentListPosts);
      })
      .catch(function (err) {
        console.error(err);
        if (err.status === 401) { GW.showToast('세션이 만료됐습니다.', 'error'); doLogout(); }
        else GW.showToast('목록을 불러오지 못했습니다.', 'error');
      });
  }

  function renderAdminList(posts) {
    var list  = document.getElementById('article-list');
    var count = document.getElementById('article-count');
    if (count) count.textContent = _listTotal + '건';
    if (!posts || posts.length === 0) {
      list.innerHTML = '<div class="list-empty">게시글이 없습니다</div>';
      return;
    }
    var reorderMode = _canReorderCurrentList();
    list.innerHTML = posts.map(function (p) {
      var index = posts.findIndex(function (entry) { return entry.id === p.id; });
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var isUnpublished = p.published === 0;
      var hasSortOrder = p.sort_order !== null && p.sort_order !== undefined;
      return (
        '<article class="article-item' + (isUnpublished ? ' is-unpublished' : '') + '" draggable="' + (reorderMode ? 'true' : 'false') + '" data-id="' + p.id + '">' +
          (reorderMode ? '<div class="article-order-tools">' +
            '<div class="drag-handle" title="드래그로 순서 변경">☰</div>' +
            '<button type="button" class="order-shift-btn" onclick="moveArticleItem(' + p.id + ', -1)"' + (index <= 0 ? ' disabled' : '') + ' title="위로 이동">↑</button>' +
            '<button type="button" class="order-shift-btn" onclick="moveArticleItem(' + p.id + ', 1)"' + (index >= posts.length - 1 ? ' disabled' : '') + ' title="아래로 이동">↓</button>' +
          '</div>' : '') +
          '<div class="article-item-content">' +
            '<div class="article-item-top">' +
              '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">' + cat.label + '</span>' +
              (isUnpublished ? '<span class="admin-status-pill admin-status-pill-danger">비공개</span>' : '<span class="admin-status-pill admin-status-pill-live">공개</span>') +
              (hasSortOrder ? '<span class="admin-status-pill admin-status-pill-order">순서 ' + (p.sort_order + 1) + '</span>' : '') +
            '</div>' +
            '<h4 class="article-item-title">' + GW.escapeHtml(p.title) + '</h4>' +
            '<div class="item-meta-grid">' +
              '<span class="item-meta-chip item-meta-chip-date"><strong>Created</strong><span>' + GW.formatDateTime(p.created_at) + '</span></span>' +
              '<span class="item-meta-chip item-meta-chip-date"><strong>Published</strong><span>' + GW.formatDateTime(p.publish_at || p.created_at) + '</span></span>' +
              '<span class="item-meta-chip item-meta-chip-date"><strong>Modified</strong><span>' + GW.formatDateTime(p.updated_at || p.created_at) + '</span></span>' +
              '<span class="item-meta-chip"><strong>조회</strong><span>' + (p.views || 0) + '</span></span>' +
              (p.likes ? '<span class="item-meta-chip"><strong>공감</strong><span>' + p.likes + '</span></span>' : '') +
              (p.author ? '<span class="item-meta-chip"><strong>작성</strong><span>' + GW.escapeHtml(p.author) + '</span></span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="item-actions">' +
            '<button class="btn-icon btn-icon-' + (isUnpublished ? 'danger' : 'success') + '" onclick="togglePublished(' + p.id + ',' + (isUnpublished ? 0 : 1) + ')" title="' + (isUnpublished ? '비공개→공개' : '공개→비공개') + '">' + (isUnpublished ? '🔒' : '🌐') + '</button>' +
            '<button class="btn-icon btn-icon-star' + (p.featured ? ' active' : '') + '" onclick="toggleFeatured(' + p.id + ',' + (p.featured ? 1 : 0) + ')" title="에디터 추천 토글">' + (p.featured ? '★' : '☆') + '</button>' +
            '<button class="btn-edit"   onclick="openPostHistory(' + p.id + ')">기록</button>' +
            '<button class="btn-edit"   onclick="editPost('   + p.id + ')">수정</button>' +
            '<button class="btn-delete" onclick="deletePost(' + p.id + ')">삭제</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    // Setup drag-and-drop
    if (reorderMode) _initDragAndDrop(list);
  }

  var _dragSrc = null;

  function _initDragAndDrop(list) {
    var items = list.querySelectorAll('.article-item');
    items.forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        _dragSrc = item;
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', function () {
        item.style.opacity = '';
        list.querySelectorAll('.article-item').forEach(function (i) { i.classList.remove('drag-over'); });
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.article-item').forEach(function (i) { i.classList.remove('drag-over'); });
        if (item !== _dragSrc) item.classList.add('drag-over');
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!_dragSrc || _dragSrc === item) return;
        // Determine insertion position
        var rect = item.getBoundingClientRect();
        var after = e.clientY > rect.top + rect.height / 2;
        if (after) {
          item.parentNode.insertBefore(_dragSrc, item.nextSibling);
        } else {
          item.parentNode.insertBefore(_dragSrc, item);
        }
        item.classList.remove('drag-over');
        syncCurrentListPostsFromDom(list);
        _reorderDirty = true;
        var btn = document.getElementById('reorder-save-btn');
        if (btn) btn.style.display = '';
      });
    });
  }

  function syncCurrentListPostsFromDom(list) {
    var ids = [];
    list.querySelectorAll('.article-item[data-id]').forEach(function (el) {
      ids.push(parseInt(el.getAttribute('data-id'), 10));
    });
    _currentListPosts = ids.map(function (id) {
      return (_currentListPosts || []).find(function (entry) { return entry.id === id; });
    }).filter(Boolean);
  }

  window.moveArticleItem = function (id, delta) {
    var currentIndex = _currentListPosts.findIndex(function (entry) { return entry.id === id; });
    if (currentIndex < 0) return;
    var nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= _currentListPosts.length) return;
    var moved = _currentListPosts.splice(currentIndex, 1)[0];
    _currentListPosts.splice(nextIndex, 0, moved);
    _reorderDirty = true;
    renderAdminList(_currentListPosts);
    renderPagination(_canReorderCurrentList());
    renderReorderControls(_canReorderCurrentList());
    var btn = document.getElementById('reorder-save-btn');
    if (btn) btn.style.display = '';
  };

  window.saveReorder = function () {
    if (!_canReorderCurrentList()) {
      GW.showToast('정렬은 전체 목록에서만 저장할 수 있습니다', 'error');
      return;
    }
    var list = document.getElementById('article-list');
    var ids = [];
    (_currentListPosts || []).forEach(function (entry) { ids.push(entry.id); });
    GW.apiFetch('/api/posts/reorder', { method: 'PUT', body: JSON.stringify({ order: ids }) })
      .then(function () {
        GW.showToast('순서가 저장됐습니다', 'success');
        _reorderDirty = false;
        var btn = document.getElementById('reorder-save-btn');
        if (btn) btn.style.display = 'none';
        loadAdminList();
      })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  window.clearReorder = function () {
    if (!confirm('모든 게시글의 수동 순서를 초기화하고 날짜순으로 되돌릴까요?')) return;
    GW.apiFetch('/api/posts/reorder', { method: 'DELETE' })
      .then(function () { GW.showToast('순서가 초기화됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '초기화 실패', 'error'); });
  };

  function renderPagination(reorderMode) {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    var pgEl = document.getElementById('admin-pagination');
    var infoEl = document.getElementById('admin-page-info');
    var prevEl = document.getElementById('admin-prev-btn');
    var nextEl = document.getElementById('admin-next-btn');
    if (!pgEl) return;
    pgEl.style.display = totalPages > 1 ? 'flex' : 'none';
    if (infoEl) infoEl.textContent = _listPage + ' / ' + totalPages;
    if (prevEl) prevEl.disabled = _listPage <= 1;
    if (nextEl) nextEl.disabled = _listPage >= totalPages;
  }

  function _canReorderCurrentList() {
    return isFullAdmin() && _listCat === 'all' && !_listSearch;
  }

  function renderReorderControls(reorderMode) {
    var saveBtn = document.getElementById('reorder-save-btn');
    if (saveBtn) saveBtn.style.display = reorderMode && _reorderDirty ? '' : 'none';
    var hintId = 'reorder-mode-hint';
    var count = document.getElementById('article-count');
    if (!count) return;
    var hint = document.getElementById(hintId);
    if (hint) {
      hint.remove();
    }
    if (!reorderMode) return;
    hint = document.createElement('div');
    hint.id = hintId;
    hint.className = 'admin-inline-note';
    hint.textContent = '전체 목록에서 드래그 또는 ↑↓ 버튼으로 순서를 바꾼 뒤 저장할 수 있습니다.';
    count.insertAdjacentElement('afterend', hint);
  }

  window.adminListPageChange = function (delta) {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    _listPage = Math.max(1, Math.min(totalPages, _listPage + delta));
    loadAdminList();
  };

  window.adminListPageSizeChange = function (value) {
    var nextSize = parseInt(value, 10);
    if (_PAGE_SIZE_OPTIONS.indexOf(nextSize) === -1) nextSize = 20;
    _PAGE_SIZE = nextSize;
    _listPage = 1;
    loadAdminList();
  };

  window.adminListFilter = function (cat) {
    _listCat  = cat;
    _listPage = 1;
    _reorderDirty = false;
    ['all','korea','apr','wosm','people'].forEach(function (c) {
      var tab = document.getElementById('admin-tab-' + c);
      if (!tab) return;
      tab.classList.toggle('active', c === cat);
    });
    loadAdminList();
  };

  window.adminSearchDebounce = function () {
    clearTimeout(_listSearchTimer);
    _listSearchTimer = setTimeout(function () {
      _listSearch = (document.getElementById('admin-list-search').value || '').trim();
      _listPage   = 1;
      _reorderDirty = false;
      loadAdminList();
    }, 350);
  };

  function updateStats(posts) {
    loadCategoryStats(function (d) {
      setText('stat-korea', d.korea || 0);
      setText('stat-apr', d.apr || 0);
      setText('stat-wosm', d.wosm || 0);
      setText('stat-people', d.people || 0);
    });
  }

  function loadCategoryStats(done) {
    fetch('/api/stats')
      .then(function (r) { return r.json(); })
      .then(function (d) { done(d || {}); })
      .catch(function () { done({}); });
  }

  // ─── Category preview ─────────────────────────────────────
  window.updateCatPreview = function () {
    var cat = document.getElementById('art-category');
    var preview = document.getElementById('cat-preview');
    if (!cat || !preview) return;
    var meta = GW.CATEGORIES[cat.value] || GW.CATEGORIES.korea;
    preview.textContent = meta.label;
    preview.style.background = meta.color;
    loadTagsForSelector();
  };

  // ─── Toggle Published ─────────────────────────────────────
  window.togglePublished = function (id, currentVal) {
    var newVal = currentVal ? 0 : 1;
    GW.apiFetch('/api/posts/' + id, { method: 'PATCH', body: JSON.stringify({ published: newVal }) })
      .then(function () { GW.showToast(newVal ? '공개됐습니다' : '비공개됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '변경 실패', 'error'); });
  };

  // ─── Toggle Featured ──────────────────────────────────────
  window.toggleFeatured = function (id, currentVal) {
    var newVal = currentVal ? 0 : 1;
    GW.apiFetch('/api/posts/' + id, { method: 'PATCH', body: JSON.stringify({ featured: newVal }) })
      .then(function () { GW.showToast(newVal ? '에디터 추천 추가' : '에디터 추천 제거', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '변경 실패', 'error'); });
  };

  window.openPostHistory = function (id) {
    var modal = document.getElementById('post-history-modal');
    var list = document.getElementById('post-history-list');
    var summary = document.getElementById('post-history-summary');
    if (!modal || !list || !summary) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    summary.textContent = '기록을 불러오는 중…';
    list.innerHTML = '<div class="list-empty">로드 중…</div>';
    GW.apiFetch('/api/posts/' + id + '/history')
      .then(function (data) {
        var post = data.post || {};
        var history = data.history || [];
        summary.textContent =
          'Created ' + GW.formatDateTime(post.created_at) +
          ' · Published ' + GW.formatDateTime(post.publish_at || post.created_at) +
          ' · Modified ' + GW.formatDateTime(post.updated_at || post.created_at);
        if (!history.length) {
          list.innerHTML = '<div class="list-empty">기록이 없습니다</div>';
          return;
        }
        list.innerHTML = history.map(function (item) {
          var snap = {};
          try { snap = JSON.parse(item.snapshot || '{}'); } catch (_) {}
          return '<article class="post-history-entry">' +
            '<div class="post-history-entry-top">' +
              '<strong>' + GW.escapeHtml(item.summary || item.action || '변경') + '</strong>' +
              '<span>' + GW.escapeHtml(String(item.created_at || '').replace('T', ' ')) + '</span>' +
            '</div>' +
            '<div class="post-history-entry-meta">' +
              '<span>제목: ' + GW.escapeHtml(snap.title || post.title || '') + '</span>' +
              '<span>Published: ' + GW.escapeHtml(GW.formatDateTime(snap.publish_at || snap.created_at || '')) + '</span>' +
              '<span>Created: ' + GW.escapeHtml(GW.formatDateTime(snap.created_at || '')) + '</span>' +
            '</div>' +
          '</article>';
        }).join('');
      })
      .catch(function (err) {
        summary.textContent = '기록을 불러오지 못했습니다';
        list.innerHTML = '<div class="list-empty">' + GW.escapeHtml(err.message || '오류가 발생했습니다') + '</div>';
      });
  };

  window.closePostHistory = function () {
    var modal = document.getElementById('post-history-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  // ─── Author admin ─────────────────────────────────────────
  // ─── Editors A-Z ──────────────────────────────────────────
  var _editors = {}; // { A: "name", B: "", ... }

  function loadEditorsAdmin() {
    GW.apiFetch('/api/settings/editors')
      .then(function (data) {
        _editors = data.editors || {};
        _renderEditorSelect();
        _renderEditorsManager();
      })
      .catch(function () {});
  }

  function _renderEditorSelect() {
    var sel = document.getElementById('art-author');
    if (!sel || sel.tagName !== 'SELECT') return;
    var current = sel.value || 'Editor A';
    sel.innerHTML = GW.buildEditorOptions(_editors);
    sel.value = current;
  }

  function _renderEditorsManager() {
    var container = document.getElementById('editors-manager');
    if (!container) return;
    container.innerHTML = GW.EDITOR_LETTERS.map(function (l) {
      var name = _editors[l] || '';
      return '<div class="admin-editor-row">' +
        '<span class="admin-editor-row-label">Editor ' + l + '</span>' +
        '<input type="text" data-editor="' + l + '" value="' + GW.escapeHtml(name) + '" placeholder="실명 (비공개, 선택)" maxlength="60" ' +
          'class="admin-editor-row-input" />' +
      '</div>';
    }).join('');
  }

  window.saveEditors = function () {
    var inputs  = document.querySelectorAll('#editors-manager input[data-editor]');
    var editors = {};
    inputs.forEach(function (inp) {
      editors[inp.getAttribute('data-editor')] = inp.value.trim();
    });
    GW.apiFetch('/api/settings/editors', { method: 'PUT', body: JSON.stringify({ editors: editors }) })
      .then(function (data) {
        _editors = data.editors || editors;
        _renderEditorSelect();
        GW.showToast('에디터 정보가 저장됐습니다', 'success');
      })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  // ─── Ticker admin ─────────────────────────────────────────
  function loadTickerAdmin() {
    fetch('/api/settings/ticker').then(function(r){return r.json();}).then(function(data){
      var ta = document.getElementById('ticker-textarea');
      if (ta && data.items) ta.value = data.items.join('\n');
    }).catch(function(){});
  }

  // ─── Tags admin ───────────────────────────────────────────
  function loadTagsAdmin() {
    fetch('/api/settings/tags', { cache: 'no-store' }).then(function(r){return r.json();}).then(function(data){
      _tagSettings = GW.normalizeTagSettings({
        common: data.common,
        categories: data.categories,
      });
      _renderTagSettingsManager();
      loadTagsForSelector();
    }).catch(function(){});
  }

  window.saveTags = function () {
    persistTagSettings('태그가 저장됐습니다', function (data) {
      _tagSettings = GW.normalizeTagSettings({
        common: data.common,
        categories: data.categories,
      });
      _renderTagSettingsManager();
      loadTagsForSelector();
    }, function (err) {
      if (err && err.status === 409) {
        GW.showToast(buildTagUsageToast(err.tag_in_use, err), 'error');
        loadTagsAdmin();
        return;
      }
      GW.showToast(err && err.message ? err.message : '저장 실패', 'error');
    });
  };

  function persistTagSettings(successMessage, onSuccess, onError) {
    GW.apiFetch('/api/settings/tags', {
      method: 'PUT',
      body: JSON.stringify({
        common: _tagSettings.common,
        categories: _tagSettings.categories,
      }),
    })
      .then(function (data) {
        if (typeof onSuccess === 'function') onSuccess(data);
        GW.showToast(successMessage, 'success');
      })
      .catch(function (err) {
        if (typeof onError === 'function') {
          onError(err);
          return;
        }
        GW.showToast(err && err.message ? err.message : '저장 실패', 'error');
      });
  }

  function attemptManagedTagRemoval(tag) {
    if (!tag) return;
    requestTagUsage(tag).then(function (usage) {
      if (usage && usage.in_use) {
        GW.showToast(buildTagUsageToast(tag, usage), 'error');
        return;
      }
      _removeTagEverywhere(tag);
      _renderTagSettingsManager();
      loadTagsForSelector();
      GW.showToast('태그를 목록에서 제거했습니다. 저장하면 반영됩니다.', 'success');
    }).catch(function (err) {
      GW.showToast(err && err.message ? err.message : '태그 사용 여부를 확인하지 못했습니다', 'error');
    });
  }

  function requestTagUsage(tag) {
    return GW.apiFetch('/api/settings/tags?usage=' + encodeURIComponent(tag), {
      method: 'GET',
    });
  }

  function buildTagUsageToast(tag, usage) {
    var count = Number(usage && usage.count || 0);
    var posts = Array.isArray(usage && usage.posts) ? usage.posts : [];
    var lead = posts.length && posts[0] && posts[0].title ? '"' + posts[0].title + '"' : '';
    if (lead && count > 1) {
      return lead + ' 등 ' + count + '개 글에 "' + tag + '" 태그가 있어 삭제할 수 없습니다. 먼저 해당 글의 태그에서 제외해주세요.';
    }
    if (lead) {
      return lead + ' 글에 "' + tag + '" 태그가 있어 삭제할 수 없습니다. 먼저 해당 글의 태그에서 제외해주세요.';
    }
    return '"' + tag + '" 태그가 적용된 글이 있어 삭제할 수 없습니다. 먼저 해당 글의 태그에서 제외해주세요.';
  }

  window.saveTicker = function () {
    var ta = document.getElementById('ticker-textarea'); if (!ta) return;
    var items = ta.value.split('\n').map(function(s){return s.trim();}).filter(Boolean);
    if (!items.length) { GW.showToast('항목을 입력해주세요', 'error'); return; }
    GW.apiFetch('/api/settings/ticker', { method: 'PUT', body: JSON.stringify({ items: items }) })
      .then(function () { GW.showToast('티커가 저장됐습니다', 'success'); })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  function loadBoardLayoutAdmin() {
    fetch('/api/settings/board-layout', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _boardLayout = data || _boardLayout;
        var input = document.getElementById('board-gap-input');
        if (input) input.value = String(_boardLayout.gap_px || 6);
      })
      .catch(function () {});
  }

  window.saveBoardLayout = function () {
    var input = document.getElementById('board-gap-input');
    if (!input) return;
    var gap = parseInt(input.value, 10);
    if (!Number.isFinite(gap)) gap = 6;
    gap = Math.min(40, Math.max(5, gap));
    input.value = String(gap);
    GW.apiFetch('/api/settings/board-layout', {
      method: 'PUT',
      body: JSON.stringify({ gap_px: gap }),
    })
      .then(function (data) {
        _boardLayout = data || _boardLayout;
        GW.showToast('게시판 카드 간격이 저장됐습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  function loadBoardBannerAdmin() {
    fetch('/api/settings/board-banner', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _boardBannerInfo = normalizeBoardBannerInfo(data);
        _renderBoardBannerManager();
      })
      .catch(function () {
        _boardBannerInfo = normalizeBoardBannerInfo(null);
        _renderBoardBannerManager();
      });
  }

  function normalizeBoardBannerInfo(raw) {
    var defaults = {
      items: {
        korea: { event_name: '', event_date: '' },
        apr: { event_name: '', event_date: '' },
        wosm: { event_name: '', event_date: '' },
        people: { event_name: '', event_date: '' },
      },
    };
    var normalized = JSON.parse(JSON.stringify(defaults));
    if (!raw || typeof raw !== 'object' || !raw.items) return normalized;
    Object.keys(normalized.items).forEach(function (category) {
      var item = raw.items[category] || {};
      normalized.items[category] = {
        event_name: String(item.event_name || '').trim().slice(0, 80),
        event_date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.event_date || '').trim()) ? String(item.event_date).trim() : '',
      };
    });
    return normalized;
  }

  function _renderBoardBannerManager() {
    var container = document.getElementById('board-banner-manager');
    if (!container) return;
    var defs = [
      ['korea', 'Korea'],
      ['apr', 'APR'],
      ['wosm', 'WOSM'],
      ['people', 'Scout People'],
    ];
    container.innerHTML = defs.map(function (entry) {
      var category = entry[0];
      var label = entry[1];
      var item = (_boardBannerInfo.items && _boardBannerInfo.items[category]) || { event_name: '', event_date: '' };
      return '<div class="share-meta-card">' +
        '<div class="share-meta-card-head">' + label + '</div>' +
        '<label>행사명</label>' +
        '<input type="text" data-board-banner-category="' + category + '" data-board-banner-field="event_name" maxlength="80" value="' + GW.escapeHtml(item.event_name || '') + '" placeholder="예: 전국 잼버리 개막" />' +
        '<label>D-day 기준일</label>' +
        '<input type="date" data-board-banner-category="' + category + '" data-board-banner-field="event_date" value="' + GW.escapeHtml(item.event_date || '') + '" />' +
      '</div>';
    }).join('');
  }

  window.saveBoardBanner = function () {
    var nextState = normalizeBoardBannerInfo(null);
    document.querySelectorAll('[data-board-banner-category]').forEach(function (input) {
      var category = input.getAttribute('data-board-banner-category');
      var field = input.getAttribute('data-board-banner-field');
      if (!nextState.items[category] || !field) return;
      nextState.items[category][field] = (input.value || '').trim();
    });
    nextState = normalizeBoardBannerInfo(nextState);
    GW.apiFetch('/api/settings/board-banner', {
      method: 'PUT',
      body: JSON.stringify(nextState),
    })
      .then(function (data) {
        _boardBannerInfo = normalizeBoardBannerInfo(data);
        _renderBoardBannerManager();
        GW.showToast('게시판 D-day 설정이 저장됐습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  function loadSiteMetaAdmin() {
    fetch('/api/settings/site-meta', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _siteMeta = data || _siteMeta;
        _siteMetaRevision = data && data.revision ? data.revision : _siteMetaRevision;
        _renderSiteMetaManager();
      })
      .catch(function () {
        _renderSiteMetaManager();
        GW.showToast('공유 설정을 불러오지 못했습니다', 'error');
      });
  }

  function _renderSiteMetaManager() {
    var container = document.getElementById('site-meta-manager');
    if (container) {
      var defs = [
        ['home', '홈 / index'],
        ['latest', '최근 1개월 소식'],
        ['korea', 'Korea'],
        ['apr', 'APR'],
        ['wosm', 'WOSM'],
        ['people', 'Scout People'],
        ['glossary', '용어집'],
        ['ai_guide', 'AI 작업 가이드'],
        ['contributors', '도움을 주신 분들'],
        ['search', '검색'],
      ];
      container.innerHTML = defs.map(function (entry) {
        var key = entry[0];
        var label = entry[1];
        var page = (_siteMeta.pages && _siteMeta.pages[key]) || { title: '', description: '' };
        var helper = key === 'home'
          ? '<div style="margin:0 0 10px;font-family: AliceDigitalLearning, sans-serif;font-size:10px;color:var(--muted);">구글/네이버 검색 결과에 노출될 사이트 소개 문구입니다.</div>'
          : '';
        return '<div class="share-meta-card">' +
          '<div class="share-meta-card-head">' + label + '</div>' +
          helper +
          '<label>공유 제목</label>' +
          '<input type="text" data-site-meta-page="' + key + '" data-site-meta-field="title" value="' + GW.escapeHtml(page.title || '') + '" maxlength="120" />' +
          '<label>공유 설명</label>' +
          '<textarea data-site-meta-page="' + key + '" data-site-meta-field="description" rows="4" maxlength="260">' + GW.escapeHtml(page.description || '') + '</textarea>' +
        '</div>';
      }).join('');
    }
    _renderSiteMetaImagePreview();
    var footer = _siteMeta.footer || {};
    var footerTitle = document.getElementById('site-footer-title');
    var footerDescription = document.getElementById('site-footer-description');
    var footerDomain = document.getElementById('site-footer-domain');
    var footerTipEmail = document.getElementById('site-footer-tip-email');
    var footerContactEmail = document.getElementById('site-footer-contact-email');
    if (footerTitle) footerTitle.value = footer.title || 'BP미디어';
    if (footerDescription) footerDescription.value = footer.description || '';
    if (footerDomain) footerDomain.value = footer.domain_label || 'bpmedia.net';
    if (footerTipEmail) footerTipEmail.value = footer.tip_email || 'story@bpmedia.net';
    if (footerContactEmail) footerContactEmail.value = footer.contact_email || 'info@bpmedia.net';
    bindSiteFooterEditor();
    renderSiteFooterPreview({
      title: footer.title || 'BP미디어',
      description: footer.description || '',
      domain_label: footer.domain_label || 'bpmedia.net',
      tip_email: footer.tip_email || 'story@bpmedia.net',
      contact_email: footer.contact_email || 'info@bpmedia.net',
    });
    var googleEl = document.getElementById('site-google-verification');
    var naverEl = document.getElementById('site-naver-verification');
    if (googleEl) googleEl.value = _siteMeta.google_verification || '';
    if (naverEl) naverEl.value = _siteMeta.naver_verification || '';
  }

  function _renderSiteMetaImagePreview() {
    var preview = document.getElementById('site-meta-image-preview');
    if (!preview) return;
    if (_siteMeta.image_url) {
      var src = _siteMeta.image_url.startsWith('http') ? GW.escapeHtml(_siteMeta.image_url) : _siteMeta.image_url;
      preview.innerHTML = '<img src="' + src + '" class="cover-preview-img">' +
        '<div style="margin-top:6px;font-family: AliceDigitalLearning, sans-serif;font-size:10px;color:var(--muted);">일반 페이지 공유 대표 이미지</div>' +
        '<div style="margin-top:4px;font-family: AliceDigitalLearning, sans-serif;font-size:10px;color:var(--muted);" id="site-meta-image-size">권장 1200×630px, PNG/JPG, 1MB 이하</div>';
      var img = preview.querySelector('img');
      if (img) {
        img.onload = function () {
          var sizeEl = document.getElementById('site-meta-image-size');
          if (sizeEl) sizeEl.textContent = '현재 ' + img.naturalWidth + '×' + img.naturalHeight + ' · 권장 1200×630px, PNG/JPG, 1MB 이하';
        };
      }
      return;
    }
    preview.innerHTML = '<div class="tag-admin-empty">설정된 이미지 없음</div>';
  }

  window.uploadSiteMetaImage = function () {
    _uploadImageAsDataUrl(function (dataUrl) {
      _siteMeta.image_url = dataUrl;
      _renderSiteMetaImagePreview();
      GW.showToast('공유 대표 이미지가 준비됐습니다', 'success');
    });
  };

  window.removeSiteMetaImage = function () {
    _siteMeta.image_url = null;
    _renderSiteMetaImagePreview();
  };

  window.saveSiteMeta = function () {
    var inputs = document.querySelectorAll('[data-site-meta-page][data-site-meta-field]');
    var pages = {};
    var footer = readFooterEditorState();
    inputs.forEach(function (input) {
      var page = input.getAttribute('data-site-meta-page');
      var field = input.getAttribute('data-site-meta-field');
      if (!pages[page]) pages[page] = {};
      pages[page][field] = (input.value || '').trim();
    });
    GW.apiFetch('/api/settings/site-meta', {
      method: 'PUT',
      body: JSON.stringify({
        pages: pages,
        footer: {
          raw_text: buildSiteFooterHtml(footer),
          title: footer.title,
          description: footer.description,
          domain_label: footer.domain_label,
          tip_email: footer.tip_email,
          contact_email: footer.contact_email,
        },
        image_url: _siteMeta.image_url || null,
        google_verification: ((document.getElementById('site-google-verification') || {}).value || '').trim(),
        naver_verification: ((document.getElementById('site-naver-verification') || {}).value || '').trim(),
        if_revision: _siteMetaRevision,
      }),
    })
      .then(function (data) {
        _siteMeta = data || _siteMeta;
        _siteMetaRevision = data && data.revision ? data.revision : _siteMetaRevision;
        _renderSiteMetaManager();
        GW.showToast('공유 설정이 저장됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          loadSiteMetaAdmin();
          return;
        }
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  // ─── Translations admin ───────────────────────────────────
  var _translationOverrides = {};
  function loadTranslationsAdmin() {
    fetch('/api/settings/translations').then(function(r){return r.json();}).then(function(data){
      _translationOverrides = data.strings || {};
      renderCategoryCopyManager();
      renderTranslationsTable();
    }).catch(function(){
      renderCategoryCopyManager();
      renderTranslationsTable();
    });
  }

  function renderCategoryCopyManager() {
    var container = document.getElementById('category-copy-manager');
    if (!container) return;
    var keys = [
      { key: 'board.apr.desc', label: 'APR 설명' },
      { key: 'board.wosm.desc', label: 'WOSM 설명' },
      { key: 'board.translation.note', label: '번역 안내 문구' },
    ];
    container.innerHTML = keys.map(function (item) {
      var def = GW.STRINGS[item.key] || { ko: '', en: '' };
      var over = _translationOverrides[item.key] || {};
      var koVal = over.ko !== undefined ? over.ko : (def.ko || '');
      var enVal = over.en !== undefined ? over.en : (def.en || '');
      return '<div class="admin-copy-card">' +
        '<div class="admin-copy-card-head">' + item.label + ' · ' + item.key + '</div>' +
        '<div class="admin-copy-card-grid">' +
          '<div><label class="admin-copy-card-label">KOR</label>' +
          '<textarea data-category-copy="' + item.key + '" data-category-lang="ko" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--border);font-size:12px;font-family: AliceDigitalLearning, sans-serif;outline:none;resize:vertical;">' + GW.escapeHtml(koVal) + '</textarea></div>' +
          '<div><label class="admin-copy-card-label">ENG</label>' +
          '<textarea data-category-copy="' + item.key + '" data-category-lang="en" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--border);font-size:12px;font-family: AliceDigitalLearning, sans-serif;outline:none;resize:vertical;">' + GW.escapeHtml(enVal) + '</textarea></div>' +
        '</div></div>';
    }).join('');
  }
  function renderTranslationsTable() {
    var container = document.getElementById('translations-table'); if (!container) return;
    var keys = Object.keys(GW.STRINGS);
    container.innerHTML = keys.map(function (key) {
      var def = GW.STRINGS[key]; var over = _translationOverrides[key] || {};
      var koVal = over.ko !== undefined ? over.ko : (def.ko || '');
      var enVal = over.en !== undefined ? over.en : (def.en || '');
      return '<div class="admin-copy-card">' +
        '<div class="admin-copy-card-head">' + key + '</div>' +
        '<div class="admin-copy-card-grid">' +
          '<div><label class="admin-copy-card-label">KOR</label>' +
          '<input type="text" value="' + escapeAttr(koVal) + '" data-tkey="' + key + '" data-tlang="ko" style="width:100%;padding:6px 8px;border:1px solid var(--border);font-size:12px;font-family: AliceDigitalLearning, sans-serif;outline:none;"></div>' +
          '<div><label class="admin-copy-card-label">ENG</label>' +
          '<input type="text" value="' + escapeAttr(enVal) + '" data-tkey="' + key + '" data-tlang="en" style="width:100%;padding:6px 8px;border:1px solid var(--border);font-size:12px;font-family: AliceDigitalLearning, sans-serif;outline:none;"></div>' +
        '</div></div>';
    }).join('');
  }
  function escapeAttr(str) { return String(str||'').replace(/"/g,'&quot;'); }
  window.saveTranslations = function () {
    var inputs = document.querySelectorAll('#translations-table input[data-tkey]');
    var strings = {};
    inputs.forEach(function(inp){ var key=inp.getAttribute('data-tkey'); var lang=inp.getAttribute('data-tlang'); if(!strings[key]) strings[key]={}; strings[key][lang]=inp.value; });
    GW.apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify({ strings: strings }) })
      .then(function(){ GW.showToast('번역이 저장됐습니다','success'); })
      .catch(function(err){ GW.showToast(err.message||'저장 실패','error'); });
  };

  window.saveCategoryCopy = function () {
    var areas = document.querySelectorAll('#category-copy-manager textarea[data-category-copy]');
    var strings = JSON.parse(JSON.stringify(_translationOverrides || {}));
    areas.forEach(function (area) {
      var key = area.getAttribute('data-category-copy');
      var lang = area.getAttribute('data-category-lang');
      if (!strings[key]) strings[key] = {};
      strings[key][lang] = area.value;
    });
    GW.apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify({ strings: strings }) })
      .then(function () {
        _translationOverrides = strings;
        GW.showToast('카테고리 문구가 저장됐습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  // ─── Hero admin (up to 5 articles) ───────────────────────
  function _bindHeroSearchUi() {
    if (_heroSearchBound) return;
    _heroSearchBound = true;
    var input = document.getElementById('hero-search-input');
    var list = document.getElementById('hero-search-results');
    if (input) {
      ['focus', 'click'].forEach(function (evt) {
        input.addEventListener(evt, function () {
          if (!_heroSearchResults.length && !_heroSearchLoading) {
            _resetHeroSearch();
            _loadHeroSearchResults();
          }
        });
      });
    }
    if (list) {
      list.addEventListener('scroll', function () {
        if (_heroSearchLoading || !_heroSearchHasMore) return;
        if ((list.scrollTop + list.clientHeight) >= (list.scrollHeight - 24)) {
          _loadHeroSearchResults();
        }
      });
    }
  }

  function _resetHeroSearch() {
    _heroSearchPage = 1;
    _heroSearchHasMore = true;
    _heroSearchLoading = false;
    _heroSearchResults = [];
    _heroSearchQuery = (document.getElementById('hero-search-input').value || '').trim();
    _renderHeroSearchResults();
  }

  function _loadHeroSearchResults() {
    var list = document.getElementById('hero-search-results');
    if (!list || _heroSearchLoading || !_heroSearchHasMore) return;
    _heroSearchLoading = true;
    if (!_heroSearchResults.length) {
      list.innerHTML = '<div class="admin-inline-note">기사 목록을 불러오는 중…</div>';
    } else {
      list.setAttribute('data-loading', '1');
    }
    var query = _heroSearchQuery ? '&q=' + encodeURIComponent(_heroSearchQuery) : '';
    GW.apiFetch('/api/posts?page=' + _heroSearchPage + '&limit=10' + query)
      .then(function (data) {
        var rows = Array.isArray(data.posts) ? data.posts : [];
        _heroSearchResults = _heroSearchResults.concat(rows);
        _heroSearchHasMore = rows.length === 10;
        _heroSearchPage += 1;
        _renderHeroSearchResults();
      })
      .catch(function () {
        if (!_heroSearchResults.length) {
          list.innerHTML = '<div class="admin-inline-note">기사를 불러오지 못했습니다</div>';
        }
      })
      .finally(function () {
        _heroSearchLoading = false;
        if (list) list.removeAttribute('data-loading');
      });
  }

  function _renderHeroSearchResults() {
    var list = document.getElementById('hero-search-results');
    if (!list) return;
    if (!_heroSearchResults.length) {
      list.innerHTML = _heroSearchQuery
        ? '<div class="admin-inline-note">검색 결과 없음</div>'
        : '<div class="admin-inline-note">공개된 최신 기사 10개를 먼저 표시합니다. 아래로 스크롤하면 더 불러옵니다.</div>';
      return;
    }
    list.innerHTML = _heroSearchResults.map(function (p) {
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var already = _heroPostIds.indexOf(p.id) >= 0;
      return '<div class="hero-result-item' + (already ? ' is-disabled' : '') + '" onclick="addHeroSlot(' + p.id + ')">' +
        '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">' + cat.label + '</span>' +
        '<span class="hero-result-title">' + GW.escapeHtml(p.title) + '</span>' +
        (already ? '<span class="hero-result-note">(이미 추가됨)</span>' : '') +
      '</div>';
    }).join('') + (_heroSearchHasMore ? '<div class="hero-result-footer">아래로 스크롤하면 더 불러옵니다.</div>' : '');
  }

  function loadHeroAdmin() {
    fetch('/api/settings/hero').then(function(r){return r.json();}).then(function(data){
      _heroPosts = (data.posts || []).map(function (post) {
        var next = Object.assign({}, post);
        next.media = normalizeHeroMedia(post && post.media);
        return next;
      });
      _heroPostIds = _heroPosts.map(function(p){ return p.id; });
      _heroIntervalMs = data.interval_ms || 3000;
      _heroRevision = data.revision || null;
      var intervalEl = document.getElementById('hero-interval-input');
      if (intervalEl) intervalEl.value = String(Math.round(_heroIntervalMs / 1000));
      renderHeroSlots(_heroPosts);
      loadHomeLeadAdmin();
    }).catch(function(){
      GW.showToast('히어로 설정을 불러오지 못했습니다', 'error');
    });
  }

  function loadHomeLeadAdmin() {
    fetch('/api/settings/home-lead', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _homeLeadPost = data && data.post ? data.post : null;
        _homeLeadMedia = normalizeHomeLeadMedia(data && data.media);
        renderHomeLeadSelection();
      })
      .catch(function () {
        _homeLeadPost = null;
        _homeLeadMedia = defaultHomeLeadMedia();
        renderHomeLeadSelection('메인 스토리 설정을 불러오지 못했습니다');
      });
  }

  function renderHomeLeadSelection(errorText) {
    var el = document.getElementById('home-lead-selected');
    if (!el) return;
    if (errorText) {
      el.innerHTML = '<div class="admin-inline-note">' + GW.escapeHtml(errorText) + '</div>';
      return;
    }
    if (!_homeLeadPost) {
      el.innerHTML = '<div class="admin-inline-note">지정된 메인 스토리가 없습니다. 기본 규칙으로 자동 선택됩니다.</div>';
      return;
    }
    var cat = GW.CATEGORIES[_homeLeadPost.category] || GW.CATEGORIES.korea;
    el.innerHTML =
      '<div class="admin-selected-post-card">' +
        '<div class="admin-selected-post-card-header">' +
          '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">' + cat.label + '</span>' +
          '<span class="admin-selected-post-note">현재 선택됨</span>' +
        '</div>' +
        '<div class="admin-selected-post-title">' + GW.escapeHtml(_homeLeadPost.title || '') + '</div>' +
        (_homeLeadPost.image_url ? (
          '<div class="admin-home-lead-preview">' +
            '<details class="admin-media-toggle">' +
              '<summary>이미지 위치 조정 열기</summary>' +
              buildResponsiveMediaEditor('home-lead-media', _homeLeadMedia, _homeLeadPost.image_url, _homeLeadPost.title || '메인 스토리 미리보기') +
            '</details>' +
          '</div>'
        ) : '') +
        '<div class="admin-home-lead-actions">' +
          '<button type="button" class="submit-btn" style="width:auto;margin:0;" onclick="saveHomeLeadMedia()">이미지 위치 저장</button>' +
          '<button type="button" class="cancel-btn visible" style="margin:0;" onclick="clearHomeLeadPost()">해제</button>' +
          '<a href="/post/' + _homeLeadPost.id + '" class="cancel-btn visible" style="margin:0;text-decoration:none;display:inline-flex;align-items:center;">기사 보기</a>' +
        '</div>' +
      '</div>';
    bindHomeLeadMediaControls();
  }

  function bindHomeLeadMediaControls() {
    bindResponsiveMediaControls('home-lead-media', function (nextMedia) {
      _homeLeadMedia = normalizeHomeLeadMedia(nextMedia);
    });
  }

  window.searchHomeLeadPost = function () {
    clearTimeout(_homeLeadSearchTimer);
    _homeLeadSearchTimer = setTimeout(loadHomeLeadSearchResults, 180);
  };

  function loadHomeLeadSearchResults() {
    var input = document.getElementById('home-lead-search-input');
    var list = document.getElementById('home-lead-search-results');
    if (!list) return;
    var query = input ? (input.value || '').trim() : '';
    list.innerHTML = '<div class="admin-inline-note">기사 목록을 불러오는 중…</div>';
    GW.apiFetch('/api/posts?page=1&limit=10' + (query ? '&q=' + encodeURIComponent(query) : ''))
      .then(function (data) {
        _homeLeadSearchResults = Array.isArray(data.posts) ? data.posts : [];
        if (!_homeLeadSearchResults.length) {
          list.innerHTML = '<div class="admin-inline-note">검색 결과 없음</div>';
          return;
        }
        list.innerHTML = _homeLeadSearchResults.map(function (p) {
          var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
          var selected = _homeLeadPost && _homeLeadPost.id === p.id;
          return '<div class="hero-result-item' + (selected ? ' is-selected' : '') + '" onclick="selectHomeLeadPost(' + p.id + ')">' +
            '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">' + cat.label + '</span>' +
            '<span class="hero-result-title">' + GW.escapeHtml(p.title) + '</span>' +
            (selected ? '<span class="hero-result-note">(현재 메인 스토리)</span>' : '') +
          '</div>';
        }).join('');
      })
      .catch(function () {
        list.innerHTML = '<div class="admin-inline-note">기사를 불러오지 못했습니다</div>';
      });
  }

  window.selectHomeLeadPost = function (postId) {
    GW.apiFetch('/api/settings/home-lead', {
      method: 'PUT',
      body: JSON.stringify({ post_id: postId })
    })
      .then(function () {
        GW.showToast('메인 스토리가 저장됐습니다', 'success');
        loadHomeLeadAdmin();
        loadHomeLeadSearchResults();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '메인 스토리 저장 실패', 'error');
      });
  };

  window.saveHomeLeadMedia = function () {
    if (!_homeLeadPost) return;
    GW.apiFetch('/api/settings/home-lead', {
      method: 'PUT',
      body: JSON.stringify({ media: normalizeHomeLeadMedia(_homeLeadMedia) })
    })
      .then(function (data) {
        _homeLeadMedia = normalizeHomeLeadMedia(data && data.media);
        renderHomeLeadSelection();
        GW.showToast('메인 스토리 이미지 위치를 저장했습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '메인 스토리 이미지 저장 실패', 'error');
      });
  };

  window.clearHomeLeadPost = function () {
    GW.apiFetch('/api/settings/home-lead', {
      method: 'PUT',
      body: JSON.stringify({ post_id: null })
    })
      .then(function () {
        _homeLeadPost = null;
        _homeLeadMedia = defaultHomeLeadMedia();
        renderHomeLeadSelection();
        GW.showToast('메인 스토리 지정을 해제했습니다', 'success');
        loadHomeLeadSearchResults();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '메인 스토리 해제 실패', 'error');
      });
  };

  function renderHeroSlots(posts) {
    var el = document.getElementById('hero-slots'); if (!el) return;
    if (!posts.length) {
      el.innerHTML = '<div class="admin-inline-note">선택된 기사 없음</div>';
      return;
    }
    el.innerHTML = posts.map(function(p, i){
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var media = normalizeHeroMedia(p.media);
      var mediaEditor = p.image_url
        ? buildResponsiveMediaEditor('hero-slot-' + i, media, p.image_url, p.title || '히어로 미리보기')
        : '<div class="admin-inline-note">대표 이미지가 없는 기사입니다.</div>';
      return '' +
        '<div class="hero-slot-item" draggable="true" data-hero-index="' + i + '">' +
          '<div class="hero-slot-top">' +
            '<span class="drag-handle" title="드래그해서 순서 변경">↕</span>' +
            '<span class="hero-slot-index">' + (i+1) + '</span>' +
            '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">'+cat.label+'</span>' +
            '<span class="hero-slot-title">' + GW.escapeHtml(p.title) + '</span>' +
            '<button type="button" class="admin-inline-ghost" onclick="moveHeroSlot(' + i + ', -1)"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="admin-inline-ghost" onclick="moveHeroSlot(' + i + ', 1)"' + (i === posts.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button onclick="removeHeroSlot(' + i + ')" class="admin-inline-danger">제거</button>' +
          '</div>' +
          '<details class="admin-media-toggle">' +
            '<summary>이미지 위치 조정 열기</summary>' +
            mediaEditor +
          '</details>' +
        '</div>';
    }).join('');
    bindHeroDrag();
    bindHeroMediaControls();
  }

  function bindHeroMediaControls() {
    _heroPosts.forEach(function (post, index) {
      bindResponsiveMediaControls('hero-slot-' + index, function (nextMedia) {
        if (!_heroPosts[index]) return;
        _heroPosts[index].media = normalizeHeroMedia(nextMedia);
      });
    });
  }

  function bindHeroDrag() {
    var list = document.getElementById('hero-slots');
    if (!list || list.dataset.dragBound === '1') return;
    list.dataset.dragBound = '1';

    list.addEventListener('dragstart', function (event) {
      var item = event.target.closest('.hero-slot-item');
      var handle = event.target.closest('.drag-handle');
      if (!item || !handle) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.getAttribute('data-hero-index'));
    });

    list.addEventListener('dragover', function (event) {
      var item = event.target.closest('.hero-slot-item');
      if (!item) return;
      event.preventDefault();
      item.classList.add('drag-over');
    });

    list.addEventListener('dragleave', function (event) {
      var item = event.target.closest('.hero-slot-item');
      if (!item) return;
      item.classList.remove('drag-over');
    });

    list.addEventListener('drop', function (event) {
      var item = event.target.closest('.hero-slot-item');
      if (!item) return;
      event.preventDefault();
      item.classList.remove('drag-over');
      var fromIndex = parseInt(event.dataTransfer.getData('text/plain') || '-1', 10);
      var toIndex = parseInt(item.getAttribute('data-hero-index') || '-1', 10);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      var moved = _heroPosts.splice(fromIndex, 1)[0];
      _heroPosts.splice(toIndex, 0, moved);
      _heroPostIds = _heroPosts.map(function (p) { return p.id; });
      renderHeroSlots(_heroPosts);
      _saveHeroIds();
    });
  }

  window.removeHeroSlot = function (index) {
    _heroPostIds.splice(index, 1);
    _saveHeroIds();
  };

  window.moveHeroSlot = function (index, delta) {
    var nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= _heroPosts.length) return;
    var moved = _heroPosts.splice(index, 1)[0];
    _heroPosts.splice(nextIndex, 0, moved);
    _heroPostIds = _heroPosts.map(function (p) { return p.id; });
    renderHeroSlots(_heroPosts);
    _saveHeroIds();
  };

  window.heroSearch = function () {
    _resetHeroSearch();
    _loadHeroSearchResults();
  };

  window.addHeroSlot = function (id) {
    if (_heroPostIds.length >= 5) { GW.showToast('히어로는 최대 5개까지 설정할 수 있습니다', 'error'); return; }
    if (_heroPostIds.indexOf(id) >= 0) { GW.showToast('이미 추가된 기사입니다', 'error'); return; }
    _heroPostIds.push(id);
    _saveHeroIds();
    _resetHeroSearch();
    _loadHeroSearchResults();
  };

  window.saveHeroSettings = function () {
    _saveHeroIds();
  };

  function _saveHeroIds() {
    var intervalEl = document.getElementById('hero-interval-input');
    var intervalSeconds = intervalEl ? parseInt(intervalEl.value, 10) : 3;
    if (!Number.isFinite(intervalSeconds)) intervalSeconds = 3;
    intervalSeconds = Math.min(15, Math.max(2, intervalSeconds));
    if (intervalEl) intervalEl.value = String(intervalSeconds);
    _heroIntervalMs = intervalSeconds * 1000;
    GW.apiFetch('/api/settings/hero', {
      method: 'PUT',
      body: JSON.stringify({
        post_ids: _heroPostIds,
        interval_ms: _heroIntervalMs,
        if_revision: _heroRevision,
        media_map: _heroPosts.reduce(function (acc, post) {
          if (!post || !post.id) return acc;
          acc[String(post.id)] = normalizeHeroMedia(post.media);
          return acc;
        }, {}),
      }),
    })
      .then(function(data){
        _heroRevision = data.revision || _heroRevision;
        GW.showToast('히어로 설정이 저장됐습니다', 'success');
        loadHeroAdmin();
      })
      .catch(function(err){
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          loadHeroAdmin();
          return;
        }
        GW.showToast(err.message||'저장 실패','error');
        loadHeroAdmin();
      });
  }

  // ─── Dashboard ────────────────────────────────────────────
  function loadDashboard() {
    loadCategoryStats(function (d) {
      var t = document.getElementById('dash-total');
      var k = document.getElementById('dash-korea');
      var a = document.getElementById('dash-apr');
      var w = document.getElementById('dash-wosm');
      var p = document.getElementById('dash-people');
      if(k) k.textContent = d.korea || 0;
      if(a) a.textContent = d.apr   || 0;
      if(w) w.textContent = d.wosm  || 0;
      if(p) p.textContent = d.people || 0;
      if(t) t.textContent = ((d.korea||0) + (d.apr||0) + (d.wosm||0) + (d.people||0));
    });

    // Load 5 most recent posts
    fetch('/api/posts?page=1')
      .then(function(r){ return r.json(); })
      .then(function(data){
        var el = document.getElementById('dash-recent-list'); if (!el) return;
        var posts = (data.posts || []).slice(0, 5);
        if (!posts.length) { el.innerHTML = '<div class="list-empty">게시글이 없습니다</div>'; return; }
        var editable = isFullAdmin();
        el.innerHTML = posts.map(function(p){
          var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
          var actionAttr = editable ? ' onclick="editPost(' + p.id + ');showAdminTab(&quot;write&quot;)"' : '';
          return '<article class="article-item article-item-dashboard" style="cursor:' + (editable ? 'pointer' : 'default') + ';"' + actionAttr + '>' +
            '<div class="article-item-content">' +
              '<div class="article-item-top">' +
                '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">' + cat.label + '</span>' +
              '</div>' +
              '<h4 class="article-item-title">' + GW.escapeHtml(p.title) + '</h4>' +
              '<div class="item-meta-grid">' +
                '<span class="item-meta-chip item-meta-chip-date"><strong>Created</strong><span>' + GW.formatDateTime(p.created_at) + '</span></span>' +
                '<span class="item-meta-chip item-meta-chip-date"><strong>Published</strong><span>' + GW.formatDateTime(p.publish_at || p.created_at) + '</span></span>' +
                '<span class="item-meta-chip item-meta-chip-date"><strong>Modified</strong><span>' + GW.formatDateTime(p.updated_at || p.created_at) + '</span></span>' +
                '<span class="item-meta-chip"><strong>조회</strong><span>' + (p.views||0) + '</span></span>' +
                (editable ? '<span class="item-meta-chip"><strong>상태</strong><span>수정 가능</span></span>' : '') +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }).catch(function(){});
  }

  window.refreshAnalyticsPage = function () {
    loadAnalyticsPage(true);
  };

  window.setAnalyticsRangePreset = function (days) {
    var endEl = document.getElementById('analytics-end-date');
    var startEl = document.getElementById('analytics-start-date');
    if (!endEl || !startEl) return;
    var end = GW.getKstDateInputValue();
    var base = new Date(end + 'T00:00:00+09:00');
    base.setUTCDate(base.getUTCDate() - (Number(days || 7) - 1));
    var start = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(base);
    startEl.value = start;
    endEl.value = end;
    loadAnalyticsPage(true);
  };

  window.setAnalyticsViewMode = function (mode) {
    _analyticsViewMode = mode === 'table' ? 'table' : 'chart';
    var chartBtn = document.getElementById('analytics-view-chart');
    var tableBtn = document.getElementById('analytics-view-table');
    if (chartBtn) chartBtn.classList.toggle('active', _analyticsViewMode === 'chart');
    if (tableBtn) tableBtn.classList.toggle('active', _analyticsViewMode === 'table');
    _syncAnalyticsViewMode();
  };

  window.setAnalyticsChartMode = function (kind, mode) {
    if (kind !== 'visitors' && kind !== 'views') return;
    _analyticsChartModes[kind] = (mode === 'bar' || mode === 'cumulative') ? mode : 'line';
    syncAnalyticsChartModeButtons();
    if (_analyticsPayload) renderAnalyticsPage(_analyticsPayload);
  };

  function loadAnalyticsPage(force) {
    if (_analyticsPayload && !force) {
      renderAnalyticsPage(_analyticsPayload);
      return;
    }
    setText('analytics-tracking-note', '분석 데이터를 불러오는 중…');
    var endEl = document.getElementById('analytics-end-date');
    var startEl = document.getElementById('analytics-start-date');
    if (endEl && !endEl.value) endEl.value = GW.getKstDateInputValue();
    if (startEl && !startEl.value) {
      window.setAnalyticsRangePreset(7);
      return;
    }
    var start = startEl ? startEl.value : GW.getKstDateInputValue();
    var end = endEl ? endEl.value : GW.getKstDateInputValue();
    GW.apiFetch('/api/admin/analytics?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end))
      .then(function (data) {
        _analyticsPayload = data || null;
        renderAnalyticsPage(data || null);
      })
      .catch(function (err) {
        _analyticsPayload = null;
        renderAnalyticsPage({ error_message: (err && err.message) || '분석 데이터를 불러오지 못했습니다.' });
      });
  }

  function renderAnalyticsPage(data) {
    var fallback = {
      provider_label: '연결 오류',
      range: { label: '최근 7일', granularity: 'day' },
      summary: {
        today_visits: '—',
        total_visits: '—',
        range_visits: '—',
        total_pageviews: '—',
        range_pageviews: '—',
      },
      visitors: {
        today_visits: '—',
        total_visits: '—',
        range_visits: '—',
        series: [],
      },
      views: {
        total: 0,
        series: [],
        top_paths: [],
      },
      top_paths: [],
      referrers: [],
      tracking_note: (data && data.error_message) || '방문자 대시보드를 불러오지 못했습니다.',
    };
    var payload = data || fallback;
    var rangeLabel = (payload.range && payload.range.label) || fallback.range.label;
    setText('analytics-provider-label', payload.provider_label || fallback.provider_label);
    setMetricText('analytics-today-visits', payload.summary ? payload.summary.today_visits : '—');
    setMetricText('analytics-total-visits', payload.summary ? payload.summary.total_visits : '—');
    setMetricText('analytics-range-visits', payload.summary ? payload.summary.range_visits : '—');
    setMetricText('analytics-total-pageviews', payload.summary ? payload.summary.total_pageviews : '—');
    setMetricText('analytics-range-pageviews', payload.summary ? payload.summary.range_pageviews : '—');
    setText('analytics-tracking-note', payload.tracking_note || fallback.tracking_note);
    renderAnalyticsList('analytics-referrers', payload.referrers, function (item) {
      var metaParts = [rangeLabel];
      if (item.source_type_label) metaParts.push(item.source_type_label);
      if (item.source_detail) metaParts.push(item.source_detail);
      metaParts.push('방문 ' + formatMetricCompact(item.visits || 0));
      metaParts.push('조회 ' + formatMetricCompact(item.pageviews || 0));
      return {
        title: item.source_label || item.referrer_host || 'direct',
        meta: metaParts.join(' · '),
      };
    }, '아직 유입 경로 데이터가 없습니다');
    renderAnalyticsReferrersPie(payload.referrers);
    renderAnalyticsList('analytics-paths', payload.top_paths, function (item) {
      var pageInfo = getAnalyticsPageInfo(item);
      return {
        title: pageInfo.title,
        meta: rangeLabel + ' · 방문 ' + formatMetricCompact(item.visits || 0) + ' · 조회 ' + formatMetricCompact(item.pageviews || 0),
      };
    }, '아직 상위 기사 데이터가 없습니다');
    renderAnalyticsVisitorsChart(payload.visitors && payload.visitors.series ? payload.visitors.series : [], payload.range || fallback.range);
    renderAnalyticsViewsChart(payload.views && payload.views.series ? payload.views.series : [], payload.range || fallback.range);
    renderAnalyticsVisitorsTable(payload.visitors && payload.visitors.series ? payload.visitors.series : [], payload.range || fallback.range);
    renderAnalyticsViewsTable(payload.views && payload.views.series ? payload.views.series : [], payload.range || fallback.range);
    renderAnalyticsTopPages(payload.views && payload.views.top_paths ? payload.views.top_paths : payload.top_paths);
    renderAnalyticsInsights(payload);
    _syncAnalyticsViewMode();
    syncAnalyticsChartModeButtons();
  }

  function _syncAnalyticsViewMode() {
    toggleDisplay('analytics-visitors-chart', _analyticsViewMode === 'chart');
    toggleDisplay('analytics-views-chart', _analyticsViewMode === 'chart');
    toggleDisplay('analytics-visitors-table', _analyticsViewMode === 'table');
    toggleDisplay('analytics-views-table', _analyticsViewMode === 'table');
  }

  function toggleDisplay(id, show) {
    var el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  }

  function renderAnalyticsVisitorsChart(rows, range) {
    renderAnalyticsChart('analytics-visitors-chart', rows, [
      { key: 'visits', label: '방문 수', className: 'analytics-bar-fill-visits' },
    ], '방문 데이터가 없습니다', range, _analyticsChartModes.visitors);
  }

  function renderAnalyticsViewsChart(rows, range) {
    renderAnalyticsChart('analytics-views-chart', rows, [
      { key: 'views', label: '조회수', className: 'analytics-bar-fill-views' },
    ], '조회수 데이터가 없습니다', range, _analyticsChartModes.views);
  }

  function renderAnalyticsChart(id, rows, seriesDefs, emptyText, range, mode) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="list-empty">' + GW.escapeHtml(emptyText) + '</div>';
      return;
    }
    var chartRows = mode === 'cumulative' ? buildCumulativeAnalyticsRows(rows, seriesDefs) : rows.slice();
    var max = 0;
    chartRows.forEach(function (row) {
      seriesDefs.forEach(function (series) {
        max = Math.max(max, Number(row[series.key] || 0));
      });
    });
    max = max || 1;
    var legend = '<div class="analytics-chart-legend">' + seriesDefs.map(function (series) {
      var label = mode === 'cumulative' ? (series.label + ' 누적') : series.label;
      return '<span><i class="analytics-legend-swatch ' + series.className + '"></i>' + GW.escapeHtml(label) + '</span>';
    }).join('') + '</div>';
    if (mode === 'line' || mode === 'cumulative') {
      el.innerHTML = legend + buildAnalyticsLineChart(chartRows, seriesDefs, max, range, mode);
      bindAnalyticsChartTooltip(el);
      return;
    }
    var items = chartRows.map(function (row) {
      var bars = seriesDefs.map(function (series) {
        var value = Number(row[series.key] || 0);
        var width = Math.max(4, Math.round((value / max) * 100));
        return '<div class="analytics-bar-line">' +
          '<div class="analytics-bar-track"><span class="analytics-bar-fill ' + series.className + '" style="width:' + width + '%;"></span></div>' +
          '<span class="analytics-bar-value">' + formatMetricCompact(value) + '</span>' +
        '</div>';
      }).join('');
      return '<div class="analytics-bar-row">' +
        '<div class="analytics-bar-label">' + GW.escapeHtml(getAnalyticsBucketLabel(row, range)) + '</div>' +
        '<div class="analytics-bar-group">' + bars + '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = legend + '<div class="analytics-chart">' + items + '</div>';
  }

  function buildAnalyticsLineChart(rows, seriesDefs, max, range, mode) {
    var width = 640;
    var height = 220;
    var paddingX = 18;
    var paddingTop = 16;
    var paddingBottom = 34;
    var graphHeight = height - paddingTop - paddingBottom;
    var stepX = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0;
    var guides = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
      var y = paddingTop + graphHeight - graphHeight * ratio;
      return '<line x1="' + paddingX + '" y1="' + y.toFixed(1) + '" x2="' + (width - paddingX) + '" y2="' + y.toFixed(1) + '" class="analytics-line-guide"></line>';
    }).join('');
    var xLabels = rows.map(function (row, index) {
      var x = paddingX + stepX * index;
      return '<text x="' + x.toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle" class="analytics-line-x-label">' + GW.escapeHtml(getAnalyticsBucketLabel(row, range)) + '</text>';
    }).join('');
    var seriesSvg = seriesDefs.map(function (series) {
      var points = rows.map(function (row, index) {
        var value = Number(row[series.key] || 0);
        var x = paddingX + stepX * index;
        var y = paddingTop + graphHeight - (value / max) * graphHeight;
        return { x: x, y: y, value: value };
      });
      var pointString = points.map(function (point) {
        return point.x.toFixed(1) + ',' + point.y.toFixed(1);
      }).join(' ');
      var circles = points.map(function (point, pointIndex) {
        var row = rows[pointIndex];
        var detailLabel = getAnalyticsBucketFullLabel(row, range);
        var seriesLabel = mode === 'cumulative' ? (series.label + ' 누적') : series.label;
        return '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4" class="analytics-line-point ' + series.className + '"></circle>' +
          '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="12" class="analytics-line-hit" data-analytics-tooltip="' + GW.escapeHtml(seriesLabel + '|' + detailLabel + '|' + formatMetricExact(point.value)) + '"></circle>';
      }).join('');
      return '<polyline fill="none" points="' + pointString + '" class="analytics-line-path ' + series.className + '"></polyline>' + circles;
    }).join('');
    return '<div class="analytics-line-chart-shell"><div class="analytics-line-tooltip" hidden></div><div class="analytics-line-chart-wrap"><svg viewBox="0 0 ' + width + ' ' + height + '" class="analytics-line-chart" role="img" aria-label="분석 추이 차트">' + guides + seriesSvg + xLabels + '</svg></div></div>';
  }

  function buildCumulativeAnalyticsRows(rows, seriesDefs) {
    var totals = {};
    seriesDefs.forEach(function (series) {
      totals[series.key] = 0;
    });
    return rows.map(function (row) {
      var next = Object.assign({}, row);
      seriesDefs.forEach(function (series) {
        totals[series.key] += Number(row[series.key] || 0);
        next[series.key] = totals[series.key];
      });
      return next;
    });
  }

  function bindAnalyticsChartTooltip(el) {
    var shell = el.querySelector('.analytics-line-chart-shell');
    var tooltip = shell && shell.querySelector('.analytics-line-tooltip');
    if (!shell || !tooltip) return;
    Array.prototype.forEach.call(shell.querySelectorAll('[data-analytics-tooltip]'), function (node) {
      function showTooltip(event) {
        var parts = String(node.getAttribute('data-analytics-tooltip') || '').split('|');
        tooltip.innerHTML = '<strong>' + GW.escapeHtml(parts[0] || '') + '</strong><span>' + GW.escapeHtml(parts[1] || '') + '</span><em>' + GW.escapeHtml(parts[2] || '') + '</em>';
        tooltip.hidden = false;
        var shellRect = shell.getBoundingClientRect();
        var pointRect = node.getBoundingClientRect();
        var x = pointRect.left - shellRect.left + (pointRect.width / 2);
        var y = pointRect.top - shellRect.top - 12;
        tooltip.style.left = Math.max(12, Math.min(shellRect.width - 12, x)) + 'px';
        tooltip.style.top = Math.max(10, y) + 'px';
      }
      function hideTooltip() {
        tooltip.hidden = true;
      }
      node.addEventListener('mouseenter', showTooltip);
      node.addEventListener('mousemove', showTooltip);
      node.addEventListener('mouseleave', hideTooltip);
      node.addEventListener('focus', showTooltip);
      node.addEventListener('blur', hideTooltip);
    });
  }

  function renderAnalyticsReferrersPie(items) {
    var el = document.getElementById('analytics-referrers-pie');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '';
      return;
    }
    var palette = ['#0094B4', '#FF5655', '#248737', '#622599', '#8A5A2B', '#E47A2E', '#5D6F2B', '#5F6B7A'];
    var total = items.reduce(function (sum, item) { return sum + Number(item.visits || 0); }, 0) || 1;
    var current = -90;
    var slices = items.slice(0, 8).map(function (item, index) {
      var value = Number(item.visits || 0);
      var angle = (value / total) * 360;
      var next = current + angle;
      var largeArc = angle > 180 ? 1 : 0;
      var x1 = 50 + 42 * Math.cos(current * Math.PI / 180);
      var y1 = 50 + 42 * Math.sin(current * Math.PI / 180);
      var x2 = 50 + 42 * Math.cos(next * Math.PI / 180);
      var y2 = 50 + 42 * Math.sin(next * Math.PI / 180);
      var path = 'M 50 50 L ' + x1.toFixed(3) + ' ' + y1.toFixed(3) + ' A 42 42 0 ' + largeArc + ' 1 ' + x2.toFixed(3) + ' ' + y2.toFixed(3) + ' Z';
      var color = palette[index % palette.length];
      current = next;
      return {
        path: path,
        color: color,
        label: item.source_label || item.source_key || '유입',
        meta: formatMetricCompact(value) + ' (' + Math.round((value / total) * 100) + '%)',
      };
    });
    el.innerHTML =
      '<div class="analytics-pie-layout">' +
        '<svg viewBox="0 0 100 100" class="analytics-pie-chart" role="img" aria-label="유입 경로 분포">' +
          slices.map(function (slice) {
            return '<path d="' + slice.path + '" fill="' + slice.color + '"></path>';
          }).join('') +
        '</svg>' +
        '<div class="analytics-pie-legend">' +
          slices.map(function (slice) {
            return '<div class="analytics-pie-legend-item"><i style="background:' + slice.color + '"></i><div><strong>' + GW.escapeHtml(slice.label) + '</strong><span>' + GW.escapeHtml(slice.meta) + '</span></div></div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function syncAnalyticsChartModeButtons() {
    [['visitors', 'bar'], ['visitors', 'line'], ['visitors', 'cumulative'], ['views', 'bar'], ['views', 'line'], ['views', 'cumulative']].forEach(function (pair) {
      var kind = pair[0];
      var mode = pair[1];
      var btn = document.getElementById('analytics-' + kind + '-' + mode + '-btn');
      if (!btn) return;
      btn.classList.toggle('active', _analyticsChartModes[kind] === mode);
    });
  }

  function renderAnalyticsVisitorsTable(rows, range) {
    renderAnalyticsTable('analytics-visitors-table', rows, [
      { key: 'date', label: isHourlyAnalyticsRange(range) ? '시간' : '날짜', format: function (_, row) { return getAnalyticsBucketLabel(row, range); } },
      { key: 'visits', label: '방문 수' },
    ], '방문 데이터가 없습니다');
  }

  function renderAnalyticsViewsTable(rows, range) {
    renderAnalyticsTable('analytics-views-table', rows, [
      { key: 'date', label: isHourlyAnalyticsRange(range) ? '시간' : '날짜', format: function (_, row) { return getAnalyticsBucketLabel(row, range); } },
      { key: 'views', label: '조회수' },
    ], '조회수 데이터가 없습니다');
  }

  function renderAnalyticsTable(id, rows, columns, emptyText) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="list-empty">' + GW.escapeHtml(emptyText) + '</div>';
      return;
    }
    var head = columns.map(function (col) {
      return '<th>' + GW.escapeHtml(col.label) + '</th>';
    }).join('');
    var body = rows.map(function (row) {
      return '<tr>' + columns.map(function (col) {
        var raw = row[col.key];
        var value = col.format ? col.format(raw, row) : raw;
        return '<td>' + GW.escapeHtml(value == null ? '' : String(value)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    el.innerHTML = '<div class="analytics-table-scroll"><table class="analytics-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderAnalyticsTopPages(items) {
    var el = document.getElementById('analytics-top-pages');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="list-empty">기간 내 상위 기사 데이터가 없습니다</div>';
      return;
    }
    var body = items.map(function (item, index) {
      var pageInfo = getAnalyticsPageInfo(item);
      return '<tr>' +
        '<td>' + (index + 1) + '</td>' +
        '<td><strong>' + GW.escapeHtml(pageInfo.title) + '</strong><div style="font-size:10px;color:var(--muted);margin-top:4px;">' + GW.escapeHtml(pageInfo.path) + '</div></td>' +
        '<td>' + formatMetricCompact(item.visits || 0) + '</td>' +
        '<td>' + formatMetricCompact(item.pageviews || 0) + '</td>' +
      '</tr>';
    }).join('');
    el.innerHTML = '<div class="analytics-table-scroll"><table class="analytics-table"><thead><tr><th>#</th><th>기사</th><th>방문수</th><th>조회수</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function getAnalyticsPageInfo(item) {
    var path = item && item.path ? String(item.path) : '/';
    var title = item && item.title ? String(item.title).trim() : '';
    if (title) return { title: title, path: path };

    var pageTitles = {
      '/': '홈',
      '/index.html': '홈',
      '/korea': 'Korea',
      '/korea.html': 'Korea',
      '/apr': 'APR',
      '/apr.html': 'APR',
      '/wosm': 'WOSM',
      '/wosm.html': 'WOSM',
      '/people': 'Scout People',
      '/people.html': 'Scout People',
      '/glossary': '용어집',
      '/glossary.html': '용어집',
      '/contributors.html': '도움을 주신 분들',
      '/search.html': '검색',
      '/404.html': '404',
      '/admin.html': '관리자',
    };
    return {
      title: pageTitles[path] || path,
      path: path,
    };
  }

  function formatAnalyticsDate(dateStr) {
    if (!dateStr) return '';
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return String(dateStr);
    return parts[1] + '.' + parts[2];
  }

  function getAnalyticsBucketLabel(row, range) {
    if (row && row.label) return String(row.label);
    if (isHourlyAnalyticsRange(range) && row && row.hour != null) return String(row.hour) + ':00';
    return formatAnalyticsDate(row && row.date);
  }

  function getAnalyticsBucketFullLabel(row, range) {
    if (isHourlyAnalyticsRange(range) && row && row.hour != null) {
      var date = range && range.start_date ? range.start_date : GW.getKstDateInputValue();
      return String(date) + ' ' + String(row.hour).padStart(2, '0') + ':00';
    }
    return row && row.date ? String(row.date) : getAnalyticsBucketLabel(row, range);
  }

  function isHourlyAnalyticsRange(range) {
    return !!(range && range.granularity === 'hour');
  }

  function renderAnalyticsList(id, items, mapFn, emptyText) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="list-empty">' + GW.escapeHtml(emptyText) + '</div>';
      return;
    }
    el.innerHTML = items.map(function (item) {
      var view = mapFn(item);
      return '<div class="analytics-item">' +
        '<div><strong>' + GW.escapeHtml(view.title) + '</strong><span>' + GW.escapeHtml(view.meta) + '</span></div>' +
      '</div>';
    }).join('');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setMetricText(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = formatMetricCompact(value);
    el.title = value == null ? '' : String(value);
  }

  function formatMetricCompact(value) {
    if (value == null || value === '' || value === '—') return '—';
    if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value)) return value;
    var num = Number(value || 0);
    if (!Number.isFinite(num)) return String(value);
    if (num < 1000) return String(Math.round(num)).padStart(3, '0');
    if (num < 1000000) return trimMetricUnit(num / 1000) + 'k';
    return trimMetricUnit(num / 1000000) + 'm';
  }

  function formatMetricExact(value) {
    var num = Number(value || 0);
    if (!Number.isFinite(num)) return String(value || '0');
    return num.toLocaleString('ko-KR') + '건';
  }

  function renderAnalyticsInsights(payload) {
    var cardsEl = document.getElementById('analytics-insights-cards');
    var notesEl = document.getElementById('analytics-insights-notes');
    if (!cardsEl || !notesEl) return;

    var visitorSeries = payload && payload.visitors && Array.isArray(payload.visitors.series) ? payload.visitors.series : [];
    var viewSeries = payload && payload.views && Array.isArray(payload.views.series) ? payload.views.series : [];
    var referrers = Array.isArray(payload && payload.referrers) ? payload.referrers : [];
    var topPaths = Array.isArray(payload && payload.top_paths) ? payload.top_paths : [];
    var range = payload && payload.range ? payload.range : { granularity: 'day' };
    var summary = payload && payload.summary ? payload.summary : {};

    var peakVisits = getAnalyticsPeak(visitorSeries, 'visits', range);
    var peakViews = getAnalyticsPeak(viewSeries, 'views', range);
    var topChannel = referrers[0] || null;
    var topArticle = topPaths[0] || null;
    var shareVisits = referrers.filter(function (item) { return item.source_type === 'share'; }).reduce(function (sum, item) { return sum + Number(item.visits || 0); }, 0);
    var searchVisits = referrers.filter(function (item) { return item.source_type === 'search'; }).reduce(function (sum, item) { return sum + Number(item.visits || 0); }, 0);
    var totalTrackedVisits = referrers.reduce(function (sum, item) { return sum + Number(item.visits || 0); }, 0) || 1;
    var viewsPerVisit = Number(summary.range_visits || 0) ? (Number(summary.range_pageviews || 0) / Number(summary.range_visits || 1)) : 0;

    var cards = [
      {
        title: '방문당 조회',
        value: viewsPerVisit ? viewsPerVisit.toFixed(2) : '0.00',
        meta: '한 번 들어온 사람이 기사 몇 건을 읽는지 보여줍니다.',
      },
      {
        title: '최고 방문 시점',
        value: peakVisits ? getAnalyticsBucketLabel(peakVisits.row, range) : '—',
        meta: peakVisits ? ('방문 ' + formatMetricExact(peakVisits.value)) : '데이터가 없습니다.',
      },
      {
        title: '최고 조회 시점',
        value: peakViews ? getAnalyticsBucketLabel(peakViews.row, range) : '—',
        meta: peakViews ? ('조회 ' + formatMetricExact(peakViews.value)) : '데이터가 없습니다.',
      },
      {
        title: '최대 유입 채널',
        value: topChannel ? (topChannel.source_label || '직접 방문') : '—',
        meta: topChannel ? ('방문 ' + formatMetricExact(topChannel.visits || 0)) : '유입 데이터가 없습니다.',
      },
      {
        title: '가장 읽힌 기사',
        value: topArticle ? getAnalyticsPageInfo(topArticle).title : '—',
        meta: topArticle ? ('조회 ' + formatMetricExact(topArticle.pageviews || 0)) : '상위 기사 데이터가 없습니다.',
      },
    ];

    cardsEl.innerHTML = cards.map(function (card) {
      return '<article class="analytics-insight-card">' +
        '<strong>' + GW.escapeHtml(card.title) + '</strong>' +
        '<div class="analytics-insight-value">' + GW.escapeHtml(card.value) + '</div>' +
        '<p>' + GW.escapeHtml(card.meta) + '</p>' +
      '</article>';
    }).join('');

    var notes = [
      {
        title: '공유 유입 비중',
        meta: totalTrackedVisits ? (Math.round((shareVisits / totalTrackedVisits) * 100) + '% · 방문 ' + formatMetricExact(shareVisits)) : '데이터가 없습니다.',
      },
      {
        title: '검색 유입 비중',
        meta: totalTrackedVisits ? (Math.round((searchVisits / totalTrackedVisits) * 100) + '% · 방문 ' + formatMetricExact(searchVisits)) : '데이터가 없습니다.',
      },
      {
        title: '운영 해석',
        meta: buildAnalyticsInsightNarrative(viewsPerVisit, topChannel, topArticle),
      },
    ];
    notesEl.innerHTML = notes.map(function (item) {
      return '<div class="analytics-item">' +
        '<div><strong>' + GW.escapeHtml(item.title) + '</strong><span>' + GW.escapeHtml(item.meta) + '</span></div>' +
      '</div>';
    }).join('');
  }

  function getAnalyticsPeak(rows, key, range) {
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.reduce(function (best, row) {
      var value = Number(row[key] || 0);
      if (!best || value > best.value) return { row: row, value: value, label: getAnalyticsBucketFullLabel(row, range) };
      return best;
    }, null);
  }

  function buildAnalyticsInsightNarrative(viewsPerVisit, topChannel, topArticle) {
    var message = [];
    if (viewsPerVisit >= 1.8) {
      message.push('방문자가 한 번 들어와 여러 기사를 읽는 흐름이 비교적 잘 보입니다.');
    } else {
      message.push('첫 방문 후 추가 기사 탐색을 더 유도할 필요가 있습니다.');
    }
    if (topChannel && topChannel.source_label) {
      message.push('현재 가장 강한 유입 채널은 ' + topChannel.source_label + '입니다.');
    }
    if (topArticle) {
      message.push('대표 성과 기사는 ' + getAnalyticsPageInfo(topArticle).title + '입니다.');
    }
    return message.join(' ');
  }

  function trimMetricUnit(value) {
    var fixed = value >= 100 ? value.toFixed(0) : (value >= 10 ? value.toFixed(1) : value.toFixed(2));
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }

  function loadGlossaryAdmin() {
    bindGlossaryBucketAutofill();
    fetch('/api/glossary', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _glossaryItems = Array.isArray(data.items) ? data.items : [];
        renderGlossaryAdmin();
      })
      .catch(function () {
        var list = document.getElementById('glossary-admin-list');
        if (list) list.innerHTML = '<div class="list-empty">용어를 불러오지 못했습니다.</div>';
      });
  }

  function inferGlossaryBucket(termKo) {
    var first = String(termKo || '').trim().charAt(0);
    if (!first) return '';
    var code = first.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '';
    var choseongIndex = Math.floor((code - 0xac00) / 588);
    return GLOSSARY_CHOSEONG_BUCKETS[choseongIndex] || '';
  }

  function bindGlossaryBucketAutofill() {
    var koInput = document.getElementById('glossary-ko-input');
    var bucketSelect = document.getElementById('glossary-bucket-input');
    if (!koInput || !bucketSelect || koInput.dataset.bucketBound === '1') return;
    koInput.dataset.bucketBound = '1';
    koInput.addEventListener('input', function () {
      var inferred = inferGlossaryBucket(koInput.value);
      if (inferred && GLOSSARY_BUCKETS.indexOf(inferred) >= 0) bucketSelect.value = inferred;
    });
  }

  window.filterGlossaryAdmin = function () {
    renderGlossaryAdmin();
  };

  function renderGlossaryAdmin() {
    var list = document.getElementById('glossary-admin-list');
    if (!list) return;
    var bucketFilter = (document.getElementById('glossary-filter-bucket') || {}).value || 'all';
    var query = ((document.getElementById('glossary-search-admin') || {}).value || '').trim().toLowerCase();
    var buckets = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    var filtered = _glossaryItems.filter(function (item) {
      if (bucketFilter !== 'all' && item.bucket !== bucketFilter) return false;
      if (!query) return true;
      var haystack = [item.term_ko, item.term_en, item.term_fr, item.description_ko].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="list-empty">등록된 용어가 없습니다.</div>';
      return;
    }
    list.innerHTML = buckets.map(function (bucket) {
      var group = filtered.filter(function (item) { return item.bucket === bucket; });
      if (!group.length) return '';
      return '<section>' +
        '<h3 class="glossary-admin-group-title">' + bucket + '</h3>' +
        group.map(function (item) {
          return '<div class="glossary-admin-row">' +
            '<div class="glossary-admin-cell glossary-admin-cell-bucket"><span class="glossary-admin-cell-label">분류</span><strong lang="ko">' + GW.escapeHtml(item.bucket) + '</strong></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-ko"><span class="glossary-admin-cell-label">한국어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-ko" lang="ko">' + GW.escapeHtml(item.term_ko || '-') + '</span></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-en"><span class="glossary-admin-cell-label">영어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-en" lang="en">' + GW.escapeHtml(item.term_en || '-') + '</span></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-fr"><span class="glossary-admin-cell-label">프랑스어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-fr" lang="fr">' + GW.escapeHtml(item.term_fr || '-') + '</span></div>' +
            '<div class="glossary-admin-description"><span class="glossary-admin-cell-label">설명</span><span class="glossary-admin-cell-text glossary-admin-cell-text-ko" lang="ko">' + GW.escapeHtml(item.description_ko || '-') + '</span></div>' +
            '<div class="glossary-admin-actions">' +
              '<button type="button" class="glossary-admin-inline-btn" onclick="editGlossaryTerm(' + item.id + ')">수정</button>' +
              '<button type="button" class="glossary-admin-inline-btn delete" onclick="deleteGlossaryTerm(' + item.id + ')">삭제</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</section>';
    }).join('');
  }

  window.editGlossaryTerm = function (id) {
    var item = _glossaryItems.find(function (entry) { return entry.id === id; });
    if (!item) return;
    _glossaryEditingId = id;
    document.getElementById('glossary-bucket-input').value = item.bucket || '가';
    document.getElementById('glossary-ko-input').value = item.term_ko || '';
    document.getElementById('glossary-en-input').value = item.term_en || '';
    document.getElementById('glossary-fr-input').value = item.term_fr || '';
    document.getElementById('glossary-description-input').value = item.description_ko || '';
    document.getElementById('glossary-submit-btn').textContent = '수정 저장';
    document.getElementById('glossary-cancel-btn').style.display = '';
    document.getElementById('glossary-ko-input').focus();
  };

  window.cancelGlossaryEdit = function () {
    _glossaryEditingId = null;
    document.getElementById('glossary-bucket-input').value = '가';
    document.getElementById('glossary-ko-input').value = '';
    document.getElementById('glossary-en-input').value = '';
    document.getElementById('glossary-fr-input').value = '';
    document.getElementById('glossary-description-input').value = '';
    document.getElementById('glossary-submit-btn').textContent = '용어 저장';
    document.getElementById('glossary-cancel-btn').style.display = 'none';
  };

  window.submitGlossaryTerm = function () {
    var payload = {
      bucket: (document.getElementById('glossary-bucket-input').value || '가').trim(),
      term_ko: (document.getElementById('glossary-ko-input').value || '').trim(),
      term_en: (document.getElementById('glossary-en-input').value || '').trim(),
      term_fr: (document.getElementById('glossary-fr-input').value || '').trim(),
      description_ko: (document.getElementById('glossary-description-input').value || '').trim(),
      sort_order: 0,
    };
    if (!payload.term_ko && !payload.term_en && !payload.term_fr) {
      GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력해주세요', 'error');
      return;
    }
    var url = _glossaryEditingId ? '/api/glossary/' + _glossaryEditingId : '/api/glossary';
    var method = _glossaryEditingId ? 'PUT' : 'POST';
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(_glossaryEditingId ? '용어가 수정됐습니다' : '용어가 추가됐습니다', 'success');
        cancelGlossaryEdit();
        loadGlossaryAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  window.deleteGlossaryTerm = function (id) {
    if (!confirm('이 용어를 삭제할까요?')) return;
    GW.apiFetch('/api/glossary/' + id, { method: 'DELETE' })
      .then(function () {
        GW.showToast('용어가 삭제됐습니다', 'success');
        if (_glossaryEditingId === id) cancelGlossaryEdit();
        loadGlossaryAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '삭제 실패', 'error');
      });
  };

  function loadCalendarAdmin() {
    bindCalendarAdminControls();
    Promise.all([
      GW.apiFetch('/api/calendar'),
      GW.apiFetch('/api/settings/calendar-tags').catch(function () { return { items: [] }; }),
      GW.apiFetch('/api/settings/calendar-copy').catch(function () { return { copy: defaultCalendarCopy() }; })
    ])
      .then(function (results) {
        var calendarData = results[0];
        var tagData = results[1];
        var copyData = results[2];
        _calendarItems = Array.isArray(calendarData && calendarData.items) ? calendarData.items : [];
        _calendarTagPresets = Array.isArray(tagData && tagData.items) ? tagData.items : [];
        populateCalendarCopyEditor(copyData && copyData.copy);
        renderCalendarAdmin();
        renderCalendarTagPresetManager();
        renderCalendarTagEditor();
      })
      .catch(function () {
        var list = document.getElementById('calendar-admin-list');
        if (list) list.innerHTML = '<div class="list-empty">일정을 불러오지 못했습니다.</div>';
      });
  }

  function renderCalendarAdmin() {
    var list = document.getElementById('calendar-admin-list');
    if (!list) return;
    if (!_calendarItems.length) {
      list.innerHTML = '<div class="list-empty">등록된 일정이 없습니다.</div>';
      return;
    }
    list.innerHTML = _calendarItems.map(function (item) {
      var place = item.location_name || formatCalendarAddressDisplay(item.location_address || '') || '';
      var category = GW.escapeHtml(item.event_category || 'WOSM');
      var status = getCalendarStatus(item);
      var displayTitle = item.title || item.title_original || '';
      var originalTitle = item.title && item.title_original
        ? '<p class="calendar-admin-item-origin">' + GW.escapeHtml(item.title_original) + '</p>'
        : '';
      var tagsHtml = Array.isArray(item.event_tags) && item.event_tags.length
        ? '<div class="calendar-admin-item-badges">' + item.event_tags.map(function (tag) {
            return '<span class="calendar-status-badge">' + GW.escapeHtml(tag) + '</span>';
          }).join('') + '</div>'
        : '';
      var relatedHtml = Array.isArray(item.related_posts) && item.related_posts.length
        ? '<div class="calendar-admin-item-link">관련 기사: ' + item.related_posts.map(function (related) {
            return GW.escapeHtml(related.title || '');
          }).join(', ') + '</div>'
        : '';
      return '<article class="calendar-admin-item">' +
        '<div class="calendar-admin-item-head">' +
          '<div>' +
            '<div class="calendar-admin-item-badges"><span class="calendar-category-badge is-' + category.toLowerCase() + '">' + category + '</span><span class="calendar-status-badge is-' + status.key + '">' + GW.escapeHtml(status.label) + '</span></div>' +
            '<h3>' + GW.escapeHtml(displayTitle) + '</h3>' +
            originalTitle +
            '<p>' + GW.escapeHtml(formatCalendarRange(item)) + '</p>' +
          '</div>' +
          '<div class="calendar-admin-item-actions">' +
            '<button type="button" class="glossary-admin-inline-btn" onclick="editCalendarEvent(' + item.id + ')">수정</button>' +
            '<button type="button" class="glossary-admin-inline-btn delete" onclick="deleteCalendarEvent(' + item.id + ')">삭제</button>' +
          '</div>' +
        '</div>' +
        (place ? '<p class="calendar-admin-item-meta">' + GW.escapeHtml(place) + '</p>' : '') +
        tagsHtml +
        (item.description ? '<p class="calendar-admin-item-desc">' + GW.escapeHtml(item.description) + '</p>' : '') +
        relatedHtml +
        (item.link_url ? '<a class="calendar-admin-item-link" href="' + GW.escapeHtml(item.link_url) + '" target="_blank" rel="noopener">관련 링크 ↗</a>' : '') +
      '</article>';
    }).join('');
  }

  function renderCalendarTitleManager() {
    var list = document.getElementById('calendar-title-manager-list');
    if (!list) return;
    if (!_calendarItems.length) {
      list.innerHTML = '<div class="list-empty">등록된 일정이 없습니다.</div>';
      return;
    }
    list.innerHTML = _calendarItems.map(function (item) {
      var label = formatCalendarRange(item);
      return '<div class="calendar-title-manager-item">' +
        '<div class="calendar-title-manager-head">' +
          '<strong>' + GW.escapeHtml(label) + '</strong>' +
          '<span>' + GW.escapeHtml(item.event_category || 'WOSM') + '</span>' +
        '</div>' +
        '<div class="calendar-title-manager-grid">' +
          '<input type="text" data-calendar-title-id="' + item.id + '" value="' + GW.escapeHtml(item.title || '') + '" placeholder="행사명(국문)">' +
          '<input type="text" data-calendar-title-original-id="' + item.id + '" value="' + GW.escapeHtml(item.title_original || '') + '" placeholder="행사명(원문)">' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function bindCalendarAdminControls() {
    var queryInput = document.getElementById('calendar-related-post-query');
    if (queryInput && queryInput.dataset.bound !== 'true') {
      queryInput.dataset.bound = 'true';
      queryInput.addEventListener('input', function () {
        if (_calendarSearchTimer) clearTimeout(_calendarSearchTimer);
        _calendarSearchTimer = setTimeout(function () {
          searchCalendarRelatedPosts(queryInput.value || '');
        }, 180);
      });
    }
    bindCalendarTimeToggle('calendar-start-time-enabled', 'calendar-start-time-input');
    bindCalendarTimeToggle('calendar-end-time-enabled', 'calendar-end-time-input');
    initCalendarGeoMap();
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
  }

  function bindCalendarTimeToggle(toggleId, inputId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    if (!toggle || !input || toggle.dataset.bound === 'true') return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('change', function () {
      input.disabled = !toggle.checked;
      if (!toggle.checked) input.value = '';
    });
  }

  function searchCalendarRelatedPosts(query) {
    var resultsEl = document.getElementById('calendar-related-post-results');
    if (!resultsEl) return;
    var term = String(query || '').trim();
    if (!term) {
      resultsEl.innerHTML = '';
      return;
    }
    GW.apiFetch('/api/posts?page=1&limit=8&q=' + encodeURIComponent(term))
      .then(function (data) {
        var posts = Array.isArray(data && data.posts) ? data.posts : [];
        if (!posts.length) {
          resultsEl.innerHTML = '<div class="list-empty">검색 결과가 없습니다.</div>';
          return;
        }
        resultsEl.innerHTML = posts.map(function (post) {
          return '<button type="button" class="calendar-related-post-option" data-post-id="' + post.id + '">' +
            '<strong>' + GW.escapeHtml(post.title || '') + '</strong>' +
            '<span>' + GW.escapeHtml(post.category || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-post-id]'), function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-post-id'), 10);
            var post = posts.find(function (entry) { return entry.id === id; });
            if (!post) return;
            if (_calendarRelatedPosts.some(function (entry) { return entry.id === post.id; })) return;
            _calendarRelatedPost = {
              id: post.id,
              title: post.title || '',
              category: post.category || ''
            };
            _calendarRelatedPosts.push(_calendarRelatedPost);
            var input = document.getElementById('calendar-related-post-query');
            if (input) input.value = '';
            resultsEl.innerHTML = '';
            renderCalendarRelatedPostSelected();
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">기사를 검색하지 못했습니다.</div>';
      });
  }

  window.searchCalendarGeo = function () {
    var query = String(document.getElementById('calendar-geo-query').value || '').trim();
    var resultsEl = document.getElementById('calendar-geo-results');
    if (!query) {
      GW.showToast('검색할 주소나 장소명을 입력해주세요', 'error');
      return;
    }
    resultsEl.innerHTML = '<div class="list-empty">지도 검색 중…</div>';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=' + encodeURIComponent(query), {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) { return res.json(); })
      .then(function (items) {
        if (!Array.isArray(items) || !items.length) {
          resultsEl.innerHTML = '<div class="list-empty">검색 결과가 없습니다.</div>';
          return;
        }
        resultsEl.innerHTML = items.map(function (item, index) {
          return '<button type="button" class="calendar-related-post-option" data-geo-index="' + index + '">' +
            '<strong>' + GW.escapeHtml(item.name || item.display_name || '지도 결과') + '</strong>' +
            '<span>' + GW.escapeHtml(item.display_name || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-geo-index]'), function (btn) {
          btn.addEventListener('click', function () {
            var item = items[parseInt(btn.getAttribute('data-geo-index'), 10)];
            if (!item) return;
            applyCalendarGeoResult(item);
            resultsEl.innerHTML = '';
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">지도 검색에 실패했습니다.</div>';
      });
  };

  function initCalendarGeoMap() {
    if (!window.L || _calendarGeoMap) return;
    var el = document.getElementById('calendar-geo-map');
    if (!el) return;
    _calendarGeoMap = L.map(el, { scrollWheelZoom: true }).setView([36.5, 127.9], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(_calendarGeoMap);
  }

  function applyCalendarGeoResult(item) {
    var lat = Number(item && item.lat);
    var lng = Number(item && item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    document.getElementById('calendar-location-address-input').value = buildCalendarAddress(item);
    document.getElementById('calendar-location-name-input').value = buildCalendarLocationName(item);
    var country = item.address && (item.address.country || item.address.country_code);
    if (country) {
      document.getElementById('calendar-country-input').value = country;
    }
    if (_calendarGeoMap) {
      _calendarGeoMap.setView([lat, lng], 11);
      if (_calendarGeoMarker) _calendarGeoMap.removeLayer(_calendarGeoMarker);
      _calendarGeoMarker = L.marker([lat, lng]).addTo(_calendarGeoMap);
    }
  }

  window.editCalendarEvent = function (id) {
    var item = _calendarItems.find(function (entry) { return entry.id === id; });
    if (!item) return;
    _calendarEditingId = id;
    document.getElementById('calendar-title-input').value = item.title || '';
    document.getElementById('calendar-title-original-input').value = item.title_original || '';
    document.getElementById('calendar-category-input').value = item.event_category || 'WOSM';
    document.getElementById('calendar-start-date-input').value = toDateOnlyValue(item.start_at);
    document.getElementById('calendar-start-time-enabled').checked = !!item.start_has_time;
    document.getElementById('calendar-start-time-input').disabled = !item.start_has_time;
    document.getElementById('calendar-start-time-input').value = item.start_has_time ? toTimeValue(item.start_at) : '';
    document.getElementById('calendar-end-date-input').value = toDateOnlyValue(item.end_at);
    document.getElementById('calendar-end-time-enabled').checked = !!item.end_has_time;
    document.getElementById('calendar-end-time-input').disabled = !item.end_has_time;
    document.getElementById('calendar-end-time-input').value = item.end_has_time ? toTimeValue(item.end_at) : '';
    document.getElementById('calendar-country-input').value = item.country_name || '';
    document.getElementById('calendar-location-name-input').value = item.location_name || '';
    document.getElementById('calendar-location-address-input').value = item.location_address || '';
    document.getElementById('calendar-geo-query').value = '';
    document.getElementById('calendar-geo-results').innerHTML = '';
    document.getElementById('calendar-link-input').value = item.link_url || '';
    document.getElementById('calendar-description-input').value = item.description || '';
    document.getElementById('calendar-related-post-query').value = '';
    document.getElementById('calendar-related-post-results').innerHTML = '';
    _calendarTags = Array.isArray(item.event_tags) ? item.event_tags.slice() : [];
    _calendarRelatedPosts = Array.isArray(item.related_posts) ? item.related_posts.slice() : [];
    _calendarRelatedPost = _calendarRelatedPosts[0] || null;
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
    syncCalendarGeoMarker(item.latitude, item.longitude);
    document.getElementById('calendar-submit-btn').textContent = '일정 수정';
    document.getElementById('calendar-cancel-btn').style.display = '';
    document.getElementById('calendar-title-input').focus();
  };

  window.cancelCalendarEdit = function () {
    _calendarEditingId = null;
    document.getElementById('calendar-title-input').value = '';
    document.getElementById('calendar-title-original-input').value = '';
    document.getElementById('calendar-category-input').value = 'KOR';
    document.getElementById('calendar-start-date-input').value = '';
    document.getElementById('calendar-start-time-enabled').checked = false;
    document.getElementById('calendar-start-time-input').disabled = true;
    document.getElementById('calendar-start-time-input').value = '';
    document.getElementById('calendar-end-date-input').value = '';
    document.getElementById('calendar-end-time-enabled').checked = false;
    document.getElementById('calendar-end-time-input').disabled = true;
    document.getElementById('calendar-end-time-input').value = '';
    document.getElementById('calendar-country-input').value = '';
    document.getElementById('calendar-location-name-input').value = '';
    document.getElementById('calendar-location-address-input').value = '';
    document.getElementById('calendar-geo-query').value = '';
    document.getElementById('calendar-geo-results').innerHTML = '';
    document.getElementById('calendar-link-input').value = '';
    document.getElementById('calendar-description-input').value = '';
    document.getElementById('calendar-related-post-query').value = '';
    document.getElementById('calendar-related-post-results').innerHTML = '';
    _calendarTags = [];
    _calendarRelatedPost = null;
    _calendarRelatedPosts = [];
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
    syncCalendarGeoMarker(null, null);
    document.getElementById('calendar-submit-btn').textContent = '일정 저장';
    document.getElementById('calendar-cancel-btn').style.display = 'none';
  };

  window.addCalendarTag = function () {
    var input = document.getElementById('calendar-tags-input');
    var value = String(input && input.value || '').trim();
    if (!value) {
      GW.showToast('추가할 태그를 입력해주세요', 'error');
      return;
    }
    if (_calendarTags.indexOf(value) >= 0) {
      GW.showToast('이미 추가된 태그입니다', 'error');
      return;
    }
    _calendarTags.push(value);
    if (input) input.value = '';
    renderCalendarTagEditor();
  };

  window.removeCalendarTag = function (tag) {
    _calendarTags = _calendarTags.filter(function (item) { return item !== tag; });
    renderCalendarTagEditor();
  };

  window.clearCalendarRelatedPost = function () {
    _calendarRelatedPost = null;
    _calendarRelatedPosts = [];
    renderCalendarRelatedPostSelected();
  };

  window.removeCalendarRelatedPost = function (id) {
    _calendarRelatedPosts = _calendarRelatedPosts.filter(function (entry) { return entry.id !== id; });
    _calendarRelatedPost = _calendarRelatedPosts[0] || null;
    renderCalendarRelatedPostSelected();
  };

  function renderCalendarTagEditor() {
    var list = document.getElementById('calendar-tags-list');
    if (!list) return;
    if (!_calendarTags.length) {
      list.innerHTML = '<div class="list-empty">등록된 행사 태그가 없습니다.</div>';
    } else {
      list.innerHTML = _calendarTags.map(function (tag) {
      return '<button type="button" class="calendar-tag-chip" data-calendar-tag="' + GW.escapeHtml(tag) + '">' +
        '<span>' + GW.escapeHtml(tag) + '</span><strong>×</strong>' +
      '</button>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('[data-calendar-tag]'), function (btn) {
        btn.addEventListener('click', function () {
          removeCalendarTag(btn.getAttribute('data-calendar-tag') || '');
        });
      });
    }
    renderCalendarTagPresets();
  }

  function renderCalendarRelatedPostSelected() {
    var wrap = document.getElementById('calendar-related-post-selected');
    if (!wrap) return;
    if (!_calendarRelatedPosts.length) {
      wrap.innerHTML = '<div class="list-empty">선택된 관련 기사가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = _calendarRelatedPosts.map(function (item) {
      return '<div class="calendar-related-post-pill">' +
        '<div><strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
        (item.category ? '<span>' + GW.escapeHtml(item.category) + '</span>' : '') +
        '</div>' +
        '<button type="button" data-calendar-related-remove="' + item.id + '">해제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-related-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        removeCalendarRelatedPost(parseInt(btn.getAttribute('data-calendar-related-remove'), 10));
      });
    });
  }

  function renderCalendarTagPresets() {
    var wrap = document.getElementById('calendar-tag-presets');
    if (!wrap) return;
    if (!_calendarTagPresets.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = _calendarTagPresets.map(function (tag) {
      var active = _calendarTags.indexOf(tag) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-tag-chip calendar-tag-preset' + active + '" data-calendar-preset-tag="' + GW.escapeHtml(tag) + '">' +
        '<span>' + GW.escapeHtml(tag) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-preset-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-calendar-preset-tag') || '';
        if (_calendarTags.indexOf(tag) >= 0) {
          _calendarTags = _calendarTags.filter(function (item) { return item !== tag; });
        } else {
          _calendarTags.push(tag);
        }
        renderCalendarTagEditor();
      });
    });
  }

  function renderCalendarTagPresetManager() {
    var list = document.getElementById('calendar-tag-manager-list');
    if (!list) return;
    if (!_calendarTagPresets.length) {
      list.innerHTML = '<div class="list-empty">등록된 공용 행사 태그가 없습니다.</div>';
      return;
    }
    list.innerHTML = _calendarTagPresets.map(function (tag, index) {
      return '<div class="calendar-tag-manager-item">' +
        '<input type="text" data-calendar-tag-preset-index="' + index + '" value="' + GW.escapeHtml(tag) + '">' +
        '<button type="button" class="cancel-btn admin-inline-cancel" data-calendar-tag-preset-remove="' + index + '">삭제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-calendar-tag-preset-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-calendar-tag-preset-remove'), 10);
        _calendarTagPresets.splice(index, 1);
        renderCalendarTagPresetManager();
        renderCalendarTagPresets();
      });
    });
  }

  window.addCalendarTagPreset = function () {
    var input = document.getElementById('calendar-tag-manager-new');
    var value = String(input && input.value || '').trim();
    if (!value) {
      GW.showToast('추가할 공용 행사 태그를 입력해주세요', 'error');
      return;
    }
    if (_calendarTagPresets.indexOf(value) >= 0) {
      GW.showToast('이미 등록된 공용 행사 태그입니다', 'error');
      return;
    }
    _calendarTagPresets.push(value);
    if (input) input.value = '';
    renderCalendarTagPresetManager();
    renderCalendarTagPresets();
  };

  window.saveCalendarTagPresets = function () {
    var inputs = document.querySelectorAll('[data-calendar-tag-preset-index]');
    _calendarTagPresets = Array.prototype.map.call(inputs, function (input) {
      return String(input.value || '').trim();
    }).filter(function (tag, index, items) {
      return !!tag && items.indexOf(tag) === index;
    });
    GW.apiFetch('/api/settings/calendar-tags', {
      method: 'PUT',
      body: JSON.stringify({ items: _calendarTagPresets })
    }).then(function () {
      GW.showToast('행사 태그가 저장됐습니다', 'success');
      renderCalendarTagPresetManager();
      renderCalendarTagPresets();
    }).catch(function (err) {
      GW.showToast(err.message || '행사 태그 저장 실패', 'error');
    });
  };

  window.saveCalendarCopy = function () {
    var next = defaultCalendarCopy();
    Object.keys(next).forEach(function (key) {
      var input = document.getElementById('calendar-copy-' + key.replace(/_/g, '-'));
      next[key] = String(input && input.value || '').trim() || next[key];
    });
    GW.apiFetch('/api/settings/calendar-copy', {
      method: 'PUT',
      body: JSON.stringify({ copy: next })
    }).then(function () {
      _calendarCopy = next;
      GW.showToast('캘린더 문구가 저장됐습니다', 'success');
    }).catch(function (err) {
      GW.showToast(err.message || '캘린더 문구 저장 실패', 'error');
    });
  };

  window.saveCalendarTitles = function () {
    var titleInputs = document.querySelectorAll('[data-calendar-title-id]');
    var originalInputs = document.querySelectorAll('[data-calendar-title-original-id]');
    var originalMap = {};
    Array.prototype.forEach.call(originalInputs, function (input) {
      originalMap[input.getAttribute('data-calendar-title-original-id')] = String(input.value || '').trim();
    });
    var updates = [];
    Array.prototype.forEach.call(titleInputs, function (input) {
      var id = parseInt(input.getAttribute('data-calendar-title-id'), 10);
      var item = _calendarItems.find(function (entry) { return entry.id === id; });
      if (!item) return;
      var nextTitle = String(input.value || '').trim();
      var nextOriginal = originalMap[String(id)] || '';
      if (nextTitle === String(item.title || '').trim() && nextOriginal === String(item.title_original || '').trim()) return;
      updates.push({
        id: id,
        payload: {
          title: nextTitle,
          title_original: nextOriginal,
          event_category: item.event_category || 'WOSM',
          start_date: toDateOnlyValue(item.start_at),
          start_time: item.start_has_time ? toTimeValue(item.start_at) : '',
          end_date: toDateOnlyValue(item.end_at),
          end_time: item.end_has_time ? toTimeValue(item.end_at) : '',
          event_tags: Array.isArray(item.event_tags) ? item.event_tags.slice() : [],
          country_name: item.country_name || '',
          location_name: item.location_name || '',
          location_address: item.location_address || '',
          latitude: item.latitude || '',
          longitude: item.longitude || '',
          related_post_id: item.related_posts && item.related_posts.length ? item.related_posts[0].id : null,
          related_posts: Array.isArray(item.related_posts) ? item.related_posts.slice() : [],
          link_url: item.link_url || '',
          description: item.description || ''
        }
      });
    });
    if (!updates.length) {
      GW.showToast('변경된 제목이 없습니다', 'info');
      return;
    }
    Promise.all(updates.map(function (update) {
      return GW.apiFetch('/api/calendar/' + update.id, {
        method: 'PUT',
        body: JSON.stringify(update.payload)
      });
    })).then(function () {
      GW.showToast('일정 제목이 저장됐습니다', 'success');
      loadCalendarAdmin();
    }).catch(function (err) {
      GW.showToast(err.message || '일정 제목 저장 실패', 'error');
    });
  };

  window.saveFeatureDefinition = function () {
    var input = document.getElementById('feature-definition-input');
    var content = String(input && input.value || '').trim();
    if (!content) {
      GW.showToast('기능 정의서 내용이 비어 있습니다', 'error');
      return;
    }
    GW.apiFetch('/api/settings/feature-definition', {
      method: 'PUT',
      body: JSON.stringify({ content: content })
    }).then(function () {
      GW.showToast('기능 정의서가 저장됐습니다', 'success');
      renderFeatureDefinitionPreview(content);
    }).catch(function (err) {
      GW.showToast(err.message || '기능 정의서 저장 실패', 'error');
    });
  };

  window.submitCalendarEvent = function () {
    var payload = {
      title: (document.getElementById('calendar-title-input').value || '').trim(),
      title_original: (document.getElementById('calendar-title-original-input').value || '').trim(),
      event_category: document.getElementById('calendar-category-input').value || 'WOSM',
      start_date: document.getElementById('calendar-start-date-input').value || '',
      start_time: document.getElementById('calendar-start-time-enabled').checked ? (document.getElementById('calendar-start-time-input').value || '') : '',
      end_date: document.getElementById('calendar-end-date-input').value || '',
      end_time: document.getElementById('calendar-end-time-enabled').checked ? (document.getElementById('calendar-end-time-input').value || '') : '',
      event_tags: _calendarTags.slice(),
      country_name: (document.getElementById('calendar-country-input').value || '').trim(),
      location_name: (document.getElementById('calendar-location-name-input').value || '').trim(),
      location_address: (document.getElementById('calendar-location-address-input').value || '').trim(),
      latitude: _calendarGeoMarker ? _calendarGeoMarker.getLatLng().lat : '',
      longitude: _calendarGeoMarker ? _calendarGeoMarker.getLatLng().lng : '',
      related_post_id: _calendarRelatedPosts.length ? _calendarRelatedPosts[0].id : null,
      related_posts: _calendarRelatedPosts.slice(),
      link_url: (document.getElementById('calendar-link-input').value || '').trim(),
      description: (document.getElementById('calendar-description-input').value || '').trim(),
    };
    if (!payload.title && !payload.title_original) {
      GW.showToast('행사명(국문) 또는 원문 제목을 입력해주세요', 'error');
      return;
    }
    if (!payload.start_date) {
      GW.showToast('행사 시작 일을 입력해주세요', 'error');
      return;
    }
    var url = _calendarEditingId ? '/api/calendar/' + _calendarEditingId : '/api/calendar';
    var method = _calendarEditingId ? 'PUT' : 'POST';
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(_calendarEditingId ? '일정이 수정됐습니다' : '일정이 등록됐습니다', 'success');
        cancelCalendarEdit();
        loadCalendarAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 저장 실패', 'error');
      });
  };

  window.deleteCalendarEvent = function (id) {
    if (!confirm('이 일정을 삭제할까요?')) return;
    GW.apiFetch('/api/calendar/' + id, { method: 'DELETE' })
      .then(function () {
        GW.showToast('일정이 삭제됐습니다', 'success');
        if (_calendarEditingId === id) cancelCalendarEdit();
        loadCalendarAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 삭제 실패', 'error');
      });
  };

  function toDateTimeLocalValue(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    return raw.slice(0, 16).replace(' ', 'T');
  }

  function toDateOnlyValue(value) {
    return String(value || '').trim().slice(0, 10);
  }

  function buildCalendarLocationName(item) {
    return String(item && (item.name || item.display_name) || '').trim();
  }

  function buildCalendarAddress(item) {
    var address = item && item.address;
    if (!address) return String(item && item.display_name || '').trim();
    var parts = [
      address.country,
      address.state || address.region,
      address.city || address.county || address.town || address.village,
      address.suburb || address.neighbourhood,
      address.road,
      address.house_number
    ].filter(Boolean);
    return parts.join(' ');
  }

  function formatCalendarAddressDisplay(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.indexOf(',') >= 0) {
      return raw.split(',').map(function (part) { return part.trim(); }).filter(Boolean).slice(0, 4).join(' ');
    }
    return raw;
  }

  function toTimeValue(value) {
    var raw = String(value || '').trim();
    if (!raw || raw.length < 16) return '';
    return raw.slice(11, 16);
  }

  function formatCalendarRange(itemOrStart, endAt) {
    var item = itemOrStart && typeof itemOrStart === 'object'
      ? itemOrStart
      : { start_at: itemOrStart, end_at: endAt, start_has_time: true, end_has_time: true };
    var start = String(item.start_at || '').trim();
    if (!start) return '';
    var startLabel = start.slice(0, 10) + (item.start_has_time ? ' ' + start.slice(11, 16) : '');
    var end = String(item.end_at || '').trim();
    if (!end) return startLabel;
    var endLabel = end.slice(0, 10) + (item.end_has_time ? ' ' + end.slice(11, 16) : '');
    return startLabel + ' ~ ' + endLabel;
  }

  function syncCalendarGeoMarker(lat, lng) {
    if (!_calendarGeoMap) return;
    if (_calendarGeoMarker) {
      _calendarGeoMap.removeLayer(_calendarGeoMarker);
      _calendarGeoMarker = null;
    }
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      _calendarGeoMap.setView([36.5, 127.9], 3);
      return;
    }
    _calendarGeoMarker = L.marker([Number(lat), Number(lng)]).addTo(_calendarGeoMap);
    _calendarGeoMap.setView([Number(lat), Number(lng)], 11);
  }

  function getCalendarStatus(item) {
    var now = Date.now();
    var start = parseCalendarDateTime(item && item.start_at);
    var end = parseCalendarDateTime(item && item.end_at);
    if (!start) return { key: 'upcoming', label: '개최예정' };
    if (start > now) return { key: 'upcoming', label: '개최예정' };
    if (!end || end >= now) return { key: 'ongoing', label: '진행중' };
    return { key: 'finished', label: '행사종료' };
  }

  function parseCalendarDateTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return 0;
    var parsed = Date.parse(raw.replace(' ', 'T') + '+09:00');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function loadVersionHistory() {
    if (_historyLoaded) {
      renderVersionHistory();
      return;
    }
    fetch('/data/changelog.json?v=' + encodeURIComponent(GW.APP_VERSION), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _historyItems = Array.isArray(data.items) ? data.items : [];
        _historyLoaded = true;
        _historyPage = 1;
        renderVersionHistory();
      })
      .catch(function () {
        var list = document.getElementById('version-history-list');
        if (list) list.innerHTML = '<div class="list-empty">버전 기록을 불러오지 못했습니다</div>';
      });
  }

  function renderVersionHistory() {
    var list = document.getElementById('version-history-list');
    var pg = document.getElementById('version-history-pagination');
    if (!list || !pg) return;
    if (!_historyItems.length) {
      list.innerHTML = '<div class="list-empty">기록된 버전이 없습니다</div>';
      pg.innerHTML = '';
      return;
    }
    var totalPages = Math.max(1, Math.ceil(_historyItems.length / _HISTORY_PAGE_SIZE));
    _historyPage = Math.max(1, Math.min(totalPages, _historyPage));
    var start = (_historyPage - 1) * _HISTORY_PAGE_SIZE;
    var items = _historyItems.slice(start, start + _HISTORY_PAGE_SIZE);
    list.innerHTML = items.map(function (item, localIndex) {
      var absoluteIndex = start + localIndex;
      var previousItem = _historyItems[absoluteIndex + 1] || null;
      var versionType = getVersionHistoryType(item, previousItem);
      var changes = Array.isArray(item.changes) ? item.changes : [];
      return '<article class="version-history-item">' +
        '<div class="version-history-top">' +
          '<div>' +
            '<div class="version-history-version">V' + GW.escapeHtml(item.version || '') + '</div>' +
            '<div class="version-history-date">' + GW.escapeHtml(item.date || '') + (item.commit ? ' · ' + GW.escapeHtml(item.commit) : '') + '</div>' +
          '</div>' +
          '<div class="version-history-type is-' + GW.escapeHtml(versionType.key) + '">' + GW.escapeHtml(versionType.label) + '</div>' +
        '</div>' +
        '<p class="version-history-summary">' + GW.escapeHtml(item.summary || '') + '</p>' +
        '<ul class="version-history-changes">' +
          changes.map(function (change) { return '<li>' + GW.escapeHtml(change) + '</li>'; }).join('') +
        '</ul>' +
      '</article>';
    }).join('');

    var buttons = [];
    buttons.push('<button type="button" ' + (_historyPage <= 1 ? 'disabled' : '') + ' onclick="changeHistoryPage(-1)">← 이전</button>');
    buttons.push('<span>' + _historyPage + ' / ' + totalPages + '</span>');
    buttons.push('<button type="button" ' + (_historyPage >= totalPages ? 'disabled' : '') + ' onclick="changeHistoryPage(1)">다음 →</button>');
    pg.innerHTML = buttons.join('');
  }

  window.changeHistoryPage = function (delta) {
    _historyPage += delta;
    renderVersionHistory();
  };

  function getVersionHistoryType(item, previousItem) {
    var explicitType = normalizeVersionHistoryType(item && item.type);
    if (explicitType) return explicitType;
    var current = parseVersionTuple(item && item.version);
    var previous = parseVersionTuple(previousItem && previousItem.version);
    if (current && previous) {
      if (current.major !== previous.major) return { key: 'super-nova', label: 'Super Nova' };
      if (current.update !== previous.update) return { key: 'update', label: 'Update' };
      return inferFixVersionType(item);
    }
    if (current) {
      if (current.update > 0) return { key: 'update', label: 'Update' };
      if (current.fix > 0) return inferFixVersionType(item);
      return { key: 'super-nova', label: 'Super Nova' };
    }
    return { key: 'update', label: 'Update' };
  }

  function normalizeVersionHistoryType(value) {
    var normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'super nova' || normalized === 'super-nova' || normalized === 'major') {
      return { key: 'super-nova', label: 'Super Nova' };
    }
    if (normalized === 'update' || normalized === 'feature' || normalized === 'release') {
      return { key: 'update', label: 'Update' };
    }
    if (normalized === 'bugfix' || normalized === 'bug-fix' || normalized === 'bug fix') {
      return { key: 'bugfix', label: 'Bugfix' };
    }
    if (normalized === 'hotfix' || normalized === 'hot-fix' || normalized === 'hot fix') {
      return { key: 'hotfix', label: 'Hotfix' };
    }
    return { key: 'update', label: toTitleCase(normalized) };
  }

  function inferFixVersionType(item) {
    var pool = [];
    if (item && item.summary) pool.push(item.summary);
    if (item && Array.isArray(item.changes)) pool = pool.concat(item.changes);
    var combined = pool.join(' ').toLowerCase();
    if (/(bug|버그|오류|실패|깨짐|작동하지|복구|fix)/.test(combined)) {
      return { key: 'bugfix', label: 'Bugfix' };
    }
    return { key: 'hotfix', label: 'Hotfix' };
  }

  function parseVersionTuple(version) {
    var raw = String(version || '').trim();
    if (!raw) return null;
    var parts = raw.split('.');
    if (!parts.length) return null;
    return {
      major: parseInt(parts[0], 10) || 0,
      update: parseInt(parts[1], 10) || 0,
      fix: parseInt(parts[2], 10) || 0,
    };
  }

  function toTitleCase(value) {
    return String(value || '').replace(/\b[a-z]/g, function (match) {
      return match.toUpperCase();
    });
  }

  // ─── Contributors admin ───────────────────────────────────
  var _contributors = [];
  var _contributorsRevision = null;
  var _editingContributorIdx = null;

  function loadContributorsAdmin() {
    fetch('/api/settings/contributors')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _contributors = data.items || [];
        _contributorsRevision = data.revision || null;
        renderContributorsAdmin();
      })
      .catch(function () {
        GW.showToast('도움을 주신 분들을 불러오지 못했습니다', 'error');
      });
  }

  function renderContributorsAdmin() {
    var el = document.getElementById('contributors-admin-list'); if (!el) return;
    if (!_contributors.length) {
      el.innerHTML = '<div class="admin-inline-note">등록된 분이 없습니다.</div>';
      return;
    }
    el.innerHTML = _contributors.map(function (c, i) {
      return '<div class="contributors-admin-item" draggable="true" data-contrib-index="' + i + '">' +
        '<span class="drag-handle" title="드래그해서 순서 변경">↕</span>' +
        '<div class="contributors-admin-body">' +
          '<strong class="contributors-admin-name">' + GW.escapeHtml(c.name) + '</strong>' +
          (c.note ? '<span class="contributors-admin-note">' + GW.escapeHtml(c.note) + '</span>' : '') +
          (c.date ? '<span class="contributors-admin-date">' + GW.escapeHtml(c.date) + '</span>' : '') +
        '</div>' +
        '<button type="button" class="admin-inline-ghost" onclick="moveContributor(' + i + ', -1)"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="admin-inline-ghost" onclick="moveContributor(' + i + ', 1)"' + (i === _contributors.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button onclick="editContributor(' + i + ')" class="btn-edit">수정</button>' +
        '<button onclick="deleteContributor(' + i + ')" class="btn-delete">삭제</button>' +
      '</div>';
    }).join('');
    bindContributorDrag();
  }

  function bindContributorDrag() {
    var list = document.getElementById('contributors-admin-list');
    if (!list || list.dataset.dragBound === '1') return;
    list.dataset.dragBound = '1';

    list.addEventListener('dragstart', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.getAttribute('data-contrib-index'));
    });

    list.addEventListener('dragover', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      event.preventDefault();
      item.classList.add('drag-over');
    });

    list.addEventListener('dragleave', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      item.classList.remove('drag-over');
    });

    list.addEventListener('drop', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      event.preventDefault();
      item.classList.remove('drag-over');
      var fromIndex = parseInt(event.dataTransfer.getData('text/plain') || '-1', 10);
      var toIndex = parseInt(item.getAttribute('data-contrib-index') || '-1', 10);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      var moved = _contributors.splice(fromIndex, 1)[0];
      _contributors.splice(toIndex, 0, moved);
      renderContributorsAdmin();
      saveContributorOrder();
    });
  }

  function saveContributorOrder() {
    var updated = _contributors.slice();
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        GW.showToast('순서가 저장됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '저장 실패', 'error');
        loadContributorsAdmin();
      });
  }

  window.moveContributor = function (index, delta) {
    var nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= _contributors.length) return;
    var moved = _contributors.splice(index, 1)[0];
    _contributors.splice(nextIndex, 0, moved);
    renderContributorsAdmin();
    saveContributorOrder();
  };
  window.editContributor = function (index) {
    var c = _contributors[index]; if (!c) return;
    _editingContributorIdx = index;
    document.getElementById('contrib-name-input').value = c.name || '';
    document.getElementById('contrib-note-input').value = c.note || '';
    document.getElementById('contrib-date-input').value = c.date || '';
    document.getElementById('contrib-form-label').textContent = '수정 중';
    document.getElementById('contrib-submit-btn').textContent = '수정 완료';
    document.getElementById('contrib-cancel-btn').style.display = '';
    document.getElementById('contrib-name-input').focus();
  };

  window.cancelEditContributor = function () {
    _editingContributorIdx = null;
    document.getElementById('contrib-name-input').value = '';
    document.getElementById('contrib-note-input').value = '';
    document.getElementById('contrib-date-input').value = '';
    document.getElementById('contrib-form-label').textContent = '새 분 추가';
    document.getElementById('contrib-submit-btn').textContent = '추가';
    document.getElementById('contrib-cancel-btn').style.display = 'none';
  };

  window.submitContributor = function () {
    var nameEl = document.getElementById('contrib-name-input');
    var noteEl = document.getElementById('contrib-note-input');
    var dateEl = document.getElementById('contrib-date-input');
    var name = (nameEl.value || '').trim();
    var note = (noteEl.value || '').trim();
    var date = (dateEl.value || '').trim();
    if (!name) { GW.showToast('이름을 입력해주세요', 'error'); return; }
    var updated = _contributors.slice();
    var entry = { name: name, note: note, date: date };
    if (_editingContributorIdx !== null) {
      updated[_editingContributorIdx] = entry;
    } else {
      updated.push(entry);
    }
    var wasEditing = _editingContributorIdx !== null;
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        renderContributorsAdmin();
        cancelEditContributor();
        GW.showToast(wasEditing ? '수정됐습니다' : '추가됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  window.deleteContributor = function (index) {
    if (!confirm('삭제할까요?')) return;
    var updated = _contributors.slice();
    updated.splice(index, 1);
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        renderContributorsAdmin();
        GW.showToast('삭제됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '삭제 실패', 'error');
        loadContributorsAdmin();
      });
  };

  // ─── AI Disclaimer admin ──────────────────────────────────
  function loadAiDisclaimerAdmin() {
    fetch('/api/settings/ai-disclaimer')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var inp = document.getElementById('ai-disclaimer-input');
        if (inp) inp.value = data.text || '본 글은 AI의 도움을 받아 작성되었습니다.';
      })
      .catch(function () {});
  }

  window.saveAiDisclaimer = function () {
    var val = (document.getElementById('ai-disclaimer-input').value || '').trim();
    if (!val) { GW.showToast('문구를 입력해주세요', 'error'); return; }
    GW.apiFetch('/api/settings/ai-disclaimer', { method: 'PUT', body: JSON.stringify({ text: val }) })
      .then(function () { GW.showToast('AI 도움 문구가 저장됐습니다', 'success'); })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

})();
