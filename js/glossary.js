(function () {
  'use strict';

  var MISC_BUCKET = '기타';
  var BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', MISC_BUCKET];
  var CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];
  var _items = [];
  var _bucket = 'all';
  var _query = '';
  var _editingId = null;
  var _openEditorAfterLogin = false;

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

  function getSearchFilteredItems() {
    return _items.filter(function (item) {
      if (!_query) return true;
      var haystack = [item.term_ko, item.term_en, item.term_fr, item.description_ko].join(' ').toLowerCase();
      return haystack.indexOf(_query) >= 0;
    });
  }

  function hasKoreanTerm(item) {
    return !!String(item && item.term_ko || '').trim();
  }

  function isNumericStart(value) {
    var first = String(value || '').trim().charAt(0);
    return first >= '0' && first <= '9';
  }

  function isMiscItem(item) {
    return isNumericStart(item.term_ko) || isNumericStart(item.term_en) || isNumericStart(item.term_fr);
  }

  function renderTable(items) {
    var canEdit = !!(GW.getToken && GW.getToken());
    var head = '<thead><tr><th>한국어</th><th>English</th><th>Français</th></tr></thead>';
    return '<div class="glossary-table-wrap"><table class="glossary-table">' +
      head + '<tbody>' +
      items.map(function (item) {
        var footer = '';
        var isEditing = _editingId === item.id && canEdit;
        if (item.description_ko) {
          footer = '<tr class="glossary-description-row" id="glossary-desc-row-' + item.id + '" hidden><td colspan="3">' +
            '<div class="glossary-description-row-inner">' +
              '<div class="glossary-description-text" id="glossary-desc-' + item.id + '">' + GW.escapeHtml(item.description_ko || '') + '</div>' +
            '</div>' +
          '</td></tr>';
        }
        var frCell = GW.escapeHtml(item.term_fr || '-');
        if (!isEditing && (item.description_ko || canEdit)) {
          frCell = '<div class="glossary-term-cell-with-toggle">' +
            '<span>' + frCell + '</span>' +
            '<span class="glossary-term-actions">' +
              (canEdit ? '<button type="button" class="glossary-inline-edit-link" data-edit-id="' + item.id + '">수정</button>' : '') +
              (item.description_ko ? '<button type="button" class="glossary-description-toggle" data-desc-id="' + item.id + '" aria-expanded="false" aria-label="설명 펼치기"><span class="glossary-chevron">⌄</span></button>' : '') +
            '</span>' +
          '</div>';
        }
        var koLabel = hasKoreanTerm(item) ? GW.escapeHtml(item.term_ko || '-') : '<span class="glossary-unmatched-label">국문 미확정</span>';
        var row = '<tr class="glossary-term-row">' +
          '<td data-label="한국어">' + koLabel + '</td>' +
          '<td data-label="English">' + GW.escapeHtml(item.term_en || '-') + '</td>' +
          '<td data-label="Français">' + frCell + '</td>' +
        '</tr>';
        if (isEditing) {
          row += renderInlineEditRow(item);
          footer = '';
        }
        return row + footer;
      }).join('') +
      '</tbody></table></div>';
  }

  function renderInlineEditRow(item) {
    return '<tr class="glossary-inline-edit-row"><td colspan="3">' +
      '<div class="glossary-inline-edit-grid">' +
        '<label class="glossary-inline-field"><span>한국어</span><input type="text" id="glossary-inline-ko-' + item.id + '" class="glossary-inline-input" maxlength="120" value="' + GW.escapeHtml(item.term_ko || '') + '" placeholder="-"></label>' +
        '<label class="glossary-inline-field"><span>English</span><input type="text" id="glossary-inline-en-' + item.id + '" class="glossary-inline-input" maxlength="160" value="' + GW.escapeHtml(item.term_en || '') + '" placeholder="-"></label>' +
        '<label class="glossary-inline-field"><span>Français</span><input type="text" id="glossary-inline-fr-' + item.id + '" class="glossary-inline-input" maxlength="160" value="' + GW.escapeHtml(item.term_fr || '') + '" placeholder="-"></label>' +
      '</div>' +
      '<label class="glossary-inline-field glossary-inline-field-full"><span>한국어 설명</span><textarea id="glossary-inline-description-' + item.id + '" class="glossary-inline-textarea" rows="3" maxlength="800" placeholder="설명은 비워둘 수 있습니다.">' + GW.escapeHtml(item.description_ko || '') + '</textarea></label>' +
      '<div class="glossary-inline-actions">' +
        '<button type="button" class="glossary-inline-save-btn" data-inline-save="' + item.id + '">저장</button>' +
        '<button type="button" class="glossary-inline-cancel-btn" data-inline-cancel>취소</button>' +
      '</div>' +
    '</td></tr>';
  }

  function renderGlossary() {
    var items = getSearchFilteredItems();
    var miscItems = items.filter(isMiscItem);
    var remainingItems = items.filter(function (item) { return !isMiscItem(item); });
    var regularItems = remainingItems.filter(hasKoreanTerm);
    var unmatchedItems = remainingItems.filter(function (item) { return !hasKoreanTerm(item); });
    var meta = byId('glossary-results-meta');
    var list = byId('glossary-results');
    var metaCount = (_bucket === MISC_BUCKET ? miscItems.length : (_bucket === 'all' ? items.length : regularItems.filter(function (item) { return item.bucket === _bucket; }).length));
    if (meta) meta.textContent = (_bucket === 'all' ? '전체' : _bucket) + ' · ' + GW.formatNumber(metaCount) + '개 용어';
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="glossary-empty">검색 결과가 없습니다.</div>';
      return;
    }
    if (_bucket === MISC_BUCKET) {
      list.innerHTML = miscItems.length
        ? '<section class="glossary-section"><h3 class="glossary-section-title">기타</h3>' + renderTable(miscItems) + '</section>'
        : '<div class="glossary-empty">검색 결과가 없습니다.</div>';
    } else if (_bucket === 'all' && !_query) {
      var miscSection = miscItems.length
        ? '<section class="glossary-section"><h3 class="glossary-section-title">기타</h3>' + renderTable(miscItems) + '</section>'
        : '';
      var bucketsMarkup = BUCKETS.filter(function (bucket) { return bucket !== MISC_BUCKET; }).map(function (bucket) {
        var group = regularItems.filter(function (item) { return item.bucket === bucket; });
        if (!group.length) return '';
        return '<section class="glossary-section"><h3 class="glossary-section-title">' + bucket + '</h3>' + renderTable(group) + '</section>';
      }).join('');
      list.innerHTML = bucketsMarkup + miscSection + renderUnmatchedSection(unmatchedItems);
    } else {
      var bucketItems = (_bucket === 'all')
        ? regularItems
        : regularItems.filter(function (item) { return item.bucket === _bucket; });
      var miscInline = (_bucket === 'all' && miscItems.length)
        ? '<section class="glossary-section"><h3 class="glossary-section-title">기타</h3>' + renderTable(miscItems) + '</section>'
        : '';
      list.innerHTML = miscInline +
        (bucketItems.length ? '<section class="glossary-section">' + renderTable(bucketItems) + '</section>' : '') +
        ((_bucket === 'all' || _query) ? renderUnmatchedSection(unmatchedItems) : '');
    }
    bindInlineEditButtons();
    bindDescriptionToggles();
    bindInlineEditRowActions();
  }

  function renderUnmatchedSection(items) {
    if (!items.length) return '';
    return '<section class="glossary-section glossary-unmatched-section">' +
      '<h3 class="glossary-section-title">국문 미확정 용어</h3>' +
      '<p class="glossary-unmatched-note">적절한 한국어 대응 용어를 아직 찾지 못한 스카우트 용어들입니다. 언제든 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a> 으로 메일 주시면 검토 후 반영하겠습니다.</p>' +
      renderTable(items) +
    '</section>';
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
        renderGlossary();
        var input = byId('glossary-inline-ko-' + id) || byId('glossary-inline-en-' + id) || byId('glossary-inline-fr-' + id);
        if (input) input.focus();
      });
    });
  }

  function bindInlineEditRowActions() {
    document.querySelectorAll('[data-inline-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-inline-save') || '0', 10);
        if (id > 0) submitInlineEdit(id);
      });
    });
    document.querySelectorAll('[data-inline-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _editingId = null;
        renderGlossary();
      });
    });
  }

  function bindDescriptionToggles() {
    document.querySelectorAll('[data-desc-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-desc-id');
        var row = byId('glossary-desc-row-' + id);
        if (!row) return;
        var willExpand = row.hasAttribute('hidden');
        if (willExpand) row.removeAttribute('hidden');
        else row.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
        btn.classList.toggle('open', willExpand);
      });
    });
  }

  function resetPublicEditor() {
    _editingId = null;
    byId('glossary-public-bucket').value = '가';
    byId('glossary-public-ko').value = '';
    byId('glossary-public-en').value = '';
    byId('glossary-public-fr').value = '';
    byId('glossary-public-description').value = '';
    byId('glossary-public-submit-btn').textContent = '용어 저장';
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
    _openEditorAfterLogin = false;
  }

  function openEditorModal() {
    resetPublicEditor();
    byId('glossary-editor-modal').style.display = 'flex';
    byId('glossary-public-ko').focus();
  }

  function closeEditorModal() {
    byId('glossary-editor-modal').style.display = 'none';
  }

  function ensureGlossaryAuth() {
    if (GW.getToken && GW.getToken()) {
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
        if (_openEditorAfterLogin) {
          _openEditorAfterLogin = false;
          openEditorModal();
        }
        renderGlossary();
      })
      .catch(function (err) {
        var error = byId('glossary-login-error');
        error.textContent = err.message || '로그인 실패';
        error.style.display = '';
      });
  }

  function submitPublicTerm() {
    if (!ensureGlossaryAuth()) return;
    var payload = {
      bucket: (byId('glossary-public-bucket').value || '가').trim(),
      term_ko: (byId('glossary-public-ko').value || '').trim(),
      term_en: (byId('glossary-public-en').value || '').trim(),
      term_fr: (byId('glossary-public-fr').value || '').trim(),
      description_ko: (byId('glossary-public-description').value || '').trim(),
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
        closeEditorModal();
        loadGlossary();
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  }

  function submitInlineEdit(id) {
    if (!ensureGlossaryAuth()) return;
    var payload = {
      bucket: inferBucket((byId('glossary-inline-ko-' + id) || {}).value || '') || '가',
      term_ko: ((byId('glossary-inline-ko-' + id) || {}).value || '').trim(),
      term_en: ((byId('glossary-inline-en-' + id) || {}).value || '').trim(),
      term_fr: ((byId('glossary-inline-fr-' + id) || {}).value || '').trim(),
      description_ko: ((byId('glossary-inline-description-' + id) || {}).value || '').trim(),
      sort_order: 0,
    };
    if (!payload.term_ko && !payload.term_en && !payload.term_fr) {
      GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력해주세요', 'error');
      return;
    }
    GW.apiFetch('/api/glossary/' + id, { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () {
        _editingId = null;
        GW.showToast('용어가 수정됐습니다', 'success');
        loadGlossary();
      })
      .catch(function (err) {
        GW.showToast(err.message || '수정 실패', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSearch();
    renderBucketBar();
    bindBucketAutoFill();
    document.querySelectorAll('[data-glossary-add-trigger]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (ensureGlossaryAuth()) {
          openEditorModal();
        } else {
          _openEditorAfterLogin = true;
        }
      });
    });
    byId('glossary-public-submit-btn').addEventListener('click', submitPublicTerm);
    byId('glossary-public-cancel-btn').addEventListener('click', function () {
      resetPublicEditor();
      closeEditorModal();
    });
    byId('glossary-login-submit').addEventListener('click', submitLogin);
    byId('glossary-login-close').addEventListener('click', closeLoginModal);
    byId('glossary-login-password').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitLogin();
    });
    loadGlossary();
  });
})();
