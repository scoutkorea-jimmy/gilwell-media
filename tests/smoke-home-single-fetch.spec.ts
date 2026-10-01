import { test, expect } from '@playwright/test';

test('홈 데이터 한 번으로 콘텐츠와 팝업 배너를 표시한다', async ({ page }) => {
  await page.route('**/js/home-runtime.js*', (route) => route.fulfill({ path: 'public/js/home-runtime.js' }));
  await page.route('**/js/home-banner.js*', (route) => route.fulfill({ path: 'public/js/home-banner.js' }));

  let homeRequests = 0;
  await page.route(/\/api\/home(?:\?.*)?$/, async (route) => {
    homeRequests += 1;
    const response = await route.fetch();
    const data = await response.json();
    data.banners = [{ id: 1, title: '테스트 배너', image_url: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }];
    await route.fulfill({ response, json: data });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#latest-list a[href^="/post/"]').first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: '홈 안내 배너' })).toBeVisible();
  expect(homeRequests).toBe(1);
});
