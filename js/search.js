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

  function renderError(searchRes) {
    searchRes.innerHTML =
      '<div class="search-no-results"><strong>오류가 발생했습니다</strong>잠시 후 다시 시도해주세요.</div>';
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

  function initSearchPage() {
    if (typeof GW === 'undefined') return;
    GW.bootstrapStandardPage();

    var searchInput = document.getElementById('search-input');
    var searchBtn = document.getElementById('search-btn');
    var searchCount = document.getElementById('search-count');
    var searchRes = document.getElementById('search-results');
    var categoryEl = document.getElementById('search-category');
    var startDateEl = document.getElementById('search-start-date');
    var endDateEl = document.getElementById('search-end-date');
    var tagEl = document.getElementById('search-tag');
    var scopeButtons = document.querySelectorAll('[data-scope]');
    var activeScope = 'site';

    if (!searchInput || !searchBtn || !searchCount || !searchRes) {
      return;
    }

    function doSearch(query) {
      query = (query || '').trim();
      if (!query) return;

      renderLoading(searchRes, searchCount);

      var params = new URLSearchParams();
      params.set('q', query);
      var endpoint = '/api/posts?page=1';
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

          searchCount.style.display = 'block';
          searchCount.textContent = '"' + query + '" 검색 결과 ' + total + '건';

          if (!posts.length) {
            renderEmpty(searchRes, query);
            return;
          }

          renderResults(searchRes, posts, activeScope);
        })
        .catch(function (error) {
          if (activeScope === 'dreampath') {
            searchRes.innerHTML =
              '<div class="search-no-results"><strong>Dreampath 로그인이 필요합니다</strong>내부 검색은 로그인한 상태에서 사용할 수 있습니다.</div>';
            return;
          }
          renderError(searchRes, error);
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
        scopeButtons.forEach(function (item) {
          item.classList.toggle('active', item === btn);
        });
        var filterGrid = document.getElementById('search-filter-grid');
        if (filterGrid) filterGrid.style.display = activeScope === 'site' ? 'grid' : 'none';
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
