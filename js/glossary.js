(function () {
  'use strict';

  var BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  var _items = [];
  var _bucket = 'all';
  var _query = '';

  function byId(id) { return document.getElementById(id); }

  function renderBucketBar() {
    var el = byId('glossary-letter-bar');
    if (!el) return;
    var parts = ['<button type="button" class="glossary-letter-btn' + (_bucket === 'all' ? ' active' : '') + '" data-bucket="all">전체</button>'];
    BUCKETS.forEach(function (bucket) {
      parts.push('<button type="button" class="glossary-letter-btn' + (_bucket === bucket ? ' active' : '') + '" data-bucket="' + bucket + '">' + bucket + '</button>');
    });
    el.innerHTML = parts.join('');
    el.querySelectorAll('.glossary-letter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _bucket = btn.getAttribute('data-bucket') || 'all';
        renderBucketBar();
        renderGlossary();
      });
    });
  }

  function getFilteredItems() {
    return _items.filter(function (item) {
      if (_bucket !== 'all' && item.bucket !== _bucket) return false;
      if (!_query) return true;
      var haystack = [item.term_ko, item.term_en, item.term_fr].join(' ').toLowerCase();
      return haystack.indexOf(_query) >= 0;
    });
  }

  function renderTable(items) {
    return '<div class="glossary-table-wrap"><table class="glossary-table">' +
      '<thead><tr><th>한국어</th><th>English</th><th>Français</th></tr></thead><tbody>' +
      items.map(function (item) {
        return '<tr>' +
          '<td data-label="한국어">' + GW.escapeHtml(item.term_ko) + '</td>' +
          '<td data-label="English">' + GW.escapeHtml(item.term_en) + '</td>' +
          '<td data-label="Français">' + GW.escapeHtml(item.term_fr) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderGlossary() {
    var items = getFilteredItems();
    var meta = byId('glossary-results-meta');
    var list = byId('glossary-results');
    if (meta) meta.textContent = (_bucket === 'all' ? '전체' : _bucket) + ' · ' + GW.formatNumber(items.length) + '개 용어';
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="glossary-empty">검색 결과가 없습니다.</div>';
      return;
    }
    if (_bucket === 'all' && !_query) {
      list.innerHTML = BUCKETS.map(function (bucket) {
        var group = items.filter(function (item) { return item.bucket === bucket; });
        if (!group.length) return '';
        return '<section class="glossary-section"><h3 class="glossary-section-title">' + bucket + '</h3>' + renderTable(group) + '</section>';
      }).join('');
    } else {
      list.innerHTML = '<section class="glossary-section">' + renderTable(items) + '</section>';
    }
  }

  function bindSearch() {
    var input = byId('glossary-search-input');
    if (!input) return;
    input.addEventListener('input', function () {
      _query = String(input.value || '').trim().toLowerCase();
      renderGlossary();
    });
  }

  function loadGlossary() {
    fetch('/api/glossary', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _items = Array.isArray(data.items) ? data.items : [];
        renderBucketBar();
        renderGlossary();
      })
      .catch(function () {
        var list = byId('glossary-results');
        if (list) list.innerHTML = '<div class="glossary-empty">용어를 불러오지 못했습니다.</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSearch();
    renderBucketBar();
    loadGlossary();
  });
})();
