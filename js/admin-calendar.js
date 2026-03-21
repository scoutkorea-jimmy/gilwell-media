/**
 * Gilwell Media · Admin Calendar Module
 */
(function () {
  'use strict';

  var AdminShared = window.GWAdminShared = window.GWAdminShared || {};
  var defaultCalendarCopy = AdminShared.defaultCalendarCopy;
  var populateCalendarCopyEditor = AdminShared.populateCalendarCopyEditor;
  var _calendarItems = [];
  var _calendarEditingId = null;
  var _calendarTags = [];
  var _calendarTagPresets = [];
  var _calendarRelatedPost = null;
  var _calendarRelatedPosts = [];
  var _calendarSearchTimer = null;
  var _calendarGeoMap = null;
  var _calendarGeoMarker = null;

  function loadCalendarAdmin() {
    bindCalendarAdminControls();
    Promise.all([
      GW.apiFetch('/api/calendar'),
      GW.apiFetch('/api/settings/calendar-tags').catch(function () { return { items: [] }; }),
      GW.apiFetch('/api/settings/calendar-copy').catch(function () { return { copy: defaultCalendarCopy() }; })
    ])
      .then(function (results) {
        var calendarData = results[0];
        var tagData = results[1];
        var copyData = results[2];
        _calendarItems = Array.isArray(calendarData && calendarData.items) ? calendarData.items : [];
        _calendarTagPresets = Array.isArray(tagData && tagData.items) ? tagData.items : [];
        populateCalendarCopyEditor(copyData && copyData.copy);
        renderCalendarAdmin();
        renderCalendarTagPresetManager();
        renderCalendarTagEditor();
      })
      .catch(function () {
        var list = document.getElementById('calendar-admin-list');
        if (list) list.innerHTML = '<div class="list-empty">일정을 불러오지 못했습니다.</div>';
      });
  }

  function renderCalendarAdmin() {
    var list = document.getElementById('calendar-admin-list');
    if (!list) return;
    if (!_calendarItems.length) {
      list.innerHTML = '<div class="list-empty">등록된 일정이 없습니다.</div>';
      return;
    }
    list.innerHTML = _calendarItems.map(function (item) {
      var place = item.location_name || formatCalendarAddressDisplay(item.location_address || '') || '';
      var category = GW.escapeHtml(item.event_category || 'WOSM');
      var status = getCalendarStatus(item);
      var displayTitle = item.title || item.title_original || '';
      var originalTitle = item.title && item.title_original
        ? '<p class="calendar-admin-item-origin">' + GW.escapeHtml(item.title_original) + '</p>'
        : '';
      var tagsHtml = Array.isArray(item.event_tags) && item.event_tags.length
        ? '<div class="calendar-admin-item-badges">' + item.event_tags.map(function (tag) {
            return '<span class="calendar-status-badge">' + GW.escapeHtml(tag) + '</span>';
          }).join('') + '</div>'
        : '';
      var relatedHtml = Array.isArray(item.related_posts) && item.related_posts.length
        ? '<div class="calendar-admin-item-link">관련 기사: ' + item.related_posts.map(function (related) {
            return GW.escapeHtml(related.title || '');
          }).join(', ') + '</div>'
        : '';
      return '<article class="calendar-admin-item">' +
        '<div class="calendar-admin-item-head">' +
          '<div>' +
            '<div class="calendar-admin-item-badges"><span class="calendar-category-badge is-' + category.toLowerCase() + '">' + category + '</span><span class="calendar-status-badge is-' + status.key + '">' + GW.escapeHtml(status.label) + '</span></div>' +
            '<h3>' + GW.escapeHtml(displayTitle) + '</h3>' +
            originalTitle +
            '<p>' + GW.escapeHtml(formatCalendarRange(item)) + '</p>' +
          '</div>' +
          '<div class="calendar-admin-item-actions">' +
            '<button type="button" class="glossary-admin-inline-btn" onclick="editCalendarEvent(' + item.id + ')">수정</button>' +
            '<button type="button" class="glossary-admin-inline-btn delete" onclick="deleteCalendarEvent(' + item.id + ')">삭제</button>' +
          '</div>' +
        '</div>' +
        (place ? '<p class="calendar-admin-item-meta">' + GW.escapeHtml(place) + '</p>' : '') +
        tagsHtml +
        (item.description ? '<p class="calendar-admin-item-desc">' + GW.escapeHtml(item.description) + '</p>' : '') +
        relatedHtml +
        (item.link_url ? '<a class="calendar-admin-item-link" href="' + GW.escapeHtml(item.link_url) + '" target="_blank" rel="noopener">관련 링크 ↗</a>' : '') +
      '</article>';
    }).join('');
  }

  function renderCalendarTitleManager() {
    // Legacy bulk-title editor removed. Keep as a no-op for compatibility.
  }

  function bindCalendarAdminControls() {
    var queryInput = document.getElementById('calendar-related-post-query');
    if (queryInput && queryInput.dataset.bound !== 'true') {
      queryInput.dataset.bound = 'true';
      queryInput.addEventListener('input', function () {
        if (_calendarSearchTimer) clearTimeout(_calendarSearchTimer);
        _calendarSearchTimer = setTimeout(function () {
          searchCalendarRelatedPosts(queryInput.value || '');
        }, 180);
      });
    }
    bindCalendarTimeToggle('calendar-start-time-enabled', 'calendar-start-time-input');
    bindCalendarTimeToggle('calendar-end-time-enabled', 'calendar-end-time-input');
    initCalendarGeoMap();
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
  }

  function bindCalendarTimeToggle(toggleId, inputId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    if (!toggle || !input || toggle.dataset.bound === 'true') return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('change', function () {
      input.disabled = !toggle.checked;
      if (!toggle.checked) input.value = '';
    });
  }

  function searchCalendarRelatedPosts(query) {
    var resultsEl = document.getElementById('calendar-related-post-results');
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
            '<strong>' + GW.escapeHtml(post.title || '') + '</strong>' +
            '<span>' + GW.escapeHtml(post.category || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-post-id]'), function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-post-id'), 10);
            var post = posts.find(function (entry) { return entry.id === id; });
            if (!post) return;
            if (_calendarRelatedPosts.some(function (entry) { return entry.id === post.id; })) return;
            _calendarRelatedPost = {
              id: post.id,
              title: post.title || '',
              category: post.category || ''
            };
            _calendarRelatedPosts.push(_calendarRelatedPost);
            var input = document.getElementById('calendar-related-post-query');
            if (input) input.value = '';
            resultsEl.innerHTML = '';
            renderCalendarRelatedPostSelected();
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">기사를 검색하지 못했습니다.</div>';
      });
  }

  window.searchCalendarGeo = function () {
    var query = String(document.getElementById('calendar-geo-query').value || '').trim();
    var resultsEl = document.getElementById('calendar-geo-results');
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
          return '<button type="button" class="calendar-related-post-option" data-geo-index="' + index + '">' +
            '<strong>' + GW.escapeHtml(item.name || item.display_name || '지도 결과') + '</strong>' +
            '<span>' + GW.escapeHtml(item.display_name || '') + '</span>' +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-geo-index]'), function (btn) {
          btn.addEventListener('click', function () {
            var item = items[parseInt(btn.getAttribute('data-geo-index'), 10)];
            if (!item) return;
            applyCalendarGeoResult(item);
            resultsEl.innerHTML = '';
          });
        });
      })
      .catch(function () {
        resultsEl.innerHTML = '<div class="list-empty">지도 검색에 실패했습니다.</div>';
      });
  };

  function initCalendarGeoMap() {
    if (!window.L || _calendarGeoMap) return;
    var el = document.getElementById('calendar-geo-map');
    if (!el) return;
    _calendarGeoMap = L.map(el, { scrollWheelZoom: true }).setView([36.5, 127.9], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(_calendarGeoMap);
  }

  function applyCalendarGeoResult(item) {
    var lat = Number(item && item.lat);
    var lng = Number(item && item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    document.getElementById('calendar-location-address-input').value = buildCalendarAddress(item);
    document.getElementById('calendar-location-name-input').value = buildCalendarLocationName(item);
    var country = item.address && (item.address.country || item.address.country_code);
    if (country) {
      document.getElementById('calendar-country-input').value = country;
    }
    if (_calendarGeoMap) {
      _calendarGeoMap.setView([lat, lng], 11);
      if (_calendarGeoMarker) _calendarGeoMap.removeLayer(_calendarGeoMarker);
      _calendarGeoMarker = L.marker([lat, lng]).addTo(_calendarGeoMap);
    }
  }

  window.editCalendarEvent = function (id) {
    var item = _calendarItems.find(function (entry) { return entry.id === id; });
    if (!item) return;
    _calendarEditingId = id;
    document.getElementById('calendar-title-input').value = item.title || '';
    document.getElementById('calendar-title-original-input').value = item.title_original || '';
    document.getElementById('calendar-category-input').value = item.event_category || 'WOSM';
    document.getElementById('calendar-start-date-input').value = toDateOnlyValue(item.start_at);
    document.getElementById('calendar-start-time-enabled').checked = !!item.start_has_time;
    document.getElementById('calendar-start-time-input').disabled = !item.start_has_time;
    document.getElementById('calendar-start-time-input').value = item.start_has_time ? toTimeValue(item.start_at) : '';
    document.getElementById('calendar-end-date-input').value = toDateOnlyValue(item.end_at);
    document.getElementById('calendar-end-time-enabled').checked = !!item.end_has_time;
    document.getElementById('calendar-end-time-input').disabled = !item.end_has_time;
    document.getElementById('calendar-end-time-input').value = item.end_has_time ? toTimeValue(item.end_at) : '';
    document.getElementById('calendar-country-input').value = item.country_name || '';
    document.getElementById('calendar-location-name-input').value = item.location_name || '';
    document.getElementById('calendar-location-address-input').value = item.location_address || '';
    document.getElementById('calendar-geo-query').value = '';
    document.getElementById('calendar-geo-results').innerHTML = '';
    document.getElementById('calendar-link-input').value = item.link_url || '';
    document.getElementById('calendar-description-input').value = item.description || '';
    document.getElementById('calendar-related-post-query').value = '';
    document.getElementById('calendar-related-post-results').innerHTML = '';
    _calendarTags = Array.isArray(item.event_tags) ? item.event_tags.slice() : [];
    _calendarRelatedPosts = Array.isArray(item.related_posts) ? item.related_posts.slice() : [];
    _calendarRelatedPost = _calendarRelatedPosts[0] || null;
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
    syncCalendarGeoMarker(item.latitude, item.longitude);
    document.getElementById('calendar-submit-btn').textContent = '일정 수정';
    document.getElementById('calendar-cancel-btn').style.display = '';
    document.getElementById('calendar-title-input').focus();
  };

  window.cancelCalendarEdit = function () {
    _calendarEditingId = null;
    document.getElementById('calendar-title-input').value = '';
    document.getElementById('calendar-title-original-input').value = '';
    document.getElementById('calendar-category-input').value = 'KOR';
    document.getElementById('calendar-start-date-input').value = '';
    document.getElementById('calendar-start-time-enabled').checked = false;
    document.getElementById('calendar-start-time-input').disabled = true;
    document.getElementById('calendar-start-time-input').value = '';
    document.getElementById('calendar-end-date-input').value = '';
    document.getElementById('calendar-end-time-enabled').checked = false;
    document.getElementById('calendar-end-time-input').disabled = true;
    document.getElementById('calendar-end-time-input').value = '';
    document.getElementById('calendar-country-input').value = '';
    document.getElementById('calendar-location-name-input').value = '';
    document.getElementById('calendar-location-address-input').value = '';
    document.getElementById('calendar-geo-query').value = '';
    document.getElementById('calendar-geo-results').innerHTML = '';
    document.getElementById('calendar-link-input').value = '';
    document.getElementById('calendar-description-input').value = '';
    document.getElementById('calendar-related-post-query').value = '';
    document.getElementById('calendar-related-post-results').innerHTML = '';
    _calendarTags = [];
    _calendarRelatedPost = null;
    _calendarRelatedPosts = [];
    renderCalendarTagEditor();
    renderCalendarRelatedPostSelected();
    syncCalendarGeoMarker(null, null);
    document.getElementById('calendar-submit-btn').textContent = '일정 저장';
    document.getElementById('calendar-cancel-btn').style.display = 'none';
  };

  window.addCalendarTag = function () {
    var input = document.getElementById('calendar-tags-input');
    var value = String(input && input.value || '').trim();
    if (!value) {
      GW.showToast('추가할 태그를 입력해주세요', 'error');
      return;
    }
    if (_calendarTags.indexOf(value) >= 0) {
      GW.showToast('이미 추가된 태그입니다', 'error');
      return;
    }
    _calendarTags.push(value);
    if (input) input.value = '';
    renderCalendarTagEditor();
  };

  window.removeCalendarTag = function (tag) {
    _calendarTags = _calendarTags.filter(function (item) { return item !== tag; });
    renderCalendarTagEditor();
  };

  window.clearCalendarRelatedPost = function () {
    _calendarRelatedPost = null;
    _calendarRelatedPosts = [];
    renderCalendarRelatedPostSelected();
  };

  window.removeCalendarRelatedPost = function (id) {
    _calendarRelatedPosts = _calendarRelatedPosts.filter(function (entry) { return entry.id !== id; });
    _calendarRelatedPost = _calendarRelatedPosts[0] || null;
    renderCalendarRelatedPostSelected();
  };

  function renderCalendarTagEditor() {
    var list = document.getElementById('calendar-tags-list');
    if (!list) return;
    if (!_calendarTags.length) {
      list.innerHTML = '<div class="list-empty">등록된 행사 태그가 없습니다.</div>';
    } else {
      list.innerHTML = _calendarTags.map(function (tag) {
      return '<button type="button" class="calendar-tag-chip" data-calendar-tag="' + GW.escapeHtml(tag) + '">' +
        '<span>' + GW.escapeHtml(tag) + '</span><strong>×</strong>' +
      '</button>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('[data-calendar-tag]'), function (btn) {
        btn.addEventListener('click', function () {
          removeCalendarTag(btn.getAttribute('data-calendar-tag') || '');
        });
      });
    }
    renderCalendarTagPresets();
  }

  function renderCalendarRelatedPostSelected() {
    var wrap = document.getElementById('calendar-related-post-selected');
    if (!wrap) return;
    if (!_calendarRelatedPosts.length) {
      wrap.innerHTML = '<div class="list-empty">선택된 관련 기사가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = _calendarRelatedPosts.map(function (item) {
      return '<div class="calendar-related-post-pill">' +
        '<div><strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
        (item.category ? '<span>' + GW.escapeHtml(item.category) + '</span>' : '') +
        '</div>' +
        '<button type="button" data-calendar-related-remove="' + item.id + '">해제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-related-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        removeCalendarRelatedPost(parseInt(btn.getAttribute('data-calendar-related-remove'), 10));
      });
    });
  }

  function renderCalendarTagPresets() {
    var wrap = document.getElementById('calendar-tag-presets');
    if (!wrap) return;
    if (!_calendarTagPresets.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = _calendarTagPresets.map(function (tag) {
      var active = _calendarTags.indexOf(tag) >= 0 ? ' is-active' : '';
      return '<button type="button" class="calendar-tag-chip calendar-tag-preset' + active + '" data-calendar-preset-tag="' + GW.escapeHtml(tag) + '">' +
        '<span>' + GW.escapeHtml(tag) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-calendar-preset-tag]'), function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-calendar-preset-tag') || '';
        if (_calendarTags.indexOf(tag) >= 0) {
          _calendarTags = _calendarTags.filter(function (item) { return item !== tag; });
        } else {
          _calendarTags.push(tag);
        }
        renderCalendarTagEditor();
      });
    });
  }

  function renderCalendarTagPresetManager() {
    var list = document.getElementById('calendar-tag-manager-list');
    if (!list) return;
    if (!_calendarTagPresets.length) {
      list.innerHTML = '<div class="list-empty">등록된 공용 행사 태그가 없습니다.</div>';
      return;
    }
    list.innerHTML = _calendarTagPresets.map(function (tag, index) {
      return '<div class="calendar-tag-manager-item">' +
        '<input type="text" data-calendar-tag-preset-index="' + index + '" value="' + GW.escapeHtml(tag) + '">' +
        '<button type="button" class="cancel-btn admin-inline-cancel" data-calendar-tag-preset-remove="' + index + '">삭제</button>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-calendar-tag-preset-remove]'), function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-calendar-tag-preset-remove'), 10);
        _calendarTagPresets.splice(index, 1);
        renderCalendarTagPresetManager();
        renderCalendarTagPresets();
      });
    });
  }

  window.addCalendarTagPreset = function () {
    var input = document.getElementById('calendar-tag-manager-new');
    var value = String(input && input.value || '').trim();
    if (!value) {
      GW.showToast('추가할 공용 행사 태그를 입력해주세요', 'error');
      return;
    }
    if (_calendarTagPresets.indexOf(value) >= 0) {
      GW.showToast('이미 등록된 공용 행사 태그입니다', 'error');
      return;
    }
    _calendarTagPresets.push(value);
    if (input) input.value = '';
    renderCalendarTagPresetManager();
    renderCalendarTagPresets();
  };

  window.saveCalendarTagPresets = function () {
    var inputs = document.querySelectorAll('[data-calendar-tag-preset-index]');
    _calendarTagPresets = Array.prototype.map.call(inputs, function (input) {
      return String(input.value || '').trim();
    }).filter(function (tag, index, items) {
      return !!tag && items.indexOf(tag) === index;
    });
    GW.apiFetch('/api/settings/calendar-tags', {
      method: 'PUT',
      body: JSON.stringify({ items: _calendarTagPresets })
    }).then(function () {
      GW.showToast('행사 태그가 저장됐습니다', 'success');
      renderCalendarTagPresetManager();
      renderCalendarTagPresets();
    }).catch(function (err) {
      GW.showToast(err.message || '행사 태그 저장 실패', 'error');
    });
  };

  window.saveCalendarCopy = function () {
    var next = defaultCalendarCopy();
    Object.keys(next).forEach(function (key) {
      var input = document.getElementById('calendar-copy-' + key.replace(/_/g, '-'));
      next[key] = String(input && input.value || '').trim() || next[key];
    });
    GW.apiFetch('/api/settings/calendar-copy', {
      method: 'PUT',
      body: JSON.stringify({ copy: next })
    }).then(function () {
      _calendarCopy = next;
      GW.showToast('캘린더 문구가 저장됐습니다', 'success');
    }).catch(function (err) {
      GW.showToast(err.message || '캘린더 문구 저장 실패', 'error');
    });
  };

  window.saveCalendarTitles = function () {
    GW.showToast('일정 제목은 개별 일정 수정 또는 캘린더 문구 관리에서 정리해 주세요.', 'info');
    showAdminTab('calendar');
  };

  window.saveFeatureDefinition = function () {
    GW.showToast('기능 정의서는 전용 KMS 페이지에서 수정해 주세요.', 'info');
    openKmsPage();
  };

  window.submitCalendarEvent = function () {
    var payload = {
      title: (document.getElementById('calendar-title-input').value || '').trim(),
      title_original: (document.getElementById('calendar-title-original-input').value || '').trim(),
      event_category: document.getElementById('calendar-category-input').value || 'WOSM',
      start_date: document.getElementById('calendar-start-date-input').value || '',
      start_time: document.getElementById('calendar-start-time-enabled').checked ? (document.getElementById('calendar-start-time-input').value || '') : '',
      end_date: document.getElementById('calendar-end-date-input').value || '',
      end_time: document.getElementById('calendar-end-time-enabled').checked ? (document.getElementById('calendar-end-time-input').value || '') : '',
      event_tags: _calendarTags.slice(),
      country_name: (document.getElementById('calendar-country-input').value || '').trim(),
      location_name: (document.getElementById('calendar-location-name-input').value || '').trim(),
      location_address: (document.getElementById('calendar-location-address-input').value || '').trim(),
      latitude: _calendarGeoMarker ? _calendarGeoMarker.getLatLng().lat : '',
      longitude: _calendarGeoMarker ? _calendarGeoMarker.getLatLng().lng : '',
      related_post_id: _calendarRelatedPosts.length ? _calendarRelatedPosts[0].id : null,
      related_posts: _calendarRelatedPosts.slice(),
      link_url: (document.getElementById('calendar-link-input').value || '').trim(),
      description: (document.getElementById('calendar-description-input').value || '').trim(),
    };
    if (!payload.title && !payload.title_original) {
      GW.showToast('행사명(국문) 또는 원문 제목을 입력해주세요', 'error');
      return;
    }
    if (!payload.start_date) {
      GW.showToast('행사 시작 일을 입력해주세요', 'error');
      return;
    }
    var url = _calendarEditingId ? '/api/calendar/' + _calendarEditingId : '/api/calendar';
    var method = _calendarEditingId ? 'PUT' : 'POST';
    GW.apiFetch(url, { method: method, body: JSON.stringify(payload) })
      .then(function () {
        GW.showToast(_calendarEditingId ? '일정이 수정됐습니다' : '일정이 등록됐습니다', 'success');
        cancelCalendarEdit();
        loadCalendarAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 저장 실패', 'error');
      });
  };

  window.deleteCalendarEvent = function (id) {
    if (!confirm('이 일정을 삭제할까요?')) return;
    GW.apiFetch('/api/calendar/' + id, { method: 'DELETE' })
      .then(function () {
        GW.showToast('일정이 삭제됐습니다', 'success');
        if (_calendarEditingId === id) cancelCalendarEdit();
        loadCalendarAdmin();
      })
      .catch(function (err) {
        GW.showToast(err.message || '일정 삭제 실패', 'error');
      });
  };

  function toDateTimeLocalValue(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    return raw.slice(0, 16).replace(' ', 'T');
  }

  function toDateOnlyValue(value) {
    return String(value || '').trim().slice(0, 10);
  }

  function buildCalendarLocationName(item) {
    return String(item && (item.name || item.display_name) || '').trim();
  }

  function buildCalendarAddress(item) {
    var address = item && item.address;
    if (!address) return String(item && item.display_name || '').trim();
    var parts = [
      address.country,
      address.state || address.region,
      address.city || address.county || address.town || address.village,
      address.suburb || address.neighbourhood,
      address.road,
      address.house_number
    ].filter(Boolean);
    return parts.join(' ');
  }

  function formatCalendarAddressDisplay(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.indexOf(',') >= 0) {
      return raw.split(',').map(function (part) { return part.trim(); }).filter(Boolean).slice(0, 4).join(' ');
    }
    return raw;
  }

  function toTimeValue(value) {
    var raw = String(value || '').trim();
    if (!raw || raw.length < 16) return '';
    return raw.slice(11, 16);
  }

  function formatCalendarRange(itemOrStart, endAt) {
    var item = itemOrStart && typeof itemOrStart === 'object'
      ? itemOrStart
      : { start_at: itemOrStart, end_at: endAt, start_has_time: true, end_has_time: true };
    var start = String(item.start_at || '').trim();
    if (!start) return '';
    var startLabel = start.slice(0, 10) + (item.start_has_time ? ' ' + start.slice(11, 16) : '');
    var end = String(item.end_at || '').trim();
    if (!end) return startLabel;
    var endLabel = end.slice(0, 10) + (item.end_has_time ? ' ' + end.slice(11, 16) : '');
    return startLabel + ' ~ ' + endLabel;
  }

  function syncCalendarGeoMarker(lat, lng) {
    if (!_calendarGeoMap) return;
    if (_calendarGeoMarker) {
      _calendarGeoMap.removeLayer(_calendarGeoMarker);
      _calendarGeoMarker = null;
    }
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      _calendarGeoMap.setView([36.5, 127.9], 3);
      return;
    }
    _calendarGeoMarker = L.marker([Number(lat), Number(lng)]).addTo(_calendarGeoMap);
    _calendarGeoMap.setView([Number(lat), Number(lng)], 11);
  }

  function getCalendarStatus(item) {
    var now = Date.now();
    var start = parseCalendarDateTime(item && item.start_at);
    var end = parseCalendarDateTime(item && item.end_at);
    if (!start) return { key: 'upcoming', label: '개최예정' };
    if (start > now) return { key: 'upcoming', label: '개최예정' };
    if (!end || end >= now) return { key: 'ongoing', label: '진행중' };
    return { key: 'finished', label: '행사종료' };
  }

  function parseCalendarDateTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return 0;
    var parsed = Date.parse(raw.replace(' ', 'T') + '+09:00');
    return Number.isFinite(parsed) ? parsed : 0;
  }


  window.loadCalendarAdmin = loadCalendarAdmin;
})();
