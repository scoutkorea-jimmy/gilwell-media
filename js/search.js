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

  function renderResults(searchRes, posts) {
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

    if (!searchInput || !searchBtn || !searchCount || !searchRes) {
      return;
    }

    function doSearch(query) {
      query = (query || '').trim();
      if (!query) return;

      renderLoading(searchRes, searchCount);

      GW.apiFetch('/api/posts?q=' + encodeURIComponent(query) + '&page=1')
        .then(function (data) {
          var posts = data.posts || [];
          var total = data.total || posts.length;

          searchCount.style.display = 'block';
          searchCount.textContent = '"' + query + '" 검색 결과 ' + total + '건';

          if (!posts.length) {
            renderEmpty(searchRes, query);
            return;
          }

          renderResults(searchRes, posts);
        })
        .catch(function () {
          renderError(searchRes);
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
