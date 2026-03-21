(function () {
  'use strict';

  var _contributors = [];
  var _contributorsRevision = null;
  var _editingContributorIdx = null;

  window.loadContributorsAdmin = function () {
    fetch('/api/settings/contributors')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _contributors = data.items || [];
        _contributorsRevision = data.revision || null;
        renderContributorsAdmin();
      })
      .catch(function () {
        GW.showToast('도움을 주신 분들을 불러오지 못했습니다', 'error');
      });
  };

  function renderContributorsAdmin() {
    var el = document.getElementById('contributors-admin-list'); if (!el) return;
    if (!_contributors.length) {
      el.innerHTML = '<div class="admin-inline-note">등록된 분이 없습니다.</div>';
      return;
    }
    el.innerHTML = _contributors.map(function (c, i) {
      return '<div class="contributors-admin-item" draggable="true" data-contrib-index="' + i + '">' +
        '<span class="drag-handle" title="드래그해서 순서 변경">↕</span>' +
        '<div class="contributors-admin-body">' +
          '<strong class="contributors-admin-name">' + GW.escapeHtml(c.name) + '</strong>' +
          (c.note ? '<span class="contributors-admin-note">' + GW.escapeHtml(c.note) + '</span>' : '') +
          (c.date ? '<span class="contributors-admin-date">' + GW.escapeHtml(c.date) + '</span>' : '') +
        '</div>' +
        '<button type="button" class="admin-inline-ghost" onclick="moveContributor(' + i + ', -1)"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="admin-inline-ghost" onclick="moveContributor(' + i + ', 1)"' + (i === _contributors.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button onclick="editContributor(' + i + ')" class="btn-edit">수정</button>' +
        '<button onclick="deleteContributor(' + i + ')" class="btn-delete">삭제</button>' +
      '</div>';
    }).join('');
    bindContributorDrag();
  }

  function bindContributorDrag() {
    var list = document.getElementById('contributors-admin-list');
    if (!list || list.dataset.dragBound === '1') return;
    list.dataset.dragBound = '1';
    if (window.GWAdminShared && window.GWAdminShared.initPointerSortable) {
      window.GWAdminShared.initPointerSortable(list, {
        boundKey: 'pointerBound',
        itemSelector: '.contributors-admin-item',
        handleSelector: '.drag-handle',
        onCommit: function (boundList) {
          syncContributorsFromDom(boundList);
          renderContributorsAdmin();
          saveContributorOrder();
        }
      });
    }

    list.addEventListener('dragstart', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      var handle = event.target.closest('.drag-handle');
      if (!item || !handle) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.getAttribute('data-contrib-index'));
    });

    list.addEventListener('dragover', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      event.preventDefault();
      item.classList.add('drag-over');
    });

    list.addEventListener('dragleave', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      item.classList.remove('drag-over');
    });

    list.addEventListener('drop', function (event) {
      var item = event.target.closest('.contributors-admin-item');
      if (!item) return;
      event.preventDefault();
      item.classList.remove('drag-over');
      var fromIndex = parseInt(event.dataTransfer.getData('text/plain') || '-1', 10);
      var toIndex = parseInt(item.getAttribute('data-contrib-index') || '-1', 10);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      var moved = _contributors.splice(fromIndex, 1)[0];
      _contributors.splice(toIndex, 0, moved);
      renderContributorsAdmin();
      saveContributorOrder();
    });
  }

  function syncContributorsFromDom(list) {
    var current = _contributors.slice();
    var indices = [];
    list.querySelectorAll('.contributors-admin-item[data-contrib-index]').forEach(function (el) {
      indices.push(parseInt(el.getAttribute('data-contrib-index') || '-1', 10));
    });
    _contributors = indices.map(function (index) { return current[index]; }).filter(Boolean);
  }

  function saveContributorOrder() {
    var updated = _contributors.slice();
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        GW.showToast('순서가 저장됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          window.loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '저장 실패', 'error');
        window.loadContributorsAdmin();
      });
  }

  window.moveContributor = function (index, delta) {
    var nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= _contributors.length) return;
    var moved = _contributors.splice(index, 1)[0];
    _contributors.splice(nextIndex, 0, moved);
    renderContributorsAdmin();
    saveContributorOrder();
  };

  window.editContributor = function (index) {
    var c = _contributors[index]; if (!c) return;
    _editingContributorIdx = index;
    document.getElementById('contrib-name-input').value = c.name || '';
    document.getElementById('contrib-note-input').value = c.note || '';
    document.getElementById('contrib-date-input').value = c.date || '';
    document.getElementById('contrib-form-label').textContent = '수정 중';
    document.getElementById('contrib-submit-btn').textContent = '수정 완료';
    document.getElementById('contrib-cancel-btn').style.display = '';
    document.getElementById('contrib-name-input').focus();
  };

  window.cancelEditContributor = function () {
    _editingContributorIdx = null;
    document.getElementById('contrib-name-input').value = '';
    document.getElementById('contrib-note-input').value = '';
    document.getElementById('contrib-date-input').value = '';
    document.getElementById('contrib-form-label').textContent = '새 분 추가';
    document.getElementById('contrib-submit-btn').textContent = '추가';
    document.getElementById('contrib-cancel-btn').style.display = 'none';
  };

  window.submitContributor = function () {
    var nameEl = document.getElementById('contrib-name-input');
    var noteEl = document.getElementById('contrib-note-input');
    var dateEl = document.getElementById('contrib-date-input');
    var name = (nameEl.value || '').trim();
    var note = (noteEl.value || '').trim();
    var date = (dateEl.value || '').trim();
    if (!name) { GW.showToast('이름을 입력해주세요', 'error'); return; }
    var updated = _contributors.slice();
    var entry = { name: name, note: note, date: date };
    if (_editingContributorIdx !== null) updated[_editingContributorIdx] = entry;
    else updated.push(entry);
    var wasEditing = _editingContributorIdx !== null;
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        renderContributorsAdmin();
        window.cancelEditContributor();
        GW.showToast(wasEditing ? '수정됐습니다' : '추가됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          window.loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  window.deleteContributor = function (index) {
    if (!confirm('삭제할까요?')) return;
    var updated = _contributors.slice();
    updated.splice(index, 1);
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated, if_revision: _contributorsRevision }) })
      .then(function (data) {
        _contributors = data.items || updated;
        _contributorsRevision = data.revision || _contributorsRevision;
        renderContributorsAdmin();
        GW.showToast('삭제됐습니다', 'success');
      })
      .catch(function (err) {
        if (err && err.status === 409) {
          GW.showToast('다른 변경이 있어 다시 불러왔습니다', 'error');
          window.loadContributorsAdmin();
          return;
        }
        GW.showToast(err.message || '삭제 실패', 'error');
        window.loadContributorsAdmin();
      });
  };
})();
