/**
 * Gilwell Media · Admin Panel Logic
 * Depends on GW namespace from js/main.js.
 */
(function () {
  'use strict';

  var editingId       = null;
  var _adminEditor    = null;
  var _adminCoverImg  = null;
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
  var _analyticsViewMode = 'chart';
  var _analyticsPayload = null;
  var _adminGroup = 'overview';
  var _adminActiveTab = 'dashboard';
  var _adminRole = GW.getAdminRole ? GW.getAdminRole() : 'full';
  var _boardLayout = { gap_px: 6 };
  var _boardBannerInfo = {
    items: {
      korea: { event_name: '', event_date: '' },
      apr: { event_name: '', event_date: '' },
      wosm: { event_name: '', event_date: '' },
      people: { event_name: '', event_date: '' },
    },
  };

  // Hero search cache
  var _allPosts = [];
  var _heroSearchPage = 1;
  var _heroSearchHasMore = true;
  var _heroSearchLoading = false;
  var _heroSearchQuery = '';
  var _heroSearchResults = [];
  var _heroSearchBound = false;
  var _homeLeadPost = null;
  var _homeLeadMedia = defaultHomeLeadMedia();
  var _homeLeadSearchTimer = null;
  var _homeLeadSearchResults = [];

  function defaultHomeLeadMedia() {
    return {
      fit: 'cover',
      position_x: 50,
      position_y: 50,
      zoom: 100,
    };
  }

  function normalizeHomeLeadMedia(media) {
    var raw = media && typeof media === 'object' ? media : {};
    return {
      fit: raw.fit === 'contain' ? 'contain' : 'cover',
      position_x: clampHomeLeadValue(raw.position_x, 0, 100, 50),
      position_y: clampHomeLeadValue(raw.position_y, 0, 100, 50),
      zoom: clampHomeLeadValue(raw.zoom, 100, 150, 100),
    };
  }

  function clampHomeLeadValue(value, min, max, fallback) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function getHomeLeadPreviewStyle(media) {
    var config = normalizeHomeLeadMedia(media);
    return [
      'object-fit:' + config.fit,
      'object-position:' + config.position_x + '% ' + config.position_y + '%',
      'transform:scale(' + (config.zoom / 100).toFixed(2) + ')'
    ].join(';');
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
    return ['dashboard', 'analytics', 'settings', 'history'].indexOf(tab) >= 0;
  }

  function canAccessAdminGroup(group) {
    if (isFullAdmin()) return true;
    return ['overview', 'site'].indexOf(group) >= 0;
  }

  // ─── Boot ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (GW.getToken()) { showAdmin(); }
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
      showAdmin();
      setTimeout(function () { editPost(parseInt(editParam, 10)); }, 500);
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
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('pw-input').value = '';
  };

  function showAdmin() {
    _adminRole = GW.getAdminRole ? GW.getAdminRole() : 'full';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
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
      if (dateEl && !dateEl.value) dateEl.value = GW.getKstDateInputValue();
      updateCatPreview();
      updateEditorActionState();
    }
    showAdminTab('dashboard');
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
    settings: 'site',
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
    if (tab === 'history') loadVersionHistory();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  window.scrollAdminSection = function (id) {
    if (isLimitedAdmin() && id !== 'settings-hero') id = 'settings-hero';
    showAdminTab('settings');
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
    var siteBtn = document.getElementById('tab-btn-settings');
    if (siteBtn) {
      var desc = siteBtn.querySelector('.admin-sidebar-btn-desc');
      if (desc) desc.textContent = limited ? '히어로 기사 설정' : '태그, 메타, 푸터, 문구';
    }
    var contentGroup = document.querySelector('.admin-sidebar-group[data-admin-group="content"]');
    if (contentGroup) syncAdminSidebarGroupVisibility(contentGroup, !limited && _adminGroup === 'content');
    var siteGroup = document.querySelector('.admin-sidebar-group[data-admin-group="site"]');
    if (siteGroup) syncAdminSidebarGroupVisibility(siteGroup, _adminGroup === 'site');
    var overviewGroup = document.querySelector('.admin-sidebar-group[data-admin-group="overview"]');
    if (overviewGroup) syncAdminSidebarGroupVisibility(overviewGroup, _adminGroup === 'overview');
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
    var author   = (document.getElementById('art-author').value   || '').trim();
    var metaTags = (document.getElementById('art-metatags').value || '').trim();
    var youtubeUrl = (document.getElementById('art-youtube-url').value || '').trim();
    var imageCaption = (document.getElementById('art-image-caption').value || '').trim();
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
        content: content,
        image_url: _adminCoverImg || null,
        image_caption: imageCaption || null,
        youtube_url: youtubeUrl || null,
        tag: _adminSelTags.length ? _adminSelTags.join(',') : null,
        meta_tags: metaTags || null,
        author: author || undefined,
        ai_assisted: aiEl ? (aiEl.checked ? 1 : 0) : 0,
        publish_date: (dateEl && dateEl.value) ? dateEl.value : undefined,
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
        document.getElementById('art-author').value    = p.author || '';
        document.getElementById('art-metatags').value  = p.meta_tags || '';
        document.getElementById('art-youtube-url').value = p.youtube_url || '';
        document.getElementById('art-image-caption').value = p.image_caption || '';
        var aiChk = document.getElementById('art-ai-assisted');
        if (aiChk) aiChk.checked = !!p.ai_assisted;
        updateCatPreview();

        // Load cover image
        _adminCoverImg = p.image_url || null;
        renderAdminCoverPreview();

        // Load tag selector (multi-select)
        _adminSelTags = p.tag ? p.tag.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
        var sel = document.getElementById('admin-tag-selector');
        if (sel) _syncTagPills(sel);

        // Load publish date
        var dateEl = document.getElementById('art-date');
        if (dateEl && (p.publish_at || p.created_at)) {
          dateEl.value = (p.publish_at || p.created_at).slice(0, 10);
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

  // ─── Cancel edit ──────────────────────────────────────────
  window.cancelEdit = function () {
    editingId = null;
    if (history.replaceState) history.replaceState(null, '', '/admin.html');
    _adminCoverImg = null;
    _adminSelTags = [];
    document.getElementById('art-title').value    = '';
    document.getElementById('art-subtitle').value = '';
    document.getElementById('art-metatags').value = '';
    document.getElementById('art-youtube-url').value = '';
    document.getElementById('art-image-caption').value = '';
    var dateEl = document.getElementById('art-date');
    if (dateEl) dateEl.value = GW.getKstDateInputValue();
    var createdMetaEl = document.getElementById('art-created-at-meta');
    if (createdMetaEl) createdMetaEl.textContent = '생성 시각: 새 글 작성 시 자동 기록';
    var authorEl = document.getElementById('art-author');
    if (authorEl && authorEl.tagName === 'SELECT') authorEl.selectedIndex = 0;

    document.getElementById('art-category').value = 'korea';
    var aiChk = document.getElementById('art-ai-assisted');
    if (aiChk) aiChk.checked = false;
    renderAdminCoverPreview();
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
    var metaEl  = document.getElementById('art-metatags');
    var youtubeEl = document.getElementById('art-youtube-url');
    var authorEl = document.getElementById('art-author');
    var dateEl   = document.getElementById('art-date');
    var aiEl     = document.getElementById('art-ai-assisted');
    return {
      title: titleEl ? (titleEl.value || '') : '',
      subtitle: subEl ? (subEl.value || '') : '',
      meta_tags: metaEl ? (metaEl.value || '') : '',
      youtube_url: youtubeEl ? (youtubeEl.value || '') : '',
      image_caption: (document.getElementById('art-image-caption') || {}).value || '',
      author: authorEl ? (authorEl.value || '') : '',
      publish_date: dateEl ? (dateEl.value || '') : '',
      ai_assisted: aiEl ? !!aiEl.checked : false,
      tags: _adminSelTags.slice(),
      image_url: _adminCoverImg || null,
      category: (document.getElementById('art-category') || {}).value || 'korea',
    };
  }

  function _applyAdminDraft(draft) {
    if (!draft) return;
    document.getElementById('art-category').value = draft.category || 'korea';
    document.getElementById('art-title').value = draft.title || '';
    document.getElementById('art-subtitle').value = draft.subtitle || '';
    document.getElementById('art-metatags').value = draft.meta_tags || '';
    document.getElementById('art-youtube-url').value = draft.youtube_url || '';
    document.getElementById('art-image-caption').value = draft.image_caption || '';
    document.getElementById('art-author').value = draft.author || 'Editor A';
    document.getElementById('art-date').value = draft.publish_date || GW.getKstDateInputValue();
    document.getElementById('art-ai-assisted').checked = !!draft.ai_assisted;
    _adminSelTags = Array.isArray(draft.tags) ? draft.tags.slice() : [];
    _adminCoverImg = draft.image_url || null;
    updateCatPreview();
    renderAdminCoverPreview();
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

  function _resetAdminWriteTurnstile() {
    _adminTurnstileToken = '';
    if (window.turnstile && _adminTurnstileWidgetId != null) {
      window.turnstile.reset(_adminTurnstileWidgetId);
    }
  }

  // ─── Admin list loading (paginated) ──────────────────────
  function loadAdminList() {
    var reorderMode = _canReorderCurrentList();
    var url = '/api/posts?page=' + _listPage + '&limit=' + _PAGE_SIZE;
    if (_listCat !== 'all') url += '&category=' + _listCat;
    if (_listSearch) url += '&q=' + encodeURIComponent(_listSearch);

    GW.apiFetch(url)
      .then(function (data) {
        _listTotal = data.total;
        _allPosts  = _allPosts.concat(data.posts || []); // for hero search — rebuild separately
        renderAdminList(data.posts || []);
        renderPagination(reorderMode);
        renderReorderControls(reorderMode);
        updateStats(data.posts || []);
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
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var isUnpublished = p.published === 0;
      var hasSortOrder = p.sort_order !== null && p.sort_order !== undefined;
      return (
        '<article class="article-item' + (isUnpublished ? ' is-unpublished' : '') + '" draggable="' + (reorderMode ? 'true' : 'false') + '" data-id="' + p.id + '">' +
          (reorderMode ? '<div class="drag-handle" title="드래그로 순서 변경">☰</div>' : '') +
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
        _reorderDirty = true;
        var btn = document.getElementById('reorder-save-btn');
        if (btn) btn.style.display = '';
      });
    });
  }

  window.saveReorder = function () {
    if (!_canReorderCurrentList()) {
      GW.showToast('정렬은 전체 목록에서만 저장할 수 있습니다', 'error');
      return;
    }
    var list = document.getElementById('article-list');
    var ids = [];
    list.querySelectorAll('.article-item[data-id]').forEach(function (el) {
      ids.push(parseInt(el.getAttribute('data-id'), 10));
    });
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
    return false;
  }

  function renderReorderControls(reorderMode) {
    var saveBtn = document.getElementById('reorder-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    var hintId = 'reorder-mode-hint';
    var count = document.getElementById('article-count');
    if (!count) return;
    var hint = document.getElementById(hintId);
    if (hint) {
      hint.remove();
    }
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
      _heroPosts = data.posts || [];
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
            '<div class="admin-home-lead-preview-frame">' +
              '<img id="home-lead-media-preview" src="' + GW.escapeHtml(_homeLeadPost.image_url) + '" alt="' + GW.escapeHtml(_homeLeadPost.title || '메인 스토리 미리보기') + '" style="' + getHomeLeadPreviewStyle(_homeLeadMedia) + '">' +
            '</div>' +
          '</div>'
        ) : '') +
        '<div class="admin-home-lead-controls">' +
          '<div class="admin-home-lead-control">' +
            '<label for="home-lead-fit">이미지 맞춤</label>' +
            '<select id="home-lead-fit">' +
              '<option value="cover"' + (_homeLeadMedia.fit === 'cover' ? ' selected' : '') + '>꽉 채우기</option>' +
              '<option value="contain"' + (_homeLeadMedia.fit === 'contain' ? ' selected' : '') + '>원본 비율</option>' +
            '</select>' +
          '</div>' +
          '<div class="admin-home-lead-control">' +
            '<strong>좌우 위치</strong>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="home-lead-position-x" min="0" max="100" step="1" value="' + _homeLeadMedia.position_x + '">' +
              '<span id="home-lead-position-x-value">' + _homeLeadMedia.position_x + '%</span>' +
            '</div>' +
          '</div>' +
          '<div class="admin-home-lead-control">' +
            '<strong>상하 위치</strong>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="home-lead-position-y" min="0" max="100" step="1" value="' + _homeLeadMedia.position_y + '">' +
              '<span id="home-lead-position-y-value">' + _homeLeadMedia.position_y + '%</span>' +
            '</div>' +
          '</div>' +
          '<div class="admin-home-lead-control">' +
            '<strong>이미지 확대</strong>' +
            '<div class="admin-home-lead-range">' +
              '<input type="range" id="home-lead-zoom" min="100" max="150" step="1" value="' + _homeLeadMedia.zoom + '">' +
              '<span id="home-lead-zoom-value">' + _homeLeadMedia.zoom + '%</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="admin-home-lead-actions">' +
          '<button type="button" class="submit-btn" style="width:auto;margin:0;" onclick="saveHomeLeadMedia()">이미지 위치 저장</button>' +
          '<button type="button" class="cancel-btn visible" style="margin:0;" onclick="clearHomeLeadPost()">해제</button>' +
          '<a href="/post/' + _homeLeadPost.id + '" class="cancel-btn visible" style="margin:0;text-decoration:none;display:inline-flex;align-items:center;">기사 보기</a>' +
        '</div>' +
      '</div>';
    bindHomeLeadMediaControls();
  }

  function bindHomeLeadMediaControls() {
    var fit = document.getElementById('home-lead-fit');
    var posX = document.getElementById('home-lead-position-x');
    var posY = document.getElementById('home-lead-position-y');
    var zoom = document.getElementById('home-lead-zoom');
    var preview = document.getElementById('home-lead-media-preview');
    if (!fit || !posX || !posY || !zoom) return;

    function applyPreview() {
      _homeLeadMedia = normalizeHomeLeadMedia({
        fit: fit.value,
        position_x: posX.value,
        position_y: posY.value,
        zoom: zoom.value,
      });
      var posXLabel = document.getElementById('home-lead-position-x-value');
      var posYLabel = document.getElementById('home-lead-position-y-value');
      var zoomLabel = document.getElementById('home-lead-zoom-value');
      if (posXLabel) posXLabel.textContent = _homeLeadMedia.position_x + '%';
      if (posYLabel) posYLabel.textContent = _homeLeadMedia.position_y + '%';
      if (zoomLabel) zoomLabel.textContent = _homeLeadMedia.zoom + '%';
      if (preview) preview.style.cssText = getHomeLeadPreviewStyle(_homeLeadMedia);
    }

    [fit, posX, posY, zoom].forEach(function (node) {
      node.addEventListener('input', applyPreview);
      node.addEventListener('change', applyPreview);
    });
    applyPreview();
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
      return '<div class="hero-slot-item" draggable="true" data-hero-index="' + i + '">' +
        '<span class="drag-handle" title="드래그해서 순서 변경">↕</span>' +
        '<span class="hero-slot-index">' + (i+1) + '</span>' +
        '<span class="admin-status-pill admin-status-pill-category" style="--pill-color:' + cat.color + ';">'+cat.label+'</span>' +
        '<span class="hero-slot-title">' + GW.escapeHtml(p.title) + '</span>' +
        '<button onclick="removeHeroSlot(' + i + ')" class="admin-inline-danger">제거</button>' +
      '</div>';
    }).join('');
    bindHeroDrag();
  }

  function bindHeroDrag() {
    var list = document.getElementById('hero-slots');
    if (!list || list.dataset.dragBound === '1') return;
    list.dataset.dragBound = '1';

    list.addEventListener('dragstart', function (event) {
      var item = event.target.closest('.hero-slot-item');
      if (!item) return;
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
      body: JSON.stringify({ post_ids: _heroPostIds, interval_ms: _heroIntervalMs, if_revision: _heroRevision }),
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
    renderAnalyticsList('analytics-paths', payload.top_paths, function (item) {
      var pageInfo = getAnalyticsPageInfo(item);
      return {
        title: pageInfo.title,
        meta: rangeLabel + ' · 방문 ' + formatMetricCompact(item.visits || 0) + ' · 조회 ' + formatMetricCompact(item.pageviews || 0),
      };
    }, '아직 방문 페이지 데이터가 없습니다');
    renderAnalyticsVisitorsChart(payload.visitors && payload.visitors.series ? payload.visitors.series : [], payload.range || fallback.range);
    renderAnalyticsViewsChart(payload.views && payload.views.series ? payload.views.series : [], payload.range || fallback.range);
    renderAnalyticsVisitorsTable(payload.visitors && payload.visitors.series ? payload.visitors.series : [], payload.range || fallback.range);
    renderAnalyticsViewsTable(payload.views && payload.views.series ? payload.views.series : [], payload.range || fallback.range);
    renderAnalyticsTopPages(payload.views && payload.views.top_paths ? payload.views.top_paths : payload.top_paths);
    _syncAnalyticsViewMode();
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
    ], '방문 데이터가 없습니다', range);
  }

  function renderAnalyticsViewsChart(rows, range) {
    renderAnalyticsChart('analytics-views-chart', rows, [
      { key: 'views', label: '조회수', className: 'analytics-bar-fill-views' },
    ], '조회수 데이터가 없습니다', range);
  }

  function renderAnalyticsChart(id, rows, seriesDefs, emptyText, range) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="list-empty">' + GW.escapeHtml(emptyText) + '</div>';
      return;
    }
    var max = 0;
    rows.forEach(function (row) {
      seriesDefs.forEach(function (series) {
        max = Math.max(max, Number(row[series.key] || 0));
      });
    });
    max = max || 1;
    var legend = '<div class="analytics-chart-legend">' + seriesDefs.map(function (series) {
      return '<span><i class="analytics-legend-swatch ' + series.className + '"></i>' + GW.escapeHtml(series.label) + '</span>';
    }).join('') + '</div>';
    var items = rows.map(function (row) {
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
      el.innerHTML = '<div class="list-empty">기간 내 페이지 데이터가 없습니다</div>';
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
    el.innerHTML = '<div class="analytics-table-scroll"><table class="analytics-table"><thead><tr><th>#</th><th>페이지</th><th>방문수</th><th>조회수</th></tr></thead><tbody>' + body + '</tbody></table></div>';
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
            '<div><span class="glossary-admin-cell-label">분류</span><strong>' + GW.escapeHtml(item.bucket) + '</strong></div>' +
            '<div><span class="glossary-admin-cell-label">한국어</span>' + GW.escapeHtml(item.term_ko || '-') + '</div>' +
            '<div><span class="glossary-admin-cell-label">영어</span>' + GW.escapeHtml(item.term_en || '-') + '</div>' +
            '<div><span class="glossary-admin-cell-label">프랑스어</span>' + GW.escapeHtml(item.term_fr || '-') + '</div>' +
            '<div class="glossary-admin-description"><span class="glossary-admin-cell-label">설명</span>' + GW.escapeHtml(item.description_ko || '-') + '</div>' +
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
