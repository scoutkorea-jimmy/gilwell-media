import { expect, test } from '@playwright/test';

test('목록의 두 번째 페이지에서 오류를 재시도하고 검색·필터를 초기화할 수 있다', async ({ page }) => {
  const query = '목록 복구 시험';
  let failList = true;
  await page.route('**/api/posts?**', async route => {
    if (failList) return route.abort('failed');
    const q = new URL(route.request().url()).searchParams.get('q');
    const posts = q ? [] : [{ id: 42, category: 'korea', title: '복구한 목록 기사', created_at: '2026-01-01' }];
    return route.fulfill({ json: { posts, total: posts.length, pageSize: 16 } });
  });

  await page.goto('/korea?page=2&q=' + encodeURIComponent(query));
  const grid = page.locator('#board-grid');
  await expect(grid.getByRole('status')).toHaveText('기사 목록을 불러오지 못했습니다.');
  failList = false;
  await grid.getByRole('button', { name: '다시 시도' }).click();
  await expect(grid.getByRole('status')).toHaveText('현재 검색어나 필터에 맞는 기사가 없습니다.');
  await expect(page.locator('#board-search-input')).toHaveValue(query);
  await grid.getByRole('link', { name: '검색·필터 초기화' }).click();
  await expect(page).toHaveURL(/\/korea$/);
  await expect(grid.getByRole('link', { name: '복구한 목록 기사', exact: true })).toHaveAttribute('href', '/post/42');
});
