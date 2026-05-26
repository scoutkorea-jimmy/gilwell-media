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

  // 국가 카탈로그는 /api/memorabilia/countries (functions/_shared/country-code-labels.js)
  // 단일 소스에서 fetch. 로컬 캐시는 memorabilia-shared.js GW.MemorabiliaCountries 가 관리.
  let COUNTRY_LABELS = {}; // {code: {ko, en}} — populateCountryOptions() 에서 채움

  // 업로드 에러 → 한국어 사유 (서버 응답 매핑은 memorabilia-shared.js GW.MemorabiliaUpload.describeError)
  const upload = (window.GW && window.GW.MemorabiliaUpload) ? window.GW.MemorabiliaUpload : null;

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
    // ba.min.js 는 페이지 첫 로드 시 ins.kakao_ad_area 를 스캔해 광고를 채운다.
    // detail view 가 처음 hidden 이었다면 슬롯이 비어 있을 수 있으므로 가시화
    // 직후 스크립트를 재로드해 다시 스캔하도록 한다.
    reloadKakaoAdfit();
  }

  function reloadKakaoAdfit() {
    try {
      var prev = document.querySelector('script[data-kakao-adfit-loader]');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      var s = document.createElement('script');
      s.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
      s.async = true;
      s.setAttribute('data-kakao-adfit-loader', '1');
      document.body.appendChild(s);
    } catch (_) { /* 광고 실패는 페이지 동작에 영향 없게 무시 */ }
  }

  // ── List/Search state ──────────────────────────────────────────────────
  const state = {
    initialized: false,
    page: 1,
    pageSize: 16,             // 4컬럼 × 4줄 (PC). 좁은 viewport 에서는 computePageSize() 가 조정.
    selectedTags: new Set(),  // 인기 태그 칩 다중 선택 (AND 필터)
  };

  // 도감 카드 그리드 컬럼 수 × 4 (4줄) = 페이지 크기. 사용자 요청 (2026-05-27).
  function computePageSize() {
    var w = window.innerWidth || 1200;
    var cols = w >= 1280 ? 4 : w >= 960 ? 3 : w >= 600 ? 2 : 1;
    return cols * 4;
  }

  // 에디터 태그 칩 입력 state (모달 전용 — 신규/편집 공용)
  const tagsChipState = { tags: [] };

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
    const eventFilter = $('#memo-filter-event');
    if (eventFilter) eventFilter.addEventListener('change', () => { state.page = 1; runSearch(); });
    $('#memo-filter-sort').addEventListener('change', () => { state.page = 1; runSearch(); });
    $('#memo-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { state.page = 1; runSearch(); }
    });
    // 연도 from/to — 입력 중에는 debounce 로, blur 시 즉시.
    const yearFromEl = $('#memo-filter-year-from');
    const yearToEl   = $('#memo-filter-year-to');
    if (yearFromEl) {
      yearFromEl.addEventListener('input', debounce(() => { state.page = 1; runSearch(); }, 320));
      yearFromEl.addEventListener('change', () => { state.page = 1; runSearch(); });
    }
    if (yearToEl) {
      yearToEl.addEventListener('input', debounce(() => { state.page = 1; runSearch(); }, 320));
      yearToEl.addEventListener('change', () => { state.page = 1; runSearch(); });
    }
    // 제작기관 부분 일치 필터
    const issuerEl = $('#memo-filter-issuer');
    if (issuerEl) {
      issuerEl.addEventListener('input', debounce(() => { state.page = 1; runSearch(); }, 280));
    }
    // 태그 전체 해제
    const tagClearBtn = $('#memo-filter-tags-clear');
    if (tagClearBtn) tagClearBtn.addEventListener('click', () => {
      state.selectedTags.clear();
      updateTagChipsActiveState();
      tagClearBtn.hidden = true;
      state.page = 1;
      runSearch();
    });

    // Load filter options
    await Promise.all([loadCategoryOptions(), populateCountryOptions(), populateEventOptions(), loadPopularTags()]);
    // URL 의 사전 적용된 필터 반영
    const cur = new URLSearchParams(location.search);
    if (cur.get('category')) $('#memo-filter-category').value = cur.get('category');
    if (cur.get('country'))  $('#memo-filter-country').value  = cur.get('country');
    if (cur.get('event'))    { const ef = $('#memo-filter-event'); if (ef) ef.value = cur.get('event'); }
    if (cur.get('sort'))     $('#memo-filter-sort').value     = cur.get('sort');
    if (cur.get('year_from')) $('#memo-filter-year-from').value = cur.get('year_from');
    if (cur.get('year_to'))   $('#memo-filter-year-to').value   = cur.get('year_to');
    if (cur.get('issuer'))    $('#memo-filter-issuer').value    = cur.get('issuer');
    if (cur.get('tag')) {
      cur.get('tag').split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => state.selectedTags.add(t));
      updateTagChipsActiveState();
      if (tagClearBtn && state.selectedTags.size) tagClearBtn.hidden = false;
    }
  }

  // 인기 태그 영역 — 사용자 요청(2026-05-27)으로 도감 페이지에서 영구 숨김.
  // 필터 칩 클릭 흐름 자체는 selectedTags state 와 URL ?tag= 로 유지되므로
  // 외부에서 들어오는 태그 링크는 그대로 동작한다.
  async function loadPopularTags() {
    const wrap = $('#memo-filter-tags-wrap');
    if (wrap) wrap.hidden = true;
  }

  function updateTagChipsActiveState() {
    document.querySelectorAll('.memo-filter-tag-chip').forEach((btn) => {
      btn.classList.toggle('is-active', state.selectedTags.has(btn.getAttribute('data-tag')));
    });
  }

  async function populateEventOptions() {
    const sel = $('#memo-filter-event');
    if (!sel) return;
    if (!window.GW || !window.GW.MemorabiliaEvents) return;
    try {
      const items = await window.GW.MemorabiliaEvents.load();
      const opts = ['<option value="">행사 전체</option>'];
      items.filter((e) => !e.archived).forEach((ev) => {
        const label = (ev.name_ko || ev.name_en || `행사 #${ev.id}`)
          + (ev.period_text ? ` (${ev.period_text})` : '');
        opts.push(`<option value="${ev.id}">${escapeHtml(label)}</option>`);
      });
      sel.innerHTML = opts.join('');
    } catch (err) {
      console.warn('events catalog load failed:', err);
    }
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

  async function populateCountryOptions() {
    if (!window.GW || !window.GW.MemorabiliaCountries) return;
    try {
      const items = await window.GW.MemorabiliaCountries.load();
      // 로컬 lookup 캐시 갱신 (renderResults 에서 메타 라벨 출력에 사용 — ko+en 둘 다 저장)
      COUNTRY_LABELS = {};
      items.forEach((c) => { COUNTRY_LABELS[c.code] = { ko: c.name_ko, en: c.name_en || c.code }; });
      const sel = $('#memo-filter-country');
      if (!sel) return;
      sel.innerHTML = '<option value="">국가 전체</option>' + items.map((c) =>
        `<option value="${c.code}">${escapeHtml(c.name_ko)}</option>`
      ).join('');
    } catch (err) {
      console.warn('country catalog load failed:', err);
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function runSearch() {
    // 매 검색마다 viewport 기준 4줄로 page size 재계산 (창 크기 변경 반영).
    state.pageSize = computePageSize();
    const q = ($('#memo-search-input')?.value || '').trim();
    const category = $('#memo-filter-category')?.value || '';
    const country = $('#memo-filter-country')?.value || '';
    const eventId = $('#memo-filter-event')?.value || '';
    const sort = $('#memo-filter-sort')?.value || 'relevance';
    const yearFrom = ($('#memo-filter-year-from')?.value || '').trim();
    const yearTo   = ($('#memo-filter-year-to')?.value   || '').trim();
    const issuer   = ($('#memo-filter-issuer')?.value    || '').trim();
    const tagCsv   = Array.from(state.selectedTags).join(',');
    const meta = $('#memo-results-meta');
    const grid = $('#memo-grid');

    // sync URL (replace, no scroll)
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (country) params.set('country', country);
    if (eventId) params.set('event', eventId);
    if (sort !== 'relevance') params.set('sort', sort);
    if (yearFrom) params.set('year_from', yearFrom);
    if (yearTo)   params.set('year_to',   yearTo);
    if (issuer)   params.set('issuer',    issuer);
    if (tagCsv)   params.set('tag',       tagCsv);
    if (state.page > 1) params.set('page', String(state.page));
    const newSearch = params.toString();
    history.replaceState(null, '', '/memorabilia' + (newSearch ? '?' + newSearch : ''));

    meta.innerHTML = '<span class="memo-bilingual-inline"><span class="lang-en" lang="en">Searching…</span><span class="lang-ko" lang="ko">검색 중…</span></span>';
    grid.innerHTML = '';

    try {
      const apiParams = new URLSearchParams({
        q, sort,
        page: String(state.page),
        limit: String(state.pageSize),
      });
      if (category) apiParams.set('category', category);
      if (country) apiParams.set('country', country);
      if (eventId) apiParams.set('event', eventId);
      if (yearFrom) apiParams.set('year_from', yearFrom);
      if (yearTo)   apiParams.set('year_to',   yearTo);
      if (issuer)   apiParams.set('issuer',    issuer);
      if (tagCsv)   apiParams.set('tag',       tagCsv);

      const res = await fetch('/api/memorabilia/search?' + apiParams.toString(), { credentials: 'same-origin' });
      const data = await res.json();

      renderResults(data, q);
    } catch (err) {
      meta.innerHTML = `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">Search failed: ${escapeHtml(err.message)}</span><span class="lang-ko" lang="ko">검색 실패: ${escapeHtml(err.message)}</span></span>`;
    }
  }

  function renderResults(data, q) {
    const meta = $('#memo-results-meta');
    const grid = $('#memo-grid');
    const total = data.total || 0;
    const items = data.results || [];

    if (total === 0) {
      const qSafe = escapeHtml(q);
      meta.innerHTML = q
        ? `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">No results for "${qSafe}"</span><span class="lang-ko" lang="ko">"${qSafe}" 검색 결과 없음</span></span>`
        : `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">No memorabilia registered yet</span><span class="lang-ko" lang="ko">아직 등록된 기념품이 없습니다.</span></span>`;
      const adminHint = !q
        ? `<p style="margin-top:12px;font-size:.9em;opacity:.7" class="memo-bilingual-inline">
             <span class="lang-en" lang="en">If you are an admin, add items in the <a href="/admin#memorabilia" style="color:var(--color-scouting-purple);text-decoration:underline">admin → Scout Memorabilia</a> panel.</span>
             <span class="lang-ko" lang="ko">관리자라면 <a href="/admin#memorabilia" style="color:var(--color-scouting-purple);text-decoration:underline">관리자 페이지의 '스카우트 백과 → 기념품 도감'</a>에서 항목을 추가할 수 있습니다.</span>
           </p>`
        : '';
      const titleHtml = q
        ? `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">No matches</span><span class="lang-ko" lang="ko">결과가 없어요</span></span>`
        : `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">Coming soon</span><span class="lang-ko" lang="ko">준비 중입니다</span></span>`;
      const bodyHtml = q
        ? `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">Try a different keyword.</span><span class="lang-ko" lang="ko">다른 키워드로 검색해보세요.</span></span>`
        : `<span class="memo-bilingual-inline"><span class="lang-en" lang="en">More memorabilia will be added shortly.</span><span class="lang-ko" lang="ko">곧 다양한 기념품이 추가됩니다.</span></span>`;
      grid.innerHTML = `<div class="memo-empty"><h3>${titleHtml}</h3><p>${bodyHtml}</p>${adminHint}</div>`;
      $('#memo-pagination').innerHTML = '';
      return;
    }

    // 결과 카운트 — EN: "23 results for \"q\"" · KO: "총 23건 · \"q\" 검색"
    const qSafe = escapeHtml(q);
    meta.innerHTML = `<span class="memo-bilingual-inline">
      <span class="lang-en" lang="en">${total} result${total === 1 ? '' : 's'}${q ? ` for "${qSafe}"` : ''}</span>
      <span class="lang-ko" lang="ko">총 ${total}건${q ? ` · "${qSafe}" 검색` : ''}</span>
    </span>`;
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
      // detail 페이지 직접 진입(/memorabilia/:slug) 시에도 국가 라벨 EN/KO 캐시 필요.
      // populateCountryOptions() 가 캐시를 채우므로 렌더 전에 한 번 실행.
      if (!Object.keys(COUNTRY_LABELS).length) {
        try { await populateCountryOptions(); } catch {}
      }
      wrap.innerHTML = renderDetail(item);
      wireDetailEvents(wrap);
      // Admin 수정 버튼 — 쓰기 권한 보유자(owner OR write:memorabilia) 만 노출
      editor.checkSession().then(() => {
        const bar = document.getElementById('memo-detail-admin-bar');
        if (bar) bar.hidden = !editor.canWriteMemo;
      });
      // 좋아요 + 댓글 패널 초기화 (공개 항목 한정)
      try { initEngagement(item); } catch (e) { console.warn('[memo-engagement] init failed:', e); }
    } catch (err) {
      wrap.innerHTML = '<div class="memo-empty"><h3>로드 실패</h3><p>잠시 후 다시 시도해주세요.</p></div>';
    }
  }

  function renderDetail(item) {
    const titleEn = item.title_en || '';
    const titleKo = item.title_ko || '';
    const primary = (item.images || []).find((i) => i.is_primary) || (item.images || [])[0];
    const others = (item.images || []).filter((i) => i !== primary);

    // 라벨도 값과 동일하게 EN(위)/KO(아래) 이중표기 — 일관성 확보.
    const L = {
      eventName:   { en: 'Event',       ko: '행사명' },
      eventPeriod: { en: 'Period',      ko: '행사기간' },
      country:     { en: 'Country',     ko: '국가' },
      year:        { en: 'Year',        ko: '연도' },
      category:    { en: 'Category',    ko: '분류' },
      material:    { en: 'Material',    ko: '재질' },
      size:        { en: 'Size',        ko: '크기' },
      issuer:      { en: 'Issuer',      ko: '제작기관' },
    };

    const meta = [];
    if (item.has_event && (item.event_name_en || item.event_name_ko)) {
      // 카탈로그 참조가 있으면 행사명 + 기간을 함께 표시. 없으면 free-text 이름만.
      const periodKo = item.event && item.event.period_text ? item.event.period_text : '';
      const periodEn = item.event && item.event.period_text_en ? item.event.period_text_en : '';
      const enLine = item.event_name_en
        ? `<span class="lang-en" lang="en">${escapeHtml(item.event_name_en)}</span>` : '';
      const koLine = item.event_name_ko
        ? `<span class="lang-ko" lang="ko">${escapeHtml(item.event_name_ko)}</span>` : '';
      meta.push(metaRow(L.eventName, enLine, koLine));
      if (periodEn || periodKo) {
        // 분류·제작기관 패턴과 동일: 영문이 위, 국문이 아래
        const enP = periodEn ? `<span class="lang-en" lang="en">${escapeHtml(periodEn)}</span>` : '';
        const koP = periodKo ? `<span class="lang-ko" lang="ko">${escapeHtml(periodKo)}</span>` : '';
        meta.push(metaRow(L.eventPeriod, enP, koP));
      }
    }
    if (item.country_codes && item.country_codes.length) {
      // EN: "Korea, Japan" (영문 위) / KO: "한국, 일본" (국문 아래) — 분류·제작기관과 동일 패턴.
      const enLabels = item.country_codes
        .map((c) => (COUNTRY_LABELS[c] && COUNTRY_LABELS[c].en) || c)
        .filter(Boolean).join(', ');
      const koLabels = item.country_codes
        .map((c) => (COUNTRY_LABELS[c] && COUNTRY_LABELS[c].ko) || c)
        .filter(Boolean).join(', ');
      const enLine = enLabels ? `<span class="lang-en" lang="en">${escapeHtml(enLabels)}</span>` : '';
      const koLine = koLabels && koLabels !== enLabels
        ? `<span class="lang-ko" lang="ko">${escapeHtml(koLabels)}</span>` : '';
      meta.push(metaRow(L.country, enLine, koLine));
    }
    if (item.year) meta.push(metaRow(L.year, `${item.year}`, ''));
    if (item.category_label_en || item.category_label_ko) {
      meta.push(metaRow(L.category,
        item.category_label_en ? `<span class="lang-en" lang="en">${escapeHtml(item.category_label_en)}</span>` : '',
        item.category_label_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.category_label_ko)}</span>` : ''));
    }
    if (item.material_en || item.material_ko) {
      meta.push(metaRow(L.material,
        item.material_en ? `<span class="lang-en" lang="en">${escapeHtml(item.material_en)}</span>` : '',
        item.material_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.material_ko)}</span>` : ''));
    }
    if (item.size_text) meta.push(metaRow(L.size, escapeHtml(item.size_text), ''));
    if (item.issuer_en || item.issuer_ko) {
      meta.push(metaRow(L.issuer,
        item.issuer_en ? `<span class="lang-en" lang="en">${escapeHtml(item.issuer_en)}</span>` : '',
        item.issuer_ko ? `<span class="lang-ko" lang="ko">${escapeHtml(item.issuer_ko)}</span>` : ''));
    }

    const descEn = renderDescription(item.description_en);
    const descKo = renderDescription(item.description_ko);

    const tagsHtml = (item.tags || []).length
      ? `<div class="memo-tags">${item.tags.map((t) => `<a class="memo-tag-chip" href="/memorabilia?q=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('')}</div>`
      : '';

    const linksHtml = (item.related_links || []).length
      ? `<div class="memo-related-links"><h3 class="memo-bilingual-inline"><span class="lang-en" lang="en">Related Links</span><span class="lang-ko" lang="ko">관련 링크</span></h3>${item.related_links.map((l) => {
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
    // label 은 { en, ko } 객체. 하위호환: string 이 들어오면 KO 단일 라벨로 처리.
    const labelEn = (label && typeof label === 'object') ? (label.en || '') : '';
    const labelKo = (label && typeof label === 'object') ? (label.ko || '') : String(label || '');
    const labelHtml = `${labelEn ? `<span class="lang-en" lang="en">${escapeHtml(labelEn)}</span>` : ''}${labelKo ? `<span class="lang-ko" lang="ko">${escapeHtml(labelKo)}</span>` : ''}`;
    return `<div class="memo-meta-label memo-bilingual">${labelHtml}</div><div class="memo-meta-value memo-bilingual">${en}${ko}</div>`;
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
    canWriteMemo: false, // owner OR write:memorabilia
    role: null,
    permSet: null,
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
        this.role = (data && data.role) || null;
        const permList = (data && data.user && data.user.permissions && data.user.permissions.permissions) || [];
        this.permSet = new Set(permList);
        // Owner 는 무조건 통과, member 는 write:memorabilia 토큰 필요
        this.canWriteMemo = this.isAdmin && (this.role === 'owner' || this.permSet.has('write:memorabilia'));
      } catch { this.isAdmin = false; this.canWriteMemo = false; }
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

    countryPicker: null,
    eventPicker: null,

    ensureCountryPicker(initial) {
      const host = $('#memo-country-picker');
      if (!host) return null;
      if (!window.GW || !window.GW.MemorabiliaCountries) return null;
      if (this.countryPicker) {
        this.countryPicker.setValue(initial || []);
        return this.countryPicker;
      }
      this.countryPicker = window.GW.MemorabiliaCountries.attach({
        host,
        initial: initial || [],
        idPrefix: 'memo-cp',
      });
      return this.countryPicker;
    },

    ensureEventPicker(initialId, initialEvent) {
      const host = $('#memo-event-picker');
      if (!host) return null;
      if (!window.GW || !window.GW.MemorabiliaEvents) return null;
      // 매 항목 편집마다 새로 attach (host innerHTML 교체).
      this.eventPicker = window.GW.MemorabiliaEvents.attach({
        host,
        initialId, initialEvent,
        idPrefix: 'memo-ep',
      });
      return this.eventPicker;
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
      this.ensureCountryPicker([]);
      this.ensureEventPicker(null, null);
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
      // 임시저장된 draft 가 있으면 복원 prompt
      const draft = this.loadDraft();
      if (draft) {
        const when = draft._savedAt ? new Date(draft._savedAt).toLocaleString('ko-KR') : '';
        if (window.confirm('임시 저장된 도감 입력 내용이 있습니다' + (when ? ' (' + when + ')' : '') + '.\n복원하시겠습니까?\n\n[확인] 복원  [취소] 무시하고 새로 작성')) {
          this.applyDraft(draft);
        } else {
          this.clearDraft();
        }
      }
    },

    async openEdit(item) {
      const ok = await this.checkSession();
      if (!ok) { $('#memo-login-overlay').hidden = false; return; }
      await this.ensureCategories();
      this.populateCategorySelect();
      try {
        const full = await (await fetch(`/api/memorabilia/${item.id}`, { credentials: 'same-origin' })).json();
        item = full.item;
      } catch {}
      this.editing = item;
      this.ensureCountryPicker(item.country_codes || []);
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
      ['memo-title-en','memo-title-ko','memo-year',
       'memo-material-en','memo-material-ko','memo-size','memo-issuer-en','memo-issuer-ko',
       'memo-tags','memo-desc-en','memo-desc-ko'].forEach((id) => { const el = $('#'+id); if (el) el.value = ''; });
      const ti = $('#memo-tags-input'); if (ti) ti.value = '';
      setTagChipsFromArray([]);
      $('#memo-has-event').checked = false;
      $('#memo-event-row').hidden = true;
      $('#memo-category').value = '';
      $('#memo-status').value = 'draft';
      if (this.countryPicker) this.countryPicker.setValue([]);
      const suggestWrap = $('#memo-tags-suggestions'); if (suggestWrap) suggestWrap.hidden = true;
    },

    fillForm(item) {
      $('#memo-title-en').value = item.title_en || '';
      $('#memo-title-ko').value = item.title_ko || '';
      $('#memo-has-event').checked = !!item.has_event;
      $('#memo-event-row').hidden = !item.has_event;
      // event picker — 카탈로그 참조(event_id) 우선; legacy event_name 만 있으면 picker 빈 상태
      this.ensureEventPicker(item.event_id || null, item.event || null);
      $('#memo-year').value = item.year || '';
      $('#memo-category').value = item.category_id || '';
      $('#memo-material-en').value = item.material_en || '';
      $('#memo-material-ko').value = item.material_ko || '';
      $('#memo-size').value = item.size_text || '';
      $('#memo-issuer-en').value = item.issuer_en || '';
      $('#memo-issuer-ko').value = item.issuer_ko || '';
      setTagChipsFromArray(item.tags || []);
      $('#memo-desc-en').value = readPlain(item.description_en);
      $('#memo-desc-ko').value = readPlain(item.description_ko);
      $('#memo-status').value = item.status || 'draft';
      if (this.countryPicker) this.countryPicker.setValue(item.country_codes || []);
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

    // ── 임시저장 (신규 작성 한정) ────────────────────────────────────
    // 편집 모드(editing 있음)에선 사용하지 않음 — 기존 항목 덮어쓰기 혼동 방지.
    DRAFT_KEY: 'gw_memo_draft_v1',
    collectDraft() {
      return {
        _savedAt: Date.now(),
        title_en: $('#memo-title-en')?.value || '',
        title_ko: $('#memo-title-ko')?.value || '',
        has_event: !!$('#memo-has-event')?.checked,
        year: $('#memo-year')?.value || '',
        category_id: $('#memo-category')?.value || '',
        material_en: $('#memo-material-en')?.value || '',
        material_ko: $('#memo-material-ko')?.value || '',
        size_text: $('#memo-size')?.value || '',
        issuer_en: $('#memo-issuer-en')?.value || '',
        issuer_ko: $('#memo-issuer-ko')?.value || '',
        tags: $('#memo-tags')?.value || '',
        desc_en: $('#memo-desc-en')?.value || '',
        desc_ko: $('#memo-desc-ko')?.value || '',
        country_codes: this.countryPicker ? (this.countryPicker.getValue ? this.countryPicker.getValue() : []) : [],
      };
    },
    applyDraft(d) {
      if (!d) return;
      $('#memo-title-en').value = d.title_en || '';
      $('#memo-title-ko').value = d.title_ko || '';
      if (d.has_event) {
        $('#memo-has-event').checked = true;
        $('#memo-event-row').hidden = false;
      }
      $('#memo-year').value = d.year || '';
      $('#memo-category').value = d.category_id || '';
      $('#memo-material-en').value = d.material_en || '';
      $('#memo-material-ko').value = d.material_ko || '';
      $('#memo-size').value = d.size_text || '';
      $('#memo-issuer-en').value = d.issuer_en || '';
      $('#memo-issuer-ko').value = d.issuer_ko || '';
      setTagChipsFromCsv(d.tags || '');
      $('#memo-desc-en').value = d.desc_en || '';
      $('#memo-desc-ko').value = d.desc_ko || '';
      if (this.countryPicker && this.countryPicker.setValue && Array.isArray(d.country_codes)) {
        this.countryPicker.setValue(d.country_codes);
      }
    },
    hasDraftDirty() {
      if (this.editing) return false; // 편집 모드에선 dirty 검사 안 함
      const d = this.collectDraft();
      const textDirty = !!(d.title_en || d.title_ko || d.year || d.material_en || d.material_ko ||
        d.size_text || d.issuer_en || d.issuer_ko || d.tags || d.desc_en || d.desc_ko);
      const countryDirty = Array.isArray(d.country_codes) && d.country_codes.length > 0;
      const imagesDirty = !!(this.images && this.images.length);
      return textDirty || countryDirty || imagesDirty;
    },
    saveDraft() {
      try { localStorage.setItem(this.DRAFT_KEY, JSON.stringify(this.collectDraft())); }
      catch (_) {}
    },
    loadDraft() {
      try {
        const raw = localStorage.getItem(this.DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    },
    clearDraft() {
      try { localStorage.removeItem(this.DRAFT_KEY); } catch (_) {}
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
      // 공유 모듈(memorabilia-shared.js) 검증으로 사유 일원화.
      if (upload && typeof upload.validateFile === 'function') {
        const reason = upload.validateFile(file);
        return reason ? `${file?.name || ''}: ${reason}` : null;
      }
      // Fallback (공유 모듈 로드 실패 시)
      if (!file) return '파일이 없습니다.';
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) return `지원하지 않는 형식: ${file.name}`;
      if (file.size > 9 * 1024 * 1024) return `파일이 너무 큽니다 (>9MB): ${file.name}`;
      return null;
    },

    async addFiles(fileList) {
      const files = Array.from(fileList || []);
      console.log('[memo upload] addFiles called with', files.length, 'file(s)', files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
      if (!files.length) return;

      const errors = [];
      // 1) Validate + create local placeholder tiles with preview
      const newPlaceholders = [];
      for (const file of files) {
        const err = this.validateFile(file);
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
      this.showUploadProgress(0, newPlaceholders.length);

      // 2) Upload sequentially (avoids overwhelming the bucket / D1)
      let completed = 0;
      for (const placeholder of newPlaceholders) {
        try {
          console.log('[memo upload] POST /api/memorabilia/upload-image for', placeholder._file?.name);
          const res = await fetch('/api/memorabilia/upload-image', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data_url: placeholder.previewDataUrl }),
          });
          const data = await res.json().catch(() => ({}));
          console.log('[memo upload] response', res.status, data);
          if (!res.ok || !data.url) {
            const reason = upload
              ? upload.describeError(data, `HTTP ${res.status}`)
              : (data.reason || data.error || `HTTP ${res.status}`);
            errors.push(`${placeholder._file?.name || '이미지'}: ${reason}`);
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
          console.error('[memo upload] fetch threw:', err);
          const reason = upload
            ? upload.describeError({ error: 'network' }, err.message)
            : (err.message || '네트워크 오류');
          errors.push(`${placeholder._file?.name || '이미지'}: ${reason}`);
          const idx = this.images.indexOf(placeholder);
          if (idx >= 0) this.images.splice(idx, 1);
        }
        completed += 1;
        this.renderImages();
        this.showUploadProgress(completed, newPlaceholders.length);
      }

      // 3) 대표 미지정이면 첫 번째 업로드 완료 항목으로
      if (this.images.length && !this.images.some((i) => i.is_primary)) {
        const firstReady = this.images.find((i) => !i.uploading);
        if (firstReady) firstReady.is_primary = true;
        this.renderImages();
      }

      // 완료 메시지 → 2초 후 사라짐
      const okCount = newPlaceholders.length - errors.length;
      if (okCount > 0) {
        this.showUploadProgress(newPlaceholders.length, newPlaceholders.length, `✓ ${okCount}장 업로드 완료`);
        setTimeout(() => this.hideUploadProgress(), 2200);
      } else {
        this.hideUploadProgress();
      }

      if (errors.length) this.flashError(errors.join('\n'));
    },

    // 이미지 영역 상단의 진행 바 — 큰 글자 + 진행률.
    showUploadProgress(done, total, customLabel) {
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
    },
    hideUploadProgress() {
      const meta = $('#memo-images-meta');
      if (meta) meta.textContent = '';
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
      // ⚠ FileList 는 input value 가 비워지면 invalidate 된다. addFiles 호출 전에
      // Array.from 으로 스냅샷을 떠야 한다.
      const files = Array.from(e.target.files || []);
      // 같은 파일 다시 선택 가능하도록 input value 클리어 (스냅샷 이후)
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
      const country_codes = this.countryPicker ? this.countryPicker.getValue() : [];
      const tags = ($('#memo-tags').value || '').split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      const body = {
        title_en: $('#memo-title-en').value,
        title_ko: $('#memo-title-ko').value,
        has_event: $('#memo-has-event').checked,
        event_id: this.eventPicker ? this.eventPicker.getEventId() : null,
        // event_name_* 는 서버가 event_id 기준으로 카탈로그에서 가져와 덮어씀 (legacy 빈 문자열).
        event_name_en: '',
        event_name_ko: '',
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
        if (this.editing) {
          // Optimistic locking — 편집 진입 시 받은 updated_at 동봉. 서버에서
          // 동시 수정 충돌 시 409 + reason 안내. (안정성 3차)
          body.expected_updated_at = this.editing.updated_at || null;
        }
        const res = await fetch(url, {
          method, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.error === 'version_mismatch') {
          this.flashError(data.reason || '다른 운영자가 먼저 저장했습니다. 새로고침 후 다시 시도해주세요.');
          btn.disabled = false; btn.textContent = orig;
          return;
        }
        if (!res.ok) throw new Error(data.error || res.status);
        // 저장 성공 → 신규 작성 draft 폐기 (편집 모드면 애초에 사용 안 함)
        if (!this.editing && this.clearDraft) this.clearDraft();
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

  // ── Tag chip input (editor) ────────────────────────────────────────────
  // #memo-tags-input 에서 Enter / "," 시 칩 추가, Backspace 로 마지막 제거.
  // hidden #memo-tags 가 데이터 소스 (save() 가 .value 로 읽음).
  function renderTagChips() {
    const wrap = $('#memo-tags-chips');
    const hidden = $('#memo-tags');
    if (!wrap || !hidden) return;
    wrap.innerHTML = tagsChipState.tags.map((t, i) =>
      '<span class="memo-tag-chip-editor" data-i="' + i + '">' +
        escapeHtml(t) +
        '<button type="button" class="memo-tag-chip-x" data-i="' + i + '" aria-label="태그 제거">×</button>' +
      '</span>'
    ).join('');
    hidden.value = tagsChipState.tags.join(', ');
    wrap.querySelectorAll('.memo-tag-chip-x').forEach((b) => {
      b.addEventListener('click', () => {
        const i = parseInt(b.getAttribute('data-i'), 10);
        if (Number.isFinite(i)) {
          tagsChipState.tags.splice(i, 1);
          renderTagChips();
          refreshTagSuggestions();
        }
      });
    });
  }

  function addTagFromText(raw) {
    const cleaned = String(raw || '').trim().replace(/^,+|,+$/g, '').trim();
    if (!cleaned) return false;
    const lower = cleaned.toLowerCase();
    if (tagsChipState.tags.some((t) => t.toLowerCase() === lower)) return false;
    tagsChipState.tags.push(cleaned);
    renderTagChips();
    return true;
  }

  function setTagChipsFromArray(arr) {
    tagsChipState.tags = Array.isArray(arr)
      ? arr.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    renderTagChips();
  }

  function setTagChipsFromCsv(csv) {
    const arr = String(csv || '').split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    setTagChipsFromArray(arr);
  }

  function bindTagChipInput() {
    const input = $('#memo-tags-input');
    const wrap = $('#memo-tags-chip-input');
    const suggest = $('#memo-tags-suggest');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (addTagFromText(input.value)) refreshTagSuggestions();
        input.value = '';
        if (suggest) suggest.hidden = true;
      } else if (e.key === 'Backspace' && !input.value && tagsChipState.tags.length) {
        tagsChipState.tags.pop();
        renderTagChips();
        refreshTagSuggestions();
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        if (addTagFromText(input.value)) refreshTagSuggestions();
        input.value = '';
      }
      if (suggest) setTimeout(() => { suggest.hidden = true; }, 150);
    });
    // chip-input 영역 클릭 시 input 으로 포커스 (placeholder 외 영역)
    if (wrap) wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.id === 'memo-tags-chips') input.focus();
    });

    // 자동완성 — 현재 typing 값 기준 (기존 autocomplete API 재사용)
    let acTimer;
    input.addEventListener('input', () => {
      clearTimeout(acTimer);
      const q = input.value.trim();
      if (q.length < 1 || !suggest) { if (suggest) suggest.hidden = true; return; }
      acTimer = setTimeout(async () => {
        try {
          const res = await fetch('/api/memorabilia/autocomplete?type=tag&q=' + encodeURIComponent(q), { credentials: 'same-origin' });
          if (!res.ok) { suggest.hidden = true; return; }
          const data = await res.json();
          const existing = new Set(tagsChipState.tags.map((t) => t.toLowerCase()));
          const items = (data.items || []).filter((s) => !existing.has(String(s).toLowerCase()) && s.toLowerCase() !== q.toLowerCase());
          if (!items.length) { suggest.hidden = true; return; }
          suggest.innerHTML = items.map((s) => '<div class="memo-autocomplete-item" data-val="' + escapeHtml(s) + '">' + escapeHtml(s) + '</div>').join('');
          suggest.hidden = false;
          suggest.querySelectorAll('.memo-autocomplete-item').forEach((d) => {
            d.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              if (addTagFromText(d.getAttribute('data-val'))) refreshTagSuggestions();
              input.value = '';
              suggest.hidden = true;
              input.focus();
            });
          });
        } catch (_) { suggest.hidden = true; }
      }, 200);
    });
  }

  // 행사 기반 추천 태그 — 현재 선택된 event 의 다른 기념품에서 자주 쓰인 태그를
  // 빈도순으로 노출. 이미 칩으로 추가된 태그는 제외.
  let _tagSuggestTimer = null;
  async function refreshTagSuggestions() {
    const wrap = $('#memo-tags-suggestions');
    const list = $('#memo-tags-suggestions-list');
    const source = $('#memo-tags-suggestions-source');
    if (!wrap || !list) return;
    // event_id 가 있을 때만 (행사 기반 추천)
    let eventId = null;
    let eventLabel = '';
    if (editor.eventPicker && editor.eventPicker.getValue) {
      const v = editor.eventPicker.getValue();
      if (v && v.id) { eventId = v.id; eventLabel = v.title_ko || v.title_en || ''; }
    }
    if (!eventId) { wrap.hidden = true; return; }
    if (_tagSuggestTimer) clearTimeout(_tagSuggestTimer);
    _tagSuggestTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/memorabilia?event_id=' + eventId + '&limit=30', { credentials: 'same-origin' });
        if (!res.ok) { wrap.hidden = true; return; }
        const data = await res.json();
        const freq = {};
        (data.items || []).forEach((it) => {
          (it.tags || []).forEach((t) => {
            if (!t) return;
            freq[t] = (freq[t] || 0) + 1;
          });
        });
        const existing = new Set(tagsChipState.tags.map((t) => t.toLowerCase()));
        const top = Object.keys(freq)
          .filter((t) => !existing.has(t.toLowerCase()))
          .sort((a, b) => freq[b] - freq[a])
          .slice(0, 12);
        if (!top.length) { wrap.hidden = true; return; }
        if (source) source.textContent = eventLabel ? '(행사: ' + eventLabel + ')' : '(행사 기반)';
        list.innerHTML = top.map((t) =>
          '<button type="button" class="memo-tag-suggestion" data-tag="' + escapeHtml(t) + '">+ ' + escapeHtml(t) + '</button>'
        ).join('');
        list.querySelectorAll('.memo-tag-suggestion').forEach((b) => {
          b.addEventListener('click', () => {
            if (addTagFromText(b.getAttribute('data-tag'))) refreshTagSuggestions();
          });
        });
        wrap.hidden = false;
      } catch (_) { wrap.hidden = true; }
    }, 200);
  }

  // ── Autocomplete (issuer · tag) ────────────────────────────────────────
  // 사용자는 자유 입력 가능. 입력 중 기존 데이터에 매칭이 있으면 드롭다운으로 추천.
  // - bindAutocomplete: 단일값 입력 (issuer)
  // - bindTagAutocomplete: 콤마 구분 다중값 마지막 토큰 자동완성
  function bindAutocomplete(input, dropdown, type) {
    if (!input || !dropdown) return;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 1) { dropdown.innerHTML = ''; dropdown.hidden = true; return; }
      timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/memorabilia/autocomplete?type=${type}&q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
          if (!res.ok) { dropdown.hidden = true; return; }
          const data = await res.json();
          const items = (data.items || []).filter((s) => s.toLowerCase() !== q.toLowerCase());
          if (!items.length) { dropdown.hidden = true; return; }
          dropdown.innerHTML = items.map((s) => `<div class="memo-autocomplete-item" data-val="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
          dropdown.hidden = false;
          dropdown.querySelectorAll('.memo-autocomplete-item').forEach((d) => {
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
          const res = await fetch(`/api/memorabilia/autocomplete?type=tag&q=${encodeURIComponent(last)}`, { credentials: 'same-origin' });
          if (!res.ok) { dropdown.hidden = true; return; }
          const data = await res.json();
          const items = (data.items || []).filter((s) => s.toLowerCase() !== last.toLowerCase());
          if (!items.length) { dropdown.hidden = true; return; }
          dropdown.innerHTML = items.map((s) => `<div class="memo-autocomplete-item" data-val="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
          dropdown.hidden = false;
          dropdown.querySelectorAll('.memo-autocomplete-item').forEach((d) => {
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
    // 바깥 영역 클릭 — 작성 중인 내용이 있으면 임시저장 prompt 후 닫기.
    // "취소" 시 모달 유지 → 그냥 꺼지지 않도록.
    $('#memo-editor-modal')?.addEventListener('click', (e) => {
      if (e.target.id !== 'memo-editor-modal') return;
      if (editor.hasDraftDirty && editor.hasDraftDirty()) {
        const yes = window.confirm('입력 중인 내용을 임시 저장하시겠습니까?\n\n[확인] 임시 저장 후 닫기\n[취소] 모달 유지 (계속 작성)');
        if (yes) {
          editor.saveDraft();
          editor.closeModal();
        }
        // 취소 시 모달 유지 — 닫지 않음
      } else {
        editor.closeModal();
      }
    });

    $('#memo-has-event')?.addEventListener('change', () => {
      $('#memo-event-row').hidden = !$('#memo-has-event').checked;
    });

    $('#memo-image-add')?.addEventListener('click', () => $('#memo-image-input').click());
    $('#memo-image-input')?.addEventListener('change', (e) => editor.onImageInput(e));
    $('#memo-link-add')?.addEventListener('click', () => editor.addLink());

    // 제작기관 autocomplete — 사용자는 자유 입력 가능, 기존 값은 드롭다운 추천.
    bindAutocomplete($('#memo-issuer-en'), $('#memo-issuer-en-suggest'), 'issuer');
    bindAutocomplete($('#memo-issuer-ko'), $('#memo-issuer-ko-suggest'), 'issuer');
    // 태그는 새 칩 UI 사용 — bindTagChipInput 이 내부에서 autocomplete 도 처리.
    bindTagChipInput();
    // 행사(event) 변경 시 추천 태그 갱신. memo-event-row 안에 picker 가 있다고 가정 — 그 안의 input/select 모두 위임 캐치.
    const eventRow = $('#memo-event-row');
    if (eventRow) eventRow.addEventListener('change', refreshTagSuggestions, true);
    $('#memo-has-event')?.addEventListener('change', refreshTagSuggestions);

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
    // 비동기로 세션 체크 — 쓰기 권한 보유자(owner OR write:memorabilia) 만 추가/수정 UI 노출
    editor.checkSession().then(() => {
      if (editor.canWriteMemo) {
        const addBtn = $('#memo-add-btn');
        if (addBtn) addBtn.hidden = false;
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

  // ── Engagement (좋아요 + 댓글) ─────────────────────────────────────────
  let _engagementState = { memorabiliaId: null, busy: false, formBound: false };

  function initEngagement(item) {
    if (!item || !item.id) return;
    const panel = document.getElementById('memo-engagement');
    if (!panel) return;
    panel.hidden = false;
    _engagementState.memorabiliaId = item.id;

    refreshLikes();
    refreshComments();
    wireEngagementOnce();
  }

  function wireEngagementOnce() {
    if (_engagementState.formBound) return;
    _engagementState.formBound = true;

    const likeBtn = document.getElementById('memo-like-btn');
    if (likeBtn) likeBtn.addEventListener('click', onLikeClick);

    const form = document.getElementById('memo-comment-form');
    if (form) form.addEventListener('submit', onCommentSubmit);

    const list = document.getElementById('memo-comment-list');
    if (list) list.addEventListener('click', onCommentListClick);
  }

  async function refreshLikes() {
    const id = _engagementState.memorabiliaId;
    if (!id) return;
    try {
      const res = await fetch(`/api/memorabilia/${id}/like`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      applyLikeStats(data);
    } catch (_) {}
  }

  function applyLikeStats(data) {
    const btn = document.getElementById('memo-like-btn');
    const countEl = document.getElementById('memo-like-count');
    if (!btn || !countEl) return;
    btn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
    countEl.textContent = String(data.likes || 0);
  }

  async function onLikeClick() {
    const id = _engagementState.memorabiliaId;
    if (!id) return;
    const btn = document.getElementById('memo-like-btn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/memorabilia/${id}/like`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        toast('좋아요를 처리하지 못했습니다.', 'error');
        return;
      }
      const data = await res.json();
      applyLikeStats(data);
    } catch (_) {
      toast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function refreshComments() {
    const id = _engagementState.memorabiliaId;
    if (!id) return;
    const list = document.getElementById('memo-comment-list');
    // 두 개의 카운트 표기(EN/KO 병기) 모두 갱신
    const countEls = document.querySelectorAll('[data-comments-count]');
    if (!list) return;
    try {
      const res = await fetch(`/api/memorabilia/${id}/comments?limit=50`, { credentials: 'same-origin' });
      if (!res.ok) {
        list.innerHTML = `<div class="memo-comment-empty memo-bilingual">
          <span class="lang-en" lang="en">Failed to load comments.</span>
          <span class="lang-ko" lang="ko">댓글을 불러오지 못했습니다.</span>
        </div>`;
        return;
      }
      const data = await res.json();
      const items = data.items || [];
      const total = String(data.total || 0);
      countEls.forEach((el) => { el.textContent = total; });
      if (!items.length) {
        list.innerHTML = `<div class="memo-comment-empty memo-bilingual-inline">
          <span class="lang-en" lang="en">No comments yet. Be the first.</span>
          <span class="lang-ko" lang="ko">아직 댓글이 없습니다. 첫 댓글을 남겨주세요.</span>
        </div>`;
        return;
      }
      list.innerHTML = items.map(renderCommentItem).join('');
    } catch (_) {
      list.innerHTML = `<div class="memo-comment-empty memo-bilingual-inline">
        <span class="lang-en" lang="en">Failed to load comments.</span>
        <span class="lang-ko" lang="ko">댓글을 불러오지 못했습니다.</span>
      </div>`;
    }
  }

  function renderCommentItem(c) {
    const date = formatCommentDate(c.created_at);
    return `
      <article class="memo-comment-item" data-comment-id="${c.id}">
        <div class="memo-comment-head">
          <span class="memo-comment-author">${escapeHtml(c.author_name)}</span>
          <span class="memo-comment-affiliation">${escapeHtml(c.affiliation)}</span>
          <span class="memo-comment-date">${escapeHtml(date)}</span>
        </div>
        <div class="memo-comment-content">${escapeHtml(c.content)}</div>
        <div class="memo-comment-actions">
          <button type="button" class="memo-comment-delete-btn memo-bilingual-inline" data-action="delete-comment" data-comment-id="${c.id}">
            <span class="lang-en" lang="en">🔒 Delete</span>
            <span class="lang-ko" lang="ko">비밀번호로 삭제</span>
          </button>
        </div>
      </article>
    `;
  }

  function formatCommentDate(iso) {
    if (!iso) return '';
    // SQLite datetime('now') 는 UTC 'YYYY-MM-DD HH:MM:SS' 형식.
    const norm = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
    const d = new Date(norm);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  async function onCommentSubmit(e) {
    e.preventDefault();
    if (_engagementState.busy) return;
    const id = _engagementState.memorabiliaId;
    if (!id) return;

    const name = $('#memo-c-name').value.trim();
    const aff  = $('#memo-c-affiliation').value.trim();
    const pwd  = $('#memo-c-password').value;
    const body = $('#memo-c-content').value.trim();

    if (!name || !aff || !pwd || !body) {
      toast('모든 항목을 입력해주세요.', 'error');
      return;
    }
    if (pwd.length < 6) {
      toast('비밀번호는 6자 이상이어야 합니다.', 'error');
      return;
    }

    const submitBtn = $('#memo-comment-submit');
    _engagementState.busy = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(`/api/memorabilia/${id}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: name,
          affiliation: aff,
          password: pwd,
          content: body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        toast(data.error || data.message || '잠시 후 다시 시도해주세요.', 'error');
        return;
      }
      if (!res.ok) {
        const msg = (data.messages && data.messages.length)
          ? data.messages.join(' / ')
          : (data.error || '댓글 등록에 실패했습니다.');
        toast(msg, 'error');
        return;
      }
      // 폼 초기화
      $('#memo-c-name').value = '';
      $('#memo-c-affiliation').value = '';
      $('#memo-c-password').value = '';
      $('#memo-c-content').value = '';
      toast('댓글이 등록되었습니다. 관리자 검토 후 게시됩니다.', 'success');
    } catch (_) {
      toast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      _engagementState.busy = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function onCommentListClick(e) {
    const btn = e.target.closest('[data-action="delete-comment"]');
    if (!btn) return;
    const cid = parseInt(btn.getAttribute('data-comment-id'), 10);
    if (!Number.isFinite(cid)) return;

    const pwd = prompt('이 댓글의 비밀번호를 입력해주세요.');
    if (pwd === null) return;
    if (!pwd) { toast('비밀번호를 입력해주세요.', 'error'); return; }

    btn.disabled = true;
    try {
      const res = await fetch(`/api/memorabilia/comments/${cid}/delete`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast('비밀번호가 일치하지 않습니다.', 'error');
        return;
      }
      if (!res.ok) {
        toast(data.error || '댓글 삭제에 실패했습니다.', 'error');
        return;
      }
      toast('댓글이 삭제되었습니다.', 'success');
      refreshComments();
    } catch (_) {
      toast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function toast(msg, kind) {
    if (window.GW && typeof window.GW.toast === 'function') return window.GW.toast(msg, kind);
    if (typeof window.gwToast === 'function') return window.gwToast(msg, kind);
    alert(msg);
  }
})();
