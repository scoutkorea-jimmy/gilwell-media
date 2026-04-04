/**
 * Gilwell Media · Admin Console V3
 * Version: 03.046.05
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
  var _contributors  = [];
  var _editors       = [];
  var _translations  = {};
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
    document.getElementById('author-save-btn').addEventListener('click', _saveAuthor);
    document.getElementById('banner-save-btn').addEventListener('click', _saveBanner);
    document.getElementById('ticker-save-btn').addEventListener('click', _saveTicker);
    document.getElementById('contrib-save-btn').addEventListener('click', _saveContributors);
    document.getElementById('contrib-add-btn').addEventListener('click', _addContributorRow);
    document.getElementById('editors-save-btn').addEventListener('click', _saveEditors);
    document.getElementById('editors-add-btn').addEventListener('click', _addEditorRow);
    document.getElementById('trans-save-btn').addEventListener('click', _saveTranslations);

    // Hero search
    document.getElementById('hero-search').addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { document.getElementById('hero-search-results').style.display = 'none'; return; }
      _searchHero(q);
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
      hero: '히어로 기사', tags: '태그 / 글머리', meta: '메타태그 / SEO',
      author: '저자 / 고지', banner: '게시판 배너', ticker: '티커',
      contributors: '기고자', editors: '편집자 / 접근', translations: 'UI 번역',
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
    else if (section === 'tags')    _loadTagSettingsUI();
    else if (section === 'meta')    _loadMetaUI();
    else if (section === 'author')  _loadAuthorUI();
    else if (section === 'banner')  _loadBannerUI();
    else if (section === 'ticker')  _loadTickerUI();
    else if (section === 'contributors') _loadContributorsUI();
    else if (section === 'editors') _loadEditorsUI();
    else if (section === 'translations') _loadTranslationsUI();
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
        }, '발행 예정 글이 없습니다') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:#64748b;">최근 초안</div>' +
        _renderSimpleRows(drafts, function (item) {
          return {
            title: item.title || '(제목 없음)',
            meta: (item.category || 'site') + ' · ' + _shortDate(item.updated_at),
            action: item.id ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="V3.editPost(' + item.id + ')">열기</button>' : '',
          };
        }, '최근 초안이 없습니다');
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
        }, '최근 오류 로그가 없습니다') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:#64748b;">최근 로그인 시도</div>' +
        _renderSimpleRows(logins, function (item) {
          return {
            title: item.message || item.type || '로그인 이벤트',
            meta: [item.actor || 'unknown', _shortDate(item.created_at)].filter(Boolean).join(' · '),
            action: '',
          };
        }, '로그인 이벤트가 없습니다');
    }
    if (settingsEl) {
      var settings = operations.recent_settings || [];
      settingsEl.innerHTML = _renderSimpleRows(settings, function (item) {
        return {
          title: item.key || 'setting',
          meta: _shortDate(item.saved_at),
          action: '',
        };
      }, '최근 설정 변경이 없습니다');
    }
    if (deploymentsEl) {
      var deployments = operations.deployments || [];
      deploymentsEl.innerHTML = _renderSimpleRows(deployments, function (item) {
        return {
          title: [item.environment || 'release', item.version || item.site_version || ''].filter(Boolean).join(' · '),
          meta: [item.status || 'success', item.branch || '', _shortDate(item.created_on)].filter(Boolean).join(' · '),
          action: item.url ? '<a class="v3-btn v3-btn-ghost v3-btn-xs" href="' + GW.escapeHtml(item.url) + '" target="_blank" rel="noopener">보기</a>' : '',
        };
      }, '릴리스 이력이 없습니다');
    }
  }

  function _renderSimpleRows(items, mapFn, emptyText) {
    var rows = Array.isArray(items) ? items.slice(0, 6) : [];
    if (!rows.length) {
      return '<div class="v3-empty"><div class="v3-empty-text">' + GW.escapeHtml(emptyText || '데이터 없음') + '</div></div>';
    }
    return rows.map(function (item) {
      var mapped = mapFn(item) || {};
      return '<div class="v3-recent-row">' +
        '<div class="v3-recent-info">' +
          '<div class="v3-recent-title">' + GW.escapeHtml(mapped.title || '') + '</div>' +
          '<div class="v3-recent-meta">' + GW.escapeHtml(mapped.meta || '') + '</div>' +
        '</div>' +
        (mapped.action ? '<div style="margin-left:10px;flex-shrink:0;">' + mapped.action + '</div>' : '') +
      '</div>';
    }).join('');
  }

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
      '<div class="marketing-flow-shell"><div class="marketing-hover-tip" aria-hidden="true"></div><svg class="marketing-flow-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="고객 여정 흐름">' + linkParts + nodeParts + '</svg></div>';
    _bindMarketingHoverTips(el);
  }

  function _renderMarketingScatter(items) {
    var el = document.getElementById('marketing-scatter');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">페이지 기회 맵 데이터가 없습니다</div></div>';
      return;
    }
    var W = 1080;
    var H = 420;
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
    function rScale(value) {
      return 7 + Math.sqrt(Number(value || 0) / maxPageviews) * 26;
    }
    var points = items.map(function (item, index) {
      var cx = xScale(item.unique_users || 1);
      var cy = yScale(item.views_per_user || 0);
      var radius = rScale(item.pageviews || 0);
      var color = _marketingStageColor(item.stage);
      var label = index < 8 ? '<text x="' + (cx + radius + 6) + '" y="' + (cy + 4) + '" class="marketing-scatter-label">' + GW.escapeHtml(_trimMarketingTitle(item.title, 16)) + '</text>' : '';
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
    el.innerHTML = '<div class="marketing-scatter-legend">' + legend + '</div><div class="marketing-scatter-shell"><div class="marketing-hover-tip" aria-hidden="true"></div><svg class="marketing-scatter-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="페이지 기회 맵">' + axis + points + '</svg></div>';
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
  var META_PAGES = ['home', 'latest', 'korea', 'apr', 'wosm', 'people', 'glossary', 'contributors', 'search', 'ai_guide'];
  var META_LABELS = { home:'홈', latest:'최신 뉴스', korea:'Korea/KSA', apr:'APR', wosm:'WOSM', people:'People', glossary:'용어집', contributors:'기고자', search:'검색', ai_guide:'AI 가이드' };

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
     CONFIRM DIALOG
  ══════════════════════════════════════════════════════════ */
  function _confirm(title, msg) {
    return new Promise(function (resolve) {
      _confirmResolve = resolve;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent   = msg;
      document.getElementById('v3-confirm').style.display  = 'flex';
    });
  }
  function _closeConfirm(ok) {
    document.getElementById('v3-confirm').style.display = 'none';
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
    return String(value).replace('T', ' ').slice(0, 16);
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
