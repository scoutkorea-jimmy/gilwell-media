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
    boards: [],          // Loaded from /api/dreampath/boards on init
  };

  // Nav groups are derived at render time from state.user + state.boards
  // so admin sees every team and members see only their assigned team.
  // [CASE STUDY — dept string lives only in DB, not in JWT]
  //   state.user.department comes from /me, so this function must be called
  //   AFTER _acceptUser() has hydrated the user from /me.
  function _buildNavGroups() {
    const isAdmin = state.user && state.user.role === 'admin';
    const userDept = String((state.user && state.user.department) || '').toLowerCase();
    const teamBoards = (state.boards || [])
      .filter(b => b.board_type === 'team')
      .filter(b => {
        if (isAdmin) return true;
        const country = b.slug.slice(5).toLowerCase();  // team_xxx → xxx
        return country && userDept.includes(country);
      })
      .map(b => ({ id: b.slug, label: b.title || b.slug, icon: 'users-admin' }));

    return [
      { title: 'Workspace', items: [
        { id: 'home',          label: 'Home',            icon: 'home' },
        { id: 'announcements', label: 'Announcements',   icon: 'megaphone' },
      ]},
      { title: 'Project', items: [
        { id: 'documents',     label: 'Documents',       icon: 'book' },
        { id: 'minutes',       label: 'Meeting Minutes', icon: 'note' },
        { id: 'tasks',         label: 'Tasks',           icon: 'check' },
        { id: 'notes',         label: 'Notes / Issues',  icon: 'clipboard' },
      ]},
      { title: 'Teams', items: teamBoards.length
        ? teamBoards.concat([{ id: 'calendar', label: 'Calendar', icon: 'calendar' },
                             { id: 'contacts', label: 'Contacts', icon: 'phone' }])
        : [{ id: 'calendar', label: 'Calendar', icon: 'calendar' },
           { id: 'contacts', label: 'Contacts', icon: 'phone' }]
      },
      { title: 'Reference', items: (isAdmin
        ? [{ id: 'rules', label: 'Dev Rules', icon: 'layers' },
           { id: 'versions', label: 'Versions', icon: 'file-text' }]
        : []
      )},
    ].filter(g => g.items.length > 0);
  }

  function _boardTitle(slug) {
    const b = (state.boards || []).find(x => x.slug === slug);
    if (b && b.title) return b.title;
    // Humanize fallback: team_korea → Team Korea
    return String(slug || '').split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }

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

  // -------------------------- Tiptap --------------------------
  // Port of production /dreampath editor, retuned to the ERP tokens.
  //
  // [CASE STUDY — Tiptap mounts are load-bearing for create/edit flows]
  // If this section breaks, both New Post and Edit Post editors die
  // silently with a plain div where the editor should be. Mount sites:
  //   1. _openPostEditor (new)  — container 'dp-tt-post'
  //   2. _openPostEditor (edit) — container 'dp-tt-post'
  // Reusing one container ID across modal instances is fine because
  // _closeModal()/_destroyTiptap() tear down the previous instance.
  let _tiptapEditor = null;

  function _waitForTiptap(cb) {
    if (window.__DP_Tiptap) { cb(); return; }
    const handler = () => { window.removeEventListener('tiptap-ready', handler); cb(); };
    window.addEventListener('tiptap-ready', handler);
  }

  function _initTiptap(containerId, initialHtml) {
    _destroyTiptap();
    const el = document.getElementById(containerId);
    if (!el) return;
    const t = window.__DP_Tiptap;
    if (!t) return;
    _tiptapEditor = new t.Editor({
      element: el,
      extensions: [
        t.StarterKit,
        t.Table.configure({ resizable: false }),
        t.TableRow,
        t.TableHeader,
        t.TableCell,
        t.Image.configure({ inline: false, allowBase64: false }),
      ],
      content: initialHtml || '',
      onTransaction: () => _updateTiptapToolbar(),
    });
    setTimeout(() => { if (_tiptapEditor) _tiptapEditor.commands.focus('end'); }, 80);
  }

  function _updateTiptapToolbar() {
    if (!_tiptapEditor) return;
    $$('.dp-te-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      let active = false;
      if      (cmd === 'bold')        active = _tiptapEditor.isActive('bold');
      else if (cmd === 'italic')      active = _tiptapEditor.isActive('italic');
      else if (cmd === 'strike')      active = _tiptapEditor.isActive('strike');
      else if (cmd === 'h2')          active = _tiptapEditor.isActive('heading', { level: 2 });
      else if (cmd === 'h3')          active = _tiptapEditor.isActive('heading', { level: 3 });
      else if (cmd === 'bulletList')  active = _tiptapEditor.isActive('bulletList');
      else if (cmd === 'orderedList') active = _tiptapEditor.isActive('orderedList');
      else if (cmd === 'blockquote')  active = _tiptapEditor.isActive('blockquote');
      else if (cmd === 'insertTable') active = _tiptapEditor.isActive('table');
      btn.classList.toggle('is-active', active);
    });
  }

  function _execTiptapCmd(cmd) {
    if (!_tiptapEditor) return;
    const c = _tiptapEditor.chain().focus();
    if      (cmd === 'bold')        c.toggleBold().run();
    else if (cmd === 'italic')      c.toggleItalic().run();
    else if (cmd === 'strike')      c.toggleStrike().run();
    else if (cmd === 'h2')          c.toggleHeading({ level: 2 }).run();
    else if (cmd === 'h3')          c.toggleHeading({ level: 3 }).run();
    else if (cmd === 'bulletList')  c.toggleBulletList().run();
    else if (cmd === 'orderedList') c.toggleOrderedList().run();
    else if (cmd === 'blockquote')  c.toggleBlockquote().run();
    else if (cmd === 'insertTable') c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (cmd === 'insertImage') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        if (f.size > 100 * 1024 * 1024) { toast('Max size 100MB', 'err'); return; }
        const fd = new FormData();
        fd.append('file', f);
        try {
          const r = await fetch('/api/dreampath/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
          const data = await r.json();
          if (!r.ok) { toast(data.error || 'Upload failed', 'err'); return; }
          if (_tiptapEditor) _tiptapEditor.chain().focus().setImage({ src: data.url }).run();
        } catch (_) { toast('Upload failed', 'err'); }
      };
      input.click();
    }
  }

  function _getTiptapHTML() {
    if (!_tiptapEditor) return '';
    const html = _tiptapEditor.getHTML();
    return (html === '<p></p>' || html === '') ? '' : html;
  }

  function _destroyTiptap() {
    if (_tiptapEditor) { try { _tiptapEditor.destroy(); } catch (_) {} _tiptapEditor = null; }
  }

  // -------------------------- Files --------------------------
  //
  // [CASE STUDY — total size cap is enforced client-side]
  // Server caps each file at 100MB (see upload.js MAX_SIZE). Per user's
  // 2026-04-24 requirement, we additionally cap the TOTAL across all files
  // in a post at 100MB and count at 10. If this cap needs to change, update
  // MAX_FILES/MAX_TOTAL_BYTES together, and re-verify the toast message.
  const MAX_FILES = 10;
  const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

  // In-memory working list for the current editor modal.
  let _pickerFiles = [];  // [{id, file, url?, name, type, size, is_image, state}]

  function _fileId() { return 'f' + Math.random().toString(36).slice(2, 9); }

  function _fmtSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function _totalFileBytes() {
    return _pickerFiles.reduce((s, f) => s + (f.size || 0), 0);
  }

  function _renderFileList() {
    const host = $('#dp-file-list');
    const used = $('#dp-file-used');
    if (!host) return;
    host.innerHTML = _pickerFiles.map(f => `
      <div class="dp-file-item" data-id="${esc(f.id)}">
        <span aria-hidden="true">${f.is_image ? '🖼' : '📎'}</span>
        <span class="name" title="${esc(f.name)}">${esc(f.name)}</span>
        <span class="size">${_fmtSize(f.size)}</span>
        <button type="button" class="rm" aria-label="Remove ${esc(f.name)}"
                onclick="DP._removeFile('${esc(f.id)}')">
          <span class="ico"></span>
        </button>
      </div>
    `).join('');
    if (used) used.textContent = _pickerFiles.length + ' / ' + MAX_FILES + ' files · ' + _fmtSize(_totalFileBytes()) + ' / 100 MB';
  }

  function _handlePickerChange(input) {
    const incoming = Array.from(input.files || []);
    for (const f of incoming) {
      if (_pickerFiles.length >= MAX_FILES) {
        toast('Maximum ' + MAX_FILES + ' files per post', 'err');
        break;
      }
      if (_totalFileBytes() + f.size > MAX_TOTAL_BYTES) {
        toast('Total size exceeds 100MB', 'err');
        break;
      }
      _pickerFiles.push({
        id: _fileId(),
        file: f,
        name: f.name,
        type: f.type || 'application/octet-stream',
        size: f.size || 0,
        is_image: (f.type || '').startsWith('image/') ? 1 : 0,
        state: 'pending',
      });
    }
    input.value = '';
    _renderFileList();
  }

  function _removeFile(id) {
    _pickerFiles = _pickerFiles.filter(f => f.id !== id);
    _renderFileList();
  }

  // Upload all pending files in sequence, returning the array ready for
  // posts.js to store. Returns null if any upload fails.
  async function _uploadPending() {
    const uploaded = [];
    for (const f of _pickerFiles) {
      if (f.url) { uploaded.push(_pickApiShape(f)); continue; }
      const fd = new FormData();
      fd.append('file', f.file);
      let res, data;
      try {
        res = await fetch('/api/dreampath/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
        data = await res.json();
      } catch (_) {
        toast('Upload failed', 'err');
        return null;
      }
      if (!res.ok) { toast(data && data.error ? data.error : 'Upload failed', 'err'); return null; }
      f.url = data.url;
      f.name = data.name || f.name;
      f.type = data.type || f.type;
      f.size = data.size || f.size;
      f.is_image = data.is_image ? 1 : 0;
      f.state = 'uploaded';
      uploaded.push(_pickApiShape(f));
    }
    return uploaded;
  }
  function _pickApiShape(f) {
    return { url: f.url, name: f.name, type: f.type, size: f.size, is_image: f.is_image ? 1 : 0 };
  }

  // -------------------------- API client (Phase 3) --------------------------
  //
  // [CASE STUDY 2026-04-24 — central API helper]
  // All calls go through api() so the 401 branch can uniformly kick the user
  // back to the login screen (session expired) without every caller handling
  // it. Returns null on any failure (network / 4xx / 5xx) after surfacing a
  // toast — callers must treat null as "no render, bail quietly".
  async function api(method, path, body) {
    const res = await _rawApi(method, path, body);
    if (!res) return null;
    if (res.status === 401) {
      state.user = null;
      try { localStorage.removeItem('dp_user'); } catch (_) {}
      _renderLogin();
      return null;
    }
    if (!res.ok) {
      toast(res.error || 'HTTP ' + res.status, 'err');
      return null;
    }
    return res.data;
  }

  // Lower-level fetch — returns raw {status, ok, data, error} so callers
  // that need to distinguish 404 from 401 from 500 (e.g. viewPost) can
  // render their own in-place UX instead of taking api()'s auto-toast.
  async function _rawApi(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api/dreampath/' + path, opts);
    } catch (_) {
      toast('Network error', 'err');
      return null;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data, error: data && data.error };
  }

  function _renderPostError(title, detail) {
    const body = $('.dp-modal-body');
    if (body) {
      body.innerHTML = `
        <div class="dp-inline-error">
          <div style="font-weight:600;margin-bottom:6px;color:var(--text)">${esc(title)}</div>
          <div>${esc(detail)}</div>
        </div>
      `;
    }
    const head = $('.dp-modal-head h2');
    if (head) head.textContent = title;
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

    const saved = localStorage.getItem('dp_user');
    if (saved) { try { state.user = JSON.parse(saved); } catch (_) {} }

    if (!_hasSessionCookie() && !state.user) {
      _renderLogin();
      return;
    }

    // If we already have cached user, paint shell immediately so the user
    // sees navigation render while /me + /boards refresh in background.
    if (state.user) {
      await _refreshBoards();
      _mountShell();
      navigate('home');
      _refreshSelf();
    } else {
      // No local user — need /me to succeed before we know what sidebar to render.
      const [, me] = await Promise.all([_refreshBoards(), api('GET', 'me')]);
      if (me && me.user) {
        _acceptUser(me.user);
        _mountShell();
        navigate('home');
      } else {
        _renderLogin();
      }
    }
  }

  async function _refreshBoards() {
    const data = await api('GET', 'boards');
    if (data && Array.isArray(data.boards)) state.boards = data.boards;
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
        h('p', {}, 'Sign in with your admin account.'),
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
      toast('Enter username and password', 'err');
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
      toast('Network error', 'err');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    if (!res.ok) {
      toast((data && data.error) || 'Sign-in failed', 'err');
      if (pInput) pInput.value = '';
      return;
    }
    _acceptUser(data.user);
    await _refreshBoards();
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
    const groups = _buildNavGroups();
    const nav = groups.map(group => `
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
      <nav class="dp-side-nav" aria-label="Main navigation">
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
        <button type="button" class="dp-signout" onclick="DP.logout()">Sign out</button>
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
      <div class="dp-switcher" role="group" aria-label="Row density">
        <button type="button" data-density="compact" onclick="DP.setDensity('compact')" title="Tight — 28px rows">Tight</button>
        <button type="button" data-density="default" onclick="DP.setDensity('default')" title="Normal — 32px rows">Normal</button>
        <button type="button" data-density="comfort" onclick="DP.setDensity('comfort')" title="Spacious — 40px rows">Spacious</button>
      </div>
      <label class="dp-search">
        <span class="dp-sr-only">Search</span>
        <input type="search" id="dp-search-input" placeholder="Search… (⌘K)"
               onfocus="DP.openCmd()" aria-label="Search">
        <kbd>⌘K</kbd>
      </label>
      <button type="button" class="dp-iconbtn" aria-label="Notifications (3)" onclick="DP.openNotifs()">
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
      announcements: () => { _renderBoard(pageEl, 'announcements', 'Announcements'); label = 'Announcements'; },
      documents:     () => { _renderBoard(pageEl, 'documents', 'Documents');  label = 'Documents'; },
      minutes:       () => { _renderBoard(pageEl, 'minutes', 'Meeting Minutes'); label = 'Meeting Minutes'; },
      tasks:         () => { _renderTasks(pageEl);         label = 'Tasks'; },
      notes:         () => { _renderNotes(pageEl);         label = 'Notes / Issues'; },
      calendar:      () => { _renderCalendar(pageEl);      label = 'Calendar'; },
      contacts:      () => { _renderContacts(pageEl);      label = 'Contacts'; },
      rules:         () => { _renderRules(pageEl);         label = 'Dev Rules'; },
      versions:      () => { _renderVersions(pageEl);      label = 'Versions'; },
    };
    // Dynamic dispatch: any known board slug routes to _renderBoard.
    // [CASE STUDY — new board types don't need code changes]
    //   As long as the slug exists in state.boards (populated from
    //   /api/dreampath/boards), clicking the sidebar item just works.
    if (r[page]) {
      r[page]();
    } else {
      const b = (state.boards || []).find(x => x.slug === page);
      if (b) {
        _renderBoard(pageEl, b.slug, b.title || b.slug);
        label = b.title || b.slug;
      } else {
        _renderHome(pageEl);
        label = 'Home';
        state.page = 'home';
      }
    }

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
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    const dateStr = fmtDate(now);
    const meetingsThisWeek = (home && home.today_summary && home.today_summary.meetings_this_week) || 0;

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, `Good morning, ${_displayName()}`),
        h('div', { className: 'meta' }, [
          h('span', {}, `${weekday} · ${dateStr} · `),
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
      : 'No upcoming';

    const chips = [
      { lbl: 'My tasks due',       n: tasksDue,  sub: overdue + ' overdue · act now', target: 'tasks',    tone: overdue > 0 ? 'alert' : 'info' },
      { lbl: 'Overdue',            n: overdue,   sub: overdue > 0 ? 'past due date' : 'all caught up',   target: 'tasks',    tone: overdue > 0 ? 'alert' : 'ok' },
      { lbl: 'Pending approvals',  n: pendingCt, sub: pendingCt > 0 ? 'awaiting your vote' : 'none',     target: 'minutes',  tone: pendingCt > 0 ? 'warn' : 'info' },
      { lbl: "Today's meetings",   n: todayMtgs, sub: nextMeetText,                                      target: 'calendar', tone: 'info' },
      { lbl: 'High-priority notes',n: hiNotes,   sub: hiNotes > 0 ? 'open · needs attention' : 'clean',  target: 'notes',    tone: hiNotes > 0 ? 'warn' : 'info' },
    ];
    const strip = h('section', { id: 'dp-today-strip', className: 'dp-stat-strip', 'aria-label': 'Today summary' });
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
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Announcements' });
    const head = `
      <div class="dp-panel-head">
        <h3>Announcements <span class="count">${posts.length}</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('announcements')">View all →</a>
      </div>
    `;
    if (!posts.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No announcements.</div>';
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
            ${p.comment_count ? `<span>·</span><span>${p.comment_count} comments</span>` : ''}
          </div>
        </button>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${body}</div>`;
    return panel;
  }

  function _renderPendingApprovalsPanel(list) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Pending approvals' });
    const head = `
      <div class="dp-panel-head">
        <h3>Pending your approval <span class="count">${list.length}</span></h3>
        ${list.length ? `<a href="#" onclick="event.preventDefault();DP.navigate('minutes')">See all →</a>` : ''}
      </div>
    `;
    if (!list.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No approvals pending.</div>';
      return panel;
    }
    // pending_approvals items: { post_id, title, board, post_created_at }
    // B5 contract — each row offers TWO actions:
    //   Review   → open full post detail modal (user may also approve there)
    //   Approve  → inline vote via /api/dreampath/approvals without leaving home
    const rows = list.slice(0, 5).map(a => {
      const pid = Number(a.post_id) || 0;
      return `
        <div class="dp-audit-row">
          <div class="main">
            <div class="title"><span>${esc(a.title || '(Untitled)')}</span></div>
            <div class="meta">
              <span class="dp-tag neutral">${esc(a.board || 'minutes')}</span>
              <span>·</span>
              <span class="ts">${esc(fmtTime(a.post_created_at))}</span>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                    onclick="DP.viewPost('${esc(a.board || 'minutes')}', ${pid})">Review</button>
            <button type="button" class="dp-btn dp-btn-primary dp-btn-sm"
                    onclick="DP._inlineApprove(${pid})">Approve</button>
          </div>
        </div>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${rows}</div>`;
    return panel;
  }

  // B5 inline vote from home — no modal, no round-trip through viewPost.
  // Matches the production /dreampath pattern: PUT /approvals w/ display_name
  // as approver, server resolves by display_name OR username (lowercased).
  async function _inlineApprove(postId) {
    if (!postId) return;
    const approver = encodeURIComponent(_displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'approved' });
    if (data) {
      toast('Approved', 'ok');
      if (state.page === 'home') navigate('home');
    }
  }

  function _renderActivityPanel(items) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': 'Activity' });
    const head = `
      <div class="dp-panel-head">
        <h3>Recent activity <span class="count">last 24h</span></h3>
      </div>
    `;
    if (!items.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No recent activity.</div>';
      return panel;
    }
    // recent_changes items: { kind, ref_id, title, meta, note, created_at }
    const kindLabel = { post: 'post', event: 'event', comment: 'comment' };
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
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">Nothing scheduled today.</div>';
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
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No tasks assigned.</div>';
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
        <h3>Team online <span class="count">presence API TBD</span></h3>
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
  // BOARDS — wired to GET /api/dreampath/posts?board=X
  // =========================================================
  async function _renderBoard(root, key, label) {
    // Skeleton header + loading placeholder.
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, label),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openPostEditor(key) }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New post'),
        ]),
      ]),
    ]));
    const loadingPanel = h('div', { className: 'dp-panel' });
    loadingPanel.innerHTML = `<div class="dp-panel-body pad" style="color:var(--text-3)">Loading ${esc(label)}…</div>`;
    root.appendChild(loadingPanel);

    // Fetch real posts. 403/404 → team access denied or board missing.
    const res = await _rawApi('GET', 'posts?board=' + encodeURIComponent(key) + '&limit=100');
    loadingPanel.remove();

    if (res.status === 401) { _renderLogin(); return; }
    if (res.status === 403) {
      const denied = h('div', { className: 'dp-empty' });
      denied.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/x.svg')"></span></div>
        <h4>Access denied</h4>
        <p>You do not have permission to view this board.</p>
      `;
      root.appendChild(denied);
      return;
    }
    if (!res.ok) {
      const err = h('div', { className: 'dp-empty' });
      err.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/x.svg')"></span></div>
        <h4>Could not load board</h4>
        <p>${esc(res.error || 'HTTP ' + res.status)}</p>
      `;
      root.appendChild(err);
      return;
    }

    const posts = (res.data && res.data.posts) || [];
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

    const isMinutes = (key === 'minutes');
    const headers = isMinutes
      ? '<th style="width:110px">ID</th><th>Title</th><th style="width:140px">Author</th><th style="width:140px">Approval</th><th style="width:90px">Comments</th><th style="width:160px">Created</th>'
      : '<th style="width:110px">ID</th><th>Title</th><th style="width:140px">Author</th><th style="width:90px">Comments</th><th style="width:90px">Views</th><th style="width:160px">Updated</th>';

    const rows = posts.map(p => {
      const id = 'POST-' + String(p.id).padStart(4, '0');
      const pin = p.pinned ? '<span class="dp-pin" style="margin-right:6px" aria-label="Pinned"></span>' : '';
      const ts = fmtTime(p.updated_at || p.created_at);
      if (isMinutes) {
        const s = p.approval_status || 'draft';
        const tone = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'neutral';
        return `<tr onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
          <td class="mono">${id}</td>
          <td>${pin}${esc(p.title)}</td>
          <td>${esc(p.author_name || '')}</td>
          <td><span class="dp-tag ${tone}">${esc(s)}</span></td>
          <td class="mono">${p.comment_count || 0}</td>
          <td class="mono">${esc(ts)}</td>
        </tr>`;
      }
      return `<tr onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
        <td class="mono">${id}</td>
        <td>${pin}${esc(p.title)}</td>
        <td>${esc(p.author_name || '')}</td>
        <td class="mono">${p.comment_count || 0}</td>
        <td class="mono">${p.view_count || 0}</td>
        <td class="mono">${esc(ts)}</td>
      </tr>`;
    }).join('');

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>${esc(label)} <span class="count">${posts.length}</span></h3>
      </div>
      <table class="dp-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  // =========================================================
  // TASKS — dense table (not kanban)
  // =========================================================
  function _renderTasks(root) {
    const ts = DATA.tasks;
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Tasks'),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => toast('Tasks API — Phase 3.6 pending') }, [
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
      <h4>${esc(title)} — Phase 3 wiring pending</h4>
      <p>${esc(note)}</p>
    `;
    root.appendChild(e);
  }
  function _renderCalendar(root) { _stubPage(root, 'Calendar', 'Month grid + recurring events + drag-to-move land here in Phase 3.8.'); }
  function _renderContacts(root) { _stubPage(root, 'Contacts', 'Project team directory — wired in Phase 3.9.'); }

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
            <tr><td class="mono">v01.040.00</td><td><span class="dp-tag info">feature</span></td><td>Home redesign (B1~B5)</td><td class="mono">2026-04-24</td></tr>
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
    _destroyTiptap();
    _pickerFiles = [];
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
    const postId = Number(id);
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading post…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);

    // [CASE STUDY 2026-04-24 — friendly 404 in-modal]
    // Previously api() showed a toast and viewPost silently closed the
    // modal, which felt like nothing happened. Now: if the post is
    // missing / inaccessible, we replace the modal body with an inline
    // explanation instead of bailing. Much clearer UX.
    if (!postId) {
      _renderPostError('Invalid post ID', 'The clicked post has no ID — nothing to open.');
      return;
    }
    // Temporarily silence the api() error toast for 404; we render in-modal.
    const res = await _rawApi('GET', 'posts?id=' + postId);
    if (res.status === 401) { _renderLogin(); return; }
    if (res.status === 404) {
      _renderPostError('Post not found', 'This post may have been removed or is outside your access.');
      return;
    }
    if (res.status === 403) {
      _renderPostError('Access denied', 'You do not have permission to view this post.');
      return;
    }
    if (!res.ok || !res.data || !res.data.post) {
      _renderPostError('Could not load post', 'HTTP ' + res.status + (res.error ? ' — ' + res.error : ''));
      return;
    }
    const p = res.data.post;
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
      p.title || '(Untitled)',
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
      toast('Vote recorded', 'ok');
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
  function _openPostEditor(initialBoard) {
    // Reset working file list for this editor session.
    _pickerFiles = [];
    const boardOpts = (state.boards || [])
      .filter(b => b.board_type === 'board' || (b.board_type === 'team' && _canPostToBoard(b.slug)))
      .map(b => `<option value="${esc(b.slug)}"${b.slug === initialBoard ? ' selected' : ''}>${esc(b.title || b.slug)}</option>`)
      .join('');

    const toolbarBtns = [
      { cmd: 'bold',        icon: 'bold',         title: 'Bold' },
      { cmd: 'italic',      icon: 'italic',       title: 'Italic' },
      { cmd: 'strike',      icon: 'x',            title: 'Strikethrough' },
      { sep: true },
      { cmd: 'h2',          label: 'H2',          title: 'Heading 2' },
      { cmd: 'h3',          label: 'H3',          title: 'Heading 3' },
      { sep: true },
      { cmd: 'bulletList',  icon: 'list-ul',      title: 'Bulleted list' },
      { cmd: 'orderedList', label: '1.',          title: 'Numbered list' },
      { cmd: 'blockquote',  label: '❝',           title: 'Quote' },
      { sep: true },
      { cmd: 'insertTable', label: '⊞',           title: 'Table' },
      { cmd: 'insertImage', icon: 'scroll',       title: 'Insert image' },
    ];
    const toolbar = toolbarBtns.map(b => {
      if (b.sep) return '<span class="dp-te-sep" aria-hidden="true"></span>';
      const inner = b.icon
        ? `<span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/${esc(b.icon)}.svg')"></span>`
        : `<span>${esc(b.label)}</span>`;
      return `<button type="button" class="dp-te-btn" data-cmd="${esc(b.cmd)}" title="${esc(b.title)}"
                       onmousedown="event.preventDefault();DP._execTiptapCmd('${esc(b.cmd)}')">${inner}</button>`;
    }).join('');

    _openModal(
      'New post',
      `
      <div class="dp-field">
        <label for="dp-new-board">Board</label>
        <select class="dp-select" id="dp-new-board">${boardOpts}</select>
      </div>
      <div class="dp-field">
        <label for="dp-new-title">Title</label>
        <input class="dp-input" id="dp-new-title" placeholder="Title" autocomplete="off">
      </div>
      <div class="dp-field">
        <label>Content</label>
        <div class="dp-te-wrapper">
          <div class="dp-te-toolbar" role="toolbar" aria-label="Editor">${toolbar}</div>
          <div class="dp-te-editor" id="dp-tt-post"></div>
        </div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Attachments <span style="font-weight:400;color:var(--text-3);margin-left:6px" id="dp-file-used">0 / ${MAX_FILES} files · 0 B / 100 MB</span></label>
        <div class="dp-file-picker">
          <input type="file" id="dp-new-files" multiple style="display:none"
                 onchange="DP._handlePickerChange(this)">
          <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                  onclick="document.getElementById('dp-new-files').click()">
            <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath-v2/icons/plus.svg')"></span>
            <span>Add file</span>
          </button>
          <span class="hint">Up to ${MAX_FILES} files, 100MB total. No .exe/.sh/.bat/.dll.</span>
        </div>
        <div class="dp-file-list" id="dp-file-list"></div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" id="dp-new-save" onclick="DP._saveNewPost()">Publish</button>`
    );

    _waitForTiptap(() => _initTiptap('dp-tt-post', ''));
    _renderFileList();
    setTimeout(() => { const t = $('#dp-new-title'); if (t) t.focus(); }, 60);
  }

  function _canPostToBoard(slug) {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    if (!slug.startsWith('team_')) return true;
    const country = slug.slice(5).toLowerCase();
    return String(state.user.department || '').toLowerCase().includes(country);
  }

  async function _saveNewPost() {
    const btn = $('#dp-new-save');
    const boardSel = $('#dp-new-board');
    const titleEl = $('#dp-new-title');
    const board = boardSel ? boardSel.value : '';
    const title = (titleEl && titleEl.value || '').trim();
    if (!board) { toast('Select a board', 'err'); return; }
    if (!title) { toast('Title is required', 'err'); if (titleEl) titleEl.focus(); return; }
    const content = _getTiptapHTML();

    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }

    const files = await _uploadPending();
    if (files === null) {
      if (btn) { btn.disabled = false; btn.textContent = 'Publish'; }
      return;  // upload error already toasted
    }

    const data = await api('POST', 'posts', { board, title, content, files });
    if (btn) { btn.disabled = false; btn.textContent = 'Publish'; }
    if (!data) return;  // api() already toasted the error

    toast('Posted', 'ok');
    _closeModal();
    // Refresh current page so the new post shows up.
    if (state.page === 'home') navigate('home');
    else navigate(state.page);
  }

  // -------------------------- Public API --------------------------
  return {
    init, login, logout, navigate, toggleSide,
    openCmd, closeCmd, _cmdPick,
    openCreate, openNotifs, setDensity,
    viewPost, viewTask, viewNote,
    _voteApproval, _inlineApprove,
    _execTiptapCmd, _handlePickerChange, _removeFile,
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
