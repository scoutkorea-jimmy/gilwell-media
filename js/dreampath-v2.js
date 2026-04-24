// =====================================================================
// Dreampath v2 — single IIFE module (DREAMPATH.md Section 2)
//
// [CASE STUDY 2026-04-24 — IIFE boundary is load-bearing]
// The inline onclick="DP.*()" pattern depends on a single classic-script
// IIFE exposing DP via `window.DP`. Do NOT convert to ES modules or split
// files — see DREAMPATH.md Section 2.1 and the matching comment in
// /dreampath production bundle.
//
// [CASE STUDY 2026-04-24 — /dreampath-v2 CSP allowlist]
// This route depends on functions/_middleware.js isLegacyInlinePath()
// including "/dreampath-v2". Removing that line reproduces the total
// sidebar outage from 2026-04-24 · A instantly.
//
// [CASE STUDY 2026-04-24 — user.name may be missing]
// Legacy /dreampath sessions left localStorage.dp_user lacking a `name`
// field. Always go through _displayName()/_avatarChar() helpers instead
// of reading state.user.name directly.
// =====================================================================

// Boot probe — if present, page renders in-place error instead of blank.
try {
  document.title = '[v2 boot] ' + document.title;
  document.documentElement.setAttribute('data-v2-boot', 'parse');
} catch (_) {}

const DP = (() => {
  'use strict';

  // -------------------------- State --------------------------
  const state = {
    user: null,
    page: 'home',
    version: '2.0.0',
    tiptapLoaded: false,
    density: localStorage.getItem('dp_v2_density') || 'default',
    contrast: localStorage.getItem('dp_v2_contrast') || 'standard',
    cmdOpen: false,
  };

  // Navigation groups — mirrors the tokens doc sidebar exactly
  const NAV = [
    { title: 'Workspace', items: [
      { id: 'home',          label: 'Home',             icon: 'home' },
      { id: 'announcements', label: 'Announcements',    icon: 'megaphone', badge: 3 },
    ]},
    { title: 'Project', items: [
      { id: 'documents',     label: 'Documents',        icon: 'book' },
      { id: 'minutes',       label: 'Meeting Minutes',  icon: 'note',      badge: 2 },
      { id: 'tasks',         label: 'Tasks',            icon: 'check',     badge: 12 },
      { id: 'notes',         label: 'Notes / Issues',   icon: 'clipboard' },
    ]},
    { title: 'Team', items: [
      { id: 'teams',         label: 'Team Boards',      icon: 'users-admin' },
      { id: 'calendar',      label: 'Calendar',         icon: 'calendar' },
      { id: 'contacts',      label: 'Contacts',         icon: 'phone' },
    ]},
    { title: 'Settings', items: [
      { id: 'rules',         label: 'Dev Rules',        icon: 'layers' },
      { id: 'versions',      label: 'Versions',         icon: 'file-text' },
    ]},
  ];

  // -------------------------- Demo data (replaced by Phase 3 API wiring) --------------------------
  const DATA = {
    posts: {
      notice: [
        { id: 101, board: 'notice', title: 'Sprint 14 planning — agenda & goals', pinned: true, author_name: '조은', created_at: '2026-04-24T07:20:00', acknowledged: 9, total: 14, excerpt: '온보딩 리디자인과 API rate-limiting 에 집중합니다. 월요일 10시 전에 브리프 읽어 주세요.', content: '<h2>Sprint 14 목표</h2><p>온보딩 리디자인과 API rate-limiting 에 집중합니다.</p><ul><li>온보딩 플로우 3회차 테스트</li><li>API /auth 리트라이 정책 정비</li><li>Q2 로드맵 리뷰</li></ul>' },
        { id: 102, board: 'notice', title: 'Security review findings — action required', pinned: false, author_name: '민수', created_at: '2026-04-24T04:41:00', acknowledged: 0, total: 14, unread: true, excerpt: '3건의 high-severity 항목이 발견되었습니다. 담당자 지정 완료. 시정 기한: 4월 30일.', content: '<p>3건의 <strong>high-severity</strong> 항목. 담당자 지정 완료. 시정 기한 <strong>4월 30일</strong>.</p>' },
        { id: 103, board: 'notice', title: 'Office move — Fri Apr 26 logistics', pinned: false, author_name: 'HR', created_at: '2026-04-23T09:10:00', acknowledged: 4, total: 14, excerpt: '책상 배정 완료. 노트북과 모니터 케이블만 챙겨오세요. 나머지는 이사팀이 옮깁니다.', content: '<p>책상 배정 완료.</p>' },
      ],
      documents: [
        { id: 201, board: 'documents', title: 'API v2 spec — final draft', pinned: true, author_name: '민수', created_at: '2026-04-24T12:18:00', type: 'Doc', size: '12.3 MB', content: '<h2>API v2 스펙</h2><p>최종 초안.</p>' },
        { id: 202, board: 'documents', title: 'Onboarding redesign — wireframes v3', pinned: false, author_name: '수진', created_at: '2026-04-23T16:30:00', type: 'Fig', size: '—' },
        { id: 203, board: 'documents', title: 'Q2 roadmap — exec summary', pinned: false, author_name: '조은', created_at: '2026-04-22T11:00:00', type: 'Doc', size: '2.4 MB' },
        { id: 204, board: 'documents', title: 'Vendor shortlist — phase 2', pinned: false, author_name: 'L. Park', created_at: '2026-04-22T09:15:00', type: 'XLS', size: '820 KB' },
      ],
      minutes: [
        { id: 301, board: 'minutes', title: 'Product weekly (Apr 22)', author_name: '수진', created_at: '2026-04-22T15:00:00', approval_status: 'pending', approvers: [
          { name: '조은', status: 'approved', voted_at: '2026-04-22T17:20:00' },
          { name: '민수', status: 'pending' },
          { name: '지우', status: 'pending' },
          { name: '정현', status: 'pending' },
        ], content: '<h2>참석</h2><p>조은, 민수, 지우, 수진, 정현</p><h2>논의</h2><ol><li>온보딩 리디자인 v3 리뷰</li><li>API rate-limiting 정책</li><li>Q2 예산 승인</li></ol>' },
        { id: 302, board: 'minutes', title: 'Engineering all-hands (Apr 18)', author_name: '민수', created_at: '2026-04-18T14:00:00', approval_status: 'approved', approvers: [] },
      ],
    },
    tasks: [
      { id: 408, title: 'Onboarding flow review', assignee: '정현', status: 'in_progress', priority: 'high', due_date: '2026-04-22', overdue: true },
      { id: 411, title: 'Fix rate-limit edge case', assignee: '정현', status: 'in_progress', priority: 'high', due_date: '2026-04-23', overdue: true },
      { id: 415, title: 'Share Q2 roadmap', assignee: '정현', status: 'todo', priority: 'normal', due_date: '2026-04-24', overdue: false },
      { id: 420, title: 'Vendor call prep', assignee: '정현', status: 'todo', priority: 'normal', due_date: '2026-04-25', overdue: false },
      { id: 422, title: 'Weekly status deck', assignee: 'R. Kim', status: 'todo', priority: 'normal', due_date: '2026-05-03' },
    ],
    notes: [
      { id: 501, title: 'Login 500 on Safari (NOTE-89)', type: 'issue', status: 'resolved', priority: 'high', author: '정현', updated_at: '2026-04-24T10:02:00', body: 'Safari 17.x ITP blocks dp_session cookie when 3rd-party context. Fix landed 2026-04-23.' },
      { id: 502, title: 'Rate-limit retry policy draft', type: 'note', status: 'open', priority: 'normal', author: '민수', updated_at: '2026-04-23T16:40:00', body: 'Exponential backoff with jitter, max 5 retries for 5xx.' },
      { id: 503, title: 'Q2 budget re-allocation ask', type: 'note', status: 'open', priority: 'high', author: '조은', updated_at: '2026-04-22T11:20:00', body: 'Proposal to shift 15% from eng-ops to growth in Q2.' },
    ],
    events: [
      { id: 601, title: 'Stand-up', type: 'meeting', start_date: '2026-04-24', start_time: '10:30', end_time: '10:45', sub: 'PMO · #daily' },
      { id: 602, title: 'Sprint 14 planning', type: 'meeting', start_date: '2026-04-24', start_time: '13:00', end_time: '14:30', sub: 'All hands' },
      { id: 603, title: '1:1 · 조은', type: 'meeting', start_date: '2026-04-24', start_time: '15:30', end_time: '16:00', sub: '정현' },
      { id: 604, title: 'Vendor call — Acme', type: 'meeting', start_date: '2026-04-25', start_time: '14:00', end_time: '15:00', sub: 'L. Park + 2' },
    ],
    pendingApprovals: [
      { id: 701, kind: 'budget', title: 'Q2 marketing budget — ₩32,400,000', requested_by: '지우', requested_days_ago: 3, overdue: true },
      { id: 702, kind: 'minutes', title: 'Minutes · Product weekly (Apr 22)', requested_by: '수진', requested_days_ago: 0 },
      { id: 703, kind: 'doc',    title: 'Doc · API v2 spec — final draft', requested_by: '민수', requested_days_ago: 1 },
      { id: 704, kind: 'doc',    title: 'Doc · Brand refresh v2 proposal', requested_by: '조은', requested_days_ago: 2 },
    ],
    activity: [
      { ts: '14:02', who: '지우',  text: 'changed status of <strong>TASK-412</strong> to <strong>In review</strong>' },
      { ts: '13:41', who: '수진',  text: 'published <strong>Minutes · Product weekly</strong>' },
      { ts: '12:18', who: '민수',  text: 'uploaded <strong>API v2 spec · final draft</strong> to /Documents' },
      { ts: '11:55', who: '조은',  text: 'pinned announcement <strong>Sprint 14 planning</strong>' },
      { ts: '10:02', who: '정현',  text: 'closed issue <strong>NOTE-89 · Login 500 on Safari</strong>' },
      { ts: '09:14', who: '혜림',  text: 'added 2 risks to <strong>Q2 roadmap</strong>' },
    ],
    teamOnline: ['정', '조', '민', '수', '지', '혜', '재'],
    sprint: { label: 'Sprint 14', pct: 62, done: 24, in_progress: 9, todo: 6, delta: 8 },
  };

  // -------------------------- Helpers --------------------------
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'onclick') el.addEventListener('click', v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = _sanitize(v);
      else el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null || c === false) return;
      if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  const _sanitize = (html) => {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script, iframe, object, embed, style').forEach(n => n.remove());
    tmp.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      });
    });
    return tmp.innerHTML;
  };
  const icon = (name) => `<span class="ico" aria-hidden="true" style="--dp-icon:url('/img/dreampath-v2/icons/${name}.svg')"></span>`;

  // -------------------------- API client (Phase 3) --------------------------
  //
  // [CASE STUDY 2026-04-24 — central API helper]
  // All calls go through api() so the 401 branch can uniformly kick the user
  // back to the login screen (session expired) without every caller handling
  // it. Returns null on any failure (network / 4xx / 5xx) after surfacing a
  // toast — callers must treat null as "no render, bail quietly".
  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api/dreampath/' + path, opts);
    } catch (e) {
      toast('네트워크 오류', 'err');
      return null;
    }
    if (res.status === 401) {
      // Session expired or missing — force back to login.
      state.user = null;
      try { localStorage.removeItem('dp_user'); } catch (_) {}
      _renderLogin();
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data && data.error ? data.error : 'HTTP ' + res.status, 'err');
      return null;
    }
    return data;
  }

  // Dreampath session marker cookie — httpOnly dp_token is the real key,
  // but dp_session=1 is a readable flag used purely to decide "do I even
  // try to hit /me on page load". Missing → straight to login.
  function _hasSessionCookie() {
    return /(?:^|;\s*)dp_session=1(?:;|$)/.test(document.cookie || '');
  }

  // User accessors — guard against legacy dp_user shape
  function _displayName() {
    if (!state.user) return 'Guest';
    return String(state.user.display_name || state.user.name || state.user.username || 'User');
  }
  function _avatarChar() {
    if (!state.user) return '?';
    const n = _displayName();
    return n && n.length ? n.slice(0, 1).toUpperCase() : '?';
  }
  function _roleLine() {
    if (!state.user) return '';
    const role = state.user.role || '';
    const dept = state.user.department || '';
    return dept ? role + ' · ' + dept : role;
  }

  // Date helpers
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  };
  const fmtTime = (iso) => {
    if (!iso) return '';
    const dt = new Date(iso);
    return fmtDate(dt) + ' ' + String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
  };
  const todayISO = () => fmtDate(new Date());

  // Toast
  function toast(msg, tone = '') {
    let host = $('#dp-toast-host');
    if (!host) { host = h('div', { id: 'dp-toast-host', className: 'dp-toast-host' }); document.body.appendChild(host); }
    const t = h('div', { className: 'dp-toast ' + tone }, msg);
    host.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // -------------------------- Init --------------------------
  async function init() {
    if (state.density !== 'default') document.documentElement.setAttribute('data-density', state.density);

    _installKeyDelegation();
    _installCmdHotkey();

    // Hydrate from localStorage optimistically (fast paint).
    const saved = localStorage.getItem('dp_user');
    if (saved) { try { state.user = JSON.parse(saved); } catch (_) {} }

    // Decide boot path based on presence of dp_session=1 cookie.
    // [CASE STUDY — dp_session is a gate, not a source of truth]
    //  Presence only tells us "try /me"; absence means "straight to login".
    //  If /me returns 401 the cookie is stale — clear local state and show login.
    if (!_hasSessionCookie() && !state.user) {
      _renderLogin();
      return;
    }

    if (state.user) {
      _mountShell();
      navigate('home');
      // Background refresh from /me so any off-device profile change lands.
      _refreshSelf();
    } else {
      // Cookie present but no cached user — hydrate from /me first.
      const data = await api('GET', 'me');
      if (data && data.user) {
        _acceptUser(data.user);
        _mountShell();
        navigate('home');
      } else {
        _renderLogin();
      }
    }
  }

  // Normalize server user payload into the state.user shape used by the
  // rest of the UI. Server returns id/display_name; we also store the
  // compact legacy fields (uid/name) that older callers expect.
  function _acceptUser(u) {
    if (!u) return;
    state.user = {
      uid: u.id,
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      name: u.display_name || u.username,
      role: u.role,
      department: u.department || '',
      email: u.email || '',
      phone: u.phone || '',
      role_title: u.role_title || '',
      avatar_url: u.avatar_url || '',
    };
    try { localStorage.setItem('dp_user', JSON.stringify(state.user)); } catch (_) {}
  }

  async function _refreshSelf() {
    const data = await api('GET', 'me');
    if (data && data.user) _acceptUser(data.user);
  }

  // [CASE STUDY — keyboard delegation for interactive divs]
  function _installKeyDelegation() {
    const LEGACY = [
      'dp-nav-item', 'dp-post-item', 'dp-audit-row', 'dp-stat', 'dp-cmd-item',
      'dp-schedule-row',
    ];
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (!t || !(t instanceof Element)) return;
      const tag = t.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const role = t.getAttribute('role');
      if (role !== 'button' && !LEGACY.some(c => t.classList.contains(c))) return;
      e.preventDefault();
      t.click();
    });
  }

  function _installCmdHotkey() {
    document.addEventListener('keydown', (e) => {
      // ⌘K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCmd();
      }
      // ESC closes overlays
      if (e.key === 'Escape') {
        if ($('#dp-cmd-backdrop')) closeCmd();
        if ($('#dp-modal-backdrop')) _closeModal();
      }
    });
  }

  // -------------------------- Login --------------------------
  function _renderLogin() {
    document.documentElement.setAttribute('data-v2-boot', 'login');
    const root = $('#dp-root');
    root.innerHTML = '';
    const overlay = h('div', { className: 'dp-login' }, [
      h('div', { className: 'dp-login-card' }, [
        h('div', { className: 'dp-login-brand' }, [
          h('img', { src: '/img/dreampath-v2/logo-mark.svg', alt: 'DreamPath' }),
          h('div', {}, [
            h('h1', {}, 'Dreampath PMO'),
            h('span', {}, 'Project Management Office'),
          ]),
        ]),
        h('p', {}, '관리자 계정으로 로그인하세요. (데모)'),
        h('div', { className: 'dp-field' }, [
          h('label', { for: 'dp-u' }, 'Username'),
          h('input', { id: 'dp-u', className: 'dp-input', type: 'text', value: 'jimmy', autocomplete: 'username' }),
        ]),
        h('div', { className: 'dp-field' }, [
          h('label', { for: 'dp-p' }, 'Password'),
          h('input', { id: 'dp-p', className: 'dp-input', type: 'password', value: '••••••••', autocomplete: 'current-password' }),
        ]),
        h('button', { className: 'dp-btn dp-btn-primary', onclick: login }, 'Sign in'),
      ]),
    ]);
    root.appendChild(overlay);
    document.title = '[v2 ok] Dreampath PMO — Sign in';
  }

  async function login() {
    const uInput = $('#dp-u');
    const pInput = $('#dp-p');
    const username = (uInput && uInput.value || '').trim();
    const password = (pInput && pInput.value || '');
    if (!username || !password) {
      toast('아이디와 비밀번호를 입력하세요', 'err');
      return;
    }
    const btn = $('.dp-login-card .dp-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    let res;
    try {
      res = await fetch('/api/dreampath/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch (_) {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
      toast('네트워크 오류', 'err');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    if (!res.ok) {
      toast((data && data.error) || '로그인 실패', 'err');
      if (pInput) pInput.value = '';
      return;
    }
    _acceptUser(data.user);
    _mountShell();
    navigate('home');
  }

  async function logout() {
    try {
      await fetch('/api/dreampath/auth', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
    } catch (_) {}
    try { localStorage.removeItem('dp_user'); } catch (_) {}
    state.user = null;
    _renderLogin();
  }

  // -------------------------- Shell --------------------------
  function _mountShell() {
    document.documentElement.setAttribute('data-v2-boot', 'shell');
    const root = $('#dp-root');
    root.innerHTML = '';
    const app = h('div', { className: 'dp-app' });
    app.appendChild(_renderSidebar());
    const main = h('main', { className: 'dp-main', id: 'dp-main', tabindex: '-1' });
    main.appendChild(_renderTopbar());
    main.appendChild(h('div', { className: 'dp-thread', 'aria-hidden': 'true' }));
    main.appendChild(h('div', { className: 'dp-page', id: 'dp-page' }));
    app.appendChild(main);
    root.appendChild(app);
  }

  function _renderSidebar() {
    const side = h('aside', { className: 'dp-side', role: 'complementary', id: 'dp-side' });
    const nav = NAV.map(group => `
      <h3>${esc(group.title)}</h3>
      ${group.items.map(it => `
        <button type="button" class="dp-nav-item" data-page="${esc(it.id)}"
                onclick="DP.navigate('${esc(it.id)}')" aria-label="${esc(it.label)}">
          ${icon(it.icon)}
          <span>${esc(it.label)}</span>
          ${it.badge ? `<span class="count">${it.badge}</span>` : ''}
        </button>
      `).join('')}
    `).join('');
    side.innerHTML = `
      <div class="dp-side-brand">
        <img src="/img/dreampath-v2/logo-mark.svg" alt="" aria-hidden="true">
        <div class="wm">
          <strong>Dreampath</strong>
          <span>PMO Portal</span>
        </div>
      </div>
      <nav class="dp-side-nav" aria-label="주 메뉴">
        ${nav}
      </nav>
      <div class="dp-side-foot">
        <div class="dp-side-session">
          <span>Session</span><strong id="dp-session-left">55:21</strong>
        </div>
        <div class="dp-side-user">
          <div class="dp-avatar">${esc(_avatarChar())}</div>
          <div>
            <div class="who">${esc(_displayName())}</div>
            <div class="role">${esc(_roleLine())}</div>
          </div>
        </div>
        <button type="button" class="dp-signout" onclick="DP.logout()">로그아웃</button>
      </div>
    `;
    return side;
  }

  function _renderTopbar() {
    const bar = h('header', { className: 'dp-topbar' });
    bar.innerHTML = `
      <button type="button" class="dp-iconbtn dp-mob-menu" aria-label="Open menu" onclick="DP.toggleSide()">
        <span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/list-ul.svg')"></span>
      </button>
      <div class="dp-crumbs" id="dp-crumbs">
        <span>Dreampath PMO</span>
        <span class="sep">/</span>
        <strong id="dp-crumb-tail">Home</strong>
      </div>
      <div class="dp-top-spacer"></div>
      <div class="dp-switcher" role="group" aria-label="Density">
        <button type="button" data-density="compact" onclick="DP.setDensity('compact')">Compact</button>
        <button type="button" data-density="default" onclick="DP.setDensity('default')">Default</button>
        <button type="button" data-density="comfort" onclick="DP.setDensity('comfort')">Comfort</button>
      </div>
      <label class="dp-search">
        <span class="dp-sr-only">검색</span>
        <input type="search" id="dp-search-input" placeholder="Search… (⌘K)"
               onfocus="DP.openCmd()" aria-label="검색">
        <kbd>⌘K</kbd>
      </label>
      <button type="button" class="dp-iconbtn" aria-label="알림 (3건)" onclick="DP.openNotifs()">
        <span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/bell.svg')"></span>
        <span class="dot" aria-hidden="true"></span>
      </button>
      <button type="button" class="dp-btn dp-btn-primary" onclick="DP.openCreate()">
        <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath-v2/icons/plus.svg')"></span>
        <span>New</span>
      </button>
    `;
    _updateDensityUI();
    return bar;
  }

  function _updateDensityUI() {
    $$('.dp-switcher [data-density]').forEach(b => {
      b.classList.toggle('on', b.dataset.density === state.density);
    });
  }

  function setDensity(d) {
    state.density = d;
    localStorage.setItem('dp_v2_density', d);
    if (d === 'default') document.documentElement.removeAttribute('data-density');
    else document.documentElement.setAttribute('data-density', d);
    _updateDensityUI();
  }

  function toggleSide() {
    const s = $('#dp-side');
    if (s) s.classList.toggle('open');
  }

  // -------------------------- Navigate --------------------------
  function navigate(page) {
    state.page = page;
    const pageEl = $('#dp-page');
    if (!pageEl) return;
    pageEl.innerHTML = '';
    let label = page;
    const r = {
      home:          () => { _renderHome(pageEl);         label = 'Home'; },
      announcements: () => { _renderBoard(pageEl, 'notice', 'Announcements'); label = 'Announcements'; },
      documents:     () => { _renderBoard(pageEl, 'documents', 'Documents');  label = 'Documents'; },
      minutes:       () => { _renderBoard(pageEl, 'minutes', 'Meeting Minutes'); label = 'Meeting Minutes'; },
      tasks:         () => { _renderTasks(pageEl);         label = 'Tasks'; },
      notes:         () => { _renderNotes(pageEl);         label = 'Notes / Issues'; },
      teams:         () => { _renderTeams(pageEl);         label = 'Team Boards'; },
      calendar:      () => { _renderCalendar(pageEl);      label = 'Calendar'; },
      contacts:      () => { _renderContacts(pageEl);      label = 'Contacts'; },
      rules:         () => { _renderRules(pageEl);         label = 'Dev Rules'; },
      versions:      () => { _renderVersions(pageEl);      label = 'Versions'; },
    };
    (r[page] || r.home)();

    const tail = $('#dp-crumb-tail');
    if (tail) tail.textContent = label;
    $$('.dp-nav-item').forEach(b => {
      if (b.dataset.page === state.page) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    // Close mobile sidebar on navigate
    const s = $('#dp-side');
    if (s) s.classList.remove('open');
    // Scroll up
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
    // Focus main for SR
    const main = $('#dp-main');
    if (main) main.focus({ preventScroll: true });
  }

  // =========================================================
  // HOME — wired to /api/dreampath/home + /posts?board=announcements
  // =========================================================
  async function _renderHome(root) {
    // Skeleton so the page isn't visually blank while fetches run.
    root.innerHTML = '';
    const skeleton = h('div', {});
    skeleton.innerHTML = `
      <div class="dp-page-head">
        <div><h1 style="color:var(--text-3)">Loading…</h1></div>
      </div>
      <div class="dp-stat-strip" aria-hidden="true">
        ${Array(5).fill(0).map(() => `<div class="dp-stat"><span class="lbl" style="background:var(--g-150);height:10px;width:60%;display:block;border-radius:2px"></span><span class="val"><span class="n" style="background:var(--g-150);height:20px;width:30px;display:block;border-radius:2px;margin:6px 0"></span></span></div>`).join('')}
      </div>
    `;
    root.appendChild(skeleton);

    // Parallel fetch: /home (main payload) + /posts?board=announcements (top 3).
    // If either fails, the page still renders with whatever came back; api()
    // handles the 401 → login bounce, so here null just means "empty panel".
    const [home, annRes] = await Promise.all([
      api('GET', 'home'),
      api('GET', 'posts?board=announcements&limit=3'),
    ]);

    // If the auth step kicked us back to login, state.user is now null.
    if (!state.user) return;

    // Replace skeleton with real page.
    root.innerHTML = '';

    const now = new Date();
    const today = todayISO();
    const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
    const dateStr = fmtDate(now);
    const meetingsThisWeek = (home && home.today_summary && home.today_summary.meetings_this_week) || 0;

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, `Good morning, ${_displayName()}`),
        h('div', { className: 'meta' }, [
          h('span', {}, `${weekday}요일 · ${dateStr} · `),
          h('strong', {}, String(meetingsThisWeek)),
          h('span', {}, ' meetings this week'),
        ]),
      ]),
    ]));

    root.appendChild(_renderStatStrip(home, today));

    const grid = h('div', { className: 'dp-home' });
    const left = h('div', { className: 'dp-home-col' });
    const right = h('div', { className: 'dp-home-col' });

    const announcements = (annRes && annRes.posts) || [];
    left.appendChild(_renderAnnouncementsPanel(announcements));
    left.appendChild(_renderPendingApprovalsPanel((home && home.pending_approvals) || []));
    left.appendChild(_renderActivityPanel((home && home.recent_changes) || []));

    const events = (home && home.events_current_month) || [];
    const myTasks = (home && home.my_tasks) || [];
    const summary = (home && home.today_summary) || {};

    right.appendChild(_renderTodaySchedule(events, today));
    right.appendChild(_renderMyTasks(myTasks, summary));
    // Team online + sprint progress stay as demo until dedicated APIs exist.
    right.appendChild(_renderTeamOnlinePanel());
    right.appendChild(_renderSprintProgress(summary, myTasks));

    grid.append(left, right);
    root.appendChild(grid);
  }

  // Chip metrics are all derived from /home payload + a couple of my_tasks
  // computed fields (overdue flag is done client-side from due_date vs today).
  function _renderStatStrip(home, today) {
    const my = (home && home.my_tasks) || [];
    const summary = (home && home.today_summary) || {};
    const events = (home && home.events_current_month) || [];
    const pending = (home && home.pending_approvals) || [];

    const tasksDue    = my.filter(t => t.status !== 'done').length;
    const overdue     = my.filter(t => {
      const d = String(t.due_date || '').slice(0, 10);
      return d && d < today && t.status !== 'done';
    }).length;
    const pendingCt   = pending.length || (summary.pending_approvals || 0);
    const todayMtgs   = events.filter(e => String(e.start_date || '').slice(0, 10) === today).length;
    const hiNotes     = summary.high_priority_notes || 0;

    const nextMeet = events.find(e => String(e.start_date || '').slice(0, 10) === today);
    const nextMeetText = nextMeet
      ? 'Next · ' + (nextMeet.start_time || '') + ' ' + nextMeet.title
      : '일정 없음';

    const chips = [
      { lbl: 'My tasks due',       n: tasksDue,  sub: overdue + ' overdue · act now', target: 'tasks',    tone: overdue > 0 ? 'alert' : 'info' },
      { lbl: 'Overdue',            n: overdue,   sub: overdue > 0 ? 'past due date' : 'all caught up',   target: 'tasks',    tone: overdue > 0 ? 'alert' : 'ok' },
      { lbl: 'Pending approvals',  n: pendingCt, sub: pendingCt > 0 ? 'awaiting your vote' : 'none',     target: 'minutes',  tone: pendingCt > 0 ? 'warn' : 'info' },
      { lbl: "Today's meetings",   n: todayMtgs, sub: nextMeetText,                                      target: 'calendar', tone: 'info' },
      { lbl: 'High-priority notes',n: hiNotes,   sub: hiNotes > 0 ? 'open · needs attention' : 'clean',  target: 'notes',    tone: hiNotes > 0 ? 'warn' : 'info' },
    ];
    const strip = h('section', { id: 'dp-today-strip', className: 'dp-stat-strip', 'aria-label': '오늘 요약' });
    chips.forEach(c => {
      const btn = h('button', {
        type: 'button',
        className: 'dp-stat ' + c.tone,
        onclick: () => navigate(c.target),
        'aria-label': c.lbl + ': ' + c.n,
      });
      btn.innerHTML = `
        <div class="lbl">${esc(c.lbl)}</div>
        <div class="val"><span class="n">${esc(String(c.n))}</span></div>
        <div class="sub">${esc(c.sub)}</div>
      `;
      strip.appendChild(btn);
    });
    return strip;
  }

  function _renderAnnouncementsPanel(posts) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': '공지' });
    const head = `
      <div class="dp-panel-head">
        <h3>Announcements <span class="count">${posts.length}</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('announcements')">View all →</a>
      </div>
    `;
    if (!posts.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">공지 없음</div>';
      return panel;
    }
    const body = posts.slice(0, 3).map(p => {
      const excerpt = String(p.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      return `
        <button type="button" class="dp-post-item"
                onclick="DP.viewPost('announcements', ${Number(p.id)})"
                aria-label="${esc(p.title)}">
          <div class="t">
            ${p.pinned ? '<span class="dp-pin" aria-label="Pinned"></span>' : ''}
            <span>${esc(p.title)}</span>
          </div>
          ${excerpt ? `<div class="excerpt">${esc(excerpt)}</div>` : ''}
          <div class="meta">
            <span class="who">${esc(p.author_name || '')}</span>
            <span>·</span>
            <span>${esc(fmtTime(p.created_at))}</span>
            ${p.comment_count ? `<span>·</span><span>${p.comment_count} 댓글</span>` : ''}
          </div>
        </button>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${body}</div>`;
    return panel;
  }

  function _renderPendingApprovalsPanel(list) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': '승인 대기' });
    const head = `
      <div class="dp-panel-head">
        <h3>Pending your approval <span class="count">${list.length}</span></h3>
        ${list.length ? `<a href="#" onclick="event.preventDefault();DP.navigate('minutes')">See all →</a>` : ''}
      </div>
    `;
    if (!list.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">대기중인 승인 없음</div>';
      return panel;
    }
    // pending_approvals items: { post_id, title, board, post_created_at }
    const rows = list.slice(0, 5).map(a => {
      const pid = Number(a.post_id) || 0;
      return `
        <div class="dp-audit-row">
          <div class="main">
            <div class="title"><span>${esc(a.title || '(제목 없음)')}</span></div>
            <div class="meta">
              <span class="dp-tag neutral">${esc(a.board || 'minutes')}</span>
              <span>·</span>
              <span class="ts">${esc(fmtTime(a.post_created_at))}</span>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                    onclick="DP.viewPost('${esc(a.board || 'minutes')}', ${pid})">Review</button>
          </div>
        </div>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${rows}</div>`;
    return panel;
  }

  function _renderActivityPanel(items) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Activity' });
    const head = `
      <div class="dp-panel-head">
        <h3>Recent activity <span class="count">last 24h</span></h3>
      </div>
    `;
    if (!items.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">최근 변경 없음</div>';
      return panel;
    }
    // recent_changes items: { kind, ref_id, title, meta, note, created_at }
    const kindLabel = { post: '게시글', event: '일정', comment: '댓글' };
    const rows = items.slice(0, 8).map(it => {
      const kind = it.kind || 'item';
      return `
        <div class="dp-audit-row">
          <div class="main">
            <div class="title">
              <span class="dp-tag neutral">${esc(kindLabel[kind] || kind)}</span>
              <span>${esc(it.title || '')}</span>
            </div>
            <div class="meta">
              ${it.meta ? `<span class="who">${esc(it.meta)}</span><span>·</span>` : ''}
              <span class="ts">${esc(fmtTime(it.created_at))}</span>
              ${it.note ? `<span>·</span><span>${esc(String(it.note).slice(0, 80))}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${rows}</div>`;
    return panel;
  }

  function _renderTodaySchedule(events, today) {
    const todays = events.filter(e => String(e.start_date || '').slice(0, 10) === today)
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
    const panel = h('section', { className: 'dp-panel', 'aria-label': "Today's schedule" });
    const head = `
      <div class="dp-panel-head">
        <h3>Today · ${esc(today)}</h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('calendar')">Week →</a>
      </div>
    `;
    if (!todays.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">일정 없음</div>';
      return panel;
    }
    const body = todays.map(e => `
      <div class="dp-schedule-row">
        <div class="t">${esc(e.start_time || '--:--')}</div>
        <div class="body">
          <div class="title">${esc(e.title)}</div>
          <div class="sub">${esc(e.end_time ? e.start_time + '–' + e.end_time : '')}${e.type ? ' · ' + esc(e.type) : ''}</div>
        </div>
      </div>
    `).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${body}</div>`;
    return panel;
  }

  function _renderMyTasks(myTasks, summary) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'My tasks' });
    const slice = myTasks.slice(0, 5);
    const dueCt = (summary && summary.tasks_due_today) || 0;
    const head = `
      <div class="dp-panel-head">
        <h3>My tasks <span class="count">${slice.length} assigned</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('tasks')">Board →</a>
      </div>
    `;
    if (!slice.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">배정된 할 일 없음</div>';
      return panel;
    }
    const today = todayISO();
    const rows = slice.map(t => {
      const due = String(t.due_date || '').slice(0, 10);
      let tag;
      if (!due) tag = '<span class="dp-tag neutral">no date</span>';
      else if (due < today && t.status !== 'done') tag = '<span class="dp-tag alert">Overdue</span>';
      else if (due === today) tag = '<span class="dp-tag warn">Today</span>';
      else tag = '<span class="dp-tag neutral">' + esc(due.slice(5)) + '</span>';
      return `
        <tr onclick="DP.viewTask(${Number(t.id)})">
          <td class="mono">TASK-${Number(t.id)}</td>
          <td>${esc(t.title || '')}</td>
          <td>${tag}</td>
        </tr>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body"><table class="dp-table"><tbody>${rows}</tbody></table></div>`;
    return panel;
  }

  // Team online — no dedicated API yet. Show state.user only (known online).
  function _renderTeamOnlinePanel() {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Team online' });
    const me = _avatarChar();
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Team online <span class="count">실시간 presence 미구현</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('contacts')">Directory →</a>
      </div>
      <div class="dp-team-online">
        <div class="dp-avatar" title="you">${esc(me)}</div>
        <div class="more">+N</div>
      </div>
    `;
    return panel;
  }

  // Sprint progress — derive a rough "done vs todo" from my_tasks for now.
  // Real sprint tracking will come when /api/dreampath/sprints lands.
  function _renderSprintProgress(summary, myTasks) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Progress' });
    const done = myTasks.filter(t => t.status === 'done').length;
    const inProg = myTasks.filter(t => t.status === 'in_progress').length;
    const todo = myTasks.filter(t => t.status === 'todo').length;
    const total = Math.max(done + inProg + todo, 1);
    const pct = Math.round((done / total) * 100);
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>My throughput · ${pct}%</h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('tasks')">Details →</a>
      </div>
      <div class="dp-progress">
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        <div class="legend">
          <div><strong>${done}</strong><span>done</span></div>
          <div><strong>${inProg}</strong><span>in progress</span></div>
          <div><strong>${todo}</strong><span>todo</span></div>
        </div>
      </div>
    `;
    return panel;
  }

  // =========================================================
  // BOARDS
  // =========================================================
  function _renderBoard(root, key, label) {
    const posts = DATA.posts[key] || [];
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, label),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openPostEditor(key) }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New post'),
        ]),
      ]),
    ]));

    if (!posts.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/file-text.svg')"></span></div>
        <h4>No posts yet</h4>
        <p>Create the first one for ${esc(label)}.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openPostEditor('${esc(key)}')">+ New post</button>
      `;
      root.appendChild(empty);
      return;
    }

    const table = h('div', { className: 'dp-panel' });
    const headers = key === 'documents'
      ? '<th style="width:110px">ID</th><th>Title</th><th style="width:120px">Author</th><th style="width:80px">Type</th><th style="width:100px">Size</th><th style="width:160px">Updated</th>'
      : key === 'minutes'
      ? '<th style="width:110px">ID</th><th>Title</th><th style="width:140px">Author</th><th style="width:140px">Approval</th><th style="width:160px">Created</th>'
      : '<th style="width:110px">ID</th><th>Title</th><th style="width:140px">Author</th><th style="width:100px">Acks</th><th style="width:160px">Created</th>';
    const rows = posts.map(p => {
      const id = `POST-${String(p.id).padStart(4, '0')}`;
      const pin = p.pinned ? '<span class="dp-pin" style="margin-right:6px" aria-label="Pinned"></span>' : '';
      if (key === 'documents') {
        return `<tr onclick="DP.viewPost('${key}', ${p.id})">
          <td class="mono">${id}</td>
          <td>${pin}${esc(p.title)}</td>
          <td>${esc(p.author_name)}</td>
          <td><span class="dp-tag neutral">${esc(p.type || 'Doc')}</span></td>
          <td class="mono">${esc(p.size || '—')}</td>
          <td class="mono">${esc(fmtTime(p.created_at))}</td>
        </tr>`;
      }
      if (key === 'minutes') {
        const s = p.approval_status || 'draft';
        const tone = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'neutral';
        return `<tr onclick="DP.viewPost('${key}', ${p.id})">
          <td class="mono">${id}</td>
          <td>${pin}${esc(p.title)}</td>
          <td>${esc(p.author_name)}</td>
          <td><span class="dp-tag ${tone}">${esc(s)}</span></td>
          <td class="mono">${esc(fmtTime(p.created_at))}</td>
        </tr>`;
      }
      return `<tr onclick="DP.viewPost('${key}', ${p.id})">
        <td class="mono">${id}</td>
        <td>${pin}${esc(p.title)}</td>
        <td>${esc(p.author_name)}</td>
        <td class="mono">${p.acknowledged || 0}/${p.total || 0}</td>
        <td class="mono">${esc(fmtTime(p.created_at))}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `<table class="dp-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    root.appendChild(table);
  }

  // =========================================================
  // TASKS — dense table (not kanban)
  // =========================================================
  function _renderTasks(root) {
    const ts = DATA.tasks;
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Tasks'),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => toast('New task — Phase 3에서 API 연결') }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New task'),
        ]),
      ]),
    ]));
    const panel = h('div', { className: 'dp-panel' });
    const rows = ts.map(t => {
      const statusTone = t.status === 'done' ? 'ok' : t.status === 'in_progress' ? 'info' : 'neutral';
      const dueTone = t.overdue ? 'alert' : (t.due_date === todayISO() ? 'warn' : 'neutral');
      const prioTone = t.priority === 'high' ? 'alert' : 'neutral';
      return `<tr onclick="DP.viewTask(${t.id})">
        <td class="mono">TASK-${t.id}</td>
        <td>${esc(t.title)}</td>
        <td>${esc(t.assignee)}</td>
        <td class="mono">${esc(t.due_date)}</td>
        <td><span class="dp-tag ${prioTone}">${esc(t.priority)}</span></td>
        <td><span class="dp-tag ${dueTone}">${t.overdue ? 'Overdue' : (t.due_date === todayISO() ? 'Today' : 'Scheduled')}</span></td>
        <td><span class="dp-tag ${statusTone}">${esc(t.status)}</span></td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <table class="dp-table">
        <thead>
          <tr>
            <th style="width:100px">ID</th><th>Title</th>
            <th style="width:120px">Owner</th><th style="width:110px">Due</th>
            <th style="width:90px">Priority</th><th style="width:110px">Schedule</th>
            <th style="width:110px">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  // =========================================================
  // NOTES / ISSUES
  // =========================================================
  function _renderNotes(root) {
    root.appendChild(h('div', { className: 'dp-page-head' }, [h('h1', {}, 'Notes / Issues')]));
    const panel = h('div', { className: 'dp-panel' });
    const rows = DATA.notes.map(n => {
      const statusTone = n.status === 'resolved' ? 'ok' : 'warn';
      const prioTone = n.priority === 'high' ? 'alert' : 'neutral';
      return `<tr onclick="DP.viewNote(${n.id})">
        <td class="mono">${esc(n.type === 'issue' ? 'ISS-' : 'NOTE-')}${n.id}</td>
        <td>${esc(n.title)}</td>
        <td>${esc(n.author)}</td>
        <td><span class="dp-tag ${prioTone}">${esc(n.priority)}</span></td>
        <td><span class="dp-tag ${statusTone}">${esc(n.status)}</span></td>
        <td class="mono">${esc(fmtTime(n.updated_at))}</td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <table class="dp-table">
        <thead><tr><th style="width:110px">ID</th><th>Title</th><th style="width:120px">Author</th><th style="width:90px">Priority</th><th style="width:110px">Status</th><th style="width:170px">Updated</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  // =========================================================
  // TEAMS / CALENDAR / CONTACTS — Phase 3 placeholders in ERP style
  // =========================================================
  function _stubPage(root, title, note) {
    root.appendChild(h('div', { className: 'dp-page-head' }, [h('h1', {}, title)]));
    const e = h('div', { className: 'dp-empty' });
    e.innerHTML = `
      <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/layers.svg')"></span></div>
      <h4>${esc(title)} — Phase 3 에서 API 배선 예정</h4>
      <p>${esc(note)}</p>
    `;
    root.appendChild(e);
  }
  function _renderTeams(root) { _stubPage(root, 'Team Boards', 'Team Korea/Nepal/Indonesia/Pakistan 보드가 여기 연결됩니다.'); }
  function _renderCalendar(root) { _stubPage(root, 'Calendar', '월별 이벤트 그리드 + 반복 일정 + 드래그 이동이 여기 들어옵니다.'); }
  function _renderContacts(root) { _stubPage(root, 'Contacts', '프로젝트 팀 연락처 디렉토리.'); }

  // =========================================================
  // RULES — live-fetch DREAMPATH.md (marked + DOMPurify)
  // =========================================================
  async function _renderRules(root) {
    root.appendChild(h('div', { className: 'dp-page-head' }, [h('h1', {}, 'Dev Rules')]));
    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading DREAMPATH.md…</div>';
    root.appendChild(panel);
    try {
      const res = await fetch('/DREAMPATH.md', { credentials: 'same-origin' });
      const md = await res.text();
      const body = md.replace(/^---\n[\s\S]*?\n---\n*/, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/^>\s*\[!\w+\][^\n]*\n?/gm, '> ');
      if (!window.marked) {
        // Inject marked if not loaded
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/14.1.3/marked.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
      const raw = window.marked.parse(body);
      const clean = _sanitize(raw);
      panel.innerHTML = '';
      const wrap = h('div', { className: 'dp-modal-body', style: { maxHeight: 'none' } });
      wrap.innerHTML = clean;
      panel.appendChild(wrap);
    } catch (err) {
      panel.innerHTML = `<div class="dp-panel-body pad" style="color:var(--alert)">Failed: ${esc(String(err))}</div>`;
    }
  }

  // =========================================================
  // VERSIONS
  // =========================================================
  function _renderVersions(root) {
    root.appendChild(h('div', { className: 'dp-page-head' }, [h('h1', {}, 'Versions')]));
    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Release history <span class="count">demo</span></h3>
      </div>
      <div class="dp-panel-body">
        <table class="dp-table">
          <thead><tr><th style="width:120px">Version</th><th style="width:90px">Type</th><th>Description</th><th style="width:140px">Released</th></tr></thead>
          <tbody>
            <tr><td class="mono">v2.0.0</td><td><span class="dp-tag info">design</span></td><td>ERP token system + ⌘K + density switcher (staging)</td><td class="mono">2026-04-24</td></tr>
            <tr><td class="mono">v01.042.01</td><td><span class="dp-tag warn">fix</span></td><td>v2 user-name guard</td><td class="mono">2026-04-24</td></tr>
            <tr><td class="mono">v01.042.00</td><td><span class="dp-tag info">feature</span></td><td>v2 staging route + guide split</td><td class="mono">2026-04-24</td></tr>
            <tr><td class="mono">v01.041.00</td><td><span class="dp-tag info">feature</span></td><td>Dreampath guide split + icon system</td><td class="mono">2026-04-24</td></tr>
            <tr><td class="mono">v01.040.00</td><td><span class="dp-tag info">feature</span></td><td>홈 전면 개편 (B1~B5)</td><td class="mono">2026-04-24</td></tr>
          </tbody>
        </table>
      </div>
    `;
    root.appendChild(panel);
  }

  // =========================================================
  // MODAL (post/task/note detail)
  // =========================================================
  function _closeModal() {
    const b = $('#dp-modal-backdrop');
    if (b) b.remove();
    const m = $('#dp-modal');
    if (m) m.remove();
  }
  function _openModal(title, bodyHtml, footButtons) {
    _closeModal();
    const backdrop = h('div', { className: 'dp-modal-backdrop', id: 'dp-modal-backdrop', onclick: _closeModal });
    const modal = h('aside', { className: 'dp-modal', id: 'dp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    modal.innerHTML = `
      <div class="dp-modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="dp-iconbtn" aria-label="Close" onclick="DP._closeModal()">
          <span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/x.svg')"></span>
        </button>
      </div>
      <div class="dp-modal-body">${bodyHtml}</div>
      <div class="dp-modal-foot">${footButtons || ''}</div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  }

  async function viewPost(board, id) {
    // Show an immediate loading shell so the user sees feedback while we fetch.
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading post…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    const data = await api('GET', 'posts?id=' + Number(id));
    if (!data || !data.post) { _closeModal(); return; }
    const p = data.post;
    const approvalTone = p.approval_status === 'approved' ? 'ok' : p.approval_status === 'pending' ? 'warn' : 'neutral';
    const filesHtml = (p.files || []).length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:8px">Files</div>
        ${(p.files || []).map(f => `
          <div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:var(--fs-12)">
            <span class="dp-tag neutral">${esc((f.file_type || '').split('/')[1] || 'file')}</span>
            <a href="${esc(f.file_url)}" target="_blank" rel="noopener">${esc(f.file_name)}</a>
            <span style="margin-left:auto;color:var(--text-3);font-family:var(--font-mono)">${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ''}</span>
          </div>
        `).join('')}
      </div>
    ` : '';
    const historyHtml = (p.history || []).length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:8px">Edit history</div>
        ${(p.history || []).slice(0, 5).map(h => `
          <div style="display:grid;grid-template-columns:90px 1fr;gap:12px;padding:4px 0;font-size:11px;color:var(--text-2)">
            <span class="mono" style="color:var(--text-3)">${esc(fmtTime(h.edited_at))}</span>
            <span><strong>${esc(h.editor_name || '')}</strong> — ${esc(h.edit_note || '')}</span>
          </div>
        `).join('')}
      </div>
    ` : '';
    const approvalsHtml = (p.approvals || []).length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:8px">Approvals</div>
        ${(p.approvals || []).map(a => `
          <div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:var(--fs-12)">
            <strong>${esc(a.approver_name)}</strong>
            <span class="dp-tag ${a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'alert' : 'warn'}">${esc(a.status)}</span>
            ${a.voted_at ? `<span class="mono" style="color:var(--text-3);margin-left:auto">${esc(fmtTime(a.voted_at))}</span>` : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    _openModal(
      p.title || '(제목 없음)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dp-tag neutral">POST-${String(p.id).padStart(4, '0')}</span>
        <span class="dp-tag neutral">${esc(p.board)}</span>
        <span>by <strong style="color:var(--text-2)">${esc(p.author_name || '')}</strong></span>
        <span>·</span>
        <span class="mono">${esc(fmtTime(p.created_at))}</span>
        ${p.approval_status ? `<span>·</span><span class="dp-tag ${approvalTone}">${esc(p.approval_status)}</span>` : ''}
        ${p.view_count ? `<span>·</span><span>${p.view_count} views</span>` : ''}
      </div>
      ${_sanitize(p.content || '')}
      ${filesHtml}
      ${approvalsHtml}
      ${historyHtml}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${p.approval_status === 'pending' ? '<button class="dp-btn dp-btn-primary" onclick="DP._voteApproval(' + Number(p.id) + ", 'approved')\">Approve</button>" : ''}`
    );
  }

  // Cast the current user's vote on a meeting-minutes approval.
  // Server matches approver by display_name OR username (lowercased) — see
  // home.js case study comment. We send our display name and let the
  // backend resolve.
  async function _voteApproval(postId, status) {
    const approverName = encodeURIComponent(_displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approverName, { status });
    if (data) {
      toast('투표 반영됨', 'ok');
      _closeModal();
      // If we're on home, re-render to update pending_approvals count.
      if (state.page === 'home') navigate('home');
    }
  }
  function viewTask(id) {
    const t = DATA.tasks.find(x => x.id === id);
    if (!t) return;
    _openModal(
      t.title,
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:10px">
        <span class="mono">TASK-${t.id}</span> · owned by <strong>${esc(t.assignee)}</strong>
      </div>
      <p>상세 내용은 Phase 3 에서 /api/dreampath/tasks 에 배선됩니다.</p>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`
    );
  }
  function viewNote(id) {
    const n = DATA.notes.find(x => x.id === id);
    if (!n) return;
    _openModal(
      n.title,
      `<div style="font-size:11px;color:var(--text-3);margin-bottom:10px"><span class="dp-tag neutral">${esc(n.type)}</span> by <strong style="color:var(--text-2)">${esc(n.author)}</strong> · <span class="mono">${esc(fmtTime(n.updated_at))}</span></div>
       <p>${esc(n.body)}</p>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`
    );
  }

  // Approval legacy shims — pending approvals now go through viewPost()
  // which opens the full post detail and exposes the Approve button when
  // the server reports approval_status === 'pending'.

  // =========================================================
  // COMMAND PALETTE (⌘K)
  // =========================================================
  const CMD_ITEMS = [
    { group: 'Suggested', label: 'New task',                    shortcut: 'N',   run: () => { toast('New task'); } },
    { group: 'Suggested', label: "Open today's minutes",        shortcut: 'M T', run: () => { navigate('minutes'); } },
    { group: 'Suggested', label: 'Approve pending requests (3)',shortcut: 'G A', run: () => { navigate('home'); } },
    { group: 'Navigation', label: 'Go to Home',         shortcut: 'G H', run: () => navigate('home') },
    { group: 'Navigation', label: 'Go to Announcements',shortcut: 'G N', run: () => navigate('announcements') },
    { group: 'Navigation', label: 'Go to Documents',    shortcut: 'G D', run: () => navigate('documents') },
    { group: 'Navigation', label: 'Go to Minutes',      shortcut: 'G M', run: () => navigate('minutes') },
    { group: 'Navigation', label: 'Go to Tasks',        shortcut: 'G T', run: () => navigate('tasks') },
    { group: 'Navigation', label: 'Go to Calendar',     shortcut: 'G C', run: () => navigate('calendar') },
    { group: 'Navigation', label: 'Go to Dev Rules',    shortcut: 'G R', run: () => navigate('rules') },
    { group: 'Actions',    label: 'Toggle density',     shortcut: 'D',   run: () => setDensity(state.density === 'compact' ? 'default' : state.density === 'default' ? 'comfort' : 'compact') },
    { group: 'Actions',    label: 'Sign out',           shortcut: 'Q',   run: logout },
  ];
  let _cmdIdx = 0;
  function openCmd() {
    closeCmd();
    state.cmdOpen = true;
    const backdrop = h('div', { className: 'dp-cmd-backdrop', id: 'dp-cmd-backdrop', onclick: (e) => { if (e.target.id === 'dp-cmd-backdrop') closeCmd(); } });
    const box = h('div', { className: 'dp-cmd' });
    box.innerHTML = `
      <div class="dp-cmd-in">
        <span class="ico" aria-hidden="true" style="width:14px;height:14px;background-color:var(--text-3);-webkit-mask:url('/img/dreampath-v2/icons/search.svg') center/14px 14px no-repeat;mask:url('/img/dreampath-v2/icons/search.svg') center/14px 14px no-repeat"></span>
        <input type="text" id="dp-cmd-input" placeholder="Jump to…" autocomplete="off">
        <kbd>ESC</kbd>
      </div>
      <div class="dp-cmd-list" id="dp-cmd-list"></div>
    `;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    _cmdIdx = 0;
    _renderCmdList('');
    setTimeout(() => { const i = $('#dp-cmd-input'); if (i) i.focus(); }, 30);
    const i = $('#dp-cmd-input');
    i.addEventListener('input', () => { _cmdIdx = 0; _renderCmdList(i.value); });
    i.addEventListener('keydown', (e) => {
      const items = _filteredCmds(i.value);
      if (e.key === 'ArrowDown') { e.preventDefault(); _cmdIdx = Math.min(_cmdIdx + 1, items.length - 1); _renderCmdList(i.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdIdx = Math.max(_cmdIdx - 1, 0); _renderCmdList(i.value); }
      else if (e.key === 'Enter') { e.preventDefault(); const c = items[_cmdIdx]; if (c) { closeCmd(); c.run(); } }
    });
  }
  function closeCmd() {
    state.cmdOpen = false;
    const b = $('#dp-cmd-backdrop'); if (b) b.remove();
  }
  function _filteredCmds(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return CMD_ITEMS;
    return CMD_ITEMS.filter(c => c.label.toLowerCase().includes(q));
  }
  function _renderCmdList(q) {
    const list = $('#dp-cmd-list');
    if (!list) return;
    const items = _filteredCmds(q);
    if (!items.length) { list.innerHTML = '<div class="dp-cmd-empty">No matches</div>'; return; }
    let html = '';
    let prevGroup = '';
    items.forEach((c, idx) => {
      if (c.group !== prevGroup) { html += `<div class="dp-cmd-group">${esc(c.group)}</div>`; prevGroup = c.group; }
      html += `<button type="button" class="dp-cmd-item ${idx === _cmdIdx ? 'on' : ''}" data-idx="${idx}" onclick="DP._cmdPick(${idx})">
        <span>${esc(c.label)}</span>
        <span class="shortcut">${esc(c.shortcut)}</span>
      </button>`;
    });
    list.innerHTML = html;
  }
  function _cmdPick(idx) {
    const q = $('#dp-cmd-input').value;
    const c = _filteredCmds(q)[idx];
    if (c) { closeCmd(); c.run(); }
  }

  function openCreate() {
    if (state.page === 'minutes') _openPostEditor('minutes');
    else if (state.page === 'documents') _openPostEditor('documents');
    else if (state.page === 'tasks') toast('New task — Phase 3');
    else _openPostEditor('notice');
  }
  function openNotifs() {
    toast('Notifications — Phase 3');
  }
  function _openPostEditor(board) {
    _openModal(
      'New post · ' + board,
      `<div class="dp-field"><label>Title</label><input class="dp-input" id="dp-new-t" placeholder="Title"></div>
       <div class="dp-field"><label>Content</label><textarea class="dp-textarea" id="dp-new-b" placeholder="Body…"></textarea></div>
       <p style="font-size:12px;color:var(--text-3)">Tiptap 에디터는 Phase 3 에서 wiring. 지금은 plain text 데모.</p>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveNewPost('${esc(board)}')">Save</button>`
    );
  }
  function _saveNewPost(board) {
    const t = $('#dp-new-t').value.trim();
    const b = $('#dp-new-b').value.trim();
    if (!t) { toast('제목이 필요합니다', 'err'); return; }
    const id = Math.max(...(DATA.posts[board] || []).map(p => p.id), 0) + 1;
    (DATA.posts[board] = DATA.posts[board] || []).unshift({
      id, board, title: t, content: '<p>' + esc(b) + '</p>', excerpt: b, author_name: _displayName(),
      created_at: new Date().toISOString(), acknowledged: 0, total: 0, pinned: false,
    });
    toast('Saved (demo)', 'ok');
    _closeModal();
    if (state.page === 'home') navigate('home');
    else navigate(state.page);
  }

  // -------------------------- Public API --------------------------
  return {
    init, login, logout, navigate, toggleSide,
    openCmd, closeCmd, _cmdPick,
    openCreate, openNotifs, setDensity,
    viewPost, viewTask, viewNote,
    _voteApproval,
    _openPostEditor, _saveNewPost, _closeModal,
  };
})();

// Bootstrap with visible error surfacing
function _dpBoot() {
  try {
    document.documentElement.setAttribute('data-v2-boot', 'init-start');
    DP.init();
    document.documentElement.setAttribute('data-v2-boot', 'init-done');
    document.title = document.title.replace(/^\[v2 boot\]\s*/, '[v2 ok] ');
  } catch (err) {
    document.documentElement.setAttribute('data-v2-boot', 'init-error');
    document.title = '[v2 ERROR] ' + (err && err.message || err);
    const root = document.getElementById('dp-root');
    if (root) {
      root.innerHTML = '<pre style="padding:24px;font:13px monospace;color:#B42318;white-space:pre-wrap;max-width:900px;margin:40px auto;background:#fff;border:1px solid #E5E7EB;border-radius:4px;">v2 boot error — ' +
        String(err && err.message || err) + '\n\n' +
        String(err && err.stack || '').split('\n').slice(0, 12).join('\n') +
        '</pre>';
    }
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _dpBoot);
else _dpBoot();

window.DP = DP;
