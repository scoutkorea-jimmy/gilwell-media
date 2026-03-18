(function () {
  'use strict';

  var state = {
    items: [],
    month: startOfMonth(new Date()),
    selected: toDateKey(new Date()),
  };

  function init() {
    GW.bootstrapStandardPage();
    bind();
    loadEvents();
  }

  function bind() {
    var prev = document.getElementById('calendar-prev-btn');
    var next = document.getElementById('calendar-next-btn');
    if (prev) prev.addEventListener('click', function () {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
      render();
    });
    if (next) next.addEventListener('click', function () {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
      render();
    });
  }

  function loadEvents() {
    fetch('/api/calendar')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        state.items = Array.isArray(data && data.items) ? data.items : [];
        render();
      })
      .catch(function () {
        state.items = [];
        render();
      });
  }

  function render() {
    renderGrid();
    renderSelectedEvents();
    renderUpcoming();
  }

  function renderGrid() {
    var grid = document.getElementById('calendar-grid');
    var title = document.getElementById('calendar-current-month');
    if (!grid || !title) return;
    title.textContent = state.month.getFullYear() + '년 ' + String(state.month.getMonth() + 1).padStart(2, '0') + '월';
    var firstDay = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    var lastDay = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0);
    var startWeekday = firstDay.getDay();
    var totalSlots = Math.ceil((startWeekday + lastDay.getDate()) / 7) * 7;
    var eventMap = buildEventMap(state.items);
    var cells = [];
    var weekLabels = ['일', '월', '화', '수', '목', '금', '토'];
    cells.push('<div class="calendar-weekdays">' + weekLabels.map(function (label) {
      return '<span>' + label + '</span>';
    }).join('') + '</div>');
    cells.push('<div class="calendar-grid">');
    for (var slot = 0; slot < totalSlots; slot += 1) {
      var dayNum = slot - startWeekday + 1;
      if (dayNum < 1 || dayNum > lastDay.getDate()) {
        cells.push('<button type="button" class="calendar-day is-empty" disabled aria-hidden="true"></button>');
        continue;
      }
      var current = new Date(state.month.getFullYear(), state.month.getMonth(), dayNum);
      var key = toDateKey(current);
      var events = eventMap.get(key) || [];
      var activeClass = key === state.selected ? ' is-active' : '';
      var todayClass = key === toDateKey(new Date()) ? ' is-today' : '';
      cells.push(
        '<button type="button" class="calendar-day' + activeClass + todayClass + '" data-date-key="' + key + '">' +
          '<span class="calendar-day-num">' + dayNum + '</span>' +
          '<span class="calendar-day-count">' + (events.length ? events.length + '개' : '') + '</span>' +
          '<span class="calendar-day-dots">' + events.slice(0, 3).map(function () { return '<i></i>'; }).join('') + '</span>' +
        '</button>'
      );
    }
    cells.push('</div>');
    grid.innerHTML = cells.join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-date-key]'), function (btn) {
      btn.addEventListener('click', function () {
        state.selected = btn.getAttribute('data-date-key');
        render();
      });
    });
  }

  function renderSelectedEvents() {
    var label = document.getElementById('calendar-selected-date-label');
    var wrap = document.getElementById('calendar-selected-events');
    if (!label || !wrap) return;
    label.textContent = state.selected.replace(/-/g, '. ') + '. 일정';
    var items = state.items.filter(function (item) {
      return item.start_at && item.start_at.slice(0, 10) === state.selected;
    });
    wrap.innerHTML = items.length ? items.map(renderEventCard).join('') : '<div class="list-empty">선택한 날짜의 일정이 없습니다.</div>';
  }

  function renderUpcoming() {
    var wrap = document.getElementById('calendar-upcoming-events');
    if (!wrap) return;
    var today = toDateKey(new Date());
    var items = state.items.filter(function (item) {
      return item.start_at && item.start_at.slice(0, 10) >= today;
    }).slice(0, 8);
    wrap.innerHTML = items.length ? items.map(renderEventCard).join('') : '<div class="list-empty">등록된 예정 일정이 없습니다.</div>';
  }

  function renderEventCard(item) {
    var when = formatEventTime(item.start_at, item.end_at);
    var place = item.location_name || item.location_address || '';
    var linkHtml = item.link_url ? '<a class="calendar-event-link" href="' + GW.escapeHtml(item.link_url) + '" target="_blank" rel="noopener">관련 링크 ↗</a>' : '';
    return '<article class="calendar-event-card">' +
      '<div class="calendar-event-time">' + GW.escapeHtml(when) + '</div>' +
      '<h4>' + GW.escapeHtml(item.title || '') + '</h4>' +
      (place ? '<p class="calendar-event-place">' + GW.escapeHtml(place) + '</p>' : '') +
      (item.description ? '<p class="calendar-event-desc">' + GW.escapeHtml(item.description) + '</p>' : '') +
      linkHtml +
    '</article>';
  }

  function formatEventTime(startAt, endAt) {
    var start = parseDateTime(startAt);
    var end = parseDateTime(endAt);
    if (!start) return '';
    var base = start.year + '-' + pad(start.month) + '-' + pad(start.day) + ' ' + pad(start.hour) + ':' + pad(start.minute);
    if (!end) return base;
    if (start.year === end.year && start.month === end.month && start.day === end.day) {
      return base + ' ~ ' + pad(end.hour) + ':' + pad(end.minute);
    }
    return base + ' ~ ' + end.year + '-' + pad(end.month) + '-' + pad(end.day) + ' ' + pad(end.hour) + ':' + pad(end.minute);
  }

  function buildEventMap(items) {
    var map = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var key = item.start_at ? item.start_at.slice(0, 10) : '';
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }

  function parseDateTime(value) {
    var raw = String(value || '').trim();
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    };
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function toDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
