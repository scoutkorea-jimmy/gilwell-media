(function () {
  'use strict';

  var BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  var CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];
  var _items = [];
  var _bucket = 'all';
  var _query = '';
  var _editingId = null;

  function byId(id) { return document.getElementById(id); }

  function inferBucket(termKo) {
    var first = String(termKo || '').trim().charAt(0);
    if (!first) return '';
    var code = first.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '';
    var choseongIndex = Math.floor((code - 0xac00) / 588);
    return CHOSEONG_BUCKETS[choseongIndex] || '';
  }

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
    var canEdit = !!(GW.getToken && GW.getToken());
    var head = '<thead><tr><th>한국어</th><th>English</th><th>Français</th>' + (canEdit ? '<th>관리</th>' : '') + '</tr></thead>';
    return '<div class="glossary-table-wrap"><table class="glossary-table">' +
      head + '<tbody>' +
      items.map(function (item) {
        return '<tr>' +
          '<td data-label="한국어">' + GW.escapeHtml(item.term_ko || '-') + '</td>' +
          '<td data-label="English">' + GW.escapeHtml(item.term_en || '-') + '</td>' +
          '<td data-label="Français">' + GW.escapeHtml(item.term_fr || '-') + '</td>' +
          (canEdit ? '<td data-label="관리"><button type="button" class="glossary-admin-inline-btn" data-edit-id="' + item.id + '">수정</button></td>' : '') +
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
    bindInlineEditButtons();
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

  function bindInlineEditButtons() {
    document.querySelectorAll('[data-edit-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-edit-id') || '0', 10);
        var item = _items.find(function (entry) { return entry.id === id; });
        if (!item) return;
        _editingId = id;
        byId('glossary-editor-panel').style.display = '';
        byId('glossary-public-bucket').value = item.bucket || '가';
        byId('glossary-public-ko').value = item.term_ko || '';
        byId('glossary-public-en').value = item.term_en || '';
        byId('glossary-public-fr').value = item.term_fr || '';
        byId('glossary-public-submit-btn').textContent = '수정 저장';
        byId('glossary-public-cancel-btn').style.display = '';
        byId('glossary-public-ko').focus();
      });
    });
  }

  function resetPublicEditor() {
    _editingId = null;
    byId('glossary-public-bucket').value = '가';
    byId('glossary-public-ko').value = '';
    byId('glossary-public-en').value = '';
    byId('glossary-public-fr').value = '';
    byId('glossary-public-submit-btn').textContent = '용어 저장';
    byId('glossary-public-cancel-btn').style.display = 'none';
  }

  function bindBucketAutoFill() {
    var koInput = byId('glossary-public-ko');
    var bucketSelect = byId('glossary-public-bucket');
    if (!koInput || !bucketSelect) return;
    koInput.addEventListener('input', function () {
      var inferred = inferBucket(koInput.value);
      if (inferred) bucketSelect.value = inferred;
    });
  }

  function openLoginModal() {
    byId('glossary-login-error').style.display = 'none';
    byId('glossary-login-password').value = '';
    byId('glossary-login-modal').style.display = 'flex';
    byId('glossary-login-password').focus();
  }

  function closeLoginModal() {
    byId('glossary-login-modal').style.display = 'none';
  }

  function ensureGlossaryEditor() {
    if (GW.getToken && GW.getToken()) {
      byId('glossary-editor-panel').style.display = '';
      return true;
    }
    openLoginModal();
    return false;
  }

  function submitLogin() {
    var pw = (byId('glossary-login-password').value || '').trim();
    if (!pw) return;
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw })
    })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        closeLoginModal();
        byId('glossary-editor-panel').style.display = '';
        renderGlossary();
      })
      .catch(function (err) {
        var error = byId('glossary-login-error');
        error.textContent = err.message || '로그인 실패';
        error.style.display = '';
      });
  }

  function submitPublicTerm() {
    if (!ensureGlossaryEditor()) return;
    var payload = {
      bucket: (byId('glossary-public-bucket').value || '가').trim(),
      term_ko: (byId('glossary-public-ko').value || '').trim(),
      term_en: (byId('glossary-public-en').value || '').trim(),
      term_fr: (byId('glossary-public-fr').value || '').trim(),
      sort_order: 0,
    };
    if (!payload.term_ko && !payload.term_en && !payload.term_fr) {
      GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력해주세요', 'error');
      return;
    }
    var url = _editingId ? '/api/glossary/' + _editingId : '/api/glossary';
    var method = _editingId ? 'PUT' : 'POST';
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(_editingId ? '용어가 수정됐습니다' : '용어가 추가됐습니다', 'success');
        resetPublicEditor();
        loadGlossary();
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSearch();
    renderBucketBar();
    bindBucketAutoFill();
    byId('glossary-admin-toggle-btn').addEventListener('click', ensureGlossaryEditor);
    byId('glossary-public-submit-btn').addEventListener('click', submitPublicTerm);
    byId('glossary-public-cancel-btn').addEventListener('click', resetPublicEditor);
    byId('glossary-login-submit').addEventListener('click', submitLogin);
    byId('glossary-login-close').addEventListener('click', closeLoginModal);
    byId('glossary-login-password').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitLogin();
    });
    loadGlossary();
  });
})();
