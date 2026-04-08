(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.GW) return;

  var GW = window.GW;
  var HOME_COLUMN_KEYS = ['korea', 'apr', 'wosm', 'people'];
  var HOME_EMPTY_TARGETS = [
    'home-lead-story',
    'latest-list',
    'popular-list',
    'popular-list-mobile',
    'picks-list',
    'picks-list-mobile',
    'col-korea',
    'col-apr',
    'col-wosm',
    'col-people'
  ];
  var HOME_MINI_SECTIONS = [
    { id: 'latest-list', source: 'latestRail', empty: '아직 게시글이 없습니다' },
    { id: 'popular-list', source: 'popularRail', empty: '아직 게시글이 없습니다' },
    { id: 'popular-list-mobile', source: 'popularRail', empty: '아직 게시글이 없습니다' },
    { id: 'picks-list', source: 'picksRail', empty: '에디터 추천 게시글이 없습니다' },
    { id: 'picks-list-mobile', source: 'picksRail', empty: '에디터 추천 게시글이 없습니다' }
  ];

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
    var labels = [];
    if (!opts.hideCategoryChip) {
      labels.push('<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>');
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

  function buildMiniItem(post, options) {
    var thumb = post.image_url
      ? '<img class="mini-thumb" src="' + GW.escapeHtml(post.image_url) + '" loading="lazy" alt="">'
      : '';
    return (
      '<article class="mini-item">' +
        '<div class="mini-item-row">' +
          '<div class="mini-item-text">' +
            '<div class="mini-item-labels">' + buildMiniLabels(post, options) + '</div>' +
            '<h4><a class="mini-item-link" href="/post/' + post.id + '">' + GW.escapeHtml(post.title) + '</a></h4>' +
            '<div class="mini-meta">' + GW.formatPostDate(post) + '</div>' +
            '<div class="mini-item-actions">' + buildMiniShareButton(post) + '</div>' +
          '</div>' +
          thumb +
        '</div>' +
      '</article>'
    );
  }

  function renderLeadStory(el, post, label, leadMedia) {
    if (!el) return;
    if (!post) {
      el.innerHTML = '<div class="mini-empty">대표 기사를 준비 중입니다</div>';
      return;
    }
    var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var subtitle = (post.subtitle || '').trim();
    var excerpt = GW.truncate(post.content || '', 420);
    var tags = getSortedPostTags(post);
    if (excerpt === subtitle) excerpt = '';

    var thumb = post.image_url
      ? '<a class="home-lead-thumb-link' + (isTransparentPng(post.image_url) ? ' is-png' : '') + '" style="' + getResponsiveMediaStyle(leadMedia) + '" href="/post/' + post.id + '">' +
          '<span class="home-lead-thumb-backdrop" aria-hidden="true" style="background-image:url(' + GW.escapeHtml(post.image_url) + ')"></span>' +
          '<img class="home-lead-thumb" src="' + GW.escapeHtml(post.image_url) + '" alt="' + GW.escapeHtml(post.title) + '" loading="eager" fetchpriority="high" decoding="async">' +
        '</a>'
      : '';

    el.innerHTML =
      '<article class="home-lead-card">' +
        thumb +
        '<div class="home-lead-body">' +
          '<div class="home-lead-copy">' +
            '<div class="home-lead-labels">' +
              '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
              tags.map(function (tag) {
                return '<span class="post-kicker tag-' + GW.escapeHtml(post.category) + '-kicker">' + GW.escapeHtml(tag) + '</span>';
              }).join('') +
              '<span class="home-lead-kicker">' + GW.escapeHtml(label || '메인 스토리') + '</span>' +
              (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
            '</div>' +
            '<h3><a class="home-lead-link" href="/post/' + post.id + '">' + GW.escapeHtml(post.title) + '</a></h3>' +
            (subtitle ? '<p class="home-lead-subtitle">' + GW.escapeHtml(subtitle) + '</p>' : '') +
            (excerpt ? '<p class="home-lead-excerpt">' + GW.escapeHtml(excerpt) + '</p>' : '') +
          '</div>' +
          '<div class="home-lead-footer">' +
            '<div class="home-lead-meta">' + GW.formatPostDate(post) + (post.author ? ' · ' + GW.escapeHtml(post.author) : '') + '</div>' +
            '<div class="home-lead-actions">' +
              '<a class="home-subscribe-btn" href="/post/' + post.id + '">기사 읽기</a>' +
              '<button class="home-subscribe-btn secondary" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    bindShareButtons(el, '[data-share-url]');
  }

  function renderMiniList(el, posts, emptyMsg, options) {
    if (!el) return;
    if (!posts || !posts.length) {
      el.innerHTML = '<div class="mini-empty">' + (emptyMsg || '게시글이 없습니다') + '</div>';
      return;
    }
    el.innerHTML = posts.map(function (post) {
      return buildMiniItem(post, options);
    }).join('');
    bindShareButtons(el, '.mini-share-link');
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

  function renderHero(data) {
    var slides = [];
    var current = 0;
    var timer = null;
    var animating = false;
    var intervalMs = (data && data.interval_ms) || 3000;
    var touchState = null;
    var paused = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var suppressClickUntil = 0;

    function buildSlide(post, index) {
      var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
      var heroTags = getSortedPostTags(post);
      var div = document.createElement('div');
      div.className = 'site-hero site-hero-slide';
      if (isTransparentPng(post.image_url)) div.classList.add('site-hero-png');
      div.setAttribute('data-post-id', post.id);

      var mediaMarkup = '';
      if (post.image_url) {
        div.classList.add('has-bg');
        mediaMarkup =
          '<div class="site-hero-media' + (isTransparentPng(post.image_url) ? ' is-png' : '') + '" aria-hidden="true" style="' + getResponsiveMediaStyle(post.media) + '">' +
            '<div class="site-hero-media-backdrop" style="background-image:url(' + GW.escapeHtml(post.image_url) + ')"></div>' +
            '<img class="site-hero-media-img" src="' + GW.escapeHtml(post.image_url) + '" alt="" loading="' + (index === 0 ? 'eager' : 'lazy') + '" fetchpriority="' + (index === 0 ? 'high' : 'auto') + '" decoding="async">' +
          '</div>';
      }

      div.innerHTML =
        mediaMarkup +
        '<div class="site-hero-bg-text">' + (post.subtitle ? GW.escapeHtml(post.subtitle) : '') + '</div>' +
        '<div class="site-hero-content">' +
          '<div class="site-hero-labels">' +
            '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
            heroTags.map(function (tag) {
              return '<span class="post-kicker tag-' + GW.escapeHtml(post.category) + '-kicker">' + GW.escapeHtml(tag) + '</span>';
            }).join('') +
            (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
          '</div>' +
          '<h2 class="site-hero-title">' + GW.escapeHtml(post.title) + '</h2>' +
          (post.subtitle ? '<p class="site-hero-subtitle">' + GW.escapeHtml(post.subtitle) + '</p>' : '') +
          '<div class="site-hero-actions">' +
            '<a class="site-hero-cta" href="/post/' + post.id + '">소식 읽기 →</a>' +
            '<button class="site-hero-share-btn" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button>' +
          '</div>' +
        '</div>';

      bindShareButtons(div, '.site-hero-share-btn');
      div.style.cursor = 'pointer';
      div.addEventListener('click', function (event) {
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          return;
        }
        if (!event.target.classList.contains('site-hero-cta') && !event.target.classList.contains('site-hero-share-btn')) {
          window.location.href = '/post/' + post.id;
        }
      });
      return div;
    }

    function renderDots(count, active) {
      var dotsEl = document.getElementById('hero-dots');
      if (!dotsEl) return;
      if (count <= 1) {
        dotsEl.innerHTML = '';
        return;
      }
      dotsEl.innerHTML = Array.from({ length: count }, function (_, index) {
        return '<button type="button" class="hero-dot' + (index === active ? ' active' : '') + '" aria-label="슬라이드 ' + (index + 1) + '"' + (index === active ? ' aria-current="true"' : ' aria-current="false"') + '></button>';
      }).join('');
      dotsEl.querySelectorAll('.hero-dot').forEach(function (btn, index) {
        btn.addEventListener('click', function () {
          goTo(index, index > current ? 1 : -1);
        });
      });
    }

    function setAutoTimer() {
      clearInterval(timer);
      if (!paused && slides.length > 1) {
        timer = setInterval(function () {
          goTo(current + 1, 1);
        }, intervalMs);
      }
    }

    function syncPauseButton() {
      var btn = document.getElementById('hero-pause-btn');
      if (!btn) return;
      btn.hidden = slides.length <= 1;
      btn.textContent = paused ? '재생' : '일시정지';
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.setAttribute('aria-label', paused ? '메인 슬라이드 자동 전환 다시 재생' : '메인 슬라이드 자동 전환 일시정지');
      btn.classList.toggle('is-paused', paused);
    }

    function bindPauseButton() {
      var btn = document.getElementById('hero-pause-btn');
      if (!btn) return;
      btn.onclick = function () {
        paused = !paused;
        syncPauseButton();
        setAutoTimer();
      };
      syncPauseButton();
    }

    function bindTouchNavigation(slider) {
      if (!slider || slides.length <= 1) return;
      slider.addEventListener('touchstart', function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        var touch = event.touches[0];
        touchState = {
          startX: touch.clientX,
          startY: touch.clientY,
          deltaX: 0,
          deltaY: 0,
        };
      }, { passive: true });

      slider.addEventListener('touchmove', function (event) {
        if (!touchState || !event.touches || event.touches.length !== 1) return;
        var touch = event.touches[0];
        touchState.deltaX = touch.clientX - touchState.startX;
        touchState.deltaY = touch.clientY - touchState.startY;
      }, { passive: true });

      slider.addEventListener('touchend', function () {
        if (!touchState) return;
        var deltaX = touchState.deltaX;
        var deltaY = touchState.deltaY;
        touchState = null;
        if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY) || animating) return;
        suppressClickUntil = Date.now() + 450;
        goTo(current + (deltaX < 0 ? 1 : -1), deltaX < 0 ? 1 : -1);
      });
    }

    function normalizeOffscreen(slide, direction) {
      slide.classList.remove('active', 'before', 'transitioning');
      slide.style.visibility = 'hidden';
      slide.style.pointerEvents = 'none';
      slide.style.transform = direction < 0 ? 'translateX(-100%)' : 'translateX(100%)';
    }

    function goTo(index, direction) {
      var slider = document.getElementById('site-hero-slider');
      if (!slider || !slides.length || animating) return;
      var nextIndex = (index + slides.length) % slides.length;
      if (nextIndex === current) return;
      animating = true;

      var currentSlide = slides[current];
      var nextSlide = slides[nextIndex];

      currentSlide.classList.remove('before');
      currentSlide.classList.add('active', 'transitioning');
      currentSlide.style.visibility = 'visible';
      currentSlide.style.pointerEvents = 'none';
      currentSlide.style.transform = 'translateX(0)';

      nextSlide.classList.remove('active', 'before');
      nextSlide.classList.add('transitioning');
      nextSlide.style.visibility = 'visible';
      nextSlide.style.pointerEvents = 'none';
      nextSlide.style.transform = direction > 0 ? 'translateX(100%)' : 'translateX(-100%)';

      nextSlide.offsetWidth;
      requestAnimationFrame(function () {
        currentSlide.style.transform = direction > 0 ? 'translateX(-100%)' : 'translateX(100%)';
        nextSlide.style.transform = 'translateX(0)';
      });

      setTimeout(function () {
        slides.forEach(function (slide, slideIndex) {
          if (slideIndex === nextIndex) {
            slide.classList.remove('before', 'transitioning');
            slide.classList.add('active');
            slide.style.visibility = 'visible';
            slide.style.pointerEvents = 'auto';
            slide.style.transform = 'translateX(0)';
          } else if (slideIndex === current) {
            slide.classList.remove('active', 'before', 'transitioning');
            if (direction > 0) slide.classList.add('before');
            slide.style.visibility = 'hidden';
            slide.style.pointerEvents = 'none';
            slide.style.transform = direction > 0 ? 'translateX(-100%)' : 'translateX(100%)';
          } else {
            normalizeOffscreen(slide, 1);
          }
        });
        current = nextIndex;
        animating = false;
        renderDots(slides.length, current);
        setAutoTimer();
      }, 560);
    }

    var posts = data && data.posts ? data.posts : [];
    if (!posts.length) return;

    var slider = document.getElementById('site-hero-slider');
    if (!slider) return;
    var staticSlide = document.getElementById('site-hero-static');
    if (staticSlide) staticSlide.remove();

    posts.forEach(function (post, index) {
      var slide = buildSlide(post, index);
      if (index === 0) {
        slide.classList.add('active');
        slide.style.visibility = 'visible';
        slide.style.pointerEvents = 'auto';
        slide.style.transform = 'translateX(0)';
      } else {
        slide.style.visibility = 'hidden';
        slide.style.pointerEvents = 'none';
        slide.style.transform = 'translateX(100%)';
      }
      slider.appendChild(slide);
      slides.push(slide);
    });

    renderDots(posts.length, 0);
    bindTouchNavigation(slider);
    bindPauseButton();
    setAutoTimer();
  }

  GW.HomePage = (function () {
    var latestRefreshAt = 0;
    var latestRefreshBusy = false;
    var latestRefreshTimer = null;

    function fetchHomeData(options) {
      var opts = options || {};
      var query = opts.fresh ? '?_=' + Date.now() : '';
      return GW.apiFetch('/api/home' + query, {
        cache: opts.fresh ? 'no-store' : 'default'
      });
    }

    function buildHomeSections(data) {
      var latestPosts = sortPostsLatest(data.latest && data.latest.posts ? data.latest.posts : []);
      var popularPosts = data.popular && data.popular.posts ? data.popular.posts : [];
      var picksPosts = data.picks && data.picks.posts ? data.picks.posts : [];
      return {
        latestPosts: latestPosts,
        popularPosts: popularPosts,
        picksPosts: picksPosts,
        columns: data.columns || {},
        latestRail: latestPosts.slice(0, 3),
        popularRail: (popularPosts.length ? popularPosts : latestPosts).slice(0, 4),
        picksRail: picksPosts.slice(0, 4)
      };
    }

    function applyMiniSections(viewModel) {
      HOME_MINI_SECTIONS.forEach(function (section) {
        renderMiniList(
          document.getElementById(section.id),
          viewModel[section.source] || [],
          section.empty
        );
      });

      HOME_COLUMN_KEYS.forEach(function (key) {
        renderMiniList(
          document.getElementById('col-' + key),
          viewModel.columns[key] && viewModel.columns[key].posts ? viewModel.columns[key].posts.slice(0, 4) : [],
          '게시글이 없습니다',
          { hideCategoryChip: true }
        );
      });
    }

    function applyData(data) {
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
      renderHomeFooterStats(data.analytics || {});
      renderHero(data.hero || {});

      var viewModel = buildHomeSections(data);
      var leadPost = (data.lead && data.lead.post) || (viewModel.picksPosts.length ? viewModel.picksPosts[0] : viewModel.latestPosts[0]) || null;
      var leadMedia = (data.lead && data.lead.post && leadPost && data.lead.post.id === leadPost.id) ? data.lead.media : null;
      renderLeadStory(
        document.getElementById('home-lead-story'),
        leadPost,
        (data.lead && data.lead.post) ? '메인 스토리' : (viewModel.picksPosts.length ? '추천 기사' : '대표 기사'),
        leadMedia
      );
      applyMiniSections(viewModel);
      latestRefreshAt = Date.now();
    }

    function applyLatestRail(data) {
      var latestPosts = sortPostsLatest(data.latest && data.latest.posts ? data.latest.posts : []);
      renderMiniList(document.getElementById('latest-list'), latestPosts.slice(0, 3), '아직 게시글이 없습니다');
      latestRefreshAt = Date.now();
    }

    function refreshLatestRail(options) {
      var opts = options || {};
      var now = Date.now();
      if (latestRefreshBusy) return Promise.resolve();
      if (!opts.force && now - latestRefreshAt < 30000) return Promise.resolve();
      latestRefreshBusy = true;
      return fetchHomeData({ fresh: true })
        .then(function (data) { applyLatestRail(data); })
        .catch(function () {})
        .finally(function () { latestRefreshBusy = false; });
    }

    function renderLoadFailure() {
      GW.loadTicker('ticker-inner');
      GW.loadStats();
      GW.loadTranslations();
      HOME_EMPTY_TARGETS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="mini-empty">불러오지 못했습니다</div>';
      });
    }

    function initRefreshLifecycle() {
      window.addEventListener('pageshow', function (event) {
        refreshLatestRail({ force: !!event.persisted });
      });
      window.addEventListener('focus', function () {
        refreshLatestRail({ force: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshLatestRail({ force: true });
      });
      latestRefreshTimer = window.setInterval(function () {
        if (document.visibilityState === 'visible') refreshLatestRail();
      }, 60000);
    }

    function initPullToRefresh() {
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

      fetchHomeData({ fresh: true })
        .then(function (data) { applyData(data); })
        .catch(function () { renderLoadFailure(); });

      initRefreshLifecycle();
      initPullToRefresh();
    }

    return {
      init: init,
      refreshLatestRail: refreshLatestRail,
      applyData: applyData
    };
  })();

  document.addEventListener('DOMContentLoaded', function () {
    GW.HomePage.init();
  });
})();
