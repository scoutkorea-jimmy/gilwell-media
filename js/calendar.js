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
    viewMode: 'month',
    map: null,
    mapLayer: null,
    allMapCategories: [],
    allMapTags: [],
    mapFilterCategories: [],
    mapFilterTags: [],
    editingId: null,
    tags: [],
    tagPresets: [],
    relatedPost: null,
    relatedPosts: [],
    relatedSearchTimer: null,
    modalMap: null,
    modalMarker: null,
    canManage: false,
  };

  function init() {
    GW.bootstrapStandardPage();
    bind();
    refreshCalendarAuthState();
    initMap();
    initModalMap();
    loadTagPresets();
    loadEvents();
  }

  function bind() {
    bindMonthNavigation();
    bindViewControls();
    bindManageControls();
    bindModalControls();
    bindTimeToggle('calendar-modal-start-time-enabled', 'calendar-modal-start-time-input');
    bindTimeToggle('calendar-modal-end-time-enabled', 'calendar-modal-end-time-input');
  }

  function bindMonthNavigation() {
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

  function bindViewControls() {
    var monthBtn = document.getElementById('calendar-view-month-btn');
    var yearBtn = document.getElementById('calendar-view-year-btn');
    if (monthBtn) {
      monthBtn.addEventListener('click', function () {
        state.viewMode = 'month';
        render();
      });
    }
    if (yearBtn) {
      yearBtn.addEventListener('click', function () {
        state.viewMode = 'year';
        render();
      });
    }
  }

  function bindManageControls() {
    var addBtn = document.getElementById('calendar-add-event-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        ensureCalendarAuth(function () {
          openEditor();
        }, true);
      });
    }
  }

  function bindModalControls() {
    var loginSubmit = document.getElementById('calendar-login-submit-btn');
    var loginCancel = document.getElementById('calendar-login-cancel-btn');
    var editClose = document.getElementById('calendar-edit-close-btn');
    var editCancel = document.getElementById('calendar-modal-cancel-btn');
    var editSubmit = document.getElementById('calendar-modal-submit-btn');
    var editDelete = document.getElementById('calendar-modal-delete-btn');
    var tagAdd = document.getElementById('calendar-modal-tag-add-btn');
    var relatedQuery = document.getElementById('calendar-modal-related-post-query');
    var geoSearch = document.getElementById('calendar-modal-geo-search-btn');
    var loginModal = document.getElementById('calendar-login-modal');
    var editOverlay = document.getElementById('calendar-edit-overlay');

    if (loginSubmit) loginSubmit.addEventListener('click', submitLogin);
    if (loginCancel) loginCancel.addEventListener('click', closeLogin);
    if (editClose) editClose.addEventListener('click', closeEditor);
    if (editCancel) editCancel.addEventListener('click', closeEditor);
    if (editSubmit) editSubmit.addEventListener('click', submitCalendarEvent);
    if (editDelete) editDelete.addEventListener('click', deleteCalendarEvent);
    if (tagAdd) tagAdd.addEventListener('click', addModalTag);
    if (geoSearch) geoSearch.addEventListener('click', searchModalGeo);
    if (relatedQuery) {
      relatedQuery.addEventListener('input', function () {
        if (state.relatedSearchTimer) clearTimeout(state.relatedSearchTimer);
        state.relatedSearchTimer = setTimeout(function () {
          searchRelatedPosts(relatedQuery.value || '');
        }, 180);
      });
    }
    if (loginModal) {
      loginModal.addEventListener('click', function (event) {
        if (event.target === loginModal) closeLogin();
      });
    }
    if (editOverlay) {
      editOverlay.addEventListener('click', function (event) {
        if (event.target === editOverlay) closeEditor();
      });
    }
  }

  function bindTimeToggle(toggleId, inputId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    if (!toggle || !input) return;
    toggle.addEventListener('change', function () {
      input.disabled = !toggle.checked;
      if (!toggle.checked) input.value = '';
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

  function initModalMap() {
    if (!window.L) return;
    var mapEl = document.getElementById('calendar-modal-geo-map');
    if (!mapEl) return;
    state.modalMap = L.map(mapEl, { scrollWheelZoom: true }).setView([36.5, 127.9], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.modalMap);
  }

  function loadTagPresets() {
    fetch('/api/settings/calendar-tags', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        state.tagPresets = Array.isArray(data && data.items) ? data.items : [];
        renderModalTagPresets();
      })
      .catch(function () {
        state.tagPresets = [];
        renderModalTagPresets();
      });
  }

  function loadEvents() {
    fetch('/api/calendar', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        state.items = Array.isArray(data && data.items) ? data.items : [];
        syncMapFilters();
        render();
      })
      .catch(function () {
        state.items = [];
        render();
      });
  }

  function render() {
    syncViewButtons();
    if (state.viewMode === 'year') renderYearView();
    else renderMonthView();
    renderStatusLists();
    renderMapFilters();
    renderMapMarkers();
  }

  function syncViewButtons() {
    var monthBtn = document.getElementById('calendar-view-month-btn');
    var yearBtn = document.getElementById('calendar-view-year-btn');
    if (monthBtn) monthBtn.classList.toggle('is-active', state.viewMode === 'month');
    if (yearBtn) yearBtn.classList.toggle('is-active', state.viewMode === 'year');
  }

  function renderMonthView() {
    var grid = document.getElementById('calendar-grid');
    var title = document.getElementById('calendar-current-month');
    var summary = document.getElementById('calendar-view-summary');
    if (!grid || !title) return;
    title.textContent = state.month.getFullYear() + '년 ' + String(state.month.getMonth() + 1).padStart(2, '0') + '월';
    if (summary) summary.textContent = '월간 일정보기입니다. 여러 날 이어지는 일정은 막대형으로 표시됩니다.';
    var firstDay = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    var lastDay = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0);
    var startWeekday = firstDay.getDay();
    var totalSlots = Math.ceil((startWeekday + lastDay.getDate()) / 7) * 7;
    var monthItems = getMonthItems().sort(compareByStartAtAsc);
    var cells = [];
    var weekLabels = ['일', '월', '화', '수', '목', '금', '토'];
    cells.push('<div class="calendar-weekdays">' + weekLabels.map(function (label) {
      return '<span>' + label + '</span>';
    }).join('') + '</div>');
    cells.push('<div class="calendar-month-weeks">');
    for (var weekStartSlot = 0; weekStartSlot < totalSlots; weekStartSlot += 7) {
      var weekDays = [];
      for (var offset = 0; offset < 7; offset += 1) {
        var slot = weekStartSlot + offset;
        var dayNum = slot - startWeekday + 1;
        var isInMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
        var current = isInMonth
          ? new Date(state.month.getFullYear(), state.month.getMonth(), dayNum)
          : new Date(state.month.getFullYear(), state.month.getMonth(), dayNum);
        weekDays.push({
          date: current,
          key: toDateKey(current),
          inMonth: isInMonth
        });
      }
      cells.push(renderWeekRow(weekDays, monthItems));
    }
    cells.push('</div>');
    grid.innerHTML = cells.join('');
    Array.prototype.forEach.call(grid.querySelectorAll('[data-date-key]'), function (btn) {
      btn.addEventListener('click', function () {
        state.selected = btn.getAttribute('data-date-key');
        renderMonthView();
        renderStatusLists();
      });
    });
  }

  function renderWeekRow(weekDays, monthItems) {
    var weekStart = weekDays[0].date;
    var weekEnd = weekDays[6].date;
    var dayButtons = weekDays.map(function (day) {
      var activeClass = day.key === state.selected ? ' is-active' : '';
      var todayClass = day.key === toDateKey(new Date()) ? ' is-today' : '';
      var mutedClass = day.inMonth ? '' : ' is-outside';
      var events = monthItems.filter(function (item) {
        return eventIncludesDate(item, day.key);
      });
      return '<button type="button" class="calendar-day' + activeClass + todayClass + mutedClass + '" data-date-key="' + day.key + '">' +
        '<span class="calendar-day-num">' + day.date.getDate() + '</span>' +
        '<span class="calendar-day-count">' + (events.length ? events.length + '개' : '') + '</span>' +
      '</button>';
    }).join('');
    var segments = buildWeekSegments(weekDays, monthItems.filter(function (item) {
      return intersectsRange(item, weekStart, weekEnd);
    }));
    var lanes = buildWeekLanes(segments);
    var lanesHtml = lanes.length ? lanes.map(function (lane) {
      return '<div class="calendar-week-lane">' + lane.map(function (segment) {
        var status = getEventStatus(segment.item).key;
        var label = formatWeekSegmentLabel(segment, weekStart);
        return '<button type="button" class="calendar-week-bar is-' + status + segment.shapeClass + '" style="grid-column:' + segment.startCol + ' / ' + (segment.endCol + 1) + ';" data-date-key="' + segment.focusKey + '">' +
          '<span class="calendar-week-bar-copy">' + escape(label) + '</span>' +
        '</button>';
      }).join('') + '</div>';
    }).join('') : '<div class="calendar-week-empty">등록된 일정이 없습니다.</div>';
    return '<section class="calendar-week-row">' +
      '<div class="calendar-week-days">' + dayButtons + '</div>' +
      '<div class="calendar-week-events">' + lanesHtml + '</div>' +
    '</section>';
  }

  function renderYearView() {
    var grid = document.getElementById('calendar-grid');
    var title = document.getElementById('calendar-current-month');
    var summary = document.getElementById('calendar-view-summary');
    if (!grid || !title) return;
    var year = state.month.getFullYear();
    title.textContent = year + '년 연간 일정';
    if (summary) summary.textContent = '연간 일정보기입니다. 월별로 정렬된 일정을 한 번에 확인할 수 있습니다.';
    var monthHtml = [];
    for (var monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      var monthItems = state.items.filter(function (item) {
        var date = parseDate(item.start_at);
        return date && date.getFullYear() === year && date.getMonth() === monthIndex;
      }).sort(compareByStartAtAsc);
      monthHtml.push(
        '<section class="calendar-year-month">' +
          '<div class="calendar-year-month-head">' +
            '<strong>' + (monthIndex + 1) + '월</strong>' +
            '<span>' + monthItems.length + '개 일정</span>' +
          '</div>' +
          '<div class="calendar-year-month-body">' +
            (monthItems.length
              ? monthItems.map(function (item) {
                  var titleText = item.title || item.title_original || '';
                  var status = getEventStatus(item);
                  return '<button type="button" class="calendar-year-event is-' + status.key + '" data-date-key="' + escape((item.start_at || '').slice(0, 10)) + '">' +
                    '<span class="calendar-year-event-date">' + escape(formatCalendarShortRange(item)) + '</span>' +
                    '<span class="calendar-year-event-title">' + escape(titleText) + '</span>' +
                  '</button>';
                }).join('')
              : '<div class="list-empty">등록된 일정이 없습니다.</div>') +
          '</div>' +
        '</section>'
      );
    }
    grid.innerHTML = '<div class="calendar-year-grid">' + monthHtml.join('') + '</div>';
    Array.prototype.forEach.call(grid.querySelectorAll('[data-date-key]'), function (btn) {
      btn.addEventListener('click', function () {
        var dateKey = btn.getAttribute('data-date-key');
        if (!dateKey) return;
        state.selected = dateKey;
        var date = parseDate(dateKey);
        if (date) state.month = startOfMonth(date);
        state.viewMode = 'month';
        render();
      });
    });
  }

  function renderStatusLists() {
    var statusTitle = document.getElementById('calendar-status-title');
    if (statusTitle) {
      statusTitle.textContent = state.month.getFullYear() + '년 ' + String(state.month.getMonth() + 1).padStart(2, '0') + '월 상태별 일정';
    }
    var monthItems = getMonthItems().filter(matchesActiveFilters);
    var ongoingItems = monthItems.filter(function (item) {
      return getEventStatus(item).key === 'ongoing';
    }).sort(compareByStartAtAsc);
    var upcomingItems = monthItems.filter(function (item) {
      return getEventStatus(item).key === 'upcoming';
    }).sort(compareByStartAtAsc);
    var finishedItems = monthItems.filter(function (item) {
      return getEventStatus(item).key === 'finished';
    }).sort(compareByEndAtDesc);
    renderStatusList('calendar-ongoing-events', ongoingItems, '진행중인 일정이 없습니다.');
    renderStatusList('calendar-upcoming-events', upcomingItems, '이 달에 예정된 일정이 없습니다.');
    renderStatusList('calendar-finished-events', finishedItems, '이 달에 종료된 일정이 없습니다.');
  }

  function eventIncludesDate(item, dateKey) {
    if (!dateKey) return false;
    var startKey = toDateOnlyValue(item && item.start_at);
    var endKey = toDateOnlyValue(item && (item.end_at || item.start_at));
    if (!startKey) return false;
    if (!endKey) endKey = startKey;
    return dateKey >= startKey && dateKey <= endKey;
  }

  function renderStatusList(id, items, emptyMessage) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    wrap.innerHTML = items.length ? items.map(renderEventCard).join('') : '<div class="list-empty">' + emptyMessage + '</div>';
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        var idValue = parseInt(btn.getAttribute('data-calendar-edit'), 10);
        ensureCalendarAuth(function () {
          openEditor(findItem(idValue));
        }, true);
      });
    });
  }

  function renderEventCard(item) {
    var when = formatEventTime(item);
    var place = item.location_name || item.location_address || item.country_name || '';
    var category = normalizeCategory(item.event_category);
    var status = getEventStatus(item);
    var categoryClass = status.key === 'finished' ? ' is-muted' : ' is-' + category.toLowerCase();
    var title = item.title || item.title_original || '';
    var originalTitle = item.title && item.title_original ? '<p class="calendar-event-original">' + escape(item.title_original) + '</p>' : '';
    var tagHtml = item.event_tags && item.event_tags.length
      ? '<div class="calendar-event-badges">' + item.event_tags.map(function (tag) {
          return '<span class="calendar-status-badge">' + escape(tag) + '</span>';
        }).join('') + '</div>'
      : '';
    var relatedLinks = '';
    (Array.isArray(item.related_posts) ? item.related_posts : []).forEach(function (related) {
      if (!related || !related.id) return;
      relatedLinks += '<a class="calendar-event-link" href="/post/' + related.id + '">관련 기사 읽기 ↗</a>';
    });
    if (item.link_url) {
      relatedLinks += '<a class="calendar-event-link" href="' + escape(item.link_url) + '" target="_blank" rel="noopener">외부 링크 ↗</a>';
    }
    var editAction = state.canManage
      ? '<button type="button" class="calendar-event-edit-btn" data-calendar-edit="' + item.id + '">수정</button>'
      : '';
    return '<article class="calendar-event-card' + (status.key === 'finished' ? ' is-finished' : '') + '">' +
      '<div class="calendar-event-card-head">' +
        '<div>' +
          '<div class="calendar-event-badges">' +
            '<span class="calendar-category-badge' + categoryClass + '">' + category + '</span>' +
            '<span class="calendar-status-badge is-' + status.key + '">' + escape(status.label) + '</span>' +
          '</div>' +
          '<div class="calendar-event-time">' + escape(when) + '</div>' +
        '</div>' +
        editAction +
      '</div>' +
      '<h4>' + escape(title) + '</h4>' +
      originalTitle +
      (place ? '<p class="calendar-event-place">' + escape(place) + '</p>' : '') +
      tagHtml +
      (item.description ? '<p class="calendar-event-desc">' + escape(item.description) + '</p>' : '') +
      (relatedLinks ? '<div class="calendar-event-links">' + relatedLinks + '</div>' : '') +
    '</article>';
  }

  function renderMapMarkers() {
    if (!state.map || !window.L) return;
    if (state.mapLayer) state.map.removeLayer(state.mapLayer);
    state.mapLayer = L.layerGroup().addTo(state.map);
    var items = getMapItems();
    if (!items.length) return;

    if (state.map.getZoom() <= 4) {
      groupByCountry(items).forEach(function (group) {
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
              return '<li>' + escape(item.title || item.title_original || '') + '</li>';
            }).join('') + '</ul>' +
          '</div>'
        );
        marker.addTo(state.mapLayer);
      });
      return;
    }

    items.forEach(function (item) {
      var category = normalizeCategory(item.event_category);
      var marker = L.circleMarker([item.latitude, item.longitude], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: CATEGORY_META[category].color,
        fillOpacity: 0.92
      });
      marker.bindPopup(
        '<div class="calendar-map-popup">' +
          '<strong>' + escape(item.title || item.title_original || '') + '</strong>' +
          '<div>' + escape(formatEventTime(item)) + '</div>' +
          '<div>' + escape(item.location_name || item.location_address || item.country_name || '') + '</div>' +
        '</div>'
      );
      marker.addTo(state.mapLayer);
    });
  }

  function getMapItems() {
    return state.items.filter(function (item) {
      var categoryAllowed = !state.allMapCategories.length
        ? true
        : state.mapFilterCategories.indexOf(normalizeCategory(item.event_category)) >= 0;
      var tagsAllowed = !state.allMapTags.length
        ? true
        : (!(Array.isArray(item.event_tags) && item.event_tags.length) ? false : item.event_tags.some(function (tag) {
        return state.mapFilterTags.indexOf(tag) >= 0;
      }));
      return getEventStatus(item).key !== 'finished' &&
        categoryAllowed &&
        tagsAllowed &&
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

  function refreshCalendarAuthState() {
    state.canManage = false;
    if (!(GW.getToken && GW.getToken())) {
      renderStatusLists();
      return Promise.resolve(false);
    }
    return GW.apiFetch('/api/admin/session', { method: 'GET' })
      .then(function (data) {
        state.canManage = !!(data && data.authenticated && data.role === 'full');
        renderStatusLists();
        return state.canManage;
      })
      .catch(function () {
        if (GW.clearToken) GW.clearToken();
        state.canManage = false;
        renderStatusLists();
        return false;
      });
  }

  function ensureCalendarAuth(onSuccess, forcePrompt) {
    if (forcePrompt) {
      openLogin(onSuccess);
      return;
    }
    refreshCalendarAuthState().then(function (canManage) {
      if (canManage) {
        if (typeof onSuccess === 'function') onSuccess();
        return;
      }
      openLogin(onSuccess);
    });
  }

  function openLogin(onSuccess) {
    var modal = document.getElementById('calendar-login-modal');
    if (!modal) return;
    modal.dataset.successHandler = 'true';
    modal._onSuccess = onSuccess;
    document.getElementById('calendar-login-pw').value = '';
    document.getElementById('calendar-login-err').style.display = 'none';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeLogin() {
    var modal = document.getElementById('calendar-login-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal._onSuccess = null;
  }

  function submitLogin() {
    var password = (document.getElementById('calendar-login-pw').value || '').trim();
    var err = document.getElementById('calendar-login-err');
    var btn = document.getElementById('calendar-login-submit-btn');
    err.style.display = 'none';
    if (!password) {
      err.textContent = '비밀번호를 입력해주세요.';
      err.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = '확인 중…';
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: password })
    }).then(function (data) {
      if (!data || !data.token || data.role !== 'full') {
        throw new Error('관리자 권한이 필요합니다.');
      }
      GW.setToken(data.token);
      GW.setAdminRole(data.role || 'full');
      state.canManage = true;
      var modal = document.getElementById('calendar-login-modal');
      var handler = modal && modal._onSuccess;
      closeLogin();
      if (typeof handler === 'function') handler();
      renderStatusLists();
    }).catch(function (error) {
      err.textContent = error.message || '인증에 실패했습니다.';
      err.style.display = 'block';
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '확인';
    });
  }

  function openEditor(item) {
    state.editingId = item && item.id ? item.id : null;
    state.tags = item && Array.isArray(item.event_tags) ? item.event_tags.slice() : [];
    state.relatedPosts = item && Array.isArray(item.related_posts) ? item.related_posts.slice() : [];
    state.relatedPost = state.relatedPosts[0] || null;
    setValue('calendar-edit-title', state.editingId ? '일정 수정' : '일정 추가');
    setValue('calendar-modal-title-input', item && item.title || '');
    setValue('calendar-modal-title-original-input', item && item.title_original || '');
    setValue('calendar-modal-category-input', item && item.event_category || 'KOR');
    setValue('calendar-modal-country-input', item && item.country_name || '');
    setValue('calendar-modal-start-date-input', toDateOnlyValue(item && item.start_at));
    setChecked('calendar-modal-start-time-enabled', !!(item && item.start_has_time));
    setDisabled('calendar-modal-start-time-input', !(item && item.start_has_time));
    setValue('calendar-modal-start-time-input', item && item.start_has_time ? toTimeValue(item.start_at) : '');
    setValue('calendar-modal-end-date-input', toDateOnlyValue(item && item.end_at));
    setChecked('calendar-modal-end-time-enabled', !!(item && item.end_has_time));
    setDisabled('calendar-modal-end-time-input', !(item && item.end_has_time));
    setValue('calendar-modal-end-time-input', item && item.end_has_time ? toTimeValue(item.end_at) : '');
    setValue('calendar-modal-location-name-input', item && item.location_name || '');
    setValue('calendar-modal-location-address-input', item && item.location_address || '');
    setValue('calendar-modal-link-input', item && item.link_url || '');
    setValue('calendar-modal-geo-query', '');
    setHtml('calendar-modal-geo-results', '');
    setValue('calendar-modal-description-input', item && item.description || '');
    setValue('calendar-modal-related-post-query', '');
    setHtml('calendar-modal-related-post-results', '');
    renderModalTags();
    renderModalTagPresets();
    renderModalRelatedPost();
    syncModalGeoMarker(item && item.latitude, item && item.longitude);
    var deleteBtn = document.getElementById('calendar-modal-delete-btn');
    if (deleteBtn) deleteBtn.style.display = state.editingId ? '' : 'none';
    var overlay = document.getElementById('calendar-edit-overlay');
    if (overlay) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeEditor() {
    var overlay = document.getElementById('calendar-edit-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    state.editingId = null;
  }

  function addModalTag() {
    var input = document.getElementById('calendar-modal-tags-input');
    var value = String(input && input.value || '').trim();
    if (!value) {
      GW.showToast('추가할 태그를 입력해주세요', 'error');
      return;
    }
    if (state.tags.indexOf(value) >= 0) {
      GW.showToast('이미 추가된 태그입니다', 'error');
      return;
    }
    state.tags.push(value);
    if (input) input.value = '';
    renderModalTags();
    renderModalTagPresets();
  }

  function renderModalTags() {
    var list = document.getElementById('calendar-modal-tags-list');
    if (!list) return;
    if (!state.tags.length) {
      list.innerHTML = '<div class="list-empty">등록된 행사 태그가 없습니다.</div>';
      return;
    }
    list.innerHTML = state.tags.map(function (tag) {
      return '<button type="button" class="calendar-tag-chip" data-calendar-modal-tag="' + escape(tag) + '">' +
        '<span>' + escape(tag) + '</span><strong>×</strong>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-calendar-modal-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-calendar-modal-tag') || '';
        state.tags = state.tags.filter(function (tag) { return tag !== target; });
        renderModalTags();
        renderModalTagPresets();
      });
    });
  }

  function renderModalTagPresets() {
    var wrap = document.getElementById('calendar-modal-tag-presets');
    if (!wrap) return;
    if (!state.tagPresets.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = state.tagPresets.map(function (tag) {
      var active = state.tags.indexOf(tag) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-tag-chip calendar-tag-preset' + active + '" data-calendar-modal-preset-tag="' + escape(tag) + '">' +
        '<span>' + escape(tag) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-modal-preset-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-calendar-modal-preset-tag') || '';
        if (state.tags.indexOf(tag) >= 0) {
          state.tags = state.tags.filter(function (item) { return item !== tag; });
        } else {
          state.tags.push(tag);
        }
        renderModalTags();
        renderModalTagPresets();
      });
    });
  }

  function searchRelatedPosts(query) {
    var resultsEl = document.getElementById('calendar-modal-related-post-results');
    if (!resultsEl) return;
    var term = String(query || '').trim();
    if (!term) {
      resultsEl.innerHTML = '';
      return;
    }
    GW.apiFetch('/api/posts?page=1&limit=8&q=' + encodeURIComponent(term))
      .then(function (data) {
        var posts = Array.isArray(data && data.posts) ? data.posts : [];
        if (!posts.length) {
          resultsEl.innerHTML = '<div class="list-empty">검색 결과가 없습니다.</div>';
          return;
        }
        resultsEl.innerHTML = posts.map(function (post) {
          return '<button type="button" class="calendar-related-post-option" data-post-id="' + post.id + '">' +
            '<strong>' + escape(post.title || '') + '</strong>' +
            '<span>' + escape(post.category || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-post-id]'), function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-post-id'), 10);
            var post = posts.find(function (entry) { return entry.id === id; });
            if (!post) return;
            if (state.relatedPosts.some(function (entry) { return entry.id === post.id; })) return;
            state.relatedPost = { id: post.id, title: post.title || '', category: post.category || '' };
            state.relatedPosts.push(state.relatedPost);
            setValue('calendar-modal-related-post-query', '');
            setHtml('calendar-modal-related-post-results', '');
            renderModalRelatedPost();
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">기사를 검색하지 못했습니다.</div>';
      });
  }

  function renderModalRelatedPost() {
    var wrap = document.getElementById('calendar-modal-related-post-selected');
    if (!wrap) return;
    if (!state.relatedPosts.length) {
      wrap.innerHTML = '<div class="list-empty">선택된 관련 기사가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = state.relatedPosts.map(function (item) {
      return '<div class="calendar-related-post-pill">' +
        '<div><strong>' + escape(item.title || '') + '</strong>' +
        (item.category ? '<span>' + escape(item.category) + '</span>' : '') +
        '</div>' +
        '<button type="button" data-calendar-modal-related-remove="' + item.id + '">해제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-modal-related-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-calendar-modal-related-remove'), 10);
        state.relatedPosts = state.relatedPosts.filter(function (entry) { return entry.id !== id; });
        state.relatedPost = state.relatedPosts[0] || null;
        renderModalRelatedPost();
      });
    });
  }

  function searchModalGeo() {
    var query = valueOf('calendar-modal-geo-query');
    var resultsEl = document.getElementById('calendar-modal-geo-results');
    if (!query) {
      GW.showToast('검색할 주소나 장소명을 입력해주세요', 'error');
      return;
    }
    resultsEl.innerHTML = '<div class="list-empty">지도 검색 중…</div>';
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=' + encodeURIComponent(query), {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) { return res.json(); })
      .then(function (items) {
        if (!Array.isArray(items) || !items.length) {
          resultsEl.innerHTML = '<div class="list-empty">검색 결과가 없습니다.</div>';
          return;
        }
        resultsEl.innerHTML = items.map(function (item, index) {
          return '<button type="button" class="calendar-related-post-option" data-calendar-geo-index="' + index + '">' +
            '<strong>' + escape(item.name || item.display_name || '지도 결과') + '</strong>' +
            '<span>' + escape(item.display_name || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-calendar-geo-index]'), function (btn) {
          btn.addEventListener('click', function () {
            var item = items[parseInt(btn.getAttribute('data-calendar-geo-index'), 10)];
            if (!item) return;
            applyModalGeoResult(item);
            resultsEl.innerHTML = '';
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">지도 검색에 실패했습니다.</div>';
      });
  }

  function applyModalGeoResult(item) {
    var lat = Number(item && item.lat);
    var lng = Number(item && item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setValue('calendar-modal-location-address-input', item.display_name || '');
    setValue('calendar-modal-location-name-input', item.name || item.display_name || '');
    var country = item.address && (item.address.country || item.address.country_code);
    if (country) setValue('calendar-modal-country-input', country);
    syncModalGeoMarker(lat, lng);
  }

  function syncModalGeoMarker(lat, lng) {
    if (!state.modalMap) return;
    if (state.modalMarker) {
      state.modalMap.removeLayer(state.modalMarker);
      state.modalMarker = null;
    }
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      state.modalMap.setView([36.5, 127.9], 3);
      return;
    }
    state.modalMarker = L.marker([Number(lat), Number(lng)]).addTo(state.modalMap);
    state.modalMap.setView([Number(lat), Number(lng)], 11);
  }

  function submitCalendarEvent() {
    var payload = {
      title: valueOf('calendar-modal-title-input'),
      title_original: valueOf('calendar-modal-title-original-input'),
      event_category: valueOf('calendar-modal-category-input') || 'KOR',
      start_date: valueOf('calendar-modal-start-date-input'),
      start_time: isChecked('calendar-modal-start-time-enabled') ? valueOf('calendar-modal-start-time-input') : '',
      end_date: valueOf('calendar-modal-end-date-input'),
      end_time: isChecked('calendar-modal-end-time-enabled') ? valueOf('calendar-modal-end-time-input') : '',
      event_tags: state.tags.slice(),
      country_name: valueOf('calendar-modal-country-input'),
      location_name: valueOf('calendar-modal-location-name-input'),
      location_address: valueOf('calendar-modal-location-address-input'),
      latitude: state.modalMarker ? state.modalMarker.getLatLng().lat : '',
      longitude: state.modalMarker ? state.modalMarker.getLatLng().lng : '',
      related_post_id: state.relatedPosts.length ? state.relatedPosts[0].id : null,
      related_posts: state.relatedPosts.slice(),
      link_url: valueOf('calendar-modal-link-input'),
      description: valueOf('calendar-modal-description-input'),
    };
    if (!payload.title && !payload.title_original) {
      GW.showToast('행사명(국문) 또는 원문 제목을 입력해주세요', 'error');
      return;
    }
    if (!payload.start_date) {
      GW.showToast('행사 시작 일을 입력해주세요', 'error');
      return;
    }
    var url = state.editingId ? '/api/calendar/' + state.editingId : '/api/calendar';
    var method = state.editingId ? 'PUT' : 'POST';
    ensureCalendarAuth(function () {
      GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
        .then(function () {
          GW.showToast(state.editingId ? '일정이 수정됐습니다' : '일정이 등록됐습니다', 'success');
          closeEditor();
          loadEvents();
        })
        .catch(function (err) {
          if (err && err.status === 401) {
            state.canManage = false;
            openLogin(function () {
              submitCalendarEvent();
            });
            return;
          }
          GW.showToast(err.message || '일정 저장 실패', 'error');
        });
    }, false);
  }

  function deleteCalendarEvent() {
    if (!state.editingId) return;
    if (!window.confirm('이 일정을 삭제할까요?')) return;
    ensureCalendarAuth(function () {
      GW.apiFetch('/api/calendar/' + state.editingId, { method: 'DELETE' })
        .then(function () {
          GW.showToast('일정이 삭제됐습니다', 'success');
          closeEditor();
          loadEvents();
        })
        .catch(function (err) {
          if (err && err.status === 401) {
            state.canManage = false;
            openLogin(function () {
              deleteCalendarEvent();
            });
            return;
          }
          GW.showToast(err.message || '일정 삭제 실패', 'error');
        });
    }, false);
  }

  function getMonthItems() {
    var year = state.month.getFullYear();
    var month = state.month.getMonth();
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return state.items.filter(function (item) {
      var start = parseDate(item.start_at);
      var end = parseDate(item.end_at || item.start_at) || start;
      return start && end && start <= monthEnd && end >= monthStart;
    });
  }

  function buildWeekSegments(weekDays, items) {
    var weekStart = startOfDay(weekDays[0].date);
    var weekEnd = endOfDay(weekDays[6].date);
    return items.map(function (item) {
      var start = parseDate(item.start_at);
      var end = parseDate(item.end_at || item.start_at) || start;
      var segmentStart = start > weekStart ? startOfDay(start) : weekStart;
      var segmentEnd = end < weekEnd ? startOfDay(end) : startOfDay(weekEnd);
      var startCol = diffInDays(weekStart, segmentStart) + 1;
      var endCol = diffInDays(weekStart, segmentEnd) + 1;
      var startKey = toDateKey(startOfDay(start));
      var endKey = toDateKey(startOfDay(end));
      var focusKey = toDateKey(segmentStart);
      var isMultiDay = startKey !== endKey;
      var shapeClass = isMultiDay
        ? (startKey < focusKey
            ? (endKey > focusKey ? ' is-middle' : ' is-end')
            : (endKey > focusKey ? ' is-start' : ' is-single'))
        : ' is-single';
      return {
        item: item,
        startCol: startCol,
        endCol: endCol,
        focusKey: focusKey,
        shapeClass: shapeClass
      };
    }).sort(function (a, b) {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      return (b.endCol - b.startCol) - (a.endCol - a.startCol);
    });
  }

  function buildWeekLanes(segments) {
    var lanes = [];
    segments.forEach(function (segment) {
      var placed = false;
      for (var i = 0; i < lanes.length; i += 1) {
        if (!laneOverlaps(lanes[i], segment)) {
          lanes[i].push(segment);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([segment]);
    });
    return lanes;
  }

  function laneOverlaps(lane, segment) {
    return lane.some(function (existing) {
      return !(segment.endCol < existing.startCol || segment.startCol > existing.endCol);
    });
  }

  function formatWeekSegmentLabel(segment, weekStart) {
    var item = segment.item;
    var title = item.title || item.title_original || '';
    var start = parseDate(item.start_at);
    var end = parseDate(item.end_at || item.start_at) || start;
    var isSingleDay = toDateOnlyValue(item.start_at) === toDateOnlyValue(item.end_at || item.start_at);
    var startsThisWeek = diffInDays(weekStart, startOfDay(start)) >= 0;
    if (isSingleDay && item.start_has_time) {
      return formatTimeOnly(item.start_at) + ' ' + title;
    }
    if (!isSingleDay && startsThisWeek) {
      var prefix = start.getMonth() + 1 + '/' + start.getDate();
      if (item.start_has_time) prefix += ' ' + formatTimeOnly(item.start_at);
      return prefix + ' ' + title;
    }
    return title;
  }

  function intersectsRange(item, rangeStart, rangeEnd) {
    var start = parseDate(item.start_at);
    var end = parseDate(item.end_at || item.start_at) || start;
    return start && end && start <= rangeEnd && end >= rangeStart;
  }

  function diffInDays(start, end) {
    var ms = startOfDay(end).getTime() - startOfDay(start).getTime();
    return Math.round(ms / 86400000);
  }

  function formatTimeOnly(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var time = raw.slice(11, 16);
    return time || '';
  }

  function getEventStatus(item) {
    var now = Date.now();
    var start = parseDateTime(item && item.start_at);
    var end = parseDateTime(item && item.end_at);
    if (!start) return { key: 'upcoming', label: '개최예정' };
    if (start > now) return { key: 'upcoming', label: '개최예정' };
    if (!end || end >= now) return { key: 'ongoing', label: '진행중' };
    return { key: 'finished', label: '행사종료' };
  }

  function formatEventTime(item) {
    var startDate = toDateOnlyValue(item && item.start_at);
    var endDate = toDateOnlyValue(item && item.end_at);
    if (!startDate) return '';
    var start = startDate + ((item && item.start_has_time) ? ' ' + toTimeValue(item.start_at) : '');
    if (!endDate) return start;
    var end = endDate + ((item && item.end_has_time) ? ' ' + toTimeValue(item.end_at) : '');
    return start + ' ~ ' + end;
  }

  function formatCalendarShortRange(item) {
    var start = toDateOnlyValue(item && item.start_at);
    var end = toDateOnlyValue(item && item.end_at);
    if (!start) return '';
    if (!end || end === start) return start.slice(5);
    return start.slice(5) + ' ~ ' + end.slice(5);
  }

  function syncMapFilters() {
    var categories = [];
    var tags = [];
    state.items.forEach(function (item) {
      var category = normalizeCategory(item.event_category);
      if (categories.indexOf(category) < 0) categories.push(category);
      (Array.isArray(item.event_tags) ? item.event_tags : []).forEach(function (tag) {
        if (tags.indexOf(tag) < 0) tags.push(tag);
      });
    });
    state.allMapCategories = categories.slice();
    state.allMapTags = tags.slice();
    state.mapFilterCategories = categories.slice();
    state.mapFilterTags = tags.slice();
  }

  function renderMapFilters() {
    renderFilterGroup('calendar-map-category-filters', state.mapFilterCategories, function (value) {
      return value;
    }, function (value) {
      var index = state.mapFilterCategories.indexOf(value);
      if (index >= 0) state.mapFilterCategories.splice(index, 1);
      else state.mapFilterCategories.push(value);
      renderMapFilters();
      renderStatusLists();
      renderMapMarkers();
    }, state.allMapCategories);
    renderFilterGroup('calendar-status-category-filters', state.mapFilterCategories, function (value) {
      return value;
    }, function (value) {
      var index = state.mapFilterCategories.indexOf(value);
      if (index >= 0) state.mapFilterCategories.splice(index, 1);
      else state.mapFilterCategories.push(value);
      renderMapFilters();
      renderStatusLists();
      renderMapMarkers();
    }, state.allMapCategories);
    renderFilterGroup('calendar-map-tag-filters', state.mapFilterTags, function (value) {
      return value;
    }, function (value) {
      var index = state.mapFilterTags.indexOf(value);
      if (index >= 0) state.mapFilterTags.splice(index, 1);
      else state.mapFilterTags.push(value);
      renderMapFilters();
      renderStatusLists();
      renderMapMarkers();
    }, state.allMapTags);
    renderFilterGroup('calendar-status-tag-filters', state.mapFilterTags, function (value) {
      return value;
    }, function (value) {
      var index = state.mapFilterTags.indexOf(value);
      if (index >= 0) state.mapFilterTags.splice(index, 1);
      else state.mapFilterTags.push(value);
      renderMapFilters();
      renderStatusLists();
      renderMapMarkers();
    }, state.allMapTags);
  }

  function matchesActiveFilters(item) {
    var categoryAllowed = !state.allMapCategories.length
      ? true
      : state.mapFilterCategories.indexOf(normalizeCategory(item.event_category)) >= 0;
    var tagsAllowed = !state.allMapTags.length
      ? true
      : (!(Array.isArray(item.event_tags) && item.event_tags.length) ? false : item.event_tags.some(function (tag) {
          return state.mapFilterTags.indexOf(tag) >= 0;
        }));
    return categoryAllowed && tagsAllowed;
  }

  function renderFilterGroup(id, selectedItems, labelFn, onToggle, allItems) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    if (!allItems.length) {
      wrap.innerHTML = '<div class="list-empty">표시할 항목이 없습니다.</div>';
      return;
    }
    wrap.innerHTML = allItems.map(function (item) {
      var active = selectedItems.indexOf(item) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-filter-chip' + active + '" data-calendar-filter="' + escape(item) + '">' + escape(labelFn(item)) + '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-filter]'), function (btn) {
      btn.addEventListener('click', function () {
        onToggle(btn.getAttribute('data-calendar-filter') || '');
      });
    });
  }

  function compareByStartAtAsc(a, b) {
    return parseDateTime(a && a.start_at) - parseDateTime(b && b.start_at);
  }

  function compareByEndAtDesc(a, b) {
    return parseDateTime(b && (b.end_at || b.start_at)) - parseDateTime(a && (a.end_at || a.start_at));
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  }

  function parseDateTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return 0;
    var parsed = Date.parse(raw.replace(' ', 'T') + '+09:00');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseDate(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    var date = new Date(raw.replace(' ', 'T') + '+09:00');
    return isNaN(date.getTime()) ? null : date;
  }

  function normalizeCategory(value) {
    var raw = String(value || '').trim().toUpperCase();
    return CATEGORY_META[raw] ? raw : 'WOSM';
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function toDateKey(date) {
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate())
    ].join('');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDateOnlyValue(value) {
    return String(value || '').trim().slice(0, 10);
  }

  function toTimeValue(value) {
    var raw = String(value || '').trim();
    if (!raw || raw.length < 16) return '';
    return raw.slice(11, 16);
  }

  function valueOf(id) {
    var el = document.getElementById(id);
    return String(el && el.value || '').trim();
  }

  function setValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function isChecked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function setChecked(id, value) {
    var el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function setDisabled(id, value) {
    var el = document.getElementById(id);
    if (el) el.disabled = !!value;
  }

  function findItem(id) {
    return state.items.find(function (item) { return item.id === id; }) || null;
  }

  function escape(value) {
    return GW.escapeHtml(value || '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
