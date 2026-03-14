const DEFAULT_ZONE_TAG = 'd75b127c5c4d4e72a97322776aac7f5e';
const DEFAULT_HOST = 'bpmedia.net';
const DEFAULT_START_DATE = '2026-03-12';
const MAX_RANGE_DAYS = 90;

export function isCloudflareAnalyticsConfigured(env) {
  return !!(env && env.CF_ANALYTICS_API_TOKEN);
}

export function resolveAnalyticsRange(startDate, endDate) {
  const today = getKstDateString(new Date());
  const end = normalizeDate(endDate) || today;
  const start = normalizeDate(startDate) || shiftKstDate(end, -6);
  let safeStart = start;
  let safeEnd = end;
  if (safeStart > safeEnd) {
    safeStart = end;
    safeEnd = start;
  }
  const days = diffDaysInclusive(safeStart, safeEnd);
  if (days > MAX_RANGE_DAYS) {
    safeStart = shiftKstDate(safeEnd, -(MAX_RANGE_DAYS - 1));
  }

  return {
    startDate: safeStart,
    endDate: safeEnd,
    days: diffDaysInclusive(safeStart, safeEnd),
    label: safeStart === safeEnd ? safeStart : `${safeStart} ~ ${safeEnd}`,
    startUtcIso: kstDateToUtcStartIso(safeStart),
    endUtcIso: kstDateToUtcStartIso(shiftKstDate(safeEnd, 1)),
  };
}

export async function getCloudflareHomeMetrics(env) {
  if (!isCloudflareAnalyticsConfigured(env)) return null;
  const today = getKstDateString(new Date());
  const allTimeRange = resolveAnalyticsRange(env.CF_ANALYTICS_START_DATE || DEFAULT_START_DATE, today);
  const todayRange = resolveAnalyticsRange(today, today);
  const [allTime, todayMetrics] = await Promise.all([
    getCloudflarePageMetrics(env, allTimeRange, { includeSeries: false, includeReferrers: false }),
    getCloudflarePageMetrics(env, todayRange, { includeSeries: false, includeReferrers: false }),
  ]);

  return {
    provider: 'cloudflare',
    total_visits: allTime.summary.total_visits,
    total_pageviews: allTime.summary.total_pageviews,
    today_visits: todayMetrics.summary.range_visits,
    measured_timezone: 'Asia/Seoul',
    measured_date: today,
  };
}

export async function getCloudflarePageMetrics(env, range, opts = {}) {
  if (!isCloudflareAnalyticsConfigured(env)) return null;
  const queryRange = range || resolveAnalyticsRange();
  const includeSeries = opts.includeSeries !== false;
  const includeReferrers = opts.includeReferrers !== false;

  let referrerFallback = '';
  const [rangeRows, todayRows, totalRows, referrerRows] = await Promise.all([
    includeSeries
      ? queryByHourAndPath(env, queryRange.startUtcIso, queryRange.endUtcIso, 10000)
      : queryByPath(env, queryRange.startUtcIso, queryRange.endUtcIso, 2000),
    queryByPath(env, kstDateToUtcStartIso(getKstDateString(new Date())), kstDateToUtcStartIso(shiftKstDate(getKstDateString(new Date()), 1)), 1000),
    queryByPath(env, kstDateToUtcStartIso(env.CF_ANALYTICS_START_DATE || DEFAULT_START_DATE), queryRange.endUtcIso, 5000),
    includeReferrers
      ? queryByReferrerAndPath(env, queryRange.startUtcIso, queryRange.endUtcIso, 5000).catch((err) => {
        referrerFallback = err && err.message ? String(err.message) : 'Cloudflare referrer query unavailable';
        return [];
      })
      : Promise.resolve([]),
  ]);

  const series = includeSeries ? aggregateSeriesKst(rangeRows, queryRange) : [];
  const rangeTotals = includeSeries ? summarizeSeries(series) : summarizePathRows(rangeRows);
  const todayTotals = summarizePathRows(todayRows);
  const totalTotals = summarizePathRows(totalRows);
  const topPaths = aggregatePathRows(includeSeries ? rangeRows : rangeRows, 8);
  const referrers = includeReferrers ? aggregateReferrerRows(referrerRows, 10) : [];

  return {
    provider: 'cloudflare',
    provider_label: 'CF eyeball',
    range: {
      start_date: queryRange.startDate,
      end_date: queryRange.endDate,
      label: queryRange.label,
      days: queryRange.days,
    },
    summary: {
      today_visits: todayTotals.visits,
      total_visits: totalTotals.visits,
      range_visits: rangeTotals.visits,
      total_pageviews: totalTotals.pageviews,
      range_pageviews: rangeTotals.pageviews,
      average_daily_visits: queryRange.days ? Math.round((rangeTotals.visits / queryRange.days) * 10) / 10 : 0,
      average_daily_pageviews: queryRange.days ? Math.round((rangeTotals.pageviews / queryRange.days) * 10) / 10 : 0,
    },
    visitors: {
      today_visits: todayTotals.visits,
      total_visits: totalTotals.visits,
      range_visits: rangeTotals.visits,
      series: series.map((item) => ({ date: item.date, visits: item.visits })),
    },
    views: {
      total: rangeTotals.pageviews,
      total_pageviews: totalTotals.pageviews,
      range_pageviews: rangeTotals.pageviews,
      series: series.map((item) => ({ date: item.date, views: item.pageviews })),
      top_paths: topPaths,
    },
    top_paths: topPaths,
    referrers,
    tracking_note: `${queryRange.label} 기준 Cloudflare GraphQL 집계입니다. requestSource=eyeball 기준 방문과 페이지뷰만 사용하고, 알려진 봇·정적 자산·API 요청·비공개 관리 경로는 제외했습니다. 대외 비교 기준은 최근 30일 visits/pageviews를 권장합니다.${referrerFallback ? ' 현재 계정 권한 범위에서는 일부 유입 경로 필드가 비활성화되어 referrer 목록이 비어 있을 수 있습니다.' : ''}`,
  };
}

function getConfiguredHost(env) {
  return env.CF_ANALYTICS_HOST || DEFAULT_HOST;
}

function getConfiguredZoneTag(env) {
  return env.CF_ZONE_TAG || DEFAULT_ZONE_TAG;
}

async function queryByHourAndPath(env, startUtcIso, endUtcIso, limit) {
  return runGroupsQueryChunked(env, startUtcIso, endUtcIso, limit, '[datetimeHour_ASC, count_DESC]', 'dimensions { datetimeHour clientRequestPath }');
}

async function queryByPath(env, startUtcIso, endUtcIso, limit) {
  return runGroupsQueryChunked(env, startUtcIso, endUtcIso, limit, '[count_DESC]', 'dimensions { clientRequestPath }');
}

async function queryByReferrerAndPath(env, startUtcIso, endUtcIso, limit) {
  return runGroupsQueryChunked(env, startUtcIso, endUtcIso, limit, '[count_DESC]', 'dimensions { clientRefererHost clientRequestPath }');
}

async function runGroupsQueryChunked(env, startUtcIso, endUtcIso, limit, orderBy, dimensionsSelection) {
  const ranges = splitUtcIsoRangeByDay(startUtcIso, endUtcIso);
  const rows = [];
  for (const range of ranges) {
    const chunkRows = await runGroupsQuery(env, range.startUtcIso, range.endUtcIso, limit, orderBy, dimensionsSelection);
    rows.push(...chunkRows);
  }
  return rows;
}

async function runGroupsQuery(env, startUtcIso, endUtcIso, limit, orderBy, dimensionsSelection) {
  const zoneTag = getConfiguredZoneTag(env);
  const host = getConfiguredHost(env);
  const filter = `{ datetime_geq: ${jsonValue(startUtcIso)}, datetime_lt: ${jsonValue(endUtcIso)}, clientRequestHTTPHost: ${jsonValue(host)}, requestSource: "eyeball" }`;
  const query = `
    query {
      viewer {
        zones(filter: { zoneTag: ${jsonValue(zoneTag)} }) {
          httpRequestsAdaptiveGroups(limit: ${limit}, orderBy: ${orderBy}, filter: ${filter}) {
            count
            sum { visits }
            ${dimensionsSelection}
          }
        }
      }
    }
  `;
  const payload = await runGraphqlQuery(env, query);
  return (((payload || {}).viewer || {}).zones || [])[0]?.httpRequestsAdaptiveGroups || [];
}

function splitUtcIsoRangeByDay(startUtcIso, endUtcIso) {
  const ranges = [];
  let cursor = new Date(startUtcIso);
  const end = new Date(endUtcIso);
  while (cursor < end) {
    const next = new Date(Math.min(cursor.getTime() + 86400000, end.getTime()));
    ranges.push({
      startUtcIso: cursor.toISOString(),
      endUtcIso: next.toISOString(),
    });
    cursor = next;
  }
  return ranges;
}

async function runGraphqlQuery(env, query) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    throw new Error((data.errors && data.errors[0] && data.errors[0].message) || 'Cloudflare GraphQL error');
  }
  return data.data || null;
}

function aggregateSeriesKst(rows, range) {
  const byDate = new Map();
  rows.forEach((row) => {
    const path = row?.dimensions?.clientRequestPath || '';
    if (!isPublicPagePath(path)) return;
    const hour = row?.dimensions?.datetimeHour;
    if (!hour) return;
    const dateKey = getKstDateString(new Date(hour));
    const current = byDate.get(dateKey) || { date: dateKey, visits: 0, pageviews: 0 };
    current.pageviews += Number(row.count || 0);
    current.visits += Number((row.sum && row.sum.visits) || 0);
    byDate.set(dateKey, current);
  });

  const output = [];
  for (let offset = 0; offset < range.days; offset += 1) {
    const dateKey = shiftKstDate(range.startDate, offset);
    output.push(byDate.get(dateKey) || { date: dateKey, visits: 0, pageviews: 0 });
  }
  return output;
}

function summarizeSeries(series) {
  return series.reduce(
    (acc, item) => {
      acc.visits += Number(item.visits || 0);
      acc.pageviews += Number(item.pageviews || 0);
      return acc;
    },
    { visits: 0, pageviews: 0 }
  );
}

function summarizePathRows(rows) {
  return rows.reduce(
    (acc, row) => {
      const path = row?.dimensions?.clientRequestPath || '';
      if (!isPublicPagePath(path)) return acc;
      acc.visits += Number((row.sum && row.sum.visits) || 0);
      acc.pageviews += Number(row.count || 0);
      return acc;
    },
    { visits: 0, pageviews: 0 }
  );
}

function aggregatePathRows(rows, limit) {
  const byPath = new Map();
  rows.forEach((row) => {
    const path = row?.dimensions?.clientRequestPath || '';
    if (!isPublicPagePath(path)) return;
    const current = byPath.get(path) || { path, visits: 0, pageviews: 0 };
    current.visits += Number((row.sum && row.sum.visits) || 0);
    current.pageviews += Number(row.count || 0);
    byPath.set(path, current);
  });
  return Array.from(byPath.values())
    .sort((a, b) => b.pageviews - a.pageviews || b.visits - a.visits || a.path.localeCompare(b.path))
    .slice(0, limit || 8);
}

function aggregateReferrerRows(rows, limit) {
  const byHost = new Map();
  rows.forEach((row) => {
    const path = row?.dimensions?.clientRequestPath || '';
    if (!isPublicPagePath(path)) return;
    const host = row?.dimensions?.clientRefererHost || 'direct';
    const current = byHost.get(host) || { referrer_host: host, visits: 0, pageviews: 0 };
    current.visits += Number((row.sum && row.sum.visits) || 0);
    current.pageviews += Number(row.count || 0);
    byHost.set(host, current);
  });
  return Array.from(byHost.values())
    .sort((a, b) => b.visits - a.visits || b.pageviews - a.pageviews || a.referrer_host.localeCompare(b.referrer_host))
    .slice(0, limit || 10);
}

function isPublicPagePath(path) {
  const clean = String(path || '').split('?')[0];
  if (!clean) return false;
  if (clean === '/' || clean === '/index.html') return true;
  if (clean.startsWith('/post/')) return true;
  if (clean === '/korea.html' || clean === '/apr.html' || clean === '/wosm.html' || clean === '/worm.html' || clean === '/people.html' || clean === '/contributors.html' || clean === '/search.html' || clean === '/404.html') return true;
  if (clean === '/admin.html') return false;
  if (clean.startsWith('/api/') || clean.startsWith('/cdn-cgi/') || clean.startsWith('/css/') || clean.startsWith('/js/') || clean.startsWith('/img/')) return false;
  return /\.html$/i.test(clean);
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function kstDateToUtcStartIso(dateStr) {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString();
}

function shiftKstDate(dateStr, offsetDays) {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return getKstDateString(date);
}

function diffDaysInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+09:00`).getTime();
  const end = new Date(`${endDate}T00:00:00+09:00`).getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

function getKstDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function jsonValue(value) {
  return JSON.stringify(value);
}
