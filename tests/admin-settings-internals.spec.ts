import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { installSyntheticAdmin, assertRenderedBounds, SYNTHETIC_POST } from './admin-reorganization-fixture';
import { ADMIN_MENUS } from '../functions/_shared/admin-users.js';
import { DEFAULT_NAV_LABELS } from '../functions/_shared/nav-labels.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z6sAAAAASUVORK5CYII=';
const banner = { id: 7, title: '합성 홈 배너 · 내용과 저장 대상 확인', image_url: 'data:image/png;base64,' + PNG, link_url: '/korea', starts_at: '2026-10-15 09:30:00', ends_at: '2026-10-20 14:30:00', active: 1, sort_order: 0 };
const targetUser = { id: 2, role: 'member', username: 'fixture_member', display_name: '합성 사용자', status: 'active', editor_code: 'Editor.B', permissions: { access_admin: true, permissions: ['view:hero'] }, must_change_password: 0, ai_daily_limit: 10 };
const preset = { id: 1, slug: 'fixture-preset', name: '합성 기본 프리셋', description: '실제 계정 변경과 무관한 로컬 fixture', is_builtin: 1, permissions: { access_admin: true, permissions: ['view:hero'] } };
const managed = ['hero', 'home-lead', 'home-banners', 'picks', 'tags', 'meta', 'board-copy', 'author', 'banner', 'ticker', 'contributors', 'editors', 'nav-labels', 'translations', 'privacy-policy'];

async function setup(page: Page, options: { role?: 'owner' | 'member'; permissions?: string[] } = {}) {
  const base = await installSyntheticAdmin(page, { populated: true, ...options });
  const state = { writes: [] as { method: string; path: string; body: any }[], fail: new Map<string, number>(), defer: new Set<string>(), deferReads: new Set<string>(), pending: [] as { path: string; release: () => void }[], reads: new Map<string, number>() };
  const payloads: Record<string, any> = {
    hero: { manual_post_ids: [101], interval_ms: 3000, manual_position: 'after_auto', revision: 3 },
    'home-lead': { post: SYNTHETIC_POST, mode: 'manual', revision: 3, media: { fit: 'cover', desktop: { position_x: 50, position_y: 50, zoom: 100 }, mobile: { position_x: 50, position_y: 50, zoom: 100 } } },
    'home-banners': { banners: [banner], revision: 3 }, tags: { common: ['공통 태그'], categories: { korea: ['활동'], apr: ['지역'], wosm: ['세계'], people: ['인물'] } },
    'site-meta': { pages: { home: { title: '합성 홈 제목', description: '합성 설명' } }, footer: { title: '합성 사이트', raw_text: 'Retain hidden footer', description: '운영 설명', tip_email: 'fixture@example.invalid', contact_email: 'fixture@example.invalid' }, image_url: 'https://example.invalid/retain.png', revision: 3 },
    'board-copy': Object.fromEntries(['latest', 'korea', 'apr', 'wosm', 'people', 'glossary', 'calendar', 'contributors', 'wosm_members'].map(key => [key, { description: '합성 ' + key + ' 설명. 긴 내용과 입력 위계를 확인합니다. '.repeat(3) }])),
    author: { author: '합성 기본 저자' }, 'ai-disclaimer': { text: '합성 AI 고지 문구' },
    'board-banner': { items: { korea: { event_name: '합성 게시판 배너', event_date: '2026-10-15' } } }, ticker: { items: ['합성 티커 첫 줄', '긴 티커 문구로 내용 확인 '.repeat(4)] },
    contributors: { items: [{ name: '합성 기여자 A', note: '기록 도움', date: '2026-10-15' }, { name: '합성 기여자 B', note: '자료 도움', date: '' }], revision: 3 },
    editors: { editors: { A: '합성 저자 A', B: '합성 저자 B', C: '합성 저자 C' } }, 'nav-labels': { labels: DEFAULT_NAV_LABELS },
    translations: { strings: { 'sample.long.translation.key': { ko: '합성 국문 문구', en: 'Synthetic English copy' }, 'sample.single': '합성 단일 문구' } },
    'privacy-policy': { html: '<h2>합성 개인정보 처리방침</h2><p>실제 개인정보나 법률 문서가 아닌 로컬 검증 본문입니다.</p>', updated_at: '2026-10-15T00:00:00Z', is_default: false, max_chars: 100000, revision: 3 },
    'feature-definition': { content: '# 합성 운영 기준\n\n## 0. 문서 목적과 사용 순서\n로컬 편집 보호 검증 본문입니다.', revision: 3 },
  };
  payloads['board-copy'].revision = 3;
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (url.origin !== 'http://127.0.0.1:8767') return route.fallback();
    const setting = path.startsWith('/api/settings/') && path.split('/').pop()!;
    const owned = setting && payloads[setting] || ['/api/posts/102', '/api/version', '/api/admin/users', '/api/admin/presets', '/api/admin/homepage-issues', '/api/admin/site-history', '/api/admin/password'].includes(path) || /^\/api\/admin\/(users|presets|homepage-issues)\/\d+$/.test(path);
    if (!owned) return route.fallback();
    const method = req.method();
    if (method === 'GET') state.reads.set(path, (state.reads.get(path) || 0) + 1);
    else state.writes.push({ method, path, body: req.postData() ? req.postDataJSON() : null });
    const failure = state.fail.get(method + ' ' + path);
    const readSnapshot = setting && method === 'GET' ? JSON.parse(JSON.stringify(payloads[setting])) : null;
    if ((state.defer.has(path) && method !== 'GET') || (state.deferReads.has(path) && method === 'GET')) await new Promise<void>(release => state.pending.push({ path, release }));
    if (failure) return route.fulfill({ status: failure, json: { error: failure === 409 ? '합성 동시 변경 감지' : '합성 요청 실패' } });
    if (setting) {
      if (method !== 'GET') {
        const body = req.postDataJSON();
        if (setting === 'home-banners') payloads[setting] = { banners: body.banners, revision: 4 };
        else if (setting === 'site-meta') payloads[setting] = { ...body, revision: 4 };
        else if (setting === 'feature-definition') payloads[setting] = { ...body, revision: 4 };
        else if (setting === 'privacy-policy' && method === 'PUT') payloads[setting] = { ...payloads[setting], html: body.html, revision: 4 };
        else if (setting === 'home-lead') payloads[setting] = { ...payloads[setting], post: body.post_id ? { ...SYNTHETIC_POST, id: body.post_id, title: body.post_id === 102 ? '새로 고른 합성 기사' : SYNTHETIC_POST.title } : null, media: body.media || payloads[setting].media, mode: body.mode === 'auto' ? 'auto' : 'manual', revision: 4 };
      }
      return route.fulfill({ json: method === 'GET' ? readSnapshot : payloads[setting] });
    }
    if (path === '/api/version') return route.fulfill({ json: { site_version: readFileSync('public/VERSION', 'utf8').trim(), admin_version: readFileSync('public/ADMIN_VERSION', 'utf8').trim() } });
    if (path === '/api/posts/102') return route.fulfill({ json: { post: { ...SYNTHETIC_POST, id: 102, title: '새로 고른 합성 기사' } } });
    if (path === '/api/admin/users') return route.fulfill({ json: { users: [targetUser], menus: ADMIN_MENUS, menu_slugs: [] } });
    if (path === '/api/admin/presets') return route.fulfill({ json: { presets: [preset], menus: ADMIN_MENUS, menu_slugs: [] } });
    if (path === '/api/admin/homepage-issues') return route.fulfill({ json: { items: [{ id: 5, title: '합성 이슈 · 상태 적용 확인', summary: '이 기록은 로컬 검증 자료입니다.', severity: 'high', status: 'open', area: 'admin', updated_at: '2026-10-15 00:00:00' }] } });
    if (path === '/api/admin/site-history') return route.fulfill({ json: { items: [], sources: { operational: true, issues: true, settings: false, posts: true }, partial: true } });
    return route.fulfill({ json: { ok: true, success: true, user: targetUser, propagated_members: 1, item: { id: 5, title: '합성 이슈', issue_type: 'issue', area: 'admin', updated_at: '2026-10-15 00:00:00', severity: 'high', status: req.postDataJSON()?.status || 'open' } } });
  });
  await page.goto('/admin.html');
  await expect(page.locator('#v3-app')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/admin-session-loaded/);
  return { base, state, payloads };
}

async function navigate(page: Page, panel: string, section?: string) {
  if ((page.viewportSize()?.width || 1280) <= 900 && !await page.locator('#v3-nav').isVisible()) await page.locator('#v3-menu-toggle').click();
  const button = page.locator(`#v3-nav [data-panel="${panel}"]${section ? `[data-settings-section="${section}"]` : ''}`).first();
  await button.evaluate(element => { for (let p = element.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true; });
  await button.click();
  await expect(page.locator('#panel-' + panel)).toBeVisible();
  if (section) await expect(page.locator('#settings-' + section)).toBeVisible();
  if (section && section !== 'picks') await expect(page.locator('#settings-' + section)).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.v3-panel.active .v3-loading:visible')).toHaveCount(0);
}

for (const width of [280, 320, 390, 820, 1280]) test(`all settings/operations/account populated internals at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  const { base } = await setup(page);
  for (const section of managed) {
    await navigate(page, 'settings', section);
    if (section !== 'picks') await expect(page.locator('#settings-' + section + ' [data-settings-status]')).toContainText('현재 설정을 불러왔습니다');
    await assertRenderedBounds(page, width + ' settings/' + section);
    const missing = await page.locator('#settings-' + section + ' input:not([type=hidden]), #settings-' + section + ' textarea, #settings-' + section + ' select').evaluateAll(nodes => nodes.filter(node => !(node as HTMLElement).getAttribute('aria-label') && !(node.id && document.querySelector(`label[for="${node.id}"]`)) && !node.closest('label')).map(node => node.id));
    expect(missing).toEqual([]);
    if (width === 390 || width === 1280) { mkdirSync('work/admin-settings-internals', { recursive: true }); await page.screenshot({ path: `work/admin-settings-internals/${section}-${width}.png`, fullPage: true }); }
  }
  for (const panel of ['releases', 'homepage-issues', 'site-history', 'account-me', 'account-users', 'account-presets']) { await navigate(page, panel); await assertRenderedBounds(page, width + ' ' + panel); }
  await expect(page.locator('#account-presets-list')).toContainText('합성 기본 프리셋');
  await page.locator('[data-preset-action="edit"]').click();
  await expect(page.locator('#account-preset-slug')).toBeDisabled();
  await expect(page.locator('#account-preset-modal [role="dialog"]')).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('#account-preset-modal')).toBeHidden();
  expect(base.externalApi).toEqual([]); expect(base.pageErrors).toEqual([]);
  if (width === 390 || width === 1280) { mkdirSync('work/admin-settings-internals', { recursive: true }); await navigate(page, 'settings', 'contributors'); await page.screenshot({ path: `work/admin-settings-internals/contributors-${width}.png`, fullPage: true }); }
});

test('home/board banner exact binding, input/upload preservation, deferred save and leave guard', async ({ page }) => {
  const { state } = await setup(page);
  await navigate(page, 'settings', 'home-banners');
  await expect(page.locator('#settings-home-banners')).toContainText('저장된 시작: 2026-10-15 18:30 KST');
  await expect(page.locator('#settings-home-banners')).toContainText('저장된 종료: 2026-10-20 23:30 KST');
  await expect(page.locator('#settings-home-banners')).toContainText('날짜 입력은 UTC 기준');
  await expect(page.locator('.hb-start')).toHaveValue('2026-10-15');
  await expect(page.locator('.hb-end')).toHaveValue('2026-10-20');
  await page.locator('.hb-title').fill('첫 배너의 저장 전 입력');
  await page.locator('.hb-link').fill('/apr');
  await page.locator('#banner-add-btn').click();
  await expect(page.locator('.hb-title').first()).toHaveValue('첫 배너의 저장 전 입력');
  await page.locator('.hb-title').nth(1).fill('두 번째 배너');
  await page.locator('.hb-file').nth(1).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await expect(page.locator('#settings-home-banners')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.hb-link').first()).toHaveValue('/apr');
  await page.locator('.hb-end').first().fill('2026-10-21');
  state.defer.add('/api/settings/home-banners');
  await page.locator('#home-banners-save-btn').click();
  await expect.poll(() => state.pending.length).toBe(1);
  await expect(page.locator('.hb-title').first()).toBeDisabled();
  expect(await page.evaluate(() => (window as any).V3.showPanel('settings', 'banner'))).toBe(false);
  expect(state.writes.filter(write => write.path === '/api/settings/home-banners')).toHaveLength(1);
  expect(state.writes.find(write => write.path === '/api/settings/home-banners')!.body.banners[0].starts_at).toBe(banner.starts_at);
  expect(state.writes.find(write => write.path === '/api/settings/home-banners')!.body.banners[0].ends_at).toBe('2026-10-21');
  state.pending.shift()!.release();
  await expect(page.locator('#settings-home-banners')).toHaveAttribute('aria-busy', 'false');
  await navigate(page, 'settings', 'banner');
  await page.locator('#banner-korea-name').fill('게시판 저장 대상 확인');
  await page.locator('#banner-save-btn').click();
  await expect.poll(() => state.writes.filter(write => write.path === '/api/settings/board-banner').length).toBe(1);
  expect(state.writes.filter(write => write.path === '/api/settings/home-banners')).toHaveLength(1);
  expect(await page.locator('[id="banner-save-btn"]').count()).toBe(1);
});

test('failed loads block saving, conflict preserves meta and author reports partial save', async ({ page }) => {
  const { state } = await setup(page);
  state.fail.set('GET /api/settings/ticker', 403);
  await navigate(page, 'settings', 'ticker');
  await expect(page.locator('#ticker-save-btn')).toBeDisabled();
  await expect(page.locator('#settings-ticker [data-settings-status]')).toContainText('합성 요청 실패');
  state.fail.delete('GET /api/settings/ticker');
  await page.locator('[data-settings-retry]').click();
  await expect(page.locator('#ticker-save-btn')).toBeEnabled();
  await navigate(page, 'settings', 'meta');
  await page.locator('#meta-title-home').fill('입력을 보존하는 제목');
  state.fail.set('PUT /api/settings/site-meta', 409);
  await page.locator('#meta-save-btn').click();
  await expect(page.locator('#settings-meta [data-settings-status]')).toContainText('합성 동시 변경 감지');
  await expect(page.locator('#meta-title-home')).toHaveValue('입력을 보존하는 제목');
  const put = state.writes.find(write => write.path === '/api/settings/site-meta')!;
  expect(put.body.image_url).toBe('https://example.invalid/retain.png'); expect(put.body.footer.raw_text).toBe('Retain hidden footer'); expect(put.body.if_revision).toBe(3);
  page.once('dialog', dialog => dialog.dismiss());
  expect(await page.evaluate(() => (window as any).V3.showPanel('settings', 'author'))).toBe(false);
  page.once('dialog', dialog => dialog.accept());
  await navigate(page, 'settings', 'author');
  await page.locator('#s-author-name').fill('부분 저장 저자'); state.fail.set('PUT /api/settings/ai-disclaimer', 500);
  await page.locator('#author-save-btn').click();
  await expect(page.locator('#settings-author [data-settings-status]')).toContainText('일부 항목만 저장');
  await expect(page.locator('#s-author-name')).toHaveValue('부분 저장 저자');
});

test('contributor keyboard order and protected author codes', async ({ page }) => {
  const { state } = await setup(page); await navigate(page, 'settings', 'contributors');
  await page.locator('[data-contrib-i="0"][data-field="name"]').fill('입력 유지 기여자');
  await page.locator('[data-contrib-move="0"][data-direction="1"]').click();
  await expect(page.locator('[data-contrib-i="1"][data-field="name"]')).toHaveValue('입력 유지 기여자');
  await page.locator('#contrib-save-btn').click(); await expect.poll(() => state.writes.some(write => write.path === '/api/settings/contributors')).toBe(true);
  const body = state.writes.find(write => write.path === '/api/settings/contributors')!.body; expect(body.items[1].name).toBe('입력 유지 기여자'); expect(body.if_revision).toBe(3);
  await navigate(page, 'settings', 'editors'); await expect(page.locator('#editors-list button:disabled')).toHaveCount(3);
  await page.locator('#editors-add-btn').click(); await expect(page.locator('[data-editor-i="3"]')).toBeFocused();
});

test('account nested permissions commit once; every cancellation sends zero requests', async ({ page }) => {
  const { state } = await setup(page); await navigate(page, 'account-users');
  await page.locator('[data-action="edit"][data-id="2"]').click();
  await page.locator('#account-user-open-permissions-btn').click();
  await page.locator('[data-perm="write:hero"]').check(); await page.locator('#account-permission-save-btn').click();
  expect(state.writes.filter(write => write.path === '/api/admin/users/2')).toHaveLength(0);
  await page.locator('#account-user-submit-btn').click(); await expect.poll(() => state.writes.filter(write => write.path === '/api/admin/users/2').length).toBe(1);
  expect(state.writes.find(write => write.path === '/api/admin/users/2')!.body.permissions.permissions).toContain('write:hero');
  await expect(page.locator('#account-user-modal')).toBeHidden();
  const count = state.writes.length;
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-action="delete"]').click(); expect(state.writes).toHaveLength(count);
  for (const choice of ['정지', '삭제', '완전 삭제']) {
    const answer = async (dialog: any) => { if (dialog.type() === 'prompt') await dialog.accept(choice); else await dialog.dismiss(); };
    page.on('dialog', answer); await page.locator('[data-action="delete"]').click(); page.off('dialog', answer); expect(state.writes).toHaveLength(count);
  }
  await navigate(page, 'site-history'); await expect(page.locator('#site-history-meta')).toContainText('설정 이력'); await expect(page.locator('#site-history-meta')).toContainText('최근 최대 350');
});

test('readonly issues hide mutation controls and record refresh keeps filters', async ({ page }) => {
  const { state } = await setup(page, { role: 'member', permissions: ['view:homepage-issues', 'view:releases'] });
  await navigate(page, 'homepage-issues'); await expect(page.locator('#homepage-issues-list select')).toHaveCount(0); await expect(page.locator('#homepage-issues-list')).toContainText('읽기 전용');
  await navigate(page, 'releases'); await page.locator('#releases-search').fill('관리자'); await page.locator('#releases-refresh-btn').click(); await expect(page.locator('#releases-search')).toHaveValue('관리자');
  expect(state.writes).toEqual([]);
});

test('privacy source fallback retains loaded HTML and KMS conflict/dirty/busy guards', async ({ page }) => {
  const { state } = await setup(page);
  await page.route('https://esm.sh/@tiptap/**', route => route.abort());
  await navigate(page, 'settings', 'privacy-policy');
  await expect(page.locator('#privacy-policy-editor-source')).toBeVisible();
  expect(await page.locator('#privacy-policy-editor-source').inputValue()).toContain('합성 개인정보 처리방침');
  await page.goto('/kms.html'); await expect(page.locator('#kms-screen')).toBeVisible(); await page.locator('[data-kms-mode="edit"]').click();
  await page.locator('#kms-editor-input').fill('# 변경 중인 합성 운영 기준'); state.fail.set('PUT /api/settings/feature-definition', 409);
  await page.locator('#kms-save-btn').click(); await expect(page.locator('#kms-editor-input')).toBeEnabled(); await expect(page.locator('#kms-editor-input')).toHaveValue('# 변경 중인 합성 운영 기준');
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-kms-mode="read"]').click(); await expect(page.locator('#kms-editor-panel')).toBeVisible();
  state.fail.delete('PUT /api/settings/feature-definition'); state.defer.add('/api/settings/feature-definition'); await page.locator('#kms-save-btn').click();
  await expect.poll(() => state.pending.length).toBe(1); await expect(page.locator('#kms-editor-input')).toBeDisabled();
  state.pending.shift()!.release(); await expect(page.locator('#kms-editor-panel')).toBeHidden();
});

test('issue row request lock and account dirty/cancel/error preserve entered values', async ({ page }) => {
  const { state } = await setup(page); await navigate(page, 'homepage-issues');
  state.defer.add('/api/admin/homepage-issues/5');
  await page.locator('#homepage-issue-status-5').selectOption('resolved'); await page.locator('#homepage-issues-list button').click();
  await expect.poll(() => state.pending.length).toBe(1); await expect(page.locator('#homepage-issue-status-5')).toBeDisabled();
  await page.evaluate(() => (window as any).V3.updateHomepageIssueStatus(5));
  expect(state.writes.filter(write => write.path === '/api/admin/homepage-issues/5')).toHaveLength(1);
  state.pending.shift()!.release(); await expect(page.locator('#homepage-issues-list')).toContainText('해결됨');
  await navigate(page, 'account-users'); await page.locator('[data-action="edit"]').click(); await page.locator('#account-user-display-name').fill('보존할 표시 이름');
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape'); await expect(page.locator('#account-user-modal')).toBeVisible();
  await expect(page.locator('#account-user-display-name')).toHaveValue('보존할 표시 이름');
  state.fail.set('PUT /api/admin/users/2', 409); await page.locator('#account-user-submit-btn').click();
  await expect(page.locator('#account-user-form-status')).toContainText('합성 동시 변경 감지'); await expect(page.locator('#account-user-display-name')).toHaveValue('보존할 표시 이름');
  page.once('dialog', dialog => dialog.accept()); await page.keyboard.press('Escape'); await expect(page.locator('#account-user-modal')).toBeHidden();
  await navigate(page, 'account-me'); await page.locator('#account-me-current-password').fill('fixture-current-only'); await page.locator('#account-me-new-password').fill('fixture-next-only'); await page.locator('#account-me-new-password-confirm').fill('fixture-next-only');
  state.defer.add('/api/admin/password'); state.fail.set('POST /api/admin/password', 403); await page.locator('#account-me-password-form button[type=submit]').click();
  await expect.poll(() => state.pending.length).toBe(1); await expect(page.locator('#account-me-new-password')).toBeDisabled(); state.pending.shift()!.release();
  await expect(page.locator('#account-me-password-status')).toContainText('합성 요청 실패'); await expect(page.locator('#account-me-new-password')).toHaveValue('fixture-next-only');
});

test('real privacy rich text dirty state and preset pending close protection', async ({ page }) => {
  const { state } = await setup(page); await navigate(page, 'settings', 'privacy-policy');
  await expect(page.locator('#settings-privacy-policy .v3-card-desc')).toContainText('기본값 복원은 확인 후 즉시 반영됩니다');
  await expect(page.locator('#settings-privacy-policy .v3-card-desc')).not.toContainText(/Tiptap|DOMPurify|sanitize|script|deployment/);
  await expect(page.locator('#settings-privacy-policy .v3-label')).toHaveText('본문 · 최대 100,000자');
  const editor = page.locator('#privacy-policy-editor-tiptap .ProseMirror'); await expect(editor).toBeVisible(); await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' 편집 보존 검증');
  await expect(page.locator('#settings-privacy-policy [data-settings-status]')).toContainText('저장하지 않은 변경사항');
  page.once('dialog', dialog => dialog.dismiss()); expect(await page.evaluate(() => (window as any).V3.showPanel('account-presets'))).toBe(false);
  await page.locator('#privacy-policy-save-btn').click(); await expect(page.locator('#settings-privacy-policy [data-settings-status]')).toContainText('저장했습니다');
  expect(state.writes.find(write => write.path === '/api/settings/privacy-policy')!.body.html).toContain('편집 보존 검증');
  await navigate(page, 'account-presets'); await page.locator('[data-preset-action="edit"]').click(); await page.locator('#account-preset-name').fill('변경 중 프리셋');
  state.defer.add('/api/admin/presets/1'); await page.locator('#account-preset-save-btn').click(); await expect.poll(() => state.pending.length).toBe(1);
  await expect(page.locator('#account-preset-name')).toBeDisabled(); await page.keyboard.press('Escape'); await expect(page.locator('#account-preset-modal')).toBeVisible();
  state.pending.shift()!.release(); await expect(page.locator('#account-preset-modal')).toBeHidden();
});

test('reentered settings ignore a delayed older read after the latest value is edited', async ({ page }) => {
  const { state, payloads, base } = await setup(page);
  state.deferReads.add('/api/settings/ticker');
  await page.evaluate(() => (window as any).V3.showPanel('settings', 'ticker'));
  await expect.poll(() => state.pending.length).toBe(1);
  await navigate(page, 'settings', 'hero'); state.deferReads.delete('/api/settings/ticker');
  payloads.ticker = { items: ['최신 조회 문구'] }; await navigate(page, 'settings', 'ticker');
  await expect(page.locator('#s-ticker')).toHaveValue('최신 조회 문구'); await page.locator('#s-ticker').fill('최신 조회 이후 입력 보존');
  const finished = page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings/ticker'); state.pending.shift()!.release(); await finished;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('#s-ticker')).toHaveValue('최신 조회 이후 입력 보존'); await expect(page.locator('#settings-ticker [data-settings-status]')).toContainText('저장하지 않은 변경사항');
  expect(base.pageErrors).toEqual([]);
});

test('main story cannot save the previous article while a newly selected article is loading', async ({ page }) => {
  const { state } = await setup(page); await navigate(page, 'settings', 'home-lead');
  state.deferReads.add('/api/posts/102'); await page.evaluate(() => (window as any).V3._selectHomeLead(102));
  await expect.poll(() => state.pending.length).toBe(1); await expect(page.locator('#home-lead-save-btn')).toBeDisabled();
  await page.evaluate(() => { (window as any).V3._selectHomeLead(102); (document.getElementById('home-lead-save-btn') as HTMLButtonElement).click(); });
  expect(state.writes.filter(write => write.path === '/api/settings/home-lead')).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).V3.showPanel('dashboard'))).toBe(false);
  state.pending.shift()!.release(); await expect(page.locator('#home-lead-selected')).toContainText('새로 고른 합성 기사'); await expect(page.locator('#home-lead-save-btn')).toBeEnabled();
  await page.locator('#home-lead-save-btn').click(); await expect.poll(() => state.writes.filter(write => write.path === '/api/settings/home-lead').length).toBe(1);
  const saved = state.writes.find(write => write.path === '/api/settings/home-lead')!.body; expect(saved.post_id).toBe(102); expect(saved.if_revision).toBe(3);
});
