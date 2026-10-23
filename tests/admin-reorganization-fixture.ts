import { expect, type Page } from '@playwright/test';
import { ADMIN_MENUS } from '../functions/_shared/admin-users.js';
import { DEFAULT_NAV_LABELS } from '../functions/_shared/nav-labels.js';

export const SYNTHETIC_POST = {
  id: 101, slug: 'synthetic-admin-test', title: '검증용 합성 기사 · 관리자 업무 흐름과 화면 확인',
  subtitle: '실제 기사나 개인정보가 아닌 로컬 검증 데이터입니다.', category: 'korea',
  tag: '검증', published: 1, views: 12, created_at: '2026-10-15 01:00:00',
  author: '합성 편집자', author_user_id: 1, meta_tags: ['합성', '검증'],
  content: JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: '로컬 합성 본문입니다. '.repeat(30) } }] }),
};

const genericPaths = new Set([
  '/api/admin/operations', '/api/admin/marketing', '/api/admin/geo-audience',
  '/api/admin/tag-insights', '/api/admin/homepage-issues', '/api/admin/site-history',
  '/api/admin/meta-tag-pool', '/api/admin/drafts', '/api/admin/search-keywords',
  '/api/admin/search-performance', '/api/admin/card-news', '/api/admin/publish-kill-switch',
  '/api/calendar', '/api/glossary', '/api/memorabilia', '/api/memorabilia/search',
  '/api/memorabilia/categories', '/api/memorabilia/events', '/api/memorabilia/event-categories',
  '/api/memorabilia/countries', '/api/memorabilia/tag-suggestions', '/api/admin/memorabilia-comments',
  '/api/settings/calendar-tags', '/api/settings/tags', '/api/settings/home-lead',
  '/api/settings/home-banners', '/api/settings/board-banner', '/api/settings/ticker',
  '/api/settings/board-copy', '/api/settings/site-meta', '/api/settings/author',
  '/api/settings/ai-disclaimer', '/api/settings/contributors', '/api/settings/editors',
  '/api/settings/translations', '/api/settings/wosm-members', '/api/settings/reference-sites',
  '/api/settings/privacy-policy',
]);
const cdnCache = new Map<string, { body: Buffer; contentType: string }>();

export async function installSyntheticAdmin(page: Page, options: {
  role?: 'owner' | 'member' | 'anonymous'; permissions?: string[]; populated?: boolean; otpEnrolled?: boolean; deferDraftSaves?: boolean;
} = {}) {
  const state = {
    role: options.role || 'owner', permissions: options.permissions || [], populated: !!options.populated,
    errors: new Map<string, number>(), reads: [] as string[], writes: [] as string[],
    unknown: [] as string[], externalApi: [] as string[], pageErrors: [] as string[], pending: 0,
    savedDraft: null as null | Record<string, any>,
    draftSaves: [] as { body: Record<string, any>; release: () => void }[],
  };
  const user = {
    id: 1, role: state.role, username: 'fixture_owner', display_name: '합성 운영자',
    status: 'active', ai_daily_limit: 10, last_login_at: '2026-10-15 01:00:00',
    permissions: { access_admin: true, permissions: state.permissions },
  };
  page.on('pageerror', error => state.pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const local = url.origin === 'http://127.0.0.1:8767';
    if (url.hostname === 'bpmedia.net' || url.hostname.endsWith('.bpmedia.net') || url.hostname === 'gilwell.media') {
      state.externalApi.push(request.method() + ' ' + request.url());
      return route.abort();
    }
    if (!local && url.pathname.startsWith('/api/')) {
      state.externalApi.push(request.method() + ' ' + request.url());
      return route.abort();
    }
    // Existing read-only runtime libraries stay real; backend responses below are synthetic.
    if (!local && ['cdn.jsdelivr.net', 'unpkg.com', 'esm.sh'].includes(url.hostname) && request.method() === 'GET') {
      let cached = cdnCache.get(request.url());
      if (!cached) {
        // A page may close while a real library is loading; its context must not dispose this response.
        const response = await fetch(request.url(), { signal: AbortSignal.timeout(20_000) });
        expect(response.ok, `Runtime library ${request.url()}`).toBe(true);
        cached = { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'application/javascript' };
        cdnCache.set(request.url(), cached);
      }
      if (page.isClosed()) return;
      return route.fulfill({ status: 200, body: cached.body, contentType: cached.contentType, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!local) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    state.pending++;
    try {
      const path = url.pathname;
      if (request.method() === 'GET') state.reads.push(path);
      else state.writes.push(request.method() + ' ' + path);
      const respond = (json: unknown, status = 200) => route.fulfill({ json, status });
      if (state.errors.has(path)) return await respond({ error: '합성 검증 API 오류' }, state.errors.get(path));
      if (path === '/api/admin/session-grace' || path === '/api/admin/session') {
        if (request.method() === 'DELETE') return await respond({ ok: true });
        return await respond({ authenticated: state.role !== 'anonymous', role: state.role === 'member' ? 'member' : 'full' }, state.role === 'anonymous' ? 401 : 200);
      }
      if (path === '/api/admin/users/me') return await respond({ user, menus: ADMIN_MENUS, menu_slugs: ADMIN_MENUS.flatMap(group => group.items.map(item => item.slug)) });
      if (path === '/api/admin/users') return await respond({ users: state.populated ? [user] : [], menus: ADMIN_MENUS, menu_slugs: [] });
      if (path === '/api/admin/presets') return await respond({ presets: [] });
      if (path === '/api/admin/totp') return await respond({ enrolled: !!options.otpEnrolled, otp_active: false });
      if (path === '/api/version') return await respond({ site_version: '00.194.00', admin_version: '03.155.02' });
      if (path === '/api/home') return await respond({ latest: [], top: [], sections: {}, posts: [] });
      if (path === '/api/settings/nav-labels') return await respond({ labels: DEFAULT_NAV_LABELS });
      if (path === '/api/settings/hero') return await respond({ manual_post_ids: state.populated ? [101] : [], interval_ms: 3000, manual_position: 'after_auto' });
      if (path === '/api/settings/score-rubric') return await respond({ content: '합성 검증용 평가 기준입니다.', isDefault: true });
      if (path === '/api/posts' || path === '/api/posts/popular') return await respond({ posts: state.populated ? [SYNTHETIC_POST] : [], total: state.populated ? 1 : 0 });
      if (path === '/api/posts/101') return await respond({ post: SYNTHETIC_POST });
      if (path === '/api/admin/analytics') return await respond({
        today: { visits: state.populated ? 12 : 0, views: state.populated ? 23 : 0 },
        summary: { range_visits: state.populated ? 84 : 0, range_pageviews: state.populated ? 161 : 0 },
        visitors: { series: state.populated ? [{ date: '2026-10-15', visits: 12 }] : [] },
        views: { series: state.populated ? [{ date: '2026-10-15', views: 23 }] : [] },
        article_top_posts: state.populated ? [{ title: SYNTHETIC_POST.title, views: 12 }] : [],
        sources: [], tracking_note: '로컬 합성 집계이며 실제 성과가 아닙니다.',
      });
      if (path === '/api/admin/ai-usage') return await respond({ today: {}, week: {}, month: {}, byDay: [], recent: [], byEndpoint: [], chart_days: 14 });
      if (path === '/api/admin/card-news/weekly') return await respond({ schedule: '매주 월요일 00:00 KST', last: null, auto_publish: false });
      if (path === '/api/admin/drafts' && request.method() === 'GET') {
        return await respond({ drafts: state.savedDraft ? [state.savedDraft] : [], max_drafts: 10, ttl_days: 14 });
      }
      if (/^\/api\/admin\/drafts(?:\/\d+)?$/.test(path) && ['POST', 'PUT'].includes(request.method())) {
        const body = request.postDataJSON();
        if (options.deferDraftSaves) {
          await new Promise<void>(release => state.draftSaves.push({ body, release }));
        }
        state.savedDraft = { ...body, id: 202, updated_at: '2026-10-15 01:00:00' };
        return await respond({ draft: state.savedDraft });
      }
      if (path === '/api/admin/ai-score-history') return await respond({
        items: state.populated ? [{ id: 1, overall_score: 85, overall_grade: 'A', input_title: SYNTHETIC_POST.title,
          actor: 'fixture_owner', created_at_kst: '2026-10-15 10:00', categories: [], overall_summary: '합성 검증 결과입니다.' }] : [],
        total: state.populated ? 1 : 0, stats: { total: state.populated ? 1 : 0, avg_score: 85, avg_latency_ms: 150, grade_distribution: { A: 1 } },
      });
      if (request.method() !== 'GET') {
        // No mutation leaves this local route handler, including automatic error reporting.
        if (path !== '/api/homepage-issues/report') state.unknown.push(request.method() + ' ' + path);
        return await respond({ ok: true });
      }
      if (!genericPaths.has(path)) state.unknown.push(path);
      return await respond({ items: [], events: [], posts: [], drafts: [], tags: [], categories: [], countries: [],
        users: [], presets: [], editors: [], total: 0, columns: [], strings: {}, summary: {}, graph: { nodes: [], edges: [] }, counts: {} });
    } finally { state.pending--; }
  });
  return state;
}

export async function openSyntheticAdmin(page: Page, options: Parameters<typeof installSyntheticAdmin>[1] = {}) {
  const state = await installSyntheticAdmin(page, options);
  await page.goto('/admin.html');
  if (state.role === 'anonymous') await expect(page.locator('#v3-login')).toBeVisible();
  else {
    await expect(page.locator('#v3-app')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/admin-session-loaded/);
    await expect.poll(() => page.evaluate(() => !!(window as any).DOMPurify && !!(window as any).EditorJS)).toBe(true);
    await expect(page.locator('.codex-editor')).toBeAttached();
  }
  return state;
}

export async function assertRenderedBounds(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const active = document.querySelector('.v3-panel.active') as HTMLElement;
    const content = document.querySelector('#v3-content') as HTMLElement;
    const rect = active.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      document: [document.documentElement.scrollWidth, innerWidth],
      panel: [rect.left, rect.right, contentRect.left, contentRect.right],
      content: [content.scrollWidth, content.clientWidth],
      overflow: [...active.querySelectorAll('*')].filter((element: Element) => {
        const e = element as HTMLElement;
        if (!e.getClientRects().length) return false;
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.right <= contentRect.right + 1) return false;
        for (let p = e.parentElement; p && p !== active; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (['auto', 'scroll', 'hidden'].includes(style.overflowX) && p.getBoundingClientRect().right <= contentRect.right + 1) return false;
        }
        return true;
      }).slice(0, 8).map(e => `${e.tagName}#${e.id}.${e.className}`),
    };
  });
  expect(result.document[0], `${label}: document ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.document[1] + 1);
  expect(result.content[0], `${label}: content ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.content[1] + 1);
  expect(result.panel[0], `${label}: left bound`).toBeGreaterThanOrEqual(result.panel[2] - 1);
  expect(result.panel[1], `${label}: right bound`).toBeLessThanOrEqual(result.panel[3] + 1);
  expect(result.overflow, `${label}: unclipped children`).toEqual([]);
}
