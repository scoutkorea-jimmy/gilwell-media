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

  const SESSION_DURATION_MS = 60 * 60 * 1000;
  const SESSION_WARNING_MS = 5 * 60 * 1000;
  const SESSION_EXPIRY_KEY = 'dp_session_expires_at';

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

  function extendSession() {
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
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,iframe,object,embed,form').forEach(el => el.remove());
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
      case 'contacts':     loadContacts(); break;
      case 'users':
        if (currentUser?.role !== 'admin') { navigate('home'); return; }
        loadUsers();
        break;
      case 'account':      loadAccount(); break;
      case 'devrules':     loadDevRules(); break;
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

  function renderHomeRecent(items) {
    const el = $('dp-home-recent');
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="dp-home-item"><strong>No recent changes yet.</strong><small>Updates to posts, events, and comments will appear here.</small></div>';
      return;
    }
    el.innerHTML = `<div class="dp-home-list">${items.map(item => `
      <div class="dp-home-item">
        <strong>${esc(item.title || '')}</strong>
        <small>${esc((item.kind || 'item').toUpperCase() + ' · ' + (item.meta || '') + (item.created_at ? ' · ' + fmtDateHM(item.created_at) : ''))}</small>
        ${item.note ? `<div style="margin-top:6px;font-size:12px;color:var(--text-2)">${esc(String(item.note).slice(0, 140))}</div>` : ''}
      </div>
    `).join('')}</div>`;
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

    // Index events by YYYY-MM-DD
    const eventMap = {};
    for (const ev of events) {
      const key = ev.start_date.slice(0, 10);
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(ev);
    }

    // First day offset (Sun=0)
    const firstDow = new Date(year, month, 1).getDay();
    const startOffset = firstDow; // 0=Sun,1=Mon,...,6=Sat
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const monthName = calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const typeColors = { general: '#146E7A', deadline: '#DC2626', meeting: '#059669', milestone: '#8D714E' };

    let html = `
      <div class="dp-cal-header">
        <button class="dp-cal-nav" onclick="DP.prevMonth()" title="Previous month">&#8249;</button>
        <h2 class="dp-cal-title">${esc(monthName)}</h2>
        <button class="dp-cal-nav" onclick="DP.nextMonth()" title="Next month">&#8250;</button>
        ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--sm dp-btn--primary dp-admin-only" onclick="DP.addEvent()" style="margin-left:auto">+ Add Event</button>` : ''}
      </div>
      <div class="dp-cal-grid">
        <div class="dp-cal-dow dp-cal-dow--weekend">Sun</div>
        <div class="dp-cal-dow">Mon</div>
        <div class="dp-cal-dow">Tue</div>
        <div class="dp-cal-dow">Wed</div>
        <div class="dp-cal-dow">Thu</div>
        <div class="dp-cal-dow">Fri</div>
        <div class="dp-cal-dow dp-cal-dow--weekend">Sat</div>
    `;

    // Empty leading cells
    for (let i = 0; i < startOffset; i++) {
      html += `<div class="dp-cal-day dp-cal-day--empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const m   = String(month + 1).padStart(2, '0');
      const dd  = String(d).padStart(2, '0');
      const dateStr   = `${year}-${m}-${dd}`;
      const dayEvents = eventMap[dateStr] || [];
      const isToday   = dateStr === todayStr;
      const isWeekend = (() => { const dow = new Date(year, month, d).getDay(); return dow === 0 || dow === 6; })();

      // Render up to 3 event strips; "+N more" link for overflow
      const strips = dayEvents.slice(0, 3).map(ev => `
        <div class="dp-cal-event-strip"
             style="background:${typeColors[ev.type] || typeColors.general}"
             draggable="true"
             ondragstart="event.stopPropagation(); DP._calDragStart(event, ${ev.id})"
             onclick="event.stopPropagation(); DP.viewEvent(${ev.id})"
             title="${esc(ev.title)}${ev.start_time ? ' · ' + ev.start_time : ''}">
          ${ev.start_time ? `<span style="opacity:.8;font-size:10px;margin-right:3px">${esc(ev.start_time)}</span>` : ''}${esc(ev.title)}
        </div>`).join('');

      const moreHtml = dayEvents.length > 3
        ? `<div class="dp-cal-more" onclick="event.stopPropagation(); DP.dayClick('${dateStr}')">+${dayEvents.length - 3} more</div>`
        : '';

      html += `
        <div class="dp-cal-day${isToday ? ' dp-cal-day--today' : ''}${isWeekend ? ' dp-cal-day--weekend' : ''}${dayEvents.length > 0 ? ' dp-cal-day--has-events' : ''}"
             onclick="DP.dayClick('${dateStr}')" style="cursor:pointer"
             ondragover="event.preventDefault(); DP._calDragOver(event)"
             ondragleave="DP._calDragLeave(event)"
             ondrop="event.preventDefault(); DP._calDrop(event, '${dateStr}')">
          <span class="dp-cal-day-num${isToday ? ' dp-cal-today-num' : ''}">${d}</span>
          <div class="dp-cal-event-strips">${strips}${moreHtml}</div>
        </div>`;
    }

    html += '</div>'; // close dp-cal-grid
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

    const boardTitles = { announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes' };
    const title = boardTitles[boardName] || boardName;

    let addBtn = '';
    if (currentUser?.role === 'admin') {
      addBtn = `<button class="dp-btn dp-btn--primary dp-admin-only" onclick="DP.createPost('${boardName}')">+ New Post</button>`;
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
      regularHtml = `<div class="dp-empty-state"><p>No posts yet.</p>${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--primary dp-admin-only" onclick="DP.createPost('${boardName}')">Create the first post</button>` : ''}</div>`;
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

    // ── Linked Calendar Event (Meeting Minutes only) ───────────────
    const linkedEventHtml = p.linked_event ? `
      <div class="dp-linked-minutes-section">
        <div class="dp-linked-section-label">&#128197; 연결된 회의 일정 / Linked Meeting</div>
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
          <label class="dp-label">&#128197; 연결된 회의 일정 <span style="color:var(--text-3);font-size:11px">(선택사항 / Optional)</span></label>
          <select id="fp-linked-event" class="dp-input">
            <option value="">— 연결 안 함 / None —</option>
          </select>
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
        if (!title) { showToast('Title is required.', 'error'); return; }

        // Upload selected files first
        const fileInput = $('fp-files');
        const uploadedFiles = await uploadFiles(fileInput, 'fp-filelist');
        if (uploadedFiles === null) return; // upload error

        const result = await api('POST', 'posts', {
          board, title, content: content || null, pinned,
          files: uploadedFiles, linked_event_id,
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
    if (isMinutes) {
      api('GET', 'events').then(d => {
        const sel = $('fp-linked-event');
        if (!sel || !d?.events) return;
        d.events.slice(0, 60).forEach(ev => {
          const opt = document.createElement('option');
          opt.value = ev.id;
          opt.textContent = `${esc(ev.start_date)} · ${esc(ev.title)}`;
          sel.appendChild(opt);
        });
      });
    }
  }

  async function editPost(id) {
    const data = await api('GET', `posts?id=${id}`);
    if (!data?.post) return;
    const p = data.post;
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
          <label class="dp-label">&#128197; 연결된 회의 일정 <span style="color:var(--text-3);font-size:11px">(선택사항 / Optional)</span></label>
          <select id="ep-linked-event" class="dp-input">
            <option value="">— 연결 안 함 / None —</option>
          </select>
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
        const result = await api('PUT', `posts?id=${id}`, {
          title, content: content || null, pinned,
          edit_note: edit_note || null,
          files: allFiles,
          ...(linked_event_id !== undefined ? { linked_event_id } : {}),
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
    if (isMinutes) {
      api('GET', 'events').then(d => {
        const sel = $('ep-linked-event');
        if (!sel || !d?.events) return;
        d.events.slice(0, 60).forEach(ev => {
          const opt = document.createElement('option');
          opt.value = ev.id;
          opt.textContent = `${esc(ev.start_date)} · ${esc(ev.title)}`;
          if (p.linked_event_id === ev.id) opt.selected = true;
          sel.appendChild(opt);
        });
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
        <div class="dp-linked-section-label">&#128221; 회의록 / Meeting Minutes (${linkedMinutes.length})</div>
        ${linkedMinutes.map(m => `
          <div class="dp-linked-minutes-item" onclick="DP.closeModal(); setTimeout(()=>DP.viewPost(${m.id}),80)">
            <span style="font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.title)}</span>
            <span style="color:var(--text-3);font-size:12px;white-space:nowrap;flex-shrink:0">${esc(m.author_name)} · ${fmtDate(m.created_at)}</span>
          </div>`).join('')}
        ${currentUser?.role === 'admin' ? `
        <button class="dp-btn dp-btn--ghost dp-btn--sm" style="margin-top:6px" onclick="DP.closeModal(); setTimeout(()=>DP.navigate('minutes'),80);">
          + 새 회의록 작성
        </button>` : ''}
      </div>` : `
      <div class="dp-linked-minutes-section">
        <div class="dp-linked-section-label">&#128221; 회의록 / Meeting Minutes</div>
        <div style="font-size:12px;color:var(--text-3);padding:6px 0">아직 연결된 회의록이 없습니다. / No linked minutes yet.</div>
        ${currentUser?.role === 'admin' ? `
        <button class="dp-btn dp-btn--ghost dp-btn--sm" style="margin-top:4px" onclick="DP.closeModal(); setTimeout(()=>DP.navigate('minutes'),80);">
          + 새 회의록 작성
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

  function renderContacts(_contacts, team) {
    const container = $('dp-contacts-content');
    if (!container) return;

    function contactCard(c) {
      const initials = (c.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const deptChip = c.department ? `<span class="dp-dept-chip" style="margin-top:4px;display:inline-block">${esc(c.department)}</span>` : '';
      return `
        <div class="dp-contact-card dp-contact-card--team">
          <div class="dp-contact-avatar">${esc(initials)}</div>
          <div class="dp-contact-info">
            <h4 class="dp-contact-name">${esc(c.name)}</h4>
            ${c.role_title ? `<p class="dp-contact-role">${esc(c.role_title)}</p>` : ''}
            ${deptChip}
            ${c.phone ? `<p class="dp-contact-detail"><span class="dp-contact-icon">&#128222;</span><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></p>` : ''}
            ${c.email ? `<p class="dp-contact-detail"><span class="dp-contact-icon">&#9993;</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}
            ${c.note ? `<p class="dp-contact-note">${esc(c.note)}</p>` : ''}
          </div>
        </div>`;
    }

    const teamHtml = team && team.length ? `
      <div class="dp-contacts-grid">
        ${team.map(u => contactCard(u)).join('')}
      </div>` : '';

    const emptyHtml = (!team || !team.length)
      ? `<div class="dp-empty-state"><p>No team members found.</p></div>` : '';

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Project Team Contacts</h2>
      </div>
      ${teamHtml}
      ${emptyHtml}
    `;
  }


  // ── User Management ────────────────────────────────────────────────────────
  let _allUsers = [];
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
    if (!users.length) return `<tr><td colspan="7" class="dp-table-empty">No users found.</td></tr>`;
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
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    loadCalendar();
  }

  function nextMonth() {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
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
        <label class="dp-label">Type</label>
        <select class="dp-input" id="ver-type">
          <option value="feature">Feature — Increments bbb (e.g. 01.001.00)</option>
          <option value="bugfix">Bugfix — Increments cc (e.g. 01.000.01)</option>
        </select>
      </div>
      <div class="dp-form-group" style="margin-top:12px">
        <label class="dp-label">Description <span style="color:var(--red)">*</span></label>
        <textarea class="dp-input" id="ver-desc" rows="3" placeholder="What changed in this version?"></textarea>
      </div>
    `, {
      title: 'Log New Version',
      confirmLabel: 'Add Version',
      onConfirm: async () => {
        const type = $('ver-type').value;
        const description = $('ver-desc').value.trim();
        if (!description) { showToast('Description is required.', 'error'); return; }
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
  };
})();

document.addEventListener('DOMContentLoaded', () => DP.init());
