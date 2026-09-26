/**
 * 홈 팝업 배너 (2026-07-22)
 *
 * 최대 2개. 화면 정중앙에 뜬다.
 *   · 데스크톱 — 2개면 좌우로 나란히
 *   · 모바일   — 한 번에 하나, 좌우 스와이프로 전환
 *
 * 닫기 규칙:
 *   · ✕ 닫기        — 이번 방문에만 숨김 (sessionStorage)
 *   · 오늘 하루 보지 않기 — 자정까지 숨김 (localStorage, 날짜 문자열 비교)
 *   배너 구성이 바뀌면(이미지 조합이 달라지면) 다시 노출된다 — 서명값 비교.
 *
 * 접근성:
 *   · role="dialog" + aria-modal, 열릴 때 첫 요소로 포커스 이동
 *   · ESC 로 닫기, Tab 포커스는 팝업 안에 가둔다
 *   · 닫으면 직전에 포커스돼 있던 요소로 되돌린다
 *   · prefers-reduced-motion 이면 등장 애니메이션을 쓰지 않는다
 */
(function () {
  'use strict';

  var DAY_KEY = 'gw_banner_hidden_until';
  var SESSION_KEY = 'gw_banner_dismissed';
  var SIG_KEY = 'gw_banner_signature';

  function todayKst() {
    // KST 기준 날짜 문자열. 서버 시각과 무관하게 사용자의 '오늘'을 쓴다.
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function signatureOf(banners) {
    return banners.map(function (b) { return b.id + ':' + b.image_url; }).join('|');
  }

  function isHidden(sig) {
    try {
      if (localStorage.getItem(SIG_KEY) !== sig) return false;   // 구성이 바뀌면 다시 보여준다
      if (localStorage.getItem(DAY_KEY) === todayKst()) return true;
      if (sessionStorage.getItem(SESSION_KEY) === '1') return true;
    } catch (e) { /* 저장소 차단 환경 — 항상 노출 */ }
    return false;
  }

  function remember(sig, allDay) {
    try {
      localStorage.setItem(SIG_KEY, sig);
      if (allDay) localStorage.setItem(DAY_KEY, todayKst());
      else sessionStorage.setItem(SESSION_KEY, '1');
    } catch (e) { /* 무시 */ }
  }

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function buildCard(b) {
    var card = el('div', 'gw-banner-card');
    var inner = b.link_url
      ? el('a', 'gw-banner-link', { href: b.link_url, rel: 'noopener' })
      : el('div', 'gw-banner-link');
    var img = el('img', 'gw-banner-img', {
      src: b.image_url,
      alt: b.title || '',
      loading: 'eager',
      decoding: 'async',
    });
    inner.appendChild(img);
    card.appendChild(inner);
    return card;
  }

  function render(banners) {
    var sig = signatureOf(banners);
    if (isHidden(sig)) return;

    var previousFocus = document.activeElement;

    var overlay = el('div', 'gw-banner-overlay', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': '홈 안내 배너',
    });
    var shell = el('div', 'gw-banner-shell' + (banners.length > 1 ? ' is-multi' : ''));

    var track = el('div', 'gw-banner-track');
    banners.forEach(function (b) { track.appendChild(buildCard(b)); });
    shell.appendChild(track);

    // 모바일 스와이프 인디케이터 (2개 이상일 때만)
    var dots = null;
    if (banners.length > 1) {
      dots = el('div', 'gw-banner-dots');
      banners.forEach(function (_, i) {
        var d = el('button', 'gw-banner-dot' + (i === 0 ? ' is-active' : ''), {
          type: 'button', 'aria-label': (i + 1) + '번째 배너 보기',
        });
        d.addEventListener('click', function () { goTo(i); });
        dots.appendChild(d);
      });
      shell.appendChild(dots);
    }

    var actions = el('div', 'gw-banner-actions');
    var todayBtn = el('button', 'gw-banner-today', { type: 'button' });
    todayBtn.textContent = '오늘 하루 보지 않기';
    var closeBtn = el('button', 'gw-banner-close', { type: 'button', 'aria-label': '배너 닫기' });
    closeBtn.textContent = '닫기';
    actions.appendChild(todayBtn);
    actions.appendChild(closeBtn);
    shell.appendChild(actions);

    overlay.appendChild(shell);

    function close(allDay) {
      remember(sig, allDay);
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('gw-banner-open');
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      // 포커스를 팝업 안에 가둔다
      var f = overlay.querySelectorAll('a[href], button:not([disabled])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ── 모바일 스와이프 ─────────────────────────────────────
    var index = 0;
    function goTo(i) {
      index = Math.max(0, Math.min(banners.length - 1, i));
      track.style.transform = 'translateX(' + (-index * 100) + '%)';
      if (dots) {
        Array.prototype.forEach.call(dots.children, function (d, k) {
          d.classList.toggle('is-active', k === index);
        });
      }
    }
    var startX = null;
    track.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) goTo(index + (dx < 0 ? 1 : -1));
      startX = null;
    }, { passive: true });

    closeBtn.addEventListener('click', function () { close(false); });
    todayBtn.addEventListener('click', function () { close(true); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    document.body.classList.add('gw-banner-open');
    closeBtn.focus();
  }

  // ── 리뉴얼 감사 팝업 (2026-09-26) ───────────────────────────
  // 관리자 팝업 배너가 없을 때만 띄운다. 두 팝업이 겹치지 않도록 관리자 배너가 있으면 쉰다.
  // 닫기 규칙은 관리자 배너와 같다: 닫기 = 이번 방문만, 오늘 그만 보기 = KST 자정까지.
  var THANKS_SESSION_KEY = 'gw_renewal_thanks_dismissed';
  var THANKS_DAY_KEY = 'gw_renewal_thanks_hidden_until';
  // 2026-09-30 23:59 KST 까지만 노출한다 (10월 1일 0시 KST = 2026-09-30T15:00Z).
  var THANKS_UNTIL = Date.UTC(2026, 8, 30, 15, 0, 0);

  function thanksSeen() {
    try {
      if (localStorage.getItem(THANKS_DAY_KEY) === todayKst()) return true;
      if (sessionStorage.getItem(THANKS_SESSION_KEY) === '1') return true;
    } catch (e) { /* 저장소 차단 환경 — 이 페이지에서만 기억한다 */ }
    return !!window.__gwThanksShown;
  }

  function rememberThanks(allDay) {
    window.__gwThanksShown = true;
    try {
      if (allDay) localStorage.setItem(THANKS_DAY_KEY, todayKst());
      else sessionStorage.setItem(THANKS_SESSION_KEY, '1');
    } catch (e) { /* 무시 */ }
  }

  function renderThanks() {
    if (Date.now() >= THANKS_UNTIL) return;
    if (thanksSeen() || document.querySelector('.gw-banner-overlay, .gw-thanks-overlay')) return;
    var previousFocus = document.activeElement;
    var overlay = el('div', 'gw-thanks-overlay');
    var dialog = el('div', 'gw-thanks-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gw-thanks-title', 'aria-describedby': 'gw-thanks-copy' });
    var kicker = el('p', 'gw-thanks-kicker');
    kicker.textContent = 'BP미디어 전체 디자인 리뉴얼';
    var title = el('h2', 'gw-thanks-title', { id: 'gw-thanks-title' });
    title.textContent = '새로워진 BP미디어를 찾아주셔서 감사합니다.';
    var copy = el('p', 'gw-thanks-copy', { id: 'gw-thanks-copy' });
    copy.textContent = '더 편안한 읽기와 명확한 탐색을 위해 모든 공개 화면을 새롭게 다듬었습니다.';
    var actions = el('div', 'gw-thanks-actions');
    var today = el('button', 'gw-thanks-today', { type: 'button' });
    today.textContent = '오늘 그만 보기';
    var ok = el('button', 'gw-thanks-ok', { type: 'button' });
    ok.textContent = '닫기';
    actions.appendChild(today);
    actions.appendChild(ok);
    dialog.appendChild(kicker);
    dialog.appendChild(title);
    dialog.appendChild(copy);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    function close(allDay) {
      if (overlay.classList.contains('is-closing')) return;
      rememberThanks(allDay);
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('gw-banner-open');
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      // 닫힘 모션(200ms)을 보여 준 뒤 제거한다. 동작 줄이기 환경에서는 애니메이션이 0 에 가깝다.
      overlay.classList.add('is-closing');
      setTimeout(function () { overlay.remove(); }, 220);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      // 포커스를 두 버튼 사이에 가둔다
      e.preventDefault();
      (document.activeElement === ok ? today : ok).focus();
    }

    ok.addEventListener('click', function () { close(false); });
    today.addEventListener('click', function () { close(true); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    document.body.classList.add('gw-banner-open');
    ok.focus();
  }

  function init() {
    var boot = window.GW_BOOT_HOME;
    var banners = boot && boot.banners;
    if (Array.isArray(banners) && banners.length) { render(banners.slice(0, 2)); return; }
    // 부트 데이터에 없으면 API 로 한 번 더 시도 (SSR 폴백 경로)
    fetch('/api/home', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var list = j && j.banners;
        if (Array.isArray(list) && list.length) render(list.slice(0, 2));
        else renderThanks();
      })
      .catch(function () { renderThanks(); /* 배너는 부가 기능 — 실패해도 홈은 정상 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
