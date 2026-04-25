(function () {
  'use strict';

  function renderLoading(searchRes, searchCount) {
    searchRes.innerHTML =
      '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    searchCount.style.display = 'none';
  }

  function renderEmpty(searchRes, query) {
    searchRes.innerHTML =
      '<div class="search-no-results">' +
        '<strong>검색 결과가 없습니다</strong>' +
        '"' + GW.escapeHtml(query) + '"에 해당하는 기사를 찾을 수 없습니다.' +
      '</div>';
  }

  function renderError(searchRes, message) {
    searchRes.innerHTML =
      '<div class="search-no-results"><strong>오류가 발생했습니다</strong>' + GW.escapeHtml(message || '잠시 후 다시 시도해주세요.') + '</div>';
  }

  function renderResults(searchRes, posts, scope) {
    if (scope === 'dreampath') {
      searchRes.innerHTML =
        '<div class="search-results-grid">' +
        posts.map(function (item) {
          return (
            '<a class="search-result-card" href="/dreampath.html">' +
              '<span class="category-tag cat-wosm">' + GW.escapeHtml(String(item.kind || 'item').toUpperCase()) + '</span>' +
              '<h3>' + GW.escapeHtml(item.title || '') + '</h3>' +
              (item.subtitle ? '<p class="result-sub">' + GW.escapeHtml(item.subtitle) + '</p>' : '') +
              '<div class="search-result-meta">' + GW.escapeHtml(item.meta || '') + '</div>' +
            '</a>'
          );
        }).join('') +
        '</div>';
      return;
    }
    searchRes.innerHTML =
      '<div class="search-results-grid">' +
      posts.map(function (post) {
        var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
        return (
          '<a class="search-result-card" href="/post/' + post.id + '">' +
            '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
            '<h3>' + GW.escapeHtml(post.title) + '</h3>' +
            (post.subtitle ? '<p class="result-sub">' + GW.escapeHtml(post.subtitle) + '</p>' : '') +
            '<div class="search-result-meta">' +
              GW.formatPostDate(post) +
              (post.author ? ' &nbsp;·&nbsp; ' + GW.escapeHtml(post.author) : '') +
            '</div>' +
          '</a>'
        );
      }).join('') +
      '</div>';
  }

  function populateCategoryFilter(categoryEl) {
    if (!categoryEl || typeof GW === 'undefined') return;
    if (typeof GW.populateCategorySelect === 'function') {
      GW.populateCategorySelect(categoryEl, { includeAll: true, allLabel: '전체 카테고리' });
      return;
    }
    categoryEl.innerHTML = '<option value="">전체 카테고리</option>';
  }

  function initSearchPage() {
    if (typeof GW === 'undefined') return;
    GW.bootstrapStandardPage();

    var searchInput = document.getElementById('search-input');
    var searchBtn = document.getElementById('search-btn');
    var searchCount = document.getElementById('search-count');
    var searchRes = document.getElementById('search-results');
    var searchPagination = document.getElementById('search-pagination');
    var categoryEl = document.getElementById('search-category');
    var startDateEl = document.getElementById('search-start-date');
    var endDateEl = document.getElementById('search-end-date');
    var tagEl = document.getElementById('search-tag');
    var scopeButtons = document.querySelectorAll('[data-scope]');
    var activeScope = 'site';
    var currentPage = 1;
    var lastQuery = '';
    var pageSize = 16;
    var totalPages = 1;

    if (!searchInput || !searchBtn || !searchCount || !searchRes) {
      return;
    }

    populateCategoryFilter(categoryEl);

    function renderPagination() {
      if (!searchPagination) return;
      if (activeScope !== 'site' || totalPages <= 1) {
        searchPagination.innerHTML = '';
        return;
      }

      var start = Math.max(1, currentPage - 2);
      var end = Math.min(totalPages, start + 4);
      start = Math.max(1, end - 4);
      var html = '';

      if (currentPage > 1) {
        html += '<button type="button" class="board-page-btn board-page-nav" data-page="' + (currentPage - 1) + '" aria-label="이전 검색 페이지">이전</button>';
      }
      if (start > 1) {
        html += '<button type="button" class="board-page-btn" data-page="1">1</button>';
        if (start > 2) html += '<span class="board-page-ellipsis" aria-hidden="true">…</span>';
      }
      for (var page = start; page <= end; page += 1) {
        html += '<button type="button" class="board-page-btn' + (page === currentPage ? ' active' : '') + '"' +
          ' data-page="' + page + '"' + (page === currentPage ? ' aria-current="page"' : '') + '>' + page + '</button>';
      }
      if (end < totalPages) {
        if (end < totalPages - 1) html += '<span class="board-page-ellipsis" aria-hidden="true">…</span>';
        html += '<button type="button" class="board-page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
      }
      if (currentPage < totalPages) {
        html += '<button type="button" class="board-page-btn board-page-nav" data-page="' + (currentPage + 1) + '" aria-label="다음 검색 페이지">다음</button>';
      }

      searchPagination.innerHTML = html;
      searchPagination.querySelectorAll('[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var nextPage = parseInt(btn.getAttribute('data-page') || '1', 10);
          if (!Number.isFinite(nextPage) || nextPage === currentPage || nextPage < 1 || nextPage > totalPages) return;
          currentPage = nextPage;
          doSearch(lastQuery, { preservePage: true });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }

    function doSearch(query, options) {
      var opts = options || {};
      query = (query || '').trim();
      if (!query) return;
      if (!opts.preservePage) currentPage = 1;
      lastQuery = query;

      renderLoading(searchRes, searchCount);
      if (searchPagination) searchPagination.innerHTML = '';

      var params = new URLSearchParams();
      params.set('q', query);
      var endpoint = '/api/posts?page=' + currentPage;
      if (activeScope === 'dreampath') {
        endpoint = '/api/dreampath/search';
      } else {
        if (categoryEl && categoryEl.value) params.set('category', categoryEl.value);
        if (startDateEl && startDateEl.value) params.set('start_date', startDateEl.value);
        if (endDateEl && endDateEl.value) params.set('end_date', endDateEl.value);
        if (tagEl && tagEl.value.trim()) params.set('tag', tagEl.value.trim());
      }

      GW.apiFetch(endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + params.toString())
        .then(function (data) {
          var posts = activeScope === 'dreampath' ? (data.results || []) : (data.posts || []);
          var total = data.total || posts.length;
          pageSize = Math.max(1, parseInt(data.pageSize, 10) || posts.length || 16);
          totalPages = Math.max(1, Math.ceil(total / pageSize));
          var startIndex = total ? ((currentPage - 1) * pageSize) + 1 : 0;
          var endIndex = total ? Math.min(total, startIndex + posts.length - 1) : 0;

          searchCount.style.display = 'block';
          searchCount.textContent = '"' + query + '" 검색 결과 ' + total + '건' +
            (activeScope === 'site' && total ? ' · ' + startIndex + '-' + endIndex + '건 표시' : '');

          if (!posts.length) {
            renderEmpty(searchRes, query);
            renderPagination();
            return;
          }

          renderResults(searchRes, posts, activeScope);
          renderPagination();
        })
        .catch(function (error) {
          totalPages = 1;
          if (activeScope === 'dreampath') {
            if (error && Number(error.status) === 401) {
              searchRes.innerHTML =
                '<div class="search-no-results"><strong>Dreampath 로그인이 필요합니다</strong>내부 검색은 로그인한 상태에서 사용할 수 있습니다.</div>';
              if (searchPagination) searchPagination.innerHTML = '';
              return;
            }
            renderError(searchRes, (error && error.message) ? 'Dreampath 검색 중 오류가 발생했습니다. ' + error.message : 'Dreampath 검색 중 오류가 발생했습니다.');
            if (searchPagination) searchPagination.innerHTML = '';
            return;
          }
          renderError(searchRes, (error && error.message) ? error.message : '');
          if (searchPagination) searchPagination.innerHTML = '';
        });
    }

    var urlQ = new URLSearchParams(window.location.search).get('q') || '';
    if (urlQ) {
      searchInput.value = urlQ;
      doSearch(urlQ);
    }

    searchBtn.addEventListener('click', function () {
      doSearch(searchInput.value);
    });

    scopeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeScope = btn.getAttribute('data-scope') || 'site';
        currentPage = 1;
        scopeButtons.forEach(function (item) {
          item.classList.toggle('active', item === btn);
          item.setAttribute('aria-pressed', item === btn ? 'true' : 'false');
        });
        var filterGrid = document.getElementById('search-filter-grid');
        if (filterGrid) filterGrid.style.display = activeScope === 'site' ? 'grid' : 'none';
        if (searchPagination && activeScope !== 'site') searchPagination.innerHTML = '';
        if (lastQuery) doSearch(lastQuery);
      });
    });

    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        doSearch(searchInput.value);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchPage);
  } else {
    initSearchPage();
  }
})();
