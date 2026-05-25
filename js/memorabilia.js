/**
 * Gilwell Media · Scout Memorabilia Encyclopedia (public)
 *
 * 단일 페이지에서 라우팅:
 *   /memorabilia            → 목록 + 검색
 *   /memorabilia?q=...      → 검색 결과
 *   /memorabilia/:slug      → 상세 (_redirects 가 200 rewrite)
 */

(function () {
  'use strict';

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

  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function purify(html) {
    if (window.DOMPurify) return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    return html;
  }

  function getSlugFromPath() {
    const m = location.pathname.match(/^\/memorabilia\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ── Router ──────────────────────────────────────────────────────────────
  function route() {
    const slug = getSlugFromPath();
    if (slug) {
      showDetail(slug);
    } else {
      showList();
    }
  }

  function showList() {
    document.getElementById('memo-list-view').hidden = false;
    document.getElementById('memo-results-wrap').hidden = false;
    document.getElementById('memo-detail-view').hidden = true;
    document.title = '스카우트 기념품 도감 — BP미디어';
    initListIfNeeded();
    runSearch();
  }

  function showDetail(slug) {
    document.getElementById('memo-list-view').hidden = true;
    document.getElementById('memo-results-wrap').hidden = true;
    document.getElementById('memo-detail-view').hidden = false;
    loadDetail(slug);
  }

  // ── List/Search state ──────────────────────────────────────────────────
  const state = {
    initialized: false,
    page: 1,
    pageSize: 24,
  };

  async function initListIfNeeded() {
    if (state.initialized) return;
    state.initialized = true;

    // Read URL query
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    if (q) $('#memo-search-input').value = q;

    // Wire events
    const debouncedSearch = debounce(runSearch, 250);
    $('#memo-search-input').addEventListener('input', () => { state.page = 1; debouncedSearch(); });
    $('#memo-search-btn').addEventListener('click', () => { state.page = 1; runSearch(); });
    $('#memo-filter-category').addEventListener('change', () => { state.page = 1; runSearch(); });
    $('#memo-filter-country').addEventListener('change', () => { state.page = 1; runSearch(); });
    $('#memo-filter-sort').addEventListener('change', () => { state.page = 1; runSearch(); });
    $('#memo-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { state.page = 1; runSearch(); }
    });

    // Load filter options
    await Promise.all([loadCategoryOptions(), populateCountryOptions()]);
  }

  async function loadCategoryOptions() {
    try {
      const res = await fetch('/api/memorabilia/categories', { credentials: 'same-origin' });
      const data = await res.json();
      const cats = (data.items || []).filter((c) => !c.archived);
      const sel = $('#memo-filter-category');
      sel.innerHTML = '<option value="">분류 전체</option>' + cats.map((c) =>
        `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.label_ko)} / ${escapeHtml(c.label_en)}</option>`
      ).join('');
    } catch {}
  }

  function populateCountryOptions() {
    const sel = $('#memo-filter-country');
    const codes = Object.keys(COUNTRY_LABELS).sort((a, b) => COUNTRY_LABELS[a].localeCompare(COUNTRY_LABELS[b], 'ko'));
    sel.innerHTML = '<option value="">국가 전체</option>' + codes.map((c) =>
      `<option value="${c}">${escapeHtml(COUNTRY_LABELS[c])}</option>`
    ).join('');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function runSearch() {
    const q = ($('#memo-search-input')?.value || '').trim();
    const category = $('#memo-filter-category')?.value || '';
    const country = $('#memo-filter-country')?.value || '';
    const sort = $('#memo-filter-sort')?.value || 'relevance';
    const meta = $('#memo-results-meta');
    const grid = $('#memo-grid');

    // sync URL (replace, no scroll)
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (country) params.set('country', country);
    if (sort !== 'relevance') params.set('sort', sort);
    if (state.page > 1) params.set('page', String(state.page));
    const newSearch = params.toString();
    history.replaceState(null, '', '/memorabilia' + (newSearch ? '?' + newSearch : ''));

    meta.textContent = '검색 중…';
    grid.innerHTML = '';

    try {
      const apiParams = new URLSearchParams({
        q, sort,
        page: String(state.page),
        limit: String(state.pageSize),
      });
      if (category) apiParams.set('category', category);
      if (country) apiParams.set('country', country);

      const res = await fetch('/api/memorabilia/search?' + apiParams.toString(), { credentials: 'same-origin' });
      const data = await res.json();

      renderResults(data, q);
    } catch (err) {
      meta.textContent = '검색 실패: ' + err.message;
    }
  }

  function renderResults(data, q) {
    const meta = $('#memo-results-meta');
    const grid = $('#memo-grid');
    const total = data.total || 0;
    const items = data.results || [];

    if (total === 0) {
      meta.textContent = q ? `"${q}" 검색 결과 없음` : '아직 등록된 기념품이 없습니다.';
      const adminHint = !q ? `<p style="margin-top:12px;font-size:.9em;opacity:.7">관리자라면 <a href="/admin#memorabilia" style="color:var(--color-scouting-purple);text-decoration:underline">관리자 페이지의 '스카우트 백과 → 기념품 도감'</a>에서 항목을 추가할 수 있습니다.</p>` : '';
      grid.innerHTML = `<div class="memo-empty"><h3>${q ? '결과가 없어요' : '준비 중입니다'}</h3><p>${q ? '다른 키워드로 검색해보세요.' : '곧 다양한 기념품이 추가됩니다.'}</p>${adminHint}</div>`;
      $('#memo-pagination').innerHTML = '';
      return;
    }

    meta.textContent = `총 ${total}건${q ? ` · "${q}" 검색` : ''}`;
    grid.innerHTML = items.map((it) => {
      const titleEn = it.title_en || it.title_ko || '';
      const titleKo = (it.title_en && it.title_ko && it.title_en !== it.title_ko) ? it.title_ko : '';
      const thumb = it.primary_image_url
        ? `<div class="memo-card-thumb"><img src="${escapeHtml(it.primary_image_url)}" alt="" loading="lazy"/></div>`
        : `<div class="memo-card-thumb empty">⬚</div>`;
      return `<a class="memo-card" href="/memorabilia/${escapeHtml(it.slug)}">
        ${thumb}
        <div class="memo-card-body">
          <div class="memo-card-title">${escapeHtml(titleEn)}</div>
          ${titleKo ? `<div class="memo-card-title-ko">${escapeHtml(titleKo)}</div>` : ''}
        </div>
      </a>`;
    }).join('');

    renderPagination(data.page || 1, Math.ceil(total / (data.page_size || state.pageSize)));
  }

  function renderPagination(page, totalPages) {
    const wrap = $('#memo-pagination');
    if (totalPages <= 1) { wrap.innerHTML = ''; return; }
    const buttons = [];
    buttons.push(`<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">←</button>`);
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    if (start > 1) buttons.push(`<button data-page="1">1</button><span style="padding:6px 4px">…</span>`);
    for (let i = start; i <= end; i++) {
      buttons.push(`<button class="${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }
    if (end < totalPages) buttons.push(`<span style="padding:6px 4px">…</span><button data-page="${totalPages}">${totalPages}</button>`);
    buttons.push(`<button ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">→</button>`);
    wrap.innerHTML = buttons.join('');
    wrap.querySelectorAll('button[data-page]').forEach((b) => b.addEventListener('click', () => {
      const p = parseInt(b.getAttribute('data-page'), 10);
      if (Number.isFinite(p) && p > 0) {
        state.page = p;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        runSearch();
      }
    }));
  }

  // ── Detail ──────────────────────────────────────────────────────────────
  async function loadDetail(slug) {
    const wrap = $('#memo-detail-content');
    try {
      const res = await fetch('/api/memorabilia/slug/' + encodeURIComponent(slug), { credentials: 'same-origin' });
      if (!res.ok) {
        wrap.innerHTML = '<div class="memo-empty"><h3>찾을 수 없는 항목</h3><p>요청한 도감 항목이 존재하지 않거나 비공개입니다.</p></div>';
        document.title = '도감 — BP미디어';
        return;
      }
      const data = await res.json();
      const item = data.item;
      window.__memoDetailItem = item;
      document.title = `${item.title_en || item.title_ko} — 스카우트 기념품 도감 — BP미디어`;
      wrap.innerHTML = renderDetail(item);
      wireDetailEvents(wrap);
      // Admin 편집 버튼 노출
      if (editor.sessionChecked ? editor.isAdmin : true) {
        editor.checkSession().then(() => {
          const bar = document.getElementById('memo-detail-admin-bar');
          if (bar) bar.hidden = !editor.isAdmin;
        });
      }
    } catch (err) {
      wrap.innerHTML = '<div class="memo-empty"><h3>로드 실패</h3><p>잠시 후 다시 시도해주세요.</p></div>';
    }
  }

  function renderDetail(item) {
    const titleEn = item.title_en || '';
    const titleKo = item.title_ko || '';
    const primary = (item.images || []).find((i) => i.is_primary) || (item.images || [])[0];
    const others = (item.images || []).filter((i) => i !== primary);

    const meta = [];
    if (item.has_event && (item.event_name_en || item.event_name_ko)) {
      meta.push(metaRow('행사명',
        item.event_name_en ? `<span class="lang-en" lang="en">${escapeHtml(item.event_name_en)}</span>` : '',
        item.event_name_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.event_name_ko)}</span>` : ''));
    }
    if (item.country_codes && item.country_codes.length) {
      meta.push(metaRow('국가',
        item.country_codes.join(', '),
        item.country_codes.map((c) => COUNTRY_LABELS[c] || c).join(', ')));
    }
    if (item.year) meta.push(metaRow('연도', `${item.year}`, ''));
    if (item.category_label_en || item.category_label_ko) {
      meta.push(metaRow('분류',
        item.category_label_en ? `<span class="lang-en" lang="en">${escapeHtml(item.category_label_en)}</span>` : '',
        item.category_label_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.category_label_ko)}</span>` : ''));
    }
    if (item.material_en || item.material_ko) {
      meta.push(metaRow('재질',
        item.material_en ? `<span class="lang-en" lang="en">${escapeHtml(item.material_en)}</span>` : '',
        item.material_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.material_ko)}</span>` : ''));
    }
    if (item.size_text) meta.push(metaRow('크기', escapeHtml(item.size_text), ''));
    if (item.issuer_en || item.issuer_ko) {
      meta.push(metaRow('제작기관',
        item.issuer_en ? `<span class="lang-en" lang="en">${escapeHtml(item.issuer_en)}</span>` : '',
        item.issuer_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.issuer_ko)}</span>` : ''));
    }

    const descEn = renderDescription(item.description_en);
    const descKo = renderDescription(item.description_ko);

    const tagsHtml = (item.tags || []).length
      ? `<div class="memo-tags">${item.tags.map((t) => `<a class="memo-tag-chip" href="/memorabilia?q=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('')}</div>`
      : '';

    const linksHtml = (item.related_links || []).length
      ? `<div class="memo-related-links"><h3>관련 링크</h3>${item.related_links.map((l) => {
          const label = l.label_en || l.label_ko || l.url;
          const labelKo = (l.label_en && l.label_ko) ? ` <span style="opacity:0.6">/ ${escapeHtml(l.label_ko)}</span>` : '';
          return `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(label)}${labelKo}</a>`;
        }).join('')}</div>`
      : '';

    return `
      ${primary ? `
        <div class="memo-detail-gallery">
          <div class="memo-primary-img" id="memo-detail-primary">
            <img src="${escapeHtml(primary.url)}" alt="${escapeHtml(titleEn || titleKo)}"/>
          </div>
          ${others.length ? `<div class="memo-thumb-row">
            <img src="${escapeHtml(primary.url)}" class="active" data-img="${escapeHtml(primary.url)}" alt=""/>
            ${others.map((img) => `<img src="${escapeHtml(img.url)}" data-img="${escapeHtml(img.url)}" alt=""/>`).join('')}
          </div>` : ''}
        </div>
      ` : ''}
      <h1 class="memo-detail-title" lang="en">${escapeHtml(titleEn)}</h1>
      ${titleKo && titleKo !== titleEn ? `<div class="memo-detail-title-ko" lang="ko">${escapeHtml(titleKo)}</div>` : ''}
      ${meta.length ? `<div class="memo-detail-meta">${meta.join('')}</div>` : ''}
      ${(descEn || descKo) ? `<div class="memo-detail-body">
        ${descEn ? `<div class="lang-en" lang="en">${descEn}</div>` : ''}
        ${descKo ? `<div class="lang-ko" lang="ko">${descKo}</div>` : ''}
      </div>` : ''}
      ${tagsHtml}
      ${linksHtml}
    `;
  }

  function metaRow(label, en, ko) {
    return `<div class="memo-meta-label">${escapeHtml(label)}</div><div class="memo-meta-value memo-bilingual">${en}${ko}</div>`;
  }

  function renderDescription(stored) {
    if (!stored) return '';
    // Editor.js JSON?
    if (typeof stored === 'string' && stored.trim().startsWith('{')) {
      try {
        const j = JSON.parse(stored);
        if (Array.isArray(j.blocks)) {
          return j.blocks.map((b) => {
            const d = b.data || {};
            if (b.type === 'paragraph' && d.text) return `<p>${purify(d.text)}</p>`;
            if (b.type === 'header' && d.text) return `<h${d.level || 3}>${purify(d.text)}</h${d.level || 3}>`;
            if (b.type === 'list' && Array.isArray(d.items)) {
              const tag = d.style === 'ordered' ? 'ol' : 'ul';
              return `<${tag}>${d.items.map((i) => `<li>${purify(typeof i === 'string' ? i : (i.content || i.text || ''))}</li>`).join('')}</${tag}>`;
            }
            if (b.type === 'image' && (d.file?.url || d.url)) {
              return `<img src="${escapeHtml(d.file?.url || d.url)}" alt="${escapeHtml(d.caption || '')}" style="max-width:100%"/>`;
            }
            return '';
          }).join('');
        }
      } catch {}
    }
    // Plain text fallback — paragraphs by blank line
    return String(stored).split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function wireDetailEvents(wrap) {
    const thumbs = wrap.querySelectorAll('.memo-thumb-row img');
    const primary = wrap.querySelector('#memo-detail-primary img');
    thumbs.forEach((t) => t.addEventListener('click', () => {
      const url = t.getAttribute('data-img');
      if (primary && url) {
        primary.src = url;
        thumbs.forEach((x) => x.classList.toggle('active', x === t));
      }
    }));
  }

  // ── Editor (모달 등록·편집) ─────────────────────────────────────────────
  const editor = {
    isAdmin: false,
    sessionChecked: false,
    editing: null,
    images: [],
    links: [],
    categories: [],

    async checkSession() {
      try {
        const res = await fetch('/api/admin/session', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        this.isAdmin = !!(res.ok && data && data.authenticated);
      } catch { this.isAdmin = false; }
      this.sessionChecked = true;
      return this.isAdmin;
    },

    async ensureCategories() {
      if (this.categories.length) return;
      try {
        const data = await (await fetch('/api/memorabilia/categories', { credentials: 'same-origin' })).json();
        this.categories = (data.items || []).filter((c) => !c.archived);
      } catch {}
    },

    populateCountrySelect() {
      const sel = $('#memo-country');
      if (!sel || sel.options.length) return;
      const codes = Object.keys(COUNTRY_LABELS).sort((a, b) => COUNTRY_LABELS[a].localeCompare(COUNTRY_LABELS[b], 'ko'));
      sel.innerHTML = codes.map((c) => `<option value="${c}">${escapeHtml(COUNTRY_LABELS[c])} (${c})</option>`).join('');
    },

    populateCategorySelect() {
      const sel = $('#memo-category');
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">분류 선택</option>' + this.categories.map((c) =>
        `<option value="${c.id}">${escapeHtml(c.label_ko)} / ${escapeHtml(c.label_en)}</option>`
      ).join('');
      sel.value = cur;
    },

    async openCreate() {
      const ok = await this.checkSession();
      if (!ok) { $('#memo-login-overlay').hidden = false; return; }
      await this.ensureCategories();
      this.populateCountrySelect();
      this.populateCategorySelect();
      this.editing = null;
      this.images = [];
      this.links = [];
      $('#memo-editor-title').textContent = '새 도감 항목';
      $('#memo-editor-delete').hidden = true;
      this.resetForm();
      this.renderImages();
      this.renderLinks();
      this.showModal();
    },

    async openEdit(item) {
      const ok = await this.checkSession();
      if (!ok) { $('#memo-login-overlay').hidden = false; return; }
      await this.ensureCategories();
      this.populateCountrySelect();
      this.populateCategorySelect();
      try {
        const full = await (await fetch(`/api/memorabilia/${item.id}`, { credentials: 'same-origin' })).json();
        item = full.item;
      } catch {}
      this.editing = item;
      this.images = (item.images || []).map((img) => ({
        url: img.url, alt_en: img.alt_en || '', alt_ko: img.alt_ko || '',
        is_primary: !!img.is_primary, sort_order: img.sort_order || 0,
      }));
      this.links = (item.related_links || []).map((l) => ({
        label_en: l.label_en || '', label_ko: l.label_ko || '', url: l.url || ''
      }));
      $('#memo-editor-title').textContent = '도감 항목 편집';
      $('#memo-editor-delete').hidden = false;
      this.fillForm(item);
      this.renderImages();
      this.renderLinks();
      this.showModal();
    },

    resetForm() {
      ['memo-title-en','memo-title-ko','memo-event-en','memo-event-ko','memo-year',
       'memo-material-en','memo-material-ko','memo-size','memo-issuer-en','memo-issuer-ko',
       'memo-tags','memo-desc-en','memo-desc-ko'].forEach((id) => { const el = $('#'+id); if (el) el.value = ''; });
      $('#memo-has-event').checked = false;
      $('#memo-event-row').hidden = true;
      $('#memo-category').value = '';
      $('#memo-status').value = 'draft';
      const sel = $('#memo-country');
      Array.from(sel.options).forEach((o) => { o.selected = false; });
    },

    fillForm(item) {
      $('#memo-title-en').value = item.title_en || '';
      $('#memo-title-ko').value = item.title_ko || '';
      $('#memo-has-event').checked = !!item.has_event;
      $('#memo-event-row').hidden = !item.has_event;
      $('#memo-event-en').value = item.event_name_en || '';
      $('#memo-event-ko').value = item.event_name_ko || '';
      $('#memo-year').value = item.year || '';
      $('#memo-category').value = item.category_id || '';
      $('#memo-material-en').value = item.material_en || '';
      $('#memo-material-ko').value = item.material_ko || '';
      $('#memo-size').value = item.size_text || '';
      $('#memo-issuer-en').value = item.issuer_en || '';
      $('#memo-issuer-ko').value = item.issuer_ko || '';
      $('#memo-tags').value = (item.tags || []).join(', ');
      $('#memo-desc-en').value = readPlain(item.description_en);
      $('#memo-desc-ko').value = readPlain(item.description_ko);
      $('#memo-status').value = item.status || 'draft';
      const codes = new Set(item.country_codes || []);
      const sel = $('#memo-country');
      Array.from(sel.options).forEach((o) => { o.selected = codes.has(o.value); });
    },

    showModal() {
      $('#memo-editor-modal').hidden = false;
      document.body.style.overflow = 'hidden';
      this.setupDropZone();
    },
    closeModal() {
      $('#memo-editor-modal').hidden = true;
      document.body.style.overflow = '';
      this.editing = null;
    },

    uploadingCount: 0,

    renderImages() {
      const grid = $('#memo-images-grid');
      const empty = $('#memo-images-empty');
      const meta = $('#memo-images-meta');
      if (!grid || !empty) return;

      const allTiles = this.images;
      const hasAny = allTiles.length > 0;
      grid.hidden = !hasAny;
      empty.hidden = hasAny;

      if (meta) {
        const total = this.images.filter((i) => !i.uploading).length;
        const uploading = this.images.filter((i) => i.uploading).length;
        meta.textContent = total + (uploading ? ` · ${uploading}장 업로드 중…` : '') + (total > 0 ? `장 (대표: ${this.images.find((i) => i.is_primary)?.url ? '✓' : '미지정'})` : '');
      }

      if (!hasAny) { grid.innerHTML = ''; return; }

      grid.innerHTML = allTiles.map((img, i) => {
        const classes = ['memo-image-tile'];
        if (img.is_primary) classes.push('is-primary');
        if (img.uploading) classes.push('uploading');
        const badge = img.is_primary && !img.uploading ? '<div class="tile-badge">대표</div>' : '';
        const progress = img.uploading ? `<div class="tile-progress">${img.progress || '업로드 중…'}</div>` : '';
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

      grid.querySelectorAll('input[data-primary-i]').forEach((r) => {
        r.addEventListener('change', () => {
          const i = parseInt(r.getAttribute('data-primary-i'), 10);
          editor.images.forEach((img, idx) => { img.is_primary = idx === i; });
          editor.renderImages();
        });
      });
      grid.querySelectorAll('button[data-img-del]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = parseInt(b.getAttribute('data-img-del'), 10);
          editor.images.splice(i, 1);
          if (editor.images.length && !editor.images.some((img) => img.is_primary)) {
            editor.images[0].is_primary = true;
          }
          editor.renderImages();
        });
      });
    },

    validateFile(file) {
      if (!file) return '파일이 없습니다.';
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) return `지원하지 않는 형식: ${file.name}`;
      if (file.size > 7 * 1024 * 1024) return `파일이 너무 큽니다 (>7MB): ${file.name}`;
      return null;
    },

    async addFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      const errors = [];
      // 1) Validate + create local placeholder tiles with preview
      const newPlaceholders = [];
      for (const file of files) {
        const err = this.validateFile(file);
        if (err) { errors.push(err); continue; }
        let previewDataUrl = '';
        try { previewDataUrl = await readFileAsDataUrl(file); }
        catch { errors.push(`미리보기 생성 실패: ${file.name}`); continue; }
        const placeholder = {
          url: '',
          previewDataUrl,
          alt_en: '', alt_ko: '',
          is_primary: false,
          sort_order: this.images.length + newPlaceholders.length,
          uploading: true,
          progress: '업로드 중…',
          _file: file,
        };
        newPlaceholders.push(placeholder);
      }

      if (!newPlaceholders.length) {
        if (errors.length) this.flashError(errors.join('\n'));
        return;
      }

      // First image becomes primary if none exists
      const noPrimaryYet = !this.images.some((i) => i.is_primary);
      this.images.push(...newPlaceholders);
      if (noPrimaryYet) {
        const firstIdx = this.images.findIndex((i) => !i.uploading || i === newPlaceholders[0]);
        if (firstIdx >= 0) this.images[firstIdx].is_primary = true;
      }
      this.renderImages();

      // 2) Upload sequentially (avoids overwhelming the bucket / D1)
      for (const placeholder of newPlaceholders) {
        try {
          const res = await fetch('/api/memorabilia/upload-image', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data_url: placeholder.previewDataUrl }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.url) {
            errors.push(`업로드 실패 (${placeholder._file?.name || ''}): ${data.error || 'HTTP ' + res.status}`);
            // 실패한 placeholder는 제거
            const idx = this.images.indexOf(placeholder);
            if (idx >= 0) this.images.splice(idx, 1);
            continue;
          }
          placeholder.url = data.url;
          placeholder.uploading = false;
          placeholder.previewDataUrl = '';
          placeholder._file = null;
        } catch (err) {
          errors.push(`업로드 실패 (${placeholder._file?.name || ''}): ${err.message}`);
          const idx = this.images.indexOf(placeholder);
          if (idx >= 0) this.images.splice(idx, 1);
        }
        this.renderImages();
      }

      // 3) 대표 미지정이면 첫 번째 업로드 완료 항목으로
      if (this.images.length && !this.images.some((i) => i.is_primary)) {
        const firstReady = this.images.find((i) => !i.uploading);
        if (firstReady) firstReady.is_primary = true;
        this.renderImages();
      }

      if (errors.length) this.flashError(errors.join('\n'));
    },

    flashError(msg) {
      // 사용자 친화적 토스트가 있으면 사용, 아니면 alert
      if (window.GW && typeof window.GW.showToast === 'function') {
        try { window.GW.showToast(msg, 'error'); return; } catch {}
      }
      alert(msg);
    },

    setupDropZone() {
      const zone = $('#memo-images-zone');
      if (!zone || zone._dropBound) return;
      zone._dropBound = true;
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
        editor.addFiles(dt.files);
      });
    },

    async onImageInput(e) {
      const files = e.target.files;
      // 즉시 input.value 클리어 — 같은 파일 다시 선택 가능
      try { e.target.value = ''; } catch {}
      await editor.addFiles(files);
    },

    renderLinks() {
      const wrap = $('#memo-links-wrap');
      if (!wrap) return;
      if (!this.links.length) { wrap.innerHTML = '<div class="memo-form-hint">관련 링크 없음.</div>'; return; }
      wrap.innerHTML = this.links.map((l, i) => `
        <div class="memo-link-row" data-i="${i}">
          <input placeholder="라벨 EN" value="${escapeHtml(l.label_en)}" data-link-f="label_en" data-i="${i}"/>
          <input placeholder="라벨 KO" value="${escapeHtml(l.label_ko)}" data-link-f="label_ko" data-i="${i}"/>
          <input class="url" placeholder="URL" value="${escapeHtml(l.url)}" data-link-f="url" data-i="${i}"/>
          <button type="button" class="memo-btn memo-btn-sm memo-btn-danger" data-link-del="${i}">삭제</button>
        </div>
      `).join('');
      wrap.querySelectorAll('input[data-link-f]').forEach((inp) => {
        inp.addEventListener('input', () => {
          const i = parseInt(inp.getAttribute('data-i'), 10);
          const f = inp.getAttribute('data-link-f');
          if (editor.links[i]) editor.links[i][f] = inp.value;
        });
      });
      wrap.querySelectorAll('button[data-link-del]').forEach((b) => {
        b.addEventListener('click', () => {
          editor.links.splice(parseInt(b.getAttribute('data-link-del'), 10), 1);
          editor.renderLinks();
        });
      });
    },

    addLink() {
      this.links.push({ label_en: '', label_ko: '', url: '' });
      this.renderLinks();
    },

    async save() {
      const sel = $('#memo-country');
      const country_codes = Array.from(sel.selectedOptions).map((o) => o.value);
      const tags = ($('#memo-tags').value || '').split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      const body = {
        title_en: $('#memo-title-en').value,
        title_ko: $('#memo-title-ko').value,
        has_event: $('#memo-has-event').checked,
        event_name_en: $('#memo-event-en').value,
        event_name_ko: $('#memo-event-ko').value,
        year: $('#memo-year').value || null,
        category_id: $('#memo-category').value ? parseInt($('#memo-category').value, 10) : null,
        material_en: $('#memo-material-en').value,
        material_ko: $('#memo-material-ko').value,
        size_text: $('#memo-size').value,
        issuer_en: $('#memo-issuer-en').value,
        issuer_ko: $('#memo-issuer-ko').value,
        description_en: plainToEditorJson($('#memo-desc-en').value),
        description_ko: plainToEditorJson($('#memo-desc-ko').value),
        related_links: this.links.filter((l) => l.url),
        country_codes,
        tags,
        images: this.images,
        status: $('#memo-status').value || 'draft',
      };
      const btn = $('#memo-editor-save');
      btn.disabled = true; const orig = btn.textContent; btn.textContent = '저장 중…';
      try {
        const url = this.editing ? `/api/memorabilia/${this.editing.id}` : '/api/memorabilia';
        const method = this.editing ? 'PATCH' : 'POST';
        const res = await fetch(url, {
          method, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.status);
        this.closeModal();
        if (location.pathname.startsWith('/memorabilia/')) {
          // detail view — reload current
          loadDetail(getSlugFromPath());
        } else {
          state.page = 1;
          runSearch();
        }
      } catch (err) {
        alert('저장 실패: ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    },

    async remove() {
      if (!this.editing || !this.editing.id) return;
      if (!confirm('이 도감 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
      try {
        const res = await fetch(`/api/memorabilia/${this.editing.id}`, {
          method: 'DELETE', credentials: 'same-origin',
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || res.status); }
        this.closeModal();
        location.href = '/memorabilia';
      } catch (err) { alert('삭제 실패: ' + err.message); }
    },
  };

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function readPlain(stored) {
    if (!stored) return '';
    if (typeof stored === 'string' && stored.trim().startsWith('{')) {
      try {
        const j = JSON.parse(stored);
        if (Array.isArray(j.blocks)) {
          return j.blocks.map((b) => (b.data && (b.data.text || b.data.caption || b.data.title)) || '')
            .filter(Boolean).map((s) => s.replace(/<[^>]*>/g, '')).join('\n\n');
        }
      } catch {}
    }
    return String(stored);
  }

  function plainToEditorJson(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    const blocks = t.split(/\n{2,}/).map((p) => ({
      type: 'paragraph',
      data: { text: escapeHtml(p).replace(/\n/g, '<br>') },
    }));
    return JSON.stringify({ blocks });
  }

  function wireEditorEvents() {
    const addBtn = $('#memo-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => editor.openCreate());

    const detailEditBtn = $('#memo-detail-edit-btn');
    if (detailEditBtn) detailEditBtn.addEventListener('click', () => {
      if (window.__memoDetailItem) editor.openEdit(window.__memoDetailItem);
    });

    $('#memo-editor-close')?.addEventListener('click', () => editor.closeModal());
    $('#memo-editor-cancel')?.addEventListener('click', () => editor.closeModal());
    $('#memo-editor-save')?.addEventListener('click', () => editor.save());
    $('#memo-editor-delete')?.addEventListener('click', () => editor.remove());
    $('#memo-editor-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'memo-editor-modal') editor.closeModal();
    });

    $('#memo-has-event')?.addEventListener('change', () => {
      $('#memo-event-row').hidden = !$('#memo-has-event').checked;
    });

    $('#memo-image-add')?.addEventListener('click', () => $('#memo-image-input').click());
    $('#memo-image-input')?.addEventListener('change', (e) => editor.onImageInput(e));
    $('#memo-link-add')?.addEventListener('click', () => editor.addLink());

    $('#memo-login-close')?.addEventListener('click', () => { $('#memo-login-overlay').hidden = true; });
    $('#memo-login-cancel')?.addEventListener('click', () => { $('#memo-login-overlay').hidden = true; });
    $('#memo-login-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'memo-login-overlay') $('#memo-login-overlay').hidden = true;
    });
  }

  // Boot: 1) 표준 사이트 chrome 부팅, 2) 에디터 이벤트, 3) 라우팅
  function boot() {
    if (window.GW && typeof window.GW.bootstrapStandardPage === 'function') {
      try { window.GW.bootstrapStandardPage(); } catch (e) {}
    }
    wireEditorEvents();
    route();
    // 비동기로 세션 체크 (어드민이면 detail 페이지에서 편집 버튼 노출)
    editor.checkSession().then(() => {
      if (editor.isAdmin) {
        const bar = $('#memo-detail-admin-bar');
        if (bar && !$('#memo-detail-view').hidden) bar.hidden = false;
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Handle back/forward
  window.addEventListener('popstate', route);
})();
