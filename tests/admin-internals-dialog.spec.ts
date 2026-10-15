import { test, expect } from '@playwright/test';
import { openSyntheticAdmin } from './admin-reorganization-fixture';

test('calendar dialog keeps focus inside and returns to its opener on Escape', async ({ page }) => {
  const state = await openSyntheticAdmin(page);
  await page.evaluate(() => window.V3.showPanel('calendar'));
  const opener = page.locator('#cal-new-btn');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '새 일정' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#cal-title')).toBeFocused();
  const controls = dialog.locator('button:visible:not([disabled]),input:visible:not([disabled]),select:visible:not([disabled]),textarea:visible:not([disabled])');
  await controls.last().focus();
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await expect(page.locator('#v3-app')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.locator('#v3-app')).not.toHaveAttribute('inert', '');
  expect(state.writes).toEqual([]);
  expect(state.pageErrors).toEqual([]);
  expect(state.externalApi).toEqual([]);
});

test('nested confirmation restores the underlying dialog and does not submit on Escape', async ({ page }) => {
  const state = await openSyntheticAdmin(page);
  await page.evaluate(() => window.V3.showPanel('calendar'));
  await page.locator('#cal-new-btn').click();
  await page.locator('#cal-title').fill('합성 미저장 일정');
  await page.locator('#cal-title').focus();
  await page.evaluate(() => {
    const confirmation = document.getElementById('v3-confirm')!;
    document.getElementById('confirm-title')!.textContent = '합성 확인';
    confirmation.style.display = 'flex';
  });
  await expect(page.getByRole('dialog', { name: '합성 확인' })).toBeVisible();
  await expect(page.locator('#cal-modal')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#v3-confirm')).toBeHidden();
  await expect(page.locator('#cal-title')).toBeFocused();
  await expect(page.locator('#cal-modal')).not.toHaveAttribute('inert', '');
  expect(state.writes).toEqual([]);
  expect(state.pageErrors).toEqual([]);
});

test('dynamic OTP dialog cancels through its existing callback and restores focus', async ({ page }) => {
  const state = await openSyntheticAdmin(page, { otpEnrolled: true });
  const opener = page.locator('#v3-nav [data-panel="account-users"]');
  await opener.evaluate(element => { for (let p = element.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true; });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '2단계 인증' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#otp-code-input')).toBeFocused();
  await expect(page.locator('#otp-verify-btn').evaluate(element => element.getBoundingClientRect().height)).resolves.toBeGreaterThanOrEqual(48);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('#panel-dashboard')).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.pageErrors).toEqual([]);
});

test('all static Admin dialogs receive names and focus containment at narrow width', async ({ page }) => {
  const state = await openSyntheticAdmin(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const ids = await page.locator('.v3-overlay[id],.v3-modal-backdrop[id],#marketing-fullscreen-modal').evaluateAll(elements => elements.map(element => element.id));
  expect(ids.length).toBeGreaterThanOrEqual(20);
  for (const id of ids) {
    await page.evaluate(id => {
      const overlay = document.getElementById(id)!;
      const panel = overlay.closest('.v3-panel');
      if (panel) {
        document.querySelectorAll('.v3-panel').forEach(element => element.classList.toggle('active', element === panel));
      }
      overlay.hidden = false;
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');
    }, id);
    const overlay = page.locator('#' + id);
    const dialog = await overlay.getAttribute('role') === 'dialog' ? overlay : overlay.getByRole('dialog').first();
    await expect(dialog, id).toBeVisible();
    const name = await dialog.evaluate(element => element.getAttribute('aria-label') || document.getElementById(element.getAttribute('aria-labelledby') || '')?.textContent);
    expect(name?.trim(), id).toBeTruthy();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement)), id).toBe(true);
    await page.evaluate(id => {
      const overlay = document.getElementById(id)!;
      overlay.hidden = true;
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }, id);
  }
  expect(state.writes).toEqual([]);
  expect(state.pageErrors).toEqual([]);
  expect(state.externalApi).toEqual([]);
});
