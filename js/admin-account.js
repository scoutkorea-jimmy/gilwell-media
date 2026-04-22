/**
 * Gilwell Media · Admin Account Management module (Phase 3)
 *
 * Handles the two new left-sidebar panels introduced in Phase 3:
 *   - #panel-account-me       profile + password change (any authenticated user)
 *   - #panel-account-users    owner-only: user CRUD, kill switch, permission modal
 *
 * Runs alongside admin-v3.js and assumes:
 *   window.GW.getToken()   current bearer token
 *   window.GW.showToast()  toast helper
 *   window.V3.showPanel()  panel navigation
 *
 * Split into its own file so admin-v3.js (9.5k lines) doesn't grow further.
 */
(function () {
  'use strict';

  var GW = window.GW || {};
  var V3 = window.V3 || {};
  var $ = function (id) { return document.getElementById(id); };
  var _state = {
    me: null,                    // current session user (/users/me response)
    users: [],                   // list
    presets: [],                 // preset catalog
    menus: [],                   // menu groups from server
    menuSlugs: [],               // flat slug list
    showDeleted: false,
    editingUserId: null,         // null when creating
    permissionTarget: null,      // either userId or 'new' for draft
    draftPermissions: null,      // used during create (before user exists)
  };

  /* ── Fetch helper ─────────────────────────────────────────── */
  // Authentication rides on the HttpOnly admin_token cookie (sent
  // automatically with credentials: 'same-origin'). GW.getToken returns the
  // 'admin_session' flag string ("1"), NOT a bearer JWT — do not set it as
  // Authorization header, or the server rejects the stringified flag as a
  // malformed token. This was the root cause of 내 계정/사용자 관리 panels
  // rendering empty after Phase 3 deploy.
  function _api(path, opts) {
    opts = opts || {};
    var headers = new Headers(opts.headers || {});
    if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) {
            var err = new Error((data && data.error) || ('HTTP ' + res.status));
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
  }

  function _toast(msg, type, dur) {
    if (GW.showToast) GW.showToast(msg, type || 'info', dur || 4000);
  }

  function _kstDate(iso) {
    if (!iso) return '—';
    // D1 'datetime("now")' returns UTC string like "2026-04-22 00:30:00".
    var norm = String(iso).replace(' ', 'T') + 'Z';
    var d = new Date(norm);
    if (isNaN(d.getTime())) return iso;
    var y = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    return y.replace(/\. /g, '-').replace(/\./g, '').replace(/\s+/, ' ').trim() + ' KST';
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Session load / owner nav toggle ─────────────────────── */
  function _loadMe() {
    return _api('/api/admin/users/me').then(function (data) {
      _state.me = data && data.user ? data.user : null;
      _state.menus = (data && data.menus) || _state.menus;
      _state.menuSlugs = (data && data.menu_slugs) || _state.menuSlugs;
      _syncOwnerOnlyNav();
      _renderMyProfile();
      _markSessionLoaded();
      return _state.me;
    }).catch(function () {
      _state.me = null;
      _syncOwnerOnlyNav();
      _markSessionLoaded();
      return null;
    });
  }

  // Sidebar items with data-perm-slug / data-owner-only are hidden by CSS
  // until this flag is set — guarantees members never see owner-only or
  // un-permitted items even if _loadMe is slow. Run on every _loadMe
  // resolution (success OR failure) so the sidebar always unlocks.
  function _markSessionLoaded() {
    document.body.classList.add('admin-session-loaded');
  }

  function _isOwnerSession() {
    var me = _state.me;
    if (!me) return false;
    if (me.role === 'owner') return true;
    // Phase 2 legacy session (no admin_users row) treats as owner
    return false;
  }

  function _syncOwnerOnlyNav() {
    var nodes = document.querySelectorAll('[data-owner-only="1"]');
    var showOwner = _state.me ? (_state.me.role === 'owner') : false;
    // Legacy session: /users/me returned legacy_session:true with role='owner' synthetic
    nodes.forEach(function (n) {
      if (showOwner) n.removeAttribute('hidden');
      else n.setAttribute('hidden', '');
    });
    _syncPermissionNav();
  }

  // Elements tagged with data-perm-slug/data-perm-action are hidden unless
  // the session user has the `<action>:<slug>` token. Any role that is not
  // explicitly `member` is treated as owner-privileged (owner, legacy
  // `full`, future admin roles) — defensive, never cuts owners off from
  // their own menus. When `me` is null (/users/me failed), isOwner stays
  // false and permSet is empty → default-deny hides everything.
  // CSS already hides these elements until `body.admin-session-loaded` is
  // set, so there's no pre-session flash — this function runs once the
  // class is flipped and finalizes the visibility state.
  function _syncPermissionNav() {
    var me = _state.me;
    var isOwner = !!(me && me.role && me.role !== 'member');
    var perms = (me && me.permissions && me.permissions.permissions) || [];
    var permSet = new Set(perms);
    document.querySelectorAll('[data-perm-slug]').forEach(function (n) {
      var slug = n.getAttribute('data-perm-slug');
      var action = n.getAttribute('data-perm-action') || 'view';
      var allow = isOwner || permSet.has(action + ':' + slug);
      if (allow) { n.removeAttribute('hidden'); n.style.display = ''; }
      else { n.setAttribute('hidden', ''); n.style.display = 'none'; }
    });
    _collapseEmptyNavSections();
  }

  // After per-item gating, hide any sidebar section whose visible children
  // count is zero. The section label ("분석", "콘텐츠"…) stays with the
  // section wrapper, so hiding the wrapper is enough.
  function _collapseEmptyNavSections() {
    document.querySelectorAll('#v3-nav .v3-nav-section').forEach(function (sec) {
      var items = sec.querySelectorAll('.v3-nav-item');
      if (!items.length) return;
      var anyVisible = false;
      items.forEach(function (it) {
        if (!it.hasAttribute('hidden') && it.style.display !== 'none') anyVisible = true;
      });
      if (anyVisible) {
        sec.removeAttribute('hidden');
        sec.style.display = '';
      } else {
        sec.setAttribute('hidden', '');
        sec.style.display = 'none';
      }
    });
  }

  /* ── 내 계정 패널 ─────────────────────────────────────────── */
  function _renderMyProfile() {
    var me = _state.me;
    if (!me) return;
    var role = me.role === 'owner' ? '오너 (owner)' : '멤버 (member)';
    $('account-me-username') && ($('account-me-username').textContent = me.username || '—');
    $('account-me-display-name') && ($('account-me-display-name').textContent = me.display_name || '—');
    $('account-me-role') && ($('account-me-role').textContent = role);
    $('account-me-editor-code') && ($('account-me-editor-code').textContent = me.editor_code || '—');
    $('account-me-ai-limit') && ($('account-me-ai-limit').textContent =
      me.role === 'owner' ? '무제한' :
      (me.ai_daily_limit == null ? '기본값 (10회/일)' : (me.ai_daily_limit + '회/일')));
    $('account-me-last-login') && ($('account-me-last-login').textContent = _kstDate(me.last_login_at));
    _renderMyUsernameCard();
  }

  function _renderMyUsernameCard() {
    var me = _state.me;
    var card = $('account-me-username-card');
    var state = $('account-me-username-state');
    var input = $('account-me-new-username');
    var btn = $('account-me-username-save-btn');
    if (!card || !me) return;
    if (me.role === 'owner') {
      if (state) { state.textContent = '오너 계정 (여기서는 변경 불가)'; state.style.color = ''; }
      if (input) { input.disabled = true; input.value = ''; input.placeholder = '사용자 관리에서 본인 계정을 편집하세요'; }
      if (btn) btn.disabled = true;
      return;
    }
    if (me.member_self_rename_used) {
      if (state) { state.textContent = '이미 1회 소진 · 오너에게 요청하세요'; state.style.color = '#b45309'; }
      if (input) { input.disabled = true; input.value = ''; input.placeholder = '이미 아이디를 변경했습니다'; }
      if (btn) btn.disabled = true;
    } else {
      if (state) { state.textContent = '1회 남음'; state.style.color = '#15803d'; }
      if (input) { input.disabled = false; input.placeholder = '새 아이디'; }
      if (btn) btn.disabled = false;
    }
  }

  function _bindMyUsernameForm() {
    var form = $('account-me-username-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var next = String($('account-me-new-username').value || '').trim().toLowerCase();
      var status = $('account-me-username-status');
      if (!next) { _toast('새 아이디를 입력해주세요', 'error'); return; }
      if (!/^[a-z0-9_]{3,32}$/.test(next)) {
        _toast('영문 소문자·숫자·_ · 3~32자', 'error'); return;
      }
      if (_state.me && next === _state.me.username) {
        _toast('현재 아이디와 다른 값을 입력해주세요', 'error'); return;
      }
      if (!confirm('아이디를 "' + next + '"로 변경합니다. 멤버 계정은 1회만 가능합니다. 계속할까요?')) return;
      status.textContent = '변경 중…';
      _api('/api/admin/users/me/username', {
        method: 'PUT', body: JSON.stringify({ username: next }),
      }).then(function (data) {
        status.textContent = '';
        _toast('아이디가 변경되었습니다.', 'success');
        _state.me = (data && data.user) || _state.me;
        _renderMyProfile();
        form.reset();
      }).catch(function (err) {
        status.textContent = '';
        _toast((err && err.message) || '변경 실패', 'error');
      });
    });
  }

  function _bindMyPasswordForm() {
    var form = $('account-me-password-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var cur = $('account-me-current-password').value;
      var np = $('account-me-new-password').value;
      var nc = $('account-me-new-password-confirm').value;
      var status = $('account-me-password-status');
      if (!cur || !np || !nc) { _toast('모든 필드를 입력해주세요', 'error'); return; }
      if (np !== nc) { _toast('새 비밀번호가 일치하지 않습니다', 'error'); return; }
      if (np.length < 8) { _toast('새 비밀번호는 최소 8자 이상', 'error'); return; }
      if (np === cur) { _toast('현재 비밀번호와 다른 값으로 설정하세요', 'error'); return; }
      status.textContent = '저장 중…';
      _api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur, newPassword: np, confirmPassword: nc }),
      }).then(function () {
        status.textContent = '변경 완료';
        _toast('비밀번호가 변경되었습니다. 다른 기기 세션은 종료됩니다.', 'success');
        form.reset();
      }).catch(function (err) {
        status.textContent = '';
        _toast(err.message || '비밀번호 변경 실패', 'error');
      });
    });
  }

  /* ── 사용자 관리 패널 ─────────────────────────────────────── */
  function _loadUsers() {
    var tbody = $('account-users-table');
    if (tbody) tbody.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    return Promise.all([
      _api('/api/admin/users'),
      _api('/api/admin/presets'),
      _api('/api/admin/publish-kill-switch'),
    ]).then(function (arr) {
      _state.users = (arr[0] && arr[0].users) || [];
      _state.menus = (arr[0] && arr[0].menus) || _state.menus;
      _state.menuSlugs = (arr[0] && arr[0].menu_slugs) || _state.menuSlugs;
      _state.presets = (arr[1] && arr[1].presets) || [];
      _renderKillSwitch(arr[2]);
      _renderUsersTable();
    }).catch(function (err) {
      if (tbody) tbody.innerHTML = '<div class="v3-inline-meta" style="color:#b91c1c;">로드 실패: ' + _esc(err.message) + '</div>';
    });
  }

  function _renderKillSwitch(data) {
    var on = !!(data && data.on);
    var toggle = $('account-kill-switch-toggle');
    var stateLabel = $('account-kill-switch-state');
    if (toggle) toggle.checked = on;
    if (stateLabel) {
      stateLabel.textContent = on ? '현재: 활성 (비오너 발행 차단)' : '현재: 해제 (정상 운영)';
      stateLabel.style.color = on ? '#b91c1c' : '';
    }
  }

  function _renderUsersTable() {
    var host = $('account-users-table');
    if (!host) return;
    var rows = _state.users.filter(function (u) {
      return _state.showDeleted || u.status !== 'deleted';
    });
    $('account-users-count') && ($('account-users-count').textContent =
      '총 ' + rows.length + '명' + (_state.showDeleted ? ' (삭제 포함)' : ''));
    if (!rows.length) {
      host.innerHTML = '<div class="v3-inline-meta" style="padding:16px;">표시할 사용자가 없습니다.</div>';
      return;
    }
    var html = '<table class="v3-table v3-account-table">' +
      '<thead><tr>' +
      '<th>아이디</th><th>표시 이름</th><th>역할</th><th>편집자 코드</th>' +
      '<th>상태</th><th>최근 로그인</th><th style="width:220px;">관리</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (u) {
      var roleBadge = u.role === 'owner'
        ? '<span class="v3-account-role-badge v3-account-role-owner">OWNER</span>'
        : '<span class="v3-account-role-badge v3-account-role-member">MEMBER</span>';
      var statusBadge = '<span class="v3-account-status-badge v3-account-status-' + _esc(u.status) + '">' +
        (u.status === 'active' ? '활성' : u.status === 'disabled' ? '비활성' : '삭제됨') + '</span>';
      var actions = '';
      if (u.status === 'deleted') {
        actions = '<button class="v3-btn v3-btn-outline v3-btn-sm" data-action="restore" data-id="' + u.id + '">복구</button>';
      } else {
        actions =
          '<button class="v3-btn v3-btn-ghost v3-btn-sm" data-action="edit" data-id="' + u.id + '">편집</button>' +
          '<button class="v3-btn v3-btn-ghost v3-btn-sm" data-action="permissions" data-id="' + u.id + '">권한</button>';
        if (u.role !== 'owner') {
          actions +=
            '<button class="v3-btn v3-btn-ghost v3-btn-sm" data-action="reset-password" data-id="' + u.id + '">비번 리셋</button>' +
            '<button class="v3-btn v3-btn-danger v3-btn-sm" data-action="delete" data-id="' + u.id + '">삭제</button>';
        }
      }
      html +=
        '<tr>' +
        '<td><code>' + _esc(u.username) + '</code>' +
          (u.must_change_password ? ' <span class="v3-account-flag">임시비번</span>' : '') + '</td>' +
        '<td>' + _esc(u.display_name) + '</td>' +
        '<td>' + roleBadge + '</td>' +
        '<td>' + (u.editor_code ? '<code>' + _esc(u.editor_code) + '</code>' : '—') + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td><span class="v3-inline-meta">' + _esc(_kstDate(u.last_login_at)) + '</span></td>' +
        '<td style="white-space:nowrap;">' + actions + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    host.innerHTML = html;
  }

  function _findUser(id) {
    return _state.users.find(function (u) { return String(u.id) === String(id); });
  }

  /* ── 사용자 모달 (추가/편집) ─────────────────────────────── */
  function _openUserModal(userId) {
    _state.editingUserId = userId || null;
    _state.draftPermissions = null;
    var modal = $('account-user-modal');
    var title = $('account-user-modal-title');
    if (!modal || !title) {
      _toast('사용자 모달이 로드되지 않았습니다. 페이지를 새로고침하세요.', 'error');
      return;
    }
    if (userId) {
      var u = _findUser(userId);
      if (!u) { _toast('사용자를 찾을 수 없습니다', 'error'); return; }
      title.textContent = '사용자 편집 · ' + u.username;
      $('account-user-username').value = u.username;
      // Owner (of the console) may change any user's username — including the
      // lone owner account. Keep editable unless 타깃이 owner인 경우 너무 쉽게 실수
      // 하지 않도록 별도 확인 없이 저장 시 409 처리에 의존.
      $('account-user-username').disabled = false;
      $('account-user-display-name').value = u.display_name || '';
      $('account-user-password').value = '';
      $('account-user-password').placeholder = '(비워두면 기존 비밀번호 유지)';
      $('account-user-password').disabled = true;
      $('account-user-editor-code').value = u.editor_code || '';
      $('account-user-ai-limit').value = u.ai_daily_limit == null ? '' : u.ai_daily_limit;
      $('account-user-status').value = u.status === 'disabled' ? 'disabled' : 'active';
      $('account-user-status').disabled = u.role === 'owner';
      $('account-user-must-change').checked = !!u.must_change_password;
      // Show 아이디 변경권 재부여 checkbox only for non-owner targets.
      var resetRow = $('account-user-reset-rename-row');
      var resetCb = $('account-user-reset-rename');
      var renameState = $('account-user-rename-state');
      if (resetRow && resetCb && renameState) {
        if (u.role === 'owner') {
          resetRow.hidden = true;
        } else {
          resetRow.hidden = false;
          resetCb.checked = false;
          renameState.textContent = '(현재: ' + (u.member_self_rename_used ? '이미 소진' : '미사용') + ')';
        }
      }
      _state.draftPermissions = u.permissions ? {
        access_admin: !!u.permissions.access_admin,
        permissions: (u.permissions.permissions || []).slice(),
      } : { access_admin: true, permissions: [] };
    } else {
      title.textContent = '사용자 추가';
      $('account-user-username').value = '';
      $('account-user-username').disabled = false;
      $('account-user-display-name').value = '';
      $('account-user-password').value = '';
      $('account-user-password').placeholder = '';
      $('account-user-password').disabled = false;
      $('account-user-editor-code').value = '';
      $('account-user-ai-limit').value = '';
      $('account-user-status').value = 'active';
      $('account-user-status').disabled = false;
      $('account-user-must-change').checked = true;
      var createResetRow = $('account-user-reset-rename-row');
      if (createResetRow) createResetRow.hidden = true;
      _state.draftPermissions = { access_admin: true, permissions: [] };
    }
    $('account-user-form-status').textContent = '';
    modal.style.display = 'flex';
  }

  function _closeModal(id) { var m = $(id); if (m) m.style.display = 'none'; }

  function _submitUserForm(e) {
    e.preventDefault();
    var id = _state.editingUserId;
    var username = $('account-user-username').value.trim().toLowerCase();
    var displayName = $('account-user-display-name').value.trim();
    var password = $('account-user-password').value;
    var editorCode = $('account-user-editor-code').value.trim() || null;
    var aiLimitRaw = $('account-user-ai-limit').value.trim();
    var aiLimit = aiLimitRaw === '' ? null : Number(aiLimitRaw);
    var status = $('account-user-status').value;
    var mustChange = $('account-user-must-change').checked;
    var statusEl = $('account-user-form-status');

    if (id) {
      var target = _findUser(id);
      var payload = {
        display_name: displayName,
        editor_code: editorCode,
        ai_daily_limit: aiLimit,
        status: status,
        must_change_password: mustChange,
      };
      // Owner may rename any account — send only if changed from current.
      if (target && username && username !== target.username) {
        payload.username = username;
      }
      // Reset rename quota if the owner flipped the checkbox.
      var resetCb = $('account-user-reset-rename');
      if (resetCb && resetCb.checked && target && target.role !== 'owner') {
        payload.reset_member_self_rename = true;
      }
      if (_state.draftPermissions) payload.permissions = _state.draftPermissions;
      statusEl.textContent = '저장 중…';
      _api('/api/admin/users/' + id, { method: 'PUT', body: JSON.stringify(payload) })
        .then(function () { statusEl.textContent = ''; _closeModal('account-user-modal'); _toast('저장되었습니다', 'success'); _loadUsers(); })
        .catch(function (err) { statusEl.textContent = ''; _toast(err.message || '저장 실패', 'error'); });
    } else {
      if (!username) { _toast('아이디를 입력해주세요', 'error'); return; }
      if (!displayName) { _toast('표시 이름을 입력해주세요', 'error'); return; }
      if (!password || password.length < 8) { _toast('초기 비밀번호는 8자 이상이어야 합니다', 'error'); return; }
      var createPayload = {
        username: username,
        display_name: displayName,
        password: password,
        editor_code: editorCode,
        ai_daily_limit: aiLimit,
        must_change_password: mustChange,
        permissions: _state.draftPermissions || { access_admin: true, permissions: [] },
      };
      statusEl.textContent = '생성 중…';
      _api('/api/admin/users', { method: 'POST', body: JSON.stringify(createPayload) })
        .then(function () { statusEl.textContent = ''; _closeModal('account-user-modal'); _toast('사용자가 생성되었습니다', 'success'); _loadUsers(); })
        .catch(function (err) { statusEl.textContent = ''; _toast(err.message || '생성 실패', 'error'); });
    }
  }

  /* ── 권한 모달 ─────────────────────────────────────────── */
  function _openPermissionModal(targetId) {
    _state.permissionTarget = targetId;
    var subject = $('account-permission-subject');
    var body = $('account-permission-grid');
    var currentPerms = null;

    if (targetId === 'new') {
      subject.textContent = '(신규 사용자 · 저장 전)';
      currentPerms = _state.draftPermissions || { access_admin: true, permissions: [] };
    } else {
      var u = _findUser(targetId);
      if (!u) { _toast('사용자를 찾을 수 없습니다', 'error'); return; }
      subject.textContent = '· ' + u.username + ' (' + (u.display_name || '') + ')';
      currentPerms = u.permissions ? {
        access_admin: !!u.permissions.access_admin,
        permissions: (u.permissions.permissions || []).slice(),
      } : { access_admin: true, permissions: [] };
    }

    $('account-permission-access-admin').checked = !!currentPerms.access_admin;
    _renderPermissionGrid(currentPerms.permissions);
    _renderPresetOptions();
    $('account-permission-status').textContent = '';
    $('account-permission-modal').style.display = 'flex';
  }

  function _renderPermissionGrid(permArray) {
    var host = $('account-permission-grid');
    var set = new Set(permArray || []);
    var html = '';
    (_state.menus || []).forEach(function (group) {
      html += '<div class="v3-perm-group">' +
        '<div class="v3-perm-group-title">' + _esc(group.group) + '</div>' +
        '<div class="v3-perm-group-rows">';
      group.items.forEach(function (item) {
        html += '<div class="v3-perm-row">' +
          '<div class="v3-perm-row-label">' + _esc(item.label) +
            ' <span class="v3-inline-meta" style="margin-left:6px;">' + _esc(item.slug) + '</span></div>' +
          '<div class="v3-perm-row-toggles">';
        item.actions.forEach(function (action) {
          var key = action + ':' + item.slug;
          var checked = set.has(key) ? 'checked' : '';
          html += '<label class="v3-perm-toggle">' +
            '<input type="checkbox" data-perm="' + _esc(key) + '" ' + checked + ' />' +
            '<span>' + (action === 'view' ? '보기' : '쓰기') + '</span>' +
            '</label>';
        });
        html += '</div></div>';
      });
      html += '</div></div>';
    });
    host.innerHTML = html;
  }

  function _renderPresetOptions() {
    var sel = $('account-permission-preset-select');
    if (!sel) return;
    var opts = ['<option value="">— 프리셋 선택 —</option>'];
    (_state.presets || []).forEach(function (p) {
      opts.push('<option value="' + _esc(p.slug) + '">' +
        (p.is_builtin ? '★ ' : '') + _esc(p.name) + ' (' + _esc(p.slug) + ')</option>');
    });
    sel.innerHTML = opts.join('');
  }

  function _collectPermissionsFromGrid() {
    var grid = $('account-permission-grid');
    var boxes = grid.querySelectorAll('input[data-perm]');
    var out = [];
    boxes.forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-perm')); });
    return {
      access_admin: !!$('account-permission-access-admin').checked,
      permissions: out,
    };
  }

  function _applyPreset() {
    var sel = $('account-permission-preset-select');
    var slug = sel.value;
    if (!slug) { _toast('프리셋을 선택해주세요', 'error'); return; }
    var preset = _state.presets.find(function (p) { return p.slug === slug; });
    if (!preset) return;
    $('account-permission-access-admin').checked = !!preset.permissions.access_admin;
    _renderPermissionGrid(preset.permissions.permissions || []);
    _toast('"' + preset.name + '" 프리셋이 적용되었습니다. 저장 전까지 반영되지 않습니다.', 'info', 3000);
  }

  function _clearPermissions() {
    _renderPermissionGrid([]);
    _toast('모든 체크 해제', 'info', 2000);
  }

  function _savePermissions() {
    var target = _state.permissionTarget;
    var perms = _collectPermissionsFromGrid();
    var status = $('account-permission-status');

    if (target === 'new') {
      _state.draftPermissions = perms;
      _closeModal('account-permission-modal');
      _toast('권한이 임시 저장되었습니다. 사용자 저장 시 확정됩니다.', 'info', 3000);
      return;
    }

    status.textContent = '저장 중…';
    _api('/api/admin/users/' + target, {
      method: 'PUT',
      body: JSON.stringify({ permissions: perms }),
    }).then(function () {
      status.textContent = '';
      _closeModal('account-permission-modal');
      _toast('권한이 저장되었습니다', 'success');
      _loadUsers();
    }).catch(function (err) {
      status.textContent = '';
      _toast(err.message || '저장 실패', 'error');
    });
  }

  /* ── 임시 비밀번호 리셋 ─────────────────────────────────── */
  function _resetPassword(userId) {
    var u = _findUser(userId);
    if (!u) return;
    if (!confirm(u.username + ' 계정의 비밀번호를 재설정합니다. 해당 사용자의 모든 세션이 종료됩니다. 계속할까요?')) return;
    _api('/api/admin/users/' + userId + '/password-reset', { method: 'POST', body: JSON.stringify({}) })
      .then(function (data) {
        $('account-temp-password-user').textContent = u.username + ' · ' + u.display_name;
        $('account-temp-password-value').value = data.temp_password || '';
        $('account-temp-password-modal').style.display = 'flex';
        _loadUsers();
      })
      .catch(function (err) { _toast(err.message || '리셋 실패', 'error'); });
  }

  function _copyTempPassword() {
    var input = $('account-temp-password-value');
    input.select();
    input.setSelectionRange(0, 9999);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        _toast('비밀번호가 복사되었습니다', 'success', 2500);
      }).catch(function () {
        if (!ok) _toast('수동으로 복사해주세요', 'warn');
      });
    } else if (ok) {
      _toast('비밀번호가 복사되었습니다', 'success', 2500);
    } else {
      _toast('수동으로 복사해주세요', 'warn');
    }
  }

  /* ── 사용자 삭제 / 복구 ─────────────────────────────────── */
  function _deleteUser(userId) {
    var u = _findUser(userId);
    if (!u) return;
    var hard = confirm(
      u.username + ' 계정 삭제.\n\n' +
      '[확인] → 완전 삭제(복구 불가)\n' +
      '[취소] → 소프트 삭제(30일 복구 가능)\n\n' +
      '게시글은 어느 경우에도 유지됩니다.'
    );
    // "확인" = 완전 삭제 경로. 추가 confirm으로 사고 방지.
    if (hard) {
      if (!confirm('정말로 완전 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    }
    var url = '/api/admin/users/' + userId + (hard ? '?hard=1' : '');
    _api(url, { method: 'DELETE' })
      .then(function () { _toast(hard ? '완전 삭제되었습니다' : '삭제되었습니다 (30일 복구 가능)', 'success'); _loadUsers(); })
      .catch(function (err) { _toast(err.message || '삭제 실패', 'error'); });
  }

  function _restoreUser(userId) {
    _api('/api/admin/users/' + userId + '/restore', { method: 'POST' })
      .then(function () { _toast('복구되었습니다', 'success'); _loadUsers(); })
      .catch(function (err) { _toast(err.message || '복구 실패', 'error'); });
  }

  /* ── 킬 스위치 토글 ─────────────────────────────────────── */
  function _toggleKillSwitch(ev) {
    var next = !!ev.target.checked;
    if (next && !confirm('긴급 발행 차단을 켭니다. 오너가 아닌 모든 사용자의 공개 전환이 즉시 차단됩니다. 계속할까요?')) {
      ev.target.checked = false;
      return;
    }
    _api('/api/admin/publish-kill-switch', { method: 'PUT', body: JSON.stringify({ on: next }) })
      .then(function (data) {
        _renderKillSwitch(data);
        _toast(next ? '긴급 발행 차단이 활성화되었습니다.' : '긴급 발행 차단이 해제되었습니다.', next ? 'warn' : 'success', 4000);
      })
      .catch(function (err) {
        ev.target.checked = !next;
        _toast(err.message || '토글 실패', 'error');
      });
  }

  /* ── 프리셋 관리 패널 ─────────────────────────────────── */
  function _loadPresetsPanel() {
    var host = $('account-presets-list');
    if (host) host.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    // Menus are needed for the preset permission grid — piggyback on /users
    // to fetch both presets and the menu catalogue in two calls.
    return Promise.all([
      _api('/api/admin/presets'),
      _state.menus && _state.menus.length ? Promise.resolve({ menus: _state.menus, menu_slugs: _state.menuSlugs }) : _api('/api/admin/users'),
    ]).then(function (arr) {
      _state.presets = (arr[0] && arr[0].presets) || [];
      if (arr[1]) {
        _state.menus = arr[1].menus || _state.menus;
        _state.menuSlugs = arr[1].menu_slugs || _state.menuSlugs;
      }
      _renderPresetsList();
    }).catch(function (err) {
      if (host) host.innerHTML = '<div class="v3-inline-meta" style="color:#b91c1c;">로드 실패: ' + _esc(err.message) + '</div>';
    });
  }

  function _renderPresetsList() {
    var host = $('account-presets-list');
    if (!host) return;
    var rows = _state.presets || [];
    var count = $('account-presets-count');
    if (count) count.textContent = '총 ' + rows.length + '개 (빌트인 ' + rows.filter(function (p) { return p.is_builtin; }).length + ')';
    if (!rows.length) {
      host.innerHTML = '<div class="v3-inline-meta" style="padding:16px;">프리셋이 없습니다.</div>';
      return;
    }
    var html = '<table class="v3-table v3-account-table">' +
      '<thead><tr><th>구분</th><th>이름 (slug)</th><th>설명</th><th>권한 수</th><th>최근 수정</th><th style="width:160px;">관리</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var kind = p.is_builtin
        ? '<span class="v3-account-role-badge v3-account-role-owner">빌트인</span>'
        : '<span class="v3-account-role-badge v3-account-role-member">커스텀</span>';
      // Owner may edit any preset — even built-ins — to rebalance defaults.
      // Delete stays restricted for built-ins so migrations can always assume
      // the 3 canonical slugs exist.
      var actions =
        '<button class="v3-btn v3-btn-ghost v3-btn-sm" data-preset-action="edit" data-id="' + p.id + '">편집</button>' +
        (p.is_builtin
          ? '<span class="v3-inline-meta" style="margin-left:6px;">삭제 불가</span>'
          : '<button class="v3-btn v3-btn-danger v3-btn-sm" data-preset-action="delete" data-id="' + p.id + '">삭제</button>');
      var permCount = (p.permissions && p.permissions.permissions) ? p.permissions.permissions.length : 0;
      html +=
        '<tr>' +
        '<td>' + kind + '</td>' +
        '<td><strong>' + _esc(p.name) + '</strong><br><code>' + _esc(p.slug) + '</code></td>' +
        '<td class="v3-inline-meta" style="max-width:360px;">' + _esc(p.description || '—') + '</td>' +
        '<td>' + permCount + '</td>' +
        '<td><span class="v3-inline-meta">' + _esc(_kstDate(p.updated_at)) + '</span></td>' +
        '<td style="white-space:nowrap;">' + actions + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    host.innerHTML = html;
  }

  function _openPresetModal(presetId) {
    _state.editingPresetId = presetId || null;
    var modal = $('account-preset-modal');
    var title = $('account-preset-modal-title');
    var slugEl = $('account-preset-slug');
    var nameEl = $('account-preset-name');
    var descEl = $('account-preset-description');
    var accessEl = $('account-preset-access-admin');
    if (!modal) return;
    if (presetId) {
      var p = (_state.presets || []).find(function (x) { return String(x.id) === String(presetId); });
      if (!p) { _toast('프리셋을 찾을 수 없습니다', 'error'); return; }
      title.textContent = (p.is_builtin ? '빌트인 프리셋 편집 · ' : '프리셋 편집 · ') + p.name;
      slugEl.value = p.slug;
      slugEl.disabled = true;  // slug is immutable once seeded
      nameEl.value = p.name;
      descEl.value = p.description || '';
      accessEl.checked = !!(p.permissions && p.permissions.access_admin);
      _renderPresetGrid((p.permissions && p.permissions.permissions) || []);
    } else {
      title.textContent = '프리셋 추가';
      slugEl.value = '';
      slugEl.disabled = false;
      nameEl.value = '';
      descEl.value = '';
      accessEl.checked = true;
      _renderPresetGrid([]);
    }
    $('account-preset-status').textContent = '';
    modal.style.display = 'flex';
  }

  function _renderPresetGrid(permArray) {
    var host = $('account-preset-grid');
    var set = new Set(permArray || []);
    var html = '';
    (_state.menus || []).forEach(function (group) {
      html += '<div class="v3-perm-group">' +
        '<div class="v3-perm-group-title">' + _esc(group.group) + '</div>' +
        '<div class="v3-perm-group-rows">';
      group.items.forEach(function (item) {
        html += '<div class="v3-perm-row">' +
          '<div class="v3-perm-row-label">' + _esc(item.label) +
            ' <span class="v3-inline-meta" style="margin-left:6px;">' + _esc(item.slug) + '</span></div>' +
          '<div class="v3-perm-row-toggles">';
        item.actions.forEach(function (action) {
          var key = action + ':' + item.slug;
          var checked = set.has(key) ? 'checked' : '';
          html += '<label class="v3-perm-toggle">' +
            '<input type="checkbox" data-preset-perm="' + _esc(key) + '" ' + checked + ' />' +
            '<span>' + (action === 'view' ? '보기' : '쓰기') + '</span>' +
            '</label>';
        });
        html += '</div></div>';
      });
      html += '</div></div>';
    });
    host.innerHTML = html;
  }

  function _collectPresetPermissions() {
    var grid = $('account-preset-grid');
    var boxes = grid.querySelectorAll('input[data-preset-perm]');
    var out = [];
    boxes.forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-preset-perm')); });
    return {
      access_admin: !!$('account-preset-access-admin').checked,
      permissions: out,
    };
  }

  function _savePreset() {
    var id = _state.editingPresetId;
    var status = $('account-preset-status');
    var slug = String($('account-preset-slug').value || '').trim().toLowerCase();
    var name = String($('account-preset-name').value || '').trim();
    var description = String($('account-preset-description').value || '').trim();
    var perms = _collectPresetPermissions();

    if (!id) {
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) { _toast('slug는 영문·숫자·하이픈 2~40자', 'error'); return; }
    }
    if (!name) { _toast('이름을 입력해주세요', 'error'); return; }

    status.textContent = '저장 중…';
    var req = id
      ? _api('/api/admin/presets/' + id, { method: 'PUT', body: JSON.stringify({ name: name, description: description, permissions: perms }) })
      : _api('/api/admin/presets', { method: 'POST', body: JSON.stringify({ slug: slug, name: name, description: description, permissions: perms }) });
    req.then(function (data) {
      status.textContent = '';
      _closeModal('account-preset-modal');
      // Server reports how many existing members had their permissions
      // propagated from the old preset to the new one. Surface it so the
      // owner understands the scope of what just changed.
      var count = (data && typeof data.propagated_members === 'number') ? data.propagated_members : 0;
      if (count > 0) {
        _toast('프리셋 저장 완료 · ' + count + '명의 기존 멤버 권한 자동 반영', 'success', 5000);
      } else {
        _toast('프리셋이 저장되었습니다', 'success');
      }
      _loadPresetsPanel();
    }).catch(function (err) {
      status.textContent = '';
      _toast((err && err.message) || '저장 실패', 'error');
    });
  }

  function _deletePreset(id) {
    var p = (_state.presets || []).find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    if (p.is_builtin) { _toast('빌트인 프리셋은 삭제할 수 없습니다', 'error'); return; }
    if (!confirm('프리셋 "' + p.name + '"을(를) 삭제합니다. 이 프리셋을 이미 적용받은 사용자의 권한은 그대로 유지됩니다. 계속할까요?')) return;
    _api('/api/admin/presets/' + id, { method: 'DELETE' })
      .then(function () { _toast('삭제되었습니다', 'success'); _loadPresetsPanel(); })
      .catch(function (err) { _toast((err && err.message) || '삭제 실패', 'error'); });
  }

  /* ── 이벤트 바인딩 ─────────────────────────────────────── */
  function _bind() {
    _bindMyUsernameForm();
    _bindMyPasswordForm();

    var addBtn = $('account-users-add-btn');
    if (addBtn) addBtn.addEventListener('click', function () { _openUserModal(null); });
    var refreshBtn = $('account-users-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', _loadUsers);
    var showDeleted = $('account-users-show-deleted');
    if (showDeleted) showDeleted.addEventListener('change', function (e) {
      _state.showDeleted = !!e.target.checked;
      _renderUsersTable();
    });
    var killToggle = $('account-kill-switch-toggle');
    if (killToggle) killToggle.addEventListener('change', _toggleKillSwitch);

    // Table action delegation
    var tableHost = $('account-users-table');
    if (tableHost) {
      tableHost.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var action = btn.getAttribute('data-action');
        if (action === 'edit') _openUserModal(id);
        else if (action === 'permissions') _openPermissionModal(id);
        else if (action === 'reset-password') _resetPassword(id);
        else if (action === 'delete') _deleteUser(id);
        else if (action === 'restore') _restoreUser(id);
      });
    }

    // User form
    var userForm = $('account-user-form');
    if (userForm) userForm.addEventListener('submit', _submitUserForm);
    var openPermBtn = $('account-user-open-permissions-btn');
    if (openPermBtn) openPermBtn.addEventListener('click', function () {
      _openPermissionModal(_state.editingUserId || 'new');
    });

    // Permission modal
    var savePermBtn = $('account-permission-save-btn');
    if (savePermBtn) savePermBtn.addEventListener('click', _savePermissions);
    var applyPresetBtn = $('account-permission-apply-preset-btn');
    if (applyPresetBtn) applyPresetBtn.addEventListener('click', _applyPreset);
    var clearBtn = $('account-permission-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', _clearPermissions);

    // Temp password modal
    var copyBtn = $('account-temp-password-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', _copyTempPassword);

    // Preset management panel
    var presetAddBtn = $('account-presets-add-btn');
    if (presetAddBtn) presetAddBtn.addEventListener('click', function () { _openPresetModal(null); });
    var presetRefreshBtn = $('account-presets-refresh-btn');
    if (presetRefreshBtn) presetRefreshBtn.addEventListener('click', _loadPresetsPanel);
    var presetListHost = $('account-presets-list');
    if (presetListHost) {
      presetListHost.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-preset-action]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var action = btn.getAttribute('data-preset-action');
        if (action === 'edit') _openPresetModal(id);
        else if (action === 'delete') _deletePreset(id);
      });
    }
    var presetSaveBtn = $('account-preset-save-btn');
    if (presetSaveBtn) presetSaveBtn.addEventListener('click', _savePreset);
    var presetClearBtn = $('account-preset-clear-btn');
    if (presetClearBtn) presetClearBtn.addEventListener('click', function () {
      _renderPresetGrid([]);
      _toast('모든 체크 해제', 'info', 2000);
    });

    // Global close delegation (×, [data-close], overlay click).
    // Guarded: click targets can be text nodes on rare occasions, and
    // .matches() is only defined on Element — a TypeError here would swallow
    // subsequent click listeners on the page via the document handler chain.
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || target.nodeType !== 1) return;
      try {
        if (target.matches('[data-close]')) {
          _closeModal(target.getAttribute('data-close'));
          return;
        }
      } catch (_) { /* safari older versions */ }
      if (target.classList && target.classList.contains('v3-overlay') &&
          (target.id === 'account-user-modal' || target.id === 'account-permission-modal' ||
           target.id === 'account-temp-password-modal' || target.id === 'account-preset-modal')) {
        _closeModal(target.id);
      }
    });
  }

  /* ── Panel show hooks ─────────────────────────────────── */
  function _observePanelShows() {
    // Use MutationObserver on .v3-panel class list so we can refresh data when
    // one of our panels becomes visible.
    var meP = $('panel-account-me');
    var uP = $('panel-account-users');
    var presetP = $('panel-account-presets');
    var targets = [meP, uP, presetP].filter(Boolean);
    if (!targets.length) return;
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName !== 'class') return;
        var el = m.target;
        if (el.classList.contains('active')) {
          if (el.id === 'panel-account-me') _loadMe();
          if (el.id === 'panel-account-users') _loadUsers();
          if (el.id === 'panel-account-presets') _loadPresetsPanel();
        }
      });
    });
    targets.forEach(function (t) { obs.observe(t, { attributes: true, attributeFilter: ['class'] }); });
  }

  /* ── Kick off once the admin app is visible ─────────────── */
  function _init() {
    _bind();
    _observePanelShows();
    // Defer session load until a token exists. admin-v3.js sets the token
    // either from verifySession on page load or after _doLogin.
    var poll = setInterval(function () {
      var token = GW.getToken && GW.getToken();
      var appVisible = document.getElementById('v3-app') && !document.getElementById('v3-app').hidden;
      if (token && appVisible) {
        clearInterval(poll);
        _loadMe();
      }
    }, 300);
    // Also give up after 30s so idle tabs don't poll forever.
    setTimeout(function () { clearInterval(poll); }, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // Expose a tiny API so admin-v3.js or DevTools can trigger refresh on demand.
  window.AccountAdmin = {
    refreshMe: _loadMe,
    refreshUsers: _loadUsers,
    openUserModal: _openUserModal,
    openPermissionModal: _openPermissionModal,
    // Returns the current session user's editor_code (or '' if none / not
    // loaded yet). admin-v3.js uses this to auto-fill the write form's byline.
    currentEditorCode: function () { return (_state.me && _state.me.editor_code) || ''; },
    currentMe: function () { return _state.me; },
  };
})();
