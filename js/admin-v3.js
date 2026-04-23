/**
 * Gilwell Media · Admin Console V3
 * Version: 03.103.00
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

  // Null-safe element binding helper
  function _el(id) { return document.getElementById(id); }

  // 이벤트 위임 저장소: DOMContentLoaded 시점에 bind 해도 DOM 재생성 / 중복 초기화 /
  // 순차 실행 중 에러로 특정 input만 listener가 사라지는 경우가 있어서
  // document-level delegation을 safety net으로 함께 운영한다.
  // 2026-04-19: 관리자 검색·필터 전면 불가 이슈(03.072.01 이전) 대응.
  var _delegatedHandlers = Object.create(null);

  function _bindEl(id, evt, fn) {
    if (typeof fn !== 'function') return;
    // 1) 위임 저장소에 등록 (항상 작동하는 safety net)
    if (!_delegatedHandlers[id]) _delegatedHandlers[id] = Object.create(null);
    _delegatedHandlers[id][evt] = fn;
    // 2) 원래처럼 요소에 직접 바인딩 — element.__gwBound[evt]로 중복 방지
    var el = document.getElementById(id);
    if (!el) return;
    var marker = '__gwBound_' + evt;
    if (el[marker]) return; // 이미 바인딩됨 (중복 호출 안전)
    el[marker] = true;
    el.addEventListener(evt, function (event) {
      if (event && event.defaultPrevented) return;
      // 직접 바인딩 경로 표시 — delegation에서 중복 실행 방지
      if (event) event.__gwDirect = true;
      return fn.call(this, event);
    });
  }

  // document-level 이벤트 위임 — 직접 바인딩이 실패했거나 DOM이 재생성된 경우 safety net.
  // capture 단계에서 실행하되, 직접 바인딩이 이미 처리한 이벤트(event.__gwDirect)는 무시.
  function _installDelegation() {
    ['input', 'change', 'click', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, function (event) {
        var target = event.target;
        if (!target || !target.id) return;
        var handlers = _delegatedHandlers[target.id];
        if (!handlers || !handlers[evt]) return;
        if (event.__gwDirect) return; // 직접 바인딩이 이미 처리
        if (event.defaultPrevented) return;
        event.__gwDelegated = true;
        return handlers[evt].call(target, event);
      }, false);
    });
  }

  // KMS §5.x 통일 기간 선택 UI. 마케팅 .mkt-period-bar와 동일 패턴을 .v3-period-bar로
  // 일반화해 분석·접속 국가/도시·대시보드에서 공유. DOM 구조:
  //   <div class="v3-period-bar" data-v3-period-scope="SCOPE">
  //     <div class="v3-presets">
  //       <button class="v3-preset-btn [is-active]" data-days="7">7일</button> ...
  //     </div>
  //     <div class="v3-date-range">
  //       <input type="date" class="v3-date-input-period" data-v3-role="start">
  //       <span class="v3-date-sep">~</span>
  //       <input type="date" class="v3-date-input-period" data-v3-role="end">
  //       <button class="v3-apply-btn" type="button">조회</button>
  //     </div>
  //   </div>
  // _bindPeriodBar(scope, onChange) — onChange({days, start, end})
  function _bindPeriodBar(scope, onChange) {
    var bar = document.querySelector('[data-v3-period-scope="' + scope + '"]');
    if (!bar) return;
    var presetBtns = bar.querySelectorAll('.v3-preset-btn');
    var startInput = bar.querySelector('[data-v3-role="start"]');
    var endInput   = bar.querySelector('[data-v3-role="end"]');
    var applyBtn   = bar.querySelector('.v3-apply-btn');
    function clearPresets() {
      presetBtns.forEach(function (b) { b.classList.remove('is-active'); });
    }
    function clearRange() {
      if (startInput) startInput.value = '';
      if (endInput)   endInput.value = '';
    }
    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearPresets();
        btn.classList.add('is-active');
        clearRange();
        var days = parseInt(btn.getAttribute('data-days'), 10) || 30;
        if (typeof onChange === 'function') onChange({ days: days });
      });
    });
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        var s = startInput ? startInput.value : '';
        var e = endInput ? endInput.value : '';
        if (!s && !e) return;
        clearPresets();
        if (typeof onChange === 'function') onChange({ start: s, end: e });
      });
    }
  }

  function _togglePasswordReveal(visible) {
    var input = _el('v3-pw');
    var btn = _el('v3-pw-reveal');
    if (!input || !btn) return;
    input.type = visible ? 'text' : 'password';
    btn.classList.toggle('is-active', !!visible);
    btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }
  function _syncAdminVersionLabels() {
    if (GW && typeof GW.syncBuildVersion === 'function') GW.syncBuildVersion();
    var siteVer = (GW && GW.APP_VERSION) ? 'V' + GW.APP_VERSION : '—';
    var adminVer = (GW && GW.ADMIN_VERSION) ? 'V' + GW.ADMIN_VERSION : '';
    document.querySelectorAll('.v3-ver-site').forEach(function (el) {
      el.textContent = siteVer;
    });
    if (!adminVer) return;
    document.querySelectorAll('.v3-ver-admin').forEach(function (el) {
      el.textContent = adminVer;
    });
  }

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
  var _listSort      = 'upload_desc';

  // Write / edit
  var _editingId     = null;
  var _editor        = null;
  var _coverDataUrl  = null;
  var _galleryImages = [];
  var _metaTags      = [];
  var _relatedPosts  = [];
  var _relatedTimer  = null;
  var _draftTimer    = null;
  // Write enhancements state
  var _writeEnhanceInited = false;
  var _writeDraftDebounce = null;
  var _writeLastDraftSavedAt = 0;
  var _writeDirty    = false;
  var _writeStatsTimer = null;
  var _metaTagPool   = null;
  var _metaTagPoolLoading = false;
  var _metaSuggestActiveIdx = -1;

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
  var _navLabels     = {};
  var _translations  = {};
  var _homeLeadPost  = null;
  var _homeLeadMedia = null;
  var _picksPosts    = [];
  var _picksSearchTimer = null;
  var _wosmMembers   = [];
  var _wosmColumns   = [];
  var _wosmRegisteredCount = 176;
  var _wosmPublicCopy = {};
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
  var _homepageIssues = [];
  var _homepageIssuesSearch = '';
  var _homepageIssuesFilterStatus = 'all';
  var _homepageIssuesFilterSeverity = 'all';
  var _homepageIssueEditingId = null;
  var _siteHistoryItems = [];
  var _siteHistorySearch = '';
  var _siteHistoryFilterGroup = 'all';
  var _siteHistoryFilterSource = 'all';
  var _siteHistoryGroupBy = 'day';
  var _previewPostId = null;
  var _reportedIssueFingerprints = {};
  var _geoAudienceData = null;
  var _geoAudienceMap = null;
  var _geoAudienceMapLayer = null;
  var _geoAudienceMapLayers = null;
  var _analyticsTagGraphState = null;
  var _analyticsSelectedTagId = '';
  var _analyticsAutoRefresh = true;
  var _analyticsAutoRefreshTimer = null;
  var _analyticsLastUpdatedAt = 0;
  var _analyticsLoading = false;
  // 통일 기간 선택 상태. {days: N} 또는 {start, end}.
  var _analyticsPeriodState = { days: 30 };
  var _analyticsTagPeriodState = { days: 30 };
  var _geoAudiencePeriodState = { days: 30 };
  var _loginInFlight = false;
  var _dashboardHeatmapMode = '7d';
  var _dashboardHeatmapStart = '';
  var _dashboardHeatmapEnd = '';
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
          // 401 = re-login flow, 403 = legitimate permission denial (not a bug)
          // so neither counts as a site issue worth auto-reporting.
          if (response.status !== 401 && response.status !== 403) {
            _reportSiteIssue('admin_client_api_error', {
              message: message,
              path: _issuePathFromUrl(url),
              section: _panel || 'admin',
              code: 'HTTP_' + String(response.status || 0),
              source: '/js/admin-v3.js',
              method: String(opts.method || 'GET').toUpperCase(),
              status: String(response.status || ''),
            });
          }
          var err = new Error(message);
          err.status = response.status;
          err.data = data;
          if (response.status === 401) {
            if (GW.clearToken) GW.clearToken();
            document.dispatchEvent(new CustomEvent('gw:admin-auth-required', {
              detail: { message: message, status: response.status }
            }));
          } else if (response.status === 403) {
            // Surface the server's Korean permission message (gateMenuAccess
            // returns "이 메뉴의 보기 권한이 없습니다. 오너에게 요청하세요.")
            // via toast so members see WHY the action failed rather than a
            // silent panel.
            if (GW.showToast) GW.showToast(message, 'error', 6000);
          }
          throw err;
        }
        return data;
      });
    }).catch(function (error) {
      if (error && typeof error.status === 'number') throw error;
      _reportSiteIssue('admin_client_api_error', {
        message: error && error.message ? String(error.message) : '관리자 API 요청 실패',
        path: _issuePathFromUrl(url),
        section: _panel || 'admin',
        code: 'FETCH_FAILED',
        source: '/js/admin-v3.js',
        method: String(opts.method || 'GET').toUpperCase(),
        status: '',
      });
      throw error;
    });
  }

  function _reportSiteIssue(code, detail) {
    var payload = detail && typeof detail === 'object' ? detail : {};
    var fingerprint = [code, payload.path || '', payload.section || '', payload.method || '', payload.status || '', payload.message || ''].join('|');
    if (_reportedIssueFingerprints[fingerprint]) return;
    _reportedIssueFingerprints[fingerprint] = true;
    fetch('/api/homepage-issues/report', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, detail: payload }),
    }).catch(function () {});
  }

  function _issuePathFromUrl(url) {
    try {
      if (String(url || '').indexOf('http') === 0) return new URL(url).pathname || String(url || '');
      return String(url || '').split('?')[0] || '';
    } catch (_) {
      return String(url || '').split('?')[0] || '';
    }
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
    _installDelegation();
    _syncAdminVersionLabels();
    if (window.GW && typeof GW.setupScrollTopButton === 'function') GW.setupScrollTopButton();
    if (window.GW && typeof GW.populateCategorySelect === 'function') {
      GW.populateCategorySelect(document.getElementById('list-cat'), { includeAll: true, allLabel: '전체 카테고리' });
      GW.populateCategorySelect(document.getElementById('w-cat'));
    }
    window.addEventListener('error', function (event) {
      _reportSiteIssue('admin_client_runtime_error', {
        message: event && event.message ? String(event.message) : '관리자 런타임 오류',
        path: '/admin',
        source: event && event.filename ? String(event.filename) : '/js/admin-v3.js',
        code: event && event.error && event.error.name ? String(event.error.name) : 'error',
      });
    });
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      // 401 (재로그인 요구) / 403 (권한 부족)은 정상 흐름이므로 이슈 보고 제외.
      // _apiFetch가 re-throw한 에러가 핸들되지 않아 여기로 올라올 수 있어 방어.
      var status = reason && typeof reason.status === 'number' ? reason.status : 0;
      if (status === 401 || status === 403) return;
      _reportSiteIssue('admin_client_promise_rejection', {
        message: reason && reason.message ? String(reason.message) : String(reason || 'Unhandled promise rejection'),
        path: '/admin',
        source: '/js/admin-v3.js',
        code: reason && reason.name ? String(reason.name) : 'promise',
      });
    });
    document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('.v3-btn, .mkt-apply-btn, .v3-login-btn') : null;
      if (btn) _pulseButton(btn);
    });
    document.addEventListener('click', function (event) {
      var loginBtn = event.target && event.target.closest ? event.target.closest('#v3-login-btn') : null;
      if (!loginBtn) return;
      event.preventDefault();
      _doLogin();
    });
    document.addEventListener('keydown', function (event) {
      if (!event || event.key !== 'Enter') return;
      if (!event.target || event.target.id !== 'v3-pw') return;
      event.preventDefault();
      _doLogin();
    });

    // Every /admin page load ALWAYS forces a fresh login. No auto-sign-in
    // from an existing cookie — this is intentional (admin operator policy).
    // We also purge browser caches so the admin UI never serves a stale
    // HTML/JS snapshot after a deploy.
    _purgeAdminClientState();

    // Login
    _bindEl('v3-login-btn', 'click', _doLogin);
    _bindEl('v3-pw', 'keydown', function (e) {
      if (e.key === 'Enter') _doLogin();
    });
    _bindEl('v3-username', 'keydown', function (e) {
      if (e.key === 'Enter') {
        var pwEl = document.getElementById('v3-pw');
        if (pwEl) pwEl.focus();
      }
    });
    _bindEl('v3-pw-reveal', 'pointerdown', function (event) {
      event.preventDefault();
      _togglePasswordReveal(true);
    });
    _bindEl('v3-pw-reveal', 'pointerup', function () { _togglePasswordReveal(false); });
    _bindEl('v3-pw-reveal', 'pointerleave', function () { _togglePasswordReveal(false); });
    _bindEl('v3-pw-reveal', 'pointercancel', function () { _togglePasswordReveal(false); });
    _bindEl('v3-pw-reveal', 'blur', function () { _togglePasswordReveal(false); });

    // Logout
    _bindEl('v3-logout-btn', 'click', _doLogout);

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
    _bindEl('dash-refresh-btn', 'click', function () {
      _loadDashboard(_el('dash-refresh-btn'));
    });
    document.querySelectorAll('[data-v3-heatmap-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _dashboardHeatmapMode = btn.getAttribute('data-v3-heatmap-mode') || '7d';
        _syncDashboardHeatmapControls();
        _loadDashboard();
      });
    });
    _bindEl('dash-heatmap-apply', 'click', _applyDashboardHeatmapCustomRange);
    _bindEl('dash-heatmap-start', 'change', function () {
      _dashboardHeatmapStart = this.value || '';
    });
    _bindEl('dash-heatmap-end', 'change', function () {
      _dashboardHeatmapEnd = this.value || '';
    });
    _bindEl('homepage-issues-refresh-btn', 'click', function () {
      _loadHomepageIssues(_el('homepage-issues-refresh-btn'));
    });
    _bindEl('homepage-issues-search', 'input', function () {
      _homepageIssuesSearch = String(this.value || '').trim().toLowerCase();
      _renderHomepageIssues();
    });
    _bindEl('homepage-issues-filter-status', 'change', function () {
      _homepageIssuesFilterStatus = this.value || 'all';
      _renderHomepageIssues();
    });
    _bindEl('homepage-issues-filter-severity', 'change', function () {
      _homepageIssuesFilterSeverity = this.value || 'all';
      _renderHomepageIssues();
    });
    _bindEl('site-history-refresh-btn', 'click', function () {
      _loadSiteHistory(_el('site-history-refresh-btn'));
    });
    _bindEl('site-history-search', 'input', function () {
      _siteHistorySearch = String(this.value || '').trim().toLowerCase();
      _renderSiteHistory();
    });
    _bindEl('site-history-filter-group', 'change', function () {
      _siteHistoryFilterGroup = this.value || 'all';
      _renderSiteHistory();
    });
    _bindEl('site-history-filter-source', 'change', function () {
      _siteHistoryFilterSource = this.value || 'all';
      _renderSiteHistory();
    });
    _bindEl('site-history-group-by', 'change', function () {
      _siteHistoryGroupBy = this.value || 'day';
      _renderSiteHistory();
    });
    _bindEl('post-preview-close', 'click', _closePostPreviewModal);
    _bindEl('post-preview-done', 'click', _closePostPreviewModal);
    _bindEl('post-preview-edit-btn', 'click', function () {
      if (_previewPostId) {
        _closePostPreviewModal();
        V3.editPost(_previewPostId);
      }
    });
    _bindEl('post-preview-modal', 'click', function (event) {
      if (event.target === this) _closePostPreviewModal();
    });

    // Post list filters
    _bindEl('list-search', 'input', function () {
      clearTimeout(_listSearchTimer);
      _listSearchTimer = setTimeout(function () {
        var el = _el('list-search');
        _listSearch = el ? el.value.trim() : '';
        _listPage = 1;
        _loadList();
      }, 350);
    });
    _bindEl('list-cat', 'change', function () {
      _listCat = this.value; _listPage = 1; _loadList();
    });
    _bindEl('list-pub', 'change', function () {
      _listPub = this.value; _listPage = 1; _loadList();
    });
    _bindEl('list-sort', 'change', function () {
      _listSort = this.value; _listPage = 1; _loadList();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-list-sort-key]'), function (btn) {
      btn.addEventListener('click', function (event) {
        if (event.defaultPrevented) return;
        V3.listSortBy(this.getAttribute('data-list-sort-key'));
      });
    });

    // Write form
    _bindEl('write-cancel-btn', 'click', function () { V3.cancelWrite(); });
    _bindEl('write-publish-btn', 'click', function () { _savePost(); });
    _bindEl('w-published', 'change', _syncWriteFeaturedState);
    _bindEl('w-cover-btn', 'click', _pickCover);
    _bindEl('w-gallery-btn', 'click', _pickGallery);

    // Meta tags
    _bindEl('w-metatag-add-btn', 'click', _addMetaTag);
    _bindEl('w-metatag-input', 'keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _addMetaTag(); }
    });

    // Location map preview (OpenStreetMap via Nominatim)
    _bindEl('w-location-check-btn', 'click', function () { _checkWriteLocation(); });
    _bindEl('w-location-addr', 'input', function () {
      var prev = _el('w-location-map-preview');
      if (prev) prev.style.display = 'none';
    });

    // Related posts search
    _bindEl('w-related-search', 'input', function () {
      clearTimeout(_relatedTimer);
      var q = this.value.trim();
      if (!q) { var r = _el('w-related-results'); if (r) r.style.display = 'none'; return; }
      _relatedTimer = setTimeout(function () { _searchRelated(q); }, 300);
    });

    // Calendar
    _bindEl('cal-new-btn', 'click', function () { _openCalModal(null); });
    _bindEl('cal-modal-close', 'click', _closeCalModal);
    _bindEl('cal-modal-cancel', 'click', _closeCalModal);
    _bindEl('cal-save-btn', 'click', _saveCal);
    _bindEl('cal-tags-add-btn', 'click', _addCalTag);
    _bindEl('cal-tags-input', 'keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _addCalTag(); }
    });
    _bindEl('cal-start-time-enabled', 'change', function () {
      var t = _el('cal-start-time');
      if (t) { t.disabled = !this.checked; if (!this.checked) t.value = ''; }
    });
    _bindEl('cal-end-time-enabled', 'change', function () {
      var t = _el('cal-end-time');
      if (t) { t.disabled = !this.checked; if (!this.checked) t.value = ''; }
    });
    _bindEl('cal-cat', 'change', _syncCalCategoryUi);
    _bindEl('cal-related-query', 'input', function () {
      clearTimeout(_calRelatedTimer);
      var q = this.value.trim();
      if (!q) { var r = _el('cal-related-results'); if (r) r.innerHTML = ''; return; }
      _calRelatedTimer = setTimeout(function () { _searchCalRelated(q); }, 250);
    });
    _bindEl('cal-geo-search-btn', 'click', _searchCalGeo);
    _bindEl('cal-delete-btn', 'click', function () {
      var idEl = _el('cal-id');
      var id = idEl ? idEl.value : '';
      if (id) _deleteCal(parseInt(id, 10));
    });

    // Glossary
    _bindEl('glos-new-btn', 'click', function () { _openGlosModal(null); });
    _bindEl('glos-modal-close', 'click', _closeGlosModal);
    _bindEl('glos-modal-cancel', 'click', _closeGlosModal);
    _bindEl('glos-save-btn', 'click', _saveGlos);
    _bindEl('glos-delete-btn', 'click', function () {
      var idEl = _el('glos-id');
      var id = idEl ? idEl.value : '';
      if (id) _deleteGlos(parseInt(id, 10));
    });
    _bindEl('glos-search', 'input', function () {
      clearTimeout(_glosSearchTimer);
      var q = this.value;
      _glosSearchTimer = setTimeout(function () { _glosSearch = q; _renderGlos(); }, 250);
    });

    // Settings saves
    _bindEl('hero-save-btn', 'click', _saveHero);
    _bindEl('tags-save-btn', 'click', _saveTags);
    _bindEl('meta-save-btn', 'click', _saveMeta);
    _bindEl('board-copy-save-btn', 'click', _saveBoardCopy);
    _bindEl('author-save-btn', 'click', _saveAuthor);
    _bindEl('banner-save-btn', 'click', _saveBanner);
    _bindEl('ticker-save-btn', 'click', _saveTicker);
    _bindEl('contrib-save-btn', 'click', _saveContributors);
    _bindEl('contrib-add-btn', 'click', _addContributorRow);
    _bindEl('editors-save-btn', 'click', _saveEditors);
    _bindEl('editors-add-btn', 'click', _addEditorRow);
    _bindEl('nav-labels-save-btn', 'click', _saveNavLabels);
    _bindEl('trans-save-btn', 'click', _saveTranslations);
    _bindEl('home-lead-save-btn', 'click', _saveHomeLead);
    _bindEl('home-lead-clear-btn', 'click', _clearHomeLeadSelection);
    _bindEl('picks-refresh-btn', 'click', _loadPicksUI);
    _bindEl('wosm-members-import-btn', 'click', function () {
      var input = _el('wosm-members-file');
      if (input) input.click();
    });
    _bindEl('wosm-members-import-btn-inline', 'click', function () {
      var input = _el('wosm-members-file');
      if (input) input.click();
    });
    _bindEl('wosm-members-file', 'change', _handleWosmMembersImport);
    _bindEl('wosm-members-add-btn', 'click', _addWosmMemberRow);
    _bindEl('wosm-members-add-btn-inline', 'click', _addWosmMemberRow);
    _bindEl('wosm-column-add-btn', 'click', _addWosmColumnRow);
    _bindEl('wosm-columns-save-btn', 'click', _saveWosmMembers);
    _bindEl('wosm-members-save-btn', 'click', _saveWosmMembers);
    _bindEl('wosm-import-close', 'click', _closeWosmImportModal);
    _bindEl('wosm-import-cancel', 'click', _closeWosmImportModal);
    _bindEl('wosm-import-apply', 'click', _applyWosmImportMapping);
    _bindEl('wosm-import-modal', 'click', function (event) {
      if (event.target && event.target.id === 'wosm-import-modal') _closeWosmImportModal();
    });
    _bindEl('wosm-import-sheet', 'change', function () {
      _wosmImportSheetIndex = Math.max(0, parseInt(this.value, 10) || 0);
      _syncWosmImportMappingDefaults();
      _renderWosmImportModal();
    });
    _bindEl('wosm-members-search', 'input', function () {
      _wosmMembersSearch = String(this.value || '').trim().toLowerCase();
      _renderWosmMembersEditor();
    });

    // Hero search
    _bindEl('hero-search', 'input', function () {
      var q = this.value.trim();
      if (!q) { var r = _el('hero-search-results'); if (r) r.style.display = 'none'; return; }
      _searchHero(q);
    });
    _bindEl('home-lead-search', 'input', function () {
      var q = this.value.trim();
      if (!q) { var r = _el('home-lead-search-results'); if (r) r.style.display = 'none'; return; }
      _searchHomeLead(q);
    });
    ['home-lead-fit', 'home-lead-desktop-x', 'home-lead-desktop-y', 'home-lead-desktop-zoom', 'home-lead-mobile-x', 'home-lead-mobile-y', 'home-lead-mobile-zoom'].forEach(function (id) {
      _bindEl(id, 'input', _handleHomeLeadControlChange);
    });
    _bindEl('picks-search', 'input', function () {
      var q = this.value.trim();
      clearTimeout(_picksSearchTimer);
      if (!q) { var r = _el('picks-search-results'); if (r) r.style.display = 'none'; return; }
      _picksSearchTimer = setTimeout(function () { _searchPicks(q); }, 220);
    });

    // Analytics period bar (통일 패턴). 각 패널별 독립 로더.
    _bindPeriodBar('analytics', function (sel) {
      _analyticsPeriodState = sel;
      _loadAnalyticsVisits();
    });
    _bindPeriodBar('analytics-tag', function (sel) {
      _analyticsTagPeriodState = sel;
      _loadAnalyticsTags();
    });
    _bindEl('analytics-refresh-btn', 'click', _loadAnalyticsVisits);
    _bindEl('analytics-tags-refresh-btn', 'click', _loadAnalyticsTags);
    _bindEl('search-keywords-refresh-btn', 'click', function () { _loadSearchKeywords(this); });
    _bindEl('analytics-auto-refresh', 'change', function () {
      _analyticsAutoRefresh = !!this.checked;
      _updateAnalyticsRefreshMeta();
      if (_panel === 'analytics-visits' || _panel === 'analytics') _syncAnalyticsAutoRefresh();
    });
    _bindEl('analytics-tag-modal-close', 'click', _closeAnalyticsTagModal);
    _bindEl('analytics-tag-modal-done', 'click', _closeAnalyticsTagModal);
    _bindEl('analytics-tag-modal', 'click', function (event) {
      if (event.target === this) _closeAnalyticsTagModal();
    });

    // Geo-audience period bar (통일 패턴)
    _bindPeriodBar('geo-audience', function (sel) {
      _geoAudiencePeriodState = sel;
      _loadGeoAudience();
    });
    _bindEl('geo-audience-refresh-btn', 'click', _loadGeoAudience);

    _initDashboardHeatmapControls();

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
        btn.addEventListener('click', function (event) {
          if (event.defaultPrevented) return;
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
      _bindEl('mkt-apply-btn', 'click', function () {
        document.querySelectorAll('.mkt-preset-btn').forEach(function (b) { b.classList.remove('is-active'); });
        _loadMarketing(_el('mkt-apply-btn'));
      });
      [fromEl, toEl].forEach(function (input) {
        input.addEventListener('change', function () {
          document.querySelectorAll('.mkt-preset-btn').forEach(function (b) { b.classList.remove('is-active'); });
        });
      });
    }());

    // Confirm dialog
    _bindEl('confirm-cancel-btn', 'click', function () { _closeConfirm(false); });
    _bindEl('confirm-ok-btn', 'click', function () { _closeConfirm(true); });
    _bindEl('v3-more-modal-close', 'click', V3.closeMoreRowsModal);
    _bindEl('v3-more-modal-done', 'click', function () { V3.closeMoreRowsModal(); });
    _bindEl('v3-more-modal', 'click', function (event) {
      if (event.target === this) V3.closeMoreRowsModal();
    });

    // Ticker preview
    _bindEl('s-ticker', 'input', function () {
      _renderTickerPreview(this.value);
    });

    document.addEventListener('gw:admin-auth-required', function (event) {
      var detail = event && event.detail ? event.detail : {};
      GW.showToast((detail.message || '관리자 세션이 만료되었습니다. 다시 로그인해주세요.'), 'error');
      _showLogin();
    });
    document.addEventListener('visibilitychange', function () {
      if (_panel === 'analytics-visits' || _panel === 'analytics') _syncAnalyticsAutoRefresh();
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

  // Reset every piece of admin client state on /admin page load:
  //   - drop any saved bearer flag (GW.clearToken)
  //   - wipe sessionStorage (session timer deadline, etc.)
  //   - invalidate the HttpOnly admin_token cookie server-side
  //   - purge Cache API + unregister service workers so stale HTML/JS
  //     never shows a half-signed-in admin console
  //   - strip any pre-rendered admin surfaces (v3-app stays `hidden`)
  //   - show the login screen and prime Turnstile
  //
  // Called unconditionally on DOMContentLoaded — there is no auto-sign-in
  // from an existing cookie. Every admin session starts from scratch.
  function _purgeAdminClientState() {
    try { if (GW.clearToken) GW.clearToken(); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    try { localStorage.removeItem('_gw_admin_sd'); } catch (_) {}
    try {
      fetch('/api/admin/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }).catch(function () {});
    } catch (_) {}
    if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
      try {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { try { caches.delete(k); } catch (_) {} });
        }).catch(function () {});
      } catch (_) {}
    }
    if (navigator && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
      try {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { try { r.unregister(); } catch (_) {} });
        }).catch(function () {});
      } catch (_) {}
    }
    // Defense-in-depth: keep the dashboard pane hidden even if something
    // accidentally flips it on (stale script, double-invocation).
    var app = document.getElementById('v3-app');
    if (app) app.hidden = true;
    _showLogin();
  }

  function _doLogin() {
    var usernameEl = document.getElementById('v3-username');
    var username = usernameEl ? String(usernameEl.value || '').trim().toLowerCase() : '';
    var pw  = document.getElementById('v3-pw').value;
    var err = document.getElementById('v3-login-err');
    var btn = document.getElementById('v3-login-btn');
    if (_loginInFlight) return;
    if (!username) {
      if (GW.showToast) GW.showToast('아이디를 입력해주세요', 'error');
      if (usernameEl) usernameEl.focus();
      return;
    }
    if (!String(pw || '').trim()) {
      if (GW.showToast) GW.showToast('비밀번호를 입력해주세요', 'error');
      return;
    }

    var cfInput = document.querySelector('#v3-login-turnstile input[name="cf-turnstile-response"]');
    var cfToken = cfInput ? cfInput.value : '';
    if (GW.TURNSTILE_SITE_KEY && !cfToken) {
      err.textContent = 'CAPTCHA를 완료해주세요';
      err.style.display = 'block';
      if (GW.showToast) GW.showToast('CAPTCHA를 완료해주세요', 'error');
      return;
    }

    _loginInFlight = true;
    _setButtonBusy(btn, '로그인 중…'); err.style.display = 'none';
    _apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: pw, cf_turnstile_response: cfToken }),
    }).then(function (data) {
      GW.setToken(data.token);
      if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
      // Phase 2: must_change_password flag — surface via toast; Phase 3 will
      // show a dedicated forced-change modal. For now we still let the user in.
      if (data && data.user && data.user.must_change_password) {
        if (GW.showToast) GW.showToast('임시 비밀번호입니다. 계정/보안 메뉴에서 비밀번호를 변경해주세요.', 'warn', 8000);
      }
      _showApp();
    }).catch(function (e) {
      var message = e && e.message ? e.message : '아이디 또는 비밀번호가 올바르지 않습니다';
      err.textContent = message;
      err.style.display = 'block';
      if (GW.showToast) GW.showToast(message, 'error');
      document.getElementById('v3-pw').value = '';
      document.getElementById('v3-pw').focus();
      if (window.turnstile) window.turnstile.reset();
    }).finally(function () {
      _loginInFlight = false;
      _clearButtonBusy(btn);
    });
  }

  V3.triggerLogin = _doLogin;
  V3.logout = _doLogout;

  function _doLogout() {
    _sessionStop();
    GW.clearToken();
    document.getElementById('v3-app').hidden = true;
    document.getElementById('v3-login').style.display = 'flex';
    document.getElementById('v3-pw').value = '';
  }

  function _showLogin() {
    _syncAdminVersionLabels();
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
    _syncAdminVersionLabels();
    document.getElementById('v3-login').style.display = 'none';
    document.getElementById('v3-app').hidden = false;
    // Eager-load the session user so sidebar permission gating (hidden by
    // default via `body:not(.admin-session-loaded)` CSS) lifts as soon as
    // possible — no 300ms poll window where owner dashboard is invisible.
    if (window.AccountAdmin && typeof window.AccountAdmin.refreshMe === 'function') {
      try { window.AccountAdmin.refreshMe(); } catch (_) {}
    }
    // Load editor.js
    _loadEditorJS(function () { _initEditor(); });
    // Load tag settings (for write form dropdown)
    _loadTagSettings();
    // Set up release scope tabs
    _setupReleaseTabs();
    // Show dashboard
    V3.showPanel('dashboard');
    _sessionStart();
  }

  V3.refreshDashboard = function () { _loadDashboard(_el('dash-refresh-btn')); };
  V3.refreshHomepageIssues = function () { _loadHomepageIssues(_el('homepage-issues-refresh-btn')); };
  V3.refreshSiteHistory = function () { _loadSiteHistory(_el('site-history-refresh-btn')); };
  V3.refreshAnalytics = function () { _loadAnalyticsVisits(); };
  V3.refreshAnalyticsTags = function () { _loadAnalyticsTags(); };
  V3.refreshGeoAudience = function () { _loadGeoAudience(_el('geo-audience-refresh-btn')); };
  V3.openSettingsSection = function (section) {
    V3.showPanel('settings', section || 'hero');
  };
  V3.applyDashboardHeatmapMode = function (mode) {
    _dashboardHeatmapMode = mode || '7d';
    _syncDashboardHeatmapControls();
    if (_dashboardHeatmapMode !== 'custom') _loadDashboard();
  };
  V3.applyDashboardHeatmapRange = function () {
    _applyDashboardHeatmapCustomRange();
  };
  V3.applyMarketingPreset = function (days) {
    var parsedDays = Math.max(1, parseInt(days, 10) || 7);
    var end = _kstToday();
    var start = _shiftDate(end, -(parsedDays - 1));
    var fromEl = _el('mkt-date-from');
    var toEl = _el('mkt-date-to');
    if (toEl) toEl.value = end;
    if (fromEl) fromEl.value = start;
    document.querySelectorAll('.mkt-preset-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', String(btn.dataset.days || '') === String(parsedDays));
    });
    _loadMarketing();
  };
  V3.applyMarketingRange = function () {
    _loadMarketing(_el('mkt-apply-btn'));
  };

  /* ══════════════════════════════════════════════════════════
     PANEL NAVIGATION
  ══════════════════════════════════════════════════════════ */
  var PANEL_LABELS = {
    dashboard: '대시보드',
    'homepage-issues': '사이트 오류/이슈 기록',
    'site-history': '사이트 히스토리',
    list:      '게시글 목록',
    write:     '새 글 작성',
    calendar:  '캘린더',
    glossary:  '용어집',
    analytics: '분석',
    'analytics-visits': '방문 분석',
    'analytics-tags':   '태그 인사이트',
    'geo-audience': '접속 국가/도시',
    marketing: '마케팅',
    settings:  '사이트 설정',
    releases:  '버전기록',
    'article-scorer': '기사 채점',
    'ai-score-history': 'AI 채점기록',
    'account-me': '내 계정',
    'account-users': '사용자 관리',
    'account-presets': '프리셋 관리',
  };

  // Permission guard — prevents members from bypassing sidebar gating via URL
  // hash, DevTools, or any programmatic call. Returns true if allowed, and
  // toasts + no-ops if denied. Owners always pass. If the session hasn't
  // loaded yet (me === null right after login), we allow the default
  // 'dashboard' / 'account-me' panels only — everything else waits until
  // _loadMe resolves and a real check is possible.
  var _OWNER_ONLY_PANELS = { 'account-users': 1, 'account-presets': 1 };
  var _OWNER_ONLY_SETTINGS = { 'privacy-policy': 1 };
  var _SESSION_SAFE_PANELS = { 'dashboard': 1, 'account-me': 1 };

  function _panelPermSlug(panel, settingsSection) {
    if (panel === 'settings') return settingsSection || null;
    if (panel === 'account-me') return null;
    return panel;
  }

  function _canAccessPanel(panel, settingsSection) {
    var me = (window.AccountAdmin && window.AccountAdmin.currentMe && window.AccountAdmin.currentMe()) || null;
    var isOwner = !!(me && me.role && me.role !== 'member');
    if (isOwner) return true;
    if (_OWNER_ONLY_PANELS[panel]) return false;
    if (panel === 'settings' && settingsSection && _OWNER_ONLY_SETTINGS[settingsSection]) return false;
    if (!me) {
      // Session not yet resolved — only the safe defaults are permitted.
      return !!_SESSION_SAFE_PANELS[panel];
    }
    var slug = _panelPermSlug(panel, settingsSection);
    if (!slug) return true;
    var perms = (me.permissions && me.permissions.permissions) || [];
    return perms.indexOf('view:' + slug) !== -1;
  }

  V3.showPanel = function (panel, settingsSection) {
    if (!_canAccessPanel(panel, settingsSection)) {
      if (window.GW && GW.showToast) GW.showToast('이 메뉴의 접근 권한이 없습니다.', 'error');
      // Reset URL hash so back-button / reload doesn't retry the denied panel.
      if (typeof location !== 'undefined' && location.hash) {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
      }
      // Redirect to a safe landing panel the user is allowed to see.
      if (_panel !== 'dashboard' && _canAccessPanel('dashboard')) {
        panel = 'dashboard'; settingsSection = undefined;
      } else if (_canAccessPanel('account-me')) {
        panel = 'account-me'; settingsSection = undefined;
      } else {
        return;
      }
    }

    if (_panel === 'write' && panel !== 'write') _stopDraftTimer();
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
    // 자동 새로고침은 방문 분석 패널에 한정 (태그 인사이트는 빈도 낮아 수동 새로고침)
    _syncAnalyticsAutoRefresh(panel === 'analytics-visits' || panel === 'analytics');

    if (panel === 'dashboard') _loadDashboard();
    else if (panel === 'homepage-issues') _loadHomepageIssues();
    else if (panel === 'site-history') _loadSiteHistory();
    else if (panel === 'list')     _loadList();
    else if (panel === 'write' && !_editingId) _resetWrite();
    else if (panel === 'calendar') _loadCalendar();
    else if (panel === 'glossary') _loadGlossary();
    else if (panel === 'analytics-visits' || panel === 'analytics') _loadAnalyticsVisits();
    else if (panel === 'analytics-tags') _loadAnalyticsTags();
    else if (panel === 'geo-audience') _loadGeoAudience();
    else if (panel === 'marketing') _loadMarketing();
    else if (panel === 'releases') _loadReleases();
    else if (panel === 'article-scorer') _initArticleScorer();
    else if (panel === 'ai-score-history') _loadAiScoreHistory({ reset: true });
    else if (panel === 'settings') {
      var sec = settingsSection || _settingsSection;
      _showSettingsSection(sec);
    }
  };

  function _sectionLabel(s) {
    var labels = {
      hero: '히어로 기사', 'home-lead': '메인 스토리', picks: '에디터 추천', tags: '태그 / 글머리', meta: '메타태그 / SEO', 'board-copy': '게시판 설명',
      author: '저자 / 고지', banner: '게시판 배너', ticker: '티커',
      contributors: '기고자', editors: '편집자 / 접근', 'nav-labels': '상단 메뉴명', translations: 'UI 번역', 'wosm-members': '세계연맹 회원국',
      'privacy-policy': '개인정보 처리방침',
      'account-security': '계정 보안',
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
    else if (section === 'nav-labels') _loadNavLabelsUI();
    else if (section === 'translations') _loadTranslationsUI();
    else if (section === 'wosm-members') _loadWosmMembersUI();
    else if (section === 'privacy-policy') _loadPrivacyPolicyUI();
    else if (section === 'account-security') _loadAccountSecurityUI();
  }

  /* ══════════════════════════════════════════════════════════
     PRIVACY POLICY — /privacy 본문 편집 (owner only, Tiptap 에디터)
  ══════════════════════════════════════════════════════════ */
  var _privacyPolicyBound = false;
  var _privacyTiptap = null;        // Tiptap Editor instance
  var _privacyTiptapLoading = null; // Promise<{Editor, StarterKit, Link}>
  var _privacySourceMode = false;   // false=Tiptap, true=HTML textarea

  function _loadTiptap() {
    if (_privacyTiptapLoading) return _privacyTiptapLoading;
    _privacyTiptapLoading = Promise.all([
      import('https://esm.sh/@tiptap/core@2'),
      import('https://esm.sh/@tiptap/starter-kit@2'),
      import('https://esm.sh/@tiptap/extension-link@2'),
    ]).then(function (mods) {
      return {
        Editor: mods[0].Editor,
        StarterKit: mods[1].default || mods[1].StarterKit,
        Link: mods[2].default || mods[2].Link,
      };
    });
    return _privacyTiptapLoading;
  }

  function _privacyGetHtml() {
    if (_privacySourceMode) {
      return String(document.getElementById('privacy-policy-editor-source').value || '').trim();
    }
    return _privacyTiptap ? _privacyTiptap.getHTML() : '';
  }

  function _privacySetHtml(html) {
    var source = document.getElementById('privacy-policy-editor-source');
    if (source) source.value = html || '';
    if (_privacyTiptap) _privacyTiptap.commands.setContent(html || '', false);
  }

  function _privacyUpdateToolbarState() {
    if (!_privacyTiptap) return;
    var bar = document.getElementById('privacy-policy-toolbar');
    if (!bar) return;
    var ed = _privacyTiptap;
    bar.querySelectorAll('button[data-cmd]').forEach(function (btn) {
      var cmd = btn.getAttribute('data-cmd');
      var active = false;
      if (cmd === 'bold' || cmd === 'italic' || cmd === 'strike' || cmd === 'code' || cmd === 'blockquote' || cmd === 'bulletList' || cmd === 'orderedList' || cmd === 'link') {
        active = ed.isActive(cmd);
      } else if (cmd === 'heading2') active = ed.isActive('heading', { level: 2 });
      else if (cmd === 'heading3') active = ed.isActive('heading', { level: 3 });
      else if (cmd === 'paragraph') active = ed.isActive('paragraph');
      btn.classList.toggle('is-active', active);
    });
  }

  function _privacyBindToolbar() {
    var bar = document.getElementById('privacy-policy-toolbar');
    if (!bar || bar.dataset.bound === '1') return;
    bar.dataset.bound = '1';
    bar.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-cmd]');
      if (!btn || !_privacyTiptap) return;
      var cmd = btn.getAttribute('data-cmd');
      var ed = _privacyTiptap.chain().focus();
      switch (cmd) {
        case 'bold': ed.toggleBold().run(); break;
        case 'italic': ed.toggleItalic().run(); break;
        case 'strike': ed.toggleStrike().run(); break;
        case 'code': ed.toggleCode().run(); break;
        case 'heading2': ed.toggleHeading({ level: 2 }).run(); break;
        case 'heading3': ed.toggleHeading({ level: 3 }).run(); break;
        case 'paragraph': ed.setParagraph().run(); break;
        case 'bulletList': ed.toggleBulletList().run(); break;
        case 'orderedList': ed.toggleOrderedList().run(); break;
        case 'blockquote': ed.toggleBlockquote().run(); break;
        case 'undo': ed.undo().run(); break;
        case 'redo': ed.redo().run(); break;
        case 'link':
          var prev = _privacyTiptap.getAttributes('link').href || '';
          var url = window.prompt('링크 URL', prev);
          if (url === null) break;
          if (url === '') { ed.unsetLink().run(); break; }
          ed.extendMarkRange('link').setLink({ href: url, target: '_blank', rel: 'noopener noreferrer' }).run();
          break;
        case 'unlink': ed.unsetLink().run(); break;
      }
      _privacyUpdateToolbarState();
    });
  }

  function _privacyTogglSource() {
    var surface = document.getElementById('privacy-policy-editor-tiptap');
    var source = document.getElementById('privacy-policy-editor-source');
    var toolbar = document.getElementById('privacy-policy-toolbar');
    if (!surface || !source) return;
    if (!_privacySourceMode) {
      // Enter source mode: pull HTML from Tiptap into textarea.
      source.value = _privacyTiptap ? _privacyTiptap.getHTML() : '';
      surface.hidden = true;
      source.hidden = false;
      if (toolbar) toolbar.style.opacity = '0.45';
      _privacySourceMode = true;
    } else {
      // Return to Tiptap: push textarea HTML back into the editor.
      if (_privacyTiptap) _privacyTiptap.commands.setContent(source.value || '', false);
      surface.hidden = false;
      source.hidden = true;
      if (toolbar) toolbar.style.opacity = '1';
      _privacySourceMode = false;
    }
  }

  function _loadPrivacyPolicyUI() {
    var surface = document.getElementById('privacy-policy-editor-tiptap');
    var source = document.getElementById('privacy-policy-editor-source');
    var meta = document.getElementById('privacy-policy-meta');
    var status = document.getElementById('privacy-policy-status');
    if (!surface || !source) return;
    if (status) status.textContent = '불러오는 중…';

    Promise.all([
      GW.apiFetch('/api/settings/privacy-policy'),
      _loadTiptap(),
    ]).then(function (arr) {
      var data = arr[0];
      var tp = arr[1];
      // (Re)create the editor. If a previous instance exists, destroy to keep
      // DOM clean and unbind listeners.
      if (_privacyTiptap) { try { _privacyTiptap.destroy(); } catch (_) {} _privacyTiptap = null; }
      surface.innerHTML = '';
      _privacyTiptap = new tp.Editor({
        element: surface,
        extensions: [tp.StarterKit, tp.Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true })],
        content: (data && data.html) || '',
        onTransaction: _privacyUpdateToolbarState,
        onSelectionUpdate: _privacyUpdateToolbarState,
      });
      source.value = (data && data.html) || '';
      _privacyBindToolbar();
      _privacyUpdateToolbarState();

      if (meta) {
        var parts = [];
        parts.push(data && data.is_default ? '기본값 사용 중' : '사용자 지정 저장됨');
        if (data && data.updated_at) parts.push('최종 저장: ' + data.updated_at);
        if (data && data.max_chars) parts.push('최대 ' + Number(data.max_chars).toLocaleString() + '자');
        meta.textContent = parts.join(' · ');
      }
      if (status) status.textContent = '';
    }).catch(function (err) {
      if (status) status.textContent = '';
      if (GW.showToast) GW.showToast((err && err.message) || 'Tiptap 로드 실패 — HTML 모드로 전환', 'error');
      // Degrade gracefully to the raw source textarea.
      if (surface) surface.hidden = true;
      if (source) source.hidden = false;
      _privacySourceMode = true;
    });

    if (_privacyPolicyBound) return;
    _privacyPolicyBound = true;
    _bindEl('privacy-policy-save-btn', 'click', function () {
      var html = _privacyGetHtml();
      if (!html) { if (GW.showToast) GW.showToast('본문을 입력해주세요', 'error'); return; }
      if (status) status.textContent = '저장 중…';
      GW.apiFetch('/api/settings/privacy-policy', {
        method: 'PUT',
        body: JSON.stringify({ html: html }),
      }).then(function (data) {
        if (status) status.textContent = '';
        if (GW.showToast) GW.showToast('개인정보 처리방침이 저장되었습니다.', 'success');
        if (meta) meta.textContent = '사용자 지정 저장됨 · 최종 저장: ' + (data.updated_at || new Date().toISOString());
      }).catch(function (err) {
        if (status) status.textContent = '';
        if (GW.showToast) GW.showToast((err && err.message) || '저장 실패', 'error');
      });
    });
    _bindEl('privacy-policy-reset-btn', 'click', function () {
      if (!confirm('기본 방침으로 되돌립니다. 현재 저장된 본문은 사라집니다. 계속할까요?')) return;
      if (status) status.textContent = '복원 중…';
      GW.apiFetch('/api/settings/privacy-policy', { method: 'DELETE' }).then(function (data) {
        if (status) status.textContent = '';
        _privacySetHtml((data && data.html) || '');
        if (meta) meta.textContent = '기본값 사용 중';
        if (GW.showToast) GW.showToast('기본값으로 복원되었습니다.', 'success');
      }).catch(function (err) {
        if (status) status.textContent = '';
        if (GW.showToast) GW.showToast((err && err.message) || '복원 실패', 'error');
      });
    });
    _bindEl('privacy-policy-source-toggle-btn', 'click', _privacyTogglSource);
  }

  /* ══════════════════════════════════════════════════════════
     ACCOUNT SECURITY — 관리자 비밀번호 변경
  ══════════════════════════════════════════════════════════ */
  var _accountPasswordBound = false;
  function _loadAccountSecurityUI() {
    var form = document.getElementById('account-password-form');
    if (!form) return;
    _setAccountPasswordStatus('', '');
    // Reset fields whenever the section is reopened.
    var current = document.getElementById('account-current-password');
    var next = document.getElementById('account-new-password');
    var confirm = document.getElementById('account-new-password-confirm');
    if (current) current.value = '';
    if (next) next.value = '';
    if (confirm) confirm.value = '';
    if (_accountPasswordBound) return;
    _accountPasswordBound = true;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      _submitAccountPasswordChange();
    });
  }

  function _setAccountPasswordStatus(message, tone) {
    var el = document.getElementById('account-password-status');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? 'var(--v3-danger, #c0392b)'
                   : (tone === 'success' ? 'var(--v3-success, #1f8f3f)' : '');
  }

  function _submitAccountPasswordChange() {
    var currentEl = document.getElementById('account-current-password');
    var newEl = document.getElementById('account-new-password');
    var confirmEl = document.getElementById('account-new-password-confirm');
    var btn = document.getElementById('account-password-save-btn');
    if (!currentEl || !newEl || !confirmEl || !btn) return;

    var currentPassword = currentEl.value;
    var newPassword = newEl.value;
    var confirmPassword = confirmEl.value;

    if (!currentPassword) { _setAccountPasswordStatus('현재 비밀번호를 입력해주세요.', 'error'); currentEl.focus(); return; }
    if (!newPassword || newPassword.length < 8) { _setAccountPasswordStatus('새 비밀번호는 최소 8자 이상이어야 합니다.', 'error'); newEl.focus(); return; }
    if (newPassword !== confirmPassword) { _setAccountPasswordStatus('새 비밀번호와 확인 값이 일치하지 않습니다.', 'error'); confirmEl.focus(); return; }
    if (currentPassword === newPassword) { _setAccountPasswordStatus('새 비밀번호는 현재 비밀번호와 달라야 합니다.', 'error'); newEl.focus(); return; }

    btn.disabled = true;
    _setAccountPasswordStatus('변경 중…', '');
    GW.apiFetch('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword, confirmPassword: confirmPassword })
    })
      .then(function (data) {
        _setAccountPasswordStatus(
          (data && data.message) || '비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.',
          'success'
        );
        currentEl.value = ''; newEl.value = ''; confirmEl.value = '';
        if (typeof GW.showToast === 'function') GW.showToast('비밀번호가 변경되었습니다', 'success');
      })
      .catch(function (err) {
        var message = (err && err.message) || '비밀번호 변경 중 오류가 발생했습니다.';
        _setAccountPasswordStatus(message, 'error');
      })
      .then(function () { btn.disabled = false; });
  }

  /* ══════════════════════════════════════════════════════════
     EDITOR.JS
  ══════════════════════════════════════════════════════════ */
  // SRI hashes for every CDN resource loaded dynamically here.
  var _ADMIN_CDN_INTEGRITY = {
    'https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js':
      'sha384-3Qk35FaVNGtZ86D5asHJgGM7akscpKWK8qCTRKlW3/+E7JXMNMdXY435C6ZlBrJ4',
    'https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js':
      'sha384-mJYViA5YLmpq5x1Fj5reTmyAPkQLTzUK4w4kkj4dNADfMQ6Me8TxBBgcpVFZKx3l',
    'https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js':
      'sha384-pt2axkhrlqv09EbFmJffXfINJyTZxEnHXulBal/0IZoIT/DIjN9Q8pxYzvJmol8z',
    'https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js':
      'sha384-VXa5SbbQEZGzYpLCMMFm9tK9lOqrfbjMtFF3ajsJs3AVrG8KQJemVU/wYCVenOyX'
  };

  function _loadEditorJS(cb) {
    if (window.EditorJS) { cb(); return; }
    function loadScript(src, done) {
      var integrity = Object.prototype.hasOwnProperty.call(_ADMIN_CDN_INTEGRITY, src) ? _ADMIN_CDN_INTEGRITY[src] : null;
      if (!integrity && /^https?:/i.test(src)) {
        console.error('[admin-v3] Refused to load unpinned CDN script (no SRI hash): ' + src);
        done();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
      }
      s.onload = done;
      document.head.appendChild(s);
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
    var heatmapEl = document.getElementById('dash-traffic-heatmap');
    var heatmapInsightEl = document.getElementById('dash-traffic-insight');
    var homeOverviewEl = document.getElementById('dash-home-overview');
    var homeSectionsEl = document.getElementById('dash-home-sections');
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
    _setText('dash-stat-views-sub', '불러오는 중');
    _setText('dash-stat-posts-sub', '불러오는 중');
    _setText('dash-status-note', '운영 데이터와 최신 게시글을 함께 확인하는 중…');
    if (homeOverviewEl) homeOverviewEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>홈페이지 상태를 불러오는 중…</div>';
    if (homeSectionsEl) homeSectionsEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>섹션 요약을 불러오는 중…</div>';
    if (heatmapEl) heatmapEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>히트맵을 불러오는 중…</div>';
    if (heatmapInsightEl) heatmapInsightEl.innerHTML = '<div class="v3-inline-meta">히트맵 인사이트를 정리하는 중…</div>';

    var analyticsUrl = '/api/admin/analytics' + _dashboardHeatmapQuery();
    Promise.allSettled([
      _apiFetch(analyticsUrl),
      _apiFetch('/api/admin/operations'),
      _apiFetch('/api/posts?limit=8&published=all&scope=admin'),
      _apiFetch('/api/posts/popular?limit=5'),
      _apiFetch('/api/posts?limit=1&published=1'),
      _apiFetch('/api/home'),
    ]).then(function (results) {
      var analytics = results[0].status === 'fulfilled' ? (results[0].value || {}) : {};
      var operations = results[1].status === 'fulfilled' ? (results[1].value || {}) : {};
      var recentRes = results[2].status === 'fulfilled' ? (results[2].value || {}) : { posts: [] };
      var popularRes = results[3].status === 'fulfilled' ? (results[3].value || {}) : { posts: [] };
      var published = results[4].status === 'fulfilled' ? (results[4].value || {}) : { total: 0 };
      var homepage = results[5].status === 'fulfilled' ? (results[5].value || {}) : {};
      var recent    = recentRes.posts || [];
      var popular   = popularRes.posts || [];

      // Stats
      var today = analytics.today || {};
      var visitors = analytics.visitors || {};
      var summary = analytics.summary || {};
      var counts = analytics.counts || {};
      var analyticsOk = results[0].status === 'fulfilled';
      _setText('dash-stat-visits', analyticsOk ? _fmt(today.visits || visitors.today_visits || summary.today_visits || 0) : '—');
      _setText('dash-stat-views',  analyticsOk ? _fmt(today.views || summary.today_pageviews || summary.today_views || 0) : '—');
      _setText('dash-stat-posts', _fmt(recentRes.total || counts.total || recent.length || 0));
      _setText('dash-stat-pub',   _fmt(published.total || counts.published || 0));
      if (heatmapEl) _renderDashboardVisitHeatmap(heatmapEl, analytics.heatmap || null);
      if (heatmapInsightEl) _renderDashboardVisitInsight(heatmapInsightEl, analytics.heatmap || null);

      // Recent posts
      if (!recent.length) {
        recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">게시글이 없습니다</div></div>';
      } else {
        recentEl.innerHTML = recent.map(function (p) {
          return '<div class="v3-recent-row" onclick="V3.openPostPreview(' + p.id + ')">' +
            '<div class="v3-recent-cat"><span class="v3-badge ' + _catBadge(p.category) + '">' + GW.escapeHtml(p.category || '') + '</span></div>' +
            '<div class="v3-recent-info">' +
              '<div class="v3-recent-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
              '<div class="v3-recent-meta">' + GW.escapeHtml(GW.formatDate ? GW.formatDate(p.created_at) : (p.created_at || '')) +
                ' · ' + (p.published ? '<span style="color:var(--v3-ink-published);">공개</span>' : '비공개') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      // Popular posts
      if (!popular.length) {
        topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">데이터 없음</div></div>';
      } else {
        topEl.innerHTML = popular.map(function (p, i) {
          return '<div class="v3-recent-row" onclick="V3.openPostPreview(' + p.id + ')">' +
            '<div style="font-size:11px;font-weight:700;color:var(--v3-text-l);width:18px;flex-shrink:0;">' + (i + 1) + '</div>' +
            '<div class="v3-recent-info">' +
              '<div class="v3-recent-title">' + GW.escapeHtml(p.title || '') + '</div>' +
              '<div class="v3-recent-meta">조회 ' + _fmt(p.views || p.pageviews || 0) + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      if (!analyticsOk) {
        _setText('dash-stat-visits-sub', '분석 API 확인 필요');
        _setText('dash-stat-views-sub', '분석 API 확인 필요');
        _setText('dash-status-note', '분석 API 응답이 실패했습니다. 운영 경고를 먼저 확인해주세요.');
        if (heatmapEl) heatmapEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">방문 히트맵을 불러오지 못했습니다.</div></div>';
        if (heatmapInsightEl) heatmapInsightEl.innerHTML = '<div class="v3-inline-meta">분석 API 응답이 실패해 인사이트를 계산하지 못했습니다.</div>';
      } else {
        _setText('dash-stat-visits-sub', '오늘 고유 방문');
        _setText('dash-stat-views-sub', '오늘 페이지뷰');
        _setText('dash-status-note', (analytics.provider_label || '공개 페이지 방문 집계') + ' · 오늘 방문과 조회는 공개 페이지 기준이며, 아래 카드에서 현재 홈페이지 노출 상태를 함께 확인할 수 있습니다.');
      }
      _renderDashboardHomepageOverview(homeOverviewEl, homepage, results[5].status === 'fulfilled');
      _renderDashboardHomepageSections(homeSectionsEl, homepage, results[5].status === 'fulfilled');
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
      if (results[5].status !== 'fulfilled') {
        if (homeOverviewEl) homeOverviewEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈페이지 스냅샷 API 오류</div></div>';
        if (homeSectionsEl) homeSectionsEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈 섹션 요약 API 오류</div></div>';
      }
    }).catch(function (e) {
      recentEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml((e && e.message) || 'API 오류') + '</div></div>';
      topEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
      if (homeOverviewEl) homeOverviewEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈페이지 스냅샷을 불러오지 못했습니다.</div></div>';
      if (homeSectionsEl) homeSectionsEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈 섹션 요약을 불러오지 못했습니다.</div></div>';
      if (heatmapEl) heatmapEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">히트맵을 불러오지 못했습니다.</div></div>';
      if (heatmapInsightEl) heatmapInsightEl.innerHTML = '<div class="v3-inline-meta">대시보드 API 응답을 불러오지 못해 인사이트를 정리할 수 없습니다.</div>';
      _setText('dash-stat-visits-sub', '대시보드 로딩 실패');
      _setText('dash-stat-views-sub', '대시보드 로딩 실패');
      _setText('dash-stat-posts-sub', '대시보드 로딩 실패');
      _setText('dash-status-note', '대시보드 API 응답을 불러오지 못했습니다.');
    }).finally(function () {
      if (actionBtn) _clearButtonBusy(actionBtn, '완료');
    });
  }

  function _renderDashboardHomepageOverview(el, homepage, ok) {
    if (!el) return;
    if (!ok) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈페이지 상태를 불러오지 못했습니다.</div></div>';
      return;
    }
    var lead = homepage && homepage.lead && homepage.lead.post ? homepage.lead.post : null;
    var latest = homepage && homepage.latest && Array.isArray(homepage.latest.posts) ? homepage.latest.posts : [];
    var popular = homepage && homepage.popular && Array.isArray(homepage.popular.posts) ? homepage.popular.posts : [];
    var picks = homepage && homepage.picks && Array.isArray(homepage.picks.posts) ? homepage.picks.posts : [];
    var heroPosts = homepage && homepage.hero && Array.isArray(homepage.hero.posts) ? homepage.hero.posts : [];
    var tickerItems = homepage && homepage.ticker && Array.isArray(homepage.ticker.items) ? homepage.ticker.items : [];
    var navLabels = homepage && homepage.nav_labels && typeof homepage.nav_labels === 'object' ? homepage.nav_labels : {};
    var issues = homepage && homepage.issues && typeof homepage.issues === 'object' ? homepage.issues : {};
    var issueKeys = Object.keys(issues).filter(function (key) { return !!issues[key]; });
    var stats = homepage && homepage.stats && typeof homepage.stats === 'object' ? homepage.stats : {};
    var analytics = homepage && homepage.analytics && typeof homepage.analytics === 'object' ? homepage.analytics : {};
    var cards = [
      { label: 'Site 버전', value: GW && GW.APP_VERSION ? ('V' + String(GW.APP_VERSION)) : '—', sub: '로그인 전에도 동일하게 노출' },
      { label: '메인 스토리', value: lead ? '정상' : '비어 있음', sub: lead ? _truncateText(lead.title || '', 44) : '메인 스토리 설정 확인 필요' },
      { label: '히어로 슬라이드', value: _fmt(heroPosts.length), sub: '현재 홈 상단 순환 카드 수' },
      { label: '홈 이슈', value: issueKeys.length ? _fmt(issueKeys.length) : '0', sub: issueKeys.length ? issueKeys.join(', ') : '현재 감지된 섹션 이슈 없음' },
      { label: '홈 티커', value: _fmt(tickerItems.length), sub: '상단 티커 노출 줄 수' },
      { label: '메뉴 라벨', value: _fmt(Object.keys(navLabels).length), sub: '공통 메뉴 설정 항목 수' },
      { label: '오늘 홈 게시글', value: _fmt(stats.today || 0), sub: '오늘 공개된 기사 수' },
      { label: '누적 방문', value: _fmt(analytics.total_visits || analytics.total_unique || 0), sub: analytics.provider_label || '공개 페이지 기준 집계' },
    ];
    var leadHtml = lead
      ? '<div class="v3-dash-home-lead"><div class="v3-dash-home-lead-label">현재 메인 스토리</div><div class="v3-dash-home-lead-title">' + GW.escapeHtml(lead.title || '(제목 없음)') + '</div><div class="v3-dash-home-lead-meta">카테고리 ' + GW.escapeHtml(lead.category || '미분류') + ' · 최신 ' + _fmt(latest.length) + ' · 인기 ' + _fmt(popular.length) + ' · 추천 ' + _fmt(picks.length) + '</div></div>'
      : '<div class="v3-empty-inline">현재 메인 스토리가 비어 있습니다. 홈페이지 메인 스토리 설정을 확인해주세요.</div>';
    el.innerHTML =
      '<div class="v3-dash-home-grid">' +
        cards.map(function (card) {
          return '<div class="v3-dash-home-cell">' +
            '<div class="v3-dash-home-label">' + GW.escapeHtml(card.label) + '</div>' +
            '<div class="v3-dash-home-value">' + GW.escapeHtml(String(card.value)) + '</div>' +
            '<div class="v3-dash-home-sub">' + GW.escapeHtml(card.sub) + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      leadHtml;
  }

  function _renderDashboardHomepageSections(el, homepage, ok) {
    if (!el) return;
    if (!ok) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">홈 섹션 상태를 불러오지 못했습니다.</div></div>';
      return;
    }
    var columns = homepage && homepage.columns && typeof homepage.columns === 'object' ? homepage.columns : {};
    var issues = homepage && homepage.issues && typeof homepage.issues === 'object' ? homepage.issues : {};
    var rows = [
      { label: '최신 소식', key: 'latest', count: _countPosts(homepage && homepage.latest && homepage.latest.posts), issue: !!issues.latest },
      { label: '인기 소식', key: 'popular', count: _countPosts(homepage && homepage.popular && homepage.popular.posts), issue: !!issues.popular },
      { label: '에디터 추천', key: 'picks', count: _countPosts(homepage && homepage.picks && homepage.picks.posts), issue: !!issues.picks },
      { label: 'Korea', key: 'korea', count: _countPosts(columns.korea && columns.korea.posts), issue: !!issues.korea },
      { label: 'APR', key: 'apr', count: _countPosts(columns.apr && columns.apr.posts), issue: !!issues.apr },
      { label: 'WOSM', key: 'wosm', count: _countPosts(columns.wosm && columns.wosm.posts), issue: !!issues.wosm },
      { label: 'People', key: 'people', count: _countPosts(columns.people && columns.people.posts), issue: !!issues.people },
    ];
    el.innerHTML = rows.map(function (row) {
      return '<div class="v3-dash-section-row">' +
        '<div class="v3-dash-section-main">' +
          '<div class="v3-dash-section-title">' + GW.escapeHtml(row.label) + '</div>' +
          '<div class="v3-dash-section-meta">' + (row.issue ? '<span class="v3-badge v3-badge-red">이슈 감지</span>' : '<span class="v3-badge v3-badge-green">정상</span>') + '</div>' +
        '</div>' +
        '<div class="v3-dash-section-count">' + _fmt(row.count) + '</div>' +
      '</div>';
    }).join('') + '<div class="v3-dash-section-foot">홈 API 기준 노출 수이며, 0이면 해당 섹션 카드가 비어 보일 수 있습니다.</div>';
  }

  function _countPosts(posts) {
    return Array.isArray(posts) ? posts.length : 0;
  }

  function _truncateText(text, limit) {
    var value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= limit) return value;
    return value.slice(0, Math.max(0, limit - 1)) + '…';
  }

  function _renderDashboardVisitHeatmap(el, heatmap) {
    if (!el) return;
    var cells = heatmap && Array.isArray(heatmap.cells) ? heatmap.cells : [];
    var weekdays = heatmap && Array.isArray(heatmap.weekdays) ? heatmap.weekdays : [];
    var hours = heatmap && Array.isArray(heatmap.hours) ? heatmap.hours : [];
    var maxVisits = Number(heatmap && heatmap.max_visits || 0);
    if (!cells.length || !weekdays.length || !hours.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">표시할 방문 시간 데이터가 없습니다.</div></div>';
      return;
    }
    var cellMap = {};
    cells.forEach(function (cell) {
      cellMap[String(cell.weekday) + '-' + String(cell.hour)] = cell;
    });
    var html = '<div class="v3-heatmap-wrap"><div class="v3-heatmap" role="grid" aria-label="요일별 시간대 방문 히트맵">';
    html += '<div class="v3-heatmap-corner">요일/시간</div>';
    hours.forEach(function (hour) {
      html += '<div class="v3-heatmap-hour" role="columnheader">' + GW.escapeHtml(hour) + '</div>';
    });
    weekdays.forEach(function (day) {
      html += '<div class="v3-heatmap-day" role="rowheader">' + GW.escapeHtml(day.label) + '</div>';
      hours.forEach(function (hour) {
        var cell = cellMap[String(day.key) + '-' + String(hour)] || { visits: 0, pageviews: 0, intensity: 0 };
        var intensity = Math.max(0, Math.min(1, Number(cell.intensity || 0)));
        var level = intensity <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(intensity * 4)));
        var background = level === 0
          ? 'rgba(109, 40, 217, 0.04)'
          : 'rgba(109, 40, 217, ' + (0.14 + intensity * 0.56).toFixed(3) + ')';
        var publishCount = Number(cell.publish_count || 0);
        var title = day.label + '요일 ' + hour + '시 · 방문 ' + _fmt(cell.visits || 0) + ' · 조회 ' + _fmt(cell.pageviews || 0) + ' · 발행 ' + _fmt(publishCount);
        html += '<div class="v3-heatmap-cell' + (publishCount > 0 ? ' has-publish' : '') + '" role="gridcell" data-level="' + level + '" data-count="' + GW.escapeHtml(String(cell.visits || 0)) + '" data-publish="' + GW.escapeHtml(String(publishCount)) + '" title="' + GW.escapeHtml(title) + '" aria-label="' + GW.escapeHtml(title) + '" style="background:' + background + ';"></div>';
      });
    });
    html += '</div></div>';
    html += '<div class="v3-heatmap-legend">' +
      '<span>' + GW.escapeHtml(String(heatmap.range_label || '최근 기간')) + ' · 색상 기준: 고유 방문</span>' +
      '<span>적음</span>' +
      '<span class="v3-heatmap-legend-scale">' +
        '<span class="v3-heatmap-legend-chip" style="background:rgba(109,40,217,0.06)"></span>' +
        '<span class="v3-heatmap-legend-chip" style="background:rgba(109,40,217,0.18)"></span>' +
        '<span class="v3-heatmap-legend-chip" style="background:rgba(109,40,217,0.32)"></span>' +
        '<span class="v3-heatmap-legend-chip" style="background:rgba(109,40,217,0.48)"></span>' +
        '<span class="v3-heatmap-legend-chip" style="background:rgba(109,40,217,0.68)"></span>' +
      '</span>' +
      '<span>많음</span>' +
      '<span>최대 방문 ' + _fmt(maxVisits) + '</span>' +
      '<span class="v3-heatmap-publish-legend"><span class="v3-heatmap-publish-dot"></span>게시글 발행</span>' +
    '</div>';
    el.innerHTML = html;
  }

  function _initDashboardHeatmapControls() {
    var today = _kstToday();
    var start = _shiftDate(today, -6);
    _dashboardHeatmapStart = start;
    _dashboardHeatmapEnd = today;
    var startEl = _el('dash-heatmap-start');
    var endEl = _el('dash-heatmap-end');
    if (startEl) {
      startEl.value = start;
      startEl.max = today;
    }
    if (endEl) {
      endEl.value = today;
      endEl.max = today;
    }
    _syncDashboardHeatmapControls();
  }

  function _syncDashboardHeatmapControls() {
    // 통일 기간 선택 패턴: presets + date range가 항상 함께 표시됨.
    // preset 선택 시 range 비활성, range apply 시 preset 비활성.
    document.querySelectorAll('[data-v3-heatmap-mode]').forEach(function (btn) {
      var mode = btn.getAttribute('data-v3-heatmap-mode') || '';
      btn.classList.toggle('is-active', mode === _dashboardHeatmapMode);
    });
  }

  function _applyDashboardHeatmapCustomRange() {
    var startEl = _el('dash-heatmap-start');
    var endEl = _el('dash-heatmap-end');
    _dashboardHeatmapStart = startEl ? (startEl.value || '') : '';
    _dashboardHeatmapEnd = endEl ? (endEl.value || '') : '';
    if (!_dashboardHeatmapStart || !_dashboardHeatmapEnd) {
      GW.showToast('히트맵 시작일과 종료일을 모두 선택해주세요.', 'error');
      return;
    }
    if (_dashboardHeatmapStart > _dashboardHeatmapEnd) {
      GW.showToast('히트맵 종료일은 시작일보다 빠를 수 없습니다.', 'error');
      return;
    }
    // 통일 패턴: apply 클릭 = custom 모드로 전환 + preset 활성 해제.
    _dashboardHeatmapMode = 'custom';
    _syncDashboardHeatmapControls();
    _loadDashboard();
  }

  function _dashboardHeatmapQuery() {
    var params = new URLSearchParams();
    if (_dashboardHeatmapMode === '7d') {
      params.set('heatmap_days', '7');
    } else if (_dashboardHeatmapMode === '30d') {
      params.set('heatmap_days', '30');
    } else if (_dashboardHeatmapMode === 'all') {
      params.set('heatmap_all', '1');
    } else if (_dashboardHeatmapMode === 'custom') {
      if (_dashboardHeatmapStart) params.set('heatmap_start', _dashboardHeatmapStart);
      if (_dashboardHeatmapEnd) params.set('heatmap_end', _dashboardHeatmapEnd);
    }
    var query = params.toString();
    return query ? ('?' + query) : '';
  }

  function _renderDashboardVisitInsight(el, heatmap) {
    if (!el) return;
    var text = _buildDashboardVisitInsight(heatmap);
    el.innerHTML =
      '<h3 class="v3-dash-insight-title">운영 인사이트</h3>' +
      '<p class="v3-dash-insight-text">' + GW.escapeHtml(text) + '</p>';
  }

  function _buildDashboardVisitInsight(heatmap) {
    var cells = heatmap && Array.isArray(heatmap.cells) ? heatmap.cells : [];
    if (!cells.length) {
      return '선택한 기간에는 요일·시간대별 방문 패턴을 읽을 만큼의 데이터가 아직 충분하지 않습니다. 방문이 더 누적되면 집중 요일과 발행 적기를 함께 파악할 수 있습니다.';
    }
    var totalVisits = 0;
    var topCell = null;
    var publishCells = [];
    var dayTotals = new Map();
    var segments = [
      { key: '새벽', start: 0, end: 5, visits: 0 },
      { key: '오전', start: 6, end: 11, visits: 0 },
      { key: '오후', start: 12, end: 17, visits: 0 },
      { key: '저녁', start: 18, end: 23, visits: 0 },
    ];
    var weekdayVisits = 0;
    var weekendVisits = 0;

    cells.forEach(function (cell) {
      var visits = Number(cell && cell.visits || 0);
      var hour = Number(cell && cell.hour || 0);
      var dayLabel = String(cell && cell.weekday_label || '');
      totalVisits += visits;
      if (!topCell || visits > Number(topCell.visits || 0)) topCell = cell;
      if (Number(cell && cell.publish_count || 0) > 0) publishCells.push(cell);
      dayTotals.set(dayLabel, Number(dayTotals.get(dayLabel) || 0) + visits);
      if (dayLabel === '토' || dayLabel === '일') weekendVisits += visits;
      else weekdayVisits += visits;
      segments.forEach(function (segment) {
        if (hour >= segment.start && hour <= segment.end) segment.visits += visits;
      });
    });

    if (totalVisits <= 0) {
      return '선택한 기간에는 방문이 거의 없어 요일·시간대 패턴을 안정적으로 읽기 어렵습니다. 방문 데이터가 더 쌓이면 집중 요일과 발행 적기를 함께 판단할 수 있습니다.';
    }

    var topDay = '';
    var topDayVisits = -1;
    dayTotals.forEach(function (visits, dayLabel) {
      if (visits > topDayVisits) {
        topDay = dayLabel;
        topDayVisits = visits;
      }
    });

    var sortedSegments = segments.slice().sort(function (a, b) { return b.visits - a.visits; });
    var strongestSegment = sortedSegments[0] || segments[0];
    var quietestSegment = sortedSegments[sortedSegments.length - 1] || segments[0];
    var weekdayShare = totalVisits > 0 ? Math.round((weekdayVisits / totalVisits) * 100) : 0;
    var weekendShare = totalVisits > 0 ? Math.round((weekendVisits / totalVisits) * 100) : 0;
    var topHour = topCell ? String(topCell.hour).padStart(2, '0') : '00';
    var topDayHour = topCell ? String(topCell.weekday_label || '') + '요일 ' + topHour + '시' : '집중 시간대';
    var publishOverlapCell = publishCells.slice().sort(function (a, b) {
      var aScore = Number(a.visits || 0) + Number(a.publish_count || 0) * 10;
      var bScore = Number(b.visits || 0) + Number(b.publish_count || 0) * 10;
      return bScore - aScore;
    })[0] || null;
    var topPublishCell = publishCells.slice().sort(function (a, b) {
      return Number(b.publish_count || 0) - Number(a.publish_count || 0) || Number(b.visits || 0) - Number(a.visits || 0);
    })[0] || null;
    var publishSummary = '';
    if (topPublishCell) {
      publishSummary = String(topPublishCell.weekday_label || '') + '요일 ' + String(topPublishCell.hour || '').padStart(2, '0') + '시에 발행이 가장 많고';
    } else {
      publishSummary = '선택한 기간에는 공개 발행 시점 데이터가 많지 않고';
    }
    var overlapSummary = publishOverlapCell
      ? String(publishOverlapCell.weekday_label || '') + '요일 ' + String(publishOverlapCell.hour || '').padStart(2, '0') + '시는 발행과 방문이 함께 겹치는 대표 구간입니다.'
      : '발행과 방문이 동시에 두드러지는 구간은 아직 뚜렷하지 않습니다.';
    var publishHint = strongestSegment.key === '저녁' || strongestSegment.key === '오후'
      ? '주요 발행과 푸시를 오후~저녁에 맞추는 편이 유리해 보입니다.'
      : '초기 노출과 공지성 업데이트를 이 시간대 흐름에 맞춰 테스트해볼 만합니다.';

    return '최근 집계 기준 방문은 총 ' + _fmt(totalVisits) + '회이며, 가장 붐빈 시점은 ' + topDayHour + '입니다. 요일별로는 ' + topDay + '요일 비중이 가장 높고, 시간대는 ' + strongestSegment.key + '에 방문이 많이 몰립니다. ' + publishSummary + ' ' + overlapSummary + ' 주중/주말 비중은 ' + weekdayShare + '% / ' + weekendShare + '%이고, 상대적으로 한산한 시간대는 ' + quietestSegment.key + '입니다. ' + publishHint;
  }

  function _renderDashboardOperations(editorialEl, alertsEl, settingsEl, deploymentsEl, operations) {
    if (editorialEl) {
      var scheduled = operations.scheduled_posts || [];
      var drafts = operations.draft_posts || [];
      editorialEl.innerHTML =
        '<div class="v3-text-s" style="margin-bottom:8px;color:var(--v3-text-m);">발행 예정</div>' +
        _renderSimpleRows(scheduled, function (item) {
          return {
            title: item.title || '(제목 없음)',
            meta: (item.category || 'site') + ' · ' + _shortDate(item.publish_at),
            action: item.id ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation(); V3.openPostPreview(' + item.id + ')">열기</button>' : '',
          };
        }, '발행 예정 글이 없습니다', '발행 예정 글') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:var(--v3-text-m);">최근 초안</div>' +
        _renderSimpleRows(drafts, function (item) {
          return {
            title: item.title || '(제목 없음)',
            meta: (item.category || 'site') + ' · ' + _shortDate(item.updated_at),
            action: item.id ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation(); V3.openPostPreview(' + item.id + ')">열기</button>' : '',
          };
        }, '최근 초안이 없습니다', '최근 초안');
    }
    if (alertsEl) {
      var errors = operations.recent_errors || [];
      var logins = operations.recent_logins || [];
      alertsEl.innerHTML =
        '<div class="v3-text-s" style="margin-bottom:8px;color:var(--v3-text-m);">최근 API 오류</div>' +
        _renderSimpleRows(errors, function (item) {
          return {
            title: (item.message || item.type || '오류').slice(0, 80),
            meta: [item.channel || 'site', item.path || '', _shortDate(item.created_at)].filter(Boolean).join(' · '),
            action: '',
          };
        }, '최근 오류 로그가 없습니다', '최근 API 오류') +
        '<div class="v3-text-s" style="margin:14px 0 8px;color:var(--v3-text-m);">최근 로그인 시도</div>' +
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
    tbody.innerHTML = '<tr><td colspan="8"><div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div></td></tr>';
    _renderListSortState();

    var params = new URLSearchParams({
      page:    _listPage,
      limit:   _listPageSize,
    });
    if (_listSearch) params.set('q', _listSearch);
    if (_listCat !== 'all') params.set('category', _listCat);
    if (_listPub === 'published') params.set('published', '1');
    else if (_listPub === 'draft') params.set('published', '0');
    _applyListSortParams(params);

    params.set('scope', 'admin');
    _apiFetch('/api/posts?' + params.toString())
      .then(function (data) {
        var posts = (data && data.posts) || [];
        _listTotal = (data && data.total) || posts.length;
        document.getElementById('list-count').textContent = '총 ' + _listTotal + '건';

        if (!posts.length) {
          tbody.innerHTML = '<tr><td colspan="8"><div class="v3-empty"><div class="v3-empty-text">게시글이 없습니다</div></div></td></tr>';
        } else {
          // Row actions (edit / togglePublish / delete) are write operations.
          // Hide them for readers; for writers, PUT/DELETE server still enforces
          // author_user_id = self so non-owners can only touch their own posts.
          var me = (window.AccountAdmin && window.AccountAdmin.currentMe && window.AccountAdmin.currentMe()) || null;
          var isOwner = !!(me && me.role && me.role !== 'member');
          var perms = (me && me.permissions && me.permissions.permissions) || [];
          var canWrite = isOwner
            || perms.indexOf('write:list') !== -1
            || perms.indexOf('write:write') !== -1;
          tbody.innerHTML = posts.map(function (p) {
            var isPublished = Number(p && p.published || 0) === 1;
            var actionCell = canWrite
              ? (
                '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation(); V3.editPost(' + p.id + ')">수정</button>' +
                '<button class="v3-btn v3-btn-ghost v3-btn-xs" onclick="event.stopPropagation(); V3.togglePublish(' + p.id + ',' + (!isPublished) + ')">' + (isPublished ? '비공개' : '공개') + '</button>' +
                (isOwner
                  ? '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:var(--v3-ink-destructive);" onclick="event.stopPropagation(); V3.deletePost(' + p.id + ')">삭제</button>'
                  : '')
              )
              : '<span class="v3-text-m v3-text-s">읽기 전용</span>';
            return '<tr class="v3-row-clickable" onclick="V3.openPostPreview(' + p.id + ')">' +
              '<td><div class="v3-table-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
                (p.subtitle ? '<div class="v3-text-m v3-text-s">' + GW.escapeHtml(p.subtitle) + '</div>' : '') +
              '</td>' +
              '<td><span class="v3-badge ' + _catBadge(p.category) + '">' + GW.escapeHtml(p.category || '') + '</span></td>' +
              '<td>' + (p.tag ? '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(p.tag) + '</span>' : '<span class="v3-text-m">—</span>') + '</td>' +
              '<td>' + (isPublished ? '<span class="v3-badge v3-badge-green">공개</span>' : '<span class="v3-badge v3-badge-gray">비공개</span>') + '</td>' +
              '<td class="v3-text-m">' + GW.escapeHtml(_formatDateTimeCompact(p.created_at)) + '</td>' +
              '<td class="v3-text-m">' + _fmt(p.views || 0) + '</td>' +
              '<td class="v3-text-m v3-nowrap">' + _formatDwellSeconds(p.avg_dwell_seconds) + '</td>' +
              '<td class="v3-nowrap">' + actionCell + '</td>' +
            '</tr>';
          }).join('');
        }
        _renderPagination();
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div></td></tr>';
      });
  }

  function _applyListSortParams(params) {
    var normalized = String(_listSort || 'upload_desc').trim().toLowerCase();
    if (normalized === 'upload_desc') {
      params.set('order_by', 'upload');
      params.set('order_dir', 'desc');
      return;
    }
    if (normalized === 'upload_asc') {
      params.set('order_by', 'upload');
      params.set('order_dir', 'asc');
      return;
    }
    if (normalized === 'date_desc') {
      params.set('order_by', 'date');
      params.set('order_dir', 'desc');
      return;
    }
    if (normalized === 'date_asc') {
      params.set('order_by', 'date');
      params.set('order_dir', 'asc');
      return;
    }
    if (normalized === 'views_desc') {
      params.set('sort', 'views');
      return;
    }
    if (normalized === 'views_asc') {
      params.set('order_by', 'views');
      params.set('order_dir', 'asc');
      return;
    }
    var parts = normalized.split('_');
    if (parts.length === 2) {
      params.set('order_by', parts[0]);
      params.set('order_dir', parts[1]);
    }
  }

  function _renderListSortState() {
    var select = _el('list-sort');
    if (select) select.value = _listSort;
    Array.prototype.forEach.call(document.querySelectorAll('[data-list-sort-key]'), function (btn) {
      var key = btn.getAttribute('data-list-sort-key');
      var state = _parseListSortState(_listSort);
      var active = state.key === key;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('data-sort-dir', state.dir);
      else btn.removeAttribute('data-sort-dir');
    });
  }

  function _parseListSortState(value) {
    var normalized = String(value || 'upload_desc').trim().toLowerCase();
    var parts = normalized.split('_');
    return {
      key: parts[0] || 'upload',
      dir: parts[1] === 'asc' ? 'asc' : 'desc'
    };
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
  V3.listSortBy = function (key) {
    var current = _parseListSortState(_listSort);
    var nextDir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
    if (key === 'category' && current.key !== key) nextDir = 'asc';
    if (key === 'title' && current.key !== key) nextDir = 'asc';
    if (key === 'views' && current.key !== key) nextDir = 'desc';
    if (key === 'date' && current.key !== key) nextDir = 'desc';
    if (key === 'upload' && current.key !== key) nextDir = 'desc';
    _listSort = key + '_' + nextDir;
    _listPage = 1;
    _loadList();
  };

  V3.togglePublish = function (id, pub) {
    _apiFetch('/api/posts/' + id, {
      method: 'PATCH',
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

  V3.openPostPreview = function (id) {
    var modal = _el('post-preview-modal');
    var titleEl = _el('post-preview-title');
    var bodyEl = _el('post-preview-body');
    if (!modal || !titleEl || !bodyEl || !id) return;
    _previewPostId = id;
    titleEl.textContent = '게시글 미리보기';
    bodyEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>게시글을 불러오는 중…</div>';
    modal.style.display = 'flex';
    _apiFetch('/api/posts/' + id)
      .then(function (data) {
        var post = data && data.post ? data.post : null;
        var rendered = null;
        var contentHtml = '';
        var galleryHtml = '';
        var previewImageUrl = '';
        var previewImageIsPlaceholder = false;
        if (!post) throw new Error('게시글을 찾을 수 없습니다.');
        titleEl.textContent = post.title || ('게시글 ' + id);
        previewImageUrl = _resolvePreviewImageUrl(post);
        previewImageIsPlaceholder = !post.image_url;
        if (GW && typeof GW.renderTextWithMedia === 'function') {
          rendered = GW.renderTextWithMedia(post.content || '');
          if (rendered && typeof rendered === 'object') {
            contentHtml = rendered.html || '';
            if (GW && typeof GW.renderContentGallery === 'function' && Array.isArray(rendered.gallery) && rendered.gallery.length > 1) {
              galleryHtml = GW.renderContentGallery(rendered.gallery, { className: 'content-gallery--inline' }) || '';
            }
          } else {
            contentHtml = String(rendered || '');
          }
        } else {
          contentHtml = '<p>' + GW.escapeHtml(post.content || '') + '</p>';
        }
        if (!contentHtml) {
          contentHtml = '<p class="v3-text-m">본문 내용이 없습니다.</p>';
        }
        bodyEl.innerHTML =
          '<div class="v3-simple-rows">' +
            '<div class="v3-inline-meta">' +
              GW.escapeHtml(post.category || 'uncategorized') + ' · ' +
              (Number(post.published || 0) === 1 ? '공개' : '비공개') + ' · ' +
              GW.escapeHtml(_formatDateTimeCompact(post.publish_at || post.created_at || '')) +
            '</div>' +
            (post.subtitle ? '<div class="v3-selected-post-subtitle" style="margin-top:8px;">' + GW.escapeHtml(post.subtitle) + '</div>' : '') +
            (previewImageUrl ? '<img src="' + GW.escapeHtml(previewImageUrl) + '" alt="" style="width:100%;max-height:320px;object-fit:' + (previewImageIsPlaceholder ? 'contain' : 'cover') + ';background:var(--v3-surface);border-radius:16px;border:1px solid var(--v3-border);margin-top:14px;padding:' + (previewImageIsPlaceholder ? '18px' : '0') + ';">' : '') +
            '<div style="margin-top:16px;line-height:1.8;color:var(--v3-text);">' + contentHtml + '</div>' +
            galleryHtml +
          '</div>';
        if (GW && typeof GW.initContentGalleries === 'function') GW.initContentGalleries(bodyEl);
      })
      .catch(function (e) {
        bodyEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">' + GW.escapeHtml((e && e.message) || '게시글을 불러오지 못했습니다.') + '</div></div>';
      });
  };

  function _closePostPreviewModal() {
    var modal = _el('post-preview-modal');
    var bodyEl = _el('post-preview-body');
    if (modal) modal.style.display = 'none';
    if (bodyEl) bodyEl.innerHTML = '';
    _previewPostId = null;
  }
  V3.closePostPreview = _closePostPreviewModal;
  V3.getPreviewPostId = function () { return _previewPostId; };

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
    // Phase 5: w-author is readonly and auto-populated from the session's
    // editor_code so the public byline always reflects the central assignment.
    var _wAuthor = document.getElementById('w-author');
    if (_wAuthor) {
      var _meCode = (window.AccountAdmin && window.AccountAdmin.currentEditorCode)
        ? window.AccountAdmin.currentEditorCode()
        : '';
      _wAuthor.value = _meCode || 'Editor.A';
    }
    document.getElementById('w-date').value       = _kstNow();
    document.getElementById('w-youtube').value    = '';
    document.getElementById('w-cover-caption').value = '';
    document.getElementById('w-location-name').value = '';
    document.getElementById('w-location-addr').value = '';
    var _locPrev = document.getElementById('w-location-map-preview');
    if (_locPrev) { _locPrev.style.display = 'none'; document.getElementById('w-location-map-frame').src = ''; }
    document.getElementById('w-special').value   = '';
    document.getElementById('w-published').checked = true;
    document.getElementById('w-featured').checked  = false;
    document.getElementById('w-ai').checked        = false;
    document.getElementById('w-related-search').value = '';
    document.getElementById('w-related-results').style.display = 'none';
    document.getElementById('write-history-card').style.display = 'none';

    _renderCoverPreview();
    _renderGallery();
    _renderMetaTags();
    _renderRelated();
    _syncWriteFeaturedState();
    _editorClear();
  }

  var _DRAFT_KEY_NEW = 'gw_admin_new_draft';
  function _draftKeyForCurrent() {
    return _editingId ? ('gw_admin_draft_edit_' + _editingId) : _DRAFT_KEY_NEW;
  }

  function _collectDraftPayload(content) {
    return {
      editingId: _editingId || null,
      title:           (_el('w-title')           || {}).value || '',
      subtitle:        (_el('w-subtitle')        || {}).value || '',
      category:        (_el('w-cat')             || {}).value || 'korea',
      tags:            (_selectedWriteTags || []).slice(),
      metaTags:        (_metaTags || []).slice(),
      author:          (_el('w-author')          || {}).value || '',
      publishAt:       (_el('w-date')            || {}).value || '',
      youtube:         (_el('w-youtube')         || {}).value || '',
      coverCaption:    (_el('w-cover-caption')   || {}).value || '',
      locationName:    (_el('w-location-name')   || {}).value || '',
      locationAddress: (_el('w-location-addr')   || {}).value || '',
      special:         (_el('w-special')         || {}).value || '',
      published:       !!(_el('w-published') && _el('w-published').checked),
      featured:        !!(_el('w-featured')  && _el('w-featured').checked),
      content:         content || '',
      savedAt:         Date.now(),
    };
  }

  function _setDraftStatus(state, msg) {
    var line = _el('w-draft-line');
    if (!line) return;
    line.classList.remove('is-saving', 'is-saved', 'is-dirty');
    if (state === 'saving') {
      line.classList.add('is-saving');
      line.textContent = msg || '자동 저장 중…';
    } else if (state === 'saved') {
      line.classList.add('is-saved');
      line.textContent = msg || '자동 저장됨 · 방금 전';
    } else if (state === 'dirty') {
      line.classList.add('is-dirty');
      line.textContent = msg || '변경사항 있음 · 곧 자동 저장';
    } else if (state === 'idle') {
      line.textContent = msg || '자동저장 대기 중…';
    }
  }

  function _relativeTimeKo(ms) {
    if (!ms) return '—';
    var diff = Math.max(0, Date.now() - ms);
    if (diff < 5000)  return '방금 전';
    if (diff < 60000) return Math.round(diff / 1000) + '초 전';
    if (diff < 3600000) return Math.round(diff / 60000) + '분 전';
    return Math.round(diff / 3600000) + '시간 전';
  }

  function _saveDraftNow() {
    var titleEl = _el('w-title');
    if (!titleEl) return;
    var hasTitle = !!titleEl.value.trim();
    // 편집 모드라도 내용이 비어 있으면 저장하지 않음 (노이즈 방지)
    if (!hasTitle) { _setDraftStatus('idle'); return; }
    _setDraftStatus('saving');
    _editorGetData().then(function (content) {
      try {
        var payload = _collectDraftPayload(content);
        localStorage.setItem(_draftKeyForCurrent(), JSON.stringify(payload));
        _writeLastDraftSavedAt = payload.savedAt;
        _writeDirty = false;
        _setDraftStatus('saved', '자동 저장됨 · ' + _relativeTimeKo(payload.savedAt));
      } catch (_) {
        _setDraftStatus('dirty', '저장 실패 (용량 초과 가능성)');
      }
    }).catch(function () {
      _setDraftStatus('dirty', '자동저장 대기…');
    });
  }

  function _scheduleDraftSave() {
    _writeDirty = true;
    _setDraftStatus('dirty');
    if (_writeDraftDebounce) clearTimeout(_writeDraftDebounce);
    _writeDraftDebounce = setTimeout(_saveDraftNow, 1800);
  }

  function _startDraftTimer() {
    _stopDraftTimer();
    // 30초마다 "최근 저장 시간" 라벨을 갱신 (저장은 debounce로 처리)
    _draftTimer = setInterval(function () {
      if (!_writeLastDraftSavedAt || _writeDirty) return;
      var line = _el('w-draft-line');
      if (line && line.classList.contains('is-saved')) {
        _setDraftStatus('saved', '자동 저장됨 · ' + _relativeTimeKo(_writeLastDraftSavedAt));
      }
    }, 30000);
  }

  function _stopDraftTimer() {
    if (_draftTimer) { clearInterval(_draftTimer); _draftTimer = null; }
    if (_writeDraftDebounce) { clearTimeout(_writeDraftDebounce); _writeDraftDebounce = null; }
  }

  function _clearDraft() {
    try { localStorage.removeItem(_draftKeyForCurrent()); } catch (_) {}
    _writeDirty = false;
    _writeLastDraftSavedAt = 0;
    _setDraftStatus('idle', '저장 완료');
  }

  function _checkAndOfferDraftRestore() {
    try {
      var key = _draftKeyForCurrent();
      var raw = localStorage.getItem(key);
      if (!raw) return;
      var draft = JSON.parse(raw);
      if (!draft || !draft.title) return;
      var ageMs = Date.now() - (draft.savedAt || 0);
      if (ageMs > 7 * 24 * 3600000) { localStorage.removeItem(key); return; }
      var timeStr = _relativeTimeKo(draft.savedAt);
      if (!confirm('임시 저장된 글이 있습니다 (' + timeStr + ').\n제목: ' + draft.title + '\n\n복원할까요?')) {
        localStorage.removeItem(key);
        return;
      }
      _applyDraftPayload(draft);
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function _applyDraftPayload(draft) {
    try {
      if (_el('w-title'))    _el('w-title').value    = draft.title || '';
      if (_el('w-subtitle')) _el('w-subtitle').value = draft.subtitle || '';
      if (_el('w-cat'))      _el('w-cat').value      = draft.category || 'korea';
      if (Array.isArray(draft.tags)) {
        _selectedWriteTags = draft.tags.slice();
        _renderWriteTagPills(draft.category || 'korea');
      }
      if (Array.isArray(draft.metaTags)) { _metaTags = draft.metaTags.slice(); _renderMetaTags(); }
      if (_el('w-author'))          _el('w-author').value          = draft.author || '';
      if (_el('w-date') && draft.publishAt) _el('w-date').value    = draft.publishAt;
      if (_el('w-youtube'))         _el('w-youtube').value         = draft.youtube || '';
      if (_el('w-cover-caption'))   _el('w-cover-caption').value   = draft.coverCaption || '';
      if (_el('w-location-name'))   _el('w-location-name').value   = draft.locationName || '';
      if (_el('w-location-addr'))   _el('w-location-addr').value   = draft.locationAddress || '';
      if (_el('w-special'))         _el('w-special').value         = draft.special || '';
      if (_el('w-published'))       _el('w-published').checked     = draft.published !== false;
      if (_el('w-featured'))        _el('w-featured').checked      = !!draft.featured;
      _syncWriteFeaturedState();
      if (draft.content) _editorSetData(draft.content);
      _updateWriteStats();
      _updateSeoPreview();
      GW.showToast('임시 저장본을 복원했습니다', 'success');
    } catch (_) {}
  }

  /* ── Write stats (글자수 · 문단수 · 읽기시간) ── */
  function _plainTextFromEditor(jsonStr) {
    if (!jsonStr) return '';
    var src = String(jsonStr).trim();
    if (src.charAt(0) !== '{') return src;
    try {
      var doc = JSON.parse(src);
      if (!doc || !Array.isArray(doc.blocks)) return '';
      return doc.blocks.map(function (b) {
        if (!b || !b.data) return '';
        if (b.type === 'paragraph' || b.type === 'header') return String(b.data.text || '').replace(/<[^>]+>/g, '');
        if (b.type === 'quote') return String(b.data.text || '').replace(/<[^>]+>/g, '');
        if (b.type === 'list') {
          return (b.data.items || []).map(function (it) {
            if (typeof it === 'string') return it.replace(/<[^>]+>/g, '');
            return String((it && it.content) || '').replace(/<[^>]+>/g, '');
          }).join('\n');
        }
        return '';
      }).filter(Boolean).join('\n\n');
    } catch (_) { return ''; }
  }

  function _updateWriteStats() {
    var titleEl = _el('w-title');
    var subEl   = _el('w-subtitle');
    var titleLen = titleEl ? titleEl.value.length : 0;
    var subLen   = subEl   ? subEl.value.length   : 0;
    _setText('w-stat-title', titleLen + '자');
    _setText('w-stat-subtitle', subLen + '자');

    if (!_editor) {
      _setText('w-stat-body', '0자');
      _setText('w-stat-paragraphs', '0개');
      _setText('w-stat-reading', '예상 읽기 시간: —');
      return;
    }
    // Editor.js 내용 추출은 save()를 호출해야 하므로 너무 자주 호출하지 않도록 타이머 디바운스
    if (_writeStatsTimer) clearTimeout(_writeStatsTimer);
    _writeStatsTimer = setTimeout(function () {
      _editorGetData().then(function (json) {
        var plain = _plainTextFromEditor(json);
        var bodyLen = plain.replace(/\s+/g, '').length;
        var paragraphs = plain ? plain.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length : 0;
        _setText('w-stat-body', bodyLen + '자');
        _setText('w-stat-paragraphs', paragraphs + '개');
        var minutes = Math.max(1, Math.round(bodyLen / 500));
        _setText('w-stat-reading', '예상 읽기 시간: 약 ' + minutes + '분');
        _updateSeoPreviewWithBody(plain);
      });
    }, 350);
  }

  /* ── SEO · 공유 미리보기 ── */
  function _updateSeoPreview() {
    var titleEl = _el('w-title');
    var subEl   = _el('w-subtitle');
    var urlEl   = _el('w-seo-url');
    var ttEl    = _el('w-seo-title');
    var descEl  = _el('w-seo-desc');
    if (!ttEl || !descEl) return;
    var rawTitle = (titleEl && titleEl.value.trim()) || '기사 제목이 여기에 표시됩니다';
    ttEl.textContent = rawTitle + (rawTitle.length > 60 ? '' : ' — Gilwell Media');
    if (urlEl) {
      urlEl.textContent = 'https://gilwell.media/post/' + (_editingId || '—');
    }
    var sub = (subEl && subEl.value.trim()) || '';
    if (sub) {
      descEl.textContent = sub;
    } else {
      descEl.textContent = '부제목이 없으면 본문 첫 문단이 사용됩니다.';
    }
  }
  function _updateSeoPreviewWithBody(plainBody) {
    var subEl  = _el('w-subtitle');
    var descEl = _el('w-seo-desc');
    if (!descEl) return;
    var sub = subEl && subEl.value.trim();
    if (sub) return; // 부제목 있으면 우선
    var firstPara = (plainBody || '').split(/\n\s*\n/)[0] || '';
    firstPara = firstPara.trim().slice(0, 140);
    descEl.textContent = firstPara || '부제목이 없으면 본문 첫 문단이 사용됩니다.';
  }

  /* ── 메타 태그 자동완성 ── */
  function _ensureMetaTagPool() {
    if (_metaTagPool || _metaTagPoolLoading) return;
    _metaTagPoolLoading = true;
    _apiFetch('/api/admin/meta-tag-pool?limit=300')
      .then(function (data) {
        _metaTagPool = (data && Array.isArray(data.tags)) ? data.tags : [];
      })
      .catch(function () { _metaTagPool = []; })
      .finally(function () { _metaTagPoolLoading = false; });
  }

  function _renderMetaTagSuggestions(query) {
    var box = _el('w-metatag-suggestions');
    if (!box) return;
    if (!_metaTagPool) { box.hidden = true; return; }
    var q = String(query || '').trim().toLowerCase();
    var exclude = new Set((_metaTags || []).map(function (t) { return t.toLowerCase(); }));
    var matches = _metaTagPool
      .filter(function (t) { return t.name && !exclude.has(t.name.toLowerCase()); })
      .filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; })
      .slice(0, 12);
    if (!matches.length) { box.hidden = true; return; }
    _metaSuggestActiveIdx = -1;
    box.innerHTML = matches.map(function (t, i) {
      return '<div class="v3-metatag-suggestion" data-idx="' + i + '" data-name="' + GW.escapeHtml(t.name) + '">' +
        '<span>' + GW.escapeHtml(t.name) + '</span>' +
        '<span class="v3-metatag-suggestion-count">' + (t.count || 0) + '회</span>' +
      '</div>';
    }).join('');
    box.hidden = false;
  }

  function _hideMetaTagSuggestions() {
    var box = _el('w-metatag-suggestions');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    _metaSuggestActiveIdx = -1;
  }

  function _applyMetaTagSuggestion(name) {
    var input = _el('w-metatag-input');
    if (input) input.value = name;
    _addMetaTag();
    _hideMetaTagSuggestions();
  }

  function _moveMetaSuggestActive(delta) {
    var box = _el('w-metatag-suggestions');
    if (!box || box.hidden) return;
    var items = box.querySelectorAll('.v3-metatag-suggestion');
    if (!items.length) return;
    _metaSuggestActiveIdx = (_metaSuggestActiveIdx + delta + items.length) % items.length;
    items.forEach(function (el, i) { el.classList.toggle('is-active', i === _metaSuggestActiveIdx); });
    var active = items[_metaSuggestActiveIdx];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  /* ── 인라인 AI 채점 ── */
  function _runWriteScorer() {
    var btn = _el('write-scorer-run-btn');
    var out = _el('write-scorer-result');
    var title    = (_el('w-title')    || {}).value || '';
    var subtitle = (_el('w-subtitle') || {}).value || '';
    var tagsArr  = (_metaTags && _metaTags.length) ? _metaTags : (_selectedWriteTags || []);
    var tags     = (tagsArr || []).join(', ');
    title = title.trim(); subtitle = subtitle.trim();
    if (!title) { GW.showToast('제목을 먼저 입력하세요', 'error'); return; }

    _setButtonBusy(btn, 'AI 채점 중…');
    if (out) {
      out.hidden = false;
      out.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>AI가 기사를 분석하고 있습니다…</div>';
    }

    _editorGetData().then(function (json) {
      var body = _plainTextFromEditor(json);
      return _apiFetch('/api/admin/score-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, subtitle: subtitle, content: body, tags: tags }),
      });
    }).then(function (data) {
      _clearButtonBusy(btn);
      if (data && data.ok && data.result) {
        _renderWriteScorerResult(data.result);
      } else {
        _renderWriteScorerError((data && data.error) || 'AI 채점 실패');
      }
    }).catch(function (err) {
      _clearButtonBusy(btn);
      _renderWriteScorerError('채점 요청 실패: ' + ((err && err.message) || String(err)));
    });
  }

  function _renderWriteScorerError(msg) {
    var out = _el('write-scorer-result');
    if (!out) return;
    out.innerHTML = '<div class="v3-scorer-inline-improvement" style="border-left-color:#FF5655;background:rgba(255,86,85,0.06);">' +
      '<strong>오류</strong><p>' + GW.escapeHtml(msg) + '</p></div>';
  }

  function _renderWriteScorerResult(result) {
    var out = _el('write-scorer-result');
    if (!out) return;
    var overall = result.overall || {};
    var pct     = Number(overall.score || 0);
    var grade   = overall.grade || '—';
    var color   = pct >= 80 ? '#248737' : pct >= 60 ? '#0094B4' : '#FF5655';
    var cats    = Array.isArray(result.categories) ? result.categories : [];

    var html = '<div class="v3-scorer-inline-head">' +
      '<div><span class="v3-scorer-inline-score" style="color:' + color + '">' + pct + ' / 100</span>' +
      ' <span class="v3-scorer-inline-grade" style="color:' + color + ';border-color:' + color + '">' + GW.escapeHtml(grade) + '</span></div>' +
      '<button class="v3-btn v3-btn-ghost v3-btn-sm" type="button" onclick="V3.runWriteScorer()">다시 채점</button>' +
    '</div>';
    if (overall.summary) html += '<div class="v3-scorer-inline-summary">' + GW.escapeHtml(overall.summary) + '</div>';
    html += '<div class="v3-scorer-inline-bar"><div class="v3-scorer-inline-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';

    html += '<div class="v3-scorer-inline-cats">' + cats.map(function (c) {
      var cPct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      var cColor = cPct >= 80 ? '#248737' : cPct >= 60 ? '#0094B4' : '#FF5655';
      var issues    = (c.issues    || []).filter(Boolean);
      var strengths = (c.strengths || []).filter(Boolean);
      var listHtml  = '';
      if (strengths.length) {
        listHtml += '<ul class="v3-scorer-inline-cat-list is-strength">' + strengths.map(function (s) { return '<li>' + GW.escapeHtml(s) + '</li>'; }).join('') + '</ul>';
      }
      if (issues.length) {
        listHtml += '<ul class="v3-scorer-inline-cat-list is-issue">' + issues.map(function (i) { return '<li>' + GW.escapeHtml(i) + '</li>'; }).join('') + '</ul>';
      }
      return '<div class="v3-scorer-inline-cat">' +
        '<div class="v3-scorer-inline-cat-head"><span>' + GW.escapeHtml(c.label || '') + '</span>' +
        '<span class="v3-scorer-inline-cat-score" style="color:' + cColor + '">' + c.score + '/' + c.max + '</span></div>' +
        listHtml +
      '</div>';
    }).join('') + '</div>';

    if (result.improvement) {
      html += '<div class="v3-scorer-inline-improvement"><strong>개선 방향</strong><p>' + GW.escapeHtml(result.improvement) + '</p></div>';
    }
    if (result.revision_suggestion) {
      html += '<div class="v3-scorer-inline-improvement v3-scorer-inline-revision" style="border-left-color:#248737;background:rgba(36,135,55,0.06);">'
        + '<strong>✏️ 수정 제안 <span style="font-weight:400;opacity:0.6;font-size:11px;">· 약 300자</span></strong>'
        + '<p>' + GW.escapeHtml(result.revision_suggestion) + '</p>'
        + '</div>';
    }
    out.innerHTML = html;
    out.hidden = false;
  }

  /* ── Write panel 초기화 (한 번만 실행) ── */
  function _initWriteEnhancementsOnce() {
    if (_writeEnhanceInited) return;
    _writeEnhanceInited = true;

    // 텍스트 입력 → 통계 + SEO + draft
    ['w-title', 'w-subtitle', 'w-cat', 'w-author', 'w-date', 'w-youtube',
     'w-cover-caption', 'w-location-name', 'w-location-addr', 'w-special'].forEach(function (id) {
      var el = _el(id);
      if (!el) return;
      el.addEventListener('input', function () {
        _updateWriteStats();
        _updateSeoPreview();
        _scheduleDraftSave();
      });
      el.addEventListener('change', function () {
        _updateWriteStats();
        _updateSeoPreview();
        _scheduleDraftSave();
      });
    });
    ['w-published', 'w-featured', 'w-ai'].forEach(function (id) {
      var el = _el(id);
      if (el) el.addEventListener('change', _scheduleDraftSave);
    });

    // Editor.js 변경 감지 — holder에 mutation observer (콘텐츠 편집 감지)
    var holder = _el('v3-editorjs');
    if (holder && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        _scheduleDraftSave();
        _updateWriteStats();
      });
      obs.observe(holder, { childList: true, subtree: true, characterData: true });
    }

    // 인라인 채점 버튼
    _bindEl('write-scorer-run-btn', 'click', _runWriteScorer);

    // 메타태그 자동완성 이벤트
    var metaInput = _el('w-metatag-input');
    if (metaInput) {
      metaInput.addEventListener('input', function () {
        _ensureMetaTagPool();
        _renderMetaTagSuggestions(this.value);
      });
      metaInput.addEventListener('focus', function () {
        _ensureMetaTagPool();
        if (this.value) _renderMetaTagSuggestions(this.value);
      });
      metaInput.addEventListener('blur', function () {
        // 약간의 지연으로 클릭 이벤트가 발생할 수 있도록
        setTimeout(_hideMetaTagSuggestions, 150);
      });
      metaInput.addEventListener('keydown', function (e) {
        var box = _el('w-metatag-suggestions');
        var open = box && !box.hidden;
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); _moveMetaSuggestActive(1); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); _moveMetaSuggestActive(-1); }
        else if (e.key === 'Enter' && open && _metaSuggestActiveIdx >= 0) {
          e.preventDefault();
          var items = box.querySelectorAll('.v3-metatag-suggestion');
          var active = items[_metaSuggestActiveIdx];
          if (active) _applyMetaTagSuggestion(active.getAttribute('data-name') || '');
        } else if (e.key === 'Escape') {
          _hideMetaTagSuggestions();
        }
      });
    }
    var suggestBox = _el('w-metatag-suggestions');
    if (suggestBox) {
      suggestBox.addEventListener('mousedown', function (e) {
        var target = e.target;
        while (target && target !== suggestBox && !target.classList.contains('v3-metatag-suggestion')) {
          target = target.parentNode;
        }
        if (target && target.classList && target.classList.contains('v3-metatag-suggestion')) {
          e.preventDefault();
          _applyMetaTagSuggestion(target.getAttribute('data-name') || '');
        }
      });
    }

    // 키보드 단축키 (Cmd/Ctrl+S 저장, Esc 취소)
    document.addEventListener('keydown', function (e) {
      if (_panel !== 'write') return;
      var isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        _savePost();
      } else if (e.key === 'Escape') {
        // textarea/input 에서 ESC로 포커스만 뺄 수 있도록 모달/드롭다운이 열려있지 않으면 취소
        var box = _el('w-metatag-suggestions');
        if (box && !box.hidden) return;
        if (_writeDirty) {
          if (!confirm('저장하지 않은 변경사항이 있습니다. 목록으로 나갈까요?')) return;
        }
        V3.showPanel('list');
      }
    });
  }

  V3.runWriteScorer = _runWriteScorer;

  V3.openWrite = function () {
    _resetWrite();
    V3.showPanel('write');
    _initWriteEnhancementsOnce();
    _startDraftTimer();
    _ensureMetaTagPool();
    _updateWriteStats();
    _updateSeoPreview();
    _setDraftStatus('idle');
    // 인라인 채점 결과 초기화
    var scoreOut = _el('write-scorer-result');
    if (scoreOut) { scoreOut.hidden = true; scoreOut.innerHTML = ''; }
    setTimeout(_checkAndOfferDraftRestore, 800);
  };
  V3.cancelWrite = function () {
    if (_writeDirty) {
      if (!confirm('저장하지 않은 변경사항이 있습니다. 목록으로 나갈까요?')) return;
    }
    V3.showPanel('list');
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

    _initWriteEnhancementsOnce();
    _startDraftTimer();
    _ensureMetaTagPool();
    var scoreOut = _el('write-scorer-result');
    if (scoreOut) { scoreOut.hidden = true; scoreOut.innerHTML = ''; }

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
        _syncWriteFeaturedState();

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
        _editorSetData(p.content || '').then(function () {
          _updateWriteStats();
          _updateSeoPreview();
          _writeDirty = false;
          _setDraftStatus('idle', '서버 데이터 기준');
        });

        // History card
        _loadPostHistory(id);
      })
      .catch(function (e) {
        GW.showToast(e.message || '불러오기 실패', 'error');
      });
  };

  function _savePost() {
    var title = document.getElementById('w-title').value.trim();
    if (!title) { GW.showToast('제목을 입력하세요', 'error'); return; }

    var btn = document.getElementById('write-publish-btn');
    var publishedChecked = !!document.getElementById('w-published').checked;
    _setButtonBusy(btn, publishedChecked ? '공개 저장 중…' : '비공개 저장 중…');

    _editorGetData().then(function (content) {
      var dateVal = document.getElementById('w-date').value;
      var desiredFeatured = publishedChecked && !!document.getElementById('w-featured').checked;
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
        published:        publishedChecked,
        featured:         desiredFeatured,
        ai_assisted:      document.getElementById('w-ai').checked,
        meta_tags:        _metaTags.join(','),
        publish_at:       dateVal || undefined,
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

      return _apiFetch(url, { method: method, body: JSON.stringify(body) }).then(function (data) {
        var savedPost = data.post || data;
        if (!savedPost || !savedPost.id) return savedPost;
        var savedPublished = Number(savedPost.published || 0) === 1;
        var savedFeatured = Number(savedPost.featured || 0) === 1;
        if (savedPublished === publishedChecked && savedFeatured === desiredFeatured) return savedPost;
        return _apiFetch('/api/posts/' + savedPost.id, {
          method: 'PATCH',
          body: JSON.stringify({
            published: publishedChecked,
            featured: desiredFeatured
          })
        }).then(function (patched) {
          return patched.post || patched;
        });
      });
    }).then(function (data) {
      var saved = data.post || data;
      if (!_editingId && saved.id) _editingId = saved.id;
      _clearDraft();
      GW.showToast(Number(saved && saved.published || 0) === 1 ? '공개 상태로 저장했습니다' : '비공개 상태로 저장했습니다', 'success');
      document.getElementById('write-panel-title').textContent = '글 수정: ' + (document.getElementById('w-title').value || '');
      document.getElementById('w-published').checked = Number(saved && saved.published || 0) === 1;
      document.getElementById('w-featured').checked = Number(saved && saved.featured || 0) === 1;
      _syncWriteFeaturedState();
      if (_homeLeadPost && Number(_homeLeadPost.id || 0) === Number(saved && saved.id || 0)) {
        _loadHomeLeadUI();
      }
      if (Array.isArray(_heroPostIds) && _heroPostIds.indexOf(Number(saved && saved.id || 0)) >= 0) {
        _loadHero();
      }
      _clearButtonBusy(btn, '완료');
    }).catch(function (e) {
      GW.showToast(e.message || '저장 실패', 'error');
      _clearButtonBusy(btn);
    });
  }
  V3.savePost = _savePost;

  function _syncWriteFeaturedState() {
    var published = document.getElementById('w-published');
    var featured = document.getElementById('w-featured');
    var publishBtn = document.getElementById('write-publish-btn');
    if (!published || !featured) return;
    if (!published.checked) featured.checked = false;
    featured.disabled = !published.checked;
    if (publishBtn) publishBtn.textContent = published.checked ? '공개로 저장' : '비공개로 저장';
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
    var previewUrl = _coverDataUrl || _resolvePreviewImageUrl();
    var isPlaceholder = !_coverDataUrl;
    if (!el || !previewUrl) return;
    el.innerHTML = '<div class="v3-img-preview-wrap">' +
      '<img src="' + GW.escapeHtml(previewUrl) + '" alt="미리보기" class="' + (isPlaceholder ? 'is-placeholder' : '') + '" />' +
      '<div style="margin-top:6px;">' +
        (isPlaceholder
          ? '<span class="v3-input-hint">대표 이미지가 없어서 기본 BP미디어 로고를 미리보기로 표시합니다.</span>'
          : '<button class="v3-btn v3-btn-outline v3-btn-xs" onclick="V3._removeCover()">대표 이미지 삭제</button>') +
      '</div>' +
    '</div>';
  }
  V3._removeCover = function () { _coverDataUrl = null; _renderCoverPreview(); };

  function _resolvePreviewImageUrl(post) {
    if (post && post.image_url) return post.image_url;
    return '/img/logo.png';
  }

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
    if (typeof _scheduleDraftSave === 'function') _scheduleDraftSave();
  }
  function _renderMetaTags() {
    var el = document.getElementById('w-metatag-chips');
    el.innerHTML = _metaTags.map(function (t, i) {
      return '<span class="v3-metatag-chip">' + GW.escapeHtml(t) +
        '<button class="v3-metatag-rm" onclick="V3._removeMetaTag(' + i + ')">×</button></span>';
    }).join('');
  }
  V3._removeMetaTag = function (i) {
    _metaTags.splice(i, 1);
    _renderMetaTags();
    if (typeof _scheduleDraftSave === 'function') _scheduleDraftSave();
  };

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
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8&scope=admin').then(function (data) {
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

    var newBtn   = document.getElementById('w-tag-new-btn');
    var newInput = document.getElementById('w-tag-new-input');
    var catSelect = document.getElementById('w-cat');
    if (catSelect && catSelect.dataset.tagsBound !== '1') {
      catSelect.addEventListener('change', function () {
        _renderWriteTagPills(this.value);
      });
      catSelect.dataset.tagsBound = '1';
    }
    if (newBtn && newBtn.dataset.tagsBound !== '1') {
      newBtn.addEventListener('click', function () { _addWriteTagFromInput(); });
      newBtn.dataset.tagsBound = '1';
    }
    if (newInput && newInput.dataset.tagsBound !== '1') {
      newInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); _addWriteTagFromInput(); }
      });
      newInput.dataset.tagsBound = '1';
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
    _apiFetch('/api/posts?q=' + encodeURIComponent(q) + '&limit=8&scope=admin').then(function (data) {
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
  V3.closeCalendarModal = _closeCalModal;
  V3.addCalendarTag = _addCalTag;
  V3.searchCalendarGeo = _searchCalGeo;

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
  V3.saveCalendar = _saveCal;

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
  V3.deleteCalendar = function () {
    var idEl = _el('cal-id');
    var id = idEl ? parseInt(idEl.value, 10) : 0;
    if (id) _deleteCal(id);
  };

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
  V3.closeGlossaryModal = _closeGlosModal;

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
  V3.saveGlossary = _saveGlos;

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
  V3.deleteGlossary = function () {
    var idEl = _el('glos-id');
    var id = idEl ? parseInt(idEl.value, 10) : 0;
    if (id) _deleteGlos(id);
  };

  /* ══════════════════════════════════════════════════════════
     ANALYTICS
  ══════════════════════════════════════════════════════════ */
  // 기간 state({days} | {start,end}) → URL 쿼리 파라미터 단편
  function _periodQuery(state, prefix) {
    var p = prefix || '';
    var out = [];
    if (state && state.days) {
      out.push(p + 'days=' + encodeURIComponent(state.days));
    } else if (state && state.start && state.end) {
      out.push(p + 'start=' + encodeURIComponent(state.start));
      out.push(p + 'end=' + encodeURIComponent(state.end));
    } else {
      out.push(p + 'days=30');
    }
    return out.join('&');
  }
  // 기간 state → 표시 라벨 ("7일" or "2026-04-01 ~ 2026-04-30")
  function _periodLabel(state) {
    if (state && state.days) return state.days + '일';
    if (state && state.start && state.end) return state.start + ' ~ ' + state.end;
    return '30일';
  }

  // 하위 호환: 기존 _loadAnalytics() 호출부는 방문 분석 패널 로더로 연결
  function _loadAnalytics() { _loadAnalyticsVisits(); }

  function _loadAnalyticsVisits() {
    if (_analyticsLoading) return;
    var statsEl = document.getElementById('analytics-stats');
    var bodyEl  = document.getElementById('analytics-body');
    if (!statsEl || !bodyEl) return;
    var noteHtml = '';
    _analyticsLoading = true;
    _updateAnalyticsRefreshMeta(true);
    statsEl.innerHTML = '<div class="v3-loading" style="grid-column:1/-1;"><div class="v3-spinner"></div>로딩 중…</div>';
    bodyEl.innerHTML  = '';

    var period = _analyticsPeriodState.days || 30;
    // 방문 분석은 visits 기간만 서버로 전송. tag_* 는 사용 안 함.
    var qs = _periodQuery(_analyticsPeriodState);
    _apiFetch('/api/admin/analytics?' + qs).then(function (data) {
      var today    = data.today    || {};
      var summary  = data.summary  || {};
      var visitors = data.visitors || {};
      var views    = data.views    || {};
      var topPosts = data.article_top_posts || data.top_posts || data.top_paths || (views.top_paths || []);
      var sources  = data.sources  || data.referrers || [];
      var trackingNote = String(data.tracking_note || '').trim();

      statsEl.innerHTML =
        _statCard('오늘 방문',       _fmt(today.visits  || visitors.today_visits || summary.today_visits || 0), '오늘') +
        _statCard('오늘 조회',       _fmt(today.views   || summary.today_pageviews || summary.today_views || 0), '오늘') +
        _statCard(period + '일 방문', _fmt(summary.range_visits || visitors.range_visits || 0), '기간 합계') +
        _statCard(period + '일 조회', _fmt(summary.range_pageviews || views.range_pageviews || views.total || 0), '기간 합계') +
        _statCard('인기 기사 평균 체류', _fmt(summary.popular_post_average_dwell_seconds || 0) + '초', summary.popular_post_title || '대표 기사 기준') +
        _statCard('평균 체류',       _fmt(summary.average_dwell_seconds || 0) + '초', '기간 평균');

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

      if (trackingNote) {
        noteHtml =
          '<div class="v3-analytics-note">' +
            '<strong>유입 해석 안내</strong><br>' +
            GW.escapeHtml(trackingNote) +
          '</div>';
      }

      bodyEl.innerHTML = (noteHtml + html) || '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">분석 데이터가 없습니다</div></div></div>';
      _analyticsLastUpdatedAt = Date.now();
      _updateAnalyticsRefreshMeta();
    }).catch(function (e) {
      statsEl.innerHTML = '<div class="v3-empty" style="grid-column:1/-1;"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
      bodyEl.innerHTML  = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">분석 API 응답을 불러오지 못했습니다</div></div></div>';
      _updateAnalyticsRefreshMeta(false, e && e.message ? String(e.message) : '분석 API 응답을 불러오지 못했습니다');
    }).finally(function () {
      _analyticsLoading = false;
    });
    // 검색 유입 키워드도 같은 타이밍에 새로고침
    _loadSearchKeywords();
  }

  /* ── 검색 유입 키워드 로드/렌더 ─────────────────────────── */
  function _loadSearchKeywords(triggerBtn) {
    var summaryEl = document.getElementById('search-keywords-summary');
    var enginesEl = document.getElementById('search-keywords-engines');
    var listEl    = document.getElementById('search-keywords-list');
    if (!summaryEl || !listEl) return;
    if (triggerBtn) _setButtonBusy(triggerBtn, '로딩…');
    summaryEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';

    var qs = _periodQuery(_analyticsPeriodState) + '&limit=100';
    _apiFetch('/api/admin/search-keywords?' + qs)
      .then(function (data) {
        _renderSearchKeywords(data);
      })
      .catch(function (err) {
        summaryEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml((err && err.message) || '') + '</div></div>';
        if (enginesEl) enginesEl.innerHTML = '';
        if (listEl) listEl.innerHTML = '';
      })
      .finally(function () {
        if (triggerBtn) _clearButtonBusy(triggerBtn);
      });
  }

  function _renderSearchKeywords(data) {
    var summaryEl = document.getElementById('search-keywords-summary');
    var enginesEl = document.getElementById('search-keywords-engines');
    var listEl    = document.getElementById('search-keywords-list');
    if (!summaryEl || !enginesEl || !listEl) return;
    var visits = Number(data && data.total_visits || 0);
    var unique = Number(data && data.total_unique || 0);
    var range = (data && data.range) || {};
    var rangeLabel = range.days ? ('최근 ' + range.days + '일') :
                     (range.start && range.end ? (range.start + ' ~ ' + range.end) : '전체');

    summaryEl.innerHTML =
      '<div class="v3-sk-stat">' +
        '<span class="v3-sk-stat-label">기간</span>' +
        '<span class="v3-sk-stat-value">' + GW.escapeHtml(rangeLabel) + '</span>' +
        '<span class="v3-sk-stat-sub">상단 방문 분석 필터와 공유</span>' +
      '</div>' +
      '<div class="v3-sk-stat">' +
        '<span class="v3-sk-stat-label">검색 유입 방문</span>' +
        '<span class="v3-sk-stat-value">' + visits.toLocaleString('ko-KR') + '</span>' +
        '<span class="v3-sk-stat-sub">referer에서 키워드 파싱 성공 건</span>' +
      '</div>' +
      '<div class="v3-sk-stat">' +
        '<span class="v3-sk-stat-label">고유 키워드</span>' +
        '<span class="v3-sk-stat-value">' + unique.toLocaleString('ko-KR') + '</span>' +
        '<span class="v3-sk-stat-sub">중복 제거 후</span>' +
      '</div>';

    var engines = Array.isArray(data && data.by_engine) ? data.by_engine : [];
    enginesEl.innerHTML = engines.length
      ? engines.map(function (e) {
          return '<span class="v3-sk-engine-pill">' +
            GW.escapeHtml(e.engine) +
            ' <span class="v3-sk-engine-pill-count">' + Number(e.visits || 0).toLocaleString('ko-KR') + '</span>' +
          '</span>';
        }).join('')
      : '';

    var keywords = Array.isArray(data && data.keywords) ? data.keywords : [];
    if (!keywords.length) {
      listEl.innerHTML = '<div class="v3-sk-empty">수집된 검색 유입 키워드가 없습니다. Google은 대부분 referer 키워드를 마스킹하므로 Naver / Daum 유입이 있을 때 표시됩니다.</div>';
      return;
    }
    var rows = '<div class="v3-sk-row is-head">' +
        '<span>키워드</span>' +
        '<span>엔진</span>' +
        '<span>방문수</span>' +
      '</div>';
    rows += keywords.map(function (k) {
      var q = encodeURIComponent(k.keyword);
      return '<div class="v3-sk-row">' +
        '<span class="v3-sk-keyword"><a href="/search?q=' + q + '" target="_blank" rel="noopener" title="사이트 내 검색으로 열기: ' + GW.escapeHtml(k.keyword) + '">' + GW.escapeHtml(k.keyword) + '</a></span>' +
        '<span class="v3-sk-engine">' + GW.escapeHtml(k.engine || '') + '</span>' +
        '<span class="v3-sk-visits">' + Number(k.visits || 0).toLocaleString('ko-KR') + '</span>' +
      '</div>';
    }).join('');
    listEl.innerHTML = rows;
  }

  var _tagInsightsCache = null;

  function _loadAnalyticsTags() {
    var bodyEl = document.getElementById('analytics-tags-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>태그 인사이트 분석 중…</div>';
    // /api/admin/tag-insights — functions/_shared/tag-insights.js 모듈 사용.
    // 전면 개편: §1 통계 / §2 관계도 / §3 건강성 / §4 커버리지 / §5 제안 다섯 섹션 렌더.
    var allFlag = _analyticsTagPeriodState.days ? '0' : '1';
    var qs = _periodQuery(_analyticsTagPeriodState);
    _apiFetch('/api/admin/tag-insights?' + qs + '&all=' + allFlag).then(function (data) {
      _tagInsightsCache = data;
      bodyEl.innerHTML = _renderTagInsightsSections(data);
      _mountTagInsightsGraph(data);
    }).catch(function (e) {
      bodyEl.innerHTML = '<div class="v3-card"><div class="v3-empty"><div class="v3-empty-text">태그 인사이트를 불러오지 못했습니다: ' + GW.escapeHtml(e.message || '') + '</div></div></div>';
      _analyticsTagGraphState = null;
    });
  }

  function _renderTagInsightsSections(data) {
    if (!data) return '';
    // 순서: 관계도(가장 중요한 시각) → 통계 → 건강성 → 커버리지 → 제안
    return [
      _renderTiGraph(data),
      _renderTiStatistics(data),
      _renderTiHealth(data),
      _renderTiCoverage(data),
      _renderTiSuggestions(data),
    ].join('');
  }

  function _renderTiStatistics(data) {
    var s = data.statistics || {};
    var catRows = (s.category_avg || []).map(function (r) {
      return '<tr><td><span class="v3-badge v3-badge-gray">' + GW.escapeHtml(r.category) + '</span></td><td>' +
        r.posts + '</td><td>' + r.with_meta + '</td><td>' + (r.avg_meta || 0).toFixed(2) + '</td></tr>';
    }).join('');
    var top20 = (data.meta_ranking || []).slice(0, 20);
    var bottom10 = (data.meta_ranking || []).slice(-10).reverse();
    var metaTopRows = top20.map(function (m, i) {
      return '<tr><td>' + (i + 1) + '</td><td><code class="v3-inline-code">' + GW.escapeHtml(m.tag) + '</code></td><td>' + m.count + '</td></tr>';
    }).join('');
    var metaBottomRows = bottom10.map(function (m) {
      return '<tr><td><code class="v3-inline-code">' + GW.escapeHtml(m.tag) + '</code></td><td>' + m.count + '</td></tr>';
    }).join('');
    var headerTop = (data.header_ranking || []).slice(0, 10).map(function (h) {
      var pct = ((h.pct || 0) * 100).toFixed(1);
      return '<tr><td><code class="v3-inline-code">' + GW.escapeHtml(h.tag) + '</code></td><td>' + h.count + '</td><td>' + pct + '%</td></tr>';
    }).join('');
    return '<section class="v3-card v3-ti-section-gap">' +
      '<div class="v3-card-head"><h2 class="v3-card-title">기초 통계</h2></div>' +
      '<div class="v3-stats-grid">' +
        '<div class="v3-stat"><div class="v3-stat-label">전체 기사</div><div class="v3-stat-value">' + _fmt(s.total_posts || 0) + '</div><div class="v3-stat-sub">published=1</div></div>' +
        '<div class="v3-stat"><div class="v3-stat-label">고유 글머리 태그</div><div class="v3-stat-value">' + _fmt(s.unique_header_tags || 0) + '</div><div class="v3-stat-sub">tag 필드</div></div>' +
        '<div class="v3-stat"><div class="v3-stat-label">고유 메타 태그</div><div class="v3-stat-value">' + _fmt(s.unique_meta_tags || 0) + '</div><div class="v3-stat-sub">meta_tags 필드</div></div>' +
        '<div class="v3-stat"><div class="v3-stat-label">평균 메타 태그/기사</div><div class="v3-stat-value">' + (s.avg_meta_per_post || 0).toFixed(2) + '</div><div class="v3-stat-sub">메타 있는 기사 기준</div></div>' +
      '</div>' +
      '<div class="v3-ti-grid v3-mt-16">' +
        '<div><h3 class="v3-ti-subtitle">글머리 태그 상위 10</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>태그</th><th>기사</th><th>%</th></tr></thead><tbody>' + headerTop + '</tbody></table>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'header\')">전체 ' + (data.header_ranking || []).length + '개 보기</button>' +
        '</div>' +
        '<div><h3 class="v3-ti-subtitle">category별 평균 메타 태그</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>category</th><th>기사</th><th>메타 있음</th><th>평균</th></tr></thead><tbody>' + catRows + '</tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="v3-ti-grid v3-mt-16">' +
        '<div><h3 class="v3-ti-subtitle">메타 태그 상위 20</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>#</th><th>태그</th><th>기사</th></tr></thead><tbody>' + metaTopRows + '</tbody></table>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'meta\')">전체 ' + (data.meta_ranking || []).length + '개 보기</button>' +
        '</div>' +
        '<div><h3 class="v3-ti-subtitle">메타 태그 하위 10 (고립 맛보기)</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>태그</th><th>기사</th></tr></thead><tbody>' + metaBottomRows + '</tbody></table>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'isolated\')">1회 등장 전체 ' + (data.health ? data.health.isolated_tags_count : 0) + '개</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function _renderTiGraph(data) {
    var g = data.graph || { nodes: [], links: [] };
    var topN = Math.min(80, (g.nodes || []).length);
    var linkCount = Math.min(200, (g.links || []).length);
    return '<section class="v3-card">' +
      '<div class="v3-card-head"><h2 class="v3-card-title">태그 관계도</h2><p class="v3-card-desc">노드 크기 = 등장 빈도, 연결선 굵기 = 공출현, 색 = 우세 글머리 태그. 태그를 검색하거나 노드를 클릭하면 관련 기사 목록이 열립니다.</p></div>' +
      '<div class="v3-ti-graph-search">' +
        '<svg class="v3-ti-graph-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><line x1="12" y1="12" x2="15" y2="15"/></svg>' +
        '<input class="v3-ti-graph-search-input" type="search" id="v3-ti-graph-search" placeholder="태그 검색 (예: 스카우트, 잼버리, SDGs)" autocomplete="off" />' +
        '<button class="v3-ti-graph-search-clear" type="button" id="v3-ti-graph-search-clear" hidden>지우기</button>' +
        '<span class="v3-ti-graph-search-meta" id="v3-ti-graph-search-meta"></span>' +
      '</div>' +
      '<div class="v3-inline-meta">상위 노드 ' + topN + '개 · 링크 ' + linkCount + '개</div>' +
      '<div class="v3-ti-graph-stage">' +
        '<svg class="v3-ti-graph-svg" id="analytics-tag-graph" viewBox="0 0 1280 720" role="img" aria-label="태그 관계도"></svg>' +
        '<div class="v3-ti-graph-zoom-ctrl">' +
          '<button class="v3-ti-graph-zoom-btn" type="button" id="v3-ti-graph-zoom-in" title="확대">＋</button>' +
          '<button class="v3-ti-graph-zoom-btn" type="button" id="v3-ti-graph-zoom-out" title="축소">－</button>' +
        '</div>' +
        '<div class="v3-ti-graph-hint">' +
          '<span>마우스 휠 · 핀치: 확대/축소</span>' +
          '<span>빈 공간 드래그: 화면 이동</span>' +
          '<span>노드 드래그: 재배치 · 클릭: 기사 목록</span>' +
          '<span>굵은 선 = 강한 연결 · 점선 = 약한 연결</span>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" type="button" id="v3-ti-graph-reset">원위치</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function _renderTiHealth(data) {
    var h = data.health || {};
    var isolatedPreview = (h.isolated_tags || []).slice(0, 20).map(function (t) {
      return '<code class="v3-inline-code">' + GW.escapeHtml(t) + '</code>';
    }).join(' ');
    var oc = (h.overly_common || []).map(function (r) {
      return '<tr><td><code class="v3-inline-code">' + GW.escapeHtml(r.tag) + '</code></td><td>' + r.count + '</td><td>' + ((r.pct || 0) * 100).toFixed(1) + '%</td><td><span class="v3-badge v3-badge-yellow">세분화 검토</span></td></tr>';
    }).join('');
    var dup = (h.duplicate_suspects || []).slice(0, 15).map(function (d) {
      return '<tr><td><code class="v3-inline-code">' + GW.escapeHtml(d.left) + '</code></td><td><code class="v3-inline-code">' + GW.escapeHtml(d.right) + '</code></td><td>' + d.left_count + ' / ' + d.right_count + '</td><td>' + GW.escapeHtml(d.reasons.join(', ')) + '</td><td><span class="v3-badge v3-badge-gray">사람 판단</span></td></tr>';
    }).join('');
    var clusters = (h.isolated_clusters || []).slice(0, 10).map(function (c) {
      var members = c.members.map(function (t) { return '<code class="v3-inline-code">' + GW.escapeHtml(t) + '</code>'; }).join(' · ');
      return '<tr><td>' + c.size + '</td><td>' + members + '</td><td>' + c.total_articles + '</td></tr>';
    }).join('');
    return '<section class="v3-card v3-ti-section-gap">' +
      '<div class="v3-card-head"><h2 class="v3-card-title">태그 체계 건강성 진단</h2><p class="v3-card-desc">자동 통합/삭제 금지. 모든 항목 <strong>사람 검토 필요</strong>.</p></div>' +
      '<div class="v3-ti-subsection"><h3 class="v3-ti-subtitle">1. 1회만 등장한 고립 태그 <span class="v3-text-m">(' + (h.isolated_tags_count || 0) + '개)</span></h3>' +
        '<div class="v3-ti-chip-list">' + (isolatedPreview || '<span class="v3-text-m">없음</span>') + '</div>' +
        (h.isolated_tags && h.isolated_tags.length > 20 ? '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'isolated\')">전체 ' + h.isolated_tags.length + '개 보기</button>' : '') +
        '</div>' +
      (oc ? '<div class="v3-ti-subsection v3-mt-16"><h3 class="v3-ti-subtitle">2. 과다 등장 태그 <span class="v3-text-m">(기준 ≥' + (h.overly_common_threshold || 0) + '건)</span></h3>' +
        '<table class="v3-geo-table"><thead><tr><th>태그</th><th>기사</th><th>비율</th><th>권고</th></tr></thead><tbody>' + oc + '</tbody></table></div>' : '') +
      (dup ? '<div class="v3-ti-subsection v3-mt-16"><h3 class="v3-ti-subtitle">3. 중복 의심 태그 쌍 <span class="v3-text-m">(상위 15)</span></h3>' +
        '<table class="v3-geo-table"><thead><tr><th>A</th><th>B</th><th>A/B건수</th><th>근거</th><th>판단</th></tr></thead><tbody>' + dup + '</tbody></table>' +
        (h.duplicate_suspects && h.duplicate_suspects.length > 15 ? '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'dup\')">전체 ' + h.duplicate_suspects.length + '쌍 보기</button>' : '') +
        '</div>' : '') +
      (clusters ? '<div class="v3-ti-subsection v3-mt-16"><h3 class="v3-ti-subtitle">4. 고립 군집 <span class="v3-text-m">(2~5개 소규모)</span></h3>' +
        '<table class="v3-geo-table"><thead><tr><th>크기</th><th>구성</th><th>기사</th></tr></thead><tbody>' + clusters + '</tbody></table></div>' : '') +
    '</section>';
  }

  function _renderTiCoverage(data) {
    var c = data.coverage || {};
    var byHeader = (c.by_header || []).slice(0, 15).map(function (h) {
      var cats = (h.categories || []).map(function (x) { return x.category + ':' + x.n; }).join(' · ');
      return '<tr><td><code class="v3-inline-code">' + GW.escapeHtml(h.tag) + '</code></td><td>' + h.posts + '</td><td class="v3-text-m">' + GW.escapeHtml(cats) + '</td></tr>';
    }).join('');
    var monthly = (c.monthly || []).slice(-12).map(function (m) {
      return '<tr><td>' + GW.escapeHtml(m.month) + '</td><td>' + m.count + '</td></tr>';
    }).join('');
    var gaps = (c.gaps || []).map(function (t) {
      return '<code class="v3-inline-code">' + GW.escapeHtml(t) + '</code>';
    }).join(' ');
    return '<section class="v3-card v3-ti-section-gap">' +
      '<div class="v3-card-head"><h2 class="v3-card-title">콘텐츠 축적 현황</h2></div>' +
      '<div class="v3-ti-grid">' +
        '<div><h3 class="v3-ti-subtitle">글머리 태그별 누적 (상위 15)</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>태그</th><th>기사</th><th>category 분포</th></tr></thead><tbody>' + byHeader + '</tbody></table>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs v3-mt-8" type="button" onclick="V3._tiMore(\'coverage\')">전체 보기</button>' +
        '</div>' +
        '<div><h3 class="v3-ti-subtitle">월별 발행 추세 (최근 12개월)</h3>' +
          '<table class="v3-geo-table"><thead><tr><th>월</th><th>기사 수</th></tr></thead><tbody>' + monthly + '</tbody></table>' +
        '</div>' +
      '</div>' +
      (gaps ? '<div class="v3-ti-subsection"><h3 class="v3-ti-subtitle">전략적 보강 필요 (기사 ≤5건인 글머리 태그)</h3><div class="v3-ti-chip-list">' + gaps + '</div></div>' : '') +
    '</section>';
  }

  function _renderTiSuggestions(data) {
    var s = data.suggestions || {};
    var hubs = (s.hub_clusters || []).map(function (hub) {
      var spokes = (hub.spokes || []).slice(0, 8).map(function (sp) {
        return '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(sp.tag) + ' · ' + sp.count + '</span>';
      }).join('');
      return '<div class="v3-ti-hub-card">' +
        '<div class="v3-ti-hub-head"><strong>' + GW.escapeHtml(hub.hub) + '</strong> <span class="v3-text-m">(' + hub.hub_count + '건)</span></div>' +
        '<div class="v3-ti-hub-card-spokes">' + spokes + '</div>' +
      '</div>';
    }).join('');
    var suggestions = (s.suggestions || []).map(function (sug, i) {
      var metas = sug.meta_hint.map(function (m) { return '<code class="v3-inline-code">' + GW.escapeHtml(m) + '</code>'; }).join(' ');
      var pri = sug.priority === '상' ? 'v3-badge-red' : (sug.priority === '중' ? 'v3-badge-yellow' : 'v3-badge-gray');
      return '<tr><td>' + (i + 1) + '</td><td>' + GW.escapeHtml(sug.title_hint) + '</td><td><code class="v3-inline-code">' + GW.escapeHtml(sug.header_hint) + '</code></td><td>' + metas + '</td><td class="v3-text-m">' + GW.escapeHtml(sug.rationale) + '</td><td><span class="v3-badge ' + pri + '">' + sug.priority + '</span></td></tr>';
    }).join('');
    return '<section class="v3-card v3-ti-section-gap">' +
      '<div class="v3-card-head"><h2 class="v3-card-title">SEO/AEO 클러스터 + 신규 콘텐츠 제안</h2><p class="v3-card-desc">휴리스틱 기반. 모든 제안 <strong>사람 검토 필요</strong>.</p></div>' +
      '<h3 class="v3-ti-subtitle">허브-스포크 클러스터 후보</h3>' +
      '<div class="v3-ti-hub-grid">' + hubs + '</div>' +
      '<h3 class="v3-ti-subtitle v3-mt-16">신규 콘텐츠 제안 (상위 10)</h3>' +
      '<table class="v3-geo-table"><thead><tr><th>#</th><th>제목 힌트</th><th>글머리</th><th>메타 태그</th><th>근거</th><th>우선</th></tr></thead><tbody>' + suggestions + '</tbody></table>' +
    '</section>';
  }

  // 이전 렌더의 이벤트/상태를 전역에 저장해 재마운트 시 leak 방지
  var _tiGraphState = null;

  function _mountTagInsightsGraph(data) {
    if (!data || !data.graph) return;
    var svg = _el('analytics-tag-graph');
    if (!svg) return;
    // 기존 핸들러 해제
    if (_tiGraphState && _tiGraphState.destroy) _tiGraphState.destroy();

    // 모바일 감지: 데스크톱 상위 80·label 25, 모바일 상위 50·label 15로 축소해 가독성 확보.
    var isMobile = (typeof window !== 'undefined' && window.innerWidth && window.innerWidth < 700);
    var NODE_LIMIT = isMobile ? 50 : 80;
    var LABEL_ALWAYS = isMobile ? 15 : 25;
    var topNodes = data.graph.nodes.slice(0, NODE_LIMIT);
    var nodeIds = new Set(topNodes.map(function (n) { return n.id; }));
    var maxCount = Math.max.apply(null, topNodes.map(function (n) { return n.count || 1; }));

    var W = 1280, H = 720;
    var rand = _createSeedRng(topNodes.length + (data.graph.links || []).length);
    var nodes = topNodes.map(function (n, idx) {
      var ratio = (n.count || 1) / maxCount;
      return {
        id: n.id,
        label: n.id,
        count: n.count,
        rank: idx,                           // 0이 가장 큰 노드
        isPrimary: idx < LABEL_ALWAYS,       // 상위 N 노드만 라벨 항상 표시
        top_header: n.top_header || '',
        r: Math.max(10, Math.min(32, 10 + Math.round(ratio * 22))),
        x: 80 + rand() * (W - 160),
        y: 80 + rand() * (H - 160),
        vx: 0, vy: 0,
      };
    });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var links = (data.graph.links || [])
      .filter(function (l) { return nodeIds.has(l.source) && nodeIds.has(l.target); })
      .slice(0, 200)
      .map(function (l) { return { source: byId[l.source], target: byId[l.target], count: l.count }; });
    var maxLinkCount = links.length ? Math.max.apply(null, links.map(function (l) { return l.count; })) : 1;

    // 각 노드의 이웃 id 집합 (hover 시 강조용)
    var neighborsById = {};
    nodes.forEach(function (n) { neighborsById[n.id] = new Set(); });
    links.forEach(function (l) {
      neighborsById[l.source.id].add(l.target.id);
      neighborsById[l.target.id].add(l.source.id);
    });

    // Force simulation — 라벨 bounding box 고려한 반발 (긴 한글 라벨 가로로 겹치지 않게).
    var ITERS = 500;
    for (var iter = 0; iter < ITERS; iter++) {
      var alpha = 1 - (iter / ITERS);
      // repulsion (모든 쌍)
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 1) d2 = 1;
          var d = Math.sqrt(d2);
          // primary 노드끼리는 더 강하게 반발 (라벨 공간 확보)
          var bothPrimary = a.isPrimary && b.isPrimary;
          var force = (bothPrimary ? 4200 : 2800) / d2;
          var fx = (dx / d) * force * alpha;
          var fy = (dy / d) * force * alpha;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      // attraction (link spring)
      for (var k = 0; k < links.length; k++) {
        var lnk = links[k];
        var s = lnk.source, t = lnk.target;
        var dx2 = t.x - s.x, dy2 = t.y - s.y;
        var d = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
        var desired = 130;  // 이상적 링크 길이 확장
        var weightBoost = 1 + (lnk.count / maxLinkCount) * 1.8;
        var spring = (d - desired) * 0.012 * weightBoost * alpha;
        var fx = (dx2 / d) * spring;
        var fy = (dy2 / d) * spring;
        s.vx += fx; s.vy += fy;
        t.vx -= fx; t.vy -= fy;
      }
      // center gravity
      for (var n = 0; n < nodes.length; n++) {
        var nd = nodes[n];
        nd.vx += (W / 2 - nd.x) * 0.001 * alpha;
        nd.vy += (H / 2 - nd.y) * 0.001 * alpha;
        nd.vx *= 0.75;
        nd.vy *= 0.75;
        nd.x += nd.vx;
        nd.y += nd.vy;
        nd.x = Math.max(nd.r + 60, Math.min(W - nd.r - 60, nd.x));
        nd.y = Math.max(nd.r + 24, Math.min(H - nd.r - 24, nd.y));
      }
    }

    // 글머리 태그별 색상 매핑 — KMS 브랜드 10색 (css/admin-v3.css :root --gw-* 토큰과 동일 값).
    // SVG fill은 CSS var()를 해석 못 해 hex 문자열 유지 (§3.10 Leaflet 팔레트 동일 예외).
    var PALETTE = [
      '#622599', // scouting-purple
      '#4d006e', // midnight-purple
      '#248737', // forest-green
      '#0094b4', // ocean-blue
      '#ff5655', // fire-red
      '#ff8dff', // blossom-pink (site 기준)
      '#ffae80', // ember-orange
      '#82e6de', // river-blue
      '#9fed8f', // leaf-green
      '#3f3f3f', // gray-700 fallback (11번째 이상은 반복 시 회색으로)
    ];
    var headerList = Array.from(new Set(nodes.map(function (n) { return n.top_header || '(없음)'; })));
    var colorMap = {};
    headerList.forEach(function (h, i) { colorMap[h] = PALETTE[i % PALETTE.length]; });

    // 선 색상: 연결 강도(count/maxLinkCount) 기반 흑백 연속 그라데이션.
    // 약한 연결 = 밝은 회색(--gray-300 #c4c4c4), 강한 연결 = --ink(#1f1f1f) 검정 근사.
    // 비선형(power 0.55)으로 중간 연결이 회색에 치우치지 않게 대비 강조.
    function linkStroke(count) {
      var r = Math.max(0, Math.min(1, count / maxLinkCount));
      var v = Math.round(196 - (196 - 31) * Math.pow(r, 0.55));
      return 'rgb(' + v + ',' + v + ',' + v + ')';
    }
    function linkOpacity(count) {
      var r = Math.max(0, Math.min(1, count / maxLinkCount));
      return (0.35 + Math.pow(r, 0.55) * 0.45).toFixed(2); // 0.35 ~ 0.80
    }

    // ── SVG 마크업 ──
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var world = document.createElementNS(NS, 'g');
    world.setAttribute('class', 'v3-ti-graph-world');
    svg.appendChild(world);
    var linksG = document.createElementNS(NS, 'g');
    linksG.setAttribute('class', 'v3-ti-graph-links');
    world.appendChild(linksG);
    var nodesG = document.createElementNS(NS, 'g');
    nodesG.setAttribute('class', 'v3-ti-graph-nodes');
    world.appendChild(nodesG);

    // 링크 tier — count 기준 3단계 + 약한 연결(가장 낮은 tier)은 점선 표시.
    //   strong: 최상위 30% → 굵고 선명
    //   medium: 중간 ~ 최하위 15% 위까지 → 기본 선 굵기
    //   weak:   최하위 15% (또는 count=1) → 얇은 점선
    var sortedCounts = links.map(function (l) { return l.count; }).sort(function (a, b) { return a - b; });
    function percentile(arr, p) { if (!arr.length) return 0; var idx = Math.floor(arr.length * p); return arr[Math.min(arr.length - 1, idx)]; }
    var weakCutoff = Math.max(1, percentile(sortedCounts, 0.15));
    var strongCutoff = Math.max(2, percentile(sortedCounts, 0.70));
    function classifyLink(count) {
      if (count <= weakCutoff) return 'weak';
      if (count >= strongCutoff) return 'strong';
      return 'medium';
    }
    // 굵기 곡선: 약한 건 더 얇게, 강한 건 훨씬 굵게 (비선형 강조).
    function linkWidth(count) {
      var r = count / maxLinkCount;
      return (0.6 + Math.pow(r, 0.55) * 5).toFixed(2); // 0.6 ~ 5.6
    }

    var linkEls = links.map(function (l) {
      var tier = classifyLink(l.count);
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', l.source.x.toFixed(1));
      line.setAttribute('y1', l.source.y.toFixed(1));
      line.setAttribute('x2', l.target.x.toFixed(1));
      line.setAttribute('y2', l.target.y.toFixed(1));
      line.setAttribute('stroke-width', linkWidth(l.count));
      // inline style로 stroke/opacity 세팅 — CSS class(hover focus 등)가 !important로 덮어쓸 수 있도록.
      line.style.stroke = linkStroke(l.count);
      line.style.strokeOpacity = linkOpacity(l.count);
      line.setAttribute('class', 'v3-ti-graph-link');
      if (tier === 'weak') {
        line.setAttribute('stroke-dasharray', '4 3');  // 가장 약한 연결만 점선.
      }
      linksG.appendChild(line);
      return { line: line, source: l.source, target: l.target, tier: tier };
    });

    // 노드 DOM — 라벨은 halo(흰 stroke)로 가독성 확보. primary/secondary 티어 분리.
    var nodeEls = nodes.map(function (n) {
      var color = colorMap[n.top_header || '(없음)'];
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'v3-ti-graph-node' + (n.isPrimary ? ' is-primary' : ' is-secondary'));
      g.setAttribute('data-node-id', n.id);
      g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', String(n.r));
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.88');
      circle.setAttribute('class', 'v3-ti-graph-node-circle');
      var title = document.createElementNS(NS, 'title');
      title.textContent = n.label + ' · ' + n.count + '건 · 우세 글머리: ' + (n.top_header || '(없음)');
      circle.appendChild(title);
      g.appendChild(circle);
      // primary 노드는 글자 더 크게 + 굵게
      var text = document.createElementNS(NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', String(n.r + 14));
      text.setAttribute('class', 'v3-ti-graph-label');
      if (n.isPrimary) text.setAttribute('data-primary', '1');
      text.textContent = n.label;
      g.appendChild(text);
      nodesG.appendChild(g);
      return { g: g, text: text, node: n };
    });
    var nodeElById = {};
    nodeEls.forEach(function (entry) { nodeElById[entry.node.id] = entry; });

    // ── Focus 관리: hover는 일시적, search spotlight는 지속적. hover가 search를 일시 덮어씀. ──
    var spotlightIds = null;  // Set<string> | null

    function applyFocus(focusSet) {
      // focusSet === null → 모든 강조 해제
      if (!focusSet || !focusSet.size) {
        nodesG.classList.remove('is-focusing');
        nodeEls.forEach(function (e) { e.g.classList.remove('is-focused', 'is-neighbor', 'is-dimmed'); });
        linkEls.forEach(function (le) { le.line.classList.remove('is-focused', 'is-dimmed'); });
        return;
      }
      nodesG.classList.add('is-focusing');
      // 포커스 = matched nodes + 그 이웃
      var neighborsSet = new Set();
      focusSet.forEach(function (id) {
        var nbrs = neighborsById[id];
        if (nbrs) nbrs.forEach(function (x) { neighborsSet.add(x); });
      });
      nodeEls.forEach(function (e) {
        e.g.classList.remove('is-focused', 'is-neighbor', 'is-dimmed');
        if (focusSet.has(e.node.id)) e.g.classList.add('is-focused');
        else if (neighborsSet.has(e.node.id)) e.g.classList.add('is-neighbor');
        else e.g.classList.add('is-dimmed');
      });
      linkEls.forEach(function (le) {
        le.line.classList.remove('is-focused', 'is-dimmed');
        if (focusSet.has(le.source.id) || focusSet.has(le.target.id)) le.line.classList.add('is-focused');
        else le.line.classList.add('is-dimmed');
      });
    }

    function setHoverFocus(focusId) {
      if (!focusId) {
        // hover 떠나면 spotlight 상태로 복귀 (있으면).
        applyFocus(spotlightIds);
      } else {
        var s = new Set(); s.add(focusId);
        applyFocus(s);
      }
    }

    function setSearchSpotlight(query) {
      var q = String(query || '').trim().toLowerCase();
      var metaEl = _el('v3-ti-graph-search-meta');
      var clearBtn = _el('v3-ti-graph-search-clear');
      if (!q) {
        spotlightIds = null;
        applyFocus(null);
        if (metaEl) metaEl.textContent = '';
        if (clearBtn) clearBtn.hidden = true;
        return;
      }
      // 부분 일치 (case-insensitive)
      var matched = new Set();
      nodes.forEach(function (n) {
        if (String(n.id).toLowerCase().indexOf(q) >= 0) matched.add(n.id);
      });
      if (!matched.size) {
        spotlightIds = null;
        applyFocus(null);
        if (metaEl) metaEl.textContent = '"' + query + '" 일치 노드 없음';
        if (clearBtn) clearBtn.hidden = false;
        return;
      }
      spotlightIds = matched;
      applyFocus(matched);
      if (metaEl) metaEl.textContent = matched.size + '개 태그 강조됨';
      if (clearBtn) clearBtn.hidden = false;
    }

    // 노드 hover/leave
    nodeEls.forEach(function (entry) {
      entry.g.addEventListener('pointerenter', function () {
        if (drag && drag.moved) return;
        setHoverFocus(entry.node.id);
      });
      entry.g.addEventListener('pointerleave', function () {
        if (drag && drag.moved) return;
        setHoverFocus(null);
      });
    });

    // ── Zoom + Pan + Node Drag ──
    var zoom = { k: 1, x: 0, y: 0 };
    function applyTransform() {
      world.setAttribute('transform', 'translate(' + zoom.x + ',' + zoom.y + ') scale(' + zoom.k + ')');
    }
    applyTransform();

    // 스크린 좌표 → SVG 좌표 변환 (viewBox 기준)
    function svgPoint(clientX, clientY) {
      var pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      var ctm = svg.getScreenCTM();
      if (!ctm) return { x: clientX, y: clientY };
      var loc = pt.matrixTransform(ctm.inverse());
      return { x: loc.x, y: loc.y };
    }

    // --- Wheel zoom (RAF 스로틀 — Windows 3이벤트/틱 대응) ---
    var _wRaf = 0, _wDir = 0, _wPt = null;
    function onWheel(ev) {
      ev.preventDefault();
      _wDir += ev.deltaY > 0 ? 1 : -1;
      _wPt = svgPoint(ev.clientX, ev.clientY);
      if (_wRaf) return;
      _wRaf = requestAnimationFrame(function () {
        _wRaf = 0;
        var d = _wDir; _wDir = 0;
        var pt = _wPt; _wPt = null;
        if (!d || !pt) return;
        var factor = d < 0 ? 1.15 : (1 / 1.15);
        var newK = Math.max(0.25, Math.min(4, zoom.k * factor));
        var wx = (pt.x - zoom.x) / zoom.k;
        var wy = (pt.y - zoom.y) / zoom.k;
        zoom.x = pt.x - wx * newK;
        zoom.y = pt.y - wy * newK;
        zoom.k = newK;
        applyTransform();
      });
    }
    svg.addEventListener('wheel', onWheel, { passive: false });

    // --- Pan / Node drag / Pinch zoom (Pointer Events, 모바일 터치 지원) ---
    var pan = null;
    var drag = null;
    var pointers = new Map();       // pointerId → {clientX, clientY}
    var pinch = null;               // {d0, k0, cx0, cy0}
    function pointerDist() {
      var arr = [];
      pointers.forEach(function (p) { arr.push(p); });
      if (arr.length < 2) return 0;
      var dx = arr[0].clientX - arr[1].clientX;
      var dy = arr[0].clientY - arr[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function pointerMidpoint() {
      var arr = [];
      pointers.forEach(function (p) { arr.push(p); });
      if (arr.length < 2) return { x: 0, y: 0 };
      return { x: (arr[0].clientX + arr[1].clientX) / 2, y: (arr[0].clientY + arr[1].clientY) / 2 };
    }
    function onPointerDown(ev) {
      pointers.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });
      if (pointers.size >= 2) {
        // pinch 시작 — 기존 pan/drag 중지.
        if (drag) { drag.entry.g.classList.remove('is-dragging'); drag = null; }
        if (pan) { svg.classList.remove('is-panning'); pan = null; }
        var mid = pointerMidpoint();
        var local = svgPoint(mid.x, mid.y);
        pinch = {
          d0: pointerDist(),
          k0: zoom.k,
          localAtStart: local,
          worldAtStart: { x: (local.x - zoom.x) / zoom.k, y: (local.y - zoom.y) / zoom.k },
        };
        return;
      }
      var nodeG = ev.target.closest ? ev.target.closest('[data-node-id]') : null;
      if (nodeG) {
        var entry = nodeElById[nodeG.getAttribute('data-node-id')];
        if (entry) {
          drag = {
            entry: entry,
            start: svgPoint(ev.clientX, ev.clientY),
            startClient: { x: ev.clientX, y: ev.clientY },
            orig: { x: entry.node.x, y: entry.node.y },
            pointerId: ev.pointerId,
            moved: false,
          };
          nodeG.setPointerCapture && nodeG.setPointerCapture(ev.pointerId);
          ev.stopPropagation();
          return;
        }
      }
      pan = {
        start: { x: ev.clientX, y: ev.clientY },
        origin: { x: zoom.x, y: zoom.y },
        pointerId: ev.pointerId,
      };
      svg.classList.add('is-panning');
      svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    }
    function onPointerMove(ev) {
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });
      }
      if (pinch && pointers.size >= 2) {
        // 두 손가락 간 거리 변화로 zoom scale 계산. 중간점 고정.
        var curDist = pointerDist();
        if (curDist > 0 && pinch.d0 > 0) {
          var newK = Math.max(0.25, Math.min(4, pinch.k0 * (curDist / pinch.d0)));
          var mid = pointerMidpoint();
          var localMid = svgPoint(mid.x, mid.y);
          zoom.k = newK;
          zoom.x = localMid.x - pinch.worldAtStart.x * newK;
          zoom.y = localMid.y - pinch.worldAtStart.y * newK;
          applyTransform();
        }
        return;
      }
      if (drag) {
        // 클릭 vs 드래그 구분: 3px 이상 움직였으면 드래그로 확정.
        var dxScreen = ev.clientX - drag.startClient.x;
        var dyScreen = ev.clientY - drag.startClient.y;
        if (!drag.moved && (dxScreen * dxScreen + dyScreen * dyScreen) > 9) {
          drag.moved = true;
          drag.entry.g.classList.add('is-dragging');
        }
        if (!drag.moved) return;
        var cur = svgPoint(ev.clientX, ev.clientY);
        var wx = (cur.x - zoom.x) / zoom.k;
        var wy = (cur.y - zoom.y) / zoom.k;
        var sx = (drag.start.x - zoom.x) / zoom.k;
        var sy = (drag.start.y - zoom.y) / zoom.k;
        drag.entry.node.x = drag.orig.x + (wx - sx);
        drag.entry.node.y = drag.orig.y + (wy - sy);
        drag.entry.g.setAttribute('transform', 'translate(' + drag.entry.node.x.toFixed(1) + ',' + drag.entry.node.y.toFixed(1) + ')');
        linkEls.forEach(function (le) {
          if (le.source === drag.entry.node) {
            le.line.setAttribute('x1', drag.entry.node.x.toFixed(1));
            le.line.setAttribute('y1', drag.entry.node.y.toFixed(1));
          }
          if (le.target === drag.entry.node) {
            le.line.setAttribute('x2', drag.entry.node.x.toFixed(1));
            le.line.setAttribute('y2', drag.entry.node.y.toFixed(1));
          }
        });
      } else if (pan) {
        var dx = ev.clientX - pan.start.x;
        var dy = ev.clientY - pan.start.y;
        zoom.x = pan.origin.x + dx;
        zoom.y = pan.origin.y + dy;
        applyTransform();
      }
    }
    function onPointerUp(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2 && pinch) { pinch = null; }
      if (drag && (!ev || ev.pointerId === drag.pointerId)) {
        // 움직이지 않았으면 click으로 간주 → 기사 목록 모달 오픈.
        if (!drag.moved) {
          var tag = drag.entry.node.id;
          setTimeout(function () { _tiOpenArticlesModal(tag); }, 0);
        } else {
          drag.entry.g.classList.remove('is-dragging');
        }
        drag = null;
      }
      if (pan && (!ev || ev.pointerId === pan.pointerId)) {
        svg.classList.remove('is-panning');
        pan = null;
      }
    }
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('pointerleave', onPointerUp);

    // --- 원위치 / 확대·축소 버튼 ---
    var resetBtn = document.getElementById('v3-ti-graph-reset');
    function onReset() {
      zoom = { k: 1, x: 0, y: 0 };
      applyTransform();
    }
    if (resetBtn) resetBtn.addEventListener('click', onReset);

    function zoomAtCenter(factor) {
      var cx = 640, cy = 360;
      var newK = Math.max(0.25, Math.min(4, zoom.k * factor));
      var wx = (cx - zoom.x) / zoom.k;
      var wy = (cy - zoom.y) / zoom.k;
      zoom.x = cx - wx * newK;
      zoom.y = cy - wy * newK;
      zoom.k = newK;
      applyTransform();
    }
    var zoomInBtn = document.getElementById('v3-ti-graph-zoom-in');
    var zoomOutBtn = document.getElementById('v3-ti-graph-zoom-out');
    if (zoomInBtn)  zoomInBtn.addEventListener('click',  function () { zoomAtCenter(1.25); });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { zoomAtCenter(1 / 1.25); });

    // --- 검색 input (debounced) + clear ---
    var searchInput = _el('v3-ti-graph-search');
    var searchClear = _el('v3-ti-graph-search-clear');
    var searchTimer = null;
    function onSearchInput() {
      clearTimeout(searchTimer);
      var q = searchInput ? searchInput.value : '';
      searchTimer = setTimeout(function () { setSearchSpotlight(q); }, 180);
    }
    function onSearchClear() {
      if (searchInput) searchInput.value = '';
      setSearchSpotlight('');
    }
    if (searchInput) searchInput.addEventListener('input', onSearchInput);
    if (searchClear) searchClear.addEventListener('click', onSearchClear);

    // ── 범례 ──
    var stage = svg.parentElement;
    if (stage) {
      var existingLegend = stage.parentElement ? stage.parentElement.querySelector('.v3-ti-graph-legend') : null;
      if (existingLegend) existingLegend.remove();
      var legend = document.createElement('div');
      legend.className = 'v3-ti-graph-legend';
      var legendHtml = ['<span class="v3-ti-legend-title">우세 글머리</span>'];
      headerList.forEach(function (h) {
        legendHtml.push(
          '<span class="v3-ti-legend-item">' +
            '<span class="v3-ti-legend-dot" style="background:' + colorMap[h] + ';"></span>' +
            GW.escapeHtml(h) +
          '</span>'
        );
      });
      legend.innerHTML = legendHtml.join('');
      if (stage.parentElement) stage.parentElement.appendChild(legend);
    }

    // teardown 등록
    _tiGraphState = {
      destroy: function () {
        svg.removeEventListener('wheel', onWheel);
        svg.removeEventListener('pointerdown', onPointerDown);
        svg.removeEventListener('pointermove', onPointerMove);
        svg.removeEventListener('pointerup', onPointerUp);
        svg.removeEventListener('pointercancel', onPointerUp);
        svg.removeEventListener('pointerleave', onPointerUp);
        if (resetBtn) resetBtn.removeEventListener('click', onReset);
        if (searchInput) searchInput.removeEventListener('input', onSearchInput);
        if (searchClear) searchClear.removeEventListener('click', onSearchClear);
        clearTimeout(searchTimer);
      },
    };
  }

  // 시드 랜덤 — 노드 수/링크 수에 따라 다른 초기 배치 (같은 데이터면 같은 결과, 재현 가능)
  function _createSeedRng(seed) {
    var s = (seed || 1) * 2654435761 >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  // 더보기 모달 (페이지네이션) — 다양한 목록 공유
  V3._tiMore = function (which) {
    if (!_tagInsightsCache) return;
    var d = _tagInsightsCache;
    var title = '', rows = [], headerRow = '';
    if (which === 'header') {
      title = '글머리 태그 전체 (' + (d.header_ranking || []).length + '개)';
      headerRow = '<tr><th>순위</th><th>태그</th><th>기사</th><th>비율</th></tr>';
      rows = (d.header_ranking || []).map(function (h, i) { return [i + 1, h.tag, h.count, ((h.pct || 0) * 100).toFixed(1) + '%']; });
    } else if (which === 'meta') {
      title = '메타 태그 전체 (' + (d.meta_ranking || []).length + '개)';
      headerRow = '<tr><th>순위</th><th>태그</th><th>기사</th><th>주요 글머리</th></tr>';
      rows = (d.meta_ranking || []).map(function (m, i) { return [i + 1, m.tag, m.count, m.top_header || '—']; });
    } else if (which === 'isolated') {
      title = '1회만 등장한 고립 태그 (' + (d.health ? d.health.isolated_tags_count : 0) + '개)';
      headerRow = '<tr><th>#</th><th>태그</th></tr>';
      rows = (d.health && d.health.isolated_tags ? d.health.isolated_tags : []).map(function (t, i) { return [i + 1, t]; });
    } else if (which === 'dup') {
      title = '중복 의심 태그 쌍 (' + (d.health && d.health.duplicate_suspects ? d.health.duplicate_suspects.length : 0) + '쌍)';
      headerRow = '<tr><th>#</th><th>A</th><th>B</th><th>A/B건수</th><th>근거</th></tr>';
      rows = (d.health && d.health.duplicate_suspects ? d.health.duplicate_suspects : []).map(function (p, i) {
        return [i + 1, p.left, p.right, p.left_count + ' / ' + p.right_count, p.reasons.join(', ')];
      });
    } else if (which === 'coverage') {
      title = '글머리 태그별 축적 현황 (' + (d.coverage && d.coverage.by_header ? d.coverage.by_header.length : 0) + '개)';
      headerRow = '<tr><th>#</th><th>태그</th><th>기사</th><th>category 분포</th></tr>';
      rows = (d.coverage && d.coverage.by_header ? d.coverage.by_header : []).map(function (h, i) {
        var cats = (h.categories || []).map(function (x) { return x.category + ':' + x.n; }).join(' · ');
        return [i + 1, h.tag, h.posts, cats];
      });
    } else return;
    _tiOpenModal(title, headerRow, rows);
  };

  function _tiOpenModal(title, headerRow, rows) {
    var page = 0;
    var PAGE_SIZE = 30;
    var overlay = document.createElement('div');
    overlay.className = 'v3-ti-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10010;display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML =
      '<div class="v3-modal-panel" style="background:var(--v3-surface);border-radius:14px;max-width:820px;width:100%;max-height:90vh;display:flex;flex-direction:column;">' +
        '<div class="v3-modal-head" style="padding:var(--v3-gap-lg) var(--gap-section);border-bottom:1px solid var(--v3-border);display:flex;justify-content:space-between;align-items:center;">' +
          '<h2 class="v3-modal-title" style="margin:0;font-size:var(--fs-title);">' + GW.escapeHtml(title) + '</h2>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" type="button" id="v3-ti-modal-close">닫기</button>' +
        '</div>' +
        '<div class="v3-modal-body" style="padding:var(--gap-section);overflow-y:auto;flex:1;">' +
          '<table class="v3-geo-table"><thead>' + headerRow + '</thead><tbody id="v3-ti-modal-tbody"></tbody></table>' +
        '</div>' +
        '<div class="v3-modal-foot" style="padding:var(--gap-card) var(--gap-section);border-top:1px solid var(--v3-border);display:flex;justify-content:center;gap:var(--gap-element);align-items:center;">' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="v3-ti-prev">이전</button>' +
          '<span class="v3-text-m" id="v3-ti-page">1 / 1</span>' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="v3-ti-next">다음</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    function render() {
      var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      var start = page * PAGE_SIZE;
      var chunk = rows.slice(start, start + PAGE_SIZE);
      overlay.querySelector('#v3-ti-modal-tbody').innerHTML = chunk.map(function (r) {
        return '<tr>' + r.map(function (cell) {
          return '<td>' + GW.escapeHtml(String(cell == null ? '' : cell)) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      overlay.querySelector('#v3-ti-page').textContent = (page + 1) + ' / ' + totalPages;
      overlay.querySelector('#v3-ti-prev').disabled = page === 0;
      overlay.querySelector('#v3-ti-next').disabled = page >= totalPages - 1;
    }
    overlay.querySelector('#v3-ti-modal-close').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#v3-ti-prev').addEventListener('click', function () { if (page > 0) { page--; render(); } });
    overlay.querySelector('#v3-ti-next').addEventListener('click', function () {
      var totalPages = Math.ceil(rows.length / PAGE_SIZE);
      if (page < totalPages - 1) { page++; render(); }
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    render();
  }

  // 노드 클릭 시 호출 — 해당 태그가 포함된 기사 목록을 서버 페이지네이션으로 보여줌.
  // /api/posts?tag=TAG&page=N&limit=20&scope=admin — 기존 posts API 재사용.
  function _tiOpenArticlesModal(tag) {
    var page = 1;
    var PAGE_SIZE = 20;
    var overlay = document.createElement('div');
    overlay.className = 'v3-ti-articles-modal';
    overlay.innerHTML =
      '<div class="v3-modal-panel v3-ti-articles-panel">' +
        '<div class="v3-modal-head v3-ti-articles-head">' +
          '<div>' +
            '<h2 class="v3-modal-title">태그 · <code class="v3-inline-code">' + GW.escapeHtml(tag) + '</code></h2>' +
            '<p class="v3-text-m" id="v3-ti-articles-meta">불러오는 중…</p>' +
          '</div>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" type="button" id="v3-ti-articles-close">닫기</button>' +
        '</div>' +
        '<div class="v3-modal-body v3-ti-articles-body" id="v3-ti-articles-body">' +
          '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>' +
        '</div>' +
        '<div class="v3-modal-foot v3-ti-articles-foot">' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="v3-ti-articles-prev">이전</button>' +
          '<span class="v3-text-m" id="v3-ti-articles-page">1 / 1</span>' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="v3-ti-articles-next">다음</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function loadPage(p) {
      page = p;
      var bodyEl = overlay.querySelector('#v3-ti-articles-body');
      var metaEl = overlay.querySelector('#v3-ti-articles-meta');
      var pageEl = overlay.querySelector('#v3-ti-articles-page');
      var prevBtn = overlay.querySelector('#v3-ti-articles-prev');
      var nextBtn = overlay.querySelector('#v3-ti-articles-next');
      bodyEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
      prevBtn.disabled = true;
      nextBtn.disabled = true;

      var params = new URLSearchParams({
        tag: tag,
        page: String(p),
        limit: String(PAGE_SIZE),
        scope: 'admin',
      });
      _apiFetch('/api/posts?' + params.toString()).then(function (data) {
        var posts = (data && data.posts) || [];
        var total = (data && data.total) || 0;
        var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (metaEl) metaEl.textContent = '총 ' + total + '건 · ' + PAGE_SIZE + '개씩 · 페이지 ' + p + ' / ' + totalPages;
        if (pageEl) pageEl.textContent = p + ' / ' + totalPages;
        prevBtn.disabled = p <= 1;
        nextBtn.disabled = p >= totalPages;
        if (!posts.length) {
          bodyEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">해당 태그 기사가 없습니다.</div></div>';
          return;
        }
        bodyEl.innerHTML = '<ul class="v3-ti-articles-list">' + posts.map(function (post) {
          var publishLabel = _formatDateTimeCompact(post.publish_at || post.created_at || '');
          var isPublished = Number(post.published || 0) === 1;
          return '<li class="v3-ti-article-item">' +
            '<div class="v3-ti-article-row">' +
              '<div class="v3-ti-article-main">' +
                '<a class="v3-ti-article-title" href="https://bpmedia.net/post/' + post.id + '" target="_blank" rel="noopener noreferrer">' + GW.escapeHtml(post.title || '(제목 없음)') + '</a>' +
                (post.subtitle ? '<div class="v3-text-m v3-ti-article-sub">' + GW.escapeHtml(post.subtitle) + '</div>' : '') +
              '</div>' +
              '<div class="v3-ti-article-side">' +
                '<span class="v3-badge ' + _catBadge(post.category) + '">' + GW.escapeHtml(post.category || '') + '</span>' +
                (isPublished ? '<span class="v3-badge v3-badge-green">공개</span>' : '<span class="v3-badge v3-badge-gray">비공개</span>') +
              '</div>' +
            '</div>' +
            '<div class="v3-ti-article-meta">' +
              '<span>발행 ' + GW.escapeHtml(publishLabel) + '</span>' +
              '<span>조회 ' + _fmt(post.views || 0) + '</span>' +
              (post.tag ? '<span>글머리 <code class="v3-inline-code">' + GW.escapeHtml(post.tag) + '</code></span>' : '') +
              '<button class="v3-btn v3-btn-ghost v3-btn-xs" type="button" onclick="V3.openPostPreview(' + post.id + ')">관리자 미리보기</button>' +
            '</div>' +
          '</li>';
        }).join('') + '</ul>';
      }).catch(function (e) {
        bodyEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오지 못했습니다: ' + GW.escapeHtml(e.message || '') + '</div></div>';
      });
    }

    overlay.querySelector('#v3-ti-articles-close').addEventListener('click', close);
    overlay.querySelector('#v3-ti-articles-prev').addEventListener('click', function () {
      if (page > 1) loadPage(page - 1);
    });
    overlay.querySelector('#v3-ti-articles-next').addEventListener('click', function () { loadPage(page + 1); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    loadPage(1);
  }

  function _syncAnalyticsAutoRefresh(forceActive) {
    var onVisits = (_panel === 'analytics-visits' || _panel === 'analytics');
    var shouldRun = (typeof forceActive === 'boolean' ? forceActive : onVisits) && _analyticsAutoRefresh && !document.hidden;
    if (_analyticsAutoRefreshTimer) {
      clearInterval(_analyticsAutoRefreshTimer);
      _analyticsAutoRefreshTimer = null;
    }
    if (shouldRun) {
      _analyticsAutoRefreshTimer = window.setInterval(function () {
        if (!(_panel === 'analytics-visits' || _panel === 'analytics') || document.hidden) return;
        _loadAnalyticsVisits();
      }, 30000);
    }
    _updateAnalyticsRefreshMeta();
  }

  function _updateAnalyticsRefreshMeta(isLoading, errorMessage) {
    var el = _el('analytics-live-meta');
    if (!el) return;
    if (isLoading) {
      el.textContent = '분석 데이터를 새로 불러오는 중입니다…';
      return;
    }
    if (errorMessage) {
      el.textContent = '마지막 갱신 실패 · ' + errorMessage;
      return;
    }
    var parts = [];
    if (_analyticsLastUpdatedAt) {
      parts.push('마지막 갱신 ' + _formatAdminTimestamp(_analyticsLastUpdatedAt));
    } else {
      parts.push('아직 갱신 이력이 없습니다');
    }
    parts.push(_analyticsAutoRefresh ? '30초 자동 새로고침 켜짐' : '자동 새로고침 꺼짐');
    parts.push('카카오·페이스북은 UTM/리퍼러 기준으로 최대한 분리되지만, 앱이 정보를 넘기지 않으면 직접 방문으로 잡힐 수 있습니다.');
    el.textContent = parts.join(' · ');
  }

  function _formatAdminTimestamp(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
    return date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\.\s/g, '-').replace('.', '').trim();
  }

  function _statCard(label, value, sub) {
    return '<div class="v3-stat"><div class="v3-stat-label">' + GW.escapeHtml(label) + '</div>' +
      '<div class="v3-stat-value">' + GW.escapeHtml(String(value)) + '</div>' +
      '<div class="v3-stat-sub">' + GW.escapeHtml(sub) + '</div></div>';
  }

  function _renderAnalyticsTagCloud(tagCloud, period) {
    var items = Array.isArray(tagCloud && tagCloud.items) ? tagCloud.items : [];
    var graph = tagCloud && tagCloud.graph ? tagCloud.graph : { nodes: [], links: [], articles: [] };
    if (!items.length) {
      return '<div class="v3-card v3-mt-16"><div class="v3-card-head"><div><h2 class="v3-card-title">태그 워드 클라우드</h2><p class="v3-card-desc">최근 ' + GW.escapeHtml(String(period || 30)) + '일 기준으로 사용된 태그와 메타 태그입니다.</p></div></div><div class="v3-empty"><div class="v3-empty-text">선택한 기간에 사용된 태그가 없습니다.</div></div></div>';
    }
    var maxScore = Math.max.apply(null, items.map(function (item) { return Number(item.weighted_score || 0); }));
    var chips = items.slice(0, 40).map(function (item) {
      var count = Number(item.count || 0);
      var pageviews = Number(item.pageviews || 0);
      var ratio = maxScore > 0 ? (Number(item.weighted_score || 0) / maxScore) : 0;
      var size = Math.round(14 + ratio * 22);
      var opacity = (0.62 + ratio * 0.38).toFixed(2);
      var categories = Array.isArray(item.categories) ? item.categories.join(', ') : '';
      var title = item.tag + ' · 기사 ' + count + '개 · 조회 ' + _fmt(pageviews) + (categories ? ' · ' + categories : '');
      var selected = _analyticsSelectedTagId === ('tag:' + item.tag) ? ' is-selected' : '';
      return '<button class="v3-tag-cloud-chip' + selected + '" type="button" data-tag-select="' + GW.escapeHtml('tag:' + item.tag) + '" style="font-size:' + size + 'px;opacity:' + opacity + ';" title="' + GW.escapeHtml(title) + '">' +
        '<span class="v3-tag-cloud-label">' + GW.escapeHtml(item.tag) + '</span>' +
        '<span class="v3-tag-cloud-count">기사 ' + _fmt(count) + ' · 조회 ' + _fmt(pageviews) + '</span>' +
      '</button>';
    }).join('');

    var rows = items.slice(0, 15).map(function (item) {
      return '<tr>' +
        '<td><strong>' + GW.escapeHtml(item.tag) + '</strong></td>' +
        '<td>' + _fmt(item.count || 0) + '</td>' +
        '<td>' + _fmt(item.pageviews || 0) + '</td>' +
        '<td>' + _fmt(item.published_count || 0) + '</td>' +
        '<td>' + _fmt(item.draft_count || 0) + '</td>' +
        '<td>' + GW.escapeHtml((item.categories || []).join(', ') || '—') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="v3-card v3-mt-16">' +
      '<div class="v3-card-head"><div>' +
        '<h2 class="v3-card-title">태그 워드 클라우드</h2>' +
        '<p class="v3-card-desc">최근 ' + GW.escapeHtml(String(period || 30)) + '일 기준으로 사용된 태그와 메타 태그입니다. 크기는 기사 수와 관련 기사 조회수를 함께 반영합니다.</p>' +
      '</div></div>' +
      '<div class="v3-inline-meta">고유 키워드 ' + _fmt(tagCloud.total_unique_tags || items.length) + '개 · 키워드 부여 ' + _fmt(tagCloud.total_tag_assignments || 0) + '회</div>' +
      '<div class="v3-tag-cloud">' + chips + '</div>' +
      _renderAnalyticsTagGraph(graph, period) +
      '<div class="v3-geo-table-wrap v3-mt-16"><table class="v3-geo-table"><thead><tr>' +
        '<th>키워드</th><th>기사 수</th><th>조회</th><th>공개</th><th>비공개</th><th>카테고리</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function _renderAnalyticsTagGraph(graph, period) {
    var nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
    if (!nodes.length) return '';
    return '<div class="v3-tag-graph-wrap v3-mt-16">' +
      '<div class="v3-card-head" style="padding:0 0 10px 0;"><div>' +
        '<h3 class="v3-card-title">태그 관계도</h3>' +
        '<p class="v3-card-desc">태그와 메타 태그를 함께 그래프로 보여줍니다. 연결선은 기본적으로 보이고, hover 또는 선택 시 관련 관계가 더 선명해집니다.</p>' +
      '</div><div class="v3-tag-graph-controls">' +
        '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="analytics-tag-zoom-out">축소</button>' +
        '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="analytics-tag-zoom-reset">100%</button>' +
        '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" id="analytics-tag-zoom-in">확대</button>' +
      '</div></div>' +
      '<div class="v3-inline-meta">키워드는 드래그로 이동할 수 있고, 휠로 확대/축소할 수 있습니다. 키워드를 클릭하면 선택 상태가 유지되고 관련 기사 모달이 열리며, 빈 공간을 클릭하면 선택이 해제됩니다.</div>' +
      '<div class="v3-tag-graph-stage">' +
        '<svg class="v3-tag-graph" id="analytics-tag-graph" viewBox="0 0 960 520" role="img" aria-label="태그 관계도"></svg>' +
      '</div>' +
      '<div class="v3-tag-graph-meta" id="analytics-tag-graph-meta">연결선은 항상 보이며, 선택된 키워드는 다른 곳을 클릭하기 전까지 유지됩니다. 키워드 선택 결과는 모달에서 확인할 수 있습니다.</div>' +
    '</div>';
  }

  function _mountAnalyticsTagGraph(graph) {
    var svg = _el('analytics-tag-graph');
    var meta = _el('analytics-tag-graph-meta');
    if (!svg || !graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
      _analyticsTagGraphState = null;
      if (meta) meta.textContent = '표시할 태그 관계 데이터가 없습니다.';
      _closeAnalyticsTagModal();
      return;
    }
    var width = 960;
    var height = 520;
    var nextState = {
      width: width,
      height: height,
      scale: 1,
      hoveredNodeId: '',
      hoveredLinkId: '',
      dragNodeId: '',
      dragPointerId: null,
      dragMoved: false,
      dragStartClientX: 0,
      dragStartClientY: 0,
      nodes: [],
      links: [],
      articles: Array.isArray(graph.articles) ? graph.articles.slice() : []
    };
    var previous = _analyticsTagGraphState && Array.isArray(_analyticsTagGraphState.nodes) ? _analyticsTagGraphState : null;
    var previousById = {};
    if (previous) previous.nodes.forEach(function (node) { previousById[node.id] = node; });
    var maxScore = Math.max.apply(null, graph.nodes.map(function (node) { return Number(node.weighted_score || 0); }));
    var tagNodes = graph.nodes.filter(function (node) { return node.node_type === 'tag'; });
    nextState.nodes = graph.nodes.map(function (node, index) {
      var existing = previousById[node.id];
      if (existing) {
        return Object.assign({}, node, { x: existing.x, y: existing.y, size: existing.size });
      }
      var ratio = maxScore > 0 ? Number(node.weighted_score || 0) / maxScore : 0;
      var idx = tagNodes.findIndex(function (item) { return item.id === node.id; });
      var angle = (Math.PI * 2 * idx) / Math.max(tagNodes.length, 1);
      var ring = 170 + (index % 3) * 26;
      return Object.assign({}, node, {
        x: Math.round(((width / 2) + Math.cos(angle) * ring) * 10) / 10,
        y: Math.round(((height / 2) + Math.sin(angle) * (ring * 0.68)) * 10) / 10,
        size: Math.max(18, Math.min(34, 18 + Math.round(ratio * 16)))
      });
    });
    nextState.links = (graph.links || []).map(function (link) { return Object.assign({}, link); });
    if (_analyticsSelectedTagId && !nextState.nodes.some(function (node) { return node.id === _analyticsSelectedTagId; })) _analyticsSelectedTagId = '';
    _analyticsTagGraphState = nextState;
    _renderAnalyticsTagGraphSvg();
    _bindAnalyticsTagGraphControls();
    _bindAnalyticsTagSelectionButtons();
  }

  function _renderAnalyticsTagGraphSvg() {
    var state = _analyticsTagGraphState;
    var svg = _el('analytics-tag-graph');
    var meta = _el('analytics-tag-graph-meta');
    if (!state || !svg) return;
    var byId = {};
    state.nodes.forEach(function (node) { byId[node.id] = node; });
    var maxLink = state.links.length ? Math.max.apply(null, state.links.map(function (link) { return Number(link.count || 0); })) : 1;
    var tx = (state.width / 2) * (1 - state.scale);
    var ty = (state.height / 2) * (1 - state.scale);
    var focusedNodeId = _analyticsSelectedTagId || state.hoveredNodeId || '';
    var focusedLinkId = state.hoveredLinkId || '';
    var linksHtml = state.links.map(function (link) {
      var source = byId[link.source];
      var target = byId[link.target];
      if (!source || !target) return '';
      var weight = maxLink > 0 ? Number(link.count || 0) / maxLink : 0;
      var stateClass = '';
      if (focusedLinkId) {
        stateClass = focusedLinkId === link.id ? ' is-active' : ' is-dimmed';
      } else if (focusedNodeId) {
        stateClass = _linkTouchesNode(link, focusedNodeId) ? ' is-active' : ' is-dimmed';
      }
      return '<line class="v3-tag-graph-link v3-tag-graph-link--tag_tag' + stateClass + '" data-link-id="' + GW.escapeHtml(link.id) + '" x1="' + source.x + '" y1="' + source.y + '" x2="' + target.x + '" y2="' + target.y + '" stroke-width="' + (1 + weight * 3.4).toFixed(2) + '"></line>';
    }).join('');
    var nodesHtml = state.nodes.map(function (node) {
      var active = '';
      if (focusedLinkId) {
        active = _nodeRelatedToHoveredLink(node.id) ? ' is-active' : ' is-dimmed';
      } else if (focusedNodeId) {
        active = (focusedNodeId === node.id || _nodeConnectedToFocusedNode(node.id, focusedNodeId)) ? ' is-active' : ' is-dimmed';
      }
      var selected = _analyticsSelectedTagId === node.id ? ' is-selected' : '';
      return '<g class="v3-tag-graph-node v3-tag-graph-node--tag' + active + selected + '" data-node-id="' + GW.escapeHtml(node.id) + '" transform="translate(' + node.x + ' ' + node.y + ')">' +
        '<circle r="' + node.size + '"></circle>' +
        '<text text-anchor="middle" dominant-baseline="middle" class="v3-tag-graph-text">' + GW.escapeHtml(node.label || node.id) + '</text>' +
      '</g>';
    }).join('');
    svg.innerHTML = '<g transform="translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + state.scale.toFixed(3) + ')">' + linksHtml + nodesHtml + '</g>';
    _bindAnalyticsTagGraphEvents();
    if (meta) meta.textContent = _describeAnalyticsGraphHover();
  }

  function _bindAnalyticsTagGraphControls() {
    _bindEl('analytics-tag-zoom-in', 'click', function () { _adjustAnalyticsTagGraphZoom(0.12); });
    _bindEl('analytics-tag-zoom-out', 'click', function () { _adjustAnalyticsTagGraphZoom(-0.12); });
    _bindEl('analytics-tag-zoom-reset', 'click', function () {
      if (!_analyticsTagGraphState) return;
      _analyticsTagGraphState.scale = 1;
      _renderAnalyticsTagGraphSvg();
    });
    var svg = _el('analytics-tag-graph');
    if (svg && !svg.dataset.graphWheelBound) {
      svg.dataset.graphWheelBound = '1';
      svg.addEventListener('wheel', function (event) {
        event.preventDefault();
        _adjustAnalyticsTagGraphZoom(event.deltaY < 0 ? 0.08 : -0.08);
      }, { passive: false });
    }
  }

  function _bindAnalyticsTagSelectionButtons() {
    document.querySelectorAll('[data-tag-select]').forEach(function (button) {
      button.onclick = function () {
        var nodeId = button.getAttribute('data-tag-select') || '';
        if (!nodeId) return;
        _openAnalyticsTagModal(nodeId);
      };
    });
    document.querySelectorAll('[data-graph-node-select]').forEach(function (button) {
      button.onclick = function () {
        var nodeId = button.getAttribute('data-graph-node-select') || '';
        if (!nodeId) return;
        _openAnalyticsTagModal(nodeId);
      };
    });
  }

  function _bindAnalyticsTagGraphEvents() {
    var svg = _el('analytics-tag-graph');
    if (!svg) return;
    svg.querySelectorAll('[data-node-id]').forEach(function (el) {
      el.onmouseenter = function () {
        if (!_analyticsTagGraphState) return;
        if (_analyticsSelectedTagId && _analyticsSelectedTagId !== (el.getAttribute('data-node-id') || '')) return;
        _analyticsTagGraphState.hoveredNodeId = el.getAttribute('data-node-id') || '';
        _analyticsTagGraphState.hoveredLinkId = '';
        _renderAnalyticsTagGraphSvg();
      };
      el.onmouseleave = function () {
        if (!_analyticsTagGraphState || _analyticsTagGraphState.dragNodeId) return;
        if (_analyticsSelectedTagId) return;
        _analyticsTagGraphState.hoveredNodeId = '';
        _renderAnalyticsTagGraphSvg();
      };
      el.onpointerdown = function (event) {
        if (!_analyticsTagGraphState) return;
        event.preventDefault();
        _analyticsTagGraphState.dragNodeId = el.getAttribute('data-node-id') || '';
        _analyticsTagGraphState.dragPointerId = event.pointerId;
        _analyticsTagGraphState.dragMoved = false;
        _analyticsTagGraphState.dragStartClientX = event.clientX || 0;
        _analyticsTagGraphState.dragStartClientY = event.clientY || 0;
        if (svg.setPointerCapture) {
          try { svg.setPointerCapture(event.pointerId); } catch (_) {}
        }
      };
    });
    svg.querySelectorAll('[data-link-id]').forEach(function (el) {
      el.onmouseenter = function () {
        if (!_analyticsTagGraphState) return;
        if (_analyticsSelectedTagId) return;
        _analyticsTagGraphState.hoveredLinkId = el.getAttribute('data-link-id') || '';
        _analyticsTagGraphState.hoveredNodeId = '';
        _renderAnalyticsTagGraphSvg();
      };
      el.onmouseleave = function () {
        if (!_analyticsTagGraphState || _analyticsTagGraphState.dragNodeId) return;
        if (_analyticsSelectedTagId) return;
        _analyticsTagGraphState.hoveredLinkId = '';
        _renderAnalyticsTagGraphSvg();
      };
    });
    svg.onpointermove = function (event) {
      if (!_analyticsTagGraphState || !_analyticsTagGraphState.dragNodeId) return;
      if (Math.abs((event.clientX || 0) - (_analyticsTagGraphState.dragStartClientX || 0)) > 4 || Math.abs((event.clientY || 0) - (_analyticsTagGraphState.dragStartClientY || 0)) > 4) {
        _analyticsTagGraphState.dragMoved = true;
      }
      var point = _eventToAnalyticsGraphPoint(event, svg);
      var node = _findAnalyticsGraphNode(_analyticsTagGraphState.dragNodeId);
      if (!node || !point) return;
      node.x = Math.max(44, Math.min(_analyticsTagGraphState.width - 44, point.x));
      node.y = Math.max(34, Math.min(_analyticsTagGraphState.height - 34, point.y));
      _renderAnalyticsTagGraphSvg();
    };
    svg.onpointerup = function () {
      if (!_analyticsTagGraphState) return;
      var nodeId = _analyticsTagGraphState.dragNodeId;
      var moved = _analyticsTagGraphState.dragMoved;
      _analyticsTagGraphState.dragNodeId = '';
      _analyticsTagGraphState.dragPointerId = null;
      _analyticsTagGraphState.dragMoved = false;
      if (!moved && nodeId) _openAnalyticsTagModal(nodeId);
    };
    svg.onpointercancel = function () {
      if (!_analyticsTagGraphState) return;
      _analyticsTagGraphState.dragNodeId = '';
      _analyticsTagGraphState.dragPointerId = null;
      _analyticsTagGraphState.dragMoved = false;
    };
    svg.onclick = function (event) {
      if (event.target === svg) {
        _analyticsSelectedTagId = '';
        _analyticsTagGraphState.hoveredNodeId = '';
        _analyticsTagGraphState.hoveredLinkId = '';
        _closeAnalyticsTagModal();
        _renderAnalyticsTagGraphSvg();
      }
    };
  }

  function _adjustAnalyticsTagGraphZoom(delta) {
    if (!_analyticsTagGraphState) return;
    _analyticsTagGraphState.scale = Math.max(0.55, Math.min(2.4, Number((_analyticsTagGraphState.scale + delta).toFixed(3))));
    _renderAnalyticsTagGraphSvg();
  }

  function _findAnalyticsGraphNode(id) {
    if (!_analyticsTagGraphState || !Array.isArray(_analyticsTagGraphState.nodes)) return null;
    for (var i = 0; i < _analyticsTagGraphState.nodes.length; i += 1) {
      if (_analyticsTagGraphState.nodes[i].id === id) return _analyticsTagGraphState.nodes[i];
    }
    return null;
  }

  function _findAnalyticsGraphLink(id) {
    if (!_analyticsTagGraphState || !Array.isArray(_analyticsTagGraphState.links)) return null;
    for (var i = 0; i < _analyticsTagGraphState.links.length; i += 1) {
      if (_analyticsTagGraphState.links[i].id === id) return _analyticsTagGraphState.links[i];
    }
    return null;
  }

  function _nodeRelatedToHoveredLink(nodeId) {
    if (!_analyticsTagGraphState || !_analyticsTagGraphState.hoveredLinkId) return false;
    var link = _findAnalyticsGraphLink(_analyticsTagGraphState.hoveredLinkId);
    return !!(link && (link.source === nodeId || link.target === nodeId));
  }

  function _linkTouchesNode(link, nodeId) {
    return !!(link && nodeId && (link.source === nodeId || link.target === nodeId));
  }

  function _nodeConnectedToFocusedNode(nodeId, focusedNodeId) {
    if (!focusedNodeId || nodeId === focusedNodeId || !_analyticsTagGraphState) return nodeId === focusedNodeId;
    return (_analyticsTagGraphState.links || []).some(function (link) {
      return _linkTouchesNode(link, focusedNodeId) && _linkTouchesNode(link, nodeId);
    });
  }

  function _selectAnalyticsTagNode(nodeId) {
    if (!nodeId) return;
    _analyticsSelectedTagId = nodeId;
    _renderAnalyticsTagGraphSvg();
    document.querySelectorAll('.v3-tag-cloud-chip[data-tag-select]').forEach(function (button) {
      button.classList.toggle('is-selected', button.getAttribute('data-tag-select') === nodeId);
    });
  }

  function _describeAnalyticsGraphHover() {
    if (!_analyticsTagGraphState) return '키워드를 hover하면 연계 관계가 보입니다. 클릭하면 선택 상태가 유지되고 관련 기사 모달이 열립니다.';
    if (_analyticsTagGraphState.hoveredNodeId) {
      var node = _findAnalyticsGraphNode(_analyticsTagGraphState.hoveredNodeId);
      if (!node) return '키워드를 hover하면 연계 관계가 보입니다. 클릭하면 선택 상태가 유지되고 관련 기사 모달이 열립니다.';
      return (node.label || node.id) + ' · 기사 ' + _fmt(node.count || 0) + '개 · 조회 ' + _fmt(node.pageviews || 0) + ' · 카테고리 ' + (((node.categories || []).join(', ')) || '—');
    }
    if (_analyticsTagGraphState.hoveredLinkId) {
      var link = _findAnalyticsGraphLink(_analyticsTagGraphState.hoveredLinkId);
      if (!link) return '키워드를 hover하면 연계 관계가 보입니다. 클릭하면 선택 상태가 유지되고 관련 기사 모달이 열립니다.';
      return '키워드 연계 · ' + String(link.source || '').replace(/^tag:/, '') + ' ↔ ' + String(link.target || '').replace(/^tag:/, '') + ' · ' + _fmt(link.count || 0) + '회';
    }
    if (_analyticsSelectedTagId) {
      return String(_analyticsSelectedTagId).replace(/^tag:/, '') + ' 선택됨 · 다른 곳을 클릭하면 선택이 해제됩니다.';
    }
    return '키워드를 hover하면 연계 관계가 보입니다. 클릭하면 선택 상태가 유지되고 관련 기사 모달이 열립니다.';
  }

  function _eventToAnalyticsGraphPoint(event, svg) {
    if (!_analyticsTagGraphState || !svg) return null;
    var rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = ((event.clientX - rect.left) / rect.width) * _analyticsTagGraphState.width;
    var y = ((event.clientY - rect.top) / rect.height) * _analyticsTagGraphState.height;
    var tx = (_analyticsTagGraphState.width / 2) * (1 - _analyticsTagGraphState.scale);
    var ty = (_analyticsTagGraphState.height / 2) * (1 - _analyticsTagGraphState.scale);
    return {
      x: (x - tx) / _analyticsTagGraphState.scale,
      y: (y - ty) / _analyticsTagGraphState.scale,
    };
  }

  function _openAnalyticsTagModal(nodeId) {
    if (!nodeId) return;
    _selectAnalyticsTagNode(nodeId);
    _renderAnalyticsTagArticlesModal();
    var modal = _el('analytics-tag-modal');
    if (modal) modal.style.display = 'flex';
  }

  function _closeAnalyticsTagModal() {
    var modal = _el('analytics-tag-modal');
    if (modal) modal.style.display = 'none';
  }
  V3.closeAnalyticsTagModal = _closeAnalyticsTagModal;

  function _renderAnalyticsTagArticlesModal() {
    var el = _el('analytics-tag-modal-body');
    var titleEl = _el('analytics-tag-modal-title');
    if (!el || !titleEl) return;
    if (!_analyticsTagGraphState || !_analyticsSelectedTagId) {
      titleEl.textContent = '연관 기사';
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">키워드를 선택하면 연관 기사 목록이 나타납니다.</div></div>';
      return;
    }
    var tagLabel = String(_analyticsSelectedTagId || '').replace(/^tag:/, '');
    var articles = (_analyticsTagGraphState.articles || []).filter(function (article) {
      return Array.isArray(article.keywords) && article.keywords.some(function (item) {
        return String(item || '').toLowerCase() === tagLabel.toLowerCase();
      });
    });
    if (!articles.length) {
      titleEl.textContent = tagLabel + ' · 연관 기사';
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">선택한 키워드와 연결된 기사가 없습니다.</div></div>';
      return;
    }
    var relatedKeywordCounts = {};
    articles.forEach(function (article) {
      (article.keywords || []).forEach(function (item) {
        var key = String(item || '');
        if (!key || key.toLowerCase() === tagLabel.toLowerCase()) return;
        relatedKeywordCounts[key] = (relatedKeywordCounts[key] || 0) + 1;
      });
    });
    var relatedKeywords = Object.keys(relatedKeywordCounts).sort(function (a, b) {
      return relatedKeywordCounts[b] - relatedKeywordCounts[a] || a.localeCompare(b, 'ko');
    }).slice(0, 8);
    var articleLinks = [];
    for (var i = 0; i < articles.length; i += 1) {
      for (var j = i + 1; j < articles.length; j += 1) {
        var left = articles[i];
        var right = articles[j];
        var shared = (left.keywords || []).filter(function (item) {
          return item.toLowerCase() !== tagLabel.toLowerCase() && (right.keywords || []).indexOf(item) >= 0;
        });
        if (!shared.length) continue;
        articleLinks.push({ left: left, right: right, shared: shared });
      }
    }
    titleEl.textContent = tagLabel + ' · 연관 기사 ' + _fmt(articles.length) + '개';
    el.innerHTML =
      '<div class="v3-inline-meta v3-tag-modal-meta"><strong>' + GW.escapeHtml(tagLabel) + '</strong> · 연관 기사 ' + _fmt(articles.length) + '개 · 관련 조회 ' + _fmt(articles.reduce(function (sum, article) { return sum + Number(article.pageviews || 0); }, 0)) + '</div>' +
      (relatedKeywords.length ? '<div class="v3-tag-article-keywords">' + relatedKeywords.map(function (item) {
        return '<button class="v3-geo-pill v3-tag-related-pill" type="button" data-tag-select="' + GW.escapeHtml('tag:' + item) + '">' + GW.escapeHtml(item) + ' · ' + _fmt(relatedKeywordCounts[item]) + '</button>';
      }).join('') + '</div>' : '') +
      '<div class="v3-tag-article-list">' + articles.map(function (article) {
        return '<div class="v3-tag-article-item">' +
          '<strong>' + GW.escapeHtml(article.title || ('게시글 ' + article.id)) + '</strong>' +
          '<span class="v3-tag-article-meta">' + GW.escapeHtml(article.category || 'uncategorized') + ' · ' + (article.published ? '공개' : '비공개') + ' · 조회 ' + _fmt(article.pageviews || 0) + '</span>' +
          '<span class="v3-tag-article-meta">키워드: ' + GW.escapeHtml((article.keywords || []).join(', ')) + '</span>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="v3-tag-article-links">' +
        '<h4 class="v3-card-title" style="font-size:13px;">기사간 연결성</h4>' +
        (articleLinks.length ? articleLinks.slice(0, 12).map(function (entry) {
          return '<div class="v3-tag-article-link-row">' +
            '<span>' + GW.escapeHtml(entry.left.title || ('게시글 ' + entry.left.id)) + '</span>' +
            '<span class="v3-tag-article-link-shared">공통 키워드: ' + GW.escapeHtml(entry.shared.join(', ')) + '</span>' +
            '<span>' + GW.escapeHtml(entry.right.title || ('게시글 ' + entry.right.id)) + '</span>' +
          '</div>';
        }).join('') : '<div class="v3-empty-inline">선택한 키워드 안에서는 기사 간 추가 공통 키워드 연결이 없습니다.</div>') +
      '</div>';
    _bindAnalyticsTagSelectionButtons();
  }

  function _loadGeoAudience() {
    var statsEl = document.getElementById('geo-audience-stats');
    var noteEl = document.getElementById('geo-audience-note');
    var countryEl = document.getElementById('geo-audience-country-list');
    var cityEl = document.getElementById('geo-audience-city-list');
    if (!statsEl || !countryEl || !cityEl) return;
    statsEl.innerHTML = '<div class="v3-loading" style="grid-column:1/-1;"><div class="v3-spinner"></div>로딩 중…</div>';
    if (noteEl) noteEl.textContent = '불러오는 중…';
    countryEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    cityEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';

    var period = _geoAudiencePeriodState.days || 30;
    var qs = _periodQuery(_geoAudiencePeriodState);
    Promise.allSettled([
      _apiFetch('/api/admin/geo-audience?' + qs),
      _apiFetch('/api/settings/wosm-members')
    ]).then(function (results) {
      if (results[0].status !== 'fulfilled') throw (results[0].reason || new Error('지리 집계를 불러오지 못했습니다.'));
      var data = results[0].status === 'fulfilled' ? (results[0].value || {}) : {};
      var wosm = results[1].status === 'fulfilled' ? (results[1].value || {}) : {};
      _geoAudienceData = data || {};
      var summary = _geoAudienceData.summary || {};
      var range = _geoAudienceData.range || {};
      var regionMap = _buildGeoAudienceRegionMap(Array.isArray(wosm.items) ? wosm.items : []);
      var countries = _enrichGeoAudienceItems(Array.isArray(_geoAudienceData.countries) ? _geoAudienceData.countries : [], regionMap);
      var cities = _enrichGeoAudienceItems(Array.isArray(_geoAudienceData.cities) ? _geoAudienceData.cities : [], regionMap);
      var warmupNote = String(_geoAudienceData.warmup_note || '').trim();

      statsEl.innerHTML =
        _statCard('국가 수', _fmt(summary.countries || countries.length || 0), range.label || '집계 기간') +
        _statCard('도시 수', _fmt(summary.cities || 0), '도시 식별 기준') +
        _statCard('방문 수', _fmt(summary.visits || 0), (range.days || period) + '일 고유 방문') +
        _statCard('페이지뷰', _fmt(summary.pageviews || 0), (range.days || period) + '일 전체 조회');

      noteEl.textContent = (_geoAudienceData.tracking_note || '') + (range.label ? ' · ' + range.label + ' 기준' : '');
      if (!countries.length && warmupNote) {
        noteEl.textContent += ' · ' + warmupNote;
      }
      countryEl.innerHTML = _renderGeoCountryTable(countries);
      cityEl.innerHTML = _renderGeoCityTable(cities);
      noteEl.innerHTML = GW.escapeHtml(noteEl.textContent) + '<div class="v3-geo-map-hint">지도를 축소하면 국가 분포, 확대하면 도시 분포가 표시됩니다. 지역연맹 색상은 세계연맹 회원국 현황 기준이며, 매칭되지 않는 국가는 별도 색으로 표시됩니다.</div>' + _renderGeoRegionLegend();
      _renderGeoAudienceMap(countries, cities);
    }).catch(function (e) {
      statsEl.innerHTML = '<div class="v3-empty" style="grid-column:1/-1;"><div class="v3-empty-text">불러오기 실패: ' + GW.escapeHtml(e.message || '') + '</div></div>';
      noteEl.textContent = '지리 집계를 불러오지 못했습니다.';
      countryEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">국가 데이터를 불러오지 못했습니다.</div></div>';
      cityEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">도시 데이터를 불러오지 못했습니다.</div></div>';
      _renderGeoAudienceMap([], []);
    });
  }

  function _renderGeoCountryTable(items) {
    if (!items.length) {
      return '<div class="v3-empty"><div class="v3-empty-text">국가별 접속 기록이 아직 없습니다.</div><div class="v3-issues-note">위치 데이터는 배포 이후 새 방문부터 누적됩니다. 초기에는 비어 있을 수 있습니다.</div></div>';
    }
    return '<div class="v3-geo-table-wrap"><table class="v3-geo-table"><thead><tr>' +
      '<th>국가</th><th>방문</th><th>페이지뷰</th><th>도시 수</th><th>최근 접속</th>' +
      '</tr></thead><tbody>' +
      items.slice(0, 120).map(function (item) {
        return '<tr>' +
          '<td><div class="v3-geo-country-cell"><strong>' + GW.escapeHtml(item.country_name || item.country_code || 'Unknown') + '</strong><span class="v3-geo-sub">' + GW.escapeHtml(item.country_code || 'N/A') + '</span>' + _renderGeoRegionMeta(item) + '</div></td>' +
          '<td>' + _fmt(item.visits || 0) + '</td>' +
          '<td>' + _fmt(item.pageviews || 0) + '</td>' +
          '<td>' + _fmt(item.city_count || 0) + '</td>' +
          '<td>' + GW.escapeHtml(_formatDateTimeCompact(item.last_visit_at)) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function _renderGeoCityTable(items) {
    if (!items.length) {
      return '<div class="v3-empty"><div class="v3-empty-text">도시별 접속 기록이 아직 없습니다.</div><div class="v3-issues-note">일부 요청은 Cloudflare에서 도시 정보를 주지 않아 `도시 미확인`으로 집계될 수 있습니다.</div></div>';
    }
    return '<div class="v3-geo-table-wrap"><table class="v3-geo-table"><thead><tr>' +
      '<th>도시</th><th>국가</th><th>방문</th><th>페이지뷰</th><th>최근 접속</th>' +
      '</tr></thead><tbody>' +
      items.slice(0, 120).map(function (item) {
        var cityName = item.city_name || item.city_name_original || '도시 미확인';
        var cityOriginal = String(item.city_name_original || '').trim();
        var showOriginal = cityOriginal && cityOriginal !== cityName && cityOriginal !== '도시 미확인';
        return '<tr>' +
          '<td><div class="v3-geo-country-cell"><strong>' + GW.escapeHtml(cityName) + '</strong>' + (showOriginal ? '<span class="v3-geo-sub">' + GW.escapeHtml(cityOriginal) + '</span>' : '') + '</div></td>' +
          '<td><div class="v3-geo-country-cell"><span class="v3-geo-pill ' + GW.escapeHtml(item.region_tone_class || 'is-unassigned') + '">' + GW.escapeHtml(item.country_name || item.country_code || 'Unknown') + '</span>' + _renderGeoRegionMeta(item) + '</div></td>' +
          '<td>' + _fmt(item.visits || 0) + '</td>' +
          '<td>' + _fmt(item.pageviews || 0) + '</td>' +
          '<td>' + GW.escapeHtml(_formatDateTimeCompact(item.last_visit_at)) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function _renderGeoAudienceMap(countryItems, cityItems) {
    var mapEl = document.getElementById('geo-audience-map');
    if (!mapEl) return;
    if (!window.L) {
      mapEl.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">지도 라이브러리를 불러오지 못했습니다.</div></div>';
      return;
    }
    if (!_geoAudienceMap) {
      _geoAudienceMap = L.map(mapEl, {
        worldCopyJump: true,
        minZoom: 1,
        maxZoom: 12,
        scrollWheelZoom: false,
        zoomControl: false,
      }).setView([24, 15], 1.6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        minZoom: 1,
        attribution: '&copy; OpenStreetMap'
      }).addTo(_geoAudienceMap);
      _geoAudienceMap.on('zoomend', _syncGeoAudienceMapZoom);

      // 커스텀 휠 줌 (RAF 스로틀 — Windows 3이벤트/틱 대응)
      var _gWheelRaf = 0, _gWheelDir = 0;
      mapEl.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        _gWheelDir += ev.deltaY > 0 ? 1 : -1;
        if (_gWheelRaf) return;
        _gWheelRaf = requestAnimationFrame(function () {
          _gWheelRaf = 0;
          var d = _gWheelDir; _gWheelDir = 0;
          if (!d) return;
          if (d < 0) _geoAudienceMap.zoomIn(1);
          else       _geoAudienceMap.zoomOut(1);
        });
      }, { passive: false });

      // 물리 확대·축소 버튼 (오른쪽 상단)
      var zc = document.createElement('div');
      zc.className = 'v3-geo-zoom-ctrl';
      zc.innerHTML =
        '<button class="v3-geo-zoom-btn" id="geo-map-zoom-in"  title="확대">＋</button>' +
        '<button class="v3-geo-zoom-btn" id="geo-map-zoom-out" title="축소">－</button>';
      mapEl.appendChild(zc);
      document.getElementById('geo-map-zoom-in').addEventListener('click',  function () { _geoAudienceMap.zoomIn(1); });
      document.getElementById('geo-map-zoom-out').addEventListener('click', function () { _geoAudienceMap.zoomOut(1); });
    }
    if (_geoAudienceMapLayer) {
      _geoAudienceMap.removeLayer(_geoAudienceMapLayer);
    }
    _geoAudienceMapLayer = L.layerGroup();
    _geoAudienceMapLayers = {
      country: L.layerGroup(),
      city: L.layerGroup(),
    };

    var validCountries = (Array.isArray(countryItems) ? countryItems : []).filter(function (item) {
      return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
    });
    var validCities = (Array.isArray(cityItems) ? cityItems : []).filter(function (item) {
      return item.city_name && item.city_name !== '도시 미확인' &&
        Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
    });
    if (!validCountries.length && !validCities.length) {
      window.setTimeout(function () { _geoAudienceMap.invalidateSize(); }, 30);
      return;
    }
    var maxCountryVisits = validCountries.length ? Math.max.apply(null, validCountries.map(function (item) { return Number(item.visits || 0); })) : 1;
    validCountries.forEach(function (item) {
      var visits = Number(item.visits || 0);
      var radius = Math.max(7, Math.min(30, 7 + Math.round((visits / Math.max(1, maxCountryVisits)) * 23)));
      var tone = _getGeoRegionTone(item.region_tone_class);
      L.circleMarker([Number(item.latitude), Number(item.longitude)], {
        radius: radius,
        weight: 1.5,
        color: tone.stroke,
        fillColor: tone.fill,
        fillOpacity: tone.opacity,
      }).on('click', function () {
        _geoAudienceMap.flyTo([Number(item.latitude), Number(item.longitude)], 4, { duration: 0.45 });
      }).bindPopup(
        '<strong>' + GW.escapeHtml(item.country_name || item.country_code || 'Unknown') + '</strong><br>' +
        GW.escapeHtml(item.region_label || '지역연맹 미분류') + '<br>' +
        '방문 ' + _fmt(visits) + ' · 페이지뷰 ' + _fmt(item.pageviews || 0) + '<br>' +
        '도시 ' + _fmt(item.city_count || 0)
      ).addTo(_geoAudienceMapLayers.country);
    });
    var maxCityVisits = validCities.length ? Math.max.apply(null, validCities.map(function (item) { return Number(item.visits || 0); })) : 1;
    validCities.forEach(function (item) {
      var visits = Number(item.visits || 0);
      var radius = Math.max(4, Math.min(16, 4 + Math.round((visits / Math.max(1, maxCityVisits)) * 12)));
      var tone = _getGeoRegionTone(item.region_tone_class);
      L.circleMarker([Number(item.latitude), Number(item.longitude)], {
        radius: radius,
        weight: 1.25,
        color: tone.cityStroke,
        fillColor: tone.cityFill,
        fillOpacity: tone.cityOpacity,
      }).bindPopup(
        '<strong>' + GW.escapeHtml(item.city_name || item.city_name_original || '도시 미확인') + '</strong><br>' +
        GW.escapeHtml(item.country_name || item.country_code || 'Unknown') + '<br>' +
        GW.escapeHtml(item.region_label || '지역연맹 미분류') + '<br>' +
        '방문 ' + _fmt(visits) + ' · 페이지뷰 ' + _fmt(item.pageviews || 0)
      ).addTo(_geoAudienceMapLayers.city);
    });
    _geoAudienceMapLayer.addLayer(_geoAudienceMapLayers.country);
    _geoAudienceMapLayer.addLayer(_geoAudienceMapLayers.city);
    _geoAudienceMap.addLayer(_geoAudienceMapLayer);
    _syncGeoAudienceMapZoom();
    window.setTimeout(function () { _geoAudienceMap.invalidateSize(); }, 30);
  }

  function _syncGeoAudienceMapZoom() {
    if (!_geoAudienceMap || !_geoAudienceMapLayer || !_geoAudienceMapLayers) return;
    var zoom = Number(_geoAudienceMap.getZoom() || 1);
    var showCities = zoom >= 4;
    if (showCities) {
      if (_geoAudienceMapLayer.hasLayer(_geoAudienceMapLayers.country)) _geoAudienceMapLayer.removeLayer(_geoAudienceMapLayers.country);
      if (!_geoAudienceMapLayer.hasLayer(_geoAudienceMapLayers.city)) _geoAudienceMapLayer.addLayer(_geoAudienceMapLayers.city);
      return;
    }
    if (_geoAudienceMapLayer.hasLayer(_geoAudienceMapLayers.city)) _geoAudienceMapLayer.removeLayer(_geoAudienceMapLayers.city);
    if (!_geoAudienceMapLayer.hasLayer(_geoAudienceMapLayers.country)) _geoAudienceMapLayer.addLayer(_geoAudienceMapLayers.country);
  }

  function _buildGeoAudienceRegionMap(items) {
    var map = {};
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var region = _getWosmRegionValue(item);
      var toneClass = _getGeoRegionToneClass(region);
      var regionLabel = _getGeoRegionLabel(region);
      var aliases = []
        .concat(Array.isArray(item && item.country_aliases) ? item.country_aliases : [])
        .concat([item && item.country_ko, item && item.country_en]);
      aliases.forEach(function (value) {
        var key = _normalizeGeoLookupKey(value);
        if (!key) return;
        map[key] = {
          region_label: regionLabel,
          region_tone_class: toneClass
        };
      });
    });
    return map;
  }

  function _enrichGeoAudienceItems(items, regionMap) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      var match = _resolveGeoAudienceRegion(item, regionMap || {});
      return Object.assign({}, item, match);
    });
  }

  function _resolveGeoAudienceRegion(item, regionMap) {
    var candidates = _buildGeoAudienceMatchCandidates(item);
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] && regionMap[candidates[i]]) return regionMap[candidates[i]];
    }
    return {
      region_label: '지역연맹 미분류',
      region_tone_class: 'is-unassigned'
    };
  }

  function _normalizeGeoLookupKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]+/g, '');
  }

  function _buildGeoAudienceMatchCandidates(item) {
    var rawValues = [
      item && item.country_name,
      item && item.country_name_original,
      item && item.country_code,
      _getGeoCountryLabelFromCode(item && item.country_code),
      _getGeoCountryEnglishFromCode(item && item.country_code)
    ];
    var normalized = [];
    rawValues.forEach(function (value) {
      var key = _normalizeGeoLookupKey(value);
      if (!key || normalized.indexOf(key) >= 0) return;
      normalized.push(key);
    });
    return normalized;
  }

  function _getGeoCountryLabelFromCode(code) {
    var raw = String(code || '').trim().toUpperCase();
    if (!raw) return '';
    var map = {
      KR: '한국',
      TW: '대만',
      US: '미국',
      RU: '러시아',
      TR: '터키',
      GB: '영국',
      AE: '아랍에미리트',
      CZ: '체코',
      VE: '베네수엘라',
      ZA: '남아프리카공화국'
    };
    if (map[raw]) return map[raw];
    try {
      var display = new Intl.DisplayNames(['ko', 'en'], { type: 'region' });
      return display.of(raw) || '';
    } catch (_) {
      return '';
    }
  }

  function _getGeoCountryEnglishFromCode(code) {
    var raw = String(code || '').trim().toUpperCase();
    if (!raw) return '';
    var map = {
      KR: 'South Korea',
      TW: 'Taiwan',
      US: 'United States',
      RU: 'Russia',
      TR: 'Turkey',
      GB: 'United Kingdom',
      AE: 'United Arab Emirates',
      CZ: 'Czech Republic',
      VE: 'Venezuela',
      ZA: 'South Africa'
    };
    if (map[raw]) return map[raw];
    try {
      var display = new Intl.DisplayNames(['en'], { type: 'region' });
      return display.of(raw) || '';
    } catch (_) {
      return '';
    }
  }

  function _getWosmRegionValue(item) {
    if (!item) return '';
    var extra = item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
    if (extra.column_1) return String(extra.column_1 || '').trim();
    var regionKey = Object.keys(extra).find(function (key) {
      return /region/i.test(key);
    });
    return regionKey ? String(extra[regionKey] || '').trim() : '';
  }

  function _getGeoRegionToneClass(region) {
    var normalized = String(region || '').trim().toLowerCase();
    if (normalized === 'africa') return 'is-africa';
    if (normalized === 'arab') return 'is-arab';
    if (normalized === 'asia-pacific') return 'is-asia-pacific';
    if (normalized === 'european') return 'is-european';
    if (normalized === 'interamerican') return 'is-interamerican';
    return 'is-unassigned';
  }

  function _getGeoRegionLabel(region) {
    var normalized = String(region || '').trim();
    return normalized || '지역연맹 미분류';
  }

  function _getGeoRegionTone(toneClass) {
    // WOSM 지역연맹 팔레트. hex 값은 --gw-* 브랜드 토큰과 동일:
    //   forest-green #248737 · leaf-green #9fed8f · ember-orange #ffae80 · fire-red #ff5655
    //   ocean-blue #0094b4 · river-blue #82e6de · scouting-purple #622599 · blossom-pink #ffbdff
    // stroke용 어두운 변형(#d97c45/#d94b4a/#007d99/#3b7f92)은 지도 경계선 가독성 보정값.
    // Leaflet setStyle이 CSS var()를 직접 해석하지 못해 hex 문자열로 유지. 런타임 getComputedStyle 래핑은 별도 스코프.
    var key = String(toneClass || 'is-unassigned').trim();
    var tones = {
      'is-africa': { stroke: '#248737', fill: '#248737', opacity: 0.46, cityStroke: '#248737', cityFill: '#9fed8f', cityOpacity: 0.42 },
      'is-arab': { stroke: '#d97c45', fill: '#ffae80', opacity: 0.48, cityStroke: '#d97c45', cityFill: '#ffae80', cityOpacity: 0.42 },
      'is-asia-pacific': { stroke: '#d94b4a', fill: '#ff5655', opacity: 0.48, cityStroke: '#d94b4a', cityFill: '#ff5655', cityOpacity: 0.42 },
      'is-european': { stroke: '#007d99', fill: '#0094b4', opacity: 0.48, cityStroke: '#007d99', cityFill: '#82e6de', cityOpacity: 0.42 },
      'is-interamerican': { stroke: '#3b7f92', fill: '#82e6de', opacity: 0.5, cityStroke: '#3b7f92', cityFill: '#82e6de', cityOpacity: 0.44 },
      'is-unassigned': { stroke: '#622599', fill: '#ffbdff', opacity: 0.42, cityStroke: '#622599', cityFill: '#ffbdff', cityOpacity: 0.38 }
    };
    return tones[key] || tones['is-unassigned'];
  }

  function _renderGeoRegionMeta(item) {
    return '<span class="v3-geo-region-badge ' + GW.escapeHtml(item.region_tone_class || 'is-unassigned') + '">' + GW.escapeHtml(item.region_label || '지역연맹 미분류') + '</span>';
  }

  function _renderGeoRegionLegend() {
    var items = [
      { label: 'Africa', tone: 'is-africa' },
      { label: 'Arab', tone: 'is-arab' },
      { label: 'Asia-Pacific', tone: 'is-asia-pacific' },
      { label: 'European', tone: 'is-european' },
      { label: 'Interamerican', tone: 'is-interamerican' },
      { label: '미분류', tone: 'is-unassigned' }
    ];
    return '<div class="v3-geo-legend">' + items.map(function (item) {
      return '<span class="v3-geo-legend-item"><span class="v3-geo-legend-dot ' + item.tone + '"></span>' + GW.escapeHtml(item.label) + '</span>';
    }).join('') + '</div>';
  }

  function _formatDateTimeCompact(value) {
    if (!value) return '-';
    if (GW && typeof GW.formatDateTimeCompactKst === 'function') return GW.formatDateTimeCompactKst(value);
    return String(value).slice(0, 16).replace('T', ' ');
  }

  function _formatDwellSeconds(value) {
    var seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '<span class="v3-text-s">—</span>';
    if (seconds < 60) return Math.round(seconds) + '초';
    var mins = Math.floor(seconds / 60);
    var secs = Math.round(seconds - mins * 60);
    return secs ? mins + '분 ' + secs + '초' : mins + '분';
  }

  /* ══════════════════════════════════════════════════════════
     MARKETING
  ══════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════
     RELEASES (버전기록)
  ══════════════════════════════════════════════════════════ */
  var _releasesData  = null;
  var _releasesScope = 'all';

  function _inferReleaseScope(item) {
    var raw = String(item && item.scope || '').trim().toLowerCase();
    if (raw === 'site' || raw === 'admin' || raw === 'both') return raw;
    var version = String(item && item.version || '').trim();
    if (/^03\./.test(version) || /^3\./.test(version)) return 'admin';
    if (/^00\./.test(version) || /^0\./.test(version)) return 'site';
    return 'both';
  }

  function _inferReleaseType(item) {
    var raw = String(item && item.type || '').trim();
    if (raw) return raw;
    var scope = _inferReleaseScope(item);
    var version = String(item && item.version || '').trim();
    if ((scope === 'admin' && /\.([0-9]{2})$/.test(version)) || (scope === 'site' && /\.([0-9]{2})$/.test(version))) {
      return 'Hotfix';
    }
    return 'Update';
  }

  function _getReleaseScopeLabel(scope) {
    return scope === 'site' ? 'Site' : scope === 'admin' ? 'Admin' : 'Site + Admin';
  }

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
      var s = _inferReleaseScope(item);
      return s === scope || s === 'both';
    });
    if (!filtered.length) {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-icon">📋</div><div class="v3-empty-text">버전 기록이 없습니다</div></div>';
      return;
    }
    var typeClass = { Bugfix: 'v3-badge-gray', Hotfix: 'v3-badge-gray', Update: 'v3-badge-blue', Feature: 'v3-badge-green', Release: 'v3-badge-green' };
    el.innerHTML = filtered.map(function (item) {
      var type = _inferReleaseType(item);
      var badge = typeClass[type] || 'v3-badge-gray';
      var changeItems = Array.isArray(item.items) ? item.items : (Array.isArray(item.changes) ? item.changes : []);
      var issueItems = Array.isArray(item.issues) ? item.issues : [];
      var s = _inferReleaseScope(item);
      var releaseDateText = item.released_at || item.date || '';
      var scopeLabel = _getReleaseScopeLabel(s);
      var issueHtml = issueItems.length
        ? '<div class="v3-release-issues-wrap">' +
            '<div class="v3-release-issues-title">정상이어야 했지만 실제로 작동하지 않았던 항목</div>' +
            '<ul class="v3-release-issues">' + issueItems.map(function (c) {
              return '<li>' + GW.escapeHtml(c) + '</li>';
            }).join('') + '</ul>' +
          '</div>'
        : '';
      return '<div class="v3-card v3-release-card">' +
        '<div class="v3-release-head">' +
          '<div class="v3-release-head-main">' +
            '<span class="v3-release-scope v3-release-scope-' + GW.escapeHtml(s) + '">' + GW.escapeHtml(scopeLabel) + '</span>' +
            '<span class="v3-release-version">V' + GW.escapeHtml(item.version || '') + '</span>' +
            '<span class="v3-badge ' + badge + '">' + GW.escapeHtml(type) + '</span>' +
          '</div>' +
          '<span class="v3-release-date">' + GW.escapeHtml(releaseDateText) + '</span>' +
        '</div>' +
        '<p class="v3-release-summary">' + GW.escapeHtml(item.summary || '') + '</p>' +
        issueHtml +
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

  /* ══════════════════════════════════════════════════════════
     기사 채점 (BP미디어 작성 표준 v2.1)
  ══════════════════════════════════════════════════════════ */
  var _scorerPosts = [];

  /* ══════════════════════════════════════════════════════════
     AI USAGE BANNER (기사 채점 패널 상단)
     ══════════════════════════════════════════════════════════ */
  var _AI_USAGE_WARN_DAY = 50;   // 일 호출 50회 이상 주의
  var _AI_USAGE_ALERT_DAY = 100; // 100회 이상 경고
  var _AI_USAGE_WARN_MONTH = 1000;
  var _AI_USAGE_ALERT_MONTH = 3000;

  function _fmtIntKo(n) {
    var v = Number(n || 0);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('ko-KR');
  }

  function _fmtUsdKrw(usd, krw) {
    var u = Number(usd || 0);
    var k = Number(krw || 0);
    if (u <= 0 && k <= 0) return '예상 비용 —';
    // 매우 작은 값은 센트까지, 아니면 달러 단위
    var usdStr = u < 0.01 ? '$' + u.toFixed(4) : '$' + u.toFixed(2);
    var krwStr = _fmtIntKo(k) + '원';
    return '≈ ' + usdStr + ' · ' + krwStr;
  }

  function _avgPerCallLabel(tokens, calls) {
    var t = Number(tokens || 0);
    var c = Number(calls  || 0);
    if (c <= 0 || t <= 0) return (c > 0 ? '평균 — / ' + c + '회' : '호출 없음');
    var avg = Math.round(t / c);
    return '1회당 ' + _fmtIntKo(avg) + ' · 총 ' + _fmtIntKo(c) + '회';
  }

  function _renderAiUsage(data) {
    if (!data) return;
    var today = data.today || {};
    var week  = data.week  || {};
    var month = data.month || {};

    var todayCalls = Number(today.calls || 0);
    var weekCalls  = Number(week.calls  || 0);
    var monthCalls = Number(month.calls || 0);

    // 토큰: est_tokens(서버에서 Llama 추정치 포함)를 1순위, 실측 total_tokens를 보조
    var todayTok = Number(today.est_tokens || today.total_tokens || 0);
    var weekTok  = Number(week.est_tokens  || week.total_tokens  || 0);
    var monthTok = Number(month.est_tokens || month.total_tokens || 0);
    var suffix = (today.total_tokens || week.total_tokens || month.total_tokens) ? '' : ' 추정';

    // 메인 값 → 토큰 누계 (큰 숫자)
    _setText('ai-usage-today-calls', _fmtIntKo(todayTok) + suffix);
    _setText('ai-usage-week-calls',  _fmtIntKo(weekTok)  + suffix);
    _setText('ai-usage-month-calls', _fmtIntKo(monthTok) + suffix);

    // 보조 라인 → 1회당 평균 토큰 + 총 호출수
    _setText('ai-usage-today-tokens', _avgPerCallLabel(todayTok, todayCalls));
    _setText('ai-usage-week-tokens',  _avgPerCallLabel(weekTok,  weekCalls));
    _setText('ai-usage-month-tokens', _avgPerCallLabel(monthTok, monthCalls));

    _setText('ai-usage-today-cost', _fmtUsdKrw(today.est_usd, today.est_krw));
    _setText('ai-usage-week-cost',  _fmtUsdKrw(week.est_usd,  week.est_krw));
    _setText('ai-usage-month-cost', _fmtUsdKrw(month.est_usd, month.est_krw));

    var avgMs = Math.round(Number((month.avg_latency_ms) || 0));
    _setText('ai-usage-latency', avgMs > 0 ? (avgMs + ' ms') : '—');
    var errors = Number(month.errors || 0);
    _setText('ai-usage-errors', '오류 ' + _fmtIntKo(errors) + '회 / 30일');

    // Pricing 안내 — 1줄 유지(카드 높이 정합). 상세는 title 속성으로 hover 제공.
    if (data.pricing) {
      var noteEl = document.getElementById('ai-usage-pricing-note');
      if (noteEl) {
        var rate = data.pricing.usdPer1kTokens;
        var rateLabel = rate != null ? rate : 0.0115;
        noteEl.textContent = '단가 $' + rateLabel + '/1K토큰';
        noteEl.title = (data.pricing.model || '@cf/meta/llama-3.1-8b-instruct') +
          ' · $' + rateLabel + '/1K토큰' +
          (data.pricing.krwPerUsd ? ' · USD ' + data.pricing.krwPerUsd + '원 기준' : '');
      }
    }

    // 경고 색상
    var todayStat = document.getElementById('ai-usage-today-calls');
    if (todayStat && todayStat.parentElement) {
      todayStat.parentElement.classList.remove('is-warn', 'is-alert');
      if (todayCalls >= _AI_USAGE_ALERT_DAY) todayStat.parentElement.classList.add('is-alert');
      else if (todayCalls >= _AI_USAGE_WARN_DAY) todayStat.parentElement.classList.add('is-warn');
    }
    var monthStat = document.getElementById('ai-usage-month-calls');
    if (monthStat && monthStat.parentElement) {
      monthStat.parentElement.classList.remove('is-warn', 'is-alert');
      if (monthCalls >= _AI_USAGE_ALERT_MONTH) monthStat.parentElement.classList.add('is-alert');
      else if (monthCalls >= _AI_USAGE_WARN_MONTH) monthStat.parentElement.classList.add('is-warn');
    }

    // 일별 꺾은선 차트 — 기간은 data.chart_days(서버 반환)에 맞춤
    _renderAiUsageChart(data);

    // Footline
    var foot = document.getElementById('ai-usage-footline');
    if (foot) {
      var model = data.pricing && data.pricing.model || '@cf/meta/llama-3.1-8b-instruct';
      foot.textContent = 'Cloudflare Workers AI(' + model + ') · neuron 단위 청구. 정확한 비용은 대시보드에서 확인하세요.';
    }
    var link = document.getElementById('ai-usage-dashboard-link');
    if (link && data.pricing && data.pricing.dashboardUrl) {
      // Cloudflare dash URL에 account placeholder 있으면 그대로 유지 (로그인 후 자동 치환됨)
      link.href = data.pricing.dashboardUrl;
    }
  }

  function _renderAiUsageError(msg) {
    _setText('ai-usage-today-calls', '—');
    _setText('ai-usage-week-calls', '—');
    _setText('ai-usage-month-calls', '—');
    _setText('ai-usage-latency', '—');
    _setText('ai-usage-today-tokens', '로딩 실패');
    _setText('ai-usage-week-tokens', '로딩 실패');
    _setText('ai-usage-month-tokens', '로딩 실패');
    _setText('ai-usage-errors', GW.escapeHtml(msg || '사용량 조회 실패'));
    var foot = document.getElementById('ai-usage-footline');
    if (foot) {
      foot.classList.add('is-stale');
      foot.textContent = '사용량 데이터를 불러오지 못했습니다: ' + (msg || '알 수 없는 오류');
    }
  }

  // 차트 범위 상태. mode==='days'면 days 값을 쓰고, 'custom'이면 start/end를 쓴다.
  var _aiUsageChartRange = { mode: 'days', days: 14, start: null, end: null };

  function _loadAiUsage(actionBtn) {
    if (actionBtn) _setButtonBusy(actionBtn, '…');
    var foot = document.getElementById('ai-usage-footline');
    if (foot) foot.classList.remove('is-stale');
    var qs;
    if (_aiUsageChartRange.mode === 'custom' && _aiUsageChartRange.start && _aiUsageChartRange.end) {
      qs = 'start=' + encodeURIComponent(_aiUsageChartRange.start) +
           '&end=' + encodeURIComponent(_aiUsageChartRange.end);
    } else {
      qs = 'days=' + (_aiUsageChartRange.days || 14);
    }
    _apiFetch('/api/admin/ai-usage?' + qs)
      .then(function (data) {
        _renderAiUsage(data);
      })
      .catch(function (err) {
        _renderAiUsageError((err && err.message) || '사용량 조회 실패');
      })
      .finally(function () {
        if (actionBtn) _clearButtonBusy(actionBtn);
      });
  }

  function _bindAiUsageRangeButtonsOnce() {
    if (_bindAiUsageRangeButtonsOnce._bound) return;
    _bindAiUsageRangeButtonsOnce._bound = true;
    document.querySelectorAll('.v3-ai-usage-trend-range [data-ai-usage-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var token = btn.getAttribute('data-ai-usage-range') || '14';
        if (token === 'custom') {
          _toggleAiUsageCustomRow(true);
          _setAiUsageActiveButton(btn);
          return;
        }
        var days = parseInt(token, 10);
        if (!Number.isFinite(days) || days <= 0) return;
        _toggleAiUsageCustomRow(false);
        _aiUsageChartRange = { mode: 'days', days: days, start: null, end: null };
        _setAiUsageActiveButton(btn);
        var rangeLabel = document.getElementById('ai-usage-trend-range-label');
        if (rangeLabel) rangeLabel.textContent = '최근 ' + days + '일';
        _loadAiUsage();
      });
    });

    var applyBtn = document.getElementById('ai-usage-custom-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        var startEl = document.getElementById('ai-usage-custom-start');
        var endEl   = document.getElementById('ai-usage-custom-end');
        var start   = startEl ? startEl.value : '';
        var end     = endEl   ? endEl.value   : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          if (typeof GW.showToast === 'function') GW.showToast('시작일과 종료일을 모두 선택해주세요', 'error');
          return;
        }
        if (start > end) {
          if (typeof GW.showToast === 'function') GW.showToast('종료일은 시작일 이후여야 합니다', 'error');
          return;
        }
        var spanDays = Math.round((new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime()) / 86400000) + 1;
        if (spanDays > 365) {
          if (typeof GW.showToast === 'function') GW.showToast('최대 365일 범위까지만 조회할 수 있습니다 (' + spanDays + '일)', 'error');
          return;
        }
        _aiUsageChartRange = { mode: 'custom', days: spanDays, start: start, end: end };
        var rangeLabel = document.getElementById('ai-usage-trend-range-label');
        if (rangeLabel) rangeLabel.textContent = start + ' ~ ' + end + ' (' + spanDays + '일)';
        _loadAiUsage();
      });
    }
  }

  function _setAiUsageActiveButton(activeBtn) {
    document.querySelectorAll('.v3-ai-usage-trend-range [data-ai-usage-range]').forEach(function (b) {
      b.classList.toggle('active', b === activeBtn);
    });
  }

  function _toggleAiUsageCustomRow(show) {
    var row = document.getElementById('ai-usage-custom-row');
    var toggle = document.getElementById('ai-usage-custom-toggle-btn');
    if (row) row.hidden = !show;
    if (toggle) toggle.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) {
      // 기본값: 오늘 ~ 오늘-13일 (14일 디폴트). KST 기준 YYYY-MM-DD.
      var startEl = document.getElementById('ai-usage-custom-start');
      var endEl   = document.getElementById('ai-usage-custom-end');
      var toKst = function (ms) {
        var d = new Date(ms + 9 * 3600 * 1000);
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      };
      if (startEl && !startEl.value) startEl.value = toKst(Date.now() - 13 * 86400 * 1000);
      if (endEl   && !endEl.value)   endEl.value   = toKst(Date.now());
    }
  }

  function _renderAiUsageChart(data) {
    _bindAiUsageRangeButtonsOnce();
    var svg = document.getElementById('ai-usage-chart');
    if (!svg) return;

    var periodDays = Number(data && data.chart_days) || (_aiUsageChartRange && _aiUsageChartRange.days) || 14;
    var rangeLabel = document.getElementById('ai-usage-trend-range-label');
    if (rangeLabel) {
      if (data && data.chart_range && data.chart_range.mode === 'custom') {
        rangeLabel.textContent = data.chart_range.start_kst + ' ~ ' + data.chart_range.end_kst + ' (' + periodDays + '일)';
      } else {
        rangeLabel.textContent = '최근 ' + periodDays + '일';
      }
    }

    // 기간 내 날짜를 빠짐없이 채우기 (데이터 없는 날은 0)
    // 커스텀 범위면 start~end를 순회, 기본 모드면 오늘 기준 N일 역산.
    var map = {};
    (Array.isArray(data && data.byDay) ? data.byDay : []).forEach(function (d) {
      map[d.date] = Number(d.calls || 0);
    });
    var points = [];
    var isCustom = !!(data && data.chart_range && data.chart_range.mode === 'custom' && data.chart_range.start_kst);
    if (isCustom) {
      var startParts = data.chart_range.start_kst.split('-').map(Number);
      var endParts   = data.chart_range.end_kst.split('-').map(Number);
      // 루프를 UTC 기준으로 안전하게 (DST/timezone shift 없음)
      var cur = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
      var stop = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
      while (cur <= stop) {
        var cd = new Date(cur);
        var key = cd.getUTCFullYear() + '-' + String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' + String(cd.getUTCDate()).padStart(2, '0');
        points.push({ date: key, calls: map[key] || 0, label: String(cd.getUTCMonth() + 1) + '/' + cd.getUTCDate() });
        cur += 86400000;
      }
    } else {
      var now = new Date();
      for (var i = periodDays - 1; i >= 0; i -= 1) {
        var d = new Date(now.getTime() - i * 86400 * 1000);
        var dKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        points.push({ date: dKey, calls: map[dKey] || 0, label: String(d.getMonth() + 1) + '/' + d.getDate() });
      }
    }

    // viewBox 800x220. 내부 여백 = 좌 36 / 우 12 / 상 20 / 하 38
    var VW = 800, VH = 220;
    var PL = 36, PR = 12, PT = 20, PB = 38;
    var innerW = VW - PL - PR;
    var innerH = VH - PT - PB;
    var n = points.length;
    var maxCalls = points.reduce(function (m, p) { return p.calls > m ? p.calls : m; }, 0);
    var yMax = maxCalls > 0 ? Math.max(1, niceCeil(maxCalls)) : 1;

    function xOf(i) { return PL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW); }
    function yOf(v) { return PT + innerH - (v / yMax) * innerH; }

    var parts = [];

    // 데이터가 전혀 없으면 안내 문구만 표시
    if (maxCalls === 0) {
      parts.push('<text class="chart-empty" x="' + (VW / 2) + '" y="' + (VH / 2) + '">기간 내 채점 호출이 없습니다</text>');
      // 축만 그려 시각적 뼈대 유지
    }

    // Y축 가이드 라인 4개 (0, 1/3, 2/3, max)
    var gridSteps = [0, 1, 2, 3];
    gridSteps.forEach(function (step) {
      var v = (yMax * step) / 3;
      var y = yOf(v);
      parts.push('<line class="chart-grid" x1="' + PL + '" y1="' + y + '" x2="' + (VW - PR) + '" y2="' + y + '"/>');
      parts.push('<text class="chart-axis-y" x="' + (PL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + Math.round(v) + '</text>');
    });

    // X축 레이블 — 기간이 길면 솎아내기
    var labelEvery = n <= 14 ? 1 : n <= 30 ? 3 : n <= 60 ? 5 : 10;
    for (var xi = 0; xi < n; xi += 1) {
      if (xi !== n - 1 && xi !== 0 && (xi % labelEvery) !== 0) continue;
      parts.push('<text class="chart-axis-x" x="' + xOf(xi) + '" y="' + (VH - PB + 14) + '" text-anchor="middle">' + points[xi].label + '</text>');
    }

    if (maxCalls > 0) {
      // 영역(선 아래 반투명) 경로
      var areaPath = 'M ' + xOf(0) + ' ' + yOf(0) + ' ';
      for (var i1 = 0; i1 < n; i1 += 1) {
        areaPath += 'L ' + xOf(i1) + ' ' + yOf(points[i1].calls) + ' ';
      }
      areaPath += 'L ' + xOf(n - 1) + ' ' + yOf(0) + ' Z';
      parts.push('<path class="chart-area" d="' + areaPath + '"/>');

      // 선
      var linePath = '';
      for (var i2 = 0; i2 < n; i2 += 1) {
        linePath += (i2 === 0 ? 'M ' : 'L ') + xOf(i2) + ' ' + yOf(points[i2].calls) + ' ';
      }
      parts.push('<path class="chart-line" d="' + linePath.trim() + '"/>');

      // 포인트 원 + 라벨(사용량)
      for (var i3 = 0; i3 < n; i3 += 1) {
        var cx = xOf(i3), cy = yOf(points[i3].calls);
        parts.push('<circle class="chart-point" cx="' + cx + '" cy="' + cy + '" r="3"><title>' + points[i3].date + ' · ' + points[i3].calls + '회</title></circle>');
        // 값 라벨 — 데이터 밀도에 따라 0은 숨기고, 긴 기간은 피크만 표시
        var showLabel =
          (n <= 14) ||
          (n <= 30 && (points[i3].calls > 0 || i3 === 0 || i3 === n - 1)) ||
          (n > 30 && points[i3].calls > 0 && (points[i3].calls === maxCalls || (i3 % Math.ceil(n / 8)) === 0));
        if (!showLabel) continue;
        var zeroCls = points[i3].calls === 0 ? ' chart-label-zero' : '';
        var labelY = cy - 7;
        if (labelY < PT + 8) labelY = cy + 12; // 포인트가 상단에 붙으면 아래로
        parts.push('<text class="chart-label' + zeroCls + '" x="' + cx + '" y="' + labelY + '">' + points[i3].calls + '</text>');
      }
    }

    svg.innerHTML = parts.join('');
  }

  // 1, 2, 5, 10 배수로 올림하는 간단 상한 계산 (차트 Y축 눈금 가독성 개선).
  function niceCeil(n) {
    if (n <= 1) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(n)));
    var frac = n / exp;
    var nice;
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
    return nice * exp;
  }

  /* ══════════════════════════════════════════════════════════
     RUBRIC EDITOR (평가 기준 · settings.score_rubric)
     ══════════════════════════════════════════════════════════ */
  var _rubricLastLoaded = '';
  function _updateRubricMeta() {
    var ta = document.getElementById('rubric-textarea');
    var meta = document.getElementById('rubric-meta');
    if (!ta || !meta) return;
    var len = (ta.value || '').length;
    var lines = (ta.value || '').split('\n').length;
    var dirty = ta.value !== _rubricLastLoaded;
    meta.textContent = len.toLocaleString('ko-KR') + '자 · ' + lines + '줄' + (dirty ? ' · 저장되지 않음' : '');
    meta.style.color = dirty ? '#b0393a' : '';
  }
  function _loadRubric() {
    var ta = document.getElementById('rubric-textarea');
    var badge = document.getElementById('rubric-state-badge');
    if (!ta) return;
    ta.value = '불러오는 중…';
    ta.disabled = true;
    GW.apiFetch('/api/settings/score-rubric')
      .then(function (data) {
        var content = (data && data.content) || '';
        ta.value = content;
        _rubricLastLoaded = content;
        if (badge) {
          badge.textContent = (data && data.isDefault) ? '기본값' : '사용자 정의';
          badge.style.color = (data && data.isDefault) ? '' : 'var(--v3-primary)';
        }
        _updateRubricMeta();
      })
      .catch(function () {
        ta.value = '';
        GW.showToast('평가 기준을 불러오지 못했습니다', 'error');
      })
      .finally(function () { ta.disabled = false; });
  }
  function _saveRubric(btn) {
    var ta = document.getElementById('rubric-textarea');
    if (!ta) return;
    var content = ta.value || '';
    if (!content.trim()) { GW.showToast('내용이 비어 있습니다. 기본값으로 복원하려면 되돌리기 버튼을 사용하세요.', 'error'); return; }
    _setButtonBusy(btn, '저장 중…');
    GW.apiFetch('/api/settings/score-rubric', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content }),
    })
      .then(function (data) {
        _rubricLastLoaded = (data && data.content) || content;
        var badge = document.getElementById('rubric-state-badge');
        if (badge) {
          badge.textContent = (data && data.isDefault) ? '기본값' : '사용자 정의';
          badge.style.color = (data && data.isDefault) ? '' : 'var(--v3-primary)';
        }
        _updateRubricMeta();
        GW.showToast('평가 기준을 저장했습니다. 다음 채점부터 반영됩니다.', 'success');
      })
      .catch(function (err) { GW.showToast((err && err.message) || '저장 실패', 'error'); })
      .finally(function () { _clearButtonBusy(btn); });
  }
  function _resetRubric(btn) {
    if (!confirm('평가 기준을 기본값(BP미디어 v2.1)으로 되돌리시겠습니까?')) return;
    _setButtonBusy(btn, '복원 중…');
    GW.apiFetch('/api/settings/score-rubric', { method: 'DELETE' })
      .then(function (data) {
        var ta = document.getElementById('rubric-textarea');
        if (ta) ta.value = (data && data.content) || '';
        _rubricLastLoaded = (data && data.content) || '';
        var badge = document.getElementById('rubric-state-badge');
        if (badge) { badge.textContent = '기본값'; badge.style.color = ''; }
        _updateRubricMeta();
        GW.showToast('기본값으로 복원했습니다.', 'success');
      })
      .catch(function (err) { GW.showToast((err && err.message) || '복원 실패', 'error'); })
      .finally(function () { _clearButtonBusy(btn); });
  }

  /* ══════════════════════════════════════════════════════════
     AI SCORE HISTORY — 채점 기록 조회
  ══════════════════════════════════════════════════════════ */
  var _aiScoreHistoryState = {
    limit: 20,
    offset: 0,
    total: 0,
    q: '',
    grade: '',
    minScore: null,
    bound: false,
  };

  function _loadAiScoreHistory(opts) {
    var state = _aiScoreHistoryState;
    opts = opts || {};
    if (opts.reset) {
      state.offset = 0;
      state.q = (document.getElementById('ai-score-history-q') || {}).value || '';
      state.grade = (document.getElementById('ai-score-history-grade') || {}).value || '';
      var minRaw = (document.getElementById('ai-score-history-min') || {}).value || '';
      state.minScore = minRaw !== '' && Number.isFinite(Number(minRaw)) ? Number(minRaw) : null;
    }
    _bindAiScoreHistoryControls();

    var listEl = document.getElementById('ai-score-history-list');
    var statsEl = document.getElementById('ai-score-history-stats');
    var metaEl = document.getElementById('ai-score-history-pagination-meta');
    if (listEl) listEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (statsEl) statsEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>집계 중…</div>';

    var params = new URLSearchParams();
    params.set('limit', String(state.limit));
    params.set('offset', String(state.offset));
    if (state.q) params.set('q', state.q);
    if (state.grade) params.set('grade', state.grade);
    if (state.minScore !== null) params.set('min_score', String(state.minScore));

    GW.apiFetch('/api/admin/ai-score-history?' + params.toString())
      .then(function (data) {
        state.total = (data && data.pagination && data.pagination.total) || 0;
        _renderAiScoreHistoryStats(statsEl, data && data.stats);
        _renderAiScoreHistoryList(listEl, data && data.items);
        _renderAiScoreHistoryPagination(metaEl, data && data.pagination);
      })
      .catch(function (err) {
        if (listEl) listEl.innerHTML = '<div class="v3-empty" style="color:var(--v3-danger,#c0392b);">불러오기 실패: ' + GW.escapeHtml((err && err.message) || String(err)) + '</div>';
        if (statsEl) statsEl.innerHTML = '';
      });
  }

  function _bindAiScoreHistoryControls() {
    if (_aiScoreHistoryState.bound) return;
    _aiScoreHistoryState.bound = true;
    var applyBtn = document.getElementById('ai-score-history-apply-btn');
    var refreshBtn = document.getElementById('ai-score-history-refresh-btn');
    var qEl = document.getElementById('ai-score-history-q');
    var prevBtn = document.getElementById('ai-score-history-prev-btn');
    var nextBtn = document.getElementById('ai-score-history-next-btn');
    if (applyBtn) applyBtn.addEventListener('click', function () { _loadAiScoreHistory({ reset: true }); });
    if (refreshBtn) refreshBtn.addEventListener('click', function () { _loadAiScoreHistory({ reset: true }); });
    if (qEl) qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') _loadAiScoreHistory({ reset: true }); });
    if (prevBtn) prevBtn.addEventListener('click', function () {
      _aiScoreHistoryState.offset = Math.max(0, _aiScoreHistoryState.offset - _aiScoreHistoryState.limit);
      _loadAiScoreHistory({});
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      _aiScoreHistoryState.offset += _aiScoreHistoryState.limit;
      _loadAiScoreHistory({});
    });
  }

  function _renderAiScoreHistoryStats(el, stats) {
    if (!el) return;
    if (!stats || !stats.total) {
      el.innerHTML = '<div class="v3-empty">채점 기록이 아직 없습니다. 글쓰기 패널의 “AI 채점” 기능을 사용하면 자동으로 기록됩니다.</div>';
      return;
    }
    var dist = stats.grade_distribution || {};
    el.innerHTML =
      '<div class="v3-stat-card"><span class="v3-stat-label">총 채점 수</span><strong class="v3-stat-value">' + stats.total + '</strong></div>' +
      '<div class="v3-stat-card"><span class="v3-stat-label">평균 점수</span><strong class="v3-stat-value">' + stats.avg_score + ' / 100</strong></div>' +
      '<div class="v3-stat-card"><span class="v3-stat-label">평균 응답 시간</span><strong class="v3-stat-value">' + stats.avg_latency_ms + ' ms</strong></div>' +
      '<div class="v3-stat-card"><span class="v3-stat-label">등급 분포</span><strong class="v3-stat-value" style="font-size:13px;line-height:1.4;">' +
        'S ' + (dist.S || 0) + ' · A ' + (dist.A || 0) + ' · B ' + (dist.B || 0) + ' · C ' + (dist.C || 0) + ' · D ' + (dist.D || 0) +
      '</strong></div>';
  }

  function _renderAiScoreHistoryList(el, items) {
    if (!el) return;
    items = Array.isArray(items) ? items : [];
    if (!items.length) {
      el.innerHTML = '<div class="v3-empty">조건에 맞는 기록이 없습니다.</div>';
      return;
    }
    el.innerHTML = items.map(function (row) {
      var score = row.overall_score != null ? row.overall_score : '—';
      var grade = row.overall_grade || '—';
      var gradeColor = _aiScoreGradeColor(grade);
      var catHtml = (row.categories || []).map(function (c) {
        return '<span class="v3-ai-score-cat">' + GW.escapeHtml(c.label || '') + ' ' + (c.score != null ? c.score : '—') + '/' + (c.max != null ? c.max : '—') + '</span>';
      }).join('');
      return '' +
        '<details class="v3-ai-score-row" style="border-bottom:1px solid var(--v3-border,#eee);padding:12px 4px;">' +
          '<summary style="display:flex;align-items:center;gap:12px;cursor:pointer;list-style:none;">' +
            '<span class="v3-ai-score-grade" style="min-width:44px;text-align:center;font-weight:700;color:' + gradeColor + ';border:1px solid ' + gradeColor + ';padding:3px 8px;">' + GW.escapeHtml(grade) + '</span>' +
            '<span class="v3-ai-score-score" style="min-width:72px;font-variant-numeric:tabular-nums;color:' + gradeColor + ';">' + score + ' / 100</span>' +
            '<span class="v3-ai-score-title" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + GW.escapeHtml(row.input_title || '(제목 없음)') + '</span>' +
            '<span class="v3-ai-score-time" style="color:var(--v3-muted);font-size:12px;font-variant-numeric:tabular-nums;">' + GW.escapeHtml(row.created_at_kst || '') + '</span>' +
          '</summary>' +
          '<div style="padding:12px 4px 4px;display:grid;gap:10px;">' +
            (row.overall_summary ? '<div><strong style="font-size:12px;opacity:0.65;">요약</strong><div style="margin-top:4px;">' + GW.escapeHtml(row.overall_summary) + '</div></div>' : '') +
            (catHtml ? '<div><strong style="font-size:12px;opacity:0.65;">카테고리</strong><div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">' + catHtml + '</div></div>' : '') +
            (row.improvement ? '<div style="border-left:3px solid #0094B4;background:rgba(0,148,180,0.06);padding:10px 12px;"><strong>개선 방향</strong><p style="margin:6px 0 0;">' + GW.escapeHtml(row.improvement) + '</p></div>' : '') +
            (row.revision_suggestion ? '<div style="border-left:3px solid #248737;background:rgba(36,135,55,0.06);padding:10px 12px;"><strong>✏️ 수정 제안 <span style="font-weight:400;opacity:0.6;font-size:11px;">· 약 300자</span></strong><p style="margin:6px 0 0;">' + GW.escapeHtml(row.revision_suggestion) + '</p></div>' : '') +
            '<div style="display:flex;gap:16px;font-size:12px;color:var(--v3-muted);flex-wrap:wrap;">' +
              '<span>본문 ' + (row.input_body_chars || 0) + '자</span>' +
              '<span>태그: ' + GW.escapeHtml(row.input_tags || '—') + '</span>' +
              '<span>응답 ' + (row.latency_ms || 0) + 'ms</span>' +
              '<span>추정 토큰 ' + (row.total_tokens || 0) + '</span>' +
            '</div>' +
          '</div>' +
        '</details>';
    }).join('');
  }

  function _renderAiScoreHistoryPagination(el, pagination) {
    var prevBtn = document.getElementById('ai-score-history-prev-btn');
    var nextBtn = document.getElementById('ai-score-history-next-btn');
    var total = (pagination && pagination.total) || 0;
    var limit = (pagination && pagination.limit) || _aiScoreHistoryState.limit;
    var offset = (pagination && pagination.offset) || 0;
    var hasMore = pagination && pagination.has_more;
    if (prevBtn) prevBtn.disabled = offset <= 0;
    if (nextBtn) nextBtn.disabled = !hasMore;
    if (el) {
      var end = Math.min(offset + limit, total);
      el.textContent = total ? (offset + 1) + '–' + end + ' / 총 ' + total + '건' : '';
    }
  }

  function _aiScoreGradeColor(grade) {
    switch (String(grade || '').toUpperCase()) {
      case 'S': return '#248737';
      case 'A': return '#0094B4';
      case 'B': return '#622599';
      case 'C': return '#FF8A3D';
      case 'D': return '#FF5655';
      default:  return '#777';
    }
  }

  function _initArticleScorer() {
    var runBtn   = document.getElementById('scorer-run-btn');
    var clearBtn = document.getElementById('scorer-clear-btn');
    var loadBtn  = document.getElementById('scorer-load-btn');
    var searchIn = document.getElementById('scorer-search-input');

    // AI 사용량 배너는 패널 진입할 때마다 갱신
    _loadAiUsage();
    var refreshBtn = document.getElementById('ai-usage-refresh-btn');
    if (refreshBtn && !refreshBtn._aiUsageBound) {
      refreshBtn._aiUsageBound = true;
      refreshBtn.addEventListener('click', function () { _loadAiUsage(refreshBtn); });
    }

    // 평가 기준 카드 — 펼쳤을 때 최초 1회 로드, 이후엔 리로드 버튼으로만
    var rubricCard = document.getElementById('rubric-card');
    if (rubricCard && !rubricCard._rubricInited) {
      rubricCard._rubricInited = true;
      rubricCard.addEventListener('toggle', function () {
        if (rubricCard.open && !_rubricLastLoaded) _loadRubric();
      });
      var ta = document.getElementById('rubric-textarea');
      if (ta) ta.addEventListener('input', _updateRubricMeta);
      var saveBtn   = document.getElementById('rubric-save-btn');
      var resetBtn  = document.getElementById('rubric-reset-btn');
      var reloadBtn = document.getElementById('rubric-reload-btn');
      if (saveBtn)   saveBtn.addEventListener('click',   function () { _saveRubric(saveBtn); });
      if (resetBtn)  resetBtn.addEventListener('click',  function () { _resetRubric(resetBtn); });
      if (reloadBtn) reloadBtn.addEventListener('click', function () { _loadRubric(); });
    }

    if (!runBtn || runBtn._scorerBound) return;
    runBtn._scorerBound = true;

    runBtn.addEventListener('click', _runScorer);

    clearBtn.addEventListener('click', function () {
      ['scorer-title','scorer-subtitle','scorer-body','scorer-tags'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
      _scorerShowEmpty();
    });

    // 검색 자동완성
    searchIn.addEventListener('input', function () {
      var q = searchIn.value.trim().toLowerCase();
      var list = document.getElementById('scorer-post-list');
      if (!q) { list.hidden = true; return; }
      var matches = _scorerPosts.filter(function (p) {
        return (p.title || '').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 10);
      if (!matches.length) { list.hidden = true; return; }
      list.innerHTML = matches.map(function (p) {
        return '<div class="v3-scorer-post-item" data-post-id="' + p.id + '">' +
          GW.escapeHtml(p.title || '(제목 없음)') +
          '<span class="v3-scorer-post-meta">' + GW.escapeHtml(p.category || '') + '</span>' +
          '</div>';
      }).join('');
      list.hidden = false;
    });

    // 검색창 외부 클릭 시 닫기
    document.addEventListener('click', function (e) {
      var list = document.getElementById('scorer-post-list');
      if (list && !list.contains(e.target) && e.target !== searchIn) list.hidden = true;
    });

    // 기사 선택 → 단건 API 호출로 본문 로딩
    var list = document.getElementById('scorer-post-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.v3-scorer-post-item') : null;
        if (!item) return;
        var id = item.getAttribute('data-post-id');
        list.hidden = true;
        searchIn.value = '';
        _scorerLoadPost(id);
      });
    }

    // 불러오기 버튼 — 목록 갱신
    loadBtn.addEventListener('click', function () {
      _setButtonBusy(loadBtn, '불러오는 중…');
      _apiFetch('/api/posts?limit=300&published=all&scope=admin')
        .then(function (data) {
          _scorerPosts = (data && data.posts) ? data.posts : [];
          _clearButtonBusy(loadBtn);
          loadBtn.textContent = _scorerPosts.length + '개 기사 로드됨';
          setTimeout(function () {
            loadBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 9v4H3V9"/><path d="M8 2v8"/><path d="M5 8l3 3 3-3"/></svg> 불러오기';
          }, 2500);
          searchIn.focus();
        })
        .catch(function () { _clearButtonBusy(loadBtn); });
    });

    // 패널 첫 진입 시 자동 로드
    if (!_scorerPosts.length) {
      _apiFetch('/api/posts?limit=300&published=all&scope=admin')
        .then(function (data) {
          _scorerPosts = (data && data.posts) ? data.posts : [];
          if (loadBtn) loadBtn.textContent = _scorerPosts.length + '개 기사 로드됨';
          setTimeout(function () {
            if (loadBtn) loadBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 9v4H3V9"/><path d="M8 2v8"/><path d="M5 8l3 3 3-3"/></svg> 불러오기';
          }, 2500);
        })
        .catch(function () {});
    }
  }

  function _scorerLoadPost(id) {
    var bodyField = document.getElementById('scorer-body');
    if (bodyField) bodyField.placeholder = '본문 불러오는 중…';
    _apiFetch('/api/posts/' + id)
      .then(function (data) {
        var post = data && (data.post || data);
        if (!post) return;
        var titleEl    = document.getElementById('scorer-title');
        var subtitleEl = document.getElementById('scorer-subtitle');
        var tagsEl     = document.getElementById('scorer-tags');
        if (titleEl)    titleEl.value    = post.title    || '';
        if (subtitleEl) subtitleEl.value = post.subtitle || '';
        if (tagsEl)     tagsEl.value     = post.meta_tags || '';

        // Editor.js JSON → 순수 텍스트 추출
        var raw = post.content || '';
        var plain = raw;
        try {
          var parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.blocks)) {
            plain = parsed.blocks
              .filter(function (b) { return b.type === 'paragraph' || b.type === 'header'; })
              .map(function (b) { return (b.data && b.data.text || b.data && b.data.text || '').replace(/<[^>]*>/g, ''); })
              .filter(Boolean)
              .join('\n\n');
          }
        } catch (_) {}

        if (bodyField) {
          bodyField.value = plain;
          bodyField.placeholder = '본문을 붙여넣으세요\n\n문단 사이는 빈 줄로 구분합니다.';
        }
        _scorerShowEmpty();
      })
      .catch(function () {
        if (bodyField) bodyField.placeholder = '불러오기 실패. 직접 붙여넣으세요.';
      });
  }

  function _scorerSetState(state, msg) {
    var inner = document.getElementById('scorer-result-inner');
    var empty = document.getElementById('scorer-empty-state');
    if (!inner || !empty) return;
    if (state === 'empty') {
      empty.classList.remove('is-hidden');
      empty.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg><p>기사를 입력하고<br>채점하기를 누르세요</p>';
      inner.hidden = true;
      inner.style.display = 'none';
    } else if (state === 'loading') {
      empty.classList.remove('is-hidden');
      empty.innerHTML = '<div class="v3-spinner" style="width:28px;height:28px;border-width:3px;margin-bottom:4px;"></div><p>AI가 기사를 분석하고 있습니다…<br><small>약 10~20초 소요됩니다</small></p>';
      inner.hidden = true;
      inner.style.display = 'none';
    } else if (state === 'result') {
      empty.classList.add('is-hidden');
      inner.hidden = false;
      inner.style.display = '';
    } else if (state === 'error') {
      empty.classList.remove('is-hidden');
      empty.innerHTML = '<p style="color:#FF5655;max-width:260px;">' + GW.escapeHtml(msg || '오류가 발생했습니다.') + '</p>';
      inner.hidden = true;
      inner.style.display = 'none';
    }
  }

  function _scorerShowEmpty() {
    _scorerSetState('empty');
  }

  function _scorerRenderResult(result) {
    var totalEl = document.getElementById('scorer-total-score');
    var gradeEl = document.getElementById('scorer-total-grade');
    var barFill = document.getElementById('scorer-bar-fill');
    var bodyEl  = document.getElementById('scorer-results-body');

    var overall = result.overall || {};
    var pct     = overall.score || 0;
    var grade   = overall.grade || '—';
    var color   = pct >= 80 ? '#248737' : pct >= 60 ? '#0094B4' : '#FF5655';

    totalEl.textContent = pct + ' / 100';
    gradeEl.textContent = grade;
    gradeEl.style.color = color;
    barFill.style.width = pct + '%';
    barFill.style.background = color;

    var cats = result.categories || [];
    bodyEl.innerHTML = cats.map(function (c) {
      var cPct      = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      var cColor    = cPct >= 80 ? '#248737' : cPct >= 60 ? '#0094B4' : '#FF5655';
      var issues    = (c.issues    || []).filter(Boolean);
      var strengths = (c.strengths || []).filter(Boolean);
      var strengthHtml = strengths.length
        ? '<ul class="v3-scorer-strengths">' + strengths.map(function (s) { return '<li>' + GW.escapeHtml(s) + '</li>'; }).join('') + '</ul>'
        : '';
      var issueHtml = issues.length
        ? '<ul class="v3-scorer-issues">' + issues.map(function (i) { return '<li>' + GW.escapeHtml(i) + '</li>'; }).join('') + '</ul>'
        : (!strengths.length ? '<p class="v3-scorer-pass">이상 없음</p>' : '');
      return '<div class="v3-scorer-check-row">' +
        '<div class="v3-scorer-check-head">' +
          '<span class="v3-scorer-check-label">' + GW.escapeHtml(c.label || '') + '</span>' +
          '<span class="v3-scorer-check-score" style="color:' + cColor + '">' + c.score + '/' + c.max + '</span>' +
        '</div>' +
        '<div class="v3-scorer-check-bar"><div class="v3-scorer-check-fill" style="width:' + cPct + '%;background:' + cColor + '"></div></div>' +
        strengthHtml + issueHtml +
        '</div>';
    }).join('');

    if (overall.summary) {
      bodyEl.innerHTML += '<div class="v3-scorer-summary">' + GW.escapeHtml(overall.summary) + '</div>';
    }
    if (result.improvement) {
      bodyEl.innerHTML += '<div class="v3-scorer-improvement"><strong>개선 방향</strong><p>' + GW.escapeHtml(result.improvement) + '</p></div>';
    }
    if (result.revision_suggestion) {
      bodyEl.innerHTML += '<div class="v3-scorer-improvement v3-scorer-revision" style="border-left-color:#248737;background:rgba(36,135,55,0.06);">'
        + '<strong>✏️ 수정 제안 <span style="font-weight:400;opacity:0.6;font-size:11px;">· 약 300자</span></strong>'
        + '<p>' + GW.escapeHtml(result.revision_suggestion) + '</p>'
        + '</div>';
    }

    _scorerSetState('result');
    var inner = document.getElementById('scorer-result-inner');
    if (inner) inner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _runScorer() {
    var title    = (document.getElementById('scorer-title').value || '').trim();
    var subtitle = (document.getElementById('scorer-subtitle').value || '').trim();
    var body     = (document.getElementById('scorer-body').value || '').trim();
    var tags     = (document.getElementById('scorer-tags').value || '').trim();

    if (!title && !body) {
      alert('제목 또는 본문을 입력해주세요.');
      return;
    }

    var runBtn = document.getElementById('scorer-run-btn');
    _setButtonBusy(runBtn, 'AI 채점 중…');
    _scorerSetState('loading');

    // 45초 타임아웃 — 무한 spinning 방지 (Workers AI 최대 응답 시간 여유 포함)
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timedOut = false;
    var timeoutId = setTimeout(function () {
      timedOut = true;
      if (controller) try { controller.abort(); } catch (_) {}
    }, 45000);

    var fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, subtitle: subtitle, content: body, tags: tags }),
    };
    if (controller) fetchOpts.signal = controller.signal;

    _apiFetch('/api/admin/score-article', fetchOpts)
      .then(function (data) {
        clearTimeout(timeoutId);
        _clearButtonBusy(runBtn);
        if (data && data.ok && data.result) {
          _scorerRenderResult(data.result);
        } else {
          _scorerSetState('error', (data && data.error) || 'AI 채점 실패');
        }
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        _clearButtonBusy(runBtn);
        if (timedOut || (err && err.name === 'AbortError')) {
          _scorerSetState('error', '45초 내에 응답이 오지 않았습니다. Workers AI 지연 또는 큐 적체 가능성 — 잠시 후 다시 시도하세요.');
        } else {
          _scorerSetState('error', '채점 요청 실패: ' + ((err && err.message) || String(err)));
        }
      })
      .finally(function () {
        // 호출 후 사용량 배너 즉시 반영 (DB 쓰기는 waitUntil background이므로 1.5초 여유)
        setTimeout(_loadAiUsage, 1500);
      });
  }

  /* ══════════════════════════════════════════════════════════
     HOMEPAGE ISSUES
  ══════════════════════════════════════════════════════════ */
  function _loadHomepageIssues(actionBtn) {
    var listEl = document.getElementById('homepage-issues-list');
    var metaEl = document.getElementById('homepage-issues-meta');
    if (!listEl) return;
    if (actionBtn) _setButtonBusy(actionBtn, '불러오는 중…');
    listEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (metaEl) metaEl.textContent = '불러오는 중…';
    _apiFetch('/api/admin/homepage-issues?limit=200')
      .then(function (data) {
        _homepageIssues = Array.isArray(data && data.items) ? data.items : [];
        _renderHomepageIssues();
      })
      .catch(function (e) {
        listEl.innerHTML = '<div class="v3-empty v3-issues-empty"><div class="v3-empty-text">' + GW.escapeHtml((e && e.message) || '불러오기 실패') + '</div></div>';
        if (metaEl) metaEl.textContent = '기록을 불러오지 못했습니다.';
      })
      .finally(function () {
        if (actionBtn && actionBtn.classList.contains('is-busy')) _clearButtonBusy(actionBtn);
      });
  }

  function _renderHomepageIssues() {
    var listEl = document.getElementById('homepage-issues-list');
    var metaEl = document.getElementById('homepage-issues-meta');
    if (!listEl) return;
    var items = (_homepageIssues || []).filter(function (item) {
      if (_homepageIssuesFilterStatus !== 'all' && item.status !== _homepageIssuesFilterStatus) return false;
      if (_homepageIssuesFilterSeverity !== 'all' && item.severity !== _homepageIssuesFilterSeverity) return false;
      if (!_homepageIssuesSearch) return true;
      var haystack = [
        item.title,
        item.summary,
        item.impact,
        item.cause,
        item.action_items,
        item.source_path,
        item.reporter
      ].join(' ').toLowerCase();
      return haystack.indexOf(_homepageIssuesSearch) >= 0;
    });
    if (metaEl) {
      metaEl.textContent = items.length + '건 표시 · 전체 ' + (_homepageIssues || []).length + '건';
    }
    if (!items.length) {
      listEl.innerHTML = '<div class="v3-empty v3-issues-empty"><div class="v3-empty-text">조건에 맞는 사이트 오류/이슈 기록이 없습니다.</div></div>';
      return;
    }
    listEl.innerHTML =
      '<div class="v3-table-wrap v3-issues-table">' +
        '<table class="v3-table">' +
          '<thead><tr><th>이슈</th><th>상태</th><th>심각도</th><th>영역</th><th>업데이트</th><th>관리</th></tr></thead>' +
          '<tbody>' +
            items.map(function (item) {
              return '<tr>' +
                '<td>' +
                  '<div class="v3-table-title">' + GW.escapeHtml(item.title || '(제목 없음)') + '</div>' +
                  '<div class="v3-issues-meta-line">' +
                    '<span class="v3-badge ' + _homepageIssueTypeBadge(item.issue_type) + '">' + GW.escapeHtml(_homepageIssueTypeLabel(item.issue_type)) + '</span>' +
                    (item.source_path ? '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(item.source_path) + '</span>' : '') +
                    ((Number(item.occurrence_count || 1) > 1) ? '<span class="v3-badge v3-badge-gray">반복 ' + GW.escapeHtml(String(item.occurrence_count)) + '회</span>' : '') +
                    (item.last_seen_at ? '<span class="v3-badge v3-badge-gray">마지막 감지 ' + GW.escapeHtml(_shortDate(item.last_seen_at)) + '</span>' : '') +
                  '</div>' +
                  (item.summary ? '<div class="v3-issues-note">' + GW.escapeHtml(item.summary) + '</div>' : '') +
                '</td>' +
                '<td><span class="v3-badge ' + _homepageIssueStatusBadge(item.status) + '">' + GW.escapeHtml(_homepageIssueStatusLabel(item.status)) + '</span></td>' +
                '<td><span class="v3-badge ' + _homepageIssueSeverityBadge(item.severity) + '">' + GW.escapeHtml(_homepageIssueSeverityLabel(item.severity)) + '</span></td>' +
                '<td>' + GW.escapeHtml(_homepageIssueAreaLabel(item.area)) + '</td>' +
                '<td class="v3-text-m">' + GW.escapeHtml(_shortDate(item.updated_at || item.created_at)) + '</td>' +
                '<td>' + _homepageIssueStatusAction(item) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function _homepageIssueStatusAction(item) {
    var current = String(item && item.status || 'open');
    return '<div class="v3-inline-actions v3-inline-actions-tight">' +
      '<select class="v3-filter-select v3-filter-select-sm" id="homepage-issue-status-' + Number(item.id || 0) + '">' +
        ['open', 'monitoring', 'resolved', 'archived'].map(function (status) {
          return '<option value="' + status + '"' + (status === current ? ' selected' : '') + '>' + GW.escapeHtml(_homepageIssueStatusLabel(status)) + '</option>';
        }).join('') +
      '</select>' +
      '<button type="button" class="v3-btn v3-btn-outline v3-btn-xs" onclick="V3.updateHomepageIssueStatus(' + Number(item.id || 0) + ')">적용</button>' +
    '</div>';
  }

  V3.updateHomepageIssueStatus = function (id) {
    var issueId = parseInt(id, 10);
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    var select = document.getElementById('homepage-issue-status-' + issueId);
    if (!select) return;
    var nextStatus = String(select.value || '').trim();
    _apiFetch('/api/admin/homepage-issues/' + issueId, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    })
      .then(function (data) {
        var item = data && data.item ? data.item : null;
        if (!item) {
          _loadHomepageIssues();
          _loadSiteHistory();
          return;
        }
        _homepageIssues = (_homepageIssues || []).map(function (row) {
          return Number(row && row.id || 0) === issueId ? item : row;
        });
        _renderHomepageIssues();
        _loadSiteHistory();
        GW.showToast('이슈 상태를 ' + _homepageIssueStatusLabel(item.status) + '로 변경했습니다.', 'success');
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '상태 변경에 실패했습니다.', 'error');
        _loadHomepageIssues();
      });
  };

  function _loadSiteHistory(actionBtn) {
    var listEl = document.getElementById('site-history-list');
    var metaEl = document.getElementById('site-history-meta');
    if (!listEl) return;
    if (actionBtn) _setButtonBusy(actionBtn, '불러오는 중…');
    listEl.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (metaEl) metaEl.textContent = '불러오는 중…';
    _apiFetch('/api/admin/site-history?limit=350')
      .then(function (data) {
        _siteHistoryItems = Array.isArray(data && data.items) ? data.items : [];
        _renderSiteHistory();
      })
      .catch(function (e) {
        listEl.innerHTML = '<div class="v3-empty v3-issues-empty"><div class="v3-empty-text">' + GW.escapeHtml((e && e.message) || '불러오기 실패') + '</div></div>';
        if (metaEl) metaEl.textContent = '히스토리 로그를 불러오지 못했습니다.';
      })
      .finally(function () {
        if (actionBtn && actionBtn.classList.contains('is-busy')) _clearButtonBusy(actionBtn);
      });
  }

  function _renderSiteHistory() {
    var listEl = document.getElementById('site-history-list');
    var metaEl = document.getElementById('site-history-meta');
    if (!listEl) return;
    var items = (_siteHistoryItems || []).filter(function (item) {
      if (_siteHistoryFilterGroup !== 'all' && item.group !== _siteHistoryFilterGroup) return false;
      if (_siteHistoryFilterSource !== 'all' && item.source !== _siteHistoryFilterSource) return false;
      if (!_siteHistorySearch) return true;
      return String(item.search_text || '').indexOf(_siteHistorySearch) >= 0;
    });
    if (metaEl) {
      metaEl.textContent = items.length + '건 표시 · 전체 ' + (_siteHistoryItems || []).length + '건';
    }
    if (!items.length) {
      listEl.innerHTML = '<div class="v3-empty v3-issues-empty"><div class="v3-empty-text">조건에 맞는 사이트 히스토리 로그가 없습니다.</div></div>';
      return;
    }
    var grouped = _groupSiteHistoryItems(items, _siteHistoryGroupBy);
    listEl.innerHTML = grouped.map(function (section) {
      return '<section class="v3-history-group">' +
        '<div class="v3-history-group-head">' +
          '<h3 class="v3-card-title v3-card-title-tight-sm">' + GW.escapeHtml(section.label) + '</h3>' +
          '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(String(section.items.length)) + '건</span>' +
        '</div>' +
        '<div class="v3-table-wrap v3-history-table">' +
          '<table class="v3-table">' +
            '<thead><tr><th>발생일시</th><th>문제</th><th>원인 추정</th><th>분류</th></tr></thead>' +
            '<tbody>' +
              section.items.map(function (item) {
                return '<tr>' +
                  '<td class="v3-text-m">' + GW.escapeHtml(_shortDate(item.occurred_at)) + '</td>' +
                  '<td>' +
                    '<div class="v3-table-title">' + GW.escapeHtml(item.title || item.problem || '(제목 없음)') + '</div>' +
                    '<div class="v3-issues-meta-line">' +
                      '<span class="v3-badge ' + _siteHistoryGroupBadge(item.group) + '">' + GW.escapeHtml(_siteHistoryGroupLabel(item.group)) + '</span>' +
                      '<span class="v3-badge ' + _siteHistoryLevelBadge(item.level) + '">' + GW.escapeHtml(_siteHistoryLevelLabel(item.level)) + '</span>' +
                      (item.source ? '<span class="v3-badge v3-badge-gray">' + GW.escapeHtml(item.source) + '</span>' : '') +
                      (item.status ? '<span class="v3-badge ' + _siteHistoryStatusBadge(item.status) + '">' + GW.escapeHtml(_siteHistoryStatusLabel(item.status)) + '</span>' : '') +
                    '</div>' +
                    (item.problem ? '<div class="v3-issues-note">' + GW.escapeHtml(item.problem) + '</div>' : '') +
                    (item.detail ? '<div class="v3-search-result-meta">' + GW.escapeHtml(item.detail) + '</div>' : '') +
                  '</td>' +
                  '<td><div class="v3-issues-note">' + GW.escapeHtml(item.suspected_cause || '원인 추정 정보가 없습니다.') + '</div></td>' +
                  '<td class="v3-text-m">' + GW.escapeHtml(_siteHistorySourceLabel(item.source)) + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>';
    }).join('');
  }

  function _groupSiteHistoryItems(items, mode) {
    if (mode === 'none') {
      return [{ label: '전체 로그', items: items.slice() }];
    }
    var groups = [];
    var map = {};
    items.forEach(function (item) {
      var key = '전체';
      if (mode === 'group') key = _siteHistoryGroupLabel(item.group);
      else if (mode === 'source') key = _siteHistorySourceLabel(item.source);
      else key = _siteHistoryDayLabel(item.occurred_at);
      if (!map[key]) {
        map[key] = [];
        groups.push({ label: key, items: map[key] });
      }
      map[key].push(item);
    });
    return groups;
  }

  function _siteHistoryDayLabel(value) {
    var parts = _dateParts(value);
    if (!parts) return '일시 미확인';
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function _siteHistoryGroupLabel(value) {
    return {
      error: '오류',
      issue: '이슈',
      auth: '인증',
      settings: '설정',
      content: '콘텐츠'
    }[value] || '기타';
  }

  function _siteHistorySourceLabel(value) {
    return {
      site: '공개 사이트',
      admin: '관리자',
      homepage: '홈페이지',
      api: 'API',
      data: '데이터',
      settings: '설정',
      ui: 'UI',
      mobile: '모바일',
      accessibility: '접근성',
      analytics: '분석',
      post: '게시글',
      other: '기타'
    }[value] || String(value || '기타');
  }

  function _siteHistoryLevelLabel(value) {
    return {
      error: 'error',
      warn: 'warn',
      warning: 'warn',
      high: 'high',
      medium: 'medium',
      low: 'low',
      info: 'info'
    }[value] || String(value || 'info');
  }

  function _siteHistoryLevelBadge(value) {
    return {
      error: 'v3-badge-red',
      warn: 'v3-badge-yellow',
      warning: 'v3-badge-yellow',
      high: 'v3-badge-red',
      medium: 'v3-badge-yellow',
      low: 'v3-badge-blue',
      info: 'v3-badge-gray'
    }[value] || 'v3-badge-gray';
  }

  function _siteHistoryStatusLabel(value) {
    return {
      open: '열림',
      monitoring: '모니터링',
      resolved: '해결됨',
      archived: '보관'
    }[value] || String(value || '');
  }

  function _siteHistoryStatusBadge(value) {
    return {
      open: 'v3-badge-open',
      monitoring: 'v3-badge-monitoring',
      resolved: 'v3-badge-resolved',
      archived: 'v3-badge-archived'
    }[value] || 'v3-badge-gray';
  }

  function _siteHistoryGroupBadge(value) {
    return {
      error: 'v3-badge-red',
      issue: 'v3-badge-issue',
      auth: 'v3-badge-blue',
      settings: 'v3-badge-improvement',
      content: 'v3-badge-site'
    }[value] || 'v3-badge-gray';
  }

  function _homepageIssueTypeLabel(value) {
    return {
      error: '오류',
      issue: '이슈',
      risk: '리스크',
      improvement: '개선 과제'
    }[value] || '이슈';
  }

  function _homepageIssueTypeBadge(value) {
    return {
      error: 'v3-badge-red',
      issue: 'v3-badge-issue',
      risk: 'v3-badge-risk',
      improvement: 'v3-badge-improvement'
    }[value] || 'v3-badge-gray';
  }

  function _homepageIssueStatusLabel(value) {
    return {
      open: '열림',
      monitoring: '모니터링',
      resolved: '해결됨',
      archived: '보관'
    }[value] || value;
  }

  function _homepageIssueStatusBadge(value) {
    return {
      open: 'v3-badge-open',
      monitoring: 'v3-badge-monitoring',
      resolved: 'v3-badge-resolved',
      archived: 'v3-badge-archived'
    }[value] || 'v3-badge-gray';
  }

  function _homepageIssueSeverityLabel(value) {
    return {
      high: '높음',
      medium: '중간',
      low: '낮음'
    }[value] || value;
  }

  function _homepageIssueSeverityBadge(value) {
    return {
      high: 'v3-badge-red',
      medium: 'v3-badge-yellow',
      low: 'v3-badge-blue'
    }[value] || 'v3-badge-gray';
  }

  function _homepageIssueAreaLabel(value) {
    return {
      homepage: '홈 본문',
      api: '홈 API',
      ui: 'UI',
      data: '데이터',
      mobile: '모바일',
      accessibility: '접근성',
      seo: 'SEO / GEO',
      performance: '성능',
      analytics: '통계 / 계측',
      other: '기타'
    }[value] || value;
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
          // Sankey SVG <rect fill=""> / <path stroke=""> 속성에 직접 삽입되어
          // CSS var() 해석 불가 — hex 리터럴 유지. §3.10 Leaflet 팔레트 동일 예외.
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
    // SVG fill/stroke 속성은 CSS var()를 해석하지 못해 hex 문자열로 반환.
    // 값은 --v3-mkt-* 토큰(#ff8c42/#2f9e44/#e64980)과 동일. §3.10 Leaflet 지도 팔레트와 동일 예외.
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
          '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:var(--v3-ink-destructive);" onclick="V3._removeHero(' + i + ')">×</button>' +
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
        // 메인 스토리와 에디터 추천 동시 지정 허용 — 기존 배타 제약 제거(2026-04-19).
        // 에디터 추천에 이미 있으면 안내 문구만 덧붙이되 선택은 가능.
        var alsoPicked = _picksPosts.some(function (item) { return item.id === p.id; });
        var suffix = alsoPicked ? ' · 에디터 추천에도 포함됨' : '';
        return '<div class="v3-search-result-item" onclick="V3._selectHomeLead(' + p.id + ')">' +
          '<div class="v3-search-result-title">' + GW.escapeHtml(p.title || '(제목 없음)') + '</div>' +
          '<div class="v3-search-result-meta">' + GW.escapeHtml((p.category || '') + suffix) + '</div>' +
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
      // 메인 스토리 ↔ 에디터 추천 동시 지정 허용 (2026-04-19). 이전 배타 제약 제거.
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
    _apiFetch('/api/posts?featured=1&limit=20&published=all&scope=admin').then(function (data) {
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
      var badges = '<span class="v3-badge ' + _catBadge(post.category) + '">' + GW.escapeHtml(post.category || '') + '</span><span class="v3-badge v3-badge-yellow">추천</span>';
      if (!post.published) badges += '<span class="v3-badge v3-badge-gray">비공개</span>';
      return '<div class="v3-pick-row">' +
        '<div class="v3-pick-copy">' +
          '<div class="v3-pick-badges">' + badges + '</div>' +
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
        // 메인 스토리와 동시 지정 허용(2026-04-19). 이미 picks에 있거나 4개 제한만 비활성 처리.
        var already = _picksPosts.some(function (item) { return item.id === p.id; });
        var isLead = _homeLeadPost && Number(_homeLeadPost.id) === Number(p.id);
        var disabled = already || (isFull && !already);
        var suffix = already
          ? ' · 이미 선택됨'
          : (isLead ? ' · 메인 스토리에도 지정됨' : (isFull ? ' · 최대 4개 선택됨' : ''));
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
    // 메인 스토리 ↔ 에디터 추천 동시 지정 허용 (2026-04-19). 이전 배타 제약 제거.
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
    var sections = (GW.getTagEditorSections && GW.getTagEditorSections()) || [
      { key: 'common', label: '공통 태그', desc: '모든 카테고리에서 공통으로 선택 가능한 태그입니다.' },
      { key: 'korea', label: 'KOREA 태그', desc: 'Korea 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'apr', label: 'APR 태그', desc: 'APR 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'wosm', label: 'WOSM 태그', desc: 'WOSM 기사에서 사용하는 글머리 태그입니다.' },
      { key: 'people', label: 'PEOPLE 태그', desc: '스카우트 인물 기사에서 사용하는 글머리 태그입니다.' }
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
  var META_PAGES = (GW.SITE_META_PAGE_KEYS && GW.SITE_META_PAGE_KEYS.slice()) || ['home', 'latest', 'korea', 'apr', 'wosm', 'wosm_members', 'people', 'glossary', 'contributors', 'search', 'ai_guide'];

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
        '<div class="v3-label v3-mb-16">' + GW.escapeHtml((GW.getMetaPageLabel && GW.getMetaPageLabel(key)) || key) + '</div>' +
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
  var BOARD_COPY_PAGES = (GW.getBoardCopyPageDefs && GW.getBoardCopyPageDefs()) || [
    { key: 'latest', label: '최근 1개월 소식', note: '/latest' },
    { key: 'korea', label: 'Korea', note: '/korea' },
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
        '<button class="v3-btn v3-btn-ghost v3-btn-xs" style="color:var(--v3-ink-destructive);" onclick="V3._removeContrib(' + i + ')">×</button>' +
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
     SETTINGS – NAV LABELS
  ══════════════════════════════════════════════════════════ */
  function _loadNavLabelsUI() {
    var el = document.getElementById('nav-labels-editor');
    el.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    _apiFetch('/api/settings/nav-labels').then(function (data) {
      _navLabels = (data && data.labels) || {};
      _renderNavLabels();
    }).catch(function () {
      el.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">불러오기 실패</div></div>';
    });
  }

  function _renderNavLabels() {
    var el = document.getElementById('nav-labels-editor');
    var rows = (GW.getNavLabelRows && GW.getNavLabelRows()) || [
      { key: 'nav.contributors', label: '도움을 주신 분들' },
      { key: 'nav.home', label: '홈' },
      { key: 'nav.latest', label: '1개월 소식' },
      { key: 'nav.korea', label: 'Korea' },
      { key: 'nav.apr', label: 'APR' },
      { key: 'nav.wosm', label: 'WOSM' },
      { key: 'nav.wosm_members', label: '세계연맹 회원국 현황' },
      { key: 'nav.people', label: '스카우트 인물' },
      { key: 'nav.calendar', label: '캘린더' },
      { key: 'nav.glossary', label: '용어집' }
    ];
    el.innerHTML = rows.map(function (row) {
      var value = _navLabels[row.key] || {};
      return '<div class="v3-trans-row">' +
        '<div class="v3-trans-key">' + GW.escapeHtml(row.label) + '<div class="v3-help">키: ' + GW.escapeHtml(row.key) + '</div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<input class="v3-input" type="text" id="nav-label-' + _escId(row.key) + '-ko" value="' + GW.escapeHtml(value.ko || '') + '" placeholder="국문" />' +
          '<input class="v3-input" type="text" id="nav-label-' + _escId(row.key) + '-en" value="' + GW.escapeHtml(value.en || '') + '" placeholder="영문" />' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _saveNavLabels() {
    var rows = ((GW.getNavLabelRows && GW.getNavLabelRows()) || []).map(function (row) { return row.key; });
    if (!rows.length) {
      rows = [
        'nav.contributors',
        'nav.home',
        'nav.latest',
        'nav.korea',
        'nav.apr',
        'nav.wosm',
        'nav.wosm_members',
        'nav.people',
        'nav.calendar',
        'nav.glossary'
      ];
    }
    var result = {};
    rows.forEach(function (key) {
      var koInput = document.getElementById('nav-label-' + _escId(key) + '-ko');
      var enInput = document.getElementById('nav-label-' + _escId(key) + '-en');
      result[key] = {
        ko: koInput ? koInput.value : '',
        en: enInput ? enInput.value : '',
      };
    });
    var btn = document.getElementById('nav-labels-save-btn');
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/nav-labels', { method: 'PUT', body: JSON.stringify({ labels: result }) })
      .then(function (data) {
        GW.showToast('상단 메뉴명을 저장했습니다', 'success');
        _navLabels = (data && data.labels) || result;
        _renderNavLabels();
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
      _wosmPublicCopy = _normalizeWosmPublicCopy(data && data.public_copy);
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
    _renderWosmPublicCopyFields();
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

  function _normalizeWosmPublicCopy(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      overview_template: String(source.overview_template || '{countryCount}개국 · {memberCount}개 회원연맹을 {viewLabel} 기준으로 정리했습니다. {collapsibleCount}개국은 {childLabel}을 접어둘 수 있습니다.').trim(),
      search_template: String(source.search_template || '검색 결과 {countryCount}개국 · {memberCount}개 회원연맹이 {viewLabel} 기준으로 표시됩니다.').trim(),
      section_meta_template: String(source.section_meta_template || '{countryCount}개국 · {memberCount}개 회원연맹').trim(),
      helper_text: String(source.helper_text || '대표 연맹을 먼저 보고, 같은 국가의 소속 회원연맹은 필요할 때 펼쳐볼 수 있습니다. 검색 결과에 하위 연맹이 포함되면 해당 그룹은 자동으로 펼쳐집니다.').trim(),
      child_label: String(source.child_label || '소속 회원연맹').trim(),
      section_region_label: String(source.section_region_label || '지역연맹').trim(),
      section_language_label: String(source.section_language_label || '공식 언어').trim(),
    };
  }

  function _renderWosmPublicCopyFields() {
    var copy = _normalizeWosmPublicCopy(_wosmPublicCopy);
    var fields = {
      'wosm-public-helper-text': copy.helper_text,
      'wosm-public-overview-template': copy.overview_template,
      'wosm-public-search-template': copy.search_template,
      'wosm-public-section-template': copy.section_meta_template,
      'wosm-public-child-label': copy.child_label,
      'wosm-public-region-label': copy.section_region_label,
      'wosm-public-language-label': copy.section_language_label,
    };
    Object.keys(fields).forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = fields[id];
    });
  }

  function _collectWosmPublicCopyFields() {
    return _normalizeWosmPublicCopy({
      helper_text: ((document.getElementById('wosm-public-helper-text') || {}).value || '').trim(),
      overview_template: ((document.getElementById('wosm-public-overview-template') || {}).value || '').trim(),
      search_template: ((document.getElementById('wosm-public-search-template') || {}).value || '').trim(),
      section_meta_template: ((document.getElementById('wosm-public-section-template') || {}).value || '').trim(),
      child_label: ((document.getElementById('wosm-public-child-label') || {}).value || '').trim(),
      section_region_label: ((document.getElementById('wosm-public-region-label') || {}).value || '').trim(),
      section_language_label: ((document.getElementById('wosm-public-language-label') || {}).value || '').trim(),
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
    var publicCopy = _collectWosmPublicCopyFields();
    var registeredCount = Math.max(0, parseInt(((document.getElementById('wosm-registered-count') || {}).value || _wosmRegisteredCount), 10) || 0);
    _setButtonBusy(btn, '저장 중…');
    _apiFetch('/api/settings/wosm-members', {
      method: 'PUT',
      body: JSON.stringify({ items: payload, columns: columns, import_mapping: importMapping, registered_count: registeredCount, public_copy: publicCopy, if_revision: _wosmMembersRevision }),
    }).then(function (data) {
      _wosmMembers = Array.isArray(data && data.items) ? data.items : payload;
      _wosmColumns = Array.isArray(data && data.columns) ? data.columns : columns;
      _wosmImportSavedMapping = Object.assign({}, _wosmImportSavedMapping, data && data.import_mapping || importMapping);
      _wosmRegisteredCount = Math.max(0, parseInt(data && data.registered_count, 10) || registeredCount);
      _wosmPublicCopy = _normalizeWosmPublicCopy(data && data.public_copy || publicCopy);
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
  V3.closeWosmImportModal = _closeWosmImportModal;

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
  V3.applyWosmImportMapping = _applyWosmImportMapping;

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
  V3.closeConfirmModal = _closeConfirm;

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

  function _dateParts(value) {
    if (!value) return null;
    var normalized = String(value).trim().replace(' ', 'T');
    var withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+09:00';
    var date = new Date(withZone);
    if (isNaN(date.getTime())) return null;
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    var out = {};
    parts.forEach(function (part) {
      if (part.type !== 'literal') out[part.type] = part.value;
    });
    return out.year ? out : null;
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

  function _toDatetimeLocalInput(value) {
    if (!value) return '';
    if (GW.toDatetimeLocalValue) return GW.toDatetimeLocalValue(value);
    return String(value).replace(' ', 'T').slice(0, 16);
  }

  function _escJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function _escId(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ── Session Timeout ────────────────────────────────────────────────────────
  // 30-minute idle window (운영 기준). Activity resets the timer on every
  // click/keydown/touch/scroll. Server cookie is 24h but the admin UI
  // intentionally logs users out earlier — combined with the force-relogin
  // on every /admin page load, this keeps admin sessions short-lived.
  var _SESSION_MS      = 30 * 60 * 1000;
  var _SESSION_WARN_MS =  5 * 60 * 1000;
  var _sessionDeadline     = 0;
  var _sessionWarnTimeout  = null;
  var _sessionExpireTimeout = null;
  var _sessionTickInterval = null;
  var _sessionWarnShown    = false;
  var _sessionWarnModal    = null;

  var _SESSION_STORAGE_KEY = '_gw_admin_sd';

  function _sessionPersist() {
    try { sessionStorage.setItem(_SESSION_STORAGE_KEY, String(_sessionDeadline)); } catch (_) {}
  }

  function _sessionClearPersist() {
    try { sessionStorage.removeItem(_SESSION_STORAGE_KEY); } catch (_) {}
  }

  function _sessionReset() {
    if (!_sessionDeadline) return;
    _sessionWarnShown = false;
    if (_sessionWarnModal) { _sessionWarnModal.remove(); _sessionWarnModal = null; }
    clearTimeout(_sessionWarnTimeout);
    clearTimeout(_sessionExpireTimeout);
    _sessionDeadline    = Date.now() + _SESSION_MS;
    _sessionPersist();
    _sessionWarnTimeout  = setTimeout(_sessionShowWarn,   _SESSION_MS - _SESSION_WARN_MS);
    _sessionExpireTimeout = setTimeout(_sessionExpire,    _SESSION_MS);
  }

  function _sessionTick() {
    var remaining = Math.max(0, _sessionDeadline - Date.now());
    var hours = Math.floor(remaining / 3600000);
    var mins = Math.floor((remaining % 3600000) / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var text = hours > 0
      ? (hours + ':' + pad(mins) + ':' + pad(secs))
      : (mins + ':' + pad(secs));
    var el = document.getElementById('v3-timer-text');
    var fill = document.getElementById('v3-timer-fill');
    var timer = document.getElementById('v3-session-timer');
    if (el) el.textContent = text;
    if (fill) fill.style.width = ((remaining / _SESSION_MS) * 100) + '%';
    if (timer) {
      timer.classList.toggle('is-warning', remaining <= _SESSION_WARN_MS && remaining > 60000);
      timer.classList.toggle('is-danger',  remaining <= 60000);
    }
  }

  function _sessionShowWarn() {
    if (_sessionWarnShown) return;
    _sessionWarnShown = true;
    var overlay = document.createElement('div');
    overlay.className = 'v3-overlay open v3-session-overlay v3-session-warn-modal';
    overlay.innerHTML =
      '<div class="v3-modal v3-session-modal-box" style="max-width:420px;text-align:center;padding:var(--v3-gap-xl) var(--gap-section)">' +
        '<p style="margin:0 0 8px;font-size:var(--fs-lead);font-weight:700;color:var(--v3-text)">세션 만료 예정</p>' +
        '<p style="margin:0 0 20px;font-size:var(--fs-body);color:var(--v3-text-m)">5분 후 자동 로그아웃됩니다. 계속 사용하시겠습니까?</p>' +
        '<div style="display:flex;gap:10px;justify-content:center">' +
          '<button class="v3-btn v3-btn-primary" onclick="V3.sessionExtend()">연장하기</button>' +
          '<button class="v3-btn" onclick="V3.logout()">로그아웃</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    _sessionWarnModal = overlay;
  }

  function _sessionExpire() {
    _sessionStop();
    if (_sessionWarnModal) { _sessionWarnModal.remove(); _sessionWarnModal = null; }
    var overlay = document.createElement('div');
    overlay.className = 'v3-overlay open v3-session-overlay v3-session-expired';
    overlay.innerHTML =
      '<div class="v3-modal v3-session-modal-box" style="max-width:420px;text-align:center;padding:var(--v3-gap-xl) var(--gap-section)">' +
        '<p style="margin:0 0 8px;font-size:var(--fs-lead);font-weight:700;color:var(--v3-text)">세션이 만료되었습니다</p>' +
        '<p style="margin:0;font-size:var(--fs-body);color:var(--v3-text-m)">30분간 활동이 없어 자동 로그아웃되었습니다.<br>잠시 후 메인 페이지로 이동합니다.</p>' +
      '</div>';
    document.body.appendChild(overlay);
    GW.clearToken();
    setTimeout(function () { window.location.href = '/'; }, 5000);
  }

  function _sessionStart() {
    var now = Date.now();
    var saved = 0;
    try { saved = parseInt(sessionStorage.getItem(_SESSION_STORAGE_KEY), 10) || 0; } catch (_) {}
    _sessionDeadline = (saved > now + 1000) ? saved : (now + _SESSION_MS);
    _sessionPersist();

    _sessionWarnShown = false;
    clearTimeout(_sessionWarnTimeout);
    clearTimeout(_sessionExpireTimeout);
    clearInterval(_sessionTickInterval);

    var remaining = _sessionDeadline - Date.now();
    if (remaining <= 0) { _sessionExpire(); return; }
    _sessionWarnTimeout   = setTimeout(_sessionShowWarn, remaining <= _SESSION_WARN_MS ? 0 : remaining - _SESSION_WARN_MS);
    _sessionExpireTimeout = setTimeout(_sessionExpire,   remaining);
    _sessionTickInterval  = setInterval(_sessionTick,    1000);
    _sessionTick();
    document.addEventListener('click',      _sessionReset);
    document.addEventListener('keydown',    _sessionReset);
    document.addEventListener('touchstart', _sessionReset);
    document.addEventListener('scroll',     _sessionReset, true);
  }

  function _sessionStop() {
    _sessionDeadline = 0;
    _sessionClearPersist();
    clearTimeout(_sessionWarnTimeout);
    clearTimeout(_sessionExpireTimeout);
    clearInterval(_sessionTickInterval);
    _sessionWarnTimeout = _sessionExpireTimeout = _sessionTickInterval = null;
    document.removeEventListener('click',      _sessionReset);
    document.removeEventListener('keydown',    _sessionReset);
    document.removeEventListener('touchstart', _sessionReset);
    document.removeEventListener('scroll',     _sessionReset, true);
    var el = document.getElementById('v3-timer-text');
    var fill = document.getElementById('v3-timer-fill');
    if (el) el.textContent = '—';
    if (fill) fill.style.width = '0%';
    var timer = document.getElementById('v3-session-timer');
    if (timer) { timer.classList.remove('is-warning', 'is-danger'); }
  }

  V3.sessionExtend = function () {
    _sessionReset();
  };
  // ── End Session Timeout ───────────────────────────────────────────────────

})();
