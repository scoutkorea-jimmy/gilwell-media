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
    var homeRefreshBusy = false;
    var homeRefreshTimer = null;
    var runtimeReportBound = false;
    var latestIssueKeys = [];
    var latestFatalState = false;
    var latestRefreshFailed = false;

    function fetchHomeData(options) {
      var opts = options || {};
      var query = opts.fresh ? '?_=' + Date.now() : '';
      return GW.apiFetch('/api/home' + query, {
        cache: opts.fresh ? 'no-store' : 'default'
      });
    }

    function applyData(data, options) {
      var opts = options || {};
      var issues = helpers.getHomeIssueMap(data);
      latestIssueKeys = helpers.getActiveHomeIssueKeys(issues);
      latestFatalState = false;
      latestRefreshFailed = false;
      if (data.site_meta) {
        GW._siteMetaData = data.site_meta;
        GW.applyManagedFooterData(data.site_meta);
      }
      GW._navLabels = data.nav_labels || {};
      GW._customStrings = (data.translations && data.translations.strings) || {};
      GW.applyLang();
      GW._statsData = data.stats || null;
      if (GW._statsData) GW._renderStats();
      GW.renderTickerItems('ticker-inner', data.ticker && data.ticker.items);
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
      lastHomeRefreshAt = Date.now();
      syncHomeStatusBanner();
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
      if (homeRefreshBusy) return Promise.resolve();
      if (!opts.force && now - lastHomeRefreshAt < 30000) return Promise.resolve();
      homeRefreshBusy = true;
      return fetchHomeData({ fresh: true })
        .then(function (data) {
          applyData(data, { background: true });
        })
        .catch(function (err) {
          try { console.warn('[GW home-refresh-failed]', err); } catch (_) {}
          latestRefreshFailed = true;
          syncHomeStatusBanner();
          helpers.reportHomepageIssue('home_latest_refresh_failed', {
            section: 'homepage',
            message: (err && err.message) || 'background home refresh failed',
            path: '/api/home'
          });
        })
        .finally(function () {
          homeRefreshBusy = false;
        });
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
        refreshHomeData({ force: true });
      });
      banner.dataset.bound = '1';
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

      fetchHomeData({ fresh: true })
        .then(function (data) {
          applyData(data);
        })
        .catch(function (err) {
          renderLoadFailure();
          helpers.reportHomepageIssue('home_initial_fetch_failed', {
            message: (err && err.message) || 'initial home fetch failed',
            path: '/api/home'
          });
        });

      initRefreshLifecycle();
      initPullToRefresh();
    }

    return {
      init: init,
      applyData: applyData,
      refreshHomeData: refreshHomeData
    };
  })();
})();
