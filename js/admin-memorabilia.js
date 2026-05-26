/**
 * Gilwell Media · Admin Memorabilia Controller
 *
 * 스카우트 기념품 도감 관리자 패널.
 * admin-v3.js 가 패널 전환을 담당하고, 이 파일은 panel-memorabilia /
 * panel-memorabilia-categories 의 데이터·이벤트만 담당한다.
 */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  const PAGE_SIZE = 30;
  const state = {
    items: [],
    total: 0,
    page: 1,                 // 1-based
    listEventFilter: '',     // event_id 필터 (빈문자열 = 전체)
    categories: [],
    events: [],              // memorabilia_events 카탈로그 캐시 (행사 picker 용)
    editing: null,           // null | item
    images: [],              // [{url, alt_en, alt_ko, is_primary, sort_order, uploading, previewDataUrl, _file}]
    links: [],               // [{label_en, label_ko, url}]
    countryPicker: null,     // GW.MemorabiliaCountries.attach() handle
    countryLabels: {},       // {code: {ko, en}} — 목록 메타·렌더 lookup 캐시
    selectedEventId: null,   // 편집 중인 항목의 event_id (autocomplete 결과)
    dropZoneBound: false,
    loadedOnce: false,
    catsLoadedOnce: false,
    eventsLoadedOnce: false,
    selectedIds: new Set(),  // 일괄 수정용 선택 항목 (현 페이지 한정)
    bulkEditCountryPicker: null,
    bulkEditEventPicker: null,
    // 행사 카탈로그 관련
    eventCategories: [],     // memorabilia_event_categories
    eventCatsLoadedOnce: false,
    selectedEventIds: new Set(),
    eventCategoryFilter: '', // '' = 전체, '__none__' = 미분류, '<id>' = 특정 카테고리
  };

  // 공유 모듈 hooks
  const upload = (window.GW && window.GW.MemorabiliaUpload) ? window.GW.MemorabiliaUpload : null;
  const countries = (window.GW && window.GW.MemorabiliaCountries) ? window.GW.MemorabiliaCountries : null;
  const eventsMod = (window.GW && window.GW.MemorabiliaEvents) ? window.GW.MemorabiliaEvents : null;
  let eventPickerHandle = null;

  // ── Helpers ─────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error || ''; } catch {}
      throw new Error(`HTTP ${res.status}${detail ? ' · ' + detail : ''}`);
    }
    return res.json();
  }

  function toast(msg, kind) {
    // 길월 미디어 표준 토스트가 있으면 사용, 없으면 alert 폴백
    if (window.GW && window.GW.toast) return window.GW.toast(msg, { kind });
    if (window.gwToast) return window.gwToast(msg, kind);
    console[kind === 'error' ? 'error' : 'log']('[memorabilia]', msg);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // 국가 카탈로그는 /api/memorabilia/countries (functions/_shared/country-code-labels.js)
  // 단일 소스에서 fetch. memorabilia-shared.js GW.MemorabiliaCountries 가 캐시·picker 위젯 담당.

  // ── Init: 패널 활성화 감지 ──────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-panel="memorabilia"], [data-panel="memorabilia-categories"], [data-panel="memorabilia-events"]');
    if (!btn) return;
    const panel = btn.getAttribute('data-panel');
    setTimeout(() => {
      if (panel === 'memorabilia' && !state.loadedOnce) bootList();
      if (panel === 'memorabilia-categories' && !state.catsLoadedOnce) bootCategories();
      if (panel === 'memorabilia-events' && !state.eventsLoadedOnce) bootEvents();
    }, 60);
  }, true);

  document.addEventListener('DOMContentLoaded', wireEvents);

  function wireEvents() {
    // List panel
    const newBtn = $('#memo-new-btn');
    if (newBtn) newBtn.addEventListener('click', () => openEditor(null));
    const searchInput = $('#memo-list-search');
    if (searchInput) searchInput.addEventListener('input', renderList);
    const eventFilter = $('#memo-list-event-filter');
    if (eventFilter) eventFilter.addEventListener('change', () => {
      state.listEventFilter = eventFilter.value || '';
      loadList(1);
    });

    // Edit modal
    const closeBtn = $('#memo-edit-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);
    const cancelBtn = $('#memo-edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);
    const saveBtn = $('#memo-edit-save');
    if (saveBtn) saveBtn.addEventListener('click', save);
    const deleteBtn = $('#memo-edit-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', remove);

    const hasEvent = $('#memo-has-event');
    if (hasEvent) hasEvent.addEventListener('change', () => {
      $('#memo-event-row').hidden = !hasEvent.checked;
    });

    const imageAdd = $('#memo-image-add');
    const imageInput = $('#memo-image-input');
    if (imageAdd && imageInput) {
      imageAdd.addEventListener('click', () => {
        console.log('[memo upload] image-add clicked → triggering file picker');
        imageInput.click();
      });
      imageInput.addEventListener('change', (e) => {
        console.log('[memo upload] file input change, files:', e.target.files?.length);
        onImageInput(e);
      });
    } else {
      console.warn('[memo upload] image-add or image-input not found at wire time', { imageAdd, imageInput });
    }

    const linkAdd = $('#memo-link-add');
    if (linkAdd) linkAdd.addEventListener('click', () => addLink());

    // Issuer autocomplete
    bindAutocomplete($('#memo-issuer-en'), $('#memo-issuer-en-suggest'), 'issuer');
    bindAutocomplete($('#memo-issuer-ko'), $('#memo-issuer-ko-suggest'), 'issuer');
    // Tag autocomplete (last token)
    bindTagAutocomplete($('#memo-tags'), $('#memo-tags-suggest'));

    // Bulk find/replace 일괄 수정 도구
    wireBulkReplaceOnce();

    // Categories panel
    const catNewBtn = $('#memo-cat-new-btn');
    if (catNewBtn) catNewBtn.addEventListener('click', () => openCategoryEditor(null));
    wireCategoryEditorOnce();

    // backdrop click closes
    const backdrop = $('#memo-edit-modal');
    if (backdrop) backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeEditor();
    });

    // 다른 도감에서 불러오기
    const importBtn = $('#memo-import-btn');
    if (importBtn) importBtn.addEventListener('click', openImportPanel);
    const importClose = $('#memo-import-close');
    if (importClose) importClose.addEventListener('click', closeImportPanel);
    const importSearch = $('#memo-import-search');
    if (importSearch) {
      importSearch.addEventListener('input', debounce(runImportSearch, 250));
      importSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runImportSearch(); }
      });
    }
  }

  // ── 다른 도감 정보 불러오기 ────────────────────────────────────────────
  function openImportPanel() {
    const panel = $('#memo-import-panel');
    if (!panel) return;
    panel.hidden = false;
    const input = $('#memo-import-search');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 30); }
    const results = $('#memo-import-results');
    if (results) results.innerHTML = '<div style="padding:12px; color:var(--gray-700,#3f3f3f); font-size:13px;">검색어를 입력하세요.</div>';
  }

  function closeImportPanel() {
    const panel = $('#memo-import-panel');
    if (panel) panel.hidden = true;
  }

  async function runImportSearch() {
    const input = $('#memo-import-search');
    const results = $('#memo-import-results');
    if (!input || !results) return;
    const q = input.value.trim();
    if (!q) { results.innerHTML = '<div style="padding:12px; color:var(--gray-700,#3f3f3f); font-size:13px;">검색어를 입력하세요.</div>'; return; }
    results.innerHTML = '<div style="padding:12px; color:var(--gray-700,#3f3f3f); font-size:13px;">검색 중…</div>';

    try {
      // 일반 검색 API 재사용 — admin 세션이면 drafts 까지 포함됨
      const res = await fetch(`/api/memorabilia/search?q=${encodeURIComponent(q)}&limit=20`, { credentials: 'same-origin' });
      if (!res.ok) {
        results.innerHTML = '<div style="padding:12px; color:var(--color-fire-red,#ff5655);">검색 실패</div>';
        return;
      }
      const data = await res.json();
      const items = data.items || data.results || [];
      // 현재 편집 중인 항목은 자기 자신 제외
      const currentId = state.editing?.id || null;
      const filtered = items.filter((it) => it.id !== currentId);
      if (!filtered.length) {
        results.innerHTML = '<div style="padding:12px; color:var(--gray-700,#3f3f3f); font-size:13px;">결과 없음</div>';
        return;
      }
      results.innerHTML = filtered.map((it) => {
        const title = it.title_ko || it.title_en || `#${it.id}`;
        const sub   = it.title_en && it.title_ko ? it.title_en : '';
        return `
          <div class="memo-import-row" style="padding:8px 12px; border-bottom:1px solid var(--gray-300,#c4c4c4); cursor:pointer;" data-id="${it.id}">
            <div style="font-weight:600; font-size:13px;">${escapeHtmlLocal(title)}</div>
            ${sub ? `<div style="font-size:11px; color:var(--gray-700,#3f3f3f);">${escapeHtmlLocal(sub)}</div>` : ''}
          </div>
        `;
      }).join('');
      results.querySelectorAll('[data-id]').forEach((row) => {
        row.addEventListener('click', () => importFromItem(parseInt(row.getAttribute('data-id'), 10)));
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--gray-100,#ebebeb)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
      });
    } catch (err) {
      results.innerHTML = '<div style="padding:12px; color:var(--color-fire-red,#ff5655);">네트워크 오류</div>';
    }
  }

  async function importFromItem(sourceId) {
    if (!Number.isFinite(sourceId)) return;
    try {
      const full = await fetchJson(`/api/memorabilia/${sourceId}`);
      const src = full.item;
      if (!src) { toast('불러올 항목을 찾지 못했습니다.', 'error'); return; }
      // 즉시 적용하지 않고 필드 선택 화면으로 이동 — 사용자가 어떤 필드를
      // 불러올지 직접 고를 수 있도록.
      showImportFieldSelector(src);
    } catch (err) {
      toast('불러오기 실패: ' + (err.message || ''), 'error');
    }
  }

  // 불러올 필드 선택 화면 — 결과 영역(#memo-import-results)을 교체.
  function showImportFieldSelector(src) {
    const results = $('#memo-import-results');
    if (!results) return;
    const title = src.title_ko || src.title_en || `#${src.id}`;

    // 카탈로그에서 카테고리 라벨 lookup
    const catRow = state.categories.find((c) => c.id === src.category_id);
    const catLabel = catRow ? (catRow.label_ko || catRow.label_en) : '—';
    const eventLabel = src.has_event
      ? (src.event_name_ko || src.event_name_en || src.event?.name_ko || src.event?.name_en || '(행사명)')
      : '— (행사 없음)';
    const countryLabel = (src.country_codes && src.country_codes.length)
      ? src.country_codes.map((c) => (state.countryLabels[c]?.ko) || c).join(', ')
      : '—';

    const fields = [
      { key: 'event',         label: '행사 정보',  preview: eventLabel },
      { key: 'year',          label: '연도',       preview: src.year ? String(src.year) : '—' },
      { key: 'category',      label: '분류',       preview: catLabel || '—' },
      { key: 'material',      label: '재질',       preview: (src.material_ko || src.material_en) || '—' },
      { key: 'size',          label: '크기',       preview: src.size_text || '—' },
      { key: 'issuer',        label: '제작기관',   preview: (src.issuer_ko || src.issuer_en) || '—' },
      { key: 'tags',          label: '태그',       preview: (src.tags && src.tags.length) ? src.tags.join(', ') : '—' },
      { key: 'country_codes', label: '국가',       preview: countryLabel },
    ];

    results.innerHTML = `
      <div style="padding: 12px;">
        <div style="font-size: 13px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--gray-300, #c4c4c4);">
          <strong>원본:</strong> ${escapeHtmlLocal(title)}
        </div>
        <div style="font-size: 11.5px; color: var(--gray-700, #3f3f3f); margin-bottom: 10px; line-height: 1.5;">
          불러올 필드만 체크하세요. 체크 해제한 필드는 현재 입력값을 그대로 유지합니다.
        </div>
        <div id="memo-import-field-list" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
          ${fields.map((f) => `
            <label style="display: flex; gap: 8px; align-items: flex-start; padding: 7px 10px; background: #fff; border: 1px solid var(--gray-300, #c4c4c4); border-radius: 6px; cursor: pointer;">
              <input type="checkbox" data-import-field="${f.key}" checked style="margin-top: 3px; accent-color: var(--color-scouting-purple, #622599);" />
              <div style="flex: 1; font-size: 12.5px;">
                <strong>${escapeHtmlLocal(f.label)}</strong>
                <div style="opacity: 0.75; margin-top: 2px; word-break: keep-all;">${escapeHtmlLocal(f.preview)}</div>
              </div>
            </label>
          `).join('')}
        </div>
        <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="v3-btn v3-btn-ghost v3-btn-sm" id="memo-import-back">← 검색으로</button>
          <button type="button" class="v3-btn v3-btn-outline v3-btn-sm" id="memo-import-toggle-all">전체 선택/해제</button>
          <button type="button" class="v3-btn v3-btn-primary v3-btn-sm" id="memo-import-apply">선택 항목 불러오기</button>
        </div>
      </div>
    `;

    $('#memo-import-back').addEventListener('click', () => runImportSearch());
    $('#memo-import-toggle-all').addEventListener('click', () => {
      const checks = results.querySelectorAll('input[type="checkbox"][data-import-field]');
      const allChecked = Array.from(checks).every((c) => c.checked);
      checks.forEach((c) => { c.checked = !allChecked; });
    });
    $('#memo-import-apply').addEventListener('click', () => {
      const checked = new Set();
      results.querySelectorAll('input[type="checkbox"][data-import-field]:checked').forEach((c) => {
        checked.add(c.getAttribute('data-import-field'));
      });
      if (!checked.size) { toast('하나 이상의 필드를 선택해주세요.', 'error'); return; }
      applyImportFields(src, checked);
    });
  }

  function applyImportFields(src, fieldsSet) {
    if (fieldsSet.has('event')) {
      $('#memo-has-event').checked = !!src.has_event;
      $('#memo-event-row').hidden = !src.has_event;
      if (src.event_id || src.event) {
        ensureEventPicker(src.event_id || null, src.event || null);
      }
    }
    if (fieldsSet.has('year'))     $('#memo-year').value         = src.year || '';
    if (fieldsSet.has('category')) $('#memo-category').value     = src.category_id || '';
    if (fieldsSet.has('material')) {
      $('#memo-material-en').value = src.material_en || '';
      $('#memo-material-ko').value = src.material_ko || '';
    }
    if (fieldsSet.has('size'))     $('#memo-size').value         = src.size_text || '';
    if (fieldsSet.has('issuer'))   {
      $('#memo-issuer-en').value = src.issuer_en || '';
      $('#memo-issuer-ko').value = src.issuer_ko || '';
    }
    if (fieldsSet.has('tags'))     $('#memo-tags').value         = (src.tags || []).join(', ');
    if (fieldsSet.has('country_codes') && state.countryPicker) {
      state.countryPicker.setValue(src.country_codes || []);
    }

    closeImportPanel();
    const title = src.title_ko || src.title_en || `#${src.id}`;
    toast(`"${title}" 의 ${fieldsSet.size}개 필드를 불러왔습니다. 제목·본문·이미지·관련링크는 그대로 유지됩니다.`, 'success');
  }

  function escapeHtmlLocal(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      const ctx = this;
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(ctx, args); }, ms);
    };
  }

  // ── Bulk toolbar + bulk-edit modal (선택 항목 일괄 수정) ───────────────
  function renderBulkToolbar() {
    const bar = $('#memo-bulk-toolbar');
    if (!bar) return;
    const n = state.selectedIds.size;
    if (n === 0) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <span><strong>${n}개</strong> 선택됨</span>
      <button type="button" class="v3-btn v3-btn-primary v3-btn-sm" id="memo-bulk-edit-open">📝 일괄 수정</button>
      <button type="button" class="v3-btn v3-btn-outline v3-btn-sm" id="memo-bulk-clear">선택 해제</button>
    `;
    $('#memo-bulk-edit-open').addEventListener('click', openBulkEdit);
    $('#memo-bulk-clear').addEventListener('click', () => {
      state.selectedIds.clear();
      renderList();
    });
  }

  let _bulkEditWired = false;
  function wireBulkEditOnce() {
    if (_bulkEditWired) return;
    _bulkEditWired = true;
    const closeBtn = $('#memo-bulkedit-close');
    const cancelBtn = $('#memo-bulkedit-cancel');
    const applyBtn = $('#memo-bulkedit-apply');
    const modal = $('#memo-bulkedit-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeBulkEdit);
    if (cancelBtn) cancelBtn.addEventListener('click', closeBulkEdit);
    if (applyBtn) applyBtn.addEventListener('click', applyBulkEdit);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeBulkEdit(); });

    // toggle 체크박스가 자기 필드 enable/disable 조작
    document.querySelectorAll('[data-bulk-toggle]').forEach((tog) => {
      tog.addEventListener('change', () => {
        const key = tog.getAttribute('data-bulk-toggle');
        const enabled = tog.checked;
        applyBulkToggleVisual(key, enabled);
      });
    });

    // event has_event 토글
    const hasEvent = $('#memo-bulkedit-has-event');
    if (hasEvent) hasEvent.addEventListener('change', () => {
      const picker = $('#memo-bulkedit-event-picker');
      if (picker) picker.style.display = hasEvent.checked ? '' : 'none';
    });
  }

  function applyBulkToggleVisual(key, enabled) {
    const m = {
      status:      [$('#memo-bulkedit-status')],
      category_id: [$('#memo-bulkedit-category')],
      event:       [$('#memo-bulkedit-event-wrap')],
      year:        [$('#memo-bulkedit-year')],
      issuer:      [$('#memo-bulkedit-issuer-en'), $('#memo-bulkedit-issuer-ko')],
      tags_add:    [$('#memo-bulkedit-tags-add')],
      tags_remove: [$('#memo-bulkedit-tags-remove')],
      countries:   [$('#memo-bulkedit-country-wrap')],
    };
    const list = m[key] || [];
    list.forEach((el) => {
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.disabled = !enabled;
      } else {
        el.style.opacity = enabled ? '1' : '.5';
        el.style.pointerEvents = enabled ? '' : 'none';
      }
    });
  }

  function openBulkEdit() {
    const n = state.selectedIds.size;
    if (!n) return;
    wireBulkEditOnce();

    // 카운트 + 카테고리 옵션 채우기
    $('#memo-bulkedit-count').textContent = `${n}개`;
    const catSel = $('#memo-bulkedit-category');
    if (catSel) {
      const opts = ['<option value="">(분류 없음)</option>'];
      for (const c of state.categories) {
        if (c.archived) continue;
        opts.push(`<option value="${c.id}">${escapeHtml(c.label_ko)} / ${escapeHtml(c.label_en)}</option>`);
      }
      catSel.innerHTML = opts.join('');
    }

    // 모든 toggle 초기화 (이전 세션 잔재 제거)
    document.querySelectorAll('[data-bulk-toggle]').forEach((tog) => {
      tog.checked = false;
      applyBulkToggleVisual(tog.getAttribute('data-bulk-toggle'), false);
    });
    // 입력값 초기화
    $('#memo-bulkedit-status').value = 'draft';
    $('#memo-bulkedit-category').value = '';
    $('#memo-bulkedit-has-event').checked = false;
    $('#memo-bulkedit-year').value = '';
    $('#memo-bulkedit-issuer-en').value = '';
    $('#memo-bulkedit-issuer-ko').value = '';
    $('#memo-bulkedit-tags-add').value = '';
    $('#memo-bulkedit-tags-remove').value = '';
    const setModeAdd = document.querySelector('input[name="memo-bulkedit-country-mode"][value="add"]');
    if (setModeAdd) setModeAdd.checked = true;

    // event picker + country picker 초기화
    if (eventsMod) {
      const host = $('#memo-bulkedit-event-picker');
      if (host) {
        state.bulkEditEventPicker = eventsMod.attach({
          host, initialId: null, initialEvent: null,
          idPrefix: 'memo-be-ep',
          onChange: () => {},
        });
      }
    }
    if (countries) {
      const host = $('#memo-bulkedit-country-picker');
      if (host) {
        state.bulkEditCountryPicker = countries.attach({
          host, initial: [], idPrefix: 'memo-be-cp',
        });
      }
    }

    $('#memo-bulkedit-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeBulkEdit() {
    const modal = $('#memo-bulkedit-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  function isToggleChecked(key) {
    const tog = document.querySelector(`[data-bulk-toggle="${key}"]`);
    return !!(tog && tog.checked);
  }

  async function applyBulkEdit() {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) { closeBulkEdit(); return; }

    const updates = {};
    if (isToggleChecked('status'))      updates.status      = $('#memo-bulkedit-status').value;
    if (isToggleChecked('category_id')) {
      const v = $('#memo-bulkedit-category').value;
      updates.category_id = v ? parseInt(v, 10) : null;
    }
    if (isToggleChecked('event')) {
      const has = $('#memo-bulkedit-has-event').checked;
      updates.has_event = has;
      const evId = state.bulkEditEventPicker ? state.bulkEditEventPicker.getEventId() : null;
      updates.event_id = has ? (evId || null) : null;
    }
    if (isToggleChecked('year')) {
      const v = $('#memo-bulkedit-year').value;
      updates.year = v ? parseInt(v, 10) : null;
    }
    if (isToggleChecked('issuer')) {
      updates.issuer_en = $('#memo-bulkedit-issuer-en').value || '';
      updates.issuer_ko = $('#memo-bulkedit-issuer-ko').value || '';
    }
    if (isToggleChecked('tags_add')) {
      const raw = $('#memo-bulkedit-tags-add').value || '';
      updates.add_tags = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (isToggleChecked('tags_remove')) {
      const raw = $('#memo-bulkedit-tags-remove').value || '';
      updates.remove_tags = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (isToggleChecked('countries')) {
      const mode = (document.querySelector('input[name="memo-bulkedit-country-mode"]:checked') || {}).value || 'add';
      const codes = state.bulkEditCountryPicker ? state.bulkEditCountryPicker.getValue() : [];
      if (mode === 'add')    updates.add_country_codes    = codes;
      if (mode === 'remove') updates.remove_country_codes = codes;
      if (mode === 'set')    updates.set_country_codes    = codes;
    }

    if (!Object.keys(updates).length) {
      toast('변경할 필드를 한 개 이상 체크하세요.', 'error');
      return;
    }

    if (!confirm(`${ids.length}개 항목에 일괄 적용합니다. 되돌릴 수 없으니 신중히 진행하세요. 계속할까요?`)) return;

    const btn = $('#memo-bulkedit-apply');
    btn.disabled = true; const orig = btn.textContent; btn.textContent = '적용 중…';
    try {
      const res = await fetch('/api/memorabilia/bulk-update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast('적용 실패: ' + (data.detail || data.error || `HTTP ${res.status}`), 'error');
        return;
      }
      const updated = data.updated || 0;
      const skipped = data.skipped || 0;
      const errCount = (data.errors || []).length;
      toast(`적용 완료 — 변경 ${updated}건 · 변경 없음 ${skipped}건${errCount ? ` · 오류 ${errCount}건` : ''}`, 'success');
      closeBulkEdit();
      state.selectedIds.clear();
      await loadList();
    } catch (err) {
      toast('네트워크 오류: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // ── Bulk find/replace (데이터 일괄 수정) ───────────────────────────────
  // 한글 "{국가} 대표단" 띄어쓰기 통일, 발행처 오탈자 통일 등.
  // /api/memorabilia/bulk-replace 호출. preset='country_rep_team_no_space' 또는
  // operations: [{field, find, replace}] 직접 지정.
  const BULK_FIELDS = [
    // memorabilia
    { value: 'issuer_ko',            label: '제작기관 (국문)',     table: 'memorabilia' },
    { value: 'issuer_en',            label: '제작기관 (영문)',     table: 'memorabilia' },
    { value: 'title_ko',             label: '제목 (국문)',         table: 'memorabilia' },
    { value: 'title_en',             label: '제목 (영문)',         table: 'memorabilia' },
    { value: 'event_name_ko',        label: '행사명 캐시 (국문)',  table: 'memorabilia' },
    { value: 'event_name_en',        label: '행사명 캐시 (영문)',  table: 'memorabilia' },
    { value: 'material_ko',          label: '재질 (국문)',         table: 'memorabilia' },
    { value: 'material_en',          label: '재질 (영문)',         table: 'memorabilia' },
    { value: 'size_text',            label: '크기',               table: 'memorabilia' },
    { value: 'description_ko',       label: '설명 (국문)',         table: 'memorabilia' },
    { value: 'description_en',       label: '설명 (영문)',         table: 'memorabilia' },
    { value: 'description_plain_ko', label: '설명 검색캐시 (국문)', table: 'memorabilia' },
    { value: 'description_plain_en', label: '설명 검색캐시 (영문)', table: 'memorabilia' },
    // memorabilia_events
    { value: 'name_ko',              label: '행사명 (국문) — 카탈로그',     table: 'memorabilia_events' },
    { value: 'name_en',              label: '행사명 (영문) — 카탈로그',     table: 'memorabilia_events' },
    { value: 'description_ko',       label: '행사 설명 (국문) — 카탈로그', table: 'memorabilia_events' },
    { value: 'description_en',       label: '행사 설명 (영문) — 카탈로그', table: 'memorabilia_events' },
  ];

  let _bulkWired = false;
  let _bulkRules = []; // { field, find, replace }

  function wireBulkReplaceOnce() {
    if (_bulkWired) return;
    _bulkWired = true;

    // 프리셋 버튼들 — data-preset
    document.querySelectorAll('button[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        const dryRun = btn.getAttribute('data-dry') === '1';
        runBulkReplace({ preset, dry_run: dryRun });
      });
    });

    // 수동 규칙
    $('#memo-bulk-rule-add')?.addEventListener('click', () => {
      _bulkRules.push({ field: 'issuer_ko', find: '', replace: '' });
      renderBulkRules();
    });
    $('#memo-bulk-manual-dry')?.addEventListener('click', () => {
      const ops = collectBulkRules();
      if (!ops.length) { toast('규칙을 한 개 이상 추가하세요.', 'error'); return; }
      runBulkReplace({ operations: ops, dry_run: true });
    });
    $('#memo-bulk-manual-apply')?.addEventListener('click', () => {
      const ops = collectBulkRules();
      if (!ops.length) { toast('규칙을 한 개 이상 추가하세요.', 'error'); return; }
      if (!confirm(`${ops.length}개 규칙을 모든 도감 항목에 일괄 적용합니다. 계속할까요?\n(되돌리기는 별도 규칙으로 다시 치환해야 함)`)) return;
      runBulkReplace({ operations: ops, dry_run: false });
    });

    // 결과 모달
    const closeBtn = $('#memo-bulk-result-close');
    const okBtn    = $('#memo-bulk-result-ok');
    const modal    = $('#memo-bulk-result-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeBulkResultModal);
    if (okBtn)    okBtn.addEventListener('click',    closeBulkResultModal);
    if (modal)    modal.addEventListener('click', (e) => { if (e.target === modal) closeBulkResultModal(); });
  }

  function renderBulkRules() {
    const wrap = $('#memo-bulk-rules');
    if (!wrap) return;
    if (!_bulkRules.length) { wrap.innerHTML = '<div style="font-size:12px; color:var(--gray-700,#3f3f3f); padding:4px 0;">규칙 없음 — "+ 규칙 추가" 로 시작하세요.</div>'; return; }
    wrap.innerHTML = _bulkRules.map((r, i) => `
      <div class="memo-bulk-rule-row" data-i="${i}" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <select class="v3-input v3-input-sm" data-bulk-field="${i}" style="min-width:180px;">
          ${BULK_FIELDS.map((f) => `<option value="${escapeHtml(f.value)}" ${f.value === r.field ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
        <input class="v3-input v3-input-sm" data-bulk-find="${i}" placeholder="찾을 문자열" value="${escapeHtml(r.find)}" style="flex:1; min-width:160px;"/>
        <span style="color:var(--gray-700,#3f3f3f);">→</span>
        <input class="v3-input v3-input-sm" data-bulk-replace="${i}" placeholder="바꿀 문자열 (빈값 가능 = 삭제)" value="${escapeHtml(r.replace)}" style="flex:1; min-width:160px;"/>
        <button type="button" class="v3-btn v3-btn-ghost v3-btn-sm" data-bulk-del="${i}" title="규칙 삭제">×</button>
      </div>
    `).join('');
    wrap.querySelectorAll('select[data-bulk-field]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = parseInt(sel.getAttribute('data-bulk-field'), 10);
        if (_bulkRules[i]) _bulkRules[i].field = sel.value;
      });
    });
    wrap.querySelectorAll('input[data-bulk-find]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.getAttribute('data-bulk-find'), 10);
        if (_bulkRules[i]) _bulkRules[i].find = inp.value;
      });
    });
    wrap.querySelectorAll('input[data-bulk-replace]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.getAttribute('data-bulk-replace'), 10);
        if (_bulkRules[i]) _bulkRules[i].replace = inp.value;
      });
    });
    wrap.querySelectorAll('button[data-bulk-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-bulk-del'), 10);
        _bulkRules.splice(i, 1);
        renderBulkRules();
      });
    });
  }

  function collectBulkRules() {
    return _bulkRules
      .filter((r) => r.field && r.find && r.find !== r.replace)
      .map((r) => ({ field: r.field, find: r.find, replace: r.replace || '' }));
  }

  async function runBulkReplace(body) {
    try {
      const res = await fetch('/api/memorabilia/bulk-replace', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(`실패: ${data.detail || data.error || ('HTTP ' + res.status)}`, 'error');
        return;
      }
      showBulkResult(data);
      // 적용된 경우 목록·카탈로그 캐시 새로고침
      if (!data.dry_run && data.total_changed) {
        if (eventsMod && typeof eventsMod.load === 'function') {
          try { await eventsMod.load(true); } catch {}
        }
        await loadList();
      }
    } catch (err) {
      toast('네트워크 오류: ' + err.message, 'error');
    }
  }

  function showBulkResult(data) {
    const modal   = $('#memo-bulk-result-modal');
    const summary = $('#memo-bulk-result-summary');
    const detail  = $('#memo-bulk-result-detail');
    if (!modal || !summary || !detail) return;

    const isDry = !!data.dry_run;
    const totalMatched = (data.results || []).reduce((s, r) => s + (r.matched || r.changed || 0), 0);
    const totalChanged = data.total_changed || 0;
    const fts = data.fts_synced || 0;

    summary.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
        ${isDry
          ? `<span class="v3-badge" style="background:rgba(98,37,153,0.15); color:var(--color-scouting-purple,#622599);">미리보기 — 매칭 ${totalMatched}건</span>`
          : `<span class="v3-badge v3-badge-success">변경 ${totalChanged}건</span>`
        }
        ${!isDry && fts ? `<span class="v3-badge v3-badge-muted">검색 인덱스 ${fts}건 재구성</span>` : ''}
      </div>
      <div style="font-size: 11.5px; color: var(--gray-700,#3f3f3f);">
        ${isDry ? '실제 변경은 일어나지 않았습니다. 적용하려면 다시 "적용" 버튼을 클릭하세요.' : '변경이 즉시 반영되었습니다.'}
      </div>
    `;

    const rows = (data.results || []).filter((r) => (r.matched || r.changed));
    if (rows.length) {
      detail.innerHTML = `
        <h4 style="margin:14px 0 6px; font-size:13px;">상세</h4>
        <div style="max-height:300px; overflow-y:auto; border:1px solid var(--gray-300,#c4c4c4); border-radius:6px; background:#fff;">
          <table class="v3-table" style="margin:0; font-size:12px;">
            <thead><tr><th style="width:22%">테이블 · 필드</th><th style="width:30%">찾기</th><th style="width:30%">바꾸기</th><th style="width:18%">${isDry ? '매칭' : '변경'}</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td><code style="font-size:11px;">${escapeHtmlLocal(r.table)}.${escapeHtmlLocal(r.field)}</code>${r.cascaded_from ? `<div style="font-size:10px; opacity:0.6;">↳ from ${escapeHtmlLocal(r.cascaded_from)}</div>` : ''}</td>
                  <td style="word-break:break-all;">${escapeHtmlLocal(r.find)}</td>
                  <td style="word-break:break-all;">${escapeHtmlLocal(r.replace) || '<span style="opacity:0.5;">(삭제)</span>'}</td>
                  <td>${isDry ? r.matched : r.changed}건</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      detail.innerHTML = `<p style="margin: 14px 0 0; font-size: 12.5px; color: var(--gray-700,#3f3f3f);">${isDry ? '매칭되는 항목이 없습니다.' : '변경된 항목이 없습니다.'}</p>`;
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeBulkResultModal() {
    const modal = $('#memo-bulk-result-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  // ── 목록 ────────────────────────────────────────────────────────────────
  async function bootList() {
    state.loadedOnce = true;
    await Promise.all([loadList(), loadCategories(true), ensureCountryLabels(), populateListEventFilter()]);
    populateCategorySelect();
    // 목록 한 번 더 렌더 — country labels 도착 이후 행사명·국가 셀에 반영
    renderList();
  }

  async function loadList(page) {
    if (typeof page === 'number') state.page = Math.max(1, page);
    try {
      const params = new URLSearchParams({ include_drafts: '1', limit: String(PAGE_SIZE), page: String(state.page) });
      if (state.listEventFilter) params.set('event_id', state.listEventFilter);
      const data = await fetchJson(`/api/memorabilia?${params.toString()}`);
      state.items = data.items || [];
      state.total = Number(data.total || 0);
      renderList();
      const meta = $('#memo-list-meta');
      if (meta) {
        const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
        const filterTag = state.listEventFilter ? ' · 행사 필터 적용' : '';
        meta.textContent = `${state.total}건 (드래프트 포함) · ${state.page}/${totalPages} 페이지${filterTag}`;
      }
    } catch (err) {
      toast('목록을 불러오지 못했습니다: ' + err.message, 'error');
    }
  }

  // 행사 필터 드롭다운 채우기 — events 카탈로그 캐시 사용
  async function populateListEventFilter() {
    const sel = $('#memo-list-event-filter');
    if (!sel || !eventsMod) return;
    try {
      const items = await eventsMod.load();
      const cur = state.listEventFilter || '';
      const opts = ['<option value="">행사 전체</option>'];
      items.filter((e) => !e.archived).forEach((ev) => {
        const label = (ev.name_ko || ev.name_en || `행사 #${ev.id}`)
          + (ev.period_text ? ` (${ev.period_text})` : '');
        opts.push(`<option value="${ev.id}">${escapeHtml(label)}</option>`);
      });
      sel.innerHTML = opts.join('');
      sel.value = cur;
    } catch {}
  }

  // 페이지네이션 UI 렌더 — table 아래에 페이지 번호 버튼.
  function renderPagination() {
    const wrap = $('#memo-list-wrap');
    if (!wrap) return;
    let pag = $('#memo-list-pagination');
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (totalPages <= 1) {
      if (pag) pag.remove();
      return;
    }
    if (!pag) {
      pag = document.createElement('div');
      pag.id = 'memo-list-pagination';
      pag.className = 'memo-list-pagination';
      wrap.appendChild(pag);
    }
    const cur = state.page;
    // 5개 윈도우 + 양 끝 + 점프 화살표
    const pages = [];
    const window2 = 2;
    for (let p = Math.max(1, cur - window2); p <= Math.min(totalPages, cur + window2); p += 1) pages.push(p);
    if (pages[0] > 1) pages.unshift('…');
    if (pages[0] !== 1) pages.unshift(1);
    if (pages[pages.length - 1] < totalPages - 1) pages.push('…');
    if (pages[pages.length - 1] !== totalPages) pages.push(totalPages);

    pag.innerHTML = [
      `<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>‹ 이전</button>`,
      ...pages.map((p) =>
        p === '…'
          ? '<span class="memo-list-pag-ellip">…</span>'
          : `<button type="button" class="v3-btn ${p === cur ? 'v3-btn-primary' : 'v3-btn-ghost'} v3-btn-sm" data-page="${p}">${p}</button>`
      ),
      `<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-page="${cur + 1}" ${cur === totalPages ? 'disabled' : ''}>다음 ›</button>`,
    ].join('');
    pag.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      const p = parseInt(btn.getAttribute('data-page'), 10);
      if (Number.isFinite(p) && p !== state.page) loadList(p);
    }, { once: true });
  }

  function renderList() {
    const wrap = $('#memo-list-wrap');
    if (!wrap) return;
    const q = ($('#memo-list-search')?.value || '').trim().toLowerCase();
    const items = !q ? state.items : state.items.filter((it) =>
      String(it.title_en || '').toLowerCase().includes(q) ||
      String(it.title_ko || '').toLowerCase().includes(q));
    if (!items.length) {
      wrap.innerHTML = '<div class="v3-empty">아직 항목이 없습니다. <button class="v3-btn v3-btn-primary v3-btn-sm" id="memo-empty-new">첫 항목 추가</button></div>';
      const b = $('#memo-empty-new'); if (b) b.addEventListener('click', () => openEditor(null));
      renderBulkToolbar();
      return;
    }
    // 현재 페이지의 표시 가능한 id 들
    const visibleIds = items.map((it) => it.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));

    const html = ['<table class="v3-table memo-list-table"><thead><tr>',
      `<th style="width:32px"><input type="checkbox" id="memo-list-select-all" ${allChecked ? 'checked' : ''} title="현재 페이지 전체 선택"/></th>`,
      '<th style="width:64px">이미지</th><th>제목</th><th>행사명</th><th style="width:80px">연도</th>',
      '<th style="width:120px">분류</th><th>태그</th>',
      '<th style="width:90px">상태</th><th style="width:80px"></th>',
      '</tr></thead><tbody>'];
    for (const it of items) {
      const thumb = it.primary_image_url
        ? `<img src="${escapeHtml(it.primary_image_url)}" alt="" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:4px"/>`
        : '<div style="width:48px;height:48px;background:var(--gray-100);border-radius:4px"></div>';
      const title = it.title_en || it.title_ko || '(제목 없음)';
      const sub = it.title_en && it.title_ko ? `<div style="font-size:.85em;opacity:.7">${escapeHtml(it.title_ko)}</div>` : '';
      // 행사명 — EN+KO 둘 다 있으면 두 줄, 하나만 있으면 한 줄, 행사 아님이면 —
      let eventCell = '—';
      if (it.has_event) {
        const en = String(it.event_name_en || '').trim();
        const ko = String(it.event_name_ko || '').trim();
        if (en && ko) eventCell = `<strong>${escapeHtml(en)}</strong><div style="font-size:.85em;opacity:.7">${escapeHtml(ko)}</div>`;
        else if (en) eventCell = `<strong>${escapeHtml(en)}</strong>`;
        else if (ko) eventCell = `<strong>${escapeHtml(ko)}</strong>`;
      }
      const cat = it.category_label_ko || it.category_label_en || '—';
      const statusBadge = it.status === 'public'
        ? '<span class="v3-badge v3-badge-success">공개</span>'
        : '<span class="v3-badge v3-badge-muted">초안</span>';
      // 태그 — 칩 형태로 (최대 5개 표시 + 잔여 카운트)
      const tags = Array.isArray(it.tags) ? it.tags : [];
      let tagCell = '<span style="opacity:.4;font-size:11px;">—</span>';
      if (tags.length) {
        const shown = tags.slice(0, 5);
        const rest = tags.length - shown.length;
        tagCell = shown.map((t) => `<span class="memo-tag-mini">${escapeHtml(t)}</span>`).join(' ')
          + (rest > 0 ? ` <span class="memo-tag-rest" title="${escapeHtml(tags.slice(5).join(', '))}">+${rest}</span>` : '');
      }
      const checked = state.selectedIds.has(it.id) ? 'checked' : '';
      // 행 전체가 클릭 타깃 (체크박스/편집 버튼은 stopPropagation 으로 분리)
      html.push(`<tr data-memo-row="${it.id}" style="cursor:pointer" class="${checked ? 'is-selected' : ''}">`,
        `<td><input type="checkbox" class="memo-row-check" data-memo-check="${it.id}" ${checked}/></td>`,
        `<td>${thumb}</td>`,
        `<td><strong>${escapeHtml(title)}</strong>${sub}</td>`,
        `<td>${eventCell}</td><td>${it.year || '—'}</td><td>${escapeHtml(cat)}</td>`,
        `<td><div class="memo-tag-mini-wrap">${tagCell}</div></td>`,
        `<td>${statusBadge}</td>`,
        `<td><button class="v3-btn v3-btn-outline v3-btn-sm" data-memo-edit="${it.id}">편집</button></td></tr>`);
    }
    html.push('</tbody></table>');
    wrap.innerHTML = html.join('');

    // 행 클릭 → openEditor
    $$('tr[data-memo-row]', wrap).forEach((row) => {
      row.addEventListener('click', () => {
        const id = parseInt(row.getAttribute('data-memo-row'), 10);
        const it = state.items.find((x) => x.id === id);
        if (it) openEditor(it);
      });
    });
    $$('button[data-memo-edit]', wrap).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(b.getAttribute('data-memo-edit'), 10);
        const it = state.items.find((x) => x.id === id);
        if (it) openEditor(it);
      });
    });
    // 체크박스 — 행 클릭/편집 모달 진입 차단 + 선택 상태 업데이트
    $$('input.memo-row-check', wrap).forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const id = parseInt(cb.getAttribute('data-memo-check'), 10);
        if (cb.checked) state.selectedIds.add(id);
        else            state.selectedIds.delete(id);
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', cb.checked);
        // header 전체 토글 동기화
        const head = $('#memo-list-select-all');
        if (head) {
          const checked = items.every((it) => state.selectedIds.has(it.id));
          head.checked = checked;
        }
        renderBulkToolbar();
      });
    });
    // header select-all — 현재 페이지의 모든 visibleIds 토글
    const head = $('#memo-list-select-all');
    if (head) {
      head.addEventListener('click', (e) => e.stopPropagation());
      head.addEventListener('change', () => {
        if (head.checked) for (const id of visibleIds) state.selectedIds.add(id);
        else              for (const id of visibleIds) state.selectedIds.delete(id);
        renderList();
      });
    }

    renderBulkToolbar();
    renderPagination();
  }

  // ── Editor modal ────────────────────────────────────────────────────────
  async function openEditor(item) {
    if (!state.categories.length) await loadCategories(true);
    populateCategorySelect();
    ensureCountryPicker(item?.country_codes || []);
    ensureEventPicker(item?.event_id || null, item?.event || null);
    setupDropZone();

    // Hydrate fields
    state.editing = item;
    if (item) {
      // 상세 fetch (full hydration)
      try {
        const full = await fetchJson(`/api/memorabilia/${item.id}`);
        item = full.item;
      } catch (err) {
        toast('상세 로드 실패: ' + err.message, 'error');
        return;
      }
      $('#memo-edit-title').textContent = '도감 항목 편집';
      $('#memo-edit-delete').hidden = false;
    } else {
      $('#memo-edit-title').textContent = '새 도감 항목';
      $('#memo-edit-delete').hidden = true;
    }

    $('#memo-title-en').value = item?.title_en || '';
    $('#memo-title-ko').value = item?.title_ko || '';
    $('#memo-has-event').checked = !!item?.has_event;
    $('#memo-event-row').hidden = !item?.has_event;
    // event_name 은 더 이상 free-text input 없음 — event picker (#memo-event-picker)
    // 가 책임. (ensureEventPicker 가 위에서 이미 초기화됨.)
    $('#memo-year').value = item?.year || '';
    $('#memo-category').value = item?.category_id || '';
    $('#memo-material-en').value = item?.material_en || '';
    $('#memo-material-ko').value = item?.material_ko || '';
    $('#memo-size').value = item?.size_text || '';
    $('#memo-issuer-en').value = item?.issuer_en || '';
    $('#memo-issuer-ko').value = item?.issuer_ko || '';
    $('#memo-tags').value = (item?.tags || []).join(', ');
    $('#memo-desc-en').value = readDescPlain(item?.description_en);
    $('#memo-desc-ko').value = readDescPlain(item?.description_ko);
    $('#memo-status').value = item?.status || 'draft';

    // country picker — initial 값 반영
    if (state.countryPicker) state.countryPicker.setValue(item?.country_codes || []);

    // event picker — 초기 openEditor 진입 시점에는 shallow list row 만 있어
    // event_id / event 가 없을 수 있다. 위 fetchJson(`/api/memorabilia/${id}`) 로
    // 받은 hydrated item 의 event 객체로 picker 를 재초기화.
    if (item && (item.event_id || item.event)) {
      ensureEventPicker(item.event_id || null, item.event || null);
    }

    state.images = (item?.images || []).map((img) => ({
      url: img.url, alt_en: img.alt_en || '', alt_ko: img.alt_ko || '',
      is_primary: !!img.is_primary, sort_order: img.sort_order || 0,
    }));
    state.links = (item?.related_links || []).map((l) => ({
      label_en: l.label_en || '', label_ko: l.label_ko || '', url: l.url || ''
    }));
    renderImages();
    renderLinks();

    $('#memo-edit-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    $('#memo-edit-modal').hidden = true;
    document.body.style.overflow = '';
    state.editing = null;
  }

  function readDescPlain(stored) {
    // 저장은 JSON 가능하지만 v1 에선 plain text 로 처리. JSON 이면 plaintext 추출.
    if (!stored) return '';
    if (typeof stored === 'string' && stored.trim().startsWith('{')) {
      try {
        const j = JSON.parse(stored);
        if (Array.isArray(j.blocks)) {
          return j.blocks.map((b) => (b.data && (b.data.text || b.data.caption || b.data.title)) || '')
            .filter(Boolean).map(stripHtml).join('\n\n');
        }
      } catch {}
    }
    return String(stored);
  }

  function stripHtml(s) {
    return String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function descToEditorJson(text) {
    // 단순 텍스트 → Editor.js paragraph 블록으로 래핑
    const t = String(text || '').trim();
    if (!t) return '';
    const blocks = t.split(/\n{2,}/).map((p) => ({
      type: 'paragraph',
      data: { text: escapeHtml(p).replace(/\n/g, '<br>') },
    }));
    return JSON.stringify({ blocks });
  }

  function populateCategorySelect() {
    const sel = $('#memo-category');
    if (!sel) return;
    const cur = sel.value;
    const opts = ['<option value="">분류 선택</option>'];
    for (const c of state.categories) {
      if (c.archived) continue;
      opts.push(`<option value="${c.id}">${escapeHtml(c.label_ko)} / ${escapeHtml(c.label_en)}</option>`);
    }
    sel.innerHTML = opts.join('');
    sel.value = cur;
  }

  // Event picker — /api/memorabilia/events + GW.MemorabiliaEvents.attach
  function ensureEventPicker(initialId, initialEvent) {
    if (!eventsMod) return;
    const host = $('#memo-event-picker');
    if (!host) return;
    state.selectedEventId = initialId || null;
    // 매 항목 편집 시 picker 새로 구성 (host innerHTML 교체).
    eventPickerHandle = eventsMod.attach({
      host,
      initialId, initialEvent,
      idPrefix: 'memo-ep',
      onChange: (id, ev) => {
        state.selectedEventId = id;
        // event 가 선택되면 cache 갱신용으로 이름도 기록
        if (ev) {
          // 저장 시 normalizeMemorabiliaInput 가 event_id 기반으로 cache 갱신.
        }
      },
    });
  }

  // Country picker — /api/memorabilia/countries + GW.MemorabiliaCountries.attach
  function ensureCountryPicker(initial) {
    if (!countries) return null;
    const host = $('#memo-country-picker');
    if (!host) return null;
    if (state.countryPicker) {
      state.countryPicker.setValue(initial || []);
      return state.countryPicker;
    }
    state.countryPicker = countries.attach({
      host,
      initial: initial || [],
      idPrefix: 'memo-admin-cp',
    });
    return state.countryPicker;
  }

  // 목록 행사명·국가 라벨용 캐시 (loadCategories 와 같은 시점에 1회 로드)
  async function ensureCountryLabels() {
    if (!countries) return;
    if (Object.keys(state.countryLabels).length) return;
    try {
      const items = await countries.load();
      items.forEach((c) => { state.countryLabels[c.code] = { ko: c.name_ko, en: c.name_en || c.code }; });
    } catch (err) {
      console.warn('country catalog load failed:', err);
    }
  }

  // ── Images (공개 측 memorabilia.js editor.addFiles 패턴과 동일) ──────────
  function renderImages() {
    const grid = $('#memo-images-grid');
    const empty = $('#memo-images-empty');
    const meta = $('#memo-images-meta');
    if (!grid || !empty) return;

    const hasAny = state.images.length > 0;
    grid.hidden = !hasAny;
    empty.hidden = hasAny;

    if (meta) {
      const total = state.images.filter((i) => !i.uploading).length;
      const uploading = state.images.filter((i) => i.uploading).length;
      meta.textContent = total + (uploading ? ` · ${uploading}장 업로드 중…` : '') + (total > 0 ? `장 (대표: ${state.images.find((i) => i.is_primary)?.url ? '✓' : '미지정'})` : '');
    }

    if (!hasAny) { grid.innerHTML = ''; return; }

    grid.innerHTML = state.images.map((img, i) => {
      const classes = ['memo-image-tile'];
      if (img.is_primary) classes.push('is-primary');
      if (img.uploading) classes.push('uploading');
      const badge = img.is_primary && !img.uploading ? '<div class="tile-badge">대표</div>' : '';
      const progress = img.uploading ? `<div class="tile-progress">${escapeHtml(img.progress || '업로드 중…')}</div>` : '';
      const previewSrc = img.url || img.previewDataUrl || '';
      return `
        <div class="${classes.join(' ')}" data-i="${i}">
          ${badge}
          <img src="${escapeHtml(previewSrc)}" alt=""/>
          ${progress}
          <div class="tile-actions">
            <label><input type="radio" name="memo-primary" ${img.is_primary ? 'checked' : ''} ${img.uploading ? 'disabled' : ''} data-primary-i="${i}"/> 대표</label>
            <button type="button" class="memo-btn memo-btn-sm memo-btn-danger" data-img-del="${i}" ${img.uploading ? 'disabled' : ''}>삭제</button>
          </div>
        </div>
      `;
    }).join('');

    $$('input[data-primary-i]', grid).forEach((r) => {
      r.addEventListener('change', () => {
        const i = parseInt(r.getAttribute('data-primary-i'), 10);
        state.images.forEach((img, idx) => { img.is_primary = idx === i; });
        renderImages();
      });
    });
    $$('button[data-img-del]', grid).forEach((b) => {
      b.addEventListener('click', () => {
        const i = parseInt(b.getAttribute('data-img-del'), 10);
        state.images.splice(i, 1);
        if (state.images.length && !state.images.some((img) => img.is_primary)) {
          state.images[0].is_primary = true;
        }
        renderImages();
      });
    });
  }

  function validateFile(file) {
    if (upload && typeof upload.validateFile === 'function') {
      const reason = upload.validateFile(file);
      return reason ? `${file?.name || ''}: ${reason}` : null;
    }
    if (!file) return '파일이 비어 있습니다.';
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) return `지원하지 않는 형식: ${file.name}`;
    if (file.size > 9 * 1024 * 1024) return `파일이 너무 큽니다 (>9MB): ${file.name}`;
    return null;
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    console.log('[memo upload] addFiles called with', files.length, 'file(s)', files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    if (!files.length) return;

    const errors = [];
    const placeholders = [];

    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        console.warn('[memo upload] client validation rejected:', file.name, '→', err);
        errors.push(err); continue;
      }
      let previewDataUrl = '';
      try { previewDataUrl = await readFileAsDataUrl(file); }
      catch (e) {
        console.error('[memo upload] FileReader failed:', file.name, e);
        errors.push(`미리보기 생성 실패: ${file.name}`); continue;
      }
      console.log('[memo upload] file ready:', file.name, 'dataURL bytes:', previewDataUrl.length);
      placeholders.push({
        url: '',
        previewDataUrl,
        alt_en: '', alt_ko: '',
        is_primary: false,
        sort_order: state.images.length + placeholders.length,
        uploading: true,
        progress: '업로드 중…',
        _file: file,
      });
    }

    if (!placeholders.length) {
      if (errors.length) flashError(errors.join('\n'));
      return;
    }

    const noPrimaryYet = !state.images.some((i) => i.is_primary);
    state.images.push(...placeholders);
    if (noPrimaryYet) placeholders[0].is_primary = true;
    renderImages();
    showUploadProgress(0, placeholders.length);

    let completed = 0;
    for (const ph of placeholders) {
      try {
        console.log('[memo upload] POST /api/memorabilia/upload-image for', ph._file?.name);
        const res = await fetch('/api/memorabilia/upload-image', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data_url: ph.previewDataUrl }),
        });
        const data = await res.json().catch(() => ({}));
        console.log('[memo upload] response', res.status, data);
        if (!res.ok || !data.url) {
          const reason = upload
            ? upload.describeError(data, `HTTP ${res.status}`)
            : (data.reason || data.error || `HTTP ${res.status}`);
          errors.push(`${ph._file?.name || '이미지'}: ${reason}`);
          const idx = state.images.indexOf(ph);
          if (idx >= 0) state.images.splice(idx, 1);
          continue;
        }
        ph.url = data.url;
        ph.uploading = false;
        ph.previewDataUrl = '';
        ph._file = null;
      } catch (err) {
        console.error('[memo upload] fetch threw:', err);
        const reason = upload
          ? upload.describeError({ error: 'network' }, err.message)
          : (err.message || '네트워크 오류');
        errors.push(`${ph._file?.name || '이미지'}: ${reason}`);
        const idx = state.images.indexOf(ph);
        if (idx >= 0) state.images.splice(idx, 1);
      }
      completed += 1;
      renderImages();
      showUploadProgress(completed, placeholders.length);
    }

    if (state.images.length && !state.images.some((i) => i.is_primary)) {
      const firstReady = state.images.find((i) => !i.uploading);
      if (firstReady) firstReady.is_primary = true;
      renderImages();
    }

    // 완료 메시지 → 2초 후 사라짐
    const okCount = placeholders.length - errors.length;
    if (okCount > 0) {
      showUploadProgress(placeholders.length, placeholders.length, `✓ ${okCount}장 업로드 완료`);
      setTimeout(() => hideUploadProgress(), 2200);
    } else {
      hideUploadProgress();
    }

    if (errors.length) flashError(errors.join('\n'));
  }

  // 이미지 영역 상단 진행 바 — "⬆ 업로드 중… 1/3" + 진행률.
  function showUploadProgress(done, total, customLabel) {
    const meta = $('#memo-images-meta');
    if (!meta) return;
    const label = customLabel || (done < total
      ? `⬆ 업로드 중… ${done} / ${total}`
      : `⬆ 업로드 중… ${total}장 준비`);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    meta.innerHTML = `<div class="memo-upload-bar">
      <span class="memo-upload-bar-label">${label}</span>
      <span class="memo-upload-bar-track"><span class="memo-upload-bar-fill" style="width:${pct}%"></span></span>
    </div>`;
  }
  function hideUploadProgress() {
    const meta = $('#memo-images-meta');
    if (meta) meta.textContent = '';
  }

  function flashError(msg) {
    if (window.GW && typeof window.GW.showToast === 'function') {
      try { window.GW.showToast(msg, 'error'); return; } catch {}
    }
    if (window.gwToast) { try { window.gwToast(msg, 'error'); return; } catch {} }
    alert(msg);
  }

  function setupDropZone() {
    const zone = $('#memo-images-zone');
    if (!zone || state.dropZoneBound) return;
    state.dropZoneBound = true;
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === 'dragleave' && zone.contains(e.relatedTarget)) return;
      zone.classList.remove('drag-over');
    }));
    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      addFiles(dt.files);
    });
  }

  async function onImageInput(e) {
    // ⚠ FileList 는 input value 가 비워지면 invalidate 되므로, addFiles 호출 전에
    // Array.from 으로 File 객체들의 스냅샷을 만들어야 한다. 이전엔 `files = e.target.files`
    // 후 곧바로 value='' 처리해서 addFiles 가 빈 배열을 받던 회귀가 있었다.
    const files = Array.from(e.target.files || []);
    try { e.target.value = ''; } catch {}
    await addFiles(files);
  }

  // ── Links ───────────────────────────────────────────────────────────────
  function renderLinks() {
    const wrap = $('#memo-links-wrap');
    if (!wrap) return;
    if (!state.links.length) {
      wrap.innerHTML = '<div class="v3-inline-meta">관련 링크 없음.</div>';
      return;
    }
    wrap.innerHTML = state.links.map((l, i) => `
      <div class="memo-link-row" data-i="${i}" style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
        <input class="v3-input" placeholder="라벨 EN" value="${escapeHtml(l.label_en)}" data-link-field="label_en" data-i="${i}" style="flex:1"/>
        <input class="v3-input" placeholder="라벨 KO" value="${escapeHtml(l.label_ko)}" data-link-field="label_ko" data-i="${i}" style="flex:1"/>
        <input class="v3-input" placeholder="URL (https:// 또는 /...)" value="${escapeHtml(l.url)}" data-link-field="url" data-i="${i}" style="flex:2"/>
        <button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-link-del="${i}">삭제</button>
      </div>
    `).join('');
    $$('input[data-link-field]', wrap).forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.getAttribute('data-i'), 10);
        const f = inp.getAttribute('data-link-field');
        if (state.links[i]) state.links[i][f] = inp.value;
      });
    });
    $$('button[data-link-del]', wrap).forEach((b) => {
      b.addEventListener('click', () => {
        const i = parseInt(b.getAttribute('data-link-del'), 10);
        state.links.splice(i, 1);
        renderLinks();
      });
    });
  }
  function addLink() {
    state.links.push({ label_en: '', label_ko: '', url: '' });
    renderLinks();
  }

  // ── Autocomplete ────────────────────────────────────────────────────────
  function bindAutocomplete(input, dropdown, type) {
    if (!input || !dropdown) return;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { dropdown.innerHTML = ''; dropdown.hidden = true; return; }
      timer = setTimeout(async () => {
        try {
          const res = await fetchJson(`/api/memorabilia/autocomplete?type=${type}&q=${encodeURIComponent(q)}`);
          const items = res.items || [];
          if (!items.length) { dropdown.hidden = true; return; }
          dropdown.innerHTML = items.map((s) => `<div class="v3-autocomplete-item" data-val="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
          dropdown.hidden = false;
          $$('.v3-autocomplete-item', dropdown).forEach((d) => {
            d.addEventListener('mousedown', (e) => {
              e.preventDefault();
              input.value = d.getAttribute('data-val');
              dropdown.hidden = true;
            });
          });
        } catch {}
      }, 220);
    });
    input.addEventListener('blur', () => setTimeout(() => { dropdown.hidden = true; }, 150));
  }

  function bindTagAutocomplete(input, dropdown) {
    if (!input || !dropdown) return;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const parts = input.value.split(',');
      const last = (parts[parts.length - 1] || '').trim();
      if (last.length < 1) { dropdown.hidden = true; return; }
      timer = setTimeout(async () => {
        try {
          const res = await fetchJson(`/api/memorabilia/autocomplete?type=tag&q=${encodeURIComponent(last)}`);
          const items = (res.items || []).filter((s) => s.toLowerCase() !== last.toLowerCase());
          if (!items.length) { dropdown.hidden = true; return; }
          dropdown.innerHTML = items.map((s) => `<div class="v3-autocomplete-item" data-val="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
          dropdown.hidden = false;
          $$('.v3-autocomplete-item', dropdown).forEach((d) => {
            d.addEventListener('mousedown', (e) => {
              e.preventDefault();
              parts[parts.length - 1] = ' ' + d.getAttribute('data-val');
              input.value = parts.join(',') + ', ';
              dropdown.hidden = true;
              input.focus();
            });
          });
        } catch {}
      }, 200);
    });
    input.addEventListener('blur', () => setTimeout(() => { dropdown.hidden = true; }, 150));
  }

  // ── Save / Delete ───────────────────────────────────────────────────────
  async function save() {
    const country_codes = state.countryPicker ? state.countryPicker.getValue() : [];
    const tagsRaw = $('#memo-tags').value || '';
    const tags = tagsRaw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);

    const body = {
      title_en: $('#memo-title-en').value || '',
      title_ko: $('#memo-title-ko').value || '',
      has_event: !!$('#memo-has-event').checked,
      event_id: state.selectedEventId || null,
      // event_name_* 는 카탈로그 참조가 있으면 서버가 카탈로그 이름으로 덮어씀.
      // 카탈로그 없이 free-text 입력하던 legacy 항목 호환용으로 빈 문자열 유지.
      event_name_en: '',
      event_name_ko: '',
      year: $('#memo-year').value || null,
      category_id: $('#memo-category').value ? parseInt($('#memo-category').value, 10) : null,
      material_en: $('#memo-material-en').value || '',
      material_ko: $('#memo-material-ko').value || '',
      size_text: $('#memo-size').value || '',
      issuer_en: $('#memo-issuer-en').value || '',
      issuer_ko: $('#memo-issuer-ko').value || '',
      description_en: descToEditorJson($('#memo-desc-en').value),
      description_ko: descToEditorJson($('#memo-desc-ko').value),
      related_links: state.links.filter((l) => l.url),
      country_codes,
      tags,
      images: state.images,
      status: $('#memo-status').value || 'draft',
    };

    const saveBtn = $('#memo-edit-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중…';
    try {
      if (state.editing && state.editing.id) {
        // Optimistic locking — 편집 진입 시점의 updated_at 을 동봉. 서버가
        // 현재 row 와 다르면 409 + reason 으로 친절한 안내. (안정성 3차)
        body.expected_updated_at = state.editing.updated_at || null;
        const res = await fetch(`/api/memorabilia/${state.editing.id}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.error === 'version_mismatch') {
          flashError(data.reason || '다른 운영자가 먼저 저장했습니다. 새로고침 후 다시 시도해주세요.');
          return; // 모달은 열려 있는 상태로 유지
        }
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        toast('수정 완료', 'success');
      } else {
        await fetchJson('/api/memorabilia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast('생성 완료', 'success');
      }
      closeEditor();
      await loadList();
    } catch (err) {
      toast('저장 실패: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '저장';
    }
  }

  async function remove() {
    if (!state.editing || !state.editing.id) return;
    if (!confirm('이 도감 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await fetchJson(`/api/memorabilia/${state.editing.id}`, { method: 'DELETE' });
      toast('삭제됨', 'success');
      closeEditor();
      await loadList();
    } catch (err) {
      toast('삭제 실패: ' + err.message, 'error');
    }
  }

  // ── Categories panel ────────────────────────────────────────────────────
  async function bootCategories() {
    state.catsLoadedOnce = true;
    await loadCategories(true);
    renderCategories();
  }

  async function loadCategories(silent) {
    try {
      const data = await fetchJson('/api/memorabilia/categories');
      state.categories = data.items || [];
      if (!silent) {
        const meta = $('#memo-cat-meta');
        if (meta) meta.textContent = `${state.categories.length}개 분류`;
        renderCategories();
      }
    } catch (err) {
      if (!silent) toast('분류 목록 실패: ' + err.message, 'error');
    }
  }

  function renderCategories() {
    const wrap = $('#memo-cat-list-wrap');
    if (!wrap) return;
    const meta = $('#memo-cat-meta');
    if (meta) meta.textContent = `${state.categories.length}개 분류 · 사용 중인 분류는 아카이브 처리됩니다.`;

    if (!state.categories.length) {
      wrap.innerHTML = '<div class="v3-empty">분류가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = `<table class="v3-table">
      <thead><tr><th>슬러그</th><th>영문 라벨</th><th>국문 라벨</th><th style="width:80px">정렬</th><th style="width:80px">상태</th><th style="width:80px"></th></tr></thead>
      <tbody>${state.categories.map((c) => `
        <tr data-cat-id="${c.id}">
          <td><code>${escapeHtml(c.slug)}</code></td>
          <td>${escapeHtml(c.label_en)}</td>
          <td>${escapeHtml(c.label_ko)}</td>
          <td>${c.sort_order}</td>
          <td>${c.archived ? '<span class="v3-badge v3-badge-muted">아카이브</span>' : '<span class="v3-badge v3-badge-success">활성</span>'}</td>
          <td><button class="v3-btn v3-btn-outline v3-btn-sm" data-cat-edit="${c.id}">편집</button></td>
        </tr>`).join('')}</tbody></table>`;

    $$('button[data-cat-edit]', wrap).forEach((b) => b.addEventListener('click', () => {
      const id = parseInt(b.getAttribute('data-cat-edit'), 10);
      const target = state.categories.find((x) => x.id === id);
      if (target) openCategoryEditor(target);
    }));
  }

  // 분류 추가/편집 모달 (prompt() 대체).
  let _editingCategory = null;
  let _catEditorWiredOnce = false;
  function wireCategoryEditorOnce() {
    if (_catEditorWiredOnce) return;
    _catEditorWiredOnce = true;
    $('#memo-cat-edit-close')?.addEventListener('click', closeCategoryEditor);
    $('#memo-cat-edit-cancel')?.addEventListener('click', closeCategoryEditor);
    $('#memo-cat-edit-save')?.addEventListener('click', saveCategory);
    $('#memo-cat-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'memo-cat-edit-modal') closeCategoryEditor();
    });
  }
  function openCategoryEditor(cat) {
    _editingCategory = cat || null;
    $('#memo-cat-edit-title').textContent = cat ? '분류 편집' : '새 분류';
    const slugInput = $('#memo-cat-slug');
    slugInput.value = cat ? cat.slug : '';
    slugInput.disabled = !!cat; // 편집 시 slug 변경 금지 (URL/DB 식별자 안정성)
    $('#memo-cat-label-en').value = cat?.label_en || '';
    $('#memo-cat-label-ko').value = cat?.label_ko || '';
    $('#memo-cat-sort').value = cat?.sort_order != null ? cat.sort_order : 999;
    $('#memo-cat-archived').checked = !!cat?.archived;
    $('#memo-cat-edit-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCategoryEditor() {
    $('#memo-cat-edit-modal').hidden = true;
    document.body.style.overflow = '';
    _editingCategory = null;
  }
  async function saveCategory() {
    const body = {
      label_en: $('#memo-cat-label-en').value.trim(),
      label_ko: $('#memo-cat-label-ko').value.trim(),
      sort_order: parseInt($('#memo-cat-sort').value, 10) || 999,
      archived: $('#memo-cat-archived').checked,
    };
    if (!_editingCategory) {
      const slug = $('#memo-cat-slug').value.trim();
      if (!slug) { toast('슬러그를 입력하세요', 'error'); return; }
      if (!/^[a-z0-9-]+$/.test(slug)) { toast('슬러그는 영문 소문자·숫자·하이픈만 허용', 'error'); return; }
      body.slug = slug;
    }
    if (!body.label_en && !body.label_ko) { toast('영문 또는 국문 라벨 중 하나는 필수', 'error'); return; }
    const saveBtn = $('#memo-cat-edit-save');
    saveBtn.disabled = true; const orig = saveBtn.textContent; saveBtn.textContent = '저장 중…';
    try {
      const url = _editingCategory ? `/api/memorabilia/categories/${_editingCategory.id}` : '/api/memorabilia/categories';
      const method = _editingCategory ? 'PATCH' : 'POST';
      await fetchJson(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      closeCategoryEditor();
      await loadCategories(false);
      toast(_editingCategory ? '분류 저장됨' : '분류 추가됨', 'success');
    } catch (err) {
      toast((_editingCategory ? '저장' : '추가') + ' 실패: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = orig;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 행사 카탈로그 (panel-memorabilia-events)
  // ══════════════════════════════════════════════════════════════════════════
  let _editingEvent = null;   // 모달에 hydrated 된 행사 row | null (신규)
  let _eventsWiredOnce = false;

  async function bootEvents() {
    state.eventsLoadedOnce = true;
    wireEventsPanelOnce();
    await Promise.all([loadEventCategories(), loadEventsList()]);
    populateEventCategoryControls();
    renderEventsList();
  }

  // 행사 카테고리 카탈로그 로드 (모달·필터·편집 모달 select 채우기)
  async function loadEventCategories() {
    try {
      const data = await fetchJson('/api/memorabilia/event-categories?include_archived=1');
      state.eventCategories = data.items || [];
      state.eventCatsLoadedOnce = true;
    } catch (err) {
      state.eventCategories = [];
      console.warn('event categories load failed:', err);
    }
  }

  function populateEventCategoryControls() {
    // 필터 드롭다운
    const filter = $('#memo-ev-filter-category');
    if (filter) {
      const cur = filter.value;
      const opts = ['<option value="">카테고리 전체</option>', '<option value="__none__">미분류만</option>'];
      for (const c of state.eventCategories) {
        if (c.archived) continue;
        opts.push(`<option value="${c.id}">${escapeHtml(c.label_ko || c.label_en)}</option>`);
      }
      filter.innerHTML = opts.join('');
      filter.value = cur;
    }
    // 편집 모달 select
    const editSel = $('#memo-ev-category');
    if (editSel) {
      const cur = editSel.value;
      const opts = ['<option value="">(미분류)</option>'];
      for (const c of state.eventCategories) {
        if (c.archived) continue;
        opts.push(`<option value="${c.id}">${escapeHtml(c.label_ko || c.label_en)}</option>`);
      }
      editSel.innerHTML = opts.join('');
      editSel.value = cur;
    }
    // bulk 모달 select
    const bulkSel = $('#memo-ev-bulk-category');
    if (bulkSel) {
      const cur = bulkSel.value;
      const opts = ['<option value="">(미분류로 설정)</option>'];
      for (const c of state.eventCategories) {
        if (c.archived) continue;
        opts.push(`<option value="${c.id}">${escapeHtml(c.label_ko || c.label_en)}</option>`);
      }
      bulkSel.innerHTML = opts.join('');
      bulkSel.value = cur;
    }
  }

  function wireEventsPanelOnce() {
    if (_eventsWiredOnce) return;
    _eventsWiredOnce = true;
    const newBtn = $('#memo-ev-new-btn');
    if (newBtn) newBtn.addEventListener('click', () => openEventEditor(null));
    const closeBtn = $('#memo-ev-edit-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEventEditor);
    const cancelBtn = $('#memo-ev-edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEventEditor);
    const saveBtn = $('#memo-ev-edit-save');
    if (saveBtn) saveBtn.addEventListener('click', saveEvent);
    const deleteBtn = $('#memo-ev-edit-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteEventRow);
    const backdrop = $('#memo-ev-edit-modal');
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeEventEditor(); });

    // CSV 일괄 처리
    const tmplBtn   = $('#memo-ev-tmpl-btn');
    const exportBtn = $('#memo-ev-export-btn');
    const importBtn = $('#memo-ev-import-btn');
    const fileInput = $('#memo-ev-import-input');
    if (tmplBtn)   tmplBtn.addEventListener('click', () => downloadEventsCsv(true));
    if (exportBtn) exportBtn.addEventListener('click', () => downloadEventsCsv(false));
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', onCsvImport);
    }
    const resultClose = $('#memo-ev-csv-result-close');
    const resultOk    = $('#memo-ev-csv-result-ok');
    const resultModal = $('#memo-ev-csv-result-modal');
    if (resultClose) resultClose.addEventListener('click', closeCsvResultModal);
    if (resultOk)    resultOk.addEventListener('click', closeCsvResultModal);
    if (resultModal) resultModal.addEventListener('click', (e) => { if (e.target === resultModal) closeCsvResultModal(); });

    // 카테고리 관리 모달
    const catsOpenBtn  = $('#memo-ev-cats-open');
    const catsCloseBtn = $('#memo-ev-cats-close');
    const catsDoneBtn  = $('#memo-ev-cats-done');
    const catsModal    = $('#memo-ev-cats-modal');
    const catAddBtn    = $('#memo-ev-cat-add');
    if (catsOpenBtn)  catsOpenBtn.addEventListener('click', openEventCategoriesModal);
    if (catsCloseBtn) catsCloseBtn.addEventListener('click', closeEventCategoriesModal);
    if (catsDoneBtn)  catsDoneBtn.addEventListener('click', closeEventCategoriesModal);
    if (catsModal)    catsModal.addEventListener('click', (e) => { if (e.target === catsModal) closeEventCategoriesModal(); });
    if (catAddBtn)    catAddBtn.addEventListener('click', addEventCategory);

    // 카테고리 필터
    const catFilter = $('#memo-ev-filter-category');
    if (catFilter) catFilter.addEventListener('change', () => {
      state.eventCategoryFilter = catFilter.value;
      renderEventsList();
    });

    // 행사 일괄 수정 모달
    const bulkClose  = $('#memo-ev-bulk-close');
    const bulkCancel = $('#memo-ev-bulk-cancel');
    const bulkApply  = $('#memo-ev-bulk-apply');
    const bulkModal  = $('#memo-ev-bulk-modal');
    if (bulkClose)  bulkClose.addEventListener('click', closeEventsBulkModal);
    if (bulkCancel) bulkCancel.addEventListener('click', closeEventsBulkModal);
    if (bulkApply)  bulkApply.addEventListener('click', applyEventsBulkUpdate);
    if (bulkModal)  bulkModal.addEventListener('click', (e) => { if (e.target === bulkModal) closeEventsBulkModal(); });
    const togCat  = $('#memo-ev-bulk-toggle-cat');
    const togArch = $('#memo-ev-bulk-toggle-arch');
    if (togCat)  togCat.addEventListener('change',  () => { $('#memo-ev-bulk-category').disabled = !togCat.checked; });
    if (togArch) togArch.addEventListener('change', () => { $('#memo-ev-bulk-archived').disabled = !togArch.checked; });
  }

  // ── CSV 일괄 처리 ───────────────────────────────────────────────────────
  function downloadEventsCsv(isTemplate) {
    const url = '/api/memorabilia/events/csv' + (isTemplate ? '?template=1' : '');
    // anchor 클릭으로 다운로드 — fetch 후 blob 으로 처리할 수도 있으나
    // 단순 GET + Content-Disposition 으로 충분.
    const a = document.createElement('a');
    a.href = url;
    a.download = ''; // 서버 헤더가 우선
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function onCsvImport(e) {
    const file = e.target.files && e.target.files[0];
    try { e.target.value = ''; } catch {}
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !file.type.includes('csv')) {
      toast('CSV 파일만 업로드 가능합니다.', 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch (err) {
      toast('파일 읽기 실패: ' + err.message, 'error');
      return;
    }
    if (!text.trim()) { toast('빈 파일입니다.', 'error'); return; }

    try {
      const res = await fetch('/api/memorabilia/events/csv', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(`업로드 실패: ${data.detail || data.error || ('HTTP ' + res.status)}`, 'error');
        return;
      }
      showCsvResult(data);
      // 카탈로그 캐시 + 목록 갱신
      if (eventsMod && typeof eventsMod.load === 'function') {
        try { await eventsMod.load(true); } catch {}
      }
      await loadEventsList();
      renderEventsList();
    } catch (err) {
      toast('네트워크 오류: ' + err.message, 'error');
    }
  }

  function showCsvResult(data) {
    const modal   = $('#memo-ev-csv-result-modal');
    const summary = $('#memo-ev-csv-result-summary');
    const errors  = $('#memo-ev-csv-result-errors');
    if (!modal || !summary || !errors) return;

    const inserted = data.inserted || 0;
    const updated  = data.updated  || 0;
    const skipped  = data.skipped  || 0;
    const errList  = Array.isArray(data.errors) ? data.errors : [];

    summary.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <span class="v3-badge v3-badge-success">신규 ${inserted}건</span>
        <span class="v3-badge" style="background:rgba(98,37,153,0.12); color:var(--color-scouting-purple,#622599);">업데이트 ${updated}건</span>
        ${skipped ? `<span class="v3-badge v3-badge-muted">스킵 ${skipped}건</span>` : ''}
        ${errList.length ? `<span class="v3-badge" style="background:rgba(255,86,85,0.15); color:#c33;">오류 ${errList.length}건</span>` : ''}
      </div>
    `;

    if (errList.length) {
      errors.innerHTML = `
        <h4 style="margin:14px 0 6px; font-size:13px;">오류 상세</h4>
        <div style="max-height:240px; overflow-y:auto; border:1px solid var(--gray-300,#c4c4c4); border-radius:6px; padding:8px 12px; background:#fff; font-size:12.5px;">
          ${errList.map((er) => `
            <div style="padding:4px 0; border-bottom:1px solid var(--gray-100,#f0f0f0);">
              <strong>라인 ${er.line}:</strong> ${(er.errors || []).map(escapeHtmlLocal).join(' · ')}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      errors.innerHTML = '';
    }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeCsvResultModal() {
    const modal = $('#memo-ev-csv-result-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  // 행사 카탈로그 fetch — state.events 에 저장 후 renderEventsList 가 표시
  async function loadEventsList() {
    try {
      const data = await fetchJson('/api/memorabilia/events?include_archived=1');
      state.events = data.items || [];
    } catch (err) {
      state.events = [];
      toast('행사 목록 로드 실패: ' + err.message, 'error');
    }
  }

  // 카테고리별 그룹화 + 체크박스 + bulk toolbar
  function renderEventsList() {
    const wrap = $('#memo-ev-list-wrap');
    const meta = $('#memo-ev-meta');
    if (!wrap) return;

    const all = state.events || [];
    // 필터링
    const filter = state.eventCategoryFilter || '';
    const items = !filter ? all
      : filter === '__none__' ? all.filter((e) => !e.category_id)
      : all.filter((e) => String(e.category_id) === String(filter));

    if (meta) {
      const filterTag = filter === '__none__' ? ' · 미분류 필터'
        : filter ? ` · 카테고리 필터` : '';
      meta.textContent = `${all.length}건 (아카이브 포함)${filterTag}`;
    }

    if (!items.length) {
      wrap.innerHTML = filter
        ? '<div class="v3-empty">해당 카테고리에 등록된 행사가 없습니다.</div>'
        : '<div class="v3-empty">아직 등록된 행사가 없습니다. <button class="v3-btn v3-btn-primary v3-btn-sm" id="memo-ev-empty-new">첫 행사 추가</button></div>';
      const b = $('#memo-ev-empty-new'); if (b) b.addEventListener('click', () => openEventEditor(null));
      renderEventsBulkToolbar();
      return;
    }

    // 카테고리별 그룹화 (id → name). 미분류는 마지막 그룹.
    const groups = new Map(); // key: id-or-'__none__', value: { label, sort, items: [] }
    for (const ev of items) {
      const key = ev.category_id ? String(ev.category_id) : '__none__';
      if (!groups.has(key)) {
        if (key === '__none__') {
          groups.set(key, { label: '미분류', sort: 99999, items: [] });
        } else {
          const cat = state.eventCategories.find((c) => String(c.id) === key);
          groups.set(key, {
            label: cat ? (cat.label_ko || cat.label_en || `#${cat.id}`) : `#${key}`,
            sort:  cat ? (cat.sort_order || 999) : 999,
            items: [],
          });
        }
      }
      groups.get(key).items.push(ev);
    }
    const sortedGroups = Array.from(groups.entries())
      .sort((a, b) => (a[1].sort - b[1].sort) || a[1].label.localeCompare(b[1].label, 'ko'));

    const visibleIds = items.map((e) => e.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedEventIds.has(id));

    const sections = [];
    sections.push(`<div class="memo-ev-grouped">
      <div class="memo-ev-group-head-row">
        <label class="memo-ev-group-checkbox">
          <input type="checkbox" id="memo-ev-select-all" ${allChecked ? 'checked' : ''} />
          현재 보이는 ${visibleIds.length}건 전체 선택/해제
        </label>
      </div>
    </div>`);

    for (const [key, group] of sortedGroups) {
      const groupHeader = `<div class="memo-ev-group-head"><span class="memo-ev-group-label">📁 ${escapeHtml(group.label)}</span><span class="memo-ev-group-count">${group.items.length}건</span></div>`;
      const rows = group.items.map((ev) => {
        const checked = state.selectedEventIds.has(ev.id);
        const archivedBadge = ev.archived
          ? '<span class="v3-badge v3-badge-muted">아카이브</span>'
          : '<span class="v3-badge v3-badge-success">활성</span>';
        const nameEn = ev.name_en ? `<strong>${escapeHtml(ev.name_en)}</strong>` : '';
        const nameKo = ev.name_ko ? `<div style="font-size:.85em;opacity:.75">${escapeHtml(ev.name_ko)}</div>` : '';
        const period = ev.period_text ? escapeHtml(ev.period_text) : '<span style="opacity:.5">—</span>';
        const catLabel = ev.category_label_ko || ev.category_label_en || (ev.category_id ? `#${ev.category_id}` : '<span style="opacity:.5">—</span>');
        return `<tr data-ev-row="${ev.id}" class="${checked ? 'is-selected' : ''}" style="cursor:pointer">
          <td><input type="checkbox" class="memo-ev-row-check" data-ev-check="${ev.id}" ${checked ? 'checked' : ''}/></td>
          <td>${nameEn}${nameKo}</td>
          <td>${typeof catLabel === 'string' && !catLabel.startsWith('<') ? escapeHtml(catLabel) : catLabel}</td>
          <td>${period}</td>
          <td>${ev.usage_count || 0}건</td>
          <td>${archivedBadge}</td>
          <td><button class="v3-btn v3-btn-outline v3-btn-sm" data-ev-edit="${ev.id}">편집</button></td>
        </tr>`;
      }).join('');

      sections.push(`<div class="memo-ev-group">
        ${groupHeader}
        <table class="v3-table">
          <thead><tr>
            <th style="width:32px"></th>
            <th>행사명</th>
            <th style="width:160px">카테고리</th>
            <th style="width:180px">기간</th>
            <th style="width:80px">참조</th>
            <th style="width:90px">상태</th>
            <th style="width:80px"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
    }
    wrap.innerHTML = sections.join('');

    // 편집 버튼
    $$('button[data-ev-edit]', wrap).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(b.getAttribute('data-ev-edit'), 10);
        const target = state.events.find((x) => x.id === id);
        if (target) openEventEditor(target);
      });
    });
    // 행 클릭 → 편집 모달
    $$('tr[data-ev-row]', wrap).forEach((row) => {
      row.addEventListener('click', () => {
        const id = parseInt(row.getAttribute('data-ev-row'), 10);
        const target = state.events.find((x) => x.id === id);
        if (target) openEventEditor(target);
      });
    });
    // 체크박스
    $$('input.memo-ev-row-check', wrap).forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const id = parseInt(cb.getAttribute('data-ev-check'), 10);
        if (cb.checked) state.selectedEventIds.add(id);
        else            state.selectedEventIds.delete(id);
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', cb.checked);
        const head = $('#memo-ev-select-all');
        if (head) head.checked = visibleIds.every((id2) => state.selectedEventIds.has(id2));
        renderEventsBulkToolbar();
      });
    });
    // 전체 선택
    const head = $('#memo-ev-select-all');
    if (head) {
      head.addEventListener('change', () => {
        if (head.checked) for (const id of visibleIds) state.selectedEventIds.add(id);
        else              for (const id of visibleIds) state.selectedEventIds.delete(id);
        renderEventsList();
      });
    }

    renderEventsBulkToolbar();
  }

  function renderEventsBulkToolbar() {
    const bar = $('#memo-ev-bulk-toolbar');
    if (!bar) return;
    const n = state.selectedEventIds.size;
    if (n === 0) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <span><strong>${n}개</strong> 행사 선택됨</span>
      <button type="button" class="v3-btn v3-btn-primary v3-btn-sm" id="memo-ev-bulk-open">🗂 카테고리 일괄 부여 / 상태 변경</button>
      <button type="button" class="v3-btn v3-btn-outline v3-btn-sm" id="memo-ev-bulk-clear">선택 해제</button>
    `;
    $('#memo-ev-bulk-open').addEventListener('click', openEventsBulkModal);
    $('#memo-ev-bulk-clear').addEventListener('click', () => {
      state.selectedEventIds.clear();
      renderEventsList();
    });
  }

  function openEventsBulkModal() {
    if (!state.selectedEventIds.size) return;
    $('#memo-ev-bulk-count').textContent = `${state.selectedEventIds.size}개`;
    // toggles 초기화
    $('#memo-ev-bulk-toggle-cat').checked = false;
    $('#memo-ev-bulk-toggle-arch').checked = false;
    $('#memo-ev-bulk-category').disabled = true;
    $('#memo-ev-bulk-archived').disabled = true;
    $('#memo-ev-bulk-category').value = '';
    $('#memo-ev-bulk-archived').value = '0';
    $('#memo-ev-bulk-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeEventsBulkModal() {
    $('#memo-ev-bulk-modal').hidden = true;
    document.body.style.overflow = '';
  }

  async function applyEventsBulkUpdate() {
    const ids = Array.from(state.selectedEventIds);
    if (!ids.length) { closeEventsBulkModal(); return; }
    const updates = {};
    if ($('#memo-ev-bulk-toggle-cat').checked) {
      const v = $('#memo-ev-bulk-category').value;
      updates.category_id = v ? parseInt(v, 10) : null;
    }
    if ($('#memo-ev-bulk-toggle-arch').checked) {
      updates.archived = $('#memo-ev-bulk-archived').value === '1';
    }
    if (!Object.keys(updates).length) {
      toast('변경할 필드를 한 개 이상 체크하세요.', 'error');
      return;
    }
    if (!confirm(`${ids.length}개 행사에 일괄 적용합니다. 계속할까요?`)) return;

    const applyBtn = $('#memo-ev-bulk-apply');
    applyBtn.disabled = true; const orig = applyBtn.textContent; applyBtn.textContent = '적용 중…';
    try {
      const res = await fetch('/api/memorabilia/events/bulk-update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(`적용 실패: ${data.detail || data.error || ('HTTP ' + res.status)}`, 'error');
        return;
      }
      toast(`적용 완료 — ${data.updated || 0}건 변경됨`, 'success');
      closeEventsBulkModal();
      state.selectedEventIds.clear();
      if (eventsMod && typeof eventsMod.load === 'function') {
        try { await eventsMod.load(true); } catch {}
      }
      await loadEventsList();
      renderEventsList();
    } catch (err) {
      toast('네트워크 오류: ' + err.message, 'error');
    } finally {
      applyBtn.disabled = false; applyBtn.textContent = orig;
    }
  }

  // 카테고리 관리 모달
  function openEventCategoriesModal() {
    $('#memo-ev-cats-modal').hidden = false;
    document.body.style.overflow = 'hidden';
    renderEventCategoriesList();
    // 신규 폼 초기화
    $('#memo-ev-cat-new-en').value = '';
    $('#memo-ev-cat-new-ko').value = '';
    $('#memo-ev-cat-new-sort').value = '999';
  }
  function closeEventCategoriesModal() {
    $('#memo-ev-cats-modal').hidden = true;
    document.body.style.overflow = '';
  }

  function renderEventCategoriesList() {
    const wrap = $('#memo-ev-cats-list-wrap');
    if (!wrap) return;
    if (!state.eventCategories.length) {
      wrap.innerHTML = '<div style="padding:12px; font-size:12.5px; color:var(--gray-700,#3f3f3f);">등록된 분류가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = `<table class="v3-table" style="font-size:12.5px;">
      <thead><tr><th>슬러그</th><th>영문</th><th>국문</th><th style="width:60px">정렬</th><th style="width:70px">참조</th><th style="width:80px">아카이브</th><th style="width:90px"></th></tr></thead>
      <tbody>${state.eventCategories.map((c) => `
        <tr data-cat-row="${c.id}">
          <td><code style="font-size:11px;">${escapeHtml(c.slug)}</code></td>
          <td><input class="v3-input v3-input-sm" data-cat-en="${c.id}" value="${escapeHtml(c.label_en)}"/></td>
          <td><input class="v3-input v3-input-sm" data-cat-ko="${c.id}" value="${escapeHtml(c.label_ko)}"/></td>
          <td><input type="number" class="v3-input v3-input-sm" data-cat-sort="${c.id}" value="${c.sort_order}" style="width:60px"/></td>
          <td>${c.usage_count || 0}건</td>
          <td><label class="memo-checkbox-row" style="font-size:11px;"><input type="checkbox" data-cat-arch="${c.id}" ${c.archived ? 'checked' : ''}/></label></td>
          <td>
            <button class="v3-btn v3-btn-outline v3-btn-sm" data-cat-save="${c.id}">저장</button>
            <button class="v3-btn v3-btn-ghost v3-btn-sm" data-cat-del="${c.id}" title="삭제 — 연결된 행사는 보존됩니다 (분류만 비워짐)">×</button>
          </td>
        </tr>
      `).join('')}</tbody>
    </table>`;

    wrap.querySelectorAll('button[data-cat-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-cat-save'), 10);
        const body = {
          label_en:   wrap.querySelector(`[data-cat-en="${id}"]`).value.trim(),
          label_ko:   wrap.querySelector(`[data-cat-ko="${id}"]`).value.trim(),
          sort_order: parseInt(wrap.querySelector(`[data-cat-sort="${id}"]`).value, 10) || 999,
          archived:   wrap.querySelector(`[data-cat-arch="${id}"]`).checked,
        };
        try {
          const res = await fetch(`/api/memorabilia/event-categories/${id}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { toast(`저장 실패: ${data.detail || data.error}`, 'error'); return; }
          await loadEventCategories();
          populateEventCategoryControls();
          renderEventCategoriesList();
          renderEventsList();
          toast('분류 저장됨', 'success');
        } catch (err) { toast('네트워크 오류: ' + err.message, 'error'); }
      });
    });
    wrap.querySelectorAll('button[data-cat-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-cat-del'), 10);
        const cat = state.eventCategories.find((c) => c.id === id);
        const used = Number(cat?.usage_count || 0);
        const msg = used > 0
          ? `이 분류를 ${used}건의 행사가 사용 중입니다. 삭제하면 해당 행사들의 분류가 비워집니다(행사는 보존). 계속할까요?`
          : '이 분류를 삭제할까요?';
        if (!confirm(msg)) return;
        try {
          const res = await fetch(`/api/memorabilia/event-categories/${id}`, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok) { const data = await res.json().catch(() => ({})); toast(`삭제 실패: ${data.detail || data.error}`, 'error'); return; }
          await Promise.all([loadEventCategories(), loadEventsList()]);
          populateEventCategoryControls();
          renderEventCategoriesList();
          renderEventsList();
          toast('분류 삭제됨', 'success');
        } catch (err) { toast('네트워크 오류: ' + err.message, 'error'); }
      });
    });
  }

  async function addEventCategory() {
    const body = {
      label_en:   $('#memo-ev-cat-new-en').value.trim(),
      label_ko:   $('#memo-ev-cat-new-ko').value.trim(),
      sort_order: parseInt($('#memo-ev-cat-new-sort').value, 10) || 999,
    };
    if (!body.label_en && !body.label_ko) { toast('영문/국문 라벨 중 하나는 입력하세요.', 'error'); return; }
    try {
      const res = await fetch('/api/memorabilia/event-categories', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(`추가 실패: ${data.detail || data.error}`, 'error'); return; }
      $('#memo-ev-cat-new-en').value = '';
      $('#memo-ev-cat-new-ko').value = '';
      $('#memo-ev-cat-new-sort').value = '999';
      await loadEventCategories();
      populateEventCategoryControls();
      renderEventCategoriesList();
      toast('분류 추가됨', 'success');
    } catch (err) { toast('네트워크 오류: ' + err.message, 'error'); }
  }

  function openEventEditor(ev) {
    _editingEvent = ev;
    $('#memo-ev-edit-title').textContent = ev ? '행사 편집' : '새 행사';
    $('#memo-ev-edit-delete').hidden = !ev;
    $('#memo-ev-name-en').value = ev?.name_en || '';
    $('#memo-ev-name-ko').value = ev?.name_ko || '';
    // 카테고리 셀렉트는 populateEventCategoryControls 가 옵션을 채워둠 — value 만 세팅
    populateEventCategoryControls();
    const catSel = $('#memo-ev-category');
    if (catSel) catSel.value = ev?.category_id ? String(ev.category_id) : '';
    $('#memo-ev-sy').value = ev?.start_year || '';
    $('#memo-ev-sm').value = ev?.start_month || '';
    $('#memo-ev-sd').value = ev?.start_day || '';
    $('#memo-ev-ey').value = ev?.end_year || '';
    $('#memo-ev-em').value = ev?.end_month || '';
    $('#memo-ev-ed').value = ev?.end_day || '';
    $('#memo-ev-desc-en').value = ev?.description_en || '';
    $('#memo-ev-desc-ko').value = ev?.description_ko || '';
    $('#memo-ev-archived').checked = !!ev?.archived;
    $('#memo-ev-edit-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeEventEditor() {
    $('#memo-ev-edit-modal').hidden = true;
    document.body.style.overflow = '';
    _editingEvent = null;
  }

  async function saveEvent() {
    const catRaw = $('#memo-ev-category').value;
    const body = {
      name_en: $('#memo-ev-name-en').value.trim(),
      name_ko: $('#memo-ev-name-ko').value.trim(),
      category_id: catRaw ? parseInt(catRaw, 10) : null,
      start_year:  $('#memo-ev-sy').value || null,
      start_month: $('#memo-ev-sm').value || null,
      start_day:   $('#memo-ev-sd').value || null,
      end_year:    $('#memo-ev-ey').value || null,
      end_month:   $('#memo-ev-em').value || null,
      end_day:     $('#memo-ev-ed').value || null,
      description_en: $('#memo-ev-desc-en').value || '',
      description_ko: $('#memo-ev-desc-ko').value || '',
      archived: $('#memo-ev-archived').checked,
    };
    const saveBtn = $('#memo-ev-edit-save');
    saveBtn.disabled = true; const orig = saveBtn.textContent; saveBtn.textContent = '저장 중…';
    try {
      const url = _editingEvent ? `/api/memorabilia/events/${_editingEvent.id}` : '/api/memorabilia/events';
      const method = _editingEvent ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data.details || []).join(' · ') || data.error || `HTTP ${res.status}`;
        throw new Error(detail);
      }
      // Picker cache 도 갱신 (item 모달에서 즉시 반영)
      if (eventsMod && typeof eventsMod.load === 'function') {
        try { await eventsMod.load(true); } catch {}
      }
      closeEventEditor();
      await loadEventsList();
      renderEventsList();
      toast(_editingEvent ? '행사 수정됨' : '행사 추가됨', 'success');
    } catch (err) {
      toast('저장 실패: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = orig;
    }
  }

  async function deleteEventRow() {
    if (!_editingEvent) return;
    const used = Number(_editingEvent.usage_count || 0);
    const warning = used > 0
      ? `이 행사를 ${used}건의 도감 항목이 참조 중입니다. 삭제 시 해당 항목들의 행사 연결이 끊어집니다 (도감 항목 자체는 보존, denormalized 행사명 cache 만 표시). 계속할까요?`
      : '이 행사를 삭제할까요? 되돌릴 수 없습니다.';
    if (!confirm(warning)) return;
    try {
      const res = await fetch(`/api/memorabilia/events/${_editingEvent.id}`, {
        method: 'DELETE', credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (eventsMod && typeof eventsMod.load === 'function') {
        try { await eventsMod.load(true); } catch {}
      }
      closeEventEditor();
      await loadEventsList();
      renderEventsList();
      toast('행사 삭제됨', 'success');
    } catch (err) {
      toast('삭제 실패: ' + err.message, 'error');
    }
  }
})();
