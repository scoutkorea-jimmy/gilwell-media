/**
 * Gilwell Media · Admin Card-News Controller
 *
 * 카드뉴스 = 발행 기사 기반 주간 카드뉴스. 본문은 D1 card_news.data(tweaks JSON)에
 * 저장되고, 편집기(/card-news/:id?edit=1)는 admin 안에 인라인 iframe 으로 연다.
 * 카드 편집은 카드뉴스 data 만 바꾸며 원본 게시글은 건드리지 않는다.
 *
 *   목록    GET    /api/admin/card-news
 *   생성    POST   /api/admin/card-news?title=...
 *   삭제    DELETE /api/admin/card-news/:id
 *   저장    PUT    /api/admin/card-news/:id   (편집기 내부 '서버 저장' 버튼이 호출)
 *   편집기  /card-news/:id?edit=1  (iframe) · 미리보기 /card-news/:id?embed=1
 */
(function () {
  'use strict';

  var state = { items: [], loadedOnce: false, editingId: null };

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
  function fmtKst(utcStr) {
    if (!utcStr) return '';
    var d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return String(utcStr);
    var kst = new Date(d.getTime() + 9 * 3600 * 1000);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return kst.getUTCFullYear() + '-' + p(kst.getUTCMonth() + 1) + '-' + p(kst.getUTCDate()) +
      ' ' + p(kst.getUTCHours()) + ':' + p(kst.getUTCMinutes());
  }

  // ── List ────────────────────────────────────────────────────────────────
  function bootList() { state.loadedOnce = true; loadList(); }

  function loadList() {
    var wrap = $('#cardnews-list-wrap');
    var meta = $('#cardnews-list-meta');
    if (wrap) wrap.innerHTML = '<div class="v3-loading"><div class="v3-spinner"></div>로딩 중…</div>';
    if (meta) meta.textContent = '불러오는 중…';
    fetch('/api/admin/card-news', { credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) { state.items = (data && Array.isArray(data.items)) ? data.items : []; renderList(); })
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
      wrap.innerHTML = '<div class="v3-empty"><div class="v3-empty-text">아직 카드뉴스가 없습니다. 오른쪽 위 <strong>+ 새 카드뉴스</strong>로 시작하세요.</div></div>';
      return;
    }
    wrap.innerHTML = state.items.map(function (it) {
      var id = Number(it.id);
      return '' +
        '<div style="display:flex; align-items:center; gap:12px; padding:13px 4px; border-bottom:1px solid var(--gray-100,#ebebeb);">' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:700; font-size:14px; color:var(--ink,#1f1f1f); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(it.title) + '</div>' +
            '<div style="font-size:12px; color:var(--gray-500,#8f8f8f); margin-top:3px;">' + escapeHtml(fmtKst(it.updated_at || it.created_at)) + (it.has_data ? '' : ' · <span style="color:var(--color-fire,#ff5655);">데이터 없음</span>') + '</div>' +
          '</div>' +
          '<button class="v3-btn v3-btn-primary v3-btn-sm" type="button" data-cn-edit="' + id + '">편집</button>' +
          '<a class="v3-btn v3-btn-ghost v3-btn-sm" href="/card-news/' + id + '?embed=1" target="_blank" rel="noopener">미리보기 ↗</a>' +
          '<button class="v3-btn v3-btn-outline v3-btn-sm" type="button" data-cn-copy="' + id + '">복사</button>' +
          '<button class="v3-btn v3-btn-danger v3-btn-sm" type="button" data-cn-del="' + id + '">삭제</button>' +
        '</div>';
    }).join('');
  }

  function findItem(id) {
    id = Number(id);
    for (var i = 0; i < state.items.length; i += 1) if (Number(state.items[i].id) === id) return state.items[i];
    return null;
  }

  // ── Editor (inline iframe) ──────────────────────────────────────────────
  function openEditor(id, title) {
    id = Number(id);
    state.editingId = id;
    var listView = $('#cardnews-list-view');
    var editorView = $('#cardnews-editor-view');
    var frame = $('#cardnews-editor-frame');
    var titleEl = $('#cardnews-editor-title');
    var preview = $('#cardnews-editor-preview');
    var status = $('#cardnews-editor-status');
    if (titleEl) titleEl.textContent = title || ('카드뉴스 편집 #' + id);
    if (preview) preview.setAttribute('href', '/card-news/' + id + '?embed=1');
    if (status) status.textContent = '';
    if (frame) frame.setAttribute('src', '/card-news/' + id + '?edit=1');
    if (listView) listView.hidden = true;
    if (editorView) editorView.hidden = false;
  }
  function closeEditor() {
    state.editingId = null;
    var frame = $('#cardnews-editor-frame');
    if (frame) frame.setAttribute('src', 'about:blank');
    var editorView = $('#cardnews-editor-view');
    var listView = $('#cardnews-list-view');
    if (editorView) editorView.hidden = true;
    if (listView) listView.hidden = false;
    loadList();
  }
  function reloadEditor() {
    var frame = $('#cardnews-editor-frame');
    if (frame && state.editingId) frame.setAttribute('src', '/card-news/' + state.editingId + '?edit=1&t=' + Date.now());
  }

  // ── 표지 자동 계산 (발행일 → 주차/발행번호/제목) ─────────────────────────
  // 연 주차 = ISO week, 월중 주차 = ceil(일/7). 모달에서 수정 가능.
  function isoWeek(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = (date.getUTCDay() + 6) % 7;            // Mon=0
    date.setUTCDate(date.getUTCDate() - dayNum + 3);    // 그 주 목요일
    var firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var ftDay = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - ftDay + 3);
    return 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
  }
  var EN_MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function coverFromDate(ymd) {
    var d = new Date(ymd + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    var wom = Math.ceil(day / 7);
    var woy = isoWeek(d);
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return {
      issueDate: y + '.' + pad(m) + '.' + pad(day),
      weekLabel: m + '월 ' + wom + '주차',
      weekLabelEn: 'Week ' + wom + ' · ' + EN_MONTH[m - 1],
      issueNo: y + '년 ' + woy + '주차 BP 미디어 소식',
      title: 'BP미디어 카드뉴스 — ' + y + '.' + pad(m) + ' ' + wom + '주차',
    };
  }
  function todayYmd() {
    var d = new Date(Date.now() + 9 * 3600 * 1000); // KST
    return d.toISOString().slice(0, 10);
  }

  // ── Create (모달) / Copy / Delete ───────────────────────────────────────
  function openNewModal() {
    var m = document.getElementById('cardnews-new-modal');
    if (!m) return;
    var dateEl = document.getElementById('cardnews-new-date');
    if (dateEl) dateEl.value = todayYmd();
    applyCoverCalc(); // 오늘 기준 자동 채움
    var st = document.getElementById('cardnews-new-status'); if (st) st.textContent = '';
    m.hidden = false;
    if (dateEl) setTimeout(function () { dateEl.focus(); }, 30);
  }
  function closeNewModal() { var m = document.getElementById('cardnews-new-modal'); if (m) m.hidden = true; }
  function applyCoverCalc() {
    var dateEl = document.getElementById('cardnews-new-date');
    var c = dateEl && dateEl.value ? coverFromDate(dateEl.value) : null;
    if (!c) return;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
    set('cardnews-new-titleinput', c.title);
    set('cardnews-new-weeklabel', c.weekLabel);
    set('cardnews-new-weeklabelen', c.weekLabelEn);
    set('cardnews-new-issueno', c.issueNo);
  }
  function submitNew() {
    var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var dateEl = document.getElementById('cardnews-new-date');
    var cover = dateEl && dateEl.value ? coverFromDate(dateEl.value) : {};
    var body = {
      title: val('cardnews-new-titleinput'),
      cover: {
        weekLabel: val('cardnews-new-weeklabel'),
        weekLabelEn: val('cardnews-new-weeklabelen'),
        issueNo: val('cardnews-new-issueno'),
        issueDate: (cover && cover.issueDate) || '',
      },
    };
    var st = document.getElementById('cardnews-new-status'); if (st) st.textContent = '만드는 중…';
    fetch('/api/admin/card-news', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.d && (r.d.reason || r.d.error)) || ('HTTP ' + r.status));
        closeNewModal();
        toast('새 카드뉴스를 만들었습니다.', 'success');
        openEditor(r.d.id, r.d.title);
      })
      .catch(function (err) { if (st) st.textContent = '생성 실패: ' + (err && err.message ? err.message : '오류'); });
  }

  function copyItem(id) {
    var item = findItem(id);
    var name = item ? item.title : ('#' + id);
    if (!window.confirm('"' + name + '" 카드뉴스를 복사할까요?\n내용 전체가 복제된 새 카드뉴스가 만들어집니다.')) return;
    fetch('/api/admin/card-news', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Number(id) }) })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.d && (r.d.reason || r.d.error)) || ('HTTP ' + r.status));
        toast('카드뉴스를 복사했습니다.', 'success');
        openEditor(r.d.id, r.d.title);
      })
      .catch(function (err) { toast('복사 실패: ' + (err && err.message ? err.message : '오류'), 'error'); });
  }

  function deleteItem(id) {
    var item = findItem(id);
    var name = item ? item.title : ('#' + id);
    if (!window.confirm('"' + name + '" 카드뉴스를 삭제할까요?\n저장된 데이터와 목록 항목이 함께 제거되며 되돌릴 수 없습니다.')) return;
    fetch('/api/admin/card-news/' + Number(id), { method: 'DELETE', credentials: 'same-origin' })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, status: res.status, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.d && (r.d.reason || r.d.error)) || ('HTTP ' + r.status));
        toast('카드뉴스를 삭제했습니다.', 'success');
        loadList();
      })
      .catch(function (err) { toast('삭제 실패: ' + (err && err.message ? err.message : '오류'), 'error'); });
  }

  // ── Wiring ──────────────────────────────────────────────────────────────
  function wireEvents() {
    var bind = function (sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); };
    bind('#cardnews-new-btn', 'click', openNewModal);
    bind('#cardnews-new-close', 'click', closeNewModal);
    bind('#cardnews-new-cancel', 'click', closeNewModal);
    bind('#cardnews-new-submit', 'click', submitNew);
    bind('#cardnews-new-date', 'change', applyCoverCalc);
    var newModal = $('#cardnews-new-modal');
    if (newModal) newModal.addEventListener('click', function (e) { if (e.target === newModal) closeNewModal(); });
    bind('#cardnews-editor-back', 'click', closeEditor);
    bind('#cardnews-editor-reload', 'click', reloadEditor);

    var wrap = $('#cardnews-list-wrap');
    if (wrap) wrap.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-cn-edit]');
      if (ed) { var it = findItem(ed.getAttribute('data-cn-edit')); openEditor(ed.getAttribute('data-cn-edit'), it && it.title); return; }
      var cp = e.target.closest('[data-cn-copy]');
      if (cp) { copyItem(cp.getAttribute('data-cn-copy')); return; }
      var del = e.target.closest('[data-cn-del]');
      if (del) deleteItem(del.getAttribute('data-cn-del'));
    });

    // 편집기 iframe 의 저장 알림(__card_news_saved) 수신 → 토스트 + 상태 갱신.
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== '__card_news_saved') return;
      var status = $('#cardnews-editor-status');
      if (status) status.textContent = '저장됨 · ' + fmtKst(new Date().toISOString().slice(0, 19).replace('T', ' '));
      toast('카드뉴스를 저장했습니다.', 'success');
    });

    // ESC 로 편집기 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.editingId) {
        var ev = $('#cardnews-editor-view');
        if (ev && !ev.hidden) closeEditor();
      }
    });
  }

  // 패널 활성화 감지 → 최초 1회 로드 (memorabilia 와 동일 패턴)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-panel="card-news"]');
    if (!btn) return;
    setTimeout(function () { if (!state.loadedOnce) bootList(); }, 60);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireEvents);
  else wireEvents();
})();
