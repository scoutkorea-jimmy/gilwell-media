import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue } from '../../_shared/homepage-issues.js';
import { ensureOperationalEventsTable } from '../../_shared/ops-log.js';

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 500;

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
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

    const items = dedupeHistoryItems([]
      .concat((operationalRows.results || []).map(normalizeOperationalHistoryItem))
      .concat((issueRows.results || []).map(function (row) { return normalizeIssueHistoryItem(normalizeHomepageIssue(row)); }))
      .concat((settingsRows.results || []).map(normalizeSettingsHistoryItem))
      .concat((postHistoryRows.results || []).map(normalizePostHistoryItem)))
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
  const source = operationalSource(type, item && item.path, item && item.channel, details);
  const entityId = extractEntityId(type, details);
  const entityAction = extractEntityAction(type);
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
    event_type: type,
    entity_id: entityId,
    entity_action: entityAction,
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
  const source = normalizeHistorySource(item.area || 'other');
  return {
    id: 'issue-' + String(item.id || ''),
    kind: 'homepage_issue',
    group: item.issue_type === 'error' ? 'error' : 'issue',
    source,
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
    source: 'settings',
    level: 'info',
    status: '',
    occurred_at: String(item && item.saved_at || ''),
    title: settingsKeyLabel(key) + ' 설정 변경',
    problem: '관리자에서 ' + settingsKeyLabel(key) + ' 설정을 저장했습니다.',
    suspected_cause: '설정 저장 직전 값이 히스토리 테이블에 보관된 이력입니다.',
    detail: key ? ('key=' + key) : '',
    path: '/api/settings/' + key,
    actor: 'admin',
    entity_id: key,
    entity_action: 'settings_change',
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
    event_type: action,
    entity_id: postId || 0,
    entity_action: action,
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

function operationalSource(type, path, channel, details) {
  if (extractEntityAction(type)) return 'post';
  if (String(type || '') === 'settings_change') return 'settings';
  if (String(path || '').indexOf('/api/admin/') === 0) return 'admin';
  if (String(path || '').indexOf('/api/settings/') === 0) return 'settings';
  if (String(path || '').indexOf('/api/posts') === 0) return 'post';
  if (String(path || '').indexOf('/api/analytics') === 0) return 'analytics';
  if (String(type || '') === 'api_error') return 'api';
  if (String(channel || '').toLowerCase() === 'admin') return 'admin';
  return normalizeHistorySource(details && details.area ? details.area : 'site');
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
  const meta = extractDetailMeta(details);
  if (meta) {
    if (meta.cause) return String(meta.cause);
    if (meta.key) return '설정 키 `' + String(meta.key) + '` 저장 과정에서 남은 운영 이력입니다.';
    if (meta.summary) return String(meta.summary);
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
  const meta = extractDetailMeta(details);
  const parts = [];
  if (item && item.path) parts.push(String(item.path));
  if (item && item.actor) parts.push('actor=' + String(item.actor));
  if (meta && meta.revision) parts.push('revision=' + String(meta.revision));
  return parts.join(' · ');
}

function settingsKeyLabel(key) {
  return {
    site_meta: '메타/SEO',
    board_copy: '게시판 설명',
    hero: '히어로 기사',
    hero_interval: '히어로 전환 주기',
    hero_media: '히어로 미디어',
    nav_labels: '메뉴명',
    translations: '번역 문구',
    ticker: '헤드라인 티커',
    author_name: '기본 작성자',
    ai_disclaimer: 'AI 안내 문구',
    board_banner_events: '게시판 배너',
    board_card_gap: '게시판 간격',
    calendar_copy: '캘린더 안내문',
    calendar_tags: '캘린더 태그',
    editors: '에디터 실명',
    feature_definition: '기능 정의서',
    tags: '글머리 태그',
    home_lead: '메인 스토리',
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

function extractDetailMeta(details) {
  if (!details || typeof details !== 'object') return null;
  if (details.meta && typeof details.meta === 'object') return details.meta;
  return details;
}

function extractEntityId(type, details) {
  const meta = extractDetailMeta(details);
  if (String(type || '').indexOf('post_') === 0) {
    return Number(meta && meta.post_id || 0) || 0;
  }
  if (String(type || '') === 'settings_change') {
    return String(meta && meta.key || '').trim();
  }
  return 0;
}

function extractEntityAction(type) {
  if (String(type || '') === 'post_created') return 'create';
  if (String(type || '') === 'post_updated') return 'update';
  if (String(type || '') === 'post_status_changed') return 'status';
  if (String(type || '') === 'post_deleted') return 'delete';
  return '';
}

function dedupeHistoryItems(items) {
  const seenOperationalPosts = new Set();
  const seenOperationalSettings = new Set();
  (Array.isArray(items) ? items : []).forEach(function (item) {
    if (!item || item.kind !== 'operational') return;
    if (!item.entity_id || !item.entity_action) return;
    if (String(item.entity_action) === 'settings_change') {
      seenOperationalSettings.add(String(item.entity_id));
      return;
    }
    seenOperationalPosts.add(String(item.entity_id) + ':' + String(item.entity_action));
  });
  return (Array.isArray(items) ? items : []).filter(function (item) {
    if (!item) return true;
    if (item.kind === 'post_history') {
      if (!item.entity_id || !item.entity_action) return true;
      return !seenOperationalPosts.has(String(item.entity_id) + ':' + String(item.entity_action));
    }
    if (item.kind === 'settings_history') {
      if (!item.entity_id) return true;
      return !seenOperationalSettings.has(String(item.entity_id));
    }
    return true;
  });
}

function normalizeHistorySource(source) {
  const value = String(source || '').trim().toLowerCase();
  if (!value) return 'other';
  if ([
    'site', 'admin', 'homepage', 'api', 'data', 'ui',
    'mobile', 'accessibility', 'analytics', 'post', 'settings',
  ].indexOf(value) >= 0) return value;
  return 'other';
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
