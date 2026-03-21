(function () {
  'use strict';

  var _glossaryItems = [];
  var _glossaryEditingId = null;
  var GLOSSARY_BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  var GLOSSARY_CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

  window.loadGlossaryAdmin = function () {
    bindGlossaryBucketAutofill();
    fetch('/api/glossary', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _glossaryItems = Array.isArray(data.items) ? data.items : [];
        renderGlossaryAdmin();
      })
      .catch(function () {
        var list = document.getElementById('glossary-admin-list');
        if (list) list.innerHTML = '<div class="list-empty">용어를 불러오지 못했습니다.</div>';
      });
  };

  function inferGlossaryBucket(termKo) {
    var first = String(termKo || '').trim().charAt(0);
    if (!first) return '';
    var code = first.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '';
    var choseongIndex = Math.floor((code - 0xac00) / 588);
    return GLOSSARY_CHOSEONG_BUCKETS[choseongIndex] || '';
  }

  function bindGlossaryBucketAutofill() {
    var koInput = document.getElementById('glossary-ko-input');
    var bucketSelect = document.getElementById('glossary-bucket-input');
    if (!koInput || !bucketSelect || koInput.dataset.bucketBound === '1') return;
    koInput.dataset.bucketBound = '1';
    koInput.addEventListener('input', function () {
      var inferred = inferGlossaryBucket(koInput.value);
      if (inferred && GLOSSARY_BUCKETS.indexOf(inferred) >= 0) bucketSelect.value = inferred;
    });
  }

  window.filterGlossaryAdmin = function () {
    renderGlossaryAdmin();
  };

  function renderGlossaryAdmin() {
    var list = document.getElementById('glossary-admin-list');
    if (!list) return;
    var bucketFilter = (document.getElementById('glossary-filter-bucket') || {}).value || 'all';
    var query = ((document.getElementById('glossary-search-admin') || {}).value || '').trim().toLowerCase();
    var filtered = _glossaryItems.filter(function (item) {
      if (bucketFilter !== 'all' && item.bucket !== bucketFilter) return false;
      if (!query) return true;
      var haystack = [item.term_ko, item.term_en, item.term_fr, item.description_ko].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="list-empty">등록된 용어가 없습니다.</div>';
      return;
    }
    list.innerHTML = GLOSSARY_BUCKETS.map(function (bucket) {
      var group = filtered.filter(function (item) { return item.bucket === bucket; });
      if (!group.length) return '';
      return '<section>' +
        '<h3 class="glossary-admin-group-title">' + bucket + '</h3>' +
        group.map(function (item) {
          return '<div class="glossary-admin-row">' +
            '<div class="glossary-admin-cell glossary-admin-cell-bucket"><span class="glossary-admin-cell-label">분류</span><strong lang="ko">' + GW.escapeHtml(item.bucket) + '</strong></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-ko"><span class="glossary-admin-cell-label">한국어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-ko" lang="ko">' + GW.escapeHtml(item.term_ko || '-') + '</span></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-en"><span class="glossary-admin-cell-label">영어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-en" lang="en">' + GW.escapeHtml(item.term_en || '-') + '</span></div>' +
            '<div class="glossary-admin-cell glossary-admin-cell-term glossary-admin-cell-term-fr"><span class="glossary-admin-cell-label">프랑스어</span><span class="glossary-admin-cell-text glossary-admin-cell-text-fr" lang="fr">' + GW.escapeHtml(item.term_fr || '-') + '</span></div>' +
            '<div class="glossary-admin-description"><span class="glossary-admin-cell-label">설명</span><span class="glossary-admin-cell-text glossary-admin-cell-text-ko" lang="ko">' + GW.escapeHtml(item.description_ko || '-') + '</span></div>' +
            '<div class="glossary-admin-actions">' +
              '<button type="button" class="glossary-admin-inline-btn" onclick="editGlossaryTerm(' + item.id + ')">수정</button>' +
              '<button type="button" class="glossary-admin-inline-btn delete" onclick="deleteGlossaryTerm(' + item.id + ')">삭제</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</section>';
    }).join('');
  }

  window.editGlossaryTerm = function (id) {
    var item = _glossaryItems.find(function (entry) { return entry.id === id; });
    if (!item) return;
    _glossaryEditingId = id;
    document.getElementById('glossary-bucket-input').value = item.bucket || '가';
    document.getElementById('glossary-ko-input').value = item.term_ko || '';
    document.getElementById('glossary-en-input').value = item.term_en || '';
    document.getElementById('glossary-fr-input').value = item.term_fr || '';
    document.getElementById('glossary-description-input').value = item.description_ko || '';
    document.getElementById('glossary-submit-btn').textContent = '수정 저장';
    document.getElementById('glossary-cancel-btn').style.display = '';
    document.getElementById('glossary-ko-input').focus();
  };

  window.cancelGlossaryEdit = function () {
    _glossaryEditingId = null;
    document.getElementById('glossary-bucket-input').value = '가';
    document.getElementById('glossary-ko-input').value = '';
    document.getElementById('glossary-en-input').value = '';
    document.getElementById('glossary-fr-input').value = '';
    document.getElementById('glossary-description-input').value = '';
    document.getElementById('glossary-submit-btn').textContent = '용어 저장';
    document.getElementById('glossary-cancel-btn').style.display = 'none';
  };

  window.submitGlossaryTerm = function () {
    var payload = {
      bucket: (document.getElementById('glossary-bucket-input').value || '가').trim(),
      term_ko: (document.getElementById('glossary-ko-input').value || '').trim(),
      term_en: (document.getElementById('glossary-en-input').value || '').trim(),
      term_fr: (document.getElementById('glossary-fr-input').value || '').trim(),
      description_ko: (document.getElementById('glossary-description-input').value || '').trim(),
      sort_order: 0,
    };
    if (!payload.term_ko && !payload.term_en && !payload.term_fr) {
      GW.showToast('한국어, 영어, 프랑스어 중 하나 이상 입력해주세요', 'error');
      return;
    }
    var url = _glossaryEditingId ? '/api/glossary/' + _glossaryEditingId : '/api/glossary';
    var method = _glossaryEditingId ? 'PUT' : 'POST';
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(_glossaryEditingId ? '용어가 수정됐습니다' : '용어가 추가됐습니다', 'success');
        window.cancelGlossaryEdit();
        window.loadGlossaryAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  window.deleteGlossaryTerm = function (id) {
    if (!confirm('이 용어를 삭제할까요?')) return;
    GW.apiFetch('/api/glossary/' + id, { method: 'DELETE' })
      .then(function () {
        GW.showToast('용어가 삭제됐습니다', 'success');
        if (_glossaryEditingId === id) window.cancelGlossaryEdit();
        window.loadGlossaryAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '삭제 실패', 'error');
      });
  };
})();
