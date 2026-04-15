import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue } from '../../_shared/homepage-issues.js';
import { ensureOperationalEventsTable } from '../../_shared/ops-log.js';

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 500;

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  try {
    await Promise.all([
      ensureOperationalEventsTable(env),
      ensureHomepageIssuesTable(env),
    ]);

    const url = new URL(request.url);
    const limit = Math.max(50, Math.min(MAX_LIMIT, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

    const [operationalRows, issueRows, settingsRows, postHistoryRows] = await Promise.all([
      env.DB.prepare(
        `SELECT id, channel, type, level, actor, ip, path, message, details, created_at
           FROM operational_events
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?`
      ).bind(limit).all().catch(function () { return { results: [] }; }),
      env.DB.prepare(
        `SELECT *
           FROM homepage_issues
          ORDER BY datetime(updated_at) DESC, id DESC
          LIMIT ?`
      ).bind(Math.min(limit, 200)).all().catch(function () { return { results: [] }; }),
      env.DB.prepare(
        `SELECT id, key, value, saved_at
           FROM settings_history
          ORDER BY datetime(saved_at) DESC, id DESC
          LIMIT ?`
      ).bind(Math.min(limit, 150)).all().catch(function () { return { results: [] }; }),
      env.DB.prepare(
        `SELECT id, post_id, action, summary, before_snapshot, after_snapshot, created_at
           FROM post_history
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?`
      ).bind(Math.min(limit, 150)).all().catch(function () { return { results: [] }; }),
    ]);

    const items = []
      .concat((operationalRows.results || []).map(normalizeOperationalHistoryItem))
      .concat((issueRows.results || []).map(function (row) { return normalizeIssueHistoryItem(normalizeHomepageIssue(row)); }))
      .concat((settingsRows.results || []).map(normalizeSettingsHistoryItem))
      .concat((postHistoryRows.results || []).map(normalizePostHistoryItem))
      .sort(compareHistoryItems)
      .slice(0, limit);

    return json({
      items,
      total: items.length,
      groups: {
        error: countBy(items, 'group', 'error'),
        issue: countBy(items, 'group', 'issue'),
        auth: countBy(items, 'group', 'auth'),
        settings: countBy(items, 'group', 'settings'),
        content: countBy(items, 'group', 'content'),
      },
    });
  } catch (err) {
    console.error('GET /api/admin/site-history error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeOperationalHistoryItem(item) {
  const details = parseJson(item && item.details);
  const type = String(item && item.type || '').trim();
  const group = operationalGroup(type, item && item.level, item && item.channel);
  const source = String(item && item.channel || 'site').trim() || 'site';
  return {
    id: 'ops-' + String(item && item.id || ''),
    kind: 'operational',
    group,
    source,
    level: String(item && item.level || 'info').trim() || 'info',
    status: '',
    occurred_at: String(item && item.created_at || ''),
    title: operationalTitle(type, item && item.message),
    problem: String(item && item.message || type || '운영 이벤트'),
    suspected_cause: buildOperationalCause(type, details, item),
    detail: operationalDetail(item, details),
    path: String(item && item.path || ''),
    actor: String(item && item.actor || ''),
    search_text: [
      type,
      item && item.message,
      item && item.path,
      item && item.actor,
      source,
      details && details.stack,
    ].join(' ').toLowerCase(),
  };
}

function normalizeIssueHistoryItem(item) {
  return {
    id: 'issue-' + String(item.id || ''),
    kind: 'homepage_issue',
    group: item.issue_type === 'error' ? 'error' : 'issue',
    source: item.area || 'other',
    level: item.severity || 'medium',
    status: item.status || 'open',
    occurred_at: item.updated_at || item.last_seen_at || item.occurred_at || item.created_at || '',
    title: item.title || '사이트 이슈',
    problem: item.summary || item.impact || item.title || '사이트 이슈가 기록되었습니다.',
    suspected_cause: item.cause || '자동 감지 또는 수동 보고로 누적된 사이트 이슈입니다.',
    detail: [item.source_path, item.action_items].filter(Boolean).join(' · '),
    path: item.source_path || '',
    actor: item.reporter || '',
    search_text: [
      item.title,
      item.summary,
      item.impact,
      item.cause,
      item.action_items,
      item.source_path,
      item.reporter,
      item.area,
      item.status,
    ].join(' ').toLowerCase(),
  };
}

function normalizeSettingsHistoryItem(item) {
  const key = String(item && item.key || '').trim();
  return {
    id: 'settings-' + String(item && item.id || ''),
    kind: 'settings_history',
    group: 'settings',
    source: 'admin',
    level: 'info',
    status: '',
    occurred_at: String(item && item.saved_at || ''),
    title: settingsKeyLabel(key) + ' 설정 변경',
    problem: '관리자에서 ' + settingsKeyLabel(key) + ' 설정을 저장했습니다.',
    suspected_cause: '설정 저장 직전 값이 히스토리 테이블에 보관된 이력입니다.',
    detail: key ? ('key=' + key) : '',
    path: '/api/settings/' + key,
    actor: 'admin',
    search_text: [key, settingsKeyLabel(key), item && item.value].join(' ').toLowerCase(),
  };
}

function normalizePostHistoryItem(item) {
  const beforePost = parseJson(item && item.before_snapshot);
  const afterPost = parseJson(item && item.after_snapshot);
  const current = afterPost || beforePost || {};
  const postId = Number(item && item.post_id || 0) || 0;
  const title = String(current.title || '').trim() || ('게시글 #' + String(postId || ''));
  const action = String(item && item.action || '').trim() || 'update';
  return {
    id: 'post-history-' + String(item && item.id || ''),
    kind: 'post_history',
    group: 'content',
    source: 'post',
    level: action === 'status' ? 'info' : 'medium',
    status: action,
    occurred_at: String(item && item.created_at || ''),
    title: title,
    problem: postHistoryLabel(action) + ' · ' + title,
    suspected_cause: String(item && item.summary || '').trim() || '관리자 콘텐츠 편집 작업으로 남은 변경 이력입니다.',
    detail: [current && current.category ? ('category=' + String(current.category)) : '', postId ? ('/post/' + postId) : ''].filter(Boolean).join(' · '),
    path: postId ? ('/post/' + postId) : '',
    actor: '',
    search_text: [
      action,
      title,
      item && item.summary,
      current && current.category,
      postId ? ('/post/' + postId) : '',
    ].join(' ').toLowerCase(),
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function operationalGroup(type, level, channel) {
  if (String(type || '').indexOf('login_') >= 0) return 'auth';
  if (String(type || '') === 'settings_change') return 'settings';
  if (String(type || '').indexOf('post_') >= 0) return 'content';
  if (String(level || '').toLowerCase() === 'error') return 'error';
  if (String(channel || '').toLowerCase() === 'admin') return 'settings';
  return 'issue';
}

function operationalTitle(type, fallback) {
  const labels = {
    admin_login_failed: '관리자 로그인 실패',
    admin_login_success: '관리자 로그인 성공',
    dreampath_login_failed: 'Dreampath 로그인 실패',
    dreampath_login_success: 'Dreampath 로그인 성공',
    settings_change: '설정 변경',
    post_created: '게시글 생성',
    post_updated: '게시글 수정',
    post_status_changed: '게시글 상태 변경',
    post_deleted: '게시글 삭제',
    api_error: 'API 오류',
    homepage_issue_report: '사이트 이슈 자동 보고',
  };
  return labels[type] || String(fallback || type || '운영 이벤트');
}

function buildOperationalCause(type, details, item) {
  if (details && details.meta && typeof details.meta === 'object') {
    if (details.meta.cause) return String(details.meta.cause);
    if (details.meta.key) return '설정 키 `' + String(details.meta.key) + '` 저장 과정에서 남은 운영 이력입니다.';
    if (details.meta.summary) return String(details.meta.summary);
  }
  if (type === 'api_error' && item && item.path) {
    return 'API `' + String(item.path) + '` 처리 중 예외가 발생한 것으로 보입니다.';
  }
  if (type === 'admin_login_failed') return '비밀번호 불일치 또는 자동화된 로그인 시도로 추정됩니다.';
  if (type === 'admin_login_success') return '정상 관리자 인증 성공 기록입니다.';
  if (type === 'settings_change') return '관리자 설정 저장으로 발생한 변경 이력입니다.';
  if (String(type || '').indexOf('post_') === 0) return '관리자 콘텐츠 편집 작업으로 발생한 운영 이력입니다.';
  return String(item && item.message || '운영 이벤트 원인을 확인할 수 없습니다.');
}

function operationalDetail(item, details) {
  const parts = [];
  if (item && item.path) parts.push(String(item.path));
  if (item && item.actor) parts.push('actor=' + String(item.actor));
  if (details && details.meta && details.meta.revision) parts.push('revision=' + String(details.meta.revision));
  return parts.join(' · ');
}

function settingsKeyLabel(key) {
  return {
    site_meta: '메타/SEO',
    board_copy: '게시판 설명',
    hero: '히어로 기사',
    hero_interval: '히어로 전환 주기',
    hero_media: '히어로 미디어',
    wosm_members: '세계연맹 회원국',
    contributors: '기고자',
  }[key] || key || '설정';
}

function postHistoryLabel(action) {
  return {
    create: '게시글 생성',
    update: '게시글 수정',
    status: '게시글 상태 변경',
    delete: '게시글 삭제',
  }[action] || '게시글 변경';
}

function compareHistoryItems(a, b) {
  return toTimeValue(b && b.occurred_at) - toTimeValue(a && a.occurred_at);
}

function toTimeValue(value) {
  const normalized = String(value || '').trim().replace(' ', 'T');
  const withZone = normalized && !/Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized + '+09:00' : normalized;
  const date = withZone ? new Date(withZone) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function countBy(items, key, value) {
  return (Array.isArray(items) ? items : []).filter(function (item) {
    return item && item[key] === value;
  }).length;
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
