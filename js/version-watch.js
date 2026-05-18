/**
 * Gilwell Media · Version Watch
 *
 * On page load: read the live /VERSION and /ADMIN_VERSION files (served from
 * the repo root as Cloudflare Pages static assets) and lock them in as the
 * "baseline" — i.e. what this loaded page corresponds to. On a fixed cadence,
 * poll the same files with no-store + cache-busting; if they ever differ from
 * the baseline, a full-screen modal is mounted that blocks interaction with a
 * single "지금 새로고침" CTA.
 *
 * Why poll the raw files rather than an /api/version endpoint:
 *   - The deploy.sh writes VERSION/ADMIN_VERSION atomically before publishing,
 *     so the file mtime advances exactly at deploy time.
 *   - Two tiny text fetches keep the worker invocation count down, and the
 *     500ms cost is amortised over a 60s interval.
 *
 * Footer hook: replaces the textContent of `.site-build-version` /
 * `.admin-build-version` on every successful poll so an operator can read the
 * live version straight from the footer once the page is rendered.
 */
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 60000;          // 1 minute background cadence
  var FOCUS_DEBOUNCE_MS = 5000;          // don't refire faster than this on focus
  var FETCH_TIMEOUT_MS = 8000;
  var LOCALE_LABEL = '버전 확인 중…';

  var baseline = { site: null, admin: null, capturedAt: 0 };
  var lastChecked = 0;
  var pollTimer = null;
  var modalShown = false;

  function nowMs() { return Date.now(); }

  function fetchText(url) {
    return new Promise(function (resolve, reject) {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
      var opts = { cache: 'no-store' };
      if (controller) opts.signal = controller.signal;
      fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + nowMs(), opts)
        .then(function (r) {
          if (timer) clearTimeout(timer);
          if (!r || !r.ok) { reject(new Error('HTTP ' + (r && r.status))); return; }
          return r.text();
        })
        .then(function (txt) { if (typeof txt === 'string') resolve(txt.trim()); })
        .catch(function (err) { if (timer) clearTimeout(timer); reject(err); });
    });
  }

  function readVersions() {
    return Promise.all([
      fetchText('/VERSION').catch(function () { return null; }),
      fetchText('/ADMIN_VERSION').catch(function () { return null; })
    ]).then(function (arr) {
      return { site: arr[0], admin: arr[1] };
    });
  }

  function setFooterStatus(label) {
    var el = document.querySelector('.footer-build-status');
    if (el) el.textContent = label || '';
  }

  function applyToFooter(v) {
    var s = document.querySelector('.site-build-version');
    var a = document.querySelector('.admin-build-version');
    if (s && v.site) s.textContent = 'V' + v.site;
    if (a && v.admin) a.textContent = 'V' + v.admin;
    var footer = document.querySelector('[data-version-status]');
    if (footer) footer.setAttribute('data-version-status', 'live');
    var label = '· 최신 (' + formatNow() + ' 확인)';
    setFooterStatus(label);
  }

  function formatNow() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  function isDifferent(current) {
    if (!baseline.site || !baseline.admin) return false;
    if (!current.site || !current.admin) return false;
    return baseline.site !== current.site || baseline.admin !== current.admin;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showUpdateModal(current) {
    if (modalShown) return;
    modalShown = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

    var oldSite = baseline.site || '?';
    var oldAdmin = baseline.admin || '?';
    var newSite = current.site || '?';
    var newAdmin = current.admin || '?';

    var overlay = document.createElement('div');
    overlay.className = 'gw-version-update-modal';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gw-vum-title');
    overlay.innerHTML =
      '<div class="gw-vum-card" tabindex="-1">' +
        '<div class="gw-vum-badge" aria-hidden="true">⟳</div>' +
        '<h2 class="gw-vum-title" id="gw-vum-title">새 버전이 배포되었습니다</h2>' +
        '<p class="gw-vum-body">' +
          '지금 화면은 이전 버전입니다. 최신 콘텐츠를 보시려면 새로고침해주세요.' +
        '</p>' +
        '<div class="gw-vum-versions">' +
          '<div class="gw-vum-version-row">' +
            '<span class="gw-vum-version-label">현재 보고 계신 버전</span>' +
            '<span class="gw-vum-version-value">Site V' + escapeHtml(oldSite) + ' · Admin V' + escapeHtml(oldAdmin) + '</span>' +
          '</div>' +
          '<div class="gw-vum-version-row gw-vum-version-row-new">' +
            '<span class="gw-vum-version-label">새 버전</span>' +
            '<span class="gw-vum-version-value">Site V' + escapeHtml(newSite) + ' · Admin V' + escapeHtml(newAdmin) + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="gw-vum-btn" id="gw-vum-reload">지금 새로고침</button>' +
        '<p class="gw-vum-note">이 창은 새 버전 반영을 확인할 때까지 닫히지 않습니다.</p>' +
      '</div>';

    document.body.appendChild(overlay);
    if (document.documentElement) {
      document.documentElement.classList.add('gw-version-locked');
    }

    var btn = document.getElementById('gw-vum-reload');
    function doReload() {
      try { sessionStorage.setItem('gw_version_reloaded_at', String(nowMs())); } catch (_) {}
      try { btn.disabled = true; btn.textContent = '새로고침 중…'; } catch (_) {}
      window.location.reload();
    }
    if (btn) {
      btn.addEventListener('click', doReload);
      try { btn.focus(); } catch (_) {}
    }
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doReload();
      }
    });
  }

  function tick(force) {
    if (!force && document.hidden) return;
    if (!force && (nowMs() - lastChecked) < FOCUS_DEBOUNCE_MS) return;
    lastChecked = nowMs();
    readVersions().then(function (v) {
      if (!v.site && !v.admin) return;
      applyToFooter(v);
      if (isDifferent(v)) showUpdateModal(v);
    }).catch(function () {});
  }

  function init() {
    setFooterStatus(LOCALE_LABEL);
    readVersions().then(function (v) {
      if (!v.site && !v.admin) {
        setFooterStatus('· 버전 확인 실패');
        return;
      }
      baseline = { site: v.site, admin: v.admin, capturedAt: nowMs() };
      applyToFooter(v);
      pollTimer = window.setInterval(function () { tick(false); }, POLL_INTERVAL_MS);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) tick(false);
      });
      window.addEventListener('focus', function () { tick(false); });
    }).catch(function () {
      setFooterStatus('· 버전 확인 실패');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
