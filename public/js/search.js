(function () {
  'use strict';

  function renderLoading(searchRes, searchCount) {
    searchRes.innerHTML =
      '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    searchCount.textContent = '검색 중…';
  }

  function renderEmpty(searchRes, query, scope) {
    searchRes.innerHTML =
      '<div class="search-no-results">' +
        '<strong>검색 결과가 없습니다</strong>' +
        '“' + GW.escapeHtml(query) + '” 대신 다른 검색어를 입력해 보세요.' +
        (scope === 'site' ? ' <a href="/latest">최신 기사 목록 보기 →</a>' : '') +
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
            '<a class="search-result-card" href="/dreampath">' +
              '<span class="category-tag cat-wosm">' + GW.escapeHtml(String(item.kind || 'item').toUpperCase()) + '</span>' +
              '<h2>' + GW.escapeHtml(item.title || '') + '</h2>' +
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
            '<h2>' + GW.escapeHtml(post.title) + '</h2>' +
            (post.subtitle ? '<p class="result-sub">' + GW.escapeHtml(post.subtitle) + '</p>' : '') +
            '<div class="search-result-meta">' +
              GW.renderPostDateLabel(post) +
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
    var form = document.getElementById('reader-search');
    var searchOptions = document.getElementById('search-options');
    var searchCount = document.getElementById('search-count');
    var searchRes = document.getElementById('search-results');
    var searchPagination = document.getElementById('search-pagination');
    var categoryEl = document.getElementById('search-category');
    var startDateEl = document.getElementById('search-start-date');
    var endDateEl = document.getElementById('search-end-date');
    var tagEl = document.getElementById('search-tag');
    var filters = { category: categoryEl, tag: tagEl, start_date: startDateEl, end_date: endDateEl };
    var scopeButtons = document.querySelectorAll('[data-scope]');
    var activeScope = 'site';
    var currentPage = 1;
    var lastQuery = '';
    var pageSize = 16;
    var totalPages = 1;
    var searchRequest = 0;

    if (!form || !searchInput || !searchCount || !searchRes) {
      return;
    }

    populateCategoryFilter(categoryEl);
    var urlParams = new URLSearchParams(window.location.search);
    Object.keys(filters).forEach(function (key) {
      filters[key].value = urlParams.get(key) || '';
    });
    searchOptions.open = Object.values(filters).some(function (field) { return field.value; });
    currentPage = Math.min(100000, Math.max(1, parseInt(urlParams.get('page'), 10) || 1));
    lastQuery = (urlParams.get('q') || '').trim();
    searchInput.value = lastQuery;

    function pageUrl(page) {
      var url = new URL(window.location.href);
      if (page === 1) url.searchParams.delete('page'); else url.searchParams.set('page', page);
      return url.pathname + url.search;
    }

    function renderPagination() {
      if (activeScope !== 'site' || totalPages <= 1) {
        searchPagination.replaceChildren();
        return;
      }
      function pageLink(page, label) {
        var link = document.createElement('a');
        link.href = pageUrl(page);
        link.className = 'board-page-btn';
        link.textContent = label || String(page);
        link.setAttribute('aria-label', label ? label + ' 검색 페이지' : page + '페이지');
        if (label) link.classList.add('board-page-nav');
        if (page === currentPage) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
        return link;
      }
      var start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
      var end = Math.min(totalPages, start + 4);
      var links = document.createDocumentFragment();
      if (currentPage > 1) links.append(pageLink(currentPage - 1, '이전'));
      if (start > 1) links.append(pageLink(1));
      if (start > 2) links.append('…');
      for (var page = start; page <= end; page++) links.append(pageLink(page));
      if (end < totalPages - 1) links.append('…');
      if (end < totalPages) links.append(pageLink(totalPages));
      if (currentPage < totalPages) links.append(pageLink(currentPage + 1, '다음'));
      searchPagination.replaceChildren(links);
    }

    function doSearch(query, options) {
      var opts = options || {};
      query = (query || '').trim();
      if (!query) return;
      if (!opts.preservePage) currentPage = 1;
      lastQuery = query;
      var request = ++searchRequest;

      renderLoading(searchRes, searchCount);
      if (searchPagination) searchPagination.innerHTML = '';

      var params = new URLSearchParams();
      params.set('q', query);
      var endpoint = '/api/posts?page=' + currentPage;
      if (activeScope === 'dreampath') {
        endpoint = '/api/dreampath/search';
      } else {
        Object.keys(filters).forEach(function (key) {
          var value = filters[key].value.trim();
          if (value) params.set(key, value);
        });
      }

      GW.apiFetch(endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + params.toString())
        .then(function (data) {
          if (request !== searchRequest) return;
          var posts = activeScope === 'dreampath' ? (data.results || []) : (data.posts || []);
          var total = data.total || posts.length;
          pageSize = Math.max(1, parseInt(data.pageSize, 10) || posts.length || 16);
          totalPages = Math.max(1, Math.ceil(total / pageSize));
          if (activeScope === 'site' && currentPage > totalPages) {
            window.location.replace(pageUrl(totalPages));
            return;
          }
          if (activeScope === 'site' && !opts.preservePage) {
            document.dispatchEvent(new CustomEvent('bp:search-results', { detail: total > 0 }));
          }
          var startIndex = total ? ((currentPage - 1) * pageSize) + 1 : 0;
          var endIndex = total ? Math.min(total, startIndex + posts.length - 1) : 0;

          searchCount.textContent = '"' + query + '" 검색 결과 ' + total + '건' +
            (activeScope === 'site' && total ? ' · ' + startIndex + '-' + endIndex + '건 표시' : '');

          if (!posts.length) {
            renderEmpty(searchRes, query, activeScope);
            renderPagination();
            return;
          }

          renderResults(searchRes, posts, activeScope);
          renderPagination();
        })
        .catch(function (error) {
          if (request !== searchRequest) return;
          totalPages = 1;
          searchCount.textContent = '검색을 완료하지 못했습니다.';
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

    if (lastQuery) doSearch(lastQuery, { preservePage: currentPage > 1 });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var query = searchInput.value.trim();
      if (!query) { searchInput.focus(); return; }
      if (activeScope === 'dreampath') { doSearch(query); return; }
      if (startDateEl.value && endDateEl.value && startDateEl.value > endDateEl.value) {
        searchOptions.open = true;
        endDateEl.setCustomValidity('종료 날짜는 시작 날짜 이후로 선택하세요.');
        endDateEl.reportValidity();
        endDateEl.setCustomValidity('');
        return;
      }
      var url = new URL(window.location.href);
      url.searchParams.set('q', query);
      url.searchParams.delete('page');
      Object.keys(filters).forEach(function (key) {
        var value = filters[key].value.trim();
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      });
      if (url.href !== window.location.href) window.location.assign(url.href);
      else doSearch(query);
    });

    scopeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var scope = btn.getAttribute('data-scope');
        if (scope === activeScope) return;
        activeScope = scope;
        scopeButtons.forEach(function (item) {
          item.classList.toggle('active', item === btn);
          item.setAttribute('aria-pressed', item === btn ? 'true' : 'false');
        });
        searchOptions.hidden = scope === 'dreampath';
        document.getElementById('search-heading').textContent = scope === 'site' ? '기사 검색' : 'Dreampath 검색';
        searchRequest++;
        searchCount.textContent = '';
        searchPagination.replaceChildren();
        searchRes.replaceChildren();
        // Keep internal queries out of the public article search and its URL.
        lastQuery = scope === 'site' ? (urlParams.get('q') || '') : '';
        searchInput.value = lastQuery;
        if (lastQuery) doSearch(lastQuery);
        searchInput.focus();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchPage);
  } else {
    initSearchPage();
  }
})();
