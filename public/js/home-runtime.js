(function () {
  'use strict';

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    !window.GW ||
    !window.GW.HomeHelpers ||
    !window.GW.HomeRender ||
    !window.GW.HomeHero
  ) return;

  var GW = window.GW;
  var helpers = GW.HomeHelpers;
  var render = GW.HomeRender;
  var hero = GW.HomeHero;

  GW.HomePage = (function () {
    var lastHomeRefreshAt = 0;
    var lastHomeRequestAt = 0;
    var homeRefreshBusy = false;
    var homeRefreshTimer = null;
    var homeRefreshPromise = null;
    var runtimeReportBound = false;
    var latestIssueKeys = [];
    var latestFatalState = false;
    var latestRefreshFailed = false;
    var latestRefreshFailureCount = 0;

    // Freshness bar / since-last-visit state. The previous-visit timestamp is
    // sampled once per page load so post counts stay stable while the visitor
    // is on the page; the new "current visit" is committed back to storage
    // immediately so refreshes don't keep re-showing the same delta.
    var LAST_VISIT_KEY = 'gw_home_last_visit_at';

    // Stale-while-revalidate 캐시(즉시 첫 페인트용). ASSET_VERSION 으로 키를 버전
    // 버스트해 배포 시 구조가 바뀌어도 옛 페이로드를 잘못 쓰지 않는다. TTL 은
    // 넉넉히 — 어차피 매 로드에서 fresh 가 즉시 뒤따라 덮어쓰므로 stale 노출은 찰나.
    var HOME_CACHE_TTL_MS = 1000 * 60 * 30;
    function homeCacheKey() {
      return GW.getVersionedCacheKey('gw_cache_home', 'v1_' + (GW.ASSET_VERSION || '0'));
    }

    var previousVisitMs = readPreviousVisit();
    var freshnessLatestPublishMs = 0;
    var freshnessTickTimer = null;

    function readPreviousVisit() {
      try {
        var raw = window.localStorage && window.localStorage.getItem(LAST_VISIT_KEY);
        var n = raw ? Number(raw) : 0;
        return isFinite(n) && n > 0 ? n : 0;
      } catch (_) { return 0; }
    }

    function writeCurrentVisit() {
      try {
        if (window.localStorage) window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
      } catch (_) {}
    }

    function fetchHomeData(options) {
      var opts = options || {};
      var query = opts.fresh ? '?_=' + Date.now() : '';
      return GW.apiFetch('/api/home' + query, {
        cache: opts.fresh ? 'no-store' : 'default'
      });
    }

    var _normalizeWarned = {};
    function _warnOnce(key, msg) {
      if (_normalizeWarned[key]) return;
      _normalizeWarned[key] = true;
      try { console.warn('[GW home-data]', msg); } catch (_) {}
    }

    function normalizeHomeData(raw) {
      if (!raw || typeof raw !== 'object') {
        _warnOnce('shape', 'home data missing/invalid; using empty fallback');
        return {};
      }
      var d = raw;
      if (d.hero && typeof d.hero !== 'object') {
        _warnOnce('hero', 'data.hero invalid type, falling back to {}');
        d.hero = {};
      }
      if (d.ticker && typeof d.ticker !== 'object') {
        _warnOnce('ticker', 'data.ticker invalid, dropping');
        d.ticker = null;
      }
      if (d.ticker && d.ticker.items && !Array.isArray(d.ticker.items)) {
        _warnOnce('ticker-items', 'data.ticker.items not array, dropping');
        d.ticker.items = [];
      }
      if (d.analytics && typeof d.analytics !== 'object') d.analytics = {};
      if (d.lead && typeof d.lead !== 'object') d.lead = null;
      if (d.stats && typeof d.stats !== 'object') d.stats = null;
      return d;
    }

    function applyData(data, options) {
      data = normalizeHomeData(data);
      var opts = options || {};
      var issues = helpers.getHomeIssueMap(data);
      latestIssueKeys = helpers.getActiveHomeIssueKeys(issues);
      latestFatalState = false;
      latestRefreshFailed = false;
      latestRefreshFailureCount = 0;
      if (data.site_meta) {
        GW._siteMetaData = data.site_meta;
        GW.applyManagedFooterData(data.site_meta);
      }
      GW._navLabels = data.nav_labels || {};
      GW._customStrings = (data.translations && data.translations.strings) || {};
      GW.applyLang();
      GW._statsData = data.stats || null;
      if (GW._statsData) GW._renderStats();
      helpers.renderHomeFooterStats(data.analytics || {});

      var nextHeroSignature = helpers.getHeroSignature(data.hero || {});
      if (!opts.background || nextHeroSignature !== applyData._lastHeroSignature) {
        hero.renderHero(data.hero || {});
        applyData._lastHeroSignature = nextHeroSignature;
      }

      var viewModel = render.buildHomeSections(data);
      var leadPost = (data.lead && data.lead.post) || (viewModel.picksPosts.length ? viewModel.picksPosts[0] : viewModel.latestPosts[0]) || null;
      var leadMedia = (data.lead && data.lead.post && leadPost && data.lead.post.id === leadPost.id) ? data.lead.media : null;
      render.renderLeadStory(
        document.getElementById('home-lead-story'),
        leadPost,
        (data.lead && data.lead.post) ? '메인 스토리' : (viewModel.picksPosts.length ? '추천 기사' : '대표 기사'),
        leadMedia,
        { error: !!issues.lead }
      );
      render.applyMiniSections(viewModel, issues);
      applyFreshnessFromViewModel(viewModel, data);
      lastHomeRefreshAt = Date.now();
      syncHomeStatusBanner();
    }

    var currentVisitCommitted = false;
    function applyFreshnessFromViewModel(viewModel, data) {
      var latestPosts = (viewModel && viewModel.latestPosts) || [];
      var recentTitles = latestPosts.slice(0, 3)
        .map(function (post) { return post && post.title ? String(post.title) : ''; })
        .filter(Boolean);
      var topPublishMs = 0;
      var newCount = 0;
      latestPosts.forEach(function (post) {
        var ms = GW.getPostDateMillis(post);
        if (ms > topPublishMs) topPublishMs = ms;
        if (previousVisitMs && ms > previousVisitMs) newCount += 1;
      });
      freshnessLatestPublishMs = topPublishMs;
      GW.renderTickerItems('ticker-inner', data.ticker && data.ticker.items, { autoItems: recentTitles });
      renderFreshnessBar(newCount);
      if (!currentVisitCommitted) {
        currentVisitCommitted = true;
        writeCurrentVisit();
      }
    }

    function renderFreshnessBar(newCount) {
      var bar = document.getElementById('home-freshness-bar');
      var updatedEl = document.getElementById('home-freshness-updated');
      var sepEl = document.getElementById('home-freshness-sep');
      var sinceEl = document.getElementById('home-freshness-since');
      if (!bar || !updatedEl) return;
      if (!freshnessLatestPublishMs) {
        bar.hidden = true;
        return;
      }
      var rel = GW.formatRelativeTime(freshnessLatestPublishMs) || GW.formatDate(new Date(freshnessLatestPublishMs).toISOString());
      updatedEl.textContent = '최근 업데이트: ' + rel;
      var showSince = !!previousVisitMs && newCount > 0;
      if (sinceEl) {
        if (showSince) {
          sinceEl.textContent = '이전 방문 이후 새 글 ' + newCount + '건';
          sinceEl.hidden = false;
        } else {
          sinceEl.textContent = '';
          sinceEl.hidden = true;
        }
      }
      if (sepEl) sepEl.hidden = !showSince;
      bar.hidden = false;
    }

    function startFreshnessTick() {
      if (freshnessTickTimer !== null) return;
      freshnessTickTimer = window.setInterval(function () {
        if (document.visibilityState !== 'visible') return;
        if (!freshnessLatestPublishMs) return;
        var updatedEl = document.getElementById('home-freshness-updated');
        if (!updatedEl) return;
        var rel = GW.formatRelativeTime(freshnessLatestPublishMs) || GW.formatDate(new Date(freshnessLatestPublishMs).toISOString());
        updatedEl.textContent = '최근 업데이트: ' + rel;
      }, 30000);
    }

    function syncHomeStatusBanner() {
      if (latestFatalState) {
        helpers.renderHomeStatusBanner({ type: 'fatal' });
        return;
      }
      if (latestIssueKeys.length) {
        helpers.renderHomeStatusBanner({ type: 'partial', issueKeys: latestIssueKeys });
        return;
      }
      if (latestRefreshFailed) {
        helpers.renderHomeStatusBanner({ type: 'refresh' });
        return;
      }
      helpers.renderHomeStatusBanner();
    }

    function refreshHomeData(options) {
      var opts = options || {};
      var now = Date.now();
      var minInterval = opts.immediate ? 0 : (opts.force ? 10000 : 30000);
      if (homeRefreshPromise) return homeRefreshPromise;
      if (homeRefreshBusy) return Promise.resolve();
      if (now - lastHomeRequestAt < minInterval) return Promise.resolve();
      homeRefreshBusy = true;
      lastHomeRequestAt = now;
      homeRefreshPromise = fetchHomeData({ fresh: true })
        .then(function (data) {
          applyData(data, { background: true });
        })
        .catch(function (err) {
          try { console.warn('[GW home-refresh-failed]', err); } catch (_) {}
          latestRefreshFailureCount += 1;
          latestRefreshFailed = true;
          syncHomeStatusBanner();
          if (shouldReportBackgroundRefreshError(err, latestRefreshFailureCount)) {
            helpers.reportHomepageIssue('home_latest_refresh_failed', {
              section: 'homepage',
              message: (err && err.message) || 'background home refresh failed',
              path: '/api/home'
            });
          }
        })
        .finally(function () {
          homeRefreshBusy = false;
          homeRefreshPromise = null;
        });
      return homeRefreshPromise;
    }

    function shouldReportBackgroundRefreshError(err, failureCount) {
      var name = String(err && err.name || '').trim();
      var message = String(err && err.message || '').trim();
      var lower = message.toLowerCase();
      var genericFetchFailure = lower === 'failed to fetch' || lower.indexOf('networkerror') >= 0;

      if (name === 'AbortError') return false;
      if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return false;
      if (document.visibilityState && document.visibilityState !== 'visible') return false;

      // 2026-04-25 21:28 KST: a single background "Failed to fetch" created a
      // monitoring issue even though the server had no corroborating fault.
      // Repeated failures still report so real /api/home instability is visible.
      if (genericFetchFailure) return failureCount >= 3;
      return true;
    }

    // 우리 코드에서 난 에러만 보고 대상으로 삼는다.
    //
    // 배경(2026-07-22): 트래커에 medium P0 로 쌓인 [33][34] 는
    //   `cloudflareinsights.com/beacon.min.js` 가 구형 브라우저에서 `.at()` 를
    //   호출하다 던진 것으로, Cloudflare 자체 분석 스크립트다. 우리 소스가 아니고
    //   우리가 고칠 수도 없는데 전역 error 핸들러가 무차별 보고했다.
    //   또 크로스오리진 스크립트 에러는 브라우저가 상세를 가려 'Script error.' 로만
    //   올라오는데, 이것도 원인 파악이 불가능한 순수 노이즈다.
    function isOwnOriginError(filename) {
      var src = String(filename || '').trim();
      if (!src) return true;                 // 소스가 없으면 인라인/우리 코드로 간주
      if (src.indexOf('/') === 0) return true; // 루트 상대경로 = 같은 오리진
      try {
        return new URL(src, window.location.href).hostname === window.location.hostname;
      } catch (_) {
        return true;                         // 파싱 불가 시 보수적으로 보고
      }
    }

    function bindRuntimeIssueReporting() {
      if (runtimeReportBound) return;
      runtimeReportBound = true;

      window.addEventListener('error', function (event) {
        var message = event && event.message ? String(event.message) : 'runtime error';
        var filename = event && event.filename ? String(event.filename) : '';

        // 서드파티 스크립트(cloudflareinsights·kakao·google ads·CDN 등) 에러는
        // 우리 버그가 아니므로 보고하지 않는다.
        if (!isOwnOriginError(filename)) return;
        // CORS 로 가려진 'Script error.' 는 상세가 없어 조치 불가 — 노이즈.
        if (message === 'Script error.' || message === 'Script error') return;

        helpers.reportHomepageIssue('home_client_runtime_error', {
          message: message,
          path: filename || window.location.pathname,
          source: filename,
          code: event && event.lineno ? String(event.lineno) + ':' + String(event.colno || 0) : ''
        });
      });

      window.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        var message = reason && reason.message ? String(reason.message) : String(reason || 'promise rejection');
        var lower = message.toLowerCase();

        // 백그라운드 새로고침 실패와 같은 이유로 순간 네트워크 단절은 보고하지 않는다.
        // (오프라인·숨김 탭 상태이거나 일반 fetch 실패 메시지면 조치 대상이 아니다)
        var genericNetwork = lower === 'failed to fetch' || lower === 'load failed' || lower.indexOf('networkerror') >= 0;
        var offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
        var hidden = document.visibilityState && document.visibilityState !== 'visible';
        if (genericNetwork && (offline || hidden)) return;

        helpers.reportHomepageIssue('home_client_promise_rejection', {
          message: message,
          path: window.location.pathname,
          source: '',
          code: 'unhandledrejection'
        });
      });
    }

    // SSR(functions/[[path]].js applyHomeSsrContent)이 이미 실제 기사로 채워 둔
    // 컨테이너는 클라이언트 fetch 가 실패해도 그대로 둔다. 아직 아무것도 못 받은
    // 컨테이너만 스켈레톤(.loading-state)을 달고 있으므로 그것이 판별 기준이다.
    // 이 구분이 없던 시절엔 완성된 홈이 1초 뒤 오류 문구 벽으로 덮여버렸다.
    function renderBlockErrorIfEmpty(id, key) {
      var el = document.getElementById(id);
      if (!el) return;
      if (!el.querySelector('.loading-state')) return;
      helpers.renderHomeBlockError(el, key);
    }

    function renderLoadFailure() {
      latestFatalState = true;
      latestIssueKeys = [];
      lastHomeRequestAt = 0;
      var bar = document.getElementById('home-freshness-bar');
      if (bar) bar.hidden = true;
      GW.renderTickerItems('ticker-inner');
      // 통계는 0 으로 덮어쓰지 않는다. 네트워크 실패를 "기사 0건 · 방문자 0"
      // 이라는 사실처럼 표시하게 되고, SSR 이 넣어 둔 실제 수치까지 지워진다.
      renderBlockErrorIfEmpty('home-lead-story', 'lead');
      renderBlockErrorIfEmpty('latest-list', 'latest');
      renderBlockErrorIfEmpty('popular-list', 'popular');
      renderBlockErrorIfEmpty('popular-list-mobile', 'popular');
      renderBlockErrorIfEmpty('picks-list', 'picks');
      renderBlockErrorIfEmpty('picks-list-mobile', 'picks');
      renderBlockErrorIfEmpty('col-korea', 'korea');
      renderBlockErrorIfEmpty('col-apr', 'apr');
      renderBlockErrorIfEmpty('col-wosm', 'wosm');
      renderBlockErrorIfEmpty('col-people', 'people');
      syncHomeStatusBanner();
    }

    function bindHomeStatusActions() {
      var banner = document.getElementById('home-runtime-alert');
      if (!banner || banner.dataset.bound === '1') return;
      banner.addEventListener('click', function (event) {
        var retryBtn = event.target && event.target.closest ? event.target.closest('[data-home-retry]') : null;
        if (!retryBtn) return;
        latestFatalState = false;
        latestRefreshFailed = false;
        lastHomeRequestAt = 0;
        refreshHomeData({ force: true, immediate: true });
      });
      banner.dataset.bound = '1';
    }

    function setSectionInteractiveState(el, active) {
      if (!el) return;
      el.hidden = !active;
      el.setAttribute('aria-hidden', active ? 'false' : 'true');
      if ('inert' in el) el.inert = !active;
    }

    var clampDebounceTimer = null;
    function debouncedClampMiniLabels() {
      if (clampDebounceTimer !== null) clearTimeout(clampDebounceTimer);
      clampDebounceTimer = window.setTimeout(function () {
        clampDebounceTimer = null;
        helpers.clampMiniLabelRows();
      }, 150);
    }

    function syncResponsiveSectionVisibility() {
      var isMobile = window.matchMedia('(max-width: 900px)').matches;
      setSectionInteractiveState(document.querySelector('.home-mobile-stack'), isMobile);
      setSectionInteractiveState(document.querySelector('.home-2col'), !isMobile);
    }

    function startHomeRefreshTimer() {
      if (homeRefreshTimer !== null) return;
      homeRefreshTimer = window.setInterval(function () {
        if (document.visibilityState === 'visible') refreshHomeData();
      }, 60000);
    }

    function initRefreshLifecycle() {
      window.addEventListener('pageshow', function (event) {
        // bfcache 복귀 시 pagehide 에서 걷어낸 타이머를 되살린다. 이게 없으면
        // 뒤로가기로 돌아온 세션은 자동 갱신·상대시각 갱신이 영구히 멈춘다.
        startHomeRefreshTimer();
        startFreshnessTick();
        refreshHomeData({ force: !!event.persisted });
      });
      window.addEventListener('focus', function () {
        refreshHomeData({ force: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshHomeData({ force: true });
      });
      startHomeRefreshTimer();
      window.addEventListener('pagehide', function () {
        if (homeRefreshTimer !== null) {
          clearInterval(homeRefreshTimer);
          homeRefreshTimer = null;
        }
        if (freshnessTickTimer !== null) {
          clearInterval(freshnessTickTimer);
          freshnessTickTimer = null;
        }
      });
    }

    function initPullToRefresh() {
      if (GW.setupPullToRefresh) {
        GW.setupPullToRefresh();
        return;
      }
      var indicator = document.getElementById('pull-refresh-indicator');
      if (!indicator || !window.matchMedia('(pointer: coarse)').matches) return;

      var startY = 0;
      var pulling = false;
      var current = 0;
      var threshold = 86;
      var labelEl = indicator.querySelector('.pull-refresh-label');

      function resetIndicator() {
        indicator.classList.remove('visible', 'ready');
        indicator.style.setProperty('--pull-distance', '0px');
        current = 0;
      }

      window.addEventListener('touchstart', function (event) {
        if (window.scrollY > 0 || !event.touches || event.touches.length !== 1) return;
        startY = event.touches[0].clientY;
        pulling = true;
      }, { passive: true });

      window.addEventListener('touchmove', function (event) {
        if (!pulling || window.scrollY > 0 || !event.touches || event.touches.length !== 1) return;
        var delta = event.touches[0].clientY - startY;
        if (delta <= 0) {
          resetIndicator();
          return;
        }
        current = Math.min(delta * 0.55, 104);
        indicator.classList.add('visible');
        indicator.style.setProperty('--pull-distance', current + 'px');
        indicator.classList.toggle('ready', current >= threshold);
        if (delta > 6) event.preventDefault();
      }, { passive: false });

      window.addEventListener('touchend', function () {
        if (!pulling) return;
        pulling = false;
        if (current >= threshold) {
          indicator.classList.add('ready');
          if (labelEl) labelEl.textContent = '새로고침 중...';
          window.location.reload();
          return;
        }
        if (labelEl) labelEl.textContent = '당겨서 새로고침';
        resetIndicator();
      });

      window.addEventListener('touchcancel', function () {
        pulling = false;
        if (labelEl) labelEl.textContent = '당겨서 새로고침';
        resetIndicator();
      });
    }

    // 도감 제목 내 영문 국가명 대문자 표기 — 홈은 memorabilia-shared.js 를
    // 로드하지 않으므로 /api/memorabilia/countries 를 직접 1회 fetch.
    var _hrCountryNames = null;
    function _hrLoadCountries() {
      if (_hrCountryNames) return Promise.resolve(_hrCountryNames);
      return fetch('/api/memorabilia/countries', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (data) {
          var items = (data && data.items) || [];
          _hrCountryNames = items
            .map(function (c) { return c.name_en || ''; })
            .filter(function (n) { return n && /^[\x20-\x7E]+$/.test(n); })
            .sort(function (a, b) { return b.length - a.length; });
          return _hrCountryNames;
        })
        .catch(function () { _hrCountryNames = []; return _hrCountryNames; });
    }
    function _hrUppercaseTitle(title) {
      if (!title || !_hrCountryNames || !_hrCountryNames.length) return title || '';
      var out = title;
      for (var i = 0; i < _hrCountryNames.length; i++) {
        var name = _hrCountryNames[i];
        if (name === name.toUpperCase()) continue;
        var esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp('\\b' + esc + '\\b', 'gi'), name.toUpperCase());
      }
      return out;
    }

    function loadMemorabiliaRail() {
      var grid = document.getElementById('home-memorabilia-grid');
      if (!grid) return;
      // PC 6개 fetch — 모바일은 CSS 로 처음 2개만 노출.
      // random=1 + cache-bust 로 매 페이지 진입마다 다른 항목 노출.
      Promise.all([
        GW.apiFetch('/api/memorabilia?random=1&limit=6&_=' + Date.now(), { cache: 'no-store' }),
        _hrLoadCountries(),
      ])
        .then(function (results) {
          var data = results[0];
          var items = (data && data.items) || [];
          if (!items.length) {
            grid.innerHTML = '<div class="home-memorabilia-empty">아직 등록된 도감 항목이 없습니다.</div>';
            return;
          }
          var uc = _hrUppercaseTitle;
          grid.innerHTML = items.map(function (item) {
            var slug = item.slug || ('m-' + item.id);
            var href = '/memorabilia/' + GW.escapeHtml(slug);
            var titleKo = GW.escapeHtml(item.title_ko || '');
            var titleEn = GW.escapeHtml(uc(item.title_en || ''));
            var thumb = item.primary_image_url
              ? '<img src="' + GW.escapeHtml(item.primary_image_url) + '" alt="' + titleKo + '" loading="lazy" decoding="async">'
              : '<div class="home-memo-card-noimg" aria-hidden="true">📦</div>';
            return '<a class="home-memo-card" href="' + href + '">' +
                '<div class="home-memo-card-thumb">' + thumb + '</div>' +
                '<div class="home-memo-card-body">' +
                  (titleEn ? '<div class="home-memo-card-title-en">' + titleEn + '</div>' : '') +
                  (titleKo ? '<div class="home-memo-card-title-ko">' + titleKo + '</div>' : '') +
                '</div>' +
              '</a>';
          }).join('');
        })
        .catch(function (err) {
          try { console.warn('[GW memorabilia-rail]', err); } catch (_) {}
          // 이전에는 빈 문자열로 지워 방문자에게도 운영자에게도 아무 신호가
          // 남지 않았다. 다른 홈 섹션과 같은 문구 원본 + 이슈 보고로 통일한다.
          // 클래스는 이 그리드의 빈 상태와 같은 .home-memorabilia-empty
          // (grid-column: 1 / -1) 를 써야 한 칸으로 찌그러지지 않는다.
          grid.innerHTML = '<div class="home-memorabilia-empty">' +
            GW.escapeHtml(helpers.getHomeBlockErrorMessage('memorabilia')) + '</div>';
          helpers.reportHomepageIssue('home_memorabilia_rail_failed', {
            section: 'homepage',
            message: (err && err.message) || 'memorabilia rail fetch failed',
            path: '/api/memorabilia'
          });
        });
    }

    function init() {
      if (!document.body || !document.body.hasAttribute('data-home-bootstrap')) return;
      if (window.__GW_HOME_INIT__) return;
      window.__GW_HOME_INIT__ = true;

      // nav 는 여기서 즉시 그린다. 라벨은 서버가 GW_BOOT_NAV_LABELS 로 주입하므로
      // /api/home 을 기다릴 필요가 없다. 이전에는 renderManagedNav:false 로 꺼 두고
      // applyData → applyLang 경로에서만 그려서, /api/home 이 실패·지연되면 nav 에
      // .is-ready 가 끝내 붙지 않아 상단 메뉴가 영구히 보이지 않았다.
      GW.bootstrapStandardPage({
        loadTicker: false,
        loadStats: false,
        loadTranslations: false,
        // index.html 에는 [data-board-copy-key] 요소가 하나도 없다. 요청만 낭비하고,
        // 실패하면 홈에 없는 기능에 대해 "게시판 설명을 불러오지 못했습니다" 토스트를
        // 띄우는 부작용까지 있었다.
        loadBoardCopy: false
      });
      bindRuntimeIssueReporting();
      bindHomeStatusActions();
      syncResponsiveSectionVisibility();

      lastHomeRequestAt = Date.now();

      // Stale-while-revalidate — /api/home 은 no-store 라 HTTP 캐시가 안 돼 매 방문이
      // 네트워크 대기였고, /api/home 이 가끔 수초까지 튀면 빈 홈을 응시하게 된다.
      // 직전 페이로드를 localStorage 에서 즉시 렌더해 첫 페인트를 채우고, 곧 도착하는
      // fresh 응답으로 덮어쓴다. (fresh 가 항상 뒤따르므로 잠깐의 staleness 는 허용)
      var renderedFromCache = false;
      if (typeof GW.readCachedPayload === 'function' && typeof GW.getVersionedCacheKey === 'function') {
        try {
          var cachedHome = GW.readCachedPayload(homeCacheKey(), HOME_CACHE_TTL_MS);
          if (cachedHome) {
            applyData(cachedHome, { background: true });
            renderedFromCache = true;
          }
        } catch (_) {}
      }

      homeRefreshPromise = fetchHomeData({ fresh: true })
        .then(function (data) {
          applyData(data);
          try { if (typeof GW.writeCachedPayload === 'function') GW.writeCachedPayload(homeCacheKey(), data); } catch (_) {}
        })
        .catch(function (err) {
          // 캐시로 이미 콘텐츠를 그렸다면 네트워크 실패해도 빈 화면 대신 stale 유지.
          if (!renderedFromCache) renderLoadFailure();
          helpers.reportHomepageIssue('home_initial_fetch_failed', {
            message: (err && err.message) || 'initial home fetch failed',
            path: '/api/home'
          });
        })
        .finally(function () {
          homeRefreshPromise = null;
        });

      initRefreshLifecycle();
      initPullToRefresh();
      startFreshnessTick();
      loadMemorabiliaRail();
      window.addEventListener('resize', syncResponsiveSectionVisibility);
      // 폭이 바뀌면 칩이 몇 행을 차지하는지도 바뀌므로 클램프를 다시 계산한다.
      // 리사이즈는 모바일 URL 바 여닫힘만으로도 연속 발생하므로 디바운스한다.
      window.addEventListener('resize', debouncedClampMiniLabels);
    }

    return {
      init: init,
      applyData: applyData,
      refreshHomeData: refreshHomeData
    };
  })();
})();
