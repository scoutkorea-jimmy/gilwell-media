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
        ? `<span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/${esc(b.icon)}.svg')"></span>`
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
    // Theme: light | dark | system. Persisted in localStorage, applied to <html>.
    const savedTheme = localStorage.getItem('dp_v2_theme') || 'light';
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
  const _SESSION_EXPIRY_KEY  = 'dp_v2_session_expires_at';
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
    // Throttle — only extend if the current expiry is already in the second
    // half of its window. Otherwise every keypress hits localStorage.
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 15_000) return;  // 15-second cool-down
      last = now;
      const exp = _getSessionExpiry();
      if (!exp || exp <= now) return;
      // Only extend when the window has less than half its duration left —
      // avoids thrashing storage on the first 30 minutes of a fresh session.
      if ((exp - now) < _SESSION_DURATION_MS / 2) {
        _setSessionExpiry(now + _SESSION_DURATION_MS);
        _sessionPromptShown = false;
      }
    };
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, onActivity, { passive: true, capture: true })
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
    // Fresh 1-hour session starts on every successful login.
    _setSessionExpiry(Date.now() + _SESSION_DURATION_MS);
    await _refreshBoards();
    _mountShell();
    navigate('home');
    _startSessionTicker();
  }

  async function logout() {
    try {
      await fetch('/api/dreampath/auth', { method: 'DELETE', credentials: 'same-origin', keepalive: true });
    } catch (_) {}
    try { localStorage.removeItem('dp_user'); } catch (_) {}
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
    localStorage.setItem('dp_v2_density', d);
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
    localStorage.setItem('dp_v2_theme', theme);
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

  // B5 inline vote — works from two entry points:
  //   1. Home "Pending your approval" list (no modal open)
  //   2. Post detail modal "Your vote" banner (modal is open)
  // When a modal is open we re-open the same post so the user sees their
  // updated vote banner immediately. Otherwise we just refresh the list.
  async function _inlineApprove(postId) {
    if (!postId) return;
    const approver = encodeURIComponent(_displayName());
    const data = await api('PUT', 'approvals?post_id=' + postId + '&approver=' + approver, { status: 'approved' });
    if (!data) return;
    toast('Approved', 'ok');
    state.homePayload = await api('GET', 'home');
    const modalOpen = !!document.getElementById('dp-modal');
    if (modalOpen) { _closeModal(); viewPost('minutes', postId); }
    else navigate(state.page);
  }
  async function _inlineReject(postId) {
    if (!postId) return;
    if (!confirm('Reject this post? Author will need to revise.')) return;
    const approver = encodeURIComponent(_displayName());
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
  async function _revertMyVote(postId) {
    if (!postId) return;
    if (!confirm('Reset your vote back to pending? You can then vote again.')) return;
    const approver = encodeURIComponent(_displayName());
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
    const ordered = posts.slice().sort((a, b) => Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0));
    const body = ordered.slice(0, 3).map(p => {
      const pinCls = p.pinned ? ' dp-post-pinned' : '';
      const statusTag = (board === 'minutes' && p.approval_status)
        ? `<span class="dp-tag ${p.approval_status === 'approved' ? 'ok' : p.approval_status === 'pending' ? 'warn' : p.approval_status === 'rejected' ? 'alert' : 'neutral'}" style="margin-left:6px">${esc(p.approval_status)}</span>`
        : '';
      return `
        <button type="button" class="dp-post-item${pinCls}"
                onclick="DP.viewPost('${esc(board)}', ${Number(p.id)})"
                aria-label="${esc(p.title)}">
          <div class="t">
            ${p.pinned ? '<span class="dp-badge-notice" aria-label="Notice">NOTICE</span>' : ''}
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
        ...(supportsTabs && isAdminUser ? [
          h('button', {
            className: 'dp-btn dp-btn-secondary',
            style: { marginRight: '8px' },
            onclick: () => _openTabManager(key, label),
          }, [ h('span', {}, '⚙ Manage tabs') ]),
        ] : []),
        h('button', { className: 'dp-btn dp-btn-primary', onclick: () => _openPostEditor(key, activeTab) }, [
          h('span', { className: 'dp-btn-ico', style: { '--dp-icon': "url('/img/dreampath-v2/icons/plus.svg')" } }),
          h('span', {}, ' New post'),
        ]),
      ]),
    ]));

    // Tab bar — fetched in parallel with the post list so switching feels
    // instant after the first load. Only rendered when the board supports
    // tabs AND at least one tab exists.
    let tabs = [];
    if (supportsTabs) {
      const tabsRes = await api('GET', 'board-tabs?board=' + encodeURIComponent(key)).catch(() => null);
      tabs = (tabsRes && tabsRes.tabs) || [];
      if (tabs.length) {
        const bar = h('div', { className: 'dp-board-tabs', role: 'tablist' });
        const mkTab = (slug, title) => {
          const on = (slug || '') === activeTab;
          return `
            <button type="button" class="dp-board-tab${on ? ' on' : ''}" role="tab"
                    aria-selected="${on ? 'true' : 'false'}"
                    onclick="DP._setBoardTab('${esc(key)}','${esc(slug)}')">
              ${esc(title)}
            </button>
          `;
        };
        bar.innerHTML = mkTab('', 'All') + tabs.map(t => mkTab(t.slug, t.title)).join('');
        root.appendChild(bar);
      }
    }

    const loadingPanel = h('div', { className: 'dp-panel' });
    loadingPanel.innerHTML = `<div class="dp-panel-body pad" style="color:var(--text-3)">Loading ${esc(label)}…</div>`;
    root.appendChild(loadingPanel);

    // Fetch posts scoped to the active tab (or all tabs when activeTab is empty).
    const qs = 'posts?board=' + encodeURIComponent(key) + '&limit=100'
      + (activeTab ? '&tab=' + encodeURIComponent(activeTab) : '');
    const res = await _rawApi('GET', qs);
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
            <button type="button" class="dp-btn dp-btn-primary dp-btn-sm" onclick="event.stopPropagation();DP._inlineApprove(${Number(p.id)})">Approve</button>
            <button type="button" class="dp-btn dp-btn-danger dp-btn-sm" style="margin-left:4px" onclick="event.stopPropagation();DP._inlineReject(${Number(p.id)})">Reject</button>`;
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
  // BOARD SUB-TABS — /api/dreampath/board-tabs
  // =========================================================
  // Tab state lives on state.boardTab[board_slug] = active tab slug ('' = All).
  // Setting a new tab re-renders the current board; we don't touch the URL
  // because board navigation is SPA-style and the session is short-lived.
  function _setBoardTab(boardKey, tabSlug) {
    if (!state.boardTab) state.boardTab = {};
    state.boardTab[boardKey] = tabSlug || '';
    // Re-navigate to the same page so _renderBoard fires with the new state.
    navigate(state.page);
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
    if (!confirm('Delete tab "' + title + '"? Posts in this tab move back to "All".')) return;
    const data = await api('DELETE', 'board-tabs?id=' + tabId);
    if (data) { toast('Tab deleted', 'ok'); _openTabManager(boardKey, _boardTitle(boardKey)); }
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

  async function _openTaskEditor() {
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
        <input class="dp-input" id="dp-t-title" placeholder="What needs doing?" autocomplete="off">
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
      const raw = localStorage.getItem('dp_v2_design_overrides');
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
      const raw = localStorage.getItem('dp_v2_design_overrides');
      const map = raw ? JSON.parse(raw) : {};
      if (value === null) delete map[token]; else map[token] = value;
      localStorage.setItem('dp_v2_design_overrides', JSON.stringify(map));
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
    try { localStorage.removeItem('dp_v2_design_overrides'); } catch (_) {}
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
        // Background must be a theme-aware token — earlier version hardcoded
        // '#fff' which in dark mode left white text on white bg (numbers
        // invisible). var(--surface) swaps to #111827 under dark.
        style: { padding: '16px 18px', textAlign: 'left', cursor: 'pointer', border: 'var(--bd)', borderRadius: 'var(--r-md)', background: 'var(--surface)', fontFamily: 'inherit' },
        onclick: t.run,
      });
      tile.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span class="ico" style="width:16px;height:16px;background-color:var(--accent);-webkit-mask:url('/img/dreampath-v2/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat;mask:url('/img/dreampath-v2/icons/${esc(t.icon)}.svg') center/16px 16px no-repeat"></span>
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
    const bodyClass = opts && opts.bodyClass ? ' ' + opts.bodyClass : '';
    const backdrop = h('div', { className: 'dp-modal-backdrop', id: 'dp-modal-backdrop', onclick: _closeModal });
    const modal = h('aside', {
      className: 'dp-modal' + (wide ? ' dp-modal-wide' : ''),
      id: 'dp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    });
    // [CASE STUDY 2026-04-24 — click-outside-to-close]
    //   The whole backdrop is click-to-close, but clicks INSIDE the modal
    //   must not bubble up to it. stopPropagation on the modal itself keeps
    //   the modal open when user clicks inside the body or foot.
    modal.addEventListener('click', e => e.stopPropagation());
    modal.innerHTML = `
      <div class="dp-modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="dp-iconbtn" aria-label="Close" onclick="DP._closeModal()">
          <span class="ico" style="--dp-icon:url('/img/dreampath-v2/icons/x.svg')"></span>
        </button>
      </div>
      <div class="dp-modal-body${bodyClass}">${bodyHtml}</div>
      <div class="dp-modal-foot">${footButtons || ''}</div>
    `;
    document.body.appendChild(backdrop);
    // Mount modal INSIDE the backdrop so the grid-centered layout applies.
    backdrop.appendChild(modal);
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
    const myLowerNames = [
      String(_displayName() || '').toLowerCase(),
      String((state.user && state.user.username) || '').toLowerCase(),
    ].filter(Boolean);
    const isMine = (nm) => myLowerNames.indexOf(String(nm || '').toLowerCase()) >= 0;
    const myApproval = (p.approvals || []).find(a => isMine(a.approver_name));
    // Your-vote banner — four flavors explicit:
     //  a) pending + I can still vote → Approve / Reject buttons inline
     //  b) already voted (approved|rejected) → result chip + Change button
     //  c) minutes post but I'm NOT an approver → grey "Not an approver" notice
     //  d) not a minutes post at all → banner hidden
    const isMinutesPost = String(p.board || '') === 'minutes';
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
                   onclick="DP._inlineApprove(${Number(p.id)})">✓ Approve</button>
           <button class="dp-btn dp-btn-danger dp-btn-sm"
                   onclick="DP._inlineReject(${Number(p.id)})">✗ Reject</button>`
        : `<span class="mono" style="color:var(--text-3);font-size:11px;margin-left:auto">
             ${myApproval.voted_at ? 'voted ' + esc(fmtTime(myApproval.voted_at)) : ''}
           </span>
           <button class="dp-btn dp-btn-ghost dp-btn-sm"
                   onclick="DP._revertMyVote(${Number(p.id)})"
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
       ${canEdit ? `<button class="dp-btn dp-btn-secondary" onclick="DP._editPost('${esc(p.board)}', ${Number(p.id)})">Edit</button>` : ''}
       ${canDelete ? `<button class="dp-btn dp-btn-danger" onclick="DP._deletePost('${esc(p.board)}', ${Number(p.id)})">Delete</button>` : ''}
       ${_canVoteOnPost(p) ? `<button class="dp-btn dp-btn-danger" onclick="DP._inlineReject(${Number(p.id)})">Reject</button>
                              <button class="dp-btn dp-btn-primary" onclick="DP._inlineApprove(${Number(p.id)})">Approve</button>` : ''}`,
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

    const toolbar = _renderTiptapToolbar();

    _openModal(
      'Edit post',
      `
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
        <span class="ico" aria-hidden="true" style="width:14px;height:14px;background-color:var(--text-3);-webkit-mask:url('/img/dreampath-v2/icons/compass.svg') center/14px 14px no-repeat;mask:url('/img/dreampath-v2/icons/compass.svg') center/14px 14px no-repeat"></span>
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
  async function _openPostEditor(initialBoard, initialTab) {
    // Reset working file list for this editor session.
    _pickerFiles = [];
    const boardOpts = (state.boards || [])
      .filter(b => b.board_type === 'board' || (b.board_type === 'team' && _canPostToBoard(b.slug)))
      .map(b => `<option value="${esc(b.slug)}"${b.slug === initialBoard ? ' selected' : ''}>${esc(b.title || b.slug)}</option>`)
      .join('');

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
        <select class="dp-select" id="dp-new-board" onchange="DP._onPostBoardChange()">${boardOpts}</select>
      </div>
      <div class="dp-field" id="dp-new-tab-field" style="display:none">
        <label for="dp-new-tab">Tab <span style="font-weight:400;color:var(--text-3);margin-left:4px">(choose which sub-tab this post belongs to)</span></label>
        <select class="dp-select" id="dp-new-tab"><option value="">All (no tab)</option></select>
      </div>
      <div class="dp-field" id="dp-new-approvers-field" style="display:${initialBoard === 'minutes' ? 'flex' : 'none'};flex-direction:column">
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
    // Seed the initial tab selection before the first _onPostBoardChange call
    // so "New post" from a tabbed board lands on that tab by default.
    _newPostTabSeed = initialTab || '';
    _onPostBoardChange();
    setTimeout(() => { const t = $('#dp-new-title'); if (t) t.focus(); }, 60);
  }

  async function _onPostBoardChange() {
    const boardSel = $('#dp-new-board');
    const field = $('#dp-new-approvers-field');
    if (!boardSel || !field) return;
    field.style.display = boardSel.value === 'minutes' ? 'flex' : 'none';
    // Clear any held picks when the board changes away from minutes.
    if (boardSel.value !== 'minutes') {
      _approverPicked = [];
      _renderApproverChips();
    }
    // Populate the Tab select for non-core boards. If the board has no tabs
    // configured, hide the whole field.
    const tabField = $('#dp-new-tab-field');
    const tabSel   = $('#dp-new-tab');
    if (!tabField || !tabSel) return;
    const board = boardSel.value;
    const isCore = ['announcements', 'documents', 'minutes'].includes(board);
    if (isCore) { tabField.style.display = 'none'; return; }
    const res = await api('GET', 'board-tabs?board=' + encodeURIComponent(board)).catch(() => null);
    const tabs = (res && res.tabs) || [];
    if (!tabs.length) { tabField.style.display = 'none'; return; }
    const preselect = _newPostTabSeed || '';
    _newPostTabSeed = '';  // one-shot; next board switch doesn't reuse
    tabSel.innerHTML = '<option value="">All (no tab)</option>'
      + tabs.map(t => `<option value="${esc(t.slug)}"${t.slug === preselect ? ' selected' : ''}>${esc(t.title)}</option>`).join('');
    tabField.style.display = 'flex';
  }
  let _newPostTabSeed = '';   // carry initialTab into the async board-change

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
    _openPostEditor, _saveNewPost, _onPostBoardChange, _closeModal,
    _approverFilter, _approverPick, _approverRemove, _approverKeydown,
    _setBoardTab, _openTabManager, _openTabEditor, _saveTab, _deleteTab,
    _setTabEditorMode, _tabAllowedFilter, _tabAllowedPick, _tabAllowedRemove, _tabAllowedKeydown,
    _openTaskEditor, _saveNewTask, _taskTransition,
    _openNoteEditor, _saveNewNote, _resolveNote,
    _openVersionEditor, _saveVersion,
    _calDayClick, _calEventClick,
    _editPost, _saveEditPost, _deletePost,
    _postComment, _deleteComment,
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
