/* ============================================================
 * Glossary Chatbot Widget — keyword-based, no LLM
 * Data: GET /api/glossary/bot?format=json (CF edge cached)
 * Score: term_ko/en/fr exact 100, prefix 60, substring 30
 *        description_ko word boundary 15, substring 8
 *        multi-token query sums scores per token
 * ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = '/api/glossary/bot?format=json';
  var TOP_K = 5;
  var DEBOUNCE_MS = 200;

  var state = {
    items: null,
    loading: false,
    error: null,
    open: false,
    expandedId: null,
    debounceTimer: 0,
    query: '',
  };

  var els = {};

  function norm(str) {
    if (str == null) return '';
    try { str = String(str).normalize('NFC'); } catch (e) { str = String(str); }
    return str.trim().toLowerCase();
  }

  function tokenize(q) {
    var n = norm(q);
    if (!n) return [];
    return n.split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  function scoreItem(item, tokens) {
    if (!tokens.length) return 0;
    var ko = norm(item.term_ko);
    var en = norm(item.term_en);
    var fr = norm(item.term_fr);
    var desc = norm(item.description_ko);
    var total = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!t) continue;
      var s = 0;
      // term matches
      if (ko && ko === t) s = Math.max(s, 100);
      else if (en && en === t) s = Math.max(s, 100);
      else if (fr && fr === t) s = Math.max(s, 100);
      else if (ko && ko.indexOf(t) === 0) s = Math.max(s, 60);
      else if (en && en.indexOf(t) === 0) s = Math.max(s, 60);
      else if (fr && fr.indexOf(t) === 0) s = Math.max(s, 60);
      else if (ko && ko.indexOf(t) !== -1) s = Math.max(s, 30);
      else if (en && en.indexOf(t) !== -1) s = Math.max(s, 30);
      else if (fr && fr.indexOf(t) !== -1) s = Math.max(s, 30);
      // description
      if (desc) {
        var idx = desc.indexOf(t);
        if (idx !== -1) {
          var before = idx === 0 ? ' ' : desc.charAt(idx - 1);
          var after = (idx + t.length) >= desc.length ? ' ' : desc.charAt(idx + t.length);
          var isBoundary = !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
          s += isBoundary ? 15 : 8;
        }
      }
      if (s === 0) return 0; // token must match somewhere
      total += s;
    }
    return total;
  }

  function rank(query) {
    var tokens = tokenize(query);
    if (!tokens.length || !state.items) return [];
    var scored = [];
    for (var i = 0; i < state.items.length; i++) {
      var sc = scoreItem(state.items[i], tokens);
      if (sc > 0) scored.push({ item: state.items[i], score: sc });
    }
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var ak = String(a.item.term_ko || a.item.term_en || '');
      var bk = String(b.item.term_ko || b.item.term_en || '');
      return ak.localeCompare(bk, 'ko');
    });
    return scored.slice(0, TOP_K).map(function (x) { return x.item; });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadData() {
    if (state.items || state.loading) return;
    state.loading = true;
    state.error = null;
    render();
    fetch(ENDPOINT, { credentials: 'omit', cache: 'default' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        state.items = items;
        state.loading = false;
        render();
      })
      .catch(function (err) {
        state.loading = false;
        state.error = (err && err.message) ? err.message : '데이터 로드 실패';
        render();
      });
  }

  function render() {
    if (!els.body) return;
    if (state.loading) {
      els.body.innerHTML = '<div class="gw-chatbot-loading">용어집을 불러오는 중…</div>';
      return;
    }
    if (state.error) {
      els.body.innerHTML = '<div class="gw-chatbot-error">용어집을 불러오지 못했습니다.<br><small>' + escapeHtml(state.error) + '</small></div>';
      return;
    }
    if (!state.query) {
      els.body.innerHTML = '<div class="gw-chatbot-empty">스카우트 용어를 한글 · 영어 · 불어로 검색할 수 있어요.<br><br>예: <strong>스카우트</strong>, <strong>WOSM</strong>, <strong>jamboree</strong></div>';
      return;
    }
    var results = rank(state.query);
    if (!results.length) {
      els.body.innerHTML = '<div class="gw-chatbot-empty">관련 용어를 찾지 못했어요.<br><br><a href="/glossary.html">용어집 전체 보기 →</a></div>';
      return;
    }
    var html = '<ul class="gw-chatbot-results">';
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      var expanded = state.expandedId === it.id;
      var ko = escapeHtml(it.term_ko || '');
      var en = escapeHtml(it.term_en || '');
      var fr = escapeHtml(it.term_fr || '');
      var desc = escapeHtml(it.description_ko || '');
      var meta = [];
      if (en) meta.push(en);
      if (fr) meta.push(fr);
      html += '<li class="gw-chatbot-card' + (expanded ? ' is-expanded' : '') + '" data-id="' + escapeHtml(String(it.id)) + '">';
      html += '<button type="button" class="gw-chatbot-card-button" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
      html += '<span class="gw-chatbot-card-titles">';
      html += '<span class="gw-chatbot-card-ko">' + (ko || '—') + '</span>';
      if (meta.length) html += '<span class="gw-chatbot-card-en">' + meta.join(' · ') + '</span>';
      html += '</span>';
      html += '<svg class="gw-chatbot-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      html += '</button>';
      html += '<div class="gw-chatbot-card-detail">';
      if (desc) html += '<div class="gw-chatbot-card-detail-row"><strong>설명</strong>' + desc + '</div>';
      else html += '<div class="gw-chatbot-card-detail-row" style="color:var(--gray-500,#8f8f8f)">설명이 등록되어 있지 않습니다.</div>';
      html += '<a class="gw-chatbot-card-detail-link" href="/glossary.html#term-' + escapeHtml(String(it.id)) + '">용어집에서 자세히 보기 →</a>';
      html += '</div>';
      html += '</li>';
    }
    html += '</ul>';
    els.body.innerHTML = html;

    var cards = els.body.querySelectorAll('.gw-chatbot-card');
    for (var j = 0; j < cards.length; j++) {
      (function (card) {
        var btn = card.querySelector('.gw-chatbot-card-button');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var id = card.getAttribute('data-id');
          state.expandedId = (state.expandedId === id) ? null : id;
          render();
        });
      })(cards[j]);
    }
  }

  function onInput(e) {
    var v = e.target.value;
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(function () {
      state.query = v;
      state.expandedId = null;
      render();
    }, DEBOUNCE_MS);
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    els.root.classList.add('is-open');
    els.fab.setAttribute('aria-expanded', 'true');
    loadData();
    setTimeout(function () {
      if (els.input) els.input.focus();
    }, 50);
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    els.root.classList.remove('is-open');
    els.fab.setAttribute('aria-expanded', 'false');
    els.fab.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && state.open) {
      e.preventDefault();
      closePanel();
    }
  }

  function build() {
    var root = document.createElement('div');
    root.className = 'gw-chatbot-root';
    root.setAttribute('data-gw-chatbot', '1');
    root.innerHTML = [
      '<button type="button" class="gw-chatbot-fab" aria-label="스카우트 용어 챗봇 열기" aria-expanded="false" aria-controls="gw-chatbot-panel">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
          '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
        '</svg>',
        '<span class="gw-chatbot-fab-label">스카우트 용어 챗봇 열기</span>',
      '</button>',
      '<div class="gw-chatbot-panel" id="gw-chatbot-panel" role="dialog" aria-label="스카우트 용어 챗봇">',
        '<div class="gw-chatbot-header">',
          '<div>',
            '<span class="gw-chatbot-header-title">스카우트 용어 챗봇</span>',
            '<span class="gw-chatbot-header-sub">Glossary Search</span>',
          '</div>',
          '<button type="button" class="gw-chatbot-close" aria-label="닫기">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
          '</button>',
        '</div>',
        '<div class="gw-chatbot-search">',
          '<input type="search" class="gw-chatbot-input" placeholder="용어를 검색하세요 (예: 잼버리)" aria-label="용어 검색" autocomplete="off" inputmode="search" />',
        '</div>',
        '<div class="gw-chatbot-body" aria-live="polite"></div>',
        '<div class="gw-chatbot-footer">전체 용어는 <a href="/glossary.html">용어집</a>에서 확인하세요</div>',
      '</div>'
    ].join('');
    document.body.appendChild(root);
    els.root = root;
    els.fab = root.querySelector('.gw-chatbot-fab');
    els.panel = root.querySelector('.gw-chatbot-panel');
    els.input = root.querySelector('.gw-chatbot-input');
    els.body = root.querySelector('.gw-chatbot-body');
    var closeBtn = root.querySelector('.gw-chatbot-close');

    els.fab.addEventListener('click', function () {
      state.open ? closePanel() : openPanel();
    });
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    els.input.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown);

    render();
  }

  function init() {
    if (document.querySelector('[data-gw-chatbot]')) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', build);
      return;
    }
    build();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
