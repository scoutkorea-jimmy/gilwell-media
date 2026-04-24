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
    latestVersion: '',   // Loaded from /api/dreampath/versions (newest row)
    homePayload: null,   // Most recent /home response — used to gate approver buttons
    versionsPage: 0,     // 0-based page index for Versions list
  };

  // Nav groups are derived at render time from state.user + state.boards
  // so admin sees every team and members see only their assigned team.
  // [CASE STUDY — dept string lives only in DB, not in JWT]
  //   state.user.department comes from /me, so this function must be called
  //   AFTER _acceptUser() has hydrated the user from /me.
  function _buildNavGroups() {
    const isAdmin = state.user && state.user.role === 'admin';
    // Reference group is reserved for the primary operator (jimmy) — housekeeping
    // surfaces (Board manager, User manager, version log, Dev Rules). This is
    // intentionally stricter than the `admin` role gate used on the API.
    const isOwner = state.user && state.user.username === 'jimmy';
    const userDept = String((state.user && state.user.department) || '').toLowerCase();
    const teamBoards = (state.boards || [])
      .filter(b => b.board_type === 'team')
      .filter(b => {
        if (isAdmin) return true;
        const country = b.slug.slice(5).toLowerCase();
        return country && userDept.includes(country);
      })
      .map(b => ({ id: b.slug, label: b.title || b.slug, icon: 'users-admin' }));

    // [CASE STUDY 2026-04-24 — PMO nav structure]
    // Aligned to PMO industry conventions: Overview (at-a-glance) → Work
    // (deliverables) → Schedule (time-bound ops) → People → Reference
    // (admin-only ops/documentation). Calendar moved into Overview because
    // a PMO dashboard surfaces today's schedule alongside announcements.
    //
    // Permission preset gate: non-admins with an assigned preset only see
    // items whose `perm` (view:<slug>) is included. Users without a preset
    // still see everything (legacy default).
    const guard = (items) => items.filter(it => !it.perm || _hasPerm(it.perm));
    return [
      { title: 'Overview', items: guard([
        { id: 'home',          label: 'Home',             icon: 'home',      perm: 'view:home' },
        { id: 'announcements', label: 'Announcements',    icon: 'megaphone', perm: 'view:announcements' },
        { id: 'calendar',      label: 'Calendar',         icon: 'calendar',  perm: 'view:calendar' },
      ])},
      { title: 'Work', items: guard([
        { id: 'documents',     label: 'Documents',        icon: 'book',      perm: 'view:documents' },
        { id: 'minutes',       label: 'Meeting Minutes',  icon: 'note',      perm: 'view:minutes' },
        { id: 'tasks',         label: 'Tasks',            icon: 'check',     perm: 'view:tasks' },
        { id: 'notes',         label: 'Notes / Issues',   icon: 'clipboard', perm: 'view:notes' },
      ])},
      { title: 'People', items: guard([
        { id: 'teams',    label: 'Team Boards', icon: 'users-admin', perm: 'view:teams' },
        ...teamBoards.map(b => ({
          id: b.id, label: b.label,
          flag: _countryFlag(b.id.slice(5)),
          perm: 'view:teams',
        })),
        { id: 'contacts', label: 'Contacts',    icon: 'phone', perm: 'view:contacts' },
      ]) },
      { title: 'Reference', items: (isOwner
        ? [{ id: 'reference', label: 'Admin console', icon: 'settings' },
           { id: 'users',     label: 'Users',         icon: 'users-admin' },
           { id: 'presets',   label: 'Permission presets', icon: 'compass' },
           { id: 'rules',     label: 'Dev Rules',     icon: 'layers' },
           { id: 'versions',  label: 'Versions',      icon: 'file-text' }]
        : guard([
            { id: 'rules',    label: 'Dev Rules',     icon: 'layers',    perm: 'view:rules' },
            { id: 'versions', label: 'Versions',      icon: 'file-text', perm: 'view:versions' },
          ])
      )},
    ].filter(g => g.items.length > 0);
  }

  // Returns Set of post_ids where current user is still listed as a pending
  // approver. Null = home payload not loaded yet (caller should fetch first).
  function _myPendingApprovalSet() {
    if (!state.homePayload) return null;
    const arr = state.homePayload.pending_approvals || [];
    return new Set(arr.map(a => Number(a.post_id)));
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
  const _MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDateShort = (d) => {
    if (!d) return '';
    const dt = typeof d === 'string' ? new Date(d) : d;
    return _MONTH_SHORT[dt.getMonth()] + ' ' + dt.getDate();
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
      _refreshLatestVersion();
    } else {
      // No local user — need /me to succeed before we know what sidebar to render.
      const [, me] = await Promise.all([_refreshBoards(), api('GET', 'me')]);
      if (me && me.user) {
        _acceptUser(me.user);
        _mountShell();
        navigate('home');
        _refreshLatestVersion();
      } else {
        _renderLogin();
      }
    }
  }

  async function _refreshBoards() {
    const data = await api('GET', 'boards');
    if (data && Array.isArray(data.boards)) state.boards = data.boards;
  }

  async function _refreshLatestVersion() {
    const data = await api('GET', 'versions');
    if (data && Array.isArray(data.versions) && data.versions.length) {
      state.latestVersion = data.versions[0].version || '';
      const el = $('#dp-side-ver');
      if (el) el.textContent = 'v' + state.latestVersion;
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
      preset_id: u.preset_id || null,
      preset_name: u.preset_name || '',
      permissions: Array.isArray(u.permissions) ? u.permissions : [],
    };
    try { localStorage.setItem('dp_user', JSON.stringify(state.user)); } catch (_) {}
  }

  // Preset-gated page access. Admins bypass. Non-admins need "view:<page>" in their
  // preset's permissions array. If a user has no preset, we fall back to the legacy
  // behavior (all non-admin pages visible) so existing seeded accounts keep working
  // until owner assigns them a preset via the admin console.
  function _hasPerm(scope) {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    const perms = Array.isArray(state.user.permissions) ? state.user.permissions : [];
    if (!state.user.preset_id) return scope.startsWith('view:');
    return perms.includes(scope);
  }
  function _canView(page)  { return _hasPerm('view:'  + page); }
  function _canWrite(page) { return _hasPerm('write:' + page); }

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
          ${it.flag
            ? `<span class="dp-nav-flag" aria-hidden="true">${it.flag}</span>`
            : icon(it.icon)}
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
        <div class="dp-side-version">
          <a href="#" onclick="event.preventDefault();DP.navigate('versions')" title="Version history">
            <span>Version</span>
          </a>
          <span class="dp-ver-num" id="dp-side-ver">v${esc(state.latestVersion || state.version)}</span>
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
      <label class="dp-search" onclick="DP.openSearch()">
        <span class="dp-sr-only">Search</span>
        <input type="search" id="dp-search-input" placeholder="Search posts, tasks, notes, contacts…"
               readonly onfocus="DP.openSearch();this.blur();" aria-label="Search">
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
      teams:         () => { _renderTeamsLanding(pageEl);  label = 'Team Boards'; },
      users:         () => {
        if (!state.user || state.user.role !== 'admin') { _renderHome(pageEl); label = 'Home'; state.page = 'home'; return; }
        _renderUsers(pageEl); label = 'Users';
      },
      presets:       () => {
        if (!state.user || state.user.role !== 'admin') { _renderHome(pageEl); label = 'Home'; state.page = 'home'; return; }
        _renderPresets(pageEl); label = 'Permission presets';
      },
      reference:     () => {
        if (!state.user || state.user.username !== 'jimmy') { _renderHome(pageEl); label = 'Home'; state.page = 'home'; return; }
        _renderAdminConsole(pageEl); label = 'Admin console';
      },
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
    const [home, annRes] = await Promise.all([
      api('GET', 'home'),
      api('GET', 'posts?board=announcements&limit=3'),
    ]);

    if (!state.user) return;
    // Stash home payload so approver-gating in Minutes/viewPost can check it.
    if (home) state.homePayload = home;

    // Replace skeleton with real page.
    root.innerHTML = '';

    const now = new Date();
    const today = todayISO();
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    const dateStr = fmtDateShort(now);
    const events = (home && home.events_current_month) || [];
    const meetingsToday = events.filter(e => String(e.start_date || '').slice(0, 10) === today).length;

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, `Good morning, ${_displayName()}`),
        h('div', { className: 'meta' }, [
          h('span', {}, `${weekday} · ${dateStr} · `),
          h('strong', {}, String(meetingsToday)),
          h('span', {}, meetingsToday === 1 ? ' meeting today' : ' meetings today'),
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

  // Stat strip — matches design spec (PMO Style Tokens v2): 5 chips with colored
  // left border by tone, big stat number, trend delta beside it, sub-copy below.
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

    const nextMeet = events.slice().sort((a, b) => {
      const ka = String(a.start_date || '') + ' ' + String(a.start_time || '');
      const kb = String(b.start_date || '') + ' ' + String(b.start_time || '');
      return ka.localeCompare(kb);
    }).find(e => String(e.start_date || '').slice(0, 10) === today);
    const nextMeetText = nextMeet
      ? 'Next · ' + (nextMeet.start_time || '') + ' ' + (nextMeet.title || '').slice(0, 22)
      : (todayMtgs === 0 ? 'Nothing scheduled' : 'See calendar');

    // Task progress — done / total across open-or-recent slice
    const taskTotal = my.length || 0;
    const taskDone  = my.filter(t => t.status === 'done').length;
    const pct       = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;
    const progressSub = taskTotal > 0
      ? taskDone + ' of ' + taskTotal + ' complete'
      : 'No tasks assigned';

    const approvalsSub = pendingCt > 0
      ? 'awaiting your vote'
      : 'you are clear';

    const notesSub = hiNotes > 0
      ? 'high priority · needs attention'
      : 'clean';

    const chips = [
      { lbl: 'My tasks due',       n: tasksDue,  delta: overdue > 0 ? (overdue + ' overdue') : '',
        sub: overdue > 0 ? 'act now · past due' : (tasksDue > 0 ? 'on track' : 'all caught up'),
        target: 'tasks',    tone: overdue > 0 ? 'alert' : (tasksDue > 0 ? 'info' : 'ok') },
      { lbl: 'Pending approvals',  n: pendingCt, delta: '',
        sub: approvalsSub,
        target: 'minutes',  tone: pendingCt > 0 ? 'warn' : 'ok' },
      { lbl: "Today's meetings",   n: todayMtgs, delta: '',
        sub: nextMeetText,
        target: 'calendar', tone: 'info' },
      { lbl: 'Notes · issues',     n: hiNotes,   delta: '',
        sub: notesSub,
        target: 'notes',    tone: hiNotes > 0 ? 'warn' : 'ok' },
      { lbl: 'Task progress',      n: pct + '%', delta: taskDone > 0 ? ('+' + taskDone + ' done') : '',
        sub: progressSub,
        target: 'tasks',    tone: pct >= 60 ? 'ok' : 'info' },
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
        <div class="val"><span class="n">${esc(String(c.n))}</span>${c.delta ? `<span class="delta">${esc(c.delta)}</span>` : ''}</div>
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
    // Pinned announcements float to the top so notices are never hidden below fresh posts.
    const ordered = posts.slice().sort((a, b) => Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0));
    const body = ordered.slice(0, 3).map(p => {
      const excerpt = String(p.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      const pinCls = p.pinned ? ' dp-post-pinned' : '';
      return `
        <button type="button" class="dp-post-item${pinCls}"
                onclick="DP.viewPost('announcements', ${Number(p.id)})"
                aria-label="${esc(p.title)}">
          <div class="t">
            ${p.pinned ? '<span class="dp-badge-notice" aria-label="Notice">NOTICE</span>' : ''}
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
      // Refresh home payload so my pending set no longer includes this post.
      state.homePayload = await api('GET', 'home');
      navigate(state.page);
    }
  }
  async function _inlineReject(postId) {
    if (!postId) return;
    if (!confirm('Reject this post? Author will need to revise.')) return;
    const approver = encodeURIComponent(_displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'rejected' });
    if (data) {
      toast('Rejected', 'ok');
      state.homePayload = await api('GET', 'home');
      navigate(state.page);
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

    // [CASE STUDY 2026-04-24 — approver gating]
    // Approve/Reject buttons only render for posts where the *current user*
    // is a pending approver. Data source: state.home.pending_approvals (home
    // API already returns this filtered list). If we don't have home data
    // cached (e.g. direct link to /minutes), fetch it once here.
    let myPendingSet = _myPendingApprovalSet();
    if (isMinutes && !myPendingSet) {
      const h2 = await api('GET', 'home');
      if (h2) state.homePayload = h2;
      myPendingSet = _myPendingApprovalSet();
    }

    const headers = isMinutes
      ? '<th>Title</th><th style="width:140px">Author</th><th style="width:130px">Approval</th><th style="width:180px">Your vote</th><th style="width:90px">Comments</th><th style="width:160px">Created</th>'
      : '<th>Title</th><th style="width:140px">Author</th><th style="width:90px">Comments</th><th style="width:90px">Views</th><th style="width:160px">Updated</th>';

    // [CASE STUDY — unified threading via parent_post_id + reply_to_id]
    // Two kinds of children are nested under a parent with a ㄴ prefix:
    //   1) parent_post_id — minutes revisions (rejected → revised)
    //   2) reply_to_id    — discussion replies on any board post
    // Either relation indents one level; reply children get a "reply" tag,
    // revision children get a "v2/v3" tag so readers can tell them apart.
    const byId = new Map(posts.map(p => [Number(p.id), p]));
    const roots = [];
    const childrenByParent = {};
    const childKind = {};
    posts.forEach(p => {
      const pid = p.parent_post_id && byId.get(Number(p.parent_post_id));
      const rid = p.reply_to_id && byId.get(Number(p.reply_to_id));
      const parent = pid || rid;
      if (parent) {
        const k = Number(parent.id);
        (childrenByParent[k] = childrenByParent[k] || []).push(p);
        childKind[Number(p.id)] = pid ? 'revision' : 'reply';
      } else {
        roots.push(p);
      }
    });
    // Pinned roots bubble to the top of the root list so notices stand out.
    roots.sort((a, b) => Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0));

    function renderPostRow(p, depth) {
      const pinned = !!p.pinned;
      const notice = pinned ? '<span class="dp-badge-notice" aria-label="Notice">NOTICE</span>' : '';
      const ts = fmtTime(p.updated_at || p.created_at);
      const indent = depth > 0
        ? `<span style="display:inline-block;width:${depth * 18}px"></span><span style="color:var(--text-3);margin-right:6px;font-family:var(--font-mono)">ㄴ</span>`
        : '';
      const kind = childKind[Number(p.id)] || '';
      const childTag = depth > 0
        ? (kind === 'revision'
            ? ` <span class="dp-tag neutral" style="margin-left:6px">v${p.version_number || (depth + 1)}</span>`
            : ` <span class="dp-tag info" style="margin-left:6px">reply</span>`)
        : '';
      const titleCell = `${indent}${notice}${esc(p.title)}${childTag}`;

      // Pin class only applies to top-level rows — a reply under a pinned
      // notice should not itself be tinted navy.
      const pinClass = (pinned && depth === 0) ? 'dp-row-pinned' : '';

      if (isMinutes) {
        const s = p.approval_status || 'draft';
        const tone = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : s === 'rejected' ? 'alert' : 'neutral';
        const statusCls = s === 'approved' ? 'dp-row-approved'
                       : s === 'pending'  ? 'dp-row-pending'
                       : s === 'rejected' ? 'dp-row-rejected' : '';
        const rowClass = [pinClass, statusCls].filter(Boolean).join(' ');
        // Approve/Reject visible ONLY if I'm listed as a pending approver.
        const canVote = s === 'pending' && myPendingSet && myPendingSet.has(Number(p.id));
        const voteCell = canVote
          ? `<button type="button" class="dp-btn dp-btn-primary dp-btn-sm" onclick="event.stopPropagation();DP._inlineApprove(${Number(p.id)})">Approve</button>
             <button type="button" class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="event.stopPropagation();DP._inlineReject(${Number(p.id)})">Reject</button>`
          : `<span style="color:var(--text-3);font-size:11px">—</span>`;
        return `<tr class="${rowClass}" onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
          <td>${titleCell}</td>
          <td>${esc(p.author_name || '')}</td>
          <td><span class="dp-tag ${tone}">${esc(s)}</span></td>
          <td style="white-space:nowrap">${voteCell}</td>
          <td class="mono">${p.comment_count || 0}</td>
          <td class="mono">${esc(ts)}</td>
        </tr>`;
      }
      return `<tr class="${pinClass}" onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
        <td>${titleCell}</td>
        <td>${esc(p.author_name || '')}</td>
        <td class="mono">${p.comment_count || 0}</td>
        <td class="mono">${p.view_count || 0}</td>
        <td class="mono">${esc(ts)}</td>
      </tr>`;
    }

    // Moved to module scope below.

    const rowsList = [];
    function walk(p, depth) {
      rowsList.push(renderPostRow(p, depth));
      const kids = childrenByParent[Number(p.id)] || [];
      kids.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      kids.forEach(k => walk(k, depth + 1));
    }
    roots.forEach(r => walk(r, 0));
    const rows = rowsList.join('');

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
  // TASKS — wired to /api/dreampath/tasks
  // =========================================================
  async function _renderTasks(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Tasks'),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openTaskEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New task'),
        ]),
      ]),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading tasks…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'tasks');
    loading.remove();
    const tasks = (data && data.tasks) || [];

    if (!tasks.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/check.svg')"></span></div>
        <h4>No tasks yet</h4>
        <p>Create the first task to track project work.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openTaskEditor()">+ New task</button>
      `;
      root.appendChild(empty);
      return;
    }

    // Group header shows totals per status so the ERP density still reads as a board.
    const byStatus = { todo: 0, in_progress: 0, done: 0 };
    tasks.forEach(t => { if (byStatus[t.status] !== undefined) byStatus[t.status]++; });
    const today = todayISO();

    const rows = tasks.map(t => {
      const statusTone = t.status === 'done' ? 'ok' : t.status === 'in_progress' ? 'info' : 'neutral';
      const due = String(t.due_date || '').slice(0, 10);
      const overdue = due && due < today && t.status !== 'done';
      const dueTone = overdue ? 'alert' : (due === today ? 'warn' : 'neutral');
      const prioTone = t.priority === 'high' ? 'alert' : t.priority === 'low' ? 'neutral' : 'neutral';
      return `<tr onclick="DP.viewTask(${Number(t.id)})">
        <td class="mono">TASK-${String(t.id).padStart(4, '0')}</td>
        <td>${esc(t.title || '')}</td>
        <td>${esc(t.assignee || '—')}</td>
        <td class="mono">${esc(due || '—')}</td>
        <td><span class="dp-tag ${prioTone}">${esc(t.priority || 'normal')}</span></td>
        <td><span class="dp-tag ${dueTone}">${overdue ? 'Overdue' : (due === today ? 'Today' : 'Scheduled')}</span></td>
        <td><span class="dp-tag ${statusTone}">${esc(t.status || 'todo')}</span></td>
      </tr>`;
    }).join('');

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>All tasks <span class="count">${tasks.length}</span></h3>
        <span style="font-size:11px;color:var(--text-3)">
          ${byStatus.todo} todo · ${byStatus.in_progress} in progress · ${byStatus.done} done
        </span>
      </div>
      <table class="dp-table">
        <thead>
          <tr>
            <th style="width:110px">ID</th><th>Title</th>
            <th style="width:140px">Owner</th><th style="width:110px">Due</th>
            <th style="width:90px">Priority</th><th style="width:110px">Schedule</th>
            <th style="width:110px">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  async function viewTask(id) {
    const postId = Number(id);
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading task…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    // tasks.js returns full list on GET, so fetch list and filter locally —
    // cheaper than a dedicated single-resource endpoint and matches what the
    // production /dreampath client does (no cache invalidation subtleties).
    const data = await api('GET', 'tasks');
    if (!data) return;
    const t = ((data.tasks) || []).find(x => Number(x.id) === postId);
    if (!t) { _renderPostError('Task not found', 'The task may have been removed.'); return; }

    const today = todayISO();
    const due = String(t.due_date || '').slice(0, 10);
    const overdue = due && due < today && t.status !== 'done';
    const statusTone = t.status === 'done' ? 'ok' : t.status === 'in_progress' ? 'info' : 'neutral';
    const prioTone = t.priority === 'high' ? 'alert' : 'neutral';
    const dueTone = overdue ? 'alert' : (due === today ? 'warn' : 'neutral');

    const transitions = [];
    if (t.status === 'todo')        transitions.push({ to: 'in_progress', label: 'Start' });
    if (t.status === 'in_progress') transitions.push({ to: 'done',        label: 'Mark done' });
    if (t.status === 'done')        transitions.push({ to: 'todo',        label: 'Reopen' });

    _openModal(
      t.title || '(Untitled)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="dp-tag neutral">TASK-${String(t.id).padStart(4, '0')}</span>
        <span class="dp-tag ${statusTone}">${esc(t.status)}</span>
        <span class="dp-tag ${prioTone}">${esc(t.priority || 'normal')}</span>
        ${due ? `<span class="dp-tag ${dueTone}">Due ${esc(due)}</span>` : ''}
        <span>·</span>
        <span>Owner <strong style="color:var(--text-2)">${esc(t.assignee || '—')}</strong></span>
      </div>
      ${t.description ? `<p>${esc(t.description)}</p>` : '<p style="color:var(--text-3)">No description.</p>'}
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--g-150);font-size:11px;color:var(--text-3)">
        Updated <span class="mono">${esc(fmtTime(t.updated_at))}</span>
      </div>
      `,
      `
      <button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
      ${transitions.map(tr =>
        `<button class="dp-btn dp-btn-primary" onclick="DP._taskTransition(${Number(t.id)},'${esc(tr.to)}')">${esc(tr.label)}</button>`
      ).join('')}
      `
    );
  }

  async function _taskTransition(id, newStatus) {
    const data = await api('PUT', 'tasks?id=' + Number(id), { status: newStatus });
    if (data) {
      toast('Task updated', 'ok');
      _closeModal();
      if (state.page === 'tasks') navigate('tasks');
      else if (state.page === 'home') navigate('home');
    }
  }

  function _openTaskEditor() {
    _openModal(
      'New task',
      `
      <div class="dp-field">
        <label for="dp-t-title">Title</label>
        <input class="dp-input" id="dp-t-title" placeholder="What needs doing?" autocomplete="off">
      </div>
      <div class="dp-field">
        <label for="dp-t-desc">Description</label>
        <textarea class="dp-textarea" id="dp-t-desc" placeholder="Context, links, acceptance criteria…"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-t-assignee">Owner</label>
          <input class="dp-input" id="dp-t-assignee" value="${esc(_displayName())}" placeholder="Assignee">
        </div>
        <div class="dp-field">
          <label for="dp-t-due">Due</label>
          <input class="dp-input" id="dp-t-due" type="date">
        </div>
        <div class="dp-field">
          <label for="dp-t-prio">Priority</label>
          <select class="dp-select" id="dp-t-prio">
            <option value="low">low</option>
            <option value="normal" selected>normal</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveNewTask()">Create</button>`
    );
    setTimeout(() => { const t = $('#dp-t-title'); if (t) t.focus(); }, 60);
  }

  async function _saveNewTask() {
    const title = ($('#dp-t-title').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    const body = {
      title,
      description: $('#dp-t-desc').value || '',
      assignee: $('#dp-t-assignee').value || '',
      due_date: $('#dp-t-due').value || null,
      priority: $('#dp-t-prio').value || 'normal',
      status: 'todo',
    };
    const data = await api('POST', 'tasks', body);
    if (data) {
      toast('Task created', 'ok');
      _closeModal();
      navigate('tasks');
    }
  }

  // =========================================================
  // NOTES / ISSUES — wired to /api/dreampath/notes
  // =========================================================
  async function _renderNotes(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Notes / Issues'),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openNoteEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New note'),
        ]),
      ]),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading notes…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'notes');
    loading.remove();
    const notes = (data && data.notes) || [];

    if (!notes.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/clipboard.svg')"></span></div>
        <h4>No notes or issues</h4>
        <p>Capture decisions, open issues, or quick context here.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openNoteEditor()">+ New note</button>
      `;
      root.appendChild(empty);
      return;
    }

    const rows = notes.map(n => {
      const statusTone = n.status === 'resolved' ? 'ok' : n.status === 'open' ? 'warn' : 'neutral';
      const prioTone = n.priority === 'high' ? 'alert' : n.priority === 'low' ? 'neutral' : 'neutral';
      const prefix = n.type === 'issue' ? 'ISS-' : 'NOTE-';
      return `<tr onclick="DP.viewNote(${Number(n.id)})">
        <td class="mono">${esc(prefix)}${String(n.id).padStart(4, '0')}</td>
        <td>${esc(n.title || '')}</td>
        <td><span class="dp-tag neutral">${esc(n.type || 'note')}</span></td>
        <td><span class="dp-tag ${prioTone}">${esc(n.priority || 'normal')}</span></td>
        <td><span class="dp-tag ${statusTone}">${esc(n.status || 'open')}</span></td>
        <td class="mono">${esc(fmtTime(n.updated_at))}</td>
      </tr>`;
    }).join('');
    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>All notes &amp; issues <span class="count">${notes.length}</span></h3>
      </div>
      <table class="dp-table">
        <thead><tr><th style="width:110px">ID</th><th>Title</th><th style="width:90px">Type</th><th style="width:90px">Priority</th><th style="width:110px">Status</th><th style="width:170px">Updated</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  async function viewNote(id) {
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading note…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    // Notes API returns list only; filter client-side for detail.
    const data = await api('GET', 'notes');
    if (!data) return;
    const n = ((data.notes) || []).find(x => Number(x.id) === Number(id));
    if (!n) { _renderPostError('Note not found', 'The note may have been removed.'); return; }
    const statusTone = n.status === 'resolved' ? 'ok' : 'warn';
    const prioTone = n.priority === 'high' ? 'alert' : 'neutral';
    _openModal(
      n.title || '(Untitled)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dp-tag neutral">${esc(n.type || 'note')}</span>
        <span class="dp-tag ${prioTone}">${esc(n.priority || 'normal')}</span>
        <span class="dp-tag ${statusTone}">${esc(n.status || 'open')}</span>
        <span>·</span><span>Updated <span class="mono">${esc(fmtTime(n.updated_at))}</span></span>
      </div>
      ${_sanitize(n.content || ('<p>' + esc(n.body || '') + '</p>'))}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${n.status !== 'resolved' ? `<button class="dp-btn dp-btn-primary" onclick="DP._resolveNote(${Number(n.id)})">Resolve</button>` : ''}`
    );
  }
  async function _resolveNote(id) {
    const data = await api('PUT', 'notes?id=' + Number(id), { status: 'resolved' });
    if (data) { toast('Marked resolved', 'ok'); _closeModal(); navigate('notes'); }
  }

  function _openNoteEditor() {
    _openModal(
      'New note / issue',
      `
      <div class="dp-field">
        <label for="dp-n-title">Title</label>
        <input class="dp-input" id="dp-n-title" placeholder="Title" autocomplete="off">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-n-type">Type</label>
          <select class="dp-select" id="dp-n-type">
            <option value="note" selected>note</option>
            <option value="issue">issue</option>
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-n-prio">Priority</label>
          <select class="dp-select" id="dp-n-prio">
            <option value="low">low</option>
            <option value="normal" selected>normal</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label for="dp-n-body">Body</label>
        <textarea class="dp-textarea" id="dp-n-body" placeholder="Context, links, action items…"></textarea>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveNewNote()">Create</button>`
    );
    setTimeout(() => { const t = $('#dp-n-title'); if (t) t.focus(); }, 60);
  }
  async function _saveNewNote() {
    const title = ($('#dp-n-title').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    const body = {
      title,
      type: $('#dp-n-type').value || 'note',
      priority: $('#dp-n-prio').value || 'normal',
      status: 'open',
      content: '<p>' + esc($('#dp-n-body').value || '') + '</p>',
    };
    const data = await api('POST', 'notes', body);
    if (data) { toast('Note created', 'ok'); _closeModal(); navigate('notes'); }
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
  // ===== Calendar — month grid wired to /api/dreampath/events?month=YYYY-MM =====
  let _calCursor = null;  // Date pointing at 1st of currently viewed month
  async function _renderCalendar(root) {
    if (!_calCursor) _calCursor = new Date();
    const cursor = _calCursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const monthStr = year + '-' + String(month + 1).padStart(2, '0');

    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, monthLabel),
      h('div', { style: { display: 'flex', gap: '8px' } }, [
        h('button', { className: 'dp-btn dp-btn-secondary dp-btn-sm', onclick: () => { _calCursor = new Date(year, month - 1, 1); navigate('calendar'); } }, '← Prev'),
        h('button', { className: 'dp-btn dp-btn-ghost dp-btn-sm',     onclick: () => { _calCursor = new Date(); navigate('calendar'); } },            'Today'),
        h('button', { className: 'dp-btn dp-btn-secondary dp-btn-sm', onclick: () => { _calCursor = new Date(year, month + 1, 1); navigate('calendar'); } }, 'Next →'),
      ]),
    ]));

    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading events…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'events?month=' + monthStr);
    loading.remove();
    const events = (data && data.events) || [];

    // Build day buckets
    const firstDow = new Date(year, month, 1).getDay();  // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDate = {};
    const today = todayISO();
    events.forEach(e => {
      const k = String(e.start_date || '').slice(0, 10);
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push(e);
    });

    const typeColor = {
      meeting:  'var(--dv-2)',
      deadline: 'var(--alert)',
      milestone: 'var(--gold)',
      general:  'var(--dv-3)',
    };

    const panel = h('div', { className: 'dp-panel' });
    let rowsHtml = '';
    const weekDayHdr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="dp-cal-wdh">${d}</div>`).join('');
    rowsHtml += `<div class="dp-cal-grid dp-cal-head">${weekDayHdr}</div>`;

    // Build grid: pad start with empty cells, then day cells
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    let gridHtml = '<div class="dp-cal-grid">';
    cells.forEach(d => {
      if (d == null) { gridHtml += '<div class="dp-cal-day dp-cal-day--empty"></div>'; return; }
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const isToday = dateStr === today;
      const evs = byDate[dateStr] || [];
      gridHtml += `
        <div class="dp-cal-day${isToday ? ' dp-cal-day--today' : ''}${evs.length ? ' dp-cal-day--has' : ''}"
             role="button" tabindex="0"
             onclick="DP._calDayClick('${esc(dateStr)}')"
             aria-label="${esc(dateStr + (evs.length ? ' · ' + evs.length + ' events' : ''))}">
          <div class="dp-cal-dnum">${d}</div>
          ${evs.slice(0, 3).map(e => `
            <div class="dp-cal-ev" style="border-left-color:${typeColor[e.type] || typeColor.general}"
                 onclick="event.stopPropagation();DP._calEventClick(${Number(e.id)})"
                 title="${esc(e.title || '')}">
              ${e.start_time ? `<span class="t">${esc(e.start_time)}</span>` : ''}
              <span class="name">${esc(e.title || '')}</span>
            </div>
          `).join('')}
          ${evs.length > 3 ? `<div class="dp-cal-more">+${evs.length - 3} more</div>` : ''}
        </div>
      `;
    });
    gridHtml += '</div>';
    panel.innerHTML = rowsHtml + gridHtml;
    root.appendChild(panel);

    if (!events.length) {
      const hint = h('div', { style: { marginTop: '12px', fontSize: '12px', color: 'var(--text-3)' } }, 'No events this month.');
      root.appendChild(hint);
    }
  }
  function _calDayClick(dateStr) {
    // Show a quick list for that day in a modal.
    const data = [];
    $$('.dp-cal-day--has .dp-cal-ev').forEach(() => {});
    _openModal(
      dateStr,
      `<div style="font-size:var(--fs-13);color:var(--text-3)">Day detail — click an event inside the cell to open it.</div>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`
    );
  }
  async function _calEventClick(id) {
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading event…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    const data = await api('GET', 'events?id=' + Number(id));
    if (!data) return;
    const e = data.event;
    if (!e) { _renderPostError('Event not found', 'It may have been removed or moved.'); return; }
    _openModal(
      e.title || '(Untitled event)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="dp-tag neutral">${esc(e.type || 'general')}</span>
        <span class="mono">${esc(e.start_date || '')}${e.end_date && e.end_date !== e.start_date ? ' → ' + esc(e.end_date) : ''}</span>
        ${e.start_time ? `<span>·</span><span class="mono">${esc(e.start_time)}${e.end_time ? '–' + esc(e.end_time) : ''}</span>` : ''}
        ${e.recurrence_type ? `<span>·</span><span class="dp-tag info">repeats ${esc(e.recurrence_type)}</span>` : ''}
      </div>
      ${_sanitize(e.description || '<p style="color:var(--text-3)">No description.</p>')}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`
    );
  }

  // ===== Contacts — /api/dreampath/contacts, grouped by `department` =====
  // [CASE STUDY — v2 grouping uses department field]
  // The user's design groups contacts into Partners / Vendors / Advisors.
  // The dp_contacts table only has a free-text `department` column, so we
  // partition client-side: any row whose department contains one of those
  // tokens goes into that bucket; the rest fall to "Other".
  async function _renderContacts(root) {
    root.innerHTML = '';
    const isAdmin = state.user && state.user.role === 'admin';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Contacts'),
      h('div', { style: { display: 'flex', gap: '8px' } }, isAdmin ? [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openContactEditor() }, '+ Contact'),
      ] : []),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading contacts…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'contacts');
    loading.remove();
    const contacts = (data && data.contacts) || [];

    if (!contacts.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/phone.svg')"></span></div>
        <h4>No contacts</h4>
        <p>Partner, vendor, and advisor contacts show up here once added.</p>
      `;
      root.appendChild(empty);
      return;
    }

    const groups = { Partners: [], Vendors: [], Advisors: [], Other: [] };
    contacts.forEach(c => {
      const d = String(c.department || '').toLowerCase();
      if (d.includes('partner')) groups.Partners.push(c);
      else if (d.includes('vendor'))  groups.Vendors.push(c);
      else if (d.includes('advisor')) groups.Advisors.push(c);
      else groups.Other.push(c);
    });

    const search = h('div', { style: { marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' } });
    search.innerHTML = `<input class="dp-input" id="dp-contacts-filter" type="search" placeholder="Search name / email / phone…" style="max-width:280px" oninput="DP._filterContacts()">`;
    root.appendChild(search);

    Object.keys(groups).forEach(groupName => {
      const list = groups[groupName];
      if (!list.length) return;
      const panel = h('div', { className: 'dp-panel', style: { marginBottom: '20px' } });
      const rows = list.map(c => {
        const note = c.note || '';
        const statusTone = /renew/i.test(note) ? 'warn' : /retainer|active|ongoing/i.test(note) ? 'ok' : /evaluat/i.test(note) ? 'info' : 'neutral';
        const statusText = note || (groupName === 'Partners' ? 'Active' : groupName === 'Advisors' ? 'On retainer' : groupName === 'Vendors' ? 'Evaluating' : '—');
        return `<tr class="dp-contact-row" data-search="${esc((c.name || '') + ' ' + (c.email || '') + ' ' + (c.phone || '') + ' ' + (c.role_title || ''))}">
          <td><strong>${esc(c.name || '—')}</strong></td>
          <td>${esc(c.role_title || '—')}</td>
          <td>${esc(c.department || '—')}</td>
          <td>${c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—'}</td>
          <td class="mono">${c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '—'}</td>
          <td><span class="dp-tag ${statusTone}">${esc(statusText)}</span></td>
          ${isAdmin ? `<td style="text-align:right"><button class="dp-btn dp-btn-ghost dp-btn-sm" onclick="DP._openContactEditor(${Number(c.id)})">Edit</button></td>` : ''}
        </tr>`;
      }).join('');
      panel.innerHTML = `
        <div class="dp-panel-head">
          <h3>${esc(groupName)} <span class="count">${list.length}</span></h3>
        </div>
        <table class="dp-table">
          <thead><tr>
            <th style="width:170px">Name</th>
            <th style="width:180px">Role</th>
            <th style="width:180px">Primary contact</th>
            <th style="width:220px">Email</th>
            <th style="width:150px">Phone</th>
            <th style="width:140px">Status</th>
            ${isAdmin ? '<th style="width:70px"></th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      root.appendChild(panel);
    });
  }
  function _filterContacts() {
    const q = ($('#dp-contacts-filter').value || '').trim().toLowerCase();
    $$('.dp-contact-row').forEach(r => {
      const hay = (r.dataset.search || '').toLowerCase();
      r.style.display = (!q || hay.includes(q)) ? '' : 'none';
    });
  }

  async function _openContactEditor(id) {
    let existing = null;
    if (id) {
      const data = await api('GET', 'contacts');
      if (data) existing = (data.contacts || []).find(c => Number(c.id) === Number(id));
    }
    const isEdit = !!existing;
    _openModal(
      isEdit ? 'Edit contact' : 'New contact',
      `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field"><label>Name</label><input class="dp-input" id="dp-c-name" value="${esc(existing ? existing.name : '')}"></div>
        <div class="dp-field"><label>Role / Title</label><input class="dp-input" id="dp-c-role" value="${esc(existing ? (existing.role_title || '') : '')}"></div>
      </div>
      <div class="dp-field">
        <label>Group</label>
        <select class="dp-select" id="dp-c-dept">
          <option value="Partner"${existing && /partner/i.test(existing.department || '') ? ' selected' : ''}>Partner</option>
          <option value="Vendor"${existing && /vendor/i.test(existing.department || '') ? ' selected' : ''}>Vendor</option>
          <option value="Advisor"${existing && /advisor/i.test(existing.department || '') ? ' selected' : ''}>Advisor</option>
          <option value="Other"${!existing || !/partner|vendor|advisor/i.test(existing.department || '') ? ' selected' : ''}>Other</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field"><label>Email</label><input class="dp-input" id="dp-c-email" type="email" value="${esc(existing ? (existing.email || '') : '')}"></div>
        <div class="dp-field"><label>Phone</label><input class="dp-input" id="dp-c-phone" value="${esc(existing ? (existing.phone || '') : '')}"></div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Status / Note</label>
        <input class="dp-input" id="dp-c-note" value="${esc(existing ? (existing.note || '') : '')}" placeholder="Active · Evaluating · Renewal May · etc.">
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       ${isEdit ? `<button class="dp-btn dp-btn-danger" onclick="DP._deleteContact(${Number(existing.id)})">Delete</button>` : ''}
       <button class="dp-btn dp-btn-primary" onclick="DP._saveContact(${isEdit ? Number(existing.id) : 'null'})">${isEdit ? 'Save' : 'Create'}</button>`
    );
  }
  async function _saveContact(id) {
    const body = {
      name:       ($('#dp-c-name').value || '').trim(),
      role_title: ($('#dp-c-role').value || '').trim(),
      department: $('#dp-c-dept').value,
      email:      ($('#dp-c-email').value || '').trim(),
      phone:      ($('#dp-c-phone').value || '').trim(),
      note:       ($('#dp-c-note').value || '').trim(),
    };
    if (!body.name) { toast('Name required', 'err'); return; }
    const data = id
      ? await api('PUT',  'contacts?id=' + id, body)
      : await api('POST', 'contacts', body);
    if (data) { toast(id ? 'Saved' : 'Added', 'ok'); _closeModal(); navigate('contacts'); }
  }
  async function _deleteContact(id) {
    if (!confirm('Delete this contact?')) return;
    const data = await api('DELETE', 'contacts?id=' + Number(id));
    if (data) { toast('Deleted', 'ok'); _closeModal(); navigate('contacts'); }
  }

  // ===== Team Boards — landing page layout from user design =====
  // Builds team cards from state.boards (board_type='team') + counts real
  // posts/tasks server-side per team. Below the grid, renders the member
  // roster from /contacts?team (=dp_users.is_active=1) with per-user stats.
  async function _renderTeamsLanding(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Team Boards'),
      h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, [
        h('span', { id: 'dp-teams-meta' }, 'Loading…'),
      ]),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading teams…</div>';
    root.appendChild(loading);

    // Parallel: contacts API (gives us team member list) + posts/tasks per board for counts
    const teams = (state.boards || []).filter(b => b.board_type === 'team');
    const [contactsRes, tasksRes, ...postCountsArr] = await Promise.all([
      api('GET', 'contacts'),
      api('GET', 'tasks'),
      ...teams.map(t => api('GET', 'posts?board=' + encodeURIComponent(t.slug) + '&limit=100').catch(() => null)),
    ]);
    loading.remove();

    const team = (contactsRes && contactsRes.team) || [];
    const tasks = (tasksRes && tasksRes.tasks) || [];

    // Team cards grid
    const cards = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' } });
    teams.forEach((t, idx) => {
      const postsRes = postCountsArr[idx];
      const posts = (postsRes && postsRes.posts) || [];
      const country = t.slug.slice(5);  // team_xxx → xxx
      const flag = _countryFlag(country);
      const countryName = country.charAt(0).toUpperCase() + country.slice(1);

      // Count members matching this country in their department
      const members = team.filter(u => String(u.department || '').toLowerCase().includes(country));
      const leadGuess = members.find(u => /lead|chief|head|pm/i.test(u.role_title || ''));
      const openCt = posts.filter(p => p.approval_status !== 'approved').length;
      const doneCt = posts.filter(p => p.approval_status === 'approved').length;
      const total = Math.max(openCt + doneCt, 1);
      const pct = Math.round((doneCt / total) * 100);

      const card = h('div', { className: 'dp-panel', style: { padding: '16px 18px', cursor: 'pointer' }, onclick: () => navigate(t.slug) });
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div>
            <div style="font-size:var(--fs-16);font-weight:600;display:flex;align-items:center;gap:8px">
              <span style="font-size:20px;line-height:1">${flag}</span>
              <span>${esc(t.title || ('Team ' + countryName))}</span>
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">
              ${leadGuess ? 'Lead · <strong style="color:var(--text-2);font-weight:500">' + esc(leadGuess.name) + '</strong>' : '&nbsp;'}
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-3);text-align:right">${members.length} ${members.length === 1 ? 'member' : 'people'}</div>
        </div>
        <div style="height:4px;background:var(--g-200);border-radius:2px;overflow:hidden;margin:12px 0 8px">
          <div style="height:100%;background:var(--navy);width:${pct}%;transition:width var(--dur-reveal) var(--ease-decel)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3)">
          <span><strong style="color:var(--text);font-family:var(--font-mono);font-weight:500">${openCt}</strong> open</span>
          <span><strong style="color:var(--text);font-family:var(--font-mono);font-weight:500">${doneCt}</strong> approved</span>
          <span style="color:var(--text);font-family:var(--font-mono);font-weight:500">${pct}%</span>
        </div>
      `;
      cards.appendChild(card);
    });
    root.appendChild(cards);

    const meta = $('#dp-teams-meta');
    if (meta) {
      const totalMembers = team.length;
      const totalTasks = tasks.filter(t => t.status !== 'done').length;
      meta.textContent = teams.length + ' teams · ' + totalMembers + ' members · ' + totalTasks + ' open tasks';
    }

    // Members grid
    if (!team.length) return;
    const mRoot = h('section', { className: 'dp-panel', style: { padding: '16px 18px' } });
    const memberCards = team.map(u => {
      const myTasks = tasks.filter(tt => String(tt.assignee || '').toLowerCase() === String(u.name || '').toLowerCase());
      const openCt = myTasks.filter(tt => tt.status !== 'done').length;
      const doneCt = myTasks.filter(tt => tt.status === 'done').length;
      const initials = (u.name || '?').slice(0, 1).toUpperCase();
      const teamSlug = _firstMatchingTeamSlug(u.department);
      const flag = teamSlug ? _countryFlag(teamSlug.slice(5)) : '';
      return `
        <div style="padding:14px;border:var(--bd);border-radius:var(--r-md);background:#fff">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div class="dp-avatar" style="width:32px;height:32px;font-size:12px">${esc(initials)}</div>
            ${flag ? `<span style="font-size:14px">${flag}</span>` : ''}
          </div>
          <div style="font-weight:600;font-size:var(--fs-13);color:var(--text)">${esc(u.name)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:10px">${esc(u.role_title || u.department || '—')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:10px;color:var(--text-3);text-align:left">
            <div><strong class="mono" style="color:var(--text);font-weight:500;font-size:var(--fs-13)">${openCt}</strong><br>open</div>
            <div><strong class="mono" style="color:var(--text);font-weight:500;font-size:var(--fs-13)">${doneCt}</strong><br>done</div>
            <div><strong class="mono" style="color:var(--text);font-weight:500;font-size:var(--fs-13)">${u.phone ? '✓' : '—'}</strong><br>contact</div>
          </div>
        </div>
      `;
    }).join('');
    mRoot.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
        <h3 style="margin:0;font-size:var(--fs-13);font-weight:600">Members</h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('contacts')" style="font-size:11px;color:var(--text-3)">View directory →</a>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px">${memberCards}</div>
    `;
    root.appendChild(mRoot);
  }
  function _firstMatchingTeamSlug(dept) {
    const d = String(dept || '').toLowerCase();
    const teams = (state.boards || []).filter(b => b.board_type === 'team');
    for (const t of teams) if (d.includes(t.slug.slice(5))) return t.slug;
    return null;
  }

  // Country → flag emoji. Unicode regional indicator pairs are easier to
  // maintain than shipping PNG/SVG flags.
  const COUNTRY_ISO = {
    korea: 'KR',       southkorea: 'KR',
    japan: 'JP',
    china: 'CN',
    nepal: 'NP',
    indonesia: 'ID',
    pakistan: 'PK',
    india: 'IN',
    thailand: 'TH',
    vietnam: 'VN',
    philippines: 'PH',
    malaysia: 'MY',
    singapore: 'SG',
    taiwan: 'TW',
    hongkong: 'HK',
    usa: 'US', us: 'US', america: 'US',
    uk: 'GB', britain: 'GB',
    canada: 'CA',
    australia: 'AU',
    germany: 'DE',
    france: 'FR',
  };
  function _countryFlag(country) {
    const code = COUNTRY_ISO[String(country || '').toLowerCase().replace(/\s+/g, '')];
    if (!code) return '🏳️';
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65);
  }

  // =========================================================
  // RULES — DREAMPATH.md live viewer with right-side TOC + scroll-spy
  // Content spec: every section SHOULD document
  //   · 개발 배경 (why we're doing this)
  //   · 개발 목적 (what the user/system gains)
  //   · 특이사항 / Remarks (non-obvious gotchas, prior incidents)
  // The viewer auto-extracts h2/h3 headings into a sticky right rail.
  // =========================================================
  async function _renderRules(root) {
    root.innerHTML = '';
    const active = state.rulesTab || 'md';

    // Tab strip at the top of the page head.
    const tabStrip = h('div', { className: 'dp-tabs', role: 'tablist' });
    [
      { id: 'md',     label: 'DREAMPATH.md',  sub: 'operating rules' },
      { id: 'design', label: 'Design Guide',  sub: 'tokens · colors · spacing' },
    ].forEach(t => {
      const btn = h('button', {
        type: 'button', role: 'tab',
        className: 'dp-tab' + (t.id === active ? ' dp-tab-on' : ''),
        'aria-selected': t.id === active ? 'true' : 'false',
        onclick: () => { state.rulesTab = t.id; _renderRules(root); },
      });
      btn.innerHTML = `<span class="dp-tab-t">${esc(t.label)}</span><span class="dp-tab-s">${esc(t.sub)}</span>`;
      tabStrip.appendChild(btn);
    });
    const head = h('div', { className: 'dp-page-head' }, [h('h1', {}, 'Dev Rules')]);
    root.appendChild(head);
    root.appendChild(tabStrip);

    if (active === 'design') { _renderRulesDesign(root); return; }
    _renderRulesMarkdown(root);
  }

  async function _renderRulesMarkdown(root) {
    const layout = h('div', { className: 'dp-rules-layout' });
    const body = h('article', { className: 'dp-panel dp-rules-body', id: 'dp-rules-body' });
    body.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading DREAMPATH.md…</div>';
    const toc  = h('aside', { className: 'dp-rules-toc', 'aria-label': 'Table of contents' });
    toc.innerHTML = '<div class="dp-h2">Contents</div><div id="dp-rules-toc-body" style="color:var(--text-3);font-size:12px">Loading…</div>';
    layout.append(body, toc);
    root.appendChild(layout);

    let md;
    try {
      const res = await fetch('/DREAMPATH.md', { credentials: 'same-origin' });
      md = await res.text();
    } catch (err) {
      body.innerHTML = `<div class="dp-panel-body pad" style="color:var(--alert)">Failed to load: ${esc(String(err))}</div>`;
      return;
    }

    const clean = md
      .replace(/^---\n[\s\S]*?\n---\n*/, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/^>\s*\[!\w+\][^\n]*\n?/gm, '> ');

    if (!window.marked) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/14.1.3/marked.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
    const raw = window.marked.parse(clean);
    const sanitized = _sanitize(raw);

    // [CASE STUDY 2026-04-24 — Dev Rules section cards]
    // Users asked for each top-level section (h2) to be visually separated
    // into its own card with a clear header. We parse the flat sanitized
    // HTML into sections (anything before first h2 → intro card; each h2
    // and the content until the next h2 → its own card). Subsections (h3)
    // stay inside their parent card.
    const scratch = document.createElement('div');
    scratch.innerHTML = sanitized;
    const nodes = Array.from(scratch.childNodes);
    const sections = [];
    let intro = [];
    let current = null;
    for (const n of nodes) {
      if (n.nodeType === 1 && n.tagName === 'H2') {
        if (current) sections.push(current);
        current = { title: n.textContent.trim(), nodes: [] };
      } else if (current) {
        current.nodes.push(n);
      } else {
        intro.push(n);
      }
    }
    if (current) sections.push(current);

    body.innerHTML = '';
    const cardsHost = document.createElement('div');
    cardsHost.className = 'dp-rules-cards';
    // Intro card (content before first H2)
    if (intro.length) {
      const card = document.createElement('section');
      card.className = 'dp-rules-card dp-rules-intro';
      intro.forEach(n => card.appendChild(n));
      cardsHost.appendChild(card);
    }
    const items = [];
    sections.forEach((sec, i) => {
      const slug = 'rule-' + i;
      const card = document.createElement('section');
      card.className = 'dp-rules-card';
      card.id = slug;
      const h2 = document.createElement('h2');
      h2.id = slug + '-h';
      h2.textContent = sec.title;
      card.appendChild(h2);
      sec.nodes.forEach(n => card.appendChild(n));
      cardsHost.appendChild(card);
      items.push({ slug, lvl: 2, text: sec.title });
      card.querySelectorAll('h3').forEach((h3, j) => {
        const sub = slug + '-s' + j;
        h3.id = sub;
        items.push({ slug: sub, lvl: 3, text: h3.textContent.trim() });
      });
    });
    body.appendChild(cardsHost);

    const tocBody = $('#dp-rules-toc-body');
    tocBody.innerHTML = items.map(it => `
      <a href="#${esc(it.slug)}" class="dp-toc-item dp-toc-h${it.lvl}" data-slug="${esc(it.slug)}"
         onclick="event.preventDefault();DP._scrollToRule('${esc(it.slug)}')">
        ${esc(it.text)}
      </a>
    `).join('');

    // Install scroll-spy to highlight active section in TOC
    _installRulesScrollSpy();
  }

  function _scrollToRule(slug) {
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Design Guide tab — static reference derived from the PMO Style Tokens v2
  // source of truth. Matches the actual CSS variable values so changes to
  // :root tokens are visible here (swatches pull from var(--...) directly).
  function _renderRulesDesign(root) {
    const host = h('div', { className: 'dp-rules-body' });
    root.appendChild(host);

    const swatch = (name, css, textOn) => `
      <div class="dp-sw">
        <div class="dp-sw-chip" style="background:var(${css});color:${textOn || '#fff'}">Aa</div>
        <div class="dp-sw-meta">
          <div class="dp-sw-name">${esc(name)}</div>
          <div class="dp-sw-var">${esc(css)}</div>
        </div>
      </div>`;
    const chip = (label, css) => `<div class="dp-token-row"><span class="dp-token-k">${esc(label)}</span><span class="dp-token-v">${esc(css)}</span></div>`;

    host.innerHTML = `
      <section class="dp-rules-card">
        <h2>Source of truth</h2>
        <p>These values mirror the PMO Style Tokens v2 (ERP) reference + <code>css/style.css</code>
        on BP미디어 so Dreampath and the public site stay aligned. When a token changes in
        <code>dreampath-v2.html</code> <code>:root</code>, the swatches below update automatically.</p>
      </section>

      <section class="dp-rules-card">
        <h2>Brand colors</h2>
        <div class="dp-sw-grid">
          ${swatch('Navy',       '--navy')}
          ${swatch('Navy 700',   '--navy-700')}
          ${swatch('Navy 600',   '--navy-600')}
          ${swatch('Green',      '--green')}
          ${swatch('Gold',       '--gold')}
        </div>
      </section>

      <section class="dp-rules-card">
        <h2>Status colors</h2>
        <div class="dp-sw-grid">
          ${swatch('OK',     '--ok')}
          ${swatch('Warn',   '--warn')}
          ${swatch('Alert',  '--alert')}
          ${swatch('Info',   '--info')}
        </div>
      </section>

      <section class="dp-rules-card">
        <h2>Gray scale</h2>
        <div class="dp-sw-grid">
          ${swatch('G 950', '--g-950')}
          ${swatch('G 900', '--g-900')}
          ${swatch('G 700', '--g-700', '#fff')}
          ${swatch('G 500', '--g-500', '#fff')}
          ${swatch('G 300', '--g-300', '#1F2937')}
          ${swatch('G 200', '--g-200', '#1F2937')}
          ${swatch('G 150', '--g-150', '#1F2937')}
          ${swatch('G 100', '--g-100', '#1F2937')}
          ${swatch('G 050', '--g-050', '#1F2937')}
        </div>
      </section>

      <section class="dp-rules-card">
        <h2>Typography</h2>
        <p><strong>UI:</strong> Google Sans Flex (variable, opsz 6..144 · wght 1..1000). <strong>Mono:</strong> JetBrains Mono.</p>
        <table>
          <thead><tr><th>Token</th><th>Size</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td class="mono">--fs-10</td><td>10px</td><td style="font-size:10px">Metric label / caption</td></tr>
            <tr><td class="mono">--fs-12</td><td>12px</td><td style="font-size:12px">Secondary body</td></tr>
            <tr><td class="mono">--fs-13</td><td>13px</td><td style="font-size:13px">Primary UI (base)</td></tr>
            <tr><td class="mono">--fs-16</td><td>16px</td><td style="font-size:16px">Modal heading</td></tr>
            <tr><td class="mono">--fs-20</td><td>20px</td><td style="font-size:20px;font-weight:600">Page title</td></tr>
            <tr><td class="mono">stat .n</td><td>28px / 700</td><td style="font-size:28px;font-weight:700;font-variant-numeric:tabular-nums">1,248</td></tr>
          </tbody>
        </table>
      </section>

      <section class="dp-rules-card">
        <h2>Spacing (BP미디어 ported)</h2>
        <div class="dp-token-grid">
          ${chip('--gap-micro',        '4px')}
          ${chip('--gap-tight',        '8px')}
          ${chip('--gap-element',     '12px')}
          ${chip('--gap-card',        '16px')}
          ${chip('--gap-section',     '24px')}
          ${chip('--gap-section-out', '32px')}
          ${chip('--pad-page-desktop','32px')}
          ${chip('--pad-page-tablet', '20px')}
          ${chip('--pad-page-mobile', '12px')}
        </div>
        <p style="margin-top:12px;color:var(--text-3);font-size:12px">Numeric aliases <code>--s-1</code> through <code>--s-10</code> (4/8/12/16/20/24/32/40) still exist for legacy surfaces; use the semantic tokens above in new code.</p>
      </section>

      <section class="dp-rules-card">
        <h2>Shape · motion · focus</h2>
        <div class="dp-token-grid">
          ${chip('--r-sm',       '2px (default)')}
          ${chip('--r-md',       '3px (modals, cards)')}
          ${chip('--r-lg',       '4px (large surfaces)')}
          ${chip('--row-compact','28px')}
          ${chip('--row-default','32px')}
          ${chip('--row-comfort','40px')}
          ${chip('--touch-min',  '40px')}
          ${chip('--dur-swift',  '120ms · default')}
          ${chip('--dur-moderate','200ms')}
          ${chip('--dur-reveal', '280ms (modals)')}
          ${chip('--focus-ring', '2px navy-600 + halo')}
        </div>
      </section>

      <section class="dp-rules-card">
        <h2>Data viz palette</h2>
        <div class="dp-sw-grid">
          ${swatch('dv-1', '--dv-1')}
          ${swatch('dv-2', '--dv-2')}
          ${swatch('dv-3', '--dv-3')}
          ${swatch('dv-4', '--dv-4')}
          ${swatch('dv-5', '--dv-5')}
          ${swatch('dv-6', '--dv-6')}
          ${swatch('dv-7', '--dv-7')}
          ${swatch('dv-8', '--dv-8')}
        </div>
      </section>

      <section class="dp-rules-card">
        <h2>Iconography</h2>
        <p>24×24 viewBox, <code>stroke="currentColor"</code> at <code>stroke-width: 1.75</code>, round linecap/linejoin. Rendered via CSS <code>mask-image</code> so any element inherits the parent color. All icons live in <code>img/dreampath-v2/icons/</code>.</p>
      </section>
    `;
  }

  let _rulesScrollHandler = null;
  function _installRulesScrollSpy() {
    if (_rulesScrollHandler) window.removeEventListener('scroll', _rulesScrollHandler);
    // Watch card sections (h2 lives inside each card) + nested h3s for fine-grained spy.
    const targets = $$('.dp-rules-card, #dp-rules-body h3');
    const update = () => {
      const y = window.scrollY + 80;
      let active = null;
      targets.forEach(t => { if (t.offsetTop <= y) active = t.id; });
      $$('.dp-toc-item').forEach(a => a.classList.toggle('dp-toc-active', a.dataset.slug === active));
    };
    _rulesScrollHandler = update;
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // =========================================================
  // ADMIN CONSOLE — jimmy only · board + user + version quick ops
  // =========================================================
  async function _renderAdminConsole(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Admin console'),
      h('div', { style: { color: 'var(--text-3)', fontSize: '12px' } }, 'Primary-operator surface for the Dreampath instance.'),
    ]));

    // Fire all counters in parallel — each failure tolerated independently.
    const [boardsRes, usersRes, versionsRes, contactsRes, eventsRes, tasksRes, notesRes, deptsRes] = await Promise.all([
      api('GET', 'boards').catch(() => null),
      api('GET', 'users').catch(() => null),
      api('GET', 'versions').catch(() => null),
      api('GET', 'contacts').catch(() => null),
      api('GET', 'events?month=' + todayISO().slice(0, 7)).catch(() => null),
      api('GET', 'tasks').catch(() => null),
      api('GET', 'notes').catch(() => null),
      api('GET', 'departments').catch(() => null),
    ]);
    const boards = (boardsRes && boardsRes.boards) || [];
    const users = (usersRes && usersRes.users) || [];
    const versions = (versionsRes && versionsRes.versions) || [];
    const contacts = (contactsRes && contactsRes.contacts) || [];
    const events = (eventsRes && eventsRes.events) || [];
    const tasks = (tasksRes && tasksRes.tasks) || [];
    const notes = (notesRes && notesRes.notes) || [];
    const depts = (deptsRes && deptsRes.departments) || [];
    const activeUsers = users.filter(u => u.is_active).length;
    const inactiveUsers = users.length - activeUsers;

    // Tile: count + sub + dispatch. [CASE STUDY 2026-04-24 — no eval() in CSP]
    // Early version used eval(t.onclick) which works nowhere with strict CSP.
    // Tiles now hold a real function reference that runs on click.
    // Fetch preset count for the tile
    const presetsRes = await api('GET', 'presets').catch(() => null);
    const presetsList = (presetsRes && presetsRes.presets) || [];

    const tileData = [
      { title: 'Boards',       count: boards.length,   sub: 'manage post boards + team boards',         icon: 'layers',      run: () => _scrollToAnchor('adm-boards') },
      { title: 'Users',        count: users.length,    sub: activeUsers + ' active · ' + inactiveUsers + ' disabled', icon: 'users-admin', run: () => navigate('users') },
      { title: 'Permission presets', count: presetsList.length, sub: 'page-level view/write templates', icon: 'compass',     run: () => navigate('presets') },
      { title: 'Departments',  count: depts.length,    sub: 'team tokens used by team boards + contacts', icon: 'community', run: () => _scrollToAnchor('adm-depts') },
      { title: 'Versions',     count: versions.length, sub: 'release log · BP changelog format',         icon: 'file-text',   run: () => navigate('versions') },
      { title: 'Contacts',     count: contacts.length, sub: 'partners / vendors / advisors',             icon: 'phone',       run: () => navigate('contacts') },
      { title: 'Events',       count: events.length,   sub: 'this month',                                 icon: 'calendar',   run: () => navigate('calendar') },
      { title: 'Tasks',        count: tasks.length,    sub: tasks.filter(t => t.status !== 'done').length + ' open', icon: 'check',       run: () => navigate('tasks') },
      { title: 'Notes / Issues', count: notes.length, sub: notes.filter(n => n.status === 'open').length + ' open', icon: 'clipboard',  run: () => navigate('notes') },
      { title: 'Dev Rules',    count: '',              sub: 'DREAMPATH.md + Design Guide',                icon: 'layers',     run: () => navigate('rules') },
    ];
    const tiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginBottom: '20px' } });
    tileData.forEach(t => {
      const tile = h('button', {
        type: 'button', className: 'dp-panel',
        style: { padding: '16px 18px', textAlign: 'left', cursor: 'pointer', border: 'var(--bd)', borderRadius: 'var(--r-md)', background: '#fff', fontFamily: 'inherit' },
        onclick: t.run,
      });
      tile.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span class="ico" style="width:16px;height:16px;background-color:var(--navy);-webkit-mask:url('/img/dreampath-v2/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat;mask:url('/img/dreampath-v2/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat"></span>
          <strong style="font-size:var(--fs-13);color:var(--text)">${esc(t.title)}</strong>
          ${t.count !== '' ? `<span style="margin-left:auto;font-variant-numeric:tabular-nums;color:var(--text);font-size:var(--fs-14);font-weight:600">${t.count}</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--text-3);line-height:1.5">${esc(t.sub)}</div>
      `;
      tiles.appendChild(tile);
    });
    root.appendChild(tiles);

    // Quick actions row — all onclick references are DP.* which is CSP-safe.
    const actions = h('div', { className: 'dp-panel', style: { padding: '18px 20px', marginBottom: '20px' } });
    actions.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0;font-size:var(--fs-13);font-weight:600">Quick actions</h3>
        <span style="font-size:11px;color:var(--text-3)">common housekeeping tasks</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="dp-btn dp-btn-primary" onclick="DP._openBoardEditor()">+ New board</button>
        <button class="dp-btn dp-btn-primary" onclick="DP._openUserEditor()">+ New user</button>
        <button class="dp-btn dp-btn-primary" onclick="DP._openDepartmentEditor()">+ New department</button>
        <button class="dp-btn dp-btn-primary" onclick="DP._openVersionEditor()">+ Log version</button>
        <button class="dp-btn dp-btn-primary" onclick="DP._openContactEditor()">+ New contact</button>
        <button class="dp-btn dp-btn-secondary" onclick="DP.openSearch()">Global search</button>
        <button class="dp-btn dp-btn-secondary" onclick="DP.navigate('rules')">Dev Rules</button>
      </div>
    `;
    root.appendChild(actions);

    // Inline board list
    const boardPanel = h('div', { className: 'dp-panel', id: 'adm-boards', style: { marginBottom: '20px', scrollMarginTop: '64px' } });
    const PROTECTED = new Set(['announcements', 'documents', 'minutes']);
    boardPanel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Boards <span class="count">${boards.length}</span></h3>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openBoardEditor()">+ Board</button>
      </div>
      <table class="dp-table">
        <thead><tr><th style="width:180px">Slug</th><th>Title</th><th style="width:110px">Type</th><th style="width:90px">Posts</th><th style="width:170px">Created</th><th style="width:90px"></th></tr></thead>
        <tbody>
          ${boards.map(b => `
            <tr>
              <td class="mono">${esc(b.slug)}</td>
              <td>${esc(b.title || '')}</td>
              <td><span class="dp-tag ${b.board_type === 'team' ? 'info' : 'neutral'}">${esc(b.board_type)}</span></td>
              <td class="mono">${b.post_count || 0}</td>
              <td class="mono">${esc(fmtTime(b.created_at))}</td>
              <td style="text-align:right">
                ${PROTECTED.has(b.slug) || (b.post_count || 0) > 0
                  ? `<span style="color:var(--text-3);font-size:11px">${PROTECTED.has(b.slug) ? 'protected' : 'has posts'}</span>`
                  : `<button class="dp-btn dp-btn-danger dp-btn-sm" onclick="DP._deleteBoard(${Number(b.id)}, '${esc(b.slug)}')">Delete</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    root.appendChild(boardPanel);

    // Departments panel — used by team-board routing + contacts grouping
    const deptPanel = h('div', { className: 'dp-panel', id: 'adm-depts', style: { marginBottom: '20px', scrollMarginTop: '64px' } });
    deptPanel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Departments <span class="count">${depts.length}</span></h3>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openDepartmentEditor()">+ Department</button>
      </div>
      ${depts.length ? `
        <table class="dp-table">
          <thead><tr><th>Name</th><th style="width:170px">Created</th><th style="width:90px"></th></tr></thead>
          <tbody>
            ${depts.map(d => `
              <tr>
                <td>${esc(d.name || '')}</td>
                <td class="mono">${esc(fmtTime(d.created_at))}</td>
                <td style="text-align:right">
                  <button class="dp-btn dp-btn-danger dp-btn-sm" onclick="DP._deleteDepartment(${Number(d.id)}, '${esc(d.name)}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No departments yet.</div>'}
    `;
    root.appendChild(deptPanel);

    // Users preview (top 10) with quick link to full list
    const userPanel = h('div', { className: 'dp-panel' });
    userPanel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Users <span class="count">${users.length}</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('users')" style="font-size:11px;color:var(--text-3)">Manage all →</a>
      </div>
      <table class="dp-table">
        <thead><tr><th style="width:120px">Username</th><th>Display name</th><th style="width:80px">Role</th><th style="width:120px">Team</th><th style="width:90px">Status</th><th style="width:140px">Last login</th></tr></thead>
        <tbody>
          ${users.slice(0, 10).map(u => `
            <tr onclick="DP._openUserEditor(${Number(u.id)})">
              <td><strong>${esc(u.username)}</strong></td>
              <td>${esc(u.display_name || '')}</td>
              <td><span class="dp-tag ${u.role === 'admin' ? 'info' : 'neutral'}">${esc(u.role || 'member')}</span></td>
              <td>${esc(u.department || '—')}</td>
              <td><span class="dp-tag ${u.is_active ? 'ok' : 'alert'}">${u.is_active ? 'active' : 'disabled'}</span></td>
              <td class="mono">${esc(fmtTime(u.last_login_at))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    root.appendChild(userPanel);
  }

  function _scrollToAnchor(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Department CRUD (admin only via API)
  function _openDepartmentEditor() {
    _openModal(
      'New department',
      `<div class="dp-field" style="margin-bottom:0">
        <label>Name <span style="font-weight:400;color:var(--text-3);margin-left:4px">(e.g. "Team Korea", "Finance", "Product")</span></label>
        <input class="dp-input" id="dp-d-name" autocomplete="off">
      </div>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveDepartment()">Add</button>`
    );
    setTimeout(() => { const i = $('#dp-d-name'); if (i) i.focus(); }, 40);
  }
  async function _saveDepartment() {
    const name = ($('#dp-d-name').value || '').trim();
    if (!name) { toast('Name required', 'err'); return; }
    const data = await api('POST', 'departments', { name });
    if (data) { toast('Department added', 'ok'); _closeModal(); navigate('reference'); }
  }
  async function _deleteDepartment(id, name) {
    if (!confirm('Delete department "' + name + '"?')) return;
    const data = await api('DELETE', 'departments?id=' + Number(id));
    if (data) { toast('Deleted', 'ok'); navigate('reference'); }
  }

  // Board manager quick modal
  function _openBoardManager() {
    navigate('reference');  // Already on the page; re-render ensures fresh counts
  }
  function _openBoardEditor() {
    _openModal(
      'New board',
      `
      <div class="dp-field">
        <label>Slug <span style="font-weight:400;color:var(--text-3);margin-left:4px">(a-z / 0-9 / _ only · becomes the URL)</span></label>
        <input class="dp-input" id="dp-b-slug" placeholder="e.g. team_japan" autocomplete="off" pattern="[a-z0-9_]+">
      </div>
      <div class="dp-field">
        <label>Title</label>
        <input class="dp-input" id="dp-b-title" placeholder="Board label shown in sidebar">
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Type</label>
        <select class="dp-select" id="dp-b-type">
          <option value="board">board — general, everyone can read</option>
          <option value="team">team — gated by user.department</option>
        </select>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveNewBoard()">Create</button>`
    );
  }
  async function _saveNewBoard() {
    const slug  = ($('#dp-b-slug').value || '').trim().toLowerCase();
    const title = ($('#dp-b-title').value || '').trim();
    const board_type = $('#dp-b-type').value;
    if (!/^[a-z0-9_]+$/.test(slug)) { toast('Slug must be a-z / 0-9 / _ only', 'err'); return; }
    if (!title) { toast('Title required', 'err'); return; }
    const data = await api('POST', 'boards', { slug, title, board_type });
    if (data) {
      toast('Board created', 'ok');
      _closeModal();
      await _refreshBoards();
      // Re-mount shell so the new board shows up in sidebar.
      _mountShell();
      navigate('reference');
    }
  }
  async function _deleteBoard(id, slug) {
    if (!confirm('Delete board "' + slug + '"? Posts must be removed first.')) return;
    const data = await api('DELETE', 'boards?id=' + Number(id));
    if (data) {
      toast('Board deleted', 'ok');
      await _refreshBoards();
      _mountShell();
      navigate('reference');
    }
  }

  // =========================================================
  // USERS — admin-only, /api/dreampath/users
  // =========================================================
  async function _renderUsers(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'User management'),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openUserEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New user'),
        ]),
      ]),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading users…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'users');
    loading.remove();
    const users = (data && data.users) || [];

    if (!users.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/users-admin.svg')"></span></div>
        <h4>No users</h4>
      `;
      root.appendChild(empty);
      return;
    }

    const rows = users.map(u => {
      const roleTone = u.role === 'admin' ? 'info' : 'neutral';
      const activeTone = u.is_active ? 'ok' : 'alert';
      const presetCell = u.role === 'admin'
        ? '<span style="color:var(--text-3);font-size:11px">—</span>'
        : (u.preset_name
            ? `<span class="dp-tag neutral">${esc(u.preset_name)}</span>`
            : `<span style="color:var(--text-3);font-size:11px">(none · all view)</span>`);
      return `<tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td>${esc(u.display_name || '')}</td>
        <td><span class="dp-tag ${roleTone}">${esc(u.role || 'member')}</span></td>
        <td>${presetCell}</td>
        <td>${esc(u.department || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td class="mono">${esc(fmtTime(u.last_login_at))}</td>
        <td><span class="dp-tag ${activeTone}">${u.is_active ? 'active' : 'disabled'}</span></td>
        <td style="text-align:right">
          <button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP._openUserEditor(${Number(u.id)})">Edit</button>
          ${u.username !== 'jimmy' && u.id !== (state.user && state.user.uid)
            ? `<button class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="DP._deleteUser(${Number(u.id)}, '${esc(u.username)}')">Delete</button>`
            : ''}
        </td>
      </tr>`;
    }).join('');

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head"><h3>All users <span class="count">${users.length}</span></h3></div>
      <table class="dp-table">
        <thead><tr>
          <th style="width:120px">Username</th><th>Display name</th>
          <th style="width:80px">Role</th><th style="width:160px">Preset</th>
          <th style="width:120px">Team</th><th>Email</th>
          <th style="width:140px">Last login</th><th style="width:90px">Status</th>
          <th style="width:130px;text-align:right">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  // -------------------------- Permission presets --------------------------
  // Pages that can be toggled per preset. Admin-only pages (users, presets,
  // reference) are intentionally excluded — those stay owner/admin gated.
  const PRESET_PAGES = [
    { key: 'home',          label: 'Home' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'calendar',      label: 'Calendar' },
    { key: 'documents',     label: 'Documents' },
    { key: 'minutes',       label: 'Meeting Minutes' },
    { key: 'tasks',         label: 'Tasks' },
    { key: 'notes',         label: 'Notes / Issues' },
    { key: 'teams',         label: 'Team Boards' },
    { key: 'contacts',      label: 'Contacts' },
    { key: 'rules',         label: 'Dev Rules' },
    { key: 'versions',      label: 'Versions' },
  ];

  async function _renderPresets(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'Permission presets'),
        h('div', { className: 'meta' }, 'Assign a preset to each member to control which pages they can view or edit. Admins bypass presets.'),
      ]),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openPresetEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New preset'),
        ]),
      ]),
    ]));

    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading presets…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'presets');
    loading.remove();
    const presets = (data && data.presets) || [];

    const rows = presets.map(p => {
      let perms = [];
      try { perms = JSON.parse(p.permissions || '{"permissions":[]}').permissions || []; } catch (_e) { perms = []; }
      const viewCt = perms.filter(x => x.startsWith('view:')).length;
      const writeCt = perms.filter(x => x.startsWith('write:')).length;
      const builtinTag = p.is_builtin ? '<span class="dp-tag info" style="margin-left:6px">built-in</span>' : '';
      return `<tr>
        <td><strong>${esc(p.name)}</strong>${builtinTag}</td>
        <td style="color:var(--text-2);font-size:12px">${esc(p.description || '—')}</td>
        <td class="mono"><span class="dp-tag neutral">${viewCt} view</span> <span class="dp-tag neutral" style="margin-left:4px">${writeCt} write</span></td>
        <td class="mono">${p.user_count || 0}</td>
        <td style="text-align:right">
          <button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP._openPresetEditor(${Number(p.id)})">Edit</button>
          ${!p.is_builtin
            ? `<button class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="DP._deletePreset(${Number(p.id)}, '${esc(p.name)}', ${Number(p.user_count || 0)})">Delete</button>`
            : ''}
        </td>
      </tr>`;
    }).join('');

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head"><h3>All presets <span class="count">${presets.length}</span></h3></div>
      <table class="dp-table">
        <thead><tr>
          <th style="width:180px">Name</th>
          <th>Description</th>
          <th style="width:200px">Permissions</th>
          <th style="width:80px">Users</th>
          <th style="width:130px;text-align:right">Actions</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:40px">No presets yet.</td></tr>'}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  async function _openPresetEditor(presetId) {
    let existing = null;
    if (presetId) {
      const data = await api('GET', 'presets');
      if (data) existing = (data.presets || []).find(p => Number(p.id) === Number(presetId));
      if (!existing) { toast('Preset not found', 'err'); return; }
    }
    const isEdit = !!existing;
    let perms = [];
    if (existing) {
      try { perms = JSON.parse(existing.permissions || '{"permissions":[]}').permissions || []; } catch (_e) { perms = []; }
    }
    const has = (p) => perms.includes(p);

    const gridRows = PRESET_PAGES.map(pg => `
      <tr>
        <td><strong>${esc(pg.label)}</strong><div style="font-size:11px;color:var(--text-3)">${esc(pg.key)}</div></td>
        <td style="text-align:center">
          <input type="checkbox" class="dp-preset-cb" data-scope="view:${esc(pg.key)}" ${has('view:' + pg.key) ? 'checked' : ''}>
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="dp-preset-cb" data-scope="write:${esc(pg.key)}" ${has('write:' + pg.key) ? 'checked' : ''}>
        </td>
      </tr>
    `).join('');

    const builtinNote = existing && existing.is_builtin
      ? '<div style="padding:8px 12px;background:var(--info-bg);color:var(--navy);border-radius:2px;margin-bottom:12px;font-size:12px">Built-in preset — name and description are locked. Permissions may still be tuned.</div>'
      : '';

    _openModal(
      isEdit ? 'Edit preset · ' + existing.name : 'New preset',
      `
      ${builtinNote}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-p-name">Name</label>
          <input class="dp-input" id="dp-p-name" value="${esc(existing ? existing.name : '')}"
                 ${existing && existing.is_builtin ? 'disabled' : ''} autocomplete="off">
        </div>
        <div class="dp-field">
          <label for="dp-p-slug">Slug</label>
          <input class="dp-input" id="dp-p-slug" value="${esc(existing ? existing.slug : '')}"
                 ${isEdit ? 'disabled' : ''} placeholder="auto from name">
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-p-desc">Description</label>
        <input class="dp-input" id="dp-p-desc" value="${esc(existing ? (existing.description || '') : '')}"
               ${existing && existing.is_builtin ? 'disabled' : ''} maxlength="400">
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Page permissions</label>
        <table class="dp-table" id="dp-preset-grid">
          <thead><tr>
            <th>Page</th>
            <th style="width:80px;text-align:center">View</th>
            <th style="width:80px;text-align:center">Write</th>
          </tr></thead>
          <tbody>${gridRows}</tbody>
        </table>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._savePreset(${presetId ? Number(presetId) : 'null'})">${isEdit ? 'Save' : 'Create'}</button>`,
      { wide: true }
    );
  }

  async function _savePreset(id) {
    const cbs = document.querySelectorAll('.dp-preset-cb');
    const picked = [];
    cbs.forEach(cb => { if (cb.checked) picked.push(cb.getAttribute('data-scope')); });
    const body = { permissions: picked };
    if (!id) {
      const name = ($('#dp-p-name').value || '').trim();
      if (!name) { toast('Name is required', 'err'); return; }
      body.name = name;
      body.slug = ($('#dp-p-slug').value || '').trim();
      body.description = ($('#dp-p-desc').value || '').trim();
      const data = await api('POST', 'presets', body);
      if (data) { toast('Preset created', 'ok'); _closeModal(); navigate('presets'); }
    } else {
      // builtin locks name/desc, but allow updating from enabled fields
      const nameEl = $('#dp-p-name');
      const descEl = $('#dp-p-desc');
      if (nameEl && !nameEl.disabled) body.name = nameEl.value.trim();
      if (descEl && !descEl.disabled) body.description = descEl.value.trim();
      const data = await api('PUT', 'presets?id=' + id, body);
      if (data) { toast('Preset updated', 'ok'); _closeModal(); navigate('presets'); }
    }
  }

  async function _deletePreset(id, name, userCount) {
    if (userCount > 0) {
      toast(`Cannot delete: ${userCount} user(s) still assigned. Reassign first.`, 'err');
      return;
    }
    if (!confirm('Delete preset "' + name + '"? This cannot be undone.')) return;
    const data = await api('DELETE', 'presets?id=' + id);
    if (data) { toast('Preset deleted', 'ok'); navigate('presets'); }
  }

  async function _openUserEditor(userId) {
    let existing = null;
    if (userId) {
      const data = await api('GET', 'users');
      if (data) existing = (data.users || []).find(u => Number(u.id) === Number(userId));
      if (!existing) { toast('User not found', 'err'); return; }
    }
    // Fetch presets list so the editor can offer a dropdown.
    const presetsRes = await api('GET', 'presets');
    const presets = (presetsRes && presetsRes.presets) || [];
    const presetOpts = ['<option value="">— none (all view by default)</option>']
      .concat(presets.map(p =>
        `<option value="${Number(p.id)}"${existing && existing.preset_id === p.id ? ' selected' : ''}>${esc(p.name)}${p.is_builtin ? ' (built-in)' : ''}</option>`
      )).join('');

    const isEdit = !!existing;
    _openModal(
      isEdit ? 'Edit user · ' + existing.username : 'New user',
      `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-u-username">Username</label>
          <input class="dp-input" id="dp-u-username"
                 value="${esc(existing ? existing.username : '')}"
                 ${isEdit ? 'disabled' : ''} autocomplete="off">
        </div>
        <div class="dp-field">
          <label for="dp-u-display">Display name</label>
          <input class="dp-input" id="dp-u-display" value="${esc(existing ? (existing.display_name || '') : '')}">
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-u-password">Password ${isEdit ? '<span style="font-weight:400;color:var(--text-3);margin-left:4px">(leave blank to keep current)</span>' : ''}</label>
        <input class="dp-input" id="dp-u-password" type="password" autocomplete="new-password">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-u-role">Role</label>
          <select class="dp-select" id="dp-u-role">
            <option value="member"${existing && existing.role !== 'admin' ? ' selected' : ''}>member</option>
            <option value="admin"${existing && existing.role === 'admin' ? ' selected' : ''}>admin</option>
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-u-active">Status</label>
          <select class="dp-select" id="dp-u-active">
            <option value="1"${!existing || existing.is_active ? ' selected' : ''}>active</option>
            <option value="0"${existing && !existing.is_active ? ' selected' : ''}>disabled</option>
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-u-dept">Team / Dept</label>
          <input class="dp-input" id="dp-u-dept" value="${esc(existing ? (existing.department || '') : '')}" placeholder="e.g. team korea">
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-u-preset">Permission preset <span style="font-weight:400;color:var(--text-3);margin-left:4px">(ignored when role = admin)</span></label>
        <select class="dp-select" id="dp-u-preset">${presetOpts}</select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-u-email">Email</label>
          <input class="dp-input" id="dp-u-email" type="email" value="${esc(existing ? (existing.email || '') : '')}">
        </div>
        <div class="dp-field">
          <label for="dp-u-phone">Phone</label>
          <input class="dp-input" id="dp-u-phone" value="${esc(existing ? (existing.phone || '') : '')}">
        </div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveUser(${userId ? Number(userId) : 'null'})">${isEdit ? 'Save' : 'Create'}</button>`
    );
  }

  async function _saveUser(id) {
    const presetSel = $('#dp-u-preset');
    const presetVal = presetSel ? presetSel.value : '';
    const body = {
      display_name: ($('#dp-u-display').value || '').trim(),
      role:         $('#dp-u-role').value,
      is_active:    $('#dp-u-active').value === '1' ? 1 : 0,
      department:   ($('#dp-u-dept').value || '').trim(),
      email:        ($('#dp-u-email').value || '').trim(),
      phone:        ($('#dp-u-phone').value || '').trim(),
      preset_id:    presetVal ? Number(presetVal) : null,
    };
    const pw = ($('#dp-u-password').value || '');
    if (id) {
      // EDIT
      if (pw) body.new_password = pw;
      const data = await api('PUT', 'users?id=' + id, body);
      if (data) { toast('User updated', 'ok'); _closeModal(); navigate('users'); }
    } else {
      // CREATE
      const username = ($('#dp-u-username').value || '').trim();
      if (!username) { toast('Username required', 'err'); return; }
      if (!pw || pw.length < 6) { toast('Password must be at least 6 characters', 'err'); return; }
      body.username = username;
      body.password = pw;
      const data = await api('POST', 'users', body);
      if (data) { toast('User created', 'ok'); _closeModal(); navigate('users'); }
    }
  }

  async function _deleteUser(id, username) {
    if (!confirm('Delete user "' + username + '"? This cannot be undone.')) return;
    const data = await api('DELETE', 'users?id=' + Number(id));
    if (data) { toast('User deleted', 'ok'); navigate('users'); }
  }

  // =========================================================
  // VERSIONS — wired to /api/dreampath/versions
  // =========================================================
  async function _renderVersions(root) {
    root.innerHTML = '';
    const isAdmin = state.user && state.user.role === 'admin';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, 'Versions'),
      h('div', {}, isAdmin ? [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openVersionEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' Log version'),
        ]),
      ] : []),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading version history…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'versions');
    loading.remove();
    const versions = (data && data.versions) || [];

    if (!versions.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/file-text.svg')"></span></div>
        <h4>No versions logged</h4>
        <p>./deploy.sh registers a version on each production push.</p>
      `;
      root.appendChild(empty);
      return;
    }

    // [CASE STUDY — description parser matches BP Media changelog format]
    // First line is the summary; subsequent lines starting with "- " become
    // bullet changes. Blank lines separate. This mirrors data/changelog.json
    // entries on the public site, so operators can author version notes in
    // exactly the same mental model whether they're on BP Media or Dreampath.
    function parseChangelog(desc) {
      const raw = String(desc || '').replace(/\r\n/g, '\n').trim();
      if (!raw) return { summary: '', changes: [] };
      const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
      const summary = lines[0] || '';
      const changes = lines.slice(1).map(s => s.replace(/^[-•·*]\s*/, '')).filter(Boolean);
      return { summary, changes };
    }

    const typeTone = (t) => t === 'feature' ? 'info' : t === 'bugfix' ? 'warn' : 'neutral';
    const typeLabel = { feature: 'Feature', bugfix: 'Fix', initial: 'Initial' };

    const latest = versions[0];
    const latestCl = parseChangelog(latest.description);

    const hero = h('div', { className: 'dp-panel', style: { marginBottom: '20px' } });
    hero.innerHTML = `
      <div class="dp-panel-head">
        <div style="display:flex;align-items:baseline;gap:12px">
          <h3 style="margin:0;font-family:var(--font-mono);font-size:var(--fs-20);font-weight:500">v${esc(latest.version)}</h3>
          <span class="dp-tag ${typeTone(latest.type)}">${esc(typeLabel[latest.type] || latest.type)}</span>
        </div>
        <span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${esc(fmtTime(latest.released_at))}</span>
      </div>
      <div class="dp-panel-body pad" style="padding:18px 20px">
        <div style="font-size:var(--fs-15);color:var(--text);font-weight:500;margin-bottom:10px;line-height:1.4">
          ${esc(latestCl.summary || '(no summary)')}
        </div>
        ${latestCl.changes.length ? `
          <ul style="margin:8px 0 0;padding-left:18px;color:var(--text-2);font-size:var(--fs-13);line-height:1.7">
            ${latestCl.changes.map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
    root.appendChild(hero);

    // Release history — paginated, 20 cards per page (BP Media style).
    const PAGE_SIZE = 20;
    const rest = versions.slice(1);  // skip the hero latest
    const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
    if (state.versionsPage >= totalPages) state.versionsPage = 0;
    const start = state.versionsPage * PAGE_SIZE;
    const slice = rest.slice(start, start + PAGE_SIZE);

    const list = h('div');
    slice.forEach(v => {
      const cl = parseChangelog(v.description);
      const card = h('div', { className: 'dp-panel', style: { marginBottom: '12px' } });
      card.innerHTML = `
        <div class="dp-panel-head">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span class="mono" style="font-weight:500;color:var(--text)">v${esc(v.version)}</span>
            <span class="dp-tag ${typeTone(v.type)}">${esc(typeLabel[v.type] || v.type)}</span>
          </div>
          <span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${esc(fmtTime(v.released_at))}</span>
        </div>
        <div class="dp-panel-body pad" style="padding:12px 16px">
          <div style="font-size:var(--fs-13);color:var(--text);margin-bottom:${cl.changes.length ? '8px' : '0'}">
            ${esc(cl.summary || v.description || '—')}
          </div>
          ${cl.changes.length ? `
            <ul style="margin:0;padding-left:18px;color:var(--text-2);font-size:var(--fs-12);line-height:1.65">
              ${cl.changes.map(c => `<li>${esc(c)}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      `;
      list.appendChild(card);
    });
    root.appendChild(list);

    if (rest.length > PAGE_SIZE) {
      const pager = h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', padding: '12px 0', fontSize: '12px', color: 'var(--text-3)' } });
      const p = state.versionsPage;
      pager.innerHTML = `
        <button class="dp-btn dp-btn-secondary dp-btn-sm" ${p === 0 ? 'disabled' : ''} onclick="DP._verPage(-1)">← Prev</button>
        <span style="margin:0 10px;font-family:var(--font-mono)">${p + 1} / ${totalPages}</span>
        <button class="dp-btn dp-btn-secondary dp-btn-sm" ${p >= totalPages - 1 ? 'disabled' : ''} onclick="DP._verPage(1)">Next →</button>
      `;
      root.appendChild(pager);
    }

    // Version format guide (BP Media-style aa.bbb.cc)
    const guide = h('div', { className: 'dp-panel', style: { marginTop: '20px' } });
    guide.innerHTML = `
      <div class="dp-panel-head"><h3>Version number rules</h3></div>
      <div class="dp-panel-body pad" style="padding:16px 20px">
        <table style="width:100%;border-collapse:collapse;font-size:var(--fs-13)">
          <tr>
            <td style="width:70px;font-family:var(--font-mono);font-weight:500;color:var(--navy);padding:6px 0;vertical-align:top">aa</td>
            <td style="padding:6px 0"><strong>Major</strong> — set manually by the project owner. Represents a full redesign or major milestone.</td>
          </tr>
          <tr>
            <td style="font-family:var(--font-mono);font-weight:500;color:var(--navy);padding:6px 0;vertical-align:top">bbb</td>
            <td style="padding:6px 0"><strong>Feature</strong> — bumped when a new feature is added or an existing one is significantly changed. <code>cc</code> resets to <code>00</code>.</td>
          </tr>
          <tr>
            <td style="font-family:var(--font-mono);font-weight:500;color:var(--navy);padding:6px 0;vertical-align:top">cc</td>
            <td style="padding:6px 0"><strong>Fix</strong> — bumped for bug fixes and hotfixes.</td>
          </tr>
        </table>
      </div>
    `;
    root.appendChild(guide);
  }
  function _openVersionEditor() {
    _openModal(
      'Log version',
      `
      <div class="dp-field">
        <label>Type</label>
        <select class="dp-select" id="dp-v-type">
          <option value="feature">feature — bumps bbb, resets cc to 00</option>
          <option value="bugfix">bugfix — bumps cc</option>
        </select>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Description <span style="font-weight:400;color:var(--text-3);margin-left:4px">(BP Media format: summary on line 1, bullets after)</span></label>
        <textarea class="dp-textarea" id="dp-v-desc" rows="8" placeholder="One-line summary (user perspective, what changed and why).
- Concrete change 1 with file / module reference
- Concrete change 2, with numbers where possible
- Version transition, e.g. v01.042.05 → v01.042.06"></textarea>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveVersion()">Save</button>`
    );
  }
  function _verPage(delta) {
    state.versionsPage = Math.max(0, (state.versionsPage || 0) + delta);
    navigate('versions');
  }

  async function _saveVersion() {
    const type = $('#dp-v-type').value;
    const description = ($('#dp-v-desc').value || '').trim();
    if (!description) { toast('Description is required', 'err'); return; }
    const data = await api('POST', 'versions', { type, description });
    if (data) {
      toast('v' + data.version + ' logged', 'ok');
      state.latestVersion = data.version;
      const el = $('#dp-side-ver'); if (el) el.textContent = 'v' + data.version;
      _closeModal();
      navigate('versions');
    }
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
  function _openModal(title, bodyHtml, footButtons, opts) {
    _closeModal();
    const wide = opts && opts.wide;
    const backdrop = h('div', { className: 'dp-modal-backdrop', id: 'dp-modal-backdrop', onclick: _closeModal });
    const modal = h('aside', {
      className: 'dp-modal' + (wide ? ' dp-modal-wide' : ''),
      id: 'dp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    });
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
        <div class="dp-file-list">
          ${(p.files || []).map(f => {
            const isImg = !!f.is_image;
            const ext = (f.file_name || '').split('.').pop().toLowerCase().slice(0, 6);
            return `
              <div class="dp-file-item">
                <span aria-hidden="true">${isImg ? '🖼' : '📎'}</span>
                <span class="name" title="${esc(f.file_name)}">${esc(f.file_name)}</span>
                <span class="size">${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ext.toUpperCase()}</span>
                <a class="dp-btn dp-btn-secondary dp-btn-sm" href="${esc(f.file_url)}"
                   download="${esc(f.file_name)}" target="_blank" rel="noopener"
                   style="text-decoration:none;padding:0 10px">Download</a>
              </div>
            `;
          }).join('')}
        </div>
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

    // Edit gate is permissive on the client — the real authz is on the
    // server (PUT /posts?id rejects 403 if the caller isn't admin/author).
    // Here we just gate the *button* so the UI doesn't pretend the action
    // is missing for people who have it. Match against uid OR display_name
    // because the earlier prod schema stored only author_name on some rows.
    const isAdmin = state.user && state.user.role === 'admin';
    const mine = state.user && (
      (p.author_id && Number(p.author_id) === Number(state.user.uid)) ||
      (p.author_name && _displayName() && p.author_name === _displayName())
    );
    const canEdit = !!(isAdmin || mine);
    const canDelete = !!isAdmin;

    _openModal(
      p.title || '(Untitled)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dp-tag neutral">${esc(p.board)}</span>
        <span>by <strong style="color:var(--text-2)">${esc(p.author_name || '')}</strong></span>
        <span>·</span>
        <span class="mono">${esc(fmtTime(p.created_at))}</span>
        ${p.approval_status ? `<span>·</span><span class="dp-tag ${approvalTone}">${esc(p.approval_status)}</span>` : ''}
        <span style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;color:var(--text-2);font-weight:500">
          <span aria-hidden="true">👁</span>
          <span style="font-variant-numeric:tabular-nums">${Number(p.view_count || 0)}</span>
          <span>views</span>
        </span>
      </div>
      ${_sanitize(p.content || '')}
      ${filesHtml}
      ${approvalsHtml}
      ${historyHtml}
      <div id="dp-comments-section" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:10px">Comments</div>
        <div id="dp-comments-list" style="color:var(--text-3);font-size:12px">Loading comments…</div>
        <div style="margin-top:14px;display:flex;gap:8px;align-items:flex-end">
          <textarea class="dp-textarea" id="dp-comment-input"
                    placeholder="Write a comment…" style="min-height:70px;flex:1"></textarea>
          <button class="dp-btn dp-btn-primary" onclick="DP._postComment(${Number(p.id)})">Post</button>
        </div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${canEdit ? `<button class="dp-btn dp-btn-secondary" onclick="DP._editPost('${esc(p.board)}', ${Number(p.id)})">Edit</button>` : ''}
       ${canDelete ? `<button class="dp-btn dp-btn-danger" onclick="DP._deletePost('${esc(p.board)}', ${Number(p.id)})">Delete</button>` : ''}
       ${_canVoteOnPost(p) ? `<button class="dp-btn dp-btn-danger" onclick="DP._inlineReject(${Number(p.id)})">Reject</button>
                              <button class="dp-btn dp-btn-primary" onclick="DP._inlineApprove(${Number(p.id)})">Approve</button>` : ''}`
    );

    // Load comments async (don't block the initial paint)
    _loadComments(Number(p.id));
  }

  // Can the *current user* cast an Approve/Reject vote on this post?
  // Rule: post is 'pending' AND the user's display_name/username appears in
  // dp_post_approvals with status='pending'. We read p.approvals (server
  // returns it on GET /posts?id=) and compare case-insensitively.
  function _canVoteOnPost(p) {
    if (!p || p.approval_status !== 'pending') return false;
    if (!Array.isArray(p.approvals) || !p.approvals.length) return false;
    const me = [_displayName(), state.user && state.user.username]
      .filter(Boolean).map(s => String(s).toLowerCase());
    return p.approvals.some(a =>
      a.status === 'pending' &&
      a.approver_name &&
      me.indexOf(String(a.approver_name).toLowerCase()) >= 0
    );
  }

  async function _loadComments(postId) {
    const host = $('#dp-comments-list');
    if (!host) return;
    const data = await api('GET', 'comments?post_id=' + postId);
    if (!data) return;
    const comments = (data.comments || []);
    if (!comments.length) {
      host.innerHTML = '<div style="color:var(--text-3);font-size:12px">No comments yet. Be the first.</div>';
      return;
    }
    const isAdmin = state.user && state.user.role === 'admin';
    host.innerHTML = comments.map(c => {
      const mine = c.author_id === (state.user && state.user.uid);
      const canDelete = isAdmin || mine;
      return `
        <div style="padding:10px 12px;border:var(--bd);border-radius:var(--r-sm);margin-bottom:6px;background:var(--g-050)">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;font-size:11px;color:var(--text-3);margin-bottom:4px">
            <span><strong style="color:var(--text-2);font-weight:500">${esc(c.author_name || 'Anon')}</strong>
                  <span class="mono" style="margin-left:6px">${esc(fmtTime(c.created_at))}</span></span>
            ${canDelete ? `<button type="button" class="dp-btn dp-btn-ghost dp-btn-sm" style="padding:0 6px;font-size:11px"
                                   onclick="DP._deleteComment(${Number(c.id)}, ${postId})">Delete</button>` : ''}
          </div>
          <div style="font-size:var(--fs-13);color:var(--text);white-space:pre-wrap">${esc(c.content || '')}</div>
        </div>
      `;
    }).join('');
  }

  async function _postComment(postId) {
    const input = $('#dp-comment-input');
    const content = (input && input.value || '').trim();
    if (!content) { toast('Comment cannot be empty', 'err'); return; }
    const data = await api('POST', 'comments', { post_id: postId, content });
    if (data) {
      if (input) input.value = '';
      _loadComments(postId);
    }
  }

  async function _deleteComment(id, postId) {
    if (!confirm('Delete this comment?')) return;
    const data = await api('DELETE', 'comments?id=' + Number(id));
    if (data) _loadComments(postId);
  }

  // -------------------------- Post edit + delete --------------------------
  // [CASE STUDY — PUT /posts?id requires edit_note]
  // Server rejects PUT without a non-empty edit_note (audit trail rule).
  // Collect it via a small prompt-like UI inside the editor modal.
  async function _editPost(board, postId) {
    const data = await api('GET', 'posts?id=' + Number(postId));
    if (!data || !data.post) { toast('Post not found', 'err'); return; }
    const p = data.post;
    _pickerFiles = (p.files || []).map(f => ({
      id: _fileId(),
      url: f.file_url,
      name: f.file_name,
      type: f.file_type,
      size: f.file_size,
      is_image: f.is_image ? 1 : 0,
      state: 'uploaded',
    }));

    const toolbarBtns = [
      { cmd: 'bold', icon: 'bold' }, { cmd: 'italic', icon: 'italic' },
      { sep: true },
      { cmd: 'h2', label: 'H2' }, { cmd: 'h3', label: 'H3' },
      { sep: true },
      { cmd: 'bulletList', icon: 'list-ul' }, { cmd: 'orderedList', label: '1.' },
      { cmd: 'blockquote', label: '❝' }, { cmd: 'insertTable', label: '⊞' },
      { cmd: 'insertImage', icon: 'scroll' },
    ];
    const toolbar = toolbarBtns.map(b => {
      if (b.sep) return '<span class="dp-te-sep" aria-hidden="true"></span>';
      const inner = b.icon
        ? `<span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/${esc(b.icon)}.svg')"></span>`
        : `<span>${esc(b.label)}</span>`;
      return `<button type="button" class="dp-te-btn" data-cmd="${esc(b.cmd)}"
                       onmousedown="event.preventDefault();DP._execTiptapCmd('${esc(b.cmd)}')">${inner}</button>`;
    }).join('');

    _openModal(
      'Edit post',
      `
      <div class="dp-field">
        <label for="dp-edit-title">Title</label>
        <input class="dp-input" id="dp-edit-title" value="${esc(p.title || '')}">
      </div>
      <div class="dp-field">
        <label>Content</label>
        <div class="dp-te-wrapper">
          <div class="dp-te-toolbar" role="toolbar" aria-label="Editor">${toolbar}</div>
          <div class="dp-te-editor" id="dp-tt-post"></div>
        </div>
      </div>
      <div class="dp-field">
        <label>Attachments <span id="dp-file-used" style="font-weight:400;color:var(--text-3);margin-left:6px">${_pickerFiles.length} / ${MAX_FILES} files · ${_fmtSize(_totalFileBytes())} / 100 MB</span></label>
        <div class="dp-file-picker">
          <input type="file" id="dp-edit-files" multiple style="display:none" onchange="DP._handlePickerChange(this)">
          <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm" onclick="document.getElementById('dp-edit-files').click()">
            <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath-v2/icons/plus.svg')"></span>
            <span>Add file</span>
          </button>
        </div>
        <div class="dp-file-list" id="dp-file-list"></div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label for="dp-edit-note">Edit note <span style="color:var(--alert);font-weight:400;margin-left:4px">(required)</span></label>
        <input class="dp-input" id="dp-edit-note" placeholder="Why this change?" maxlength="500">
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" id="dp-edit-save" onclick="DP._saveEditPost('${esc(board)}', ${Number(postId)})">Save</button>`,
      { wide: true }
    );
    _waitForTiptap(() => _initTiptap('dp-tt-post', p.content || ''));
    _renderFileList();
  }

  async function _saveEditPost(board, postId) {
    const btn = $('#dp-edit-save');
    const title = ($('#dp-edit-title').value || '').trim();
    const editNote = ($('#dp-edit-note').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    if (!editNote) { toast('Edit note is required', 'err'); $('#dp-edit-note').focus(); return; }
    const content = _getTiptapHTML();

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const files = await _uploadPending();
    if (files === null) { if (btn) { btn.disabled = false; btn.textContent = 'Save'; } return; }
    const data = await api('PUT', 'posts?id=' + Number(postId), { title, content, files, edit_note: editNote });
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    if (data) {
      toast('Saved', 'ok');
      _closeModal();
      navigate(state.page);
    }
  }

  async function _deletePost(board, postId) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const data = await api('DELETE', 'posts?id=' + Number(postId));
    if (data) {
      toast('Post deleted', 'ok');
      _closeModal();
      navigate(state.page === 'home' ? 'home' : board);
    }
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
  // viewTask/viewNote live above with real API wiring.

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

  // =========================================================
  // Search modal — unified cross-surface search (posts/tasks/notes/contacts)
  // Replaces the old ⌘K palette entrypoint. Real search uses /api/dreampath/search
  // =========================================================
  let _searchSeq = 0;
  function openSearch() {
    _openModal('', `
      <div class="dp-search-input-row">
        <span class="ico" aria-hidden="true" style="width:14px;height:14px;background-color:var(--text-3);-webkit-mask:url('/img/dreampath-v2/icons/search.svg') center/14px no-repeat;mask:url('/img/dreampath-v2/icons/search.svg') center/14px no-repeat"></span>
        <input type="text" id="dp-search-box" placeholder="Type to search — posts, tasks, notes, events, contacts…" autocomplete="off">
        <kbd style="font-family:var(--font-mono);font-size:10px;border:var(--bd);padding:1px 5px;border-radius:var(--r-sm);background:var(--g-100);color:var(--text-3)">ESC</kbd>
      </div>
      <div class="dp-search-results" id="dp-search-results">
        <div style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:12px">Start typing to search…</div>
      </div>
    `, '');
    // Swap the generic modal shell for search-modal styling
    const m = $('#dp-modal');
    if (m) m.classList.add('dp-search-modal');
    // Hide the modal head + foot (we use input row as the head and results are inline)
    const hd = m && m.querySelector('.dp-modal-head'); if (hd) hd.style.display = 'none';
    const ft = m && m.querySelector('.dp-modal-foot'); if (ft) ft.style.display = 'none';

    setTimeout(() => { const i = $('#dp-search-box'); if (i) i.focus(); }, 40);
    const input = $('#dp-search-box');
    input.addEventListener('input', () => _runSearch(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = $('.dp-search-hit');
        if (first) first.click();
      }
    });
  }

  async function _runSearch(q) {
    const seq = ++_searchSeq;
    const host = $('#dp-search-results');
    if (!host) return;
    const query = String(q || '').trim();
    if (!query) {
      host.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:12px">Start typing to search…</div>';
      return;
    }
    host.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px">Searching…</div>';
    const data = await api('GET', 'search?q=' + encodeURIComponent(query));
    if (seq !== _searchSeq) return;  // stale response
    if (!data) return;
    const results = (data.results || []);
    if (!results.length) {
      host.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:12px">No results.</div>';
      return;
    }
    const buckets = { post: [], comment: [], task: [], note: [], event: [], contact: [] };
    results.forEach(r => {
      const k = r.kind || 'post';
      if (buckets[k]) buckets[k].push(r);
      else (buckets.post = buckets.post || []).push(r);
    });
    const order = ['post', 'task', 'note', 'event', 'comment', 'contact'];
    const label = { post: 'Posts', comment: 'Comments', task: 'Tasks', note: 'Notes', event: 'Events', contact: 'Contacts' };
    let html = '';
    order.forEach(k => {
      const list = buckets[k];
      if (!list || !list.length) return;
      html += `<div class="dp-search-group"><div class="dp-search-group-label">${esc(label[k] || k)} · ${list.length}</div>`;
      list.slice(0, 8).forEach(r => {
        const kindAttr = esc(k);
        const idAttr = Number(r.id || r.ref_id || 0);
        html += `<button type="button" class="dp-search-hit"
                  onclick="DP._searchOpen('${kindAttr}', ${idAttr}, '${esc(r.board || '')}')">
          <span class="kind">${esc(k)}</span>
          <div class="body">
            <div class="title">${esc(r.title || '(untitled)')}</div>
            ${r.subtitle || r.meta ? `<div class="meta">${esc(r.subtitle || r.meta)}</div>` : ''}
          </div>
          <div class="meta-ts">${r.created_at ? esc(fmtDate(r.created_at)) : ''}</div>
        </button>`;
      });
      html += '</div>';
    });
    host.innerHTML = html;
  }

  function _searchOpen(kind, id, board) {
    _closeModal();
    if (kind === 'post' || kind === 'comment') {
      viewPost(board || 'announcements', Number(id));
    } else if (kind === 'task')   { navigate('tasks'); setTimeout(() => viewTask(Number(id)), 80); }
    else if (kind === 'note')    { navigate('notes'); setTimeout(() => viewNote(Number(id)), 80); }
    else if (kind === 'event')   { navigate('calendar'); setTimeout(() => _calEventClick(Number(id)), 80); }
    else if (kind === 'contact') { navigate('contacts'); }
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
       <button class="dp-btn dp-btn-primary" id="dp-new-save" onclick="DP._saveNewPost()">Publish</button>`,
      { wide: true }
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
    _voteApproval, _inlineApprove, _inlineReject,
    _execTiptapCmd, _handlePickerChange, _removeFile,
    _openPostEditor, _saveNewPost, _closeModal,
    _openTaskEditor, _saveNewTask, _taskTransition,
    _openNoteEditor, _saveNewNote, _resolveNote,
    _openVersionEditor, _saveVersion,
    _calDayClick, _calEventClick,
    _editPost, _saveEditPost, _deletePost,
    _postComment, _deleteComment,
    _openUserEditor, _saveUser, _deleteUser,
    _openPresetEditor, _savePreset, _deletePreset,
    _openContactEditor, _saveContact, _deleteContact, _filterContacts,
    openSearch, _searchOpen,
    _verPage,
    _openBoardManager, _openBoardEditor, _saveNewBoard, _deleteBoard,
    _openDepartmentEditor, _saveDepartment, _deleteDepartment,
    _scrollToRule, _scrollToAnchor,
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
