import { test, expect } from '@playwright/test';

// Critical path #2 — 공개 카테고리 보드들이 모두 200 응답 + 콘솔 에러 없음.
const PUBLIC_PAGES = [
  { path: '/korea', label: 'Korea' },
  { path: '/apr', label: 'APR' },
  { path: '/wosm', label: 'WOSM' },
  { path: '/people', label: 'Scout People' },
  { path: '/glossary', label: '용어집' },
  { path: '/wosm-members', label: '세계연맹 회원국' },
  { path: '/search', label: '검색' },
];

for (const { path, label } of PUBLIC_PAGES) {
  test(`public page ${path} loads without console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto(path);
    expect(response?.ok(), `${path} should return 200`).toBeTruthy();

    // body 가 비어있지 않아야 함 (SSR fallback 깨짐 회귀 차단).
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    // 콘솔 에러는 무시 가능한 일부 외부 origin 제외하고 0건이어야 함.
    const meaningfulErrors = consoleErrors.filter((e) =>
      !e.includes('favicon') &&
      !e.includes('analytics') &&
      !e.toLowerCase().includes('csp report')
    );
    expect(meaningfulErrors, `${label} console errors:\n${meaningfulErrors.join('\n')}`).toHaveLength(0);
  });
}

test('robots.txt and sitemap.xml are reachable', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBeTruthy();
  const robotsBody = await robots.text();
  expect(robotsBody).toContain('Sitemap');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  expect((await sitemap.text()).length).toBeGreaterThan(100);
});
