/**
 * Gilwell Media · Admin Console V3
 * Version: 03.052.15
 *
 * Versioning:
 *   V3.aaa.bb
 *   aaa = feature additions
 *   bb  = hotfix / bugfix only
 *   V3  = product stage (modified only by owner)
 *
 * Depends on GW namespace from js/main.js
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  var V3 = window.V3 = {};

  var _panel         = 'dashboard';
  var _settingsSection = 'hero';

  // Post list
  var _listPage      = 1;
  var _listPageSize  = 20;
  var _listTotal     = 0;
  var _listSearch    = '';
  var _listSearchTimer = null;
  var _listCat       = 'all';
  var _listPub       = 'all';
  var _listSort      = 'latest';

  // Write / edit
  var _editingId     = null;
  var _editor        = null;
  var _coverDataUrl  = null;
  var _galleryImages = [];
  var _metaTags      = [];
  var _relatedPosts  = [];
  var _relatedTimer  = null;
  var _draftTimer    = null;

  // Settings
  var _heroPostIds   = [];
  var _heroInterval  = 3000;
  var _tagSettings      = {};
  var _selectedWriteTags = [];
  var _tagInlineEdit    = null;
  var _siteMeta      = {};
  var _boardCopy     = {};
  var _boardCopyRevision = 0;
  var _contributors  = [];
  var _editors       = [];
  var _translations  = {};
  var _homeLeadPost  = null;
  var _homeLeadMedia = null;
  var _picksPosts    = [];
  var _picksSearchTimer = null;
  var _wosmMembers   = [];
  var _wosmColumns   = [];
  var _wosmRegisteredCount = 176;
  var _wosmMembersRevision = 0;
  var _wosmMembersSearch = '';
  var _wosmImportSavedMapping = {
    country_ko: '',
    country_en: 'Country Name option 1 E',
  };
  var _wosmImportFileName = '';
  var _wosmImportSheets = [];
  var _wosmImportSheetIndex = 0;
  var _wosmImportMapping = null;
  var _boardBanner   = {};
  var _ticker        = '';
  var _calendarTags  = [];
  var _calModalTags  = [];
  var _calModalTargetGroups = [];
  var _calModalRelatedPosts = [];
  var _calRelatedTimer = null;

  // Calendar
  var _calItems      = [];
  var _calCats       = [];
  var CAL_CATEGORY_OPTIONS = ['KOR', 'APR', 'EUR', 'AFR', 'ARB', 'IAR', 'WOSM'];
  var CAL_KOR_TARGET_GROUPS = ['비버', '컵', '스카우트', '벤처', '로버', '지도자', '범스카우트', '훈련교수회'];
  var _simpleRowsSeq = 0;

  // Glossary
  var _glosItems     = [];
  var _glosSearch    = '';
  var _glosSearchTimer = null;

  // Confirm
  var _confirmResolve = null;

  function _apiFetch(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    opts.headers = headers;
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (e) { data = { error: text }; }
        }
        if (!response.ok) {
          var message = (data && (data.error || data.message)) || 'API 오류가 발생했습니다';
          var err = new Error(message);
          err.status = response.status;
          err.data = data;
          if (response.status === 401) {
            if (GW.clearToken) GW.clearToken();
            document.dispatchEvent(new CustomEvent('gw:admin-auth-required', {
              detail: { message: message, status: response.status }
            }));
          }
          throw err;
        }
        return data;
      });
    });
  }

  function _pulseButton(btn) {
    if (!btn || btn.disabled) return;
    btn.classList.remove('is-pressed');
    void btn.offsetWidth;
    btn.classList.add('is-pressed');
    window.setTimeout(function () { btn.classList.remove('is-pressed'); }, 140);
  }

  function _setButtonBusy(btn, busyText) {
    if (!btn) return;
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent.trim();
    btn.disabled = true;
    btn.classList.remove('is-done');
    btn.classList.add('is-busy');
    if (busyText) btn.textContent = busyText;
  }

  function _clearButtonBusy(btn, doneText) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.textContent = btn.dataset.defaultLabel || btn.textContent;
    if (doneText) {
      btn.textContent = doneText;
      btn.classList.add('is-done');
      window.setTimeout(function () {
        btn.classList.remove('is-done');
        btn.textContent = btn.dataset.defaultLabel || btn.textContent;
      }, 900);
      return;
    }
    btn.classList.remove('is-done');
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    if (window.GW && typeof GW.setupScrollTopButton === 'function') GW.setupScrollTopButton();
    document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('.v3-btn, .mkt-apply-btn, .v3-login-btn') : null;
      if (btn) _pulseButton(btn);
    });

    var token = GW.getToken && GW.getToken();
    if (token) {
      _verifySession().then(function (ok) {
        if (ok) _showApp();
        else _showLogin();
      });
    } else {
      _showLogin();
    }

    // Login
    document.getElementById('v3-login-btn').addEventListener('click', _doLogin);
    document.getElementById('v3-pw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _doLogin();
    });

    // Logout
    document.getElementById('v3-logout-btn').addEventListener('click', _doLogout);

    // Sidebar nav
    document.querySelectorAll('#v3-nav .v3-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = btn.dataset.panel;
        var section = btn.dataset.settingsSection;
        V3.showPanel(panel, section);
      });
    });

    // Settings nav
    document.querySelectorAll('.v3-settings-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _showSettingsSection(btn.dataset.section);
      });
    });

    // Dashboard refresh
    document.getElementById('dash-refresh-btn').addEventListener('click', function () {
      _loadDashboard(document.getElementById('dash-refresh-btn'));
    });

    // Post list filters
    document.getElementById('list-search').addEventListener('input', function () {
      clearTimeout(_listSearchTimer);
      _listSearchTimer = setTimeout(function () {
        _listSearch = document.getElementById('list-search').value.trim();
        _listPage = 1;
        _loadList();
      }, 350);
    });
    document.getElementById('list-cat').addEventListener('change', function () {
      _listCat = this.value; _listPage = 1; _loadList();
    });
    document.getElementById('list-pub').addEventListener('change', function () {
      _listPub = this.value; _listPage = 1; _loadList();
    });
    document.getElementById('list-sort').addEventListener('change', function () {
      _listSort = this.value; _listPage = 1; _loadList();
    });

    // Write form
    document.getElementById('write-cancel-btn').addEventListener('click', function () {
      V3.showPanel('list');
    });
    document.getElementById('write-draft-btn').addEventListener('click', function () {
      _savePost(false);
    });
    document.getElementById('write-publish-btn').addEventListener('click', function () {
      _savePost(true);
    });
    document.getElementById('w-cover-btn').addEventListener('click', _pickCover);
    document.getElementById('w-gallery-btn').addEventListener('click', _pickGallery);

    // Meta tags
    document.getElementById('w-metatag-add-btn').addEventListener('click', _addMetaTag);
    document.getElementById('w-metatag-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _addMetaTag(); }
    });

    // Location map preview (OpenStreetMap via Nominatim)
    document.getElementById('w-location-check-btn').addEventListener('click', function () {
      _checkWriteLocation();
    });
    document.getElementById('w-location-addr').addEventListener('input', function () {
      // Hide preview when address changes after validation
      var prev = document.getElementById('w-location-map-preview');
      if (prev) prev.style.display = 'none';
    });

    // Related posts search
    document.getElementById('w-related-search').addEventListener('input', function () {
      clearTimeout(_relatedTimer);
      var q = this.value.trim();
      if (!q) { document.getElementById('w-related-results').style.display = 'none'; return; }
      _relatedTimer = setTimeout(function () { _searchRelated(q); }, 300);
    });

    // Calendar
    document.getElementById('cal-new-btn').addEventListener('click', function () { _openCalModal(null); });
    document.getElementById('cal-modal-close').addEventListener('click', _closeCalModal);
    document.getElementById('cal-modal-cancel').addEventListener('click', _closeCalModal);
    document.getElementById('cal-save-btn').addEventListener('click', _saveCal);
    document.getElementById('cal-tags-add-btn').addEventListener('click', _addCalTag);
    document.getElementById('cal-tags-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _addCalTag(); }
    });
    document.getElementById('cal-start-time-enabled').addEventListener('change', function () {
      document.getElementById('cal-start-time').disabled = !this.checked;
      if (!this.checked) document.getElementById('cal-start-time').value = '';
    });
    document.getElementById('cal-end-time-enabled').addEventListener('change', function () {
      document.getElementById('cal-end-time').disabled = !this.checked;
      if (!this.checked) document.getElementById('cal-end-time').value = '';
    });
    document.getElementById('cal-cat').addEventListener('change', _syncCalCategoryUi);
    document.getElementById('cal-related-query').addEventListener('input', function () {
      clearTimeout(_calRelatedTimer);
      var q = this.value.trim();
      if (!q) {
        document.getElementById('cal-related-results').innerHTML = '';
        return;
      }
      _calRelatedTimer = setTimeout(function () { _searchCalRelated(q); }, 250);
    });
    document.getElementById('cal-geo-search-btn').addEventListener('click', _searchCalGeo);
    document.getElementById('cal-delete-btn').addEventListener('click', function () {
      var id = document.getElementById('cal-id').value;
      if (id) _deleteCal(parseInt(id, 10));
    });

    // Glossary
    document.getElementById('glos-new-btn').addEventListener('click', function () { _openGlosModal(null); });
    document.getElementById('glos-modal-close').addEventListener('click', _closeGlosModal);
    document.getElementById('glos-modal-cancel').addEventListener('click', _closeGlosModal);
    document.getElementById('glos-save-btn').addEventListener('click', _saveGlos);
    document.getElementById('glos-delete-btn').addEventListener('click', function () {
      var id = document.getElementById('glos-id').value;
      if (id) _deleteGlos(parseInt(id, 10));
    });
    document.getElementById('glos-search').addEventListener('input', function () {
      clearTimeout(_glosSearchTimer);
      var q = this.value;
      _glosSearchTimer = setTimeout(function () { _glosSearch = q; _renderGlos(); }, 250);
    });

    // Settings saves
    document.getElementById('hero-save-btn').addEventListener('click', _saveHero);
    document.getElementById('tags-save-btn').addEventListener('click', _saveTags);
    document.getElementById('meta-save-btn').addEventListener('click', _saveMeta);
    document.getElementById('board-copy-save-btn').addEventListener('click', _saveBoardCopy);
    document.getElementById('author-save-btn').addEventListener('click', _saveAuthor);
    document.getElementById('banner-save-btn').addEventListener('click', _saveBanner);
    document.getElementById('ticker-save-btn').addEventListener('click', _saveTicker);
    document.getElementById('contrib-save-btn').addEventListener('click', _saveContributors);
    document.getElementById('contrib-add-btn').addEventListener('click', _addContributorRow);
    document.getElementById('editors-save-btn').addEventListener('click', _saveEditors);
    document.getElementById('editors-add-btn').addEventListener('click', _addEditorRow);
    document.getElementById('trans-save-btn').addEventListener('click', _saveTranslations);
    document.getElementById('home-lead-save-btn').addEventListener('click', _saveHomeLead);
    document.getElementById('home-lead-clear-btn').addEventListener('click', _clearHomeLeadSelection);
    document.getElementById('picks-refresh-btn').addEventListener('click', _loadPicksUI);
    document.getElementById('wosm-members-import-btn').addEventListener('click', function () {
      var input = document.getElementById('wosm-members-file');
      if (input) input.click();
    });
    document.getElementById('wosm-members-import-btn-inline').addEventListener('click', function () {
      var input = document.getElementById('wosm-members-file');
      if (input) input.click();
    });
    document.getElementById('wosm-members-file').addEventListener('change', _handleWosmMembersImport);
    document.getElementById('wosm-members-add-btn').addEventListener('click', _addWosmMemberRow);
    document.getElementById('wosm-members-add-btn-inline').addEventListener('click', _addWosmMemberRow);
    document.getElementById('wosm-column-add-btn').addEventListener('click', _addWosmColumnRow);
    document.getElementById('wosm-columns-save-btn').addEventListener('click', _saveWosmMembers);
    document.getElementById('wosm-members-save-btn').addEventListener('click', _saveWosmMembers);
    document.getElementById('wosm-import-close').addEventListener('click', _closeWosmImportModal);
    document.getElementById('wosm-import-cancel').addEventListener('click', _closeWosmImportModal);
    document.getElementById('wosm-import-apply').addEventListener('click', _applyWosmImportMapping);
    document.getElementById('wosm-import-modal').addEventListener('click', function (event) {
      if (event.target && event.target.id === 'wosm-import-modal') _closeWosmImportModal();
    });
    document.getElementById('wosm-import-sheet').addEventListener('change', function () {
      _wosmImportSheetIndex = Math.max(0, parseInt(this.value, 10) || 0);
      _syncWosmImportMappingDefaults();
      _renderWosmImportModal();
    });
    document.getElementById('wosm-members-search').addEventListener('input', function () {
      _wosmMembersSearch = String(this.value || '').trim().toLowerCase();
      _renderWosmMembersEditor();
    });

    // Hero search
    document.getElementById('hero-search').addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { document.getElementById('hero-search-results').style.display = 'none'; return; }
      _searchHero(q);
    });
    document.getElementById('home-lead-search').addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { document.getElementById('home-lead-search-results').style.display = 'none'; return; }
      _searchHomeLead(q);
    });
    ['home-lead-fit', 'home-lead-desktop-x', 'home-lead-desktop-y', 'home-lead-desktop-zoom', 'home-lead-mobile-x', 'home-lead-mobile-y', 'home-lead-mobile-zoom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', _handleHomeLeadControlChange);
    });
    document.getElementById('picks-search').addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(_picksSearchTimer);
      if (!q) {
        document.getElementById('picks-search-results').style.display = 'none';
        return;
      }
      _picksSearchTimer = setTimeout(function () { _searchPicks(q); }, 220);
    });

    // Analytics period
    document.getElementById('analytics-period').addEventListener('change', _loadAnalytics);

    // Marketing period presets + date range
    (function () {
      var today = _kstToday();
      var fromEl = document.getElementById('mkt-date-from');
      var toEl   = document.getElementById('mkt-date-to');
      if (!fromEl || !toEl) return;
      toEl.value   = today;
      toEl.max     = today;
      fromEl.value = _shiftDate(today, -6);
      fromEl.max   = today;
      document.querySelectorAll('.mkt-preset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.mkt-preset-btn').forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          var days = parseInt(btn.dataset.days, 10) || 7;
          var end   = _kstToday();
          var start = _shiftDate(end, -(days - 1));
          toEl.value   = end;
          fromEl.value = start;
          _loadMarketing(btn);
        });
      });
      document.getElementById('mkt-apply-btn').addEventListener('click', function () {
        document.querySelectorAll('.mkt-preset-btn').forEach(function (b) { b.classList.remove('is-active'); });
        _loadMarketing(document.getElementById('mkt-apply-btn'));
      });
      [fromEl, toEl].forEach(function (input) {
        input.addEventListener('change', function () {
          document.querySelectorAll('.mkt-preset-btn').forEach(function (b) { b.classList.remove('is-active'); });
        });
      });
    }());

    // Confirm dialog
    document.getElementById('confirm-cancel-btn').addEventListener('click', function () {
      _closeConfirm(false);
    });
    document.getElementById('confirm-ok-btn').addEventListener('click', function () {
      _closeConfirm(true);
    });
    document.getElementById('v3-more-modal-close').addEventListener('click', V3.closeMoreRowsModal);
    document.getElementById('v3-more-modal-done').addEventListener('click', V3.closeMoreRowsModal);
    document.getElementById('v3-more-modal').addEventListener('click', function (event) {
      if (event.target === this) V3.closeMoreRowsModal();
    });

    // Ticker preview
    document.getElementById('s-ticker').addEventListener('input', function () {
      _renderTickerPreview(this.value);
    });

    document.addEventListener('gw:admin-auth-required', function (event) {
      var detail = event && event.detail ? event.detail : {};
      GW.showToast((detail.message || '관리자 세션이 만료되었습니다. 다시 로그인해주세요.'), 'error');
      _showLogin();
    });
  });

  /* ══════════════════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════════════════ */
  function _verifySession() {
    return _apiFetch('/api/admin/session')
      .then(function (d) { return d && d.authenticated === true; })
      .catch(function () { return false; });
  }

  function _doLogin() {
    var pw  = document.getElementById('v3-pw').value.trim();
    var err = document.getElementById('v3-login-err');
    var btn = document.getElementById('v3-login-btn');
    if (!pw) return;

    var cfInput = document.querySelector('#v3-login-turnstile input[name="cf-turnstile-response"]');
    var cfToken = cfInput ? cfInput.value : '';
    if (GW.TURNSTILE_SITE_KEY && !cfToken) {
      err.textContent = 'CAPTCHA를 완료해주세요'; err.style.display = 'block'; return;
    }

    _setButtonBusy(btn, '로그인 중…'); err.style.display = 'none';
    _apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw, cf_turnstile_response: cfToken }),
    }).then(function (data) {
      GW.setToken(data.token);
      if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
      _showApp();
    }).catch(function (e) {
      err.textContent = e.message || '비밀번호가 올바르지 않습니다';
      err.style.display = 'block';
      document.getElementById('v3-pw').value = '';
      document.getElementById('v3-pw').focus();
      if (window.turnstile) window.turnstile.reset();
    }).finally(function () {
      _clearButtonBusy(btn);
    });
  }

  function _doLogout() {
    GW.clearToken();
    document.getElementById('v3-app').hidden = true;
    document.getElementById('v3-login').style.display = 'flex';
    document.getElementById('v3-pw').value = '';
  }

  function _showLogin() {
    document.getElementById('v3-login').style.display = 'flex';
    document.getElementById('v3-app').hidden = true;
    if (GW.TURNSTILE_SITE_KEY && GW.loadTurnstile) {
      GW.loadTurnstile(function () {
        if (window.turnstile) {
          window.turnstile.render('#v3-login-turnstile', { sitekey: GW.TURNSTILE_SITE_KEY });
        }
      });
    }
  }

  function _showApp() {
    document.getElementById('v3-login').style.display = 'none';
    document.getElementById('v3-app').hidden = false;
    // Fill site version from GW.APP_VERSION
    var siteVer = (GW && GW.APP_VERSION) ? 'V' + GW.APP_VERSION : '—';
    document.querySelectorAll('.v3-ver-site').forEach(function (el) { el.textContent = siteVer; });
    // Load editor.js
    _loadEditorJS(function () { _initEditor(); });
    // Load tag settings (for write form dropdown)
    _loadTagSettings();
    // Set up release scope tabs
    _setupReleaseTabs();
    // Show dashboard
    V3.showPanel('dashboard');
  }

  /* ══════════════════════════════════════════════════════════
     PANEL NAVIGATION
  ══════════════════════════════════════════════════════════ */
  var PANEL_LABELS = {
    dashboard: '대시보드',
    list:      '게시글 목록',
    write:     '새 글 작성',
    calendar:  '캘린더',
    glossary:  '용어집',
    analytics: '분석',
    marketing: '마케팅',
    settings:  '사이트 설정',
    releases:  '버전기록',
  };

  V3.showPanel = function (panel, settingsSection) {
    _panel = panel;

    // Update panels
    document.querySelectorAll('.v3-panel').forEach(function (el) { el.classList.remove('active'); });
    var target = document.getElementById('panel-' + panel);
    if (target) target.classList.add('active');

    // Update sidebar
    document.querySelectorAll('#v3-nav .v3-nav-item').forEach(function (btn) {
      var match = btn.dataset.panel === panel;
      if (panel === 'settings' && settingsSection) {
        match = match && btn.dataset.settingsSection === settingsSection;
      }
      btn.classList.toggle('active', match);
    });

    // Update breadcrumb
    var label = PANEL_LABELS[panel] || panel;
    if (panel === 'settings' && settingsSection) {
      document.getElementById('v3-panel-title').textContent = '사이트 설정 · ' + _sectionLabel(settingsSection);
    } else {
      document.getElementById('v3-panel-title').textContent = label;
    }

    // Load panel data
    if (panel === 'dashboard') _loadDashboard();
    else if (panel === 'list')     _loadList();
    else if (panel === 'write' && !_editingId) _resetWrite();
    else if (panel === 'calendar') _loadCalendar();
    else if (panel === 'glossary') _loadGlossary();
    else if (panel === 'analytics') _loadAnalytics();
    else if (panel === 'marketing') _loadMarketing();
    else if (panel === 'releases') _loadReleases();
    else if (panel === 'settings') {
      var sec = settingsSection || _settingsSection;
      _showSettingsSection(sec);
    }
  };

  function _sectionLabel(s) {
    var labels = {
      hero: '히어로 기사', 'home-lead': '메인 스토리', picks: '에디터 추천', tags: '태그 / 글머리', meta: '메타태그 / SEO', 'board-copy': '게시판 설명',
      author: '저자 / 고지', banner: '게시판 배너', ticker: '티커',
      contributors: '기고자', editors: '편집자 / 접근', translations: 'UI 번역', 'wosm-members': '세계연맹 회원국',
    };
    return labels[s] || s;
  }

  function _showSettingsSection(section) {
    _settingsSection = section;
    document.querySelectorAll('.v3-settings-nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    document.querySelectorAll('.v3-settings-section').forEach(function (el) {
      el.classList.toggle('active', el.id === 'settings-' + section);
    });
    // Load section data
    if (section === 'hero')         _loadHero();
    else if (section === 'home-lead') _loadHomeLeadUI();
    else if (section === 'picks')   _loadPicksUI();
    else if (section === 'tags')    _loadTagSettingsUI();
    else if (section === 'meta')    _loadMetaUI();
    else if (section === 'board-copy') _loadBoardCopy();
    else if (section === 'author')  _loadAuthorUI();
    else if (section === 'banner')  _loadBannerUI();
    else if (section === 'ticker')  _loadTickerUI();
    else if (section === 'contributors') _loadContributorsUI();
    else if (section === 'editors') _loadEditorsUI();
    else if (section === 'translations') _loadTranslationsUI();
    else if (section === 'wosm-members') _loadWosmMembersUI();
  }

  /* ══════════════════════════════════════════════════════════
     EDITOR.JS
  ══════════════════════════════════════════════════════════ */
  function _loadEditorJS(cb) {
    if (window.EditorJS) { cb(); return; }
    function loadScript(src, done) {
      var s = document.createElement('script'); s.src = src; s.onload = done; document.head.appendChild(s);
    }
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
      var pending = 3;
      function dec() { if (--pending === 0) cb(); }
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', dec);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js', dec);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js', dec);
    });
  }

  function _initEditor() {
    if (_editor) return;
    _editor = new window.EditorJS({
      holder: 'v3-editorjs',
      placeholder: '내용을 작성하세요…',
      tools: {
        paragraph: { inlineToolbar: true, config: { preserveBlank: true } },
        header: { class: window.Header, config: { levels: [2, 3, 4], defaultLevel: 2 } },
        list:   { class: window.List,   inlineToolbar: true },
        quote:  { class: window.Quote,  inlineToolbar: true },
      },
    });
  }

  function _editorSetData(data) {
    if (!_editor) return Promise.resolve();
    return _editor.isReady.then(function () {
      if (data && data.blocks) return _editor.render(data);
      // Try parse as JSON
      if (typeof data === 'string' && data.trim().charAt(0) === '{') {
        try { return _editor.render(JSON.parse(data)); } catch (e) { /* ignore */ }
      }
      // Plain text
      return _editor.render({ blocks: [{ type: 'paragraph', data: { text: data || '' } }] });
    });
  }

  function _editorGetData() {
    if (!_editor) return Promise.resolve('');
    return _editor.isReady.then(function () {
      return _editor.save().then(function (d) { return JSON.stringify(d); });
    });
  }

  function _editorClear() {
    if (!_editor) return;
    _editor.isReady.then(function () { _editor.clear(); });
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════════════════ */
  function _loadDashboard(actionBtn) {
    var recentEl = document.getElementById('dash-recent-list');
    var topEl = document.getElementById('dash-top-list');
    var editorialEl = document.getElementById('dash-ops-editorial');
    var alertsEl = document.getElementById('dash-ops-alerts');
    var settingsEl = document.getElementById('dash-ops-settings');
    var deploymentsEl = document.getElementById('dash-ops-deployments');
    if (actionBtn) _setButtonBusy(actionBtn, '새로고침 중…');
    _setText('dash-stat-visits', '—');
    _setText('dash-stat-views', '—');
    _setText('dash-stat-posts', '—');
    _setText('dash-stat-pub', '—');
    _setText('dash-stat-visits-sub', '불러오는 중');
    _setText('dash-stat-posts-sub', '불러오는 중');

    Promise.allSettled([
      _apiFetch('/api/admin/analytics'),
      _apiFetch('/api/admin/operations'),
      _apiFetch('/api/posts?limit=8&published=all'),
      _apiFetch('/api/posts/popular?limit=5'),
      _apiFetch('/api/posts?limit=1&published=1'),
    ]).then(function (results) {
      var analytics = results[0].status === 'fulfilled' ? (results[0].value || {}) : {};
      var operations = results[1].status === 'fulfilled' ? (results[1].value || {}) : {};
      var recentRes = results[2].status === 'fulfilled' ? (results[2].value || {}) : { posts: [] };
      var popularRes = results[3].status === 'fulfilled' ? (results[3].value || {}) : { posts: [] };
      var published = results[4].status === 'fulfilled' ? (results[4].value || {}) : { total: 0 };
      var recent    = recentRes.posts || [];
      var popular   = popularRes.posts || [];

      // Stats
      var today = analytics.today || {};
      var visitors = analytics.visitors || {};
      var summary = analytics.summary || {};
      var counts = analytics.counts || {};
      _setText('dash-stat-visits', _fmt(today.visits || visitors.today_visits || summary.today_visits || 0));
      _setText('dash-stat-views',  _fmt(today.views || summary.today_pageviews || summary.today_views || 0));
      _setText('dash-stat-posts', _fmt(recentRes.total || counts.total || recent.length || 0));
      _setText('dash-stat-pub',   _fmt(published.total || counts.published || 0));

      // Recent posts
      if (!recent.length) {
        recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">게시글이 없습니다</div></div>';
      } else {
        recentEl.innerHTML = recent.map(function (p) {
          return '<div class="v3-recent-row" onclick="V3.editPost(' + p.id + ')">' +
            '<div class="v3-recent-cat"><span class="v3-badge ' + _catBadge(p.category) + '">' + GW.escapeHtml(p.category || '') + '</span></div>' +
            '<div class="v3-recent-info">' +
              '<div class="v3-recent-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
              '<div class="v3-recent-meta">' + GW.escapeHtml(GW.formatDate ? GW.formatDate(p.created_at) : (p.created_at || '')) +
                ' · ' + (p.published ? '<span style="color:#16a34a;">공개</span>' : '비공개') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      // Popular posts
      if (!popular.length) {
        topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">데이터 없음</div></div>';
      } else {
        topEl.innerHTML = popular.map(function (p, i) {
          return '<div class="v3-recent-row" onclick="V3.editPost(' + p.id + ')">' +
            '<div style="font-size:11px;font-weight:700;color:#94a3b8;width:18px;flex-shrink:0;">' + (i + 1) + '</div>' +
            '<div class="v3-recent-info">' +
              '<div class="v3-recent-title">' + GW.escapeHtml(p.title || '') + '</div>' +
              '<div class="v3-recent-meta">조회 ' + _fmt(p.views || p.pageviews || 0) + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      if (results[0].status !== 'fulfilled') {
        _setText('dash-stat-visits-sub', '분석 API 확인 필요');
      } else {
        _setText('dash-stat-visits-sub', '오늘');
      }
      _renderDashboardOperations(editorialEl, alertsEl, settingsEl, deploymentsEl, operations);
      if (results[2].status !== 'fulfilled') {
        recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">최근 게시글 API 오류</div></div>';
      }
      if (results[3].status !== 'fulfilled') {
        topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">인기 게시글 API 오류</div></div>';
      }
      if (results[4].status !== 'fulfilled') {
        _setText('dash-stat-posts-sub', '공개 수 집계 오류');
      } else {
        _setText('dash-stat-posts-sub', '전체 게시글');
      }
    }).catch(function (e) {
      recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml((e && e.message) || 'API 오류') + '</div></div>';
      topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      _setText('dash-stat-visits-sub', '대시보드 로딩 실패');
      _setText('dash-stat-posts-sub', '대시보드 로딩 실패');
    }).finally(function () {
      if (actionBtn) _clearButtonBusy(actionBtn, '완료');
    });
  }

  function _renderDashboardOperations(editorialEl, alertsEl, settingsEl, deploymentsEl, operations) {
    if (editorialEl) {
      var scheduled = operations.scheduled_posts || [];
      var drafts = operations.draft_posts || [];
      editorialEl.innerHTML =
        '<div class="v3-text-s" style="margin-bottom:8px;color:#64748b;">발행 예정</div>' +
        _renderSimpleRows(scheduled, function (item) {
          return {
            title: item.title || '(제목 없음)',
            meta: (item.category || 'site') + ' · ' + _shortDate(item.publish_at),
            action: item.id ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3.editPost(' + item.id + ')">열기</button>' : '',
          };
        }, '발행 예정 글이 없습니다', '발행 예정 글') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:#64748b;">최근 초안</div>' +
        _renderSimpleRows(drafts, function (item) {
          return {
            title: item.title || '(제목 없음)',
            meta: (item.category || 'site') + ' · ' + _shortDate(item.updated_at),
            action: item.id ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3.editPost(' + item.id + ')">열기</button>' : '',
          };
        }, '최근 초안이 없습니다', '최근 초안');
    }
    if (alertsEl) {
      var errors = operations.recent_errors || [];
      var logins = operations.recent_logins || [];
      alertsEl.innerHTML =
        '<div class="v3-text-s" style="margin-bottom:8px;color:#64748b;">최근 API 오류</div>' +
        _renderSimpleRows(errors, function (item) {
          return {
            title: (item.message || item.type || '오류').slice(0, 80),
            meta: [item.channel || 'site', item.path || '', _shortDate(item.created_at)].filter(Boolean).join(' · '),
            action: '',
          };
        }, '최근 오류 로그가 없습니다', '최근 API 오류') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:#64748b;">최근 로그인 시도</div>' +
        _renderSimpleRows(logins, function (item) {
          return {
            title: item.message || item.type || '로그인 이벤트',
            meta: [item.actor || 'unknown', _shortDate(item.created_at)].filter(Boolean).join(' · '),
            action: '',
          };
        }, '로그인 이벤트가 없습니다', '최근 로그인 시도');
    }
    if (settingsEl) {
      var settings = operations.recent_settings || [];
      settingsEl.innerHTML = _renderSimpleRows(settings, function (item) {
        return {
          title: item.key || 'setting',
          meta: _shortDate(item.saved_at),
          action: '',
        };
      }, '최근 설정 변경이 없습니다', '최근 설정 변경');
    }
    if (deploymentsEl) {
      var deployments = operations.deployments || [];
      deploymentsEl.innerHTML = _renderSimpleRows(deployments, function (item) {
        return {
          title: [item.environment || 'release', item.version || item.site_version || ''].filter(Boolean).join(' · '),
          meta: [item.status || 'success', item.branch || '', _shortDate(item.created_on)].filter(Boolean).join(' · '),
          action: item.url ? '<a class="v3-btn v3-btn-ghost v3-btn-xs" href="' + GW.escapeHtml(item.url) + '" target="_blank" rel="noopener">보기</a>' : '',
        };
      }, '릴리스 이력이 없습니다', '릴리스 이력');
    }
  }

  function _renderSimpleRows(items, mapFn, emptyText, moreTitle) {
    var rows = Array.isArray(items) ? items.slice() : [];
    var visibleCount = 6;
    if (!rows.length) {
      return '<div class="v3-empty"><div class="v3-empty-text">' + GW.escapeHtml(emptyText || '데이터 없음') + '</div></div>';
    }
    var targetId = 'v3-simple-rows-' + (++_simpleRowsSeq);
    var body = rows.map(function (item, index) {
      var mapped = mapFn(item) || {};
      return '<div class="v3-recent-row' + (index >= visibleCount ? ' is-collapsed' : '') + '" data-v3-simple-row>' +
        '<div class="v3-recent-info">' +
          '<div class="v3-recent-title">' + GW.escapeHtml(mapped.title || '') + '</div>' +
          '<div class="v3-recent-meta">' + GW.escapeHtml(mapped.meta || '') + '</div>' +
        '</div>' +
        (mapped.action ? '<div style="margin-left:10px;flex-shrink:0;">' + mapped.action + '</div>' : '') +
      '</div>';
      }).join('');
    var footer = '';
    if (rows.length > visibleCount) {
      footer = '<button type="button" class="v3-more-btn" data-v3-more-target="' + targetId + '" data-v3-more-title="' + GW.escapeHtml(moreTitle || '기록') + '" onclick="V3.openMoreRowsModal(this)">더보기 (' + (rows.length - visibleCount) + '개)</button>';
    }
    return '<div class="v3-simple-rows" id="' + targetId + '" data-v3-expanded="false">' + body + '</div>' +
      '<template id="' + targetId + '-template">' + body + '</template>' + footer;
  }

  V3.openMoreRowsModal = function (btn) {
    if (!btn) return;
    var targetId = btn.getAttribute('data-v3-more-target');
    if (!targetId) return;
    var template = document.getElementById(targetId + '-template');
    var modal = document.getElementById('v3-more-modal');
    var body = document.getElementById('v3-more-modal-body');
    var title = document.getElementById('v3-more-modal-title');
    if (!template || !modal || !body || !title) return;
    title.textContent = btn.getAttribute('data-v3-more-title') || '로그 기록';
    body.innerHTML = template.innerHTML;
    modal.style.display = 'flex';
  };

  V3.closeMoreRowsModal = function () {
    var modal = document.getElementById('v3-more-modal');
    var body = document.getElementById('v3-more-modal-body');
    if (modal) modal.style.display = 'none';
    if (body) body.innerHTML = '';
  };

  /* ══════════════════════════════════════════════════════════
     POST LIST
  ══════════════════════════════════════════════════════════ */
  function _loadList() {
    var tbody = document.getElementById('list-tbody');
    tbody.innerHTML = '<tr><td colspan="7"><div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div></td></tr>';

    var params = new URLSearchParams({
      page:    _listPage,
      limit:   _listPageSize,
    });
    if (_listSearch) params.set('q', _listSearch);
    if (_listCat !== 'all') params.set('category', _listCat);
    if (_listPub === 'published') params.set('published', '1');
    else if (_listPub === 'draft') params.set('published', '0');
    if (_listSort !== 'latest') params.set('sort', _listSort);

    _apiFetch('/api/posts?' + params.toString())
      .then(function (data) {
        var posts = (data && data.posts) || [];
        _listTotal = (data && data.total) || posts.length;
        document.getElementById('list-count').textContent = '총 ' + _listTotal + '건';

        if (!posts.length) {
          tbody.innerHTML = '<tr><td colspan="7"><div class="v3-empty"><div class="v3-empty-text">게시글이 없습니다</div></div></td></tr>';
        } else {
          tbody.innerHTML = posts.map(function (p) {
            return '<tr>' +
              '<td><div class="v3-table-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
                (p.subtitle ? '<div class="v3-text-m v3-text-s">' + GW.escapeHtml(p.subtitle) + '</div>' : '') +
              '</td>' +
              '<td><span class="v3-badge ' + _catBadge(p.category) + '">' + GW.escapeHtml(p.category || '') + '</span></td>' +
              '<td>' + (p.tag ? '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(p.tag) + '</span>' : '<span class="v3-text-m">—</span>') + '</td>' +
              '<td>' + (p.published ? '<span class="v3-badge v3-badge-green">공개</span>' : '<span class="v3-badge v3-badge-gray">비공개</span>') + '</td>' +
              '<td class="v3-text-m">' + GW.escapeHtml(GW.formatDate ? GW.formatDate(p.created_at) : (p.created_at || '').slice(0, 10)) + '</td>' +
              '<td class="v3-text-m">' + _fmt(p.views || 0) + '</td>' +
              '<td class="v3-nowrap">' +
                '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3.editPost(' + p.id + ')">수정</button>' +
                '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3.togglePublish(' + p.id + ',' + !p.published + ')">' + (p.published ? '비공개' : '공개') + '</button>' +
                '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:#ef4444;" onclick="V3.deletePost(' + p.id + ')">삭제</button>' +
              '</td>' +
            '</tr>';
          }).join('');
        }
        _renderPagination();
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div></td></tr>';
      });
  }

  function _renderPagination() {
    var el = document.getElementById('list-pagination');
    var totalPages = Math.ceil(_listTotal / _listPageSize);
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    var html = '<button class="v3-page-btn" ' + (_listPage === 1 ? 'disabled' : '') + ' onclick="V3.listPage(' + (_listPage - 1) + ')">‹ 이전</button>';
    var start = Math.max(1, _listPage - 2);
    var end   = Math.min(totalPages, _listPage + 2);
    for (var i = start; i <= end; i++) {
      html += '<button class="v3-page-btn' + (i === _listPage ? ' active' : '') + '" onclick="V3.listPage(' + i + ')">' + i + '</button>';
    }
    html += '<button class="v3-page-btn" ' + (_listPage === totalPages ? 'disabled' : '') + ' onclick="V3.listPage(' + (_listPage + 1) + ')">다음 ›</button>';
    html += '<span class="v3-page-info">' + _listPage + ' / ' + totalPages + '</span>';
    el.innerHTML = html;
  }

  V3.listPage = function (page) { _listPage = page; _loadList(); };

  V3.togglePublish = function (id, pub) {
    _apiFetch('/api/posts/' + id, {
      method: 'PUT',
      body: JSON.stringify({ published: pub }),
    }).then(function () {
      GW.showToast(pub ? '공개로 전환했습니다' : '비공개로 전환했습니다', 'success');
      _loadList();
    }).catch(function (e) {
      GW.showToast(e.message || '처리 실패', 'error');
    });
  };

  V3.deletePost = function (id) {
    _confirm('게시글 삭제', '이 게시글을 삭제하시겠습니까? 복구할 수 없습니다.').then(function (ok) {
      if (!ok) return;
      _apiFetch('/api/posts/' + id, { method: 'DELETE' })
        .then(function () {
          GW.showToast('삭제했습니다', 'success');
          _loadList();
        })
        .catch(function (e) { GW.showToast(e.message || '삭제 실패', 'error'); });
    });
  };

  /* ══════════════════════════════════════════════════════════
     POST WRITE / EDIT
  ══════════════════════════════════════════════════════════ */
  function _resetWrite() {
    _editingId    = null;
    _coverDataUrl = null;
    _galleryImages = [];
    _metaTags     = [];
    _relatedPosts = [];

    document.getElementById('write-panel-title').textContent = '새 글 작성';
    document.getElementById('w-title').value      = '';
    document.getElementById('w-subtitle').value   = '';
    document.getElementById('w-cat').value        = 'korea';
    _selectedWriteTags = [];
    _renderWriteTagPills(document.getElementById('w-cat').value);
    document.getElementById('w-author').value     = '';
    document.getElementById('w-date').value       = _kstNow();
    document.getElementById('w-youtube').value    = '';
    document.getElementById('w-cover-caption').value = '';
    document.getElementById('w-location-name').value = '';
    document.getElementById('w-location-addr').value = '';
    var _locPrev = document.getElementById('w-location-map-preview');
    if (_locPrev) { _locPrev.style.display = 'none'; document.getElementById('w-location-map-frame').src = ''; }
    document.getElementById('w-special').value   = '';
    document.getElementById('w-published').checked = false;
    document.getElementById('w-featured').checked  = false;
    document.getElementById('w-ai').checked        = false;
    document.getElementById('w-related-search').value = '';
    document.getElementById('w-related-results').style.display = 'none';
    document.getElementById('write-history-card').style.display = 'none';

    _renderCoverPreview();
    _renderGallery();
    _renderMetaTags();
    _renderRelated();
    _editorClear();
  }

  V3.openWrite = function () {
    _resetWrite();
    V3.showPanel('write');
  };

  V3.editPost = function (id) {
    // First show panel (resets form), then load
    _panel = 'write';
    document.querySelectorAll('.v3-panel').forEach(function (el) { el.classList.remove('active'); });
    document.getElementById('panel-write').classList.add('active');
    document.querySelectorAll('#v3-nav .v3-nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.panel === 'write');
    });
    document.getElementById('v3-panel-title').textContent = '글 수정';
    document.getElementById('write-panel-title').textContent = '글 수정 중…';

    // Reset state
    _editingId    = id;
    _coverDataUrl = null;
    _galleryImages = [];
    _metaTags     = [];
    _relatedPosts = [];

    _apiFetch('/api/posts/' + id)
      .then(function (data) {
        var p = data.post || data;
        document.getElementById('write-panel-title').textContent = '글 수정: ' + (p.title || '');
        document.getElementById('w-title').value       = p.title || '';
        document.getElementById('w-subtitle').value    = p.subtitle || '';
        document.getElementById('w-cat').value         = p.category || 'korea';
        _selectedWriteTags = p.tag ? p.tag.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
        _renderWriteTagPills(p.category || 'korea');
        document.getElementById('w-author').value      = p.author || '';
        document.getElementById('w-youtube').value     = p.youtube_url || '';
        document.getElementById('w-cover-caption').value = p.image_caption || '';
        document.getElementById('w-location-name').value = p.location_name || '';
        document.getElementById('w-location-addr').value = p.location_address || '';
        // Auto-preview map if address exists
        if (p.location_address) {
          setTimeout(function () { _checkWriteLocation(); }, 400);
        }
        document.getElementById('w-special').value    = p.special_feature || '';
        document.getElementById('w-published').checked = !!p.published;
        document.getElementById('w-featured').checked  = !!p.featured;
        document.getElementById('w-ai').checked        = !!p.ai_assisted;

        // Date
        if (p.publish_at) {
          var dt = new Date(p.publish_at);
          document.getElementById('w-date').value = _toDatetimeLocal(dt);
        }

        // Cover
        if (p.image_url) {
          _coverDataUrl = p.image_url;
          _renderCoverPreview();
        }

        // Gallery
        if (p.gallery_images) {
          try { _galleryImages = JSON.parse(p.gallery_images); } catch (e) { _galleryImages = []; }
          _renderGallery();
        }

        // Meta tags
        if (p.meta_tags) {
          _metaTags = p.meta_tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
          _renderMetaTags();
        }

        // Related posts
        if (p.related_posts_json) {
          try {
            var rel = JSON.parse(p.related_posts_json);
            if (Array.isArray(rel)) {
              _relatedPosts = rel;
              _renderRelated();
            }
          } catch (e) { /* ignore */ }
        }

        // Editor content
        _editorSetData(p.content || '');

        // History card
        _loadPostHistory(id);
      })
      .catch(function (e) {
        GW.showToast(e.message || '불러오기 실패', 'error');
      });
  };

  function _savePost(publish) {
    var title = document.getElementById('w-title').value.trim();
    if (!title) { GW.showToast('제목을 입력하세요', 'error'); return; }

    var btn = publish ? document.getElementById('write-publish-btn') : document.getElementById('write-draft-btn');
    _setButtonBusy(btn, publish ? '공개 저장 중…' : '임시저장 중…');

    _editorGetData().then(function (content) {
      var dateVal = document.getElementById('w-date').value;
      var body = {
        title:            title,
        subtitle:         document.getElementById('w-subtitle').value.trim(),
        category:         document.getElementById('w-cat').value,
        tag:              _selectedWriteTags.join(','),
        author:           document.getElementById('w-author').value.trim(),
        content:          content,
        youtube_url:      document.getElementById('w-youtube').value.trim(),
        image_caption:    document.getElementById('w-cover-caption').value.trim(),
        location_name:    document.getElementById('w-location-name').value.trim(),
        location_address: document.getElementById('w-location-addr').value.trim(),
        special_feature:  document.getElementById('w-special').value.trim(),
        published:        publish ? true : document.getElementById('w-published').checked,
        featured:         document.getElementById('w-featured').checked,
        ai_assisted:      document.getElementById('w-ai').checked,
        meta_tags:        _metaTags.join(','),
        publish_at:       dateVal ? new Date(dateVal).toISOString() : undefined,
        related_posts_json: JSON.stringify(_relatedPosts),
      };
      if (_coverDataUrl && _coverDataUrl.startsWith('data:')) {
        body.image_data = _coverDataUrl;
      } else if (_coverDataUrl) {
        body.image_url = _coverDataUrl;
      }
      if (_galleryImages.length) {
        body.gallery_images = JSON.stringify(_galleryImages);
      }

      var method = _editingId ? 'PUT' : 'POST';
      var url    = _editingId ? '/api/posts/' + _editingId : '/api/posts';

      return _apiFetch(url, { method: method, body: JSON.stringify(body) });
    }).then(function (data) {
      var saved = data.post || data;
      if (!_editingId && saved.id) _editingId = saved.id;
      GW.showToast('저장했습니다', 'success');
      document.getElementById('write-panel-title').textContent = '글 수정: ' + (document.getElementById('w-title').value || '');
      document.getElementById('w-published').checked = publish || document.getElementById('w-published').checked;
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
      _clearButtonBusy(btn);
    });
  }

  function _loadPostHistory(id) {
    var card = document.getElementById('write-history-card');
    var list = document.getElementById('write-history-list');
    card.style.display = 'block';
    _apiFetch('/api/posts/' + id + '/history').then(function (data) {
      var items = (data && data.history) || [];
      if (!items.length) { list.textContent = '수정 기록 없음'; return; }
      list.innerHTML = items.slice(0, 5).map(function (h) {
        return '<div style="margin-bottom:5px;"><span class="v3-badge v3-badge-gray">' + GW.escapeHtml(h.action || '') + '</span> ' +
          '<span>' + GW.escapeHtml(h.summary || '') + '</span></div>';
      }).join('');
    }).catch(function () { list.textContent = '기록 없음'; });
  }

  /* ── Cover image ── */
  function _pickCover() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      if (GW.optimizeImageFile) {
        GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 }).then(function (r) {
          _coverDataUrl = r.dataUrl; _renderCoverPreview();
        }).catch(function (e) { GW.showToast(e.message || '이미지 처리 실패', 'error'); });
      } else {
        var reader = new FileReader();
        reader.onload = function () { _coverDataUrl = reader.result; _renderCoverPreview(); };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  function _renderCoverPreview() {
    var el = document.getElementById('w-cover-preview');
    if (!_coverDataUrl) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="v3-img-preview-wrap">' +
      '<img src="' + GW.escapeHtml(_coverDataUrl) + '" alt="미리보기" />' +
      '<div style="margin-top:6px;">' +
        '<button class="v3-btn v3-btn-outline v3-btn-xs" onclick="V3._removeCover()">대표 이미지 삭제</button>' +
      '</div>' +
    '</div>';
  }
  V3._removeCover = function () { _coverDataUrl = null; _renderCoverPreview(); };

  /* ── Gallery ── */
  function _pickGallery() {
    if (_galleryImages.length >= 10) { GW.showToast('최대 10장까지 추가할 수 있습니다', 'error'); return; }
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      var remaining = Math.max(0, 10 - _galleryImages.length);
      var toProcess = files.slice(0, remaining);
      var process = GW.optimizeImageFile
        ? function (f) { return GW.optimizeImageFile(f, { maxW: 1800, maxH: 1800, quality: 0.84 }).then(function (r) { return r.dataUrl; }); }
        : function (f) { return new Promise(function (res) { var rd = new FileReader(); rd.onload = function () { res(rd.result); }; rd.readAsDataURL(f); }); };
      toProcess.reduce(function (chain, f) {
        return chain.then(function () { return process(f).then(function (url) { _galleryImages.push({ url: url, caption: '' }); }); });
      }, Promise.resolve()).then(function () { _renderGallery(); });
    };
    input.click();
  }

  function _renderGallery() {
    var el = document.getElementById('w-gallery-grid');
    if (!_galleryImages.length) { el.innerHTML = ''; return; }
    el.innerHTML = _galleryImages.map(function (img, i) {
      return '<div class="v3-gallery-item">' +
        '<img src="' + GW.escapeHtml(img.url) + '" alt="" />' +
        '<button class="v3-gallery-rm" onclick="V3._removeGalleryItem(' + i + ')">×</button>' +
      '</div>';
    }).join('');
  }
  V3._removeGalleryItem = function (i) { _galleryImages.splice(i, 1); _renderGallery(); };

  /* ── Meta tags ── */
  function _addMetaTag() {
    var input = document.getElementById('w-metatag-input');
    var val = input.value.trim();
    if (!val || _metaTags.includes(val)) { input.value = ''; return; }
    _metaTags.push(val); input.value = '';
    _renderMetaTags();
  }
  function _renderMetaTags() {
    var el = document.getElementById('w-metatag-chips');
    el.innerHTML = _metaTags.map(function (t, i) {
      return '<span class="v3-metatag-chip">' + GW.escapeHtml(t) +
        '<button class="v3-metatag-rm" onclick="V3._removeMetaTag(' + i + ')">×</button></span>';
    }).join('');
  }
  V3._removeMetaTag = function (i) { _metaTags.splice(i, 1); _renderMetaTags(); };

  /* ── Location map (OpenStreetMap / Nominatim) ── */
  function _checkWriteLocation() {
    var addr = document.getElementById('w-location-addr').value.trim();
    if (!addr) { GW.showToast('주소를 입력하세요', 'error'); return; }
    var btn  = document.getElementById('w-location-check-btn');
    var prev = document.getElementById('w-location-map-preview');
    var frame = document.getElementById('w-location-map-frame');
    var status = document.getElementById('w-location-map-status');
    _setButtonBusy(btn, '검색 중…');
    status.textContent = '';
    prev.style.display = 'none';
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addr) + '&format=json&limit=1', {
      headers: { 'Accept-Language': 'ko,en', 'User-Agent': 'GilwellMedia/1.0' }
    })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results || !results.length) {
          _clearButtonBusy(btn);
          GW.showToast('주소를 지도에서 찾을 수 없습니다. 다른 주소로 시도해보세요.', 'error');
          return;
        }
        var loc = results[0];
        var lat = parseFloat(loc.lat), lon = parseFloat(loc.lon);
        var d = 0.01;
        var bbox = (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d);
        frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + ',' + lon;
        status.textContent = '✓ ' + (loc.display_name || addr);
        prev.style.display = 'block';
        _clearButtonBusy(btn, '완료');
      })
      .catch(function () {
        _clearButtonBusy(btn);
        GW.showToast('지도 검색 중 오류가 발생했습니다', 'error');
      });
  }

  /* ── Related posts ── */
  function _searchRelated(q) {
    var results = document.getElementById('w-related-results');
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8').then(function (data) {
      var posts = (data && data.posts) || [];
      if (!posts.length) { results.style.display = 'none'; return; }
      results.innerHTML = posts.map(function (p) {
        return '<div class="v3-search-result-item" onclick="V3._addRelated(' + p.id + ',\'' + _escJs(p.title || '') + '\')">' +
          GW.escapeHtml(p.title || '') + '</div>';
      }).join('');
      results.style.display = 'block';
    }).catch(function () { results.style.display = 'none'; });
  }

  V3._addRelated = function (id, title) {
    if (_relatedPosts.find(function (r) { return r.id === id; })) return;
    _relatedPosts.push({ id: id, title: title });
    _renderRelated();
    document.getElementById('w-related-results').style.display = 'none';
    document.getElementById('w-related-search').value = '';
  };

  function _renderRelated() {
    var el = document.getElementById('w-related-list');
    if (!_relatedPosts.length) { el.innerHTML = ''; return; }
    el.innerHTML = _relatedPosts.map(function (r, i) {
      return '<div class="v3-related-item">' +
        '<span class="v3-related-item-title">' + GW.escapeHtml(r.title || '') + '</span>' +
        '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3._removeRelated(' + i + ')">×</button>' +
      '</div>';
    }).join('');
  }
  V3._removeRelated = function (i) { _relatedPosts.splice(i, 1); _renderRelated(); };

  /* ══════════════════════════════════════════════════════════
     TAG SETTINGS (for write dropdown)
  ══════════════════════════════════════════════════════════ */
  function _loadTagSettings() {
    _apiFetch('/api/settings/tags').then(function (data) {
      _tagSettings = (GW.normalizeTagSettings ? GW.normalizeTagSettings(data) : data) || {};
      _renderWriteTagPills(document.getElementById('w-cat').value);
    }).catch(function () {});

    document.getElementById('w-cat').addEventListener('change', function () {
      _renderWriteTagPills(this.value);
    });

    var newBtn   = document.getElementById('w-tag-new-btn');
    var newInput = document.getElementById('w-tag-new-input');
    if (newBtn) {
      newBtn.addEventListener('click', function () { _addWriteTagFromInput(); });
    }
    if (newInput) {
      newInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); _addWriteTagFromInput(); }
      });
    }
  }

  function _renderWriteTagPills(cat) {
    var container = document.getElementById('w-tag-pills');
    if (!container) return;
    var tags = _getCategoryTags(_tagSettings, cat);
    // Preserve only selected tags that still exist in the new category
    _selectedWriteTags = _selectedWriteTags.filter(function (t) { return tags.indexOf(t) >= 0; });
    var html = '<button type="button" class="v3-tag-pill' + (!_selectedWriteTags.length ? ' active' : '') + '" data-tag="">없음</button>';
    tags.forEach(function (t) {
      var label = typeof t === 'string' ? t : (t.label || t.value || '');
      var value = typeof t === 'string' ? t : (t.value || t.label || '');
      var active = _selectedWriteTags.indexOf(value) >= 0 ? ' active' : '';
      html += '<button type="button" class="v3-tag-pill' + active + '" data-tag="' + GW.escapeHtml(value) + '">' + GW.escapeHtml(label) + '</button>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.v3-tag-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.dataset.tag || '';
        if (val === '') {
          _selectedWriteTags = [];
        } else {
          var idx = _selectedWriteTags.indexOf(val);
          if (idx >= 0) _selectedWriteTags.splice(idx, 1);
          else _selectedWriteTags.push(val);
        }
        _syncWriteTagPills();
      });
    });
  }

  function _syncWriteTagPills() {
    var container = document.getElementById('w-tag-pills');
    if (!container) return;
    container.querySelectorAll('.v3-tag-pill').forEach(function (btn) {
      var t = btn.dataset.tag || '';
      btn.classList.toggle('active', t === '' ? _selectedWriteTags.length === 0 : _selectedWriteTags.indexOf(t) >= 0);
    });
  }

  function _addWriteTagFromInput() {
    var input = document.getElementById('w-tag-new-input');
    var value = (input && input.value || '').trim();
    if (!value) { GW.showToast('태그명을 입력해주세요', 'error'); return; }
    var cat = document.getElementById('w-cat').value;
    GW.addManagedTagToCategory(value, cat)
      .then(function (result) {
        _tagSettings = {}; // force reload
        return _apiFetch('/api/settings/tags').then(function (data) {
          _tagSettings = (GW.normalizeTagSettings ? GW.normalizeTagSettings(data) : data) || {};
          var selectedTag = result && result.selectedTag ? result.selectedTag : value;
          if (_selectedWriteTags.indexOf(selectedTag) < 0) _selectedWriteTags.push(selectedTag);
          _renderWriteTagPills(cat);
          if (input) input.value = '';
          GW.showToast(result && result.created ? '태그를 추가하고 선택했습니다' : '이미 있는 태그를 선택했습니다', 'success');
        });
      })
      .catch(function (err) {
        GW.showToast(err && err.message ? err.message : '태그 추가 실패', 'error');
      });
  }

  /* ══════════════════════════════════════════════════════════
     CALENDAR
  ══════════════════════════════════════════════════════════ */

  // 행사 상태 판정 (홈페이지 calendar.js 기준과 동일)
  function _calEventStatus(e) {
    var now   = Date.now();
    var start = e.start_at ? new Date(e.start_at).getTime() : null;
    var end   = e.end_at   ? new Date(e.end_at).getTime()   : null;
    if (!start || start > now) return 'upcoming';  // 개최예정
    if (!end || end >= now)   return 'ongoing';    // 진행중
    return 'finished';                              // 행사종료
  }

  var CAL_STATUS_LABEL = { upcoming: '개최예정', ongoing: '진행중', finished: '행사종료' };
  var CAL_STATUS_BADGE = { upcoming: 'v3-badge-blue', ongoing: 'v3-badge-green', finished: 'v3-badge-gray' };

  function _loadCalendar() {
    var el = document.getElementById('cal-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    var cacheKey = Date.now();
    Promise.all([
      _apiFetch('/api/calendar?limit=500&_=' + cacheKey),
      _apiFetch('/api/settings/calendar-tags?_=' + cacheKey).catch(function () { return { tags: [] }; }),
    ]).then(function (results) {
      var data = results[0];
      _calItems = (data && data.events) || (data && data.items) || [];
      var tagData = results[1] || {};
      _calendarTags = Array.isArray(tagData.items) ? tagData.items : (Array.isArray(tagData.tags) ? tagData.tags : (Array.isArray(tagData) ? tagData : []));

      // Year filter (from actual data)
      var years = {};
      _calItems.forEach(function (e) { if (e.start_at) years[e.start_at.slice(0, 4)] = 1; });
      var yearSel = document.getElementById('cal-filter-year');
      yearSel.innerHTML = '<option value="all">전체 연도</option>' + Object.keys(years).sort().reverse().map(function (y) {
        return '<option value="' + y + '">' + y + '</option>';
      }).join('');

      _bindCalFilters();
      _renderCalList();
    }).catch(function (e) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
    });
  }

  function _bindCalFilters() {
    ['cal-filter-year', 'cal-filter-region', 'cal-filter-status', 'cal-filter-from', 'cal-filter-to', 'cal-sort']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !el.dataset.v3Bound) {
          el.dataset.v3Bound = '1';
          el.addEventListener('change', _renderCalList);
          if (el.type === 'date') el.addEventListener('input', _renderCalList);
        }
      });
    var resetBtn = document.getElementById('cal-filter-reset');
    if (resetBtn && !resetBtn.dataset.v3Bound) {
      resetBtn.dataset.v3Bound = '1';
      resetBtn.addEventListener('click', function () {
        document.getElementById('cal-filter-year').value   = 'all';
        document.getElementById('cal-filter-region').value = 'all';
        document.getElementById('cal-filter-status').value = 'all';
        document.getElementById('cal-filter-from').value   = '';
        document.getElementById('cal-filter-to').value     = '';
        document.getElementById('cal-sort').value          = 'asc';
        _renderCalList();
      });
    }
  }

  function _renderCalList() {
    var el     = document.getElementById('cal-list');
    var year   = document.getElementById('cal-filter-year').value;
    var region = document.getElementById('cal-filter-region').value;
    var status = document.getElementById('cal-filter-status').value;
    var from   = document.getElementById('cal-filter-from').value;   // YYYY-MM-DD
    var to     = document.getElementById('cal-filter-to').value;
    var sort   = document.getElementById('cal-sort').value;          // asc | desc

    var items = _calItems.filter(function (e) {
      // 연도
      if (year !== 'all' && (!e.start_at || e.start_at.slice(0, 4) !== year)) return false;
      // 지역 (event_category)
      if (region !== 'all' && (e.event_category || 'WOSM') !== region) return false;
      // 행사 상태
      if (status !== 'all' && _calEventStatus(e) !== status) return false;
      // 시작일 범위
      var startStr = e.start_at ? e.start_at.slice(0, 10) : '';
      if (from && startStr && startStr < from) return false;
      if (to   && startStr && startStr > to)   return false;
      return true;
    });

    // 정렬
    items.sort(function (a, b) {
      var da = a.start_at || '';
      var db = b.start_at || '';
      if (sort === 'asc') return da < db ? -1 : da > db ? 1 : 0;
      return da > db ? -1 : da < db ? 1 : 0;
    });

    // 건수 표시
    var countEl = document.getElementById('cal-count');
    if (countEl) countEl.textContent = items.length + '건';

    if (!items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-icon">📅</div><div class="v3-empty-text">일정이 없습니다</div></div>';
      return;
    }

    el.innerHTML = items.map(function (e) {
      var dt    = e.start_at ? new Date(e.start_at) : null;
      var month = dt ? dt.toLocaleString('ko', { month: 'short' }) : '';
      var day   = dt ? dt.getDate() : '—';
      var evSt  = _calEventStatus(e);
      var endStr = e.end_at ? ' ~ ' + e.end_at.slice(0, 10) : '';
      return '<div class="v3-cal-item" onclick="V3._openCalEvent(' + e.id + ')">' +
        '<div class="v3-cal-date-col">' +
          '<div class="v3-cal-date-m">' + GW.escapeHtml(month) + '</div>' +
          '<div class="v3-cal-date-d">' + day + '</div>' +
        '</div>' +
        '<div class="v3-cal-info">' +
          '<div class="v3-cal-title">' + GW.escapeHtml(e.title || '') + '</div>' +
          '<div class="v3-cal-meta">' +
            '<span class="v3-badge ' + CAL_STATUS_BADGE[evSt] + '">' + CAL_STATUS_LABEL[evSt] + '</span> ' +
            (e.event_category ? '<span class="v3-badge v3-badge-blue" style="margin-left:4px;">' + GW.escapeHtml(e.event_category) + '</span> ' : '') +
            '<span style="margin-left:4px;">' + GW.escapeHtml(e.location_name || e.country_name || '') + '</span>' +
            (endStr ? '<span style="margin-left:6px;font-size:11px;color:var(--v3-text-l);">' + GW.escapeHtml((e.start_at || '').slice(0, 10)) + GW.escapeHtml(endStr) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation();V3._openCalEvent(' + e.id + ')">수정</button>' +
      '</div>';
    }).join('');
  }

  V3._openCalEvent = function (id) {
    var e = _calItems.find(function (c) { return c.id === id; });
    if (e) _openCalModal(e);
  };

  function _syncCalCategoryUi() {
    var isKor = document.getElementById('cal-cat').value === 'KOR';
    var wrap = document.getElementById('cal-target-wrap');
    if (wrap) wrap.style.display = isKor ? '' : 'none';
    if (!isKor) _calModalTargetGroups = [];
    _renderCalTargetGroups();
  }

  function _addCalTag() {
    var input = document.getElementById('cal-tags-input');
    var value = String(input && input.value || '').trim();
    if (!value) { GW.showToast('추가할 태그를 입력해주세요', 'error'); return; }
    if (_calModalTags.indexOf(value) >= 0) { GW.showToast('이미 추가된 태그입니다', 'error'); return; }
    _calModalTags.push(value);
    if (input) input.value = '';
    _renderCalTags();
    _renderCalTagPresets();
  }

  function _renderCalTags() {
    var el = document.getElementById('cal-tags-list');
    if (!el) return;
    if (!_calModalTags.length) {
      el.innerHTML = '<div class="v3-input-hint">등록된 행사 태그가 없습니다.</div>';
      return;
    }
    el.innerHTML = _calModalTags.map(function (tag) {
      return '<button type="button" class="calendar-tag-chip" data-cal-tag="' + GW.escapeHtml(tag) + '">' +
        '<span>' + GW.escapeHtml(tag) + '</span><strong>×</strong></button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-cal-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-cal-tag') || '';
        _calModalTags = _calModalTags.filter(function (item) { return item !== tag; });
        _renderCalTags();
        _renderCalTagPresets();
      });
    });
  }

  function _renderCalTagPresets() {
    var el = document.getElementById('cal-tag-presets');
    if (!el) return;
    if (!_calendarTags.length) { el.innerHTML = ''; return; }
    el.innerHTML = _calendarTags.map(function (tag) {
      var active = _calModalTags.indexOf(tag) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-tag-preset' + active + '" data-cal-preset-tag="' + GW.escapeHtml(tag) + '">' + GW.escapeHtml(tag) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-cal-preset-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-cal-preset-tag') || '';
        if (_calModalTags.indexOf(tag) >= 0) _calModalTags = _calModalTags.filter(function (item) { return item !== tag; });
        else _calModalTags.push(tag);
        _renderCalTags();
        _renderCalTagPresets();
      });
    });
  }

  function _renderCalTargetGroups() {
    var el = document.getElementById('cal-target-groups');
    if (!el) return;
    el.innerHTML = CAL_KOR_TARGET_GROUPS.map(function (group) {
      var active = _calModalTargetGroups.indexOf(group) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-tag-preset' + active + '" data-cal-target-group="' + GW.escapeHtml(group) + '">' + GW.escapeHtml(group) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-cal-target-group]'), function (btn) {
      btn.addEventListener('click', function () {
        var group = btn.getAttribute('data-cal-target-group') || '';
        var idx = _calModalTargetGroups.indexOf(group);
        if (idx >= 0) _calModalTargetGroups.splice(idx, 1);
        else _calModalTargetGroups.push(group);
        _renderCalTargetGroups();
      });
    });
  }

  function _searchCalRelated(q) {
    var results = document.getElementById('cal-related-results');
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8').then(function (data) {
      var posts = (data && data.posts) || [];
      if (!posts.length) {
        results.innerHTML = '<div class="v3-input-hint">검색 결과가 없습니다.</div>';
        return;
      }
      results.innerHTML = posts.map(function (p) {
        return '<button type="button" class="calendar-related-post-option" data-cal-related-id="' + p.id + '">' +
          '<div><strong>' + GW.escapeHtml(p.title || '') + '</strong><span>' + GW.escapeHtml(p.category || '') + '</span></div></button>';
      }).join('');
      Array.prototype.forEach.call(results.querySelectorAll('[data-cal-related-id]'), function (btn) {
        btn.addEventListener('click', function () {
          var id = parseInt(btn.getAttribute('data-cal-related-id'), 10);
          var post = posts.find(function (item) { return item.id === id; });
          if (!post || _calModalRelatedPosts.some(function (item) { return item.id === id; })) return;
          _calModalRelatedPosts.push({ id: post.id, title: post.title || '', category: post.category || '' });
          document.getElementById('cal-related-query').value = '';
          results.innerHTML = '';
          _renderCalRelatedPosts();
        });
      });
    }).catch(function () {
      results.innerHTML = '<div class="v3-input-hint">기사를 검색하지 못했습니다.</div>';
    });
  }

  function _renderCalRelatedPosts() {
    var el = document.getElementById('cal-related-selected');
    if (!el) return;
    if (!_calModalRelatedPosts.length) {
      el.innerHTML = '<div class="v3-input-hint">선택된 관련 기사가 없습니다.</div>';
      return;
    }
    el.innerHTML = _calModalRelatedPosts.map(function (post) {
      return '<div class="calendar-related-post-pill">' +
        '<div><strong>' + GW.escapeHtml(post.title || '') + '</strong>' +
        (post.category ? '<span>' + GW.escapeHtml(post.category) + '</span>' : '') +
        '</div>' +
        '<button type="button" data-cal-related-remove="' + post.id + '">해제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-cal-related-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-cal-related-remove'), 10);
        _calModalRelatedPosts = _calModalRelatedPosts.filter(function (item) { return item.id !== id; });
        _renderCalRelatedPosts();
      });
    });
  }

  function _renderCalGeoPreview(lat, lng, label) {
    var preview = document.getElementById('cal-geo-preview');
    var frame = document.getElementById('cal-geo-frame');
    var status = document.getElementById('cal-geo-status');
    if (!preview || !frame || !status || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (preview) preview.style.display = 'none';
      return;
    }
    var d = 0.01;
    var bbox = (lng - d) + ',' + (lat - d) + ',' + (lng + d) + ',' + (lat + d);
    frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + ',' + lng;
    status.textContent = label ? ('✓ ' + label) : ('좌표 ' + lat + ', ' + lng);
    preview.style.display = 'flex';
  }

  function _applyCalGeoResult(item) {
    var lat = Number(item && item.lat);
    var lng = Number(item && item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    var address = item && (item.display_name || item.name || '');
    var label = item && (item.name || item.display_name || '');
    document.getElementById('cal-lat').value = String(lat);
    document.getElementById('cal-lng').value = String(lng);
    if (address) document.getElementById('cal-loc-addr').value = address;
    if (label) document.getElementById('cal-loc-name').value = label;
    if (item && item.address && item.address.country) document.getElementById('cal-country').value = item.address.country;
    document.getElementById('cal-geo-results').innerHTML = '';
    _renderCalGeoPreview(lat, lng, address);
  }

  function _searchCalGeo() {
    var query = document.getElementById('cal-geo-query').value.trim();
    var results = document.getElementById('cal-geo-results');
    if (!query) { GW.showToast('검색할 주소나 장소명을 입력해주세요', 'error'); return; }
    results.innerHTML = '<div class="v3-input-hint">지도 검색 중…</div>';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=' + encodeURIComponent(query), {
      headers: { 'Accept': 'application/json', 'Accept-Language': 'ko,en', 'User-Agent': 'GilwellMedia/1.0' }
    })
      .then(function (res) { return res.json(); })
      .then(function (items) {
        if (!Array.isArray(items) || !items.length) {
          results.innerHTML = '<div class="v3-input-hint">검색 결과가 없습니다.</div>';
          return;
        }
        results.innerHTML = items.map(function (item, index) {
          return '<button type="button" class="calendar-related-post-option" data-cal-geo-index="' + index + '">' +
            '<div><strong>' + GW.escapeHtml(item.name || item.display_name || '지도 결과') + '</strong>' +
            '<span>' + GW.escapeHtml(item.display_name || '') + '</span></div></button>';
        }).join('');
        Array.prototype.forEach.call(results.querySelectorAll('[data-cal-geo-index]'), function (btn) {
          btn.addEventListener('click', function () {
            _applyCalGeoResult(items[parseInt(btn.getAttribute('data-cal-geo-index'), 10)]);
          });
        });
      })
      .catch(function () {
        results.innerHTML = '<div class="v3-input-hint">지도 검색에 실패했습니다.</div>';
      });
  }

  function _openCalModal(e) {
    document.getElementById('cal-id').value = e ? e.id : '';
    document.getElementById('cal-modal-title').textContent = e ? '일정 수정' : '새 일정';
    document.getElementById('cal-title').value = e ? (e.title || '') : '';
    document.getElementById('cal-title-original').value = e ? (e.title_original || '') : '';
    document.getElementById('cal-desc').value = e ? (e.description || '') : '';
    document.getElementById('cal-start').value = e && e.start_at ? e.start_at.slice(0, 10) : '';
    document.getElementById('cal-start-time-enabled').checked = !!(e && e.start_has_time);
    document.getElementById('cal-start-time').disabled = !(e && e.start_has_time);
    document.getElementById('cal-start-time').value = e && e.start_has_time && e.start_at ? e.start_at.slice(11, 16) : '';
    document.getElementById('cal-end').value = e && e.end_at ? e.end_at.slice(0, 10) : '';
    document.getElementById('cal-end-time-enabled').checked = !!(e && e.end_has_time);
    document.getElementById('cal-end-time').disabled = !(e && e.end_has_time);
    document.getElementById('cal-end-time').value = e && e.end_has_time && e.end_at ? e.end_at.slice(11, 16) : '';
    document.getElementById('cal-cat').value = e ? (e.event_category || 'KOR') : 'KOR';
    document.getElementById('cal-country').value = e ? (e.country_name || '') : '';
    document.getElementById('cal-loc-name').value = e ? (e.location_name || '') : '';
    document.getElementById('cal-loc-addr').value = e ? (e.location_address || '') : '';
    document.getElementById('cal-link').value = e ? (e.link_url || '') : '';
    document.getElementById('cal-lat').value = e && e.latitude != null ? String(e.latitude) : '';
    document.getElementById('cal-lng').value = e && e.longitude != null ? String(e.longitude) : '';
    document.getElementById('cal-related-query').value = '';
    document.getElementById('cal-related-results').innerHTML = '';
    document.getElementById('cal-geo-query').value = '';
    document.getElementById('cal-geo-results').innerHTML = '';
    _calModalTags = e && Array.isArray(e.event_tags) ? e.event_tags.slice() : [];
    _calModalTargetGroups = e && Array.isArray(e.target_groups) ? e.target_groups.slice() : [];
    _calModalRelatedPosts = e && Array.isArray(e.related_posts) ? e.related_posts.map(function (item) {
      return { id: item.id, title: item.title || '', category: item.category || item.related_post_category || '' };
    }) : [];
    _renderCalTags();
    _renderCalTagPresets();
    _renderCalTargetGroups();
    _renderCalRelatedPosts();
    _syncCalCategoryUi();
    _renderCalGeoPreview(
      e && e.latitude != null ? Number(e.latitude) : NaN,
      e && e.longitude != null ? Number(e.longitude) : NaN,
      e ? (e.location_address || e.location_name || '') : ''
    );
    document.getElementById('cal-delete-btn').style.display = e ? '' : 'none';
    document.getElementById('cal-modal').style.display = 'flex';
  }

  function _closeCalModal() {
    document.getElementById('cal-modal').style.display = 'none';
  }

  function _saveCal() {
    var id = document.getElementById('cal-id').value;
    var title = document.getElementById('cal-title').value.trim();
    var titleOriginal = document.getElementById('cal-title-original').value.trim();
    if (!title && !titleOriginal) { GW.showToast('행사명(국문) 또는 원문 제목을 입력해주세요', 'error'); return; }
    if (!document.getElementById('cal-start').value) { GW.showToast('행사 시작 일을 입력해주세요', 'error'); return; }
    var body = {
      title: title,
      title_original: titleOriginal,
      description: document.getElementById('cal-desc').value.trim(),
      start_date: document.getElementById('cal-start').value || '',
      start_time: document.getElementById('cal-start-time-enabled').checked ? (document.getElementById('cal-start-time').value || '') : '',
      end_date: document.getElementById('cal-end').value || '',
      end_time: document.getElementById('cal-end-time-enabled').checked ? (document.getElementById('cal-end-time').value || '') : '',
      event_category: document.getElementById('cal-cat').value || 'KOR',
      country_name: document.getElementById('cal-country').value.trim(),
      location_name: document.getElementById('cal-loc-name').value.trim(),
      location_address: document.getElementById('cal-loc-addr').value.trim(),
      latitude: document.getElementById('cal-lat').value || '',
      longitude: document.getElementById('cal-lng').value || '',
      event_tags: _calModalTags.slice(),
      target_groups: _calModalTargetGroups.slice(),
      related_post_id: _calModalRelatedPosts.length ? _calModalRelatedPosts[0].id : null,
      related_posts: _calModalRelatedPosts.slice(),
      link_url: document.getElementById('cal-link').value.trim(),
    };
    var method = id ? 'PUT' : 'POST';
    var url    = id ? '/api/calendar/' + id : '/api/calendar';
    var btn = document.getElementById('cal-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch(url, { method: method, body: JSON.stringify(body) })
      .then(function (data) {
        var saved = data && data.item;
        if (saved && saved.id) {
          var index = _calItems.findIndex(function (item) { return item.id === saved.id; });
          if (index >= 0) _calItems[index] = saved;
          else _calItems.unshift(saved);
          _renderCalList();
        }
        GW.showToast('저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
        _closeCalModal();
        _loadCalendar();
      }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  function _deleteCal(id) {
    _confirm('일정 삭제', '이 일정을 삭제하시겠습니까?').then(function (ok) {
      if (!ok) return;
      _apiFetch('/api/calendar/' + id, { method: 'DELETE' })
        .then(function () {
          GW.showToast('삭제했습니다', 'success');
          _closeCalModal();
          _loadCalendar();
        }).catch(function (e) { GW.showToast(e.message || '삭제 실패', 'error'); });
    });
  }

  /* ══════════════════════════════════════════════════════════
     GLOSSARY
  ══════════════════════════════════════════════════════════ */
  var GLOS_MISC_BUCKET = '기타';
  var GLOS_UNMATCHED_BUCKET = '국문 미확정 용어';
  var GLOS_BUCKETS = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하', GLOS_MISC_BUCKET, GLOS_UNMATCHED_BUCKET];
  var GLOS_CHOSEONG_BUCKETS = ['가','가','나','다','다','라','마','바','바','사','사','아','자','자','차','카','타','파','하'];

  function _glosNormalizeTermValue(value) {
    var raw = String(value || '').trim();
    return (raw === '-' || raw === '—') ? '' : raw;
  }

  function _glosInferBucket(termKo) {
    var first = _glosNormalizeTermValue(termKo).charAt(0);
    if (!first) return '';
    var code = first.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '';
    var choseongIndex = Math.floor((code - 0xac00) / 588);
    return GLOS_CHOSEONG_BUCKETS[choseongIndex] || '';
  }

  function _glosIsNumericStart(value) {
    var first = _glosNormalizeTermValue(value).charAt(0);
    return first >= '0' && first <= '9';
  }

  function _glosHasKorean(value) {
    return !!_glosNormalizeTermValue(value);
  }

  function _glosResolveBucket(item) {
    if (_glosIsNumericStart(item.term_ko) || _glosIsNumericStart(item.term_en) || _glosIsNumericStart(item.term_fr)) {
      return GLOS_MISC_BUCKET;
    }
    if (!_glosHasKorean(item.term_ko) && (_glosNormalizeTermValue(item.term_en) || _glosNormalizeTermValue(item.term_fr))) {
      return GLOS_UNMATCHED_BUCKET;
    }
    return _glosInferBucket(item.term_ko) || item.bucket || '가';
  }

  function _loadGlossary() {
    _apiFetch('/api/glossary?limit=500').then(function (data) {
      _glosItems = (data && data.terms) || (data && data.items) || [];
      _renderGlos();
    }).catch(function (e) {
      document.getElementById('glos-list').innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
    });
  }

  function _renderGlos() {
    var el = document.getElementById('glos-list');
    var q  = (_glosSearch || '').toLowerCase();
    var items = _glosItems.filter(function (t) {
      if (!q) return true;
      return (t.term_ko || '').toLowerCase().includes(q) ||
             (t.term_en || '').toLowerCase().includes(q) ||
             (t.term_fr || '').toLowerCase().includes(q);
    });
    if (!items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">용어가 없습니다</div></div>';
      return;
    }
    // Group by bucket
    var grouped = {};
    items.forEach(function (t) {
      var b = _glosResolveBucket(t);
      if (!grouped[b]) grouped[b] = [];
      grouped[b].push(t);
    });
    var html = '';
    GLOS_BUCKETS.forEach(function (bucket) {
      if (!grouped[bucket]) return;
      html += '<div class="v3-bucket-head">' + GW.escapeHtml(bucket) + '</div>';
      grouped[bucket].forEach(function (t) {
        html += '<div class="v3-glos-item" onclick="V3._openGlosItem(' + t.id + ')">' +
          '<div class="v3-glos-ko">' + (_glosHasKorean(t.term_ko) ? GW.escapeHtml(t.term_ko || '') : '<span class="v3-glos-ko-empty">국문 미확정</span>') + '</div>' +
          '<div class="v3-glos-en">' + GW.escapeHtml(t.term_en || '') + '</div>' +
          '<div class="v3-glos-fr">' + GW.escapeHtml(t.term_fr || '') + '</div>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation();V3._openGlosItem(' + t.id + ')">수정</button>' +
        '</div>';
      });
    });
    el.innerHTML = html;
  }

  V3._openGlosItem = function (id) {
    var t = _glosItems.find(function (x) { return x.id === id; });
    if (t) _openGlosModal(t);
  };

  function _openGlosModal(t) {
    document.getElementById('glos-id').value            = t ? t.id : '';
    document.getElementById('glos-modal-title').textContent = t ? '용어 수정' : '새 용어';
    document.getElementById('glos-ko').value            = t ? (t.term_ko || '') : '';
    document.getElementById('glos-en').value            = t ? (t.term_en || '') : '';
    document.getElementById('glos-fr').value            = t ? (t.term_fr || '') : '';
    document.getElementById('glos-desc').value          = t ? (t.description_ko || '') : '';
    document.getElementById('glos-delete-btn').style.display = t ? '' : 'none';
    document.getElementById('glos-modal').style.display = 'flex';
  }
  function _closeGlosModal() { document.getElementById('glos-modal').style.display = 'none'; }

  function _saveGlos() {
    var id = document.getElementById('glos-id').value;
    var ko = _glosNormalizeTermValue(document.getElementById('glos-ko').value);
    var en = _glosNormalizeTermValue(document.getElementById('glos-en').value);
    var fr = _glosNormalizeTermValue(document.getElementById('glos-fr').value);
    if (!ko && !en && !fr) { GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력하세요', 'error'); return; }
    var body = {
      term_ko:       ko,
      term_en:       en,
      term_fr:       fr,
      description_ko: document.getElementById('glos-desc').value.trim(),
      bucket: (_glosIsNumericStart(ko) || _glosIsNumericStart(en) || _glosIsNumericStart(fr))
        ? GLOS_MISC_BUCKET
        : ((!_glosHasKorean(ko) && (en || fr)) ? GLOS_UNMATCHED_BUCKET : (_glosInferBucket(ko) || GLOS_UNMATCHED_BUCKET)),
    };
    var method = id ? 'PUT' : 'POST';
    var url    = id ? '/api/glossary/' + id : '/api/glossary';
    var btn = document.getElementById('glos-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch(url, { method: method, body: JSON.stringify(body) })
      .then(function () {
        GW.showToast('저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
        _closeGlosModal();
        _loadGlossary();
      }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  function _deleteGlos(id) {
    _confirm('용어 삭제', '이 용어를 삭제하시겠습니까?').then(function (ok) {
      if (!ok) return;
      _apiFetch('/api/glossary/' + id, { method: 'DELETE' })
        .then(function () {
          GW.showToast('삭제했습니다', 'success');
          _closeGlosModal();
          _loadGlossary();
        }).catch(function (e) { GW.showToast(e.message || '삭제 실패', 'error'); });
    });
  }

  /* ══════════════════════════════════════════════════════════
     ANALYTICS
  ══════════════════════════════════════════════════════════ */
  function _loadAnalytics() {
    var period = document.getElementById('analytics-period').value;
    var statsEl = document.getElementById('analytics-stats');
    var bodyEl  = document.getElementById('analytics-body');
    statsEl.innerHTML = '<div class="v3-loading" style="grid-column:1/-1;"><div class="v3-spinner"></div>로딩 중…</div>';
    bodyEl.innerHTML  = '';

    _apiFetch('/api/admin/analytics?days=' + period).then(function (data) {
      var today    = data.today    || {};
      var summary  = data.summary  || {};
      var visitors = data.visitors || {};
      var views    = data.views    || {};
      var topPosts = data.article_top_posts || data.top_posts || data.top_paths || (views.top_paths || []);
      var sources  = data.sources  || data.referrers || [];

      // Stats
      statsEl.innerHTML =
        _statCard('오늘 방문',       _fmt(today.visits  || visitors.today_visits || summary.today_visits || 0), '오늘') +
        _statCard('오늘 조회',       _fmt(today.views   || summary.today_pageviews || summary.today_views || 0), '오늘') +
        _statCard(period + '일 방문', _fmt(summary.range_visits || visitors.range_visits || 0), '기간 합계') +
        _statCard(period + '일 조회', _fmt(summary.range_pageviews || views.range_pageviews || views.total || 0), '기간 합계') +
        _statCard('인기 기사 평균 체류', _fmt(summary.popular_post_average_dwell_seconds || 0) + '초', summary.popular_post_title || '대표 기사 기준') +
        _statCard('평균 체류',       _fmt(summary.average_dwell_seconds || 0) + '초', '기간 평균');

      // Top posts bar chart
      var html = '';
      if (topPosts.length) {
        var maxV = Math.max.apply(null, topPosts.map(function (p) { return p.views || 0; }));
        html += '<div class="v3-card v3-mt-16"><div class="v3-card-head"><h2 class="v3-card-title">인기 기사 (조회수)</h2></div><div class="v3-bar-list">';
        topPosts.slice(0, 10).forEach(function (p) {
          var pct = maxV > 0 ? Math.round((p.views || 0) / maxV * 100) : 0;
          html += '<div class="v3-bar-row">' +
            '<div class="v3-bar-label" title="' + GW.escapeHtml(p.title || p.path || '제목 없음') + '">' + GW.escapeHtml(p.title || p.path || '제목 없음') + '</div>' +
            '<div class="v3-bar-track"><div class="v3-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="v3-bar-val">' + _fmt(p.views || p.pageviews || 0) + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // Traffic sources
      if (sources.length) {
        var maxS = Math.max.apply(null, sources.map(function (s) { return s.visits || 0; }));
        html += '<div class="v3-card v3-mt-16"><div class="v3-card-head"><h2 class="v3-card-title">유입 경로</h2></div><div class="v3-bar-list">';
        sources.slice(0, 10).forEach(function (s) {
          var pct = maxS > 0 ? Math.round((s.visits || 0) / maxS * 100) : 0;
          html += '<div class="v3-bar-row">' +
            '<div class="v3-bar-label">' + GW.escapeHtml(s.source_label || s.referrer_host || '직접') + '</div>' +
            '<div class="v3-bar-track"><div class="v3-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="v3-bar-val">' + _fmt(s.visits || 0) + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      bodyEl.innerHTML = html || '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">분석 데이터가 없습니다</div></div></div>';
    }).catch(function (e) {
      statsEl.innerHTML = '<div class="v3-empty" style="grid-column:1/-1;"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
      bodyEl.innerHTML  = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">분석 API 응답을 불러오지 못했습니다</div></div></div>';
    });
  }

  function _statCard(label, value, sub) {
    return '<div class="v3-stat"><div class="v3-stat-label">' + GW.escapeHtml(label) + '</div>' +
      '<div class="v3-stat-value">' + GW.escapeHtml(String(value)) + '</div>' +
      '<div class="v3-stat-sub">' + GW.escapeHtml(sub) + '</div></div>';
  }

  /* ══════════════════════════════════════════════════════════
     MARKETING
  ══════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════
     RELEASES (버전기록)
  ══════════════════════════════════════════════════════════ */
  var _releasesData  = null;
  var _releasesScope = 'all';

  function _loadReleases() {
    var el = document.getElementById('releases-list');
    if (_releasesData) {
      _renderReleases(el, _releasesData, _releasesScope);
      return;
    }
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>불러오는 중…</div>';
    fetch('/data/changelog.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('not ok'); return r.json(); })
      .then(function (data) {
        _releasesData = (data && Array.isArray(data.items)) ? data.items : [];
        _renderReleases(el, _releasesData, _releasesScope);
      })
      .catch(function () {
        el.innerHTML = '<div class="v3-empty"><div class="v3-empty-icon">⚠️</div><div class="v3-empty-text">버전 기록을 불러오지 못했습니다</div></div>';
      });
  }

  function _renderReleases(el, items, scope) {
    var filtered = scope === 'all' ? items : items.filter(function (item) {
      var s = item.scope || 'both';
      return s === scope || s === 'both';
    });
    if (!filtered.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-icon">📋</div><div class="v3-empty-text">버전 기록이 없습니다</div></div>';
      return;
    }
    var typeClass = { Bugfix: 'v3-badge-gray', Hotfix: 'v3-badge-gray', Update: 'v3-badge-blue', Feature: 'v3-badge-green', Release: 'v3-badge-green' };
    el.innerHTML = filtered.map(function (item) {
      var badge = typeClass[item.type] || 'v3-badge-gray';
      var changeItems = Array.isArray(item.items) ? item.items : (Array.isArray(item.changes) ? item.changes : []);
      var s = item.scope || 'both';
      var scopeLabel = s === 'site' ? ' <span class="v3-badge" style="background:#0d7a5f;font-size:9px;">Site</span>' :
                       s === 'admin' ? ' <span class="v3-badge" style="background:#7c3aed;font-size:9px;">Admin</span>' : '';
      return '<div class="v3-card v3-release-card">' +
        '<div class="v3-release-head">' +
          '<span class="v3-release-version">V' + GW.escapeHtml(item.version || '') + '</span>' +
          '<span class="v3-badge ' + badge + '">' + GW.escapeHtml(item.type || '') + '</span>' +
          scopeLabel +
          '<span class="v3-release-date">' + GW.escapeHtml(item.date || '') + '</span>' +
        '</div>' +
        '<p class="v3-release-summary">' + GW.escapeHtml(item.summary || '') + '</p>' +
        (changeItems.length ? '<ul class="v3-release-items">' + changeItems.map(function (c) {
          return '<li>' + GW.escapeHtml(c) + '</li>';
        }).join('') + '</ul>' : '') +
      '</div>';
    }).join('');
  }

  function _setupReleaseTabs() {
    document.querySelectorAll('.v3-releases-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _releasesScope = btn.dataset.scope || 'all';
        document.querySelectorAll('.v3-releases-tab').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        var el = document.getElementById('releases-list');
        if (_releasesData) {
          _renderReleases(el, _releasesData, _releasesScope);
        } else {
          _loadReleases();
        }
      });
    });
  }

  function _kstToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  function _shiftDate(dateStr, offsetDays) {
    var d = new Date(dateStr + 'T00:00:00+09:00');
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }

  function _loadMarketing(actionBtn) {
    var el = document.getElementById('marketing-body');
    var fromEl = document.getElementById('mkt-date-from');
    var toEl   = document.getElementById('mkt-date-to');
    var today  = _kstToday();
    var start  = (fromEl && fromEl.value) || _shiftDate(today, -6);
    var end    = (toEl && toEl.value)   || today;
    // Clamp max range to 180 days (client-side guard)
    var startD = new Date(start + 'T00:00:00+09:00');
    var endD   = new Date(end   + 'T00:00:00+09:00');
    var diffDays = Math.round((endD - startD) / 86400000);
    if (diffDays > 180) { start = _shiftDate(end, -180); if (fromEl) fromEl.value = start; }
    if (startD > endD)  { var tmp = start; start = end; end = tmp; }
    if (actionBtn) _setButtonBusy(actionBtn, '조회 중…');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/admin/marketing?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end)).then(function (data) {
      var funnel = data.funnel || [];
      var utms   = data.utm_campaigns || [];
      var transitions = data.top_transitions || [];
      var summary = data.summary || {};
      var html =
        '<div class="marketing-layout-shell">' +
        '<div class="v3-analytics-stats marketing-stats-row">' +
          _statCard('고유 사용자', _fmt(summary.unique_users || 0), '기간 사용자') +
          _statCard('페이지뷰', _fmt(summary.total_pageviews || 0), '기간 합계') +
          _statCard('Awareness', _fmt(summary.awareness_users || 0), '첫 노출 단계') +
          _statCard('Interest', _fmt(summary.interest_users || 0), '관심 탐색 단계') +
          _statCard('Consideration', _fmt(summary.consideration_users || 0), '기사 읽기 단계') +
        '</div>' +
        '<div class="marketing-grid">' +
          '<section class="v3-card marketing-panel marketing-panel-wide">' +
            '<div class="v3-card-head">' +
              '<div><h2 class="v3-card-title">고객 여정 흐름</h2><div class="marketing-panel-meta" id="marketing-flow-meta">유입 채널 → 단계 → 대표 도착 페이지</div></div>' +
              '<div class="marketing-panel-actions"><button type="button" class="marketing-expand-btn" onclick="V3.openMarketingFullscreen(\'flow\')">전체화면 보기</button></div>' +
            '</div>' +
            '<div id="marketing-flow" class="marketing-flow-wrap"></div>' +
          '</section>' +
          '<section class="v3-card marketing-panel marketing-panel-wide">' +
            '<div class="v3-card-head">' +
              '<div><h2 class="v3-card-title">페이지 기회 맵</h2><div class="marketing-panel-meta">고유 사용자 · 재읽기 강도 · 공유 비중을 크게 확인합니다.</div></div>' +
              '<div class="marketing-panel-actions"><button type="button" class="marketing-expand-btn" onclick="V3.openMarketingFullscreen(\'scatter\')">전체화면 보기</button></div>' +
            '</div>' +
            '<div id="marketing-scatter" class="marketing-scatter-wrap"></div>' +
          '</section>' +
          '<section class="v3-card marketing-panel">' +
            '<div class="v3-card-head"><h2 class="v3-card-title">퍼널 (Funnel)</h2></div>' +
            '<div id="marketing-funnel" class="marketing-funnel-list"></div>' +
          '</section>' +
          '<section class="v3-card marketing-panel">' +
            '<div class="v3-card-head"><h2 class="v3-card-title">UTM 캠페인</h2></div>' +
            '<div id="marketing-utm"></div>' +
          '</section>' +
          '<section class="v3-card marketing-panel">' +
            '<div class="v3-card-head"><h2 class="v3-card-title">대표 이동 경로</h2></div>' +
            '<div id="marketing-transitions" class="v3-bar-list"></div>' +
          '</section>' +
          '<section class="v3-card marketing-panel">' +
            '<div class="v3-card-head"><h2 class="v3-card-title">운영 메모</h2></div>' +
            '<div id="marketing-notes" class="v3-bar-list"></div>' +
          '</section>' +
        '</div>' +
        '</div>';
      el.innerHTML = html;
      _renderMarketingFunnel(funnel);
      _renderMarketingUtm(utms);
      _renderMarketingTransitions(transitions, summary);
      _renderMarketingNotes(data.notes || []);
      _renderMarketingFlow(data.journey_flow || null);
      _renderMarketingScatter(data.page_opportunities || []);
      var hasFlow = !!(data.journey_flow && Array.isArray(data.journey_flow.links) && data.journey_flow.links.length);
      var hasScatter = !!(data.page_opportunities && data.page_opportunities.length);
      if (!hasFlow && !hasScatter) {
        el.insertAdjacentHTML('beforeend', '<div class="v3-card v3-mt-16"><div class="v3-empty"><div class="v3-empty-text">마케팅 차트용 데이터가 아직 충분하지 않거나 응답 구조를 확인해야 합니다.</div></div></div>');
      }
    }).catch(function (e) {
      el.innerHTML = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">데이터를 불러올 수 없습니다: ' + GW.escapeHtml((e && e.message) || 'API 오류') + '</div></div></div>';
    }).finally(function () {
      if (actionBtn) _clearButtonBusy(actionBtn, '완료');
    });
  }

  function _renderMarketingFunnel(items) {
    var el = document.getElementById('marketing-funnel');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">퍼널 데이터가 없습니다</div></div>';
      return;
    }
    el.innerHTML = items.map(function (item) {
      var pct = Math.max(8, Math.min(100, Math.round(Number(item.pct || item.rate || 0))));
      return '<article class="marketing-funnel-item">' +
        '<div class="marketing-funnel-head"><strong>' + GW.escapeHtml(item.label || item.stage || '') + '</strong><span>' + _fmt(item.count || item.users || 0) + ' · ' + pct + '%</span></div>' +
        '<div class="marketing-funnel-track"><span class="marketing-funnel-fill marketing-stage-' + GW.escapeHtml(item.key || item.stage || 'awareness').toLowerCase() + '" style="width:' + pct + '%;"></span></div>' +
        '<p>' + GW.escapeHtml(item.description || '') + '</p>' +
      '</article>';
    }).join('');
  }

  function _renderMarketingUtm(items) {
    var el = document.getElementById('marketing-utm');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">UTM 데이터가 없습니다</div></div>';
      return;
    }
    el.innerHTML = '<div class="v3-table-wrap"><table class="v3-table"><thead><tr><th>캠페인</th><th>소스</th><th>매체</th><th>방문</th></tr></thead><tbody>' +
      items.map(function (u) {
        return '<tr><td>' + GW.escapeHtml(u.campaign || '') + '</td><td>' + GW.escapeHtml(u.source || '') + '</td><td>' + GW.escapeHtml(u.medium || '') + '</td><td>' + _fmt(u.visits || 0) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function _renderMarketingNotes(items) {
    var el = document.getElementById('marketing-notes');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">운영 메모가 없습니다</div></div>';
      return;
    }
    el.innerHTML = items.map(function (item) {
      return '<div class="v3-bar-row v3-bar-row-stack"><div class="v3-bar-label-wrap"><div class="v3-bar-title">' + GW.escapeHtml(item.title || '운영 메모') + '</div><div class="v3-bar-meta">' + GW.escapeHtml([item.value || '', item.meta || ''].filter(Boolean).join(' · ')) + '</div></div></div>';
    }).join('');
  }

  function _renderMarketingTransitions(items, summary) {
    var el = document.getElementById('marketing-transitions');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">대표 이동 경로가 없습니다</div></div>';
      return;
    }
    var totalUsers = Math.max(1, Number(summary && summary.unique_users || 1));
    el.innerHTML = items.map(function (item) {
      var label = (item.from_title || '시작') + ' → ' + (item.to_title || '도착');
      var pct = Math.max(8, Math.min(100, Math.round((Number(item.users || 0) / totalUsers) * 100)));
      return '<div class="v3-bar-row">' +
        '<div class="v3-bar-label" title="' + GW.escapeHtml(label) + '">' + GW.escapeHtml(label) + '</div>' +
        '<div class="v3-bar-track"><div class="v3-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="v3-bar-val">' + _fmt(item.users || 0) + '</div>' +
      '</div>';
    }).join('');
  }

  function _renderMarketingFlow(flow) {
    var el = document.getElementById('marketing-flow');
    if (!el) return;
    if (!flow || !Array.isArray(flow.links) || !flow.links.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">아직 흐름 데이터가 없습니다</div></div>';
      return;
    }
    var sources = Array.isArray(flow.sources) ? flow.sources : [];
    var stages = Array.isArray(flow.stages) ? flow.stages : [];
    var destinations = Array.isArray(flow.destinations) ? flow.destinations : [];
    var links = flow.links.slice();
    var columns = [sources, stages, destinations];
    var nodeMap = new Map();
    var maxDestinationChars = destinations.reduce(function (acc, item) {
      return Math.max(acc, String((item && item.label) || '').length);
    }, 0);
    var padLeft = 40;
    var padRight = 40;
    var padTop = 36;
    var padBottom = 40;
    var nodeW = 18;
    var rightLabelRunway = Math.max(380, Math.min(860, maxDestinationChars * 12));
    var leftColumnX = padLeft + 44;
    var middleColumnX = leftColumnX + 520;
    var rightColumnX = middleColumnX + rightLabelRunway;
    var colX = [leftColumnX, middleColumnX, rightColumnX];
    var W = rightColumnX + nodeW + padRight;
    var baseH = 460;
    var columnInfo = columns.map(function (items, idx) {
      var totals = items.map(function (item) {
        var incoming = links.filter(function (link) { return link.target === item.id; }).reduce(function (sum, link) { return sum + Number(link.value || 0); }, 0);
        var outgoing = links.filter(function (link) { return link.source === item.id; }).reduce(function (sum, link) { return sum + Number(link.value || 0); }, 0);
        var total = idx === 0 ? outgoing : (idx === 2 ? incoming : Math.max(incoming, outgoing, Number(item.value || 0)));
        return Math.max(total, 1);
      });
      var totalValue = totals.reduce(function (sum, value) { return sum + value; }, 0) || 1;
      return { items: items, totals: totals, totalValue: totalValue };
    });
    var maxColumnValue = columnInfo.reduce(function (acc, col) { return Math.max(acc, col.totalValue); }, 1);
    var gap = 14;
    var availableH = baseH - padTop - padBottom;
    var scale = Math.max(0.25, (availableH - gap * 5) / maxColumnValue);
    var maxY = padTop;

    columnInfo.forEach(function (column, columnIndex) {
      var y = padTop;
      column.items.forEach(function (item, itemIndex) {
        var h = Math.max(26, Math.round(column.totals[itemIndex] * scale));
        var node = {
          id: item.id,
          x: colX[columnIndex],
          y: y,
          w: nodeW,
          h: h,
          value: column.totals[itemIndex],
          label: item.label || item.key || '',
          color: item.color || '#7c4dff',
          incomingOffset: 0,
          outgoingOffset: 0
        };
        nodeMap.set(item.id, node);
        maxY = Math.max(maxY, y + h);
        y += h + gap;
      });
    });
    var H = Math.max(baseH, maxY + padBottom);

    var linkParts = links.map(function (link) {
      var sourceNode = nodeMap.get(link.source);
      var targetNode = nodeMap.get(link.target);
      if (!sourceNode || !targetNode) return '';
      var thickness = Math.max(4, Number(link.value || 0) * scale);
      var sy = sourceNode.y + sourceNode.outgoingOffset + (thickness / 2);
      var ty = targetNode.y + targetNode.incomingOffset + (thickness / 2);
      sourceNode.outgoingOffset += thickness;
      targetNode.incomingOffset += thickness;
      var sx = sourceNode.x + sourceNode.w;
      var tx = targetNode.x;
      var c1 = sx + 140;
      var c2 = tx - 140;
      var tipText = (sourceNode.label || '') + ' → ' + (targetNode.label || '') + ' · ' + _fmt(link.value || 0);
      return '<path d="M ' + sx + ' ' + sy + ' C ' + c1 + ' ' + sy + ', ' + c2 + ' ' + ty + ', ' + tx + ' ' + ty + '"' +
        ' stroke="' + GW.escapeHtml(link.color || sourceNode.color) + '"' +
        ' stroke-opacity="0.22" stroke-width="' + thickness.toFixed(2) + '" fill="none" stroke-linecap="round" class="marketing-flow-link" data-tip="' + GW.escapeHtml(tipText) + '"></path>';
    }).join('');

    var nodeParts = Array.from(nodeMap.values()).map(function (node) {
      var labelX = node.x + node.w + 12;
      var labelAnchor = 'start';
      if (node.x === colX[2]) {
        labelX = node.x - 12;
        labelAnchor = 'end';
      }
      var displayLabel = _trimMarketingTitle(node.label, node.x === colX[2] ? 42 : 22);
      var tip = node.label + ' · ' + _fmt(node.value || 0);
      return '<g class="marketing-flow-node" data-tip="' + GW.escapeHtml(tip) + '">' +
        '<rect x="' + node.x + '" y="' + node.y + '" width="' + node.w + '" height="' + node.h + '" rx="7" fill="' + GW.escapeHtml(node.color) + '"></rect>' +
        '<text x="' + labelX + '" y="' + (node.y + 18) + '" text-anchor="' + labelAnchor + '" class="marketing-flow-label">' + GW.escapeHtml(displayLabel) + '</text>' +
        '<text x="' + labelX + '" y="' + (node.y + 34) + '" text-anchor="' + labelAnchor + '" class="marketing-flow-value">' + GW.escapeHtml(_fmt(node.value || 0)) + '</text>' +
      '</g>';
    }).join('');

    el.innerHTML =
      '<div class="marketing-flow-zoom-bar">' +
        '<button type="button" class="marketing-flow-zoom-btn" data-pz="out">−</button>' +
        '<button type="button" class="marketing-flow-zoom-btn" data-pz="reset">100%</button>' +
        '<button type="button" class="marketing-flow-zoom-btn" data-pz="in">+</button>' +
      '</div>' +
      '<div class="marketing-flow-shell"><div class="marketing-hover-tip" aria-hidden="true"></div><div class="marketing-chart-stage"><svg class="marketing-flow-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="고객 여정 흐름">' + linkParts + nodeParts + '</svg></div></div>';
    _bindMarketingHoverTips(el);
  }

  function _renderMarketingScatter(items) {
    var el = document.getElementById('marketing-scatter');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">페이지 기회 맵 데이터가 없습니다</div></div>';
      return;
    }
    var availableWidth = Math.max(920, Math.min(1360, ((el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 1080) - 8)));
    var W = availableWidth;
    var H = Math.max(420, Math.min(560, Math.round(W * 0.42)));
    var margin = { top: 20, right: 30, bottom: 52, left: 64 };
    var innerW = W - margin.left - margin.right;
    var innerH = H - margin.top - margin.bottom;
    var maxUsers = items.reduce(function (acc, item) { return Math.max(acc, Number(item.unique_users || 0)); }, 1);
    var minUsers = items.reduce(function (acc, item) {
      var value = Number(item.unique_users || 0);
      return value > 0 ? Math.min(acc, value) : acc;
    }, maxUsers || 1);
    var maxDepth = items.reduce(function (acc, item) { return Math.max(acc, Number(item.views_per_user || 0)); }, 1);
    var minDepth = items.reduce(function (acc, item) { return Math.min(acc, Number(item.views_per_user || 0)); }, maxDepth || 0);
    var maxPageviews = items.reduce(function (acc, item) { return Math.max(acc, Number(item.pageviews || 0)); }, 1);

    function xScale(value) {
      var safeMin = Math.max(1, minUsers || 1);
      var safeMax = Math.max(safeMin + 1, maxUsers || 1);
      var numerator = Math.log(Math.max(1, value)) - Math.log(safeMin);
      var denominator = Math.log(safeMax) - Math.log(safeMin) || 1;
      return margin.left + (numerator / denominator) * innerW;
    }
    function yScale(value) {
      var safeMin = Math.min(minDepth, 0);
      var safeMax = Math.max(safeMin + 0.5, maxDepth || 1);
      var ratio = (Number(value || 0) - safeMin) / (safeMax - safeMin || 1);
      return margin.top + innerH - (ratio * innerH);
    }
    var minRadius = 7;
    var maxRadius = Math.max(18, Math.min(24, innerH * 0.08));

    function rScale(value) {
      var ratio = Math.sqrt(Math.max(0, Number(value || 0)) / maxPageviews);
      return minRadius + (ratio * (maxRadius - minRadius));
    }
    function clamp(num, min, max) {
      return Math.max(min, Math.min(max, num));
    }
    var points = items.map(function (item, index) {
      var radius = rScale(item.pageviews || 0);
      var cx = clamp(xScale(item.unique_users || 1), margin.left + radius + 4, margin.left + innerW - radius - 4);
      var cy = clamp(yScale(item.views_per_user || 0), margin.top + radius + 4, margin.top + innerH - radius - 4);
      var color = _marketingStageColor(item.stage);
      var labelRightX = cx + radius + 6;
      var labelLeftX = cx - radius - 6;
      var labelFitsRight = labelRightX < (margin.left + innerW - 110);
      var labelX = labelFitsRight ? labelRightX : labelLeftX;
      var labelAnchor = labelFitsRight ? 'start' : 'end';
      var label = index < 8 ? '<text x="' + labelX + '" y="' + (cy + 4) + '" text-anchor="' + labelAnchor + '" class="marketing-scatter-label">' + GW.escapeHtml(_trimMarketingTitle(item.title, 16)) + '</text>' : '';
      var tip = item.title + ' · 경로 ' + item.path + ' · 사용자 ' + _fmt(item.unique_users) + ' · 페이지뷰 ' + _fmt(item.pageviews) + ' · 1인당 조회 ' + item.views_per_user + '회 · 공유 유입 ' + Math.round((item.share_ratio || 0) * 100) + '%';
      var href = String(item.path || '').indexOf('/post/') === 0 ? item.path : '';
      return '<g class="marketing-scatter-point' + (href ? ' is-clickable' : '') + '" data-tip="' + GW.escapeHtml(tip) + '"' + (href ? ' data-href="' + GW.escapeHtml(href) + '"' : '') + '>' +
        '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + radius.toFixed(2) + '" fill="' + color + '" fill-opacity="0.72" stroke="' + color + '" stroke-width="2"></circle>' +
        label +
      '</g>';
    }).join('');
    var axis = [
      '<line x1="' + margin.left + '" y1="' + (margin.top + innerH) + '" x2="' + (margin.left + innerW) + '" y2="' + (margin.top + innerH) + '" class="marketing-axis"></line>',
      '<line x1="' + margin.left + '" y1="' + margin.top + '" x2="' + margin.left + '" y2="' + (margin.top + innerH) + '" class="marketing-axis"></line>',
      '<text x="' + (margin.left + innerW / 2) + '" y="' + (H - 12) + '" class="marketing-axis-title" text-anchor="middle">고유 사용자 수 (로그)</text>',
      '<text x="18" y="' + (margin.top + innerH / 2) + '" class="marketing-axis-title" transform="rotate(-90 18 ' + (margin.top + innerH / 2) + ')" text-anchor="middle">1인당 조회 수</text>'
    ].join('');
    var legend = [
      { key: 'awareness', label: 'Awareness' },
      { key: 'interest', label: 'Interest' },
      { key: 'consideration', label: 'Consideration' }
    ].map(function (item) {
      return '<span><i style="background:' + _marketingStageColor(item.key) + ';"></i>' + GW.escapeHtml(item.label) + '</span>';
    }).join('');
    el.innerHTML = '<div class="marketing-scatter-legend">' + legend + '</div><div class="marketing-scatter-shell"><div class="marketing-hover-tip" aria-hidden="true"></div><div class="marketing-chart-stage"><svg class="marketing-scatter-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="페이지 기회 맵">' + axis + points + '</svg></div></div>';
    _bindMarketingHoverTips(el);
  }

  function _bindMarketingHoverTips(root) {
    if (!root || root.dataset.hoverTipsBound === '1') return;
    root.dataset.hoverTipsBound = '1';
    var shell = root.querySelector('.marketing-flow-shell, .marketing-scatter-shell');
    var tooltip = root.querySelector('.marketing-hover-tip');
    if (!shell || !tooltip) return;
    shell.addEventListener('mousemove', function (event) {
      if (shell._pzDragging) { tooltip.classList.remove('open'); return; }
      var target = event.target.closest('[data-tip]');
      if (!target || !shell.contains(target)) {
        tooltip.classList.remove('open');
        return;
      }
      tooltip.textContent = target.getAttribute('data-tip') || '';
      tooltip.classList.add('open');
      var bounds = shell.getBoundingClientRect();
      tooltip.style.left = (event.clientX - bounds.left + 16) + 'px';
      tooltip.style.top = (event.clientY - bounds.top + 16) + 'px';
    });
    shell.addEventListener('mouseleave', function () {
      tooltip.classList.remove('open');
    });
    shell.addEventListener('click', function (event) {
      if (shell._pzHasDragged) return;
      var target = event.target.closest('[data-href]');
      if (!target || !shell.contains(target)) return;
      var href = target.getAttribute('data-href') || '';
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    });
    if (shell.classList.contains('marketing-flow-shell')) _bindMarketingPanZoom(shell);
  }

  function _bindMarketingPanZoom(shell) {
    if (!shell || shell.dataset.panZoomBound === '1') return;
    shell.dataset.panZoomBound = '1';
    var svg = shell.querySelector('svg');
    if (!svg) return;
    shell.classList.add('is-panzoom');
    var pz = { zoom: 1, x: 0, y: 0 };
    shell._pzDragging = false;
    shell._pzHasDragged = false;
    var _startX = 0, _startY = 0, _startPanX = 0, _startPanY = 0;

    function applyTransform() {
      svg.style.transform = 'translate(' + pz.x + 'px,' + pz.y + 'px) scale(' + pz.zoom + ')';
    }

    function adjustZoom(delta) {
      pz.zoom = Math.max(0.25, Math.min(5, Number((pz.zoom + delta).toFixed(3))));
      applyTransform();
    }

    // 버튼 줌 (shell의 부모 wrap에서 버튼 찾기)
    var wrap = shell.parentNode;
    if (wrap) {
      wrap.querySelectorAll('[data-pz]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-pz');
          if (action === 'in')    adjustZoom(0.2);
          else if (action === 'out')   adjustZoom(-0.2);
          else if (action === 'reset') { pz.zoom = 1; pz.x = 0; pz.y = 0; applyTransform(); }
        });
      });
    }

    shell.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      shell._pzDragging = true;
      shell._pzHasDragged = false;
      _startX = e.clientX; _startY = e.clientY;
      _startPanX = pz.x;   _startPanY = pz.y;
      shell.classList.add('is-dragging');
    });

    document.addEventListener('mousemove', function (e) {
      if (!shell._pzDragging) return;
      var dx = e.clientX - _startX;
      var dy = e.clientY - _startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) shell._pzHasDragged = true;
      pz.x = _startPanX + dx;
      pz.y = _startPanY + dy;
      applyTransform();
    });

    document.addEventListener('mouseup', function () {
      if (!shell._pzDragging) return;
      shell._pzDragging = false;
      shell.classList.remove('is-dragging');
      setTimeout(function () { shell._pzHasDragged = false; }, 0);
    });

  }

  function _marketingStageColor(stage) {
    if (stage === 'awareness') return '#ff8c42';
    if (stage === 'interest') return '#2f9e44';
    return '#e64980';
  }

  function _trimMarketingTitle(value, limit) {
    var text = String(value || '').trim();
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(1, limit - 1)) + '…';
  }

  var _marketingFullscreenZoom = 1;

  V3.openMarketingFullscreen = function (kind) {
    var modal = document.getElementById('marketing-fullscreen-modal');
    var body = document.getElementById('marketing-fullscreen-body');
    var title = document.getElementById('marketing-fullscreen-title');
    var meta = document.getElementById('marketing-fullscreen-meta');
    if (!modal || !body || !title || !meta) return;
    var sourceId = kind === 'scatter' ? 'marketing-scatter' : 'marketing-flow';
    var sourceEl = document.getElementById(sourceId);
    if (!sourceEl) return;
    _marketingFullscreenZoom = 1;
    body.innerHTML = '<div id="marketing-fullscreen-zoom-stage" class="marketing-fullscreen-zoom-stage">' + sourceEl.innerHTML + '</div>';
    title.textContent = kind === 'scatter' ? '페이지 기회 맵' : '고객 여정 흐름';
    meta.textContent = kind === 'scatter'
      ? '고유 사용자 · 재읽기 강도 · 공유 비중을 크게 확인합니다.'
      : ((document.getElementById('marketing-flow-meta') || {}).textContent || '유입 채널 → 단계 → 대표 도착 페이지');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('marketing-fullscreen-open');
    V3.resetMarketingFullscreenZoom();
    _bindMarketingHoverTips(body);
  };

  V3.closeMarketingFullscreen = function () {
    var modal = document.getElementById('marketing-fullscreen-modal');
    var body = document.getElementById('marketing-fullscreen-body');
    if (!modal || !body) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
    document.body.classList.remove('marketing-fullscreen-open');
    _marketingFullscreenZoom = 1;
  };

  V3.adjustMarketingFullscreenZoom = function (delta) {
    _marketingFullscreenZoom = Math.max(0.5, Math.min(2.2, Number((_marketingFullscreenZoom + Number(delta || 0)).toFixed(2))));
    _applyMarketingFullscreenZoom();
  };

  V3.resetMarketingFullscreenZoom = function () {
    _marketingFullscreenZoom = 1;
    _applyMarketingFullscreenZoom();
  };

  function _applyMarketingFullscreenZoom() {
    var stage = document.getElementById('marketing-fullscreen-zoom-stage');
    if (!stage) return;
    stage.style.zoom = String(_marketingFullscreenZoom);
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – HERO
  ══════════════════════════════════════════════════════════ */
  function _loadHero() {
    var el = document.getElementById('hero-slots');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/hero').then(function (data) {
      _heroPostIds  = (data && data.post_ids) || ((data && Array.isArray(data.posts)) ? data.posts.map(function (p) { return p.id; }).filter(Boolean) : []);
      _heroInterval = (data && data.interval_ms) || 3000;
      document.getElementById('hero-interval').value = _heroInterval;
      _renderHeroSlots();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderHeroSlots() {
    var el = document.getElementById('hero-slots');
    if (!_heroPostIds.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">히어로 기사가 없습니다. 검색해서 추가하세요.</div></div>';
      return;
    }
    // Fetch post details for each id
    Promise.all(_heroPostIds.map(function (id) {
      return _apiFetch('/api/posts/' + id).catch(function () { return null; });
    })).then(function (posts) {
      el.innerHTML = posts.map(function (data, i) {
        var p = data && (data.post || data);
        if (!p) return '<div class="v3-hero-slot"><div class="v3-hero-slot-num">' + (i + 1) + '</div><div class="v3-text-m">불러오기 실패</div><button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3._removeHero(' + i + ')">×</button></div>';
        return '<div class="v3-hero-slot">' +
          '<div class="v3-hero-slot-num">' + (i + 1) + '</div>' +
          (p.image_url ? '<img class="v3-hero-thumb" src="' + GW.escapeHtml(p.image_url) + '" alt="" />' : '<div class="v3-hero-thumb"></div>') +
          '<div class="v3-hero-info">' +
            '<div class="v3-hero-post-title">' + GW.escapeHtml(p.title || '') + '</div>' +
            '<div class="v3-hero-post-cat">' + GW.escapeHtml(p.category || '') + '</div>' +
          '</div>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3._moveHero(' + i + ',-1)" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3._moveHero(' + i + ',1)" ' + (i === _heroPostIds.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:#ef4444;" onclick="V3._removeHero(' + i + ')">×</button>' +
        '</div>';
      }).join('');
    });
  }

  V3._removeHero = function (i) { _heroPostIds.splice(i, 1); _renderHeroSlots(); };
  V3._moveHero   = function (i, dir) {
    var j = i + dir;
    if (j < 0 || j >= _heroPostIds.length) return;
    var tmp = _heroPostIds[i]; _heroPostIds[i] = _heroPostIds[j]; _heroPostIds[j] = tmp;
    _renderHeroSlots();
  };

  function _searchHero(q) {
    var el = document.getElementById('hero-search-results');
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8&published=1').then(function (data) {
      var posts = (data && data.posts) || [];
      if (!posts.length) { el.style.display = 'none'; return; }
      el.innerHTML = posts.map(function (p) {
        var already = _heroPostIds.includes(p.id);
        return '<div class="v3-search-result-item' + (already ? '" style="opacity:.5;"' : '" onclick="V3._addHeroPost(' + p.id + ')"') + '>' +
          GW.escapeHtml(p.title || '') + (already ? ' (이미 추가됨)' : '') +
        '</div>';
      }).join('');
      el.style.display = 'block';
    }).catch(function () { el.style.display = 'none'; });
  }

  V3._addHeroPost = function (id) {
    if (_heroPostIds.length >= 5) { GW.showToast('최대 5개까지 추가할 수 있습니다', 'error'); return; }
    if (_heroPostIds.includes(id)) return;
    _heroPostIds.push(id);
    _renderHeroSlots();
    document.getElementById('hero-search-results').style.display = 'none';
    document.getElementById('hero-search').value = '';
  };

  function _saveHero() {
    var interval = parseInt(document.getElementById('hero-interval').value, 10) || 3000;
    var btn = document.getElementById('hero-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/hero', {
      method: 'PUT',
      body: JSON.stringify({ post_ids: _heroPostIds, interval_ms: interval }),
    }).then(function () {
      GW.showToast('히어로 설정을 저장했습니다', 'success');
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – HOME LEAD
  ══════════════════════════════════════════════════════════ */
  function _defaultHomeLeadMedia() {
    return {
      fit: 'cover',
      desktop: { position_x: 50, position_y: 50, zoom: 100 },
      mobile: { position_x: 50, position_y: 50, zoom: 100 },
    };
  }

  function _cloneHomeLeadMedia(source) {
    var raw = source && typeof source === 'object' ? source : {};
    var base = _defaultHomeLeadMedia();
    return {
      fit: raw.fit === 'contain' ? 'contain' : 'cover',
      desktop: {
        position_x: _clampNumber(raw.desktop && raw.desktop.position_x, 0, 100, base.desktop.position_x),
        position_y: _clampNumber(raw.desktop && raw.desktop.position_y, 0, 100, base.desktop.position_y),
        zoom: _clampNumber(raw.desktop && raw.desktop.zoom, 60, 150, base.desktop.zoom),
      },
      mobile: {
        position_x: _clampNumber(raw.mobile && raw.mobile.position_x, 0, 100, base.mobile.position_x),
        position_y: _clampNumber(raw.mobile && raw.mobile.position_y, 0, 100, base.mobile.position_y),
        zoom: _clampNumber(raw.mobile && raw.mobile.zoom, 60, 150, base.mobile.zoom),
      },
    };
  }

  function _loadHomeLeadUI() {
    var wrap = document.getElementById('home-lead-selected');
    if (wrap) wrap.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/home-lead').then(function (data) {
      _homeLeadPost = data && data.post ? data.post : null;
      _homeLeadMedia = _cloneHomeLeadMedia(data && data.media);
      _syncHomeLeadControls();
      _renderHomeLeadSelected();
    }).catch(function () {
      if (wrap) wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
    });
  }

  function _syncHomeLeadControls() {
    var media = _homeLeadMedia || _defaultHomeLeadMedia();
    _homeLeadMedia = media;
    _setControlValue('home-lead-fit', media.fit || 'cover');
    _setRangeValue('home-lead-desktop-x', media.desktop.position_x);
    _setRangeValue('home-lead-desktop-y', media.desktop.position_y);
    _setRangeValue('home-lead-desktop-zoom', media.desktop.zoom);
    _setRangeValue('home-lead-mobile-x', media.mobile.position_x);
    _setRangeValue('home-lead-mobile-y', media.mobile.position_y);
    _setRangeValue('home-lead-mobile-zoom', media.mobile.zoom);
    _setText('home-lead-desktop-x-value', media.desktop.position_x + '%');
    _setText('home-lead-desktop-y-value', media.desktop.position_y + '%');
    _setText('home-lead-desktop-zoom-value', media.desktop.zoom + '%');
    _setText('home-lead-mobile-x-value', media.mobile.position_x + '%');
    _setText('home-lead-mobile-y-value', media.mobile.position_y + '%');
    _setText('home-lead-mobile-zoom-value', media.mobile.zoom + '%');
  }

  function _renderHomeLeadSelected() {
    var wrap = document.getElementById('home-lead-selected');
    if (!wrap) return;
    if (!_homeLeadPost) {
      wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">메인 스토리 지정 글이 없습니다.</div></div>';
      _renderHomeLeadPreview(null);
      return;
    }
    wrap.innerHTML = '<div class="v3-selected-post-card">' +
      '<div class="v3-selected-post-head">' +
        '<span class="v3-badge ' + _catBadge(_homeLeadPost.category) + '">' + GW.escapeHtml(_homeLeadPost.category || '') + '</span>' +
        '<span class="v3-selected-post-meta">' + GW.escapeHtml(_homeLeadPost.publish_at || _homeLeadPost.created_at || '') + '</span>' +
      '</div>' +
      '<div class="v3-selected-post-title">' + GW.escapeHtml(_homeLeadPost.title || '(제목 없음)') + '</div>' +
      (_homeLeadPost.subtitle ? '<div class="v3-selected-post-subtitle">' + GW.escapeHtml(_homeLeadPost.subtitle) + '</div>' : '') +
      '<div class="v3-selected-post-actions">' +
        '<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" onclick="V3._clearHomeLead()">해제</button>' +
      '</div>' +
    '</div>';
    _renderHomeLeadPreview(_homeLeadPost.image_url || '');
  }

  function _renderHomeLeadPreview(imageUrl) {
    ['desktop', 'mobile'].forEach(function (device) {
      var frame = document.getElementById('home-lead-preview-' + device);
      if (!frame) return;
      if (!imageUrl) {
        frame.innerHTML = '<div class="v3-media-preview-empty">대표 이미지가 있는 게시글을 선택하면 여기서 프레이밍을 확인할 수 있습니다.</div>';
        return;
      }
      var media = _homeLeadMedia || _defaultHomeLeadMedia();
      var settings = media[device];
      var fit = media.fit === 'contain' ? 'contain' : 'cover';
      var showBackdrop = fit === 'contain' || settings.zoom < 100;
      var imgStyle = 'object-fit:' + fit + ';object-position:' + settings.position_x + '% ' + settings.position_y + '%;transform:scale(' + (settings.zoom / 100) + ');';
      frame.innerHTML =
        '<div class="v3-media-preview-backdrop' + (showBackdrop ? ' is-visible' : '') + '" style="background-image:url(' + GW.escapeHtml(imageUrl) + ')"></div>' +
        '<img src="' + GW.escapeHtml(imageUrl) + '" alt="" style="' + imgStyle + '">';
    });
  }

  function _searchHomeLead(q) {
    var el = document.getElementById('home-lead-search-results');
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8&published=1').then(function (data) {
      var posts = (data && data.posts) || [];
      if (!posts.length) {
        el.style.display = 'none';
        return;
      }
      el.innerHTML = posts.map(function (p) {
        return '<div class="v3-search-result-item" onclick="V3._selectHomeLead(' + p.id + ')">' +
          '<div class="v3-search-result-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
          '<div class="v3-search-result-meta">' + GW.escapeHtml(p.category || '') + '</div>' +
        '</div>';
      }).join('');
      el.style.display = 'block';
    }).catch(function () {
      el.style.display = 'none';
    });
  }

  V3._selectHomeLead = function (id) {
    _apiFetch('/api/posts/' + id).then(function (data) {
      var post = data && (data.post || data);
      if (!post || !post.published) {
        GW.showToast('공개된 게시글만 선택할 수 있습니다', 'error');
        return;
      }
      _homeLeadPost = post;
      if (!_homeLeadMedia) _homeLeadMedia = _defaultHomeLeadMedia();
      _renderHomeLeadSelected();
      document.getElementById('home-lead-search-results').style.display = 'none';
      document.getElementById('home-lead-search').value = '';
    }).catch(function (e) {
      GW.showToast(e.message || '게시글을 불러오지 못했습니다', 'error');
    });
  };

  V3._clearHomeLead = function () {
    _clearHomeLeadSelection();
  };

  function _clearHomeLeadSelection() {
    _homeLeadPost = null;
    _homeLeadMedia = _defaultHomeLeadMedia();
    _syncHomeLeadControls();
    _renderHomeLeadSelected();
  }

  function _handleHomeLeadControlChange() {
    if (!_homeLeadMedia) _homeLeadMedia = _defaultHomeLeadMedia();
    _homeLeadMedia.fit = document.getElementById('home-lead-fit').value === 'contain' ? 'contain' : 'cover';
    _homeLeadMedia.desktop.position_x = _getRangeNumber('home-lead-desktop-x', 50);
    _homeLeadMedia.desktop.position_y = _getRangeNumber('home-lead-desktop-y', 50);
    _homeLeadMedia.desktop.zoom = _getRangeNumber('home-lead-desktop-zoom', 100);
    _homeLeadMedia.mobile.position_x = _getRangeNumber('home-lead-mobile-x', 50);
    _homeLeadMedia.mobile.position_y = _getRangeNumber('home-lead-mobile-y', 50);
    _homeLeadMedia.mobile.zoom = _getRangeNumber('home-lead-mobile-zoom', 100);
    _syncHomeLeadControls();
    _renderHomeLeadPreview(_homeLeadPost && _homeLeadPost.image_url ? _homeLeadPost.image_url : '');
  }

  function _saveHomeLead() {
    var btn = document.getElementById('home-lead-save-btn');
    var payload = _homeLeadPost ? { post_id: _homeLeadPost.id, media: _homeLeadMedia || _defaultHomeLeadMedia() } : { post_id: null };
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/home-lead', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then(function () {
      GW.showToast('메인 스토리 설정을 저장했습니다', 'success');
      _clearButtonBusy(btn, '완료');
      _loadHomeLeadUI();
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () {
      if (btn.classList.contains('is-busy')) _clearButtonBusy(btn);
    });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – EDITOR PICKS
  ══════════════════════════════════════════════════════════ */
  function _loadPicksUI() {
    var wrap = document.getElementById('picks-selected');
    var meta = document.getElementById('picks-meta');
    if (wrap) wrap.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (meta) meta.textContent = '불러오는 중…';
    _apiFetch('/api/posts?featured=1&limit=20&published=1').then(function (data) {
      _picksPosts = (data && data.posts) || [];
      _renderPicksSelected();
    }).catch(function () {
      if (wrap) wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      if (meta) meta.textContent = '불러오기 실패';
    });
  }

  function _renderPicksSelected() {
    var wrap = document.getElementById('picks-selected');
    var meta = document.getElementById('picks-meta');
    if (meta) meta.textContent = '현재 에디터 추천 ' + _picksPosts.length + '개 / 최대 4개';
    if (!wrap) return;
    if (!_picksPosts.length) {
      wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">선택된 에디터 추천 게시글이 없습니다.</div></div>';
      return;
    }
    wrap.innerHTML = '<div class="v3-picks-list">' + _picksPosts.map(function (post) {
      return '<div class="v3-pick-row">' +
        '<div class="v3-pick-copy">' +
          '<div class="v3-pick-badges"><span class="v3-badge ' + _catBadge(post.category) + '">' + GW.escapeHtml(post.category || '') + '</span><span class="v3-badge v3-badge-yellow">추천</span></div>' +
          '<div class="v3-pick-title">' + GW.escapeHtml(post.title || '(제목 없음)') + '</div>' +
          '<div class="v3-pick-meta">' + GW.escapeHtml(post.publish_at || post.created_at || '') + '</div>' +
        '</div>' +
        '<div class="v3-pick-actions">' +
          '<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" onclick="V3._removePick(' + post.id + ')">제외</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function _searchPicks(q) {
    var el = document.getElementById('picks-search-results');
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=10&published=1').then(function (data) {
      var posts = (data && data.posts) || [];
      var isFull = _picksPosts.length >= 4;
      if (!posts.length) {
        el.style.display = 'none';
        return;
      }
      el.innerHTML = posts.map(function (p) {
        var already = _picksPosts.some(function (item) { return item.id === p.id; });
        var disabled = already || (isFull && !already);
        var suffix = already ? ' · 이미 선택됨' : (isFull ? ' · 최대 4개 선택됨' : '');
        return '<div class="v3-search-result-item' + (disabled ? ' is-disabled' : '') + '"' + (disabled ? '' : ' onclick="V3._addPick(' + p.id + ')"') + '>' +
          '<div class="v3-search-result-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
          '<div class="v3-search-result-meta">' + GW.escapeHtml((p.category || '') + suffix) + '</div>' +
        '</div>';
      }).join('');
      el.style.display = 'block';
    }).catch(function () {
      el.style.display = 'none';
    });
  }

  V3._addPick = function (id) {
    if (_picksPosts.length >= 4 && !_picksPosts.some(function (item) { return item.id === id; })) {
      _alert('에디터 추천 제한', '에디터 추천은 최대 4개까지 선택할 수 있습니다. 기존 추천을 하나 제외한 뒤 다시 시도해주세요.');
      return;
    }
    _togglePick(id, true);
  };

  V3._removePick = function (id) {
    _togglePick(id, false);
  };

  function _togglePick(id, enabled) {
    _apiFetch('/api/posts/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ featured: !!enabled }),
    }).then(function () {
      GW.showToast(enabled ? '에디터 추천에 추가했습니다' : '에디터 추천에서 제외했습니다', 'success');
      document.getElementById('picks-search-results').style.display = 'none';
      document.getElementById('picks-search').value = '';
      _loadPicksUI();
    }).catch(function (e) {
      GW.showToast(e.message || '처리 실패', 'error');
    });
  }

  function _setControlValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  function _setRangeValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = String(value);
  }

  function _getRangeNumber(id, fallback) {
    var el = document.getElementById(id);
    return _clampNumber(el ? el.value : fallback, 0, 999, fallback);
  }

  function _clampNumber(value, min, max, fallback) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TAGS
  ══════════════════════════════════════════════════════════ */
  function _loadTagSettingsUI() {
    var el = document.getElementById('tags-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/tags').then(function (data) {
      _tagSettings = (GW.normalizeTagSettings ? GW.normalizeTagSettings(data) : data) || {};
      _renderTagsEditor();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderTagsEditor() {
    var el = document.getElementById('tags-editor');
    var sections = [
      { key: 'common', label: '공통 태그', desc: '모든 카테고리에서 공통으로 선택 가능한 태그입니다.' },
      { key: 'korea', label: 'KOREA 태그', desc: 'Korea / KSA 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'apr', label: 'APR 태그', desc: 'APR 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'wosm', label: 'WOSM 태그', desc: 'WOSM 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'people', label: 'PEOPLE 태그', desc: 'People 기사에서 사용하는 글머리 태그입니다.' }
    ];
    el.innerHTML = sections.map(function (section) {
      var tags = _getTagScopeItems(_tagSettings, section.key);
      return '<section class="v3-tag-group" data-tag-scope-group="' + GW.escapeHtml(section.key) + '">' +
        '<div class="v3-tag-group-head">' +
          '<div>' +
            '<h3 class="v3-tag-group-title">' + GW.escapeHtml(section.label) + '</h3>' +
            '<p class="v3-tag-group-desc">' + GW.escapeHtml(section.desc) + '</p>' +
          '</div>' +
          '<span class="v3-tag-group-count">' + tags.length + '개</span>' +
        '</div>' +
        '<div class="v3-tag-chip-list">' + _renderTagChips(section.key, tags) + '</div>' +
        '<div class="v3-tag-add-row">' +
          '<input class="v3-input v3-tag-add-input" type="text" id="tags-add-' + _escId(section.key) + '" placeholder="' + GW.escapeHtml(section.label + ' 추가') + '" />' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" data-tag-add="' + GW.escapeHtml(section.key) + '">추가</button>' +
        '</div>' +
      '</section>';
    }).join('');
    _bindTagEditorEvents();
  }

  function _renderTagChips(scope, tags) {
    if (!tags.length) {
      return '<div class="v3-empty-inline">아직 등록된 태그가 없습니다.</div>';
    }
    return tags.map(function (tag) {
      var isEditing = _tagInlineEdit && _tagInlineEdit.scope === scope && _tagInlineEdit.original === tag;
      if (isEditing) {
        return '<div class="v3-tag-chip is-editing">' +
          '<input class="v3-input v3-tag-inline-input" type="text" id="tag-edit-' + _escId(scope + '-' + tag) + '" value="' + GW.escapeHtml(_tagInlineEdit.value || tag) + '" />' +
          '<button class="v3-btn v3-btn-primary v3-btn-sm" type="button" data-tag-confirm="' + GW.escapeHtml(scope) + '" data-tag-original="' + GW.escapeHtml(tag) + '">확인</button>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-sm" type="button" data-tag-cancel="' + GW.escapeHtml(scope) + '" data-tag-original="' + GW.escapeHtml(tag) + '">취소</button>' +
        '</div>';
      }
      return '<div class="v3-tag-chip">' +
        '<span class="v3-tag-chip-label">' + GW.escapeHtml(tag) + '</span>' +
        '<div class="v3-tag-chip-actions">' +
          '<button class="v3-tag-chip-btn" type="button" data-tag-edit="' + GW.escapeHtml(scope) + '" data-tag-value="' + GW.escapeHtml(tag) + '">수정</button>' +
          '<button class="v3-tag-chip-btn is-danger" type="button" data-tag-remove="' + GW.escapeHtml(scope) + '" data-tag-value="' + GW.escapeHtml(tag) + '">삭제</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _bindTagEditorEvents() {
    var wrap = document.getElementById('tags-editor');
    if (!wrap) return;
    wrap.querySelectorAll('[data-tag-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _addTagToScope(btn.getAttribute('data-tag-add') || '');
      });
    });
    wrap.querySelectorAll('[data-tag-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _tagInlineEdit = {
          scope: btn.getAttribute('data-tag-edit') || '',
          original: btn.getAttribute('data-tag-value') || '',
          value: btn.getAttribute('data-tag-value') || ''
        };
        _renderTagsEditor();
        var input = document.getElementById('tag-edit-' + _escId(_tagInlineEdit.scope + '-' + _tagInlineEdit.original));
        if (input) {
          input.focus();
          input.select();
          input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              _commitTagEdit(_tagInlineEdit.scope, _tagInlineEdit.original);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              _tagInlineEdit = null;
              _renderTagsEditor();
            }
          });
        }
      });
    });
    wrap.querySelectorAll('[data-tag-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _removeTagFromScope(btn.getAttribute('data-tag-remove') || '', btn.getAttribute('data-tag-value') || '');
      });
    });
    wrap.querySelectorAll('[data-tag-confirm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _commitTagEdit(btn.getAttribute('data-tag-confirm') || '', btn.getAttribute('data-tag-original') || '');
      });
    });
    wrap.querySelectorAll('[data-tag-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _tagInlineEdit = null;
        _renderTagsEditor();
      });
    });
    wrap.querySelectorAll('.v3-tag-add-input').forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          var scope = (input.id || '').replace('tags-add-', '');
          _addTagToScope(scope);
        }
      });
    });
  }

  function _getTagScopeItems(settings, scope) {
    if (!settings || typeof settings !== 'object') return [];
    if (scope === 'common') {
      return Array.isArray(settings.common) ? settings.common.slice() : [];
    }
    var categories = settings.categories || {};
    var raw = categories[scope];
    if (Array.isArray(raw)) return raw.slice();
    if (raw && Array.isArray(raw.tags)) return raw.tags.slice();
    return [];
  }

  function _setTagScopeItems(scope, items) {
    var nextItems = (Array.isArray(items) ? items : []).map(function (item) {
      return String(item || '').trim();
    }).filter(Boolean);
    nextItems = nextItems.filter(function (item, index) {
      return nextItems.indexOf(item) === index;
    });
    if (scope === 'common') {
      _tagSettings.common = nextItems;
      return;
    }
    if (!_tagSettings.categories) _tagSettings.categories = {};
    _tagSettings.categories[scope] = nextItems;
  }

  function _addTagToScope(scope) {
    var input = document.getElementById('tags-add-' + _escId(scope));
    var value = input ? String(input.value || '').trim() : '';
    if (!value) return;
    var items = _getTagScopeItems(_tagSettings, scope);
    if (items.indexOf(value) >= 0) {
      GW.showToast('이미 등록된 태그입니다', 'error');
      if (input) input.value = '';
      return;
    }
    items.push(value);
    _setTagScopeItems(scope, items);
    _tagInlineEdit = null;
    if (input) input.value = '';
    _renderTagsEditor();
  }

  function _removeTagFromScope(scope, tag) {
    var items = _getTagScopeItems(_tagSettings, scope).filter(function (item) { return item !== tag; });
    _setTagScopeItems(scope, items);
    if (_tagInlineEdit && _tagInlineEdit.scope === scope && _tagInlineEdit.original === tag) _tagInlineEdit = null;
    _renderTagsEditor();
  }

  function _commitTagEdit(scope, original) {
    var input = document.getElementById('tag-edit-' + _escId(scope + '-' + original));
    var nextValue = input ? String(input.value || '').trim() : '';
    if (!nextValue) {
      GW.showToast('태그명을 입력해주세요', 'error');
      return;
    }
    var items = _getTagScopeItems(_tagSettings, scope);
    if (nextValue !== original && items.indexOf(nextValue) >= 0) {
      GW.showToast('이미 등록된 태그입니다', 'error');
      return;
    }
    items = items.map(function (item) { return item === original ? nextValue : item; });
    _setTagScopeItems(scope, items);
    _tagInlineEdit = null;
    _renderTagsEditor();
  }

  function _saveTags() {
    var common = (_tagSettings && Array.isArray(_tagSettings.common)) ? _tagSettings.common.slice() : [];
    var cats = {};
    ['korea', 'apr', 'wosm', 'people'].forEach(function (cat) {
      cats[cat] = _getTagScopeItems(_tagSettings, cat);
    });
    var btn = document.getElementById('tags-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/tags', {
      method: 'PUT',
      body: JSON.stringify({ common: common, categories: cats }),
    }).then(function () {
      GW.showToast('태그 설정을 저장했습니다', 'success');
      _tagSettings = { common: common, categories: cats };
      _tagInlineEdit = null;
      _loadTagSettings();
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – META
  ══════════════════════════════════════════════════════════ */
  var META_PAGES = ['home', 'latest', 'korea', 'apr', 'wosm', 'wosm_members', 'people', 'glossary', 'contributors', 'search', 'ai_guide'];
  var META_LABELS = { home:'홈', latest:'최신 뉴스', korea:'Korea/KSA', apr:'APR', wosm:'WOSM', wosm_members:'세계연맹 회원국', people:'People', glossary:'용어집', contributors:'기고자', search:'검색', ai_guide:'AI 가이드' };

  function _loadMetaUI() {
    var el = document.getElementById('meta-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/site-meta').then(function (data) {
      _siteMeta = data || {};
      _renderMetaEditor();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderMetaEditor() {
    var el = document.getElementById('meta-editor');
    var pages = (_siteMeta && _siteMeta.pages) || {};
    var footer = (_siteMeta && _siteMeta.footer) || {};
    var html = META_PAGES.map(function (key) {
      var p = pages[key] || {};
      return '<div class="v3-form-group v3-mt-16">' +
        '<div class="v3-label v3-mb-16">' + GW.escapeHtml(META_LABELS[key] || key) + '</div>' +
        '<input class="v3-input" type="text" id="meta-title-' + key + '" value="' + GW.escapeHtml(p.title || '') + '" placeholder="페이지 제목 (title 태그)" />' +
        '<input class="v3-input v3-mt-8" type="text" id="meta-desc-' + key + '" value="' + GW.escapeHtml(p.description || '') + '" placeholder="설명 (description 태그)" />' +
      '</div>';
    }).join('');
    html += '<hr class="v3-divider" />';
    html += '<div class="v3-label v3-mt-16 v3-mb-16" style="display:block;margin-bottom:12px;font-weight:700;">푸터</div>';
    html += '<div class="v3-form-grid">' +
      _metaField('site-footer-title',    '사이트명', footer.title || '') +
      _metaField('site-footer-desc',     '설명',     footer.description || '') +
      _metaField('site-footer-domain',   '도메인',   footer.domain_label || '') +
      _metaField('site-footer-tip',      '기사 제보 이메일', footer.tip_email || '') +
      _metaField('site-footer-contact',  '문의 이메일',      footer.contact_email || '') +
    '</div>';
    html += '<hr class="v3-divider" />';
    html += '<div class="v3-form-grid">' +
      _metaField('meta-google-verify',  'Google 인증 코드', (_siteMeta.google_verification || '')) +
      _metaField('meta-naver-verify',   'Naver 인증 코드',  (_siteMeta.naver_verification  || '')) +
    '</div>';
    el.innerHTML = html;
  }

  function _metaField(id, label, value) {
    return '<div class="v3-form-group"><label class="v3-label" for="' + id + '">' + GW.escapeHtml(label) + '</label>' +
      '<input class="v3-input" type="text" id="' + id + '" value="' + GW.escapeHtml(value) + '" /></div>';
  }

  function _saveMeta() {
    var pages = {};
    META_PAGES.forEach(function (key) {
      pages[key] = {
        title:       (document.getElementById('meta-title-' + key) || {}).value || '',
        description: (document.getElementById('meta-desc-'  + key) || {}).value || '',
      };
    });
    var footer = {
      title:         (document.getElementById('site-footer-title')   || {}).value || '',
      description:   (document.getElementById('site-footer-desc')    || {}).value || '',
      domain_label:  (document.getElementById('site-footer-domain')  || {}).value || '',
      tip_email:     (document.getElementById('site-footer-tip')     || {}).value || '',
      contact_email: (document.getElementById('site-footer-contact') || {}).value || '',
    };
    var body = {
      pages: pages, footer: footer,
      google_verification: (document.getElementById('meta-google-verify') || {}).value || '',
      naver_verification:  (document.getElementById('meta-naver-verify')  || {}).value || '',
    };
    var btn = document.getElementById('meta-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/site-meta', { method: 'PUT', body: JSON.stringify(body) })
      .then(function () {
        GW.showToast('메타태그 설정을 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – BOARD COPY
  ══════════════════════════════════════════════════════════ */
  var BOARD_COPY_PAGES = [
    { key: 'latest', label: '최근 1개월 소식', note: '/latest' },
    { key: 'korea', label: 'Korea / KSA', note: '/korea' },
    { key: 'apr', label: 'APR', note: '/apr' },
    { key: 'wosm', label: 'WOSM', note: '/wosm' },
    { key: 'people', label: '스카우트 인물', note: '/people' },
    { key: 'glossary', label: '용어집', note: '/glossary' },
    { key: 'calendar', label: '캘린더', note: '/calendar' },
    { key: 'contributors', label: '도움을 주신 분들', note: '/contributors' },
    { key: 'wosm_members', label: '세계연맹 회원국 현황', note: '/wosm-members' },
  ];

  function _loadBoardCopy() {
    var el = document.getElementById('board-copy-editor');
    if (!el) return;
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/board-copy').then(function (data) {
      _boardCopy = data || {};
      _boardCopyRevision = parseInt(data && data.revision, 10) || 0;
      _renderBoardCopyEditor();
    }).catch(function () {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
    });
  }

  function _renderBoardCopyEditor() {
    var el = document.getElementById('board-copy-editor');
    if (!el) return;
    el.innerHTML = '<div class="v3-board-copy-grid">' + BOARD_COPY_PAGES.map(function (page) {
      var item = _boardCopy[page.key] || {};
      return '<div class="v3-board-copy-card">' +
        '<strong>' + GW.escapeHtml(page.label) + '</strong>' +
        '<span>' + GW.escapeHtml(page.note) + '</span>' +
        '<textarea class="v3-textarea" rows="4" id="board-copy-' + page.key + '" placeholder="게시판 설명을 입력하세요.">' + GW.escapeHtml(item.description || '') + '</textarea>' +
      '</div>';
    }).join('') + '</div>';
  }

  function _saveBoardCopy() {
    var payload = {};
    BOARD_COPY_PAGES.forEach(function (page) {
      payload[page.key] = {
        description: ((document.getElementById('board-copy-' + page.key) || {}).value || '').trim(),
      };
    });
    payload.if_revision = _boardCopyRevision;
    var btn = document.getElementById('board-copy-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/board-copy', { method: 'PUT', body: JSON.stringify(payload) })
      .then(function (data) {
        _boardCopy = data || payload;
        _boardCopyRevision = parseInt(data && data.revision, 10) || (_boardCopyRevision + 1);
        GW.showToast('게시판 설명을 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – AUTHOR
  ══════════════════════════════════════════════════════════ */
  function _loadAuthorUI() {
    Promise.all([
      _apiFetch('/api/settings/author').catch(function () { return {}; }),
      _apiFetch('/api/settings/ai-disclaimer').catch(function () { return {}; }),
    ]).then(function (results) {
      document.getElementById('s-author-name').value  = (results[0] && (results[0].author || results[0].name)) || '';
      document.getElementById('s-ai-disclaimer').value = (results[1] && results[1].text) || '';
    });
  }

  function _saveAuthor() {
    var name = document.getElementById('s-author-name').value.trim();
    var disc = document.getElementById('s-ai-disclaimer').value.trim();
    var btn = document.getElementById('author-save-btn');
    _setButtonBusy(btn, '저장 중…');
    Promise.all([
      _apiFetch('/api/settings/author', { method: 'PUT', body: JSON.stringify({ author: name }) }),
      _apiFetch('/api/settings/ai-disclaimer', { method: 'PUT', body: JSON.stringify({ text: disc }) }),
    ]).then(function () {
      GW.showToast('저장했습니다', 'success');
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – BANNER
  ══════════════════════════════════════════════════════════ */
  function _loadBannerUI() {
    _apiFetch('/api/settings/board-banner').then(function (data) {
      _boardBanner = (data && data.items) || {};
      ['korea','apr','wosm','people'].forEach(function (cat) {
        var b = _boardBanner[cat] || {};
        document.getElementById('banner-' + cat + '-name').value = b.event_name || '';
        document.getElementById('banner-' + cat + '-date').value = b.event_date ? b.event_date.slice(0, 10) : '';
      });
    }).catch(function () {});
  }

  function _saveBanner() {
    var items = {};
    ['korea','apr','wosm','people'].forEach(function (cat) {
      items[cat] = {
        event_name: document.getElementById('banner-' + cat + '-name').value.trim(),
        event_date: document.getElementById('banner-' + cat + '-date').value || null,
      };
    });
    var btn = document.getElementById('banner-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/board-banner', { method: 'PUT', body: JSON.stringify({ items: items }) })
      .then(function () {
        GW.showToast('배너 설정을 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TICKER
  ══════════════════════════════════════════════════════════ */
  function _loadTickerUI() {
    _apiFetch('/api/settings/ticker').then(function (data) {
      var lines = Array.isArray(data) ? data : (data && data.items) || (data && data.lines) || [];
      var text  = typeof data === 'string' ? data : lines.join('\n');
      _ticker = text;
      document.getElementById('s-ticker').value = text;
      _renderTickerPreview(text);
    }).catch(function () {});
  }

  function _renderTickerPreview(text) {
    var preview = document.getElementById('ticker-preview');
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    preview.textContent = lines.length ? lines.join('  ·  ') : '(미리보기 없음)';
  }

  function _saveTicker() {
    var text  = document.getElementById('s-ticker').value;
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var btn = document.getElementById('ticker-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/ticker', { method: 'PUT', body: JSON.stringify({ items: lines }) })
      .then(function () {
        GW.showToast('티커를 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – CONTRIBUTORS
  ══════════════════════════════════════════════════════════ */
  function _loadContributorsUI() {
    var el = document.getElementById('contrib-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/contributors').then(function (data) {
      _contributors = (Array.isArray(data) ? data : (data && data.items) || []).map(function (item) {
        return {
          name: item && item.name || '',
          role: item && (item.role || item.note) || '',
          date: item && item.date || '',
        };
      });
      _renderContributors();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderContributors() {
    var el = document.getElementById('contrib-list');
    if (!_contributors.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">기고자가 없습니다. 항목 추가를 눌러 추가하세요.</div></div>';
      return;
    }
    el.innerHTML = _contributors.map(function (c, i) {
      return '<div class="v3-person-row">' +
        '<input class="v3-input" type="text" value="' + GW.escapeHtml(c.name || '') + '" placeholder="이름" data-contrib-i="' + i + '" data-field="name" style="flex:1;" />' +
        '<input class="v3-input" type="text" value="' + GW.escapeHtml(c.role || '') + '" placeholder="역할" data-contrib-i="' + i + '" data-field="role" style="flex:1;" />' +
        '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:#ef4444;" onclick="V3._removeContrib(' + i + ')">×</button>' +
      '</div>';
    }).join('');
    // bind inputs
    el.querySelectorAll('[data-contrib-i]').forEach(function (input) {
      input.addEventListener('input', function () {
        var i = parseInt(input.dataset.contribI, 10);
        var field = input.dataset.field;
        if (_contributors[i]) _contributors[i][field] = input.value;
      });
    });
  }

  function _addContributorRow() {
    _contributors.push({ name: '', role: '' });
    _renderContributors();
  }
  V3._removeContrib = function (i) { _contributors.splice(i, 1); _renderContributors(); };

  function _saveContributors() {
    // Sync current input values
    document.querySelectorAll('#contrib-list [data-contrib-i]').forEach(function (input) {
      var i = parseInt(input.dataset.contribI, 10);
      var field = input.dataset.field;
      if (_contributors[i]) _contributors[i][field] = input.value;
    });
    var btn = document.getElementById('contrib-save-btn');
    _setButtonBusy(btn, '저장 중…');
    var payload = _contributors.map(function (item) {
      return {
        name: item && item.name || '',
        note: item && (item.role || item.note) || '',
        date: item && item.date || '',
      };
    });
    _apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: payload }) })
      .then(function () {
        GW.showToast('기고자 목록을 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – EDITORS
  ══════════════════════════════════════════════════════════ */
  function _loadEditorsUI() {
    var el = document.getElementById('editors-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/editors').then(function (data) {
      var editors = Array.isArray(data) ? data : (data && data.editors) || [];
      if (!Array.isArray(editors) && editors && typeof editors === 'object') {
        _editors = ['A', 'B', 'C'].map(function (letter) {
          return { key: letter, name: editors[letter] || '' };
        });
      } else {
        _editors = (editors || []).map(function (item, index) {
          return {
            key: item && (item.key || item.letter) || String.fromCharCode(65 + index),
            name: item && item.name || '',
          };
        });
      }
      _renderEditors();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderEditors() {
    var el = document.getElementById('editors-list');
    if (!_editors.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">편집자가 없습니다.</div></div>';
      return;
    }
    el.innerHTML = _editors.map(function (e, i) {
      return '<div class="v3-person-row">' +
        '<div class="v3-badge v3-badge-gray" style="width:72px;text-align:center;flex:0 0 72px;">Editor ' + GW.escapeHtml(e.key || '') + '</div>' +
        '<input class="v3-input" type="text" value="' + GW.escapeHtml(e.name || '') + '" placeholder="편집자명" data-editor-i="' + i + '" data-field="name" style="flex:1;" />' +
      '</div>';
    }).join('');
    el.querySelectorAll('[data-editor-i]').forEach(function (input) {
      input.addEventListener('change', function () {
        var i = parseInt(input.dataset.editorI, 10);
        if (_editors[i]) _editors[i][input.dataset.field] = input.value;
      });
      input.addEventListener('input', function () {
        var i = parseInt(input.dataset.editorI, 10);
        if (_editors[i]) _editors[i][input.dataset.field] = input.value;
      });
    });
  }

  function _addEditorRow() {
    GW.showToast('편집자 슬롯은 Editor A~C 고정입니다', 'error');
  }
  V3._removeEditor = function () {
    GW.showToast('편집자 슬롯은 삭제할 수 없습니다', 'error');
  };

  function _saveEditors() {
    document.querySelectorAll('#editors-list [data-editor-i]').forEach(function (input) {
      var i = parseInt(input.dataset.editorI, 10);
      if (_editors[i]) _editors[i][input.dataset.field] = input.value;
    });
    var btn = document.getElementById('editors-save-btn');
    _setButtonBusy(btn, '저장 중…');
    var editorsPayload = {};
    _editors.forEach(function (item, index) {
      var key = item && item.key ? item.key : String.fromCharCode(65 + index);
      editorsPayload[key] = item && item.name ? item.name : '';
    });
    _apiFetch('/api/settings/editors', { method: 'PUT', body: JSON.stringify({ editors: editorsPayload }) })
      .then(function () {
        GW.showToast('편집자 설정을 저장했습니다', 'success');
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TRANSLATIONS
  ══════════════════════════════════════════════════════════ */
  function _loadTranslationsUI() {
    var el = document.getElementById('trans-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/translations').then(function (data) {
      _translations = (data && data.strings) || data || {};
      _renderTranslations();
    }).catch(function () { el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>'; });
  }

  function _renderTranslations() {
    var el = document.getElementById('trans-editor');
    var keys = Object.keys(_translations);
    if (!keys.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">번역 항목이 없습니다</div></div>';
      return;
    }
    el.innerHTML = keys.map(function (k) {
      var value = _translations[k];
      if (value && typeof value === 'object') {
        return '<div class="v3-trans-row">' +
          '<div class="v3-trans-key">' + GW.escapeHtml(k) + '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<input class="v3-input" type="text" id="trans-' + _escId(k) + '-ko" value="' + GW.escapeHtml(value.ko || '') + '" placeholder="국문" />' +
            '<input class="v3-input" type="text" id="trans-' + _escId(k) + '-en" value="' + GW.escapeHtml(value.en || '') + '" placeholder="영문" />' +
          '</div>' +
        '</div>';
      }
      return '<div class="v3-trans-row">' +
        '<div class="v3-trans-key">' + GW.escapeHtml(k) + '</div>' +
        '<input class="v3-input" type="text" id="trans-' + _escId(k) + '" value="' + GW.escapeHtml(value || '') + '" />' +
      '</div>';
    }).join('');
  }

  function _saveTranslations() {
    var result = {};
    Object.keys(_translations).forEach(function (k) {
      var value = _translations[k];
      if (value && typeof value === 'object') {
        var koInput = document.getElementById('trans-' + _escId(k) + '-ko');
        var enInput = document.getElementById('trans-' + _escId(k) + '-en');
        result[k] = {
          ko: koInput ? koInput.value : (value.ko || ''),
          en: enInput ? enInput.value : (value.en || ''),
        };
      } else {
        var input = document.getElementById('trans-' + _escId(k));
        result[k] = input ? input.value : value;
      }
    });
    var btn = document.getElementById('trans-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify({ strings: result }) })
      .then(function () {
        GW.showToast('번역 설정을 저장했습니다', 'success');
        _translations = result;
        _clearButtonBusy(btn, '완료');
      })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { if (btn.classList.contains('is-busy')) _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – WOSM MEMBERS
  ══════════════════════════════════════════════════════════ */
  function _loadWosmMembersUI() {
    var el = document.getElementById('wosm-members-editor');
    var columnsEl = document.getElementById('wosm-columns-editor');
    var meta = document.getElementById('wosm-members-meta');
    if (el) el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (columnsEl) columnsEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (meta) meta.textContent = '불러오는 중…';
    _apiFetch('/api/settings/wosm-members').then(function (data) {
      _wosmMembers = Array.isArray(data && data.items) ? data.items : [];
      _wosmColumns = Array.isArray(data && data.columns) ? data.columns : _getDefaultWosmColumns();
      _wosmImportSavedMapping = Object.assign({}, _wosmImportSavedMapping, data && data.import_mapping || {});
      _wosmRegisteredCount = Math.max(0, parseInt(data && data.registered_count, 10) || 176);
      _wosmMembersRevision = parseInt(data && data.revision, 10) || 0;
      _renderWosmMembersEditor();
    }).catch(function () {
      if (el) el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      if (columnsEl) columnsEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      if (meta) meta.textContent = '불러오기 실패';
    });
  }

  function _renderWosmMembersEditor() {
    var el = document.getElementById('wosm-members-editor');
    var meta = document.getElementById('wosm-members-meta');
    if (!el) return;
    _renderWosmImportDefaultFields();
    _renderWosmColumnsEditor();
    var countInput = document.getElementById('wosm-registered-count');
    if (countInput) countInput.value = String(_wosmRegisteredCount);
    var visibleItems = _getFilteredWosmMembers();
    var editableColumns = _getEditableWosmColumns();
    if (meta) {
      meta.textContent = '총 ' + _wosmMembers.length + '개 항목 · 현재 표시 ' + visibleItems.length + '개 · 표 열 ' + _wosmColumns.length + '개 · revision ' + _wosmMembersRevision;
    }
    if (!visibleItems.length) {
      el.innerHTML = '<div class="v3-members-empty">조건에 맞는 항목이 없습니다. XLSX를 가져오거나 새 항목을 추가하세요.</div>';
      return;
    }
    el.innerHTML = '<div class="v3-members-editor">' +
      '<div class="v3-members-head">' +
        '<span>한국어</span>' +
        '<span>영어</span>' +
        editableColumns.map(function (column) {
          return '<span>' + GW.escapeHtml(column.label || column.key) + '</span>';
        }).join('') +
        '<span>작업</span>' +
      '</div>' +
      visibleItems.map(function (entry) {
      var item = entry.item;
      var i = entry.index;
      return '<div class="v3-members-row">' +
        _renderWosmMemberCell(i, 'country_ko', '한국어', item.country_ko || '', '국가명(한국어)') +
        _renderWosmMemberCell(i, 'country_en', '영어', item.country_en || '', 'Country Name option 1 E') +
        editableColumns.map(function (column) {
          return _renderWosmMemberCell(
            i,
            column.key,
            column.label || column.key,
            _getWosmColumnValue(item, column),
            column.default_header || (column.label || column.key)
          );
        }).join('') +
        '<div class="v3-members-actions"><button type="button" class="v3-btn v3-btn-danger v3-btn-sm" data-wosm-remove="' + i + '">삭제</button></div>' +
      '</div>';
    }).join('') + '</div>';

    el.querySelectorAll('[data-wosm-field]').forEach(function (input) {
      input.addEventListener('input', function () {
        var index = parseInt(input.getAttribute('data-wosm-index'), 10);
        var field = input.getAttribute('data-wosm-field');
        if (!_wosmMembers[index]) return;
        _setWosmColumnValue(_wosmMembers[index], field, input.value);
      });
    });
    el.querySelectorAll('[data-wosm-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-wosm-remove'), 10);
        _wosmMembers.splice(index, 1);
        _renderWosmMembersEditor();
      });
    });
  }

  function _renderWosmImportDefaultFields() {
    var fields = {
      'wosm-default-map-country-ko': _wosmImportSavedMapping.country_ko || '',
      'wosm-default-map-country-en': _wosmImportSavedMapping.country_en || '',
    };
    Object.keys(fields).forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = fields[id];
    });
  }

  function _collectWosmImportDefaultFields() {
    return {
      country_ko: ((document.getElementById('wosm-default-map-country-ko') || {}).value || '').trim(),
      country_en: ((document.getElementById('wosm-default-map-country-en') || {}).value || '').trim(),
    };
  }

  function _renderWosmMemberCell(index, field, label, value, placeholder) {
    var id = 'wosm-member-' + field + '-' + index;
    if (field === 'status_description' || String(field).indexOf('description') >= 0 || String(field).indexOf('note') >= 0) {
      return '<div class="v3-members-cell">' +
        '<label for="' + id + '">' + GW.escapeHtml(label) + '</label>' +
        '<textarea class="v3-input v3-textarea" rows="2" id="' + id + '" data-wosm-index="' + index + '" data-wosm-field="' + GW.escapeHtml(field) + '" placeholder="' + GW.escapeHtml(placeholder || '') + '">' + GW.escapeHtml(value || '') + '</textarea>' +
      '</div>';
    }
    return '<div class="v3-members-cell">' +
      '<label for="' + id + '">' + GW.escapeHtml(label) + '</label>' +
      '<input class="v3-input" type="text" id="' + id + '" data-wosm-index="' + index + '" data-wosm-field="' + GW.escapeHtml(field) + '" value="' + GW.escapeHtml(value || '') + '" placeholder="' + GW.escapeHtml(placeholder || '') + '">' +
    '</div>';
  }

  function _getFilteredWosmMembers() {
    if (!_wosmMembersSearch) {
      return _wosmMembers.map(function (item, index) { return { item: item, index: index }; });
    }
    return _wosmMembers.map(function (item, index) { return { item: item, index: index }; }).filter(function (entry) {
      var item = entry.item || {};
      var extraValues = item.extra_fields && typeof item.extra_fields === 'object' ? Object.keys(item.extra_fields).map(function (key) { return item.extra_fields[key]; }) : [];
      var haystack = [
        item.country_ko,
        item.country_en,
        item.membership_category,
        item.status_description,
      ].concat(extraValues).join(' ').toLowerCase();
      return haystack.indexOf(_wosmMembersSearch) >= 0;
    });
  }

  function _addWosmMemberRow() {
    _wosmMembers.push({
      country_ko: '',
      country_en: '',
      membership_category: '',
      status_description: '',
      extra_fields: _createEmptyWosmExtraFields(),
      sort_order: _wosmMembers.length,
    });
    _renderWosmMembersEditor();
  }

  function _addWosmColumnRow() {
    var key = _createUniqueWosmColumnKey();
    _wosmColumns.push({
      key: key,
      label: '새 열',
      type: 'field',
      default_header: '',
      system: false,
    });
    _wosmMembers.forEach(function (item) {
      item.extra_fields = item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
      if (typeof item.extra_fields[key] === 'undefined') item.extra_fields[key] = '';
    });
    _renderWosmMembersEditor();
  }

  function _renderWosmColumnsEditor() {
    var el = document.getElementById('wosm-columns-editor');
    if (!el) return;
    el.innerHTML = '<div class="v3-members-editor">' +
      '<div class="v3-members-head">' +
        '<span>열 제목</span>' +
        '<span>키</span>' +
        '<span>기본 XLSX 열 이름</span>' +
        '<span>상태</span>' +
        '<span>작업</span>' +
      '</div>' +
      _wosmColumns.map(function (column, index) {
        var removable = column.key !== 'country_names';
        var movableUp = index > 0;
        var movableDown = index < (_wosmColumns.length - 1);
        return '<div class="v3-members-row">' +
          '<div class="v3-members-cell"><label for="wosm-column-label-' + index + '">열 제목</label><input class="v3-input" type="text" id="wosm-column-label-' + index + '" data-wosm-column-index="' + index + '" data-wosm-column-field="label" value="' + GW.escapeHtml(column.label || '') + '" placeholder="예: 상태 설명"></div>' +
          '<div class="v3-members-cell"><label for="wosm-column-key-' + index + '">키</label><input class="v3-input" type="text" id="wosm-column-key-' + index + '" data-wosm-column-index="' + index + '" data-wosm-column-field="key" value="' + GW.escapeHtml(column.key || '') + '" placeholder="예: member_status"' + (column.system ? ' readonly' : '') + '></div>' +
          '<div class="v3-members-cell"><label for="wosm-column-header-' + index + '">기본 XLSX 열 이름</label><input class="v3-input" type="text" id="wosm-column-header-' + index + '" data-wosm-column-index="' + index + '" data-wosm-column-field="default_header" value="' + GW.escapeHtml(column.default_header || '') + '" placeholder="예: Status description"' + (column.key === 'country_names' ? ' readonly' : '') + '></div>' +
          '<div class="v3-members-cell"><label>상태</label><div class="v3-inline-meta">' + (column.key === 'country_names' ? '필수 열' : (column.system ? '기본 열' : '커스텀 열')) + '</div></div>' +
          '<div class="v3-members-actions">' +
            '<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-wosm-column-move="up" data-wosm-column-index="' + index + '"' + (movableUp ? '' : ' disabled') + '>위로</button>' +
            '<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-wosm-column-move="down" data-wosm-column-index="' + index + '"' + (movableDown ? '' : ' disabled') + '>아래로</button>' +
            (removable ? '<button type="button" class="v3-btn v3-btn-danger v3-btn-sm" data-wosm-column-remove="' + index + '">삭제</button>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';

    el.querySelectorAll('[data-wosm-column-field]').forEach(function (input) {
      input.addEventListener('input', function () {
        var index = parseInt(input.getAttribute('data-wosm-column-index'), 10);
        var field = input.getAttribute('data-wosm-column-field');
        var column = _wosmColumns[index];
        if (!column) return;
        if (field === 'key' && !column.system) {
          var oldKey = column.key;
          var nextKey = _sanitizeWosmColumnKey(input.value) || oldKey;
          if (nextKey !== oldKey && !_hasWosmColumnKey(nextKey, index)) {
            column.key = nextKey;
            _renameWosmExtraField(oldKey, nextKey);
          }
          input.value = column.key;
          return;
        }
        if (field === 'default_header' && column.key === 'country_names') {
          input.value = '';
          return;
        }
        column[field] = input.value;
      });
    });
    el.querySelectorAll('[data-wosm-column-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-wosm-column-remove'), 10);
        var column = _wosmColumns[index];
        if (!column || column.key === 'country_names') return;
        _wosmColumns.splice(index, 1);
        _removeWosmColumnFromItems(column.key);
        _renderWosmMembersEditor();
      });
    });
    el.querySelectorAll('[data-wosm-column-move]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-wosm-column-index'), 10);
        var direction = btn.getAttribute('data-wosm-column-move');
        _moveWosmColumn(index, direction === 'up' ? -1 : 1);
      });
    });
  }

  function _saveWosmMembers() {
    var btn = document.getElementById('wosm-members-save-btn');
    var payload = _wosmMembers.map(function (item, index) {
      var normalized = {
        country_ko: String(item.country_ko || '').trim(),
        country_en: String(item.country_en || '').trim(),
        membership_category: String(item.membership_category || '').trim(),
        status_description: String(item.status_description || '').trim(),
        extra_fields: _collectWosmExtraFields(item),
        sort_order: index,
      };
      return normalized;
    }).filter(function (item) {
      return item.country_ko || item.country_en;
    });
    var columns = _normalizeWosmColumnsBeforeSave();
    var importMapping = _collectWosmImportDefaultFields();
    var registeredCount = Math.max(0, parseInt(((document.getElementById('wosm-registered-count') || {}).value || _wosmRegisteredCount), 10) || 0);
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/wosm-members', {
      method: 'PUT',
      body: JSON.stringify({ items: payload, columns: columns, import_mapping: importMapping, registered_count: registeredCount, if_revision: _wosmMembersRevision }),
    }).then(function (data) {
      _wosmMembers = Array.isArray(data && data.items) ? data.items : payload;
      _wosmColumns = Array.isArray(data && data.columns) ? data.columns : columns;
      _wosmImportSavedMapping = Object.assign({}, _wosmImportSavedMapping, data && data.import_mapping || importMapping);
      _wosmRegisteredCount = Math.max(0, parseInt(data && data.registered_count, 10) || registeredCount);
      _wosmMembersRevision = parseInt(data && data.revision, 10) || (_wosmMembersRevision + 1);
      GW.showToast('세계연맹 회원국 현황을 저장했습니다', 'success');
      _renderWosmMembersEditor();
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () {
      if (btn.classList.contains('is-busy')) _clearButtonBusy(btn);
    });
  }

  function _handleWosmMembersImport(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    if (!window.XLSX) {
      GW.showToast('XLSX 라이브러리를 불러오지 못했습니다', 'error');
      event.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function (loadEvent) {
      try {
        var data = loadEvent && loadEvent.target ? loadEvent.target.result : null;
        var workbook = window.XLSX.read(data, { type: 'array' });
        var sheets = (workbook.SheetNames || []).map(function (sheetName) {
          var sheet = workbook.Sheets[sheetName];
          var rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
          var headers = rows.length ? Object.keys(rows[0]) : [];
          return { name: sheetName, rows: rows, headers: headers };
        }).filter(function (sheet) {
          return Array.isArray(sheet.rows) && sheet.rows.length;
        });
        if (!sheets.length) {
          GW.showToast('가져올 시트가 없습니다.', 'error');
          return;
        }
        _wosmImportFileName = file.name || '업로드 파일';
        _wosmImportSheets = sheets;
        _wosmImportSheetIndex = 0;
        _wosmImportMapping = null;
        _syncWosmImportMappingDefaults();
        _openWosmImportModal();
      } catch (err) {
        console.error('WOSM members XLSX import error:', err);
        GW.showToast('XLSX를 읽지 못했습니다', 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function _mapWosmMemberRows(rows, mapping) {
    var byKey = new Map();
    _wosmMembers.forEach(function (item) {
      var key = _wosmMemberMatchKey(item.country_en, item.country_ko);
      if (key) byKey.set(key, item);
    });
    var map = mapping || {};
    return (Array.isArray(rows) ? rows : []).map(function (row, index) {
      var korean = _readMappedImportCell(row, map['wosm-map-country-ko']);
      var english = _readMappedImportCell(row, map['wosm-map-country-en']);
      var match = byKey.get(_wosmMemberMatchKey(english, korean));
      var translatedKo = _translateCountryNameToKorean(english);
      var sampleKo = String((korean || (match ? match.country_ko : '') || translatedKo || english || '')).trim();
      var nextItem = {
        country_ko: sampleKo,
        country_en: String(english || '').trim(),
        membership_category: String(match && match.membership_category || '').trim(),
        status_description: String(match && match.status_description || '').trim(),
        extra_fields: _createEmptyWosmExtraFields(match && match.extra_fields),
        sort_order: index,
      };
      _getEditableWosmColumns().forEach(function (column) {
        var value = _readMappedImportCell(row, map[_getWosmImportMapKey(column.key)]);
        if (column.key === 'membership_category' || column.key === 'status_description') {
          nextItem[column.key] = String((value || nextItem[column.key] || '')).trim();
          return;
        }
        nextItem.extra_fields[column.key] = String((value || nextItem.extra_fields[column.key] || '')).trim();
      });
      return nextItem;
    }).filter(function (item) {
      return item.country_ko || item.country_en;
    });
  }

  function _readMappedImportCell(row, headerName) {
    if (!headerName) return '';
    var source = row && typeof row === 'object' ? row : {};
    var normalized = _normalizeImportHeader(headerName);
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i += 1) {
      if (_normalizeImportHeader(keys[i]) === normalized) return source[keys[i]];
    }
    return '';
  }

  function _readImportCell(row, aliases) {
    var source = row && typeof row === 'object' ? row : {};
    var normalized = {};
    Object.keys(source).forEach(function (key) {
      normalized[_normalizeImportHeader(key)] = source[key];
    });
    for (var i = 0; i < aliases.length; i += 1) {
      var value = normalized[_normalizeImportHeader(aliases[i])];
      if (typeof value !== 'undefined') return value;
    }
    return '';
  }

  function _normalizeImportHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function _translateCountryNameToKorean(value) {
    if (!window.GW_COUNTRY_NAME_KO || typeof window.GW_COUNTRY_NAME_KO.translate !== 'function') return '';
    return window.GW_COUNTRY_NAME_KO.translate(value);
  }

  function _wosmMemberMatchKey(english, french) {
    return [String(english || '').trim().toLowerCase(), String(french || '').trim().toLowerCase()].join('::');
  }

  function _ensureWosmImportMapping() {
    if (_wosmImportMapping) return;
    _wosmImportMapping = {
      'wosm-map-country-ko': _wosmImportSavedMapping.country_ko || '',
      'wosm-map-country-en': _wosmImportSavedMapping.country_en || '',
    };
    _getEditableWosmColumns().forEach(function (column) {
      _wosmImportMapping[_getWosmImportMapKey(column.key)] = column.default_header || '';
    });
  }

  function _getCurrentWosmImportSheet() {
    return _wosmImportSheets[_wosmImportSheetIndex] || { name: '', rows: [], headers: [] };
  }

  function _guessWosmImportHeader(headers, aliases) {
    var list = Array.isArray(headers) ? headers : [];
    for (var i = 0; i < aliases.length; i += 1) {
      var alias = _normalizeImportHeader(aliases[i]);
      for (var j = 0; j < list.length; j += 1) {
        if (_normalizeImportHeader(list[j]) === alias) return list[j];
      }
    }
    return '';
  }

  function _syncWosmImportMappingDefaults() {
    _ensureWosmImportMapping();
    var headers = _getCurrentWosmImportSheet().headers || [];
    _wosmImportMapping['wosm-map-country-ko'] = _findMatchingHeader(headers, _wosmImportSavedMapping.country_ko) || _guessWosmImportHeader(headers, ['Country name option 1 K', 'Country Name option 1 K', 'Country name ko', 'Country KO', '국가명', '한국어']);
    _wosmImportMapping['wosm-map-country-en'] = _findMatchingHeader(headers, _wosmImportSavedMapping.country_en) || _guessWosmImportHeader(headers, ['Country name option 1 E', 'Country Name option 1 E', 'Country name option 1 English', 'English', 'Country']);
    _getEditableWosmColumns().forEach(function (column) {
      var preferred = column.default_header || '';
      var guessed = preferred ? _findMatchingHeader(headers, preferred) : '';
      _wosmImportMapping[_getWosmImportMapKey(column.key)] = guessed || preferred || '';
    });
  }

  function _findMatchingHeader(headers, preferred) {
    var list = Array.isArray(headers) ? headers : [];
    var normalizedPreferred = _normalizeImportHeader(preferred);
    if (!normalizedPreferred) return '';
    for (var i = 0; i < list.length; i += 1) {
      if (_normalizeImportHeader(list[i]) === normalizedPreferred) return list[i];
    }
    return '';
  }

  function _openWosmImportModal() {
    _renderWosmImportModal();
    var modal = document.getElementById('wosm-import-modal');
    if (modal) modal.style.display = 'flex';
  }

  function _closeWosmImportModal() {
    var modal = document.getElementById('wosm-import-modal');
    if (modal) modal.style.display = 'none';
  }

  function _renderWosmImportModal() {
    var sheetSelect = document.getElementById('wosm-import-sheet');
    var meta = document.getElementById('wosm-import-meta');
    if (sheetSelect) {
      sheetSelect.innerHTML = _wosmImportSheets.map(function (sheet, index) {
        return '<option value="' + index + '">' + GW.escapeHtml(sheet.name) + ' · ' + GW.formatNumber(sheet.rows.length) + '행</option>';
      }).join('');
      sheetSelect.value = String(_wosmImportSheetIndex);
    }
    var sheet = _getCurrentWosmImportSheet();
    if (meta) {
      meta.textContent = (_wosmImportFileName || '업로드 파일') + ' · ' + GW.formatNumber(sheet.rows.length) + '행 · 헤더 ' + GW.formatNumber((sheet.headers || []).length) + '개';
    }
    _renderWosmImportMappingFields();
    _renderWosmImportPreview();
  }

  function _renderWosmImportMappingFields() {
    var wrap = document.getElementById('wosm-import-map-fields');
    var headers = _getCurrentWosmImportSheet().headers || [];
    _ensureWosmImportMapping();
    if (!wrap) return;
    var optionHtml = '<option value="">선택 안 함</option>' + headers.map(function (header) {
      return '<option value="' + GW.escapeHtml(header) + '">' + GW.escapeHtml(header) + '</option>';
    }).join('');
    var fields = [
      { key: 'wosm-map-country-ko', label: '한국어 국가명', optional: true },
      { key: 'wosm-map-country-en', label: '영어 국가명', optional: false },
    ].concat(_getEditableWosmColumns().map(function (column) {
      return {
        key: _getWosmImportMapKey(column.key),
        label: column.label || column.key,
        optional: column.key !== 'membership_category' && column.key !== 'status_description',
      };
    }));
    wrap.innerHTML = fields.map(function (field) {
      return '<div class="v3-form-group">' +
        '<label class="v3-label" for="' + field.key + '">' + GW.escapeHtml(field.label) + (field.optional ? ' <span class="v3-label-opt">선택</span>' : '') + '</label>' +
        '<select class="v3-select" id="' + field.key + '">' + optionHtml + '</select>' +
      '</div>';
    }).join('');
    fields.forEach(function (field) {
      var select = document.getElementById(field.key);
      if (!select) return;
      select.value = _wosmImportMapping[field.key] || '';
      select.addEventListener('change', function () {
        _ensureWosmImportMapping();
        _wosmImportMapping[field.key] = select.value || '';
        _renderWosmImportPreview();
      });
    });
  }

  function _renderWosmImportPreview() {
    var head = document.getElementById('wosm-import-preview-head');
    var body = document.getElementById('wosm-import-preview-body');
    var meta = document.getElementById('wosm-import-preview-meta');
    if (!body) return;
    var sheet = _getCurrentWosmImportSheet();
    var mapped = _mapWosmMemberRows(sheet.rows || [], _wosmImportMapping).slice(0, 5);
    var previewColumns = ['한국어', '영어'].concat(_getEditableWosmColumns().map(function (column) { return column.label || column.key; }));
    if (head) {
      head.innerHTML = '<tr>' + previewColumns.map(function (label) {
        return '<th>' + GW.escapeHtml(label) + '</th>';
      }).join('') + '</tr>';
    }
    if (meta) meta.textContent = '미리보기 ' + GW.formatNumber(mapped.length) + '행 / 원본 ' + GW.formatNumber((sheet.rows || []).length) + '행';
    if (!mapped.length) {
      body.innerHTML = '<tr><td colspan="' + previewColumns.length + '"><div class="v3-import-preview-empty">현재 매핑으로 가져올 항목이 없습니다.</div></td></tr>';
      return;
    }
    body.innerHTML = mapped.map(function (item) {
      var extraCells = _getEditableWosmColumns().map(function (column) {
        return '<td>' + GW.escapeHtml(_getWosmColumnValue(item, column) || '—') + '</td>';
      }).join('');
      return '<tr>' +
        '<td>' + GW.escapeHtml(item.country_ko || '—') + '</td>' +
        '<td>' + GW.escapeHtml(item.country_en || '—') + '</td>' +
        extraCells +
      '</tr>';
    }).join('');
  }

  function _applyWosmImportMapping() {
    var mapped = _mapWosmMemberRows(_getCurrentWosmImportSheet().rows || [], _wosmImportMapping);
    if (!mapped.length) {
      GW.showToast('현재 매핑으로 가져올 항목이 없습니다.', 'error');
      return;
    }
    _wosmMembers = mapped;
    _closeWosmImportModal();
    _renderWosmMembersEditor();
    GW.showToast('XLSX를 가져왔습니다. 필요한 값은 계속 수정해서 저장하세요.', 'success');
  }

  function _getDefaultWosmColumns() {
    return [
      { key: 'country_names', label: '국가명', type: 'country_names', system: true, default_header: '' },
      { key: 'membership_category', label: '회원 자격', type: 'field', system: true, default_header: 'WOSM membership category' },
      { key: 'status_description', label: '상태 설명', type: 'field', system: true, default_header: 'Status description' }
    ];
  }

  function _getEditableWosmColumns() {
    return (_wosmColumns || []).filter(function (column) { return column && column.key !== 'country_names'; });
  }

  function _getWosmColumnValue(item, column) {
    if (!item || !column) return '';
    if (column.key === 'membership_category' || column.key === 'status_description') return item[column.key] || '';
    return item.extra_fields && typeof item.extra_fields === 'object' ? (item.extra_fields[column.key] || '') : '';
  }

  function _setWosmColumnValue(item, key, value) {
    if (!item) return;
    if (key === 'country_ko' || key === 'country_en' || key === 'membership_category' || key === 'status_description') {
      item[key] = value;
      return;
    }
    item.extra_fields = item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
    item.extra_fields[key] = value;
  }

  function _createEmptyWosmExtraFields(source) {
    var base = {};
    var initial = source && typeof source === 'object' ? source : {};
    _getEditableWosmColumns().forEach(function (column) {
      if (column.key === 'membership_category' || column.key === 'status_description') return;
      base[column.key] = String(initial[column.key] || '').trim();
    });
    return base;
  }

  function _collectWosmExtraFields(item) {
    var result = {};
    var source = item && item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
    _getEditableWosmColumns().forEach(function (column) {
      if (column.key === 'membership_category' || column.key === 'status_description') return;
      result[column.key] = String(source[column.key] || '').trim();
    });
    return result;
  }

  function _createUniqueWosmColumnKey() {
    var index = 1;
    while (_hasWosmColumnKey('column_' + index)) index += 1;
    return 'column_' + index;
  }

  function _hasWosmColumnKey(key, skipIndex) {
    return (_wosmColumns || []).some(function (column, index) {
      return index !== skipIndex && column && column.key === key;
    });
  }

  function _sanitizeWosmColumnKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }

  function _renameWosmExtraField(oldKey, nextKey) {
    if (!oldKey || !nextKey || oldKey === nextKey) return;
    _wosmMembers.forEach(function (item) {
      item.extra_fields = item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
      if (typeof item.extra_fields[oldKey] !== 'undefined' && typeof item.extra_fields[nextKey] === 'undefined') {
        item.extra_fields[nextKey] = item.extra_fields[oldKey];
      }
      delete item.extra_fields[oldKey];
    });
  }

  function _removeWosmColumnFromItems(key) {
    _wosmMembers.forEach(function (item) {
      if (item && item.extra_fields && typeof item.extra_fields === 'object') delete item.extra_fields[key];
    });
  }

  function _moveWosmColumn(index, delta) {
    var nextIndex = index + delta;
    if (index < 0 || nextIndex < 0) return;
    if (index >= _wosmColumns.length || nextIndex >= _wosmColumns.length) return;
    var current = _wosmColumns[index];
    var target = _wosmColumns[nextIndex];
    if (!current || !target) return;
    _wosmColumns[index] = target;
    _wosmColumns[nextIndex] = current;
    _renderWosmMembersEditor();
  }

  function _normalizeWosmColumnsBeforeSave() {
    var seen = {};
    var next = [];
    (_wosmColumns || []).forEach(function (column) {
      if (!column) return;
      var key = _sanitizeWosmColumnKey(column.key) || _createUniqueWosmColumnKey();
      if (seen[key]) return;
      seen[key] = true;
      next.push({
        key: key,
        label: String(column.label || key).trim() || key,
        type: key === 'country_names' ? 'country_names' : 'field',
        system: key === 'country_names' || key === 'membership_category' || key === 'status_description',
        default_header: key === 'country_names' ? '' : String(column.default_header || '').trim(),
      });
    });
    if (!seen.country_names) next.push({ key: 'country_names', label: '국가명', type: 'country_names', system: true, default_header: '' });
    _wosmColumns = _prioritizeWosmColumns(next);
    return _wosmColumns;
  }

  function _prioritizeWosmColumns(columns) {
    var list = Array.isArray(columns) ? columns.slice() : [];
    var sortColumns = [];
    var others = [];
    list.forEach(function (column) {
      if (_isWosmSortPriorityColumn(column)) sortColumns.push(column);
      else others.push(column);
    });
    return sortColumns.concat(others);
  }

  function _isWosmSortPriorityColumn(column) {
    var key = String(column && column.key || '').toLowerCase();
    var label = String(column && column.label || '').toLowerCase();
    var header = String(column && column.default_header || '').toLowerCase();
    return key.indexOf('sort') >= 0
      || label.indexOf('정렬') >= 0
      || label.indexOf('순번') >= 0
      || header.indexOf('strict order') >= 0;
  }

  function _getWosmImportMapKey(columnKey) {
    return 'wosm-map-field-' + columnKey;
  }

  /* ══════════════════════════════════════════════════════════
     CONFIRM DIALOG
  ══════════════════════════════════════════════════════════ */
  function _confirm(title, msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      _confirmResolve = resolve;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent   = msg;
      document.getElementById('confirm-ok-btn').textContent = opts.okText || '확인';
      document.getElementById('confirm-cancel-btn').textContent = opts.cancelText || '취소';
      document.getElementById('confirm-cancel-btn').style.display = opts.hideCancel ? 'none' : '';
      document.getElementById('v3-confirm').style.display  = 'flex';
    });
  }
  function _alert(title, msg) {
    return _confirm(title, msg, { hideCancel: true, okText: '확인' });
  }
  function _closeConfirm(ok) {
    document.getElementById('v3-confirm').style.display = 'none';
    document.getElementById('confirm-cancel-btn').style.display = '';
    document.getElementById('confirm-ok-btn').textContent = '확인';
    document.getElementById('confirm-cancel-btn').textContent = '취소';
    if (_confirmResolve) { _confirmResolve(ok); _confirmResolve = null; }
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _fmt(n) {
    n = Number(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function _setText(id, text) {
    var el = document.getElementById(id); if (el) el.textContent = text;
  }

  function _shortDate(value) {
    if (!value) return '';
    if (GW.formatDateTimeCompactKst) return GW.formatDateTimeCompactKst(value);
    return String(value).replace('T', ' ').slice(0, 16) + ' KST';
  }

  function _catBadge(cat) {
    var map = { korea: 'v3-badge-blue', apr: 'v3-badge-green', wosm: 'v3-badge-yellow', people: 'v3-badge-blue' };
    return map[cat] || 'v3-badge-gray';
  }

  function _getCategoryTags(settings, cat) {
    var seen = {};
    var result = [];
    _getTagScopeItems(settings, 'common').concat(_getTagScopeItems(settings, cat)).forEach(function (item) {
      if (!item || seen[item]) return;
      seen[item] = true;
      result.push(item);
    });
    return result;
  }

  function _kstNow() {
    var now = new Date(Date.now() + 9 * 3600 * 1000);
    return now.toISOString().slice(0, 16);
  }

  function _toDatetimeLocal(dt) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
      'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  function _escJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function _escId(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

})();
