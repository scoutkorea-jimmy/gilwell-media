import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';
import { resolveAdminAnalyticsRangeRust } from '../../_shared/admin-analytics-range.js';
import { logApiError } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'analytics-visits', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  let range, tagRange, heatmapRange;
  try {
    range = await resolveRequestedRange(url.searchParams, '', env);
    tagRange = await resolveRequestedRange(url.searchParams, 'tag_', env);
    heatmapRange = await resolveRequestedRange(url.searchParams, 'heatmap_', env);
  } catch (err) { return json({ error: err.message }, 400); }

  try {
    const internalData = await getInternalMetrics(env, range, tagRange, heatmapRange);
    return json(internalData);
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

async function resolveRequestedRange(searchParams, prefix = '', env) {
  if (prefix !== 'heatmap_') return resolveAdminAnalyticsRangeRust(searchParams, env, { prefix });
  return resolveHeatmapRangeRust(searchParams, env);
}

export function resolveHeatmapRangeLegacy(searchParams) {
  const prefix = 'heatmap_';
  if (searchParams.get(prefix + 'all') === '1') {
    const today = getKstDateString(new Date());
    return prefix === 'heatmap_'
      ? buildExplicitRange('2020-01-01', today)
      : resolveAnalyticsRange('2020-01-01', today);
  }
  const start = searchParams.get(prefix + 'start');
  const end = searchParams.get(prefix + 'end');
  if (start || end) {
    return prefix === 'heatmap_'
      ? buildExplicitRange(start, end)
      : resolveAnalyticsRange(start, end);
  }
  const days = Math.max(1, Math.min(90, Number(searchParams.get(prefix + 'days') || 30) || 30));
  const today = getKstDateString(new Date());
  return resolveAnalyticsRange(shiftKstDate(today, -(days - 1)), today);
}

export async function resolveHeatmapRangeRust(params, env = {}, run = queryRust) {
  const legacy = resolveHeatmapRangeLegacy(params);
  const today = getKstDateString(new Date());
  try {
    const response = await run({env,request:{url:'https://internal.invalid/'}},'admin-heatmap-range', {
      start:params.get('heatmap_start'),end:params.get('heatmap_end'),days:params.get('heatmap_days'),all:params.get('heatmap_all'),today,
    });
    if (!response.ok) return legacy;
    const result = await response.json();
    if (result.range && Object.keys(result.range).length === Object.keys(legacy).length && Object.keys(legacy).every(key => result.range[key] === legacy[key])) return result.range;
  } catch {}
  return legacy;
}

function buildExplicitRange(startDate, endDate) {
  const today = getKstDateString(new Date());
  let start = normalizeDateInput(startDate) || today;
  let end = normalizeDateInput(endDate) || today;
  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }
  return {
    startDate: start,
    endDate: end,
    days: diffDaysInclusiveLocal(start, end),
    label: start === end ? start : `${start} ~ ${end}`,
  };
}

function normalizeDateInput(value) {
  if (!value) return '';
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function diffDaysInclusiveLocal(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff + 1;
}

async function getInternalMetrics(env, range, tagRange, heatmapRange) {
  const useHourlySeries = range.days === 1;
  const today = rangeStartEnd(resolveAnalyticsRange(getKstDateString(new Date()), getKstDateString(new Date())));
  const chosen = rangeStartEnd(range);
  const chosenTags = rangeStartEnd(tagRange || range);
  const chosenHeatmap = rangeStartEnd(heatmapRange || range);
  const baseline = queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-baseline', {start:today.start, end:today.endExclusive})
    .then(response => { if (!response.ok) throw new Error('Rust analytics baseline failed'); return response.json(); });
  const series = queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-series', {start:chosen.start, end:chosen.endExclusive, hourly:useHourlySeries, days:range.days})
    .then(response => { if (!response.ok) throw new Error('Rust analytics series failed'); return response.json(); });
  const heatmaps = queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-heatmaps', {start:chosenHeatmap.start, end:chosenHeatmap.endExclusive, label:(heatmapRange || range).label || ''})
    .then(response => { if (!response.ok) throw new Error('Rust analytics heatmaps failed'); return response.json(); });
  const pathMetrics = queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-paths', {start:chosen.start, end:chosen.endExclusive})
    .then(response => { if (!response.ok) throw new Error('Rust analytics paths failed'); return response.json(); });
  const analyticsDetail = (kind, selected) => queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-detail', {kind, start:selected.start, end:selected.endExclusive})
    .then(response => { if (!response.ok) throw new Error('Rust analytics detail failed'); return response.json(); });

  const [
    todayVisits,
    todayViews,
    totalPosts,
    publishedPosts,
    totalVisits,
    totalViews,
    averageDwellSeconds,
    seriesData,
    topPaths,
    topArticlePosts,
    referrers,
    popularPostDwellRow,
    tagRows,
    heatmap,
  ] = await Promise.all([
    baseline.then(data => data.today_visits || 0),
    baseline.then(data => data.today_views || 0),
    baseline.then(data => data.total_posts || 0),
    baseline.then(data => data.published_posts || 0),
    baseline.then(data => data.total_visits || 0),
    baseline.then(data => data.total_views || 0),
    pathMetrics.then(data => data.average?.count || 0),
    series,
    pathMetrics.then(data => ({results:data.paths})),
    analyticsDetail('articles', chosen).then(data => ({results:data.rows})),
    analyticsDetail('referrers', chosen).then(data => ({results:data.rows})),
    analyticsDetail('popular', chosen).then(data => data.row),
    analyticsDetail('tags', chosenTags).then(data => ({results:data.rows})),
    heatmaps,
  ]);

  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'analytics-response', {
    range, useHourlySeries, todayVisits, todayViews, totalPosts, publishedPosts, totalVisits, totalViews,
    averageDwellSeconds, seriesData, topPaths, topArticlePosts, popularPostDwellRow,
    referrerRows:referrers.results || [], tagRows:tagRows.results || [], tagLabel:(tagRange || range).label || '', heatmap,
  });
  if (!response.ok) throw new Error('Rust analytics response failed');
  return response.json();
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
