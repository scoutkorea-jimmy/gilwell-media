/**
 * Gilwell Media · Admin Console V3
 * Version: V3.002.00
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
  var _tagSettings   = {};
  var _tagInlineEdit = null;
  var _siteMeta      = {};
  var _contributors  = [];
  var _editors       = [];
  var _translations  = {};
  var _boardBanner   = {};
  var _ticker        = '';
  var _calendarTags  = [];

  // Calendar
  var _calItems      = [];
  var _calCats       = [];

  // Glossary
  var _glosItems     = [];
  var _glosSearch    = '';
  var _glosSearchTimer = null;

  // Confirm
  var _confirmResolve = null;

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
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
    document.getElementById('dash-refresh-btn').addEventListener('click', _loadDashboard);

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
    return GW.apiFetch('/api/admin/session')
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

    btn.disabled = true; btn.textContent = '로그인 중…'; err.style.display = 'none';
    GW.apiFetch('/api/admin/login', {
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
      btn.disabled = false; btn.textContent = '관리자 입장';
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
    // Load editor.js
    _loadEditorJS(function () { _initEditor(); });
    // Load tag settings (for write form dropdown)
    _loadTagSettings();
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
  function _loadDashboard() {
    var recentEl = document.getElementById('dash-recent-list');
    var topEl = document.getElementById('dash-top-list');
    _setText('dash-stat-visits', '—');
    _setText('dash-stat-views', '—');
    _setText('dash-stat-posts', '—');
    _setText('dash-stat-pub', '—');
    _setText('dash-stat-visits-sub', '불러오는 중');
    _setText('dash-stat-posts-sub', '불러오는 중');

    Promise.allSettled([
      GW.apiFetch('/api/admin/analytics'),
      GW.apiFetch('/api/posts?limit=8&published=all'),
      GW.apiFetch('/api/posts/popular?limit=5'),
      GW.apiFetch('/api/posts?limit=1&published=1'),
    ]).then(function (results) {
      var analytics = results[0].status === 'fulfilled' ? (results[0].value || {}) : {};
      var recentRes = results[1].status === 'fulfilled' ? (results[1].value || {}) : { posts: [] };
      var popularRes = results[2].status === 'fulfilled' ? (results[2].value || {}) : { posts: [] };
      var published = results[3].status === 'fulfilled' ? (results[3].value || {}) : { total: 0 };
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
      if (results[1].status !== 'fulfilled') {
        recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">최근 게시글 API 오류</div></div>';
      }
      if (results[2].status !== 'fulfilled') {
        topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">인기 게시글 API 오류</div></div>';
      }
      if (results[3].status !== 'fulfilled') {
        _setText('dash-stat-posts-sub', '공개 수 집계 오류');
      } else {
        _setText('dash-stat-posts-sub', '전체 게시글');
      }
    }).catch(function (e) {
      recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml((e && e.message) || 'API 오류') + '</div></div>';
      topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      _setText('dash-stat-visits-sub', '대시보드 로딩 실패');
      _setText('dash-stat-posts-sub', '대시보드 로딩 실패');
    });
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

    GW.apiFetch('/api/posts?' + params.toString())
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
    GW.apiFetch('/api/posts/' + id, {
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
      GW.apiFetch('/api/posts/' + id, { method: 'DELETE' })
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
    document.getElementById('w-tag').value        = '';
    document.getElementById('w-author').value     = '';
    document.getElementById('w-date').value       = _kstNow();
    document.getElementById('w-youtube').value    = '';
    document.getElementById('w-cover-caption').value = '';
    document.getElementById('w-location-name').value = '';
    document.getElementById('w-location-addr').value = '';
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

    GW.apiFetch('/api/posts/' + id)
      .then(function (data) {
        var p = data.post || data;
        document.getElementById('write-panel-title').textContent = '글 수정: ' + (p.title || '');
        document.getElementById('w-title').value       = p.title || '';
        document.getElementById('w-subtitle').value    = p.subtitle || '';
        document.getElementById('w-cat').value         = p.category || 'korea';
        document.getElementById('w-tag').value         = p.tag || '';
        document.getElementById('w-author').value      = p.author || '';
        document.getElementById('w-youtube').value     = p.youtube_url || '';
        document.getElementById('w-cover-caption').value = p.image_caption || '';
        document.getElementById('w-location-name').value = p.location_name || '';
        document.getElementById('w-location-addr').value = p.location_address || '';
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
    btn.disabled = true;

    _editorGetData().then(function (content) {
      var dateVal = document.getElementById('w-date').value;
      var body = {
        title:            title,
        subtitle:         document.getElementById('w-subtitle').value.trim(),
        category:         document.getElementById('w-cat').value,
        tag:              document.getElementById('w-tag').value,
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

      return GW.apiFetch(url, { method: method, body: JSON.stringify(body) });
    }).then(function (data) {
      var saved = data.post || data;
      if (!_editingId && saved.id) _editingId = saved.id;
      GW.showToast('저장했습니다', 'success');
      document.getElementById('write-panel-title').textContent = '글 수정: ' + (document.getElementById('w-title').value || '');
      document.getElementById('w-published').checked = publish || document.getElementById('w-published').checked;
      btn.disabled = false;
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
      btn.disabled = false;
    });
  }

  function _loadPostHistory(id) {
    var card = document.getElementById('write-history-card');
    var list = document.getElementById('write-history-list');
    card.style.display = 'block';
    GW.apiFetch('/api/posts/' + id + '/history').then(function (data) {
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

  /* ── Related posts ── */
  function _searchRelated(q) {
    var results = document.getElementById('w-related-results');
    GW.apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8').then(function (data) {
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
    GW.apiFetch('/api/settings/tags').then(function (data) {
      _tagSettings = (GW.normalizeTagSettings ? GW.normalizeTagSettings(data) : data) || {};
      _populateTagDropdown(document.getElementById('w-cat').value);
    }).catch(function () {});

    document.getElementById('w-cat').addEventListener('change', function () {
      _populateTagDropdown(this.value);
    });
  }

  function _populateTagDropdown(cat) {
    var sel = document.getElementById('w-tag');
    var current = sel.value;
    var tags = _getCategoryTags(_tagSettings, cat);
    sel.innerHTML = '<option value="">없음</option>' + tags.map(function (t) {
      var label = typeof t === 'string' ? t : (t.label || t.value || t);
      var value = typeof t === 'string' ? t : (t.value || t.label || t);
      return '<option value="' + GW.escapeHtml(value) + '">' + GW.escapeHtml(label) + '</option>';
    }).join('');
    sel.value = current;
  }

  /* ══════════════════════════════════════════════════════════
     CALENDAR
  ══════════════════════════════════════════════════════════ */
  function _loadCalendar() {
    var el = document.getElementById('cal-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    Promise.all([
      GW.apiFetch('/api/calendar?limit=200'),
      GW.apiFetch('/api/settings/calendar-tags').catch(function () { return { tags: [] }; }),
    ]).then(function (results) {
      var data = results[0];
      _calItems = (data && data.events) || (data && data.items) || [];
      var tagData = results[1] || {};
      _calCats = Array.isArray(tagData.items) ? tagData.items : (Array.isArray(tagData.tags) ? tagData.tags : (Array.isArray(tagData) ? tagData : []));

      // Populate category filter
      var catSel = document.getElementById('cal-filter-cat');
      catSel.innerHTML = '<option value="all">전체 분류</option>' + _calCats.map(function (t) {
        return '<option value="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</option>';
      }).join('');

      // Populate calendar modal category dropdown
      var calCatSel = document.getElementById('cal-cat');
      calCatSel.innerHTML = '<option value="">미분류</option>' + _calCats.map(function (t) {
        return '<option value="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</option>';
      }).join('');

      // Year filter
      var years = {};
      _calItems.forEach(function (e) { if (e.start_at) years[e.start_at.slice(0, 4)] = 1; });
      var yearSel = document.getElementById('cal-filter-year');
      yearSel.innerHTML = '<option value="all">전체 연도</option>' + Object.keys(years).sort().reverse().map(function (y) {
        return '<option value="' + y + '">' + y + '</option>';
      }).join('');

      _renderCalList();
    }).catch(function (e) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
    });
  }

  function _renderCalList() {
    var el    = document.getElementById('cal-list');
    var year  = document.getElementById('cal-filter-year').value;
    var cat   = document.getElementById('cal-filter-cat').value;
    var items = _calItems.filter(function (e) {
      if (year !== 'all' && (!e.start_at || e.start_at.slice(0, 4) !== year)) return false;
      if (cat !== 'all' && e.event_category !== cat) return false;
      return true;
    });
    items.sort(function (a, b) { return (b.start_at || '') < (a.start_at || '') ? -1 : 1; });

    if (!items.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-icon">📅</div><div class="v3-empty-text">일정이 없습니다</div></div>';
      return;
    }
    el.innerHTML = items.map(function (e) {
      var dt = e.start_at ? new Date(e.start_at) : null;
      var month = dt ? dt.toLocaleString('en', { month: 'short' }).toUpperCase() : '';
      var day   = dt ? dt.getDate() : '';
      return '<div class="v3-cal-item" onclick="V3._openCalEvent(' + e.id + ')">' +
        '<div class="v3-cal-date-col">' +
          '<div class="v3-cal-date-m">' + month + '</div>' +
          '<div class="v3-cal-date-d">' + day + '</div>' +
        '</div>' +
        '<div class="v3-cal-info">' +
          '<div class="v3-cal-title">' + GW.escapeHtml(e.title || '') + '</div>' +
          '<div class="v3-cal-meta">' +
            (e.event_category ? '<span class="v3-badge v3-badge-blue">' + GW.escapeHtml(e.event_category) + '</span> ' : '') +
            GW.escapeHtml(e.location_name || e.country_name || '') +
          '</div>' +
        '</div>' +
        '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-btn-sm" onclick="event.stopPropagation();V3._openCalEvent(' + e.id + ')">수정</button>' +
      '</div>';
    }).join('');

    // Re-bind filter handlers
    document.getElementById('cal-filter-year').onchange = _renderCalList;
    document.getElementById('cal-filter-cat').onchange  = _renderCalList;
  }

  V3._openCalEvent = function (id) {
    var e = _calItems.find(function (c) { return c.id === id; });
    if (e) _openCalModal(e);
  };

  function _openCalModal(e) {
    document.getElementById('cal-id').value          = e ? e.id : '';
    document.getElementById('cal-modal-title').textContent = e ? '일정 수정' : '새 일정';
    document.getElementById('cal-title').value       = e ? (e.title || '') : '';
    document.getElementById('cal-desc').value        = e ? (e.description || '') : '';
    document.getElementById('cal-start').value       = e && e.start_at ? e.start_at.slice(0, 10) : '';
    document.getElementById('cal-end').value         = e && e.end_at   ? e.end_at.slice(0, 10)   : '';
    document.getElementById('cal-cat').value         = e ? (e.event_category || '') : '';
    document.getElementById('cal-country').value     = e ? (e.country_name || '') : '';
    document.getElementById('cal-loc-name').value    = e ? (e.location_name || '') : '';
    document.getElementById('cal-loc-addr').value    = e ? (e.location_address || '') : '';
    document.getElementById('cal-link').value        = e ? (e.link_url || '') : '';
    document.getElementById('cal-delete-btn').style.display = e ? '' : 'none';
    document.getElementById('cal-modal').style.display = 'flex';
  }

  function _closeCalModal() {
    document.getElementById('cal-modal').style.display = 'none';
  }

  function _saveCal() {
    var id    = document.getElementById('cal-id').value;
    var title = document.getElementById('cal-title').value.trim();
    if (!title) { GW.showToast('제목을 입력하세요', 'error'); return; }
    var body = {
      title:            title,
      description:      document.getElementById('cal-desc').value.trim(),
      start_at:         document.getElementById('cal-start').value || null,
      end_at:           document.getElementById('cal-end').value   || null,
      event_category:   document.getElementById('cal-cat').value,
      country_name:     document.getElementById('cal-country').value.trim(),
      location_name:    document.getElementById('cal-loc-name').value.trim(),
      location_address: document.getElementById('cal-loc-addr').value.trim(),
      link_url:         document.getElementById('cal-link').value.trim(),
    };
    var method = id ? 'PUT' : 'POST';
    var url    = id ? '/api/calendar/' + id : '/api/calendar';
    document.getElementById('cal-save-btn').disabled = true;
    GW.apiFetch(url, { method: method, body: JSON.stringify(body) })
      .then(function () {
        GW.showToast('저장했습니다', 'success');
        _closeCalModal();
        _loadCalendar();
      }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('cal-save-btn').disabled = false; });
  }

  function _deleteCal(id) {
    _confirm('일정 삭제', '이 일정을 삭제하시겠습니까?').then(function (ok) {
      if (!ok) return;
      GW.apiFetch('/api/calendar/' + id, { method: 'DELETE' })
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

  function _glosInferBucket(termKo) {
    var first = String(termKo || '').trim().charAt(0);
    if (!first) return '';
    var code = first.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '';
    var choseongIndex = Math.floor((code - 0xac00) / 588);
    return GLOS_CHOSEONG_BUCKETS[choseongIndex] || '';
  }

  function _glosIsNumericStart(value) {
    var first = String(value || '').trim().charAt(0);
    return first >= '0' && first <= '9';
  }

  function _glosHasKorean(value) {
    return !!String(value || '').trim();
  }

  function _glosResolveBucket(item) {
    if (_glosIsNumericStart(item.term_ko) || _glosIsNumericStart(item.term_en) || _glosIsNumericStart(item.term_fr)) {
      return GLOS_MISC_BUCKET;
    }
    if (!_glosHasKorean(item.term_ko) && (String(item.term_en || '').trim() || String(item.term_fr || '').trim())) {
      return GLOS_UNMATCHED_BUCKET;
    }
    return _glosInferBucket(item.term_ko) || item.bucket || '가';
  }

  function _loadGlossary() {
    GW.apiFetch('/api/glossary?limit=500').then(function (data) {
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
    var ko = document.getElementById('glos-ko').value.trim();
    var en = document.getElementById('glos-en').value.trim();
    var fr = document.getElementById('glos-fr').value.trim();
    if (!ko && !en && !fr) { GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력하세요', 'error'); return; }
    var body = {
      term_ko:       ko,
      term_en:       en,
      term_fr:       fr,
      description_ko: document.getElementById('glos-desc').value.trim(),
      bucket: (_glosIsNumericStart(ko) || _glosIsNumericStart(en) || _glosIsNumericStart(fr))
        ? GLOS_MISC_BUCKET
        : _glosInferBucket(ko),
    };
    var method = id ? 'PUT' : 'POST';
    var url    = id ? '/api/glossary/' + id : '/api/glossary';
    document.getElementById('glos-save-btn').disabled = true;
    GW.apiFetch(url, { method: method, body: JSON.stringify(body) })
      .then(function () {
        GW.showToast('저장했습니다', 'success');
        _closeGlosModal();
        _loadGlossary();
      }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('glos-save-btn').disabled = false; });
  }

  function _deleteGlos(id) {
    _confirm('용어 삭제', '이 용어를 삭제하시겠습니까?').then(function (ok) {
      if (!ok) return;
      GW.apiFetch('/api/glossary/' + id, { method: 'DELETE' })
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

    GW.apiFetch('/api/admin/analytics?days=' + period).then(function (data) {
      var today    = data.today    || {};
      var summary  = data.summary  || {};
      var visitors = data.visitors || {};
      var views    = data.views    || {};
      var topPosts = data.top_posts || data.top_paths || (views.top_paths || []);
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
            '<div class="v3-bar-label" title="' + GW.escapeHtml(p.title || '') + '">' + GW.escapeHtml(p.title || '') + '</div>' +
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
  function _loadMarketing() {
    var el = document.getElementById('marketing-body');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/admin/marketing').then(function (data) {
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

    el.innerHTML = '<div class="marketing-flow-shell"><div class="marketing-hover-tip" aria-hidden="true"></div><svg class="marketing-flow-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="고객 여정 흐름">' + linkParts + nodeParts + '</svg></div>';
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
      var target = event.target.closest('[data-href]');
      if (!target || !shell.contains(target)) return;
      var href = target.getAttribute('data-href') || '';
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
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
    GW.apiFetch('/api/settings/hero').then(function (data) {
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
      return GW.apiFetch('/api/posts/' + id).catch(function () { return null; });
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
    GW.apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8&published=1').then(function (data) {
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
    document.getElementById('hero-save-btn').disabled = true;
    GW.apiFetch('/api/settings/hero', {
      method: 'PUT',
      body: JSON.stringify({ post_ids: _heroPostIds, interval_ms: interval }),
    }).then(function () {
      GW.showToast('히어로 설정을 저장했습니다', 'success');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () { document.getElementById('hero-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TAGS
  ══════════════════════════════════════════════════════════ */
  function _loadTagSettingsUI() {
    var el = document.getElementById('tags-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/tags').then(function (data) {
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
    document.getElementById('tags-save-btn').disabled = true;
    GW.apiFetch('/api/settings/tags', {
      method: 'PUT',
      body: JSON.stringify({ common: common, categories: cats }),
    }).then(function () {
      GW.showToast('태그 설정을 저장했습니다', 'success');
      _tagSettings = { common: common, categories: cats };
      _tagInlineEdit = null;
      _loadTagSettings();
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
    }).finally(function () { document.getElementById('tags-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – META
  ══════════════════════════════════════════════════════════ */
  var META_PAGES = ['home', 'latest', 'korea', 'apr', 'wosm', 'people', 'glossary', 'contributors', 'search', 'ai_guide'];
  var META_LABELS = { home:'홈', latest:'최신 뉴스', korea:'Korea/KSA', apr:'APR', wosm:'WOSM', people:'People', glossary:'용어집', contributors:'기고자', search:'검색', ai_guide:'AI 가이드' };

  function _loadMetaUI() {
    var el = document.getElementById('meta-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/site-meta').then(function (data) {
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
    document.getElementById('meta-save-btn').disabled = true;
    GW.apiFetch('/api/settings/site-meta', { method: 'PUT', body: JSON.stringify(body) })
      .then(function () { GW.showToast('메타태그 설정을 저장했습니다', 'success'); })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('meta-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – AUTHOR
  ══════════════════════════════════════════════════════════ */
  function _loadAuthorUI() {
    Promise.all([
      GW.apiFetch('/api/settings/author').catch(function () { return {}; }),
      GW.apiFetch('/api/settings/ai-disclaimer').catch(function () { return {}; }),
    ]).then(function (results) {
      document.getElementById('s-author-name').value  = (results[0] && (results[0].author || results[0].name)) || '';
      document.getElementById('s-ai-disclaimer').value = (results[1] && results[1].text) || '';
    });
  }

  function _saveAuthor() {
    var name = document.getElementById('s-author-name').value.trim();
    var disc = document.getElementById('s-ai-disclaimer').value.trim();
    document.getElementById('author-save-btn').disabled = true;
    Promise.all([
      GW.apiFetch('/api/settings/author', { method: 'PUT', body: JSON.stringify({ author: name }) }),
      GW.apiFetch('/api/settings/ai-disclaimer', { method: 'PUT', body: JSON.stringify({ text: disc }) }),
    ]).then(function () {
      GW.showToast('저장했습니다', 'success');
    }).catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('author-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – BANNER
  ══════════════════════════════════════════════════════════ */
  function _loadBannerUI() {
    GW.apiFetch('/api/settings/board-banner').then(function (data) {
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
    document.getElementById('banner-save-btn').disabled = true;
    GW.apiFetch('/api/settings/board-banner', { method: 'PUT', body: JSON.stringify({ items: items }) })
      .then(function () { GW.showToast('배너 설정을 저장했습니다', 'success'); })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('banner-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TICKER
  ══════════════════════════════════════════════════════════ */
  function _loadTickerUI() {
    GW.apiFetch('/api/settings/ticker').then(function (data) {
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
    document.getElementById('ticker-save-btn').disabled = true;
    GW.apiFetch('/api/settings/ticker', { method: 'PUT', body: JSON.stringify({ items: lines }) })
      .then(function () { GW.showToast('티커를 저장했습니다', 'success'); })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('ticker-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – CONTRIBUTORS
  ══════════════════════════════════════════════════════════ */
  function _loadContributorsUI() {
    var el = document.getElementById('contrib-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/contributors').then(function (data) {
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
    document.getElementById('contrib-save-btn').disabled = true;
    var payload = _contributors.map(function (item) {
      return {
        name: item && item.name || '',
        note: item && (item.role || item.note) || '',
        date: item && item.date || '',
      };
    });
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: payload }) })
      .then(function () { GW.showToast('기고자 목록을 저장했습니다', 'success'); })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('contrib-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – EDITORS
  ══════════════════════════════════════════════════════════ */
  function _loadEditorsUI() {
    var el = document.getElementById('editors-list');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/editors').then(function (data) {
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
    document.getElementById('editors-save-btn').disabled = true;
    var editorsPayload = {};
    _editors.forEach(function (item, index) {
      var key = item && item.key ? item.key : String.fromCharCode(65 + index);
      editorsPayload[key] = item && item.name ? item.name : '';
    });
    GW.apiFetch('/api/settings/editors', { method: 'PUT', body: JSON.stringify({ editors: editorsPayload }) })
      .then(function () { GW.showToast('편집자 설정을 저장했습니다', 'success'); })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('editors-save-btn').disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – TRANSLATIONS
  ══════════════════════════════════════════════════════════ */
  function _loadTranslationsUI() {
    var el = document.getElementById('trans-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/translations').then(function (data) {
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
    document.getElementById('trans-save-btn').disabled = true;
    GW.apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify({ strings: result }) })
      .then(function () { GW.showToast('번역 설정을 저장했습니다', 'success'); _translations = result; })
      .catch(function (e) { GW.showToast(e.message || '저장 실패', 'error'); })
      .finally(function () { document.getElementById('trans-save-btn').disabled = false; });
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
