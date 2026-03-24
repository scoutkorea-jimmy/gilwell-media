/**
 * Dreampath · Frontend v2
 * Self-contained IIFE — stored as window.DP
 */
const DP = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let token       = localStorage.getItem('dp_token') || null;
  let currentUser = JSON.parse(localStorage.getItem('dp_user') || 'null');
  let activeSection = 'home';
  let calendarDate  = new Date();

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtDateTime(s) {
    if (!s) return '';
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtFull(s) {
    if (!s) return '';
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
    $('dp-modal-overlay').classList.remove('dp-modal--open');
  }

  // ── API helper ─────────────────────────────────────────────────────────────
  async function api(method, path, body) {
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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

    token       = data.token;
    currentUser = data.user;
    localStorage.setItem('dp_token', token);
    localStorage.setItem('dp_user', JSON.stringify(currentUser));

    btnEl.disabled = false;
    btnEl.textContent = 'Sign In';
    showApp();
  }

  function logout() {
    token       = null;
    currentUser = null;
    localStorage.removeItem('dp_token');
    localStorage.removeItem('dp_user');
    $('dp-app').classList.add('dp-hidden');
    $('dp-login').classList.remove('dp-hidden');
    $('dp-login-username').value = '';
    $('dp-login-password').value = '';
    $('dp-login-error').classList.add('dp-hidden');
  }

  function showApp() {
    $('dp-login').classList.add('dp-hidden');
    $('dp-app').classList.remove('dp-hidden');

    // Set user info in sidebar
    $('dp-user-name').textContent = currentUser.display_name || currentUser.username;
    const initials = (currentUser.display_name || currentUser.username || '?')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    $('dp-user-avatar').textContent = initials;

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
      case 'users':        loadUsers(); break;
      case 'account':      loadAccount(); break;
      case 'devrules':     loadDevRules(); break;
    }
  }

  // ── Home ───────────────────────────────────────────────────────────────────
  async function loadHome() {
    await Promise.all([loadCalendar(), loadBoardPreviews()]);
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

    const monthName = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Build a map: date string → array of events
    const eventMap = {};
    events.forEach(e => {
      const key = e.start_date.slice(0, 10);
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    });

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    // Convert to Mon-first: Sun=6, Mon=0, Tue=1...
    const startOffset = (firstDay + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const typeColors = {
      general:   '#4f46e5',
      deadline:  '#ef4444',
      meeting:   '#10b981',
      milestone: '#f59e0b',
    };

    let html = `
      <div class="dp-cal-header">
        <button class="dp-cal-nav" onclick="DP.prevMonth()" title="Previous month">&#8249;</button>
        <h2 class="dp-cal-title">${esc(monthName)}</h2>
        <button class="dp-cal-nav" onclick="DP.nextMonth()" title="Next month">&#8250;</button>
        ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--sm dp-btn--primary dp-admin-only" onclick="DP.addEvent()" style="margin-left:auto">+ Add Event</button>` : ''}
      </div>
      <div class="dp-cal-grid">
        <div class="dp-cal-dow">Mon</div>
        <div class="dp-cal-dow">Tue</div>
        <div class="dp-cal-dow">Wed</div>
        <div class="dp-cal-dow">Thu</div>
        <div class="dp-cal-dow">Fri</div>
        <div class="dp-cal-dow dp-cal-dow--weekend">Sat</div>
        <div class="dp-cal-dow dp-cal-dow--weekend">Sun</div>
    `;

    // Empty cells before first day
    for (let i = 0; i < startOffset; i++) {
      html += `<div class="dp-cal-day dp-cal-day--empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = eventMap[dateStr] || [];
      const isToday   = dateStr === todayStr;
      const dayOfWeek = (startOffset + d - 1) % 7; // 0=Mon ... 6=Sun
      const isWeekend = dayOfWeek >= 5;

      let dotsHtml = '';
      dayEvents.slice(0, 3).forEach(ev => {
        const color = typeColors[ev.type] || typeColors.general;
        dotsHtml += `<span class="dp-cal-dot" style="background:${color}" title="${esc(ev.title)}"></span>`;
      });
      if (dayEvents.length > 3) {
        dotsHtml += `<span class="dp-cal-dot-more">+${dayEvents.length - 3}</span>`;
      }

      const clickable = dayEvents.length > 0 || currentUser?.role === 'admin';
      const clickAttr = clickable ? `onclick="DP.dayClick('${dateStr}')"` : '';

      html += `
        <div class="dp-cal-day${isToday ? ' dp-cal-day--today' : ''}${isWeekend ? ' dp-cal-day--weekend' : ''}${dayEvents.length > 0 ? ' dp-cal-day--has-events' : ''}${clickable ? ' dp-cal-day--clickable' : ''}" ${clickAttr} data-date="${dateStr}">
          <span class="dp-cal-day-num">${d}</span>
          <div class="dp-cal-dots">${dotsHtml}</div>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  function dayClick(dateStr) {
    // Build event list for this date
    const month = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
    api('GET', `events?month=${month}`).then(data => {
      const events = (data?.events || []).filter(e => e.start_date.slice(0, 10) === dateStr);
      const typeLabels = { general: 'General', deadline: 'Deadline', meeting: 'Meeting', milestone: 'Milestone' };
      const typeColors = { general: '#4f46e5', deadline: '#ef4444', meeting: '#10b981', milestone: '#f59e0b' };

      const fmtDateStr = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      let evHtml = '';
      if (events.length > 0) {
        evHtml = events.map(ev => `
          <div class="dp-event-item">
            <span class="dp-event-badge" style="background:${typeColors[ev.type] || '#4f46e5'}">${esc(typeLabels[ev.type] || ev.type)}</span>
            <div class="dp-event-item-body">
              <strong>${esc(ev.title)}</strong>
              ${ev.description ? `<p class="dp-event-desc">${esc(ev.description)}</p>` : ''}
              ${ev.end_date ? `<small class="dp-text-muted">Until ${esc(fmtDate(ev.end_date))}</small>` : ''}
            </div>
            ${currentUser?.role === 'admin' ? `<button class="dp-btn dp-btn--sm dp-btn--danger" onclick="DP.deleteEvent(${ev.id})">Delete</button>` : ''}
          </div>
        `).join('');
      } else {
        evHtml = `<p class="dp-text-muted">No events on this date.</p>`;
      }

      let addBtn = '';
      if (currentUser?.role === 'admin') {
        addBtn = `<div style="margin-top:16px"><button class="dp-btn dp-btn--primary" onclick="DP.closeModal(); DP.addEvent('${dateStr}')">+ Add Event on This Date</button></div>`;
      }

      openModal(`
        <div class="dp-event-list">${evHtml}</div>
        ${addBtn}
      `, { title: fmtDateStr });
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
    if (currentUser?.role === 'admin') {
      adminBtns = `
        <div class="dp-post-actions dp-admin-only">
          <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="event.stopPropagation(); DP.editPost(${post.id})">Edit</button>
          <button class="dp-btn dp-btn--xs dp-btn--danger" onclick="event.stopPropagation(); DP.deletePost(${post.id}, '${boardName}')">Delete</button>
        </div>
      `;
    }
    return `
      <div class="dp-post-card" onclick="DP.viewPost(${post.id})">
        <div class="dp-post-card-inner">
          <div class="dp-post-card-meta">
            ${post.pinned ? '<span class="dp-pin-icon">&#128204;</span>' : ''}
            <span class="dp-post-author">${esc(post.author_name)}</span>
            <span class="dp-post-date">${esc(fmtDate(post.created_at))}</span>
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
    const data = await api('GET', `posts?id=${id}`);
    if (!data?.post) return;
    const p = data.post;
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
          <a href="${esc(f.file_url)}" target="_blank" rel="noopener" class="dp-attach-item">
            <span class="dp-attach-icon">${fileIcon(f.file_type)}</span>
            <span class="dp-attach-name">${esc(f.file_name)}</span>
            <span class="dp-attach-size">${fmtSize(f.file_size)}</span>
          </a>
        `).join('')}
      </div>` : '';

    // ── Content ────────────────────────────────────────────────────
    const contentHtml = p.content
      ? `<div class="dp-post-detail-content">${p.content.split('\n\n').map(para => `<p>${esc(para.trim()).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
      : '';

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
        ${imagesHtml}
        ${attachHtml}
        ${historyHtml}
      </div>
    `, { title: p.title, wide: true });
  }

  async function createPost(boardName) {
    const boardTitles = { announcements: 'Announcements', documents: 'Project Documents', minutes: 'Meeting Minutes' };
    // pendingFiles holds { url, name, type, size, is_image } objects after upload
    let pendingFiles = [];

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Board</label>
          <select id="fp-board" class="dp-input">
            <option value="announcements"${boardName === 'announcements' ? ' selected' : ''}>Announcements</option>
            <option value="documents"${boardName === 'documents' ? ' selected' : ''}>Project Documents</option>
            <option value="minutes"${boardName === 'minutes' ? ' selected' : ''}>Meeting Minutes</option>
          </select>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Title <span class="dp-required">*</span></label>
          <input id="fp-title" class="dp-input" type="text" placeholder="Post title" maxlength="200" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Content</label>
          <textarea id="fp-content" class="dp-input dp-textarea" placeholder="Post content (optional)"></textarea>
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
        const board   = $('fp-board').value;
        const title   = $('fp-title').value.trim();
        const content = $('fp-content').value.trim();
        const pinned  = $('fp-pinned').checked;
        if (!title) { showToast('Title is required.', 'error'); return; }

        // Upload selected files first
        const fileInput = $('fp-files');
        const uploadedFiles = await uploadFiles(fileInput, 'fp-filelist');
        if (uploadedFiles === null) return; // upload error

        const result = await api('POST', 'posts', {
          board, title, content: content || null, pinned,
          files: uploadedFiles,
        });
        if (result) {
          closeModal();
          showToast('Post created.', 'success');
          loadBoard(board);
          if (activeSection === 'home') loadBoardPreviews();
        }
      },
    });
  }

  async function editPost(id) {
    const data = await api('GET', `posts?id=${id}`);
    if (!data?.post) return;
    const p = data.post;
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
          <textarea id="ep-content" class="dp-input dp-textarea">${esc(p.content || '')}</textarea>
        </div>
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
        const content   = $('ep-content').value.trim();
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

        const result = await api('PUT', `posts?id=${id}`, {
          title, content: content || null, pinned,
          edit_note: edit_note || null,
          files: allFiles,
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
        <div class="dp-form-row">
          <label class="dp-label">Start Date <span class="dp-required">*</span></label>
          <input id="ae-start" class="dp-input" type="date" value="${esc(today)}" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">End Date</label>
          <input id="ae-end" class="dp-input" type="date" />
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
          end_date: end_date || null,
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

  // ── Emergency Contacts ─────────────────────────────────────────────────────
  async function loadContacts() {
    const data = await api('GET', 'contacts');
    renderContacts(data?.contacts || []);
  }

  function renderContacts(contacts) {
    const container = $('dp-contacts-content');
    if (!container) return;

    let addBtn = '';
    if (currentUser?.role === 'admin') {
      addBtn = `<button class="dp-btn dp-btn--primary dp-admin-only" onclick="DP.createContact()">+ Add Contact</button>`;
    }

    let cardsHtml = '';
    if (contacts.length === 0) {
      cardsHtml = `<div class="dp-empty-state"><p>No emergency contacts listed yet.</p></div>`;
    } else {
      cardsHtml = `<div class="dp-contacts-grid">` + contacts.map(c => `
        <div class="dp-contact-card">
          <div class="dp-contact-avatar">${esc((c.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2))}</div>
          <div class="dp-contact-info">
            <h4 class="dp-contact-name">${esc(c.name)}</h4>
            ${c.role_title ? `<p class="dp-contact-role">${esc(c.role_title)}</p>` : ''}
            ${c.department ? `<p class="dp-contact-dept">${esc(c.department)}</p>` : ''}
            ${c.phone ? `<p class="dp-contact-detail"><span class="dp-contact-icon">&#128222;</span><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></p>` : ''}
            ${c.email ? `<p class="dp-contact-detail"><span class="dp-contact-icon">&#9993;</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}
            ${c.note ? `<p class="dp-contact-note">${esc(c.note)}</p>` : ''}
          </div>
          ${currentUser?.role === 'admin' ? `
            <div class="dp-contact-actions dp-admin-only">
              <button class="dp-btn dp-btn--xs dp-btn--ghost" onclick="DP.editContact(${c.id})">Edit</button>
              <button class="dp-btn dp-btn--xs dp-btn--danger" onclick="DP.deleteContact(${c.id})">Delete</button>
            </div>
          ` : ''}
        </div>
      `).join('') + `</div>`;
    }

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">Emergency Contacts</h2>
        ${addBtn}
      </div>
      ${cardsHtml}
    `;
  }

  async function createContact() {
    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Name <span class="dp-required">*</span></label>
          <input id="cc-name" class="dp-input" type="text" placeholder="Full name" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Role / Title</label>
          <input id="cc-role" class="dp-input" type="text" placeholder="e.g. Project Manager" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <input id="cc-dept" class="dp-input" type="text" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Phone</label>
          <input id="cc-phone" class="dp-input" type="tel" placeholder="+1 (555) 000-0000" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Email</label>
          <input id="cc-email" class="dp-input" type="email" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Note</label>
          <textarea id="cc-note" class="dp-input dp-textarea dp-textarea--sm" placeholder="Additional notes" maxlength="500"></textarea>
        </div>
      </div>
    `, {
      title: 'Add Emergency Contact',
      confirmLabel: 'Add Contact',
      onConfirm: async () => {
        const name = $('cc-name').value.trim();
        if (!name) { showToast('Name is required.', 'error'); return; }

        const result = await api('POST', 'contacts', {
          name,
          role_title: $('cc-role').value.trim() || null,
          department: $('cc-dept').value.trim() || null,
          phone: $('cc-phone').value.trim() || null,
          email: $('cc-email').value.trim() || null,
          note: $('cc-note').value.trim() || null,
        });
        if (result) {
          closeModal();
          showToast('Contact added.', 'success');
          loadContacts();
        }
      },
    });
  }

  async function editContact(id) {
    const data = await api('GET', 'contacts');
    if (!data) return;
    const c = data.contacts.find(x => x.id === id);
    if (!c) return;

    openModal(`
      <div class="dp-form">
        <div class="dp-form-row">
          <label class="dp-label">Name <span class="dp-required">*</span></label>
          <input id="ec-name" class="dp-input" type="text" value="${esc(c.name)}" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Role / Title</label>
          <input id="ec-role" class="dp-input" type="text" value="${esc(c.role_title || '')}" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <input id="ec-dept" class="dp-input" type="text" value="${esc(c.department || '')}" maxlength="100" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Phone</label>
          <input id="ec-phone" class="dp-input" type="tel" value="${esc(c.phone || '')}" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Email</label>
          <input id="ec-email" class="dp-input" type="email" value="${esc(c.email || '')}" />
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Note</label>
          <textarea id="ec-note" class="dp-input dp-textarea dp-textarea--sm" maxlength="500">${esc(c.note || '')}</textarea>
        </div>
      </div>
    `, {
      title: 'Edit Contact',
      confirmLabel: 'Save Changes',
      onConfirm: async () => {
        const name = $('ec-name').value.trim();
        if (!name) { showToast('Name is required.', 'error'); return; }

        const result = await api('PUT', `contacts?id=${id}`, {
          name,
          role_title: $('ec-role').value.trim() || null,
          department: $('ec-dept').value.trim() || null,
          phone: $('ec-phone').value.trim() || null,
          email: $('ec-email').value.trim() || null,
          note: $('ec-note').value.trim() || null,
        });
        if (result) {
          closeModal();
          showToast('Contact updated.', 'success');
          loadContacts();
        }
      },
    });
  }

  async function deleteContact(id) {
    openModal(`<p>Are you sure you want to delete this contact?</p>`, {
      title: 'Delete Contact',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const result = await api('DELETE', `contacts?id=${id}`);
        if (result) {
          closeModal();
          showToast('Contact deleted.', 'success');
          loadContacts();
        }
      },
    });
  }

  // ── User Management ────────────────────────────────────────────────────────
  async function loadUsers() {
    const data = await api('GET', 'users');
    renderUsers(data?.users || []);
  }

  function renderUsers(users) {
    const container = $('dp-users-content');
    if (!container) return;

    let rows = '';
    if (users.length === 0) {
      rows = `<tr><td colspan="7" class="dp-table-empty">No users found.</td></tr>`;
    } else {
      rows = users.map(u => {
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
          </tr>
        `;
      }).join('');
    }

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">User Management</h2>
        <button class="dp-btn dp-btn--primary" onclick="DP.createUser()">+ Add User</button>
      </div>
      <div class="dp-table-wrap">
        <table class="dp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
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
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Email</label>
            <input id="cu-email" class="dp-input" type="email" />
          </div>
          <div>
            <label class="dp-label">Phone</label>
            <input id="cu-phone" class="dp-input" type="tel" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <input id="cu-dept" class="dp-input" type="text" maxlength="100" />
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

        const result = await api('POST', 'users', {
          username, display_name, password, role,
          email: $('cu-email').value.trim() || null,
          phone: $('cu-phone').value.trim() || null,
          department: $('cu-dept').value.trim() || null,
        });
        if (result) {
          closeModal();
          showToast('User created successfully.', 'success');
          loadUsers();
        }
      },
    });
  }

  async function editUser(id) {
    const data = await api('GET', 'users');
    if (!data) return;
    const u = data.users.find(x => x.id === id);
    if (!u) return;

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
        <div class="dp-form-row dp-form-row--2col">
          <div>
            <label class="dp-label">Email</label>
            <input id="eu-email" class="dp-input" type="email" value="${esc(u.email || '')}" />
          </div>
          <div>
            <label class="dp-label">Phone</label>
            <input id="eu-phone" class="dp-input" type="tel" value="${esc(u.phone || '')}" />
          </div>
        </div>
        <div class="dp-form-row">
          <label class="dp-label">Department</label>
          <input id="eu-dept" class="dp-input" type="text" value="${esc(u.department || '')}" maxlength="100" />
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
        const body = {
          display_name: $('eu-name').value.trim(),
          role:         $('eu-role').value,
          is_active:    $('eu-active').value === '1',
          email:        $('eu-email').value.trim() || null,
          phone:        $('eu-phone').value.trim() || null,
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

    const roleBadge = user.role === 'admin'
      ? `<span class="dp-badge dp-badge--admin">Admin</span>`
      : `<span class="dp-badge dp-badge--member">Member</span>`;

    container.innerHTML = `
      <div class="dp-section-header">
        <h2 class="dp-section-title">My Account</h2>
      </div>
      <div class="dp-account-layout">
        <div class="dp-card dp-account-profile">
          <div class="dp-account-avatar">${esc((user.display_name || user.username || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2))}</div>
          <h3 class="dp-account-name">${esc(user.display_name)}</h3>
          <p class="dp-account-username">@${esc(user.username)}</p>
          ${roleBadge}
          <div class="dp-account-details">
            ${user.department ? `<div class="dp-account-detail-row"><span class="dp-text-muted">Department</span><span>${esc(user.department)}</span></div>` : ''}
            ${user.email ? `<div class="dp-account-detail-row"><span class="dp-text-muted">Email</span><a href="mailto:${esc(user.email)}">${esc(user.email)}</a></div>` : ''}
            ${user.phone ? `<div class="dp-account-detail-row"><span class="dp-text-muted">Phone</span><a href="tel:${esc(user.phone)}">${esc(user.phone)}</a></div>` : ''}
            <div class="dp-account-detail-row"><span class="dp-text-muted">Member since</span><span>${esc(fmtDate(user.created_at))}</span></div>
          </div>
        </div>
        <div class="dp-card dp-account-password">
          <h3 class="dp-card-title">Change Password</h3>
          <div class="dp-form">
            <div class="dp-form-row">
              <label class="dp-label">Current Password <span class="dp-required">*</span></label>
              <input id="pw-current" class="dp-input" type="password" autocomplete="current-password" />
            </div>
            <div class="dp-form-row">
              <label class="dp-label">New Password <span class="dp-required">*</span></label>
              <input id="pw-new" class="dp-input" type="password" autocomplete="new-password" placeholder="Min 6 characters" />
            </div>
            <div class="dp-form-row">
              <label class="dp-label">Confirm New Password <span class="dp-required">*</span></label>
              <input id="pw-confirm" class="dp-input" type="password" autocomplete="new-password" />
            </div>
            <button class="dp-btn dp-btn--primary" onclick="DP.changePassword()">Update Password</button>
          </div>
        </div>
      </div>
    `;
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

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
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
    if (token && currentUser) {
      showApp();
    }
  }

  // ── Dev Rules & Version History ────────────────────────────────────────────
  async function loadDevRules() {
    const container = $('dp-devrules-content');
    if (!container) return;
    const data = await api('GET', 'versions');
    renderDevRules(data?.versions || []);
  }

  function renderDevRules(versions) {
    const container = $('dp-devrules-content');
    if (!container) return;
    const latest = versions[0];
    const isAdmin = currentUser?.role === 'admin';

    const typeLabel = { feature: 'Feature', bugfix: 'Bugfix', initial: 'Initial' };

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

      <div class="dp-version-rules">
        <h3>Version Format: <code style="font-size:16px;color:var(--accent)">aa.bbb.cc</code></h3>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">aa</div>
          <div class="dp-version-rule-desc"><strong>Major version</strong> — Set manually by the project owner. Represents a major milestone or full redesign.</div>
        </div>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">bbb</div>
          <div class="dp-version-rule-desc"><strong>Feature version</strong> — Incremented when a new feature is added or an existing feature is significantly changed.</div>
        </div>
        <div class="dp-version-rule-row">
          <div class="dp-version-rule-seg">cc</div>
          <div class="dp-version-rule-desc"><strong>Fix version</strong> — Incremented for bug fixes and hotfixes. Resets to 00 on each feature increment.</div>
        </div>
      </div>

      <div class="dp-card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:14px;font-weight:700">Version History</h3>
          <span style="font-size:12px;color:var(--text-3)">${versions.length} entries</span>
        </div>
        ${versions.length === 0
          ? `<div class="dp-empty-state"><p>No version entries yet.</p></div>`
          : `<table class="dp-vh-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Date</th>
                  ${isAdmin ? '<th></th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${versions.map(v => `
                  <tr>
                    <td><span class="dp-vh-version">v${esc(v.version)}</span></td>
                    <td><span class="dp-vh-type dp-vh-type--${esc(v.type)}">${esc(typeLabel[v.type] || v.type)}</span></td>
                    <td style="color:var(--text-2)">${esc(v.description || '—')}</td>
                    <td style="color:var(--text-3);white-space:nowrap">${fmtDate(v.released_at)}</td>
                    ${isAdmin ? `<td><button class="dp-btn dp-btn--ghost dp-btn--sm" style="color:var(--red)" onclick="DP.deleteVersion(${v.id})">Delete</button></td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    `;
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

  async function deleteVersion(id) {
    if (!confirm('Delete this version entry?')) return;
    const data = await api('DELETE', `versions?id=${id}`);
    if (!data) return;
    showToast('Version entry deleted.', 'success');
    loadDevRules();
    // Refresh footer
    api('GET', 'versions').then(d => {
      const v = d?.versions?.[0];
      if (v && $('dp-version-display')) $('dp-version-display').textContent = `v${v.version}`;
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
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
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
    createPost,
    editPost,
    deletePost,
    viewPost,
    createContact,
    editContact,
    deleteContact,
    createUser,
    editUser,
    deleteUser,
    changePassword,
    prevMonth,
    nextMonth,
    addVersion,
    deleteVersion,
    _handleFileSelect,
    _removeKeptFile: () => {},
  };
})();

document.addEventListener('DOMContentLoaded', () => DP.init());
