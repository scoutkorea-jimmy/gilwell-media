import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { resolveAnalyticsRange } from '../../_shared/cloudflare-analytics.js';
import { logApiError } from '../../_shared/ops-log.js';

const VISIT_SCOPE_SQL = "(path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))";

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const url = new URL(request.url);
  const range = resolveRequestedRange(url.searchParams);

  try {
    const internalData = await getInternalMetrics(env, range);
    return json(internalData);
  } catch (err) {
    console.error('GET /api/admin/analytics error:', err);
    await logApiError(env, request, err, { channel: 'admin' });
    return json({ error: 'Database error' }, 500);
  }
}

function resolveRequestedRange(searchParams) {
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (start || end) return resolveAnalyticsRange(start, end);
  const days = Math.max(1, Math.min(90, Number(searchParams.get('days') || 30) || 30));
  const today = getKstDateString(new Date());
  return resolveAnalyticsRange(shiftKstDate(today, -(days - 1)), today);
}

async function getInternalMetrics(env, range) {
  const useHourlySeries = range.days === 1;
  const today = rangeStartEnd(resolveAnalyticsRange(getKstDateString(new Date()), getKstDateString(new Date())));
  const chosen = rangeStartEnd(range);

  const [
    todayVisits,
    todayViews,
    totalPosts,
    publishedPosts,
    totalVisits,
    totalViews,
    averageDwellSeconds,
    visitSeriesRows,
    viewSeriesRows,
    topPaths,
    referrers,
    popularPostDwellRow,
  ] = await Promise.all([
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM site_visits WHERE ${VISIT_SCOPE_SQL} AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM site_visits WHERE ${VISIT_SCOPE_SQL} AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?)`, [today.start, today.endExclusive]),
    scalar(env, `SELECT COUNT(*) AS count FROM posts`, []),
    scalar(env, `SELECT COUNT(*) AS count FROM posts WHERE published = 1`, []),
    scalar(env, `SELECT COUNT(DISTINCT viewer_key) AS count FROM site_visits WHERE ${VISIT_SCOPE_SQL}`, []),
    scalar(env, `SELECT COUNT(*) AS count FROM site_visits WHERE ${VISIT_SCOPE_SQL}`, []),
    scalar(env, `WITH scoped_visits AS (
                    SELECT id, viewer_key, path, visited_at
                      FROM site_visits
                     WHERE ${VISIT_SCOPE_SQL}
                       AND datetime(visited_at, '+9 hours') >= datetime(?)
                       AND datetime(visited_at, '+9 hours') < datetime(?)
                  ),
                  dwell AS (
                    SELECT path,
                           CASE
                             WHEN next_visited_at IS NULL THEN NULL
                             ELSE ROUND(
                               MIN(1800, MAX(5, (julianday(next_visited_at) - julianday(visited_at)) * 86400.0)),
                               1
                             )
                           END AS dwell_seconds
                      FROM (
                        SELECT path,
                               visited_at,
                               LEAD(visited_at) OVER (PARTITION BY viewer_key ORDER BY datetime(visited_at), id) AS next_visited_at
                          FROM scoped_visits
                      )
                  )
                  SELECT ROUND(AVG(dwell_seconds), 1) AS count
                    FROM dwell`, [chosen.start, chosen.endExclusive]),
    env.DB.prepare(
      useHourlySeries
        ? `SELECT strftime('%H', datetime(visited_at, '+9 hours')) AS visit_hour, COUNT(DISTINCT viewer_key) AS visits
             FROM site_visits
            WHERE ${VISIT_SCOPE_SQL}
              AND datetime(visited_at, '+9 hours') >= datetime(?)
              AND datetime(visited_at, '+9 hours') < datetime(?)
            GROUP BY visit_hour
            ORDER BY visit_hour ASC`
        : `SELECT date(visited_at, '+9 hours') AS visit_date, COUNT(DISTINCT viewer_key) AS visits
             FROM site_visits
            WHERE ${VISIT_SCOPE_SQL}
              AND datetime(visited_at, '+9 hours') >= datetime(?)
              AND datetime(visited_at, '+9 hours') < datetime(?)
            GROUP BY visit_date
            ORDER BY visit_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      useHourlySeries
        ? `SELECT strftime('%H', datetime(visited_at, '+9 hours')) AS view_hour, COUNT(*) AS views
             FROM site_visits
            WHERE ${VISIT_SCOPE_SQL}
              AND datetime(visited_at, '+9 hours') >= datetime(?)
              AND datetime(visited_at, '+9 hours') < datetime(?)
            GROUP BY view_hour
            ORDER BY view_hour ASC`
        : `SELECT date(visited_at, '+9 hours') AS view_date, COUNT(*) AS views
             FROM site_visits
            WHERE ${VISIT_SCOPE_SQL}
              AND datetime(visited_at, '+9 hours') >= datetime(?)
              AND datetime(visited_at, '+9 hours') < datetime(?)
            GROUP BY view_date
            ORDER BY view_date ASC`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `WITH scoped_visits AS (
         SELECT id, viewer_key, path, visited_at
           FROM site_visits
          WHERE ${VISIT_SCOPE_SQL.replaceAll('path', 'path')}
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
       ),
       path_dwell AS (
         SELECT path,
                ROUND(AVG(
                  CASE
                    WHEN next_visited_at IS NULL THEN NULL
                    ELSE MIN(1800, MAX(5, (julianday(next_visited_at) - julianday(visited_at)) * 86400.0))
                  END
                ), 1) AS avg_dwell_seconds
           FROM (
             SELECT path,
                    visited_at,
                    LEAD(visited_at) OVER (PARTITION BY viewer_key ORDER BY datetime(visited_at), id) AS next_visited_at
               FROM scoped_visits
           )
          GROUP BY path
       )
       SELECT sv.path AS path,
              COALESCE(p.title, CASE WHEN sv.path IN ('/dreampath', '/dreampath.html') THEN 'Dreampath' ELSE '' END) AS title,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT sv.viewer_key) AS visits,
              COALESCE(pe.avg_dwell_seconds, pd.avg_dwell_seconds, 0) AS avg_dwell_seconds
         FROM scoped_visits sv
         LEFT JOIN posts p ON sv.path = '/post/' || p.id
         LEFT JOIN (
           SELECT post_id, ROUND(AVG(engaged_seconds), 1) AS avg_dwell_seconds
             FROM post_engagement
            WHERE datetime(updated_at, '+9 hours') >= datetime(?)
              AND datetime(updated_at, '+9 hours') < datetime(?)
            GROUP BY post_id
         ) pe ON p.id = pe.post_id
         LEFT JOIN path_dwell pd ON pd.path = sv.path
        GROUP BY sv.path, p.title
        ORDER BY pageviews DESC, visits DESC, sv.path DESC
        LIMIT 10`
    ).bind(chosen.start, chosen.endExclusive, chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `SELECT referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, COUNT(*) AS pageviews, COUNT(DISTINCT viewer_key) AS visits
         FROM site_visits
        WHERE datetime(visited_at, '+9 hours') >= datetime(?)
          AND datetime(visited_at, '+9 hours') < datetime(?)
          AND ${VISIT_SCOPE_SQL}
        GROUP BY referrer_host, referrer_url, utm_source, utm_medium, utm_campaign
        ORDER BY visits DESC, pageviews DESC, referrer_host ASC
        LIMIT 200`
    ).bind(chosen.start, chosen.endExclusive).all(),
    env.DB.prepare(
      `WITH top_post AS (
         SELECT CAST(substr(path, 7) AS INTEGER) AS post_id
          FROM site_visits
          WHERE path LIKE '/post/%'
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY path
          ORDER BY COUNT(*) DESC, MAX(visited_at) DESC
          LIMIT 1
       )
       SELECT p.title AS title,
              tp.post_id AS post_id,
              ROUND(AVG(pe.engaged_seconds), 1) AS avg_dwell_seconds
         FROM top_post tp
         LEFT JOIN post_engagement pe
           ON pe.post_id = tp.post_id
          AND datetime(pe.updated_at, '+9 hours') >= datetime(?)
          AND datetime(pe.updated_at, '+9 hours') < datetime(?)
         LEFT JOIN posts p ON p.id = tp.post_id`
    ).bind(chosen.start, chosen.endExclusive, chosen.start, chosen.endExclusive).first(),
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
    provider: 'site_visits',
    provider_label: '공개 페이지 전체 방문 집계',
    range: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      days: range.days,
      granularity: useHourlySeries ? 'hour' : 'day',
    },
    today: {
      visits: todayVisits,
      views: todayViews,
    },
    counts: {
      total: totalPosts,
      published: publishedPosts,
    },
    summary: {
      today_visits: todayVisits,
      today_pageviews: todayViews,
      today_views: todayViews,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      average_dwell_seconds: averageDwellSeconds,
      popular_post_average_dwell_seconds: Number(popularPostDwellRow && popularPostDwellRow.avg_dwell_seconds || 0),
      popular_post_title: popularPostDwellRow && popularPostDwellRow.title ? popularPostDwellRow.title : '',
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
        avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
      })),
    },
    top_paths: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || '',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
      avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
    })),
    top_posts: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || '',
      views: item.pageviews || 0,
      visits: item.visits || 0,
      avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
    })),
    referrers: aggregateReferrers(referrers.results || []),
    sources: aggregateReferrers(referrers.results || []).map((item) => ({
      referrer_host: item.source_label || item.source_key || '직접',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
      source_key: item.source_key || '',
      source_label: item.source_label || '',
    })),
    tracking_note: `${range.label} 기준 공개 페이지 전체 방문 집계입니다. 방문 수는 고유 사용자 수, 조회수는 전체 페이지뷰 수 기준입니다. 평균 체류시간은 현재 기사 상세 페이지(post)에서만 활성 시간 기준으로 계산됩니다. 유입 경로는 공유 링크 UTM과 site_visits의 referrer URL을 함께 사용해 카카오, 페이스북, 검색, 내부 이동 등을 최대한 세분화해 보여주지만, 메신저 앱이나 인앱 브라우저가 정보를 넘기지 않으면 직접 방문으로 기록될 수 있습니다.`,
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
    const source = classifyReferrer(row && row.referrer_host, row && row.referrer_url, row && row.utm_source, row && row.utm_medium, row && row.utm_campaign);
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

function classifyReferrer(referrerHost, referrerUrl, utmSource, utmMedium, utmCampaign) {
  const host = String(referrerHost || '').trim().toLowerCase();
  const url = String(referrerUrl || '').trim();
  const source = String(utmSource || '').trim().toLowerCase();
  const medium = String(utmMedium || '').trim().toLowerCase();
  const campaign = String(utmCampaign || '').trim().toLowerCase();

  if (source) {
    if (source === 'kakaotalk') return sourceInfo('utm-kakaotalk', '카카오톡 공유', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    if (source === 'facebook') return sourceInfo('utm-facebook', '페이스북 공유', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    if (source === 'copy') return sourceInfo('utm-copy', '직접 공유 URL', medium === 'social-share' ? 'share' : 'campaign', medium === 'social-share' ? '공유' : '캠페인', campaign || medium || 'utm');
    return sourceInfo('utm-' + source, 'UTM · ' + source, 'campaign', '캠페인', campaign || medium || source);
  }

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
