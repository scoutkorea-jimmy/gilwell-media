import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, ['full', 'limited']))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const range = resolveAnalyticsRange(url.searchParams.get('start'), url.searchParams.get('end'));

  try {
    const internalData = await getInternalMetrics(env, range);
    return json(internalData);
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function getInternalMetrics(env, range) {
  const useHourlySeries = range.days === 1;
  const today = rangeStartEnd(resolveAnalyticsRange(getKstDateString(new Date()), getKstDateString(new Date())));
  const allTime = rangeStartEnd(resolveAnalyticsRange(env.CF_ANALYTICS_START_DATE || '2026-03-12', range.endDate));
  const chosen = rangeStartEnd(range);

  const [
    todayVisits,
    todayViews,
    totalVisits,
    totalViews,
    visitSeriesRows,
    viewSeriesRows,
    topPaths,
    referrers,
  ] = await Promise.all([
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [allTime.start, allTime.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM post_views WHERE datetime(viewed_at, '+9 hours') >= datetime(?) AND datetime(viewed_at, '+9 hours') < datetime(?)`, [allTime.start, allTime.endExclusive]),
    env.DB.prepare(
      useHourlySeries
        ? `SELECT strftime('%H', datetime(viewed_at, '+9 hours')) AS visit_hour, COUNT(DISTINCT viewer_key) AS visits
             FROM post_views
            WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
              AND datetime(viewed_at, '+9 hours') < datetime(?)
            GROUP BY visit_hour
            ORDER BY visit_hour ASC`
        : `SELECT date(viewed_at, '+9 hours') AS visit_date, COUNT(DISTINCT viewer_key) AS visits
             FROM post_views
            WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
              AND datetime(viewed_at, '+9 hours') < datetime(?)
            GROUP BY visit_date
            ORDER BY visit_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      useHourlySeries
        ? `SELECT strftime('%H', datetime(viewed_at, '+9 hours')) AS view_hour, COUNT(*) AS views
             FROM post_views
            WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
              AND datetime(viewed_at, '+9 hours') < datetime(?)
            GROUP BY view_hour
            ORDER BY view_hour ASC`
        : `SELECT date(viewed_at, '+9 hours') AS view_date, COUNT(*) AS views
             FROM post_views
            WHERE datetime(viewed_at, '+9 hours') >= datetime(?)
              AND datetime(viewed_at, '+9 hours') < datetime(?)
            GROUP BY view_date
            ORDER BY view_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT '/post/' || p.id AS path,
              p.title AS title,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT pv.viewer_key) AS visits
         FROM post_views pv
         JOIN posts p ON p.id = pv.post_id
        WHERE datetime(pv.viewed_at, '+9 hours') >= datetime(?)
          AND datetime(pv.viewed_at, '+9 hours') < datetime(?)
        GROUP BY p.id, p.title
        ORDER BY pageviews DESC, visits DESC, p.id DESC
        LIMIT 10`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT referrer_host, referrer_url, COUNT(*) AS pageviews, COUNT(DISTINCT viewer_key) AS visits
         FROM site_visits
        WHERE datetime(visited_at, '+9 hours') >= datetime(?)
          AND datetime(visited_at, '+9 hours') < datetime(?)
          AND path LIKE '/post/%'
        GROUP BY referrer_host, referrer_url
        ORDER BY visits DESC, pageviews DESC, referrer_host ASC
        LIMIT 200`
    ).bind(chosen.start, chosen.endExclusive).all(),
  ]);

  const visitSeries = useHourlySeries
    ? fillHourSeries(range, visitSeriesRows.results || [], 'visit_hour', (row, hourKey) => ({
      hour: hourKey,
      label: `${hourKey}:00`,
      visits: row.visits || 0,
    }))
    : fillDateSeries(range, visitSeriesRows.results || [], 'visit_date', (row, dateKey) => ({
      date: dateKey,
      label: dateKey,
      visits: row.visits || 0,
    }));
  const viewSeries = useHourlySeries
    ? fillHourSeries(range, viewSeriesRows.results || [], 'view_hour', (row, hourKey) => ({
      hour: hourKey,
      label: `${hourKey}:00`,
      views: row.views || 0,
    }))
    : fillDateSeries(range, viewSeriesRows.results || [], 'view_date', (row, dateKey) => ({
      date: dateKey,
      label: dateKey,
      views: row.views || 0,
    }));
  const rangeVisits = visitSeries.reduce((sum, item) => sum + Number(item.visits || 0), 0);
  const rangeViews = viewSeries.reduce((sum, item) => sum + Number(item.views || 0), 0);

  return {
    provider: 'post_views',
    provider_label: '기사 조회 집계',
    range: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      days: range.days,
      granularity: useHourlySeries ? 'hour' : 'day',
    },
    summary: {
      today_visits: todayVisits,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      average_daily_visits: range.days ? Math.round((rangeVisits / range.days) * 10) / 10 : 0,
      average_daily_pageviews: range.days ? Math.round((rangeViews / range.days) * 10) / 10 : 0,
    },
    visitors: {
      today_visits: todayVisits,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      series: visitSeries,
    },
    views: {
      total: rangeViews,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      series: viewSeries,
      top_paths: (topPaths.results || []).map((item) => ({
        path: item.path || '/',
        title: item.title || '',
        visits: item.visits || 0,
        pageviews: item.pageviews || 0,
      })),
    },
    top_paths: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || '',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
    })),
    referrers: aggregateReferrers(referrers.results || []),
    tracking_note: `${range.label} 기준 게시글 조회 로그 집계입니다. 방문 수는 게시글을 실제로 연 고유 사용자 수, 조회수는 게시글 실제 조회 누적 수를 뜻합니다. 유입 경로는 site_visits의 referrer URL을 기준으로 카카오, 네이버 검색, 내부 이동 등으로 최대한 세분화해 보여주지만, 메신저 앱이나 인앱 브라우저가 referrer를 넘기지 않으면 direct로 기록될 수 있습니다.`,
  };
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

function fillDateSeries(range, rows, dateKey, valueBuilder) {
  const byDate = new Map();
  rows.forEach((row) => byDate.set(row[dateKey], row));
  const out = [];
  for (let i = 0; i < range.days; i += 1) {
    const key = shiftKstDate(range.startDate, i);
    const row = byDate.get(key);
    out.push(Object.assign({}, row ? valueBuilder(row, key) : valueBuilder({}, key)));
  }
  return out;
}

function fillHourSeries(range, rows, hourKey, valueBuilder) {
  const byHour = new Map();
  rows.forEach((row) => byHour.set(String(row[hourKey] || '').padStart(2, '0'), row));
  const out = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const key = String(hour).padStart(2, '0');
    const row = byHour.get(key);
    out.push(Object.assign({}, row ? valueBuilder(row, key) : valueBuilder({}, key)));
  }
  return out;
}

function aggregateReferrers(rows) {
  const bySource = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const source = classifyReferrer(row && row.referrer_host, row && row.referrer_url);
    const current = bySource.get(source.key) || {
      source_key: source.key,
      source_label: source.label,
      source_type: source.type,
      source_type_label: source.typeLabel,
      source_detail: source.detail,
      referrer_host: row && row.referrer_host ? row.referrer_host : source.key,
      visits: 0,
      pageviews: 0,
    };
    current.visits += Number(row && row.visits || 0);
    current.pageviews += Number(row && row.pageviews || 0);
    bySource.set(source.key, current);
  });
  return Array.from(bySource.values())
    .sort((a, b) => b.visits - a.visits || b.pageviews - a.pageviews || a.source_label.localeCompare(b.source_label, 'ko'))
    .slice(0, 12);
}

function classifyReferrer(referrerHost, referrerUrl) {
  const host = String(referrerHost || '').trim().toLowerCase();
  const url = String(referrerUrl || '').trim();

  if (!host || host === 'direct') {
    return {
      key: 'direct',
      label: '직접 방문',
      type: 'direct',
      typeLabel: '직접',
      detail: '리퍼러 없음 또는 앱 브라우저 미제공',
    };
  }

  if (host === 'internal') {
    return {
      key: 'internal',
      label: '내부 이동',
      type: 'internal',
      typeLabel: '내부',
      detail: '',
    };
  }

  if (host === 'unknown') {
    return {
      key: 'unknown',
      label: '알 수 없음',
      type: 'unknown',
      typeLabel: '미분류',
      detail: '리퍼러 URL 해석 실패',
    };
  }

  const known = matchKnownReferrer(host, url);
  if (known) return known;

  const domain = simplifyDomain(host);
  return {
    key: 'site:' + domain,
    label: domain,
    type: 'site',
    typeLabel: '외부 사이트',
    detail: host,
  };
}

function matchKnownReferrer(host, referrerUrl) {
  const pathname = safePathname(referrerUrl);
  const searchPath = pathname.indexOf('/search') >= 0 || pathname.indexOf('/m/search') >= 0;

  if (host.indexOf('story.kakao.com') >= 0) {
    return sourceInfo('kakao-story', '카카오스토리', 'social', '소셜', host);
  }
  if (host.indexOf('kakao.com') >= 0 || host.indexOf('kakao') >= 0) {
    return sourceInfo('kakao', '카카오', 'messenger', '메신저', host);
  }
  if (host.indexOf('search.naver.com') >= 0 || host.indexOf('naver.com') >= 0) {
    return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'naver-search' : 'naver', searchPath || host.indexOf('search.') >= 0 ? '네이버 검색' : '네이버', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', searchPath || host.indexOf('search.') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('google.') >= 0) {
    return sourceInfo(pathname.indexOf('/search') >= 0 ? 'google-search' : 'google', pathname.indexOf('/search') >= 0 ? '구글 검색' : '구글', pathname.indexOf('/search') >= 0 ? 'search' : 'portal', pathname.indexOf('/search') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('search.daum.net') >= 0 || host.indexOf('daum.net') >= 0) {
    return sourceInfo(searchPath || host.indexOf('search.') >= 0 ? 'daum-search' : 'daum', searchPath || host.indexOf('search.') >= 0 ? '다음 검색' : '다음', searchPath || host.indexOf('search.') >= 0 ? 'search' : 'portal', searchPath || host.indexOf('search.') >= 0 ? '검색' : '포털', host);
  }
  if (host.indexOf('bing.com') >= 0) {
    return sourceInfo('bing', 'Bing', 'search', '검색', host);
  }
  if (host.indexOf('instagram.com') >= 0) {
    return sourceInfo('instagram', '인스타그램', 'social', '소셜', host);
  }
  if (host.indexOf('facebook.com') >= 0) {
    return sourceInfo('facebook', '페이스북', 'social', '소셜', host);
  }
  if (host === 't.co' || host.indexOf('twitter.com') >= 0 || host.indexOf('x.com') >= 0) {
    return sourceInfo('x', 'X / Twitter', 'social', '소셜', host);
  }
  if (host.indexOf('threads.net') >= 0) {
    return sourceInfo('threads', 'Threads', 'social', '소셜', host);
  }
  if (host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0) {
    return sourceInfo('youtube', '유튜브', 'video', '영상', host);
  }
  if (host.indexOf('linkedin.com') >= 0 || host.indexOf('lnkd.in') >= 0) {
    return sourceInfo('linkedin', '링크드인', 'social', '소셜', host);
  }
  if (host.indexOf('line.me') >= 0) {
    return sourceInfo('line', 'LINE', 'messenger', '메신저', host);
  }
  if (host.indexOf('whatsapp.com') >= 0) {
    return sourceInfo('whatsapp', 'WhatsApp', 'messenger', '메신저', host);
  }
  if (host.indexOf('telegram') >= 0 || host === 't.me') {
    return sourceInfo('telegram', 'Telegram', 'messenger', '메신저', host);
  }
  if (host.indexOf('discord') >= 0) {
    return sourceInfo('discord', 'Discord', 'community', '커뮤니티', host);
  }
  if (host.indexOf('reddit.com') >= 0) {
    return sourceInfo('reddit', 'Reddit', 'community', '커뮤니티', host);
  }
  if (host.indexOf('band.us') >= 0) {
    return sourceInfo('band', '네이버 밴드', 'community', '커뮤니티', host);
  }
  return null;
}

function sourceInfo(key, label, type, typeLabel, detail) {
  return {
    key: key,
    label: label,
    type: type,
    typeLabel: typeLabel,
    detail: detail,
  };
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

async function scalar(env, sql, binds = []) {
  const row = await env.DB.prepare(sql).bind(...binds).first();
  return row?.count || 0;
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
