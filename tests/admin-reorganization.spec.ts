import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertRenderedBounds, openSyntheticAdmin, SYNTHETIC_POST } from './admin-reorganization-fixture';

const widths = [280, 320, 390, 820, 1280];
const artifactDir = resolve('work/gpt-admin-reorganization-20261015');
const supplementaryApis = ['/api/admin/card-news', '/api/memorabilia', '/api/memorabilia/categories', '/api/memorabilia/events', '/api/admin/memorabilia-comments'];

async function selectNavigation(page: Page, panel: string, section?: string) {
  if ((page.viewportSize()?.width || 1280) <= 900 && !(await page.locator('#v3-nav').isVisible())) {
    await page.locator('#v3-menu-toggle').click();
  }
  const selector = `#v3-nav [data-panel="${panel}"]${section ? `[data-settings-section="${section}"]` : ''}`;
  const button = page.locator(selector).first();
  await button.evaluate(element => {
    for (let p = element.parentElement; p; p = p.parentElement) {
      if (p instanceof HTMLDetailsElement) p.open = true;
    }
  });
  await button.click();
  await expect(page.locator(`#panel-${panel}`)).toBeVisible();
  if (section) await expect(page.locator(`#settings-${section}`)).toBeVisible();
  if (section === 'privacy-policy') await expect(page.locator('#privacy-policy-editor-tiptap .ProseMirror')).toBeVisible();
  await expect(button).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.v3-panel.active .v3-loading:visible')).toHaveCount(0);
}

function assertFixtureSafety(state: Awaited<ReturnType<typeof openSyntheticAdmin>>) {
  expect(state.externalApi, 'No production API or page request left the local fixture').toEqual([]);
  expect(state.pageErrors, 'Uncaught real runtime errors').toEqual([]);
  expect(state.unknown, 'Every consumed synthetic endpoint has an explicit fixture contract').toEqual([]);
}

for (const width of widths) {
  test(`anonymous hidden auth and permission surfaces at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const state = await openSyntheticAdmin(page, { role: 'anonymous' });
    await expect(page.locator('#v3-app')).toBeHidden();
    await expect(page.locator('#v3-app')).toHaveAttribute('hidden', '');
    const visibleHidden = await page.locator('[hidden]').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').map(node => node.id || node.className));
    expect(visibleHidden).toEqual([]);
    const appDisplay = await page.locator('#v3-app').evaluate(node => getComputedStyle(node).display);
    expect(appDisplay).toBe('none');
    await expect(page.locator('#marketing-fullscreen-modal')).toBeHidden();
    expect(await page.locator('#v3-app').getByRole('button', { includeHidden: true }).count()).toBeGreaterThan(0);
    expect(await page.locator('#v3-app').getByRole('button', { includeHidden: true }).first().isVisible()).toBe(false);
    expect(await page.locator('#v3-login-btn').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
    const documentWidth = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(documentWidth[0]).toBeLessThanOrEqual(documentWidth[1]);
    assertFixtureSafety(state);
  });

  test(`owner reaches every Admin destination without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const state = await openSyntheticAdmin(page);
    await expect(page.locator('#v3-login')).toBeHidden();
    expect(await page.locator('#v3-nav .v3-nav-item').count()).toBe(40);
    expect(await page.locator('#v3-nav .v3-nav-section').count()).toBe(6);
    expect(await page.locator('#v3-nav .v3-nav-section').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.navSection))).toEqual([
      'dashboard', 'analytics', 'article-operations', 'reference-data', 'display', 'operations-settings',
    ]);
    await expect(page.locator('#v3-nav a[href="/kms"]')).toHaveAttribute('target', '_blank');
    const entries = await page.locator('#v3-nav button.v3-nav-item').evaluateAll(nodes => nodes.map(node => ({
      panel: (node as HTMLElement).dataset.panel!, section: (node as HTMLElement).dataset.settingsSection,
      label: node.textContent!.trim(),
    })));
    expect(entries.length).toBe(39);
    const measured = [];
    for (const entry of entries) {
      await test.step(entry.label, async () => {
        await selectNavigation(page, entry.panel, entry.section);
        await expect(page.locator('.v3-panel.active')).toHaveCount(1);
        const heading = page.locator('.v3-panel.active h1:visible');
        await expect(heading).toHaveCount(1);
        expect((await heading.innerText()).trim()).not.toBe('');
        expect((await page.locator('#v3-panel-title').innerText()).trim()).not.toBe('');
        if (width <= 900) {
          await expect(page.locator('#v3-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
          await expect(page.locator('#v3-nav')).toBeHidden();
        }
        await assertRenderedBounds(page, `${width}px ${entry.label}`);
        if (entry.panel === 'dashboard') {
          const gridCards = await page.locator('#panel-dashboard .v3-dash-cols').evaluateAll(grids => grids.map(grid => {
            const cards = [...grid.children].filter(child => child.classList.contains('v3-card') && child.getClientRects().length);
            return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
              cards: cards.map(card => ({ top: card.getBoundingClientRect().top, margin: getComputedStyle(card).marginTop })) };
          }));
          for (const grid of gridCards) {
            expect(grid.cards.every(card => card.margin === '0px')).toBe(true);
            if (grid.columns === 2 && grid.cards.length === 2) expect(Math.abs(grid.cards[0].top - grid.cards[1].top)).toBeLessThanOrEqual(1);
          }
        }
        await expect(page.locator('.toast.error.show')).toHaveCount(0);
        measured.push(entry.label);
      });
    }
    for (const api of supplementaryApis) expect(state.reads).toContain(api);
    expect(dialogs, 'An untouched empty editor must not request discard confirmation').toEqual([]);
    assertFixtureSafety(state);
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(resolve(artifactDir, `synthetic-admin-coverage-${width}.json`), JSON.stringify({
      fixture: 'LOCAL SYNTHETIC DATA; not authenticated production evidence', width, destinations: measured, reads: [...new Set(state.reads)],
    }, null, 2));
    if (width === 390 || width === 1280) {
      await page.reload();
      await expect(page.locator('body')).toHaveClass(/admin-session-loaded/);
      await expect(page.locator('#panel-dashboard')).toBeVisible();
      await expect(page.locator('#panel-dashboard .v3-loading:visible')).toHaveCount(0);
      await expect(page.locator('#v3-nav details[name="admin-tools"]')).toHaveCount(10);
      await expect(page.locator('#v3-nav details[open]')).toHaveCount(0);
      if (width === 390) await expect(page.locator('#v3-nav')).toBeHidden();
      await assertRenderedBounds(page, `${width}px initial dashboard after reload`);
      await page.screenshot({ path: resolve(artifactDir, `synthetic-owner-dashboard-${width}.png`) });
    }
  });
}

for (const width of [390, 1280]) {
  test(`restricted member visibility and programmatic guards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const state = await openSyntheticAdmin(page, { role: 'member', permissions: ['view:hero', 'write:hero'] });
    if (width <= 900) await page.locator('#v3-menu-toggle').click();
    const allowed = await page.locator('#v3-nav .v3-nav-item').evaluateAll(nodes => nodes.filter(node => !node.hasAttribute('hidden')).map(node => ({
      panel: (node as HTMLElement).dataset.panel, section: (node as HTMLElement).dataset.settingsSection,
    })));
    expect(allowed).toEqual([{ panel: 'settings', section: 'hero' }, { panel: 'account-me', section: undefined }]);
    await expect(page.locator('#v3-nav [data-owner-only="1"]')).toHaveCount(4);
    const ownerVisible = await page.locator('[data-owner-only="1"]').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').length);
    expect(ownerVisible).toBe(0);
    const navHeaders = await page.locator('#v3-nav .v3-nav-section').evaluateAll(nodes => nodes.filter(node => !node.hasAttribute('hidden')).map(node => (node as HTMLElement).dataset.navSection));
    expect(navHeaders).toEqual(['display', 'operations-settings']);
    await selectNavigation(page, 'settings', 'hero');
    const beforeSupplementary = state.reads.filter(path => supplementaryApis.includes(path));
    await page.evaluate(() => {
      (window as any).V3.showPanel('memorabilia');
      (window as any).V3.showPanel('account-users');
      (window as any).V3.showPanel('settings', 'privacy-policy');
    });
    await expect(page.locator('#panel-account-me')).toBeVisible();
    await expect(page.locator('#panel-memorabilia')).toBeHidden();
    await expect(page.locator('#panel-account-users')).toBeHidden();
    expect(state.reads.filter(path => supplementaryApis.includes(path))).toEqual(beforeSupplementary);
    expect(state.reads).not.toContain('/api/admin/users');
    await assertRenderedBounds(page, `${width}px restricted account`);
    assertFixtureSafety(state);
  });
}

test('native groups, mobile toggle and OTP pending navigation do not run supplementary loaders', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const state = await openSyntheticAdmin(page, { otpEnrolled: true });
  await expect(page.locator('#v3-nav')).toBeHidden();
  await page.locator('#v3-menu-toggle').click();
  await expect(page.locator('#v3-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  const group = page.locator('details.v3-nav-group').filter({ has: page.locator('[data-panel="article-scorer"]') }).first();
  await expect(group).not.toHaveAttribute('open', '');
  await group.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('open', '');
  const secondGroup = page.locator('details.v3-nav-group').filter({ has: page.locator('[data-panel="memorabilia"]') }).first();
  await secondGroup.locator('summary').first().click();
  await expect(secondGroup).toHaveAttribute('open', '');
  await expect(group).not.toHaveAttribute('open', '');
  await expect(page.locator('#v3-nav details[open]')).toHaveCount(1);
  await secondGroup.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(secondGroup).not.toHaveAttribute('open', '');
  const usersBefore = state.reads.filter(path => path === '/api/admin/users').length;
  const shown = await page.evaluate(() => (window as any).V3.showPanel('account-users'));
  expect(shown).toBe(false);
  await expect(page.locator('#otp-verify-overlay')).toBeVisible();
  await expect(page.locator('#panel-account-users')).toBeHidden();
  expect(state.reads.filter(path => path === '/api/admin/users').length).toBe(usersBefore);
  assertFixtureSafety(state);
});

test('empty write exits freely while real typing preserves the draft on cancelled navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const state = await openSyntheticAdmin(page);
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await selectNavigation(page, 'write');
  await selectNavigation(page, 'calendar');
  expect(dialogs).toEqual([]);
  await selectNavigation(page, 'write');
  await page.locator('#w-title').fill('합성 검증용 미저장 제목');
  await page.locator('#v3-editorjs [contenteditable="true"]').first().fill('실제 편집기 입력으로 작성한 합성 본문입니다.');
  const before = state.reads.filter(path => supplementaryApis.includes(path));
  const moved = await page.evaluate(() => (window as any).V3.showPanel('memorabilia'));
  expect(moved).toBe(false);
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('저장하지 않은 변경사항');
  await expect(page.locator('#panel-write')).toBeVisible();
  await expect(page.locator('#w-title')).toHaveValue('합성 검증용 미저장 제목');
  expect(state.reads.filter(path => supplementaryApis.includes(path))).toEqual(before);
  assertFixtureSafety(state);
});

test('deferred autosave retains newer edits, blocks publish and cancels a discarded queued retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const state = await openSyntheticAdmin(page, { deferDraftSaves: true });
  await selectNavigation(page, 'write');
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.locator('#v3-editorjs [contenteditable="true"]').first().fill('합성 본문 A');
  await page.clock.runFor(500);
  await page.locator('#w-title').fill('합성 제목 A');
  await page.clock.runFor(1800);
  await expect.poll(() => state.draftSaves.length).toBe(1);
  expect(state.draftSaves[0].body.title).toBe('합성 제목 A');
  expect(state.draftSaves[0].body.content).toContain('합성 본문 A');
  await page.locator('#write-publish-btn').click();
  expect(state.writes.filter(write => /(?:POST|PUT|PATCH) \/api\/posts/.test(write))).toEqual([]);

  await page.locator('#w-title').fill('합성 제목 B');
  await page.locator('#v3-editorjs [contenteditable="true"]').first().fill('합성 본문 B');
  const readsBefore = state.reads.filter(path => path === '/api/admin/drafts').length;
  state.draftSaves[0].release();
  await expect.poll(() => state.reads.filter(path => path === '/api/admin/drafts').length).toBe(readsBefore + 1);
  await expect(page.locator('#w-draft-line')).not.toHaveClass(/is-saved/);
  page.once('dialog', dialog => dialog.dismiss());
  expect(await page.evaluate(() => (window as any).V3.showPanel('calendar'))).toBe(false);
  await expect(page.locator('#w-title')).toHaveValue('합성 제목 B');
  await page.clock.runFor(2300);
  await expect.poll(() => state.draftSaves.length).toBe(2);
  expect(state.draftSaves[1].body.title).toBe('합성 제목 B');
  expect(state.draftSaves[1].body.content).toContain('합성 본문 B');
  state.draftSaves[1].release();
  await expect(page.locator('#w-draft-line')).toHaveClass(/is-saved/);
  expect(state.savedDraft?.title).toBe('합성 제목 B');

  await page.locator('#w-title').fill('합성 제목 C');
  await page.clock.runFor(1800);
  await expect.poll(() => state.draftSaves.length).toBe(3);
  await page.locator('#w-title').fill('사용자가 이동하며 저장을 보류한 합성 제목 D');
  const nextReadsBefore = state.reads.filter(path => path === '/api/admin/drafts').length;
  state.draftSaves[2].release();
  await expect.poll(() => state.reads.filter(path => path === '/api/admin/drafts').length).toBe(nextReadsBefore + 1);
  page.once('dialog', dialog => dialog.accept());
  expect(await page.evaluate(() => (window as any).V3.showPanel('calendar'))).toBe(true);
  await expect(page.locator('#panel-calendar')).toBeVisible();
  await page.clock.runFor(5000);
  expect(state.draftSaves.length).toBe(3);
  expect(state.savedDraft?.title).toBe('합성 제목 C');
  assertFixtureSafety(state);
});

for (const width of [280, 390, 1280]) {
  test(`populated, empty, error, filter and dialog states at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const state = await openSyntheticAdmin(page, { populated: true });
    await expect(page.locator('#marketing-fullscreen-modal')).toBeHidden();
    await selectNavigation(page, 'list');
    await expect(page.locator('#list-tbody')).toContainText(SYNTHETIC_POST.title);
    await assertRenderedBounds(page, `${width}px populated list`);
    const listBefore = state.reads.filter(path => path === '/api/posts').length;
    await page.locator('#list-cat').selectOption('korea');
    await expect.poll(() => state.reads.filter(path => path === '/api/posts').length).toBe(listBefore + 1);
    state.populated = false;
    await page.locator('#list-cat').selectOption({ label: '전체 카테고리' });
    await expect(page.locator('#list-tbody')).toContainText('게시글이 없습니다');
    state.errors.set('/api/posts', 503);
    await page.locator('#list-cat').selectOption('korea');
    await expect(page.locator('#list-tbody')).toContainText('불러오기 실패');
    state.errors.delete('/api/posts'); state.populated = true;

    await selectNavigation(page, 'settings', 'hero');
    await expect(page.locator('#hero-slots')).toContainText(SYNTHETIC_POST.title);
    await assertRenderedBounds(page, `${width}px populated hero`);
    state.populated = false;
    expect(await page.evaluate(() => (window as any).V3.showPanel('settings', 'hero'))).toBe(false);
    await selectNavigation(page, 'dashboard');
    await selectNavigation(page, 'settings', 'hero');
    await expect(page.locator('#hero-slots')).toContainText('수동 고정 기사가 없습니다');
    state.errors.set('/api/settings/hero', 503);
    await selectNavigation(page, 'dashboard');
    await selectNavigation(page, 'settings', 'hero');
    await expect(page.locator('#hero-slots')).toContainText('불러오기 실패');
    state.errors.delete('/api/settings/hero'); state.populated = true;

    await selectNavigation(page, 'analytics-visits');
    await expect(page.locator('#analytics-stats')).toContainText('12');
    await assertRenderedBounds(page, `${width}px populated analytics`);
    const analyticsBefore = state.reads.filter(path => path === '/api/admin/analytics').length;
    await page.locator('#analytics-refresh-btn').click();
    await expect.poll(() => state.reads.filter(path => path === '/api/admin/analytics').length).toBe(analyticsBefore + 1);
    state.errors.set('/api/admin/analytics', 503);
    await expect(page.locator('#analytics-refresh-btn')).toBeEnabled();
    await page.locator('#analytics-refresh-btn').click();
    await expect(page.locator('#analytics-live-meta')).toContainText('갱신 실패');
    await expect(page.locator('#analytics-live-meta')).toContainText('마지막 성공');
    await expect(page.locator('#analytics-body')).toContainText(SYNTHETIC_POST.title);
    state.errors.delete('/api/admin/analytics');

    await selectNavigation(page, 'ai-score-history');
    await expect(page.locator('#ai-score-history-list')).toContainText(SYNTHETIC_POST.title);
    await assertRenderedBounds(page, `${width}px populated score history`);
    const scoreBefore = state.reads.filter(path => path === '/api/admin/ai-score-history').length;
    await page.locator('#ai-score-history-apply-btn').click();
    await expect.poll(() => state.reads.filter(path => path === '/api/admin/ai-score-history').length).toBe(scoreBefore + 1);
    state.populated = false;
    await page.locator('#ai-score-history-refresh-btn').click();
    await expect(page.locator('#ai-score-history-list')).toContainText('조건에 맞는 기록이 없습니다');
    state.errors.set('/api/admin/ai-score-history', 503);
    await page.locator('#ai-score-history-refresh-btn').click();
    await expect(page.locator('#ai-score-history-list')).toContainText('불러오기 실패');

    await selectNavigation(page, 'calendar');
    await page.locator('#cal-new-btn').click();
    await expect(page.locator('#cal-modal')).toBeVisible();
    const modal = await page.locator('#cal-modal .v3-modal').boundingBox();
    expect(modal!.x).toBeGreaterThanOrEqual(0);
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(width + 1);
    expect(await page.locator('#cal-modal .v3-modal').evaluate(node => node.scrollTop)).toBe(0);
    if (width === 390) await page.screenshot({ path: resolve(artifactDir, 'synthetic-calendar-dialog-390.png') });
    const writesBefore = state.writes.length;
    await page.locator('#cal-save-btn').click();
    await expect(page.locator('#cal-modal')).toBeVisible();
    expect(state.writes.length).toBe(writesBefore);
    if (width === 390) await page.screenshot({ path: resolve(artifactDir, 'synthetic-calendar-validation-dialog-390.png') });
    await page.locator('#cal-modal-close').click();
    await expect(page.locator('#cal-modal')).toBeHidden();
    await assertRenderedBounds(page, `${width}px calendar after dialog`);
    if (width === 390) {
      await selectNavigation(page, 'list');
      await page.screenshot({ path: resolve(artifactDir, 'synthetic-owner-list-empty-390.png') });
      await selectNavigation(page, 'calendar');
      await page.locator('#cal-new-btn').click();
      expect(await page.locator('#cal-modal .v3-modal').evaluate(node => node.scrollTop)).toBe(0);
    }
    assertFixtureSafety(state);
  });
}
