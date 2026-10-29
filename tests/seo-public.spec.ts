import { test, expect } from '@playwright/test';
test('자바스크립트 없이 기사 목록과 페이지 링크를 읽는다', async ({ browser, baseURL }) => {
  for (const width of [390,1440]) {
    const context = await browser.newContext({javaScriptEnabled:false,viewport:{width,height:900}});
    const page = await context.newPage();
    await page.goto(baseURL + '/korea?page=2');
    await expect(page.locator('#board-grid .post-card')).toHaveCount(16);
    await expect(page.locator('#board-pagination a[aria-current="page"]')).toHaveText('2');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',baseURL + '/korea?page=2');
    expect(await page.locator('#board-grid a').first().getAttribute('href')).toMatch(/^\/post\/\d+$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
  }
});
test('페이지 이동과 새로고침이 같은 기사 목록을 유지한다', async ({page}) => {
  await page.goto('/korea');
  await expect(page.locator('#board-grid .post-card')).toHaveCount(16);
  await page.locator('#board-pagination a').filter({hasText:/^2$/}).click();
  await expect(page).toHaveURL(/\?page=2$/);
  const first = await page.locator('#board-grid .post-card-title-link').first().getAttribute('href');
  await page.reload();
  await expect(page.locator('#board-grid .post-card-title-link').first()).toHaveAttribute('href',first!);
});
test('공개 자료와 정책이 자바스크립트 없이 로딩 문구를 대신한다', async ({browser,baseURL}) => {
  const context = await browser.newContext({javaScriptEnabled:false});
  const page = await context.newPage();
  for (const [path,selector] of [['glossary','#glossary-results'],['wosm-members','#wosm-members-body'],['privacy','#privacy-body'],['calendar','#calendar-grid'],['memorabilia','#memo-grid']]) {
    await page.goto(baseURL + '/' + path);
    await expect(page.locator(selector)).not.toBeEmpty();
    await expect(page.locator(selector)).not.toContainText('불러오는 중');
  }
  await page.goto(baseURL + '/help');
  await expect(page.locator('main h1')).toHaveText('BP미디어 이용 안내');
  await context.close();
});
test('공유한 검색 주소를 새로고침하면 검색어 입력도 복원된다', async ({page}) => {
  await page.goto('/korea');
  await expect(page.locator('#board-grid .post-card-title-link').first()).toBeVisible();
  const query=(await page.locator('#board-grid .post-card-title-link').first().innerText()).slice(0,2);
  await page.locator('#board-search-input').fill(query);
  await expect(page).toHaveURL(new RegExp('q='));
  await page.reload();
  await expect(page.locator('#board-search-input')).toHaveValue(query);
  await expect(page.locator('#board-search-clear')).toBeVisible();
});
test('공유한 태그 주소의 선택 표시를 복원한다', async ({page}) => {
  await page.route('**/api/posts/tags?*',route=>route.fulfill({json:{tags:['검증태그']}}));
  await page.goto('/korea?tag='+encodeURIComponent('검증태그'));
  await expect(page.locator('.tag-filter-btn.active')).toHaveText('검증태그');
});
