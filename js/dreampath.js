// =====================================================================
// Dreampath v2 — single IIFE module (DREAMPATH.md Section 2)
//
// [CASE STUDY 2026-04-24 — IIFE boundary is load-bearing]
// The inline onclick="DP.*()" pattern depends on a single classic-script
// IIFE exposing DP via `window.DP`. Do NOT convert to ES modules or split
// files — see DREAMPATH.md Section 2.1 and the matching comment in
// /dreampath production bundle.
//
// [CASE STUDY 2026-04-24 — /dreampath CSP allowlist]
// This route depends on functions/_middleware.js isLegacyInlinePath()
// including "/dreampath". Removing that line reproduces the total
// sidebar outage from 2026-04-24 · A instantly. The older /dreampath-v2
// staging alias was retired in v01.054.
//
// [CASE STUDY 2026-04-24 — user.name may be missing]
// Legacy /dreampath sessions left localStorage.dp_user lacking a `name`
// field. Always go through _displayName()/_avatarChar() helpers instead
// of reading state.user.name directly.
// =====================================================================

// Boot probe — if present, page renders in-place error instead of blank.
try {
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
    density: localStorage.getItem('dp_density') || 'default',
    contrast: localStorage.getItem('dp_contrast') || 'standard',
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
        { id: 'decisions',     label: 'Decision Log',     icon: 'target',    perm: 'view:notes' },
        { id: 'risks',         label: 'Risk Register',    icon: 'target',    perm: 'view:notes' },
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
           { id: 'activity',  label: 'Activity log',  icon: 'scroll' },
           { id: 'rules',     label: 'Dev Rules',     icon: 'layers' },
           { id: 'versions',  label: 'Versions',      icon: 'file-text' }]
        : (isAdmin
          ? [{ id: 'activity',  label: 'Activity log',  icon: 'scroll' }]
              .concat(guard([
                { id: 'rules',    label: 'Dev Rules',     icon: 'layers',    perm: 'view:rules' },
                { id: 'versions', label: 'Versions',      icon: 'file-text', perm: 'view:versions' },
              ]))
          : guard([
              { id: 'rules',    label: 'Dev Rules',     icon: 'layers',    perm: 'view:rules' },
              { id: 'versions', label: 'Versions',      icon: 'file-text', perm: 'view:versions' },
            ])
        )
      )},
      // Personal is always shown — every user can edit their own profile.
      { title: 'Personal', items: [
        { id: 'account', label: 'Account', icon: 'user-single' },
      ]},
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
  function _boardHint(board) {
    const slug = board && board.slug;
    if (slug === 'announcements') return 'Notice board';
    if (slug === 'documents') return 'Document archive';
    if (slug === 'minutes') return 'Meeting minutes with approvals';
    if (board && board.board_type === 'team') return 'Team workspace';
    return 'Project board';
  }
  function _jsArg(value) {
    return JSON.stringify(String(value == null ? '' : value)).replace(/</g, '\\u003c');
  }

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
  const icon = (name) => `<span class="ico" aria-hidden="true" style="--dp-icon:url('/img/dreampath/icons/${name}.svg')"></span>`;

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
        t.Underline,
        t.Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
        t.Highlight.configure({ multicolor: true }),
        t.TextAlign.configure({ types: ['heading', 'paragraph'] }),
        t.Subscript,
        t.Superscript,
        t.TaskList,
        t.TaskItem.configure({ nested: true }),
        t.HorizontalRule,
        t.TextStyle,
        t.Color,
        t.Typography,
        t.Placeholder.configure({ placeholder: 'Write something…' }),
        t.CharacterCount,
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
      // Simple marks / nodes
      if      (cmd === 'bold')          active = _tiptapEditor.isActive('bold');
      else if (cmd === 'italic')        active = _tiptapEditor.isActive('italic');
      else if (cmd === 'underline')     active = _tiptapEditor.isActive('underline');
      else if (cmd === 'strike')        active = _tiptapEditor.isActive('strike');
      else if (cmd === 'code')          active = _tiptapEditor.isActive('code');
      else if (cmd === 'codeBlock')     active = _tiptapEditor.isActive('codeBlock');
      else if (cmd === 'highlight')     active = _tiptapEditor.isActive('highlight');
      else if (cmd === 'subscript')     active = _tiptapEditor.isActive('subscript');
      else if (cmd === 'superscript')   active = _tiptapEditor.isActive('superscript');
      else if (cmd === 'h1')            active = _tiptapEditor.isActive('heading', { level: 1 });
      else if (cmd === 'h2')            active = _tiptapEditor.isActive('heading', { level: 2 });
      else if (cmd === 'h3')            active = _tiptapEditor.isActive('heading', { level: 3 });
      else if (cmd === 'paragraph')     active = _tiptapEditor.isActive('paragraph');
      else if (cmd === 'bulletList')    active = _tiptapEditor.isActive('bulletList');
      else if (cmd === 'orderedList')   active = _tiptapEditor.isActive('orderedList');
      else if (cmd === 'taskList')      active = _tiptapEditor.isActive('taskList');
      else if (cmd === 'blockquote')    active = _tiptapEditor.isActive('blockquote');
      else if (cmd === 'insertTable')   active = _tiptapEditor.isActive('table');
      else if (cmd === 'alignLeft')     active = _tiptapEditor.isActive({ textAlign: 'left' });
      else if (cmd === 'alignCenter')   active = _tiptapEditor.isActive({ textAlign: 'center' });
      else if (cmd === 'alignRight')    active = _tiptapEditor.isActive({ textAlign: 'right' });
      else if (cmd === 'alignJustify')  active = _tiptapEditor.isActive({ textAlign: 'justify' });
      else if (cmd === 'link')          active = _tiptapEditor.isActive('link');
      btn.classList.toggle('is-active', active);
    });
    // Character-count readout so long posts don't balloon silently. Free
    // extension exposes .storage.characterCount.characters(). 50k is the
    // posts.js content slice cap.
    const cEl = document.getElementById('dp-te-charcount');
    if (cEl && _tiptapEditor.storage && _tiptapEditor.storage.characterCount) {
      const ch = _tiptapEditor.storage.characterCount.characters();
      cEl.textContent = ch.toLocaleString() + ' / 50,000';
      cEl.style.color = ch > 45_000 ? 'var(--alert)' : 'var(--text-3)';
    }
  }

  function _execTiptapCmd(cmd) {
    if (!_tiptapEditor) return;
    const c = _tiptapEditor.chain().focus();
    // Marks
    if      (cmd === 'bold')          c.toggleBold().run();
    else if (cmd === 'italic')        c.toggleItalic().run();
    else if (cmd === 'underline')     c.toggleUnderline().run();
    else if (cmd === 'strike')        c.toggleStrike().run();
    else if (cmd === 'code')          c.toggleCode().run();
    else if (cmd === 'highlight')     c.toggleHighlight().run();
    else if (cmd === 'subscript')     c.toggleSubscript().run();
    else if (cmd === 'superscript')   c.toggleSuperscript().run();
    // Blocks
    else if (cmd === 'paragraph')     c.setParagraph().run();
    else if (cmd === 'h1')            c.toggleHeading({ level: 1 }).run();
    else if (cmd === 'h2')            c.toggleHeading({ level: 2 }).run();
    else if (cmd === 'h3')            c.toggleHeading({ level: 3 }).run();
    else if (cmd === 'bulletList')    c.toggleBulletList().run();
    else if (cmd === 'orderedList')   c.toggleOrderedList().run();
    else if (cmd === 'taskList')      c.toggleTaskList().run();
    else if (cmd === 'blockquote')    c.toggleBlockquote().run();
    else if (cmd === 'codeBlock')     c.toggleCodeBlock().run();
    else if (cmd === 'horizontalRule') c.setHorizontalRule().run();
    else if (cmd === 'hardBreak')     c.setHardBreak().run();
    // Alignment
    else if (cmd === 'alignLeft')     c.setTextAlign('left').run();
    else if (cmd === 'alignCenter')   c.setTextAlign('center').run();
    else if (cmd === 'alignRight')    c.setTextAlign('right').run();
    else if (cmd === 'alignJustify')  c.setTextAlign('justify').run();
    // Undo / redo
    else if (cmd === 'undo')          c.undo().run();
    else if (cmd === 'redo')          c.redo().run();
    // Link — prompt for URL on apply, unset on toggle-off
    else if (cmd === 'link') {
      const prev = _tiptapEditor.getAttributes('link').href;
      const url = prompt('URL', prev || 'https://');
      if (url === null) return;        // cancel
      if (url === '')   { _tiptapEditor.chain().focus().unsetLink().run(); return; }
      _tiptapEditor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    // Color — simple prompt (hex); cleared when blank. Avoids shipping a
    // bulky color-picker library.
    else if (cmd === 'color') {
      const cur = _tiptapEditor.getAttributes('textStyle').color || '';
      const v = prompt('Text color (hex e.g. #146E7A, leave blank to clear)', cur);
      if (v === null) return;
      if (v === '') _tiptapEditor.chain().focus().unsetColor().run();
      else          _tiptapEditor.chain().focus().setColor(v).run();
    }
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

  // Toolbar spec shared by New Post + Edit Post editors. Exposes every free
  // Tiptap extension we loaded: marks (bold/italic/underline/strike/code/
  // highlight/sub/super), headings, lists (bullet/ordered/task), blocks
  // (blockquote, codeBlock, HR), alignment, link, image, table, color,
  // undo/redo. Each entry is either { cmd, label|icon, title } or { sep: true }.
  const _TIPTAP_TOOLBAR = [
    { cmd: 'undo',          label: '↶',          title: 'Undo (⌘Z)' },
    { cmd: 'redo',          label: '↷',          title: 'Redo (⌘⇧Z)' },
    { sep: true },
    { cmd: 'paragraph',     label: '¶',          title: 'Paragraph' },
    { cmd: 'h1',            label: 'H1',         title: 'Heading 1' },
    { cmd: 'h2',            label: 'H2',         title: 'Heading 2' },
    { cmd: 'h3',            label: 'H3',         title: 'Heading 3' },
    { sep: true },
    { cmd: 'bold',          icon: 'bold',        title: 'Bold (⌘B)' },
    { cmd: 'italic',        icon: 'italic',      title: 'Italic (⌘I)' },
    { cmd: 'underline',     label: 'U',          title: 'Underline (⌘U)' },
    { cmd: 'strike',        label: 'S',          title: 'Strikethrough' },
    { cmd: 'code',          label: '</>',        title: 'Inline code' },
    { cmd: 'highlight',     label: '▪',          title: 'Highlight' },
    { cmd: 'superscript',   label: 'x²',         title: 'Superscript' },
    { cmd: 'subscript',     label: 'x₂',         title: 'Subscript' },
    { sep: true },
    { cmd: 'alignLeft',     label: '⯇',          title: 'Align left' },
    { cmd: 'alignCenter',   label: '⯀',          title: 'Align center' },
    { cmd: 'alignRight',    label: '⯈',          title: 'Align right' },
    { cmd: 'alignJustify',  label: '≡',          title: 'Justify' },
    { sep: true },
    { cmd: 'bulletList',    icon: 'list-ul',     title: 'Bulleted list' },
    { cmd: 'orderedList',   label: '1.',         title: 'Numbered list' },
    { cmd: 'taskList',      label: '☑',          title: 'Task list' },
    { cmd: 'blockquote',    label: '❝',          title: 'Quote' },
    { cmd: 'codeBlock',     label: '{;}',        title: 'Code block' },
    { cmd: 'horizontalRule', label: '―',         title: 'Horizontal rule' },
    { sep: true },
    { cmd: 'link',          label: '🔗',         title: 'Link' },
    { cmd: 'color',         label: '🎨',         title: 'Text color' },
    { cmd: 'insertTable',   label: '⊞',          title: 'Table' },
    { cmd: 'insertImage',   icon: 'scroll',      title: 'Image' },
  ];

  function _renderTiptapToolbar() {
    return _TIPTAP_TOOLBAR.map(b => {
      if (b.sep) return '<span class="dp-te-sep" aria-hidden="true"></span>';
      const inner = b.icon
        ? `<span class="ico" style="--dp-icon:url('/img/dreampath/icons/${esc(b.icon)}.svg')"></span>`
        : `<span>${esc(b.label)}</span>`;
      return `<button type="button" class="dp-te-btn" data-cmd="${esc(b.cmd)}" title="${esc(b.title || b.cmd)}"
                       onmousedown="event.preventDefault();DP._execTiptapCmd('${esc(b.cmd)}')">${inner}</button>`;
    }).join('');
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
  function _decodeApprovalActor(value) {
    if (!value) return '';
    try { return decodeURIComponent(String(value)); } catch (_) { return String(value); }
  }
  function _myLowerNames() {
    return [
      String(_displayName() || '').toLowerCase(),
      String((state.user && state.user.username) || '').toLowerCase(),
    ].filter(Boolean);
  }
  function _myApprovalForPost(post) {
    if (!post || !Array.isArray(post.approvals)) return null;
    const names = _myLowerNames();
    return post.approvals.find(a => names.indexOf(String(a.approver_name || '').toLowerCase()) >= 0) || null;
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

  // Date helpers. SQLite's datetime('now') stores UTC in "YYYY-MM-DD HH:MM:SS"
  // format with NO timezone indicator. Passing that string to new Date()
  // interprets it as LOCAL, which silently shifts every stored timestamp by
  // the user's offset (e.g. "10:30 UTC" rendered as "10:30 KST" = wrong by
  // 9 hours). We normalize here: if the string looks like a DB timestamp,
  // we append 'Z' before parsing so the Date carries real UTC instant, then
  // let the browser format it in the local timezone (KST in Korea, etc.).
  function _toDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    let s = String(d).trim();
    if (!s) return null;
    // Already ISO-8601 with timezone? Keep as-is.
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
    if (!hasTz) {
      // Convert "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ" (UTC).
      s = s.replace(' ', 'T');
      if (!/[Zz+]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const fmtDate = (d) => {
    const dt = _toDate(d);
    if (!dt) return '';
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  };
  const _MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDateShort = (d) => {
    const dt = _toDate(d);
    if (!dt) return '';
    return _MONTH_SHORT[dt.getMonth()] + ' ' + dt.getDate();
  };
  const fmtTime = (iso) => {
    const dt = _toDate(iso);
    if (!dt) return '';
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
    // Theme: light | dark | system. Persisted in localStorage, applied to <html>.
    const savedTheme = localStorage.getItem('dp_theme') || 'light';
    state.theme = ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'light';
    if (state.theme !== 'light') document.documentElement.setAttribute('data-theme', state.theme);
    // Reapply any local design-token overrides set via Dev Rules → Design Guide.
    _applyStoredDesignOverrides();

    _installKeyDelegation();
    _installCmdHotkey();

    const saved = localStorage.getItem('dp_user');
    if (saved) { try { state.user = JSON.parse(saved); } catch (_) {} }

    if (!_hasSessionCookie() && !state.user) {
      _renderLogin();
      return;
    }

    // [CASE STUDY 2026-04-24 — cold-boot permission race]
    //   Previously painted the shell from cached `dp_user` in localStorage and
    //   fetched `/me` in the background. For pre-Phase-5 cached users the
    //   `permissions` array was missing, and `_hasPerm` denies by default, so
    //   the sidebar flashed with every nav item hidden for a few hundred ms
    //   until `/me` returned. Now we always wait for `/me` (and boards) to
    //   complete before mounting the shell. A lightweight boot splash covers
    //   the delay; if the wait exceeds a couple hundred ms the user sees a
    //   "Loading…" label instead of a broken-looking sidebar.
    _renderBootSplash();
    const [, me] = await Promise.all([_refreshBoards(), api('GET', 'me')]);
    if (!me || !me.user) {
      _renderLogin();
      return;
    }
    _acceptUser(me.user);
    if (me.session_expires_at) {
      state.sessionExpiresAt = Number(me.session_expires_at);
    }
    _mountShell();
    navigate('home');
    _startSessionTicker();
    _startNotifPolling();
    _refreshLatestVersion();
  }

  function _renderBootSplash() {
    const root = document.getElementById('dp-root');
    if (!root) return;
    root.innerHTML = `
      <div style="display:grid;place-items:center;min-height:100vh;background:var(--g-050);color:var(--text-3);font-size:13px;font-family:var(--font)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
          <div style="width:2px;height:2px;"></div>
          <div class="dp-thread" style="width:120px"></div>
          <span>Loading Dreampath…</span>
        </div>
      </div>
    `;
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

  // Preset-gated page access. Admins bypass. Non-admins need "view:<page>" or
  // "write:<page>" in their preset's permissions array.
  //
  // [CASE STUDY 2026-04-24 — deny-by-default]
  //   Earlier version returned `true` for every "view:*" when a member had no
  //   preset_id. That fallback leaked full read access whenever an owner
  //   created a user and forgot to pick a preset. Migration 060 now
  //   back-fills Viewer for every member missing a preset, and this helper
  //   denies by default so a transient /me race no longer exposes pages it
  //   shouldn't. Admin role still bypasses.
  function _hasPerm(scope) {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    const perms = Array.isArray(state.user.permissions) ? state.user.permissions : [];
    return perms.includes(scope);
  }
  function _canView(page)  { return _hasPerm('view:'  + page); }
  function _canWrite(page) { return _hasPerm('write:' + page); }

  async function _refreshSelf() {
    const data = await api('GET', 'me');
    if (data && data.user) _acceptUser(data.user);
    if (data && data.session_expires_at) {
      state.sessionExpiresAt = Number(data.session_expires_at);
      _startSessionTicker();
    }
  }

  // Live session countdown using the JWT's exp claim returned by /me. Ticks
  // V1-style session timer — 1-hour idle window, localStorage-backed so a
  // reload preserves the countdown (matches production /dreampath behavior).
  // Activity (click/keydown/scroll) extends. At <5min we open a modal asking
  // "extend 1 hour?"; a click Yes calls /me and resets. At 0 we logout.
  const _SESSION_DURATION_MS = 60 * 60 * 1000;   // 1 hour
  const _SESSION_WARNING_MS  = 5  * 60 * 1000;   // 5-min warning
  const _SESSION_EXPIRY_KEY  = 'dp_session_expires_at';
  let _sessionTickTimer = null;
  let _sessionPromptShown = false;

  function _getSessionExpiry() {
    try {
      const raw = localStorage.getItem(_SESSION_EXPIRY_KEY);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_) { return 0; }
  }
  function _setSessionExpiry(ms) {
    try { localStorage.setItem(_SESSION_EXPIRY_KEY, String(ms)); } catch (_) {}
  }
  function _clearSessionExpiry() {
    try { localStorage.removeItem(_SESSION_EXPIRY_KEY); } catch (_) {}
  }
  function _bumpSessionExpiry(force) {
    const now = Date.now();
    const exp = _getSessionExpiry();
    if (!exp || exp <= now) return;
    if (force || (exp - now) < _SESSION_DURATION_MS / 2) {
      _setSessionExpiry(now + _SESSION_DURATION_MS);
      _sessionPromptShown = false;
    }
  }
  function _fmtRemaining(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function _startSessionTicker() {
    if (_sessionTickTimer) clearInterval(_sessionTickTimer);
    // Initialize expiry if not set — first login, or post-reload without any
    // stored expiry. Use a fresh 1-hour window.
    if (!_getSessionExpiry()) _setSessionExpiry(Date.now() + _SESSION_DURATION_MS);
    const tick = () => {
      const el = $('#dp-session-left');
      const row = $('#dp-session-row');
      const exp = _getSessionExpiry();
      if (!exp) return;
      const remaining = exp - Date.now();
      if (el) el.textContent = _fmtRemaining(remaining);
      if (row) row.classList.toggle('is-warning', remaining <= _SESSION_WARNING_MS && remaining > 0);

      if (remaining <= 0) {
        clearInterval(_sessionTickTimer);
        _sessionTickTimer = null;
        _clearSessionExpiry();
        toast('Session expired. Signing out.', 'err');
        setTimeout(() => logout(), 1200);
        return;
      }
      if (remaining <= _SESSION_WARNING_MS && !_sessionPromptShown) {
        _sessionPromptShown = true;
        _openSessionExtendPrompt();
      }
    };
    tick();
    _sessionTickTimer = setInterval(tick, 1000);
    _installSessionActivityExtension();
  }

  let _activityBound = false;
  function _installSessionActivityExtension() {
    if (_activityBound) return;
    _activityBound = true;
    // Click/touch should feel immediate: each explicit pointer interaction
    // refreshes the idle window back to a full hour. Lower-signal activity
    // like scroll/keydown stays throttled so we don't spam localStorage.
    let lastPassive = 0;
    const onPassiveActivity = () => {
      const now = Date.now();
      if (now - lastPassive < 15_000) return;  // 15-second cool-down
      lastPassive = now;
      _bumpSessionExpiry(false);
    };
    const onClickActivity = () => _bumpSessionExpiry(true);
    ['click', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, onClickActivity, { passive: true, capture: true })
    );
    ['keydown', 'scroll'].forEach(ev =>
      window.addEventListener(ev, onPassiveActivity, { passive: true, capture: true })
    );
  }

  function _openSessionExtendPrompt() {
    _openModal(
      'Session ending soon',
      `<p style="margin:0;font-size:14px;line-height:1.65;color:var(--text-2)">
         Your session will expire in less than 5 minutes. Extend it by 1 hour?
       </p>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Let it expire</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._extendSession()">Extend 1 hour</button>`
    );
  }

  async function _extendSession() {
    // Verify the server session is still valid — /me 401 means we already
    // lost the cookie so extending client-only would be a lie.
    const data = await api('GET', 'me');
    if (!data) { _closeModal(); return; }
    _setSessionExpiry(Date.now() + _SESSION_DURATION_MS);
    _sessionPromptShown = false;
    _closeModal();
    toast('Session extended for 1 hour.', 'ok');
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
      const t = e.target;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.isContentEditable === true));
      // ⌘K / Ctrl+K — global full-text SEARCH (posts/tasks/notes/events/contacts).
      // This was previously bound to the "jump to page" command palette, but
      // users expect ⌘K to mean search across industry-standard apps. The
      // old nav palette is now reachable via ⌘⇧P (uncommon, power users only).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSearch();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        openCmd();
        return;
      }
      // "/" opens search when not typing in a field (GitHub-style).
      if (e.key === '/' && !inField) {
        e.preventDefault();
        openSearch();
        return;
      }
      // ESC closes overlays. Draft prompt first (nested), then cmd palette,
      // then modal via the soft close that offers to save a draft.
      if (e.key === 'Escape') {
        if ($('#dp-draft-prompt')) { _draftPromptCancel(); return; }
        if ($('#dp-cmd-backdrop')) closeCmd();
        if ($('#dp-modal-backdrop')) _requestCloseModal();
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
          h('img', { src: '/img/dreampath/logo-mark.svg', alt: 'DreamPath' }),
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
    document.title = 'Dreampath PMO — Sign in';
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
    // Fresh 1-hour session starts on every successful login.
    _setSessionExpiry(Date.now() + _SESSION_DURATION_MS);
    await _refreshBoards();
    _mountShell();
    navigate('home');
    _startSessionTicker();
    _startNotifPolling();
  }

  async function logout() {
    try {
      await fetch('/api/dreampath/auth', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
    } catch (_) {}
    try { localStorage.removeItem('dp_user'); } catch (_) {}
    if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
    _clearSessionExpiry();
    if (_sessionTickTimer) { clearInterval(_sessionTickTimer); _sessionTickTimer = null; }
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
    _mountTopFab();
  }

  // Floating back-to-top button appears on every page once the user scrolls
  // past 400px. Scroll listener is passive (doesn't block touch scroll).
  function _mountTopFab() {
    if (document.getElementById('dp-top-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'dp-top-fab';
    btn.type = 'button';
    btn.className = 'dp-top-fab';
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.title = 'Scroll to top';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);
    const onScroll = () => btn.classList.toggle('on', (window.scrollY || document.documentElement.scrollTop || 0) > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
        <img src="/img/dreampath/logo-mark.svg" alt="" aria-hidden="true">
        <div class="wm">
          <strong>Dreampath</strong>
          <span>PMO Portal</span>
        </div>
      </div>
      <nav class="dp-side-nav" aria-label="Main navigation">
        ${nav}
      </nav>
      <div class="dp-side-foot">
        <div class="dp-side-session" id="dp-session-row">
          <span>Session</span><strong id="dp-session-left">--:--</strong>
        </div>
        <div class="dp-side-version">
          <a href="#" onclick="event.preventDefault();DP.navigate('versions')" title="Version history">
            <span>Version</span>
          </a>
          <span class="dp-ver-num" id="dp-side-ver">v${esc(state.latestVersion || state.version)}</span>
        </div>
        <div class="dp-side-user" role="button" tabindex="0"
             title="Open account settings"
             onclick="DP.navigate('account')"
             style="cursor:pointer">
          <div class="dp-avatar"${state.user && state.user.avatar_url
            ? ` style="background-image:url('${esc(state.user.avatar_url)}');background-size:cover;background-position:center"`
            : ''}>${state.user && state.user.avatar_url ? '' : esc(_avatarChar())}</div>
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
        <span class="ico" style="--dp-icon:url('/img/dreampath/icons/list-ul.svg')"></span>
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
      <div class="dp-switcher" role="group" aria-label="Color theme">
        <button type="button" data-theme-choice="light"  onclick="DP.setTheme('light')"  title="Light theme">Light</button>
        <button type="button" data-theme-choice="dark"   onclick="DP.setTheme('dark')"   title="Dark theme">Dark</button>
        <button type="button" data-theme-choice="system" onclick="DP.setTheme('system')" title="Follow OS setting">Auto</button>
      </div>
      <label class="dp-search" onclick="DP.openSearch()">
        <span class="dp-sr-only">Search</span>
        <input type="search" id="dp-search-input" placeholder="Search posts, tasks, notes, contacts…"
               readonly onfocus="DP.openSearch();this.blur();" aria-label="Search">
        <kbd>⌘K</kbd>
      </label>
      <button type="button" class="dp-iconbtn" id="dp-notif-btn" aria-label="Notifications" onclick="DP.openNotifs()">
        <span class="ico" style="--dp-icon:url('/img/dreampath/icons/bell.svg')"></span>
        <span class="dot" id="dp-notif-dot" aria-hidden="true" style="display:none"></span>
        <span class="dp-notif-count" id="dp-notif-count" aria-hidden="true" style="display:none"></span>
      </button>
      <button type="button" class="dp-btn dp-btn-primary" onclick="DP.openCreate()">
        <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath/icons/plus.svg')"></span>
        <span>New</span>
      </button>
    `;
    _updateDensityUI();
    _updateThemeUI();
    return bar;
  }

  function _updateDensityUI() {
    $$('.dp-switcher [data-density]').forEach(b => {
      b.classList.toggle('on', b.dataset.density === state.density);
    });
  }

  function setDensity(d) {
    state.density = d;
    localStorage.setItem('dp_density', d);
    if (d === 'default') document.documentElement.removeAttribute('data-density');
    else document.documentElement.setAttribute('data-density', d);
    _updateDensityUI();
  }

  // Theme: light / dark / system (follows OS via prefers-color-scheme).
  // Persists to localStorage so the preference sticks across sessions, and
  // applies immediately to <html> so every page switches in one repaint.
  function setTheme(t) {
    const theme = ['light', 'dark', 'system'].includes(t) ? t : 'light';
    state.theme = theme;
    localStorage.setItem('dp_theme', theme);
    if (theme === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    _updateThemeUI();
  }
  function _updateThemeUI() {
    document.querySelectorAll('[data-theme-choice]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-theme-choice') === state.theme);
    });
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
      decisions:     () => { _renderDecisions(pageEl);     label = 'Decision Log'; },
      risks:         () => { _renderRisks(pageEl);         label = 'Risk Register'; },
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
      activity:      () => {
        if (!state.user || state.user.role !== 'admin') { _renderHome(pageEl); label = 'Home'; state.page = 'home'; return; }
        _renderActivityLog(pageEl); label = 'Activity log';
      },
      account:       () => { _renderAccount(pageEl); label = 'Account'; },
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
    // Board preview cards (PMO spec "Layout Draft 1") — 3 latest from each board.
    // Fetched in parallel so they don't block the primary paint.
    // Skip entirely for boards the user can't view, so members with a Viewer
    // preset don't see an empty placeholder panel (would look broken).
    const docMinutesHost = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--gap-section)' } });
    const canDocs    = _canView('documents');
    const canMinutes = _canView('minutes');
    if (canDocs || canMinutes) left.appendChild(docMinutesHost);
    Promise.all([
      canDocs    ? _rawApi('GET', 'posts?board=documents&limit=3') : Promise.resolve(null),
      canMinutes ? _rawApi('GET', 'posts?board=minutes&limit=3')   : Promise.resolve(null),
    ]).then(([docsRes, minutesRes]) => {
      if (canDocs) {
        const posts = (docsRes && docsRes.ok && docsRes.data && docsRes.data.posts) || [];
        docMinutesHost.appendChild(_renderBoardPreviewPanel('Documents', 'documents', posts));
      }
      if (canMinutes) {
        const posts = (minutesRes && minutesRes.ok && minutesRes.data && minutesRes.data.posts) || [];
        docMinutesHost.appendChild(_renderBoardPreviewPanel('Meeting Minutes', 'minutes', posts));
      }
    });
    // Activity feed stays on home only for admins — regular members get a
    // quieter home and the admin-only "Activity log" page for the full audit trail.
    if (state.user && state.user.role === 'admin') {
      left.appendChild(_renderActivityPanel((home && home.recent_changes) || []));
    }

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
    // pending_approvals items: { post_id, approver_name, title, board, post_created_at }
    // B5 contract — each row offers TWO actions:
    //   Review   → open full post detail modal (user may also approve there)
    //   Approve  → inline vote via /api/dreampath/approvals without leaving home
    const rows = list.slice(0, 5).map(a => {
      const pid = Number(a.post_id) || 0;
      const approverName = encodeURIComponent(String(a.approver_name || ''));
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
                    onclick="DP._inlineApprove(${pid}, '${approverName}')">Approve</button>
          </div>
        </div>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${rows}</div>`;
    return panel;
  }

  // B5 inline vote — works from two entry points:
  //   1. Home "Pending your approval" list (no modal open)
  //   2. Post detail modal "Your vote" banner (modal is open)
  // When a modal is open we re-open the same post so the user sees their
  // updated vote banner immediately. Otherwise we just refresh the list.
  async function _inlineApprove(postId, approverName) {
    if (!postId) return;
    const approver = encodeURIComponent(_decodeApprovalActor(approverName) || _displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'approved' });
    if (!data) return;
    toast('Approved', 'ok');
    state.homePayload = await api('GET', 'home');
    const modalOpen = !!document.getElementById('dp-modal');
    if (modalOpen) { _closeModal(); viewPost('minutes', postId); }
    else navigate(state.page);
  }
  async function _inlineReject(postId, approverName) {
    if (!postId) return;
    if (!confirm('Reject this post? Author will need to revise.')) return;
    const approver = encodeURIComponent(_decodeApprovalActor(approverName) || _displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'rejected' });
    if (!data) return;
    toast('Rejected', 'ok');
    state.homePayload = await api('GET', 'home');
    const modalOpen = !!document.getElementById('dp-modal');
    if (modalOpen) { _closeModal(); viewPost('minutes', postId); }
    else navigate(state.page);
  }

  // Revert my vote back to pending — used when a user hits "Change" on the
  // Your-vote banner after already voting. Same PUT endpoint, status='pending'.
  async function _revertMyVote(postId, approverName) {
    if (!postId) return;
    if (!confirm('Reset your vote back to pending? You can then vote again.')) return;
    const approver = encodeURIComponent(_decodeApprovalActor(approverName) || _displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'pending' });
    if (data) {
      toast('Vote reset — cast your decision again.', 'ok');
      state.homePayload = await api('GET', 'home');
      // Re-open the same post so the banner updates and voting buttons return.
      _closeModal();
      // Find board from current state if rendering list, otherwise reload.
      viewPost('minutes', postId);
    }
  }

  // Compact board preview — used on home for Documents + Minutes per PMO spec.
  // Shows 3 most recent posts from the board; click row → post detail modal.
  function _renderBoardPreviewPanel(title, board, posts) {
    const panel = h('section', { className: 'dp-panel', 'aria-label': title + ' preview' });
    const head = `
      <div class="dp-panel-head">
        <h3>${esc(title)} <span class="count">${posts.length}</span></h3>
        <a href="#" onclick="event.preventDefault();DP.navigate('${esc(board)}')">View all →</a>
      </div>
    `;
    if (!posts.length) {
      panel.innerHTML = head + '<div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">No posts yet.</div>';
      return panel;
    }
    // Minutes never uses pin/notice — sort by time only, and skip the NOTICE
    // badge entirely. Other boards keep the pin-first ordering.
    const isMinutesPreview = board === 'minutes';
    const ordered = isMinutesPreview
      ? posts.slice()
      : posts.slice().sort((a, b) => Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0));
    const body = ordered.slice(0, 3).map(p => {
      const showPin = !isMinutesPreview && p.pinned;
      const pinCls = showPin ? ' dp-post-pinned' : '';
      const statusTag = (board === 'minutes' && p.approval_status)
        ? `<span class="dp-tag ${p.approval_status === 'approved' ? 'ok' : p.approval_status === 'pending' ? 'warn' : p.approval_status === 'rejected' ? 'alert' : 'neutral'}" style="margin-left:6px">${esc(p.approval_status)}</span>`
        : '';
      return `
        <button type="button" class="dp-post-item${pinCls}"
                onclick="DP.viewPost('${esc(board)}', ${Number(p.id)})"
                aria-label="${esc(p.title)}">
          <div class="t">
            ${showPin ? '<span class="dp-badge-notice" aria-label="Notice">NOTICE</span>' : ''}
            <span>${esc(p.title)}</span>${statusTag}
          </div>
          <div class="meta">
            <span class="who">${esc(p.author_name || '')}</span>
            <span>·</span>
            <span>${esc(fmtTime(p.updated_at || p.created_at))}</span>
            ${p.comment_count ? `<span>·</span><span>${p.comment_count} comments</span>` : ''}
          </div>
        </button>
      `;
    }).join('');
    panel.innerHTML = head + `<div class="dp-panel-body">${body}</div>`;
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
    const isAdminUser = state.user && state.user.role === 'admin';
    // Sub-tabs are only meaningful for non-core boards (team_*, custom).
    const supportsTabs = !['announcements', 'documents', 'minutes'].includes(key);
    if (!state.boardTab) state.boardTab = {};
    const activeTab = state.boardTab[key] || '';  // '' = "All"

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('h1', {}, label),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openPostEditor(key, activeTab) }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
          h('span', {}, ' New post'),
        ]),
      ]),
    ]));

    // Tab bar — always rendered for tab-supporting boards (Default pill is
    // always visible so the user knows where "unfiled" posts live). Admin
    // sees inline "+" at the end and per-tab edit button on hover.
    //
    // UI rules per 2026-04-24 spec:
    //   · Default = virtual tab for tab_slug = NULL. Pinned leftmost, never
    //     draggable, never deletable, never editable.
    //   · Non-Default tabs are drag-reorderable (admin only).
    //   · "+" button next to last tab opens the editor directly. Capped at 5
    //     non-default tabs.
    let tabs = [];
    if (supportsTabs) {
      const tabsRes = await api('GET', 'board-tabs?board=' + encodeURIComponent(key)).catch(() => null);
      tabs = (tabsRes && tabsRes.tabs) || [];
      const bar = h('div', { className: 'dp-board-tabs', role: 'tablist', 'data-board': key });
      const parts = [];
      // "All" pill — activeTab === '' means no tab filter (every post in the
       // board shows up, including ones that haven't been assigned to a tab).
       // 2026-04-24 owner spec renamed this from "Default" to "All" since the
       // pill shows the whole board, not just the unfiled bucket.
      {
        const on = activeTab === '';
        parts.push(`
          <button type="button" class="dp-board-tab dp-board-tab-default${on ? ' on' : ''}" role="tab"
                  aria-selected="${on ? 'true' : 'false'}"
                  onclick="DP._setBoardTab('${esc(key)}','')"
                  title="Every post in this board (across all tabs)">
            All
          </button>
        `);
      }
      // User tabs — draggable (admin). Each shows inline edit icon on hover.
      tabs.forEach(t => {
        const on = t.slug === activeTab;
        const dragAttr = isAdminUser ? 'draggable="true"' : '';
        parts.push(`
          <div class="dp-board-tab-wrap" data-slug="${esc(t.slug)}" ${dragAttr}
               ${isAdminUser ? `ondragstart="DP._tabDragStart(event,'${esc(t.slug)}')"
                                ondragover="DP._tabDragOver(event)"
                                ondragleave="DP._tabDragLeave(event)"
                                ondrop="DP._tabDrop(event,'${esc(key)}','${esc(t.slug)}')"` : ''}>
            <button type="button" class="dp-board-tab${on ? ' on' : ''}" role="tab"
                    aria-selected="${on ? 'true' : 'false'}"
                    onclick="DP._setBoardTab('${esc(key)}','${esc(t.slug)}')">
              ${esc(t.title)}
            </button>
            ${isAdminUser
              ? `<button type="button" class="dp-board-tab-edit" title="Edit tab"
                         onclick="event.stopPropagation();DP._openTabEditor('${esc(key)}', ${Number(t.id)})">⋯</button>`
              : ''}
          </div>
        `);
      });
      // "+" button — admin, only if under the 5-tab cap.
      if (isAdminUser && tabs.length < 5) {
        parts.push(`
          <button type="button" class="dp-board-tab dp-board-tab-add"
                  title="Add a new tab (max 5)"
                  onclick="DP._openTabEditor('${esc(key)}', 0)">+</button>
        `);
      } else if (isAdminUser && tabs.length >= 5) {
        parts.push(`
          <span class="dp-board-tab-cap" title="Maximum 5 tabs reached">5 / 5</span>
        `);
      }
      bar.innerHTML = parts.join('');
      root.appendChild(bar);
    }

    // Search + sort toolbar — sits between the tab bar and the post table.
    // Mount first (above loadingPanel) so it stays on-screen while the post
    // fetch is in flight; inputs hold the last query so typing a refinement
    // doesn't flash-reset. Defined once here; state is read back from
    // state.boardQuery[pageKey] after _renderBoard captures the key below.
    const toolbar = h('div', { className: 'dp-board-toolbar' });
    toolbar.id = 'dp-board-toolbar';
    root.appendChild(toolbar);

    const loadingPanel = h('div', { className: 'dp-panel' });
    loadingPanel.innerHTML = `<div class="dp-panel-body pad" style="color:var(--text-3)">Loading ${esc(label)}…</div>`;
    root.appendChild(loadingPanel);

    // 20 posts / page per 2026-04-24 owner spec. Page index is per-board and
    // resets to 0 when user switches tab (handled in _setBoardTab).
    const PAGE_SIZE = 20;
    if (!state.boardPage) state.boardPage = {};
    const pageKey = key + ':' + (activeTab || '__all');
    const page = state.boardPage[pageKey] || 0;

    // Per-board search + sort state. Lives per pageKey so flipping tabs
    // doesn't carry over the last search automatically. Defaults: no query,
    // all fields selected, sort by updated desc.
    if (!state.boardQuery) state.boardQuery = {};
    if (!state.boardQuery[pageKey]) {
      state.boardQuery[pageKey] = { q: '', fields: { title: true, content: true, author: true }, sortBy: 'updated', sortDir: 'desc' };
    }
    const query = state.boardQuery[pageKey];
    const fields = [];
    if (query.fields.title)   fields.push('title');
    if (query.fields.content) fields.push('content');
    if (query.fields.author)  fields.push('author');

    // Fetch posts scoped to the active tab (or entire board when activeTab=='').
    // `count=1` asks the server for total so we can render numbered pagination.
    // Paint the search/sort toolbar now that we have pageKey + query.
    toolbar.innerHTML = `
      <div class="dp-board-search">
        <input type="search" class="dp-input dp-input-sm" id="dp-board-q"
               value="${esc(query.q || '')}" placeholder="Search posts…"
               oninput="DP._boardSearchInput('${esc(pageKey)}', this.value)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();DP._boardSearchApply('${esc(pageKey)}');}">
        <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                onclick="DP._boardSearchApply('${esc(pageKey)}')">Search</button>
        ${query.q ? `<button type="button" class="dp-btn dp-btn-ghost dp-btn-sm"
                              onclick="DP._boardSearchClear('${esc(pageKey)}')">Clear</button>` : ''}
      </div>
      <div class="dp-board-search-opts">
        <span class="dp-board-search-opts-label">Fields:</span>
        <label><input type="checkbox" ${query.fields.title   ? 'checked' : ''} onchange="DP._boardSearchField('${esc(pageKey)}','title',this.checked)"> Title</label>
        <label><input type="checkbox" ${query.fields.content ? 'checked' : ''} onchange="DP._boardSearchField('${esc(pageKey)}','content',this.checked)"> Content</label>
        <label><input type="checkbox" ${query.fields.author  ? 'checked' : ''} onchange="DP._boardSearchField('${esc(pageKey)}','author',this.checked)"> Author</label>
      </div>
      <div class="dp-board-sort">
        <span class="dp-board-search-opts-label">Sort:</span>
        <select class="dp-select dp-select-sm" onchange="DP._boardSortBy('${esc(pageKey)}', this.value)">
          <option value="updated"  ${query.sortBy === 'updated'  ? 'selected' : ''}>Updated</option>
          <option value="created"  ${query.sortBy === 'created'  ? 'selected' : ''}>Created</option>
          <option value="comments" ${query.sortBy === 'comments' ? 'selected' : ''}>Comments</option>
          <option value="author"   ${query.sortBy === 'author'   ? 'selected' : ''}>Author</option>
        </select>
        <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                title="Toggle direction"
                onclick="DP._boardSortDir('${esc(pageKey)}')">${query.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>
    `;

    const qs = 'posts?board=' + encodeURIComponent(key)
      + '&limit=' + PAGE_SIZE
      + '&offset=' + (page * PAGE_SIZE)
      + '&count=1'
      + (activeTab ? '&tab=' + encodeURIComponent(activeTab) : '')
      + (query.q ? '&q=' + encodeURIComponent(query.q) : '')
      + (fields.length ? '&search_in=' + fields.join(',') : '')
      + '&sort_by=' + encodeURIComponent(query.sortBy)
      + '&sort_dir=' + encodeURIComponent(query.sortDir);
    const res = await _rawApi('GET', qs);
    loadingPanel.remove();

    if (res.status === 401) { _renderLogin(); return; }
    if (res.status === 403) {
      const denied = h('div', { className: 'dp-empty' });
      denied.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/x.svg')"></span></div>
        <h4>Access denied</h4>
        <p>You do not have permission to view this board.</p>
      `;
      root.appendChild(denied);
      return;
    }
    if (!res.ok) {
      const err = h('div', { className: 'dp-empty' });
      err.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/x.svg')"></span></div>
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/file-text.svg')"></span></div>
        <h4>No posts yet</h4>
        <p>Create the first one for ${esc(label)}.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openPostEditor('${esc(key)}')">+ New post</button>
      `;
      root.appendChild(empty);
      return;
    }

    const isMinutes = (key === 'minutes');

    // [CASE STUDY 2026-04-24 — approver gating + 3-state Your-vote column]
    // Originally only showed Approve/Reject buttons when user was a pending
    // approver, and "—" otherwise — which made voted-but-locked posts and
    // "not-an-approver" posts look identical. Now we fetch the user's full
    // approval history once via /approvals?mine=1 and map each post to one
    // of three states: "can vote", "voted:<status>", or "not an approver".
    let myPendingSet = _myPendingApprovalSet();
    let myApprovalMap = null;
    if (isMinutes) {
      if (!myPendingSet) {
        const h2 = await api('GET', 'home');
        if (h2) state.homePayload = h2;
        myPendingSet = _myPendingApprovalSet();
      }
      const mineRes = await api('GET', 'approvals?mine=1').catch(() => null);
      myApprovalMap = new Map((mineRes && mineRes.approvals || []).map(a => [Number(a.post_id), a]));
    }

    const canManageBoard = (state.user && state.user.role === 'admin') && !isMinutes;
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
    // Minutes deliberately opt out of the pin/notice concept — 2026-04-24
    // owner spec: Minutes use the approver notification flow instead of
    // "Notice" pins. Keep the DB column but skip the pinning UI on that board.
    if (!isMinutes) {
      roots.sort((a, b) => Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0));
    }

    const isAdmin = state.user && state.user.role === 'admin';
    function renderPostRow(p, depth) {
      const pinned = !isMinutes && !!p.pinned;
      const hidden = !!p.is_hidden;          // only present for admin; others never see the row
      const notice = pinned ? '<span class="dp-badge-notice" aria-label="Notice">NOTICE</span>' : '';
      const blindedTag = hidden ? '<span class="dp-tag neutral" style="margin-left:6px;opacity:0.8">Blinded</span>' : '';
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
      const titleCell = `${indent}${notice}${esc(p.title)}${blindedTag}${childTag}`;

      // Pin class only applies to top-level rows — a reply under a pinned
      // notice should not itself be tinted navy.
      // Hidden posts (admin-only view) override with grey styling so it's
      // immediately obvious they're blinded from everyone else.
      const pinClass = (pinned && depth === 0) ? 'dp-row-pinned' : '';
      const hiddenClass = hidden ? 'dp-row-hidden' : '';

      // Admin management flag — gates the leading checkbox on each row.
      // Per-row action buttons were removed 2026-04-24 per owner spec: the
      // bulk action bar that appears when at least one row is checked is the
      // sole path for hide / unhide / move-to-tab on team boards.
      const canManage = isAdmin && !isMinutes;

      if (isMinutes) {
        const s = p.approval_status || 'draft';
        const tone = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : s === 'rejected' ? 'alert' : 'neutral';
        const statusCls = s === 'approved' ? 'dp-row-approved'
                       : s === 'pending'  ? 'dp-row-pending'
                       : s === 'rejected' ? 'dp-row-rejected' : '';
        const rowClass = [pinClass, statusCls, hiddenClass].filter(Boolean).join(' ');
        // Three-state "Your vote" cell:
        //   a) I am a pending approver on this post → render Approve/Reject buttons
        //   b) I voted already (approved/rejected) → show my result chip
        //   c) I am not on the approvers list → explicit "Not an approver" label
        //      so the column isn't ambiguous (prior "—" covered b & c together)
        const myApproval = myApprovalMap && myApprovalMap.get(Number(p.id));
        const canVote = s === 'pending' && myPendingSet && myPendingSet.has(Number(p.id));
        let voteCell;
        if (canVote) {
          voteCell = `
            <button type="button" class="dp-btn dp-btn-primary dp-btn-sm" onclick="event.stopPropagation();DP._inlineApprove(${Number(p.id)}, '${encodeURIComponent(String((myApproval && myApproval.approver_name) || ''))}')">Approve</button>
            <button type="button" class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="event.stopPropagation();DP._inlineReject(${Number(p.id)}, '${encodeURIComponent(String((myApproval && myApproval.approver_name) || ''))}')">Reject</button>`;
        } else if (myApproval && (myApproval.status === 'approved' || myApproval.status === 'rejected')) {
          const voteTone = myApproval.status === 'approved' ? 'ok' : 'alert';
          const voteIcon = myApproval.status === 'approved' ? '✓' : '✗';
          voteCell = `<span class="dp-tag ${voteTone}">${voteIcon} ${esc(myApproval.status)}</span>`;
        } else {
          voteCell = `<span style="color:var(--text-3);font-size:11px;font-style:italic">Not an approver</span>`;
        }
        return `<tr class="${rowClass}" onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
          <td>${titleCell}</td>
          <td>${esc(p.author_name || '')}</td>
          <td><span class="dp-tag ${tone}">${esc(s)}</span></td>
          <td style="white-space:nowrap">${voteCell}</td>
          <td class="mono">${p.comment_count || 0}</td>
          <td class="mono">${esc(ts)}</td>
        </tr>`;
      }
      const checkCell = canManage
        ? `<td style="width:32px" onclick="event.stopPropagation()"><input type="checkbox" class="dp-row-check" value="${Number(p.id)}" onchange="DP._onBulkCheck(this)"></td>`
        : '';
      return `<tr class="${[pinClass, hiddenClass].filter(Boolean).join(' ')}" onclick="DP.viewPost('${esc(key)}', ${Number(p.id)})">
        ${checkCell}
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

    // total comes from server when ?count=1 is set. Missing total → single page.
    const total = (res.data && typeof res.data.total === 'number') ? res.data.total : posts.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    // _buildPager wants a handler name; stash the current pageKey on module
    // state so _boardPage(n) can find it without re-encoding into the template.
    state.currentBoardPageKey = pageKey;
    const pagerHtml = totalPages > 1 ? _buildPager(page, totalPages, '_boardPage') : '';

    // Bulk-select action bar — admin only, non-minutes, only visible when at
    // least one post row has a checkbox. Persists across re-renders via
    // state.selectedPostIds[pageKey] so pagination doesn't clear the set.
    const showBulk = canManageBoard && rows.length > 0;
    const bulkBarHtml = showBulk ? `
      <div class="dp-bulkbar" id="dp-bulkbar" data-pagekey="${esc(pageKey)}" data-board="${esc(key)}" style="display:none">
        <span class="dp-bulkbar-count"><strong id="dp-bulkbar-n">0</strong> selected</span>
        <div class="dp-bulkbar-actions">
          <button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP._bulkMove('${esc(key)}')">Move to tab…</button>
          <button class="dp-btn dp-btn-danger dp-btn-sm"    onclick="DP._bulkSetHidden(1)">Hide</button>
          <button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP._bulkSetHidden(0)">Unhide</button>
          <button class="dp-btn dp-btn-ghost dp-btn-sm"     onclick="DP._bulkClear()">Clear</button>
        </div>
      </div>
    ` : '';

    // Header gets a "select-all on this page" checkbox when bulk is enabled.
    const headersWithCheck = showBulk
      ? '<th style="width:32px"><input type="checkbox" id="dp-bulk-selectall" onchange="DP._bulkToggleAll(this.checked)" aria-label="Select all"></th>' + headers
      : headers;

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>${esc(label)} <span class="count">${total}</span></h3>
        <span style="color:var(--text-3);font-size:11px">
          ${totalPages > 1 ? ('Page ' + (page + 1) + ' / ' + totalPages + ' · ') : ''}${posts.length} shown
        </span>
      </div>
      ${bulkBarHtml}
      <table class="dp-table">
        <thead><tr>${headersWithCheck}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${pagerHtml}
    `;
    root.appendChild(panel);

    // Restore prior selection + wire row-level handlers.
    if (showBulk) _restoreBulkSelection(pageKey);
  }

  // -------------------------- Board search + sort --------------------------
  // All handlers key off pageKey (board + tab) because the toolbar in
  // _renderBoard stamps that onto every onclick/onchange.
  function _boardQuery(pageKey) {
    if (!state.boardQuery) state.boardQuery = {};
    if (!state.boardQuery[pageKey]) {
      state.boardQuery[pageKey] = { q: '', fields: { title: true, content: true, author: true }, sortBy: 'updated', sortDir: 'desc' };
    }
    return state.boardQuery[pageKey];
  }
  function _boardSearchInput(pageKey, value) {
    // Live-track the value but don't re-render until Enter / Search button
    // so every keystroke doesn't trigger a D1 round-trip.
    _boardQuery(pageKey).q = String(value || '');
  }
  function _boardSearchApply(pageKey) {
    if (state.boardPage) state.boardPage[pageKey] = 0;  // new search → page 1
    navigate(state.page);
  }
  function _boardSearchClear(pageKey) {
    const q = _boardQuery(pageKey);
    q.q = '';
    if (state.boardPage) state.boardPage[pageKey] = 0;
    navigate(state.page);
  }
  function _boardSearchField(pageKey, field, checked) {
    const q = _boardQuery(pageKey);
    q.fields[field] = !!checked;
    // Only trigger a new fetch if the user has an active search — toggling
    // fields with an empty query is a silent config change.
    if (q.q) { state.boardPage[pageKey] = 0; navigate(state.page); }
  }
  function _boardSortBy(pageKey, value) {
    const q = _boardQuery(pageKey);
    q.sortBy = String(value || 'updated').toLowerCase();
    if (state.boardPage) state.boardPage[pageKey] = 0;
    navigate(state.page);
  }
  function _boardSortDir(pageKey) {
    const q = _boardQuery(pageKey);
    q.sortDir = q.sortDir === 'asc' ? 'desc' : 'asc';
    if (state.boardPage) state.boardPage[pageKey] = 0;
    navigate(state.page);
  }

  // Numbered pager hook. _buildPager calls DP._boardPage(idx) — we look up
  // the current pageKey from state so one handler serves every board/tab.
  function _boardPage(idx) {
    const pk = state.currentBoardPageKey;
    if (!pk) return;
    if (!state.boardPage) state.boardPage = {};
    state.boardPage[pk] = Math.max(0, Number(idx) || 0);
    navigate(state.page);
  }

  // =========================================================
  // BOARD SUB-TABS — /api/dreampath/board-tabs
  // =========================================================
  // Tab state lives on state.boardTab[board_slug] = active tab slug ('' = All).
  // Setting a new tab re-renders the current board; we don't touch the URL
  // because board navigation is SPA-style and the session is short-lived.
  function _setBoardTab(boardKey, tabSlug) {
    if (!state.boardTab) state.boardTab = {};
    state.boardTab[boardKey] = tabSlug || '';
    // Switching tabs reveals a different slice of posts; reset this tab's
    // page index AND clear any in-flight bulk selection since those IDs
    // belong to the previous view.
    if (state.boardPage) state.boardPage[boardKey + ':' + (tabSlug || '__all')] = 0;
    _bulkClear();
    // Re-navigate to the same page so _renderBoard fires with the new state.
    navigate(state.page);
  }

  // -------------------------- Bulk selection / actions --------------------------
  // Rendered on team boards for admins. Selection state is keyed by pageKey
  // (board + tab) so paginating doesn't clear picks made on previous pages.
  if (!state.bulkSelection) state.bulkSelection = {};

  function _bulkCurrentKey() {
    const bar = document.getElementById('dp-bulkbar');
    return bar ? bar.getAttribute('data-pagekey') : null;
  }
  function _bulkCurrentBoard() {
    const bar = document.getElementById('dp-bulkbar');
    return bar ? bar.getAttribute('data-board') : null;
  }
  function _bulkGetSet(key) {
    if (!state.bulkSelection[key]) state.bulkSelection[key] = new Set();
    return state.bulkSelection[key];
  }
  function _restoreBulkSelection(pageKey) {
    const set = _bulkGetSet(pageKey);
    document.querySelectorAll('.dp-row-check').forEach(cb => {
      cb.checked = set.has(Number(cb.value));
    });
    _updateBulkBar();
  }
  function _onBulkCheck(cb) {
    const key = _bulkCurrentKey();
    if (!key) return;
    const set = _bulkGetSet(key);
    const id = Number(cb.value);
    if (cb.checked) set.add(id); else set.delete(id);
    _updateBulkBar();
  }
  function _bulkToggleAll(checked) {
    const key = _bulkCurrentKey();
    if (!key) return;
    const set = _bulkGetSet(key);
    document.querySelectorAll('.dp-row-check').forEach(cb => {
      const id = Number(cb.value);
      cb.checked = checked;
      if (checked) set.add(id); else set.delete(id);
    });
    _updateBulkBar();
  }
  function _updateBulkBar() {
    const key = _bulkCurrentKey();
    const bar = document.getElementById('dp-bulkbar');
    const n = document.getElementById('dp-bulkbar-n');
    if (!bar || !n || !key) return;
    const count = _bulkGetSet(key).size;
    n.textContent = String(count);
    bar.style.display = count > 0 ? 'flex' : 'none';
  }
  function _bulkClear() {
    const key = _bulkCurrentKey();
    if (key && state.bulkSelection) state.bulkSelection[key] = new Set();
    document.querySelectorAll('.dp-row-check:checked').forEach(cb => { cb.checked = false; });
    const sa = document.getElementById('dp-bulk-selectall');
    if (sa) sa.checked = false;
    _updateBulkBar();
  }
  async function _bulkSetHidden(flag) {
    const key = _bulkCurrentKey();
    if (!key) return;
    const ids = Array.from(_bulkGetSet(key));
    if (!ids.length) return;
    if (flag && !confirm('Hide ' + ids.length + ' post' + (ids.length === 1 ? '' : 's') + '? They will be greyed for admins and invisible to everyone else.')) return;
    let ok = 0;
    for (const id of ids) {
      const res = await api('PUT', 'posts?id=' + id, { is_hidden: flag ? 1 : 0, edit_note: flag ? 'Bulk hide' : 'Bulk unhide' });
      if (res) ok += 1;
    }
    toast(ok + ' post' + (ok === 1 ? '' : 's') + ' ' + (flag ? 'hidden' : 'unhidden'), 'ok');
    _bulkClear();
    navigate(state.page);
  }
  async function _bulkMove(boardKey) {
    const key = _bulkCurrentKey();
    if (!key) return;
    const ids = Array.from(_bulkGetSet(key));
    if (!ids.length) return;
    const res = await api('GET', 'board-tabs?board=' + encodeURIComponent(boardKey)).catch(() => null);
    const tabs = (res && res.tabs) || [];
    const opts = ['<option value="">All (no tab)</option>']
      .concat(tabs.map(t => `<option value="${esc(t.slug)}">${esc(t.title)}</option>`))
      .join('');
    _openModal(
      'Move ' + ids.length + ' post' + (ids.length === 1 ? '' : 's') + ' to a tab',
      `
      <p style="margin-top:0;color:var(--text-3);font-size:12px">
        Moving is scoped to the current board. Cross-board moves are blocked.
      </p>
      <div class="dp-field">
        <label for="dp-bulk-move-tab">Target tab</label>
        <select class="dp-select" id="dp-bulk-move-tab">${opts}</select>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._bulkMoveConfirm()">Move</button>`
    );
  }
  async function _bulkMoveConfirm() {
    const sel = document.getElementById('dp-bulk-move-tab');
    const slug = sel ? sel.value : '';
    const key = _bulkCurrentKey();
    const ids = key ? Array.from(_bulkGetSet(key)) : [];
    if (!ids.length) { _closeModal(); return; }
    let ok = 0;
    for (const id of ids) {
      const res = await api('PUT', 'posts?id=' + id, { tab_slug: slug || null, edit_note: 'Bulk move to ' + (slug || 'All') });
      if (res) ok += 1;
    }
    toast(ok + ' post' + (ok === 1 ? '' : 's') + ' moved', 'ok');
    _closeModal();
    _bulkClear();
    navigate(state.page);
  }

  // Admin row action: hide or unhide a post. Hidden posts stay visible to
  // admins (greyed) but disappear from everyone else's list / detail view.
  // Server enforces the same rule — client gate is just UX.
  async function _togglePostHidden(postId, hiddenFlag) {
    const label = hiddenFlag ? 'Hide' : 'Unhide';
    if (hiddenFlag && !confirm('Hide this post? It will disappear for everyone except admins.')) return;
    const res = await api('PUT', 'posts?id=' + Number(postId), { is_hidden: hiddenFlag ? 1 : 0, edit_note: label });
    if (res) { toast(label + 'd', 'ok'); navigate(state.page); }
  }

  // Admin row action: move a single post between tabs within the same board.
  // Cross-board moves are forbidden by the server. We reuse _openModal for a
  // simple picker rather than a custom popover.
  async function _openMovePostMenu(postId, boardKey /*, anchorEl */) {
    const res = await api('GET', 'board-tabs?board=' + encodeURIComponent(boardKey)).catch(() => null);
    const tabs = (res && res.tabs) || [];
    const opts = ['<option value="">Default (no tab)</option>']
      .concat(tabs.map(t => `<option value="${esc(t.slug)}">${esc(t.title)}</option>`))
      .join('');
    _openModal(
      'Move post to a tab',
      `
      <p style="margin-top:0;color:var(--text-3);font-size:12px">
        Moving a post is scoped to the current board. Cross-board moves are blocked.
      </p>
      <div class="dp-field">
        <label for="dp-move-tab">Target tab</label>
        <select class="dp-select" id="dp-move-tab">${opts}</select>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._movePostConfirm(${Number(postId)})">Move</button>`
    );
  }
  async function _movePostConfirm(postId) {
    const sel = document.getElementById('dp-move-tab');
    const slug = sel ? sel.value : '';
    const body = { tab_slug: slug || null, edit_note: 'Moved to ' + (slug || 'Default') };
    const data = await api('PUT', 'posts?id=' + Number(postId), body);
    if (data) { toast('Post moved', 'ok'); _closeModal(); navigate(state.page); }
  }

  // Drag-to-reorder state — tracks the slug being dragged. Drop handler
   // computes the new order and fires the bulk reorder endpoint.
  let _tabDragSlug = null;
  function _tabDragStart(e, slug) {
    _tabDragSlug = slug;
    try { e.dataTransfer.setData('text/plain', slug); } catch (_) {}
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    const wrap = e.currentTarget;
    if (wrap && wrap.classList) wrap.classList.add('is-dragging');
  }
  function _tabDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const wrap = e.currentTarget;
    if (wrap && wrap.classList) wrap.classList.add('is-drop-target');
  }
  function _tabDragLeave(e) {
    const wrap = e.currentTarget;
    if (wrap && wrap.classList) wrap.classList.remove('is-drop-target');
  }
  async function _tabDrop(e, boardKey, targetSlug) {
    e.preventDefault();
    const wrap = e.currentTarget;
    if (wrap && wrap.classList) wrap.classList.remove('is-drop-target');
    const fromSlug = _tabDragSlug;
    _tabDragSlug = null;
    if (!fromSlug || fromSlug === targetSlug) return;
    // Current order = visible DOM slugs, then move fromSlug to targetSlug's index.
    const bar = document.querySelector('.dp-board-tabs[data-board="' + boardKey + '"]');
    if (!bar) return;
    const slugs = Array.from(bar.querySelectorAll('.dp-board-tab-wrap'))
      .map(n => n.getAttribute('data-slug'))
      .filter(Boolean);
    const fromIdx = slugs.indexOf(fromSlug);
    const toIdx = slugs.indexOf(targetSlug);
    if (fromIdx === -1 || toIdx === -1) return;
    slugs.splice(fromIdx, 1);
    slugs.splice(toIdx, 0, fromSlug);
    const res = await api('PUT', 'board-tabs?reorder=1', { board_slug: boardKey, slugs });
    if (res) { toast('Tab order saved', 'ok'); navigate(state.page); }
  }

  // Tab manager modal (admin only) — lists current tabs, adds new ones,
  // edits titles + per-tab write permissions, deletes.
  async function _openTabManager(boardKey, boardLabel) {
    const [tabsRes, usersRes] = await Promise.all([
      api('GET', 'board-tabs?board=' + encodeURIComponent(boardKey)),
      api('GET', 'users?picker=1').catch(() => null),
    ]);
    const tabs = (tabsRes && tabsRes.tabs) || [];
    const max  = (tabsRes && tabsRes.max)  || 5;
    _tabMgrRoster = (usersRes && usersRes.users) || [];

    const rows = tabs.map(t => {
      const count = Array.isArray(t.allowed_users) ? t.allowed_users.length : 0;
      const perm = t.allowed_users === null
        ? '<span class="dp-tag neutral">All team members</span>'
        : (count === 0
            ? '<span class="dp-tag warn">Admins only</span>'
            : `<span class="dp-tag info">${count} allowed</span>`);
      return `<tr>
        <td><strong>${esc(t.title)}</strong><div class="mono" style="font-size:11px;color:var(--text-3)">${esc(t.slug)}</div></td>
        <td>${perm}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP._openTabEditor('${esc(boardKey)}', ${Number(t.id)})">Edit</button>
          <button class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="DP._deleteTab('${esc(boardKey)}', ${Number(t.id)}, '${esc(t.title.replace(/'/g, "\\'"))}')">Delete</button>
        </td>
      </tr>`;
    }).join('');

    _openModal(
      'Tabs · ' + boardLabel,
      `
      <p style="margin:0 0 12px;color:var(--text-3);font-size:12px">
        Each board can have up to <strong>${max}</strong> sub-tabs. Posts stay
        inside their board — they can be moved between tabs here, but never
        across boards.
      </p>
      <table class="dp-table dp-table-uniform">
        <thead><tr><th>Tab</th><th style="width:180px">Write access</th><th style="width:160px;text-align:right">Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:var(--text-3);padding:24px">No tabs yet.</td></tr>'}</tbody>
      </table>
      ${tabs.length >= max
        ? '<p style="margin-top:14px;color:var(--text-3);font-size:12px">Limit reached — delete a tab before adding another.</p>'
        : ''}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${tabs.length < max
         ? `<button class="dp-btn dp-btn-primary" onclick="DP._openTabEditor('${esc(boardKey)}', 0)">+ New tab</button>`
         : ''}`,
      { wide: true }
    );
  }

  let _tabMgrRoster = [];
  let _tabEditorAllowed = [];  // picked usernames for tab's allowed_users
  let _tabEditorMode = 'all';  // 'all' | 'admins' | 'custom'

  async function _openTabEditor(boardKey, tabId) {
    let existing = null;
    if (tabId) {
      const res = await api('GET', 'board-tabs?board=' + encodeURIComponent(boardKey));
      existing = ((res && res.tabs) || []).find(t => Number(t.id) === Number(tabId));
      if (!existing) { toast('Tab not found', 'err'); return; }
    }
    const isEdit = !!existing;
    _tabEditorAllowed = [];
    _tabEditorMode = 'all';
    if (existing) {
      if (existing.allowed_users === null) _tabEditorMode = 'all';
      else if (!existing.allowed_users.length) _tabEditorMode = 'admins';
      else { _tabEditorMode = 'custom'; _tabEditorAllowed = existing.allowed_users.slice(); }
    }

    _openModal(
      isEdit ? 'Edit tab · ' + existing.title : 'New tab',
      `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-tab-title">Title</label>
          <input class="dp-input" id="dp-tab-title" maxlength="80" value="${esc(existing ? existing.title : '')}" autocomplete="off">
        </div>
        <div class="dp-field">
          <label for="dp-tab-slug">Slug</label>
          <input class="dp-input" id="dp-tab-slug" maxlength="32" value="${esc(existing ? existing.slug : '')}"
                 placeholder="auto from title" ${isEdit ? 'disabled' : ''}>
        </div>
      </div>
      <div class="dp-field">
        <label>Write permission</label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <label class="dp-check-row"><input type="radio" name="dp-tab-perm" value="all"     ${_tabEditorMode === 'all'     ? 'checked' : ''} onchange="DP._setTabEditorMode(this.value)"> All team members</label>
          <label class="dp-check-row"><input type="radio" name="dp-tab-perm" value="admins"  ${_tabEditorMode === 'admins'  ? 'checked' : ''} onchange="DP._setTabEditorMode(this.value)"> Admins only</label>
          <label class="dp-check-row"><input type="radio" name="dp-tab-perm" value="custom"  ${_tabEditorMode === 'custom'  ? 'checked' : ''} onchange="DP._setTabEditorMode(this.value)"> Specific users</label>
        </div>
      </div>
      <div class="dp-field" id="dp-tab-allowed-wrap" style="display:${_tabEditorMode === 'custom' ? 'flex' : 'none'};flex-direction:column">
        <label>Allowed users</label>
        <div class="dp-chip-picker">
          <div class="dp-chip-picked" id="dp-tab-chips"></div>
          <input type="text" class="dp-chip-input" id="dp-tab-q" autocomplete="off"
                 placeholder="Type username to add…"
                 oninput="DP._tabAllowedFilter(this.value)"
                 onfocus="DP._tabAllowedFilter(this.value)"
                 onkeydown="DP._tabAllowedKeydown(event)">
          <div class="dp-chip-suggest" id="dp-tab-suggest"></div>
        </div>
        <span style="font-size:11px;color:var(--text-3);margin-top:4px">Only these usernames (plus admins) can post into this tab.</span>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveTab('${esc(boardKey)}', ${tabId ? Number(tabId) : 'null'})">${isEdit ? 'Save' : 'Create'}</button>`
    );
    _renderTabAllowedChips();
  }

  function _setTabEditorMode(mode) {
    _tabEditorMode = mode;
    const wrap = document.getElementById('dp-tab-allowed-wrap');
    if (wrap) wrap.style.display = mode === 'custom' ? 'flex' : 'none';
  }

  function _renderTabAllowedChips() {
    const host = document.getElementById('dp-tab-chips');
    if (!host) return;
    host.innerHTML = _tabEditorAllowed.map(u => `
      <span class="dp-chip">
        <span>${esc(u)}</span>
        <button type="button" class="dp-chip-x" onclick="DP._tabAllowedRemove('${esc(u.replace(/'/g, "\\'"))}')">×</button>
      </span>
    `).join('');
  }
  function _tabAllowedFilter(q) {
    const suggest = document.getElementById('dp-tab-suggest');
    if (!suggest) return;
    const qL = String(q || '').trim().toLowerCase();
    const picked = new Set(_tabEditorAllowed.map(n => n.toLowerCase()));
    const hits = _tabMgrRoster
      .map(u => ({ name: u.username, display: u.display_name || u.username }))
      .filter(x => x.name && !picked.has(x.name.toLowerCase()))
      .filter(x => !qL || x.name.toLowerCase().includes(qL) || x.display.toLowerCase().includes(qL))
      .slice(0, 8);
    if (!hits.length) { suggest.innerHTML = '<div class="dp-chip-empty">No matches</div>'; suggest.classList.add('on'); return; }
    suggest.innerHTML = hits.map(x => `
      <button type="button" class="dp-chip-opt"
              onmousedown="event.preventDefault();DP._tabAllowedPick('${esc(x.name.replace(/'/g, "\\'"))}')">
        <span>${esc(x.display)} <span class="mono" style="color:var(--text-3)">@${esc(x.name)}</span></span>
      </button>
    `).join('');
    suggest.classList.add('on');
  }
  function _tabAllowedPick(name) {
    if (!_tabEditorAllowed.includes(name)) _tabEditorAllowed.push(name);
    _renderTabAllowedChips();
    const i = document.getElementById('dp-tab-q'); if (i) { i.value = ''; i.focus(); _tabAllowedFilter(''); }
  }
  function _tabAllowedRemove(name) {
    _tabEditorAllowed = _tabEditorAllowed.filter(n => n !== name);
    _renderTabAllowedChips();
  }
  function _tabAllowedKeydown(e) {
    if (e.key === 'Backspace' && !e.target.value && _tabEditorAllowed.length) {
      _tabEditorAllowed.pop(); _renderTabAllowedChips();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#dp-tab-suggest .dp-chip-opt');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') {
      const s = document.getElementById('dp-tab-suggest'); if (s) s.classList.remove('on');
    }
  }

  async function _saveTab(boardKey, tabId) {
    const title = ($('#dp-tab-title').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    // Translate radio mode → allowed_users shape expected by the API.
    const allowed = _tabEditorMode === 'all'    ? null
                  : _tabEditorMode === 'admins' ? []
                                                : _tabEditorAllowed.slice();
    if (tabId) {
      const body = { title, allowed_users: allowed };
      const data = await api('PUT', 'board-tabs?id=' + tabId, body);
      if (data) { toast('Tab updated', 'ok'); _closeModal(); _openTabManager(boardKey, _boardTitle(boardKey)); }
    } else {
      const slug = ($('#dp-tab-slug').value || '').trim();
      const body = { board_slug: boardKey, title, allowed_users: allowed };
      if (slug) body.slug = slug;
      const data = await api('POST', 'board-tabs', body);
      if (data) { toast('Tab created', 'ok'); _closeModal(); _openTabManager(boardKey, _boardTitle(boardKey)); }
    }
  }

  async function _deleteTab(boardKey, tabId, title) {
    if (!confirm('Delete tab "' + title + '"?')) return;
    // Use _rawApi so we can inspect the 409 "tab has posts" response and
    // surface a longer in-modal message rather than the generic toast.
    const res = await _rawApi('DELETE', 'board-tabs?id=' + tabId);
    if (res.status === 409) {
      toast(res.error || 'Tab still has posts — move or remove them first.', 'err');
      return;
    }
    if (!res.ok) {
      toast(res.error || 'Could not delete tab', 'err');
      return;
    }
    toast('Tab deleted', 'ok');
    _closeModal();
    // Re-render the board so the tab bar loses the deleted tab immediately.
    navigate(state.page);
  }

  // =========================================================
  // TASKS — wired to /api/dreampath/tasks
  // =========================================================
  // Parse a task's `assignee` field into a clean array. Historic rows store a
  // single name; newer rows (post Phase-6) store "jimmy, sonny, rio" — join
  // of display names with "," separator. Both shapes survive the round trip.
  function _parseAssignees(raw) {
    return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  async function _renderTasks(root) {
    root.innerHTML = '';
    const view = state.tasksView || 'table';

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'Tasks'),
        h('div', { className: 'meta' }, view === 'gantt'
          ? 'Timeline view — bars span from created date to due date.'
          : 'Table view — every task in one flat list. Click any row to open detail.'),
      ]),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        // View toggle lives next to "New task" so users can flip without scrolling.
        h('div', { className: 'dp-switcher', role: 'group', 'aria-label': 'Task view' }, [
          h('button', { type: 'button', className: view === 'table' ? 'on' : '', onclick: () => { state.tasksView = 'table'; navigate('tasks'); } }, 'Table'),
          h('button', { type: 'button', className: view === 'gantt' ? 'on' : '', onclick: () => { state.tasksView = 'gantt'; navigate('tasks'); } }, 'Gantt'),
        ]),
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openTaskEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/check.svg')"></span></div>
        <h4>No tasks yet</h4>
        <p>Create the first task to track project work.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openTaskEditor()">+ New task</button>
      `;
      root.appendChild(empty);
      return;
    }

    if (view === 'gantt') { _renderTasksGantt(root, tasks); return; }

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
      const owners = _parseAssignees(t.assignee);
      const ownerCell = owners.length
        ? owners.map(o => `<span class="dp-tag neutral" style="margin-right:4px">${esc(o)}</span>`).join('')
        : '<span style="color:var(--text-3)">—</span>';
      return `<tr onclick="DP.viewTask(${Number(t.id)})">
        <td class="mono">TASK-${String(t.id).padStart(4, '0')}</td>
        <td>${esc(t.title || '')}</td>
        <td>${ownerCell}</td>
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
            <th style="width:200px">Owners</th><th style="width:110px">Due</th>
            <th style="width:90px">Priority</th><th style="width:110px">Schedule</th>
            <th style="width:110px">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  // Gantt chart — horizontal timeline covering the 30-day window around today.
  // Each row is a task; each bar spans from start (task.created_at or today)
  // to due_date. Tasks without due_date render as a zero-width pin on their
  // start date. Colors mirror the status tags (info/ok/warn/neutral).
  function _renderTasksGantt(root, tasks) {
    const today = new Date(todayISO() + 'T00:00:00');
    const rangeStart = new Date(today); rangeStart.setDate(today.getDate() - 7);
    const rangeEnd   = new Date(today); rangeEnd.setDate(today.getDate() + 45);
    const totalDays = Math.round((rangeEnd - rangeStart) / 86_400_000);
    const dayWidth = 28; // px per day — 53 days * 28 ≈ 1484 px, horizontal scroll

    // Day/week headers
    let hdrDays = '';
    let hdrWeeks = '';
    let weekStart = 0;
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i);
      const dayStr = String(d.getDate()).padStart(2, '0');
      const dow = d.getDay();
      const isToday = d.toISOString().slice(0, 10) === todayISO();
      const isWeekend = dow === 0 || dow === 6;
      hdrDays += `<div class="dp-gantt-dcol${isToday ? ' dp-gantt-today' : ''}${isWeekend ? ' dp-gantt-weekend' : ''}" style="width:${dayWidth}px">${dayStr}</div>`;
      if (dow === 1 || i === 0) {
        // mark week boundaries; label once per week
        const weekDays = Math.min(7 - (dow === 0 ? 6 : dow - 1), totalDays - i + 1);
        const label = (d.getMonth() + 1) + '/' + d.getDate();
        hdrWeeks += `<div class="dp-gantt-wcol" style="width:${weekDays * dayWidth}px">${label}</div>`;
        weekStart = i;
      }
    }
    // Today guideline offset
    const todayOffset = Math.round((today - rangeStart) / 86_400_000) * dayWidth;

    const rows = tasks.map(t => {
      const start = t.created_at
        ? new Date(String(t.created_at).slice(0, 10) + 'T00:00:00')
        : today;
      const end   = t.due_date
        ? new Date(String(t.due_date).slice(0, 10) + 'T00:00:00')
        : new Date(start.getTime() + 14 * 86_400_000);  // default 14-day bar
      const startOffset = Math.max(0, Math.round((start - rangeStart) / 86_400_000));
      const endOffset   = Math.min(totalDays, Math.round((end - rangeStart) / 86_400_000));
      const barLeft  = startOffset * dayWidth;
      const barWidth = Math.max(dayWidth, (endOffset - startOffset) * dayWidth);
      const tone = t.status === 'done' ? 'ok'
                 : t.status === 'in_progress' ? 'info'
                 : (t.priority === 'high' ? 'alert' : 'neutral');
      const owners = _parseAssignees(t.assignee).join(', ') || '—';
      return `
        <div class="dp-gantt-row" onclick="DP.viewTask(${Number(t.id)})">
          <div class="dp-gantt-label">
            <div class="dp-gantt-title">${esc(t.title || '')}</div>
            <div class="dp-gantt-meta">${esc(owners)} · ${esc(t.status || 'todo')}</div>
          </div>
          <div class="dp-gantt-track" style="width:${totalDays * dayWidth}px">
            <div class="dp-gantt-bar dp-gantt-bar-${tone}" style="left:${barLeft}px;width:${barWidth}px"
                 title="${esc(t.title || '')} · ${esc(String(start.toISOString()).slice(0, 10))} → ${esc(String(end.toISOString()).slice(0, 10))}"></div>
          </div>
        </div>
      `;
    }).join('');

    const panel = h('div', { className: 'dp-panel', id: 'dp-gantt' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Timeline</h3>
        <span style="font-size:11px;color:var(--text-3)">
          ${String(rangeStart.toISOString()).slice(0, 10)} → ${String(rangeEnd.toISOString()).slice(0, 10)}
        </span>
      </div>
      <div class="dp-gantt-wrap">
        <div class="dp-gantt-scroll">
          <div class="dp-gantt-hdr">
            <div class="dp-gantt-label-hdr">Task</div>
            <div class="dp-gantt-track-hdr" style="width:${totalDays * dayWidth}px">
              <div class="dp-gantt-weeks">${hdrWeeks}</div>
              <div class="dp-gantt-days">${hdrDays}</div>
            </div>
          </div>
          <div class="dp-gantt-body" style="position:relative">
            <div class="dp-gantt-todayline" style="left:calc(240px + ${todayOffset}px)"></div>
            ${rows}
          </div>
        </div>
      </div>
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
    const relatedPostButton = t.related_post_id
      ? `<button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP.viewPost('${esc(t.related_post_board || 'documents')}', ${Number(t.related_post_id)})">Open source post</button>`
      : '';

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
      ${t.source_type ? `<div style="margin-top:14px;padding:10px 12px;border:1px solid var(--g-150);border-radius:var(--r-sm);background:var(--surface-2);font-size:12px;color:var(--text-2)">
        Source: <strong>${esc(t.source_type)}</strong>${t.source_ref_id ? ' #' + esc(t.source_ref_id) : ''}${t.related_post_title ? ' · ' + esc(t.related_post_title) : ''}
      </div>` : ''}
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--g-150);font-size:11px;color:var(--text-3)">
        Updated <span class="mono">${esc(fmtTime(t.updated_at))}</span>
      </div>
      `,
      `
      <button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
      ${relatedPostButton}
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

  async function _openTaskEditor(seed) {
    seed = seed || {};
    // Fetch user roster once so the Owner multiselect can pick real users
    // instead of asking for free-text names (which typo'd easily and broke
    // "filter by my tasks" on home). Picker=1 is read-only; returns only
    // display_name/id for active users — safe for any authed caller.
    const usersRes = await api('GET', 'users?picker=1').catch(() => null);
    const roster = (usersRes && usersRes.users) || [];
    const myName = _displayName();
    const ownerChecks = roster.map(u => `
      <label class="dp-check-row">
        <input type="checkbox" class="dp-t-own-cb" value="${esc(u.display_name)}"
               ${u.display_name === myName ? 'checked' : ''}>
        <span>${esc(u.display_name)}</span>
      </label>
    `).join('');

    _openModal(
      'New task',
      `
      <div class="dp-field">
        <label for="dp-t-title">Title</label>
        <input class="dp-input" id="dp-t-title" placeholder="What needs doing?" autocomplete="off" value="${esc(seed.title || '')}">
      </div>
      <div class="dp-field">
        <label for="dp-t-desc">Description</label>
        <textarea class="dp-textarea" id="dp-t-desc" placeholder="Context, links, acceptance criteria…"></textarea>
      </div>
      <div class="dp-field">
        <label>Owners <span style="font-weight:400;color:var(--text-3);margin-left:4px">(pick one or more from the user list)</span></label>
        <div class="dp-check-grid" id="dp-t-owners">${ownerChecks || '<span style="color:var(--text-3);font-size:12px">No users available.</span>'}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
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
      ${seed.related_post_id ? `
        <input type="hidden" id="dp-t-related-post" value="${Number(seed.related_post_id)}">
        <input type="hidden" id="dp-t-source-type" value="${esc(seed.source_type || 'post')}">
        <input type="hidden" id="dp-t-source-ref" value="${Number(seed.source_ref_id || seed.related_post_id)}">
        <div style="margin-top:10px;padding:10px 12px;border:1px solid var(--g-150);border-radius:var(--r-sm);background:var(--surface-2);font-size:12px;color:var(--text-2)">
          This task will keep a link back to the source ${esc(seed.source_type || 'post')}.
        </div>
      ` : ''}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveNewTask()">Create</button>`
    );
    setTimeout(() => { const t = $('#dp-t-title'); if (t) t.focus(); }, 60);
  }

  async function _saveNewTask() {
    const title = ($('#dp-t-title').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    // Collapse checkboxes to a comma-separated string of display names.
    // Backend column `assignee` is plain TEXT — splitting on "," is the
    // minimal viable multi-assignee without a new join table. See
    // _parseAssignees on the read path.
    const picked = Array.from(document.querySelectorAll('.dp-t-own-cb:checked'))
      .map(cb => cb.value)
      .filter(Boolean);
    const body = {
      title,
      description: $('#dp-t-desc').value || '',
      assignee: picked.join(', '),
      due_date: $('#dp-t-due').value || null,
      priority: $('#dp-t-prio').value || 'normal',
      status: 'todo',
    };
    const relatedPost = $('#dp-t-related-post');
    const sourceType = $('#dp-t-source-type');
    const sourceRef = $('#dp-t-source-ref');
    if (relatedPost && relatedPost.value) body.related_post_id = Number(relatedPost.value);
    if (sourceType && sourceType.value) body.source_type = sourceType.value;
    if (sourceRef && sourceRef.value) body.source_ref_id = Number(sourceRef.value);
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
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/clipboard.svg')"></span></div>
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
  // DECISION LOG — PMO decision register, wired to /api/dreampath/decisions
  // =========================================================
  async function _renderDecisions(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'Decision Log'),
        h('div', { className: 'meta' }, 'Track what was decided, why, who recorded it, and when it should be reviewed.'),
      ]),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openDecisionEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
          h('span', {}, ' New decision'),
        ]),
      ]),
    ]));

    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading decisions…</div>';
    root.appendChild(loading);

    const data = await api('GET', 'decisions');
    loading.remove();
    const decisions = (data && data.decisions) || [];

    if (!decisions.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/target.svg')"></span></div>
        <h4>No decisions logged</h4>
        <p>Capture the first PMO decision so the reason and follow-up stay visible.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openDecisionEditor()">+ New decision</button>
      `;
      root.appendChild(empty);
      return;
    }

    const today = todayISO();
    const active = decisions.filter(d => d.status === 'active').length;
    const reviewDue = decisions.filter(d => d.status === 'active' && d.next_review_date && String(d.next_review_date).slice(0, 10) <= today).length;
    const rows = decisions.map(d => {
      const statusTone = d.status === 'active' ? 'info' : d.status === 'closed' ? 'ok' : 'neutral';
      const review = String(d.next_review_date || '').slice(0, 10);
      const reviewTone = review && review <= today && d.status === 'active' ? 'warn' : 'neutral';
      const related = d.related_post_id
        ? `<button class="dp-btn dp-btn-ghost dp-btn-sm" onclick="event.stopPropagation();DP.viewPost('${esc(d.related_post_board || 'documents')}', ${Number(d.related_post_id)})">Open post</button>`
        : '<span style="color:var(--text-3)">—</span>';
      return `<tr onclick="DP.viewDecision(${Number(d.id)})">
        <td class="mono">DEC-${String(d.id).padStart(4, '0')}</td>
        <td>${esc(d.title || '')}</td>
        <td><span class="dp-tag ${statusTone}">${esc(d.status || 'active')}</span></td>
        <td class="mono">${esc(String(d.decision_date || '').slice(0, 10) || '—')}</td>
        <td>${esc(d.decided_by || '—')}</td>
        <td><span class="dp-tag ${reviewTone}">${review || '—'}</span></td>
        <td>${related}</td>
      </tr>`;
    }).join('');

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>All decisions <span class="count">${decisions.length}</span></h3>
        <span style="font-size:11px;color:var(--text-3)">${active} active · ${reviewDue} review due</span>
      </div>
      <table class="dp-table">
        <thead>
          <tr>
            <th style="width:110px">ID</th><th>Decision</th>
            <th style="width:110px">Status</th><th style="width:120px">Date</th>
            <th style="width:140px">Recorded by</th><th style="width:120px">Review</th>
            <th style="width:110px">Related</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  async function viewDecision(id) {
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading decision…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    const data = await api('GET', 'decisions');
    if (!data) return;
    const d = ((data.decisions) || []).find(x => Number(x.id) === Number(id));
    if (!d) { _renderPostError('Decision not found', 'The decision may have been removed.'); return; }
    const statusTone = d.status === 'active' ? 'info' : d.status === 'closed' ? 'ok' : 'neutral';
    const related = d.related_post_id
      ? `<button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP.viewPost('${esc(d.related_post_board || 'documents')}', ${Number(d.related_post_id)})">Open related post</button>`
      : '';
    _openModal(
      d.title || '(Untitled decision)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dp-tag neutral">DEC-${String(d.id).padStart(4, '0')}</span>
        <span class="dp-tag ${statusTone}">${esc(d.status || 'active')}</span>
        <span>Decision date <span class="mono">${esc(String(d.decision_date || '').slice(0, 10) || '—')}</span></span>
        <span>·</span>
        <span>Recorded by <strong style="color:var(--text-2)">${esc(d.decided_by || '—')}</strong></span>
        ${d.next_review_date ? `<span>· Review <span class="mono">${esc(String(d.next_review_date).slice(0, 10))}</span></span>` : ''}
      </div>
      <div class="dp-field"><label>Decision</label><p style="white-space:pre-wrap">${esc(d.decision || '')}</p></div>
      ${d.context ? `<div class="dp-field"><label>Context</label><p style="white-space:pre-wrap">${esc(d.context)}</p></div>` : ''}
      ${d.impact ? `<div class="dp-field"><label>Impact / follow-up</label><p style="white-space:pre-wrap">${esc(d.impact)}</p></div>` : ''}
      ${d.related_post_title ? `<div class="dp-field"><label>Related post</label><p>${esc(d.related_post_title)}</p></div>` : ''}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${related}
       ${d.status === 'active' ? `<button class="dp-btn dp-btn-primary" onclick="DP._closeDecision(${Number(d.id)})">Close decision</button>` : ''}`,
      { wide: true }
    );
  }

  function _openDecisionEditor() {
    _openModal(
      'New decision',
      `
      <div class="dp-field">
        <label for="dp-d-title">Title</label>
        <input class="dp-input" id="dp-d-title" placeholder="Short decision title" autocomplete="off">
      </div>
      <div class="dp-field">
        <label for="dp-d-decision">Decision</label>
        <textarea class="dp-textarea" id="dp-d-decision" placeholder="What did we decide?" style="min-height:96px"></textarea>
      </div>
      <div class="dp-field">
        <label for="dp-d-context">Context</label>
        <textarea class="dp-textarea" id="dp-d-context" placeholder="Why this decision was made"></textarea>
      </div>
      <div class="dp-field">
        <label for="dp-d-impact">Impact / follow-up</label>
        <textarea class="dp-textarea" id="dp-d-impact" placeholder="What changes, who should act, or what to watch"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-d-date">Decision date</label>
          <input class="dp-input" id="dp-d-date" type="date" value="${esc(todayISO())}">
        </div>
        <div class="dp-field">
          <label for="dp-d-review">Next review</label>
          <input class="dp-input" id="dp-d-review" type="date">
        </div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label for="dp-d-post">Related post ID <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
        <input class="dp-input" id="dp-d-post" inputmode="numeric" placeholder="e.g. 123">
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveDecision()">Save decision</button>`,
      { wide: true }
    );
    setTimeout(() => { const t = $('#dp-d-title'); if (t) t.focus(); }, 60);
  }

  async function _saveDecision() {
    const title = ($('#dp-d-title').value || '').trim();
    const decision = ($('#dp-d-decision').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    if (!decision) { toast('Decision is required', 'err'); return; }
    const body = {
      title,
      decision,
      context: $('#dp-d-context').value || '',
      impact: $('#dp-d-impact').value || '',
      decision_date: $('#dp-d-date').value || todayISO(),
      next_review_date: $('#dp-d-review').value || null,
      related_post_id: $('#dp-d-post').value || null,
      status: 'active',
    };
    const data = await api('POST', 'decisions', body);
    if (data) { toast('Decision logged', 'ok'); _closeModal(); navigate('decisions'); }
  }

  async function _closeDecision(id) {
    const data = await api('PUT', 'decisions?id=' + Number(id), { status: 'closed' });
    if (data) { toast('Decision closed', 'ok'); _closeModal(); navigate('decisions'); }
  }

  // =========================================================
  // RISK REGISTER — PMO risks, issues, dependencies, blockers
  // =========================================================
  function _riskTone(value) {
    return value === 'critical' || value === 'high' ? 'alert' : value === 'medium' ? 'warn' : 'neutral';
  }

  async function _renderRisks(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'Risk Register'),
        h('div', { className: 'meta' }, 'Track risks, issues, dependencies, blockers, owners, mitigation, and due dates.'),
      ]),
      h('div', {}, [
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openRiskEditor() }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
          h('span', {}, ' New risk'),
        ]),
      ]),
    ]));
    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading risks…</div>';
    root.appendChild(loading);
    const data = await api('GET', 'risks');
    loading.remove();
    const risks = (data && data.risks) || [];
    if (!risks.length) {
      const empty = h('div', { className: 'dp-empty' });
      empty.innerHTML = `
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/target.svg')"></span></div>
        <h4>No risks registered</h4>
        <p>Add the first risk, issue, dependency, or blocker before it hides inside a thread.</p>
        <button class="dp-btn dp-btn-primary dp-btn-sm" onclick="DP._openRiskEditor()">+ New risk</button>
      `;
      root.appendChild(empty);
      return;
    }
    const today = todayISO();
    const open = risks.filter(r => r.status === 'open' || r.status === 'monitoring').length;
    const critical = risks.filter(r => r.severity === 'critical' || r.severity === 'high').length;
    const overdue = risks.filter(r => r.due_date && String(r.due_date).slice(0, 10) < today && r.status !== 'closed').length;
    const rows = risks.map(r => {
      const due = String(r.due_date || '').slice(0, 10);
      const dueTone = due && due < today && r.status !== 'closed' ? 'alert' : 'neutral';
      const related = r.related_post_id
        ? `<button class="dp-btn dp-btn-ghost dp-btn-sm" onclick="event.stopPropagation();DP.viewPost('${esc(r.related_post_board || 'documents')}', ${Number(r.related_post_id)})">Open post</button>`
        : '<span style="color:var(--text-3)">—</span>';
      return `<tr onclick="DP.viewRisk(${Number(r.id)})">
        <td class="mono">RISK-${String(r.id).padStart(4, '0')}</td>
        <td>${esc(r.title || '')}</td>
        <td><span class="dp-tag neutral">${esc(r.kind || 'risk')}</span></td>
        <td><span class="dp-tag ${_riskTone(r.severity)}">${esc(r.severity || 'medium')}</span></td>
        <td><span class="dp-tag neutral">${esc(r.status || 'open')}</span></td>
        <td>${esc(r.owner || '—')}</td>
        <td><span class="dp-tag ${dueTone}">${due || '—'}</span></td>
        <td>${related}</td>
      </tr>`;
    }).join('');
    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>All risks <span class="count">${risks.length}</span></h3>
        <span style="font-size:11px;color:var(--text-3)">${open} open/monitoring · ${critical} high+ · ${overdue} overdue</span>
      </div>
      <table class="dp-table">
        <thead>
          <tr>
            <th style="width:110px">ID</th><th>Title</th><th style="width:100px">Kind</th>
            <th style="width:100px">Severity</th><th style="width:120px">Status</th>
            <th style="width:140px">Owner</th><th style="width:110px">Due</th><th style="width:110px">Related</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    root.appendChild(panel);
  }

  async function viewRisk(id) {
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading risk…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    const data = await api('GET', 'risks');
    if (!data) return;
    const r = ((data.risks) || []).find(x => Number(x.id) === Number(id));
    if (!r) { _renderPostError('Risk not found', 'The risk may have been removed.'); return; }
    const related = r.related_post_id
      ? `<button class="dp-btn dp-btn-secondary dp-btn-sm" onclick="DP.viewPost('${esc(r.related_post_board || 'documents')}', ${Number(r.related_post_id)})">Open related post</button>`
      : '';
    _openModal(
      r.title || '(Untitled risk)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="dp-tag neutral">${esc(r.kind || 'risk')}</span>
        <span class="dp-tag ${_riskTone(r.severity)}">${esc(r.severity || 'medium')}</span>
        <span class="dp-tag neutral">${esc(r.status || 'open')}</span>
        <span>Owner <strong style="color:var(--text-2)">${esc(r.owner || '—')}</strong></span>
        ${r.due_date ? `<span>· Due <span class="mono">${esc(String(r.due_date).slice(0, 10))}</span></span>` : ''}
      </div>
      ${r.description ? `<div class="dp-field"><label>Description</label><p style="white-space:pre-wrap">${esc(r.description)}</p></div>` : ''}
      ${r.mitigation ? `<div class="dp-field"><label>Mitigation / response</label><p style="white-space:pre-wrap">${esc(r.mitigation)}</p></div>` : ''}
      <div class="dp-field"><label>Assessment</label><p>Probability ${esc(r.probability)} · Impact ${esc(r.impact)}</p></div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${related}
       ${r.status !== 'closed' ? `<button class="dp-btn dp-btn-primary" onclick="DP._updateRiskStatus(${Number(r.id)}, 'closed')">Close</button>` : ''}`,
      { wide: true }
    );
  }

  function _openRiskEditor() {
    const levelOptions = ['low', 'medium', 'high', 'critical'].map(x => `<option value="${x}">${x}</option>`).join('');
    _openModal(
      'New risk / issue',
      `
      <div class="dp-field"><label for="dp-r-title">Title</label><input class="dp-input" id="dp-r-title" placeholder="Risk, issue, dependency, or blocker" autocomplete="off"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field"><label for="dp-r-kind">Kind</label><select class="dp-select" id="dp-r-kind"><option value="risk">risk</option><option value="issue">issue</option><option value="dependency">dependency</option><option value="blocker">blocker</option></select></div>
        <div class="dp-field"><label for="dp-r-sev">Severity</label><select class="dp-select" id="dp-r-sev">${levelOptions}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field"><label for="dp-r-prob">Probability</label><select class="dp-select" id="dp-r-prob">${levelOptions}</select></div>
        <div class="dp-field"><label for="dp-r-impact">Impact</label><select class="dp-select" id="dp-r-impact">${levelOptions}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field"><label for="dp-r-owner">Owner</label><input class="dp-input" id="dp-r-owner" placeholder="Owner"></div>
        <div class="dp-field"><label for="dp-r-due">Due</label><input class="dp-input" id="dp-r-due" type="date"></div>
      </div>
      <div class="dp-field"><label for="dp-r-desc">Description</label><textarea class="dp-textarea" id="dp-r-desc" placeholder="What can go wrong or what is blocking progress?"></textarea></div>
      <div class="dp-field"><label for="dp-r-mit">Mitigation / response</label><textarea class="dp-textarea" id="dp-r-mit" placeholder="Response plan, owner action, escalation path"></textarea></div>
      <div class="dp-field" style="margin-bottom:0"><label for="dp-r-post">Related post ID <span style="font-weight:400;color:var(--text-3)">(optional)</span></label><input class="dp-input" id="dp-r-post" inputmode="numeric" placeholder="e.g. 123"></div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" onclick="DP._saveRisk()">Save risk</button>`,
      { wide: true }
    );
    setTimeout(() => { const t = $('#dp-r-title'); if (t) t.focus(); }, 60);
  }

  async function _saveRisk() {
    const title = ($('#dp-r-title').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    const body = {
      title,
      kind: $('#dp-r-kind').value || 'risk',
      severity: $('#dp-r-sev').value || 'medium',
      probability: $('#dp-r-prob').value || 'medium',
      impact: $('#dp-r-impact').value || 'medium',
      owner: $('#dp-r-owner').value || '',
      due_date: $('#dp-r-due').value || null,
      description: $('#dp-r-desc').value || '',
      mitigation: $('#dp-r-mit').value || '',
      related_post_id: $('#dp-r-post').value || null,
      status: 'open',
    };
    const data = await api('POST', 'risks', body);
    if (data) { toast('Risk registered', 'ok'); _closeModal(); navigate('risks'); }
  }

  async function _updateRiskStatus(id, status) {
    const data = await api('PUT', 'risks?id=' + Number(id), { status });
    if (data) { toast('Risk updated', 'ok'); _closeModal(); navigate('risks'); }
  }

  // =========================================================
  // TEAMS / CALENDAR / CONTACTS — Phase 3 placeholders in ERP style
  // =========================================================
  function _stubPage(root, title, note) {
    root.appendChild(h('div', { className: 'dp-page-head' }, [h('h1', {}, title)]));
    const e = h('div', { className: 'dp-empty' });
    e.innerHTML = `
      <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/layers.svg')"></span></div>
      <h4>${esc(title)} — Phase 3 wiring pending</h4>
      <p>${esc(note)}</p>
    `;
    root.appendChild(e);
  }
  // ===== Calendar — month grid wired to /api/dreampath/events?month=YYYY-MM =====
  let _calCursor = null;  // Date pointing at 1st of currently viewed month
  let _calEventsByDate = {};
  function _canCreateCalendarEvent() {
    return !!(state.user && state.user.role === 'admin' && _hasPerm('write:calendar'));
  }
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
        ...(_canCreateCalendarEvent() ? [
          h('button', { className: 'dp-btn dp-btn-primary dp-btn-sm', onclick: () => _openEventEditor(null, { start_date: todayISO() }) }, '+ Event'),
        ] : []),
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
    _calEventsByDate = byDate;

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
    // Calendar stretches vertically to fill the page so tall viewports don't
     // show empty whitespace below the month grid. Each row shares 1fr height.
    let gridHtml = '<div class="dp-cal-grid dp-cal-grid--fill">';
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
                 onclick="event.stopPropagation();DP._calEventClick(${Number(e.id)}, '${esc(String(e.start_date || dateStr).slice(0, 10))}')"
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
    const safeDate = String(dateStr || '').slice(0, 10);
    const events = (_calEventsByDate[safeDate] || []).slice().sort((a, b) => {
      const at = a.start_time || '99:99';
      const bt = b.start_time || '99:99';
      return at.localeCompare(bt) || String(a.title || '').localeCompare(String(b.title || ''));
    });
    const body = events.length ? `
      <div class="dp-list" style="display:grid;gap:8px">
        ${events.map(e => `
          <button type="button" class="dp-preview-item" onclick="DP._calEventClick(${Number(e.id)}, '${esc(String(e.start_date || safeDate).slice(0, 10))}')">
            <div>
              <strong>${esc(e.title || '(Untitled event)')}</strong>
              <div style="font-size:11px;color:var(--text-3);margin-top:3px">
                ${e.start_time ? `<span class="mono">${esc(e.start_time)}${e.end_time ? '-' + esc(e.end_time) : ''}</span><span> · </span>` : ''}
                <span>${esc(e.type || 'general')}</span>
              </div>
            </div>
          </button>
        `).join('')}
      </div>
    ` : '<div style="font-size:var(--fs-13);color:var(--text-3)">No events scheduled for this day.</div>';
    _openModal(
      safeDate || 'Day detail',
      body,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${_canCreateCalendarEvent() ? `<button class="dp-btn dp-btn-primary" onclick="DP._openEventEditor(null, { start_date: '${esc(safeDate)}' })">New event</button>` : ''}`
    );
  }
  async function _calEventClick(id, occurrenceDate) {
    _openModal('Loading…', '<div style="color:var(--text-3)">Loading event…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`);
    const data = await api('GET', 'events?id=' + Number(id));
    if (!data) return;
    const e = data.event;
    if (!e) { _renderPostError('Event not found', 'It may have been removed or moved.'); return; }
    const safeOccurrence = String(occurrenceDate || e.start_date || '').slice(0, 10);
    const isRecurringOccurrence = !!(e.recurrence_type && safeOccurrence && safeOccurrence !== String(e.start_date || '').slice(0, 10));
    _openModal(
      e.title || '(Untitled event)',
      `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="dp-tag neutral">${esc(e.type || 'general')}</span>
        <span class="mono">${esc(safeOccurrence || e.start_date || '')}${e.end_date && e.end_date !== e.start_date && !isRecurringOccurrence ? ' → ' + esc(e.end_date) : ''}</span>
        ${e.start_time ? `<span>·</span><span class="mono">${esc(e.start_time)}${e.end_time ? '–' + esc(e.end_time) : ''}</span>` : ''}
        ${e.recurrence_type ? `<span>·</span><span class="dp-tag info">repeats ${esc(e.recurrence_type)}</span>` : ''}
        ${isRecurringOccurrence ? `<span>·</span><span class="dp-tag warn">occurrence</span>` : ''}
      </div>
      ${_sanitize(e.description || '<p style="color:var(--text-3)">No description.</p>')}
      ${(e.history || []).length ? `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--g-150)">
          <div class="dp-h2" style="margin-bottom:8px">Edit history</div>
          ${(e.history || []).slice(0, 5).map(h => `
            <div style="display:grid;grid-template-columns:90px 1fr;gap:12px;padding:4px 0;font-size:11px;color:var(--text-2)">
              <span class="mono" style="color:var(--text-3)">${esc(fmtTime(h.edited_at))}</span>
              <span><strong>${esc(h.editor_name || '')}</strong> — ${esc(h.edit_note || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${_hasPerm('write:calendar') ? `<button class="dp-btn dp-btn-primary" onclick="DP._openEventEditor(${Number(e.id)}, null, '${esc(safeOccurrence)}')">Edit</button>` : ''}`
    );
  }

  async function _openEventEditor(id, seed, occurrenceDate) {
    seed = seed || {};
    let ev = seed;
    if (id) {
      const data = await api('GET', 'events?id=' + Number(id));
      if (!data || !data.event) { toast('Event not found', 'err'); return; }
      ev = data.event;
    }
    const isEdit = !!id;
    const eventOccurrenceDate = String(occurrenceDate || ev.start_date || '').slice(0, 10);
    _openModal(
      isEdit ? 'Edit event' : 'New event',
      `
      <div class="dp-field">
        <label for="dp-e-title">Title</label>
        <input class="dp-input" id="dp-e-title" placeholder="Event title" autocomplete="off" value="${esc(ev.title || '')}">
      </div>
      <div class="dp-field">
        <label for="dp-e-desc">Description</label>
        <textarea class="dp-textarea" id="dp-e-desc" placeholder="Agenda, context, links…">${esc(ev.description || '')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-e-start">Start date</label>
          <input class="dp-input" id="dp-e-start" type="date" value="${esc(String(ev.start_date || todayISO()).slice(0, 10))}">
        </div>
        <div class="dp-field">
          <label for="dp-e-end">End date</label>
          <input class="dp-input" id="dp-e-end" type="date" value="${esc(String(ev.end_date || '').slice(0, 10))}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-e-start-time">Start time</label>
          <input class="dp-input" id="dp-e-start-time" type="time" value="${esc(ev.start_time || '')}">
        </div>
        <div class="dp-field">
          <label for="dp-e-end-time">End time</label>
          <input class="dp-input" id="dp-e-end-time" type="time" value="${esc(ev.end_time || '')}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="dp-field">
          <label for="dp-e-type">Type</label>
          <select class="dp-select" id="dp-e-type">
            ${['general', 'meeting', 'deadline', 'milestone'].map(x => `<option value="${x}" ${String(ev.type || 'general') === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </div>
        <div class="dp-field">
          <label for="dp-e-recur">Repeats</label>
          <select class="dp-select" id="dp-e-recur">
            <option value="" ${!ev.recurrence_type ? 'selected' : ''}>none</option>
            ${['daily', 'weekly', 'biweekly', 'monthly', 'yearly'].map(x => `<option value="${x}" ${String(ev.recurrence_type || '') === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-e-recur-end">Repeat until</label>
        <input class="dp-input" id="dp-e-recur-end" type="date" value="${esc(String(ev.recurrence_end || '').slice(0, 10))}">
      </div>
      ${isEdit ? `
        <div class="dp-field" style="margin-bottom:0">
          <label for="dp-e-note">Edit reason</label>
          <input class="dp-input" id="dp-e-note" placeholder="Required for audit history">
        </div>
      ` : ''}
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       ${isEdit && _canCreateCalendarEvent() ? `<button class="dp-btn dp-btn-danger" onclick="DP._requestDeleteEvent(${Number(id)}, '${esc(eventOccurrenceDate)}', '${esc(ev.recurrence_type || '')}')">Delete</button>` : ''}
       <button class="dp-btn dp-btn-primary" onclick="DP._saveEvent(${isEdit ? Number(id) : 0})">${isEdit ? 'Save changes' : 'Create event'}</button>`,
      { wide: true }
    );
    setTimeout(() => { const title = $('#dp-e-title'); if (title) title.focus(); }, 60);
  }

  async function _saveEvent(id) {
    const title = ($('#dp-e-title').value || '').trim();
    const startDate = ($('#dp-e-start').value || '').trim();
    if (!title) { toast('Title is required', 'err'); return; }
    if (!startDate) { toast('Start date is required', 'err'); return; }
    const body = {
      title,
      description: $('#dp-e-desc').value || '',
      start_date: startDate,
      end_date: $('#dp-e-end').value || null,
      start_time: $('#dp-e-start-time').value || null,
      end_time: $('#dp-e-end-time').value || null,
      type: $('#dp-e-type').value || 'general',
      recurrence_type: $('#dp-e-recur').value || null,
      recurrence_end: $('#dp-e-recur-end').value || null,
    };
    const isEdit = !!Number(id);
    if (isEdit) {
      const note = ($('#dp-e-note').value || '').trim();
      if (!note) { toast('Edit reason is required', 'err'); return; }
      body.edit_note = note;
    }
    const data = isEdit
      ? await api('PUT', 'events?id=' + Number(id), body)
      : await api('POST', 'events', body);
    if (data) {
      toast(isEdit ? 'Event updated' : 'Event created', 'ok');
      _closeModal();
      navigate('calendar');
    }
  }

  function _requestDeleteEvent(id, occurrenceDate, recurrenceType) {
    if (!id) return;
    const safeOccurrence = String(occurrenceDate || '').slice(0, 10);
    if (!recurrenceType) {
      _deleteEvent(id, 'event', safeOccurrence);
      return;
    }
    _openModal(
      'Delete recurring event',
      `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:var(--text-2)">
         This is a repeating event. Choose how much of the series to delete.
       </p>
       <div style="display:grid;gap:8px">
         <button type="button" class="dp-preview-item" onclick="DP._deleteEvent(${Number(id)}, 'single', ${_jsArg(safeOccurrence)})">
           <div><strong>Only this event</strong><div style="font-size:11px;color:var(--text-3);margin-top:3px">${esc(safeOccurrence)} only</div></div>
         </button>
         <button type="button" class="dp-preview-item" onclick="DP._deleteEvent(${Number(id)}, 'following', ${_jsArg(safeOccurrence)})">
           <div><strong>This and following events</strong><div style="font-size:11px;color:var(--text-3);margin-top:3px">Keep earlier occurrences</div></div>
         </button>
         <button type="button" class="dp-preview-item" onclick="DP._deleteEvent(${Number(id)}, 'all', ${_jsArg(safeOccurrence)})">
           <div><strong>All events in this series</strong><div style="font-size:11px;color:var(--text-3);margin-top:3px">Delete the full repeating event</div></div>
         </button>
       </div>`,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>`,
      { wide: true }
    );
  }

  async function _deleteEvent(id, mode, occurrenceDate) {
    if (!id) return;
    const safeMode = mode || 'event';
    const message = safeMode === 'all'
      ? 'Delete all events in this series? This cannot be undone.'
      : 'Delete this event? This cannot be undone.';
    if (!confirm(message)) return;
    const apiMode = safeMode === 'event' ? 'all' : safeMode;
    const qs = new URLSearchParams({ id: String(Number(id)), mode: apiMode });
    if (occurrenceDate) qs.set('occurrence_date', String(occurrenceDate).slice(0, 10));
    const data = await api('DELETE', 'events?' + qs.toString());
    if (data) {
      toast('Event deleted', 'ok');
      _closeModal();
      navigate('calendar');
    }
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/phone.svg')"></span></div>
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
          <div style="height:100%;background:var(--accent);width:${pct}%;transition:width var(--dur-reveal) var(--ease-decel)"></div>
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
        <div style="padding:14px;border:var(--bd);border-radius:var(--r-md);background:var(--surface)">
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
  //   · Why  (why we're doing this)
  //   · Goal (what the user/system gains)
  //   · Remarks (non-obvious gotchas, prior incidents)
  // The viewer auto-extracts h2/h3 headings into a sticky right rail.
  // =========================================================
  async function _renderRules(root) {
    root.innerHTML = '';
    const active = state.rulesTab || 'md';

    // Tab strip at the top of the page head.
    const tabStrip = h('div', { className: 'dp-tabs', role: 'tablist' });
    [
      { id: 'md',          label: 'DREAMPATH.md',  sub: 'operating rules' },
      { id: 'casestudies', label: 'Case Studies',  sub: 'in-code comments · regressions avoided' },
      { id: 'design',      label: 'Design Guide',  sub: 'tokens · colors · spacing' },
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

    if (active === 'design')      { _renderRulesDesign(root); return; }
    if (active === 'casestudies') { _renderRulesCaseStudies(root); return; }
    _renderRulesMarkdown(root);
  }

  // Case Studies tab — scrapes every `[CASE STUDY …]` comment block from the
  // bundled client + deployed API files and renders each as a standalone card.
  // This surfaces the "why" behind fragile code paths that would otherwise be
  // invisible to operators reading the in-app rules.
  async function _renderRulesCaseStudies(root) {
    const host = h('div');
    host.innerHTML = '<div class="dp-panel"><div class="dp-panel-body pad" style="color:var(--text-3)">Scanning source for case-study comments…</div></div>';
    root.appendChild(host);

    // Files to scrape. Client JS + inline CSS + our API surface. Static paths
    // — these are fetched from the same origin via the normal asset server,
    // same thing the browser downloaded for the current page.
    const sources = [
      { label: 'dreampath.js',            url: '/js/dreampath.js' },
      { label: 'dreampath.html',          url: '/dreampath.html' },
      { label: 'DREAMPATH.md',            url: '/DREAMPATH.md' },
    ];

    // Regex catches //-style comment blocks that begin with `[CASE STUDY` and
    // continue for subsequent lines that also start with `//`. MD files use
    // a different marker (`> [CASE STUDY …]` blockquotes or section headers)
    // so we bolt on a secondary scan for those.
    function scan(label, text) {
      const out = [];
      if (!text) return out;
      // JS / CSS comments — //-prefixed continuation lines.
      const reJs = /(^|\n)[ \t]*\/\/[ \t]*\[CASE STUDY[^\]\n]*\][^\n]*(?:\n[ \t]*\/\/[^\n]*)*/g;
      let m;
      while ((m = reJs.exec(text)) !== null) {
        const block = m[0].replace(/(^|\n)[ \t]*\/\/ ?/g, '$1').trim();
        const titleMatch = block.match(/\[CASE STUDY([^\]]*)\]\s*(.*)/);
        const title = titleMatch ? ('[CASE STUDY' + titleMatch[1].trim() + ']' + (titleMatch[2] ? ' ' + titleMatch[2].trim() : '')) : block.split('\n')[0];
        // Line number of the match in the source.
        const line = text.slice(0, m.index).split('\n').length + (m[1] ? 1 : 0);
        out.push({ label, line, title, body: block.split('\n').slice(1).join('\n').trim() });
      }
      // Markdown block — case study inside `>` blockquote OR `###` headers.
      const reMd = /(^|\n)>[ \t]*\[!\w+\][^\n]*\n(?:>[^\n]*\n?)+/g;
      while ((m = reMd.exec(text)) !== null) {
        const block = m[0].replace(/>\s?/g, '').trim();
        if (!/case study|회귀|regression|fix/i.test(block)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        const first = block.split('\n')[0].slice(0, 80);
        out.push({ label, line, title: first, body: block.split('\n').slice(1).join('\n').trim() });
      }
      return out;
    }

    const results = [];
    for (const s of sources) {
      try {
        const r = await fetch(s.url, { credentials: 'same-origin' });
        if (!r.ok) continue;
        const text = await r.text();
        results.push(...scan(s.label, text));
      } catch (_) {}
    }

    host.innerHTML = '';
    if (!results.length) {
      const empty = h('div', { className: 'dp-panel' });
      empty.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">No case-study comments found.</div>';
      host.appendChild(empty);
      return;
    }

    // Intro card
    const intro = h('section', { className: 'dp-panel', style: { marginBottom: '20px' } });
    intro.innerHTML = `
      <div class="dp-panel-body pad">
        <strong style="color:var(--text);font-size:var(--fs-14)">${results.length} case studies</strong>
        <p style="margin:6px 0 0;color:var(--text-2);font-size:var(--fs-12);line-height:1.55">
          Every card below is a real in-code comment pulled from a file that ships with this
          release. When a production regression is fixed we leave a marker like
          <code>// [CASE STUDY &lt;date&gt; — &lt;title&gt;]</code> with the root cause + the
          mitigation. The list here is the same one future developers see in their editor —
          no duplicate docs.
        </p>
      </div>
    `;
    host.appendChild(intro);

    // Grid of cards
    const grid = h('div', { className: 'dp-case-grid' });
    results.forEach((cs, i) => {
      const card = document.createElement('section');
      card.className = 'dp-case-card';
      card.innerHTML = `
        <header>
          <strong class="dp-case-title">${esc(cs.title)}</strong>
          <div class="dp-case-meta">
            <span class="mono">${esc(cs.label)}:${cs.line}</span>
          </div>
        </header>
        ${cs.body ? `<pre class="dp-case-body">${esc(cs.body)}</pre>` : ''}
      `;
      grid.appendChild(card);
    });
    host.appendChild(grid);
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

  // Design Guide tab — source of truth mirror of the PMO Style Tokens v2.
  // Swatches pull from live CSS variables so :root changes are visible here.
  // Edit mode (admin-only) unlocks color pickers per swatch; updates run
  // through document.documentElement.style.setProperty() and persist in
  // localStorage until explicitly reset. No DB round-trip — this is a local
  // preview surface for proposing token tweaks before promoting to :root.
  const DESIGN_EDITABLE_TOKENS = [
    '--navy','--navy-700','--navy-600','--green','--gold',
    '--ok','--warn','--alert','--info',
    '--g-950','--g-900','--g-700','--g-500','--g-300','--g-200','--g-150','--g-100','--g-050',
    '--dv-1','--dv-2','--dv-3','--dv-4','--dv-5','--dv-6','--dv-7','--dv-8',
  ];

  function _applyStoredDesignOverrides() {
    try {
      const raw = localStorage.getItem('dp_design_overrides');
      if (!raw) return;
      const map = JSON.parse(raw);
      Object.keys(map || {}).forEach(k => {
        if (DESIGN_EDITABLE_TOKENS.includes(k)) {
          document.documentElement.style.setProperty(k, map[k]);
        }
      });
    } catch (_) {}
  }
  function _storeDesignOverride(token, value) {
    try {
      const raw = localStorage.getItem('dp_design_overrides');
      const map = raw ? JSON.parse(raw) : {};
      if (value === null) delete map[token]; else map[token] = value;
      localStorage.setItem('dp_design_overrides', JSON.stringify(map));
    } catch (_) {}
  }

  // Read the computed color for a CSS var and return a #rrggbb string so it
  // can feed an <input type="color"> which only accepts hex.
  function _tokenHex(token) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (!v) return '#000000';
    if (/^#([0-9a-f]{3}){1,2}$/i.test(v)) {
      if (v.length === 4) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      return v.toLowerCase();
    }
    // Render once into a canvas to normalize rgb()/hsl()/named → hex.
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = v;
    const m = c.fillStyle.match(/^#([0-9a-f]{6})$/i);
    return m ? c.fillStyle : '#000000';
  }

  function _toggleDesignEditMode() {
    const on = !state.designEdit;
    state.designEdit = on;
    const page = $('#dp-page');
    if (page && state.page === 'rules') _renderRules(page);
  }
  function _setDesignToken(token, value) {
    if (!DESIGN_EDITABLE_TOKENS.includes(token)) return;
    document.documentElement.style.setProperty(token, value);
    _storeDesignOverride(token, value);
  }
  function _resetDesignTokens() {
    if (!confirm('Reset all design-token overrides back to the built-in defaults?')) return;
    DESIGN_EDITABLE_TOKENS.forEach(t => document.documentElement.style.removeProperty(t));
    try { localStorage.removeItem('dp_design_overrides'); } catch (_) {}
    const page = $('#dp-page');
    if (page && state.page === 'rules') _renderRules(page);
    toast('Design tokens reset', 'ok');
  }

  function _renderRulesDesign(root) {
    const host = h('div', { className: 'dp-rules-body' });
    root.appendChild(host);

    const isAdmin = state.user && state.user.role === 'admin';
    const editing = !!state.designEdit;

    // Editor toolbar — admin only. Toggle unlocks the color pickers on every
    // swatch; Reset clears localStorage overrides.
    if (isAdmin) {
      const toolbar = h('section', { className: 'dp-rules-card' });
      toolbar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <strong>Edit mode</strong>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">
              ${editing
                ? 'Click a swatch to open the color picker. Changes preview live and persist in this browser until reset.'
                : 'Admin-only. Enable to tweak colors and preview instantly. Overrides stay local — no DB write.'}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="dp-btn ${editing ? 'dp-btn-primary' : 'dp-btn-secondary'}"
                    onclick="DP._toggleDesignEditMode()">
              ${editing ? 'Edit mode: ON' : 'Enable edit mode'}
            </button>
            <button class="dp-btn dp-btn-danger" onclick="DP._resetDesignTokens()">Reset overrides</button>
          </div>
        </div>
      `;
      host.appendChild(toolbar);
    }

    const swatch = (name, css, textOn) => {
      const editable = editing && DESIGN_EDITABLE_TOKENS.includes(css);
      const hex = _tokenHex(css);
      const chipInner = editable
        ? `<input type="color" class="dp-sw-picker" value="${esc(hex)}"
                  oninput="DP._setDesignToken('${esc(css)}', this.value)"
                  aria-label="Edit ${esc(name)}">`
        : 'Aa';
      return `
        <div class="dp-sw${editable ? ' dp-sw-edit' : ''}">
          <div class="dp-sw-chip" style="background:var(${css});color:${textOn || '#fff'}">${chipInner}</div>
          <div class="dp-sw-meta">
            <div class="dp-sw-name">${esc(name)}</div>
            <div class="dp-sw-var">${esc(css)}</div>
          </div>
        </div>`;
    };
    const chip = (label, css) => `<div class="dp-token-row"><span class="dp-token-k">${esc(label)}</span><span class="dp-token-v">${esc(css)}</span></div>`;

    host.innerHTML = `
      <section class="dp-rules-card">
        <h2>Source of truth</h2>
        <p>These values mirror the PMO Style Tokens v2 (ERP) reference + <code>css/style.css</code>
        on the BP Media public site so Dreampath and the marketing site stay aligned. When a token changes in
        <code>dreampath.html</code> <code>:root</code>, the swatches below update automatically.</p>
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
        <p><strong>UI:</strong> Google Sans Flex (variable, opsz 6..144 · wght 1..1000). <strong>Mono:</strong> ui-monospace (SF Mono / Cascadia / Menlo — OS-native, no CDN fallback).</p>
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
        <h2>Spacing (ported from BP Media)</h2>
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
        <p>24×24 viewBox, <code>stroke="currentColor"</code> at <code>stroke-width: 1.75</code>, round linecap/linejoin. Rendered via CSS <code>mask-image</code> so any element inherits the parent color. All icons live in <code>img/dreampath/icons/</code>.</p>
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
        // Background must be a theme-aware token — earlier version hardcoded
        // '#fff' which in dark mode left white text on white bg (numbers
        // invisible). var(--surface) swaps to #111827 under dark.
        style: { padding: '16px 18px', textAlign: 'left', cursor: 'pointer', border: 'var(--bd)', borderRadius: 'var(--r-md)', background: 'var(--surface)', fontFamily: 'inherit' },
        onclick: t.run,
      });
      tile.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span class="ico" style="width:16px;height:16px;background-color:var(--accent);-webkit-mask:url('/img/dreampath/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat;mask:url('/img/dreampath/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat"></span>
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
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/users-admin.svg')"></span></div>
        <h4>No users</h4>
      `;
      root.appendChild(empty);
      return;
    }

    // Row uniformity: every chip cell renders a dp-tag (even "admin = no
     // preset" or "no preset assigned") so chip heights are identical across
     // rows. Team column uses nowrap so multi-word values like "Team Indonesia"
     // don't wrap to 2 lines and inflate row height. Earlier version showed
     // inconsistent heights because some cells had plain text + some had
     // chips + some cells wrapped.
    const rows = users.map(u => {
      const roleTone = u.role === 'admin' ? 'info' : 'neutral';
      const activeTone = u.is_active ? 'ok' : 'alert';
      const presetCell = u.role === 'admin'
        ? `<span class="dp-tag neutral" style="opacity:0.55">Admin · all</span>`
        : (u.preset_name
            ? `<span class="dp-tag neutral">${esc(u.preset_name)}</span>`
            : `<span class="dp-tag alert">No preset</span>`);
      return `<tr>
        <td style="white-space:nowrap"><strong>${esc(u.username)}</strong></td>
        <td>${esc(u.display_name || '—')}</td>
        <td><span class="dp-tag ${roleTone}">${esc(u.role || 'member')}</span></td>
        <td>${presetCell}</td>
        <td style="white-space:nowrap">${esc(u.department || '—')}</td>
        <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${esc(u.email || '—')}</td>
        <td class="mono" style="white-space:nowrap">${esc(fmtTime(u.last_login_at))}</td>
        <td><span class="dp-tag ${activeTone}">${u.is_active ? 'active' : 'disabled'}</span></td>
        <td style="text-align:right;white-space:nowrap">
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
      <table class="dp-table dp-table-uniform">
        <thead><tr>
          <th style="width:120px">Username</th><th>Display name</th>
          <th style="width:90px">Role</th><th style="width:160px">Preset</th>
          <th style="width:140px">Team</th><th style="width:210px">Email</th>
          <th style="width:140px">Last login</th><th style="width:90px">Status</th>
          <th style="width:140px;text-align:right">Actions</th>
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
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
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
      ? '<div style="padding:8px 12px;background:var(--info-bg);color:var(--accent);border-radius:2px;margin-bottom:12px;font-size:12px">Built-in preset — name and description are locked. Permissions may still be tuned.</div>'
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

  // -------------------------- Activity log (admin) --------------------------
  // Dedicated page for the full audit trail — post edits, event edits, comments.
  // 20 rows per page, paginated via ?offset/?limit. Pulls from the new
  // /api/dreampath/activity endpoint which unifies dp_post_history +
  // dp_event_history + dp_post_comments.
  const ACTIVITY_PAGE_SIZE = 20;
  async function _renderActivityLog(root) {
    root.innerHTML = '';
    if (typeof state.activityPage !== 'number') state.activityPage = 0;
    const page = state.activityPage;

    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'Activity log'),
        h('div', { className: 'meta' }, 'Every post edit, event edit, and comment — admin only. Most recent first.'),
      ]),
    ]));

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading activity…</div>';
    root.appendChild(panel);

    const offset = page * ACTIVITY_PAGE_SIZE;
    const data = await api('GET', 'activity?limit=' + ACTIVITY_PAGE_SIZE + '&offset=' + offset);
    const items = (data && data.items) || [];
    const total = (data && data.total) || 0;
    const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
    if (page >= totalPages) state.activityPage = Math.max(0, totalPages - 1);

    if (!items.length) {
      panel.innerHTML = `
        <div class="dp-panel-head"><h3>No activity yet</h3></div>
        <div class="dp-panel-body pad" style="color:var(--text-3);font-size:12px">Nothing to show on this page.</div>
      `;
      return;
    }

    const kindTone = { post: 'info', event: 'neutral', comment: 'ok' };
    const rows = items.map(it => {
      const kind = it.kind || 'item';
      const tone = kindTone[kind] || 'neutral';
      const clickable = it.ref_id && (kind === 'post' || kind === 'comment');
      const rowAttr = clickable
        ? `style="cursor:pointer" onclick="DP.viewPost('${esc(it.board || 'announcements')}', ${Number(it.ref_id)})"`
        : '';
      return `<tr ${rowAttr}>
        <td style="width:90px"><span class="dp-tag ${tone}">${esc(kind)}</span></td>
        <td>${esc(it.title || '(untitled)')}</td>
        <td style="width:140px" class="mono">${esc(it.meta || '—')}</td>
        <td style="color:var(--text-2);font-size:12px">${esc(String(it.note || '').slice(0, 160))}</td>
        <td style="width:150px" class="mono">${esc(fmtTime(it.created_at))}</td>
      </tr>`;
    }).join('');

    const rangeFrom = offset + 1;
    const rangeTo = Math.min(offset + items.length, total);
    panel.innerHTML = `
      <div class="dp-panel-head">
        <h3>Recent activity <span class="count">${rangeFrom}–${rangeTo} of ${total}</span></h3>
      </div>
      <table class="dp-table">
        <thead><tr>
          <th>Kind</th>
          <th>Title</th>
          <th>Actor</th>
          <th>Note</th>
          <th>When</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${_buildPager(page, totalPages, '_activityPage')}
    `;
  }

  // Shared numbered pagination renderer. Shows up to 7 page numbers with
  // ellipsis in the middle when there are more. Prev/Next arrows flank the
  // numbers. Each button calls DP[handlerName](pageIdx). Zero-based.
  function _buildPager(page, totalPages, handlerName) {
    if (totalPages <= 1) return '';
    const btn = (label, p, cls, disabled) =>
      `<button type="button" class="${cls}" ${disabled ? 'disabled' : ''}
         onclick="DP.${handlerName}(${p})">${label}</button>`;
    const buttons = [];
    buttons.push(btn('‹', Math.max(0, page - 1), '', page === 0));
    // Window: 1, 2, …, page-1, page, page+1, …, N-1, N
    const window = new Set([0, 1, totalPages - 2, totalPages - 1, page - 1, page, page + 1]);
    const pages = [...window].filter(p => p >= 0 && p < totalPages).sort((a, b) => a - b);
    let prev = -1;
    pages.forEach(p => {
      if (p > prev + 1) buttons.push('<span class="dp-pager-gap">…</span>');
      buttons.push(btn(String(p + 1), p, p === page ? 'on' : '', false));
      prev = p;
    });
    buttons.push(btn('›', Math.min(totalPages - 1, page + 1), '', page >= totalPages - 1));
    return '<nav class="dp-pager" aria-label="Pagination">' + buttons.join('') + '</nav>';
  }
  function _activityPage(n) {
    state.activityPage = Math.max(0, n);
    navigate('activity');
  }

  // -------------------------- Account / Profile --------------------------
  // Every logged-in user gets their own Account page — edit display_name,
  // email, department, phone (with country code), role title, avatar, and
  // password. Avatar supports drag-to-reposition + client-side 1:1 crop +
  // 10MB cap before hitting /api/dreampath/upload.
  const PHONE_CODES = [
    { cc: '+82',  label: '🇰🇷 +82 Korea' },
    { cc: '+1',   label: '🇺🇸 +1 US / Canada' },
    { cc: '+44',  label: '🇬🇧 +44 UK' },
    { cc: '+81',  label: '🇯🇵 +81 Japan' },
    { cc: '+86',  label: '🇨🇳 +86 China' },
    { cc: '+852', label: '🇭🇰 +852 Hong Kong' },
    { cc: '+886', label: '🇹🇼 +886 Taiwan' },
    { cc: '+65',  label: '🇸🇬 +65 Singapore' },
    { cc: '+60',  label: '🇲🇾 +60 Malaysia' },
    { cc: '+66',  label: '🇹🇭 +66 Thailand' },
    { cc: '+63',  label: '🇵🇭 +63 Philippines' },
    { cc: '+62',  label: '🇮🇩 +62 Indonesia' },
    { cc: '+61',  label: '🇦🇺 +61 Australia' },
    { cc: '+49',  label: '🇩🇪 +49 Germany' },
    { cc: '+33',  label: '🇫🇷 +33 France' },
    { cc: '+39',  label: '🇮🇹 +39 Italy' },
    { cc: '+34',  label: '🇪🇸 +34 Spain' },
    { cc: '+971', label: '🇦🇪 +971 UAE' },
    { cc: '+966', label: '🇸🇦 +966 Saudi Arabia' },
    { cc: '+91',  label: '🇮🇳 +91 India' },
    { cc: '+55',  label: '🇧🇷 +55 Brazil' },
    { cc: '+52',  label: '🇲🇽 +52 Mexico' },
  ];

  let _accountState = {
    pendingAvatarUrl: null,   // set after upload, cleared after save
    pendingAvatarPos: null,   // '50 50' style (object-position %)
  };

  async function _renderAccount(root) {
    root.innerHTML = '';
    root.appendChild(h('div', { className: 'dp-page-head' }, [
      h('div', {}, [
        h('h1', {}, 'My account'),
        h('div', { className: 'meta' }, 'Edit your profile, contact info, and password. Avatar updates take effect immediately across the app.'),
      ]),
    ]));

    const loading = h('div', { className: 'dp-panel' });
    loading.innerHTML = '<div class="dp-panel-body pad" style="color:var(--text-3)">Loading profile…</div>';
    root.appendChild(loading);

    // Fetch fresh /me so the page always reflects server-side truth (avatar,
    // department, etc. may have changed since last localStorage cache).
    const [meRes, deptRes] = await Promise.all([
      api('GET', 'me'),
      api('GET', 'departments').catch(() => null),
    ]);
    loading.remove();
    const user = (meRes && meRes.user) || null;
    if (!user) return;
    // Reset pending avatar buffer on fresh render.
    _accountState = { pendingAvatarUrl: null, pendingAvatarPos: null };

    const depts = (deptRes && deptRes.departments) || [];
    const deptOpts = ['<option value="">— none —</option>']
      .concat(depts.map(d => `<option value="${esc(d.name)}"${user.department === d.name ? ' selected' : ''}>${esc(d.name)}</option>`))
      .join('');

    // Parse stored phone "+82 10-1234-5678" into CC + number.
    let phoneCC = '+82', phoneNum = '';
    const phoneStr = user.phone || '';
    const m = phoneStr.match(/^(\+\d+)\s+(.*)$/);
    if (m) { phoneCC = m[1]; phoneNum = m[2]; }
    else if (phoneStr) { phoneNum = phoneStr; }
    const phoneOpts = PHONE_CODES.map(p =>
      `<option value="${esc(p.cc)}"${phoneCC === p.cc ? ' selected' : ''}>${esc(p.label)}</option>`
    ).join('');

    const initials = (user.display_name || user.username || '?')
      .split(/\s+/).map(s => s.charAt(0)).join('').toUpperCase().slice(0, 2);
    const avatarPos = (user.avatar_pos || '50 50').split(' ');
    const avatarInner = user.avatar_url
      ? `<img id="dp-acct-avatar-img" src="${esc(user.avatar_url)}" alt="Avatar"
             style="width:100%;height:100%;object-fit:cover;object-position:${esc(avatarPos[0])}% ${esc(avatarPos[1])}%;cursor:grab;user-select:none;-webkit-user-drag:none" draggable="false">`
      : `<span style="font-size:48px;font-weight:700;color:#fff">${esc(initials)}</span>`;

    const panel = h('div', { className: 'dp-panel' });
    panel.innerHTML = `
      <div class="dp-panel-head"><h3>Profile</h3></div>
      <div class="dp-panel-body pad" style="display:grid;grid-template-columns:240px 1fr;gap:24px;align-items:flex-start">
        <div class="dp-acct-avatar-col">
          <div class="dp-acct-avatar" id="dp-acct-avatar">${avatarInner}</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">
            <label class="dp-btn dp-btn-secondary dp-btn-sm" style="cursor:pointer;justify-content:center">
              <span>${user.avatar_url ? 'Change photo' : 'Upload photo'}</span>
              <input type="file" id="dp-acct-file" accept="image/*" style="display:none"
                     onchange="DP._handleAvatarPick(this)">
            </label>
            ${user.avatar_url
              ? '<button class="dp-btn dp-btn-danger dp-btn-sm" onclick="DP._removeAccountAvatar()">Remove photo</button>'
              : ''}
            <div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:4px">
              JPG / PNG · max 10MB · drag to reposition after upload
            </div>
          </div>
        </div>

        <div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="dp-field">
              <label for="dp-acct-name">Display name</label>
              <input class="dp-input" id="dp-acct-name" value="${esc(user.display_name || '')}" maxlength="100">
            </div>
            <div class="dp-field">
              <label for="dp-acct-role">Role / title</label>
              <input class="dp-input" id="dp-acct-role" value="${esc(user.role_title || '')}" placeholder="e.g. PMO lead" maxlength="100">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="dp-field">
              <label for="dp-acct-email">Email</label>
              <input class="dp-input" id="dp-acct-email" type="email" value="${esc(user.email || '')}" maxlength="200">
            </div>
            <div class="dp-field">
              <label for="dp-acct-dept">Department</label>
              <select class="dp-select" id="dp-acct-dept">${deptOpts}</select>
            </div>
          </div>
          <div class="dp-field">
            <label for="dp-acct-phone-num">Phone</label>
            <div style="display:flex;gap:8px">
              <select class="dp-select" id="dp-acct-phone-cc" style="width:200px">${phoneOpts}</select>
              <input class="dp-input" id="dp-acct-phone-num" type="tel"
                     value="${esc(phoneNum)}" placeholder="10-1234-5678" style="flex:1" maxlength="30">
            </div>
          </div>
          <div class="dp-field" style="margin-bottom:0">
            <label for="dp-acct-note">Emergency note</label>
            <textarea class="dp-textarea" id="dp-acct-note" maxlength="500"
                      placeholder="e.g. Reach me on KakaoTalk after 6pm KST">${esc(user.emergency_note || '')}</textarea>
          </div>
        </div>
      </div>
      <div class="dp-modal-foot" style="border-top:var(--bd)">
        <button class="dp-btn dp-btn-primary" onclick="DP._saveAccount()">Save profile</button>
      </div>
    `;
    root.appendChild(panel);

    // Password card
    const pw = h('div', { className: 'dp-panel' });
    pw.innerHTML = `
      <div class="dp-panel-head"><h3>Change password</h3></div>
      <div class="dp-panel-body pad">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="dp-field">
            <label for="dp-acct-pw-cur">Current password</label>
            <input class="dp-input" id="dp-acct-pw-cur" type="password" autocomplete="current-password">
          </div>
          <div class="dp-field">
            <label for="dp-acct-pw-new">New password</label>
            <input class="dp-input" id="dp-acct-pw-new" type="password" autocomplete="new-password" placeholder="Min 6 characters">
          </div>
          <div class="dp-field">
            <label for="dp-acct-pw-confirm">Confirm new password</label>
            <input class="dp-input" id="dp-acct-pw-confirm" type="password" autocomplete="new-password">
          </div>
        </div>
      </div>
      <div class="dp-modal-foot" style="border-top:var(--bd)">
        <button class="dp-btn dp-btn-primary" onclick="DP._changeAccountPassword()">Update password</button>
      </div>
    `;
    root.appendChild(pw);

    // Wire up drag-to-reposition on the avatar if an image exists.
    if (user.avatar_url) _initAvatarDrag(avatarPos.map(Number));
  }

  // Drag the avatar image inside its circular viewport to reposition focal
  // point. Updates object-position live and stores the final % in the
  // img's dataset.pos for _saveAccount to pick up.
  function _initAvatarDrag(initialPos) {
    const img = $('#dp-acct-avatar-img');
    if (!img) return;
    let pos = initialPos.slice();
    let dragging = false, sx = 0, sy = 0, startPos = null;
    img.dataset.pos = pos.join(' ');
    img.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true; sx = e.clientX; sy = e.clientY; startPos = pos.slice();
      img.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const w = img.parentElement.offsetWidth, h = img.parentElement.offsetHeight;
      const dx = (e.clientX - sx) / w * 100;
      const dy = (e.clientY - sy) / h * 100;
      pos[0] = Math.max(0, Math.min(100, startPos[0] - dx));
      pos[1] = Math.max(0, Math.min(100, startPos[1] - dy));
      img.style.objectPosition = pos[0] + '% ' + pos[1] + '%';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      img.style.cursor = 'grab';
      img.dataset.pos = pos.join(' ');
    });
  }

  // Client-side flow: validate → open 1:1 crop modal → canvas-render →
  // upload → stash URL in _accountState until Save Profile.
  const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
  function _handleAvatarPick(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Please select an image file.', 'err'); input.value = ''; return; }
    if (file.size > AVATAR_MAX_BYTES) {
      toast('Image is over 10MB. Pick a smaller one or crop first.', 'err');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => _openAvatarCrop(e.target.result, file.type);
    reader.onerror = () => toast('Failed to read image', 'err');
    reader.readAsDataURL(file);
    input.value = '';
  }

  // 1:1 crop UI — loaded image sits inside a 320×320 viewport; user drags to
  // pan and uses the zoom slider (100–400%) to scale. Commit crops to a 512×512
  // canvas and posts as PNG. Keeping output to 512 so R2 storage stays small.
  function _openAvatarCrop(dataUrl, mime) {
    _openModal(
      'Crop your avatar',
      `
      <p style="margin-top:0;color:var(--text-3);font-size:12px">
        Drag the image to pan. Use the slider to zoom. Output is square (1:1) · 512×512.
      </p>
      <div class="dp-crop-wrap">
        <div class="dp-crop-box" id="dp-crop-box">
          <canvas id="dp-crop-canvas" width="512" height="512"></canvas>
        </div>
        <div class="dp-crop-ctrls">
          <label for="dp-crop-zoom" style="font-size:12px;color:var(--text-2)">Zoom</label>
          <input type="range" id="dp-crop-zoom" min="100" max="400" value="100" step="5" style="flex:1">
          <span id="dp-crop-zoom-val" class="mono" style="font-size:12px;color:var(--text-3);width:48px;text-align:right">100%</span>
        </div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" id="dp-crop-apply" onclick="DP._applyAvatarCrop()">Apply</button>`
    );

    const img = new Image();
    img.onload = () => {
      const canvas = $('#dp-crop-canvas');
      const ctx = canvas.getContext('2d');
      // Fit whole image inside 512×512 viewport at zoom=100.
      const baseScale = 512 / Math.max(img.width, img.height);
      let zoom = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, sTx = 0, sTy = 0;

      const draw = () => {
        ctx.clearRect(0, 0, 512, 512);
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, 512, 512);
        const s = baseScale * zoom;
        const dw = img.width * s;
        const dh = img.height * s;
        const dx = (512 - dw) / 2 + tx;
        const dy = (512 - dh) / 2 + ty;
        ctx.drawImage(img, dx, dy, dw, dh);
      };
      draw();

      // Pan via mouse drag on the canvas.
      canvas.style.cursor = 'grab';
      canvas.addEventListener('mousedown', e => {
        dragging = true; sx = e.clientX; sy = e.clientY; sTx = tx; sTy = ty;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) return;
        // 1 canvas pixel per CSS pixel of movement (canvas is rendered at 320 logical px).
        const rect = canvas.getBoundingClientRect();
        const ratioX = 512 / rect.width;
        const ratioY = 512 / rect.height;
        tx = sTx + (e.clientX - sx) * ratioX;
        ty = sTy + (e.clientY - sy) * ratioY;
        draw();
      });
      window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = 'grab';
      });

      const zoomEl = $('#dp-crop-zoom');
      const zoomVal = $('#dp-crop-zoom-val');
      zoomEl.addEventListener('input', () => {
        zoom = Number(zoomEl.value) / 100;
        zoomVal.textContent = zoomEl.value + '%';
        draw();
      });

      // Stash canvas ref for _applyAvatarCrop.
      window.__dpCropCtx = { canvas, mime };
    };
    img.src = dataUrl;
  }

  async function _applyAvatarCrop() {
    const ctx = window.__dpCropCtx;
    if (!ctx || !ctx.canvas) { _closeModal(); return; }
    const btn = $('#dp-crop-apply');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    // JPEG at 0.9 keeps quality high while producing 60-120KB files for a
    // 512×512 viewport — 3-5× smaller than PNG, which matters because the
    // avatar is loaded on every page (sidebar + account + contacts roster).
    // The cropped canvas already has a solid background (#111827 fill), so
    // transparency is not a concern.
    const blob = await new Promise(res => ctx.canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
      toast('Could not process image', 'err');
      return;
    }
    const fd = new FormData();
    fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    let uploadRes;
    try {
      const r = await fetch('/api/dreampath/upload', {
        method: 'POST', body: fd, credentials: 'same-origin',
      });
      uploadRes = await r.json();
      if (!r.ok) throw new Error(uploadRes && uploadRes.error || 'Upload failed');
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
      toast(String(err && err.message || err), 'err');
      return;
    }

    _accountState.pendingAvatarUrl = uploadRes.url;
    _accountState.pendingAvatarPos = '50 50';
    // Re-render the avatar cell instantly so the user sees the new photo.
    const host = $('#dp-acct-avatar');
    if (host) {
      host.innerHTML = `<img id="dp-acct-avatar-img" src="${esc(uploadRes.url)}" alt="Avatar"
        style="width:100%;height:100%;object-fit:cover;object-position:50% 50%;cursor:grab;user-select:none;-webkit-user-drag:none" draggable="false">`;
      _initAvatarDrag([50, 50]);
    }
    _closeModal();
    toast('Photo uploaded — press Save profile to apply.', 'ok');
  }

  async function _removeAccountAvatar() {
    if (!confirm('Remove profile photo?')) return;
    _accountState.pendingAvatarUrl = '';
    _accountState.pendingAvatarPos = '50 50';
    const data = await api('PUT', 'me', { avatar_url: null, avatar_pos: '50 50' });
    if (!data) return;
    toast('Photo removed.', 'ok');
    if (data.user) _acceptUser(data.user);
    _refreshSidebarUser();
    navigate('account');
  }

  async function _saveAccount() {
    const phoneCC  = ($('#dp-acct-phone-cc').value || '').trim();
    const phoneNum = ($('#dp-acct-phone-num').value || '').trim();
    // Strip common separators for validation, then accept digit-only 6–14 chars.
    // Same pattern used server-side in me.js PUT so the client catches most
    // mistakes before the round-trip, but the server is the final gate.
    if (phoneNum) {
      const digitsOnly = phoneNum.replace(/[\s\-().]/g, '');
      if (!/^\d{6,14}$/.test(digitsOnly)) {
        toast('Phone number must be 6–14 digits (separators like - or space are OK)', 'err');
        $('#dp-acct-phone-num').focus();
        return;
      }
    }
    const phone = phoneNum ? (phoneCC + ' ' + phoneNum) : null;
    const body = {
      display_name:   ($('#dp-acct-name').value || '').trim(),
      role_title:     ($('#dp-acct-role').value || '').trim() || null,
      email:          ($('#dp-acct-email').value || '').trim() || null,
      department:     ($('#dp-acct-dept').value || '').trim() || null,
      phone,
      emergency_note: ($('#dp-acct-note').value || '').trim() || null,
    };
    if (!body.display_name) { toast('Display name is required', 'err'); return; }

    // Pending avatar from crop flow. Empty string = explicit remove.
    if (_accountState.pendingAvatarUrl !== null) {
      body.avatar_url = _accountState.pendingAvatarUrl || null;
      body.avatar_pos = _accountState.pendingAvatarPos || '50 50';
    }
    // Pick up latest drag position even without a new upload.
    const imgEl = $('#dp-acct-avatar-img');
    if (imgEl && imgEl.dataset.pos && body.avatar_pos === undefined) {
      body.avatar_pos = imgEl.dataset.pos;
    }

    const data = await api('PUT', 'me', body);
    if (!data) return;
    toast('Profile saved.', 'ok');
    _accountState = { pendingAvatarUrl: null, pendingAvatarPos: null };
    if (data.user) _acceptUser(data.user);
    _refreshSidebarUser();
  }

  async function _changeAccountPassword() {
    const cur = $('#dp-acct-pw-cur').value || '';
    const next = $('#dp-acct-pw-new').value || '';
    const conf = $('#dp-acct-pw-confirm').value || '';
    if (!cur || !next || !conf) { toast('All password fields are required', 'err'); return; }
    if (next.length < 6) { toast('New password must be at least 6 characters', 'err'); return; }
    if (next !== conf) { toast('New passwords do not match', 'err'); return; }
    const data = await api('PUT', 'me', { current_password: cur, new_password: next });
    if (!data) return;
    toast('Password updated.', 'ok');
    $('#dp-acct-pw-cur').value = '';
    $('#dp-acct-pw-new').value = '';
    $('#dp-acct-pw-confirm').value = '';
  }

  // Refresh the sidebar avatar + name strip after profile changes.
  function _refreshSidebarUser() {
    const nameEl = document.querySelector('.dp-side-user .who');
    if (nameEl) nameEl.textContent = _displayName();
    const avaEl = document.querySelector('.dp-side-user .dp-avatar');
    if (avaEl) {
      if (state.user && state.user.avatar_url) {
        avaEl.innerHTML = '';
        avaEl.style.backgroundImage = 'url(' + state.user.avatar_url + ')';
        avaEl.style.backgroundSize = 'cover';
        avaEl.style.backgroundPosition = 'center';
        avaEl.textContent = '';
      } else {
        avaEl.style.backgroundImage = '';
        avaEl.textContent = _avatarChar();
      }
    }
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
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath/icons/plus.svg')" } }),
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
        <div class="mark"><span class="ico" style="--dp-icon:url('/img/dreampath/icons/file-text.svg')"></span></div>
        <h4>No versions logged</h4>
        <p>./deploy.sh registers a version on each production push.</p>
      `;
      root.appendChild(empty);
      return;
    }

    // [CASE STUDY — Dreampath bilingual version notes]
    // Current rows store JSON so the Versions page can render a stable
    // Korean/English table. Older rows are still accepted as plain text.
    function parseChangelog(desc) {
      const raw = String(desc || '').replace(/\r\n/g, '\n').trim();
      if (!raw) return { excluded: false, summary: '', summary_en: '', summary_ko: '', context_en: '', context_ko: '', changes: [] };
      if (raw.charAt(0) === '{') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.format === 'dp-version-v2') {
            return {
              excluded: parsed.scope === 'excluded',
              summary: (parsed.summary && (parsed.summary.ko || parsed.summary.en)) || '',
              summary_en: (parsed.summary && parsed.summary.en) || '',
              summary_ko: (parsed.summary && parsed.summary.ko) || '',
              context_en: (parsed.context && parsed.context.en) || '',
              context_ko: (parsed.context && parsed.context.ko) || '',
              changes: Array.isArray(parsed.changes) ? parsed.changes : [],
            };
          }
        } catch (_) {}
      }
      const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
      const summary = lines[0] || '';
      const changes = lines.slice(1).map(s => {
        const text = s.replace(/^[-•·*]\s*/, '');
        return { en: text, ko: text };
      }).filter(x => x.en || x.ko);
      return { excluded: false, summary, summary_en: summary, summary_ko: summary, context_en: '', context_ko: '', changes };
    }

    function renderVersionNote(cl, compact) {
      const rows = cl.changes && cl.changes.length
        ? cl.changes
        : [{ en: cl.summary_en || cl.summary || '', ko: cl.summary_ko || cl.summary || '' }];
      const context = cl.context_en || cl.context_ko ? `
        <div style="margin-top:${compact ? '8px' : '12px'};font-size:${compact ? 'var(--fs-12)' : 'var(--fs-13)'};line-height:1.65;color:var(--text-2)">
          <strong style="color:var(--text)">Context</strong>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:6px">
            <div>${esc(cl.context_en || '')}</div>
            <div>${esc(cl.context_ko || '')}</div>
          </div>
        </div>
      ` : '';
      return `
        <div style="font-size:${compact ? 'var(--fs-13)' : 'var(--fs-15)'};color:var(--text);font-weight:600;margin-bottom:10px;line-height:1.45">
          ${esc(cl.summary_ko || cl.summary || '(no summary)')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:${compact ? 'var(--fs-12)' : 'var(--fs-13)'};line-height:1.6">
          <thead>
            <tr>
              <th style="width:50%;text-align:left;padding:7px 8px;border-bottom:1px solid var(--g-200);color:var(--text-2)">English</th>
              <th style="width:50%;text-align:left;padding:7px 8px;border-bottom:1px solid var(--g-200);color:var(--text-2)">Korean</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td style="vertical-align:top;padding:8px;border-bottom:1px solid var(--g-100);color:var(--text-2)">${esc(row.en || '')}</td>
                <td style="vertical-align:top;padding:8px;border-bottom:1px solid var(--g-100);color:var(--text-2)">${esc(row.ko || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${context}
      `;
    }

    const typeTone = (t) => t === 'feature' ? 'info' : t === 'bugfix' ? 'warn' : 'neutral';
    const typeLabel = { feature: 'Feature', bugfix: 'Fix', initial: 'Initial' };

    const visibleVersions = versions.filter(v => !parseChangelog(v.description).excluded);
    const latest = visibleVersions[0];
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
        ${renderVersionNote(latestCl, false)}
      </div>
    `;
    root.appendChild(hero);

    // Release history — paginated, 20 cards per page (BP Media style).
    const PAGE_SIZE = 20;
    const rest = visibleVersions.slice(1);  // skip the hero latest
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
          ${renderVersionNote(cl, true)}
        </div>
      `;
      list.appendChild(card);
    });
    root.appendChild(list);

    if (rest.length > PAGE_SIZE) {
      // Numbered pagination shared with Activity log. _verPageGoto takes an
      // absolute 0-based index, unlike legacy _verPage(delta).
      const pager = h('div');
      pager.innerHTML = _buildPager(state.versionsPage, totalPages, '_verPageGoto');
      root.appendChild(pager);
    }

    // Version format guide (BP Media-style aa.bbb.cc)
    const guide = h('div', { className: 'dp-panel', style: { marginTop: '20px' } });
    guide.innerHTML = `
      <div class="dp-panel-head"><h3>Version number rules</h3></div>
      <div class="dp-panel-body pad" style="padding:16px 20px">
        <table style="width:100%;border-collapse:collapse;font-size:var(--fs-13)">
          <tr>
            <td style="width:70px;font-family:var(--font-mono);font-weight:500;color:var(--accent);padding:6px 0;vertical-align:top">aa</td>
            <td style="padding:6px 0"><strong>Major</strong> — set manually by the project owner. Represents a full redesign or major milestone.</td>
          </tr>
          <tr>
            <td style="font-family:var(--font-mono);font-weight:500;color:var(--accent);padding:6px 0;vertical-align:top">bbb</td>
            <td style="padding:6px 0"><strong>Feature</strong> — bumped when a new feature is added or an existing one is significantly changed. <code>cc</code> resets to <code>00</code>.</td>
          </tr>
          <tr>
            <td style="font-family:var(--font-mono);font-weight:500;color:var(--accent);padding:6px 0;vertical-align:top">cc</td>
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
  function _verPageGoto(p) {
    state.versionsPage = Math.max(0, Number(p) || 0);
    navigate('versions');
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
  // _closeModal force-closes the modal unconditionally. Use this ONLY when
  // the user has explicitly chosen to dismiss (Cancel / close button / after
  // saving). For outside-click and Esc we go through _requestCloseModal()
  // which offers to save a draft when the New Post editor has content.
  function _closeModal() {
    _destroyTiptap();
    _pickerFiles = [];
    const b = $('#dp-modal-backdrop');
    if (b) b.remove();
    const m = $('#dp-modal');
    if (m) m.remove();
  }
  // Snapshot of the active modal's "is this a draftable editor?" state,
  // captured when _openModal runs. The New Post flow sets this true; other
  // modals leave it false so their outside-click closes immediately.
  let _modalDraftContext = null;

  function _requestCloseModal() {
    // No modal → nothing to do.
    if (!document.getElementById('dp-modal')) return;
    if (!_modalDraftContext) { _closeModal(); return; }
    // Snapshot current editor state. If empty (untouched form) just close —
    // no point asking to save an empty draft.
    const snap = _snapshotPostEditor();
    if (!snap || (!snap.title && !snap.content && !snap.files.length)) {
      _closeModal();
      return;
    }
    _openDraftPrompt(snap);
  }

  function _openModal(title, bodyHtml, footButtons, opts) {
    _closeModal();
    _modalDraftContext = (opts && opts.draftContext) || null;
    const wide = opts && opts.wide;
    const bodyClass = opts && opts.bodyClass ? ' ' + opts.bodyClass : '';
    const backdrop = h('div', {
      className: 'dp-modal-backdrop',
      id: 'dp-modal-backdrop',
      // Outside-click routes through _requestCloseModal so New Post can
      // offer to save a draft instead of silently destroying the content.
      onclick: _requestCloseModal,
    });
    const modal = h('aside', {
      className: 'dp-modal' + (wide ? ' dp-modal-wide' : ''),
      id: 'dp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    });
    modal.addEventListener('click', e => e.stopPropagation());
    modal.innerHTML = `
      <div class="dp-modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="dp-iconbtn" aria-label="Close" onclick="DP._requestCloseModal()">
          <span class="ico" style="--dp-icon:url('/img/dreampath/icons/x.svg')"></span>
        </button>
      </div>
      <div class="dp-modal-body${bodyClass}">${bodyHtml}</div>
      <div class="dp-modal-foot">${footButtons || ''}</div>
    `;
    document.body.appendChild(backdrop);
    // Mount modal INSIDE the backdrop so the grid-centered layout applies.
    backdrop.appendChild(modal);
  }

  // Pulls the live state of the New Post editor so we can stash it as a
  // draft. Returns null when the modal isn't the post editor.
  function _snapshotPostEditor() {
    const boardSel = document.getElementById('dp-new-board');
    const titleEl  = document.getElementById('dp-new-title');
    if (!boardSel || !titleEl) return null;
    const tabSel = document.getElementById('dp-new-tab');
    return {
      board:   boardSel.value || '',
      tab_slug: tabSel ? tabSel.value : '',
      title:   (titleEl.value || '').trim(),
      content: _getTiptapHTML(),
      files:   _pickerFiles.map(f => ({ url: f.url, name: f.name, type: f.type, size: f.size, is_image: f.is_image })),
      approvers: _approverPicked.slice(),
    };
  }

  function _openDraftPrompt(snap) {
    // Lightweight nested confirmation. Shows above the (still mounted)
    // editor; does NOT call _openModal (that would destroy the editor).
    // Existing backdrop catches clicks; this just injects a small card.
    if (document.getElementById('dp-draft-prompt')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dp-draft-prompt';
    overlay.className = 'dp-draft-prompt-wrap';
    overlay.innerHTML = `
      <div class="dp-draft-prompt">
        <h3>Save draft before closing?</h3>
        <p>Your post has unsaved content. Drafts are kept per board, up to 3 each.</p>
        <div class="dp-draft-prompt-foot">
          <button class="dp-btn dp-btn-secondary" onclick="DP._draftPromptCancel()">Keep editing</button>
          <button class="dp-btn dp-btn-danger"    onclick="DP._draftPromptDiscard()">Discard</button>
          <button class="dp-btn dp-btn-primary"   onclick="DP._draftPromptSave()">Save draft</button>
        </div>
      </div>
    `;
    // Attach inside the backdrop so it sits on top of the modal.
    const backdrop = document.getElementById('dp-modal-backdrop');
    (backdrop || document.body).appendChild(overlay);
    overlay.addEventListener('click', e => e.stopPropagation());
    // Stash the snapshot so save handler doesn't have to re-read DOM.
    window.__dpDraftSnap = snap;
  }
  function _draftPromptCancel() {
    const o = document.getElementById('dp-draft-prompt');
    if (o) o.remove();
  }
  function _draftPromptDiscard() {
    _draftPromptCancel();
    _closeModal();
  }
  async function _draftPromptSave() {
    const snap = window.__dpDraftSnap;
    if (!snap) { _draftPromptCancel(); return; }
    const body = {
      board: snap.board,
      tab_slug: snap.tab_slug || null,
      title: snap.title,
      content: snap.content,
      files: snap.files,
      approvers: snap.approvers,
    };
    const res = await _rawApi('POST', 'drafts', body);
    if (res.status === 409) {
      // Full — ask which to overwrite. Pick oldest for simplicity.
      const oldest = (res.data && res.data.existing || []).sort((a, b) =>
        String(a.updated_at).localeCompare(String(b.updated_at)))[0];
      if (oldest && confirm('Draft slot full (3). Overwrite the oldest ("' + (oldest.title || 'Untitled') + '")?')) {
        body.overwrite_id = oldest.id;
        const r2 = await api('POST', 'drafts', body);
        if (r2) { toast('Draft saved (overwrote oldest)', 'ok'); _draftPromptCancel(); _closeModal(); }
      } else {
        _draftPromptCancel();
      }
      return;
    }
    if (!res.ok) {
      toast(res.error || 'Could not save draft', 'err');
      _draftPromptCancel();
      return;
    }
    toast('Draft saved', 'ok');
    _draftPromptCancel();
    _closeModal();
  }

  async function viewPost(board, id) {
    // Show an immediate loading shell so the user sees feedback while we fetch.
    // Wide variant: post bodies can be long (content + files + approvals +
    // history + comments) and feel cramped inside the 820px default modal.
    const postId = Number(id);
    _openModal('Loading…', '<div style="color:var(--text-3);padding:40px 0;text-align:center">Loading post…</div>',
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>`,
      { wide: true });

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
    // Approvals section — when the current user is one of the approvers, pull
     // their row to the top and tag it clearly. Previously the approvals list
     // sorted by created_at, so a user who had already voted couldn't find
     // their own line at a glance. Now "YOUR VOTE" banner surfaces status +
     // voted_at, and the row is highlighted with accent.
    const myLowerNames = _myLowerNames();
    const isMine = (nm) => myLowerNames.indexOf(String(nm || '').toLowerCase()) >= 0;
    const myApproval = _myApprovalForPost(p);
    const myApproverEncoded = encodeURIComponent(String((myApproval && myApproval.approver_name) || ''));
    // Your-vote banner — four flavors explicit:
     //  a) pending + I can still vote → Approve / Reject buttons inline
     //  b) already voted (approved|rejected) → result chip + Change button
     //  c) minutes post but I'm NOT an approver → grey "Not an approver" notice
     //  d) not a minutes post at all → banner hidden
    const isMinutesPost = String(p.board || '') === 'minutes';
    const footerVoteButtons = _canVoteOnPost(p)
      ? `<button class="dp-btn dp-btn-danger" onclick="DP._inlineReject(${Number(p.id)}, '${myApproverEncoded}')">Reject</button>
         <button class="dp-btn dp-btn-primary" onclick="DP._inlineApprove(${Number(p.id)}, '${myApproverEncoded}')">Approve</button>`
      : '';
    const myVoteBanner = (() => {
      if (!isMinutesPost) return '';  // case (d)
      if (!myApproval) {
        // case (c) — post is a minute but this user is not on the approvers
        // list. Subtle muted banner so the user knows voting UI doesn't apply.
        return `
          <div style="margin:14px 0 6px;padding:10px 14px;border:1px solid var(--g-200);border-radius:var(--r-sm);background:var(--surface-2);display:flex;gap:10px;align-items:center;color:var(--text-3);font-size:12px">
            <strong style="font-size:var(--fs-12);letter-spacing:0.04em;text-transform:uppercase;color:var(--text-2)">Your vote</strong>
            <span>— You are not listed as an approver for this minute.</span>
          </div>
        `;
      }
      const statusLabel = myApproval.status;
      const isVoted = statusLabel === 'approved' || statusLabel === 'rejected';
      const tone = statusLabel === 'approved' ? 'ok' : statusLabel === 'rejected' ? 'alert' : 'warn';
      const buttons = !isVoted
        ? `<button class="dp-btn dp-btn-primary dp-btn-sm"
                   style="margin-left:auto"
                   onclick="DP._inlineApprove(${Number(p.id)}, '${myApproverEncoded}')">✓ Approve</button>
           <button class="dp-btn dp-btn-danger dp-btn-sm"
                   onclick="DP._inlineReject(${Number(p.id)}, '${myApproverEncoded}')">✗ Reject</button>`
        : `<span class="mono" style="color:var(--text-3);font-size:11px;margin-left:auto">
             ${myApproval.voted_at ? 'voted ' + esc(fmtTime(myApproval.voted_at)) : ''}
           </span>
           <button class="dp-btn dp-btn-ghost dp-btn-sm"
                   onclick="DP._revertMyVote(${Number(p.id)}, '${myApproverEncoded}')"
                   title="Re-set my vote to pending">Change</button>`;
      return `
        <div style="margin:14px 0 6px;padding:12px 14px;border:1px solid var(--accent);border-radius:var(--r-sm);background:var(--info-bg);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <strong style="color:var(--accent);font-size:var(--fs-12);letter-spacing:0.04em;text-transform:uppercase">Your vote</strong>
          <span class="dp-tag ${tone}">${esc(statusLabel)}</span>
          ${isVoted ? '' : '<span style="color:var(--text-2);font-size:12px">— cast your decision</span>'}
          ${buttons}
        </div>
      `;
    })();
    const approvalsHtml = (p.approvals || []).length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:8px">Approvals</div>
        ${myVoteBanner}
        ${(p.approvals || []).map(a => {
          const mineRow = isMine(a.approver_name);
          return `
            <div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:var(--fs-12);${mineRow ? 'background:var(--info-bg);padding-left:8px;padding-right:8px;border-radius:var(--r-sm)' : ''}">
              <strong style="${mineRow ? 'color:var(--accent)' : ''}">${esc(a.approver_name)}${mineRow ? ' (you)' : ''}</strong>
              <span class="dp-tag ${a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'alert' : 'warn'}">${esc(a.status)}</span>
              ${a.voted_at ? `<span class="mono" style="color:var(--text-3);margin-left:auto">${esc(fmtTime(a.voted_at))}</span>` : ''}
            </div>
          `;
        }).join('')}
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
      <div class="dp-post-meta-bar">
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
      <div id="dp-comments-section" style="margin-top:24px;padding-top:18px;border-top:1px solid var(--g-150)">
        <div class="dp-h2" style="margin-bottom:12px">Comments</div>
        <div id="dp-comments-list" style="color:var(--text-3);font-size:12px">Loading comments…</div>
        <div style="margin-top:14px;display:flex;gap:8px;align-items:flex-end">
          <textarea class="dp-textarea" id="dp-comment-input"
                    placeholder="Write a comment…" style="min-height:70px;flex:1"></textarea>
          <button class="dp-btn dp-btn-primary" onclick="DP._postComment(${Number(p.id)})">Post</button>
        </div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._closeModal()">Close</button>
       ${_hasPerm('write:tasks') ? `<button class="dp-btn dp-btn-secondary" onclick="DP._openTaskEditor({ related_post_id: ${Number(p.id)}, source_type: 'post', source_ref_id: ${Number(p.id)}, title: 'Follow up post ${Number(p.id)}' })">Create task</button>` : ''}
       ${canEdit ? `<button class="dp-btn dp-btn-secondary" onclick="DP._editPost('${esc(p.board)}', ${Number(p.id)})">Edit</button>` : ''}
       ${canDelete ? `<button class="dp-btn dp-btn-danger" onclick="DP._deletePost('${esc(p.board)}', ${Number(p.id)})">Delete</button>` : ''}
       ${footerVoteButtons}`,
      { wide: true, bodyClass: 'dp-post-view' }
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
    const mine = _myApprovalForPost(p);
    return !!(mine && mine.status === 'pending');
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
    const byParent = new Map();
    comments.forEach(c => {
      const parentId = Number(c.parent_id || 0);
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(c);
    });
    const knownIds = new Set(comments.map(c => Number(c.id)));
    const roots = comments.filter(c => {
      const parentId = Number(c.parent_id || 0);
      return !parentId || !knownIds.has(parentId);
    });
    const renderComment = (c, depth) => {
      const mine = c.author_id === (state.user && state.user.uid);
      const canDelete = isAdmin || mine;
      const children = byParent.get(Number(c.id)) || [];
      const maxDepth = Math.min(Number(depth || 0), 4);
      const inset = maxDepth ? 'margin-left:' + Math.min(maxDepth * 18, 72) + 'px;border-left:2px solid var(--g-150);padding-left:10px;' : '';
      return `
        <div style="${inset}margin-bottom:6px">
          <div style="padding:10px 12px;border:var(--bd);border-radius:var(--r-sm);background:var(--g-050)">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;font-size:11px;color:var(--text-3);margin-bottom:4px">
            <span><strong style="color:var(--text-2);font-weight:500">${esc(c.author_name || 'Anon')}</strong>
                  <span class="mono" style="margin-left:6px">${esc(fmtTime(c.created_at))}</span></span>
            <span style="display:inline-flex;gap:4px;align-items:center">
              <button type="button" class="dp-btn dp-btn-ghost dp-btn-sm" style="padding:0 6px;font-size:11px"
                      onclick="DP._showCommentReply(${postId}, ${Number(c.id)})">Reply</button>
              ${_hasPerm('write:tasks') ? `<button type="button" class="dp-btn dp-btn-ghost dp-btn-sm" style="padding:0 6px;font-size:11px"
                      onclick="DP._openTaskEditor({ related_post_id: ${Number(postId)}, source_type: 'comment', source_ref_id: ${Number(c.id)}, title: 'Follow up comment ${Number(c.id)}' })">Task</button>` : ''}
              ${canDelete ? `<button type="button" class="dp-btn dp-btn-ghost dp-btn-sm" style="padding:0 6px;font-size:11px"
                                     onclick="DP._deleteComment(${Number(c.id)}, ${postId})">Delete</button>` : ''}
            </span>
          </div>
          <div style="font-size:var(--fs-13);color:var(--text);white-space:pre-wrap">${esc(c.content || '')}</div>
          <div id="dp-comment-reply-slot-${Number(c.id)}"></div>
          </div>
          ${children.map(child => renderComment(child, maxDepth + 1)).join('')}
        </div>
      `;
    };
    host.innerHTML = roots.map(c => renderComment(c, 0)).join('');
  }

  function _showCommentReply(postId, parentId) {
    const slot = $('#dp-comment-reply-slot-' + Number(parentId));
    if (!slot) return;
    slot.innerHTML = `
      <div style="margin-top:10px;display:flex;gap:8px;align-items:flex-end">
        <textarea class="dp-textarea" id="dp-comment-reply-input-${Number(parentId)}"
                  placeholder="Write a reply…" style="min-height:58px;flex:1"></textarea>
        <button class="dp-btn dp-btn-primary" onclick="DP._postComment(${Number(postId)}, ${Number(parentId)})">Reply</button>
        <button class="dp-btn dp-btn-ghost" onclick="DP._cancelCommentReply(${Number(parentId)})">Cancel</button>
      </div>
    `;
    const input = $('#dp-comment-reply-input-' + Number(parentId));
    if (input) input.focus();
  }

  function _cancelCommentReply(parentId) {
    const slot = $('#dp-comment-reply-slot-' + Number(parentId));
    if (slot) slot.innerHTML = '';
  }

  async function _postComment(postId, parentId) {
    const safeParentId = Number(parentId || 0);
    const input = safeParentId ? $('#dp-comment-reply-input-' + safeParentId) : $('#dp-comment-input');
    const content = (input && input.value || '').trim();
    if (!content) { toast('Comment cannot be empty', 'err'); return; }
    const payload = { post_id: postId, content };
    if (safeParentId) payload.parent_id = safeParentId;
    const data = await api('POST', 'comments', payload);
    if (data) {
      if (input) input.value = '';
      if (safeParentId) _cancelCommentReply(safeParentId);
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
    const isAdmin = state.user && state.user.role === 'admin';
    const currentBoard = (state.boards || []).find(b => b.slug === p.board) || { slug: p.board, title: _boardTitle(p.board) };
    _pickerFiles = (p.files || []).map(f => ({
      id: _fileId(),
      url: f.file_url,
      name: f.file_name,
      type: f.file_type,
      size: f.file_size,
      is_image: f.is_image ? 1 : 0,
      state: 'uploaded',
    }));

    const toolbar = _renderTiptapToolbar();

    _openModal(
      'Edit post',
      `
      <div class="dp-field">
        <label>Board</label>
        <div class="dp-board-pick-grid">
          <button type="button" class="dp-board-pick on" disabled>
            <strong>${esc(currentBoard.title || _boardTitle(currentBoard.slug))}</strong>
            <span>${esc(_boardHint(currentBoard))}</span>
          </button>
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-edit-title">Title</label>
        <input class="dp-input" id="dp-edit-title" value="${esc(p.title || '')}">
      </div>
      <div class="dp-field">
        <label>Content <span id="dp-te-charcount" class="mono" style="float:right;font-size:11px;color:var(--text-3)">0 / 50,000</span></label>
        <div class="dp-te-wrapper dp-te-resize">
          <div class="dp-te-toolbar" role="toolbar" aria-label="Editor">${toolbar}</div>
          <div class="dp-te-editor" id="dp-tt-post"></div>
          <div class="dp-te-handle" aria-hidden="true" title="Drag to resize"></div>
        </div>
      </div>
      <div class="dp-field">
        <label>Attachments <span id="dp-file-used" style="font-weight:400;color:var(--text-3);margin-left:6px">${_pickerFiles.length} / ${MAX_FILES} files · ${_fmtSize(_totalFileBytes())} / 100 MB</span></label>
        <div class="dp-file-picker">
          <input type="file" id="dp-edit-files" multiple style="display:none" onchange="DP._handlePickerChange(this)">
          <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm" onclick="document.getElementById('dp-edit-files').click()">
            <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath/icons/plus.svg')"></span>
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
       ${isAdmin ? `<button class="dp-btn dp-btn-danger" onclick="DP._deletePost('${esc(board)}', ${Number(postId)})">Delete</button>` : ''}
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
  // Callers can pass the exact stored approver_name when they have it
  // (home strip / post detail); otherwise we fall back to display name and
  // let the backend's case-insensitive resolver handle it.
  async function _voteApproval(postId, status, approverName) {
    const approverNameParam = encodeURIComponent(_decodeApprovalActor(approverName) || _displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approverNameParam, { status });
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
    { group: 'Suggested', label: 'New task',                    shortcut: 'N',   run: () => _openTaskEditor() },
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
        <span class="ico" aria-hidden="true" style="width:14px;height:14px;background-color:var(--text-3);-webkit-mask:url('/img/dreampath/icons/compass.svg') center/14px 14px no-repeat;mask:url('/img/dreampath/icons/compass.svg') center/14px 14px no-repeat"></span>
        <input type="text" id="dp-cmd-input" placeholder="Jump to a page or action…" autocomplete="off">
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
        <span class="ico" aria-hidden="true" style="width:14px;height:14px;background-color:var(--text-3);-webkit-mask:url('/img/dreampath/icons/search.svg') center/14px no-repeat;mask:url('/img/dreampath/icons/search.svg') center/14px no-repeat"></span>
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
    else if (state.page === 'tasks') _openTaskEditor();
    else if (state.page === 'notes') _openNoteEditor();
    else if (state.page === 'calendar') {
      if (_canCreateCalendarEvent()) _openEventEditor();
      else toast('Only admins can create calendar events.', 'err');
    }
    else _openPostEditor('notice');
  }
  // -------------------------- Notifications --------------------------
  // Bell icon → dropdown panel. Polls every 45s so the unread badge stays
  // accurate without hammering the endpoint. Users can mark one item or all
  // visible notifications as read from the panel.
  async function openNotifs() {
    const data = await api('GET', 'notifications');
    if (!data) return;
    const items = data.notifications || [];
    const body = items.length ? items.map(n => {
      const isUnread = !n.read_at;
      const clickHandler = (n.ref_type === 'post' && n.ref_id)
        ? `DP._notifGo(${Number(n.id)}, '${esc(n.ref_type)}', ${Number(n.ref_id)})`
        : `DP._notifMarkRead(${Number(n.id)})`;
      return `
        <button type="button" class="dp-notif-row${isUnread ? ' is-unread' : ''}" data-notif-id="${Number(n.id)}" onclick="${clickHandler}">
          <div class="dp-notif-main">
            <div class="dp-notif-title">${esc(n.title || '')}</div>
            ${n.body ? `<div class="dp-notif-body">${esc(n.body)}</div>` : ''}
            <div class="dp-notif-meta">
              ${n.actor_name ? `<span>${esc(n.actor_name)}</span><span> · </span>` : ''}
              <span class="mono">${esc(fmtTime(n.created_at))}</span>
            </div>
          </div>
          ${isUnread ? '<span class="dp-notif-dot" aria-label="Unread"></span>' : ''}
        </button>
      `;
    }).join('') : '<div class="dp-notif-empty">No notifications yet.</div>';

    _openModal(
      'Notifications',
      `<div class="dp-notif-list">${body}</div>`,
      items.length
        ? `<button class="dp-btn dp-btn-secondary" onclick="DP._notifMarkAllRead()">Mark all read</button>
           <button class="dp-btn dp-btn-primary" onclick="DP._closeModal()">Close</button>`
        : `<button class="dp-btn dp-btn-primary" onclick="DP._closeModal()">Close</button>`
    );
  }

  async function _notifMarkRead(id) {
    const row = document.querySelector(`.dp-notif-row[data-notif-id="${Number(id)}"]`);
    const wasUnread = !row || row.classList.contains('is-unread');
    if (wasUnread) _bumpNotifBadge(-1);
    if (row) {
      row.classList.remove('is-unread');
      const unreadDot = row.querySelector('.dp-notif-dot');
      if (unreadDot) unreadDot.remove();
    }
    const data = await api('PUT', 'notifications?id=' + Number(id));
    if (!data) _refreshNotifBadge();
  }
  async function _notifMarkAllRead() {
    _setNotifBadgeCount(0);
    await api('PUT', 'notifications?all=1');
    toast('All notifications marked read', 'ok');
    _refreshNotifBadge();
    openNotifs();
  }
  async function _notifGo(id, refType, refId) {
    const row = document.querySelector(`.dp-notif-row[data-notif-id="${Number(id)}"]`);
    const wasUnread = !row || row.classList.contains('is-unread');
    if (wasUnread) _bumpNotifBadge(-1);
    const data = await api('PUT', 'notifications?id=' + Number(id));
    if (!data) _refreshNotifBadge();
    _closeModal();
    if (refType === 'post' && refId) {
      // Guess the board — defaults to minutes since that's the only kind
      // wired up so far. If a future notification targets a different board
      // type, include board in the notification body so we can route correctly.
      viewPost('minutes', refId);
    }
  }

  let _notifPollTimer = null;
  function _setNotifBadgeCount(n) {
    const dot = document.getElementById('dp-notif-dot');
    const count = document.getElementById('dp-notif-count');
    if (!dot || !count) return;
    const safe = Math.max(0, Number(n) || 0);
    if (safe > 0) {
      dot.style.display = '';
      count.style.display = '';
      count.textContent = safe > 99 ? '99+' : String(safe);
    } else {
      dot.style.display = 'none';
      count.style.display = 'none';
      count.textContent = '';
    }
  }
  function _bumpNotifBadge(delta) {
    const count = document.getElementById('dp-notif-count');
    if (!count || count.style.display === 'none') return;
    const raw = String(count.textContent || '0');
    const current = raw === '99+' ? 100 : (parseInt(raw, 10) || 0);
    _setNotifBadgeCount(current + Number(delta || 0));
  }
  async function _refreshNotifBadge() {
    const data = await api('GET', 'notifications?unread=1').catch(() => null);
    const n = (data && data.unread_count) || 0;
    _setNotifBadgeCount(n);
  }
  function _startNotifPolling() {
    if (_notifPollTimer) clearInterval(_notifPollTimer);
    _refreshNotifBadge();
    _notifPollTimer = setInterval(_refreshNotifBadge, 45_000);
  }
  async function _openPostEditor(initialBoard, initialTab) {
    // Reset working file list for this editor session.
    _pickerFiles = [];
    const writableBoards = (state.boards || [])
      .filter(b => b.board_type === 'board' || (b.board_type === 'team' && _canPostToBoard(b.slug)));
    const selectedBoard = writableBoards.some(b => b.slug === initialBoard)
      ? initialBoard
      : ((writableBoards[0] && writableBoards[0].slug) || '');
    const boardOpts = writableBoards
      .map(b => `<option value="${esc(b.slug)}"${b.slug === selectedBoard ? ' selected' : ''}>${esc(b.title || b.slug)}</option>`)
      .join('');
    const boardPicker = writableBoards.map(b => `
      <button type="button"
              class="dp-board-pick${b.slug === selectedBoard ? ' on' : ''}"
              data-board-choice="${esc(b.slug)}"
              onclick="DP._selectPostBoard(${_jsArg(b.slug)})">
        <strong>${esc(b.title || _boardTitle(b.slug))}</strong>
        <span>${esc(_boardHint(b))}</span>
      </button>
    `).join('');

    // Approver roster for minutes. Only shown when board = minutes (toggled
    // via board dropdown onchange). Fetched once up-front so picking "minutes"
    // doesn't require a round-trip.
    //
    // UI is a chip-based search picker ("To:" email field metaphor): type to
    // filter, click a suggestion → chip appears above. Designed to scale to
    // hundreds of users, unlike the earlier flat checkbox list.
    const usersRes = await api('GET', 'users?picker=1').catch(() => null);
    const roster = (usersRes && usersRes.users) || [];
    // Stash the roster on a module-level handle so the reactive filter code
    // below can see it without closure gymnastics.
    _approverRoster = roster;
    _approverPicked = [];

    const toolbar = _renderTiptapToolbar();

    _openModal(
      'New post',
      `
      <div class="dp-field">
        <label for="dp-new-board">Board</label>
        <div class="dp-board-pick-grid" id="dp-new-board-picks">${boardPicker}</div>
        <select class="dp-select" id="dp-new-board" onchange="DP._onPostBoardChange()" style="display:none">${boardOpts}</select>
      </div>
      <div class="dp-field" id="dp-new-tab-field" style="display:none">
        <label for="dp-new-tab">Tab <span style="font-weight:400;color:var(--text-3);margin-left:4px">(pick a sub-tab, or leave as "All")</span></label>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="dp-select" id="dp-new-tab" style="flex:1"><option value="">All (no tab)</option></select>
          <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                  id="dp-new-tab-add"
                  title="Create a new tab inline"
                  onclick="DP._newPostAddTab()">＋ Add tab</button>
        </div>
      </div>
      <div class="dp-field" id="dp-new-approvers-field" style="display:${selectedBoard === 'minutes' ? 'flex' : 'none'};flex-direction:column">
        <label>Approvers <span style="color:var(--alert);font-weight:400;margin-left:4px">(required for Meeting Minutes)</span></label>
        <div class="dp-chip-picker" id="dp-new-approvers">
          <div class="dp-chip-picked" id="dp-new-appr-chips"></div>
          <input type="text" class="dp-chip-input" id="dp-new-appr-q" autocomplete="off"
                 placeholder="Type a name to add an approver…"
                 oninput="DP._approverFilter(this.value)"
                 onfocus="DP._approverFilter(this.value)"
                 onkeydown="DP._approverKeydown(event)">
          <div class="dp-chip-suggest" id="dp-new-appr-suggest" role="listbox" aria-label="Matching users"></div>
        </div>
      </div>
      <div class="dp-field">
        <label for="dp-new-title">Title</label>
        <input class="dp-input" id="dp-new-title" placeholder="Title" autocomplete="off">
      </div>
      <div class="dp-field">
        <label>Content <span id="dp-te-charcount" class="mono" style="float:right;font-size:11px;color:var(--text-3)">0 / 50,000</span></label>
        <div class="dp-te-wrapper dp-te-resize">
          <div class="dp-te-toolbar" role="toolbar" aria-label="Editor">${toolbar}</div>
          <div class="dp-te-editor" id="dp-tt-post"></div>
          <div class="dp-te-handle" aria-hidden="true" title="Drag to resize"></div>
        </div>
      </div>
      <div class="dp-field" style="margin-bottom:0">
        <label>Attachments <span style="font-weight:400;color:var(--text-3);margin-left:6px" id="dp-file-used">0 / ${MAX_FILES} files · 0 B / 100 MB</span></label>
        <div class="dp-file-picker">
          <input type="file" id="dp-new-files" multiple style="display:none"
                 onchange="DP._handlePickerChange(this)">
          <button type="button" class="dp-btn dp-btn-secondary dp-btn-sm"
                  onclick="document.getElementById('dp-new-files').click()">
            <span class="dp-btn-ico" style="--dp-icon:url('/img/dreampath/icons/plus.svg')"></span>
            <span>Add file</span>
          </button>
          <span class="hint">Up to ${MAX_FILES} files, 100MB total. No .exe/.sh/.bat/.dll.</span>
        </div>
        <div class="dp-file-list" id="dp-file-list"></div>
      </div>
      `,
      `<button class="dp-btn dp-btn-secondary" onclick="DP._requestCloseModal()">Cancel</button>
       <button class="dp-btn dp-btn-primary" id="dp-new-save" onclick="DP._saveNewPost()">Publish</button>`,
      { wide: true, draftContext: 'new-post' }
    );

    _waitForTiptap(() => _initTiptap('dp-tt-post', ''));
    _renderFileList();
    // Seed the initial tab selection before the first _onPostBoardChange call
    // so "New post" from a tabbed board lands on that tab by default.
    _newPostTabSeed = initialTab || '';
    _onPostBoardChange();
    setTimeout(() => { const t = $('#dp-new-title'); if (t) t.focus(); }, 60);
  }

  function _syncPostBoardPicker(value) {
    $$('#dp-new-board-picks [data-board-choice]').forEach(btn => {
      btn.classList.toggle('on', btn.getAttribute('data-board-choice') === value);
    });
  }

  function _selectPostBoard(slug) {
    const boardSel = $('#dp-new-board');
    if (!boardSel) return;
    const next = String(slug || '');
    if (![...boardSel.options].some(opt => opt.value === next)) return;
    boardSel.value = next;
    _onPostBoardChange();
  }

  async function _onPostBoardChange() {
    const boardSel = $('#dp-new-board');
    const field = $('#dp-new-approvers-field');
    if (!boardSel || !field) return;
    _syncPostBoardPicker(boardSel.value);
    field.style.display = boardSel.value === 'minutes' ? 'flex' : 'none';
    // Clear any held picks when the board changes away from minutes.
    if (boardSel.value !== 'minutes') {
      _approverPicked = [];
      _renderApproverChips();
    }
    // Populate the Tab select for non-core boards. Always visible for
    // team/custom boards — even with zero tabs configured — so the author
    // can inline-create one via the "+ Add tab…" sentinel option.
    const tabField = $('#dp-new-tab-field');
    const tabSel   = $('#dp-new-tab');
    if (!tabField || !tabSel) return;
    const board = boardSel.value;
    const isCore = ['announcements', 'documents', 'minutes'].includes(board);
    if (isCore) { tabField.style.display = 'none'; return; }
    await _refreshNewPostTabSelect(board);
    tabField.style.display = 'flex';
  }
  async function _refreshNewPostTabSelect(board) {
    const tabSel = $('#dp-new-tab');
    if (!tabSel) return;
    const res = await api('GET', 'board-tabs?board=' + encodeURIComponent(board)).catch(() => null);
    const tabs = (res && res.tabs) || [];
    const preselect = _newPostTabSeed || '';
    _newPostTabSeed = '';  // one-shot

    const tabOpts = tabs.map(t =>
      `<option value="${esc(t.slug)}"${t.slug === preselect ? ' selected' : ''}>${esc(t.title)}</option>`
    ).join('');
    // "+ Add tab…" is the last option; picking it triggers the inline
    // create flow via onchange. Value is reserved sentinel "__new".
    const addOpt = tabs.length < 5
      ? `<option value="__new" disabled style="color:var(--accent);font-weight:600">＋ Add tab…</option>`
      : `<option disabled style="color:var(--text-3)">Max 5 tabs reached — delete one to add more</option>`;
    tabSel.innerHTML = `
      <option value="">All (no tab)</option>
      ${tabOpts}
      <option disabled>──────────</option>
      ${addOpt}
    `;
    // Disabled options in HTMLSelectElement don't fire change; we use a
    // separate "+ Add tab" button next to the select instead so admins can
    // reach the flow in one click.
  }
  let _newPostTabSeed = '';   // carry initialTab into the async board-change

  // Opens an inline "New tab" prompt without closing the post editor. Uses a
  // lightweight prompt + POST so the user doesn't lose draft content. After
  // success, the Tab select is refreshed and the new tab auto-selected.
  async function _newPostAddTab() {
    const isAdmin = state.user && state.user.role === 'admin';
    if (!isAdmin) { toast('Only admins can create tabs.', 'err'); return; }
    const boardSel = $('#dp-new-board');
    if (!boardSel) return;
    const board = boardSel.value;
    // Lightweight 2-step prompt — don't open a second modal on top of the
    // post editor (would blow away the draft on close-prompt). window.prompt
    // is intentional here for simplicity; admins can use the full Dev Rules
    // tab manager for richer permissions later.
    const title = window.prompt('New tab title for ' + board + ' (max 5 non-default tabs):');
    if (!title || !title.trim()) return;
    const res = await _rawApi('POST', 'board-tabs', { board_slug: board, title: title.trim() });
    if (res.status === 400 && /5 tabs/.test(String(res.error || ''))) {
      toast('이 보드는 이미 5개 탭이 있어 더 생성할 수 없습니다 (max 5).', 'err');
      return;
    }
    if (!res.ok) {
      toast(res.error || 'Could not create tab', 'err');
      return;
    }
    toast('Tab created', 'ok');
    const newSlug = (res.data && res.data.slug) || '';
    _newPostTabSeed = newSlug;
    await _refreshNewPostTabSelect(board);
    const tabSel = $('#dp-new-tab');
    if (tabSel && newSlug) tabSel.value = newSlug;
  }

  // -------------------------- Approver chip picker --------------------------
  // Shared state. Populated when _openPostEditor fetches the roster. The
  // picker itself is stateless HTML; everything lives on these two arrays.
  let _approverRoster = [];    // [{id, display_name}, ...] from /users?picker=1
  let _approverPicked = [];    // display_name strings in order of selection

  function _renderApproverChips() {
    const host = document.getElementById('dp-new-appr-chips');
    if (!host) return;
    if (!_approverPicked.length) { host.innerHTML = ''; return; }
    host.innerHTML = _approverPicked.map(name => `
      <span class="dp-chip">
        <span>${esc(name)}</span>
        <button type="button" class="dp-chip-x" aria-label="Remove ${esc(name)}"
                onclick="DP._approverRemove('${esc(name.replace(/'/g, "\\'"))}')">×</button>
      </span>
    `).join('');
  }

  function _approverFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    const suggest = document.getElementById('dp-new-appr-suggest');
    if (!suggest) return;
    // Exclude already-picked names; rank: prefix > contains.
    const pickedLower = new Set(_approverPicked.map(n => n.toLowerCase()));
    const hits = _approverRoster
      .map(u => ({ u, name: u.display_name || u.username || '' }))
      .filter(x => x.name && !pickedLower.has(x.name.toLowerCase()))
      .filter(x => !q || x.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (!q) return a.name.localeCompare(b.name);
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    if (!hits.length) {
      suggest.innerHTML = `<div class="dp-chip-empty">No matches${q ? ' for "' + esc(q) + '"' : ''}</div>`;
      suggest.classList.add('on');
      return;
    }
    suggest.innerHTML = hits.map((x, i) => `
      <button type="button" class="dp-chip-opt" data-i="${i}"
              onmousedown="event.preventDefault();DP._approverPick('${esc(String(x.name).replace(/'/g, "\\'"))}')">
        <span>${esc(x.name)}</span>
        ${x.u.department ? `<span class="dp-chip-opt-meta">${esc(x.u.department)}</span>` : ''}
      </button>
    `).join('');
    suggest.classList.add('on');
  }

  function _approverPick(name) {
    if (!name) return;
    if (!_approverPicked.includes(name)) _approverPicked.push(name);
    _renderApproverChips();
    const input = document.getElementById('dp-new-appr-q');
    if (input) { input.value = ''; input.focus(); }
    _approverFilter('');
  }

  function _approverRemove(name) {
    _approverPicked = _approverPicked.filter(n => n !== name);
    _renderApproverChips();
    const input = document.getElementById('dp-new-appr-q');
    if (input) _approverFilter(input.value || '');
  }

  function _approverKeydown(e) {
    // Backspace on empty input deletes the last chip — standard "To:" field UX.
    if (e.key === 'Backspace' && !e.target.value && _approverPicked.length) {
      _approverPicked.pop();
      _renderApproverChips();
      _approverFilter('');
      return;
    }
    // Enter picks the first suggestion so users can keyboard-only drive the form.
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#dp-new-appr-suggest .dp-chip-opt');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
    if (e.key === 'Escape') {
      const s = document.getElementById('dp-new-appr-suggest');
      if (s) s.classList.remove('on');
    }
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

    // Minutes require approvers. Validate client-side so the user doesn't
    // spend the Tiptap editor round-trip only to be rejected server-side.
    // Read from the chip picker state (_approverPicked) instead of checkboxes.
    let approvers = null;
    if (board === 'minutes') {
      approvers = _approverPicked.slice();
      if (!approvers.length) {
        toast('Add at least one approver for Meeting Minutes', 'err');
        const q = document.getElementById('dp-new-appr-q');
        if (q) q.focus();
        return;
      }
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }

    const files = await _uploadPending();
    if (files === null) {
      if (btn) { btn.disabled = false; btn.textContent = 'Publish'; }
      return;  // upload error already toasted
    }

    const postBody = { board, title, content, files };
    if (approvers) postBody.approvers = approvers;
    const tabSel = $('#dp-new-tab');
    if (tabSel && tabSel.value) postBody.tab_slug = tabSel.value;
    const data = await api('POST', 'posts', postBody);
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
    openCreate, openNotifs, setDensity, setTheme,
    viewPost, viewTask, viewNote,
    _voteApproval, _inlineApprove, _inlineReject, _revertMyVote,
    _extendSession,
    _execTiptapCmd, _handlePickerChange, _removeFile,
    _openPostEditor, _saveNewPost, _onPostBoardChange, _selectPostBoard, _closeModal,
    _approverFilter, _approverPick, _approverRemove, _approverKeydown,
    _newPostAddTab,
    _setBoardTab, _openTabManager, _openTabEditor, _saveTab, _deleteTab,
    _setTabEditorMode, _tabAllowedFilter, _tabAllowedPick, _tabAllowedRemove, _tabAllowedKeydown,
    _tabDragStart, _tabDragOver, _tabDragLeave, _tabDrop,
    _togglePostHidden, _openMovePostMenu, _movePostConfirm,
    _boardPage,
    _boardSearchInput, _boardSearchApply, _boardSearchClear,
    _boardSearchField, _boardSortBy, _boardSortDir,
    _onBulkCheck, _bulkToggleAll, _bulkClear, _bulkSetHidden, _bulkMove, _bulkMoveConfirm,
    _requestCloseModal, _draftPromptCancel, _draftPromptDiscard, _draftPromptSave,
    _notifMarkRead, _notifMarkAllRead, _notifGo,
    _openTaskEditor, _saveNewTask, _taskTransition,
    _openNoteEditor, _saveNewNote, _resolveNote,
    viewDecision, _openDecisionEditor, _saveDecision, _closeDecision,
    viewRisk, _openRiskEditor, _saveRisk, _updateRiskStatus,
    _openVersionEditor, _saveVersion,
    _calDayClick, _calEventClick, _openEventEditor, _saveEvent, _requestDeleteEvent, _deleteEvent,
    _editPost, _saveEditPost, _deletePost,
    _showCommentReply, _cancelCommentReply, _postComment, _deleteComment,
    _openUserEditor, _saveUser, _deleteUser,
    _openPresetEditor, _savePreset, _deletePreset,
    _activityPage,
    _handleAvatarPick, _applyAvatarCrop, _removeAccountAvatar,
    _saveAccount, _changeAccountPassword,
    _toggleDesignEditMode, _setDesignToken, _resetDesignTokens,
    _openContactEditor, _saveContact, _deleteContact, _filterContacts,
    openSearch, _searchOpen,
    _verPage, _verPageGoto,
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
  } catch (err) {
    document.documentElement.setAttribute('data-v2-boot', 'init-error');
    document.title = '[dp ERROR] ' + (err && err.message || err);
    const root = document.getElementById('dp-root');
    if (root) {
      root.innerHTML = '<pre style="padding:24px;font:13px monospace;color:#B42318;white-space:pre-wrap;max-width:900px;margin:40px auto;background:#fff;border:1px solid #E5E7EB;border-radius:4px;">dp boot error — ' +
        String(err && err.message || err) + '\n\n' +
        String(err && err.stack || '').split('\n').slice(0, 12).join('\n') +
        '</pre>';
    }
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _dpBoot);
else _dpBoot();

window.DP = DP;
