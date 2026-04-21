(function () {
  'use strict';

  var MISC_BUCKET = '기타';
  var UNMATCHED_BUCKET = '국문 미확정 용어';
  var BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', MISC_BUCKET, UNMATCHED_BUCKET];
  var CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];
  var _items = [];
  var _bucket = 'all';
  var _query = '';
  var _searchTerms = true;
  var _searchDescription = true;
  var _editingId = null;
  var _openEditorAfterLogin = false;

  function byId(id) { return document.getElementById(id); }

  function normalizeTermValue(value) {
    var raw = String(value || '').trim();
    return (raw === '-' || raw === '—') ? '' : raw;
  }

  function inferBucket(termKo) {
    var first = normalizeTermValue(termKo).charAt(0);
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
      var fields = [];
      if (_searchTerms) fields.push(item.term_ko, item.term_en, item.term_fr);
      if (_searchDescription) fields.push(item.description_ko);
      var haystack = fields.join(' ').toLowerCase();
      return haystack.indexOf(_query) >= 0;
    });
  }

  function hasSearchScope() {
    return _searchTerms || _searchDescription;
  }

  function hasKoreanTerm(item) {
    return !!normalizeTermValue(item && item.term_ko);
  }

  function isNumericStart(value) {
    var first = normalizeTermValue(value).charAt(0);
    return first >= '0' && first <= '9';
  }

  function isMiscItem(item) {
    return isNumericStart(item.term_ko) || isNumericStart(item.term_en) || isNumericStart(item.term_fr);
  }

  function isUnmatchedItem(item) {
    return !hasKoreanTerm(item) && (!!normalizeTermValue(item.term_en) || !!normalizeTermValue(item.term_fr));
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
              (item.description_ko ? '<button type="button" class="glossary-description-toggle" data-desc-id="' + item.id + '" aria-expanded="false" aria-label="설명 보기"><span class="glossary-description-toggle-text">설명 보기</span><span class="glossary-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M3.2 5.6 8 10.4l4.8-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>' : '') +
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
        '<button type="button" class="glossary-inline-delete-btn" data-inline-delete="' + item.id + '">삭제</button>' +
        '<button type="button" class="glossary-inline-save-btn" data-inline-save="' + item.id + '">저장</button>' +
        '<button type="button" class="glossary-inline-cancel-btn" data-inline-cancel>취소</button>' +
      '</div>' +
    '</td></tr>';
  }

  function renderGlossary() {
    var items = getSearchFilteredItems();
    var miscItems = items.filter(isMiscItem);
    var remainingItems = items.filter(function (item) { return !isMiscItem(item); });
    var regularItems = remainingItems.filter(function (item) { return !isUnmatchedItem(item); });
    var unmatchedItems = remainingItems.filter(isUnmatchedItem);
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
    var terms = byId('glossary-search-terms');
    var description = byId('glossary-search-description');
    if (!input) return;

    function syncSearchScope() {
      _searchTerms = !terms || !!terms.checked;
      _searchDescription = !description || !!description.checked;
    }

    function applySearch() {
      syncSearchScope();
      _query = String(input.value || '').trim().toLowerCase();
      if (_query && !hasSearchScope()) {
        _query = '';
        GW.showToast('검색 색인을 설정해달라고 체크박스를 선택해주세요.', 'error');
        renderBucketBar();
        renderGlossary();
        return;
      }
      if (_query) _bucket = 'all';
      renderBucketBar();
      renderGlossary();
    }

    input.addEventListener('input', applySearch);
    if (terms) terms.addEventListener('change', applySearch);
    if (description) description.addEventListener('change', applySearch);
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
    document.querySelectorAll('[data-inline-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-inline-delete') || '0', 10);
        if (id > 0) deleteInlineTerm(id);
      });
    });
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
        var label = btn.querySelector('.glossary-description-toggle-text');
        if (willExpand) row.removeAttribute('hidden');
        else row.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
        btn.setAttribute('aria-label', willExpand ? '설명 숨김' : '설명 보기');
        btn.classList.toggle('open', willExpand);
        if (label) label.textContent = willExpand ? '설명 숨김' : '설명 보기';
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
    var enInput = byId('glossary-public-en');
    var frInput = byId('glossary-public-fr');
    var bucketSelect = byId('glossary-public-bucket');
    if (!koInput || !bucketSelect) return;
    function syncBucket() {
      var ko = (koInput.value || '').trim();
      var en = enInput ? (enInput.value || '').trim() : '';
      var fr = frInput ? (frInput.value || '').trim() : '';
      if (isNumericStart(ko) || isNumericStart(en) || isNumericStart(fr)) {
        bucketSelect.value = MISC_BUCKET;
        return;
      }
      if (!ko && (en || fr)) {
        bucketSelect.value = UNMATCHED_BUCKET;
        return;
      }
      var inferred = inferBucket(ko);
      if (inferred) bucketSelect.value = inferred;
    }
    koInput.addEventListener('input', syncBucket);
    if (enInput) enInput.addEventListener('input', syncBucket);
    if (frInput) frInput.addEventListener('input', syncBucket);
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
    var userEl = byId('glossary-login-username');
    var username = userEl ? String(userEl.value || '').trim().toLowerCase() : 'owner';
    if (!username) username = 'owner';
    var pw = (byId('glossary-login-password').value || '').trim();
    if (!pw) return;
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: pw })
    })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        if (data && data.user && data.user.must_change_password && GW.showToast) {
          GW.showToast('임시 비밀번호입니다. 관리자 페이지에서 변경해주세요.', 'warn', 8000);
        }
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
    var ko = (byId('glossary-public-ko').value || '').trim();
    var en = (byId('glossary-public-en').value || '').trim();
    var fr = (byId('glossary-public-fr').value || '').trim();
    var payload = {
      bucket: (isNumericStart(ko) || isNumericStart(en) || isNumericStart(fr))
        ? MISC_BUCKET
        : ((!ko && (en || fr)) ? UNMATCHED_BUCKET : (byId('glossary-public-bucket').value || '가').trim()),
      term_ko: ko,
      term_en: en,
      term_fr: fr,
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
    var ko = ((byId('glossary-inline-ko-' + id) || {}).value || '').trim();
    var en = ((byId('glossary-inline-en-' + id) || {}).value || '').trim();
    var fr = ((byId('glossary-inline-fr-' + id) || {}).value || '').trim();
    var payload = {
      bucket: (isNumericStart(ko) || isNumericStart(en) || isNumericStart(fr))
        ? MISC_BUCKET
        : ((!ko && (en || fr)) ? UNMATCHED_BUCKET : (inferBucket(ko) || '가')),
      term_ko: ko,
      term_en: en,
      term_fr: fr,
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

  function deleteInlineTerm(id) {
    if (!ensureGlossaryAuth()) return;
    var item = _items.find(function (entry) { return entry.id === id; });
    var label = item && (item.term_ko || item.term_en || item.term_fr) ? (item.term_ko || item.term_en || item.term_fr) : '이 용어';
    if (!window.confirm('정말 삭제할까요?\n\n' + label + ' 항목이 용어집에서 제거됩니다.')) {
      return;
    }
    GW.apiFetch('/api/glossary/' + id, { method: 'DELETE' })
      .then(function () {
        _editingId = null;
        GW.showToast('용어가 삭제됐습니다', 'success');
        loadGlossary();
      })
      .catch(function (err) {
        GW.showToast(err.message || '삭제 실패', 'error');
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
