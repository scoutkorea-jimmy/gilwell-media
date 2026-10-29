import { SITE_PATH_TITLE_FALLBACKS } from '../../functions/_shared/site-structure.mjs';
export function buildMarketingPayload(range, rows, postRows, utmCampaigns) {
  const postTitleMap = new Map((postRows || []).map((row) => [String(row.path || ''), String(row.title || '')]));
  const byViewer = new Map();
  const pathStats = new Map();
  const stageViewerSets = {
    awareness: new Set(),
    interest: new Set(),
    consideration: new Set(),
  };
  const sourceStageSets = new Map();
  const stageDestSets = new Map();
  const transitionSets = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const viewerKey = String(row.viewer_key || '').trim();
    const path = row._path;
    if (!viewerKey || !path) return;
    const ref = row._source;
    const stage = row._stage;

    const stat = pathStats.get(path) || {
      path,
      title: resolvePathTitle(path, postTitleMap),
      stage,
      unique_viewers: new Set(),
      pageviews: 0,
      share_visits: 0,
    };
    stat.unique_viewers.add(viewerKey);
    stat.pageviews += 1;
    if (ref.type === 'share') stat.share_visits += 1;
    pathStats.set(path, stat);

    const viewer = byViewer.get(viewerKey) || {
      key: viewerKey,
      source: ref,
      rows: [],
      stageSet: new Set(),
      stageRows: {
        awareness: [],
        interest: [],
        consideration: [],
      },
    };
    if (!byViewer.has(viewerKey)) byViewer.set(viewerKey, viewer);
    viewer.rows.push({ path, stage, ref });
    viewer.stageSet.add(stage);
    viewer.stageRows[stage].push(path);
  });

  byViewer.forEach((viewer) => {
    ['awareness', 'interest', 'consideration'].forEach((stage) => {
      if (viewer.stageSet.has(stage)) stageViewerSets[stage].add(viewer.key);
    });

    const highestStage = viewer.stageSet.has('consideration')
      ? 'consideration'
      : (viewer.stageSet.has('interest') ? 'interest' : 'awareness');

    const sourceKey = viewer.source.key;
    const sourceStageKey = sourceKey + '|' + highestStage;
    if (!sourceStageSets.has(sourceStageKey)) sourceStageSets.set(sourceStageKey, new Set());
    sourceStageSets.get(sourceStageKey).add(viewer.key);

    const destination = pickRepresentativeDestination(viewer.stageRows[highestStage]);
    if (destination) {
      const stageDestKey = highestStage + '|' + destination;
      if (!stageDestSets.has(stageDestKey)) stageDestSets.set(stageDestKey, new Set());
      stageDestSets.get(stageDestKey).add(viewer.key);
    }

    for (let i = 0; i < viewer.rows.length - 1; i += 1) {
      const current = viewer.rows[i];
      const next = viewer.rows[i + 1];
      if (!current || !next || current.path === next.path) continue;
      const transitionKey = current.path + '→' + next.path;
      if (!transitionSets.has(transitionKey)) transitionSets.set(transitionKey, new Set());
      transitionSets.get(transitionKey).add(viewer.key);
    }
  });

  const totalUniqueUsers = byViewer.size;
  const stageSummary = [
    buildStageSummaryItem('awareness', '입구 페이지', '홈·일정 등 입구 역할 페이지 도달', stageViewerSets.awareness.size, totalUniqueUsers),
    buildStageSummaryItem('interest', '탐색 페이지', '분류·자료 페이지 도달', stageViewerSets.interest.size, totalUniqueUsers),
    buildStageSummaryItem('consideration', '기사 읽기', '기사 상세 페이지 도달', stageViewerSets.consideration.size, totalUniqueUsers),
  ];

  const sourceItems = Array.from(sourceStageSets.keys()).reduce((acc, key) => {
    const sourceKey = key.split('|')[0];
    const count = sourceStageSets.get(key).size;
    acc[sourceKey] = (acc[sourceKey] || 0) + count;
    return acc;
  }, {});

  const sourceMeta = Array.from(byViewer.values()).reduce((acc, viewer) => {
    acc[viewer.source.key] = viewer.source;
    return acc;
  }, {});

  const sources = Object.keys(sourceItems)
    .map((key) => ({
      id: 'source:' + key,
      key,
      label: sourceMeta[key] ? sourceMeta[key].label : key,
      type: sourceMeta[key] ? sourceMeta[key].type : 'direct',
      value: sourceItems[key],
      color: sourceColor(key, sourceMeta[key] && sourceMeta[key].type),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const allowedSourceKeys = new Set(sources.map((item) => item.key));
  const otherSourceValue = Object.keys(sourceItems).filter(key => !allowedSourceKeys.has(key)).reduce((sum, key) => sum + sourceItems[key], 0);
  if (otherSourceValue) sources.push({ id: 'source:other', key: 'other', label: '기타 유입', type: 'other', value: otherSourceValue, color: '#666666' });
  const stages = stageSummary.map((item) => ({
    id: 'stage:' + item.key,
    key: item.key,
    label: item.label,
    value: Array.from(sourceStageSets.entries()).filter(([key]) => key.endsWith('|' + item.key)).reduce((sum, [, viewers]) => sum + viewers.size, 0),
    color: stageColor(item.key),
  }));

  const destinationCandidates = Array.from(stageDestSets.entries()).map(([key, viewerSet]) => {
    const parts = key.split('|');
    const stage = parts.shift();
    const path = parts.join('|');
    return {
      stage,
      path,
      value: viewerSet.size,
      title: resolvePathTitle(path, postTitleMap),
    };
  });

  const destinations = [];
  ['awareness', 'interest', 'consideration'].forEach((stage) => {
    destinationCandidates
      .filter((item) => item.stage === stage)
      .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title, 'ko'))
      .slice(0, 4)
      .forEach((item) => {
        destinations.push({
          id: 'dest:' + item.path,
          key: item.path,
          stage: stage,
          label: item.title,
          value: item.value,
          color: stageColor(stage),
        });
      });
  });
  const allowedDestKeys = new Set(destinations.map((item) => item.key));
  ['awareness', 'interest', 'consideration'].forEach(stage => {
    const value = destinationCandidates.filter(item => item.stage === stage && !allowedDestKeys.has(item.path)).reduce((sum, item) => sum + item.value, 0);
    if (value) destinations.push({ id: 'dest:other:' + stage, key: 'other:' + stage, stage, label: '기타 대표 페이지', value, color: stageColor(stage) });
  });

  const sourceStageLinks = Array.from(sourceStageSets.entries())
    .map(([key, viewerSet]) => {
      const parts = key.split('|');
      const sourceKey = parts[0];
      const stage = parts[1];
      return {
        source: allowedSourceKeys.has(sourceKey) ? 'source:' + sourceKey : 'source:other',
        target: 'stage:' + stage,
        value: viewerSet.size,
        color: sourceColor(sourceKey, sourceMeta[sourceKey] && sourceMeta[sourceKey].type),
        sourceKey,
      };
    })
    .sort((a, b) => b.value - a.value);

  const stageDestLinks = Array.from(stageDestSets.entries())
    .map(([key, viewerSet]) => {
      const parts = key.split('|');
      const stage = parts.shift();
      const path = parts.join('|');
      return {
        source: 'stage:' + stage,
        target: allowedDestKeys.has(path) ? 'dest:' + path : 'dest:other:' + stage,
        value: viewerSet.size,
        color: stageColor(stage),
        path,
      };
    })
    .sort((a, b) => b.value - a.value);

  const flowMap = new Map();
  sourceStageLinks.concat(stageDestLinks).forEach(link => {
    const key = link.source + '|' + link.target;
    const existing = flowMap.get(key);
    if (existing) existing.value += link.value;
    else flowMap.set(key, { ...link });
  });
  const flowLinks = [...flowMap.values()];

  const scatter = Array.from(pathStats.values())
    .map((item) => {
      const uniqueViewers = item.unique_viewers.size || 0;
      const pageviews = item.pageviews || 0;
      return {
        path: item.path,
        title: item.title,
        stage: item.stage,
        unique_users: uniqueViewers,
        pageviews,
        views_per_user: uniqueViewers ? Number((pageviews / uniqueViewers).toFixed(2)) : 0,
        share_ratio: pageviews ? Number((item.share_visits / pageviews).toFixed(2)) : 0,
      };
    })
    .filter((item) => item.unique_users > 0)
    .sort((a, b) => b.unique_users - a.unique_users || b.pageviews - a.pageviews)
    .slice(0, 40);

  const transitionList = Array.from(transitionSets.entries())
    .map(([key, viewerSet]) => {
      const parts = key.split('→');
      const from = parts[0];
      const to = parts[1];
      return {
        from_path: from,
        to_path: to,
        from_title: resolvePathTitle(from, postTitleMap),
        to_title: resolvePathTitle(to, postTitleMap),
        users: viewerSet.size,
      };
    })
    .sort((a, b) => b.users - a.users)
    .slice(0, 8);

  const notes = buildMarketingNotes(stageSummary, sources, destinations, transitionList, scatter);

  return {
    provider: 'site_visits',
    range: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      days: range.days,
    },
    summary: {
      unique_users: totalUniqueUsers,
      total_pageviews: rows.length,
      awareness_users: stageViewerSets.awareness.size,
      interest_users: stageViewerSets.interest.size,
      consideration_users: stageViewerSets.consideration.size,
    },
    funnel: stageSummary.map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      users: item.users,
      rate: item.rate,
      count: item.users,
      pct: item.rate,
    })),
    journey_flow: {
      sources,
      stages,
      destinations,
      links: flowLinks,
      definition: '기간 내 첫 유입 → 최고 도달 단계 → 가장 많이 조회한 해당 단계 페이지. 세션 전환율 아님. 상위 유입 8개·단계별 대표 페이지 4개 외에는 기타로 포함.',
    },
    utm_campaigns: utmCampaigns,
    page_opportunities: scatter,
    top_transitions: transitionList,
    notes,
    tracking_note: `${range.label} 기준 전체 공개 페이지 방문 데이터를 바탕으로 유입 채널, 방문 단계, 대표 도착 페이지를 재구성한 마케팅 대시보드입니다. 체류시간·스크롤은 아직 수집하지 않아 페이지 규모, 재읽기 강도, 공유 유입 비중 중심으로 해석합니다.`,
  };
}

function buildStageSummaryItem(key, label, description, users, total) {
  const rate = total ? Number(((users / total) * 100).toFixed(1)) : 0;
  return { key, label, description, users, rate };
}

function pickRepresentativeDestination(paths) {
  if (!Array.isArray(paths) || !paths.length) return '';
  const counts = new Map();
  paths.forEach((path) => {
    const key = normalizePath(path);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map((item) => item[0])[0] || '';
}

function normalizePath(path) {
  const value = String(path || '').trim();
  if (!value || value[0] !== '/') return '';
  return value.replace(/[?#].*$/, '');
}

function resolvePathTitle(path, postTitleMap) {
  const value = normalizePath(path);
  if (!value) return '알 수 없는 페이지';
  if (postTitleMap && postTitleMap.has(value)) return postTitleMap.get(value);
  return SITE_PATH_TITLE_FALLBACKS[value] || value;
}

function buildMarketingNotes(stageSummary, sources, destinations, transitions, scatter) {
  const notes = [];
  const strongestStage = stageSummary.slice().sort((a, b) => b.users - a.users)[0];
  const topSource = (sources || [])[0];
  const topDestination = (destinations || [])[0];
  const topTransition = (transitions || [])[0];
  const bestPage = (scatter || []).slice().sort((a, b) => b.views_per_user - a.views_per_user || b.unique_users - a.unique_users)[0];

  if (strongestStage) {
    notes.push({
      title: '가장 큰 도달 단계',
      value: strongestStage.label,
      meta: `고유 사용자 ${formatNumber(strongestStage.users)}명 · 전체의 ${strongestStage.rate}%`,
    });
  }
  if (topSource) {
    notes.push({
      title: '가장 큰 유입 채널',
      value: topSource.label,
      meta: `고유 사용자 ${formatNumber(topSource.value)}명`,
    });
  }
  if (topDestination) {
    notes.push({
      title: '대표 도착 페이지',
      value: topDestination.label,
      meta: `${topDestination.stage} 단계 · 고유 사용자 ${formatNumber(topDestination.value)}명`,
    });
  }
  if (topTransition) {
    notes.push({
      title: '가장 흔한 이동 경로',
      value: topTransition.from_title + ' → ' + topTransition.to_title,
      meta: `이동 사용자 ${formatNumber(topTransition.users)}명`,
    });
  }
  if (bestPage) {
    notes.push({
      title: '재읽기 강도 높은 페이지',
      value: bestPage.title,
      meta: `1인당 조회 ${bestPage.views_per_user}회 · 공유 유입 ${Math.round(bestPage.share_ratio * 100)}%`,
    });
  }
  return notes;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function rangeStartEnd(range) {
  return {
    start: `${range.startDate} 00:00:00`,
    endExclusive: `${shiftKstDate(range.endDate, 1)} 00:00:00`,
  };
}

function shiftKstDate(dateStr, offsetDays) {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return getKstDateString(date);
}

function getKstDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sourceColor(key, type) {
  if (key === 'direct') return '#4c6ef5';
  if (type === 'share') return '#12b886';
  if (type === 'search') return '#ff922b';
  if (type === 'social') return '#845ef7';
  if (type === 'messenger') return '#f59f00';
  if (type === 'internal') return '#6c757d';
  return '#7c4dff';
}

function stageColor(stage) {
  if (stage === 'awareness') return '#ff7a18';
  if (stage === 'interest') return '#2f9e44';
  return '#e03131';
}
