(function () {
  'use strict';

  var CATEGORY_META = {
    KOR: { label: 'KOR', color: '#0f8db3' },
    APR: { label: 'APR', color: '#ff5b5b' },
    EUR: { label: 'EUR', color: '#2f8f5b' },
    AFR: { label: 'AFR', color: '#b6761b' },
    ARB: { label: 'ARB', color: '#7b5cff' },
    IAR: { label: 'IAR', color: '#d44f94' },
    WOSM: { label: 'WOSM', color: '#2a8b3b' }
  };

  var state = {
    items: [],
    month: startOfMonth(new Date()),
    selected: toDateKey(new Date()),
    map: null,
    mapLayer: null,
  };

  function init() {
    GW.bootstrapStandardPage();
    bind();
    initMap();
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

  function initMap() {
    if (!window.L) return;
    var mapEl = document.getElementById('calendar-map');
    if (!mapEl) return;
    state.map = L.map(mapEl, { scrollWheelZoom: true, worldCopyJump: true }).setView([20, 10], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    state.map.on('zoomend moveend', renderMapMarkers);
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
    renderStatusLists();
    renderMapMarkers();
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
    var eventMap = buildEventMap(getMonthItems());
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
      var statusCounts = countStatuses(events);
      cells.push(
        '<button type="button" class="calendar-day' + activeClass + todayClass + '" data-date-key="' + key + '">' +
          '<span class="calendar-day-num">' + dayNum + '</span>' +
          '<span class="calendar-day-count">' + (events.length ? events.length + '개' : '') + '</span>' +
          '<span class="calendar-day-dots">' +
            renderStatusDot(statusCounts.ongoing, 'ongoing') +
            renderStatusDot(statusCounts.upcoming, 'upcoming') +
            renderStatusDot(statusCounts.finished, 'finished') +
          '</span>' +
        '</button>'
      );
    }
    cells.push('</div>');
    grid.innerHTML = cells.join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-date-key]'), function (btn) {
      btn.addEventListener('click', function () {
        state.selected = btn.getAttribute('data-date-key');
        renderStatusLists();
      });
    });
  }

  function renderStatusLists() {
    var monthItems = getMonthItems();
    var selectedItems = monthItems.filter(function (item) {
      return (item.start_at || '').slice(0, 10) === state.selected;
    });
    var baseItems = selectedItems.length ? selectedItems : monthItems;
    renderStatusList('calendar-ongoing-events', filterByStatus(baseItems, 'ongoing'), '진행중인 일정이 없습니다.');
    renderStatusList('calendar-upcoming-events', filterByStatus(baseItems, 'upcoming'), '개최예정 일정이 없습니다.');
    renderStatusList('calendar-finished-events', filterByStatus(baseItems, 'finished'), '행사종료 일정이 없습니다.');
  }

  function renderStatusList(id, items, emptyMessage) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    wrap.innerHTML = items.length ? items.map(renderEventCard).join('') : '<div class="list-empty">' + emptyMessage + '</div>';
  }

  function renderEventCard(item) {
    var when = formatEventTime(item.start_at, item.end_at);
    var place = item.location_name || item.location_address || item.country_name || '';
    var category = normalizeCategory(item.event_category);
    var status = getEventStatus(item);
    var categoryClass = status.key === 'finished' ? ' is-muted' : ' is-' + category.toLowerCase();
    var linkHtml = item.link_url ? '<a class="calendar-event-link" href="' + GW.escapeHtml(item.link_url) + '" target="_blank" rel="noopener">관련 링크 ↗</a>' : '';
    return '<article class="calendar-event-card' + (status.key === 'finished' ? ' is-finished' : '') + '">' +
      '<div class="calendar-event-badges">' +
        '<span class="calendar-category-badge' + categoryClass + '">' + category + '</span>' +
        '<span class="calendar-status-badge is-' + status.key + '">' + GW.escapeHtml(status.label) + '</span>' +
      '</div>' +
      '<div class="calendar-event-time">' + GW.escapeHtml(when) + '</div>' +
      '<h4>' + GW.escapeHtml(item.title || '') + '</h4>' +
      (place ? '<p class="calendar-event-place">' + GW.escapeHtml(place) + '</p>' : '') +
      (item.description ? '<p class="calendar-event-desc">' + GW.escapeHtml(item.description) + '</p>' : '') +
      linkHtml +
    '</article>';
  }

  function renderMapMarkers() {
    if (!state.map || !window.L) return;
    if (state.mapLayer) state.map.removeLayer(state.mapLayer);
    state.mapLayer = L.layerGroup().addTo(state.map);
    var items = getMapItems();
    if (!items.length) return;

    if (state.map.getZoom() <= 4) {
      var grouped = groupByCountry(items);
      grouped.forEach(function (group) {
        var marker = L.circleMarker([group.lat, group.lng], {
          radius: Math.min(18, 8 + group.items.length),
          color: '#111',
          weight: 1,
          fillColor: '#5c2a9d',
          fillOpacity: 0.78
        });
        marker.bindPopup(
          '<div class="calendar-map-popup">' +
            '<strong>' + escape(group.country_name || '기타 지역') + '</strong>' +
            '<ul>' + group.items.map(function (item) {
              return '<li>' + escape(item.title || '') + '</li>';
            }).join('') + '</ul>' +
          '</div>'
        );
        marker.addTo(state.mapLayer);
      });
      return;
    }

    items.forEach(function (item) {
      var category = normalizeCategory(item.event_category);
      var color = CATEGORY_META[category].color;
      var marker = L.circleMarker([item.latitude, item.longitude], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.92
      });
      marker.bindPopup(
        '<div class="calendar-map-popup">' +
          '<strong>' + escape(item.title || '') + '</strong>' +
          '<div>' + escape(formatEventTime(item.start_at, item.end_at)) + '</div>' +
          '<div>' + escape(item.location_name || item.location_address || item.country_name || '') + '</div>' +
        '</div>'
      );
      marker.addTo(state.mapLayer);
    });
  }

  function getMapItems() {
    return state.items.filter(function (item) {
      return getEventStatus(item).key !== 'finished' &&
        Number.isFinite(Number(item.latitude)) &&
        Number.isFinite(Number(item.longitude));
    }).map(function (item) {
      return Object.assign({}, item, {
        latitude: Number(item.latitude),
        longitude: Number(item.longitude)
      });
    });
  }

  function groupByCountry(items) {
    var map = new Map();
    items.forEach(function (item) {
      var key = String(item.country_name || '기타 지역').trim() || '기타 지역';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return Array.from(map.keys()).map(function (country) {
      var members = map.get(country);
      var lat = members.reduce(function (sum, item) { return sum + item.latitude; }, 0) / members.length;
      var lng = members.reduce(function (sum, item) { return sum + item.longitude; }, 0) / members.length;
      return { country_name: country, items: members, lat: lat, lng: lng };
    });
  }

  function getMonthItems() {
    var year = state.month.getFullYear();
    var month = state.month.getMonth();
    return state.items.filter(function (item) {
      var date = parseDate(item.start_at);
      return date && date.getFullYear() === year && date.getMonth() === month;
    });
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

  function filterByStatus(items, key) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return getEventStatus(item).key === key;
    }).sort(function (a, b) {
      return (a.start_at || '').localeCompare(b.start_at || '');
    });
  }

  function countStatuses(items) {
    var counts = { ongoing: 0, upcoming: 0, finished: 0 };
    (Array.isArray(items) ? items : []).forEach(function (item) {
      counts[getEventStatus(item).key] += 1;
    });
    return counts;
  }

  function getEventStatus(item) {
    var now = Date.now();
    var start = parseDate(item && item.start_at);
    var end = parseDate(item && item.end_at);
    if (!start) return { key: 'upcoming', label: '개최예정' };
    if (start.getTime() > now) return { key: 'upcoming', label: '개최예정' };
    if (!end || end.getTime() >= now) return { key: 'ongoing', label: '진행중' };
    return { key: 'finished', label: '행사종료' };
  }

  function renderStatusDot(count, key) {
    if (!count) return '';
    return '<i class="is-' + key + '"></i>';
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

  function parseDateTime(value) {
    var raw = String(value || '').trim();
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5])
    };
  }

  function parseDate(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    var parsed = Date.parse(raw.replace(' ', 'T') + '+09:00');
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }

  function normalizeCategory(value) {
    var raw = String(value || '').trim().toUpperCase();
    return CATEGORY_META[raw] ? raw : 'WOSM';
  }

  function escape(value) {
    return GW.escapeHtml(String(value || ''));
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
