(function () {
  'use strict';

  var VIEW_LABELS = {
    country: '국가별 보기',
    region: '지역연맹별 보기',
    language: '공식 언어별 보기',
  };

  var REGION_ORDER = {
    'Africa': 1,
    'Arab': 2,
    'Asia-Pacific': 3,
    'European': 4,
    'Interamerican': 5,
  };

  var state = {
    items: [],
    columns: [],
    registeredCount: 176,
    publicCopy: {},
    query: '',
    view: 'country',
    expandedGroups: {},
    expandedSections: {},
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.GW) return;
    GW.bootstrapStandardPage();

    var searchInput = document.getElementById('wosm-members-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.query = String(searchInput.value || '').trim().toLowerCase();
        render();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-view]'), function (button) {
      button.addEventListener('click', function () {
        var nextView = button.getAttribute('data-members-view') || 'country';
        if (state.view === nextView) return;
        state.view = nextView;
        render();
      });
    });

    loadMembers();
  });

  function loadMembers() {
    fetch('/api/settings/wosm-members', { credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        state.items = Array.isArray(data && data.items) ? data.items : [];
        state.columns = Array.isArray(data && data.columns) && data.columns.length ? data.columns : getDefaultColumns();
        state.registeredCount = Math.max(0, parseInt(data && data.registered_count, 10) || 176);
        state.publicCopy = normalizePublicCopy(data && data.public_copy);
        renderSummary();
        render();
      })
      .catch(function () {
        renderError();
      });
  }

  function getDefaultColumns() {
    return [
      { key: 'column_3', label: '공식정렬 순번' },
      { key: 'country_names', label: '국가명' },
      { key: 'membership_category', label: '회원 자격' },
      { key: 'status_description', label: '상태 설명' }
    ];
  }

  function renderSummary() {
    var wrap = document.getElementById('wosm-members-summary');
    if (!wrap) return;
    wrap.textContent = GW.formatNumber(state.registeredCount) + '개국 · ' + GW.formatNumber(state.items.length) + '개 회원연맹';
  }

  function normalizePublicCopy(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      overview_template: String(source.overview_template || '{countryCount}개국 · {memberCount}개 회원연맹을 {viewLabel} 기준으로 정리했습니다. {collapsibleCount}개국은 {childLabel}을 접어둘 수 있습니다.').trim(),
      search_template: String(source.search_template || '검색 결과 {countryCount}개국 · {memberCount}개 회원연맹이 {viewLabel} 기준으로 표시됩니다.').trim(),
      section_meta_template: String(source.section_meta_template || '{countryCount}개국 · {memberCount}개 회원연맹').trim(),
      helper_text: String(source.helper_text || '대표 연맹을 먼저 보고, 같은 국가의 소속 회원연맹은 필요할 때 펼쳐볼 수 있습니다. 검색 결과에 하위 연맹이 포함되면 해당 그룹은 자동으로 펼쳐집니다.').trim(),
      child_label: String(source.child_label || '소속 회원연맹').trim(),
      section_region_label: String(source.section_region_label || '지역연맹').trim(),
      section_language_label: String(source.section_language_label || '공식 언어').trim(),
    };
  }

  function render() {
    updateViewChips();
    updateHelperText();
    renderColgroup();
    renderHead();

    var countryGroups = buildCountryGroups(state.items);
    var filteredGroups = filterCountryGroups(countryGroups);
    var sections = buildSections(filteredGroups);

    renderMeta(sections, filteredGroups);
    renderTable(sections);
    renderCards(sections);
    bindInteractionButtons();
  }

  function updateHelperText() {
    var el = document.querySelector('.glossary-search-help');
    if (!el) return;
    el.textContent = normalizePublicCopy(state.publicCopy).helper_text;
  }

  function updateViewChips() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-view]'), function (button) {
      var active = (button.getAttribute('data-members-view') || 'country') === state.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function buildCountryGroups(items) {
    var byCountry = {};
    (items || []).forEach(function (item) {
      var key = getCountryKey(item);
      if (!byCountry[key]) {
        byCountry[key] = {
          key: key,
          country_ko: String(item && item.country_ko || '').trim(),
          country_en: String(item && item.country_en || '').trim(),
          items: [],
        };
      }
      byCountry[key].items.push(item);
    });

    return Object.keys(byCountry).map(function (key) {
      var group = byCountry[key];
      var sortedItems = group.items.slice().sort(compareItemsBySort);
      var representative = sortedItems[0] || null;
      var children = sortedItems.slice(1);
      var region = getRegionValue(representative) || getFirstFilledValue(sortedItems, getRegionValue);
      var language = getLanguageValue(representative) || getFirstFilledValue(sortedItems, getLanguageValue);
      return {
        key: key,
        country_ko: group.country_ko,
        country_en: group.country_en,
        region: region || '미분류',
        language: language || '미분류',
        items: sortedItems,
        representative: representative,
        children: children,
        count: sortedItems.length,
      };
    }).sort(compareGroupsByRepresentativeSort);
  }

  function filterCountryGroups(groups) {
    return (groups || []).map(function (group) {
      var matchedItems = !state.query
        ? group.items.slice()
        : group.items.filter(function (item) { return matchesQuery(item, group); });

      if (!matchedItems.length) return null;

      var matchesRepresentative = matchedItems.indexOf(group.representative) >= 0;
      var matchedChildren = group.children.filter(function (item) { return matchedItems.indexOf(item) >= 0; });

      return {
        key: group.key,
        country_ko: group.country_ko,
        country_en: group.country_en,
        region: group.region,
        language: group.language,
        items: group.items.slice(),
        representative: group.representative,
        children: group.children.slice(),
        matchedItems: matchedItems,
        matchedChildren: matchedChildren,
        matchesRepresentative: matchesRepresentative,
        count: group.count,
      };
    }).filter(Boolean);
  }

  function buildSections(groups) {
    if (state.view === 'country') {
      return [{
        key: 'country',
        label: VIEW_LABELS.country,
        meta: makeSectionMeta(groups),
        groups: groups,
      }];
    }

    var map = {};
    groups.forEach(function (group) {
      var key = state.view === 'region' ? group.region : group.language;
      if (!map[key]) map[key] = [];
      map[key].push(group);
    });

    return Object.keys(map).sort(function (a, b) {
      if (state.view === 'region') {
        var aOrder = REGION_ORDER[a] || 99;
        var bOrder = REGION_ORDER[b] || 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      if (map[b].length !== map[a].length) return map[b].length - map[a].length;
      return a.localeCompare(b, 'ko');
    }).map(function (key) {
      var sectionGroups = map[key].slice().sort(compareGroupsByRepresentativeSort);
      return {
        key: key,
        label: key,
        toneClass: getSectionToneClass(state.view, key),
        eyebrow: state.view === 'region' ? normalizePublicCopy(state.publicCopy).section_region_label : normalizePublicCopy(state.publicCopy).section_language_label,
        meta: makeSectionMeta(sectionGroups),
        groups: sectionGroups,
      };
    });
  }

  function makeSectionMeta(groups) {
    var countryCount = (groups || []).length;
    var memberCount = (groups || []).reduce(function (sum, group) {
      return sum + (state.query ? getVisibleMemberCount(group) : (group.count || 0));
    }, 0);
    return {
      countryCount: countryCount,
      memberCount: memberCount,
    };
  }

  function matchesQuery(item, group) {
    var query = String(state.query || '').trim().toLowerCase();
    if (!query) return true;
    var extra = item && item.extra_fields && typeof item.extra_fields === 'object'
      ? Object.keys(item.extra_fields).map(function (key) { return item.extra_fields[key]; })
      : [];
    var haystack = [
      item && item.country_ko,
      item && item.country_en,
      item && item.membership_category,
      item && item.status_description,
      group && group.region,
      group && group.language,
    ].concat(extra).join(' ').toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function renderMeta(sections, groups) {
    var meta = document.getElementById('wosm-members-results-meta');
    if (!meta) return;

    var visibleMemberCount = (groups || []).reduce(function (sum, group) {
      return sum + getVisibleMemberCount(group);
    }, 0);
    var hiddenSupportCount = (groups || []).filter(function (group) {
      return group.children && group.children.length;
    }).length;

    if (state.query) {
      meta.textContent = applyCopyTemplate(normalizePublicCopy(state.publicCopy).search_template, {
        countryCount: GW.formatNumber(groups.length),
        memberCount: GW.formatNumber(visibleMemberCount),
        viewLabel: VIEW_LABELS[state.view],
        collapsibleCount: GW.formatNumber(hiddenSupportCount),
        childLabel: normalizePublicCopy(state.publicCopy).child_label,
      });
      return;
    }

    meta.textContent = applyCopyTemplate(normalizePublicCopy(state.publicCopy).overview_template, {
      countryCount: GW.formatNumber(state.registeredCount),
      memberCount: GW.formatNumber(state.items.length),
      viewLabel: VIEW_LABELS[state.view],
      collapsibleCount: GW.formatNumber(hiddenSupportCount),
      childLabel: normalizePublicCopy(state.publicCopy).child_label,
    });
  }

  function renderHead() {
    var head = document.getElementById('wosm-members-head');
    if (!head) return;
    head.innerHTML = '<tr>' + state.columns.map(function (column) {
      var role = getColumnRole(column);
      return '<th class="members-col members-col--' + role + '">' + formatColumnLabel(column) + '</th>';
    }).join('') + '</tr>';
  }

  function renderColgroup() {
    var colgroup = document.getElementById('wosm-members-colgroup');
    if (!colgroup) return;
    colgroup.innerHTML = state.columns.map(function (column) {
      var role = getColumnRole(column);
      return '<col class="members-col members-col--' + role + '" style="width:' + getColumnWidth(column) + ';">';
    }).join('');
  }

  function renderTable(sections) {
    var body = document.getElementById('wosm-members-body');
    if (!body) return;
    var groups = flattenSectionGroups(sections);
    if (!groups.length) {
      body.innerHTML = '<tr><td colspan="' + state.columns.length + '"><div class="members-empty">조건에 맞는 회원연맹이 없습니다.</div></td></tr>';
      return;
    }

    body.innerHTML = sections.map(function (section) {
      return renderSectionRows(section);
    }).join('');
  }

  function renderSectionRows(section) {
    var rows = [];
    if (state.view !== 'country') {
      var tagName = state.view === 'region' ? 'h2' : 'h3';
      var collapsed = !isSectionExpanded(section);
      var titleMarkup = state.view === 'region'
        ? '<' + tagName + ' class="members-section-heading"><button type="button" class="members-section-heading-btn" data-section-toggle="' + GW.escapeHtml(section.key) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' + GW.escapeHtml(section.label) + '</button></' + tagName + '>'
        : '<' + tagName + ' class="members-section-heading">' + GW.escapeHtml(section.label) + '</' + tagName + '>';
      var toggleMarkup = state.view === 'region'
        ? '<button type="button" class="members-section-toggle-btn" data-section-toggle="' + GW.escapeHtml(section.key) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-label="' + GW.escapeHtml(section.label) + ' 섹션 ' + (collapsed ? '펼치기' : '접기') + '"><strong class="members-section-toggle-icon">' + (collapsed ? '+' : '−') + '</strong></button>'
        : '';
      rows.push(
        '<tr class="members-section-row">' +
          '<td colspan="' + state.columns.length + '">' +
            '<div class="members-section-bar ' + (section.toneClass || '') + '">' +
              '<div class="members-section-title-wrap">' +
                '<em class="members-section-eyebrow">' + GW.escapeHtml(section.eyebrow || '그룹') + '</em>' +
                titleMarkup +
              '</div>' +
              '<div class="members-section-meta-wrap"><span>' + GW.escapeHtml(buildSectionMetaText(section.meta)) + '</span>' + toggleMarkup + '</div>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }

    if (state.view !== 'country' && !isSectionExpanded(section)) {
      return rows.join('');
    }

    section.groups.forEach(function (group) {
      rows.push(renderRepresentativeRow(group));
      if (isGroupExpanded(group)) {
        getVisibleChildren(group).forEach(function (item) {
          rows.push(renderChildRow(group, item));
        });
      }
    });

    return rows.join('');
  }

  function renderRepresentativeRow(group) {
    var toneClass = getRegionToneClass(group.region);
    var rowClass = isRepresentativeMembership(group.representative && group.representative.membership_category)
      ? ' members-row is-representative is-parent ' + toneClass
      : ' members-row is-parent';
    return '<tr class="' + rowClass.trim() + '">' + state.columns.map(function (column) {
      var role = getColumnRole(column);
      return '<td class="members-col members-col--' + role + '">' + renderRepresentativeCell(group, column) + '</td>';
    }).join('') + '</tr>';
  }

  function renderChildRow(group, item) {
    return '<tr class="members-row is-child">' + state.columns.map(function (column) {
      var role = getColumnRole(column);
      return '<td class="members-col members-col--' + role + '">' + renderChildCell(group, item, column) + '</td>';
    }).join('') + '</tr>';
  }

  function renderRepresentativeCell(group, column) {
    if (!column || column.key === 'country_names') return renderCountryHead(group);
    return renderValueMarkup(group.representative, column);
  }

  function renderChildCell(group, item, column) {
    if (!column) return '—';
    if (column.key === 'country_names') {
      return '<div class="member-country-subline"><span>' + GW.escapeHtml(normalizePublicCopy(state.publicCopy).child_label) + '</span><strong>' + GW.escapeHtml(group.country_ko || group.country_en || '국가명 미입력') + '</strong></div>';
    }
    return renderValueMarkup(item, column);
  }

  function renderCountryHead(group) {
    var representative = group.representative || {};
    var hasChildren = !!(group.children && group.children.length);
    var button = '';
    if (hasChildren) {
      button = '<button type="button" class="member-country-toggle" data-group-toggle="' + GW.escapeHtml(group.key) + '" aria-expanded="' + (isGroupExpanded(group) ? 'true' : 'false') + '">' +
        '<span class="member-country-toggle-icon">' + (isGroupExpanded(group) ? '−' : '+') + '</span>' +
        '<span>' + (isGroupExpanded(group) ? '접기' : normalizePublicCopy(state.publicCopy).child_label + ' 보기') + '</span>' +
        '<span class="member-country-toggle-count">' + GW.formatNumber(group.children.length) + '개</span>' +
      '</button>';
    }
    return '<div class="member-country-cell">' +
      renderNameBlock(representative) +
      button +
    '</div>';
  }

  function renderCards(sections) {
    var wrap = document.getElementById('wosm-members-cards');
    if (!wrap) return;
    var groups = flattenSectionGroups(sections);
    if (!groups.length) {
      wrap.innerHTML = '<div class="members-empty">조건에 맞는 회원연맹이 없습니다.</div>';
      return;
    }

    wrap.innerHTML = sections.map(function (section) {
      return renderCardSection(section);
    }).join('');
  }

  function renderCardSection(section) {
    var collapsed = state.view === 'region' ? !isSectionExpanded(section) : false;
    var tagName = state.view === 'region' ? 'h2' : 'h3';
    var titleMarkup = state.view === 'region'
      ? '<' + tagName + ' class="members-section-heading"><button type="button" class="members-section-heading-btn" data-section-toggle="' + GW.escapeHtml(section.key) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' + GW.escapeHtml(section.label) + '</button></' + tagName + '>'
      : '<' + tagName + ' class="members-section-heading">' + GW.escapeHtml(section.label) + '</' + tagName + '>';
    var toggleMarkup = state.view === 'region'
      ? '<button type="button" class="members-section-toggle-btn" data-section-toggle="' + GW.escapeHtml(section.key) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-label="' + GW.escapeHtml(section.label) + ' 섹션 ' + (collapsed ? '펼치기' : '접기') + '"><strong class="members-section-toggle-icon">' + (collapsed ? '+' : '−') + '</strong></button>'
      : '';
    return '<section class="members-card-section">' +
      (state.view !== 'country'
        ? '<div class="members-card-section-head ' + (section.toneClass || '') + '"><div class="members-card-section-title-wrap"><em class="members-section-eyebrow">' + GW.escapeHtml(section.eyebrow || '그룹') + '</em>' + titleMarkup + '</div><div class="members-section-meta-wrap"><span>' + GW.escapeHtml(buildSectionMetaText(section.meta)) + '</span>' + toggleMarkup + '</div></div>'
        : '') +
      ((state.view !== 'country' && collapsed) ? [] : section.groups).map(function (group) {
        return renderCountryCard(group);
      }).join('') +
    '</section>';
  }

  function renderCountryCard(group) {
    var cardClass = isRepresentativeMembership(group.representative && group.representative.membership_category)
      ? 'member-country-card is-representative ' + getRegionToneClass(group.region)
      : 'member-country-card';
    var visibleChildren = getVisibleChildren(group);
    return '<article class="' + cardClass + '">' +
      '<div class="member-country-head">' + renderCountryHead(group) + '</div>' +
      '<div class="member-country-meta-grid">' +
        state.columns.filter(function (column) { return column && column.key !== 'country_names'; }).map(function (column) {
          return '<div><span class="member-country-label">' + GW.escapeHtml(column.label || column.key) + '</span><strong>' + renderCardValue(group.representative, column) + '</strong></div>';
        }).join('') +
      '</div>' +
      (visibleChildren.length ? '<div class="member-country-children">' + visibleChildren.map(function (item) {
        return '<div class="member-country-child-card">' +
          '<span class="member-country-label">' + GW.escapeHtml(normalizePublicCopy(state.publicCopy).child_label) + '</span>' +
          '<div>' + renderCardValue(item, findColumn('membership_category')) + '</div>' +
          '<strong>' + renderCardValue(item, findColumn('status_description')) + '</strong>' +
        '</div>';
      }).join('') + '</div>' : '') +
    '</article>';
  }

  function renderCardValue(item, column) {
    return renderValueMarkup(item, column);
  }

  function renderValueMarkup(item, column) {
    var value = getPlainColumnValue(item, column) || '—';
    if (column && column.key === 'membership_category') {
      return renderMembershipBadge(value);
    }
    return GW.escapeHtml(value);
  }

  function getPlainColumnValue(item, column) {
    if (!item || !column) return '';
    if (column.key === 'country_names') return [item.country_ko, item.country_en].filter(Boolean).join(' / ');
    if (column.key === 'membership_category' || column.key === 'status_description') return item[column.key] || '';
    return item.extra_fields && typeof item.extra_fields === 'object' ? (item.extra_fields[column.key] || '') : '';
  }

  function getRegionValue(item) {
    if (!item) return '';
    if (item.extra_fields && typeof item.extra_fields === 'object') {
      if (item.extra_fields.column_1) return item.extra_fields.column_1;
      var regionKey = Object.keys(item.extra_fields).find(function (key) {
        return /region/i.test(key);
      });
      if (regionKey) return item.extra_fields[regionKey];
    }
    return '';
  }

  function getLanguageValue(item) {
    if (!item) return '';
    if (item.extra_fields && typeof item.extra_fields === 'object') {
      if (item.extra_fields.column_2) return item.extra_fields.column_2;
      var languageKey = Object.keys(item.extra_fields).find(function (key) {
        return /language/i.test(key);
      });
      if (languageKey) return item.extra_fields[languageKey];
    }
    return '';
  }

  function getSectionToneClass(view, key) {
    var normalized = String(key || '').trim().toLowerCase();
    if (view === 'region') {
      if (normalized === 'africa') return 'is-africa';
      if (normalized === 'arab') return 'is-arab';
      if (normalized === 'asia-pacific') return 'is-asia-pacific';
      if (normalized === 'european') return 'is-european';
      if (normalized === 'interamerican') return 'is-interamerican';
      return 'is-generic';
    }
    if (view === 'language') {
      if (normalized === 'english') return 'is-language-english';
      if (normalized === 'french') return 'is-language-french';
      return 'is-generic';
    }
    return '';
  }

  function getRegionToneClass(region) {
    return getSectionToneClass('region', region);
  }

  function getFirstFilledValue(items, getter) {
    for (var i = 0; i < items.length; i++) {
      var value = getter(items[i]);
      if (value) return value;
    }
    return '';
  }

  function renderNameBlock(item) {
    var ko = String(item && item.country_ko || '').trim();
    var en = String(item && item.country_en || '').trim();
    return '<div class="member-country-names">' +
      '<strong>' + GW.escapeHtml(ko || en || '국가명 미입력') + '</strong>' +
      '<span>' + GW.escapeHtml(en || '—') + '</span>' +
    '</div>';
  }

  function getColumnWidth(column) {
    var role = getColumnRole(column);
    if (role === 'country') return '24%';
    if (role === 'sort') return '9%';
    if (role === 'code') return '10%';
    if (role === 'organization') return '23%';
    if (role === 'region') return '12%';
    if (role === 'language') return '10%';
    if (role === 'membership') return '12%';
    if (role === 'status') return '16%';
    return '14%';
  }

  function getColumnRole(column) {
    var key = String(column && column.key || '').toLowerCase();
    var label = String(column && column.label || '').toLowerCase();
    if (key === 'country_names') return 'country';
    if (key.indexOf('sort') >= 0 || label.indexOf('정렬') >= 0 || label.indexOf('순번') >= 0) return 'sort';
    if (key.indexOf('nso') >= 0 || key.indexOf('nsa') >= 0 || label.indexOf('nso') >= 0 || label.indexOf('nsa') >= 0) return 'code';
    if (key.indexOf('organization') >= 0 || label.indexOf('연맹 명칭') >= 0 || label.indexOf('조직') >= 0) return 'organization';
    if (key.indexOf('region') >= 0 || label.indexOf('지역') >= 0) return 'region';
    if (key.indexOf('language') >= 0 || label.indexOf('언어') >= 0) return 'language';
    if (key.indexOf('category') >= 0 || label.indexOf('자격') >= 0) return 'membership';
    if (key.indexOf('status') >= 0 || label.indexOf('상태') >= 0) return 'status';
    return 'custom';
  }

  function renderMembershipBadge(value) {
    var text = String(value || '').trim() || '—';
    var representative = isRepresentativeMembership(text);
    var className = representative ? 'members-pill is-representative' : 'members-pill';
    return '<span class="' + className + '">' + GW.escapeHtml(text) + '</span>';
  }

  function isRepresentativeMembership(value) {
    var normalized = String(value || '').trim().toLowerCase();
    return normalized === 'nso' || normalized === 'nso federation';
  }

  function formatColumnLabel(column) {
    var label = String(column && column.label || column && column.key || '').trim();
    if (label === '공식정렬 순번') return '공식정렬<br>순번';
    return GW.escapeHtml(label);
  }

  function compareItemsBySort(a, b) {
    return getSortValue(a) - getSortValue(b);
  }

  function compareGroupsByRepresentativeSort(a, b) {
    return getSortValue(a && a.representative) - getSortValue(b && b.representative);
  }

  function getSortValue(item) {
    if (!item) return 9999;
    var raw = item.extra_fields && item.extra_fields.column_3 ? item.extra_fields.column_3 : item.sort_order;
    var parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 9999;
  }

  function getCountryKey(item) {
    return String(item && item.country_ko || '').trim() + '||' + String(item && item.country_en || '').trim();
  }

  function isGroupExpanded(group) {
    if (!group || !group.children || !group.children.length) return false;
    if (state.query) return group.matchedChildren && group.matchedChildren.length > 0;
    return !!state.expandedGroups[group.key];
  }

  function getVisibleChildren(group) {
    if (!group || !group.children || !group.children.length) return [];
    if (state.query) return group.matchedChildren || [];
    return isGroupExpanded(group) ? group.children : [];
  }

  function getVisibleMemberCount(group) {
    if (!group) return 0;
    var base = group.representative ? 1 : 0;
    return base + getVisibleChildren(group).length;
  }

  function buildSectionMetaText(meta) {
    return applyCopyTemplate(normalizePublicCopy(state.publicCopy).section_meta_template, {
      countryCount: GW.formatNumber(meta.countryCount || 0),
      memberCount: GW.formatNumber(meta.memberCount || 0),
      viewLabel: VIEW_LABELS[state.view],
      collapsibleCount: '0',
      childLabel: normalizePublicCopy(state.publicCopy).child_label,
    });
  }

  function isSectionExpanded(section) {
    if (!section || state.view !== 'region') return true;
    if (state.query) return true;
    return !!state.expandedSections[section.key];
  }

  function applyCopyTemplate(template, values) {
    var source = String(template || '').trim();
    var map = values || {};
    return source.replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : '';
    });
  }

  function flattenSectionGroups(sections) {
    return (sections || []).reduce(function (list, section) {
      return list.concat(section.groups || []);
    }, []);
  }

  function bindInteractionButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-group-toggle]'), function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-group-toggle');
        if (!key || state.query) return;
        state.expandedGroups[key] = !state.expandedGroups[key];
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-section-toggle]'), function (button) {
      button.addEventListener('click', function () {
        if (state.view !== 'region' || state.query) return;
        var key = button.getAttribute('data-section-toggle');
        if (!key) return;
        state.expandedSections[key] = !state.expandedSections[key];
        render();
      });
    });
  }

  function findColumn(key) {
    return (state.columns || []).find(function (column) {
      return column && column.key === key;
    }) || null;
  }

  function renderError() {
    var body = document.getElementById('wosm-members-body');
    var cards = document.getElementById('wosm-members-cards');
    var meta = document.getElementById('wosm-members-results-meta');
    var colCount = Math.max(1, state.columns.length || 1);
    if (body) body.innerHTML = '<tr><td colspan="' + colCount + '"><div class="members-empty">데이터를 불러오지 못했습니다.</div></td></tr>';
    if (cards) cards.innerHTML = '<div class="members-empty">데이터를 불러오지 못했습니다.</div>';
    if (meta) meta.textContent = '데이터를 불러오지 못했습니다.';
  }
}());
