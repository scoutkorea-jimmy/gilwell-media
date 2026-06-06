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

    function bindRuntimeIssueReporting() {
      if (runtimeReportBound) return;
      runtimeReportBound = true;

      window.addEventListener('error', function (event) {
        helpers.reportHomepageIssue('home_client_runtime_error', {
          message: event && event.message ? String(event.message) : 'runtime error',
          path: event && event.filename ? String(event.filename) : window.location.pathname,
          source: event && event.filename ? String(event.filename) : '',
          code: event && event.lineno ? String(event.lineno) + ':' + String(event.colno || 0) : ''
        });
      });

      window.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        helpers.reportHomepageIssue('home_client_promise_rejection', {
          message: reason && reason.message ? String(reason.message) : String(reason || 'promise rejection'),
          path: window.location.pathname,
          source: '',
          code: 'unhandledrejection'
        });
      });
    }

    function renderLoadFailure() {
      latestFatalState = true;
      latestIssueKeys = [];
      lastHomeRequestAt = 0;
      var bar = document.getElementById('home-freshness-bar');
      if (bar) bar.hidden = true;
      GW.renderTickerItems('ticker-inner');
      GW._statsData = { korea: 0, apr: 0, wosm: 0, people: 0, today: 0 };
      if (GW._renderStats) GW._renderStats();
      helpers.renderHomeFooterStats({});
      helpers.renderHomeBlockError(document.getElementById('home-lead-story'), 'lead');
      helpers.renderHomeBlockError(document.getElementById('latest-list'), 'latest');
      helpers.renderHomeBlockError(document.getElementById('popular-list'), 'popular');
      helpers.renderHomeBlockError(document.getElementById('popular-list-mobile'), 'popular');
      helpers.renderHomeBlockError(document.getElementById('picks-list'), 'picks');
      helpers.renderHomeBlockError(document.getElementById('picks-list-mobile'), 'picks');
      helpers.renderHomeBlockError(document.getElementById('col-korea'), 'korea');
      helpers.renderHomeBlockError(document.getElementById('col-apr'), 'apr');
      helpers.renderHomeBlockError(document.getElementById('col-wosm'), 'wosm');
      helpers.renderHomeBlockError(document.getElementById('col-people'), 'people');
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

    function syncResponsiveSectionVisibility() {
      var isMobile = window.matchMedia('(max-width: 900px)').matches;
      setSectionInteractiveState(document.querySelector('.home-mobile-stack'), isMobile);
      setSectionInteractiveState(document.querySelector('.home-2col'), !isMobile);
    }

    function initRefreshLifecycle() {
      window.addEventListener('pageshow', function (event) {
        refreshHomeData({ force: !!event.persisted });
      });
      window.addEventListener('focus', function () {
        refreshHomeData({ force: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshHomeData({ force: true });
      });
      homeRefreshTimer = window.setInterval(function () {
        if (document.visibilityState === 'visible') refreshHomeData();
      }, 60000);
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
          grid.innerHTML = '';
        });
    }

    function init() {
      if (!document.body || !document.body.hasAttribute('data-home-bootstrap')) return;
      if (window.__GW_HOME_INIT__) return;
      window.__GW_HOME_INIT__ = true;

      GW.bootstrapStandardPage({
        renderManagedNav: false,
        markActiveNav: false,
        loadTicker: false,
        loadStats: false,
        loadTranslations: false
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
    }

    return {
      init: init,
      applyData: applyData,
      refreshHomeData: refreshHomeData
    };
  })();
})();
