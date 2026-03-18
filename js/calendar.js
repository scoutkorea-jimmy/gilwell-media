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
    editingId: null,
    tags: [],
    relatedPost: null,
    relatedSearchTimer: null,
  };

  function init() {
    GW.bootstrapStandardPage();
    bind();
    initMap();
    loadEvents();
  }

  function bind() {
    bindMonthNavigation();
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

  function bindManageControls() {
    var addBtn = document.getElementById('calendar-add-event-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        ensureCalendarAuth(function () {
          openEditor();
        });
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
    var loginModal = document.getElementById('calendar-login-modal');
    var editOverlay = document.getElementById('calendar-edit-overlay');

    if (loginSubmit) loginSubmit.addEventListener('click', submitLogin);
    if (loginCancel) loginCancel.addEventListener('click', closeLogin);
    if (editClose) editClose.addEventListener('click', closeEditor);
    if (editCancel) editCancel.addEventListener('click', closeEditor);
    if (editSubmit) editSubmit.addEventListener('click', submitCalendarEvent);
    if (editDelete) editDelete.addEventListener('click', deleteCalendarEvent);
    if (tagAdd) tagAdd.addEventListener('click', addModalTag);
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

  function loadEvents() {
    fetch('/api/calendar', { cache: 'no-store' })
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
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        var idValue = parseInt(btn.getAttribute('data-calendar-edit'), 10);
        ensureCalendarAuth(function () {
          openEditor(findItem(idValue));
        });
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
    if (item.related_post_id && item.related_post_title) {
      relatedLinks += '<a class="calendar-event-link" href="/post/' + item.related_post_id + '">관련 기사 읽기 ↗</a>';
    }
    if (item.link_url) {
      relatedLinks += '<a class="calendar-event-link" href="' + escape(item.link_url) + '" target="_blank" rel="noopener">외부 링크 ↗</a>';
    }
    var editAction = GW.getToken && GW.getToken() && GW.getAdminRole && GW.getAdminRole() === 'full'
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

  function ensureCalendarAuth(onSuccess) {
    if (GW.getToken && GW.getToken() && GW.getAdminRole && GW.getAdminRole() === 'full') {
      onSuccess();
      return;
    }
    openLogin(onSuccess);
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
    state.relatedPost = item && item.related_post_id ? {
      id: item.related_post_id,
      title: item.related_post_title || '',
      category: item.related_post_category || ''
    } : null;
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
    setValue('calendar-modal-lat-input', item && item.latitude != null ? item.latitude : '');
    setValue('calendar-modal-lng-input', item && item.longitude != null ? item.longitude : '');
    setValue('calendar-modal-description-input', item && item.description || '');
    setValue('calendar-modal-related-post-query', '');
    setHtml('calendar-modal-related-post-results', '');
    renderModalTags();
    renderModalRelatedPost();
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
            state.relatedPost = { id: post.id, title: post.title || '', category: post.category || '' };
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
    if (!state.relatedPost || !state.relatedPost.id) {
      wrap.innerHTML = '<div class="list-empty">선택된 관련 기사가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = '<div class="calendar-related-post-pill">' +
      '<div><strong>' + escape(state.relatedPost.title || '') + '</strong>' +
      (state.relatedPost.category ? '<span>' + escape(state.relatedPost.category) + '</span>' : '') +
      '</div>' +
      '<button type="button" id="calendar-modal-related-post-clear-btn">해제</button>' +
    '</div>';
    var clearBtn = document.getElementById('calendar-modal-related-post-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        state.relatedPost = null;
        renderModalRelatedPost();
      });
    }
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
      latitude: valueOf('calendar-modal-lat-input'),
      longitude: valueOf('calendar-modal-lng-input'),
      related_post_id: state.relatedPost && state.relatedPost.id ? state.relatedPost.id : null,
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
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(state.editingId ? '일정이 수정됐습니다' : '일정이 등록됐습니다', 'success');
        closeEditor();
        loadEvents();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 저장 실패', 'error');
      });
  }

  function deleteCalendarEvent() {
    if (!state.editingId) return;
    if (!window.confirm('이 일정을 삭제할까요?')) return;
    GW.apiFetch('/api/calendar/' + state.editingId, { method: 'DELETE' })
      .then(function () {
        GW.showToast('일정이 삭제됐습니다', 'success');
        closeEditor();
        loadEvents();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 삭제 실패', 'error');
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
    });
  }

  function countStatuses(items) {
    return (Array.isArray(items) ? items : []).reduce(function (acc, item) {
      var key = getEventStatus(item).key;
      acc[key] += 1;
      return acc;
    }, { ongoing: 0, upcoming: 0, finished: 0 });
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

  function renderStatusDot(count, key) {
    return count ? '<i class="is-' + key + '"></i>' : '';
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
