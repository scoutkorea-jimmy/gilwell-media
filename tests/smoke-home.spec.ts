import { test, expect } from '@playwright/test';

// Critical path #1 — 홈 첫 로드. /api/home 응답 정상 + 마스트헤드 렌더.
test('home renders masthead and latest rail', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();

  // 마스트헤드는 첫 paint 에 보여야 함 (skip-link 또는 nav 랜드마크 둘 다 OK).
  await expect(page.locator('header').first()).toBeVisible({ timeout: 10_000 });

  // 최신 소식 rail 은 /api/home fetch 후 비동기 채워짐.
  // 'latest' 또는 '최신' 단어를 포함한 섹션 헤더가 8초 안에 나와야 함.
  await expect(page.getByText(/최신/).first()).toBeVisible({ timeout: 8_000 });
});

test('home API returns ok within 5s', async ({ request }) => {
  const response = await request.get('/api/home', { timeout: 5_000 });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  // 핵심 필드 존재 확인 — schema 변경 시 회귀 잡힘.
  expect(body).toHaveProperty('site_meta');
  expect(body).toHaveProperty('latest');
});

for (const width of [390, 1440]) {
  test(`home opens articles directly and sharing is available on the article at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem('bpmedia-analytics-transfer-consent', 'denied'));
    await page.goto('/');

    // Both SSR renderers supply the title link. The client adds the card overlay.
    await expect(page.locator('#latest-list .mini-item-overlay').first()).toBeAttached();
    await expect(page.getByRole('button', { name: /공유/, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('[data-share-url], .site-hero-share-btn, .mini-share-link')).toHaveCount(0);

    const article = page.locator('#latest-list h4 a[href^="/post/"]').first();
    const articlePath = await article.getAttribute('href');
    expect(articlePath).toMatch(/^\/post\/\d+$/);
    await article.click();
    await expect(page).toHaveURL(articlePath!);
    await page.getByRole('button', { name: '공유하기', exact: true }).click();
    await expect(page.locator('#share-modal-close')).toBeVisible();
  });
}

test('scout topic buttons keep icons, touch targets and keyboard focus', async ({ page }) => {
  for (const width of [1440, 800, 768, 601, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const links = page.locator('.scout-topic-entry .topic-links a');
    await expect(links).toHaveCount(4);
    await expect(links.locator('svg[aria-hidden="true"]')).toHaveCount(4);
    await expect(page.locator('.scout-topic-entry p')).toHaveCSS('text-align', 'center');
    const boxes = await links.evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(); return { width: r.width, top: r.top };
    }));
    expect(Math.max(...boxes.map(r => r.width)) - Math.min(...boxes.map(r => r.width))).toBeLessThan(1);
    expect(new Set(boxes.map(r => r.top)).size).toBe(width > 768 ? 1 : 2);
    const coveredWidth = await page.locator('.scout-topic-entry .topic-links').evaluate(n => {
      const buttons = n.querySelectorAll('a');
      return Math.abs(buttons[buttons.length - 1].getBoundingClientRect().right - n.getBoundingClientRect().right);
    });
    expect(coveredWidth).toBeLessThan(1);
    for (const link of await links.all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      await expect(link).toHaveCSS('text-decoration-line', 'none');
      await expect(link).toHaveCSS('border-radius', '999px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await links.first().focus();
    await expect(links.first()).toHaveCSS('outline-width', '3px');
  }
});
