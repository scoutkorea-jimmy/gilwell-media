(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.GW) return;
  var GW = window.GW;

  GW.STRINGS = {
    'nav.contributors': { ko: '도움을 주신 분들', en: 'Contributors' },
    'nav.home': { ko: '홈', en: 'Home' },
    'nav.latest': { ko: '1개월 소식', en: 'Last 30 Days' },
    'nav.korea': { ko: 'Korea', en: 'Korea' },
    'nav.apr': { ko: 'APR', en: 'APR' },
    'nav.wosm': { ko: 'WOSM', en: 'WOSM' },
    'nav.wosm_members': { ko: '세계연맹 회원국 현황', en: 'WOSM Members Status' },
    'nav.people': { ko: '스카우트 인물', en: 'Scout People' },
    'nav.calendar': { ko: '캘린더', en: 'Calendar' },
    'nav.glossary': { ko: '용어집', en: 'Glossary' },
    'hero.eyebrow': { ko: 'BP미디어 · bpmedia.net', en: 'BPmedia · bpmedia.net' },
    'hero.title': { ko: '스카우트 운동의 소식을\n기록합니다', en: 'Recording the\nScout Movement' },
    'hero.sub': { ko: '한국스카우트연맹과 세계스카우트연맹의 소식을 자발적인 봉사로 전합니다', en: 'Delivering Scout news through volunteer effort.' },
    'hero.cta': { ko: '소식 읽기 →', en: 'Read More →' },
    'section.latest': { ko: '최신 소식', en: 'Latest News' },
    'section.popular': { ko: '인기 소식', en: 'Popular News' },
    'section.picks': { ko: '에디터 추천', en: "Editor's Picks" },
    'home.more': { ko: '더보기 →', en: 'More →' },
    'footer.title': { ko: 'BP미디어', en: 'BPmedia' },
    'footer.sections': { ko: '섹션', en: 'Sections' },
    'footer.join': { ko: '봉사자 모집', en: 'Join Us' },
    'footer.join.text': {
      ko: 'BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다. 함께 글을 작성해 주실 봉사자를 모집하고 있습니다. 관심 있으신 분들은 이메일로 연락해 주세요.',
      en: 'BPmedia is operated by Scout network volunteers. We are looking for contributors. Please contact us by email.',
    },
    'footer.copyright': {
      ko: '© 2026 BP미디어 · bpmedia.net',
      en: '© 2026 BPmedia · bpmedia.net',
    },
    'footer.disclaimer': {
      ko: 'BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다.',
      en: 'BPmedia is not an official channel of KSA or WOSM. Operated by volunteer contributors.',
    },
    'link.latest': { ko: '1개월 소식 — 최근 30일간의 세계 스카우트 소식', en: 'Last 30 Days — Scout news from the last month' },
    'link.korea': { ko: 'Korea — 한국스카우트연맹', en: 'Korea — Korea Scout Association' },
    'link.apr': { ko: 'APR — 아시아태평양', en: 'APR — Asia-Pacific' },
    'link.wosm': { ko: 'WOSM — 세계스카우트연맹', en: 'WOSM — World Scout Organization' },
    'link.people': { ko: '스카우트 인물 — 국내외 스카우트 인물', en: 'Scout People — Scouts Around the World' },
    'link.glossary': { ko: '용어집 — 국문·영문·불어 스카우트 용어', en: 'Glossary — Korean, English, French Scout Terms' },
    'board.latest.banner': { ko: '30 Days', en: '30 Days' },
    'board.latest.title': { ko: '최근 1개월 소식', en: 'Last 30 Days' },
    'board.latest.desc': { ko: '최근 30일 동안 한국을 포함한 세계의 스카우트 소식을 한 번에 모아봅니다.', en: 'Scout news from Korea and around the world from the last 30 days.' },
    'board.korea.banner': { ko: 'Korea / KSA', en: 'Korea / KSA' },
    'board.korea.title': { ko: '한국스카우트연맹', en: 'Korea Scout Association' },
    'board.korea.desc': { ko: '국내 스카우트 운동의 소식과 기록을 전합니다.', en: 'News and records from domestic Scout activities.' },
    'board.apr.banner': { ko: 'APR', en: 'APR' },
    'board.apr.title': { ko: '아시아태평양 지역', en: 'Asia-Pacific Region' },
    'board.apr.desc': { ko: '아시아태평양 스카우트 지역의 동향과 소식을 전합니다.', en: 'Trends and news from the Asia-Pacific Scout Region.' },
    'board.wosm.banner': { ko: 'WOSM', en: 'WOSM' },
    'board.wosm.title': { ko: '세계스카우트연맹', en: 'World Scout Organization (WOSM)' },
    'board.wosm.desc': { ko: '세계스카우트연맹(WOSM)의 글로벌 소식과 동향을 전합니다.', en: 'Global news and trends from WOSM.' },
    'board.translation.note': { ko: '일부 게시글은 번역 자료를 바탕으로 작성되어 표현이 완전히 정확하지 않을 수 있습니다. 더 나은 번역 제안은 언제든 환영합니다.', en: 'Some posts are based on translated source materials, so wording may not be perfectly exact. Suggestions for better translations are always welcome.' },
    'board.people.banner': { ko: 'Scout People', en: 'Scout People' },
    'board.people.title': { ko: '스카우트 인물', en: 'Scout People' },
    'board.people.desc': { ko: '국내외 스카우트 출신 인물과 활동 중인 스카우트, 먼저 떠난 스카우트 선배들을 조명합니다.', en: 'Spotlighting Scouts around the world, including active Scouts, Scout alumni, and departed Scout seniors.' },
    'board.glossary.banner': { ko: '용어집', en: 'Glossary' },
    'board.glossary.title': { ko: '스카우트 용어집', en: 'Scout Glossary' },
    'board.glossary.desc': { ko: '스카우트 용어를 국문·영문·불어 3개 국어 기준으로 정리합니다.', en: 'A trilingual glossary of Scout terms in Korean, English, and French.' },
    'write.btn': { ko: '✏ 글쓰기', en: '✏ Write' },
    'loadmore.btn': { ko: '더 보기', en: 'Load More' },
    'stat.korea': { ko: '한국소식', en: 'Korea' },
    'stat.apr': { ko: 'APR소식', en: 'APR' },
    'stat.wosm': { ko: 'WOSM소식', en: 'WOSM' },
    'stat.people': { ko: '인물소식', en: 'People' },
    'stat.today': { ko: '오늘 공유된 소식', en: 'Today' },
    'stat.unit': { ko: '건', en: '' },
  };

  GW._customStrings = window.GW_BOOT_CUSTOM_STRINGS || {};
  GW._navLabels = window.GW_BOOT_NAV_LABELS || {};
  GW.lang = localStorage.getItem('gw_lang') || 'ko';
  GW.LOCKED_TRANSLATION_KEYS = {
    'nav.contributors': true,
    'nav.home': true,
    'nav.latest': true,
    'nav.korea': true,
    'nav.apr': true,
    'nav.wosm': true,
    'nav.wosm_members': true,
    'nav.people': true,
    'nav.calendar': true,
    'nav.glossary': true,
  };

  GW.t = function (key) {
    if (GW.LOCKED_TRANSLATION_KEYS[key]) {
      var navEntry = (GW._navLabels && GW._navLabels[key]) || (GW.STRINGS[key] || {});
      var navLang = GW.lang;
      return navEntry[navLang] !== undefined ? navEntry[navLang] : (navEntry.ko || key);
    }
    var custom = GW._customStrings || {};
    var lang = GW.lang;
    var useCustom = !GW.LOCKED_TRANSLATION_KEYS[key] && custom[key];
    var entry = useCustom ? custom[key] : (GW.STRINGS[key] || {});
    return entry[lang] !== undefined ? entry[lang] : (entry.ko || key);
  };

  GW.NAV_ITEMS = [
    { href: '/contributors', key: 'nav.contributors' },
    { href: '/', key: 'nav.home' },
    { href: '/latest', key: 'nav.latest' },
    { href: '/korea', key: 'nav.korea' },
    { href: '/apr', key: 'nav.apr' },
    { href: '/wosm', key: 'nav.wosm' },
    { href: '/wosm-members', key: 'nav.wosm_members' },
    { href: '/people', key: 'nav.people' },
    { href: '/calendar', key: 'nav.calendar' },
    { href: '/glossary', key: 'nav.glossary' },
  ];

  GW.setLang = function (lang) {
    localStorage.setItem('gw_lang', lang);
    location.reload();
  };

  GW.isMobileViewport = function () {
    return window.innerWidth <= 640;
  };

  function getFocusableElements(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(function (node) {
        return !node.hidden && node.getAttribute('aria-hidden') !== 'true';
      });
  }

  function trapFocus(event, container) {
    if (event.key !== 'Tab') return;
    var focusables = getFocusableElements(container);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  GW.applySiteChrome = function () {
    GW.syncBuildVersion();
    GW.ensureFavicon();
    GW.initMobileTypeControls();
    GW.applyMobileTypeScale();
    if (!GW._responsiveChromeBound) {
      GW._responsiveChromeBound = true;
      window.addEventListener('resize', function () {
        GW.initMobileTypeControls();
        GW.applyMobileTypeScale();
      });
    }
    if (document.body && document.body.hasAttribute('data-home-bootstrap')) return;
    GW.applyManagedFooter();
  };

  GW.applyManagedFooterData = function (data) {
    var footer = document.querySelector('footer');
    if (!footer) return;
    var info = data && data.footer ? data.footer : {};
    var footerBrand = footer.querySelector('.footer-brand');
    var title = document.querySelector('[data-footer-role="title"]');
    var description = document.querySelector('[data-footer-role="description"]');
    var domain = document.querySelector('[data-footer-role="domain"]');
    var tipEmail = document.querySelector('[data-footer-role="tip-email"]');
    var contactEmail = document.querySelector('[data-footer-role="contact-email"]');
    if (footerBrand && info.raw_text) {
      footerBrand.innerHTML = GW.renderManagedFooterHtml(info.raw_text);
      return;
    }
    if (title && info.title) title.textContent = info.title;
    if (description && info.description) description.textContent = info.description;
    if (domain && info.domain_label) domain.textContent = info.domain_label;
    if (tipEmail && info.tip_email) {
      tipEmail.textContent = info.tip_email;
      tipEmail.href = 'mailto:' + info.tip_email;
    }
    if (contactEmail && info.contact_email) {
      contactEmail.textContent = info.contact_email;
      contactEmail.href = 'mailto:' + info.contact_email;
    }
  };

  GW.applyManagedFooter = function () {
    var cacheKey = GW.getVersionedCacheKey('gw_cache_site_meta', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached) {
      GW.applyManagedFooterData(cached);
    }
    GW.apiFetch('/api/settings/site-meta', { cache: 'no-store' })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.applyManagedFooterData(data);
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('푸터 설정', err, !!cached);
      });
  };

  GW.setupScrollTopButton = function () {
    var button = document.getElementById('global-scroll-top-btn');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'global-scroll-top-btn';
      button.className = 'global-scroll-top-btn';
      button.setAttribute('aria-label', '맨 위로 이동');
      button.innerHTML = '<span aria-hidden="true">↑</span><em>TOP</em>';
      document.body.appendChild(button);
    }

    var scrollContainer = document.querySelector('#v3-content');
    var isWindowMode = !scrollContainer;

    function getTop() {
      if (isWindowMode) {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }
      return scrollContainer.scrollTop || 0;
    }

    function toggleVisibility() {
      button.classList.toggle('is-visible', getTop() > 240);
    }

    function scrollToTop() {
      if (isWindowMode) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }

    button.onclick = scrollToTop;
    if (button.dataset.bound === '1') {
      toggleVisibility();
      return;
    }
    button.dataset.bound = '1';
    if (isWindowMode) {
      window.addEventListener('scroll', toggleVisibility, { passive: true });
    } else {
      scrollContainer.addEventListener('scroll', toggleVisibility, { passive: true });
    }
    toggleVisibility();
  };

  GW.renderManagedFooterHtml = function (rawText) {
    return String(rawText || '').trim();
  };

  GW.markActiveNav = function () {
    var page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('/').pop();
      if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });
  };

  GW.renderManagedNav = function () {
    var currentPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    document.querySelectorAll('.nav[data-managed-nav]').forEach(function (nav) {
      var anchors = Array.from(nav.querySelectorAll('a'));
      var byHref = new Map();
      anchors.forEach(function (anchor) {
        var href = (anchor.getAttribute('href') || '').replace(/\/+$/, '') || '/';
        if (!byHref.has(href)) byHref.set(href, anchor);
      });
      var canPatchInPlace = anchors.length === GW.NAV_ITEMS.length &&
        GW.NAV_ITEMS.every(function (item) { return byHref.has(item.href); });
      if (canPatchInPlace) {
        GW.NAV_ITEMS.forEach(function (item) {
          var anchor = byHref.get(item.href);
          var href = item.href;
          var isActive = href === '/' ? currentPath === '/' : currentPath === href;
          anchor.setAttribute('data-i18n', item.key);
          anchor.textContent = GW.t(item.key);
          anchor.setAttribute('aria-label', GW.t(item.key));
          anchor.classList.toggle('active', isActive);
        });
      } else {
        nav.innerHTML = GW.NAV_ITEMS.map(function (item) {
          var href = item.href;
          var isActive = href === '/' ? currentPath === '/' : currentPath === href;
          var classes = isActive ? ' class="active"' : '';
          return '<a href="' + GW.escapeHtml(href) + '"' + classes +
            ' data-i18n="' + GW.escapeHtml(item.key) + '"' +
            ' aria-label="' + GW.escapeHtml(GW.t(item.key)) + '">' +
            GW.escapeHtml(GW.t(item.key)) +
          '</a>';
        }).join('');
      }
      nav.classList.add('is-ready');
    });
    if (GW.syncMobileCompactNav) GW.syncMobileCompactNav();
  };

  GW.ensureMobileCompactHeader = function () {
    if (typeof document === 'undefined') return null;
    if (document.getElementById('mobile-compact-header')) {
      return {
        header: document.getElementById('mobile-compact-header'),
        overlay: document.getElementById('mobile-compact-overlay'),
        drawer: document.getElementById('mobile-compact-drawer'),
        nav: document.getElementById('mobile-compact-nav')
      };
    }
    if (!document.body || document.body.classList.contains('admin-page') || document.body.classList.contains('admin-v3')) return null;
    if (!document.querySelector('.masthead')) return null;

    var shell = document.createElement('div');
    shell.innerHTML =
      '<div class="mobile-compact-header" id="mobile-compact-header" aria-hidden="true">' +
        '<button type="button" class="mobile-compact-toggle" id="mobile-compact-toggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="mobile-compact-drawer">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
        '<a href="/" class="mobile-compact-brand" aria-label="BP미디어 홈으로 이동">' +
          '<img src="/img/logo.svg" alt="" class="mobile-compact-brand-mark" aria-hidden="true">' +
          '<span class="mobile-compact-brand-text">BP미디어</span>' +
        '</a>' +
        '<a href="/search" class="mobile-compact-search" aria-label="검색">⌕</a>' +
      '</div>' +
      '<div class="mobile-compact-overlay" id="mobile-compact-overlay" hidden></div>' +
      '<aside class="mobile-compact-drawer" id="mobile-compact-drawer" aria-hidden="true">' +
        '<div class="mobile-compact-drawer-head">' +
          '<strong class="mobile-compact-drawer-title">메뉴</strong>' +
          '<button type="button" class="mobile-compact-drawer-close" id="mobile-compact-drawer-close" aria-label="메뉴 닫기">×</button>' +
        '</div>' +
        '<nav class="mobile-compact-nav" id="mobile-compact-nav" aria-label="모바일 메뉴"></nav>' +
      '</aside>';
    document.body.appendChild(shell);

    var refs = {
      header: document.getElementById('mobile-compact-header'),
      overlay: document.getElementById('mobile-compact-overlay'),
      drawer: document.getElementById('mobile-compact-drawer'),
      nav: document.getElementById('mobile-compact-nav'),
      toggle: document.getElementById('mobile-compact-toggle'),
      close: document.getElementById('mobile-compact-drawer-close')
    };
    var drawerRestoreFocus = null;

    function closeDrawer(restoreFocus) {
      document.body.classList.remove('mobile-compact-drawer-open');
      refs.drawer.setAttribute('aria-hidden', 'true');
      refs.overlay.hidden = true;
      refs.toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus !== false && drawerRestoreFocus && typeof drawerRestoreFocus.focus === 'function') {
        drawerRestoreFocus.focus();
      }
    }

    function openDrawer() {
      drawerRestoreFocus = document.activeElement;
      document.body.classList.add('mobile-compact-drawer-open');
      refs.drawer.setAttribute('aria-hidden', 'false');
      refs.overlay.hidden = false;
      refs.toggle.setAttribute('aria-expanded', 'true');
      window.requestAnimationFrame(function () {
        var focusables = getFocusableElements(refs.drawer);
        if (focusables.length) focusables[0].focus();
      });
    }

    refs.toggle.addEventListener('click', function () {
      if (document.body.classList.contains('mobile-compact-drawer-open')) closeDrawer();
      else openDrawer();
    });
    refs.close.addEventListener('click', closeDrawer);
    refs.overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (event) {
      if (!document.body.classList.contains('mobile-compact-drawer-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      trapFocus(event, refs.drawer);
    });
    refs.nav.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (link) closeDrawer();
    });

    return refs;
  };

  GW.syncMobileCompactNav = function () {
    var refs = GW.ensureMobileCompactHeader();
    if (!refs || !refs.nav) return;
    var currentPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    refs.nav.innerHTML = GW.NAV_ITEMS.map(function (item) {
      var href = item.href;
      var isActive = href === '/' ? currentPath === '/' : currentPath === href;
      return '<a href="' + GW.escapeHtml(href) + '"' + (isActive ? ' class="active"' : '') + '>' +
        GW.escapeHtml(GW.t(item.key)) +
      '</a>';
    }).join('');
  };

  GW.setupMobileCompactHeader = function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.body && document.body.classList.contains('post-page')) return;
    var refs = GW.ensureMobileCompactHeader();
    if (!refs || refs.header.dataset.bound === '1') {
      if (refs && refs.header) GW.syncMobileCompactNav();
      return;
    }

    function updateVisibility() {
      var isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
      var shouldShow = isMobile && (window.pageYOffset || document.documentElement.scrollTop || 0) > 72;
      refs.header.classList.toggle('is-visible', shouldShow);
      refs.header.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      if (!isMobile && document.body.classList.contains('mobile-compact-drawer-open')) {
        document.body.classList.remove('mobile-compact-drawer-open');
        refs.drawer.setAttribute('aria-hidden', 'true');
        refs.overlay.hidden = true;
        refs.toggle.setAttribute('aria-expanded', 'false');
      }
    }

    refs.header.dataset.bound = '1';
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    GW.syncMobileCompactNav();
    updateVisibility();
  };

  GW.applyLang = function () {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var text = GW.t(key);
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = GW.escapeHtml(text).replace(/\n/g, '<br>');
      } else {
        el.textContent = text;
      }
    });
    GW.renderManagedNav();
    GW.CATEGORIES.korea.label = GW.t('nav.korea');
    GW.CATEGORIES.apr.label = GW.t('nav.apr');
    GW.CATEGORIES.wosm.label = GW.t('nav.wosm');
    GW.CATEGORIES.people.label = GW.t('nav.people');
    ['ko', 'en'].forEach(function (lang) {
      var btn = document.getElementById('lang-btn-' + lang);
      if (btn) {
        btn.classList.toggle('active', lang === GW.lang);
        btn.setAttribute('aria-pressed', lang === GW.lang ? 'true' : 'false');
      }
    });
    document.documentElement.lang = GW.lang === 'en' ? 'en' : 'ko';
    if (GW._boardCopyData) GW.applyBoardCopySettings(GW._boardCopyData);
  };

  GW.loadTranslations = function () {
    var cacheKey = GW.getVersionedCacheKey('gw_cache_translations', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 60 * 12);
    if (GW._customStrings && Object.keys(GW._customStrings).length) {
      GW.applyLang();
      if (GW._statsData) GW._renderStats();
    }
    if (cached && cached.strings) {
      GW._customStrings = cached.strings || {};
      GW._navLabels = cached.nav_labels || GW._navLabels || {};
      GW.applyLang();
      if (GW._statsData) GW._renderStats();
    }
    GW.apiFetch('/api/settings/translations')
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW._customStrings = data.strings || {};
        GW._navLabels = data.nav_labels || GW._navLabels || {};
        GW.applyLang();
        if (GW._statsData) GW._renderStats();
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('번역 설정', err, !!cached || !!(GW._customStrings && Object.keys(GW._customStrings).length));
        GW.applyLang();
      });
  };

  GW.loadStats = function () {
    var cacheKey = GW.getVersionedCacheKey('gw_cache_stats', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 5);
    if (cached) {
      GW._statsData = cached;
      GW._renderStats();
    }
    GW.apiFetch('/api/stats')
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW._statsData = data;
        GW._renderStats();
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('홈 통계', err, !!cached);
      });
  };

  GW.applyBoardLayoutSettings = function (data) {
    var parsed = parseInt(data && data.gap_px, 10);
    var gap = Number.isFinite(parsed) ? Math.min(40, Math.max(5, parsed)) : 6;
    var root = document.documentElement;
    if (!root || !root.style) return;
    root.style.setProperty('--board-card-gap', gap + 'px');
    root.style.setProperty('--home-section-gap', gap + 'px');
    root.style.setProperty('--home-grid-gap', gap + 'px');
    root.style.setProperty('--home-block-bottom', gap + 'px');
    root.style.setProperty('--home-title-gap', gap + 'px');
  };

  GW.loadBoardLayoutSettings = function () {
    var cacheKey = GW.getVersionedCacheKey('gw_cache_board_layout', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached) {
      GW.applyBoardLayoutSettings(cached);
    }
    GW.apiFetch('/api/settings/board-layout', { cache: 'no-store' })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.applyBoardLayoutSettings(data);
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('게시판 레이아웃', err, !!cached);
      });
  };

  GW.applyBoardCopySettings = function (data) {
    var copy = data && typeof data === 'object' ? data : {};
    document.querySelectorAll('[data-board-copy-key]').forEach(function (el) {
      var key = el.getAttribute('data-board-copy-key');
      if (!key) return;
      var entry = copy[key];
      if (!entry || !entry.description) return;
      el.textContent = entry.description;
    });
  };

  GW.loadBoardCopySettings = function () {
    var cacheKey = GW.getVersionedCacheKey('gw_cache_board_copy', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached) {
      GW._boardCopyData = cached;
      GW.applyBoardCopySettings(cached);
    }
    GW.apiFetch('/api/settings/board-copy', { cache: 'no-store' })
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW._boardCopyData = data;
        GW.applyBoardCopySettings(data);
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('게시판 설명', err, !!cached);
      });
  };

  GW._renderStats = function () {
    var data = GW._statsData;
    if (!data) return;
    var el = document.getElementById('masthead-stats');
    if (!el) return;
    var unit = GW.t('stat.unit');
    function statItem(label, value) {
      return '<span class="masthead-stat-item">' + label + ' <strong>' + value + unit + '</strong></span>';
    }
    el.innerHTML =
      statItem(GW.t('stat.korea'), data.korea) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.apr'), data.apr) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.wosm'), data.wosm) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.people'), data.people) +
      '<span class="stat-sep">·</span>' +
      statItem(GW.t('stat.today'), data.today);
  };

  GW.loadTicker = function (innerId) {
    var inner = document.getElementById(innerId || 'ticker-inner');
    if (!inner) return;
    var cacheKey = GW.getVersionedCacheKey('gw_cache_ticker', 'v1_' + GW.ASSET_VERSION);
    var cached = GW.readCachedPayload(cacheKey, 1000 * 60 * 30);
    if (cached && Array.isArray(cached.items)) {
      GW.renderTickerItems(innerId, cached.items || []);
    }

    GW.apiFetch('/api/settings/ticker')
      .then(function (data) {
        GW.writeCachedPayload(cacheKey, data);
        GW.renderTickerItems(innerId, data.items || []);
      })
      .catch(function (err) {
        GW.handlePublicLoadFailure('상단 티커', err, !!(cached && Array.isArray(cached.items) && cached.items.length));
      });
  };

  GW.renderTickerItems = function (innerId, items) {
    var inner = document.getElementById(innerId || 'ticker-inner');
    if (!inner) return;
    var list = (items && items.length) ? items : [
      '길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다',
      '한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다',
      'The BP Post · bpmedia.net',
    ];
    var sep = '&nbsp;&nbsp;&nbsp;<span class="ticker-diamond">◆</span>&nbsp;&nbsp;&nbsp;';
    var run = list.map(function (text) { return GW.escapeHtml(text); }).join(sep);
    inner.innerHTML = run + sep + run + sep;
    inner.style.animationDuration = Math.max(40, list.length * 16) + 's';
  };

  GW.setupTickerControls = function () {
    var ticker = document.querySelector('.ticker');
    var btn = document.getElementById('ticker-toggle-btn');
    if (!ticker || !btn || btn.dataset.bound === '1') return;
    var prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var paused = prefersReducedMotion;
    function sync() {
      ticker.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.textContent = paused ? '재생' : '일시정지';
      btn.setAttribute('aria-label', paused ? '상단 소식 흐름 다시 재생' : '상단 소식 흐름 일시정지');
    }
    if (prefersReducedMotion) btn.hidden = true;
    btn.addEventListener('click', function () {
      paused = !paused;
      sync();
    });
    btn.dataset.bound = '1';
    sync();
  };

  GW.hasNavLabels = function () {
    var labels = GW._navLabels;
    return !!(labels && typeof labels === 'object' && Object.keys(labels).length);
  };

  GW.bootstrapStandardPage = function (opts) {
    opts = opts || {};
    var shouldLoadTranslations = opts.loadTranslations !== false;
    var hasManagedNav = !!document.querySelector('.nav[data-managed-nav]');
    var canRenderManagedNavNow = !hasManagedNav || GW.hasNavLabels() || !shouldLoadTranslations;
    if (opts.setDate !== false) GW.setMastheadDate();
    if (opts.renderManagedNav !== false && canRenderManagedNavNow) GW.renderManagedNav();
    if (opts.markActiveNav !== false && canRenderManagedNavNow) GW.markActiveNav();
    if (opts.enableScrollTop !== false) GW.setupScrollTopButton();
    GW.loadBoardLayoutSettings();
    if (opts.loadBoardCopy !== false) GW.loadBoardCopySettings();
    if (opts.loadTicker !== false) GW.loadTicker(opts.tickerId || 'ticker-inner');
    if (opts.loadStats !== false) GW.loadStats();
    if (shouldLoadTranslations) GW.loadTranslations();
    GW.setupMobileCompactHeader();
  };

  GW.setupMastheadSearch = function () {
    var input = document.getElementById('mh-search-input');
    var btn = document.getElementById('mh-search-btn');
    if (!input || !btn) return;

    ensureSearchModal();

    function go(query) {
      var q = String(query || '').trim();
      if (!q) return;
      window.location.href = '/search?q=' + encodeURIComponent(q);
    }

    function submitFromInput() {
      go(input.value || '');
    }

    btn.addEventListener('click', function (event) {
      if (GW.isMobileViewport()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSearchModal(input.value || '');
        return;
      }
      submitFromInput();
    }, true);

    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      if (GW.isMobileViewport()) {
        event.preventDefault();
        openSearchModal(input.value || '');
        return;
      }
      submitFromInput();
    }, true);

    input.addEventListener('focus', function () {
      if (!GW.isMobileViewport()) return;
      openSearchModal(input.value || '');
      input.blur();
    });

    input.addEventListener('click', function (event) {
      if (!GW.isMobileViewport()) return;
      event.preventDefault();
      openSearchModal(input.value || '');
    });

    function ensureSearchModal() {
      if (document.getElementById('mobile-search-modal')) return;
      var modal = document.createElement('div');
      modal.id = 'mobile-search-modal';
      modal.className = 'mobile-search-modal';
      modal.innerHTML =
        '<div class="mobile-search-modal-backdrop" data-search-close></div>' +
        '<div class="mobile-search-modal-card" role="dialog" aria-modal="true" aria-labelledby="mobile-search-title">' +
          '<div class="mobile-search-modal-head">' +
            '<strong id="mobile-search-title">검색</strong>' +
            '<button type="button" class="mobile-search-close-btn" data-search-close aria-label="검색 닫기">닫기</button>' +
          '</div>' +
          '<div class="mobile-search-modal-body">' +
            '<input type="search" id="mobile-search-input" class="mobile-search-input" placeholder="검색어를 입력하세요" autocomplete="off" aria-label="검색어 입력" />' +
            '<button type="button" id="mobile-search-submit" class="mobile-search-submit">검색</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-search-close]').forEach(function (node) {
        node.addEventListener('click', closeSearchModal);
      });

      document.getElementById('mobile-search-submit').addEventListener('click', function () {
        var modalInput = document.getElementById('mobile-search-input');
        go(modalInput && modalInput.value || '');
      });

      document.getElementById('mobile-search-input').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          go(event.target.value || '');
        }
        if (event.key === 'Escape') closeSearchModal();
      });

      document.addEventListener('keydown', function (event) {
        if (!modal.classList.contains('open')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSearchModal();
          return;
        }
        trapFocus(event, modal.querySelector('.mobile-search-modal-card'));
      });
    }

    var searchRestoreFocus = null;

    function openSearchModal(value) {
      var modal = document.getElementById('mobile-search-modal');
      var modalInput = document.getElementById('mobile-search-input');
      if (!modal || !modalInput) return;
      searchRestoreFocus = document.activeElement;
      modal.classList.add('open');
      document.body.classList.add('search-modal-open');
      modalInput.value = String(value || '').trim();
      setTimeout(function () { modalInput.focus(); }, 10);
    }

    function closeSearchModal() {
      var modal = document.getElementById('mobile-search-modal');
      if (!modal) return;
      modal.classList.remove('open');
      document.body.classList.remove('search-modal-open');
      if (searchRestoreFocus && typeof searchRestoreFocus.focus === 'function') {
        searchRestoreFocus.focus();
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GW.applySiteChrome, { once: true });
  } else {
    GW.applySiteChrome();
  }

  document.addEventListener('DOMContentLoaded', function () {
    GW.setupMastheadSearch();
    GW.setupMobileCompactHeader();
    GW.setupTickerControls();
    GW.initContentGalleries(document);
  });
})();
