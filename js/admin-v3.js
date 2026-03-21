/**
 * Gilwell Media · Admin Console V3
 * Version: V3.001.01
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
    // Load today's summary + recent posts in parallel
    Promise.all([
      GW.apiFetch('/api/admin/analytics').catch(function () { return {}; }),
      GW.apiFetch('/api/posts?limit=8&published=all').catch(function () { return { posts: [] }; }),
      GW.apiFetch('/api/posts/popular?limit=5').catch(function () { return { posts: [] }; }),
    ]).then(function (results) {
      var analytics = results[0] || {};
      var recent    = (results[1] && results[1].posts) || [];
      var popular   = (results[2] && results[2].posts) || [];

      // Stats
      var today = analytics.today || {};
      _setText('dash-stat-visits', _fmt(today.visits || 0));
      _setText('dash-stat-views',  _fmt(today.views || 0));
      var counts = analytics.counts || {};
      _setText('dash-stat-posts', _fmt(counts.total || 0));
      _setText('dash-stat-pub',   _fmt(counts.published || 0));

      // Recent posts
      var recentEl = document.getElementById('dash-recent-list');
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
      var topEl = document.getElementById('dash-top-list');
      if (!popular.length) {
        topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">데이터 없음</div></div>';
      } else {
        topEl.innerHTML = popular.map(function (p, i) {
          return '<div class="v3-recent-row" onclick="V3.editPost(' + p.id + ')">' +
            '<div style="font-size:11px;font-weight:700;color:#94a3b8;width:18px;flex-shrink:0;">' + (i + 1) + '</div>' +
            '<div class="v3-recent-info">' +
              '<div class="v3-recent-title">' + GW.escapeHtml(p.title || '') + '</div>' +
              '<div class="v3-recent-meta">조회 ' + _fmt(p.views || 0) + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
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
    var cats = (_tagSettings && _tagSettings.categories) ? _tagSettings.categories : {};
    var tags = (cats[cat] && cats[cat].tags) ? cats[cat].tags : [];
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
      _calCats = Array.isArray(tagData.tags) ? tagData.tags : (Array.isArray(tagData) ? tagData : []);

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
  var GLOS_BUCKETS = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하'];

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
      var b = t.bucket || '기타';
      if (!grouped[b]) grouped[b] = [];
      grouped[b].push(t);
    });
    var html = '';
    GLOS_BUCKETS.forEach(function (bucket) {
      if (!grouped[bucket]) return;
      html += '<div class="v3-bucket-head">' + GW.escapeHtml(bucket) + '</div>';
      grouped[bucket].forEach(function (t) {
        html += '<div class="v3-glos-item" onclick="V3._openGlosItem(' + t.id + ')">' +
          '<div class="v3-glos-ko">' + GW.escapeHtml(t.term_ko || '') + '</div>' +
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
    if (!ko) { GW.showToast('한국어 용어를 입력하세요', 'error'); return; }
    var body = {
      term_ko:       ko,
      term_en:       document.getElementById('glos-en').value.trim(),
      term_fr:       document.getElementById('glos-fr').value.trim(),
      description_ko: document.getElementById('glos-desc').value.trim(),
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
      var topPosts = data.top_posts || [];
      var sources  = data.sources  || [];

      // Stats
      statsEl.innerHTML =
        _statCard('오늘 방문',       _fmt(today.visits  || 0), '오늘') +
        _statCard('오늘 조회',       _fmt(today.views   || 0), '오늘') +
        _statCard(period + '일 방문', _fmt(summary.visits || 0), '기간 합계') +
        _statCard(period + '일 조회', _fmt(summary.views  || 0), '기간 합계') +
        _statCard('좋아요',          _fmt(summary.likes  || 0), '기간 합계') +
        _statCard('평균 체류',       (summary.avg_engaged_s || 0) + '초', '기간 평균');

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
            '<div class="v3-bar-val">' + _fmt(p.views || 0) + '</div>' +
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
            '<div class="v3-bar-label">' + GW.escapeHtml(s.referrer_host || '직접') + '</div>' +
            '<div class="v3-bar-track"><div class="v3-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="v3-bar-val">' + _fmt(s.visits || 0) + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      bodyEl.innerHTML = html;
    }).catch(function (e) {
      statsEl.innerHTML = '<div class="v3-empty" style="grid-column:1/-1;"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
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
      var html   = '';

      // Funnel
      if (funnel.length) {
        html += '<div class="v3-card"><div class="v3-card-head"><h2 class="v3-card-title">퍼널 (Funnel)</h2></div><div class="v3-bar-list">';
        funnel.forEach(function (step) {
          html += '<div class="v3-bar-row">' +
            '<div class="v3-bar-label">' + GW.escapeHtml(step.label || step.stage || '') + '</div>' +
            '<div class="v3-bar-track"><div class="v3-bar-fill" style="width:' + (step.pct || 0) + '%"></div></div>' +
            '<div class="v3-bar-val">' + _fmt(step.count || 0) + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // UTM
      if (utms.length) {
        html += '<div class="v3-card v3-mt-16"><div class="v3-card-head"><h2 class="v3-card-title">UTM 캠페인</h2></div>';
        html += '<div class="v3-table-wrap"><table class="v3-table"><thead><tr><th>캠페인</th><th>소스</th><th>매체</th><th>방문</th></tr></thead><tbody>';
        utms.forEach(function (u) {
          html += '<tr><td>' + GW.escapeHtml(u.campaign || '') + '</td>' +
            '<td>' + GW.escapeHtml(u.source || '') + '</td>' +
            '<td>' + GW.escapeHtml(u.medium || '') + '</td>' +
            '<td>' + _fmt(u.visits || 0) + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
      }

      if (!html) html = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">마케팅 데이터가 없습니다</div></div></div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">데이터를 불러올 수 없습니다</div></div></div>';
    });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS – HERO
  ══════════════════════════════════════════════════════════ */
  function _loadHero() {
    var el = document.getElementById('hero-slots');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    GW.apiFetch('/api/settings/hero').then(function (data) {
      _heroPostIds  = (data && data.post_ids)  || [];
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
    var cats = (_tagSettings && _tagSettings.categories) ? _tagSettings.categories : {};
    var catKeys = ['korea', 'apr', 'wosm', 'people'];
    el.innerHTML = catKeys.map(function (cat) {
      var tags = (cats[cat] && cats[cat].tags) ? cats[cat].tags : [];
      var tagsStr = tags.map(function (t) {
        return typeof t === 'string' ? t : (t.label || t.value || JSON.stringify(t));
      }).join(', ');
      return '<div class="v3-form-group v3-mt-12">' +
        '<label class="v3-label">' + GW.escapeHtml(cat.toUpperCase()) + ' 태그</label>' +
        '<input class="v3-input" type="text" data-cat="' + cat + '" id="tags-cat-' + cat + '" value="' + GW.escapeHtml(tagsStr) + '" placeholder="쉼표로 구분하여 입력" />' +
        '<div class="v3-input-hint">쉼표(,)로 구분해서 태그를 입력하세요</div>' +
      '</div>';
    }).join('');
  }

  function _saveTags() {
    var cats = {};
    ['korea', 'apr', 'wosm', 'people'].forEach(function (cat) {
      var input = document.getElementById('tags-cat-' + cat);
      var tags = input ? input.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
      cats[cat] = { tags: tags };
    });
    document.getElementById('tags-save-btn').disabled = true;
    GW.apiFetch('/api/settings/tags', {
      method: 'PUT',
      body: JSON.stringify({ categories: cats }),
    }).then(function () {
      GW.showToast('태그 설정을 저장했습니다', 'success');
      _tagSettings = { categories: cats };
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
      document.getElementById('s-author-name').value  = (results[0] && results[0].name) || '';
      document.getElementById('s-ai-disclaimer').value = (results[1] && results[1].text) || '';
    });
  }

  function _saveAuthor() {
    var name = document.getElementById('s-author-name').value.trim();
    var disc = document.getElementById('s-ai-disclaimer').value.trim();
    document.getElementById('author-save-btn').disabled = true;
    Promise.all([
      GW.apiFetch('/api/settings/author', { method: 'PUT', body: JSON.stringify({ name: name }) }),
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
      _contributors = Array.isArray(data) ? data : (data && data.items) || [];
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
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: _contributors }) })
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
      _editors = Array.isArray(data) ? data : (data && data.editors) || [];
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
        '<input class="v3-input" type="text" value="' + GW.escapeHtml(e.name || '') + '" placeholder="편집자명" data-editor-i="' + i + '" data-field="name" style="flex:1;" />' +
        '<select class="v3-select" data-editor-i="' + i + '" data-field="level" style="width:120px;">' +
          '<option value="full"' + (e.level === 'full' ? ' selected' : '') + '>full</option>' +
          '<option value="editor"' + (e.level === 'editor' ? ' selected' : '') + '>editor</option>' +
        '</select>' +
        '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:#ef4444;" onclick="V3._removeEditor(' + i + ')">×</button>' +
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

  function _addEditorRow() { _editors.push({ name: '', level: 'editor' }); _renderEditors(); }
  V3._removeEditor = function (i) { _editors.splice(i, 1); _renderEditors(); };

  function _saveEditors() {
    document.querySelectorAll('#editors-list [data-editor-i]').forEach(function (input) {
      var i = parseInt(input.dataset.editorI, 10);
      if (_editors[i]) _editors[i][input.dataset.field] = input.value;
    });
    document.getElementById('editors-save-btn').disabled = true;
    GW.apiFetch('/api/settings/editors', { method: 'PUT', body: JSON.stringify({ editors: _editors }) })
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
      _translations = data || {};
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
      return '<div class="v3-trans-row">' +
        '<div class="v3-trans-key">' + GW.escapeHtml(k) + '</div>' +
        '<input class="v3-input" type="text" id="trans-' + _escId(k) + '" value="' + GW.escapeHtml(_translations[k] || '') + '" />' +
      '</div>';
    }).join('');
  }

  function _saveTranslations() {
    var result = {};
    Object.keys(_translations).forEach(function (k) {
      var input = document.getElementById('trans-' + _escId(k));
      result[k] = input ? input.value : _translations[k];
    });
    document.getElementById('trans-save-btn').disabled = true;
    GW.apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify(result) })
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
