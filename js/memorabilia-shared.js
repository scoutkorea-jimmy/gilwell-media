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

  // ── Country Picker 위젯 ─────────────────────────────────────────────────────
  // opts.host          — placeholder 컨테이너 (innerHTML 교체됨)
  // opts.initial       — string[] 선택 ISO-2 코드 배열
  // opts.onChange      — (codes:string[]) => void
  // opts.idPrefix      — 내부 ID 충돌 방지 prefix (기본: 'mcp')
  // returns { getValue, setValue, focus }
  function attachCountryPicker(opts) {
    const host = opts.host;
    if (!host) throw new Error('attachCountryPicker: host required');
    const prefix = opts.idPrefix || 'mcp';
    let selected = new Set(opts.initial || []);
    let query = '';
    let items = []; // 마지막 fetch 결과

    host.classList.add('gw-country-picker');
    host.innerHTML = `
      <div class="gw-cp-chip-area" id="${prefix}-chips" aria-live="polite"></div>
      <div class="gw-cp-search-row">
        <input type="search" class="gw-cp-search" id="${prefix}-search" placeholder="국가명 또는 코드 검색 (예: 몽골, MN)" autocomplete="off" spellcheck="false" />
        <span class="gw-cp-count" id="${prefix}-count"></span>
      </div>
      <div class="gw-cp-list" id="${prefix}-list" role="listbox" aria-multiselectable="true">
        <div class="gw-cp-loading">불러오는 중…</div>
      </div>
    `;

    const chipEl = host.querySelector('#' + prefix + '-chips');
    const searchEl = host.querySelector('#' + prefix + '-search');
    const countEl = host.querySelector('#' + prefix + '-count');
    const listEl = host.querySelector('#' + prefix + '-list');

    function emit() {
      if (typeof opts.onChange === 'function') opts.onChange(Array.from(selected));
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
      try {
        return safe.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>');
      } catch { return safe; }
    }

    function renderChips() {
      if (!selected.size) {
        chipEl.innerHTML = '<span class="gw-cp-chip-empty">선택된 국가 없음</span>';
        return;
      }
      const arr = Array.from(selected);
      chipEl.innerHTML = arr.map((code) =>
        `<button type="button" class="gw-cp-chip" data-remove="${escapeHtml(code)}">${escapeHtml(getCountryLabel(code))} (${escapeHtml(code)}) <span aria-hidden="true">×</span></button>`
      ).join('');
    }

    function renderList() {
      const q = query.trim().toLowerCase();
      const filtered = items.filter((c) => {
        if (!q) return true;
        if (c.code.toLowerCase().includes(q)) return true;
        if (c.name_ko && c.name_ko.toLowerCase().includes(q)) return true;
        if (c.name_en && c.name_en.toLowerCase().includes(q)) return true;
        return false;
      });
      countEl.textContent = q
        ? `${filtered.length}/${items.length}개`
        : `${items.length}개 국가`;

      if (!filtered.length) {
        listEl.innerHTML = '<div class="gw-cp-empty">검색 결과가 없습니다.</div>';
        return;
      }
      listEl.innerHTML = filtered.map((c) => {
        const on = selected.has(c.code);
        return `<button type="button" class="gw-cp-item${on ? ' is-selected' : ''}" data-code="${escapeHtml(c.code)}" role="option" aria-selected="${on}">
          <span class="gw-cp-item-check" aria-hidden="true">${on ? '✓' : ''}</span>
          <span class="gw-cp-item-name">${highlight(c.name_ko || c.code, q)}</span>
          <span class="gw-cp-item-en">${highlight(c.name_en || '', q)}</span>
          <span class="gw-cp-item-code">${escapeHtml(c.code)}</span>
        </button>`;
      }).join('');
    }

    // Events
    chipEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      selected.delete(btn.getAttribute('data-remove'));
      renderChips();
      renderList();
      emit();
    });

    searchEl.addEventListener('input', () => {
      query = searchEl.value || '';
      renderList();
    });

    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-code]');
      if (!btn) return;
      const code = btn.getAttribute('data-code');
      if (selected.has(code)) selected.delete(code);
      else selected.add(code);
      renderChips();
      renderList();
      emit();
    });

    // Load + initial render
    loadCountries().then((data) => {
      items = data;
      renderChips();
      renderList();
    }).catch(() => {
      listEl.innerHTML = '<div class="gw-cp-empty">국가 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</div>';
    });

    return {
      getValue: () => Array.from(selected),
      setValue: (codes) => {
        selected = new Set(Array.isArray(codes) ? codes : []);
        renderChips();
        renderList();
      },
      focus: () => searchEl && searchEl.focus(),
    };
  }

  GW.MemorabiliaCountries = {
    load: loadCountries,
    getLabel: getCountryLabel,
    attach: attachCountryPicker,
  };
})();
