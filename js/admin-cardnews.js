/**
 * Gilwell Media · Admin Card-News Controller
 *
 * 카드뉴스(자체 포함형 단일 HTML 앱) 관리 패널.
 * admin-v3.js 의 showPanel 이 패널 전환(.active 토글)을 담당하고, 이 파일은
 * panel-card-news 의 데이터·이벤트(목록/업로드/미리보기/삭제)만 담당한다.
 *
 *   목록   GET    /api/admin/card-news
 *   업로드 POST   /api/admin/card-news?title=<제목>   (body = 원문 HTML)
 *   삭제   DELETE /api/admin/card-news/:id
 *   본문   GET    /card-news/:id   (iframe, 완화 CSP — functions/card-news/[id].js)
 */
(function () {
  'use strict';

  var state = { items: [], loadedOnce: false, uploading: false };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, kind) {
    if (window.GW && typeof window.GW.showToast === 'function') {
      try { window.GW.showToast(msg, kind || 'success'); return; } catch (_) {}
    }
    if (kind === 'error') { try { alert(msg); } catch (_) {} }
    (kind === 'error' ? console.error : console.log)('[card-news]', msg);
  }

  function fmtSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // D1 created_at 은 datetime('now') = UTC. 관리자 표준 KST(YYYY-MM-DD HH:MM)로 표시.
  function fmtKst(utcStr) {
    if (!utcStr) return '';
    var iso = String(utcStr).replace(' ', 'T') + 'Z';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(utcStr);
    var kst = new Date(d.getTime() + 9 * 3600 * 1000);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return kst.getUTCFullYear() + '-' + p(kst.getUTCMonth() + 1) + '-' + p(kst.getUTCDate()) +
      ' ' + p(kst.getUTCHours()) + ':' + p(kst.getUTCMinutes());
  }

  // ── List ─────────────────────────────────────────────────────────────────
  function bootList() {
    state.loadedOnce = true;
    loadList();
  }

  function loadList() {
    var wrap = $('#cardnews-list-wrap');
    var meta = $('#cardnews-list-meta');
    if (wrap) wrap.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (meta) meta.textContent = '불러오는 중…';
    fetch('/api/admin/card-news', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.items = (data && Array.isArray(data.items)) ? data.items : [];
        renderList();
      })
      .catch(function (err) {
        if (wrap) wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</div></div>';
        if (meta) meta.textContent = '불러오기 실패';
        console.error('[card-news] loadList', err);
      });
  }

  function renderList() {
    var wrap = $('#cardnews-list-wrap');
    var meta = $('#cardnews-list-meta');
    if (!wrap) return;
    if (meta) meta.textContent = '총 ' + state.items.length + '개';
    if (!state.items.length) {
      wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">아직 업로드된 카드뉴스가 없습니다. 오른쪽 위 <strong>+ 카드뉴스 업로드</strong>로 추가하세요.</div></div>';
      return;
    }
    var rows = state.items.map(function (it) {
      var id = Number(it.id);
      return '' +
        '<div style="display:flex; align-items:center; gap:12px; padding:13px 4px; border-bottom:1px solid var(--gray-100,#ebebeb);">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:700; font-size:14px; color:var(--ink,#1f1f1f); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(it.title) + '</div>' +
            '<div style="font-size:12px; color:var(--gray-500,#8f8f8f); margin-top:3px;">' + escapeHtml(fmtKst(it.created_at)) + ' · ' + escapeHtml(fmtSize(it.size_bytes)) + '</div>' +
          '</div>' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" data-cn-view="' + id + '">보기</button>' +
          '<a class="v3-btn v3-btn-ghost v3-btn-sm" href="/card-news/' + id + '" target="_blank" rel="noopener">새 탭 ↗</a>' +
          '<button class="v3-btn v3-btn-danger v3-btn-sm" type="button" data-cn-del="' + id + '">삭제</button>' +
        '</div>';
    }).join('');
    wrap.innerHTML = rows;
  }

  function findItem(id) {
    id = Number(id);
    for (var i = 0; i < state.items.length; i += 1) {
      if (Number(state.items[i].id) === id) return state.items[i];
    }
    return null;
  }

  // ── Upload modal ───────────────────────────────────────────────────────────
  function openUpload() {
    var m = $('#cardnews-upload-modal');
    if (!m) return;
    var t = $('#cardnews-title-input'); if (t) t.value = '';
    var f = $('#cardnews-file-input'); if (f) f.value = '';
    var s = $('#cardnews-upload-status'); if (s) s.textContent = '';
    m.hidden = false;
    if (t) setTimeout(function () { t.focus(); }, 30);
  }
  function closeUpload() {
    if (state.uploading) return; // 업로드 중에는 닫기 차단
    var m = $('#cardnews-upload-modal');
    if (m) m.hidden = true;
  }

  function submitUpload() {
    if (state.uploading) return;
    var fileInput = $('#cardnews-file-input');
    var titleInput = $('#cardnews-title-input');
    var statusEl = $('#cardnews-upload-status');
    var submitBtn = $('#cardnews-upload-submit');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { if (statusEl) statusEl.textContent = 'HTML 파일을 선택해주세요.'; return; }
    if (file.size > 30 * 1024 * 1024) { if (statusEl) statusEl.textContent = '파일이 너무 큽니다 (최대 30MB).'; return; }
    var title = (titleInput && titleInput.value.trim()) || file.name.replace(/\.html?$/i, '');
    if (!title) { if (statusEl) statusEl.textContent = '제목을 입력해주세요.'; return; }

    state.uploading = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '업로드 중…'; }
    if (statusEl) statusEl.textContent = '업로드 중… (' + fmtSize(file.size) + ', 잠시 걸릴 수 있습니다)';

    fetch('/api/admin/card-news?title=' + encodeURIComponent(title), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'text/html' },
      body: file,
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) {
          var reason = (r.data && (r.data.reason || r.data.error)) || ('HTTP ' + r.status);
          throw new Error(reason);
        }
        state.uploading = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '업로드'; }
        var m = $('#cardnews-upload-modal'); if (m) m.hidden = true;
        toast('카드뉴스를 업로드했습니다.', 'success');
        loadList();
      })
      .catch(function (err) {
        state.uploading = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '업로드'; }
        if (statusEl) statusEl.textContent = '업로드 실패: ' + (err && err.message ? err.message : '알 수 없는 오류');
        console.error('[card-news] upload', err);
      });
  }

  // ── View modal (iframe) ────────────────────────────────────────────────────
  function openView(id) {
    var item = findItem(id);
    var m = $('#cardnews-view-modal');
    var frame = $('#cardnews-view-frame');
    var titleEl = $('#cardnews-view-title');
    var newtab = $('#cardnews-view-newtab');
    if (!m || !frame) return;
    var url = '/card-news/' + Number(id);
    if (titleEl) titleEl.textContent = item ? item.title : '미리보기';
    if (newtab) newtab.setAttribute('href', url);
    frame.setAttribute('src', url);
    m.hidden = false;
  }
  function closeView() {
    var m = $('#cardnews-view-modal');
    var frame = $('#cardnews-view-frame');
    if (frame) frame.setAttribute('src', 'about:blank'); // 앱 정지 + 메모리 해제
    if (m) m.hidden = true;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function deleteItem(id) {
    var item = findItem(id);
    var name = item ? item.title : ('#' + id);
    if (!window.confirm('"' + name + '" 카드뉴스를 삭제할까요?\n저장된 HTML과 목록 항목이 함께 제거되며 되돌릴 수 없습니다.')) return;
    fetch('/api/admin/card-news/' + Number(id), { method: 'DELETE', credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) {
          var reason = (r.data && (r.data.reason || r.data.error)) || ('HTTP ' + r.status);
          throw new Error(reason);
        }
        toast('카드뉴스를 삭제했습니다.', 'success');
        loadList();
      })
      .catch(function (err) {
        toast('삭제 실패: ' + (err && err.message ? err.message : '오류'), 'error');
        console.error('[card-news] delete', err);
      });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  function wireEvents() {
    var uploadBtn = $('#cardnews-upload-btn');
    if (uploadBtn) uploadBtn.addEventListener('click', openUpload);

    var bind = function (sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); };
    bind('#cardnews-upload-close', 'click', closeUpload);
    bind('#cardnews-upload-cancel', 'click', closeUpload);
    bind('#cardnews-upload-submit', 'click', submitUpload);
    bind('#cardnews-view-close', 'click', closeView);

    // 모달 backdrop 클릭으로 닫기
    var uploadModal = $('#cardnews-upload-modal');
    if (uploadModal) uploadModal.addEventListener('click', function (e) { if (e.target === uploadModal) closeUpload(); });
    var viewModal = $('#cardnews-view-modal');
    if (viewModal) viewModal.addEventListener('click', function (e) { if (e.target === viewModal) closeView(); });

    // ESC 로 모달 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var vm = $('#cardnews-view-modal'); if (vm && !vm.hidden) { closeView(); return; }
      var um = $('#cardnews-upload-modal'); if (um && !um.hidden) closeUpload();
    });

    // 목록 보기/삭제 (이벤트 위임)
    var wrap = $('#cardnews-list-wrap');
    if (wrap) wrap.addEventListener('click', function (e) {
      var v = e.target.closest('[data-cn-view]');
      if (v) { openView(v.getAttribute('data-cn-view')); return; }
      var d = e.target.closest('[data-cn-del]');
      if (d) { deleteItem(d.getAttribute('data-cn-del')); }
    });
  }

  // 패널 활성화 감지 → 최초 1회 로드 (memorabilia 와 동일 패턴)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-panel="card-news"]');
    if (!btn) return;
    setTimeout(function () { if (!state.loadedOnce) bootList(); }, 60);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireEvents);
  } else {
    wireEvents();
  }
})();
