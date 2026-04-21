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
      return _state.me;
    }).catch(function () {
      _state.me = null;
      _syncOwnerOnlyNav();
      return null;
    });
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
    if (userId) {
      var u = _findUser(userId);
      if (!u) { _toast('사용자를 찾을 수 없습니다', 'error'); return; }
      title.textContent = '사용자 편집 · ' + u.username;
      $('account-user-username').value = u.username;
      $('account-user-username').disabled = true;
      $('account-user-display-name').value = u.display_name || '';
      $('account-user-password').value = '';
      $('account-user-password').placeholder = '(비워두면 기존 비밀번호 유지)';
      $('account-user-password').disabled = true;
      $('account-user-editor-code').value = u.editor_code || '';
      $('account-user-ai-limit').value = u.ai_daily_limit == null ? '' : u.ai_daily_limit;
      $('account-user-status').value = u.status === 'disabled' ? 'disabled' : 'active';
      $('account-user-status').disabled = u.role === 'owner';
      $('account-user-must-change').checked = !!u.must_change_password;
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
      var payload = {
        display_name: displayName,
        editor_code: editorCode,
        ai_daily_limit: aiLimit,
        status: status,
        must_change_password: mustChange,
      };
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

  /* ── 이벤트 바인딩 ─────────────────────────────────────── */
  function _bind() {
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

    // Global close delegation (×, [data-close], overlay click)
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (target.matches('[data-close]')) {
        _closeModal(target.getAttribute('data-close'));
      } else if (target.classList && target.classList.contains('v3-overlay') &&
                 (target.id === 'account-user-modal' || target.id === 'account-permission-modal' || target.id === 'account-temp-password-modal')) {
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
    var targets = [meP, uP].filter(Boolean);
    if (!targets.length) return;
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName !== 'class') return;
        var el = m.target;
        if (el.classList.contains('active')) {
          if (el.id === 'panel-account-me') _loadMe();
          if (el.id === 'panel-account-users') _loadUsers();
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
  };
})();
