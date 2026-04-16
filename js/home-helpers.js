(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.GW) return;

  var GW = window.GW;
  var HOME_FAILURE_MESSAGES = {
    home: '홈 화면 데이터를 잠시 불러오지 못했습니다',
    lead: '메인 스토리를 잠시 불러오지 못했습니다',
    latest: '최신 소식을 잠시 불러오지 못했습니다',
    popular: '인기 소식을 잠시 불러오지 못했습니다',
    picks: '에디터 추천을 잠시 불러오지 못했습니다',
    korea: 'Korea 소식을 잠시 불러오지 못했습니다',
    apr: 'APR 소식을 잠시 불러오지 못했습니다',
    wosm: 'WOSM 소식을 잠시 불러오지 못했습니다',
    people: '스카우트 인물 소식을 잠시 불러오지 못했습니다'
  };
  var HOME_FAILURE_LABELS = {
    site_meta: '사이트 메타',
    nav_labels: '메뉴명',
    translations: '번역',
    ticker: '상단 티커',
    stats: '상단 통계',
    analytics: '푸터 통계',
    hero: '히어로',
    lead: '메인 스토리',
    latest: '최신 소식',
    popular: '인기 소식',
    picks: '에디터 추천',
    korea: 'Korea',
    apr: 'APR',
    wosm: 'WOSM',
    people: '스카우트 인물'
  };

  function getHomeIssueMap(data) {
    return data && data.issues && typeof data.issues === 'object' ? data.issues : {};
  }

  function getHomeBlockErrorMessage(key) {
    return HOME_FAILURE_MESSAGES[key] || HOME_FAILURE_MESSAGES.home;
  }

  function renderHomeBlockError(el, key) {
    if (!el) return;
    el.innerHTML = '<div class="mini-empty">' + GW.escapeHtml(getHomeBlockErrorMessage(key)) + '</div>';
  }

  function getActiveHomeIssueKeys(issues) {
    var issueMap = getHomeIssueMap({ issues: issues });
    return Object.keys(issueMap).filter(function (key) {
      return !!issueMap[key];
    });
  }

  function getHomeIssueLabels(keys) {
    return (Array.isArray(keys) ? keys : []).map(function (key) {
      return HOME_FAILURE_LABELS[key] || key;
    });
  }

  function renderHomeStatusBanner(options) {
    var el = document.getElementById('home-runtime-alert');
    if (!el) return;
    var opts = options || {};
    if (!opts.type) {
      el.hidden = true;
      el.className = 'home-runtime-alert';
      el.innerHTML = '';
      return;
    }

    var title = '';
    var message = '';
    var detail = '';
    var retry = opts.retry !== false;
    if (opts.type === 'partial') {
      var labels = getHomeIssueLabels(opts.issueKeys);
      title = '홈 일부 섹션이 임시 기본값으로 표시되고 있습니다.';
      message = '데이터를 불러오지 못한 영역은 비어 보이거나 기본 상태로 대체될 수 있습니다.';
      detail = labels.length ? labels.slice(0, 4).join(' · ') : '';
    } else if (opts.type === 'refresh') {
      title = '최신 홈 데이터를 다시 불러오지 못했습니다.';
      message = '지금 보이는 내용은 이전 상태일 수 있습니다.';
    } else if (opts.type === 'fatal') {
      title = '홈 데이터를 불러오지 못했습니다.';
      message = '일시적인 연결 문제이거나 서버 응답이 지연되고 있습니다.';
    }

    el.hidden = false;
    el.className = 'home-runtime-alert is-' + opts.type;
    el.innerHTML =
      '<div class="home-runtime-alert-copy">' +
        '<strong>' + GW.escapeHtml(title) + '</strong>' +
        '<span>' + GW.escapeHtml(message) + '</span>' +
        (detail ? '<small>' + GW.escapeHtml(detail) + '</small>' : '') +
      '</div>' +
      (retry ? '<button type="button" class="home-runtime-alert-btn" data-home-retry="1">다시 시도</button>' : '');
  }

  function getStableIssueFingerprint(code, detail) {
    var source = detail && typeof detail === 'object' ? detail : {};
    var stable = {};
    Object.keys(source).sort().forEach(function (key) {
      stable[key] = source[key];
    });
    return String(code || '').trim() + '|' + JSON.stringify(stable);
  }

  function reportHomepageIssue(code, detail) {
    var reportCode = String(code || '').trim();
    if (!reportCode || typeof fetch !== 'function') return;
    var fingerprint = getStableIssueFingerprint(reportCode, detail || {});
    try {
      var sessionKey = '__gw_home_issue__' + fingerprint;
      if (window.sessionStorage && window.sessionStorage.getItem(sessionKey)) return;
      if (window.sessionStorage) window.sessionStorage.setItem(sessionKey, '1');
    } catch (_) {}

    var payload = JSON.stringify({
      code: reportCode,
      detail: detail || {}
    });

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/homepage-issues/report', blob);
        return;
      }
    } catch (_) {}

    try {
      fetch('/api/homepage-issues/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (_) {}
  }

  function getPostIdsSignature(posts) {
    return (Array.isArray(posts) ? posts : []).map(function (post) {
      return String(post && post.id || 0);
    }).join(',');
  }

  function getHeroSignature(hero) {
    var posts = hero && Array.isArray(hero.posts) ? hero.posts : [];
    return JSON.stringify({
      interval_ms: hero && hero.interval_ms || 0,
      posts: posts.map(function (post) {
        return {
          id: post && post.id || 0,
          image_url: post && post.image_url || '',
          media: post && post.media || null
        };
      })
    });
  }

  function getSortedPostTags(post) {
    return String((post && post.tag) || '')
      .split(',')
      .map(function (tag) { return tag.trim(); })
      .filter(Boolean)
      .sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  function isTransparentPng(url) {
    var value = String(url || '').trim().toLowerCase();
    return value.indexOf('data:image/png') === 0 || /\.png(?:$|[?#])/i.test(value);
  }

  function buildMiniLabels(post, options) {
    var opts = options || {};
    var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var categoryLabel = GW.getCategoryLabel(post.category);
    var labels = [];
    if (!opts.hideCategoryChip) {
      labels.push('<span class="category-tag ' + cat.tagClass + '">' + GW.escapeHtml(categoryLabel) + '</span>');
    }
    getSortedPostTags(post).forEach(function (tag) {
      labels.push('<span class="post-kicker tag-' + GW.escapeHtml(post.category) + '-kicker">' + GW.escapeHtml(tag) + '</span>');
    });
    if (GW.isPostNew(post)) labels.push('<span class="post-kicker post-kicker-new">NEW</span>');
    return labels.join('');
  }

  function buildMiniShareButton(post) {
    return '<button class="mini-share-link" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button>';
  }

  function normalizeResponsiveMedia(media) {
    var raw = media && typeof media === 'object' ? media : {};
    function clamp(value, min, max, fallback) {
      var parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, parsed));
    }
    var fallbackDesktop = {
      position_x: clamp(raw.position_x, 0, 100, 50),
      position_y: clamp(raw.position_y, 0, 100, 50),
      zoom: clamp(raw.zoom, 60, 150, 100),
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
        position_x: clamp(desktop.position_x, 0, 100, fallbackDesktop.position_x),
        position_y: clamp(desktop.position_y, 0, 100, fallbackDesktop.position_y),
        zoom: clamp(desktop.zoom, 60, 150, fallbackDesktop.zoom),
      },
      mobile: {
        position_x: clamp(mobile.position_x, 0, 100, fallbackMobile.position_x),
        position_y: clamp(mobile.position_y, 0, 100, fallbackMobile.position_y),
        zoom: clamp(mobile.zoom, 60, 150, fallbackMobile.zoom),
      },
    };
  }

  function getBackdropOpacity(zoom) {
    return zoom < 100 ? '0.40' : '0';
  }

  function getResponsiveMediaStyle(media) {
    var config = normalizeResponsiveMedia(media);
    return [
      '--media-fit:' + config.fit,
      '--media-render-fit-desktop:' + (config.desktop.zoom < 100 ? 'contain' : config.fit),
      '--media-pos-x-desktop:' + config.desktop.position_x + '%',
      '--media-pos-y-desktop:' + config.desktop.position_y + '%',
      '--media-origin-x-desktop:' + config.desktop.position_x + '%',
      '--media-origin-y-desktop:' + config.desktop.position_y + '%',
      '--media-zoom-desktop:' + (config.desktop.zoom / 100).toFixed(2),
      '--media-backdrop-opacity-desktop:' + getBackdropOpacity(config.desktop.zoom),
      '--media-render-fit-mobile:' + (config.mobile.zoom < 100 ? 'contain' : config.fit),
      '--media-pos-x-mobile:' + config.mobile.position_x + '%',
      '--media-pos-y-mobile:' + config.mobile.position_y + '%',
      '--media-origin-x-mobile:' + config.mobile.position_x + '%',
      '--media-origin-y-mobile:' + config.mobile.position_y + '%',
      '--media-zoom-mobile:' + (config.mobile.zoom / 100).toFixed(2),
      '--media-backdrop-opacity-mobile:' + getBackdropOpacity(config.mobile.zoom)
    ].join(';');
  }

  function bindShareButtons(root, selector) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var path = btn.getAttribute('data-share-url') || '';
        var title = btn.getAttribute('data-share-title') || '';
        var url = new URL(path, window.location.origin).toString();
        GW.sharePostLink({ url: url, title: title, text: title })
          .catch(function (err) {
            GW.showToast((err && err.message) || '링크 공유에 실패했습니다', 'error');
          });
      });
    });
  }

  function getPostSortTime(post) {
    if (!post || typeof post !== 'object') return 0;
    var raw = post.publish_at || post.created_at || '';
    if (!raw) return 0;
    var normalized = String(raw).trim().replace(' ', 'T');
    var withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+00:00';
    var value = Date.parse(withZone);
    return Number.isFinite(value) ? value : 0;
  }

  function sortPostsLatest(posts) {
    return (Array.isArray(posts) ? posts.slice() : []).sort(function (a, b) {
      return getPostSortTime(b) - getPostSortTime(a) || Number(b && b.id || 0) - Number(a && a.id || 0);
    });
  }

  function renderHomeFooterStats(data) {
    var total = document.getElementById('home-total-visitors');
    var totalViews = document.getElementById('home-total-views');
    var visitors = document.getElementById('home-today-visitors');
    if (total) total.textContent = GW.formatNumber(data.total_visits || data.total_unique || 0);
    if (totalViews) totalViews.textContent = GW.formatNumber(data.total_pageviews || data.today_views || 0);
    if (visitors) visitors.textContent = GW.formatNumber(data.today_visits || data.today_unique || 0);
  }

  GW.HomeHelpers = {
    getHomeIssueMap: getHomeIssueMap,
    getHomeBlockErrorMessage: getHomeBlockErrorMessage,
    renderHomeBlockError: renderHomeBlockError,
    getActiveHomeIssueKeys: getActiveHomeIssueKeys,
    getHomeIssueLabels: getHomeIssueLabels,
    renderHomeStatusBanner: renderHomeStatusBanner,
    reportHomepageIssue: reportHomepageIssue,
    getPostIdsSignature: getPostIdsSignature,
    getHeroSignature: getHeroSignature,
    getSortedPostTags: getSortedPostTags,
    isTransparentPng: isTransparentPng,
    buildMiniLabels: buildMiniLabels,
    buildMiniShareButton: buildMiniShareButton,
    normalizeResponsiveMedia: normalizeResponsiveMedia,
    getResponsiveMediaStyle: getResponsiveMediaStyle,
    bindShareButtons: bindShareButtons,
    getPostSortTime: getPostSortTime,
    sortPostsLatest: sortPostsLatest,
    renderHomeFooterStats: renderHomeFooterStats
  };
})();
