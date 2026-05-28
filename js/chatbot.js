/* ============================================================
 * Glossary Chatbot Widget — conversational UX, keyword-only (no LLM)
 * Data: GET /api/glossary/bot?format=json (CF edge cached)
 * - Greeting + quick-reply chips
 * - User/bot message bubbles
 * - Korean particle/ending strip → keyword score
 * - Typing indicator before bot reply
 * ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = '/api/glossary/bot?format=json';
  var PRIMARY = 1;       // top match shown as primary card
  var RELATED = 2;       // additional related cards
  var TYPING_MS = 320;   // bot "typing" delay
  var DEBOUNCE_MS = 0;   // send is explicit (button / Enter), no debounce
  var CHIP_COUNT = 5;    // suggested chips shown at greeting

  // Curated pool of common Scouting terms; CHIP_COUNT items chosen at random per open
  var CHIP_POOL = [
    '잼버리', '스카우트', 'WOSM', '간부훈련', '대원',
    '비버', '늑대', '보이', '가이드', '로버',
    '우드뱃지', '야영', '단복', '봉사활동', '신호법',
    '모토', '월드스카우팅', '봉화', '대장', '연맹',
    '훈련소', '캠프', '서약', '명예'
  ];

  // Korean particles/endings stripped from user query so "잼버리가 뭐야?" ≒ "잼버리"
  var KO_PARTICLES = /(이|가|은|는|을|를|의|에|에서|에게|한테|로|으로|와|과|도|만|이나|나|랑|이랑|보다|까지|부터|마저|이라도|라도)$/;
  var KO_QUESTION_WORDS = [
    '무엇인가요','무엇인지','무엇이','무엇','뭐인가요','뭐인지','뭐예요','뭐야','뭐지','뭔지','뭔가요','뭔가',
    '어떤건가요','어떤거','어떤것','어떤','알려주세요','알려줘','설명해주세요','설명해줘','설명','정의',
    '란','이란','라는','이라는','관해서','관해','대해서','대해'
  ];

  var state = {
    items: null,
    loading: false,
    error: null,
    open: false,
    messages: [],   // {kind: 'bot'|'user'|'typing', html?, term?, related?, text?}
    greeted: false,
    expanded: {},   // id → true (per-card expand state)
    imeComposing: false,
    sendInFlight: false,
  };

  var els = {};

  // ---------- normalization ----------
  function norm(str) {
    if (str == null) return '';
    try { str = String(str).normalize('NFC'); } catch (e) { str = String(str); }
    return str.trim().toLowerCase();
  }

  function stripQuery(raw) {
    var q = norm(raw);
    if (!q) return '';
    // Strip trailing punctuation
    q = q.replace(/[?？!！.…。·,，\s]+$/g, '').trim();
    // Strip question/explain words anywhere
    for (var i = 0; i < KO_QUESTION_WORDS.length; i++) {
      var w = KO_QUESTION_WORDS[i];
      q = q.split(w).join(' ');
    }
    q = q.replace(/\s+/g, ' ').trim();
    // Strip particle on last token
    var parts = q.split(' ');
    var last = parts[parts.length - 1];
    if (last) {
      var stripped = last.replace(KO_PARTICLES, '');
      if (stripped && stripped !== last) parts[parts.length - 1] = stripped;
    }
    return parts.join(' ').trim();
  }

  function tokenize(q) {
    var n = norm(q);
    if (!n) return [];
    return n.split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  // ---------- scoring ----------
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
      if (ko && ko === t) s = Math.max(s, 100);
      else if (en && en === t) s = Math.max(s, 100);
      else if (fr && fr === t) s = Math.max(s, 100);
      else if (ko && ko.indexOf(t) === 0) s = Math.max(s, 60);
      else if (en && en.indexOf(t) === 0) s = Math.max(s, 60);
      else if (fr && fr.indexOf(t) === 0) s = Math.max(s, 60);
      else if (ko && ko.indexOf(t) !== -1) s = Math.max(s, 30);
      else if (en && en.indexOf(t) !== -1) s = Math.max(s, 30);
      else if (fr && fr.indexOf(t) !== -1) s = Math.max(s, 30);
      if (desc) {
        var idx = desc.indexOf(t);
        if (idx !== -1) {
          var before = idx === 0 ? ' ' : desc.charAt(idx - 1);
          var after = (idx + t.length) >= desc.length ? ' ' : desc.charAt(idx + t.length);
          var isBoundary = !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
          s += isBoundary ? 15 : 8;
        }
      }
      if (s === 0) return 0;
      total += s;
    }
    return total;
  }

  function search(rawQuery) {
    var stripped = stripQuery(rawQuery);
    var tokens = tokenize(stripped);
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
    return scored.slice(0, PRIMARY + RELATED).map(function (x) { return x.item; });
  }

  // ---------- utils ----------
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadData() {
    if (state.items || state.loading) return Promise.resolve();
    state.loading = true;
    state.error = null;
    return fetch(ENDPOINT, { credentials: 'omit', cache: 'default' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.items = (data && Array.isArray(data.items)) ? data.items : [];
        state.loading = false;
      })
      .catch(function (err) {
        state.loading = false;
        state.error = (err && err.message) ? err.message : '데이터 로드 실패';
      });
  }

  // ---------- message factory ----------
  function pickChips(n) {
    var pool = CHIP_POOL.slice();
    var picked = [];
    var limit = Math.min(n, pool.length);
    for (var i = 0; i < limit; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function pushBotIntro() {
    if (state.greeted) {
      // Refresh chip selection on re-open if user hasn't chatted yet
      var hasUserMsg = false;
      for (var i = 0; i < state.messages.length; i++) {
        if (state.messages[i].kind === 'user') { hasUserMsg = true; break; }
      }
      if (!hasUserMsg) {
        for (var j = state.messages.length - 1; j >= 0; j--) {
          if (state.messages[j].kind === 'chips') {
            state.messages[j].chips = pickChips(CHIP_COUNT);
            break;
          }
        }
      }
      return;
    }
    state.greeted = true;
    state.messages.push({
      kind: 'bot',
      html: '안녕하세요! 스카우트 용어가 궁금하면 무엇이든 물어보세요. 한글·영어·불어 모두 검색할 수 있어요. 😊'
    });
    state.messages.push({
      kind: 'chips',
      chips: pickChips(CHIP_COUNT)
    });
  }

  function pushUser(text) {
    state.messages.push({ kind: 'user', text: text });
  }

  function pushTyping() {
    state.messages.push({ kind: 'typing' });
    return state.messages.length - 1;
  }

  function popTyping(idx) {
    if (idx == null) return;
    if (state.messages[idx] && state.messages[idx].kind === 'typing') {
      state.messages.splice(idx, 1);
    }
  }

  function pushBotResult(rawQuery, results) {
    if (!results.length) {
      state.messages.push({
        kind: 'bot',
        html: '죄송해요, <strong>' + esc(rawQuery) + '</strong>에 해당하는 용어를 찾지 못했어요.<br>철자를 확인해보시거나, <a href="/glossary.html">용어집 전체</a>에서 둘러보실 수 있어요.'
      });
      return;
    }
    var primary = results[0];
    var related = results.slice(1);
    var nameKo = primary.term_ko || '';
    var nameEn = primary.term_en || '';
    var displayName = nameKo || nameEn || '용어';
    state.messages.push({
      kind: 'bot',
      html: '<strong>' + esc(displayName) + '</strong>에 대해 찾았어요. 👇'
    });
    state.messages.push({ kind: 'card', term: primary });
    if (related.length) {
      state.messages.push({
        kind: 'bot',
        html: '비슷한 용어도 있어요. 카드를 눌러 펼쳐보세요.'
      });
      for (var i = 0; i < related.length; i++) {
        state.messages.push({ kind: 'card', term: related[i] });
      }
    }
  }

  // ---------- render ----------
  function renderCard(term) {
    var id = String(term.id);
    var expanded = !!state.expanded[id];
    var ko = esc(term.term_ko || '');
    var en = esc(term.term_en || '');
    var fr = esc(term.term_fr || '');
    var desc = esc(term.description_ko || '');
    var meta = [];
    if (en) meta.push(en);
    if (fr) meta.push(fr);
    var html = '<div class="gw-chatbot-card' + (expanded ? ' is-expanded' : '') + '" data-id="' + esc(id) + '">';
    html += '<button type="button" class="gw-chatbot-card-button" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
    html += '<span class="gw-chatbot-card-titles">';
    html += '<span class="gw-chatbot-card-ko">' + (ko || '—') + '</span>';
    if (meta.length) html += '<span class="gw-chatbot-card-en">' + meta.join(' · ') + '</span>';
    html += '</span>';
    html += '<svg class="gw-chatbot-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    html += '</button>';
    html += '<div class="gw-chatbot-card-detail">';
    if (desc) html += '<div class="gw-chatbot-card-detail-row">' + desc + '</div>';
    else html += '<div class="gw-chatbot-card-detail-row" style="color:var(--gray-500,#8f8f8f)">설명이 등록되어 있지 않습니다.</div>';
    html += '<a class="gw-chatbot-card-detail-link" href="/glossary.html#term-' + esc(id) + '">용어집에서 보기 →</a>';
    html += '</div></div>';
    return html;
  }

  function renderMessages() {
    if (!els.thread) return;
    var html = '';
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (m.kind === 'user') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-user"><div class="gw-chatbot-bubble">' + esc(m.text) + '</div></div>';
      } else if (m.kind === 'bot') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot"><div class="gw-chatbot-bubble">' + m.html + '</div></div>';
      } else if (m.kind === 'typing') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot"><div class="gw-chatbot-bubble gw-chatbot-typing"><span></span><span></span><span></span></div></div>';
      } else if (m.kind === 'card') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot gw-chatbot-msg-card">' + renderCard(m.term) + '</div>';
      } else if (m.kind === 'chips') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot gw-chatbot-msg-chips">';
        for (var j = 0; j < m.chips.length; j++) {
          html += '<button type="button" class="gw-chatbot-chip" data-chip="' + esc(m.chips[j]) + '">' + esc(m.chips[j]) + '</button>';
        }
        html += '</div>';
      }
    }
    els.thread.innerHTML = html;
    // wire card/chip handlers
    var cards = els.thread.querySelectorAll('.gw-chatbot-card');
    for (var k = 0; k < cards.length; k++) {
      (function (card) {
        var btn = card.querySelector('.gw-chatbot-card-button');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var id = card.getAttribute('data-id');
          state.expanded[id] = !state.expanded[id];
          renderMessages();
          // Don't scroll on expand
        });
      })(cards[k]);
    }
    var chips = els.thread.querySelectorAll('.gw-chatbot-chip');
    for (var c = 0; c < chips.length; c++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          handleSend(chip.getAttribute('data-chip'));
        });
      })(chips[c]);
    }
    // scroll to bottom
    els.thread.scrollTop = els.thread.scrollHeight;
  }

  // ---------- send flow ----------
  function handleSend(rawText) {
    if (state.sendInFlight) return;
    var text = (rawText == null ? els.input.value : rawText) || '';
    text = String(text).trim();
    if (!text) return;
    state.sendInFlight = true;
    els.input.value = '';
    pushUser(text);
    renderMessages();
    loadData().then(function () {
      if (state.error) {
        state.messages.push({
          kind: 'bot',
          html: '용어집을 불러오는 데 실패했어요. 잠시 후 다시 시도해주세요.<br><small>' + esc(state.error) + '</small>'
        });
        state.sendInFlight = false;
        renderMessages();
        return;
      }
      var tIdx = pushTyping();
      renderMessages();
      setTimeout(function () {
        popTyping(tIdx);
        var results = search(text);
        pushBotResult(text, results);
        state.sendInFlight = false;
        renderMessages();
      }, TYPING_MS);
    });
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    els.root.classList.add('is-open');
    els.fab.setAttribute('aria-expanded', 'true');
    pushBotIntro();
    renderMessages();
    loadData(); // preload silently
    setTimeout(function () { if (els.input) els.input.focus(); }, 50);
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

  function onInputKeydown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // Ignore Enter while an IME (Korean / Japanese / Chinese) is composing —
    // committing the composition would otherwise fire a duplicate send and
    // leave the trailing syllable in the input after we clear it.
    if (e.isComposing || state.imeComposing || e.keyCode === 229) return;
    e.preventDefault();
    handleSend();
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
          '<div class="gw-chatbot-header-avatar" aria-hidden="true">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
          '</div>',
          '<div class="gw-chatbot-header-titles">',
            '<span class="gw-chatbot-header-title">스카우트 용어 도우미</span>',
            '<span class="gw-chatbot-header-sub">Glossary Bot · 온라인</span>',
          '</div>',
          '<button type="button" class="gw-chatbot-close" aria-label="닫기">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
          '</button>',
        '</div>',
        '<div class="gw-chatbot-thread" aria-live="polite"></div>',
        '<form class="gw-chatbot-form" autocomplete="off">',
          '<input type="text" class="gw-chatbot-input" placeholder="용어를 물어보세요 (예: 잼버리가 뭐야?)" aria-label="질문 입력" inputmode="search" />',
          '<button type="submit" class="gw-chatbot-send" aria-label="보내기">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
          '</button>',
        '</form>',
      '</div>'
    ].join('');
    document.body.appendChild(root);
    els.root = root;
    els.fab = root.querySelector('.gw-chatbot-fab');
    els.panel = root.querySelector('.gw-chatbot-panel');
    els.input = root.querySelector('.gw-chatbot-input');
    els.thread = root.querySelector('.gw-chatbot-thread');
    els.form = root.querySelector('.gw-chatbot-form');
    var closeBtn = root.querySelector('.gw-chatbot-close');

    els.fab.addEventListener('click', function () {
      state.open ? closePanel() : openPanel();
    });
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.imeComposing) return;
      handleSend();
    });
    els.input.addEventListener('compositionstart', function () { state.imeComposing = true; });
    els.input.addEventListener('compositionend', function () { state.imeComposing = false; });
    els.input.addEventListener('keydown', onInputKeydown);
    document.addEventListener('keydown', onKeydown);
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
