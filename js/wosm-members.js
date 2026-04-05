(function () {
  'use strict';

  var state = {
    items: [],
    columns: [],
    registeredCount: 176,
    query: '',
    category: 'all',
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.GW) return;
    GW.bootstrapStandardPage();
    var searchInput = document.getElementById('wosm-members-search');
    var categorySelect = document.getElementById('wosm-members-category');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.query = String(searchInput.value || '').trim().toLowerCase();
        render();
      });
    }
    if (categorySelect) {
      categorySelect.addEventListener('change', function () {
        state.category = categorySelect.value || 'all';
        render();
      });
    }
    loadMembers();
  });

  function loadMembers() {
    fetch('/api/settings/wosm-members', { credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        state.items = Array.isArray(data && data.items) ? data.items : [];
        state.columns = Array.isArray(data && data.columns) && data.columns.length ? data.columns : getDefaultColumns();
        state.registeredCount = Math.max(0, parseInt(data && data.registered_count, 10) || 176);
        populateCategories(state.items);
        renderSummary();
        render();
      })
      .catch(function () {
        renderError();
      });
  }

  function getDefaultColumns() {
    return [
      { key: 'country_names', label: '국가명' },
      { key: 'membership_category', label: '회원 자격' },
      { key: 'status_description', label: '상태 설명' }
    ];
  }

  function populateCategories(items) {
    var select = document.getElementById('wosm-members-category');
    if (!select) return;
    var categories = Array.from(new Set((items || []).map(function (item) {
      return String(item.membership_category || '').trim();
    }).filter(Boolean))).sort();
    select.innerHTML = '<option value="all">전체</option>' + categories.map(function (category) {
      return '<option value="' + GW.escapeHtml(category) + '">' + GW.escapeHtml(category) + '</option>';
    }).join('');
  }

  function renderSummary() {
    var wrap = document.getElementById('wosm-members-summary');
    if (!wrap) return;
    wrap.textContent = '등록 국가 ' + GW.formatNumber(state.registeredCount) + '개국';
  }

  function render() {
    var filtered = getFilteredItems();
    renderMeta(filtered);
    renderColgroup();
    renderHead();
    renderTable(filtered);
    renderCards(filtered);
  }

  function getFilteredItems() {
    return state.items.filter(function (item) {
      var category = String(item.membership_category || '').trim();
      var matchesCategory = state.category === 'all' || category === state.category;
      if (!matchesCategory) return false;
      if (!state.query) return true;
      var extra = item.extra_fields && typeof item.extra_fields === 'object'
        ? Object.keys(item.extra_fields).map(function (key) { return item.extra_fields[key]; })
        : [];
      var haystack = [
        item.country_ko,
        item.country_en,
        item.membership_category,
        item.status_description,
      ].concat(extra).join(' ').toLowerCase();
      return haystack.indexOf(state.query) >= 0;
    });
  }

  function renderMeta(items) {
    var meta = document.getElementById('wosm-members-results-meta');
    if (!meta) return;
    meta.textContent = '총 ' + GW.formatNumber(items.length) + '개 국가가 표시됩니다.';
  }

  function renderHead() {
    var head = document.getElementById('wosm-members-head');
    if (!head) return;
    head.innerHTML = '<tr>' + state.columns.map(function (column) {
      return '<th>' + GW.escapeHtml(column.label || column.key) + '</th>';
    }).join('') + '</tr>';
  }

  function renderColgroup() {
    var colgroup = document.getElementById('wosm-members-colgroup');
    if (!colgroup) return;
    colgroup.innerHTML = state.columns.map(function (column) {
      return '<col style="width:' + getColumnWidth(column) + ';">';
    }).join('');
  }

  function renderTable(items) {
    var body = document.getElementById('wosm-members-body');
    if (!body) return;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="' + state.columns.length + '"><div class="members-empty">조건에 맞는 국가가 없습니다.</div></td></tr>';
      return;
    }
    body.innerHTML = items.map(function (item) {
      return '<tr>' + state.columns.map(function (column) {
        return '<td>' + renderColumnValue(item, column) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function renderCards(items) {
    var wrap = document.getElementById('wosm-members-cards');
    if (!wrap) return;
    if (!items.length) {
      wrap.innerHTML = '<div class="members-empty">조건에 맞는 국가가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = items.map(function (item) {
      var restColumns = state.columns.filter(function (column) {
        return column && column.key !== 'country_names';
      });
      return '<article class="member-country-card">' +
        '<div class="member-country-head">' + renderNameBlock(item) + '</div>' +
        '<div class="member-country-meta-grid">' +
          restColumns.map(function (column) {
            return '<div><span class="member-country-label">' + GW.escapeHtml(column.label || column.key) + '</span><strong>' + renderCardValue(item, column) + '</strong></div>';
          }).join('') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderColumnValue(item, column) {
    if (!column || column.key === 'country_names') return renderNameBlock(item);
    return GW.escapeHtml(getPlainColumnValue(item, column) || '—');
  }

  function renderCardValue(item, column) {
    return GW.escapeHtml(getPlainColumnValue(item, column) || '—');
  }

  function getPlainColumnValue(item, column) {
    if (!item || !column) return '';
    if (column.key === 'membership_category' || column.key === 'status_description') return item[column.key] || '';
    return item.extra_fields && typeof item.extra_fields === 'object' ? (item.extra_fields[column.key] || '') : '';
  }

  function renderNameBlock(item) {
    var ko = String(item.country_ko || '').trim();
    var en = String(item.country_en || '').trim();
    return '<div class="member-country-names">' +
      '<strong>' + GW.escapeHtml(ko || en || '국가명 미입력') + '</strong>' +
      '<span>' + GW.escapeHtml(en || '—') + '</span>' +
    '</div>';
  }

  function getColumnWidth(column) {
    var key = String(column && column.key || '').toLowerCase();
    var label = String(column && column.label || '').toLowerCase();
    if (key === 'country_names') return '32%';
    if (key.indexOf('sort') >= 0 || label.indexOf('정렬') >= 0 || label.indexOf('순번') >= 0) return '8%';
    if (key.indexOf('language') >= 0 || label.indexOf('언어') >= 0) return '10%';
    if (key.indexOf('region') >= 0 || label.indexOf('지역') >= 0) return '13%';
    if (key.indexOf('nso') >= 0 || key.indexOf('nsa') >= 0 || label.indexOf('nso') >= 0 || label.indexOf('nsa') >= 0) return '11%';
    if (key.indexOf('category') >= 0 || label.indexOf('자격') >= 0) return '14%';
    if (key.indexOf('organization') >= 0 || label.indexOf('연맹 명칭') >= 0 || label.indexOf('조직') >= 0) return '22%';
    if (key.indexOf('status') >= 0 || label.indexOf('상태') >= 0) return '18%';
    return '14%';
  }

  function renderError() {
    var body = document.getElementById('wosm-members-body');
    var cards = document.getElementById('wosm-members-cards');
    var meta = document.getElementById('wosm-members-results-meta');
    var colCount = Math.max(1, state.columns.length || 1);
    if (body) body.innerHTML = '<tr><td colspan="' + colCount + '"><div class="members-empty">데이터를 불러오지 못했습니다.</div></td></tr>';
    if (cards) cards.innerHTML = '<div class="members-empty">데이터를 불러오지 못했습니다.</div>';
    if (meta) meta.textContent = '데이터를 불러오지 못했습니다.';
  }
}());
