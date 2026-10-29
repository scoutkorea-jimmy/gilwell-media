/**
 * Gilwell Media · Memorabilia shared client helpers
 * 공개 도감(/memorabilia)과 관리자 도감 패널(/admin)이 공통으로 사용.
 *
 * - GW.MemorabiliaUpload.describeError(payload) — 서버 응답 → 한국어 사유
 * - GW.MemorabiliaUpload.MAX_RAW_BYTES         — 클라 검증 한도 (9MB raw)
 * - GW.MemorabiliaUpload.ALLOWED_TYPES         — 허용 MIME allowlist
 * - GW.MemorabiliaUpload.validateFile(file)    — null | 한국어 거절 사유
 * - GW.MemorabiliaCountries.load()             — fetch + cache (한 번만)
 * - GW.MemorabiliaCountries.attach(opts)       — 검색 + 칩 + 스크롤 리스트 picker
 *
 * 노출: window.GW.MemorabiliaUpload, window.GW.MemorabiliaCountries
 */
(function () {
  'use strict';

  const GW = (window.GW = window.GW || {});

  // ── 업로드 에러 매퍼 ────────────────────────────────────────────────────────
  // 서버 functions/api/memorabilia/upload-image.js 의 REASONS 와 동기화.
  const REASONS = {
    not_authenticated: '로그인이 필요합니다. 다시 로그인한 뒤 시도해주세요.',
    no_permission: '이 메뉴의 쓰기 권한이 없습니다. 오너에게 요청해주세요.',
    invalid_json: '요청 본문이 잘못됐습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
    missing_data_url: '이미지 데이터가 첨부되지 않았습니다.',
    invalid_data_url: '이미지 형식이 잘못됐습니다.',
    unsupported_type: '지원하지 않는 이미지 형식입니다. JPG · PNG · WebP · GIF 만 업로드할 수 있어요 (HEIC · SVG · TIFF 등은 변환 후 다시 시도).',
    too_large: '파일이 너무 큽니다 (최대 약 9MB). 이미지를 축소하거나 JPG로 변환한 뒤 다시 시도해주세요.',
    bucket_unavailable: '이미지 저장소(R2)가 연결돼 있지 않습니다. 운영자에게 알려주세요.',
    store_failed: '이미지 저장 중 실패했습니다. 잠시 후 다시 시도하거나 다른 이미지를 사용해주세요.',
    upload_failed: '알 수 없는 오류로 업로드가 실패했습니다. 잠시 후 다시 시도해주세요.',
    network: '네트워크 오류로 업로드에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.',
    http_4xx: '서버가 요청을 거절했습니다.',
    http_5xx: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  };

  function describeError(payload, fallback) {
    if (!payload) return fallback || REASONS.upload_failed;
    if (typeof payload === 'string') return REASONS[payload] || payload || fallback || REASONS.upload_failed;
    if (payload.reason) return payload.reason;
    if (payload.error && REASONS[payload.error]) return REASONS[payload.error];
    if (payload.error) return String(payload.error);
    return fallback || REASONS.upload_failed;
  }

  // 클라이언트 사전 검증 — 서버 도달 전에 명확한 사유를 사용자에게 보여준다.
  const MAX_RAW_BYTES = 9 * 1024 * 1024; // 9MB raw → ~12MB data URL (서버 한도와 정렬)
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

  function validateFile(file) {
    if (!file) return '파일이 비어 있습니다.';
    if (!file.type || !ALLOWED_TYPES.has(file.type.toLowerCase())) {
      const t = file.type || '(알 수 없음)';
      return `지원하지 않는 형식입니다 (${t}). JPG · PNG · WebP · GIF 만 업로드할 수 있어요.`;
    }
    if (file.size > MAX_RAW_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return `파일이 너무 큽니다 (${mb}MB · 최대 약 9MB). 이미지를 축소한 뒤 다시 시도해주세요.`;
    }
    return null;
  }

  GW.MemorabiliaUpload = {
    REASONS,
    MAX_RAW_BYTES,
    ALLOWED_TYPES,
    describeError,
    validateFile,
  };

  // ── 국가 카탈로그 로더 ──────────────────────────────────────────────────────
  let _countryCache = null;
  let _countryPromise = null;

  async function loadCountries() {
    if (_countryCache) return _countryCache;
    if (_countryPromise) return _countryPromise;
    _countryPromise = fetch('/api/memorabilia/countries', { credentials: 'same-origin' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
      .then((data) => {
        _countryCache = Array.isArray(data.items) ? data.items : [];
        return _countryCache;
      })
      .catch((err) => {
        _countryPromise = null;
        throw err;
      });
    return _countryPromise;
  }

  function getCountryLabel(code) {
    if (!_countryCache) return code;
    const found = _countryCache.find((c) => c.code === code);
    return found ? found.name_ko : code;
  }

  // ── Country Picker 위젯 (타입어헤드 드롭다운) ───────────────────────────────
  // 디자인 원칙: 검색하지 않을 때는 입력창만 보인다 (전체 리스트·칩 영역 모두 숨김).
  //              타이핑 시작 → 입력창 아래에 매칭 상위 8개 드롭다운으로 표시.
  //              항목 선택 → 입력 위쪽 줄에 작은 태그로 표시 (× 로 제거).
  //
  // opts.host          — placeholder 컨테이너 (innerHTML 교체됨)
  // opts.initial       — string[] 선택 ISO-2 코드 배열
  // opts.onChange      — (codes:string[]) => void
  // opts.idPrefix      — 내부 ID 충돌 방지 prefix
  // returns { getValue, setValue, focus }
  function attachCountryPicker(opts) {
    const host = opts.host;
    if (!host) throw new Error('attachCountryPicker: host required');
    const prefix = opts.idPrefix || 'cp';
    let selected = []; // 선택 순서 보존
    (opts.initial || []).forEach((code) => { if (!selected.includes(code)) selected.push(code); });
    let items = [];        // /api/memorabilia/countries
    let activeIdx = -1;    // 키보드 네비게이션용

    host.classList.add('gw-country-picker', 'gw-country-picker-typeahead');
    host.innerHTML = `
      <div class="gw-cp-selected" id="${prefix}-selected"></div>
      <div class="gw-cp-input-wrap">
        <input type="search" class="gw-cp-input" id="${prefix}-input" placeholder="국가명 검색 후 클릭으로 추가 (예: 몽골, MN)" autocomplete="off" spellcheck="false" />
        <div class="gw-cp-dropdown" id="${prefix}-dropdown" role="listbox" hidden></div>
      </div>
    `;

    const selEl = host.querySelector('#' + prefix + '-selected');
    const inputEl = host.querySelector('#' + prefix + '-input');
    const dropEl = host.querySelector('#' + prefix + '-dropdown');

    function emit() {
      if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
    }
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function highlight(text, q) {
      if (!q) return escapeHtml(text);
      const safe = escapeHtml(text);
      const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { return safe.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>'); }
      catch { return safe; }
    }

    function renderSelected() {
      if (!selected.length) {
        selEl.innerHTML = '<span class="gw-cp-selected-empty">선택된 국가 없음 — 아래에서 검색해 추가하세요</span>';
        return;
      }
      selEl.innerHTML = selected.map((code) => {
        const name = getCountryLabel(code);
        return `<span class="gw-cp-tag" data-code="${escapeHtml(code)}">${escapeHtml(name)} <button type="button" class="gw-cp-tag-x" data-remove="${escapeHtml(code)}" aria-label="${escapeHtml(name)} 제거">×</button></span>`;
      }).join('');
    }

    function closeDropdown() {
      dropEl.hidden = true;
      dropEl.innerHTML = '';
      activeIdx = -1;
    }

    function renderDropdown() {
      const q = inputEl.value.trim().toLowerCase();
      if (!q) { closeDropdown(); return; }
      if (!items.length) {
        dropEl.hidden = false;
        dropEl.innerHTML = '<div class="gw-cp-dd-empty">불러오는 중…</div>';
        return;
      }
      // 매칭: 국가코드 prefix → 한글 prefix → 영문 prefix → 부분일치 (가나다 정렬)
      const matched = items
        .filter((c) => !selected.includes(c.code))
        .map((c) => {
          const code = c.code.toLowerCase();
          const ko = (c.name_ko || '').toLowerCase();
          const en = (c.name_en || '').toLowerCase();
          let score = 0;
          if (code === q) score = 100;
          else if (code.startsWith(q)) score = 80;
          else if (ko.startsWith(q)) score = 70;
          else if (en.startsWith(q)) score = 60;
          else if (ko.includes(q) || en.includes(q) || code.includes(q)) score = 40;
          return { c, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      if (!matched.length) {
        dropEl.hidden = false;
        dropEl.innerHTML = '<div class="gw-cp-dd-empty">일치하는 국가가 없습니다.</div>';
        return;
      }
      dropEl.hidden = false;
      dropEl.innerHTML = matched.map((r, i) => {
        const c = r.c;
        return `<button type="button" class="gw-cp-dd-item${i === activeIdx ? ' is-active' : ''}" data-code="${escapeHtml(c.code)}" role="option">
          <span class="gw-cp-dd-name">${highlight(c.name_ko || c.code, q)}</span>
          <span class="gw-cp-dd-en">${highlight(c.name_en || '', q)}</span>
          <span class="gw-cp-dd-code">${escapeHtml(c.code)}</span>
        </button>`;
      }).join('');
    }

    function addCode(code) {
      if (!code || selected.includes(code)) return;
      selected.push(code);
      inputEl.value = '';
      closeDropdown();
      renderSelected();
      emit();
    }
    function removeCode(code) {
      const idx = selected.indexOf(code);
      if (idx < 0) return;
      selected.splice(idx, 1);
      renderSelected();
      emit();
    }

    // Selected 영역 — × 클릭으로 제거
    selEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      removeCode(btn.getAttribute('data-remove'));
    });

    // 입력 — 드롭다운 갱신 (IME 조합 중에는 건너뛰어 마지막 글자 반복/조기 매칭 방지)
    inputEl.addEventListener('input', (e) => {
      if (e && e.isComposing) return;
      activeIdx = -1;
      renderDropdown();
    });
    inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) renderDropdown(); });
    inputEl.addEventListener('blur', () => setTimeout(closeDropdown, 150));
    inputEl.addEventListener('keydown', (e) => {
      const matches = dropEl.querySelectorAll('[data-code]');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, matches.length - 1);
        renderDropdown();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        renderDropdown();
      } else if (e.key === 'Enter') {
        // IME 조합 확정 Enter 면 코드 추가 안 함 (마지막 글자 반복 방지)
        if (GW.isImeComposing(e)) return;
        if (activeIdx >= 0 && matches[activeIdx]) {
          e.preventDefault();
          addCode(matches[activeIdx].getAttribute('data-code'));
        } else if (matches.length === 1) {
          e.preventDefault();
          addCode(matches[0].getAttribute('data-code'));
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      } else if (e.key === 'Backspace' && !inputEl.value && selected.length) {
        // 빈 입력 + Backspace → 마지막 선택 제거 (이메일 입력 패턴)
        removeCode(selected[selected.length - 1]);
      }
    });

    // 드롭다운 클릭으로 추가
    dropEl.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-code]');
      if (!btn) return;
      e.preventDefault(); // blur 방지
      addCode(btn.getAttribute('data-code'));
    });

    // Load catalog + 초기 렌더
    loadCountries().then((data) => {
      items = data;
      renderSelected();
    }).catch(() => {
      selEl.innerHTML = '<span class="gw-cp-selected-empty">국가 목록을 불러오지 못했습니다.</span>';
    });

    renderSelected();

    return {
      getValue: () => selected.slice(),
      setValue: (codes) => {
        selected = [];
        (Array.isArray(codes) ? codes : []).forEach((c) => { if (!selected.includes(c)) selected.push(c); });
        renderSelected();
      },
      focus: () => inputEl && inputEl.focus(),
    };
  }

  GW.MemorabiliaCountries = {
    load: loadCountries,
    getLabel: getCountryLabel,
    attach: attachCountryPicker,
  };

  // ── 도감 제목 내 영문 국가명 대문자화 ────────────────────────────────────────
  // 운영자가 'Korea Jamboree 1991' 처럼 입력해도 화면에는 'KOREA Jamboree 1991'
  // 로 표시. 기준 사전은 /api/memorabilia/countries 의 name_en. 캐시 미준비 시
  // 원본 그대로 반환 → preload() 를 한 번 호출해두면 이후 sync 호출 안전.
  let _ucCountryNames = null;
  function _rebuildUcNames() {
    if (!_countryCache) { _ucCountryNames = null; return; }
    _ucCountryNames = _countryCache
      .map((c) => c.name_en || '')
      .filter((n) => n && /^[\x20-\x7E]+$/.test(n)) // ASCII 만 — 한국어 라벨 오인 방지
      .sort((a, b) => b.length - a.length); // 긴 이름 우선 (e.g. 'United States' 먼저)
  }
  function uppercaseTitleSync(title) {
    if (!title) return '';
    if (!_ucCountryNames) _rebuildUcNames();
    if (!_ucCountryNames || !_ucCountryNames.length) return title;
    let out = title;
    for (const name of _ucCountryNames) {
      if (name === name.toUpperCase()) continue; // 이미 대문자면 skip
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('\\b' + esc + '\\b', 'gi'), name.toUpperCase());
    }
    return out;
  }
  async function uppercaseTitleAsync(title) {
    if (!_countryCache) { try { await loadCountries(); _rebuildUcNames(); } catch {} }
    return uppercaseTitleSync(title);
  }
  GW.MemorabiliaTitle = {
    preload: () => loadCountries().then(_rebuildUcNames).catch(() => {}),
    uppercaseSync: uppercaseTitleSync,
    uppercase: uppercaseTitleAsync,
  };

  // ── Events picker ───────────────────────────────────────────────────────────
  // 행사 카탈로그(memorabilia_events) 에서 검색·선택. 없으면 "신규 등록" 으로 생성.
  // opts.host         — 컨테이너
  // opts.initialId    — 사전 선택 event_id (편집 모드)
  // opts.initialEvent — 사전 선택 event 객체 (서버 응답 .event)
  // opts.onChange     — (eventId | null, eventObj | null) => void
  // returns { getEventId, getEvent, setEvent, reload }

  let _eventsCache = null;
  let _eventsPromise = null;
  async function loadEvents(force) {
    if (force) { _eventsCache = null; _eventsPromise = null; }
    if (_eventsCache) return _eventsCache;
    if (_eventsPromise) return _eventsPromise;
    _eventsPromise = fetch('/api/memorabilia/events', { credentials: 'same-origin' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
      .then((data) => { _eventsCache = Array.isArray(data.items) ? data.items : []; return _eventsCache; })
      .catch((err) => { _eventsPromise = null; throw err; });
    return _eventsPromise;
  }

  function attachEventPicker(opts) {
    const host = opts.host;
    if (!host) throw new Error('attachEventPicker: host required');
    const prefix = opts.idPrefix || 'ep';
    let events = [];
    let selectedId = opts.initialId || null;
    let selectedEvent = opts.initialEvent || null;
    let activeIdx = -1;
    let creating = false;

    host.classList.add('gw-event-picker');
    host.innerHTML = `
      <div class="gw-ep-selected" id="${prefix}-selected" hidden></div>
      <div class="gw-cp-input-wrap">
        <input type="search" class="gw-cp-input" id="${prefix}-input" placeholder="행사명 검색 (영문/국문) — 없으면 + 신규 등록" autocomplete="off" spellcheck="false" />
        <div class="gw-cp-dropdown" id="${prefix}-dropdown" role="listbox" hidden></div>
      </div>
      <div class="gw-ep-create-form" id="${prefix}-create-form" hidden>
        <h4>신규 행사 등록</h4>
        <div class="gw-ep-create-row">
          <label>행사명 (영문)</label>
          <input type="text" id="${prefix}-new-en" class="gw-cp-input" maxlength="200" placeholder="e.g. 25th World Scout Jamboree" />
        </div>
        <div class="gw-ep-create-row">
          <label>행사명 (국문)</label>
          <input type="text" id="${prefix}-new-ko" class="gw-cp-input" maxlength="200" placeholder="예: 제25회 세계스카우트잼버리" />
        </div>
        <fieldset class="gw-ep-date">
          <legend>시작일 (선택)</legend>
          <input type="number" id="${prefix}-new-sy" class="gw-cp-input gw-cp-input-num" placeholder="연도" min="1800" max="2200" />
          <input type="number" id="${prefix}-new-sm" class="gw-cp-input gw-cp-input-num" placeholder="월"   min="1"    max="12"   />
          <input type="number" id="${prefix}-new-sd" class="gw-cp-input gw-cp-input-num" placeholder="일 (선택)" min="1" max="31" />
        </fieldset>
        <fieldset class="gw-ep-date">
          <legend>종료일 (선택)</legend>
          <input type="number" id="${prefix}-new-ey" class="gw-cp-input gw-cp-input-num" placeholder="연도" min="1800" max="2200" />
          <input type="number" id="${prefix}-new-em" class="gw-cp-input gw-cp-input-num" placeholder="월"   min="1"    max="12"   />
          <input type="number" id="${prefix}-new-ed" class="gw-cp-input gw-cp-input-num" placeholder="일 (선택)" min="1" max="31" />
        </fieldset>
        <div class="gw-ep-create-actions">
          <button type="button" class="memo-btn memo-btn-outline memo-btn-sm" id="${prefix}-cancel-create">취소</button>
          <button type="button" class="memo-btn memo-btn-primary memo-btn-sm" id="${prefix}-save-create">행사 등록</button>
        </div>
        <div class="gw-ep-create-error" id="${prefix}-create-error" hidden></div>
      </div>
    `;

    const selEl = host.querySelector('#' + prefix + '-selected');
    const inputEl = host.querySelector('#' + prefix + '-input');
    const dropEl = host.querySelector('#' + prefix + '-dropdown');
    const formEl = host.querySelector('#' + prefix + '-create-form');
    const errEl = host.querySelector('#' + prefix + '-create-error');

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function highlight(text, q) {
      if (!q) return escapeHtml(text);
      const safe = escapeHtml(text);
      const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { return safe.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>'); }
      catch { return safe; }
    }
    function emit() {
      if (typeof opts.onChange === 'function') opts.onChange(selectedId, selectedEvent);
    }

    function renderSelected() {
      if (!selectedEvent) {
        selEl.hidden = true;
        selEl.innerHTML = '';
        inputEl.style.display = '';
        return;
      }
      selEl.hidden = false;
      const en = selectedEvent.name_en || '';
      const ko = selectedEvent.name_ko || '';
      const period = selectedEvent.period_text || '';
      selEl.innerHTML = `
        <div class="gw-ep-selected-card">
          <div class="gw-ep-selected-name">
            ${en ? `<strong>${escapeHtml(en)}</strong>` : ''}
            ${ko ? `<div class="gw-ep-selected-ko">${escapeHtml(ko)}</div>` : ''}
            ${period ? `<div class="gw-ep-selected-period">${escapeHtml(period)}</div>` : ''}
          </div>
          <button type="button" class="memo-btn memo-btn-outline memo-btn-sm" data-clear="1">변경</button>
        </div>
      `;
      inputEl.style.display = 'none';
      closeDropdown();
    }

    function closeDropdown() { dropEl.hidden = true; dropEl.innerHTML = ''; activeIdx = -1; }

    function renderDropdown() {
      const q = inputEl.value.trim().toLowerCase();
      if (!q) { closeDropdown(); return; }
      const matched = events.map((e) => {
        const en = (e.name_en || '').toLowerCase();
        const ko = (e.name_ko || '').toLowerCase();
        let score = 0;
        if (en === q || ko === q) score = 100;
        else if (en.startsWith(q) || ko.startsWith(q)) score = 80;
        else if (en.includes(q) || ko.includes(q)) score = 40;
        return { e, score };
      }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

      dropEl.hidden = false;
      // "+ 신규 행사 등록" 은 매치 결과가 없을 때만 노출 — 매치가 있을 때는
      // 산만하지 않도록 숨김. 정말 등록된 행사가 없을 때만 필요한 옵션.
      const createItem = `<button type="button" class="gw-cp-dd-item gw-ep-dd-create" data-create="1">
        <span class="gw-cp-dd-name">+ "${escapeHtml(inputEl.value.trim())}" 신규 행사로 등록</span>
        <span class="gw-cp-dd-en">기존 카탈로그에 없는 행사면 직접 만들어주세요</span>
      </button>`;

      if (!matched.length) {
        dropEl.innerHTML = '<div class="gw-cp-dd-empty">등록된 일치 행사 없음</div>' + createItem;
        return;
      }
      dropEl.innerHTML = matched.map((r, i) => {
        const e = r.e;
        return `<button type="button" class="gw-cp-dd-item${i === activeIdx ? ' is-active' : ''}" data-event-id="${e.id}">
          <span class="gw-cp-dd-name">${highlight(e.name_en || e.name_ko, q)}</span>
          <span class="gw-cp-dd-en">${highlight(e.name_ko || '', q)}${e.period_text ? ' · ' + escapeHtml(e.period_text) : ''}</span>
          <span class="gw-cp-dd-code">${e.usage_count || 0}건</span>
        </button>`;
      }).join('');
    }

    function selectEvent(ev) {
      selectedId = ev ? ev.id : null;
      selectedEvent = ev || null;
      renderSelected();
      emit();
    }

    selEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) {
        selectEvent(null);
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
      }
    });

    inputEl.addEventListener('input', (e) => {
      if (e && e.isComposing) return;
      activeIdx = -1;
      renderDropdown();
    });
    inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) renderDropdown(); });
    inputEl.addEventListener('blur', () => setTimeout(closeDropdown, 200));
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    dropEl.addEventListener('mousedown', (e) => {
      const createBtn = e.target.closest('[data-create]');
      if (createBtn) {
        e.preventDefault();
        openCreateForm(inputEl.value.trim());
        return;
      }
      const btn = e.target.closest('[data-event-id]');
      if (!btn) return;
      e.preventDefault();
      const id = parseInt(btn.getAttribute('data-event-id'), 10);
      const ev = events.find((x) => x.id === id);
      if (ev) selectEvent(ev);
    });

    function openCreateForm(prefillName) {
      creating = true;
      formEl.hidden = false;
      errEl.hidden = true;
      // 영/한 자동 분배: 입력값이 ASCII 위주면 EN, 한글 포함이면 KO
      const isKorean = /[가-힣]/.test(prefillName);
      host.querySelector('#' + prefix + '-new-en').value = isKorean ? '' : prefillName;
      host.querySelector('#' + prefix + '-new-ko').value = isKorean ? prefillName : '';
      // 나머지 초기화
      ['sy','sm','sd','ey','em','ed'].forEach((k) => {
        host.querySelector('#' + prefix + '-new-' + k).value = '';
      });
      closeDropdown();
    }
    function closeCreateForm() { creating = false; formEl.hidden = true; errEl.hidden = true; }
    host.querySelector('#' + prefix + '-cancel-create').addEventListener('click', closeCreateForm);
    host.querySelector('#' + prefix + '-save-create').addEventListener('click', async () => {
      errEl.hidden = true;
      const body = {
        name_en: host.querySelector('#' + prefix + '-new-en').value.trim(),
        name_ko: host.querySelector('#' + prefix + '-new-ko').value.trim(),
        start_year:  host.querySelector('#' + prefix + '-new-sy').value || null,
        start_month: host.querySelector('#' + prefix + '-new-sm').value || null,
        start_day:   host.querySelector('#' + prefix + '-new-sd').value || null,
        end_year:    host.querySelector('#' + prefix + '-new-ey').value || null,
        end_month:   host.querySelector('#' + prefix + '-new-em').value || null,
        end_day:     host.querySelector('#' + prefix + '-new-ed').value || null,
      };
      try {
        const res = await fetch('/api/memorabilia/events', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = (data.details || []).join(' · ') || data.error || ('HTTP ' + res.status);
          errEl.textContent = '행사 등록 실패: ' + detail;
          errEl.hidden = false;
          return;
        }
        // 카탈로그 새로고침 후 방금 만든 행사를 선택
        events = await loadEvents(true);
        const newEv = events.find((x) => x.id === data.id) || null;
        if (newEv) selectEvent(newEv);
        closeCreateForm();
        inputEl.value = '';
      } catch (err) {
        errEl.textContent = '네트워크 오류: ' + err.message;
        errEl.hidden = false;
      }
    });

    // Initial load + render
    loadEvents().then((data) => {
      events = data;
      if (selectedId && !selectedEvent) {
        selectedEvent = events.find((e) => e.id === selectedId) || null;
      }
      renderSelected();
    }).catch(() => {
      // ignore — picker still usable for create
    });

    return {
      getEventId: () => selectedId,
      getEvent: () => selectedEvent,
      setEvent: (ev) => {
        selectedId = ev ? ev.id : null;
        selectedEvent = ev || null;
        renderSelected();
      },
      reload: () => loadEvents(true),
    };
  }

  GW.MemorabiliaEvents = {
    load: loadEvents,
    attach: attachEventPicker,
  };

  // 단순 텍스트 → Editor.js paragraph 블록 JSON. 공개(memorabilia.js)·관리자(admin-memorabilia.js)
  // 등록 폼이 각자 복제하던 plainToEditorJson/descToEditorJson 을 단일화 (동일 구현 보장).
  GW.MemorabiliaDesc = {
    toEditorJson: function (text) {
      var t = String(text == null ? '' : text).trim();
      if (!t) return '';
      var blocks = t.split(/\n{2,}/).map(function (p) {
        return { type: 'paragraph', data: { text: GW.escapeHtml(p).replace(/\n/g, '<br>') } };
      });
      return JSON.stringify({ blocks: blocks });
    },
    // toEditorJson 의 역변환 — 저장된 Editor.js JSON(또는 평문)을 편집 textarea 용 평문으로.
    // <br>→줄바꿈, 태그 제거, HTML 엔티티 디코드. 이 디코드 누락이 편집-저장 왕복 시
    // 이중 이스케이프(&#39; → &amp;#39;)를 유발했으므로 반드시 여기서 단일 처리. (2026-05-30)
    toPlainText: function (stored) {
      if (!stored) return '';
      var s = String(stored);
      var text = s;
      if (s.trim().charAt(0) === '{') {
        try {
          var j = JSON.parse(s);
          if (j && Array.isArray(j.blocks)) {
            text = j.blocks.map(function (b) {
              var d = (b && b.data) || {};
              if (Array.isArray(d.items)) {
                return d.items.map(function (i) { return typeof i === 'string' ? i : (i.content || i.text || ''); }).join('\n');
              }
              return d.text || d.caption || d.title || '';
            }).filter(Boolean).join('\n\n');
          }
        } catch (e) { /* 평문 취급 */ }
      }
      text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
      // 엔티티 디코드 (textarea 트릭 — 안전: 값만 읽고 DOM 삽입 안 함)
      if (typeof document !== 'undefined') {
        var ta = document.createElement('textarea');
        ta.innerHTML = text;
        text = ta.value;
      }
      return text;
    },
  };

  // ── 관련 기념품 picker (공개·관리자 작성폼 공통) ───────────────────────────
  // 공개 기념품을 검색해 칩으로 선택. /api/memorabilia/search(공개 항목만) 사용 → draft 누출 없음.
  // opts: { host, initial:[{id,title_ko,title_en,image_url,slug}], excludeId, idPrefix }
  // 반환: { getIds():[id], getItems():[...] }
  function attachRelatedMemorabilia(opts) {
    var host = opts.host;
    if (!host) throw new Error('attachRelatedMemorabilia: host required');
    var prefix = opts.idPrefix || 'mr';
    var excludeId = opts.excludeId != null ? parseInt(opts.excludeId, 10) : null;
    var MAX = 12;
    var selected = [];
    (opts.initial || []).forEach(function (it) {
      if (it && it.id != null && !selected.some(function (s) { return s.id === it.id; })) {
        selected.push({ id: it.id, title: it.title_ko || it.title_en || ('#' + it.id), image_url: it.image_url || '', slug: it.slug || '' });
      }
    });
    var results = [];
    var timer = null;

    function esc(s) { return GW.escapeHtml ? GW.escapeHtml(s) : String(s == null ? '' : s); }

    host.classList.add('gw-mr-picker');
    host.innerHTML =
      '<div class="gw-mr-selected" id="' + prefix + '-selected"></div>' +
      '<div class="gw-mr-input-wrap">' +
        '<input type="search" class="gw-mr-input" id="' + prefix + '-input" placeholder="기념품 제목 검색 후 클릭으로 추가" autocomplete="off" spellcheck="false" />' +
        '<div class="gw-mr-dropdown" id="' + prefix + '-dropdown" role="listbox" hidden></div>' +
      '</div>';
    var selEl = host.querySelector('#' + prefix + '-selected');
    var inputEl = host.querySelector('#' + prefix + '-input');
    var dropEl = host.querySelector('#' + prefix + '-dropdown');

    function renderSelected() {
      if (!selected.length) { selEl.innerHTML = '<span class="gw-mr-empty">선택된 관련 기념품 없음</span>'; return; }
      selEl.innerHTML = selected.map(function (it) {
        return '<span class="gw-mr-chip" data-id="' + it.id + '">' +
          (it.image_url ? '<img class="gw-mr-chip-thumb" src="' + esc(it.image_url) + '" alt="">' : '') +
          '<span class="gw-mr-chip-title">' + esc(it.title) + '</span>' +
          '<button type="button" class="gw-mr-chip-x" data-remove="' + it.id + '" aria-label="' + esc(it.title) + ' 제거">×</button>' +
        '</span>';
      }).join('');
    }
    function closeDropdown() { dropEl.hidden = true; dropEl.innerHTML = ''; }
    function renderDropdown() {
      var list = results.filter(function (r) {
        return r.id !== excludeId && !selected.some(function (s) { return s.id === r.id; });
      });
      if (!list.length) { closeDropdown(); return; }
      dropEl.innerHTML = list.map(function (r) {
        return '<button type="button" class="gw-mr-dd-item" data-id="' + r.id + '" role="option">' +
          (r.primary_image_url ? '<img class="gw-mr-dd-thumb" src="' + esc(r.primary_image_url) + '" alt="">' : '<span class="gw-mr-dd-thumb gw-mr-dd-thumb-empty"></span>') +
          '<span class="gw-mr-dd-title">' + esc(r.title_ko || r.title_en || ('#' + r.id)) + '</span>' +
          (r.year ? '<span class="gw-mr-dd-year">' + esc(r.year) + '</span>' : '') +
        '</button>';
      }).join('');
      dropEl.hidden = false;
    }
    function doSearch(q) {
      if (!q) { results = []; closeDropdown(); return; }
      fetch('/api/memorabilia/search?limit=8&q=' + encodeURIComponent(q), { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { results: [] }; })
        .then(function (data) { results = data.results || data.items || []; renderDropdown(); })
        .catch(function () { results = []; closeDropdown(); });
    }
    function addItem(r) {
      if (selected.length >= MAX) { if (GW.showToast) GW.showToast('관련 기념품은 최대 ' + MAX + '개까지 추가할 수 있습니다', 'error'); return; }
      if (r.id === excludeId || selected.some(function (s) { return s.id === r.id; })) return;
      selected.push({ id: r.id, title: r.title_ko || r.title_en || ('#' + r.id), image_url: r.primary_image_url || '', slug: r.slug || '' });
      inputEl.value = ''; results = []; closeDropdown(); renderSelected();
    }

    // 타이프어헤드 검색은 commit 액션이 아니라 라이브 조회 → 한글 조합 중에도 현재 값으로 검색해야
    // 한다(조합 중 스킵하면 한글이 사실상 검색 안 됨). debounce 로 과도한 호출만 억제.
    // compositionend 에서도 한 번 더 트리거해 마지막 음절 확정 직후 결과를 갱신.
    function scheduleSearch() {
      clearTimeout(timer);
      var q = inputEl.value.trim();
      timer = setTimeout(function () { doSearch(q); }, 200);
    }
    inputEl.addEventListener('input', scheduleSearch);
    inputEl.addEventListener('compositionend', scheduleSearch);
    inputEl.addEventListener('blur', function () { setTimeout(closeDropdown, 180); });
    dropEl.addEventListener('mousedown', function (e) {
      var btn = e.target.closest('[data-id]'); if (!btn) return;
      e.preventDefault();
      var r = results.find(function (x) { return String(x.id) === btn.getAttribute('data-id'); });
      if (r) addItem(r);
    });
    selEl.addEventListener('click', function (e) {
      var x = e.target.closest('[data-remove]'); if (!x) return;
      var id = parseInt(x.getAttribute('data-remove'), 10);
      selected = selected.filter(function (s) { return s.id !== id; });
      renderSelected();
    });

    renderSelected();
    return {
      getIds: function () { return selected.map(function (s) { return s.id; }); },
      getItems: function () { return selected.slice(); },
    };
  }

  GW.MemorabiliaRelated = { attach: attachRelatedMemorabilia };
})();
