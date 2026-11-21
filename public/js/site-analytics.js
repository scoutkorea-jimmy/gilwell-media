(function () {
  'use strict';

  const measurementId = document.currentScript?.dataset.measurementId;
  if (!/^G-[A-Z0-9]{6,20}$/.test(measurementId || '')) return;

  const consentKey = 'bpmedia-analytics-transfer-consent';
  const visitKey = 'bpmedia-analytics-visit';
  const searchLinkKey = 'bpmedia-analytics-search-link';
  const disableKey = 'ga-disable-' + measurementId;
  const articlePath = /^\/post\/([1-9]\d*)\/?$/;
  const path = location.pathname.replace(/\/$/, '') || '/';
  const isHome = path === '/' || path === '/index.html';
  const articleId = path.match(articlePath)?.[1];
  const pageType = articleId ? 'article' : isHome ? 'home' : path === '/search' ? 'search' : 'public';
  const pageLocation = location.origin + (isHome ? '/' : path);
  const referrer = document.referrer ? new URL(document.referrer) : null;
  const sameSite = referrer?.origin === location.origin;
  const pageReferrer = sameSite && /^\/(?:post\/[1-9]\d*|search)\/?$/.test(referrer.pathname)
    ? referrer.origin + referrer.pathname : referrer?.origin || '';
  let consent;
  let started = false;
  let visibilityObserver;
  let bodyEndReported = false;
  let searchResultsTracked = false;
  const seenSections = new Set();
  const homeSections = [
    ['main_story', '#home-lead-story'], ['latest', '#latest-list'],
    ['hero', '#site-hero-slider'], ['ticker', '#ticker-inner'],
    ['popular', '#popular-list, #popular-list-mobile'], ['editor_picks', '#picks-list, #picks-list-mobile'],
    ['korea', '#col-korea'], ['apr', '#col-apr'], ['wosm', '#col-wosm'], ['people', '#col-people'],
  ];

  function readStorage(area, key) {
    try { return window[area].getItem(key); } catch (_) { return null; }
  }

  function writeStorage(area, key, value) {
    try {
      if (value === null) window[area].removeItem(key);
      else window[area].setItem(key, value);
    } catch (_) {}
  }

  function tag() {
    (window.dataLayer ||= []).push(arguments);
  }

  function track(name, params = {}) {
    if (consent !== 'granted' || window[disableKey]) return;
    tag('event', name, {
      send_to: measurementId,
      page_location: pageLocation,
      page_referrer: pageReferrer,
      page_type: pageType,
      ...params,
    });
  }

  function readSession(key) {
    try { return JSON.parse(readStorage('sessionStorage', key)); } catch (_) { return null; }
  }

  function trackNavigation() {
    const previous = sameSite ? readSession(visitKey) : null;
    const elapsed = Date.now() - previous?.at;
    const previousArticle = elapsed >= 0 && elapsed < 30 * 60 * 1000 &&
      typeof previous.article === 'string' && /^[1-9]\d*$/.test(previous.article) ? previous.article : null;
    if (articleId && previousArticle && previousArticle !== articleId) {
      track('next_article_view', { article_id: articleId, previous_article_id: previousArticle });
    }
    const searchLink = sameSite && referrer.pathname === '/search' ? readSession(searchLinkKey) : null;
    if (articleId && searchLink?.article === articleId && Date.now() - searchLink.at < 60_000) {
      track('search_article_view', { article_id: articleId });
    }
    writeStorage('sessionStorage', searchLinkKey, null);
    writeStorage('sessionStorage', visitKey, JSON.stringify({
      article: articleId || previousArticle, at: Date.now(),
    }));
  }

  function reportSection(section) {
    if (seenSections.has(section)) return;
    seenSections.add(section);
    track('home_section_view', { home_section: section });
  }

  function watchVisibleContent() {
    if (!('IntersectionObserver' in window)) return;
    visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || consent !== 'granted') continue;
        if (entry.target.dataset.analyticsSection) {
          reportSection(entry.target.dataset.analyticsSection);
        } else if (!bodyEndReported) {
          bodyEndReported = true;
          track('article_body_end', { article_id: articleId });
        }
        visibilityObserver?.unobserve(entry.target);
      }
    });
    if (isHome) {
      for (const [section, selector] of homeSections) {
        document.querySelectorAll(selector).forEach((el) => {
          if (seenSections.has(section)) return;
          el.dataset.analyticsSection = section;
          visibilityObserver.observe(el);
        });
      }
    }
    const body = articleId && document.querySelector('.post-page-body');
    if (body && !bodyEndReported) {
      let end = body.querySelector('.site-analytics-body-end');
      if (!end) {
        end = document.createElement('span');
        end.className = 'site-analytics-body-end';
        end.setAttribute('aria-hidden', 'true');
        body.append(end);
      }
      visibilityObserver.observe(end);
    }
  }

  document.addEventListener('bp:search-results', (event) => {
    if (consent !== 'granted' || pageType !== 'search' || typeof event.detail !== 'boolean') return;
    searchResultsTracked = event.detail;
    track('site_search_results', { result_state: event.detail ? 'has_results' : 'zero_results' });
  });

  function trackArticleLink(event) {
    if (consent !== 'granted' || event.defaultPrevented) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.origin !== location.origin) return;
    const targetId = link.pathname.match(articlePath)?.[1];
    if (!targetId) return;
    if (isHome) {
      const section = homeSections.find(([, selector]) => link.closest(selector))?.[0];
      if (!section) return;
      reportSection(section);
      track('home_article_click', { home_section: section, article_id: targetId });
    } else if (pageType === 'search' && event.type === 'click' && !event.metaKey && !event.ctrlKey &&
      !event.shiftKey && !event.altKey && (!link.target || link.target === '_self') &&
      link.matches('#search-results .search-result-card')) {
      if (!searchResultsTracked) {
        searchResultsTracked = true;
        track('site_search_results', { result_state: 'has_results' });
      }
      // shortcut: same-tab result opens, use a navigation marker if new-tab attribution is needed.
      writeStorage('sessionStorage', searchLinkKey, JSON.stringify({ article: targetId, at: Date.now() }));
    }
  }

  document.addEventListener('click', trackArticleLink);
  document.addEventListener('auxclick', (event) => {
    if (event.button === 1) trackArticleLink(event);
  });

  function startMeasurement() {
    if (!started) {
      tag('consent', 'default', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      });
      tag('consent', 'update', { analytics_storage: 'granted' });
      tag('js', new Date());
      tag('config', measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_prefix: 'bpmedia',
        cookie_expires: 60 * 24 * 60 * 60,
        cookie_update: false,
        page_location: pageLocation,
        page_referrer: pageReferrer,
        page_title: pageType === 'search' ? 'BP미디어 검색' : document.title,
      });
      track('page_view', articleId ? { article_id: articleId } : {});

      const script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
      document.head.append(script);
      started = true;
    }
    trackNavigation();
    watchVisibleContent();
  }

  function applyConsent(choice) {
    if (choice === consent) return;
    consent = choice;
    window[disableKey] = choice !== 'granted';
    visibilityObserver?.disconnect();
    if (choice === 'granted') {
      startMeasurement();
    } else {
      searchResultsTracked = false;
      writeStorage('sessionStorage', visitKey, null);
      writeStorage('sessionStorage', searchLinkKey, null);
      for (const item of document.cookie.split(';')) {
        const name = item.split('=', 1)[0].trim();
        if (!/^bpmedia_ga(?:_[A-Z0-9]+)?$/.test(name)) continue;
        document.cookie = name + '=; Max-Age=0; Path=/';
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=' + location.hostname;
      }
    }
  }

  const english = (window.GW?.lang || document.documentElement.lang) === 'en';
  const settingsLabel = english ? 'Analytics preferences' : '방문 분석 설정';
  const panel = document.createElement('section');
  panel.className = 'site-analytics-consent';
  panel.setAttribute('aria-label', settingsLabel);
  const message = document.createElement('p');
  message.textContent = english
    ? 'With your permission, BP Media sends site usage and device data to Google for analytics, with processing in the US and other countries. You can decline, or change your choice in the footer. If you are under 14, please decline. '
    : '동의하면 사이트 개선을 위해 방문 기록과 기기 정보가 Google로 전송되어 미국 등 국외에서 처리됩니다. 거부해도 사이트를 이용할 수 있으며, 페이지 하단에서 선택을 바꿀 수 있습니다. 만 14세 미만은 허용 안 함을 선택해 주세요. ';
  const policy = document.createElement('a');
  policy.href = '/privacy#analytics-privacy';
  policy.textContent = english ? 'Privacy policy' : '개인정보 처리방침';
  message.append(policy);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = settingsLabel;
  settings.setAttribute('aria-expanded', 'false');
  panel.id = 'bpmedia-analytics-consent';
  settings.setAttribute('aria-controls', panel.id);
  panel.append(message);
  const skipLink = document.querySelector('.skip-link');
  let openedFromFooter = false;
  for (const [choice, label] of [['granted', english ? 'Allow analytics and overseas transfer' : '분석 및 국외 이전 동의'],
    ['denied', english ? 'Decline' : '허용 안 함']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      writeStorage('localStorage', consentKey, choice);
      applyConsent(choice);
      showSettings(false);
      (openedFromFooter ? settings : skipLink || settings).focus({ preventScroll: true });
    });
    panel.append(button);
  }
  if (skipLink) skipLink.after(panel);
  else document.body.prepend(panel);
  (document.querySelector('.footer-brand') || document.body).append(settings);

  function showSettings(open) {
    panel.hidden = !open;
    settings.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button').focus();
  }

  function syncConsent() {
    const saved = readStorage('localStorage', consentKey);
    const choice = saved === 'granted' || saved === 'denied' ? saved : null;
    applyConsent(choice);
    panel.hidden = !!choice;
    settings.setAttribute('aria-expanded', String(!choice));
  }

  settings.addEventListener('click', () => {
    openedFromFooter = panel.hidden;
    showSettings(panel.hidden);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === consentKey || event.key === null) syncConsent();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) syncConsent();
  });
  syncConsent();
})();
