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
  var PRIMARY = 1;
  var RELATED = 2;
  var TYPING_MS = 320;
  var CHIP_COUNT = 5;
  var FETCH_TIMEOUT_MS = 12000;   // 한 번에 끊고 사용자에게 재시도 기회
  var MAX_MESSAGES = 80;          // 장시간 대화 시 메모리·렌더 부담 방지
  var SCROLL_BOTTOM_THRESHOLD = 80; // user 가 위쪽 메시지 읽고 있으면 자동 스크롤 보류

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
    messages: [],
    greeted: false,
    expanded: {},
    imeComposing: false,
    sendInFlight: false,
  };

  var els = {};
  // 진행 중 비동기 작업 — closePanel / build cleanup 시 정리
  var fetchAbort = null;
  var pendingTimers = [];
  var loadPromise = null;

  function trackTimer(id) {
    pendingTimers.push(id);
    return id;
  }

  function clearPendingTimers() {
    for (var i = 0; i < pendingTimers.length; i++) {
      clearTimeout(pendingTimers[i]);
    }
    pendingTimers = [];
  }

  function abortInFlightFetch() {
    if (fetchAbort) {
      try { fetchAbort.abort(); } catch (e) { /* noop */ }
      fetchAbort = null;
    }
  }

  // ---------- normalization ----------
  function norm(str) {
    if (str == null) return '';
    try { str = String(str).normalize('NFC'); } catch (e) { str = String(str); }
    return str.trim().toLowerCase();
  }

  function stripQuery(raw) {
    var q = norm(raw);
    if (!q) return '';
    q = q.replace(/[?？!！.…。·,，\s]+$/g, '').trim();
    for (var i = 0; i < KO_QUESTION_WORDS.length; i++) {
      q = q.split(KO_QUESTION_WORDS[i]).join(' ');
    }
    q = q.replace(/\s+/g, ' ').trim();
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

  // ---------- data loading (timeout + abort + retry-friendly) ----------
  function loadData() {
    if (state.items) return Promise.resolve();
    if (loadPromise) return loadPromise; // 중복 호출 합치기
    state.loading = true;
    state.error = null;
    abortInFlightFetch();
    var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    fetchAbort = ac;
    var timeoutId = ac ? trackTimer(setTimeout(function () {
      try { ac.abort(); } catch (e) {}
    }, FETCH_TIMEOUT_MS)) : null;

    var opts = { credentials: 'omit', cache: 'default' };
    if (ac) opts.signal = ac.signal;

    loadPromise = fetch(ENDPOINT, opts)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        // 최소 필드 검증 — 결과 노이즈 / null term 렌더 방지
        state.items = items.filter(function (it) {
          return it && (it.term_ko || it.term_en || it.term_fr);
        });
        state.loading = false;
      })
      .catch(function (err) {
        state.loading = false;
        if (err && err.name === 'AbortError') {
          state.error = '응답이 지연되어 중단되었습니다';
        } else {
          state.error = (err && err.message) ? err.message : '데이터 로드 실패';
        }
      })
      .then(function () {
        if (timeoutId != null) {
          clearTimeout(timeoutId);
          var pos = pendingTimers.indexOf(timeoutId);
          if (pos !== -1) pendingTimers.splice(pos, 1);
        }
        if (fetchAbort === ac) fetchAbort = null;
        loadPromise = null;
      });
    return loadPromise;
  }

  // ---------- message factory ----------
  function pickChipsFromGlossary(n) {
    if (!state.items || !state.items.length) return [];
    var pool = [];
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var label = (it.term_ko || it.term_en || it.term_fr || '').toString().trim();
      if (label) pool.push(label);
    }
    var picked = [];
    var limit = Math.min(n, pool.length);
    for (var j = 0; j < limit; j++) {
      var idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function pushGreetingOnce() {
    if (state.greeted) return;
    state.greeted = true;
    state.messages.push({
      kind: 'bot',
      html: '안녕하세요! 스카우트 용어가 궁금하면 무엇이든 물어보세요. 한글·영어·불어 모두 검색할 수 있어요. 😊'
    });
  }

  function refreshChips() {
    if (!state.items) return;
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].kind === 'user') return;
    }
    var chips = pickChipsFromGlossary(CHIP_COUNT);
    if (!chips.length) return;
    var existing = -1;
    for (var j = 0; j < state.messages.length; j++) {
      if (state.messages[j].kind === 'chips') { existing = j; break; }
    }
    if (existing !== -1) state.messages[existing].chips = chips;
    else state.messages.push({ kind: 'chips', chips: chips });
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

  // 오래된 메시지 잘라내기 — 메모리·렌더 비용 무한 증가 방지.
  // 첫 greeting + 첫 chips 메시지는 컨텍스트로 보존.
  function capMessages() {
    if (state.messages.length <= MAX_MESSAGES) return;
    var keepHead = [];
    var seenGreeting = false;
    var seenChips = false;
    for (var i = 0; i < state.messages.length && keepHead.length < 2; i++) {
      var m = state.messages[i];
      if (!seenGreeting && m.kind === 'bot') { keepHead.push(m); seenGreeting = true; continue; }
      if (!seenChips && m.kind === 'chips') { keepHead.push(m); seenChips = true; continue; }
    }
    var tail = state.messages.slice(state.messages.length - (MAX_MESSAGES - keepHead.length));
    state.messages = keepHead.concat(tail);
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

  function isNearBottom() {
    if (!els.thread) return true;
    var diff = els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight;
    return diff <= SCROLL_BOTTOM_THRESHOLD;
  }

  function renderMessages() {
    if (!els.thread) return;
    capMessages();
    var stickBottom = isNearBottom();
    var prevScroll = els.thread.scrollTop;
    var prevHeight = els.thread.scrollHeight;

    var html = '';
    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      if (m.kind === 'user') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-user"><div class="gw-chatbot-bubble">' + esc(m.text) + '</div></div>';
      } else if (m.kind === 'bot') {
        // m.html 은 코드 내부에서 구성되며 사용자 입력은 esc() 처리됨. 외부 source X.
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot"><div class="gw-chatbot-bubble">' + m.html + '</div></div>';
      } else if (m.kind === 'typing') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot"><div class="gw-chatbot-bubble gw-chatbot-typing" aria-label="응답을 작성 중입니다"><span></span><span></span><span></span></div></div>';
      } else if (m.kind === 'card') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot gw-chatbot-msg-card">' + renderCard(m.term) + '</div>';
      } else if (m.kind === 'chips') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot gw-chatbot-msg-chips">';
        for (var j = 0; j < m.chips.length; j++) {
          html += '<button type="button" class="gw-chatbot-chip" data-chip="' + esc(m.chips[j]) + '">' + esc(m.chips[j]) + '</button>';
        }
        html += '</div>';
      } else if (m.kind === 'error') {
        html += '<div class="gw-chatbot-msg gw-chatbot-msg-bot"><div class="gw-chatbot-bubble">';
        html += m.html;
        html += ' <button type="button" class="gw-chatbot-retry" data-action="retry">다시 시도</button>';
        html += '</div></div>';
      }
    }
    els.thread.innerHTML = html;

    // 카드 expand 는 전체 re-render 대신 클래스 토글로 — DOM race / 핸들러 손실 회피
    var cards = els.thread.querySelectorAll('.gw-chatbot-card');
    for (var k = 0; k < cards.length; k++) {
      (function (card) {
        var btn = card.querySelector('.gw-chatbot-card-button');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var id = card.getAttribute('data-id');
          var nowExpanded = !state.expanded[id];
          state.expanded[id] = nowExpanded;
          card.classList.toggle('is-expanded', nowExpanded);
          btn.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
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
    var retryBtns = els.thread.querySelectorAll('.gw-chatbot-retry');
    for (var r = 0; r < retryBtns.length; r++) {
      retryBtns[r].addEventListener('click', function () {
        // 직전 사용자 질의 재시도. 없으면 단순히 데이터 재로딩.
        var lastUser = null;
        for (var x = state.messages.length - 1; x >= 0; x--) {
          if (state.messages[x].kind === 'user') { lastUser = state.messages[x].text; break; }
        }
        // 에러 메시지 제거 후 재시도
        state.messages = state.messages.filter(function (mm) { return mm.kind !== 'error'; });
        renderMessages();
        if (lastUser) handleSend(lastUser);
        else {
          loadData().then(function () {
            if (!state.error) { refreshChips(); renderMessages(); }
            else { pushErrorMessage(); renderMessages(); }
          });
        }
      });
    }

    // 스크롤 — 사용자가 아래쪽에 있을 때만 최신으로. 위에서 읽고 있으면 위치 보존.
    if (stickBottom) {
      els.thread.scrollTop = els.thread.scrollHeight;
    } else {
      els.thread.scrollTop = prevScroll + (els.thread.scrollHeight - prevHeight);
    }
  }

  function pushErrorMessage() {
    // 같은 에러 메시지 중복 추가 방지
    var last = state.messages[state.messages.length - 1];
    if (last && last.kind === 'error') return;
    state.messages.push({
      kind: 'error',
      html: '용어집을 불러오는 데 실패했어요. <small>' + esc(state.error || '알 수 없는 오류') + '</small>'
    });
  }

  // ---------- send flow ----------
  function setInputDisabled(disabled) {
    if (els.input) els.input.disabled = disabled;
    var sendBtn = els.form ? els.form.querySelector('.gw-chatbot-send') : null;
    if (sendBtn) sendBtn.disabled = disabled;
  }

  function handleSend(rawText) {
    if (state.sendInFlight) return;
    var text = (rawText == null ? (els.input ? els.input.value : '') : rawText) || '';
    text = String(text).trim();
    if (!text) return;
    state.sendInFlight = true;
    setInputDisabled(true);
    if (els.input) els.input.value = '';
    pushUser(text);
    renderMessages();

    loadData().then(function () {
      // 진행 중 닫혔으면 후속 작업 중단 (zombie state mutation 방지)
      if (!state.open && !state.greeted) {
        state.sendInFlight = false;
        setInputDisabled(false);
        return;
      }
      if (state.error) {
        pushErrorMessage();
        state.sendInFlight = false;
        setInputDisabled(false);
        renderMessages();
        return;
      }
      var tIdx = pushTyping();
      renderMessages();
      trackTimer(setTimeout(function () {
        popTyping(tIdx);
        var results = search(text);
        pushBotResult(text, results);
        state.sendInFlight = false;
        setInputDisabled(false);
        renderMessages();
        if (els.input && state.open) els.input.focus();
      }, TYPING_MS));
    });
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    els.root.classList.add('is-open');
    els.fab.setAttribute('aria-expanded', 'true');
    pushGreetingOnce();
    if (state.items) refreshChips();
    renderMessages();
    loadData().then(function () {
      if (!state.open) return;
      if (state.error) {
        pushErrorMessage();
      } else {
        refreshChips();
      }
      renderMessages();
    });
    trackTimer(setTimeout(function () {
      if (els.input && state.open) els.input.focus();
    }, 50));
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    // 미완료 작업 정리 — 닫힌 패널에서의 background mutation / 누수 방지
    clearPendingTimers();
    abortInFlightFetch();
    // 진행 중 send 가 있었으면 입력 잠금 해제
    state.sendInFlight = false;
    setInputDisabled(false);
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

    // 페이지 이탈 시 in-flight 작업 정리 (mobile bfcache · SPA 라우팅 대비)
    window.addEventListener('pagehide', function () {
      clearPendingTimers();
      abortInFlightFetch();
    });
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
