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
  const state = {
    items: [],
    categories: [],
    countries: [],
    editing: null,           // null | item
    images: [],              // [{url, alt_en, alt_ko, is_primary, sort_order}]
    links: [],               // [{label_en, label_ko, url}]
    loadedOnce: false,
    catsLoadedOnce: false,
  };

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

  // ── 국가 코드 라벨 ───────────────────────────────────────────────────────
  // server-side functions/_shared/country-code-labels.js 와 동기화 (정적 복제).
  // 장기적으로는 /api/settings/countries 같은 엔드포인트로 일원화하는 게 좋음.
  const COUNTRY_LABELS = {
    AE:'아랍에미리트',AR:'아르헨티나',AT:'오스트리아',AU:'호주',BD:'방글라데시',BE:'벨기에',BR:'브라질',
    CA:'캐나다',CH:'스위스',CL:'칠레',CN:'중국',CO:'콜롬비아',CZ:'체코',DE:'독일',DK:'덴마크',
    EG:'이집트',ES:'스페인',FI:'핀란드',FR:'프랑스',GB:'영국',GR:'그리스',HK:'홍콩',HR:'크로아티아',
    HU:'헝가리',ID:'인도네시아',IE:'아일랜드',IL:'이스라엘',IN:'인도',IQ:'이라크',IR:'이란',IT:'이탈리아',
    JO:'요르단',JP:'일본',KE:'케냐',KR:'한국',KW:'쿠웨이트',KZ:'카자흐스탄',LK:'스리랑카',MA:'모로코',
    MX:'멕시코',MY:'말레이시아',NG:'나이지리아',NL:'네덜란드',NO:'노르웨이',NP:'네팔',NZ:'뉴질랜드',
    OM:'오만',PE:'페루',PH:'필리핀',PK:'파키스탄',PL:'폴란드',PT:'포르투갈',QA:'카타르',RO:'루마니아',
    RS:'세르비아',RU:'러시아',SA:'사우디아라비아',SE:'스웨덴',SG:'싱가포르',SI:'슬로베니아',SK:'슬로바키아',
    TH:'태국',TR:'터키',TW:'대만',UA:'우크라이나',US:'미국',VE:'베네수엘라',VN:'베트남',ZA:'남아프리카공화국',
  };

  // ── Init: 패널 활성화 감지 ──────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-panel="memorabilia"], [data-panel="memorabilia-categories"]');
    if (!btn) return;
    const panel = btn.getAttribute('data-panel');
    setTimeout(() => {
      if (panel === 'memorabilia' && !state.loadedOnce) bootList();
      if (panel === 'memorabilia-categories' && !state.catsLoadedOnce) bootCategories();
    }, 60);
  }, true);

  document.addEventListener('DOMContentLoaded', wireEvents);

  function wireEvents() {
    // List panel
    const newBtn = $('#memo-new-btn');
    if (newBtn) newBtn.addEventListener('click', () => openEditor(null));
    const searchInput = $('#memo-list-search');
    if (searchInput) searchInput.addEventListener('input', renderList);

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
      imageAdd.addEventListener('click', () => imageInput.click());
      imageInput.addEventListener('change', onImageInput);
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
    if (catNewBtn) catNewBtn.addEventListener('click', promptNewCategory);

    // backdrop click closes
    const backdrop = $('#memo-edit-modal');
    if (backdrop) backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeEditor();
    });
  }

  // ── 목록 ────────────────────────────────────────────────────────────────
  async function bootList() {
    state.loadedOnce = true;
    await Promise.all([loadList(), loadCategories(true)]);
    populateCountrySelect();
    populateCategorySelect();
  }

  async function loadList() {
    try {
      const data = await fetchJson('/api/memorabilia?include_drafts=1&limit=100');
      state.items = data.items || [];
      renderList();
      const meta = $('#memo-list-meta');
      if (meta) meta.textContent = `${state.items.length}건 (드래프트 포함)`;
    } catch (err) {
      toast('목록을 불러오지 못했습니다: ' + err.message, 'error');
    }
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
      '<th style="width:64px">이미지</th><th>제목</th><th style="width:80px">연도</th>',
      '<th style="width:120px">분류</th><th style="width:90px">상태</th><th style="width:80px"></th>',
      '</tr></thead><tbody>'];
    for (const it of items) {
      const thumb = it.primary_image_url
        ? `<img src="${escapeHtml(it.primary_image_url)}" alt="" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:4px"/>`
        : '<div style="width:48px;height:48px;background:var(--gray-100);border-radius:4px"></div>';
      const title = it.title_en || it.title_ko || '(제목 없음)';
      const sub = it.title_en && it.title_ko ? `<div style="font-size:.85em;opacity:.7">${escapeHtml(it.title_ko)}</div>` : '';
      const cat = it.category_label_ko || it.category_label_en || '—';
      const statusBadge = it.status === 'public'
        ? '<span class="v3-badge v3-badge-success">공개</span>'
        : '<span class="v3-badge v3-badge-muted">초안</span>';
      html.push(`<tr><td>${thumb}</td><td><strong>${escapeHtml(title)}</strong>${sub}</td>`,
        `<td>${it.year || '—'}</td><td>${escapeHtml(cat)}</td><td>${statusBadge}</td>`,
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
  }

  // ── Editor modal ────────────────────────────────────────────────────────
  async function openEditor(item) {
    if (!state.categories.length) await loadCategories(true);
    populateCategorySelect();
    populateCountrySelect();

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
    $('#memo-event-en').value = item?.event_name_en || '';
    $('#memo-event-ko').value = item?.event_name_ko || '';
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

    // country multi-select
    const sel = $('#memo-country');
    const codes = new Set(item?.country_codes || []);
    $$('option', sel).forEach((opt) => { opt.selected = codes.has(opt.value); });

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

  function populateCountrySelect() {
    const sel = $('#memo-country');
    if (!sel || sel.options.length) return;
    const codes = Object.keys(COUNTRY_LABELS).sort((a, b) => COUNTRY_LABELS[a].localeCompare(COUNTRY_LABELS[b], 'ko'));
    sel.innerHTML = codes.map((c) => `<option value="${c}">${escapeHtml(COUNTRY_LABELS[c])} (${c})</option>`).join('');
  }

  // ── Images ──────────────────────────────────────────────────────────────
  function renderImages() {
    const grid = $('#memo-images-grid');
    if (!grid) return;
    if (!state.images.length) {
      grid.innerHTML = '<div class="v3-inline-meta">이미지가 없습니다. "이미지 추가"를 눌러주세요.</div>';
      return;
    }
    grid.innerHTML = state.images.map((img, i) => `
      <div class="memo-image-tile" data-i="${i}" style="display:inline-block;margin:4px;border:1px solid var(--gray-300);padding:4px;border-radius:4px;vertical-align:top;width:140px">
        <div style="position:relative">
          <img src="${escapeHtml(img.url)}" alt="" style="width:100%;height:100px;object-fit:cover;border-radius:3px"/>
        </div>
        <label style="display:block;margin-top:4px;font-size:.85em">
          <input type="radio" name="memo-primary" ${img.is_primary ? 'checked' : ''} data-primary-i="${i}"/> 대표
        </label>
        <button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-img-del="${i}" style="width:100%;margin-top:4px">삭제</button>
      </div>
    `).join('');
    $$('input[data-primary-i]', grid).forEach((r) => {
      r.addEventListener('change', () => {
        const i = parseInt(r.getAttribute('data-primary-i'), 10);
        state.images.forEach((img, idx) => { img.is_primary = idx === i; });
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

  async function onImageInput(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    for (const file of files) {
      if (!/^image\//.test(file.type)) { toast(`이미지 아님: ${file.name}`, 'error'); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetchJson('/api/memorabilia/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data_url: dataUrl }),
        });
        if (res?.url) {
          const isPrimary = !state.images.length;
          state.images.push({ url: res.url, alt_en: '', alt_ko: '', is_primary: isPrimary, sort_order: state.images.length });
        }
      } catch (err) {
        toast(`업로드 실패 (${file.name}): ${err.message}`, 'error');
      }
    }
    renderImages();
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
    const sel = $('#memo-country');
    const countries = sel ? Array.from(sel.selectedOptions).map((o) => o.value) : [];
    const tagsRaw = $('#memo-tags').value || '';
    const tags = tagsRaw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);

    const body = {
      title_en: $('#memo-title-en').value || '',
      title_ko: $('#memo-title-ko').value || '',
      has_event: !!$('#memo-has-event').checked,
      event_name_en: $('#memo-event-en').value || '',
      event_name_ko: $('#memo-event-ko').value || '',
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
      country_codes: countries,
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
      <thead><tr><th>슬러그</th><th>영문 라벨</th><th>국문 라벨</th><th style="width:80px">정렬</th><th style="width:80px">상태</th><th style="width:160px"></th></tr></thead>
      <tbody>${state.categories.map((c) => `
        <tr data-cat-id="${c.id}">
          <td><code>${escapeHtml(c.slug)}</code></td>
          <td><input class="v3-input v3-input-sm" data-cat-field="label_en" value="${escapeHtml(c.label_en)}"/></td>
          <td><input class="v3-input v3-input-sm" data-cat-field="label_ko" value="${escapeHtml(c.label_ko)}"/></td>
          <td><input class="v3-input v3-input-sm" data-cat-field="sort_order" type="number" value="${c.sort_order}" style="width:60px"/></td>
          <td>${c.archived ? '<span class="v3-badge v3-badge-muted">아카이브</span>' : '<span class="v3-badge v3-badge-success">활성</span>'}</td>
          <td>
            <button class="v3-btn v3-btn-outline v3-btn-sm" data-cat-save="${c.id}">저장</button>
            ${c.archived
              ? `<button class="v3-btn v3-btn-outline v3-btn-sm" data-cat-restore="${c.id}">복원</button>`
              : `<button class="v3-btn v3-btn-outline v3-btn-sm" data-cat-archive="${c.id}">아카이브</button>`}
          </td>
        </tr>`).join('')}</tbody></table>`;

    $$('button[data-cat-save]', wrap).forEach((b) => b.addEventListener('click', async () => {
      const id = parseInt(b.getAttribute('data-cat-save'), 10);
      const row = $(`tr[data-cat-id="${id}"]`, wrap);
      const body = {
        label_en: $('input[data-cat-field="label_en"]', row).value,
        label_ko: $('input[data-cat-field="label_ko"]', row).value,
        sort_order: parseInt($('input[data-cat-field="sort_order"]', row).value, 10),
      };
      try {
        await fetchJson(`/api/memorabilia/categories/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        await loadCategories(false);
        toast('분류 저장됨', 'success');
      } catch (err) { toast('저장 실패: ' + err.message, 'error'); }
    }));
    $$('button[data-cat-archive],button[data-cat-restore]', wrap).forEach((b) => b.addEventListener('click', async () => {
      const id = parseInt(b.getAttribute('data-cat-archive') || b.getAttribute('data-cat-restore'), 10);
      const archive = !!b.getAttribute('data-cat-archive');
      try {
        await fetchJson(`/api/memorabilia/categories/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: archive }),
        });
        await loadCategories(false);
      } catch (err) { toast('변경 실패: ' + err.message, 'error'); }
    }));
  }

  async function promptNewCategory() {
    const slug = (prompt('새 분류 slug (영문 소문자, 예: scarf)') || '').trim();
    if (!slug) return;
    const label_ko = (prompt('국문 라벨') || '').trim();
    const label_en = (prompt('영문 라벨') || '').trim();
    if (!label_ko && !label_en) return;
    try {
      await fetchJson('/api/memorabilia/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, label_ko, label_en, sort_order: 999 }),
      });
      await loadCategories(false);
      toast('분류 추가됨', 'success');
    } catch (err) { toast('추가 실패: ' + err.message, 'error'); }
  }
})();
