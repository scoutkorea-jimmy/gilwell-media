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

    // Categories panel
    const catNewBtn = $('#memo-cat-new-btn');
    if (catNewBtn) catNewBtn.addEventListener('click', () => openCategoryEditor(null));
    wireCategoryEditorOnce();

    // backdrop click closes
    const backdrop = $('#memo-edit-modal');
    if (backdrop) backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeEditor();
    });
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
      return;
    }
    const html = ['<table class="v3-table"><thead><tr>',
      '<th style="width:64px">이미지</th><th>제목</th><th>행사명</th><th style="width:80px">연도</th>',
      '<th style="width:120px">분류</th><th style="width:90px">상태</th><th style="width:80px"></th>',
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
      html.push(`<tr><td>${thumb}</td><td><strong>${escapeHtml(title)}</strong>${sub}</td>`,
        `<td>${eventCell}</td><td>${it.year || '—'}</td><td>${escapeHtml(cat)}</td><td>${statusBadge}</td>`,
        `<td><button class="v3-btn v3-btn-outline v3-btn-sm" data-memo-edit="${it.id}">편집</button></td></tr>`);
    }
    html.push('</tbody></table>');
    wrap.innerHTML = html.join('');
    $$('button[data-memo-edit]', wrap).forEach((b) => {
      b.addEventListener('click', () => {
        const id = parseInt(b.getAttribute('data-memo-edit'), 10);
        const it = state.items.find((x) => x.id === id);
        if (it) openEditor(it);
      });
    });
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
      renderImages();
    }

    if (state.images.length && !state.images.some((i) => i.is_primary)) {
      const firstReady = state.images.find((i) => !i.uploading);
      if (firstReady) firstReady.is_primary = true;
      renderImages();
    }

    if (errors.length) flashError(errors.join('\n'));
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
    const files = e.target.files;
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
        await fetchJson(`/api/memorabilia/${state.editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
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
    await loadEventsList();
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
  }

  async function loadEventsList() {
    try {
      const data = await fetchJson('/api/memorabilia/events?include_archived=1');
      const items = data.items || [];
      const wrap = $('#memo-ev-list-wrap');
      const meta = $('#memo-ev-meta');
      if (meta) meta.textContent = `${items.length}건 (아카이브 포함)`;
      if (!items.length) {
        wrap.innerHTML = '<div class="v3-empty">아직 등록된 행사가 없습니다. <button class="v3-btn v3-btn-primary v3-btn-sm" id="memo-ev-empty-new">첫 행사 추가</button></div>';
        const b = $('#memo-ev-empty-new'); if (b) b.addEventListener('click', () => openEventEditor(null));
        return;
      }
      const rows = items.map((ev) => {
        const archivedBadge = ev.archived
          ? '<span class="v3-badge v3-badge-muted">아카이브</span>'
          : '<span class="v3-badge v3-badge-success">활성</span>';
        const nameEn = ev.name_en ? `<strong>${escapeHtml(ev.name_en)}</strong>` : '';
        const nameKo = ev.name_ko ? `<div style="font-size:.85em;opacity:.75">${escapeHtml(ev.name_ko)}</div>` : '';
        const period = ev.period_text ? escapeHtml(ev.period_text) : '<span style="opacity:.5">—</span>';
        return `<tr>
          <td>${nameEn}${nameKo}</td>
          <td>${period}</td>
          <td>${ev.usage_count || 0}건</td>
          <td>${archivedBadge}</td>
          <td><button class="v3-btn v3-btn-outline v3-btn-sm" data-ev-edit="${ev.id}">편집</button></td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `<table class="v3-table">
        <thead><tr><th>행사명</th><th style="width:200px">기간</th><th style="width:80px">참조</th><th style="width:90px">상태</th><th style="width:80px"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
      $$('button[data-ev-edit]', wrap).forEach((b) => {
        b.addEventListener('click', async () => {
          const id = parseInt(b.getAttribute('data-ev-edit'), 10);
          const target = items.find((x) => x.id === id);
          if (target) openEventEditor(target);
        });
      });
    } catch (err) {
      toast('행사 목록 로드 실패: ' + err.message, 'error');
    }
  }

  function openEventEditor(ev) {
    _editingEvent = ev;
    $('#memo-ev-edit-title').textContent = ev ? '행사 편집' : '새 행사';
    $('#memo-ev-edit-delete').hidden = !ev;
    $('#memo-ev-name-en').value = ev?.name_en || '';
    $('#memo-ev-name-ko').value = ev?.name_ko || '';
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
    const body = {
      name_en: $('#memo-ev-name-en').value.trim(),
      name_ko: $('#memo-ev-name-ko').value.trim(),
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
      toast('행사 삭제됨', 'success');
    } catch (err) {
      toast('삭제 실패: ' + err.message, 'error');
    }
  }
})();
