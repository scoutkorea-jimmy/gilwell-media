import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';
import { logApiError } from '../../_shared/ops-log.js';
import { SITE_PATH_TITLE_FALLBACKS } from '../../_shared/site-structure.mjs';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const range = resolveAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));
  const chosen = rangeStartEnd(range);

  try {
    const visitsRows = await env.DB.prepare(
      `SELECT viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, visited_at
         FROM site_visits
        WHERE datetime(visited_at, '+9 hours') >= datetime(?)
          AND datetime(visited_at, '+9 hours') < datetime(?)
          AND path NOT LIKE '/api/%'
          AND path != '/admin.html'
          AND path != '/admin'
        ORDER BY viewer_key ASC, datetime(visited_at, '+9 hours') ASC, id ASC`
    ).bind(chosen.start, chosen.endExclusive).all();

    const topPostRows = await env.DB.prepare(
      `SELECT '/post/' || id AS path, title
         FROM posts
        WHERE published = 1`
    ).all();

    const payload = buildMarketingPayload(range, visitsRows.results || [], topPostRows.results || []);
    return json(payload);
  } catch (err) {
    console.error('GET /api/admin/marketing error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

function buildMarketingPayload(range, rows, postRows) {
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
    const path = normalizePath(row.path);
    if (!viewerKey || !path) return;
    const ref = classifyReferrer(row.referrer_host, row.referrer_url, row.utm_source, row.utm_medium, row.utm_campaign);
    const stage = classifyJourneyStage(path);

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
    buildStageSummaryItem('awareness', 'Awareness', '첫 노출과 입구 역할 페이지', stageViewerSets.awareness.size, totalUniqueUsers),
    buildStageSummaryItem('interest', 'Interest', '카테고리 탐색과 관심 축적 단계', stageViewerSets.interest.size, totalUniqueUsers),
    buildStageSummaryItem('consideration', 'Consideration', '기사 상세 읽기 단계', stageViewerSets.consideration.size, totalUniqueUsers),
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
  const stages = stageSummary.map((item) => ({
    id: 'stage:' + item.key,
    key: item.key,
    label: item.label,
    value: item.users,
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

  const sourceStageLinks = Array.from(sourceStageSets.entries())
    .map(([key, viewerSet]) => {
      const parts = key.split('|');
      const sourceKey = parts[0];
      const stage = parts[1];
      return {
        source: 'source:' + sourceKey,
        target: 'stage:' + stage,
        value: viewerSet.size,
        color: sourceColor(sourceKey, sourceMeta[sourceKey] && sourceMeta[sourceKey].type),
        sourceKey,
      };
    })
    .filter((item) => allowedSourceKeys.has(item.sourceKey))
    .sort((a, b) => b.value - a.value);

  const stageDestLinks = Array.from(stageDestSets.entries())
    .map(([key, viewerSet]) => {
      const parts = key.split('|');
      const stage = parts.shift();
      const path = parts.join('|');
      return {
        source: 'stage:' + stage,
        target: 'dest:' + path,
        value: viewerSet.size,
        color: stageColor(stage),
        path,
      };
    })
    .filter((item) => allowedDestKeys.has(item.path))
    .sort((a, b) => b.value - a.value);

  const flowLinks = sourceStageLinks.concat(stageDestLinks);

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
  const utmCampaigns = buildUtmCampaigns(rows);

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
    },
    utm_campaigns: utmCampaigns,
    page_opportunities: scatter,
    top_transitions: transitionList,
    notes,
    tracking_note: `${range.label} 기준 전체 공개 페이지 방문 데이터를 바탕으로 유입 채널, 방문 단계, 대표 도착 페이지를 재구성한 마케팅 대시보드입니다. 체류시간·스크롤은 아직 수집하지 않아 페이지 규모, 재읽기 강도, 공유 유입 비중 중심으로 해석합니다.`,
  };
}

function buildUtmCampaigns(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const campaign = String(row && row.utm_campaign || '').trim();
    const source = String(row && row.utm_source || '').trim();
    const medium = String(row && row.utm_medium || '').trim();
    if (!campaign && !source && !medium) return;
    const key = [campaign || '(none)', source || '(none)', medium || '(none)'].join('|');
    const current = map.get(key) || {
      campaign: campaign || '(none)',
      source: source || '(none)',
      medium: medium || '(none)',
      visits: 0,
    };
    current.visits += 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .sort((a, b) => b.visits - a.visits || a.campaign.localeCompare(b.campaign, 'ko'))
    .slice(0, 12);
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

function classifyJourneyStage(path) {
  const value = normalizePath(path);
  if (!value) return 'awareness';
  if (value.indexOf('/post/') === 0) return 'consideration';
  if (
    value === '/' ||
    value === '/index.html' ||
    value === '/calendar' ||
    value === '/calendar.html' ||
    value === '/contributors' ||
    value === '/contributors.html' ||
    value === '/wosm-members' ||
    value === '/wosm-members.html'
  ) return 'awareness';
  if (value === '/dreampath' || value === '/dreampath.html') return 'interest';
  return 'interest';
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

function classifyReferrer(referrerHost, referrerUrl, utmSource, utmMedium, utmCampaign) {
  const host = String(referrerHost || '').trim().toLowerCase();
  const source = String(utmSource || '').trim().toLowerCase();
  const medium = String(utmMedium || '').trim().toLowerCase();
  const campaign = String(utmCampaign || '').trim().toLowerCase();
  if (source) {
    if (source === 'kakaotalk') return sourceInfo('utm-kakaotalk', '카카오톡 공유', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    if (source === 'facebook') return sourceInfo('utm-facebook', '페이스북 공유', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    if (source === 'copy') return sourceInfo('utm-copy', '직접 공유 URL', medium === 'social-share' ? 'share' : 'campaign', campaign || medium || 'utm');
    return sourceInfo('utm-' + source, 'UTM · ' + source, 'campaign', campaign || medium || source);
  }
  if (!host || host === 'direct') return sourceInfo('direct', '직접 방문', 'direct', '리퍼러 없음 또는 앱 브라우저 미제공');
  if (host === 'internal') return sourceInfo('internal', '내부 이동', 'internal', '');
  const known = matchKnownReferrer(host, referrerUrl);
  if (known) return known;
  return sourceInfo('site:' + simplifyDomain(host), simplifyDomain(host), 'site', host);
}

function matchKnownReferrer(host, referrerUrl) {
  const pathname = safePathname(referrerUrl);
  const searchPath = pathname.indexOf('/search') >= 0 || pathname.indexOf('/m/search') >= 0;
  if (host.indexOf('story.kakao.com') >= 0) return sourceInfo('kakao-story', '카카오스토리', 'social', host);
  if (host.indexOf('kakao.com') >= 0 || host.indexOf('kakao') >= 0) return sourceInfo('kakao', '카카오', 'messenger', host);
  if (host.indexOf('search.naver.com') >= 0 || host.indexOf('naver.com') >= 0) return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'naver-search' : 'naver', searchPath || host.indexOf('search.') >= 0 ? '네이버 검색' : '네이버', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('google.') >= 0) return sourceInfo(pathname.indexOf('/search') >= 0 ? 'google-search' : 'google', pathname.indexOf('/search') >= 0 ? '구글 검색' : '구글', pathname.indexOf('/search') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('search.daum.net') >= 0 || host.indexOf('daum.net') >= 0) return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'daum-search' : 'daum', searchPath || host.indexOf('search.') >= 0 ? '다음 검색' : '다음', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', host);
  if (host.indexOf('bing.com') >= 0) return sourceInfo('bing', 'Bing', 'search', host);
  if (host.indexOf('instagram.com') >= 0) return sourceInfo('instagram', '인스타그램', 'social', host);
  if (host.indexOf('facebook.com') >= 0) return sourceInfo('facebook', '페이스북', 'social', host);
  if (host === 't.co' || host.indexOf('twitter.com') >= 0 || host.indexOf('x.com') >= 0) return sourceInfo('x', 'X / Twitter', 'social', host);
  if (host.indexOf('threads.net') >= 0) return sourceInfo('threads', 'Threads', 'social', host);
  if (host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0) return sourceInfo('youtube', '유튜브', 'video', host);
  if (host.indexOf('linkedin.com') >= 0 || host.indexOf('lnkd.in') >= 0) return sourceInfo('linkedin', '링크드인', 'social', host);
  if (host.indexOf('line.me') >= 0) return sourceInfo('line', 'LINE', 'messenger', host);
  if (host.indexOf('whatsapp.com') >= 0) return sourceInfo('whatsapp', 'WhatsApp', 'messenger', host);
  if (host.indexOf('telegram') >= 0 || host === 't.me') return sourceInfo('telegram', 'Telegram', 'messenger', host);
  if (host.indexOf('discord') >= 0) return sourceInfo('discord', 'Discord', 'community', host);
  if (host.indexOf('reddit.com') >= 0) return sourceInfo('reddit', 'Reddit', 'community', host);
  if (host.indexOf('band.us') >= 0) return sourceInfo('band', '네이버 밴드', 'community', host);
  return null;
}

function sourceInfo(key, label, type, detail) {
  return { key, label, type, detail };
}

function simplifyDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return String(host || '');
  return parts.slice(-2).join('.');
}

function safePathname(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
