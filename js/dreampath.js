/**
 * Dreampath · Frontend v2
 * Self-contained IIFE — stored as window.DP
 */
const DP = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let token       = null;
  let currentUser = JSON.parse(localStorage.getItem('dp_user') || 'null');
  let activeSection = 'home';
  let calendarDate  = new Date();
  let _sessionTimerId = null;
  let _sessionPromptShown = false;
  let _tiptapEditor = null;
  let _recentItems  = [];
  let _allEvents    = [];

  const SESSION_DURATION_MS = 60 * 60 * 1000;
  const SESSION_WARNING_MS = 5 * 60 * 1000;
  const SESSION_EXPIRY_KEY = 'dp_session_expires_at';

  // ── Team Board helpers ─────────────────────────────────────────────────────
  const TEAM_BOARDS = ['team_korea', 'team_nepal', 'team_indonesia'];
  const TEAM_BOARD_TITLES = { team_korea: 'Team Korea', team_nepal: 'Team Nepal', team_indonesia: 'Team Indonesia' };

  function _teamBoard(department) {
    const d = (department || '').toLowerCase();
    if (d.includes('korea'))     return 'team_korea';
    if (d.includes('nepal'))     return 'team_nepal';
    if (d.includes('indonesia')) return 'team_indonesia';
    return null;
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const hasSessionMarker = () => /(?:^|;\s*)dp_session=1(?:;|$)/.test(document.cookie || '');

  // Parse a DB date/datetime string into a local Date object.
  // DB stores UTC datetimes as "YYYY-MM-DD HH:MM:SS" (no T, no Z).
  // Date-only fields like start_date are "YYYY-MM-DD" — treated as local.
  function _parseDate(s) {
    if (!s) return null;
    if (s.includes('T')) return new Date(s);                    // already ISO
    if (s.includes(' ')) return new Date(s.replace(' ', 'T') + 'Z'); // UTC datetime from DB
    return new Date(s + 'T00:00:00');                           // date-only → local midnight
  }

  function fmtDate(s) {
    const d = _parseDate(s);
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtFull(s) {
    const d = _parseDate(s);
    if (!d || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function fmtDateHM(s) {
    const d = _parseDate(s);
    if (!d || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ── Toast notifications ────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `dp-toast dp-toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('dp-toast--show'));
    setTimeout(() => {
      t.classList.remove('dp-toast--show');
      setTimeout(() => t.remove(), 350);
    }, 3200);
  }

  function getSessionExpiry() {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    const parsed = parseInt(raw || '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function setSessionExpiry(expiresAt) {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
  }

  function clearSessionExpiry() {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function stopSessionTimer() {
    if (_sessionTimerId) {
      clearInterval(_sessionTimerId);
      _sessionTimerId = null;
    }
    _sessionPromptShown = false;
    const timerEl = $('dp-session-timer');
    const rowEl = $('dp-session-timer-row');
    const extBtn = $('dp-session-extend-btn');
    if (timerEl) timerEl.textContent = '--:--';
    if (rowEl) rowEl.classList.remove('is-warning');
    if (extBtn) extBtn.style.display = 'none';
  }

  async function extendSession() {
    // Verify the server session cookie is still valid before extending the UI timer
    const data = await api('GET', 'me');
    if (!data) return; // 401 → api() already called logout()
    setSessionExpiry(Date.now() + SESSION_DURATION_MS);
    _sessionPromptShown = false;
    closeModal();
    updateSessionTimer();
    showToast('Session extended for 1 hour.', 'success');
  }

  function updateSessionTimer() {
    const timerEl = $('dp-session-timer');
    const rowEl = $('dp-session-timer-row');
    const expiresAt = getSessionExpiry();

    const extBtn = $('dp-session-extend-btn');
    if (!currentUser || !hasSessionMarker() || !expiresAt) {
      if (timerEl) timerEl.textContent = '--:--';
      if (rowEl) rowEl.classList.remove('is-warning');
      if (extBtn) extBtn.style.display = 'none';
      return;
    }
    if (extBtn) extBtn.style.display = '';

    const remaining = expiresAt - Date.now();
    if (timerEl) timerEl.textContent = formatRemaining(remaining);
    if (rowEl) rowEl.classList.toggle('is-warning', remaining <= SESSION_WARNING_MS);

    if (remaining <= 0) {
      stopSessionTimer();
      showToast('Session expired. Signing out.', 'info');
      logout();
      return;
    }

    if (remaining <= SESSION_WARNING_MS && !_sessionPromptShown) {
      _sessionPromptShown = true;
      openModal(
        '<p style="font-size:14px;line-height:1.6;color:var(--text-2)">Your session will end in less than 5 minutes. Do you want to extend it by 1 hour?</p>',
        {
          title: 'Extend Session?',
          confirmLabel: 'Extend 1 Hour',
          onConfirm: () => extendSession(),
        }
      );
    }
  }

  function beginSessionTimer(reset) {
    let expiresAt = getSessionExpiry();
    if (reset || !expiresAt || expiresAt <= Date.now()) {
      expiresAt = Date.now() + SESSION_DURATION_MS;
      setSessionExpiry(expiresAt);
    }
    _sessionPromptShown = false;
    updateSessionTimer();
    if (_sessionTimerId) clearInterval(_sessionTimerId);
    _sessionTimerId = setInterval(updateSessionTimer, 1000);
  }

  function trackPageVisit() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const path = window.location.pathname || '/dreampath';
    if (!path || path.indexOf('/api/') === 0) return;
    const key = 'gw_visit_tracked_' + path;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (_) {}
    fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        current_url: window.location.href || '',
        referrer: document.referrer || '',
      }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  }

  // ── Tiptap helpers ─────────────────────────────────────────────────────────
  function _waitForTiptap(cb) {
    if (window.__DP_Tiptap) { cb(); return; }
    const h = () => { window.removeEventListener('tiptap-ready', h); cb(); };
    window.addEventListener('tiptap-ready', h);
  }

  function _legacyToHtml(text) {
    if (!text) return '';
    if (text.trimStart().startsWith('<')) return text;
    return text.split('\n\n').map(chunk => `<p>${chunk.trim().replace(/\n/g, '<br>')}</p>`).join('');
  }

  function _sanitizeHtml(html) {
    if (window.DOMPurify) return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    // Fallback: remove dangerous elements and event handler attributes
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,iframe,object,embed,form,meta,link,style').forEach(el => el.remove());
    div.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        } else if (['href','src','action','formaction','data'].includes(attr.name) && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return div.innerHTML;
  }

  function _initTiptap(containerId, initialHtml) {
    _destroyTiptap();
    const el = document.getElementById(containerId);
    if (!el) return;
    const tiptap = window.__DP_Tiptap;
    if (!tiptap) return;
    el.classList.add('dp-te-editor');
    _tiptapEditor = new tiptap.Editor({
      element: el,
      extensions: [tiptap.StarterKit],
      content: initialHtml || '',
      onTransaction: () => _updateTiptapToolbar(),
    });
    setTimeout(() => { if (_tiptapEditor) _tiptapEditor.commands.focus('end'); }, 80);
  }

  function _updateTiptapToolbar() {
    if (!_tiptapEditor) return;
    document.querySelectorAll('.dp-te-btn[data-cmd]').forEach(btn => {
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
      else if (cmd === 'code')        active = _tiptapEditor.isActive('code');
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
    else if (cmd === 'code')        c.toggleCode().run();
  }

  function _getTiptapHTML() {
    if (!_tiptapEditor) return '';
    const html = _tiptapEditor.getHTML();
    return (html === '<p></p>' || html === '') ? '' : html;
  }

  function _destroyTiptap() {
    if (_tiptapEditor) {
      try { _tiptapEditor.destroy(); } catch (_) {}
      _tiptapEditor = null;
    }
  }

  // ── Event picker (searchable combobox for linked calendar events) ───────────
  function _initEventPicker(prefix, events, selectedId) {
    const searchEl  = $(`${prefix}-event-search`);
    const dropEl    = $(`${prefix}-event-dropdown`);
    const hiddenEl  = $(`${prefix}-linked-event`);
    const clearBtn  = $(`${prefix}-event-clear`);
    if (!searchEl || !dropEl || !hiddenEl) return;

    const MAX_SHOW = 5;

    function renderDrop(list) {
      if (!list.length) {
        dropEl.innerHTML = '<div class="dp-event-dd-empty">No results</div>';
      } else {
        const shown = list.slice(0, MAX_SHOW);
        const more  = list.length - MAX_SHOW;
        dropEl.innerHTML =
          shown.map(ev =>
            `<div class="dp-event-dd-item" data-id="${ev.id}" data-label="${esc(ev.start_date + ' · ' + ev.title)}">
               <span class="dp-event-dd-date">${esc(ev.start_date)}</span>
               <span class="dp-event-dd-title">${esc(ev.title)}</span>
             </div>`
          ).join('') +
          (more > 0
            ? `<div class="dp-event-dd-more">+${more} more · Type to filter</div>`
            : '');
      }
      dropEl.style.display = 'block';
    }

    // Pre-select if editing
    if (selectedId) {
      const found = events.find(e => e.id === selectedId);
      if (found) {
        searchEl.value    = `${found.start_date} · ${found.title}`;
        hiddenEl.value    = String(selectedId);
        if (clearBtn) clearBtn.style.display = '';
      }
    }

    searchEl.addEventListener('focus', () => {
      if (!hiddenEl.value) renderDrop(events);
    });

    searchEl.addEventListener('input', () => {
      hiddenEl.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      const q = searchEl.value.trim().toLowerCase();
      renderDrop(q
        ? events.filter(e => e.title.toLowerCase().includes(q) || e.start_date.includes(q))
        : events
      );
    });

    searchEl.addEventListener('blur', () => {
      setTimeout(() => {
        dropEl.style.display = 'none';
        if (hiddenEl.value) {
          const found = events.find(e => e.id === parseInt(hiddenEl.value, 10));
          if (found) searchEl.value = `${found.start_date} · ${found.title}`;
        }
      }, 160);
    });

    dropEl.addEventListener('click', e => {
      const item = e.target.closest('.dp-event-dd-item');
      if (!item) return;
      hiddenEl.value  = item.dataset.id;
      searchEl.value  = item.dataset.label;
      dropEl.style.display = 'none';
      if (clearBtn) clearBtn.style.display = '';
    });
  }

  function _clearEventPicker(prefix) {
    const searchEl = $(`${prefix}-event-search`);
    const hiddenEl = $(`${prefix}-linked-event`);
    const clearBtn = $(`${prefix}-event-clear`);
    const dropEl   = $(`${prefix}-event-dropdown`);
    if (searchEl) searchEl.value = '';
    if (hiddenEl) hiddenEl.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (dropEl)   dropEl.style.display = 'none';
  }

  function _initApproverPicker(prefix, users, selectedName) {
    const searchEl = $(`${prefix}-approver-search`);
    const dropEl   = $(`${prefix}-approver-dropdown`);
    const hiddenEl = $(`${prefix}-approver-name`);
    const clearBtn = $(`${prefix}-approver-clear`);
    if (!searchEl || !dropEl || !hiddenEl) return;

    const MAX_SHOW = 5;
    function renderDrop(list) {
      if (!list.length) {
        dropEl.innerHTML = `<div class="dp-event-dd-empty">No users found.</div>`;
      } else {
        dropEl.innerHTML = list.slice(0, MAX_SHOW).map(u =>
          `<div class="dp-event-dd-item" data-name="${esc(u.display_name)}" onclick="DP._selectApprover('${prefix}','${esc(u.display_name)}')">${esc(u.display_name)}</div>`
        ).join('') + (list.length > MAX_SHOW ? `<div class="dp-event-dd-more">+${list.length - MAX_SHOW} more</div>` : '');
      }
      dropEl.style.display = 'block';
    }

    if (selectedName) {
      searchEl.value = selectedName;
      hiddenEl.value = selectedName;
      if (clearBtn) clearBtn.style.display = '';
    } else {
      renderDrop(users.slice(0, MAX_SHOW));
      dropEl.style.display = 'none';
    }

    searchEl.addEventListener('focus', () => {
      const q = searchEl.value.trim().toLowerCase();
      const filtered = q ? users.filter(u => u.display_name.toLowerCase().includes(q)) : users;
      renderDrop(filtered);
    });
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      const filtered = q ? users.filter(u => u.display_name.toLowerCase().includes(q)) : users;
      renderDrop(filtered);
      if (!q) { hiddenEl.value = ''; if (clearBtn) clearBtn.style.display = 'none'; }
    });
    searchEl.addEventListener('blur', () => {
      setTimeout(() => { dropEl.style.display = 'none'; }, 160);
    });
  }

  function _selectApprover(prefix, name) {
    const searchEl = $(`${prefix}-approver-search`);
    const hiddenEl = $(`${prefix}-approver-name`);
    const dropEl   = $(`${prefix}-approver-dropdown`);
    const clearBtn = $(`${prefix}-approver-clear`);
    if (searchEl) searchEl.value = name;
    if (hiddenEl) hiddenEl.value = name;
    if (dropEl) dropEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = '';
  }

  function _clearApproverPicker(prefix) {
    const searchEl = $(`${prefix}-approver-search`);
    const hiddenEl = $(`${prefix}-approver-name`);
    const clearBtn = $(`${prefix}-approver-clear`);
    if (searchEl) searchEl.value = '';
    if (hiddenEl) hiddenEl.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
  }

  // ── Modal system ───────────────────────────────────────────────────────────
  function openModal(html, { title = '', confirmLabel = 'Save', onConfirm = null, wide = false } = {}) {
    const overlay = $('dp-modal-overlay');
    const modalEl = $('dp-modal');
    const titleEl = $('dp-modal-title');
    const bodyEl  = $('dp-modal-body');
    const footerEl = $('dp-modal-footer');

    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    modalEl.classList.toggle('dp-modal--wide', !!wide);

    if (onConfirm) {
      footerEl.innerHTML = `
        <button class="dp-btn dp-btn--ghost" onclick="DP.closeModal()">Cancel</button>
        <button class="dp-btn dp-btn--primary" id="dp-modal-confirm">${esc(confirmLabel)}</button>
      `;
      $('dp-modal-confirm').onclick = () => onConfirm();
    } else {
      footerEl.innerHTML = `<button class="dp-btn dp-btn--ghost" onclick="DP.closeModal()">Close</button>`;
    }

    overlay.classList.add('dp-modal--open');
  }

  function closeModal() {
    _destroyTiptap();
    $('dp-modal-overlay').classList.remove('dp-modal--open');
  }

  // ── API helper ─────────────────────────────────────────────────────────────
  async function api(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(`/api/dreampath/${path}`, opts);
    } catch (e) {
      showToast('Network error. Please check your connection.', 'error');
      return null;
    }
    if (res.status === 401) {
      logout();
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'An error occurred.', 'error');
      return null;
    }
    return data;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function login() {
    const usernameEl = $('dp-login-username');
    const passwordEl = $('dp-login-password');
    const btnEl      = $('dp-login-btn');
    const errEl      = $('dp-login-error');

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username || !password) {
      errEl.textContent = 'Please enter your username and password.';
      errEl.classList.remove('dp-hidden');
      return;
    }

    btnEl.disabled = true;
    btnEl.textContent = 'Signing in...';
    errEl.classList.add('dp-hidden');

    let res;
    try {
      res = await fetch('/api/dreampath/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
    } catch (e) {
      errEl.textContent = 'Network error. Please try again.';
      errEl.classList.remove('dp-hidden');
      btnEl.disabled = false;
      btnEl.textContent = 'Sign In';
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed.';
      errEl.classList.remove('dp-hidden');
      btnEl.disabled = false;
      btnEl.textContent = 'Sign In';
      passwordEl.value = '';
      return;
    }

    currentUser = data.user;
    localStorage.setItem('dp_user', JSON.stringify(currentUser));

    btnEl.disabled = false;
    btnEl.textContent = 'Sign In';
    showApp();

    // Check for pending tasks assigned to this user
    setTimeout(() => {
      api('GET', 'home').then(homeData => {
        const pending = (homeData?.my_tasks || []).filter(t => t.status === 'todo' || t.status === 'in_progress');
        if (pending.length > 0) {
          showToast(`📋 You have ${pending.length} active task${pending.length > 1 ? 's' : ''} assigned to you.`, 'info');
        }
      }).catch(() => {});
    }, 800);
  }

  function logout() {
    token       = null;
    currentUser = null;
    stopSessionTimer();
    clearSessionExpiry();
    localStorage.removeItem('dp_user');
    document.cookie = 'dp_session=; Path=/; Max-Age=0; Secure; SameSite=Lax';
    document.cookie = 'dp_role=; Path=/; Max-Age=0; Secure; SameSite=Lax';
    fetch('/api/dreampath/auth', {
      method: 'DELETE',
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
    $('dp-app').classList.add('dp-hidden');
    $('dp-login').classList.remove('dp-hidden');
    $('dp-login-username').value = '';
    $('dp-login-password').value = '';
    $('dp-login-error').classList.add('dp-hidden');
  }

  function _updateSidebarAvatar(user) {
    const el = $('dp-user-avatar');
    if (!el) return;
    if (user.avatar_url) {
      const pos = (user.avatar_pos || '50 50').split(' ');
      el.innerHTML = `<img src="${esc(user.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${pos[0]}% ${pos[1]}%;border-radius:50%;">`;
    } else {
      const initials = (user.display_name || user.username || '?')
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      el.textContent = initials;
    }
  }

  function showApp(resetSession = true) {
    $('dp-login').classList.add('dp-hidden');
    $('dp-app').classList.remove('dp-hidden');
    beginSessionTimer(resetSession);

    // Set user info in sidebar
    $('dp-user-name').textContent = currentUser.display_name || currentUser.username;
    _updateSidebarAvatar(currentUser);

    // Show/hide admin items
    document.querySelectorAll('.dp-admin-only').forEach(el => {
      el.classList.toggle('dp-hidden', currentUser.role !== 'admin');
    });

    // Show/hide team board nav items
    const userTeam = _teamBoard(currentUser.department);
    const isAdmin  = currentUser.role === 'admin';
    let anyTeamVisible = false;
    document.querySelectorAll('.dp-team-nav-item').forEach(el => {
      const visible = isAdmin || `team_${el.dataset.team}` === userTeam;
      el.classList.toggle('dp-hidden', !visible);
      if (visible) anyTeamVisible = true;
    });
    const teamLabel = document.querySelector('.dp-team-nav-label');
    if (teamLabel) teamLabel.classList.toggle('dp-hidden', !anyTeamVisible);

    navigate('home');

    // Load and display current version in footer
    api('GET', 'versions').then(data => {
      const latest = data?.versions?.[0];
      if (latest && $('dp-version-display')) {
        $('dp-version-display').textContent = `v${latest.version}`;
      }
    }).catch(() => {});
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigate(section) {
    activeSection = section;

    // Update nav highlights
    document.querySelectorAll('.dp-nav-item').forEach(el => {
      el.classList.toggle('dp-nav-item--active', el.dataset.section === section);
    });

    // Hide all sections, show target
    document.querySelectorAll('.dp-section').forEach(el => el.classList.add('dp-hidden'));
    const target = $(`dp-section-${section}`);
    if (target) target.classList.remove('dp-hidden');

    // Load content for section
    switch (section) {
      case 'home':         loadHome(); break;
      case 'announcements': loadBoard('announcements'); break;
      case 'documents':    loadBoard('documents'); break;
      case 'minutes':      loadBoard('minutes'); break;
      case 'tasks':        loadTasks(); break;
      case 'notes':        loadNotes(); break;
      case 'team_korea':
      case 'team_nepal':
      case 'team_indonesia':
        loadBoard(section); break;
      case 'contacts':     loadContacts(); break;
      case 'users':
        if (currentUser?.role !== 'admin') { navigate('home'); return; }
        loadUsers();
        break;
      case 'account':      loadAccount(); break;
      case 'devrules':     loadDevRules(); break;
      case 'settings':
        if (currentUser?.username !== 'jimmy' && currentUser?.role !== 'admin') { navigate('home'); return; }
        loadSettings();
        break;
    }
  }

  // ── Home ───────────────────────────────────────────────────────────────────
  async function loadHome() {
    const [homeData] = await Promise.all([api('GET', 'home'), loadCalendar(), loadBoardPreviews()]);
    renderHomeOps(homeData || {});
  }

  function renderHomeOps(data) {
    renderHomeAlerts(data.alerts || [], data.my_tasks || []);
    renderHomeRecent(data.recent_changes || []);
    bindHomeSearch();
  }

  function renderHomeAlerts(alerts, myTasks) {
    const el = $('dp-home-alerts');
    if (!el) return;
    const blocks = [];
    (alerts || []).forEach(item => {
      blocks.push(`
        <div class="dp-home-item">
          <strong>${esc(item.label || 'Alert')} · ${esc(item.title || '')}</strong>
          <small>${esc(item.meta || '')}</small>
        </div>
      `);
    });
    (myTasks || []).forEach(task => {
      blocks.push(`
        <div class="dp-home-item">
          <strong>${esc(task.title || '')}</strong>
          <small>${esc((task.status || 'todo') + (task.due_date ? ' · ' + task.due_date : ''))}</small>
        </div>
      `);
    });
    el.innerHTML = blocks.length
      ? `<div class="dp-home-list">${blocks.join('')}</div>`
      : '<div class="dp-home-item"><strong>No urgent items.</strong><small>You have no active alerts or assigned tasks right now.</small></div>';
  }

  function _recentItemHtml(item) {
    return `<div class="dp-home-item">
      <strong>${esc(item.title || '')}</strong>
      <small>${esc((item.kind || 'item').toUpperCase() + ' · ' + (item.meta || '') + (item.created_at ? ' · ' + fmtDateHM(item.created_at) : ''))}</small>
      ${item.note ? `<div style="margin-top:6px;font-size:12px;color:var(--text-2)">${esc(String(item.note).slice(0, 140))}</div>` : ''}
    </div>`;
  }

  function renderHomeRecent(items) {
    _recentItems = items;
    const el = $('dp-home-recent');
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="dp-home-item"><strong>No recent changes yet.</strong><small>Updates to posts, events, and comments will appear here.</small></div>';
      return;
    }
    const PREVIEW = 5;
    const preview = items.slice(0, PREVIEW);
    const hasMore = items.length > PREVIEW;
    el.innerHTML = `
      <div class="dp-home-list">${preview.map(_recentItemHtml).join('')}</div>
      ${hasMore ? `<div style="text-align:center;padding:8px 0 2px">
        <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._showAllRecent(0)">View all (${items.length})</button>
      </div>` : ''}
    `;
  }

  function _showAllRecent(page) {
    const PAGE_SIZE = 10;
    const total = _recentItems.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const p = Math.max(0, Math.min(page, totalPages - 1));
    const slice = _recentItems.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
    const paginationHtml = totalPages > 1 ? `
      <div style="display:flex;gap:8px;justify-content:center;padding:12px 0 0;border-top:1px solid var(--border);margin-top:8px">
        <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._showAllRecent(${p - 1})" ${p === 0 ? 'disabled' : ''}>← Prev</button>
        <span style="font-size:12px;color:var(--text-3);line-height:30px">${p + 1} / ${totalPages}</span>
        <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._showAllRecent(${p + 1})" ${p >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>` : '';
    openModal(`
      <div style="max-height:65vh;overflow-y:auto">
        <div class="dp-home-list">${slice.map(_recentItemHtml).join('')}</div>
      </div>
      ${paginationHtml}
    `, { title: `Recent Changes (${total})` });
  }

  function bindHomeSearch() {
    const input = $('dp-home-search-input');
    const btn = $('dp-home-search-btn');
    if (!input || !btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => runHomeSearch());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runHomeSearch();
    });
  }

  async function runHomeSearch() {
    const input = $('dp-home-search-input');
    const resultsEl = $('dp-home-search-results');
    const q = (input?.value || '').trim();
    if (!resultsEl) return;
    if (!q) {
      resultsEl.innerHTML = '<div style="color:var(--text-3);font-size:13px">Enter a keyword to search Dreampath.</div>';
      return;
    }
    resultsEl.innerHTML = '<div style="color:var(--text-3);font-size:13px">Searching...</div>';
    const data = await api('GET', `search?q=${encodeURIComponent(q)}`);
    const results = data?.results || [];
    if (!results.length) {
      resultsEl.innerHTML = '<div class="dp-home-item"><strong>No results found.</strong><small>Try another title, assignee, or keyword.</small></div>';
      return;
    }
    resultsEl.innerHTML = `<div class="dp-search-results-compact">${results.map(item => `
      <div class="dp-search-hit" data-kind="${esc(item.kind || '')}" data-id="${Number(item.id || 0)}">
        <span class="dp-search-hit-type">${esc(item.kind || 'item')}</span>
        <strong>${esc(item.title || '')}</strong>
        ${item.subtitle ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px">${esc(item.subtitle)}</div>` : ''}
        ${item.meta ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px">${esc(item.meta)}</div>` : ''}
      </div>
    `).join('')}</div>`;
    resultsEl.querySelectorAll('.dp-search-hit').forEach(node => {
      node.addEventListener('click', () => {
        const kind = node.getAttribute('data-kind');
        const id = parseInt(node.getAttribute('data-id') || '', 10);
        if (kind === 'post' || kind === 'comment') {
          viewPost(id);
          return;
        }
        showToast('Task/note search is available. Detail jump can be expanded next.', 'info');
      });
    });
  }

  async function loadCalendar() {
    const month = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
    const data = await api('GET', `events?month=${month}`);
    renderCalendar(data?.events || []);
  }

  function renderCalendar(events) {
    const container = $('dp-calendar');
    if (!container) return;

    const year  = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const monthName = calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const typeColors = { general: '#146E7A', deadline: '#DC2626', meeting: '#059669', milestone: '#8D714E' };

    // Normalize events: parse start/end as Date objects
    const normed = [];
    for (const ev of events) {
      if (!ev.start_date) continue;
      const s = new Date(ev.start_date.slice(0,10) + 'T00:00:00');
      if (isNaN(s.getTime())) continue;
      const eRaw = ev.end_date ? new Date(ev.end_date.slice(0,10) + 'T00:00:00') : s;
      const e = isNaN(eRaw.getTime()) ? s : eRaw;
      normed.push({ ...ev, _s: s, _e: e });
    }

    // Helper: YYYY-MM-DD from Date
    function dk(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // Split: multi-day events vs single-day per-date map
    const multiDay = normed.filter(ev => ev._e > ev._s);
    const singleDay = {};
    for (const ev of normed) {
      if (ev._e > ev._s) continue;
      const k = ev.start_date.slice(0,10);
      if (!singleDay[k]) singleDay[k] = [];
      singleDay[k].push(ev);
    }

    // Build week structures: array of 7-cell arrays (null = empty/out-of-month)
    const weeks = [];
    let cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ d, date, dateStr: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` });
      if (cells.length === 7) { weeks.push(cells); cells = []; }
    }
    if (cells.length > 0) {
      while (cells.length < 7) cells.push(null);
      weeks.push(cells);
    }

    // For a week row, compute lane assignments for multi-day events
    function computeLanes(weekCells) {
      const activeCells = weekCells.filter(Boolean);
      if (!activeCells.length) return [];
      const wStart = activeCells[0].date;
      const wEnd   = activeCells[activeCells.length - 1].date;

      const overlap = multiDay
        .filter(ev => ev._s <= wEnd && ev._e >= wStart)
        .sort((a, b) => a._s - b._s);

      const lanes = []; // lane = array of bar items
      for (const ev of overlap) {
        const cs = Math.max(0, weekCells.findIndex(c => c && dk(c.date) === dk(ev._s < wStart ? wStart : ev._s)));
        const ceDate = ev._e > wEnd ? wEnd : ev._e;
        let ce = weekCells.findIndex(c => c && dk(c.date) === dk(ceDate));
        if (ce < 0) ce = weekCells.map((c,i) => c ? i : -1).filter(i => i >= 0).slice(-1)[0];
        const showTitle = ev._s >= wStart; // title if event starts in this week or is leftmost

        const item = { ev, cs, ce: ce + 1, showTitle: showTitle || cs === 0 };
        let placed = false;
        for (const lane of lanes) {
          const last = lane[lane.length - 1];
          if (cs >= last.ce) { lane.push(item); placed = true; break; }
        }
        if (!placed && lanes.length < 2) lanes.push([item]);
      }
      return lanes;
    }

    // Build HTML
    let html = `
      <div class="dp-cal-header">
        <button class="dp-cal-nav" onclick="DP.prevMonth()" title="Previous month">&#8249;</button>
        <h2 class="dp-cal-title">${esc(monthName)}</h2>
        <button class="dp-cal-nav" onclick="DP.nextMonth()" title="Next month">&#8250;</button>
        ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--sm dp-btn--primary dp-admin-only" onclick="DP.addEvent()" style="margin-left:auto">+ Add Event</button>` : ''}
      </div>
      <div class="dp-cal-dows">
        <div class="dp-cal-dow dp-cal-dow--weekend">Sun</div>
        <div class="dp-cal-dow">Mon</div>
        <div class="dp-cal-dow">Tue</div>
        <div class="dp-cal-dow">Wed</div>
        <div class="dp-cal-dow">Thu</div>
        <div class="dp-cal-dow">Fri</div>
        <div class="dp-cal-dow dp-cal-dow--weekend">Sat</div>
      </div>
    `;

    for (const weekCells of weeks) {
      const lanes = computeLanes(weekCells);

      // Bar layer
      let barHtml = '';
      for (const lane of lanes) {
        let rowHtml = '';
        let col = 0;
        for (const item of lane) {
          if (item.cs > col) rowHtml += `<div style="grid-column:${col+1}/${item.cs+1}"></div>`;
          const color = typeColors[item.ev.type] || typeColors.general;
          const label = item.showTitle ? esc(item.ev.title) : '&nbsp;';
          rowHtml += `<div class="dp-cal-bar" style="grid-column:${item.cs+1}/${item.ce+1};background:${color}"
            onclick="event.stopPropagation();DP.viewEvent(${item.ev.id})"
            title="${esc(item.ev.title)}">${label}</div>`;
          col = item.ce;
        }
        if (col < 7) rowHtml += `<div style="grid-column:${col+1}/8"></div>`;
        barHtml += `<div class="dp-cal-bar-row">${rowHtml}</div>`;
      }

      // Day cells
      let cellsHtml = '';
      for (let ci = 0; ci < 7; ci++) {
        const cell = weekCells[ci];
        if (!cell) { cellsHtml += `<div class="dp-cal-day dp-cal-day--empty"></div>`; continue; }
        const { d, date, dateStr } = cell;
        const isToday   = dateStr === todayStr;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const dayEvs = singleDay[dateStr] || [];

        const strips = dayEvs.slice(0, 2).map(ev => `
          <div class="dp-cal-event-strip"
               style="background:${typeColors[ev.type]||typeColors.general}"
               draggable="true"
               ondragstart="event.stopPropagation();DP._calDragStart(event,${ev.id})"
               onclick="event.stopPropagation();DP.viewEvent(${ev.id})"
               title="${esc(ev.title)}${ev.start_time?' · '+ev.start_time:''}">
            ${ev.start_time?`<span style="opacity:.8;font-size:10px;margin-right:3px">${esc(ev.start_time)}</span>`:''}${esc(ev.title)}
          </div>`).join('');

        const moreHtml = dayEvs.length > 2
          ? `<div class="dp-cal-more" onclick="event.stopPropagation();DP.dayClick('${dateStr}')">+${dayEvs.length - 2} more</div>`
          : '';

        const hasEvents = dayEvs.length > 0 || multiDay.some(ev => { const ds = date; return ev._s <= ds && ev._e >= ds; });
        cellsHtml += `
          <div class="dp-cal-day${isToday?' dp-cal-day--today':''}${isWeekend?' dp-cal-day--weekend':''}${hasEvents?' dp-cal-day--has-events':''}"
               onclick="DP.dayClick('${dateStr}')" style="cursor:pointer"
               ondragover="event.preventDefault();DP._calDragOver(event)"
               ondragleave="DP._calDragLeave(event)"
               ondrop="event.preventDefault();DP._calDrop(event,'${dateStr}')">
            <span class="dp-cal-day-num${isToday?' dp-cal-today-num':''}">${d}</span>
            <div class="dp-cal-event-strips">${strips}${moreHtml}</div>
          </div>`;
      }

      html += `<div class="dp-cal-week">
        <div class="dp-cal-week-cells">${cellsHtml}</div>
        <div class="dp-cal-bar-rows">${barHtml}</div>
      </div>`;
    }

    container.innerHTML = html;
  }

  function dayClick(dateStr) {
    const month = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
    api('GET', `events?month=${month}`).then(data => {
      const events = (data?.events || []).filter(e => e.start_date.slice(0, 10) === dateStr);
      const typeColors = { general: '#146E7A', deadline: '#DC2626', meeting: '#059669', milestone: '#8D714E' };
      const typeLabels = { general: 'General', deadline: 'Deadline', meeting: 'Meeting', milestone: 'Milestone' };
      const fmtDateStr = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const evHtml = events.length
        ? events.map(ev => `
          <div class="dp-event-item" onclick="DP.closeModal(); setTimeout(()=>DP.viewEvent(${ev.id}),80)" style="cursor:pointer">
            <span class="dp-event-badge" style="background:${typeColors[ev.type] || '#146E7A'};color:#fff">${esc(typeLabels[ev.type] || ev.type)}</span>
            <div class="dp-event-item-body">
              <strong>${esc(ev.title)}</strong>
              ${ev.description ? `<p class="dp-event-desc">${esc(ev.description)}</p>` : ''}
              ${ev.end_date ? `<small class="dp-text-muted">Until ${esc(fmtDate(ev.end_date))}</small>` : ''}
            </div>
          </div>`).join('')
        : `<p class="dp-text-muted" style="padding:8px 0">No events on this date.</p>`;

      const addBtn = currentUser?.role === 'admin'
        ? `<div style="margin-top:16px"><button class="dp-btn dp-btn--primary" onclick="DP.closeModal(); DP.addEvent('${dateStr}')">+ Add Event</button></div>`
        : '';

      openModal(`<div class="dp-event-list">${evHtml}</div>${addBtn}`, { title: fmtDateStr });
    });
  }

  async function loadBoardPreviews() {
    const [ann, docs, mins] = await Promise.all([
      api('GET', 'posts?board=announcements&limit=3'),
      api('GET', 'posts?board=documents&limit=3'),
      api('GET', 'posts?board=minutes&limit=3'),
    ]);
    renderBoardPreview('announcements', ann?.posts || []);
    renderBoardPreview('documents', docs?.posts || []);
    renderBoardPreview('minutes', mins?.posts || []);
  }

  function renderBoardPreview(board, posts) {
    const container = $(`dp-preview-${board}`);
    if (!container) return;

    const boardTitles = { announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes' };
    const sectionMap  = { announcements: 'announcements', documents: 'documents', minutes: 'minutes' };

    let items = '';
    if (posts.length === 0) {
      items = `<p class="dp-preview-empty">No posts yet.</p>`;
    } else {
      items = posts.map(p => `
        <div class="dp-preview-item" onclick="DP.viewPost(${p.id})">
          ${p.pinned ? '<span class="dp-pin-icon" title="Pinned">&#128204;</span>' : ''}
          <span class="dp-preview-item-title">${esc(p.title)}</span>
          <span class="dp-preview-item-date">${esc(fmtDate(p.created_at))}</span>
        </div>
      `).join('');
    }

    container.innerHTML = `
      <div class="dp-preview-card">
        <div class="dp-preview-card-header">
          <h3 class="dp-preview-card-title">${esc(boardTitles[board] || board)}</h3>
        </div>
        <div class="dp-preview-card-body">${items}</div>
        <div class="dp-preview-card-footer">
          <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP.navigate('${sectionMap[board]}')">View All &rarr;</button>
        </div>
      </div>
    `;
  }

  // ── Boards ─────────────────────────────────────────────────────────────────
  async function loadBoard(boardName) {
    const data = await api('GET', `posts?board=${boardName}&limit=50`);
    renderBoardFull(boardName, data?.posts || []);
  }

  function renderBoardFull(boardName, posts) {
    const container = $(`dp-board-${boardName}`);
    if (!container) return;

    const boardTitles = {
      announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes',
      ...TEAM_BOARD_TITLES,
    };
    const title = boardTitles[boardName] || boardName;

    const isTeamBoard = TEAM_BOARDS.includes(boardName);
    const userTeam    = _teamBoard(currentUser?.department);
    const canCreate   = currentUser?.role === 'admin' || (isTeamBoard && userTeam === boardName);

    let addBtn = '';
    if (canCreate) {
      addBtn = `<button class="dp-btn dp-btn--primary" onclick="DP.createPost('${boardName}')">+ New Post</button>`;
    }

    let pinned = posts.filter(p => p.pinned);
    let regular = posts.filter(p => !p.pinned);

    let pinnedHtml = '';
    if (pinned.length > 0) {
      pinnedHtml = `
        <div class="dp-board-pinned">
          <div class="dp-board-pinned-label">Pinned</div>
          ${pinned.map(p => renderPostCard(p, boardName)).join('')}
        </div>
      `;
    }

    let regularHtml = '';
    if (regular.length === 0 && pinned.length === 0) {
      regularHtml = `<div class="dp-empty-state"><p>No posts yet.</p>${canCreate ? `<button class="dp-btn dp-btn--primary" onclick="DP.createPost('${boardName}')">Create the first post</button>` : ''}</div>`;
    } else {
      regularHtml = regular.map(p => renderPostCard(p, boardName)).join('');
    }

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">${esc(title)}</h2>
        ${addBtn}
      </div>
      ${pinnedHtml}
      <div class="dp-post-list">${regularHtml}</div>
    `;
  }

  function renderPostCard(post, boardName) {
    const excerpt = post.content
      ? post.content.replace(/<[^>]+>/g, '').slice(0, 120) + (post.content.length > 120 ? '...' : '')
      : '';
    let adminBtns = '';
    if (currentUser) {
      adminBtns = `
        <div class="dp-post-actions">
          <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="event.stopPropagation(); DP.editPost(${post.id})">&#9998; Edit</button>
          ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--xs dp-btn--danger dp-admin-only" onclick="event.stopPropagation(); DP.deletePost(${post.id}, '${boardName}')">Delete</button>` : ''}
        </div>
      `;
    }
    return `
      <div class="dp-post-card" onclick="DP.viewPost(${post.id})">
        <div class="dp-post-card-inner">
          <div class="dp-post-card-meta">
            ${post.pinned ? '<span class="dp-pin-icon">&#128204;</span>' : ''}
            <span class="dp-post-author">${esc(post.author_name)}</span>
            <span class="dp-post-date">${post.updated_at && post.updated_at !== post.created_at ? `Edited ${esc(fmtDateHM(post.updated_at))}` : esc(fmtDateHM(post.created_at))}</span>
            ${post.file_url ? '<span class="dp-post-file-badge">&#128206; File attached</span>' : ''}
            ${post.board === 'minutes' && post.approval_status ? (() => {
              const cls = { pending: 'dp-approval--pending', approved: 'dp-approval--approved', rejected: 'dp-approval--rejected' };
              const lbl = { pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected' };
              const st = post.approval_status || 'pending';
              return `<span class="dp-approval-badge ${cls[st]||cls.pending}">${lbl[st]||st}</span>`;
            })() : ''}
          </div>
          <h4 class="dp-post-title">${esc(post.title)}</h4>
          ${excerpt ? `<p class="dp-post-excerpt">${esc(excerpt)}</p>` : ''}
        </div>
        ${adminBtns}
      </div>
    `;
  }

  async function viewPost(id) {
    const [postData, commentsData] = await Promise.all([
      api('GET', `posts?id=${id}`),
      api('GET', `comments?post_id=${id}`),
    ]);
    if (!postData?.post) return;
    const p = postData.post;
    const comments = commentsData?.comments || [];
    const boardTitles = { announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes' };

    // ── Files ──────────────────────────────────────────────────────
    const images = (p.files || []).filter(f => f.is_image);
    const others = (p.files || []).filter(f => !f.is_image);

    const imagesHtml = images.length ? `
      <div class="dp-post-images">
        ${images.map(f => `
          <a href="${esc(f.file_url)}" target="_blank" rel="noopener">
            <img src="${esc(f.file_url)}" alt="${esc(f.file_name)}" class="dp-post-thumb" />
          </a>
        `).join('')}
      </div>` : '';

    const attachHtml = others.length ? `
      <div class="dp-post-attachments">
        <div class="dp-attach-label">Attachments</div>
        ${others.map(f => `
          <a href="${esc(f.file_url)}" download="${esc(f.file_name)}" class="dp-attach-item">
            <span class="dp-attach-icon">${fileIcon(f.file_type)}</span>
            <span class="dp-attach-name">${esc(f.file_name)}</span>
            <span class="dp-attach-size">${fmtSize(f.file_size)}</span>
          </a>
        `).join('')}
      </div>` : '';

    // ── Content ────────────────────────────────────────────────────
    const contentHtml = p.content
      ? `<div class="dp-post-detail-content">${_sanitizeHtml(_legacyToHtml(p.content))}</div>`
      : '';

    // ── Approval Section (Meeting Minutes only) ────────────────────
    const CUTOFF_DATE = '2026-04-01';
    const isPreCutoff = (p.created_at || '').slice(0, 10) < CUTOFF_DATE;
    const approvals = p.approvals || [];
    const approvalBadgeHtml = p.board === 'minutes' ? (() => {
      const total = approvals.length;
      const approvedCount = approvals.filter(a => a.status === 'approved').length;
      const hasMajority = total > 0 && approvedCount > total / 2;
      const userNames = [currentUser?.display_name, currentUser?.username].filter(Boolean).map(s => s.toLowerCase());
      const isAdmin = currentUser?.role === 'admin';

      const statusIcon = { pending: '⏳', approved: '✅', rejected: '❌' };
      const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

      const approverRows = approvals.map(a => {
        const canVote = a.status === 'pending' && userNames.includes(a.approver_name.toLowerCase());
        const canAdminOverride = isAdmin && isPreCutoff;
        const overrideControls = canAdminOverride ? `
          <div class="dp-approval-override" id="override-${a.id}" style="display:none">
            <select class="dp-input dp-input--xs" id="ov-status-${a.id}">
              <option value="pending" ${a.status==='pending'?'selected':''}>Pending</option>
              <option value="approved" ${a.status==='approved'?'selected':''}>Approved</option>
              <option value="rejected" ${a.status==='rejected'?'selected':''}>Rejected</option>
            </select>
            <input type="text" class="dp-input dp-input--xs" id="ov-note-${a.id}" placeholder="Override reason (optional)" style="flex:1" />
            <button class="dp-btn dp-btn--xs dp-btn--primary" onclick="DP._submitApprovalOverride(${p.id},'${esc(a.approver_name)}',${a.id})">Apply</button>
            <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="document.getElementById('override-${a.id}').style.display='none'">✕</button>
          </div>` : '';

        const voteButtons = canVote ? `
          <button class="dp-btn dp-btn--xs dp-btn--primary" onclick="DP._submitVote(${p.id},'${esc(a.approver_name)}','approved')">✅ Approve</button>
          <button class="dp-btn dp-btn--xs dp-btn--ghost" style="border-color:var(--red);color:var(--red)" onclick="DP._submitVote(${p.id},'${esc(a.approver_name)}','rejected')">❌ Reject</button>` : '';

        const overrideBtn = canAdminOverride && !canVote ? `
          <button class="dp-btn dp-btn--xs dp-btn--ghost" style="font-size:10px" onclick="document.getElementById('override-${a.id}').style.display='flex'">Override</button>` : '';

        const overrideTag = a.override_by ? `<span style="font-size:10px;color:var(--text-3)">(overridden by ${esc(a.override_by)})</span>` : '';
        const votedAt = a.voted_at ? `<span style="font-size:10px;color:var(--text-3)"> · ${esc(a.voted_at.slice(0,10))}</span>` : '';

        return `<div class="dp-approval-row" style="flex-direction:column;gap:4px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>${statusIcon[a.status]||'⏳'}</span>
            <strong style="font-size:13px">${esc(a.approver_name)}</strong>
            <span class="dp-approval-badge ${a.status==='approved'?'dp-approval--approved':a.status==='rejected'?'dp-approval--rejected':'dp-approval--pending'}">${statusLabel[a.status]||a.status}</span>
            ${votedAt}
            ${overrideTag}
            ${voteButtons}
            ${overrideBtn}
          </div>
          ${overrideControls}
        </div>`;
      }).join('');

      const summaryClass = hasMajority ? 'dp-approval--approved' : 'dp-approval--pending';
      const summaryText = total === 0 ? 'No approvers assigned'
        : hasMajority ? `✅ Approved — ${approvedCount}/${total} voted (majority reached)`
        : `⏳ Pending — ${approvedCount}/${total} approved`;

      return `<div class="dp-approvals-section">
        <div class="dp-approvals-header">
          <strong>Approvers</strong>
          <span class="dp-approval-badge ${summaryClass}" style="font-size:12px">${summaryText}</span>
        </div>
        ${approvals.length ? `<div class="dp-approvals-list">${approverRows}</div>` : '<div style="font-size:12px;color:var(--text-3);padding:6px 0">No approvers assigned to this minutes post.</div>'}
        ${hasMajority ? `<div class="dp-approval-lock-notice">🔒 This minutes post is locked. Contact <strong>Sonny</strong> or <strong>Jimmy</strong> to request changes.</div>` : ''}
      </div>`;
    })() : '';

    // ── Linked Calendar Event (Meeting Minutes only) ───────────────
    const linkedEventHtml = p.linked_event ? `
      <div class="dp-linked-minutes-section">
        <div class="dp-linked-section-label">&#128197; Linked Meeting</div>
        <div class="dp-linked-event-card" onclick="DP.closeModal(); setTimeout(()=>DP.viewEvent(${p.linked_event.id}),80)">
          <span style="font-size:18px">&#128197;</span>
          <strong>${esc(p.linked_event.title)}</strong>
          <span class="dp-le-date">${esc(p.linked_event.start_date)}${p.linked_event.start_time ? ' ' + esc(p.linked_event.start_time) : ''}</span>
        </div>
      </div>` : '';

    // ── Edit History ───────────────────────────────────────────────
    const history = p.history || [];
    const historyHtml = history.length ? `
      <details class="dp-post-history">
        <summary class="dp-post-history-toggle">
          Edit History <span class="dp-history-count">${history.length}</span>
        </summary>
        <div class="dp-history-list">
          ${history.map(h => `
            <div class="dp-history-entry">
              <div class="dp-history-header">
                <span class="dp-history-editor">${esc(h.editor_name)}</span>
                <span class="dp-history-date">${fmtFull(h.edited_at)}</span>
              </div>
              ${h.edit_note ? `<div class="dp-history-note">${esc(h.edit_note)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </details>` : '';

    // ── Comments ───────────────────────────────────────────────────
    const commentsHtml = `
      <div class="dp-comments-section">
        <div class="dp-comments-header">Comments <span class="dp-history-count" id="dp-comment-count">${comments.length}</span></div>
        <div id="dp-comments-list" class="dp-comments-list">
          ${_renderCommentsHtml(comments, id)}
        </div>
        <div class="dp-comment-form">
          <textarea id="dp-comment-input" class="dp-input dp-textarea dp-textarea--sm" placeholder="Write a comment…" rows="2"></textarea>
          <div style="margin-top:8px;text-align:right">
            <button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP.addComment(${id})">Post Comment</button>
          </div>
        </div>
      </div>`;

    openModal(`
      <div class="dp-post-detail">
        <div class="dp-post-detail-meta">
          <span class="dp-badge dp-badge--board">${esc(boardTitles[p.board] || p.board)}</span>
          ${p.pinned ? '<span class="dp-badge dp-badge--pinned">&#128204; Pinned</span>' : ''}
        </div>
        <div class="dp-post-detail-info">
          <span class="dp-text-muted">By ${esc(p.author_name)}</span>
          <span class="dp-text-muted">${fmtFull(p.created_at)}</span>
          ${p.updated_at !== p.created_at ? `<span class="dp-text-muted">Edited: ${fmtFull(p.updated_at)}</span>` : ''}
        </div>
        ${approvalBadgeHtml}
        ${contentHtml}
        ${linkedEventHtml}
        ${imagesHtml}
        ${attachHtml}
        ${historyHtml}
        ${commentsHtml}
      </div>
    `, { title: p.title, wide: true });
  }

  async function createPost(boardName) {
    const boardTitles = { announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes' };
    const isMinutes = boardName === 'minutes';
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="fp-title" class="dp-input" type="text" placeholder="Post title" maxlength="200" />
        </div>
        ${isMinutes ? `
        <div class="dp-form-row">
          <label class="dp-label">&#128197; Linked Meeting <span style="color:var(--text-3);font-size:11px">(Optional)</span></label>
          <div class="dp-event-picker" id="fp-event-picker">
            <div class="dp-event-picker-row">
              <input type="text" class="dp-input" id="fp-event-search" placeholder="Search by title or date…" autocomplete="off" />
              <button type="button" class="dp-event-clear-btn" id="fp-event-clear" style="display:none" onclick="DP._clearEventPicker('fp')">✕</button>
            </div>
            <div class="dp-event-dropdown" id="fp-event-dropdown"></div>
            <input type="hidden" id="fp-linked-event" value="" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Approvers <span style="color:var(--text-3);font-size:11px">(Optional — each added person must vote Approve)</span></label>
          <div class="dp-tag-input-wrap" id="fp-approvers-wrap">
            <div class="dp-tag-list" id="fp-approver-tags"></div>
            <div style="display:flex;gap:6px;margin-top:6px">
              <select class="dp-input" id="fp-approver-select" style="flex:1">
                <option value="">Loading team members…</option>
              </select>
              <button type="button" class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._addApproverTag('fp')">Add</button>
            </div>
          </div>
        </div>` : ''}
        <div class="dp-form-row">
          <label class="dp-label">Content</label>
          <div class="dp-te-wrapper">
            <div class="dp-te-toolbar">
              <button type="button" class="dp-te-btn" data-cmd="bold" onmousedown="event.preventDefault();DP._teCmd('bold')" title="Bold"><b>B</b></button>
              <button type="button" class="dp-te-btn" data-cmd="italic" onmousedown="event.preventDefault();DP._teCmd('italic')" title="Italic"><i>I</i></button>
              <button type="button" class="dp-te-btn" data-cmd="strike" onmousedown="event.preventDefault();DP._teCmd('strike')" title="Strikethrough"><s>S</s></button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="h2" onmousedown="event.preventDefault();DP._teCmd('h2')" title="Heading 2">H2</button>
              <button type="button" class="dp-te-btn" data-cmd="h3" onmousedown="event.preventDefault();DP._teCmd('h3')" title="Heading 3">H3</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="bulletList" onmousedown="event.preventDefault();DP._teCmd('bulletList')" title="Bullet List">&#8226; List</button>
              <button type="button" class="dp-te-btn" data-cmd="orderedList" onmousedown="event.preventDefault();DP._teCmd('orderedList')" title="Numbered List">1. List</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="blockquote" onmousedown="event.preventDefault();DP._teCmd('blockquote')" title="Quote">&#8220;</button>
              <button type="button" class="dp-te-btn" data-cmd="code" onmousedown="event.preventDefault();DP._teCmd('code')" title="Code">&lt;/&gt;</button>
            </div>
            <div id="fp-tiptap"></div>
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Attachments</label>
          <label class="dp-upload-btn">
            <span>&#128206; Choose files…</span>
            <input id="fp-files" type="file" multiple style="display:none" onchange="DP._handleFileSelect(this, 'fp-filelist')" />
          </label>
          <p class="dp-attach-hint">Max 5 files · 100 MB each · All file types</p>
          <div id="fp-filelist" class="dp-file-preview-list"></div>
        </div>
        <div class="dp-form-row dp-form-row--check">
          <label class="dp-check-label">
            <input id="fp-pinned" type="checkbox" class="dp-check" />
            <span>Pin this post to the top</span>
          </label>
        </div>
      </div>
    `, {
      title: `New Post — ${boardTitles[boardName] || boardName}`,
      confirmLabel: 'Create Post',
      onConfirm: async () => {
        const board   = boardName;
        const title   = $('fp-title').value.trim();
        const content = _getTiptapHTML();
        const pinned  = $('fp-pinned').checked;
        const linked_event_id = $('fp-linked-event') ? parseInt($('fp-linked-event').value) || null : null;
        const approvers = _fpApprovers ? [..._fpApprovers] : [];
        if (!title) { showToast('Title is required.', 'error'); return; }

        // Upload selected files first
        const fileInput = $('fp-files');
        const uploadedFiles = await uploadFiles(fileInput, 'fp-filelist');
        if (uploadedFiles === null) return; // upload error

        const result = await api('POST', 'posts', {
          board, title, content: content || null, pinned,
          files: uploadedFiles, linked_event_id,
          ...(isMinutes ? { approvers } : {}),
        });
        if (result) {
          closeModal();
          showToast('Post created.', 'success');
          loadBoard(board);
          if (activeSection === 'home') loadBoardPreviews();
        }
      },
    });
    _waitForTiptap(() => _initTiptap('fp-tiptap', null));
    _fpApprovers = [];
    _renderApproverTags('fp');
    if (isMinutes) {
      const eventsReady = _allEvents.length > 0
        ? Promise.resolve({ events: _allEvents })
        : api('GET', 'events');
      eventsReady.then(d => {
        if (!d?.events) return;
        _allEvents = d.events;
        _initEventPicker('fp', _allEvents, null);
      });
      const usersReady = _allUsers.length > 0
        ? Promise.resolve({ users: _allUsers })
        : api('GET', 'users?picker=1');
      usersReady.then(d => {
        if (!d?.users) return;
        _allUsers = d.users;
        _refreshApproverSelect('fp');
      });
    }
  }

  async function editPost(id) {
    const data = await api('GET', `posts?id=${id}`);
    if (!data?.post) return;
    const p = data.post;

    // Lock check for approved minutes
    if (p.board === 'minutes' && p.approval_status === 'approved') {
      openModal(
        `<p style="font-size:14px;line-height:1.7;color:var(--text-2)">
          This meeting minutes has been <strong>approved by majority vote</strong> and is locked.<br><br>
          To request changes, contact <strong>Sonny</strong> or <strong>Jimmy</strong>.
        </p>`,
        { title: '🔒 Minutes Locked' }
      );
      return;
    }

    const isMinutes = p.board === 'minutes';
    // Start with existing files
    let keptFiles = [...(p.files || [])];

    const existingFilesHtml = keptFiles.length
      ? keptFiles.map((f, i) => `
          <div class="dp-file-kept" id="kept-${i}">
            <span>${f.is_image ? '🖼' : fileIcon(f.file_type)}</span>
            <span class="dp-attach-name">${esc(f.file_name)}</span>
            <button type="button" class="dp-file-remove" onclick="DP._removeKeptFile(${i})">×</button>
          </div>`).join('')
      : '<span style="font-size:12px;color:var(--text-3)">No attachments</span>';

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="ep-title" class="dp-input" type="text" value="${esc(p.title)}" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Content</label>
          <div class="dp-te-wrapper">
            <div class="dp-te-toolbar">
              <button type="button" class="dp-te-btn" data-cmd="bold" onmousedown="event.preventDefault();DP._teCmd('bold')" title="Bold"><b>B</b></button>
              <button type="button" class="dp-te-btn" data-cmd="italic" onmousedown="event.preventDefault();DP._teCmd('italic')" title="Italic"><i>I</i></button>
              <button type="button" class="dp-te-btn" data-cmd="strike" onmousedown="event.preventDefault();DP._teCmd('strike')" title="Strikethrough"><s>S</s></button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="h2" onmousedown="event.preventDefault();DP._teCmd('h2')" title="Heading 2">H2</button>
              <button type="button" class="dp-te-btn" data-cmd="h3" onmousedown="event.preventDefault();DP._teCmd('h3')" title="Heading 3">H3</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="bulletList" onmousedown="event.preventDefault();DP._teCmd('bulletList')" title="Bullet List">&#8226; List</button>
              <button type="button" class="dp-te-btn" data-cmd="orderedList" onmousedown="event.preventDefault();DP._teCmd('orderedList')" title="Numbered List">1. List</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="blockquote" onmousedown="event.preventDefault();DP._teCmd('blockquote')" title="Quote">&#8220;</button>
              <button type="button" class="dp-te-btn" data-cmd="code" onmousedown="event.preventDefault();DP._teCmd('code')" title="Code">&lt;/&gt;</button>
            </div>
            <div id="ep-tiptap"></div>
          </div>
        </div>
        ${isMinutes ? `
        <div class="dp-form-row">
          <label class="dp-label">&#128197; Linked Meeting <span style="color:var(--text-3);font-size:11px">(Optional)</span></label>
          <div class="dp-event-picker" id="ep-event-picker">
            <div class="dp-event-picker-row">
              <input type="text" class="dp-input" id="ep-event-search" placeholder="Search by title or date…" autocomplete="off" />
              <button type="button" class="dp-event-clear-btn" id="ep-event-clear" style="display:none" onclick="DP._clearEventPicker('ep')">✕</button>
            </div>
            <div class="dp-event-dropdown" id="ep-event-dropdown"></div>
            <input type="hidden" id="ep-linked-event" value="" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Approvers <span style="color:var(--text-3);font-size:11px">(Add or remove pending approvers. Already-voted approvers cannot be removed.)</span></label>
          <div class="dp-tag-input-wrap" id="ep-approvers-wrap">
            <div class="dp-tag-list" id="ep-approver-tags"></div>
            <div style="display:flex;gap:6px;margin-top:6px">
              <select class="dp-input" id="ep-approver-select" style="flex:1">
                <option value="">Loading team members…</option>
              </select>
              <button type="button" class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._addApproverTag('ep')">Add</button>
            </div>
          </div>
        </div>` : ''}
        <div class="dp-form-row">
          <label class="dp-label">Current Attachments</label>
          <div id="ep-kept-files" class="dp-kept-files">${existingFilesHtml}</div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Add New Files</label>
          <label class="dp-upload-btn">
            <span>&#128206; Choose files…</span>
            <input id="ep-files" type="file" multiple style="display:none" onchange="DP._handleFileSelect(this, 'ep-filelist')" />
          </label>
          <p class="dp-attach-hint">Max 5 files · 100 MB each · All file types</p>
          <div id="ep-filelist" class="dp-file-preview-list"></div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Edit Note <span style="color:var(--text-3);font-size:11px">(optional – shown in edit history)</span></label>
          <input id="ep-note" class="dp-input" type="text" placeholder="What did you change?" maxlength="500" />
        </div>
        <div class="dp-form-row dp-form-row--check">
          <label class="dp-check-label">
            <input id="ep-pinned" type="checkbox" class="dp-check" ${p.pinned ? 'checked' : ''} />
            <span>Pin this post to the top</span>
          </label>
        </div>
      </div>
    `, {
      title: 'Edit Post',
      confirmLabel: 'Save Changes',
      onConfirm: async () => {
        const title     = $('ep-title').value.trim();
        const content   = _getTiptapHTML();
        const pinned    = $('ep-pinned').checked;
        const edit_note = $('ep-note').value.trim();
        if (!title) { showToast('Title is required.', 'error'); return; }

        // Upload new files
        const fileInput = $('ep-files');
        const newFiles = await uploadFiles(fileInput, 'ep-filelist');
        if (newFiles === null) return;

        // Read which kept files are still marked (not removed)
        const keptEls = document.querySelectorAll('#ep-kept-files .dp-file-kept');
        const remainingKept = [];
        keptEls.forEach((el, i) => {
          if (!el.classList.contains('dp-file-removed') && keptFiles[i]) {
            remainingKept.push(keptFiles[i]);
          }
        });

        const allFiles = [
          ...remainingKept.map(f => ({ url: f.file_url, name: f.file_name, type: f.file_type, size: f.file_size, is_image: !!f.is_image })),
          ...newFiles,
        ];

        const linked_event_id = $('ep-linked-event') ? parseInt($('ep-linked-event').value) || null : undefined;
        const approvers = _epApprovers ? [..._epApprovers] : undefined;
        const result = await api('PUT', `posts?id=${id}`, {
          title, content: content || null, pinned,
          edit_note: edit_note || null,
          files: allFiles,
          ...(linked_event_id !== undefined ? { linked_event_id } : {}),
          ...(isMinutes && approvers !== undefined ? { approvers } : {}),
        });
        if (result) {
          closeModal();
          showToast('Post updated.', 'success');
          loadBoard(p.board);
          if (activeSection === 'home') loadBoardPreviews();
        }
      },
    });

    // Expose remove helper on DP temporarily (scoped to this modal)
    DP._removeKeptFile = (i) => {
      const el = document.getElementById(`kept-${i}`);
      if (el) el.classList.add('dp-file-removed');
    };
    _waitForTiptap(() => _initTiptap('ep-tiptap', _legacyToHtml(p.content)));
    _epApprovers = (p.approvals || []).map(a => a.approver_name);
    _renderApproverTags('ep');
    if (isMinutes) {
      const eventsReady = _allEvents.length > 0
        ? Promise.resolve({ events: _allEvents })
        : api('GET', 'events');
      eventsReady.then(d => {
        if (!d?.events) return;
        _allEvents = d.events;
        _initEventPicker('ep', _allEvents, p.linked_event_id || null);
      });
      const usersReady = _allUsers.length > 0
        ? Promise.resolve({ users: _allUsers })
        : api('GET', 'users?picker=1');
      usersReady.then(d => {
        if (!d?.users) return;
        _allUsers = d.users;
        _refreshApproverSelect('ep');
      });
    }
  }

  async function deletePost(id, boardName) {
    openModal(`
      <p>Are you sure you want to delete this post? This action cannot be undone.</p>
    `, {
      title: 'Delete Post',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const result = await api('DELETE', `posts?id=${id}`);
        if (result) {
          closeModal();
          showToast('Post deleted.', 'success');
          loadBoard(boardName);
          if (activeSection === 'home') loadBoardPreviews();
        }
      },
    });
  }

  // ── Calendar Events ────────────────────────────────────────────────────────
  async function addEvent(prefillDate) {
    const today = prefillDate || new Date().toISOString().slice(0, 10);
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="ae-title" class="dp-input" type="text" placeholder="Event title" maxlength="200" />
        </div>
        <div style="display:flex;gap:12px">
          <div class="dp-form-row" style="flex:1">
            <label class="dp-label">Start Date <span class="dp-required">*</span></label>
            <input id="ae-start" class="dp-input" type="date" value="${esc(today)}" />
          </div>
          <div class="dp-form-row" style="flex:0 0 110px">
            <label class="dp-label">Start Time</label>
            <input id="ae-start-time" class="dp-input" type="time" />
          </div>
        </div>
        <div style="display:flex;gap:12px">
          <div class="dp-form-row" style="flex:1">
            <label class="dp-label">End Date</label>
            <input id="ae-end" class="dp-input" type="date" />
          </div>
          <div class="dp-form-row" style="flex:0 0 110px">
            <label class="dp-label">End Time</label>
            <input id="ae-end-time" class="dp-input" type="time" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Type</label>
          <select id="ae-type" class="dp-input">
            <option value="general">General</option>
            <option value="meeting">Meeting</option>
            <option value="deadline">Deadline</option>
            <option value="milestone">Milestone</option>
          </select>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Description</label>
          <textarea id="ae-desc" class="dp-input dp-textarea dp-textarea--sm" placeholder="Optional description"></textarea>
        </div>
      </div>
    `, {
      title: 'Add Calendar Event',
      confirmLabel: 'Add Event',
      onConfirm: async () => {
        const title      = $('ae-title').value.trim();
        const start_date = $('ae-start').value;
        const end_date   = $('ae-end').value;
        const type       = $('ae-type').value;
        const description = $('ae-desc').value.trim();

        if (!title || !start_date) { showToast('Title and start date are required.', 'error'); return; }

        const result = await api('POST', 'events', {
          title, start_date,
          start_time: $('ae-start-time')?.value || null,
          end_date: end_date || null,
          end_time: $('ae-end-time')?.value || null,
          type, description: description || null,
        });
        if (result) {
          closeModal();
          showToast('Event added.', 'success');
          loadCalendar();
        }
      },
    });
  }

  async function deleteEvent(id) {
    openModal(`
      <p>Are you sure you want to delete this event?</p>
    `, {
      title: 'Delete Event',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const result = await api('DELETE', `events?id=${id}`);
        if (result) {
          closeModal();
          showToast('Event deleted.', 'success');
          loadCalendar();
        }
      },
    });
  }

  async function viewEvent(id) {
    const data = await api('GET', `events?id=${id}`);
    if (!data?.event) return;
    const ev = data.event;
    const typeLabels = { general: 'General', deadline: 'Deadline', meeting: 'Meeting', milestone: 'Milestone' };
    const typeColors = { general: '#146E7A', deadline: '#DC2626', meeting: '#059669', milestone: '#8D714E' };

    const historyHtml = (ev.history || []).length ? `
      <details class="dp-post-history" open>
        <summary class="dp-post-history-toggle">
          Edit History <span class="dp-history-count">${ev.history.length}</span>
        </summary>
        <div class="dp-history-list">
          ${ev.history.map(h => `
            <div class="dp-history-entry">
              <div class="dp-history-header">
                <span class="dp-history-editor">${esc(h.editor_name)}</span>
                <span class="dp-history-date">${fmtFull(h.edited_at)}</span>
              </div>
              <div class="dp-history-note">${esc(h.edit_note)}</div>
            </div>`).join('')}
        </div>
      </details>` : '';

    const linkedMinutes = ev.linked_minutes || [];
    const linkedMinutesHtml = linkedMinutes.length ? `
      <div class="dp-linked-minutes-section">
        <div class="dp-linked-section-label">&#128221; Meeting Minutes (${linkedMinutes.length})</div>
        ${linkedMinutes.map(m => `
          <div class="dp-linked-minutes-item" onclick="DP.closeModal(); setTimeout(()=>DP.viewPost(${m.id}),80)">
            <span style="font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.title)}</span>
            <span style="color:var(--text-3);font-size:12px;white-space:nowrap;flex-shrink:0">${esc(m.author_name)} · ${fmtDate(m.created_at)}</span>
          </div>`).join('')}
        ${currentUser?.role === 'admin' ? `
        <button class="dp-btn dp-btn--ghost dp-btn--sm" style="margin-top:6px" onclick="DP.closeModal(); setTimeout(()=>DP.navigate('minutes'),80);">
          + New Minutes Post
        </button>` : ''}
      </div>` : `
      <div class="dp-linked-minutes-section">
        <div class="dp-linked-section-label">&#128221; Meeting Minutes</div>
        <div style="font-size:12px;color:var(--text-3);padding:6px 0">No linked minutes yet.</div>
        ${currentUser?.role === 'admin' ? `
        <button class="dp-btn dp-btn--ghost dp-btn--sm" style="margin-top:4px" onclick="DP.closeModal(); setTimeout(()=>DP.navigate('minutes'),80);">
          + New Minutes Post
        </button>` : ''}
      </div>`;

    openModal(`
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${typeColors[ev.type] || '#146E7A'}22;color:${typeColors[ev.type] || '#146E7A'}">${esc(typeLabels[ev.type] || ev.type)}</span>
          <span style="font-size:13px;color:var(--text-3)">${esc(ev.start_date)}${ev.start_time ? ` ${esc(ev.start_time)}` : ''}${ev.end_date ? ` → ${esc(ev.end_date)}${ev.end_time ? ' ' + esc(ev.end_time) : ''}` : ''}</span>
        </div>
        ${ev.description ? `<div class="dp-post-detail-content" style="margin-bottom:16px">${ev.description.split('\n').map(l => esc(l)).join('<br>')}</div>` : ''}
        <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">
          Created by ${esc(ev.created_by_name || 'Unknown')} · ${fmtFull(ev.created_at)}
        </div>
        <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP.closeModal(); setTimeout(()=>DP.editEvent(${ev.id}),80)">&#9998; Edit Event</button>
        ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--ghost dp-btn--sm" style="color:var(--red);margin-left:8px" onclick="DP.closeModal(); setTimeout(()=>DP.deleteEvent(${ev.id}),80)">Delete</button>` : ''}
        ${linkedMinutesHtml}
        ${historyHtml}
      </div>
    `, { title: esc(ev.title), wide: false });
  }

  async function editEvent(id) {
    const data = await api('GET', `events?id=${id}`);
    if (!data?.event) return;
    const ev = data.event;

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="ee-title" class="dp-input" type="text" value="${esc(ev.title)}" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Description</label>
          <textarea id="ee-desc" class="dp-input dp-textarea">${esc(ev.description || '')}</textarea>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div class="dp-form-row" style="flex:1;min-width:140px">
            <label class="dp-label">Start Date <span class="dp-required">*</span></label>
            <input id="ee-start" class="dp-input" type="date" value="${esc(ev.start_date)}" />
          </div>
          <div class="dp-form-row" style="flex:0 0 110px">
            <label class="dp-label">Start Time</label>
            <input id="ee-start-time" class="dp-input" type="time" value="${esc(ev.start_time || '')}" />
          </div>
          <div class="dp-form-row" style="flex:1;min-width:140px">
            <label class="dp-label">End Date</label>
            <input id="ee-end" class="dp-input" type="date" value="${esc(ev.end_date || '')}" />
          </div>
          <div class="dp-form-row" style="flex:0 0 110px">
            <label class="dp-label">End Time</label>
            <input id="ee-end-time" class="dp-input" type="time" value="${esc(ev.end_time || '')}" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Type</label>
          <select id="ee-type" class="dp-input">
            <option value="general"${ev.type==='general'?' selected':''}>General</option>
            <option value="deadline"${ev.type==='deadline'?' selected':''}>Deadline</option>
            <option value="meeting"${ev.type==='meeting'?' selected':''}>Meeting</option>
            <option value="milestone"${ev.type==='milestone'?' selected':''}>Milestone</option>
          </select>
        </div>
        <div class="dp-form-row">
          <label class="dp-label" style="display:flex;gap:6px;align-items:center">
            Edit Reason <span class="dp-required">*</span>
            <span style="font-size:11px;font-weight:400;color:var(--text-3)">(required for all edits)</span>
          </label>
          <input id="ee-note" class="dp-input" type="text" placeholder="Why are you editing this event?" maxlength="500" />
        </div>
      </div>
    `, {
      title: 'Edit Event',
      confirmLabel: 'Save Changes',
      onConfirm: async () => {
        const title     = $('ee-title')?.value.trim();
        const edit_note = $('ee-note')?.value.trim();
        if (!title)     { showToast('Title is required.', 'error'); return; }
        if (!edit_note) { showToast('Edit reason is required.', 'error'); return; }

        const result = await api('PUT', `events?id=${id}`, {
          title,
          description: $('ee-desc')?.value.trim() || null,
          start_date:  $('ee-start')?.value,
          start_time:  $('ee-start-time')?.value || null,
          end_date:    $('ee-end')?.value || null,
          end_time:    $('ee-end-time')?.value || null,
          type:        $('ee-type')?.value,
          edit_note,
        });
        if (result) {
          closeModal();
          showToast('Event updated.', 'success');
          loadCalendar();
        }
      },
    });
  }

  function _renderCommentsHtml(comments, postId) {
    if (!comments.length) {
      return `<p class="dp-text-muted" style="font-size:13px;padding:4px 0">No comments yet.</p>`;
    }
    return comments.map(c => `
      <div class="dp-comment-item" id="dp-comment-${c.id}">
        <div class="dp-comment-meta">
          <span class="dp-comment-author">${esc(c.author_name)}</span>
          <span class="dp-comment-date">${fmtFull(c.created_at)}</span>
          ${(currentUser?.role === 'admin' || c.author_id === currentUser?.id) ? `<button class="dp-comment-delete" onclick="DP.deleteComment(${c.id}, ${postId})" title="Delete">×</button>` : ''}
        </div>
        <div class="dp-comment-body">${esc(c.content)}</div>
      </div>`).join('');
  }

  async function addComment(postId) {
    const input   = $('dp-comment-input');
    const content = input?.value.trim();
    if (!content) { showToast('Comment cannot be empty.', 'error'); return; }
    const result = await api('POST', 'comments', { post_id: postId, content });
    if (result) {
      input.value = '';
      const data = await api('GET', `comments?post_id=${postId}`);
      const list  = $('dp-comments-list');
      const count = $('dp-comment-count');
      if (list)  list.innerHTML  = _renderCommentsHtml(data?.comments || [], postId);
      if (count) count.textContent = String((data?.comments || []).length);
    }
  }

  async function deleteComment(commentId, postId) {
    if (!confirm('Delete this comment?')) return;
    const result = await api('DELETE', `comments?id=${commentId}`);
    if (result) {
      const data  = await api('GET', `comments?post_id=${postId}`);
      const list  = $('dp-comments-list');
      const count = $('dp-comment-count');
      if (list)  list.innerHTML  = _renderCommentsHtml(data?.comments || [], postId);
      if (count) count.textContent = String((data?.comments || []).length);
    }
  }

  // ── Project Team Contacts ──────────────────────────────────────────────────
  async function loadContacts() {
    const data = await api('GET', 'contacts');
    renderContacts(data?.contacts || [], data?.team || []);
  }

  function renderContacts(contacts, team) {
    const container = $('dp-contacts-content');
    if (!container) return;

    const all = [
      ...(team || []).map(c => ({ ...c, _src: 'team' })),
      ...(contacts || []).map(c => ({ ...c, _src: 'external' })),
    ];

    const rows = all.map(c => `
      <tr>
        <td>
          <div class="dp-table-user">
            <div class="dp-contact-avatar dp-contact-avatar--sm">${esc((c.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2))}</div>
            <strong>${esc(c.name || '')}</strong>
          </div>
        </td>
        <td>${esc(c.role_title || '—')}</td>
        <td>${c.department ? `<span class="dp-dept-chip">${esc(c.department)}</span>` : '—'}</td>
        <td>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</td>
        <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</td>
        <td style="font-size:12px;color:var(--text-3)">${esc(c.note || '')}</td>
      </tr>`).join('');

    const tableHtml = all.length ? `
      <div class="dp-table-wrap">
        <table class="dp-table">
          <thead><tr>
            <th>Name</th>
            <th>Role / Title</th>
            <th>Department</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Note</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<div class="dp-empty-state"><p>No team members found.</p></div>`;

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Project Team Contacts</h2>
      </div>
      ${tableHtml}
    `;
  }


  // ── User Management ────────────────────────────────────────────────────────
  let _allUsers = [];
  let _fpApprovers = [];
  let _epApprovers = [];
  let _userSort = { col: 'display_name', dir: 'asc' };

  async function loadUsers() {
    const data = await api('GET', 'users');
    _allUsers = data?.users || [];
    renderUsers(_allUsers);
    loadDepartments();
  }

  function filterAndRenderUsers() {
    const q      = ($('um-search')?.value || '').toLowerCase();
    const role   = $('um-role')?.value || '';
    const status = $('um-status')?.value || '';
    const dept   = $('um-dept')?.value || '';

    let list = _allUsers.filter(u => {
      if (q && !((u.display_name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q))) return false;
      if (role   && u.role !== role) return false;
      if (status === 'active'   && !u.is_active) return false;
      if (status === 'inactive' &&  u.is_active) return false;
      if (dept   && (u.department || '') !== dept) return false;
      return true;
    });

    const { col, dir } = _userSort;
    list.sort((a, b) => {
      let av = a[col] ?? '', bv = b[col] ?? '';
      if (col === 'is_active') { av = a.is_active ? 1 : 0; bv = b.is_active ? 1 : 0; }
      if (col === 'created_at') { av = a.created_at || ''; bv = b.created_at || ''; }
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });

    const tbody = document.querySelector('#dp-users-content tbody');
    if (!tbody) return;
    tbody.innerHTML = buildUserRows(list);
  }

  function sortUsers(col) {
    if (_userSort.col === col) {
      _userSort.dir = _userSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      _userSort = { col, dir: 'asc' };
    }
    // update header classes
    document.querySelectorAll('#dp-users-content .dp-th-sort').forEach(th => {
      th.classList.remove('dp-sort-asc', 'dp-sort-desc');
      if (th.dataset.col === col) th.classList.add(_userSort.dir === 'asc' ? 'dp-sort-asc' : 'dp-sort-desc');
    });
    filterAndRenderUsers();
  }

  function buildUserRows(users) {
    if (!users.length) return `<tr><td colspan="8" class="dp-table-empty">No users found.</td></tr>`;
    return users.map(u => {
      const initials = (u.display_name || u.username || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const roleBadge = u.role === 'admin'
        ? `<span class="dp-badge dp-badge--admin">Admin</span>`
        : `<span class="dp-badge dp-badge--member">Member</span>`;
      const statusBadge = u.is_active
        ? `<span class="dp-badge dp-badge--active">Active</span>`
        : `<span class="dp-badge dp-badge--inactive">Inactive</span>`;
      const isSelf = u.id === currentUser?.id;
      return `
        <tr class="${!u.is_active ? 'dp-row--inactive' : ''}">
          <td>
            <div class="dp-table-user">
              <div class="dp-user-avatar dp-user-avatar--sm">${esc(initials)}</div>
              <span>${esc(u.display_name)}</span>
            </div>
          </td>
          <td class="dp-text-muted">${esc(u.username)}</td>
          <td>${roleBadge}</td>
          <td class="dp-text-muted">${esc(u.department || '—')}</td>
          <td>${statusBadge}</td>
          <td class="dp-text-muted">${esc(fmtDate(u.created_at))}</td>
          <td>${u.last_login_at ? fmtDate(u.last_login_at) : '<span style="color:var(--text-3)">—</span>'}</td>
          <td>
            <div class="dp-table-actions">
              ${!isSelf ? `<button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="DP.editUser(${u.id})">Edit</button>` : ''}
              ${!isSelf && u.username !== 'jimmy' ? `<button class="dp-btn dp-btn--xs dp-btn--danger" onclick="DP.deleteUser(${u.id})">Delete</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderUsers(users) {
    const container = $('dp-users-content');
    if (!container) return;

    const depts = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
    const deptOptions = depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

    function thSort(col, label) {
      const isActive = _userSort.col === col;
      const cls = isActive ? ` dp-sort-${_userSort.dir}` : '';
      const icon = `<i class="dp-sort-icon">${isActive ? (_userSort.dir === 'asc' ? '▲' : '▼') : '⇅'}</i>`;
      return `<th class="dp-th-sort${cls}" data-col="${col}" onclick="DP.sortUsers('${col}')">${label}${icon}</th>`;
    }

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">User Management</h2>
        <button class="dp-btn dp-btn--primary" onclick="DP.createUser()">+ Add User</button>
      </div>

      <div class="dp-filter-bar">
        <input id="um-search" class="dp-input" type="search" placeholder="Search name or username…" oninput="DP.filterAndRenderUsers()" />
        <select id="um-role" class="dp-input" onchange="DP.filterAndRenderUsers()">
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
        </select>
        <select id="um-status" class="dp-input" onchange="DP.filterAndRenderUsers()">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select id="um-dept" class="dp-input" onchange="DP.filterAndRenderUsers()">
          <option value="">All Departments</option>
          ${deptOptions}
        </select>
      </div>

      <div class="dp-table-wrap">
        <table class="dp-table">
          <thead>
            <tr>
              ${thSort('display_name', 'Name')}
              ${thSort('username', 'Username')}
              ${thSort('role', 'Role')}
              ${thSort('department', 'Department')}
              ${thSort('is_active', 'Status')}
              ${thSort('created_at', 'Joined')}
              ${thSort('last_login_at', 'Last Login')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${buildUserRows(users)}</tbody>
        </table>
      </div>

      <!-- Departments section -->
      <div class="dp-card" style="margin-top:24px;padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:14px;font-weight:700">Departments</h3>
          <button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP.addDepartment()">+ Add</button>
        </div>
        <div id="dp-dept-list" style="padding:16px 20px">Loading departments...</div>
      </div>
    `;
  }

  async function loadDepartments() {
    const data = await api('GET', 'departments');
    renderDepartments(data?.departments || []);
  }

  function renderDepartments(depts) {
    const container = $('dp-dept-list');
    if (!container) return;
    if (!depts.length) {
      container.innerHTML = '<p style="color:var(--text-3);font-size:13px">No departments yet.</p>';
      return;
    }
    container.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${depts.map(d => `
          <span class="dp-dept-chip">
            <span onclick="DP.editDepartment(${d.id}, '${esc(d.name)}')" style="cursor:pointer" title="Click to rename">${esc(d.name)}</span>
            <button onclick="DP.deleteDepartment(${d.id}, '${esc(d.name)}')" title="Delete" style="margin-left:6px;font-size:12px;color:var(--text-3);opacity:.6">×</button>
          </span>`).join('')}
      </div>`;
  }

  async function editDepartment(id, currentName) {
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Department Name <span class="dp-required">*</span></label>
          <input id="dept-rename" class="dp-input" type="text" value="${esc(currentName)}" maxlength="100" />
        </div>
      </div>
    `, {
      title: 'Rename Department',
      confirmLabel: 'Save',
      onConfirm: async () => {
        const name = $('dept-rename')?.value.trim();
        if (!name) { showToast('Department name is required.', 'error'); return; }
        const result = await api('PUT', `departments?id=${id}`, { name });
        if (result) {
          closeModal();
          showToast('Department renamed.', 'success');
          loadDepartments();
        }
      },
    });
  }

  async function addDepartment() {
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Department Name <span class="dp-required">*</span></label>
          <input id="dept-name" class="dp-input" type="text" placeholder="e.g. Engineering" maxlength="100" />
        </div>
      </div>
    `, {
      title: 'Add Department',
      confirmLabel: 'Add',
      onConfirm: async () => {
        const name = $('dept-name')?.value.trim();
        if (!name) { showToast('Department name is required.', 'error'); return; }
        const result = await api('POST', 'departments', { name });
        if (result) {
          closeModal();
          showToast('Department added.', 'success');
          loadDepartments();
        }
      },
    });
  }

  async function deleteDepartment(id, name) {
    if (!confirm(`Delete department "${name}"? Existing users will keep this department name.`)) return;
    const result = await api('DELETE', `departments?id=${id}`);
    if (result) {
      showToast('Department deleted.', 'success');
      loadDepartments();
    }
  }

  async function createUser() {
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Username <span class="dp-required">*</span></label>
            <input id="cu-username" class="dp-input" type="text" placeholder="jane.doe" maxlength="50" autocomplete="off" />
          </div>
          <div>
            <label class="dp-label">Display Name <span class="dp-required">*</span></label>
            <input id="cu-name" class="dp-input" type="text" placeholder="Jane Doe" maxlength="100" />
          </div>
        </div>
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Password <span class="dp-required">*</span></label>
            <input id="cu-password" class="dp-input" type="password" placeholder="Min 6 characters" autocomplete="new-password" />
          </div>
          <div>
            <label class="dp-label">Role</label>
            <select id="cu-role" class="dp-input">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Email</label>
          <input id="cu-email" class="dp-input" type="email" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Phone</label>
          <div style="display:flex;gap:8px">
            <select id="cu-phone-cc" class="dp-input" style="width:180px">
              <option value="+82">🇰🇷 +82 Korea</option>
              <option value="+1">🇺🇸 +1 US/Canada</option>
              <option value="+44">🇬🇧 +44 UK</option>
              <option value="+81">🇯🇵 +81 Japan</option>
              <option value="+86">🇨🇳 +86 China</option>
              <option value="+852">🇭🇰 +852 Hong Kong</option>
              <option value="+65">🇸🇬 +65 Singapore</option>
              <option value="+61">🇦🇺 +61 Australia</option>
              <option value="+49">🇩🇪 +49 Germany</option>
              <option value="+33">🇫🇷 +33 France</option>
              <option value="+971">🇦🇪 +971 UAE</option>
              <option value="+966">🇸🇦 +966 Saudi Arabia</option>
              <option value="+91">🇮🇳 +91 India</option>
              <option value="+55">🇧🇷 +55 Brazil</option>
            </select>
            <input id="cu-phone-num" class="dp-input" type="tel" placeholder="10-1234-5678" style="flex:1" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <select id="cu-dept" class="dp-input"><option value="">— Select Department —</option></select>
        </div>
      </div>
    `, {
      title: 'Add New User',
      confirmLabel: 'Create User',
      onConfirm: async () => {
        const username     = $('cu-username').value.trim();
        const display_name = $('cu-name').value.trim();
        const password     = $('cu-password').value;
        const role         = $('cu-role').value;

        if (!username || !display_name || !password) {
          showToast('Username, display name, and password are required.', 'error');
          return;
        }
        if (password.length < 6) {
          showToast('Password must be at least 6 characters.', 'error');
          return;
        }

        const phone = $('cu-phone-num').value.trim() ? $('cu-phone-cc').value + ' ' + $('cu-phone-num').value.trim() : null;

        const result = await api('POST', 'users', {
          username, display_name, password, role,
          email: $('cu-email').value.trim() || null,
          phone,
          department: $('cu-dept').value.trim() || null,
        });
        if (result) {
          closeModal();
          showToast('User created successfully.', 'success');
          loadUsers();
        }
      },
    });
    api('GET', 'departments').then(d => {
      const sel = $('cu-dept');
      if (sel && d?.departments) {
        d.departments.forEach(dept => {
          const opt = document.createElement('option');
          opt.value = dept.name;
          opt.textContent = dept.name;
          sel.appendChild(opt);
        });
      }
    });
  }

  async function editUser(id) {
    const data = await api('GET', 'users');
    if (!data) return;
    const u = data.users.find(x => x.id === id);
    if (!u) return;

    // Parse stored phone into country code + number
    const storedPhone = u.phone || '';
    let phoneCC = '+82', phoneNum = '';
    const ccMatch = storedPhone.match(/^(\+\d+)\s(.*)$/);
    if (ccMatch) { phoneCC = ccMatch[1]; phoneNum = ccMatch[2]; }
    else if (storedPhone) { phoneNum = storedPhone; }

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Username</label>
            <input class="dp-input" type="text" value="${esc(u.username)}" disabled />
          </div>
          <div>
            <label class="dp-label">Display Name</label>
            <input id="eu-name" class="dp-input" type="text" value="${esc(u.display_name)}" maxlength="100" />
          </div>
        </div>
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Role</label>
            <select id="eu-role" class="dp-input">
              <option value="member"${u.role === 'member' ? ' selected' : ''}>Member</option>
              <option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option>
            </select>
          </div>
          <div>
            <label class="dp-label">Status</label>
            <select id="eu-active" class="dp-input">
              <option value="1"${u.is_active ? ' selected' : ''}>Active</option>
              <option value="0"${!u.is_active ? ' selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Email</label>
          <input id="eu-email" class="dp-input" type="email" value="${esc(u.email || '')}" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Phone</label>
          <div style="display:flex;gap:8px">
            <select id="eu-phone-cc" class="dp-input" style="width:180px">
              <option value="+82"${phoneCC==='+82'?' selected':''}>🇰🇷 +82 Korea</option>
              <option value="+1"${phoneCC==='+1'?' selected':''}>🇺🇸 +1 US/Canada</option>
              <option value="+44"${phoneCC==='+44'?' selected':''}>🇬🇧 +44 UK</option>
              <option value="+81"${phoneCC==='+81'?' selected':''}>🇯🇵 +81 Japan</option>
              <option value="+86"${phoneCC==='+86'?' selected':''}>🇨🇳 +86 China</option>
              <option value="+852"${phoneCC==='+852'?' selected':''}>🇭🇰 +852 Hong Kong</option>
              <option value="+65"${phoneCC==='+65'?' selected':''}>🇸🇬 +65 Singapore</option>
              <option value="+61"${phoneCC==='+61'?' selected':''}>🇦🇺 +61 Australia</option>
              <option value="+49"${phoneCC==='+49'?' selected':''}>🇩🇪 +49 Germany</option>
              <option value="+33"${phoneCC==='+33'?' selected':''}>🇫🇷 +33 France</option>
              <option value="+971"${phoneCC==='+971'?' selected':''}>🇦🇪 +971 UAE</option>
              <option value="+966"${phoneCC==='+966'?' selected':''}>🇸🇦 +966 Saudi Arabia</option>
              <option value="+91"${phoneCC==='+91'?' selected':''}>🇮🇳 +91 India</option>
              <option value="+55"${phoneCC==='+55'?' selected':''}>🇧🇷 +55 Brazil</option>
            </select>
            <input id="eu-phone-num" class="dp-input" type="tel" value="${esc(phoneNum)}" placeholder="10-1234-5678" style="flex:1" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <select id="eu-dept" class="dp-input"><option value="">— Select Department —</option></select>
        </div>
        <div class="dp-form-divider">Reset Password (optional)</div>
        <div class="dp-form-row">
          <label class="dp-label">New Password</label>
          <input id="eu-password" class="dp-input" type="password" placeholder="Leave blank to keep current password" autocomplete="new-password" />
        </div>
      </div>
    `, {
      title: `Edit User: ${u.display_name}`,
      confirmLabel: 'Save Changes',
      wide: true,
      onConfirm: async () => {
        const phone = $('eu-phone-num').value.trim() ? $('eu-phone-cc').value + ' ' + $('eu-phone-num').value.trim() : null;
        const body = {
          display_name: $('eu-name').value.trim(),
          role:         $('eu-role').value,
          is_active:    $('eu-active').value === '1',
          email:        $('eu-email').value.trim() || null,
          phone,
          department:   $('eu-dept').value.trim() || null,
        };
        const pw = $('eu-password').value;
        if (pw) {
          if (pw.length < 6) { showToast('New password must be at least 6 characters.', 'error'); return; }
          body.new_password = pw;
        }

        const result = await api('PUT', `users?id=${id}`, body);
        if (result) {
          closeModal();
          showToast('User updated.', 'success');
          loadUsers();
        }
      },
    });
    api('GET', 'departments').then(d => {
      const sel = $('eu-dept');
      if (sel && d?.departments) {
        d.departments.forEach(dept => {
          const opt = document.createElement('option');
          opt.value = dept.name;
          opt.textContent = dept.name;
          if (dept.name === u.department) opt.selected = true;
          sel.appendChild(opt);
        });
      }
    });
  }

  async function deleteUser(id) {
    openModal(`<p>Are you sure you want to delete this user? This action cannot be undone.</p>`, {
      title: 'Delete User',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const result = await api('DELETE', `users?id=${id}`);
        if (result) {
          closeModal();
          showToast('User deleted.', 'success');
          loadUsers();
        }
      },
    });
  }

  // ── My Account ─────────────────────────────────────────────────────────────
  async function loadAccount() {
    const data = await api('GET', 'me');
    if (!data?.user) return;
    renderAccount(data.user);
  }

  function renderAccount(user) {
    const container = $('dp-account-content');
    if (!container) return;

    const storedPhone = user.phone || '';
    let phoneCC = '+82', phoneNum = '';
    const ccMatch = storedPhone.match(/^(\+\d+)\s(.*)$/);
    if (ccMatch) { phoneCC = ccMatch[1]; phoneNum = ccMatch[2]; }
    else if (storedPhone) { phoneNum = storedPhone; }

    const phoneCCOptions = [
      ['+82','🇰🇷 +82 Korea'],['+1','🇺🇸 +1 US/Canada'],['+44','🇬🇧 +44 UK'],
      ['+81','🇯🇵 +81 Japan'],['+86','🇨🇳 +86 China'],['+852','🇭🇰 +852 Hong Kong'],
      ['+65','🇸🇬 +65 Singapore'],['+61','🇦🇺 +61 Australia'],['+49','🇩🇪 +49 Germany'],
      ['+33','🇫🇷 +33 France'],['+971','🇦🇪 +971 UAE'],['+966','🇸🇦 +966 Saudi Arabia'],
      ['+91','🇮🇳 +91 India'],['+55','🇧🇷 +55 Brazil'],
    ].map(([v, l]) => `<option value="${v}"${phoneCC === v ? ' selected' : ''}>${l}</option>`).join('');

    const avatarPos = (user.avatar_pos || '50 50').split(' ');
    const avatarHtml = user.avatar_url
      ? `<img id="prof-avatar-img" src="${esc(user.avatar_url)}" alt="Profile" style="width:100%;height:100%;object-fit:cover;object-position:${avatarPos[0]}% ${avatarPos[1]}%;border-radius:50%;cursor:grab;">`
      : `<span id="prof-avatar-initials" style="font-size:32px;font-weight:700;color:#fff">${esc((user.display_name||user.username||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2))}</span>`;

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">My Account</h2>
      </div>
      <div class="dp-account-layout">

        <div class="dp-card dp-account-profile">
          <div class="dp-account-avatar-wrap" id="dp-account-avatar-wrap">
            <div class="dp-account-avatar" id="dp-account-avatar-circle">${avatarHtml}</div>
            <div class="dp-account-avatar-actions">
              <label class="dp-btn dp-btn--ghost dp-btn--sm" style="cursor:pointer">
                ${user.avatar_url ? '🔄 Change Photo' : '📷 Upload Photo'}
                <input type="file" id="prof-avatar-input" accept="image/*" style="display:none" onchange="DP._handleAvatarSelect(this)" />
              </label>
              ${user.avatar_url ? `<button class="dp-btn dp-btn--ghost dp-btn--sm" style="color:var(--red)" onclick="DP._removeAvatar()">Remove</button>` : ''}
            </div>
            ${user.avatar_url ? `<p style="font-size:11px;color:var(--text-3);margin-top:6px;text-align:center">Drag photo to reposition</p>` : ''}
          </div>
          <h3 class="dp-account-name" style="margin-top:12px">${esc(user.display_name)}</h3>
          <p class="dp-account-username">@${esc(user.username)}</p>
        </div>

        <div class="dp-card">
          <h3 class="dp-card-title">Profile & Emergency Contact Info</h3>
          <p style="font-size:12px;color:var(--text-3);margin-bottom:16px">This information is visible in Project Team Contacts.</p>
          <div class="dp-form">
            <div class="dp-form-row dp-form-row--2col">
              <div>
                <label class="dp-label">Display Name</label>
                <input id="prof-name" class="dp-input" type="text" value="${esc(user.display_name)}" maxlength="100" />
              </div>
              <div>
                <label class="dp-label">Role / Title</label>
                <input id="prof-role" class="dp-input" type="text" value="${esc(user.role_title || '')}" placeholder="e.g. Project Manager" maxlength="100" />
              </div>
            </div>
            <div class="dp-form-row dp-form-row--2col">
              <div>
                <label class="dp-label">Email</label>
                <input id="prof-email" class="dp-input" type="email" value="${esc(user.email || '')}" />
              </div>
              <div>
                <label class="dp-label">Department</label>
                <select id="prof-dept" class="dp-input"><option value="">— None —</option></select>
              </div>
            </div>
            <div class="dp-form-row">
              <label class="dp-label">Phone</label>
              <div style="display:flex;gap:8px">
                <select id="prof-phone-cc" class="dp-input" style="width:180px">${phoneCCOptions}</select>
                <input id="prof-phone-num" class="dp-input" type="tel" value="${esc(phoneNum)}" placeholder="10-1234-5678" style="flex:1" />
              </div>
            </div>
            <div class="dp-form-row">
              <label class="dp-label">Emergency Note</label>
              <textarea id="prof-note" class="dp-input dp-textarea dp-textarea--sm" placeholder="e.g. Contact via KakaoTalk after 6pm" maxlength="500">${esc(user.emergency_note || '')}</textarea>
            </div>
            <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
              <button class="dp-btn dp-btn--primary" onclick="DP.saveProfile()">Save Profile</button>
            </div>

            <div class="dp-form-divider" style="margin-top:24px">Change Password</div>
            <div class="dp-form-row">
              <label class="dp-label">Current Password <span class="dp-required">*</span></label>
              <input id="pw-current" class="dp-input" type="password" autocomplete="current-password" />
            </div>
            <div class="dp-form-row dp-form-row--2col">
              <div>
                <label class="dp-label">New Password <span class="dp-required">*</span></label>
                <input id="pw-new" class="dp-input" type="password" autocomplete="new-password" placeholder="Min 6 characters" />
              </div>
              <div>
                <label class="dp-label">Confirm New Password <span class="dp-required">*</span></label>
                <input id="pw-confirm" class="dp-input" type="password" autocomplete="new-password" />
              </div>
            </div>
            <button class="dp-btn dp-btn--ghost" onclick="DP.changePassword()">Update Password</button>
          </div>
        </div>
      </div>
    `;

    api('GET', 'departments').then(d => {
      const sel = $('prof-dept');
      if (sel && d?.departments) {
        d.departments.forEach(dept => {
          const opt = document.createElement('option');
          opt.value = dept.name;
          opt.textContent = dept.name;
          if (dept.name === user.department) opt.selected = true;
          sel.appendChild(opt);
        });
      }
    });

    // Set up avatar drag-to-reposition if photo exists
    if (user.avatar_url) {
      _initAvatarDrag(user.avatar_pos || '50 50');
    }
  }

  // ── Avatar helpers ──────────────────────────────────────────────────────────
  let _avatarPendingUrl = null; // R2 URL of newly uploaded but not-yet-saved avatar

  async function _handleAvatarSelect(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }

    const btn = input.parentElement;
    const origText = btn.textContent.trim();
    btn.textContent = 'Uploading…';

    const fd = new FormData();
    fd.append('file', file);
    let res;
    try {
      const r = await fetch('/api/dreampath/upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      res = await r.json();
      if (!r.ok) { showToast(res.error || 'Upload failed.', 'error'); btn.textContent = origText; return; }
    } catch {
      showToast('Upload failed.', 'error');
      btn.textContent = origText;
      return;
    }

    _avatarPendingUrl = res.url;

    // Update preview immediately
    const circle = $('dp-account-avatar-circle');
    if (circle) {
      circle.innerHTML = `<img id="prof-avatar-img" src="${esc(res.url)}" alt="Profile" style="width:100%;height:100%;object-fit:cover;object-position:50% 50%;border-radius:50%;cursor:grab;">`;
      _initAvatarDrag('50 50');
    }
    btn.textContent = '🔄 Change Photo';
    showToast('Photo uploaded. Save Profile to apply.', 'success');
  }

  async function _removeAvatar() {
    if (!confirm('Remove profile photo?')) return;
    _avatarPendingUrl = '';
    const result = await api('PUT', 'me', { avatar_url: null, avatar_pos: '50 50' });
    if (result) {
      currentUser.avatar_url = null;
      currentUser.avatar_pos = '50 50';
      localStorage.setItem('dp_user', JSON.stringify(currentUser));
      _updateSidebarAvatar(currentUser);
      showToast('Profile photo removed.', 'success');
      loadAccount();
    }
  }

  function _initAvatarDrag(posStr) {
    const img = $('prof-avatar-img');
    if (!img) return;
    let pos = (posStr || '50 50').split(' ').map(Number);
    let dragging = false, startX, startY, startPos;

    img.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPos = [...pos];
      img.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = (e.clientX - startX) / img.parentElement.offsetWidth * 100;
      const dy = (e.clientY - startY) / img.parentElement.offsetHeight * 100;
      pos[0] = Math.max(0, Math.min(100, startPos[0] - dx));
      pos[1] = Math.max(0, Math.min(100, startPos[1] - dy));
      img.style.objectPosition = `${pos[0]}% ${pos[1]}%`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      img.style.cursor = 'grab';
      // Store pending position so saveProfile can pick it up
      img.dataset.pos = pos.join(' ');
    });
  }

  async function saveProfile() {
    const phone = $('prof-phone-num')?.value.trim()
      ? $('prof-phone-cc')?.value + ' ' + $('prof-phone-num')?.value.trim()
      : null;
    const avatarImg = $('prof-avatar-img');
    const body = {
      display_name:    $('prof-name')?.value.trim()  || undefined,
      email:           $('prof-email')?.value.trim()  || null,
      phone,
      department:      $('prof-dept')?.value          || null,
      role_title:      $('prof-role')?.value.trim()   || null,
      emergency_note:  $('prof-note')?.value.trim()   || null,
    };
    if (_avatarPendingUrl !== null) {
      body.avatar_url = _avatarPendingUrl || null;
      body.avatar_pos = avatarImg?.dataset.pos || '50 50';
      _avatarPendingUrl = null;
    } else if (avatarImg?.dataset.pos) {
      body.avatar_pos = avatarImg.dataset.pos;
    }
    // Remove undefined keys
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    const result = await api('PUT', 'me', body);
    if (result) {
      showToast('Profile saved.', 'success');
      // Update sidebar name if display_name changed
      if (result.user) {
        currentUser = { ...currentUser, ...result.user };
        localStorage.setItem('dp_user', JSON.stringify(currentUser));
        $('dp-user-name').textContent = currentUser.display_name;
        _updateSidebarAvatar(currentUser);
      }
      loadAccount();
    }
  }

  async function changePassword() {
    const current = $('pw-current')?.value || '';
    const newPw   = $('pw-new')?.value || '';
    const confirm = $('pw-confirm')?.value || '';

    if (!current || !newPw || !confirm) {
      showToast('All password fields are required.', 'error');
      return;
    }
    if (newPw.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPw !== confirm) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    const result = await api('PUT', 'me', { current_password: current, new_password: newPw });
    if (result) {
      showToast('Password changed successfully.', 'success');
      $('pw-current').value = '';
      $('pw-new').value = '';
      $('pw-confirm').value = '';
    }
  }

  // ── Calendar month navigation ───────────────────────────────────────────────
  function prevMonth() {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    loadCalendar();
  }

  function nextMonth() {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    loadCalendar();
  }

  function _calDragStart(e, evId) {
    e.dataTransfer.setData('text/plain', String(evId));
    e.dataTransfer.effectAllowed = 'move';
  }

  function _calDragOver(e) {
    e.currentTarget.classList.add('dp-cal-day--dragover');
  }

  function _calDragLeave(e) {
    e.currentTarget.classList.remove('dp-cal-day--dragover');
  }

  function _calDrop(e, dateStr) {
    e.currentTarget.classList.remove('dp-cal-day--dragover');
    const evId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!evId) return;
    openModal(`
      <div class="dp-form">
        <p style="margin-bottom:14px">Move event to <strong>${esc(dateStr)}</strong>?</p>
        <div class="dp-form-row">
          <label class="dp-label">Edit Reason <span class="dp-required">*</span></label>
          <input id="drag-note" class="dp-input" type="text" placeholder="e.g. Schedule changed" maxlength="300" />
        </div>
      </div>
    `, {
      title: 'Reschedule Event',
      confirmLabel: 'Move',
      onConfirm: async () => {
        const note = $('drag-note')?.value.trim();
        if (!note) { showToast('Edit reason is required.', 'error'); return; }
        const result = await api('PUT', `events?id=${evId}`, { start_date: dateStr, edit_note: note });
        if (result) {
          closeModal();
          showToast('Event rescheduled.', 'success');
          loadCalendar();
        }
      },
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    trackPageVisit();

    // Login form — enter key support
    const pwEl = $('dp-login-password');
    if (pwEl) {
      pwEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') login();
      });
    }
    const unEl = $('dp-login-username');
    if (unEl) {
      unEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') pwEl?.focus();
      });
    }

    // Close modal on overlay click
    const overlay = $('dp-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeModal();
      });
    }

    // Check if already logged in
    if (hasSessionMarker()) {
      const expiresAt = getSessionExpiry();
      if (expiresAt && expiresAt <= Date.now()) {
        logout();
        return;
      }
      if (currentUser) {
        showApp(false);
      } else {
        api('GET', 'me').then((data) => {
          if (!data || !data.user) return;
          currentUser = data.user;
          localStorage.setItem('dp_user', JSON.stringify(currentUser));
          showApp(false);
        });
      }
    }

    // Start sidebar clock
    _startClock();
  }

  function _startClock() {
    const isKorea = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Seoul';
    function tick() {
      const now = new Date();
      const kstStr   = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const localStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const kstEl   = $('dp-clock-kst');
      const localEl = $('dp-clock-local');
      if (kstEl)   kstEl.textContent   = kstStr;
      if (localEl) localEl.textContent = isKorea ? '(same)' : localStr;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Dev Rules & Version History ────────────────────────────────────────────
  async function loadDevRules() {
    const container = $('dp-devrules-content');
    if (!container) return;
    const data = await api('GET', 'versions');
    renderDevRules(data?.versions || []);
  }

  let _verPage = 0;
  const VER_PER_PAGE = 20;

  function renderDevRules(versions) {
    const container = $('dp-devrules-content');
    if (!container) return;
    const latest = versions[0];
    const isAdmin = currentUser?.role === 'admin';

    const typeLabel = { feature: '기능 / Feature', bugfix: '수정 / Bugfix', initial: '최초 / Initial' };

    const totalPages = Math.ceil(versions.length / VER_PER_PAGE);
    const pageVersions = versions.slice(_verPage * VER_PER_PAGE, (_verPage + 1) * VER_PER_PAGE);

    const paginationHtml = totalPages > 1 ? `
      <div class="dp-pagination">
        <button class="dp-btn dp-btn--ghost dp-btn--sm" ${_verPage === 0 ? 'disabled' : ''} onclick="DP._verChangePage(-1)">← Prev</button>
        <span style="font-size:12px;color:var(--text-3)">Page ${_verPage + 1} / ${totalPages}</span>
        <button class="dp-btn dp-btn--ghost dp-btn--sm" ${_verPage >= totalPages - 1 ? 'disabled' : ''} onclick="DP._verChangePage(1)">Next →</button>
      </div>` : '';

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Development Rules</h2>
        ${isAdmin ? `<button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP.addVersion()">+ Log Version</button>` : ''}
      </div>

      <div class="dp-version-hero">
        <div>
          <div class="dp-version-hero-label">CURRENT VERSION</div>
          <div class="dp-version-hero-number">${latest ? `v${esc(latest.version)}` : '—'}</div>
        </div>
        ${latest ? `<div style="opacity:.7;font-size:13px;margin-left:auto">${esc(latest.description || '')}<br><span style="font-size:11px">${fmtDate(latest.released_at)}</span></div>` : ''}
      </div>

      <div class="dp-ai-notice">
        <div class="dp-ai-notice-icon">🤖</div>
        <div>
          <div class="dp-ai-notice-title">AI 개발자 / AI Developer — 코드 수정 전 전체 내용 숙지 필수</div>
          <div class="dp-ai-notice-body">
            이 페이지는 Dreampath의 <strong>공식 개발 핸드북</strong>입니다.
            Claude, GPT, Gemini 등 AI 에이전트가 개발을 보조하는 경우,
            <strong>코드를 한 줄도 수정하기 전에</strong> 이 페이지의 모든 섹션을 읽어야 합니다.
            프로젝트 루트의 <strong>CLAUDE.md</strong>가 이 규칙을 강제합니다.
            <br>
            <span style="opacity:.7;font-size:12px">This page is the canonical dev handbook. Any AI agent must read all sections before making code changes. CLAUDE.md at the project root enforces this.</span>
          </div>
        </div>
      </div>

      <div class="dp-handbook-grid">
        <div class="dp-hb-card">
          <div class="dp-hb-card-title">🏗 Architecture</div>
          <div class="dp-hb-rule"><strong>Platform:</strong> Cloudflare Pages + D1 (SQLite) + Workers</div>
          <div class="dp-hb-rule"><strong>No build step</strong> — 파일 그대로 배포 (빌드 없음)</div>
          <div class="dp-hb-rule"><strong>DB binding:</strong> <code>env.DB</code> (모든 Function 파일에서)</div>
          <div class="dp-hb-rule"><strong>Auth:</strong> HMAC-SHA256 · <code>functions/_shared/auth.js</code></div>
          <div class="dp-hb-rule">Admin 세션 24h · Dreampath 세션 1h (쿠키 기반)</div>
        </div>

        <div class="dp-hb-card">
          <div class="dp-hb-card-title">📁 Key Files</div>
          <div class="dp-hb-rule"><code>dreampath.html</code> — Dreampath 전용 인라인 CSS</div>
          <div class="dp-hb-rule"><code>js/dreampath.js</code> — 모든 프론트엔드 로직 (IIFE)</div>
          <div class="dp-hb-rule"><code>functions/api/dreampath/</code> — 모든 API 엔드포인트</div>
          <div class="dp-hb-rule"><code>functions/_shared/auth.js</code> — 인증 코어 (책임자 승인 없이 수정 금지)</div>
          <div class="dp-hb-rule"><code>deploy.sh</code> — 배포 + 버전 자동 등록</div>
          <div class="dp-hb-rule"><code>CLAUDE.md</code> — AI 개발자 필독 규칙 (프로젝트 루트)</div>
        </div>

        <div class="dp-hb-card">
          <div class="dp-hb-card-title">⚙️ Frontend Conventions</div>
          <div class="dp-hb-rule">IIFE 구조: <code>const DP = (() => &#123; ... &#125;)()</code> — 절대 분리 금지</div>
          <div class="dp-hb-rule">모든 public 메서드는 <code>return &#123;&#125;</code> 블록에 반드시 추가</div>
          <div class="dp-hb-rule">인라인 이벤트: <code>onclick="DP.method()"</code> — 항상 <code>DP.</code> 프리픽스</div>
          <div class="dp-hb-rule">툴바 버튼은 <code>onmousedown + preventDefault</code> 사용 (에디터 포커스 유지)</div>
          <div class="dp-hb-rule">색상은 반드시 <code>var(--name)</code> CSS 변수만 사용</div>
          <div class="dp-hb-rule">CUFS 브랜드: Green <code>#146E7A</code> · Navy <code>#002D56</code> · Gold <code>#8D714E</code></div>
        </div>

        <div class="dp-hb-card">
          <div class="dp-hb-card-title">✍️ Rich Text (게시글)</div>
          <div class="dp-hb-rule"><strong>에디터:</strong> Tiptap (<code>esm.sh</code> CDN) — <code>@tiptap/core@2</code>, <code>@tiptap/starter-kit@2</code></div>
          <div class="dp-hb-rule"><strong>뷰어:</strong> DOMPurify (cdnjs) — 모든 HTML 출력 정제 필수</div>
          <div class="dp-hb-rule">기존 plain-text 게시글 → <code>_legacyToHtml()</code>으로 자동 변환</div>
          <div class="dp-hb-rule"><code>_destroyTiptap()</code>은 <code>closeModal()</code>에서 자동 호출됨</div>
          <div class="dp-hb-rule">새 에디터 기능 추가 시 <code>_execTiptapCmd</code> 및 <code>_updateTiptapToolbar</code> 함께 수정</div>
        </div>

        <div class="dp-hb-card">
          <div class="dp-hb-card-title">🚀 Deployment</div>
          <div class="dp-hb-rule"><code>./deploy.sh</code> — git 메시지에서 타입 자동 감지</div>
          <div class="dp-hb-rule"><code>./deploy.sh feature "설명"</code> — <code>bbb</code> 증가 (기능 추가)</div>
          <div class="dp-hb-rule"><code>./deploy.sh fix "설명"</code> — <code>cc</code> 증가 (버그픽스)</div>
          <div class="dp-hb-rule"><code>./deploy.sh --skip-version</code> — 버전 기록 없이 배포만</div>
          <div class="dp-hb-rule">D1 <code>dp_versions</code> 테이블에 자동 등록됨</div>
        </div>

        <div class="dp-hb-card">
          <div class="dp-hb-card-title">🚫 Critical Prohibitions</div>
          <div class="dp-hb-warn"><code>auth.js</code> — 충분한 테스트 없이 수정 금지</div>
          <div class="dp-hb-warn">사용자 입력 HTML → DOMPurify 없이 <code>innerHTML</code> 금지</div>
          <div class="dp-hb-warn">인증 토큰을 <code>localStorage</code>에 저장 금지</div>
          <div class="dp-hb-warn">기존 DB 컬럼 삭제/변경 금지 — 컬럼 추가(ALTER TABLE ADD)만 허용</div>
          <div class="dp-hb-warn">의미 있는 변경 후 <code>./deploy.sh</code> 버전 등록 생략 금지</div>
          <div class="dp-hb-warn"><code>dreampath.js</code>의 IIFE 구조를 분리하거나 모듈화 금지</div>
          <div class="dp-hb-warn">외부 CDN 변경 시 반드시 버전 고정 여부 확인 필수</div>
        </div>
      </div>

      <div class="dp-version-rules">
        <h3>버전 형식 / Version Format: <code style="font-size:16px;color:var(--accent)">aa.bbb.cc</code></h3>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">aa</div>
          <div class="dp-version-rule-desc"><strong>주요 버전 / Major</strong> — 프로젝트 오너가 수동으로 올림. 전면 재설계 또는 주요 마일스톤.<br><span style="opacity:.7">Set manually by the project owner. Represents a major milestone or full redesign.</span></div>
        </div>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">bbb</div>
          <div class="dp-version-rule-desc"><strong>기능 버전 / Feature</strong> — 새 기능 추가 또는 기존 기능의 유의미한 변경 시 증가.<br><span style="opacity:.7">Incremented when a new feature is added or an existing feature is significantly changed.</span></div>
        </div>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">cc</div>
          <div class="dp-version-rule-desc"><strong>수정 버전 / Fix</strong> — 버그 수정 및 핫픽스 시 증가. Feature 버전 증가 시 00으로 초기화.<br><span style="opacity:.7">Incremented for bug fixes and hotfixes. Resets to 00 on each feature increment.</span></div>
        </div>
      </div>

      <div class="dp-card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:14px;font-weight:700">버전 히스토리 / Version History</h3>
          <span style="font-size:12px;color:var(--text-3)">${versions.length} 건</span>
        </div>
        ${versions.length === 0
          ? `<div class="dp-empty-state"><p>버전 기록이 없습니다. / No version entries yet.</p></div>`
          : `<table class="dp-vh-table">
              <thead>
                <tr>
                  <th>버전 / Version</th>
                  <th>유형 / Type</th>
                  <th>설명 / Description</th>
                  <th>날짜 / Date</th>
                </tr>
              </thead>
              <tbody>
                ${pageVersions.map(v => `
                  <tr>
                    <td><span class="dp-vh-version">v${esc(v.version)}</span></td>
                    <td><span class="dp-vh-type dp-vh-type--${esc(v.type)}">${esc(typeLabel[v.type] || v.type)}</span></td>
                    <td style="color:var(--text-2)">${esc(v.description || '—')}</td>
                    <td style="color:var(--text-3);white-space:nowrap">${fmtDate(v.released_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${paginationHtml}`
        }
      </div>
    `;
  }

  function _verChangePage(delta) {
    _verPage = Math.max(0, _verPage + delta);
    loadDevRules();
  }

  async function addVersion() {
    openModal(`
      <div class="dp-form-group">
        <label class="dp-label">유형 / Type</label>
        <select class="dp-input" id="ver-type">
          <option value="feature">기능 / Feature — bbb 증가 (예: 01.001.00)</option>
          <option value="bugfix">수정 / Bugfix — cc 증가 (예: 01.000.01)</option>
        </select>
      </div>
      <div class="dp-form-group" style="margin-top:12px">
        <label class="dp-label">설명 / Description <span style="color:var(--red)">*</span></label>
        <textarea class="dp-input" id="ver-desc" rows="3" placeholder="이번 버전에서 변경된 내용 / What changed in this version?"></textarea>
      </div>
    `, {
      title: '버전 등록 / Log New Version',
      confirmLabel: '등록 / Add',
      onConfirm: async () => {
        const type = $('ver-type').value;
        const description = $('ver-desc').value.trim();
        if (!description) { showToast('설명을 입력하세요. / Description is required.', 'error'); return; }
        const data = await api('POST', 'versions', { type, description });
        if (!data) return;
        showToast(`Version ${data.version} logged successfully.`, 'success');
        closeModal();
        // Update footer
        if ($('dp-version-display')) $('dp-version-display').textContent = `v${data.version}`;
        loadDevRules();
      },
    });
  }

  // ── File helpers ────────────────────────────────────────────────────────────
  function fileIcon(type = '') {
    if (type.startsWith('image/'))       return '🖼';
    if (type === 'application/pdf')      return '📄';
    if (type.includes('word'))           return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.includes('presentation') || type.includes('powerpoint')) return '📊';
    if (type.includes('zip') || type.includes('compressed')) return '🗜';
    return '📎';
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Called by file input onchange — renders a preview list in the given container
  function _handleFileSelect(input, listId) {
    if (Array.from(input.files || []).length > 5) {
      showToast('Maximum 5 files allowed.', 'error');
      input.value = '';
      const list = $(listId);
      if (list) list.innerHTML = '';
      return;
    }
    const list = $(listId);
    if (!list) return;
    list.innerHTML = '';
    for (const f of Array.from(input.files || [])) {
      const div = document.createElement('div');
      div.className = 'dp-file-preview-item';
      div.innerHTML = `<span>${f.type.startsWith('image/') ? '🖼' : fileIcon(f.type)}</span> <span class="dp-attach-name">${esc(f.name)}</span> <span class="dp-attach-size">${fmtSize(f.size)}</span>`;
      list.appendChild(div);
    }
  }

  // Uploads all files from a file input; returns array of file objects or [] if none
  // Returns null on error
  async function uploadFiles(fileInput, listId) {
    const files = Array.from(fileInput?.files || []);
    if (!files.length) return [];
    if (files.length > 5) {
      showToast('Maximum 5 files allowed per post.', 'error');
      return null;
    }
    const list = $(listId);
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (list) {
        const items = list.querySelectorAll('.dp-file-preview-item');
        if (items[i]) items[i].innerHTML += ' <span style="color:var(--accent)">↑ Uploading…</span>';
      }
      const fd = new FormData();
      fd.append('file', f);
      let res;
      try {
        const r = await fetch('/api/dreampath/upload', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
        });
        res = await r.json();
        if (!r.ok) { showToast(res.error || 'Upload failed.', 'error'); return null; }
      } catch {
        showToast('Upload failed. Check your connection.', 'error');
        return null;
      }
      if (list) {
        const items = list.querySelectorAll('.dp-file-preview-item');
        if (items[i]) items[i].querySelector('span:last-child').textContent = ' ✓';
      }
      results.push({ url: res.url, name: res.name, type: res.type, size: res.size, is_image: res.is_image });
    }
    return results;
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    const container = $('dp-settings-content');
    if (!container) return;
    renderSettings(container);
  }

  function renderSettings(container) {
    const tokens = [
      { key: '--accent',      label: 'Accent',       usage: 'Buttons, active state, links' },
      { key: '--accent-mid',  label: 'Accent Mid',   usage: 'Active nav icon, highlights' },
      { key: '--accent-light',label: 'Accent Light', usage: 'Button hover, today cell bg' },
      { key: '--bg',          label: 'Background',   usage: 'App background' },
      { key: '--surface',     label: 'Surface',      usage: 'Cards, panels' },
      { key: '--surface2',    label: 'Surface 2',    usage: 'Secondary surfaces, striped rows' },
      { key: '--border',      label: 'Border',       usage: 'All borders and dividers' },
      { key: '--text',        label: 'Text',         usage: 'Primary body text' },
      { key: '--text-2',      label: 'Text 2',       usage: 'Secondary body text' },
      { key: '--text-3',      label: 'Text 3',       usage: 'Muted / placeholder text' },
      { key: '--sidebar-bg',  label: 'Sidebar BG',   usage: 'Sidebar background (CUFS Navy)' },
      { key: '--red',         label: 'Red / Danger', usage: 'Delete, error states' },
      { key: '--green',       label: 'Green',        usage: 'Success toasts' },
    ];

    const rootStyle = getComputedStyle(document.documentElement);
    const rows = tokens.map(t => {
      const currentVal = rootStyle.getPropertyValue(t.key).trim();
      return `<tr>
        <td style="font-size:12px;font-weight:600;font-family:monospace;color:var(--text-2)">${t.key}</td>
        <td style="font-size:12px;color:var(--text-3)">${t.label}</td>
        <td style="font-size:11px;color:var(--text-3)">${t.usage}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="dp-color-swatch" style="background:${currentVal}" title="${currentVal}"></div>
            <input type="color" class="dp-color-input" value="${currentVal.startsWith('#') ? currentVal : '#146E7A'}"
              oninput="document.documentElement.style.setProperty('${t.key}', this.value)"
              title="Click to change ${t.label}" />
            <span style="font-size:11px;font-family:monospace;color:var(--text-3)">${currentVal}</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Settings</h2>
        <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP._settingsReset()" title="Reset to defaults">Reset Colors</button>
      </div>
      <div class="dp-card" style="overflow:hidden">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:14px;font-weight:700;margin:0">Color Tokens</h3>
          <p style="font-size:12px;color:var(--text-3);margin:4px 0 0">Changes apply live. Refresh the page to restore defaults.</p>
        </div>
        <div style="overflow-x:auto">
          <table class="dp-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Name</th>
                <th>Usage</th>
                <th>Color</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function _settingsReset() {
    const tokens = ['--accent','--accent-mid','--accent-light','--bg','--surface','--surface2','--border','--text','--text-2','--text-3','--sidebar-bg','--red','--green'];
    tokens.forEach(t => document.documentElement.style.removeProperty(t));
    showToast('Colors reset to defaults.', 'success');
    loadSettings();
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  let _tasksFilter = 'all'; // 'all' | 'mine'
  let _allTasks = [];

  async function loadTasks() {
    const container = $('dp-tasks-content');
    if (!container) return;
    const data = await api('GET', 'tasks');
    _allTasks = data?.tasks || [];
    renderTasks(_allTasks);
  }

  function renderTasks(tasks) {
    const container = $('dp-tasks-content');
    if (!container) return;

    const filtered = _tasksFilter === 'mine'
      ? tasks.filter(t => {
          const name = String(t.assignee || '').trim().toLowerCase();
          const me = [currentUser?.display_name, currentUser?.username].filter(Boolean).map(s => s.toLowerCase());
          return me.includes(name);
        })
      : tasks;

    const todo       = filtered.filter(t => t.status === 'todo');
    const inProgress = filtered.filter(t => t.status === 'in_progress');
    const done       = filtered.filter(t => t.status === 'done');

    const priorityColor = { high: 'var(--red)', normal: 'var(--accent)', low: 'var(--text-3)' };
    const priorityLabel = { high: '🔴 High', normal: '🟡 Normal', low: '⚪ Low' };

    function taskCard(t) {
      const isOverdue = t.due_date && new Date(t.due_date + 'T00:00:00') < new Date() && t.status !== 'done';
      return `<div class="dp-task-card" onclick="DP.viewTask(${t.id})">
        <div class="dp-task-card-title">${esc(t.title)}</div>
        <div class="dp-task-card-meta">
          ${t.assignee ? `<span class="dp-task-assignee">&#128100; ${esc(t.assignee)}</span>` : ''}
          <span style="color:${priorityColor[t.priority]||'var(--text-3)'}; font-size:11px">${priorityLabel[t.priority]||t.priority}</span>
          ${t.due_date ? `<span class="dp-task-due${isOverdue?' dp-task-due--overdue':''}">${isOverdue?'⚠️ ':'📅 '}${esc(t.due_date)}</span>` : ''}
        </div>
        ${currentUser?.role === 'admin' ? `<div class="dp-task-actions">
          <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="event.stopPropagation();DP.editTask(${t.id})">✏ Edit</button>
          <button class="dp-btn dp-btn--xs dp-btn--danger" onclick="event.stopPropagation();DP.deleteTask(${t.id})">Delete</button>
        </div>` : ''}
      </div>`;
    }

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Tasks</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="dp-toggle-group">
            <button class="dp-toggle-btn${_tasksFilter==='all'?' dp-toggle-btn--active':''}" onclick="DP._setTaskFilter('all')">All</button>
            <button class="dp-toggle-btn${_tasksFilter==='mine'?' dp-toggle-btn--active':''}" onclick="DP._setTaskFilter('mine')">Mine</button>
          </div>
          ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP.createTask()">+ New Task</button>` : ''}
        </div>
      </div>
      <div class="dp-kanban">
        <div class="dp-kanban-col">
          <div class="dp-kanban-col-header dp-kanban-col-header--todo">
            <span>📋 Todo</span><span class="dp-kanban-count">${todo.length}</span>
          </div>
          <div class="dp-kanban-cards">${todo.map(taskCard).join('') || '<div class="dp-kanban-empty">No tasks</div>'}</div>
        </div>
        <div class="dp-kanban-col">
          <div class="dp-kanban-col-header dp-kanban-col-header--progress">
            <span>🔄 In Progress</span><span class="dp-kanban-count">${inProgress.length}</span>
          </div>
          <div class="dp-kanban-cards">${inProgress.map(taskCard).join('') || '<div class="dp-kanban-empty">No tasks</div>'}</div>
        </div>
        <div class="dp-kanban-col">
          <div class="dp-kanban-col-header dp-kanban-col-header--done">
            <span>✅ Done</span><span class="dp-kanban-count">${done.length}</span>
          </div>
          <div class="dp-kanban-cards">${done.map(taskCard).join('') || '<div class="dp-kanban-empty">No tasks</div>'}</div>
        </div>
      </div>
    `;
  }

  function _setTaskFilter(f) {
    _tasksFilter = f;
    renderTasks(_allTasks);
  }

  async function viewTask(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const priorityLabel = { high: '🔴 High', normal: '🟡 Normal', low: '⚪ Low' };
    const statusLabel   = { todo: '📋 Todo', in_progress: '🔄 In Progress', done: '✅ Done' };
    const isOverdue = task.due_date && new Date(task.due_date + 'T00:00:00') < new Date() && task.status !== 'done';

    openModal(`
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="dp-badge" style="background:var(--surface2);color:var(--text-2)">${statusLabel[task.status]||task.status}</span>
          <span class="dp-badge" style="background:var(--surface2);color:var(--text-2)">${priorityLabel[task.priority]||task.priority}</span>
          ${isOverdue ? `<span class="dp-badge" style="background:#FEE2E2;color:#991B1B">⚠️ Overdue</span>` : ''}
        </div>
        ${task.description ? `<div style="font-size:14px;color:var(--text-2);line-height:1.6">${esc(task.description)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-2)">
          ${task.assignee ? `<div>&#128100; Assignee: <strong>${esc(task.assignee)}</strong></div>` : ''}
          ${task.due_date ? `<div>📅 Due: <strong>${esc(task.due_date)}</strong></div>` : ''}
          <div style="color:var(--text-3);font-size:12px">Created: ${fmtFull(task.created_at)}</div>
          ${task.updated_at !== task.created_at ? `<div style="color:var(--text-3);font-size:12px">Updated: ${fmtFull(task.updated_at)}</div>` : ''}
        </div>
        ${task.status !== 'done' ? `
        <div style="display:flex;gap:8px;padding-top:8px;border-top:1px solid var(--border)">
          ${task.status === 'todo' ? `<button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP._updateTaskStatus(${task.id},'in_progress')">🔄 Start</button>` : ''}
          ${task.status === 'in_progress' ? `<button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP._updateTaskStatus(${task.id},'done')">✅ Mark Done</button>` : ''}
        </div>` : ''}
      </div>
    `, { title: task.title, wide: false });
  }

  async function _updateTaskStatus(id, newStatus) {
    const result = await api('PUT', `tasks?id=${id}`, { status: newStatus });
    if (result) {
      closeModal();
      showToast('Task status updated.', 'success');
      loadTasks();
    }
  }

  async function createTask() {
    const data = await api('GET', 'users?picker=1');
    const userList = (data?.users || []).map(u => u.display_name);

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="ct-title" class="dp-input" type="text" placeholder="Task title" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Description</label>
          <textarea id="ct-desc" class="dp-input dp-textarea" placeholder="Optional description" rows="3"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="dp-form-row">
            <label class="dp-label">Assignee</label>
            <input id="ct-assignee" class="dp-input" type="text" list="ct-assignee-list" placeholder="Type name" />
            <datalist id="ct-assignee-list">${userList.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Status</label>
            <select id="ct-status" class="dp-input">
              <option value="todo">📋 Todo</option>
              <option value="in_progress">🔄 In Progress</option>
              <option value="done">✅ Done</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Priority</label>
            <select id="ct-priority" class="dp-input">
              <option value="normal" selected>🟡 Normal</option>
              <option value="high">🔴 High</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Due Date</label>
            <input id="ct-due" class="dp-input" type="date" />
          </div>
        </div>
      </div>
    `, {
      title: 'New Task',
      confirmLabel: 'Create',
      onConfirm: async () => {
        const title    = $('ct-title').value.trim();
        if (!title) { showToast('Title is required.', 'error'); return; }
        const result = await api('POST', 'tasks', {
          title,
          description: $('ct-desc').value.trim() || null,
          assignee:    $('ct-assignee').value.trim() || null,
          status:      $('ct-status').value,
          priority:    $('ct-priority').value,
          due_date:    $('ct-due').value || null,
        });
        if (result) { closeModal(); showToast('Task created.', 'success'); loadTasks(); }
      },
    });
  }

  async function editTask(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const data = await api('GET', 'users?picker=1');
    const userList = (data?.users || []).map(u => u.display_name);

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="et-title" class="dp-input" type="text" value="${esc(task.title)}" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Description</label>
          <textarea id="et-desc" class="dp-input dp-textarea" rows="3">${esc(task.description||'')}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="dp-form-row">
            <label class="dp-label">Assignee</label>
            <input id="et-assignee" class="dp-input" type="text" list="et-assignee-list" value="${esc(task.assignee||'')}" placeholder="Type name" />
            <datalist id="et-assignee-list">${userList.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Status</label>
            <select id="et-status" class="dp-input">
              <option value="todo" ${task.status==='todo'?'selected':''}>📋 Todo</option>
              <option value="in_progress" ${task.status==='in_progress'?'selected':''}>🔄 In Progress</option>
              <option value="done" ${task.status==='done'?'selected':''}>✅ Done</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Priority</label>
            <select id="et-priority" class="dp-input">
              <option value="normal" ${task.priority==='normal'?'selected':''}>🟡 Normal</option>
              <option value="high" ${task.priority==='high'?'selected':''}>🔴 High</option>
              <option value="low" ${task.priority==='low'?'selected':''}>⚪ Low</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Due Date</label>
            <input id="et-due" class="dp-input" type="date" value="${esc(task.due_date||'')}" />
          </div>
        </div>
      </div>
    `, {
      title: 'Edit Task',
      confirmLabel: 'Save',
      onConfirm: async () => {
        const title = $('et-title').value.trim();
        if (!title) { showToast('Title is required.', 'error'); return; }
        const result = await api('PUT', `tasks?id=${id}`, {
          title,
          description: $('et-desc').value.trim() || null,
          assignee:    $('et-assignee').value.trim() || null,
          status:      $('et-status').value,
          priority:    $('et-priority').value,
          due_date:    $('et-due').value || null,
        });
        if (result) { closeModal(); showToast('Saved.', 'success'); loadTasks(); }
      },
    });
  }

  async function deleteTask(id) {
    const task = _allTasks.find(t => t.id === id);
    openModal(
      `<p style="font-size:14px;color:var(--text-2)">Delete task "<strong>${esc(task?.title||'')}</strong>"?</p>`,
      {
        title: 'Delete Task',
        confirmLabel: 'Delete',
        onConfirm: async () => {
          const result = await api('DELETE', `tasks?id=${id}`);
          if (result) { closeModal(); showToast('Deleted.', 'success'); loadTasks(); }
        },
      }
    );
  }

  // ── Notes & Issues ─────────────────────────────────────────────────────────
  let _allNotes = [];

  async function loadNotes() {
    const container = $('dp-notes-content');
    if (!container) return;
    const data = await api('GET', 'notes');
    _allNotes = data?.notes || [];
    renderNotes(_allNotes);
  }

  function renderNotes(notes) {
    const container = $('dp-notes-content');
    if (!container) return;

    const typeLabel = { note: '📝 Note', issue: '⚠️ Issue', warning: '🚨 Warning', suggestion: '💡 Suggestion' };
    const typeColor = { note: '#146E7A', issue: '#D97706', warning: '#DC2626', suggestion: '#7C3AED' };

    function noteRow(n) {
      const isHigh = n.priority === 'high' && n.status === 'open';
      const plainContent = n.content ? n.content.replace(/<[^>]+>/g, '') : '';
      return `<div class="dp-note-row${isHigh?' dp-note-row--high':''}${n.status==='resolved'?' dp-note-row--resolved':''}" style="cursor:pointer" onclick="DP.viewNote(${n.id})">
        <div class="dp-note-row-left">
          <span class="dp-badge" style="background:${typeColor[n.type]||'#146E7A'}20;color:${typeColor[n.type]||'#146E7A'};border:1px solid ${typeColor[n.type]||'#146E7A'}40">${typeLabel[n.type]||n.type}</span>
          <div>
            <div class="dp-note-title">${esc(n.title)}</div>
            ${plainContent ? `<div class="dp-note-excerpt">${esc(plainContent.slice(0,120))}${plainContent.length>120?'…':''}</div>` : ''}
            <div class="dp-note-meta">${esc(n.added_by)} · ${fmtDate(n.created_at)} · ${n.priority==='high'?'🔴 High':n.priority==='low'?'⚪ Low':'🟡 Normal'}</div>
          </div>
        </div>
        <div class="dp-note-row-right">
          ${n.status === 'open'
            ? `<button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="event.stopPropagation();DP._resolveNote(${n.id})">✓ Resolve</button>`
            : `<span style="font-size:11px;color:var(--text-3)">✅ Resolved</span>`}
          <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="event.stopPropagation();DP.editNote(${n.id})">✏ Edit</button>
          ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--xs dp-btn--danger" onclick="event.stopPropagation();DP.deleteNote(${n.id})">Delete</button>` : ''}
        </div>
      </div>`;
    }

    const open = notes.filter(n => n.status === 'open');
    const resolved = notes.filter(n => n.status === 'resolved');

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Notes &amp; Issues</h2>
        <button class="dp-btn dp-btn--primary dp-btn--sm" onclick="DP.createNote()">+ New Note</button>
      </div>
      ${open.length ? `<div class="dp-note-list">${open.map(noteRow).join('')}</div>` : ''}
      ${resolved.length ? `
        <details style="margin-top:16px">
          <summary style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3);cursor:pointer;padding:8px 0">
            Resolved (${resolved.length})
          </summary>
          <div class="dp-note-list" style="margin-top:8px">${resolved.map(noteRow).join('')}</div>
        </details>` : ''}
      ${!open.length && !resolved.length ? '<div class="dp-empty-state"><p>No notes yet.</p></div>' : ''}
    `;
  }

  async function _resolveNote(id) {
    const result = await api('PUT', `notes?id=${id}`, { status: 'resolved' });
    if (result) { showToast('Marked as resolved.', 'success'); loadNotes(); }
  }

  async function createNote() {
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="cn-title" class="dp-input" type="text" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Content</label>
          <div class="dp-te-wrapper">
            <div class="dp-te-toolbar">
              <button type="button" class="dp-te-btn" data-cmd="bold" onmousedown="event.preventDefault();DP._teCmd('bold')" title="Bold"><b>B</b></button>
              <button type="button" class="dp-te-btn" data-cmd="italic" onmousedown="event.preventDefault();DP._teCmd('italic')" title="Italic"><i>I</i></button>
              <button type="button" class="dp-te-btn" data-cmd="strike" onmousedown="event.preventDefault();DP._teCmd('strike')" title="Strikethrough"><s>S</s></button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="h2" onmousedown="event.preventDefault();DP._teCmd('h2')" title="Heading 2">H2</button>
              <button type="button" class="dp-te-btn" data-cmd="h3" onmousedown="event.preventDefault();DP._teCmd('h3')" title="Heading 3">H3</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="bulletList" onmousedown="event.preventDefault();DP._teCmd('bulletList')" title="Bullet List">&#8226; List</button>
              <button type="button" class="dp-te-btn" data-cmd="orderedList" onmousedown="event.preventDefault();DP._teCmd('orderedList')" title="Numbered List">1. List</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="blockquote" onmousedown="event.preventDefault();DP._teCmd('blockquote')" title="Quote">&#8220;</button>
              <button type="button" class="dp-te-btn" data-cmd="code" onmousedown="event.preventDefault();DP._teCmd('code')" title="Code">&lt;/&gt;</button>
            </div>
            <div id="cn-tiptap"></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="dp-form-row">
            <label class="dp-label">Type</label>
            <select id="cn-type" class="dp-input">
              <option value="note">📝 Note</option>
              <option value="issue">⚠️ Issue</option>
              <option value="warning">🚨 Warning</option>
              <option value="suggestion">💡 Suggestion</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Priority</label>
            <select id="cn-priority" class="dp-input">
              <option value="normal" selected>🟡 Normal</option>
              <option value="high">🔴 High</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Status</label>
            <select id="cn-status" class="dp-input">
              <option value="open">🔓 Open</option>
              <option value="resolved">✅ Resolved</option>
            </select>
          </div>
        </div>
      </div>
    `, {
      title: 'New Note',
      confirmLabel: 'Create',
      onConfirm: async () => {
        const title = $('cn-title').value.trim();
        if (!title) { showToast('Title is required.', 'error'); return; }
        const content = _getTiptapHTML();
        const result = await api('POST', 'notes', {
          title,
          content: content || null,
          type:     $('cn-type').value,
          priority: $('cn-priority').value,
          status:   $('cn-status').value,
        });
        if (result) { closeModal(); showToast('Note created.', 'success'); loadNotes(); }
      },
    });
    _waitForTiptap(() => _initTiptap('cn-tiptap', null));
  }

  async function editNote(id) {
    const note = _allNotes.find(n => n.id === id);
    if (!note) return;
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="en-title" class="dp-input" type="text" value="${esc(note.title)}" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Content</label>
          <div class="dp-te-wrapper">
            <div class="dp-te-toolbar">
              <button type="button" class="dp-te-btn" data-cmd="bold" onmousedown="event.preventDefault();DP._teCmd('bold')" title="Bold"><b>B</b></button>
              <button type="button" class="dp-te-btn" data-cmd="italic" onmousedown="event.preventDefault();DP._teCmd('italic')" title="Italic"><i>I</i></button>
              <button type="button" class="dp-te-btn" data-cmd="strike" onmousedown="event.preventDefault();DP._teCmd('strike')" title="Strikethrough"><s>S</s></button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="h2" onmousedown="event.preventDefault();DP._teCmd('h2')" title="Heading 2">H2</button>
              <button type="button" class="dp-te-btn" data-cmd="h3" onmousedown="event.preventDefault();DP._teCmd('h3')" title="Heading 3">H3</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="bulletList" onmousedown="event.preventDefault();DP._teCmd('bulletList')" title="Bullet List">&#8226; List</button>
              <button type="button" class="dp-te-btn" data-cmd="orderedList" onmousedown="event.preventDefault();DP._teCmd('orderedList')" title="Numbered List">1. List</button>
              <span class="dp-te-sep"></span>
              <button type="button" class="dp-te-btn" data-cmd="blockquote" onmousedown="event.preventDefault();DP._teCmd('blockquote')" title="Quote">&#8220;</button>
              <button type="button" class="dp-te-btn" data-cmd="code" onmousedown="event.preventDefault();DP._teCmd('code')" title="Code">&lt;/&gt;</button>
            </div>
            <div id="en-tiptap"></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="dp-form-row">
            <label class="dp-label">Type</label>
            <select id="en-type" class="dp-input">
              <option value="note" ${note.type==='note'?'selected':''}>📝 Note</option>
              <option value="issue" ${note.type==='issue'?'selected':''}>⚠️ Issue</option>
              <option value="warning" ${note.type==='warning'?'selected':''}>🚨 Warning</option>
              <option value="suggestion" ${note.type==='suggestion'?'selected':''}>💡 Suggestion</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Priority</label>
            <select id="en-priority" class="dp-input">
              <option value="normal" ${note.priority==='normal'?'selected':''}>🟡 Normal</option>
              <option value="high" ${note.priority==='high'?'selected':''}>🔴 High</option>
              <option value="low" ${note.priority==='low'?'selected':''}>⚪ Low</option>
            </select>
          </div>
          <div class="dp-form-row">
            <label class="dp-label">Status</label>
            <select id="en-status" class="dp-input">
              <option value="open" ${note.status==='open'?'selected':''}>🔓 Open</option>
              <option value="resolved" ${note.status==='resolved'?'selected':''}>✅ Resolved</option>
            </select>
          </div>
        </div>
      </div>
    `, {
      title: 'Edit Note',
      confirmLabel: 'Save',
      onConfirm: async () => {
        const title = $('en-title').value.trim();
        if (!title) { showToast('Title is required.', 'error'); return; }
        const content = _getTiptapHTML();
        const result = await api('PUT', `notes?id=${id}`, {
          title,
          content: content || null,
          type:     $('en-type').value,
          priority: $('en-priority').value,
          status:   $('en-status').value,
        });
        if (result) { closeModal(); showToast('Saved.', 'success'); loadNotes(); }
      },
    });
    _waitForTiptap(() => _initTiptap('en-tiptap', _legacyToHtml(note.content)));
  }

  function viewNote(id) {
    const note = _allNotes.find(n => n.id === id);
    if (!note) return;
    const typeLabel = { note: '📝 Note', issue: '⚠️ Issue', warning: '🚨 Warning', suggestion: '💡 Suggestion' };
    const typeColor = { note: '#146E7A', issue: '#D97706', warning: '#DC2626', suggestion: '#7C3AED' };
    const priorityLabel = { high: '🔴 High', normal: '🟡 Normal', low: '⚪ Low' };
    const color = typeColor[note.type] || '#146E7A';
    const contentHtml = note.content
      ? `<div class="dp-post-detail-content" style="margin:16px 0">${_sanitizeHtml(_legacyToHtml(note.content))}</div>`
      : '';

    openModal(`
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <span class="dp-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${typeLabel[note.type]||note.type}</span>
          <span class="dp-badge" style="background:var(--surface2);color:var(--text-2)">${priorityLabel[note.priority]||note.priority}</span>
          <span class="dp-badge" style="background:var(--surface2);color:var(--text-2)">${note.status==='resolved'?'✅ Resolved':'🔓 Open'}</span>
        </div>
        ${contentHtml}
        <div style="font-size:12px;color:var(--text-3);padding-top:10px;border-top:1px solid var(--border)">
          ${esc(note.added_by)} · ${fmtDateHM(note.created_at)}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          ${note.status === 'open' ? `<button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP.closeModal();setTimeout(()=>DP._resolveNote(${note.id}),80)">✓ Resolve</button>` : ''}
          <button class="dp-btn dp-btn--ghost dp-btn--sm" onclick="DP.closeModal();setTimeout(()=>DP.editNote(${note.id}),80)">✏ Edit</button>
          ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--ghost dp-btn--sm" style="color:var(--red)" onclick="DP.closeModal();setTimeout(()=>DP.deleteNote(${note.id}),80)">Delete</button>` : ''}
        </div>
      </div>
    `, { title: esc(note.title), wide: true });
  }

  async function deleteNote(id) {
    const note = _allNotes.find(n => n.id === id);
    openModal(
      `<p style="font-size:14px;color:var(--text-2)">Delete note "<strong>${esc(note?.title||'')}</strong>"?</p>`,
      {
        title: 'Delete Note',
        confirmLabel: 'Delete',
        onConfirm: async () => {
          const result = await api('DELETE', `notes?id=${id}`);
          if (result) { closeModal(); showToast('Deleted.', 'success'); loadNotes(); }
        },
      }
    );
  }

  // ── Approver tag input helpers ─────────────────────────────────────────────
  function _addApproverTag(prefix) {
    const select = $(`${prefix}-approver-select`);
    const name = select ? select.value.trim() : '';
    if (!name) return;
    const arr = prefix === 'fp' ? _fpApprovers : _epApprovers;
    if (arr.includes(name)) return;
    arr.push(name);
    _renderApproverTags(prefix);
    _refreshApproverSelect(prefix);
  }

  function _refreshApproverSelect(prefix) {
    const select = $(`${prefix}-approver-select`);
    if (!select || !_allUsers || !_allUsers.length) return;
    const arr = prefix === 'fp' ? _fpApprovers : _epApprovers;
    const available = _allUsers.filter(u => !arr.includes(u.display_name));
    select.innerHTML = available.length
      ? `<option value="">— Select a team member —</option>` + available.map(u => `<option value="${esc(u.display_name)}">${esc(u.display_name)}</option>`).join('')
      : `<option value="">All team members added</option>`;
  }

  function _removeApproverTag(prefix, name) {
    if (prefix === 'fp') {
      _fpApprovers = _fpApprovers.filter(n => n !== name);
    } else {
      _epApprovers = _epApprovers.filter(n => n !== name);
    }
    _renderApproverTags(prefix);
    _refreshApproverSelect(prefix);
  }

  function _renderApproverTags(prefix) {
    const container = $(`${prefix}-approver-tags`);
    if (!container) return;
    const arr = prefix === 'fp' ? _fpApprovers : _epApprovers;
    container.innerHTML = arr.map(name =>
      `<span class="dp-tag">${esc(name)}<button type="button" class="dp-tag-remove" onclick="DP._removeApproverTag('${prefix}','${esc(name)}')">&times;</button></span>`
    ).join('');
  }

  // ── Approval voting & override ─────────────────────────────────────────────
  async function _submitVote(postId, approverName, status) {
    const result = await api('PUT', `approvals?post_id=${postId}&approver=${encodeURIComponent(approverName)}`, { status });
    if (result) {
      showToast(`Vote recorded: ${status}.`, 'success');
      viewPost(postId);
    }
  }

  async function _submitApprovalOverride(postId, approverName, approvalId) {
    const statusEl = document.getElementById(`ov-status-${approvalId}`);
    const noteEl   = document.getElementById(`ov-note-${approvalId}`);
    const status   = statusEl ? statusEl.value : 'pending';
    const note     = noteEl ? noteEl.value.trim() : '';
    const result = await api('PUT', `approvals?post_id=${postId}&approver=${encodeURIComponent(approverName)}`, { status, override_note: note || undefined });
    if (result) {
      showToast('Override applied.', 'success');
      viewPost(postId);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init,
    login,
    logout,
    navigate,
    closeModal,
    dayClick,
    addEvent,
    deleteEvent,
    viewEvent,
    editEvent,
    createPost,
    editPost,
    deletePost,
    viewPost,
    createUser,
    editUser,
    deleteUser,
    sortUsers,
    filterAndRenderUsers,
    saveProfile,
    changePassword,
    prevMonth,
    nextMonth,
    addVersion,
    addDepartment,
    editDepartment,
    deleteDepartment,
    addComment,
    deleteComment,
    _handleFileSelect,
    _handleAvatarSelect,
    _removeAvatar,
    _removeKeptFile: () => {},
    _teCmd: _execTiptapCmd,
    _calDragStart,
    _verChangePage,
    _calDragOver,
    _calDragLeave,
    _calDrop,
    extendSession,
    _showAllRecent,
    _clearEventPicker,
    loadSettings,
    _settingsReset,
    _selectApprover,
    _clearApproverPicker,
    _addApproverTag,
    _refreshApproverSelect,
    _removeApproverTag,
    _submitVote,
    _submitApprovalOverride,
    loadTasks,
    viewTask,
    createTask,
    editTask,
    deleteTask,
    _setTaskFilter,
    _updateTaskStatus,
    loadNotes,
    viewNote,
    createNote,
    editNote,
    deleteNote,
    _resolveNote,
  };
})();

document.addEventListener('DOMContentLoaded', () => DP.init());
