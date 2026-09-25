import { test, expect } from '@playwright/test';

const PUBLIC_PATHS = [
  '/', '/latest', '/korea', '/apr', '/wosm', '/people', '/glossary',
  '/wosm-members', '/calendar', '/memorabilia', '/search?q=스카우트',
  '/jamboree16', '/contributors', '/about', '/privacy', '/editorial-policy',
  '/post/6', '/post/385',
];

for (const viewport of [
  { name: 'compact', width: 390, height: 844 },
  { name: 'medium', width: 820, height: 1000 },
  { name: 'expanded', width: 1440, height: 1000 },
]) {
  test(`${viewport.name}: 공개 화면 전체가 가로로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of PUBLIC_PATHS) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.ok(), `${path} 응답`).toBeTruthy();
      await page.waitForTimeout(350);
      const layout = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        hasM3: [...document.styleSheets].some((sheet) => String(sheet.href || '').includes('/css/m3-site.css')),
      }));
      expect(layout.hasM3, `${path} M3 스타일시트`).toBe(true);
      expect(layout.scroll - layout.client, `${path} 가로 넘침(px)`).toBeLessThanOrEqual(1);
    }
  });
}

test('홈 카드 역할은 대표 박스와 선형 목록으로 명확히 분리된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.waitForTimeout(3_000);

  const result = await page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        borderTop: style.borderTopWidth,
        borderLeft: style.borderLeftWidth,
        background: style.backgroundColor,
      };
    };
    return {
      lead: box('.home-lead-card'),
      rail: box('.home-priority-latest .home-rail-card'),
      row: box('#latest-list .mini-item'),
    };
  });

  expect(result.lead.top).toBe(result.rail.top);
  expect(Math.abs(result.lead.bottom - result.rail.bottom)).toBeLessThanOrEqual(1);
  expect(result.lead.borderTop).toBe('0px');
  expect(result.lead.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.rail.borderTop).toBe('0px');
  expect(result.rail.background).toBe('rgba(0, 0, 0, 0)');
  expect(result.row.borderTop).toBe('0px');
  expect(result.row.borderLeft).toBe('0px');
});

test('기사 상단과 보조 정보는 중첩 외곽선을 만들지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/post/385');
  await page.waitForTimeout(1_500);

  const styles = await page.evaluate(() => {
    const read = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector) as Element);
      return {
        border: style.borderTopWidth,
        paddingTop: style.paddingTop,
        background: style.backgroundColor,
      };
    };
    return {
      actions: read('.post-page-share'),
      sidebar: read('.post-page-sidebar'),
      sidebarSection: read('.post-page-sidebar .pps-section'),
    };
  });

  expect(styles.actions).toMatchObject({ border: '0px', paddingTop: '0px', background: 'rgba(0, 0, 0, 0)' });
  expect(styles.sidebar.border).toBe('0px');
  expect(styles.sidebar.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.sidebarSection.border).toBe('0px');
  expect(styles.sidebarSection.background).toBe('rgba(0, 0, 0, 0)');
});

test('캘린더 날짜 셀은 버튼 공통 pill 모양을 상속하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto('/calendar');
  await expect(page.locator('.calendar-day').first()).toBeVisible({ timeout: 10_000 });
  const radius = await page.locator('.calendar-day').first().evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radius).toBe('0px');
});

test('공개 화면의 보이는 버튼은 이름과 최소 터치 크기를 가진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/korea', '/calendar', '/glossary', '/wosm-members', '/search?q=스카우트', '/post/385']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const issues = await page.locator('button').evaluateAll((buttons) => buttons.flatMap((button) => {
      const el = button as HTMLButtonElement;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
      const problems: string[] = [];
      if (!name) problems.push('accessible-name');
      if (rect.width < 24 || rect.height < 24) problems.push(`size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
      return problems.length ? [`${el.className || el.id || el.tagName}: ${problems.join(', ')}`] : [];
    }));
    expect(issues, `${path} 버튼 문제`).toEqual([]);
  }
});
