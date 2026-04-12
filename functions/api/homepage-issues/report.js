import { recordHomepageIssue } from '../../_shared/homepage-issues.js';
import { deriveIp, logOperationalEvent } from '../../_shared/ops-log.js';

const ISSUE_TEMPLATES = {
  home_initial_fetch_failed: {
    title: '홈 초기 데이터 로드 실패',
    issue_type: 'error',
    status: 'open',
    severity: 'high',
    area: 'homepage',
    source_path: '/api/home',
    impact: '홈 주요 영역이 fallback 상태로 내려가며 최신 데이터가 비어 보일 수 있습니다.',
    action_items: '홈 API 응답, 네트워크 상태, Functions 오류 로그를 우선 확인합니다.',
  },
  home_latest_refresh_failed: {
    title: '홈 백그라운드 새로고침 실패',
    issue_type: 'issue',
    status: 'monitoring',
    severity: 'medium',
    area: 'homepage',
    source_path: '/api/home',
    impact: '홈 일부 섹션이 잠시 오래된 상태로 유지될 수 있습니다.',
    action_items: '백그라운드 새로고침 실패 로그와 /api/home 응답 안정성을 점검합니다.',
  },
  home_client_runtime_error: {
    title: '홈 런타임 스크립트 오류',
    issue_type: 'error',
    status: 'open',
    severity: 'high',
    area: 'ui',
    source_path: '/js/home.js',
    impact: '홈 일부 상호작용 또는 렌더링이 중단될 수 있습니다.',
    action_items: '브라우저 런타임 에러 메시지와 최근 배포 자산 버전을 확인합니다.',
  },
  home_client_promise_rejection: {
    title: '홈 비동기 처리 오류',
    issue_type: 'error',
    status: 'monitoring',
    severity: 'medium',
    area: 'ui',
    source_path: '/js/home.js',
    impact: '홈의 일부 비동기 기능이 조용히 실패할 수 있습니다.',
    action_items: 'Unhandled rejection 메시지와 관련 API 호출 경로를 확인합니다.',
  },
};

export async function onRequestPost({ request, env }) {
  if (!isSameOriginReport(request)) {
    return json({ error: 'Forbidden' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const code = String(body && body.code || '').trim();
  const template = ISSUE_TEMPLATES[code];
  if (!template) {
    return json({ error: 'Unknown report code' }, 400);
  }

  const detail = sanitizeDetail(body && body.detail);
  const item = await recordHomepageIssue(env, {
    title: template.title,
    issue_type: template.issue_type,
    status: template.status,
    severity: template.severity,
    area: template.area,
    source_path: normalizeSourcePath(template.source_path, detail),
    summary: buildSummary(template.title, detail),
    impact: template.impact,
    cause: buildCause(detail),
    action_items: template.action_items,
    reporter: 'system:auto-home',
    occurred_at: nowUtcText(),
  });

  await logOperationalEvent(env, {
    channel: 'site',
    type: 'homepage_issue_report',
    level: 'warn',
    ip: deriveIp(request),
    path: '/api/homepage-issues/report',
    message: template.title,
    details: {
      code,
      source_path: item && item.source_path ? item.source_path : template.source_path,
      detail,
      occurrence_count: item && item.occurrence_count ? item.occurrence_count : 1,
    },
  });

  return json({
    ok: true,
    item,
  }, 201);
}

function isSameOriginReport(request) {
  try {
    const url = new URL(request.url);
    const origin = String(request.headers.get('Origin') || '').trim();
    if (origin) return origin === url.origin;
    const referer = String(request.headers.get('Referer') || '').trim();
    return !referer || referer.indexOf(url.origin + '/') === 0 || referer === url.origin;
  } catch (_) {
    return false;
  }
}

function sanitizeDetail(input) {
  const detail = input && typeof input === 'object' ? input : {};
  return {
    message: trim(detail.message, 400),
    path: trim(detail.path, 260),
    section: trim(detail.section, 80),
    code: trim(detail.code, 80),
    source: trim(detail.source, 260),
  };
}

function normalizeSourcePath(basePath, detail) {
  const extra = detail && detail.path ? ' [' + detail.path + ']' : '';
  return trim((basePath || '') + extra, 260);
}

function buildSummary(title, detail) {
  const parts = [];
  if (detail && detail.section) parts.push('section=' + detail.section);
  if (detail && detail.code) parts.push('code=' + detail.code);
  if (detail && detail.message) parts.push(detail.message);
  return trim(parts.join(' | ') || title, 2000);
}

function buildCause(detail) {
  const parts = [];
  if (detail && detail.source) parts.push('source=' + detail.source);
  if (detail && detail.path) parts.push('path=' + detail.path);
  if (detail && detail.message) parts.push('message=' + detail.message);
  return trim(parts.join(' | '), 2000);
}

function trim(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
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
