/**
 * Gilwell Media · Admin Marketing Module
 */
(function () {
  'use strict';

  var AdminShared = window.GWAdminShared = window.GWAdminShared || {};
  var setText = AdminShared.setText;
  var setMetricText = AdminShared.setMetricText;
  var renderAnalyticsList = AdminShared.renderAnalyticsList;
  var formatMetricCompact = AdminShared.formatMetricCompact;
  var formatMetricExact = AdminShared.formatMetricExact;
  var _marketingPayload = null;
  var _marketingFullscreenZoom = 1;

  window.refreshMarketingPage = function () {
    loadMarketingPage(true);
  };

  window.setMarketingRangePreset = function (days) {
    var endEl = document.getElementById('marketing-end-date');
    var startEl = document.getElementById('marketing-start-date');
    if (!endEl || !startEl) return;
    var end = GW.getKstDateInputValue();
    var base = new Date(end + 'T00:00:00+09:00');
    base.setUTCDate(base.getUTCDate() - (Number(days || 30) - 1));
    var start = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(base);
    startEl.value = start;
    endEl.value = end;
    loadMarketingPage(true);
  };

  function loadMarketingPage(force) {
    if (_marketingPayload && !force) {
      renderMarketingPage(_marketingPayload);
      return;
    }
    setText('marketing-tracking-note', '마케팅 데이터를 불러오는 중…');
    var endEl = document.getElementById('marketing-end-date');
    var startEl = document.getElementById('marketing-start-date');
    if (endEl && !endEl.value) endEl.value = GW.getKstDateInputValue();
    if (startEl && !startEl.value) {
      window.setMarketingRangePreset(30);
      return;
    }
    var start = startEl ? startEl.value : GW.getKstDateInputValue();
    var end = endEl ? endEl.value : GW.getKstDateInputValue();
    GW.apiFetch('/api/admin/marketing?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end))
      .then(function (data) {
        _marketingPayload = data || null;
        renderMarketingPage(data || null);
      })
      .catch(function (err) {
        _marketingPayload = null;
        renderMarketingPage({ error_message: (err && err.message) || '마케팅 데이터를 불러오지 못했습니다.' });
      });
  }

  function renderMarketingPage(data) {
    var payload = data || {};
    var summary = payload.summary || {};
    setMetricText('marketing-unique-users', summary.unique_users);
    setMetricText('marketing-total-pageviews', summary.total_pageviews);
    setMetricText('marketing-awareness-users', summary.awareness_users);
    setMetricText('marketing-interest-users', summary.interest_users);
    setMetricText('marketing-consideration-users', summary.consideration_users);
    setText('marketing-tracking-note', payload.tracking_note || payload.error_message || '마케팅 데이터를 불러오는 중입니다.');
    setText('marketing-flow-meta', payload.range && payload.range.label ? (payload.range.label + ' · 유입 채널 → 단계 → 대표 도착 페이지') : '유입 채널 → 단계 → 대표 도착 페이지');
    renderMarketingFunnel(payload.funnel || []);
    renderMarketingFlow(payload.journey_flow || null);
    renderMarketingNotes(payload.notes || []);
    renderMarketingTransitions(payload.top_transitions || []);
    renderMarketingScatter(payload.page_opportunities || []);
  }

  function renderMarketingFunnel(items) {
    var el = document.getElementById('marketing-funnel');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="list-empty">요약 데이터가 없습니다.</div>';
      return;
    }
    var max = items.reduce(function (acc, item) {
      return Math.max(acc, Number(item.users || 0));
    }, 1);
    el.innerHTML = items.map(function (item) {
      var percent = Math.max(8, Math.round((Number(item.users || 0) / max) * 100));
      return '<article class="marketing-funnel-item">' +
        '<div class="marketing-funnel-head">' +
          '<strong>' + GW.escapeHtml(item.label || item.key || '단계') + '</strong>' +
          '<span>' + formatMetricExact(item.users || 0) + ' · ' + GW.escapeHtml(String(item.rate || 0)) + '%</span>' +
        '</div>' +
        '<div class="marketing-funnel-track"><span class="marketing-funnel-fill marketing-stage-' + GW.escapeHtml(item.key || 'awareness') + '" style="width:' + percent + '%;"></span></div>' +
        '<p>' + GW.escapeHtml(item.description || '') + '</p>' +
      '</article>';
    }).join('');
  }

  function renderMarketingNotes(items) {
    renderAnalyticsList('marketing-notes', items, function (item) {
      return {
        title: item.title || '운영 메모',
        meta: [item.value || '', item.meta || ''].filter(Boolean).join(' · ')
      };
    }, '아직 운영 메모가 없습니다');
  }

  function renderMarketingTransitions(items) {
    renderAnalyticsList('marketing-transitions', items, function (item) {
      return {
        title: (item.from_title || '시작') + ' → ' + (item.to_title || '도착'),
        meta: '이동 사용자 ' + formatMetricExact(item.users || 0)
      };
    }, '아직 대표 이동 경로가 없습니다');
  }

  function renderMarketingFlow(flow) {
    var el = document.getElementById('marketing-flow');
    if (!el) return;
    if (!flow || !Array.isArray(flow.links) || !flow.links.length) {
      el.innerHTML = '<div class="list-empty">아직 흐름 데이터가 없습니다.</div>';
      return;
    }
    var sources = Array.isArray(flow.sources) ? flow.sources : [];
    var stages = Array.isArray(flow.stages) ? flow.stages : [];
    var destinations = Array.isArray(flow.destinations) ? flow.destinations : [];
    var links = flow.links.slice();
    var columns = [sources, stages, destinations];
    var nodeMap = new Map();
    var maxDestinationChars = destinations.reduce(function (acc, item) {
      return Math.max(acc, String((item && item.label) || '').length);
    }, 0);
    var padLeft = 40;
    var padRight = 40;
    var padTop = 36;
    var padBottom = 40;
    var nodeW = 18;
    var rightLabelRunway = Math.max(380, Math.min(860, maxDestinationChars * 12));
    var leftColumnX = padLeft + 44;
    var middleColumnX = leftColumnX + 520;
    var rightColumnX = middleColumnX + rightLabelRunway;
    var colX = [leftColumnX, middleColumnX, rightColumnX];
    var W = rightColumnX + nodeW + padRight;
    var baseH = 460;
    var columnInfo = columns.map(function (items, idx) {
      var totals = items.map(function (item) {
        var incoming = links.filter(function (link) { return link.target === item.id; }).reduce(function (sum, link) { return sum + Number(link.value || 0); }, 0);
        var outgoing = links.filter(function (link) { return link.source === item.id; }).reduce(function (sum, link) { return sum + Number(link.value || 0); }, 0);
        var total = idx === 0 ? outgoing : (idx === 2 ? incoming : Math.max(incoming, outgoing, Number(item.value || 0)));
        return Math.max(total, 1);
      });
      var totalValue = totals.reduce(function (sum, value) { return sum + value; }, 0) || 1;
      return {
        items: items,
        totals: totals,
        totalValue: totalValue
      };
    });
    var maxColumnValue = columnInfo.reduce(function (acc, col) {
      return Math.max(acc, col.totalValue);
    }, 1);
    var gap = 14;
    var availableH = baseH - padTop - padBottom;
    var scale = Math.max(0.25, (availableH - gap * 5) / maxColumnValue);
    var maxY = padTop;

    columnInfo.forEach(function (column, columnIndex) {
      var y = padTop;
      column.items.forEach(function (item, itemIndex) {
        var h = Math.max(26, Math.round(column.totals[itemIndex] * scale));
        var node = {
          id: item.id,
          x: colX[columnIndex],
          y: y,
          w: nodeW,
          h: h,
          value: column.totals[itemIndex],
          label: item.label || item.key || '',
          color: item.color || '#7c4dff',
          incomingOffset: 0,
          outgoingOffset: 0,
          stage: item.stage || item.key || ''
        };
        nodeMap.set(item.id, node);
        maxY = Math.max(maxY, y + h);
        y += h + gap;
      });
    });
    var H = Math.max(baseH, maxY + padBottom);

    var linkParts = links.map(function (link) {
      var sourceNode = nodeMap.get(link.source);
      var targetNode = nodeMap.get(link.target);
      if (!sourceNode || !targetNode) return '';
      var thickness = Math.max(4, Number(link.value || 0) * scale);
      var sy = sourceNode.y + sourceNode.outgoingOffset + (thickness / 2);
      var ty = targetNode.y + targetNode.incomingOffset + (thickness / 2);
      sourceNode.outgoingOffset += thickness;
      targetNode.incomingOffset += thickness;
      var sx = sourceNode.x + sourceNode.w;
      var tx = targetNode.x;
      var c1 = sx + 140;
      var c2 = tx - 140;
      var tipText = (sourceNode.label || '') + ' → ' + (targetNode.label || '') + ' · ' + formatMetricExact(link.value || 0);
      if (String(link.target || '').indexOf('dest:') === 0) tipText += ' · ' + String(link.target || '').replace(/^dest:/, '');
      return '<path d="M ' + sx + ' ' + sy + ' C ' + c1 + ' ' + sy + ', ' + c2 + ' ' + ty + ', ' + tx + ' ' + ty + '"' +
        ' stroke="' + GW.escapeHtml(link.color || sourceNode.color) + '"' +
        ' stroke-opacity="0.22" stroke-width="' + thickness.toFixed(2) + '" fill="none" stroke-linecap="round" class="marketing-flow-link" data-tip="' + GW.escapeHtml(tipText) + '">' +
        '<title>' + GW.escapeHtml((sourceNode.label || '') + ' → ' + (targetNode.label || '') + ' · ' + formatMetricExact(link.value || 0)) + '</title>' +
      '</path>';
    }).join('');

    var nodeParts = Array.from(nodeMap.values()).map(function (node, index) {
      var labelX = node.x + node.w + 12;
      var labelAnchor = 'start';
      if (node.x === colX[1]) {
        labelX = node.x + node.w + 12;
        labelAnchor = 'start';
      } else if (node.x === colX[2]) {
        labelX = node.x - 12;
        labelAnchor = 'end';
      }
      var valueText = formatMetricCompact(node.value || 0);
      var displayLabel = trimMarketingTitle(node.label, node.x === colX[2] ? 42 : 22);
      var tip = node.label + ' · ' + formatMetricExact(node.value || 0);
      if (String(node.id || '').indexOf('dest:') === 0) tip += ' · ' + String(node.id || '').replace(/^dest:/, '');
      return '<g class="marketing-flow-node" data-tip="' + GW.escapeHtml(tip) + '">' +
        '<rect x="' + node.x + '" y="' + node.y + '" width="' + node.w + '" height="' + node.h + '" rx="7" fill="' + GW.escapeHtml(node.color) + '"></rect>' +
        '<text x="' + labelX + '" y="' + (node.y + 18) + '" text-anchor="' + labelAnchor + '" class="marketing-flow-label">' + GW.escapeHtml(displayLabel) + '</text>' +
        '<text x="' + labelX + '" y="' + (node.y + 34) + '" text-anchor="' + labelAnchor + '" class="marketing-flow-value">' + GW.escapeHtml(valueText) + '</text>' +
      '</g>';
    }).join('');

    el.innerHTML =
      '<div class="marketing-flow-shell">' +
        '<div class="marketing-hover-tip" aria-hidden="true"></div>' +
        '<svg class="marketing-flow-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="고객 여정 흐름">' +
          linkParts +
          nodeParts +
        '</svg>' +
      '</div>';
    bindMarketingHoverTips(el);
  }

  function renderMarketingScatter(items) {
    var el = document.getElementById('marketing-scatter');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="list-empty">페이지 기회 맵 데이터가 없습니다.</div>';
      return;
    }
    var W = 1080;
    var H = 420;
    var margin = { top: 20, right: 30, bottom: 52, left: 64 };
    var innerW = W - margin.left - margin.right;
    var innerH = H - margin.top - margin.bottom;
    var maxUsers = items.reduce(function (acc, item) { return Math.max(acc, Number(item.unique_users || 0)); }, 1);
    var minUsers = items.reduce(function (acc, item) {
      var value = Number(item.unique_users || 0);
      return value > 0 ? Math.min(acc, value) : acc;
    }, maxUsers || 1);
    var maxDepth = items.reduce(function (acc, item) { return Math.max(acc, Number(item.views_per_user || 0)); }, 1);
    var minDepth = items.reduce(function (acc, item) { return Math.min(acc, Number(item.views_per_user || 0)); }, maxDepth || 0);
    var maxPageviews = items.reduce(function (acc, item) { return Math.max(acc, Number(item.pageviews || 0)); }, 1);

    function xScale(value) {
      var safeMin = Math.max(1, minUsers || 1);
      var safeMax = Math.max(safeMin + 1, maxUsers || 1);
      var numerator = Math.log(Math.max(1, value)) - Math.log(safeMin);
      var denominator = Math.log(safeMax) - Math.log(safeMin) || 1;
      return margin.left + (numerator / denominator) * innerW;
    }

    function yScale(value) {
      var safeMin = Math.min(minDepth, 0);
      var safeMax = Math.max(safeMin + 0.5, maxDepth || 1);
      var ratio = (Number(value || 0) - safeMin) / (safeMax - safeMin || 1);
      return margin.top + innerH - (ratio * innerH);
    }

    function rScale(value) {
      return 7 + Math.sqrt(Number(value || 0) / maxPageviews) * 26;
    }

    var points = items.map(function (item, index) {
      var cx = xScale(item.unique_users || 1);
      var cy = yScale(item.views_per_user || 0);
      var radius = rScale(item.pageviews || 0);
      var color = marketingStageColor(item.stage);
      var label = index < 8 ? '<text x="' + (cx + radius + 6) + '" y="' + (cy + 4) + '" class="marketing-scatter-label">' + GW.escapeHtml(trimMarketingTitle(item.title, 16)) + '</text>' : '';
      var tip = item.title + ' · 경로 ' + item.path + ' · 사용자 ' + formatMetricExact(item.unique_users) + ' · 페이지뷰 ' + formatMetricExact(item.pageviews) + ' · 1인당 조회 ' + item.views_per_user + '회 · 공유 유입 ' + Math.round((item.share_ratio || 0) * 100) + '%';
      var href = String(item.path || '').indexOf('/post/') === 0 ? item.path : '';
      return '<g class="marketing-scatter-point' + (href ? ' is-clickable' : '') + '" data-tip="' + GW.escapeHtml(tip) + '"' + (href ? ' data-href="' + GW.escapeHtml(href) + '"' : '') + '>' +
        '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + radius.toFixed(2) + '" fill="' + color + '" fill-opacity="0.72" stroke="' + color + '" stroke-width="2">' +
          '<title>' + GW.escapeHtml(item.title + ' · 사용자 ' + formatMetricExact(item.unique_users) + ' · 페이지뷰 ' + formatMetricExact(item.pageviews) + ' · 1인당 조회 ' + item.views_per_user + '회 · 공유 유입 ' + Math.round((item.share_ratio || 0) * 100) + '%') + '</title>' +
        '</circle>' +
        label +
      '</g>';
    }).join('');

    var axis = [
      '<line x1="' + margin.left + '" y1="' + (margin.top + innerH) + '" x2="' + (margin.left + innerW) + '" y2="' + (margin.top + innerH) + '" class="marketing-axis"></line>',
      '<line x1="' + margin.left + '" y1="' + margin.top + '" x2="' + margin.left + '" y2="' + (margin.top + innerH) + '" class="marketing-axis"></line>',
      '<text x="' + (margin.left + innerW / 2) + '" y="' + (H - 12) + '" class="marketing-axis-title" text-anchor="middle">고유 사용자 수 (로그)</text>',
      '<text x="18" y="' + (margin.top + innerH / 2) + '" class="marketing-axis-title" transform="rotate(-90 18 ' + (margin.top + innerH / 2) + ')" text-anchor="middle">1인당 조회 수</text>'
    ].join('');

    var legend = [
      { key: 'awareness', label: 'Awareness' },
      { key: 'interest', label: 'Interest' },
      { key: 'consideration', label: 'Consideration' }
    ].map(function (item) {
      return '<span><i style="background:' + marketingStageColor(item.key) + ';"></i>' + GW.escapeHtml(item.label) + '</span>';
    }).join('');

    el.innerHTML =
      '<div class="marketing-scatter-legend">' + legend + '</div>' +
      '<div class="marketing-scatter-shell">' +
        '<div class="marketing-hover-tip" aria-hidden="true"></div>' +
        '<svg class="marketing-scatter-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="페이지 기회 맵">' +
          axis +
          points +
        '</svg>' +
      '</div>';
    bindMarketingHoverTips(el);
  }

  window.openMarketingFullscreen = function (kind) {
    var modal = document.getElementById('marketing-fullscreen-modal');
    var body = document.getElementById('marketing-fullscreen-body');
    var title = document.getElementById('marketing-fullscreen-title');
    var meta = document.getElementById('marketing-fullscreen-meta');
    if (!modal || !body || !title || !meta) return;
    var sourceId = kind === 'scatter' ? 'marketing-scatter' : 'marketing-flow';
    var sourceEl = document.getElementById(sourceId);
    if (!sourceEl) return;
    _marketingFullscreenZoom = 1;
    body.innerHTML = '<div id="marketing-fullscreen-zoom-stage" class="marketing-fullscreen-zoom-stage">' + sourceEl.innerHTML + '</div>';
    if (kind === 'scatter') {
      title.textContent = '페이지 기회 맵';
      meta.textContent = '고유 사용자 · 재읽기 강도 · 공유 비중을 크게 확인합니다.';
    } else {
      title.textContent = '고객 여정 흐름';
      meta.textContent = (document.getElementById('marketing-flow-meta') || {}).textContent || '유입 채널 → 단계 → 대표 도착 페이지';
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('marketing-fullscreen-open');
    applyMarketingFullscreenZoom();
    bindMarketingHoverTips(body);
  };

  window.closeMarketingFullscreen = function () {
    var modal = document.getElementById('marketing-fullscreen-modal');
    var body = document.getElementById('marketing-fullscreen-body');
    if (!modal || !body) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
    document.body.classList.remove('marketing-fullscreen-open');
    _marketingFullscreenZoom = 1;
  };

  window.adjustMarketingFullscreenZoom = function (delta) {
    _marketingFullscreenZoom = Math.max(0.5, Math.min(2.2, Number((_marketingFullscreenZoom + Number(delta || 0)).toFixed(2))));
    applyMarketingFullscreenZoom();
  };

  window.resetMarketingFullscreenZoom = function () {
    _marketingFullscreenZoom = 1;
    applyMarketingFullscreenZoom();
  };

  function applyMarketingFullscreenZoom() {
    var stage = document.getElementById('marketing-fullscreen-zoom-stage');
    if (!stage) return;
    stage.style.setProperty('--marketing-fullscreen-zoom', String(_marketingFullscreenZoom));
    stage.style.zoom = String(_marketingFullscreenZoom);
  }

  function bindMarketingHoverTips(root) {
    if (!root || root.dataset.hoverTipsBound === '1') return;
    root.dataset.hoverTipsBound = '1';
    var shell = root.querySelector('.marketing-flow-shell, .marketing-scatter-shell');
    var tooltip = root.querySelector('.marketing-hover-tip');
    if (!shell || !tooltip) return;
    shell.addEventListener('mousemove', function (event) {
      var target = event.target.closest('[data-tip]');
      if (!target || !shell.contains(target)) {
        tooltip.classList.remove('open');
        return;
      }
      tooltip.textContent = target.getAttribute('data-tip') || '';
      tooltip.classList.add('open');
      var bounds = shell.getBoundingClientRect();
      var x = event.clientX - bounds.left + 16;
      var y = event.clientY - bounds.top + 16;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    });
    shell.addEventListener('mouseleave', function () {
      tooltip.classList.remove('open');
    });
    shell.addEventListener('click', function (event) {
      var target = event.target.closest('[data-href]');
      if (!target || !shell.contains(target)) return;
      var href = target.getAttribute('data-href') || '';
      if (!href) return;
      window.open(href, '_blank', 'noopener,noreferrer');
    });
  }

  function marketingStageColor(stage) {
    if (stage === 'awareness') return '#ff8c42';
    if (stage === 'interest') return '#2f9e44';
    return '#e64980';
  }

  function trimMarketingTitle(value, limit) {
    var text = String(value || '').trim();
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(1, limit - 1)) + '…';
  }


  window.loadMarketingPage = loadMarketingPage;
})();
