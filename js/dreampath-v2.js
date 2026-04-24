// =====================================================================
// Dreampath — single IIFE module (DREAMPATH.md §2)
//
// [CASE STUDY 2026-04-24 — IIFE 분리 금지]
// 증상: 인라인 onclick="DP.foo()" 이 전부 참조 증발, 사이드바 클릭 전부 무반응.
// 원인: 모듈로 쪼개면 DP 전역 누수가 끊어지고, CSP nonce 환경에선 복구 불가.
// 교훈: 한 파일, 한 IIFE. 쪼개고 싶을 때 이 주석을 다시 읽을 것.
// 참고: DREAMPATH.md §2.1 / §18 금지사항 #1.
//
// [CASE STUDY 2026-04-24 — /dreampath CSP 등록]
// 증상: 프로덕션 배포 후 홈 전체 죽음. 클릭 전무.
// 원인: functions/_middleware.js 의 strict-dynamic CSP 가 인라인 차단.
//       isLegacyInlinePath() 에 /dreampath 누락.
// 교훈: 루트 경로 추가할 때마다 isLegacyInlinePath() 반드시 갱신.
// 참고: DREAMPATH.md §10.
// =====================================================================

// [DIAG 2026-04-24] Temporary boot probe — if the script parsed and runs,
// the page title changes to "[v2] …" and an attribute is stamped on <html>.
// If the tab still shows "DreamPath PMO" and <html> lacks the attr, the
// script itself never executed (CSP block / network error / parse error).
try {
  document.title = '[v2 boot] ' + document.title;
  document.documentElement.setAttribute('data-v2-boot', 'parse');
} catch (_) {}

const DP = (() => {
  'use strict';

  // -------------------------- State --------------------------
  const state = {
    user: null,                  // {uid, username, name, role}
    version: '1.008.03',
    page: 'home',                // home|announcements|documents|minutes|tasks|notes|teams|calendar|contacts|rules|versions|post|note|task|event
    currentPostId: null,
    currentNoteId: null,
    currentBoard: 'notice',
    calMonth: new Date(),        // Date cursor for calendar
    search: '',
    home: null,                  // api payload
    tiptapLoaded: false,
  };

  // Routes that need legacy inline (ref in _middleware.js)
  const NAV_GROUPS = [
    { title: 'Overview', items: [
      { id: 'home',          label: 'Home',           icon: 'home' },
      { id: 'announcements', label: 'Announcements',  icon: 'megaphone', badge: 3 },
    ]},
    { title: 'Work', items: [
      { id: 'minutes',       label: 'Minutes',        icon: 'note',      badge: 5 },
      { id: 'tasks',         label: 'Tasks',          icon: 'check',     badge: 12 },
      { id: 'notes',         label: 'Notes & Issues', icon: 'clipboard' },
    ]},
    { title: 'People & Time', items: [
      { id: 'teams',         label: 'Team Boards',    icon: 'users-admin' },
      { id: 'calendar',      label: 'Calendar',       icon: 'calendar' },
      { id: 'contacts',      label: 'Contacts',       icon: 'phone' },
    ]},
    { title: 'Reference', items: [
      { id: 'rules',         label: 'Dev Rules',      icon: 'book' },
      { id: 'versions',      label: 'Versions',       icon: 'layers' },
    ]},
  ];

  // -------------------------- Sample data (offline demo) --------------------------
  const DATA = {
    posts: {
      notice: [
        { id: 101, board: 'notice', title: 'Sprint 14 planning — agenda & goals', pinned: true, author_name: '조은', created_at: '2026-04-24T07:20:00', comments: 4, content: '<h2>Sprint 14 목표</h2><p>온보딩 리디자인과 API rate-limiting 에 집중합니다. 월요일 10시 전에 브리프 읽어 주세요.</p><ul><li>온보딩 플로우 3회차 테스트</li><li>API /auth 리트라이 정책 정비</li><li>Q2 로드맵 리뷰</li></ul><p>담당자: <code>@조은 @민수 @수진</code></p>' },
        { id: 102, board: 'notice', title: 'Security review findings — action required', pinned: false, author_name: '민수', created_at: '2026-04-24T04:41:00', comments: 2, unread: true, content: '<p>3건의 <strong>high-severity</strong> 항목을 발견했습니다. 담당자 지정 완료. 시정 기한: <strong>4월 30일</strong>.</p><blockquote>상세는 링크된 감사 로그 참조.</blockquote>' },
        { id: 103, board: 'notice', title: 'Office move — Fri Apr 26 logistics', pinned: false, author_name: 'HR', created_at: '2026-04-23T09:10:00', comments: 8, content: '<p>책상 배정 완료. 노트북과 모니터 케이블만 챙겨오세요. 나머지는 이사팀이 옮깁니다.</p>' },
        { id: 104, board: 'notice', title: 'Company retreat — 일정 확정', pinned: false, author_name: 'HR', created_at: '2026-04-22T14:00:00', comments: 11, content: '<p>5월 22-24일, 강원도. 세부 일정은 링크 참조.</p>' },
      ],
      documents: [
        { id: 201, board: 'documents', title: 'API v2 spec — final draft', pinned: true, author_name: '민수', created_at: '2026-04-24T12:18:00', comments: 3, content: '<h2>API v2 스펙</h2><p>최종 초안입니다. 엔드포인트 목록, 오류 코드, rate-limit 정책 포함.</p><table><thead><tr><th>Endpoint</th><th>Method</th><th>Purpose</th></tr></thead><tbody><tr><td>/auth/login</td><td>POST</td><td>세션 발급</td></tr><tr><td>/auth/session</td><td>GET</td><td>세션 갱신</td></tr></tbody></table>' },
        { id: 202, board: 'documents', title: 'Onboarding redesign — wireframes v3', pinned: false, author_name: '수진', created_at: '2026-04-23T16:30:00', comments: 5, content: '<p>3차 와이어프레임.</p>' },
        { id: 203, board: 'documents', title: 'Q2 roadmap — exec summary', pinned: false, author_name: '조은', created_at: '2026-04-22T11:00:00', comments: 2, content: '<p>요약본.</p>' },
      ],
      minutes: [
        { id: 301, board: 'minutes', title: 'Product weekly (Apr 22)', author_name: '수진', created_at: '2026-04-22T15:00:00', comments: 1, approval_status: 'pending', approvers: [
          { id: 1, name: '조은', status: 'approved', voted_at: '2026-04-22T17:20:00' },
          { id: 2, name: '민수', status: 'pending' },
          { id: 3, name: '지우', status: 'pending' },
          { id: 4, name: '정현', status: 'pending' },
        ], content: '<h2>참석</h2><p>조은, 민수, 지우, 수진, 정현</p><h2>논의</h2><ol><li>온보딩 리디자인 v3 리뷰</li><li>API rate-limiting 정책</li><li>Q2 예산 승인 안건</li></ol><h2>결정</h2><ul><li>온보딩 v3 a/b 테스트 승인 — 5월 2주</li><li>rate-limit: 100 req/min/IP, 5xx 재시도 exponential</li></ul><h2>Action Items</h2><ul><li>@민수 API v2 spec 최종안 (4/25)</li><li>@수진 온보딩 테스트 계획 (4/26)</li></ul>' },
        { id: 302, board: 'minutes', title: 'Engineering all-hands (Apr 18)', author_name: '민수', created_at: '2026-04-18T14:00:00', comments: 0, approval_status: 'approved', approvers: [
          { id: 1, name: '조은', status: 'approved' },
          { id: 2, name: '민수', status: 'approved' },
          { id: 3, name: '정현', status: 'approved' },
        ], content: '<h2>Topics</h2><ul><li>Q1 회고</li><li>Q2 채용 계획</li><li>인프라 로드맵</li></ul>' },
        { id: 303, board: 'minutes', title: 'PMO weekly (Apr 15)', author_name: '정현', created_at: '2026-04-15T10:00:00', comments: 2, approval_status: 'approved', approvers: [
          { id: 1, name: '조은', status: 'approved' },
          { id: 2, name: '민수', status: 'approved' },
        ], content: '<p>주간 PMO 회의록.</p>' },
      ],
    },
    tasks: [
      { id: 408, title: 'Onboarding flow review', assignee: '정현', status: 'todo', priority: 'high', due_date: '2026-04-22', overdue: true },
      { id: 411, title: 'Fix rate-limit edge case (Safari)', assignee: '민수', status: 'todo', priority: 'high', due_date: '2026-04-23', overdue: true },
      { id: 415, title: 'Share Q2 roadmap to all-hands',  assignee: '조은', status: 'in_progress', priority: 'mid',  due_date: '2026-04-24' },
      { id: 416, title: 'Draft PMO charter v2',            assignee: '정현', status: 'in_progress', priority: 'mid', due_date: '2026-04-28' },
      { id: 420, title: 'Vendor call prep — Cloudflare',   assignee: '수진', status: 'todo', priority: 'low', due_date: '2026-04-25' },
      { id: 422, title: 'Finalize sprint 15 backlog',      assignee: '지우', status: 'todo', priority: 'mid', due_date: '2026-04-26' },
      { id: 430, title: 'Publish API v2 spec',             assignee: '민수', status: 'done', priority: 'high', due_date: '2026-04-24' },
      { id: 431, title: 'Update onboarding copy',          assignee: '수진', status: 'done', priority: 'low',  due_date: '2026-04-23' },
    ],
    notes: [
      { id: 89, title: 'Login 500 on Safari 17', type: 'issue', status: 'closed', priority: 'high', updated_at: '2026-04-24T10:02:00', body: 'Safari 17 환경에서 CORS 헤더 누락.' },
      { id: 90, title: 'Q2 OKR — working draft',  type: 'note',  status: 'open',   priority: 'mid',  updated_at: '2026-04-24T09:30:00', body: 'Owner: 조은.' },
      { id: 91, title: 'Retro notes — Sprint 13', type: 'note',  status: 'open',   priority: 'low',  updated_at: '2026-04-23T17:00:00', body: '스프린트 13 회고.' },
      { id: 92, title: 'i18n strategy proposal',  type: 'note',  status: 'open',   priority: 'mid',  updated_at: '2026-04-23T11:00:00', body: '2개 언어 추가 로드맵.' },
      { id: 93, title: 'Payment webhook reliability', type: 'issue', status: 'open', priority: 'high', updated_at: '2026-04-22T20:10:00', body: '주 3~4회 재시도 실패.' },
    ],
    events: [
      { id: 1, title: 'Stand-up',            start_date: '2026-04-24', end_date: '2026-04-24', start_time: '10:30', end_time: '10:45', type: 'meeting'   },
      { id: 2, title: 'Sprint 14 planning',  start_date: '2026-04-24', end_date: '2026-04-24', start_time: '13:00', end_time: '14:30', type: 'meeting'   },
      { id: 3, title: '1:1 · 조은',          start_date: '2026-04-24', end_date: '2026-04-24', start_time: '15:30', end_time: '16:00', type: 'meeting'   },
      { id: 4, title: 'Q2 roadmap deadline', start_date: '2026-04-28', end_date: '2026-04-28', type: 'deadline' },
      { id: 5, title: 'Retreat',             start_date: '2026-05-22', end_date: '2026-05-24', type: 'milestone' },
      { id: 6, title: 'API v2 launch',       start_date: '2026-05-06', end_date: '2026-05-06', type: 'milestone' },
      { id: 7, title: 'All-hands',           start_date: '2026-04-30', end_date: '2026-04-30', start_time: '16:00', end_time: '17:00', type: 'meeting'   },
      { id: 8, title: 'Office move',         start_date: '2026-04-26', end_date: '2026-04-26', type: 'general'   },
      { id: 9, title: 'Security audit close', start_date: '2026-04-30', end_date: '2026-04-30', type: 'deadline' },
    ],
    contacts: [
      { name: '조은',   role: 'PMO Lead',              phone: '010-1111-2222', email: 'joe@example.com' },
      { name: '민수',   role: 'Engineering Lead',      phone: '010-3333-4444', email: 'ms@example.com'  },
      { name: '수진',   role: 'Product Manager',       phone: '010-5555-6666', email: 'sj@example.com'  },
      { name: '지우',   role: 'Design Lead',           phone: '010-7777-8888', email: 'jw@example.com'  },
      { name: '정현',   role: 'PMO · Backend',         phone: '010-9999-0000', email: 'jh@example.com'  },
      { name: '혜린',   role: 'Operations',            phone: '010-1212-3434', email: 'hr@example.com'  },
    ],
    teams: [
      { name: 'Team Engineering', members: 14, lead: '민수' },
      { name: 'Team Product',     members: 8,  lead: '수진' },
      { name: 'Team Design',      members: 5,  lead: '지우' },
      { name: 'Team Operations',  members: 6,  lead: '혜린' },
    ],
    versions: [
      { v: '1.008.03', type: 'fix',     released: '2026-04-24', note: 'Home 승인 대기 필터 정정' },
      { v: '1.008.02', type: 'fix',     released: '2026-04-24', note: 'Calendar 반복 이벤트 확장' },
      { v: '1.008.01', type: 'feature', released: '2026-04-23', note: 'Tiptap — Table/HorizontalRule' },
      { v: '1.007.00', type: 'feature', released: '2026-04-22', note: '회의록 다중 승인 워크플로우' },
      { v: '1.006.00', type: 'feature', released: '2026-04-18', note: 'Team Boards — 접근제어' },
      { v: '1.005.02', type: 'fix',     released: '2026-04-15', note: 'Board list pagination' },
    ],
  };

  // Sample audit / feed for Home
  const AUDIT = [
    { ts: '14:02', who: '@지우',   what: 'changed status of', what_ref: 'TASK-412', to: 'In review' },
    { ts: '13:41', who: '@수진',   what: 'published',         what_ref: 'Minutes · Product weekly' },
    { ts: '12:18', who: '@민수',   what: 'uploaded',          what_ref: 'API v2 spec · final draft', to: '/Documents' },
    { ts: '11:55', who: '@조은',   what: 'pinned announcement', what_ref: 'Sprint 14 planning' },
    { ts: '10:02', who: '@정현',   what: 'closed issue',      what_ref: 'NOTE-89 · Login 500 on Safari' },
    { ts: '09:14', who: '@혜린',   what: 'added 2 risks to',  what_ref: 'Q2 roadmap' },
  ];

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
      else if (k === 'html') el.innerHTML = v; // trusted-only; always pass through _sanitize for user content
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
  const fmt = (d) => {
    if (!d) return '';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };
  const fmtTime = (iso) => {
    if (!iso) return '';
    const dt = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return `${fmt(dt)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const pluralMin = n => n === 1 ? 'min' : 'min';
  const todayISO = () => fmt(new Date());

  // DOMPurify-lite fallback for sanitizing — prefer real DOMPurify if loaded
  const _sanitize = (html) => {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    // conservative inline fallback: strip <script>, on* attrs, javascript: urls
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script, iframe, object, embed, style').forEach(n => n.remove());
    tmp.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        if (/^on/i.test(a.name)) n.removeAttribute(a.name);
        if (a.name === 'href' && /^javascript:/i.test(a.value)) n.removeAttribute(a.name);
        if (a.name === 'src'  && /^javascript:/i.test(a.value)) n.removeAttribute(a.name);
      });
    });
    return tmp.innerHTML;
  };

  // Icon span w/ CSS mask
  const icon = (name, cls = '') => `<span class="dp-nav-icon-svg ${cls}" aria-hidden="true" style="--dp-icon:url('/img/dreampath-v2/icons/${name}.svg')"></span>`;

  // -------------------------- Init --------------------------
  function init() {
    _installKeyDelegation();
    _bindMisc();
    // Check "auth"
    const saved = localStorage.getItem('dp_user');
    if (saved) {
      try { state.user = JSON.parse(saved); } catch {}
    }
    if (!state.user) {
      _renderLogin();
    } else {
      _mountShell();
      navigate('home');
    }
  }

  // [CASE STUDY 2026-04-24 — /dreampath 키보드 위임]
  // 증상: role=button divs Enter/Space 무반응.
  // 원인: native button 아님. click 이벤트만 있는 div 들.
  // 교훈: keydown 전역 위임 유지. 새 인터랙티브 div 에도 role=button/tabindex=0 줄 것.
  function _installKeyDelegation() {
    const LEGACY_CLASSES = [
      'dp-nav-item', 'dp-preview-item', 'dp-search-hit', 'dp-home-item',
      'dp-today-chip', 'dp-approval-card', 'dp-task-quick-btn',
      'dp-cal-day', 'dp-cal-event-strip', 'dp-cal-bar', 'dp-cal-more',
    ];
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (!t || !(t instanceof Element)) return;
      const tag = t.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const role = t.getAttribute('role');
      const isRoleBtn = role === 'button';
      const isLegacy = LEGACY_CLASSES.some(c => t.classList.contains(c));
      if (!isRoleBtn && !isLegacy) return;
      e.preventDefault();
      t.click();
    });
  }

  function _bindMisc() {
    // ESC closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') _closeModal();
    });
  }

  // -------------------------- Login --------------------------
  function _renderLogin() {
    const root = $('#dp-root');
    root.innerHTML = '';
    const overlay = h('div', { className: 'dp-login' }, [
      h('div', { className: 'dp-login-card' }, [
        h('div', { className: 'dp-login-brand' }, [
          h('img', { src: '/img/dreampath-v2/logo-mark.svg', alt: 'DreamPath' }),
          h('h1', {}, 'DreamPath PMO'),
        ]),
        h('p', {}, '관리자 계정으로 로그인하세요.'),
        h('div', { className: 'dp-field' }, [
          h('label', { for: 'dp-u' }, 'ID'),
          h('input', { id: 'dp-u', className: 'dp-input', type: 'text', value: 'admin', autocomplete: 'username' }),
        ]),
        h('div', { className: 'dp-field' }, [
          h('label', { for: 'dp-p' }, 'Password'),
          h('input', { id: 'dp-p', className: 'dp-input', type: 'password', value: '••••••••', autocomplete: 'current-password' }),
        ]),
        h('button', { className: 'dp-btn primary', onclick: () => login() }, 'Sign in'),
      ]),
    ]);
    root.appendChild(overlay);
  }

  function login() {
    // Demo — in production this hits /api/dreampath/auth
    state.user = { uid: 1, username: 'admin', name: '정현', role: 'admin', department: 'PMO' };
    localStorage.setItem('dp_user', JSON.stringify(state.user));
    _mountShell();
    navigate('home');
  }

  function logout() {
    localStorage.removeItem('dp_user');
    state.user = null;
    _renderLogin();
  }

  // -------------------------- Shell --------------------------
  function _mountShell() {
    const root = $('#dp-root');
    root.innerHTML = '';
    const skip = h('a', { className: 'dp-skip-link', href: '#dp-main' }, '본문으로 건너뛰기');
    const sidebar = _renderSidebar();
    const main = h('main', { className: 'dp-main', id: 'dp-main', tabindex: '-1' }, [
      _renderTopbar(),
      h('div', { className: 'dp-page', id: 'dp-page' }),
    ]);
    const app = h('div', { className: 'dp-app' }, [sidebar, main]);
    root.append(skip, app);
  }

  function _renderSidebar() {
    const side = h('aside', { className: 'dp-sidebar', role: 'complementary' });
    side.innerHTML = `
      <div class="dp-side-brand">
        <img src="/img/dreampath-v2/logo-mark.svg" width="36" height="36" alt="" aria-hidden="true">
        <div class="wm">
          <strong>DreamPath</strong>
          <span>PMO Portal</span>
        </div>
      </div>
      <nav class="dp-side-nav" aria-label="주 메뉴">
        ${NAV_GROUPS.map(g => `
          <h3>${esc(g.title)}</h3>
          ${g.items.map(it => `
            <button type="button" class="dp-nav-item" data-page="${it.id}" onclick="DP.navigate('${it.id}')" aria-label="${esc(it.label)}">
              ${icon(it.icon)}
              <span>${esc(it.label)}</span>
              ${it.badge ? `<span class="badge">${it.badge}</span>` : ''}
            </button>
          `).join('')}
        `).join('')}
      </nav>
      <div class="dp-side-foot">
        <div class="dp-session">세션 <strong>55:21</strong></div>
        <div class="dp-user">
          <div class="dp-avatar">${state.user ? esc(state.user.name.slice(0,1)) : '?'}</div>
          <div>
            <div class="who">${state.user ? esc(state.user.name) : 'Guest'}</div>
            <div class="role">${state.user ? esc(state.user.role + ' · ' + state.user.department) : ''}</div>
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
      <div class="dp-crumbs">
        <span>DreamPath PMO</span>
        <span class="sep">/</span>
        <strong id="dp-crumb-tail">Home</strong>
      </div>
      <div class="dp-search">
        <span class="dp-search-icon" aria-hidden="true" style="--dp-icon:url('/img/dreampath-v2/icons/search.svg')"></span>
        <input type="search" class="dp-input" id="dp-search-input" placeholder="게시글·할 일·메모·연락처 검색…" aria-label="통합 검색" oninput="DP.onSearchInput(event)">
      </div>
      <div class="dp-top-actions">
        <button type="button" class="dp-iconbtn" aria-label="알림 (3개)">
          ${icon('bell')}<span class="dp-dot" aria-hidden="true"></span>
        </button>
        <button type="button" class="dp-iconbtn" aria-label="설정">
          ${icon('settings')}
        </button>
        <button type="button" class="dp-btn primary" onclick="DP.openCreate()">${icon('plus')}<span>New</span></button>
      </div>
    `;
    return bar;
  }

  function _updateCrumb(label) {
    const tail = $('#dp-crumb-tail');
    if (tail) tail.textContent = label;
    // Active nav highlight
    $$('.dp-nav-item').forEach(b => {
      if (b.dataset.page === state.page) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  function _setPage(node, label) {
    const pg = $('#dp-page');
    if (!pg) return;
    pg.innerHTML = '';
    pg.appendChild(node);
    _updateCrumb(label);
    // focus main for SR
    const main = $('#dp-main');
    if (main) main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // -------------------------- Navigate --------------------------
  function navigate(page, opts = {}) {
    state.page = page;
    state.currentPostId = null;
    state.currentNoteId = null;
    const root = h('div');
    let label = page;
    if (page === 'home')            { _renderHome(root);              label = 'Home'; }
    else if (page === 'announcements'){_renderBoard(root, 'notice');  label = 'Announcements'; }
    else if (page === 'minutes')    { _renderBoard(root, 'minutes');  label = 'Minutes'; }
    else if (page === 'documents')  { _renderBoard(root, 'documents'); label = 'Documents'; }
    else if (page === 'tasks')      { _renderTasks(root);             label = 'Tasks'; }
    else if (page === 'notes')      { _renderNotes(root);             label = 'Notes & Issues'; }
    else if (page === 'teams')      { _renderTeams(root);             label = 'Team Boards'; }
    else if (page === 'calendar')   { _renderCalendar(root);          label = 'Calendar'; }
    else if (page === 'contacts')   { _renderContacts(root);          label = 'Contacts'; }
    else if (page === 'rules')      { _renderRules(root);             label = 'Dev Rules'; }
    else if (page === 'versions')   { _renderVersions(root);          label = 'Versions'; }
    else                            { _renderHome(root);              label = 'Home'; state.page = 'home'; }
    _setPage(root, label);
  }

  // -------------------------- Home --------------------------
  function _renderHome(root) {
    // Build "home" payload (would come from /api/dreampath/home)
    const home = _computeHome();
    state.home = home;

    // Page head
    const head = h('div', { className: 'dp-page-head' });
    const now = new Date();
    const weekday = ['일','월','화','수','목','금','토'][now.getDay()];
    head.innerHTML = `
      <h1>Good morning, ${esc(state.user?.name || '')}</h1>
      <p class="sub">${weekday}요일 · ${fmt(now)} · <strong>${home.today_summary.meetings_this_week}</strong> meetings this week</p>
    `;
    root.appendChild(head);

    // B1 — Today strip
    root.appendChild(_renderTodaySummary(home.today_summary));

    // B5 — Pending approvals (only if non-empty)
    if (home.pending_approvals.length > 0) {
      root.appendChild(_renderPendingApprovals(home.pending_approvals));
    }

    // Two-col grid
    const grid = h('div', { className: 'dp-home' });
    const left = h('div');
    const right = h('div');
    grid.append(left, right);

    // LEFT: pinned announcements + alerts (my_tasks w/ B4) + recent activity + feed
    left.appendChild(_renderPinned(home.pinned));
    left.appendChild(_renderMyTasks(home.my_tasks));
    left.appendChild(_renderRecentChanges(home.recent_changes));
    left.appendChild(_renderActivity());

    // RIGHT: Today's meetings + month snapshot + team online + sprint progress
    right.appendChild(_renderTodayMeetings(home.today_events));
    right.appendChild(_renderMiniMonth());
    right.appendChild(_renderTeamOnline());
    right.appendChild(_renderSprintProgress());

    root.appendChild(grid);
  }

  function _computeHome() {
    const today = todayISO();
    const tasks = DATA.tasks;
    const pending = DATA.posts.minutes.filter(p => p.approval_status === 'pending')
      .map(p => ({ post_id: p.id, board: 'minutes', title: p.title, author: p.author_name, created_at: p.created_at }));
    const my_tasks = tasks.filter(t => t.assignee === (state.user?.name || '정현') && t.status !== 'done')
      .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1)).slice(0, 5);
    const todays_events = DATA.events.filter(e => e.start_date === today);
    const pinned = DATA.posts.notice.filter(p => p.pinned).concat(DATA.posts.documents.filter(p => p.pinned)).slice(0, 2);
    // Recent changes = flatten latest posts from all boards
    const recent = [];
    for (const key of ['notice','documents','minutes']) {
      DATA.posts[key].forEach(p => recent.push({
        kind: 'post', board: key, id: p.id, title: p.title, author: p.author_name, created_at: p.created_at,
      }));
    }
    recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      today_summary: {
        tasks_due_today: tasks.filter(t => t.due_date === today && t.status !== 'done').length,
        tasks_overdue:   tasks.filter(t => t.overdue).length,
        meetings_this_week: DATA.events.filter(e => e.type === 'meeting').length,
        pending_approvals: pending.length,
        high_priority_notes: DATA.notes.filter(n => n.priority === 'high' && n.status === 'open').length,
        today,
      },
      pending_approvals: pending,
      my_tasks,
      today_events: todays_events,
      pinned,
      recent_changes: recent.slice(0, 8),
    };
  }

  // B1 — Today strip
  function _renderTodaySummary(summary) {
    const strip = h('section', { id: 'dp-today-strip', 'aria-label': '오늘 요약' });
    const chips = [
      { key: 'tasks_due_today',  target: 'tasks',       lbl: 'Tasks due today',  tone: summary.tasks_due_today > 0 ? 'warn' : 'info' },
      { key: 'tasks_overdue',    target: 'tasks',       lbl: 'Overdue',          tone: summary.tasks_overdue   > 0 ? 'alert' : 'info', hideIfZero: true },
      { key: 'meetings_this_week', target: 'calendar',  lbl: 'Meetings this week', tone: 'info' },
      { key: 'pending_approvals', target: 'minutes',    lbl: 'Pending approvals', tone: summary.pending_approvals > 0 ? 'warn' : 'info' },
      { key: 'high_priority_notes', target: 'notes',    lbl: 'High-priority notes', tone: summary.high_priority_notes > 0 ? 'alert' : 'info' },
    ];
    chips.forEach(c => {
      if (c.hideIfZero && summary[c.key] === 0) return;
      const n = summary[c.key];
      const chip = h('button', {
        type: 'button', className: `dp-today-chip ${n > 0 ? c.tone : ''}`,
        onclick: () => navigate(c.target),
        'aria-label': `${c.lbl}: ${n}`,
      });
      chip.innerHTML = `<span class="lbl">${esc(c.lbl)}</span><span><span class="n">${n}</span></span>`;
      strip.appendChild(chip);
    });
    return strip;
  }

  // B5 — Pending approvals
  function _renderPendingApprovals(list) {
    const sec = h('section', { className: 'dp-approvals-bar', 'aria-label': '내 승인 대기' });
    sec.innerHTML = `<h2><span class="dot"></span>내 승인 대기 · ${list.length}건</h2>`;
    const cards = h('div', { className: 'dp-approval-cards' });
    list.forEach(a => {
      const card = h('button', {
        type: 'button', className: 'dp-approval-card',
        onclick: () => _viewPost(a.board, a.post_id),
        'aria-label': `${a.title} — 승인 대기`,
      });
      card.innerHTML = `
        <div class="meta">Minutes · 승인 필요</div>
        <div class="t">${esc(a.title)}</div>
        <div class="by">by ${esc(a.author)} · ${fmtTime(a.created_at)}</div>
      `;
      cards.appendChild(card);
    });
    sec.appendChild(cards);
    return sec;
  }

  function _renderPinned(pinned) {
    const card = h('section', { className: 'dp-card', 'aria-label': '고정 공지' });
    card.innerHTML = `<h3>📌 Pinned</h3>`;
    if (!pinned.length) {
      card.innerHTML += `<p style="color: var(--text-3); font-size: 13px;">고정된 항목이 없습니다.</p>`;
      return card;
    }
    pinned.forEach(p => {
      const item = h('button', {
        type: 'button', className: 'dp-preview-item',
        onclick: () => _viewPost(p.board, p.id),
      });
      item.innerHTML = `
        <div style="flex:1;">
          <div class="title">${esc(p.title)}</div>
          <div class="meta">${esc(p.board)} · ${esc(p.author_name)} · ${fmtTime(p.created_at)} · 💬 ${p.comments}</div>
        </div>
        ${icon('chevron-right', 'arrow')}
      `;
      card.appendChild(item);
    });
    return card;
  }

  // B4 — My tasks with quick status buttons
  function _renderMyTasks(tasks) {
    const card = h('section', { className: 'dp-card', 'aria-label': '내 할 일' });
    card.innerHTML = `<h3>My tasks <span class="count">${tasks.length} active</span></h3>`;
    if (!tasks.length) {
      card.innerHTML += `<p style="color: var(--text-3); font-size:13px;">모두 완료했습니다 🎉</p>`;
      return card;
    }
    tasks.forEach(t => {
      const row = h('div', { className: 'dp-row' });
      const pillTone = t.overdue ? 'priority-high' : t.priority === 'high' ? 'priority-high' : t.priority === 'mid' ? 'priority-mid' : 'priority-low';
      const pillLabel = t.overdue ? 'Overdue' : (t.due_date === todayISO() ? 'Today' : fmt(t.due_date));
      row.innerHTML = `
        <span class="dp-pill ${pillTone}">${esc(pillLabel)}</span>
        <div class="t">TASK-${t.id} · ${esc(t.title)}</div>
        <span class="meta">${esc(t.assignee)}</span>
        <button type="button" class="dp-task-quick-btn start" onclick="DP._homeTaskQuick(${t.id}, 'in_progress')">Start</button>
        <button type="button" class="dp-task-quick-btn done"  onclick="DP._homeTaskQuick(${t.id}, 'done')">Done</button>
      `;
      card.appendChild(row);
    });
    return card;
  }

  // B4 handler — would PUT /api/dreampath/tasks?id=N (not PATCH)
  function _homeTaskQuick(id, newStatus) {
    const t = DATA.tasks.find(x => x.id === id);
    if (!t) return;
    t.status = newStatus;
    if (newStatus === 'done') t.overdue = false;
    _reloadHome();
  }

  function _reloadHome() {
    if (state.page !== 'home') return;
    const root = h('div');
    _renderHome(root);
    _setPage(root, 'Home');
  }

  // B2 — Recent Changes w/ unread dot
  function _renderRecentChanges(items) {
    const card = h('section', { className: 'dp-card', 'aria-label': '최근 변경' });
    card.innerHTML = `<h3>Recent changes <span class="count">last 24h</span></h3>`;
    const lastSeen = parseInt(localStorage.getItem('dp_home_last_seen_at') || '0', 10);
    items.forEach(it => {
      const ts = new Date(it.created_at).getTime();
      const isUnread = ts > lastSeen;
      const btn = h('button', {
        type: 'button', className: 'dp-home-item',
        onclick: () => _viewPost(it.board, it.id),
      });
      btn.innerHTML = `
        <div style="flex:1;">
          <div class="title ${isUnread ? 'dp-unread' : ''}">${esc(it.title)}${isUnread ? '<span class="dp-sr-only">(새 항목)</span>' : ''}</div>
          <div class="meta">${esc(it.board)} · ${esc(it.author)} · ${fmtTime(it.created_at)}</div>
        </div>
        ${icon('chevron-right')}
      `;
      card.appendChild(btn);
    });
    // Persist last-seen after 1.2s
    setTimeout(() => {
      const maxTs = Math.max(...items.map(i => new Date(i.created_at).getTime()), 0);
      if (maxTs) localStorage.setItem('dp_home_last_seen_at', String(maxTs));
    }, 1200);
    return card;
  }

  function _renderActivity() {
    const card = h('section', { className: 'dp-card', 'aria-label': '활동 로그' });
    card.innerHTML = `<h3>Activity</h3>`;
    AUDIT.forEach(a => {
      const row = h('div', { className: 'dp-row' });
      row.innerHTML = `
        <span class="meta" style="min-width:44px; font-family: var(--font-mono);">${esc(a.ts)}</span>
        <div class="t" style="font-weight:500;">
          <span style="color: var(--accent); font-weight:600;">${esc(a.who)}</span>
          ${esc(a.what)}
          <strong>${esc(a.what_ref)}</strong>
          ${a.to ? `to <strong>${esc(a.to)}</strong>` : ''}
        </div>
      `;
      card.appendChild(row);
    });
    return card;
  }

  function _renderTodayMeetings(events) {
    const card = h('section', { className: 'dp-card', 'aria-label': "오늘의 일정" });
    card.innerHTML = `<h3>오늘 · ${fmt(new Date())}</h3>`;
    if (!events.length) {
      card.innerHTML += `<p style="color:var(--text-3);font-size:13px;">오늘 예정된 회의가 없습니다.</p>`;
      return card;
    }
    events.forEach(e => {
      const row = h('div', { className: 'dp-row' });
      row.innerHTML = `
        <span class="meta" style="min-width:56px; font-family: var(--font-mono); color: var(--accent); font-weight:600;">${esc(e.start_time || '종일')}</span>
        <div style="flex:1;">
          <div class="t">${esc(e.title)}</div>
          <div class="meta">${esc((e.end_time && e.start_time) ? `${e.start_time}–${e.end_time}` : '')} · ${esc(e.type)}</div>
        </div>
      `;
      card.appendChild(row);
    });
    return card;
  }

  function _renderMiniMonth() {
    const card = h('section', { className: 'dp-card', 'aria-label': '이번 달' });
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const monthName = now.toLocaleString('ko-KR', { month: 'long' });
    card.innerHTML = `<h3>${year} ${esc(monthName)} <span class="count" style="margin-left:auto;">View →</span></h3>`;

    const mini = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginTop: '8px' } });
    ['일','월','화','수','목','금','토'].forEach(d => {
      mini.appendChild(h('div', { style: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textAlign: 'center' } }, d));
    });
    const eventDays = new Set(DATA.events
      .filter(e => e.start_date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))
      .map(e => parseInt(e.start_date.split('-')[2], 10)));
    for (let i = 0; i < first.getDay(); i++) mini.appendChild(h('div'));
    for (let d = 1; d <= last.getDate(); d++) {
      const isToday = d === now.getDate();
      const has = eventDays.has(d);
      const cell = h('div', {
        style: {
          textAlign: 'center', padding: '4px 0', fontSize: '12px', borderRadius: '4px',
          background: isToday ? 'var(--accent)' : has ? 'var(--surface-2)' : 'transparent',
          color: isToday ? '#fff' : 'var(--text)',
          fontWeight: isToday ? '700' : has ? '600' : '400',
          position: 'relative',
        },
      }, String(d));
      if (has && !isToday) cell.innerHTML += `<span style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent);"></span>`;
      mini.appendChild(cell);
    }
    card.appendChild(mini);
    card.appendChild(h('button', {
      type: 'button', className: 'dp-btn small', onclick: () => navigate('calendar'),
      style: { marginTop: '12px', width: '100%', justifyContent: 'center' },
    }, [document.createTextNode('Open calendar')]));
    return card;
  }

  function _renderTeamOnline() {
    const card = h('section', { className: 'dp-card', 'aria-label': 'Team online' });
    const names = ['정현', '조은', '민수', '수진', '지우', '혜린', '재현'];
    card.innerHTML = `<h3>Team online <span class="count">4 of 7</span></h3>`;
    const wrap = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' } });
    names.forEach((n, i) => {
      const online = i < 4;
      const item = h('div', { style: { position: 'relative' } });
      item.innerHTML = `
        <div class="dp-avatar" style="background:${i%2 ? 'var(--accent)' : 'var(--sidebar-bg)'};" title="${esc(n)}">${esc(n.slice(0,1))}</div>
        ${online ? '<span style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--ok);border:2px solid #fff;"></span>' : ''}
      `;
      wrap.appendChild(item);
    });
    card.appendChild(wrap);
    return card;
  }

  function _renderSprintProgress() {
    const card = h('section', { className: 'dp-card', 'aria-label': '스프린트 진행' });
    card.innerHTML = `
      <h3>Sprint 14 · 62%</h3>
      <div style="height:8px; background:var(--line); border-radius:4px; overflow:hidden; margin:12px 0;">
        <div style="width:62%; height:100%; background:var(--accent);"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px; color: var(--text-3);">
        <span><strong style="color: var(--text); font-size: 14px;">24</strong> done</span>
        <span><strong style="color: var(--text); font-size: 14px;">9</strong> in progress</span>
        <span><strong style="color: var(--text); font-size: 14px;">6</strong> todo</span>
      </div>
    `;
    return card;
  }

  // -------------------------- Search (B3 — grouped) --------------------------
  function onSearchInput(ev) {
    const q = ev.target.value.trim();
    state.search = q;
    if (!q) { if (state.page === 'home') _reloadHome(); return; }
    _renderSearchResults(q);
  }
  function _renderSearchResults(q) {
    const needle = q.toLowerCase();
    const groups = {
      post:    { label: '게시글',    items: [] },
      minutes: { label: '회의록',    items: [] },
      task:    { label: '할 일',     items: [] },
      note:    { label: '메모/이슈', items: [] },
      event:   { label: '일정',      items: [] },
    };
    ['notice', 'documents'].forEach(b => DATA.posts[b].forEach(p => {
      if (p.title.toLowerCase().includes(needle) || (p.content && p.content.toLowerCase().includes(needle))) groups.post.items.push({ ...p, board: b });
    }));
    DATA.posts.minutes.forEach(p => {
      if (p.title.toLowerCase().includes(needle)) groups.minutes.items.push({ ...p, board: 'minutes' });
    });
    DATA.tasks.forEach(t => {
      if (t.title.toLowerCase().includes(needle)) groups.task.items.push(t);
    });
    DATA.notes.forEach(n => {
      if (n.title.toLowerCase().includes(needle) || (n.body || '').toLowerCase().includes(needle)) groups.note.items.push(n);
    });
    DATA.events.forEach(e => {
      if (e.title.toLowerCase().includes(needle)) groups.event.items.push(e);
    });

    const wrap = h('div');
    wrap.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, `Search: “${q}”`),
      h('p', { className: 'sub' }, `${Object.values(groups).reduce((n, g) => n + g.items.length, 0)} results across ${Object.values(groups).filter(g => g.items.length).length} groups`),
    ]));
    Object.entries(groups).forEach(([key, g]) => {
      if (!g.items.length) return;
      const panel = h('section', { className: 'dp-search-panel', 'aria-label': `${g.label} 검색 결과` });
      panel.innerHTML = `<div class="dp-search-group"><h4>${esc(g.label)} · ${g.items.length}</h4></div>`;
      const group = panel.querySelector('.dp-search-group');
      g.items.slice(0, 6).forEach(it => {
        const hit = h('button', { type: 'button', className: 'dp-search-hit' });
        hit.innerHTML = `
          <div style="flex:1;">
            <div class="title">${esc(it.title)}</div>
            <div class="meta">${esc(key === 'task' ? `Assignee: ${it.assignee} · Due: ${it.due_date}` : key === 'event' ? `${it.start_date} · ${it.type}` : key === 'note' ? `${it.type} · ${it.status}` : `${it.board} · ${it.author_name}`)}</div>
          </div>
          ${icon('chevron-right')}
        `;
        hit.onclick = () => {
          if (key === 'post' || key === 'minutes') _viewPost(it.board, it.id);
          else if (key === 'task') navigate('tasks');
          else if (key === 'note') navigate('notes');
          else if (key === 'event') navigate('calendar');
        };
        group.appendChild(hit);
      });
      if (g.items.length > 6) group.appendChild(h('div', { className: 'more' }, `+ ${g.items.length - 6} more`));
      wrap.appendChild(panel);
    });
    if (!Object.values(groups).some(g => g.items.length)) {
      wrap.appendChild(h('div', { className: 'dp-card' }, [
        h('p', { style: { color: 'var(--text-3)', fontSize: '14px' } }, '일치하는 결과가 없습니다.'),
      ]));
    }
    _setPage(wrap, `Search: ${q}`);
  }

  // -------------------------- Board views (posts/minutes/documents) --------------------------
  function _renderBoard(root, boardKey) {
    state.currentBoard = boardKey;
    const labels = { notice: 'Announcements', minutes: 'Minutes', documents: 'Documents' };
    const head = h('div', { className: 'dp-board-head' }, [
      h('div', {}, [
        h('h2', {}, labels[boardKey] || boardKey),
        h('p', { className: 'sub', style: { margin: 0, color: 'var(--text-3)', fontSize: '13px' } }, `${DATA.posts[boardKey].length}개의 글`),
      ]),
      h('button', { type: 'button', className: 'dp-btn primary', onclick: () => _openPostEditor(boardKey) }, [
        h('span', { html: icon('plus') }), document.createTextNode('New post'),
      ]),
    ]);
    root.appendChild(head);

    const table = h('div', { className: 'dp-post-table' });
    const posts = [...DATA.posts[boardKey]].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (new Date(b.created_at) - new Date(a.created_at)));
    posts.forEach((p, i) => {
      const row = h('button', {
        type: 'button', className: `dp-post-row${p.pinned ? ' pinned' : ''}`,
        onclick: () => _viewPost(boardKey, p.id),
      });
      const status = p.approval_status
        ? `<span class="dp-pill status-${p.approval_status}">${p.approval_status}</span>`
        : p.pinned ? `<span class="dp-pill status-pending" style="background:#FFF8EB;color:#8D5B16;">📌 Pinned</span>` : '';
      row.innerHTML = `
        <span class="no">${i + 1}</span>
        <span class="t">${esc(p.title)}</span>
        <span class="a">${esc(p.author_name)}</span>
        <span class="d">${fmtTime(p.created_at)}</span>
        <span class="s">${status}</span>
      `;
      table.appendChild(row);
    });
    root.appendChild(table);
  }

  function _viewPost(boardKey, id) {
    state.currentBoard = boardKey;
    state.currentPostId = id;
    const post = DATA.posts[boardKey]?.find(p => p.id === id);
    if (!post) { navigate('home'); return; }

    const root = h('div');
    root.appendChild(h('button', {
      type: 'button', className: 'dp-btn ghost', onclick: () => navigate(boardKey === 'notice' ? 'announcements' : boardKey),
      style: { marginBottom: '12px' },
    }, ['← Back']));

    if (post.approval_status === 'approved') {
      root.appendChild(h('div', { className: 'dp-locked-banner', html: `${icon('scroll')}<span><strong>잠금:</strong> 승인 완료된 회의록은 내용 수정이 불가합니다. (HTTP 423)</span>` }));
    }

    const view = h('article', { className: 'dp-post-view' });
    const actions = [];
    if (post.approval_status !== 'approved') actions.push(`<button type="button" class="dp-btn" onclick="DP._openPostEditor('${boardKey}', ${id})">Edit</button>`);
    const actionsHtml = actions.join('');
    view.innerHTML = `
      <h1>${esc(post.title)}</h1>
      <div class="post-meta">
        <span>${esc(post.author_name)}</span>
        <span>·</span>
        <span>${fmtTime(post.created_at)}</span>
        ${post.approval_status ? `<span class="dp-pill status-${post.approval_status}">${post.approval_status}</span>` : ''}
        <span style="margin-left:auto; display:flex; gap:8px;">${actionsHtml}</span>
      </div>
    `;
    if (post.approval_status && post.approvers) {
      const approvals = h('div', { className: 'dp-approval-block' });
      const approvedCount = post.approvers.filter(a => a.status === 'approved').length;
      const pct = Math.round(approvedCount / post.approvers.length * 100);
      approvals.innerHTML = `
        <h4>승인 진행 · ${approvedCount}/${post.approvers.length}</h4>
        <div class="dp-approval-progress"><span style="width:${pct}%;"></span></div>
        <div class="dp-approver-list">
          ${post.approvers.map(a => `
            <div class="dp-approver-row ${a.status}">
              <span class="status-dot"></span>
              <div style="flex:1;"><strong>${esc(a.name)}</strong><div style="font-size:11px;color:var(--text-3);">${esc(a.status === 'approved' ? (a.voted_at ? fmtTime(a.voted_at) : '승인') : a.status === 'pending' ? '대기' : '반려')}</div></div>
              ${a.status === 'pending' && a.name === (state.user?.name || '정현') ? `<button type="button" class="dp-btn small primary" onclick="DP._approvePost(${id})">승인</button>` : ''}
            </div>
          `).join('')}
        </div>
      `;
      view.appendChild(approvals);
    }
    const body = h('div', { className: 'dp-post-content' });
    body.innerHTML = _sanitize(post.content || '<p><em>(내용 없음)</em></p>');
    view.appendChild(body);
    root.appendChild(view);
    _setPage(root, post.title);
  }

  function _approvePost(postId) {
    for (const key of Object.keys(DATA.posts)) {
      const post = DATA.posts[key].find(p => p.id === postId);
      if (!post || !post.approvers) continue;
      const me = post.approvers.find(a => a.name === (state.user?.name || '정현'));
      if (me && me.status === 'pending') {
        me.status = 'approved';
        me.voted_at = new Date().toISOString();
      }
      const approvedCount = post.approvers.filter(a => a.status === 'approved').length;
      if (approvedCount * 2 > post.approvers.length) post.approval_status = 'approved';
      _viewPost(key, postId);
      return;
    }
  }

  // -------------------------- Post editor (Tiptap modal) --------------------------
  // Section 4.3 — 4 spots: createPost, editPost, createNote, editNote
  function _openPostEditor(boardKey, postId) {
    const isEdit = postId != null;
    const existing = isEdit ? DATA.posts[boardKey].find(p => p.id === postId) : null;
    const title = isEdit ? '게시글 수정' : '새 게시글';
    const body = h('div');
    body.innerHTML = `
      <div class="dp-field">
        <label for="dp-post-title">제목</label>
        <input type="text" id="dp-post-title" class="dp-input" value="${esc(existing?.title || '')}" placeholder="제목을 입력하세요">
      </div>
      <div class="dp-field-row">
        <div class="dp-field">
          <label for="dp-post-board">게시판</label>
          <select id="dp-post-board" class="dp-select">
            <option value="notice" ${boardKey==='notice'?'selected':''}>Announcements</option>
            <option value="documents" ${boardKey==='documents'?'selected':''}>Documents</option>
            <option value="minutes" ${boardKey==='minutes'?'selected':''}>Minutes</option>
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-post-pinned">핀 고정</label>
          <select id="dp-post-pinned" class="dp-select"><option value="0">아니요</option><option value="1" ${existing?.pinned?'selected':''}>예</option></select>
        </div>
      </div>
      <div class="dp-field">
        <label>본문</label>
        <div class="dp-tiptap-toolbar">
          <button type="button" onmousedown="DP._execTiptapCmd(event,'bold')" title="굵게"   aria-label="굵게">${icon('bold')}</button>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'italic')" title="기울임" aria-label="기울임">${icon('italic')}</button>
          <span class="sep"></span>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'h2')" title="H2">H2</button>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'h3')" title="H3">H3</button>
          <span class="sep"></span>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'ul')"  title="목록"     aria-label="목록">${icon('list-ul')}</button>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'quote')" title="인용">❝</button>
        </div>
        <div id="dp-editor-post" class="dp-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="본문 편집">${_sanitize(existing?.content || '')}</div>
      </div>
    `;
    _openModal(title, body, [
      { label: 'Cancel', cls: '', onclick: _closeModal },
      { label: isEdit ? 'Save' : 'Publish', cls: 'primary', onclick: () => {
        const t = $('#dp-post-title').value.trim();
        const b = $('#dp-post-board').value;
        const pinned = $('#dp-post-pinned').value === '1';
        const html = _sanitize($('#dp-editor-post').innerHTML);
        if (!t) { alert('제목을 입력하세요.'); return; }
        if (isEdit) {
          existing.title = t; existing.content = html; existing.pinned = pinned; existing.board = b;
        } else {
          const newId = Math.max(0, ...Object.values(DATA.posts).flat().map(p => p.id)) + 1;
          DATA.posts[b].unshift({ id: newId, board: b, title: t, content: html, author_name: state.user?.name || 'me', created_at: new Date().toISOString(), comments: 0, pinned });
        }
        _closeModal();
        navigate(b === 'notice' ? 'announcements' : b);
      }},
    ]);
  }

  function _execTiptapCmd(ev, cmd) {
    ev.preventDefault();
    const editor = $('#dp-editor-post') || $('#dp-editor-note');
    if (!editor) return;
    editor.focus();
    try {
      if (cmd === 'bold') document.execCommand('bold');
      else if (cmd === 'italic') document.execCommand('italic');
      else if (cmd === 'h2') document.execCommand('formatBlock', false, 'H2');
      else if (cmd === 'h3') document.execCommand('formatBlock', false, 'H3');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'quote') document.execCommand('formatBlock', false, 'BLOCKQUOTE');
    } catch {}
  }

  // -------------------------- Tasks (Kanban) --------------------------
  function _renderTasks(root) {
    root.appendChild(h('div', { className: 'dp-board-head' }, [
      h('div', {}, [
        h('h2', {}, 'Tasks'),
        h('p', { className: 'sub', style: { margin: 0, color: 'var(--text-3)', fontSize: '13px' } }, `${DATA.tasks.length} total · ${DATA.tasks.filter(t => t.overdue).length} overdue`),
      ]),
      h('button', { type: 'button', className: 'dp-btn primary', html: `${icon('plus')}<span>New task</span>` }),
    ]));

    const board = h('div', { className: 'dp-kanban' });
    const cols = [
      { key: 'todo',        label: 'To do',       items: DATA.tasks.filter(t => t.status === 'todo') },
      { key: 'in_progress', label: 'In progress', items: DATA.tasks.filter(t => t.status === 'in_progress') },
      { key: 'done',        label: 'Done',        items: DATA.tasks.filter(t => t.status === 'done') },
    ];
    cols.forEach(col => {
      const c = h('div', { className: 'dp-kanban-col' });
      c.innerHTML = `<h3>${esc(col.label)} <span class="count">${col.items.length}</span></h3>`;
      col.items.forEach(t => {
        const card = h('div', { className: 'dp-task-card' });
        card.innerHTML = `
          <div class="t">TASK-${t.id} · ${esc(t.title)}</div>
          <div class="meta">
            <span class="dp-pill priority-${t.priority}">${t.priority}</span>
            <span>${esc(t.assignee)}</span>
            <span style="margin-left:auto;">${esc(t.overdue ? '⚠ overdue' : fmt(t.due_date))}</span>
          </div>
        `;
        c.appendChild(card);
      });
      board.appendChild(c);
    });
    root.appendChild(board);
  }

  // -------------------------- Notes & Issues --------------------------
  function _renderNotes(root) {
    root.appendChild(h('div', { className: 'dp-board-head' }, [
      h('div', {}, [
        h('h2', {}, 'Notes & Issues'),
        h('p', { className: 'sub', style: { margin: 0, color: 'var(--text-3)', fontSize: '13px' } }, `${DATA.notes.length} items · ${DATA.notes.filter(n => n.status === 'open').length} open`),
      ]),
      h('button', { type: 'button', className: 'dp-btn primary', onclick: () => _openNoteEditor(), html: `${icon('plus')}<span>New note</span>` }),
    ]));
    const list = h('div', { className: 'dp-note-list' });
    DATA.notes.forEach(n => {
      const card = h('button', { type: 'button', className: 'dp-note-card' });
      card.innerHTML = `
        <div class="t">${esc(n.title)}</div>
        <div class="d">${esc(n.body)}</div>
        <div class="f">
          <span class="dp-pill priority-${n.priority}">${n.type} · ${n.priority}</span>
          <span>${fmtTime(n.updated_at)}</span>
        </div>
      `;
      card.onclick = () => _openNoteEditor(n.id);
      list.appendChild(card);
    });
    root.appendChild(list);
  }

  function _openNoteEditor(id) {
    const isEdit = id != null;
    const n = isEdit ? DATA.notes.find(x => x.id === id) : null;
    const body = h('div');
    body.innerHTML = `
      <div class="dp-field">
        <label for="dp-note-title">제목</label>
        <input type="text" id="dp-note-title" class="dp-input" value="${esc(n?.title || '')}">
      </div>
      <div class="dp-field-row">
        <div class="dp-field">
          <label for="dp-note-type">타입</label>
          <select id="dp-note-type" class="dp-select">
            <option value="note" ${n?.type==='note'?'selected':''}>Note</option>
            <option value="issue" ${n?.type==='issue'?'selected':''}>Issue</option>
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-note-priority">우선순위</label>
          <select id="dp-note-priority" class="dp-select">
            <option value="low" ${n?.priority==='low'?'selected':''}>Low</option>
            <option value="mid" ${n?.priority==='mid'?'selected':''}>Mid</option>
            <option value="high" ${n?.priority==='high'?'selected':''}>High</option>
          </select>
        </div>
      </div>
      <div class="dp-field">
        <label>본문</label>
        <div class="dp-tiptap-toolbar">
          <button type="button" onmousedown="DP._execTiptapCmd(event,'bold')" aria-label="굵게">${icon('bold')}</button>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'italic')" aria-label="기울임">${icon('italic')}</button>
          <span class="sep"></span>
          <button type="button" onmousedown="DP._execTiptapCmd(event,'ul')" aria-label="목록">${icon('list-ul')}</button>
        </div>
        <div id="dp-editor-note" class="dp-editor" contenteditable="true" role="textbox" aria-multiline="true">${_sanitize(n?.body || '')}</div>
      </div>
    `;
    _openModal(isEdit ? '메모 수정' : '새 메모', body, [
      { label: 'Cancel', cls: '', onclick: _closeModal },
      { label: isEdit ? 'Save' : 'Create', cls: 'primary', onclick: () => {
        const t = $('#dp-note-title').value.trim();
        if (!t) { alert('제목을 입력하세요.'); return; }
        const type = $('#dp-note-type').value;
        const priority = $('#dp-note-priority').value;
        const body2 = _sanitize($('#dp-editor-note').innerHTML);
        if (isEdit) Object.assign(n, { title: t, type, priority, body: body2, updated_at: new Date().toISOString() });
        else DATA.notes.unshift({ id: Math.max(0, ...DATA.notes.map(x => x.id)) + 1, title: t, type, priority, status: 'open', body: body2, updated_at: new Date().toISOString() });
        _closeModal(); navigate('notes');
      }},
    ]);
  }

  // -------------------------- Teams --------------------------
  function _renderTeams(root) {
    root.appendChild(h('div', { className: 'dp-board-head' }, [h('div', {}, [h('h2', {}, 'Team Boards')])]));
    const list = h('div', { className: 'dp-team-list' });
    DATA.teams.forEach(t => {
      const card = h('div', { className: 'dp-team-card' });
      card.innerHTML = `
        <div class="name">${esc(t.name)}</div>
        <div class="role">Lead · ${esc(t.lead)}</div>
        <div style="margin-top: 10px; display: flex; gap: 6px; align-items: center;">
          <span class="dp-pill priority-low">${t.members} members</span>
        </div>
      `;
      list.appendChild(card);
    });
    root.appendChild(list);
  }

  // -------------------------- Calendar --------------------------
  function _renderCalendar(root) {
    const cursor = state.calMonth;
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const monthName = cursor.toLocaleString('ko-KR', { year: 'numeric', month: 'long' });

    root.appendChild(h('div', { className: 'dp-cal-head' }, [
      h('h2', {}, monthName),
      h('div', { className: 'dp-cal-nav' }, [
        h('button', { type: 'button', className: 'dp-btn small', onclick: () => { state.calMonth = new Date(year, month - 1, 1); navigate('calendar'); } }, '←'),
        h('button', { type: 'button', className: 'dp-btn small', onclick: () => { state.calMonth = new Date(); navigate('calendar'); } }, 'Today'),
        h('button', { type: 'button', className: 'dp-btn small', onclick: () => { state.calMonth = new Date(year, month + 1, 1); navigate('calendar'); } }, '→'),
        h('button', { type: 'button', className: 'dp-btn primary', html: `${icon('plus')}<span>Event</span>` }),
      ]),
    ]));

    const cal = h('div', { className: 'dp-cal' });
    cal.innerHTML = `
      <div class="dp-cal-weekdays">
        <div class="sun">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="sat">토</div>
      </div>
      <div class="dp-cal-grid" id="dp-cal-grid"></div>
    `;
    const grid = cal.querySelector('#dp-cal-grid');
    const today = fmt(new Date());
    for (let i = 0; i < first.getDay(); i++) {
      const prevDay = new Date(year, month, 0).getDate() - first.getDay() + 1 + i;
      grid.appendChild(_renderCalDay(new Date(year, month - 1, prevDay), 'other'));
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month, d);
      const classes = [];
      if (fmt(date) === today) classes.push('today');
      if (date.getDay() === 0) classes.push('sun');
      if (date.getDay() === 6) classes.push('sat');
      grid.appendChild(_renderCalDay(date, classes.join(' ')));
    }
    const tailNeeded = (7 - (first.getDay() + last.getDate()) % 7) % 7;
    for (let i = 1; i <= tailNeeded; i++) {
      grid.appendChild(_renderCalDay(new Date(year, month + 1, i), 'other'));
    }
    root.appendChild(cal);
  }

  function _renderCalDay(date, extra) {
    const dayIso = fmt(date);
    const dayEvents = DATA.events.filter(e => dayIso >= e.start_date && dayIso <= e.end_date);
    const cell = h('button', { type: 'button', className: `dp-cal-day ${extra}`, 'aria-label': `${dayIso} · ${dayEvents.length}개 일정` });
    cell.innerHTML = `<span class="num">${date.getDate()}</span>`;
    dayEvents.slice(0, 3).forEach(e => {
      const strip = h('span', { className: `dp-cal-event-strip ${e.type}` }, `${e.start_time ? e.start_time + ' ' : ''}${e.title}`);
      cell.appendChild(strip);
    });
    if (dayEvents.length > 3) cell.appendChild(h('span', { className: 'dp-cal-more' }, `+${dayEvents.length - 3} more`));
    return cell;
  }

  // -------------------------- Contacts --------------------------
  function _renderContacts(root) {
    root.appendChild(h('div', { className: 'dp-board-head' }, [h('div', {}, [h('h2', {}, 'Contacts')])]));
    const list = h('div', { className: 'dp-contact-list' });
    DATA.contacts.forEach(c => {
      const card = h('div', { className: 'dp-contact-card' });
      card.innerHTML = `
        <div class="name">${esc(c.name)}</div>
        <div class="role">${esc(c.role)}</div>
        <div class="ln">${icon('phone')}<span>${esc(c.phone)}</span></div>
        <div class="ln">${icon('send')}<span>${esc(c.email)}</span></div>
      `;
      list.appendChild(card);
    });
    root.appendChild(list);
  }

  // -------------------------- Rules --------------------------
  function _renderRules(root) {
    const content = `
      <h2>Dev Rules</h2>
      <p>DreamPath PMO 개발 규칙 원본. 운영자/사용자용. 상세는 <code>DREAMPATH.md</code> 참조.</p>

      <h2>1. IIFE 단일 모듈</h2>
      <p>모든 프론트 로직은 <code>const DP = (() =&gt; {...})()</code> 한 파일. 분리/모듈화 금지.</p>
      <pre>const DP = (() =&gt; {
  return { init, login, navigate, ... };
})();</pre>

      <h2>2. CSS — inline single-source</h2>
      <p>모든 CSS는 <code>dreampath.html</code> <code>&lt;style&gt;</code> 안. 외부 .css 없음. 토큰은 <code>:root</code>에 통일.</p>

      <h2>3. Tiptap — 4곳 동시 갱신</h2>
      <p>새 extension 추가 시 네 위치 모두 갱신 필수:</p>
      <table>
        <thead><tr><th>위치</th><th>함수</th></tr></thead>
        <tbody>
          <tr><td>새 게시글</td><td>createPost</td></tr>
          <tr><td>게시글 수정</td><td>editPost</td></tr>
          <tr><td>새 메모</td><td>createNote</td></tr>
          <tr><td>메모 수정</td><td>editNote</td></tr>
        </tbody>
      </table>

      <h2>4. 접근성 (WCAG 3.0 APCA)</h2>
      <ul>
        <li>본문 텍스트 |Lc| 75+, 메타 60+, 대형 45+, UI 30+</li>
        <li>파스텔/Fire Red/Ocean Blue 는 본문 텍스트 금지</li>
        <li>터치 타겟 최소 44×44px</li>
        <li>포커스 링: <code>outline: 2px solid var(--accent-mid)</code></li>
      </ul>

      <h2>5. 승인 워크플로우</h2>
      <p><code>dp_post_approvals</code> 테이블. <code>approver_id NOT NULL</code>.
         과반수 승인 시 post <code>approval_status='approved'</code> 자동 전환.
         approved 상태의 content 수정 시 <code>HTTP 423</code>.</p>

      <h2>6. CSP 레거시 경로</h2>
      <p><code>functions/_middleware.js</code>의 <code>isLegacyInlinePath()</code> 에 <code>/dreampath</code>, <code>/dreampath.html</code> 등록.
         strict-dynamic CSP 가 인라인 onclick 을 차단하지만, 이 경로에서만 예외.</p>

      <h2>7. Upload 제한</h2>
      <ul>
        <li>최대 100MB / 파일, 5개 / 게시글</li>
        <li>차단 확장자: exe, sh, bat, cmd, ps1, vbs, jar, app, dmg, pkg, msi, dll …</li>
        <li>R2 <code>POST_IMAGES</code> 경로: <code>dreampath/{timestamp}_{name}</code></li>
      </ul>

      <h2>8. 배포</h2>
      <p><code>./deploy.sh feature "설명"</code> / <code>./deploy.sh fix "설명"</code>.
         HTML 변경은 deploy 전 커밋 필수.</p>
    `;
    const page = h('article', { className: 'dp-rules-page' });
    page.innerHTML = _sanitize(content);
    root.appendChild(page);
  }

  // -------------------------- Versions --------------------------
  function _renderVersions(root) {
    root.appendChild(h('div', { className: 'dp-board-head' }, [h('div', {}, [h('h2', {}, 'Versions')])]));
    const card = h('div', { className: 'dp-card dp-version-list' });
    DATA.versions.forEach(v => {
      const row = h('div', { className: 'dp-version-row' });
      row.innerHTML = `
        <span class="v">${esc(v.v)}</span>
        <span><span class="dp-pill ${v.type === 'feature' ? 'priority-low' : 'priority-mid'}">${esc(v.type)}</span></span>
        <span>${esc(v.note)}</span>
        <span style="color: var(--text-3); font-size: 12px; font-family: var(--font-mono);">${esc(v.released)}</span>
      `;
      card.appendChild(row);
    });
    root.appendChild(card);
  }

  // -------------------------- Modal --------------------------
  function _openModal(title, body, buttons) {
    _closeModal();
    const backdrop = h('div', { className: 'dp-modal-backdrop', id: 'dp-modal-backdrop' });
    backdrop.addEventListener('click', e => { if (e.target === backdrop) _closeModal(); });
    const modal = h('div', { className: 'dp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const head = h('div', { className: 'dp-modal-head' }, [
      h('h2', {}, title),
      h('button', { type: 'button', className: 'dp-iconbtn', 'aria-label': '닫기', onclick: _closeModal, html: icon('x') }),
    ]);
    const bodyWrap = h('div', { className: 'dp-modal-body' }, [body]);
    const foot = h('div', { className: 'dp-modal-foot' }, [
      h('span', { style: { color: 'var(--text-3)', fontSize: '12px' } }, '변경사항은 자동 살균(DOMPurify) 후 저장됩니다.'),
      h('div', { style: { display: 'flex', gap: '8px' } }, (buttons || []).map(b => h('button', { type: 'button', className: `dp-btn ${b.cls || ''}`, onclick: b.onclick }, b.label))),
    ]);
    modal.append(head, bodyWrap, foot);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }
  function _closeModal() {
    const b = $('#dp-modal-backdrop');
    if (b) b.remove();
  }

  function openCreate() {
    if (state.page === 'notes') _openNoteEditor();
    else if (state.page === 'minutes')     _openPostEditor('minutes');
    else if (state.page === 'documents')   _openPostEditor('documents');
    else                                   _openPostEditor('notice');
  }

  // -------------------------- Public API --------------------------
  return {
    init, login, logout, navigate, openCreate,
    onSearchInput,
    _homeTaskQuick, _execTiptapCmd, _openPostEditor, _openNoteEditor,
    _approvePost,
  };
})();

// [DIAG 2026-04-24] bootstrap with visible error surfacing so users can
// report blank-page failures. If init throws, the error is painted into
// dp-root directly instead of silently leaving the page empty.
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
      root.innerHTML = '<pre style="padding:24px;font:13px monospace;color:#B3261E;white-space:pre-wrap;max-width:900px;margin:40px auto;background:#FFF;border:1px solid #E4E6E8;border-radius:10px;">v2 boot error — ' +
        String(err && err.message || err) + '\n\n' +
        String(err && err.stack || '').split('\n').slice(0, 12).join('\n') +
        '</pre>';
    }
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _dpBoot);
} else {
  _dpBoot();
}

// Expose for inline onclick
window.DP = DP;
