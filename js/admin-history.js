(function () {
  'use strict';

  var _historyItems = [];
  var _historyPage = 1;
  var _historyLoaded = false;
  var _HISTORY_PAGE_SIZE = 10;

  window.loadVersionHistory = function () {
    if (_historyLoaded) {
      renderVersionHistory();
      return;
    }
    fetch('/data/changelog.json?v=' + encodeURIComponent(GW.APP_VERSION), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _historyItems = Array.isArray(data.items) ? data.items : [];
        _historyLoaded = true;
        _historyPage = 1;
        renderVersionHistory();
      })
      .catch(function () {
        var list = document.getElementById('version-history-list');
        if (list) list.innerHTML = '<div class="list-empty">버전 기록을 불러오지 못했습니다</div>';
      });
  };

  function renderVersionHistory() {
    var list = document.getElementById('version-history-list');
    var pg = document.getElementById('version-history-pagination');
    if (!list || !pg) return;
    if (!_historyItems.length) {
      list.innerHTML = '<div class="list-empty">기록된 버전이 없습니다</div>';
      pg.innerHTML = '';
      return;
    }
    var totalPages = Math.max(1, Math.ceil(_historyItems.length / _HISTORY_PAGE_SIZE));
    _historyPage = Math.max(1, Math.min(totalPages, _historyPage));
    var start = (_historyPage - 1) * _HISTORY_PAGE_SIZE;
    var items = _historyItems.slice(start, start + _HISTORY_PAGE_SIZE);
    list.innerHTML = items.map(function (item, localIndex) {
      var absoluteIndex = start + localIndex;
      var previousItem = _historyItems[absoluteIndex + 1] || null;
      var versionType = getVersionHistoryType(item, previousItem);
      var changes = Array.isArray(item.changes) ? item.changes : [];
      return '<article class="version-history-item">' +
        '<div class="version-history-top">' +
          '<div>' +
            '<div class="version-history-version">V' + GW.escapeHtml(item.version || '') + '</div>' +
            '<div class="version-history-date">' + GW.escapeHtml(item.date || '') + (item.commit ? ' · ' + GW.escapeHtml(item.commit) : '') + '</div>' +
          '</div>' +
          '<div class="version-history-type is-' + GW.escapeHtml(versionType.key) + '">' + GW.escapeHtml(versionType.label) + '</div>' +
        '</div>' +
        '<p class="version-history-summary">' + GW.escapeHtml(item.summary || '') + '</p>' +
        '<ul class="version-history-changes">' +
          changes.map(function (change) { return '<li>' + GW.escapeHtml(change) + '</li>'; }).join('') +
        '</ul>' +
      '</article>';
    }).join('');

    var buttons = [];
    buttons.push('<button type="button" ' + (_historyPage <= 1 ? 'disabled' : '') + ' onclick="changeHistoryPage(-1)">← 이전</button>');
    buttons.push('<div class="version-history-page-numbers">' + (window.GWAdminShared && window.GWAdminShared.buildPageNumberButtons ? window.GWAdminShared.buildPageNumberButtons(_historyPage, totalPages, 'setHistoryPage') : '') + '</div>');
    buttons.push('<button type="button" ' + (_historyPage >= totalPages ? 'disabled' : '') + ' onclick="changeHistoryPage(1)">다음 →</button>');
    pg.innerHTML = buttons.join('');
  }

  window.changeHistoryPage = function (delta) {
    _historyPage += delta;
    renderVersionHistory();
  };

  window.setHistoryPage = function (page) {
    var totalPages = Math.max(1, Math.ceil(_historyItems.length / _HISTORY_PAGE_SIZE));
    var nextPage = parseInt(page, 10);
    if (!Number.isFinite(nextPage)) return;
    nextPage = Math.max(1, Math.min(totalPages, nextPage));
    if (nextPage === _historyPage) return;
    _historyPage = nextPage;
    renderVersionHistory();
  };

  function getVersionHistoryType(item, previousItem) {
    var explicitType = normalizeVersionHistoryType(item && item.type);
    if (explicitType) return explicitType;
    var current = parseVersionTuple(item && item.version);
    var previous = parseVersionTuple(previousItem && previousItem.version);
    if (current && previous) {
      if (current.major !== previous.major) return { key: 'super-nova', label: 'Super Nova' };
      if (current.update !== previous.update) return { key: 'update', label: 'Update' };
      return inferFixVersionType(item);
    }
    if (current) {
      if (current.update > 0) return { key: 'update', label: 'Update' };
      if (current.fix > 0) return inferFixVersionType(item);
      return { key: 'super-nova', label: 'Super Nova' };
    }
    return { key: 'update', label: 'Update' };
  }

  function normalizeVersionHistoryType(value) {
    var normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'super nova' || normalized === 'super-nova' || normalized === 'major') return { key: 'super-nova', label: 'Super Nova' };
    if (normalized === 'update' || normalized === 'feature' || normalized === 'release') return { key: 'update', label: 'Update' };
    if (normalized === 'bugfix' || normalized === 'bug-fix' || normalized === 'bug fix') return { key: 'bugfix', label: 'Bugfix' };
    if (normalized === 'hotfix' || normalized === 'hot-fix' || normalized === 'hot fix') return { key: 'hotfix', label: 'Hotfix' };
    return { key: 'update', label: toTitleCase(normalized) };
  }

  function inferFixVersionType(item) {
    var pool = [];
    if (item && item.summary) pool.push(item.summary);
    if (item && Array.isArray(item.changes)) pool = pool.concat(item.changes);
    var combined = pool.join(' ').toLowerCase();
    if (/(bug|버그|오류|실패|깨짐|작동하지|복구|fix)/.test(combined)) return { key: 'bugfix', label: 'Bugfix' };
    return { key: 'hotfix', label: 'Hotfix' };
  }

  function parseVersionTuple(version) {
    var raw = String(version || '').trim();
    if (!raw) return null;
    var parts = raw.split('.');
    if (!parts.length) return null;
    return {
      major: parseInt(parts[0], 10) || 0,
      update: parseInt(parts[1], 10) || 0,
      fix: parseInt(parts[2], 10) || 0,
    };
  }

  function toTitleCase(value) {
    return String(value || '').replace(/\b[a-z]/g, function (match) {
      return match.toUpperCase();
    });
  }
})();
