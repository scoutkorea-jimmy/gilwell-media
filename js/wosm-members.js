(function () {
  'use strict';

  var state = {
    items: [],
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
        populateCategories(state.items);
        renderSummary(state.items);
        render();
      })
      .catch(function () {
        renderError();
      });
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

  function renderSummary(items) {
    var wrap = document.getElementById('wosm-members-summary');
    if (!wrap) return;
    var categories = {};
    (items || []).forEach(function (item) {
      var key = String(item.membership_category || '기타').trim() || '기타';
      categories[key] = (categories[key] || 0) + 1;
    });
    var summaryCards = [
      '<div class="members-summary-card"><strong>' + GW.formatNumber(items.length) + '</strong><span>등록 국가</span></div>'
    ];
    Object.keys(categories).slice(0, 4).forEach(function (key) {
      summaryCards.push('<div class="members-summary-card"><strong>' + GW.formatNumber(categories[key]) + '</strong><span>' + GW.escapeHtml(key) + '</span></div>');
    });
    wrap.innerHTML = summaryCards.join('');
  }

  function render() {
    var filtered = getFilteredItems();
    renderMeta(filtered);
    renderTable(filtered);
    renderCards(filtered);
  }

  function getFilteredItems() {
    return state.items.filter(function (item) {
      var category = String(item.membership_category || '').trim();
      var matchesCategory = state.category === 'all' || category === state.category;
      if (!matchesCategory) return false;
      if (!state.query) return true;
      var haystack = [
        item.country_ko,
        item.country_en,
        item.country_fr,
        item.membership_category,
        item.status_description,
      ].join(' ').toLowerCase();
      return haystack.indexOf(state.query) >= 0;
    });
  }

  function renderMeta(items) {
    var meta = document.getElementById('wosm-members-results-meta');
    if (!meta) return;
    meta.textContent = '총 ' + GW.formatNumber(items.length) + '개 국가가 표시됩니다.';
  }

  function renderTable(items) {
    var body = document.getElementById('wosm-members-body');
    if (!body) return;
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="3"><div class="members-empty">조건에 맞는 국가가 없습니다.</div></td></tr>';
      return;
    }
    body.innerHTML = items.map(function (item) {
      return '<tr>' +
        '<td>' + renderNameBlock(item) + '</td>' +
        '<td>' + GW.escapeHtml(item.membership_category || '—') + '</td>' +
        '<td>' + GW.escapeHtml(item.status_description || '—') + '</td>' +
      '</tr>';
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
      return '<article class="member-country-card">' +
        '<div class="member-country-head">' + renderNameBlock(item) + '</div>' +
        '<div class="member-country-meta-grid">' +
          '<div><span class="member-country-label">회원 자격</span><strong>' + GW.escapeHtml(item.membership_category || '—') + '</strong></div>' +
        '</div>' +
        '<p class="member-country-status">' + GW.escapeHtml(item.status_description || '상태 설명이 없습니다.') + '</p>' +
      '</article>';
    }).join('');
  }

  function renderNameBlock(item) {
    var ko = String(item.country_ko || '').trim();
    var en = String(item.country_en || '').trim();
    var fr = String(item.country_fr || '').trim();
    return '<div class="member-country-names">' +
      '<strong>' + GW.escapeHtml(ko || '한국어 미입력') + '</strong>' +
      '<span>' + GW.escapeHtml(en || '—') + '</span>' +
      '<span>' + GW.escapeHtml(fr || '—') + '</span>' +
    '</div>';
  }

  function renderError() {
    var body = document.getElementById('wosm-members-body');
    var cards = document.getElementById('wosm-members-cards');
    var meta = document.getElementById('wosm-members-results-meta');
    if (body) body.innerHTML = '<tr><td colspan="3"><div class="members-empty">데이터를 불러오지 못했습니다.</div></td></tr>';
    if (cards) cards.innerHTML = '<div class="members-empty">데이터를 불러오지 못했습니다.</div>';
    if (meta) meta.textContent = '데이터를 불러오지 못했습니다.';
  }
}());
