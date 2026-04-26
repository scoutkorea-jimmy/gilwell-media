/**
 * Gilwell Media · Admin Users · Shared helpers
 *
 * Phase 1 (read-only): row loaders + permission parsing.
 * Write operations (CRUD, password reset, role change) arrive in Phase 3.
 *
 * Permission shape stored on admin_users.permissions:
 *   {"access_admin": boolean, "permissions": ["view:<menu>", "write:<menu>", ...]}
 *
 * Owner role implicitly has all permissions — callers should short-circuit
 * via isOwnerRole() before consulting the JSON blob.
 */

export const ROLES = Object.freeze({ OWNER: 'owner', MEMBER: 'member' });
export const STATUSES = Object.freeze({ ACTIVE: 'active', DISABLED: 'disabled', DELETED: 'deleted' });

export const MEMBER_DEFAULT_AI_DAILY_LIMIT = 10;

/**
 * Full admin menu catalog — single source of truth for permissions grid.
 * Owner sees all of these; members' visibility follows their `permissions` blob.
 * Keep in sync with admin.html sidebar ordering.
 */
export const ADMIN_MENUS = Object.freeze([
  { group: '대시보드', items: [
    { slug: 'dashboard', label: '대시보드', actions: ['view'] },
  ]},
  { group: '분석', items: [
    { slug: 'analytics-visits', label: '방문 분석', actions: ['view', 'write'] },
    { slug: 'marketing',        label: '마케팅',    actions: ['view', 'write'] },
    { slug: 'analytics-tags',   label: '태그 인사이트', actions: ['view', 'write'] },
    { slug: 'geo-audience',     label: '접속 국가/도시', actions: ['view', 'write'] },
  ]},
  { group: '콘텐츠', items: [
    { slug: 'list',              label: '게시글 목록',  actions: ['view', 'write'] },
    { slug: 'write',             label: '새 글 작성',   actions: ['view', 'write'] },
    { slug: 'calendar',          label: '캘린더',       actions: ['view', 'write'] },
    { slug: 'glossary',          label: '용어집',       actions: ['view', 'write'] },
    { slug: 'article-scorer',    label: '기사 채점',    actions: ['view', 'write'] },
    { slug: 'ai-score-history',  label: 'AI 채점기록',  actions: ['view'] },
    { slug: 'wosm-members',      label: '세계연맹 회원국', actions: ['view', 'write'] },
    { slug: 'reference-sites',   label: '기사 참고 사이트', actions: ['view', 'write'] },
  ]},
  { group: '노출', items: [
    { slug: 'hero',       label: '히어로 기사',   actions: ['view', 'write'] },
    { slug: 'home-lead',  label: '메인 스토리',   actions: ['view', 'write'] },
    { slug: 'picks',      label: '에디터 추천',   actions: ['view', 'write'] },
    { slug: 'board-copy', label: '게시판 설명',   actions: ['view', 'write'] },
    { slug: 'banner',     label: '게시판 배너',   actions: ['view', 'write'] },
    { slug: 'ticker',     label: '티커',         actions: ['view', 'write'] },
  ]},
  { group: '설정', items: [
    { slug: 'tags',         label: '태그 / 글머리',     actions: ['view', 'write'] },
    { slug: 'meta',         label: 'SEO · 메타태그',    actions: ['view', 'write'] },
    { slug: 'author',       label: '저자 · AI 고지',    actions: ['view', 'write'] },
    { slug: 'contributors', label: '기고자',           actions: ['view', 'write'] },
    { slug: 'editors',      label: '편집자 · 접근',    actions: ['view', 'write'] },
    { slug: 'translations', label: 'UI 번역',          actions: ['view', 'write'] },
  ]},
  { group: '시스템', items: [
    { slug: 'releases',         label: '버전기록',        actions: ['view'] },
    { slug: 'homepage-issues',  label: '오류 · 이슈 기록', actions: ['view', 'write'] },
    { slug: 'site-history',     label: '사이트 히스토리',  actions: ['view'] },
    { slug: 'kms',              label: 'KMS (Knowledge Management)', actions: ['view', 'write'] },
  ]},
]);

export function flattenMenuSlugs() {
  const out = [];
  for (const group of ADMIN_MENUS) {
    for (const item of group.items) out.push(item.slug);
  }
  return out;
}

export function isOwnerRole(role) {
  return role === ROLES.OWNER;
}

export function isMemberRole(role) {
  return role === ROLES.MEMBER;
}

/**
 * Parse the JSON permissions blob. Returns a normalized shape with
 * `access_admin: bool` and `permissions: Set<string>` for O(1) checks.
 */
export function parsePermissions(raw) {
  let parsed = null;
  if (typeof raw === 'string' && raw.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  }
  const accessAdmin = !!(parsed && parsed.access_admin);
  const list = Array.isArray(parsed && parsed.permissions) ? parsed.permissions : [];
  const set = new Set(list.filter((x) => typeof x === 'string'));
  return { access_admin: accessAdmin, permissions: set };
}

export function hasMenuPermission(permissions, menuSlug, action) {
  if (!permissions || !permissions.permissions) return false;
  return permissions.permissions.has(`${action}:${menuSlug}`);
}

/**
 * Fetch an active admin user by id. Returns null if not found or soft-deleted.
 */
export async function loadAdminUserById(env, id) {
  if (!env || !env.DB || !Number.isFinite(Number(id))) return null;
  const row = await env.DB.prepare(
    `SELECT id, username, display_name, role, permissions, editor_code,
            ai_daily_limit, status, must_change_password, token_min_iat,
            member_self_rename_used, created_at, last_login_at
       FROM admin_users
      WHERE id = ? AND status != 'deleted'`
  ).bind(Number(id)).first();
  return row || null;
}

export async function loadAdminUserByUsername(env, username) {
  if (!env || !env.DB || !username) return null;
  const row = await env.DB.prepare(
    `SELECT id, username, display_name, password_hash, role, permissions,
            editor_code, ai_daily_limit, status, must_change_password,
            token_min_iat, member_self_rename_used, created_at, last_login_at
       FROM admin_users
      WHERE username = ? AND status != 'deleted'`
  ).bind(String(username).trim().toLowerCase()).first();
  return row || null;
}

export async function countActiveOwners(env) {
  if (!env || !env.DB) return 0;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND status = 'active'`
  ).first();
  return Number(row && row.n) || 0;
}

/**
 * Serialize a user row for API responses. Strips password_hash; expands
 * permissions array; adds computed flags owner/member clients rely on.
 */
export function serializeAdminUser(row, { includePermissions = true } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    editor_code: row.editor_code || null,
    ai_daily_limit: row.ai_daily_limit == null ? null : Number(row.ai_daily_limit),
    status: row.status,
    must_change_password: row.must_change_password ? true : false,
    member_self_rename_used: row.member_self_rename_used ? true : false,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
  };
  if (includePermissions) {
    const parsed = parsePermissions(row.permissions);
    base.permissions = {
      access_admin: parsed.access_admin,
      permissions: Array.from(parsed.permissions).sort(),
    };
  }
  return base;
}
