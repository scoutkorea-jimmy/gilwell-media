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
      grid.innerHTML = `<div class="memo-empty"><h3>${q ? '결과가 없어요' : '준비 중입니다'}</h3><p>${q ? '다른 키워드로 검색해보세요.' : '곧 다양한 기념품이 추가됩니다.'}</p></div>`;
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
      document.title = `${item.title_en || item.title_ko} — 스카우트 기념품 도감 — BP미디어`;
      wrap.innerHTML = renderDetail(item);
      wireDetailEvents(wrap);
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

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', route);
  } else {
    route();
  }
  // Handle back/forward
  window.addEventListener('popstate', route);
})();
