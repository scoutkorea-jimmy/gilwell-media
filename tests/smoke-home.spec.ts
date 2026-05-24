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
