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

test('목록 태그를 한 줄에 맞추고 접힌 태그로도 해당 주제를 열 수 있다', async ({ page }) => {
  const tags = ['소식', '인도네시아연맹', '아시아태평양', '아동 교육', '국제교류', '지역 봉사', '청소년 활동'];
  const post = { id: 42, category: 'apr', title: '베카시의 스카우트', tag: tags.join(','), created_at: new Date().toISOString() };
  await page.route('**/api/posts?**', route => route.fulfill({ json: { posts: [post], total: 1, pageSize: 16 } }));
  await page.route('**/api/posts/tags**', route => route.fulfill({ json: { tags } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apr?q=' + encodeURIComponent('스카우트') + '&page=2&debug_mode=1');
  const row = page.locator('#board-grid .post-card-labels').first();
  const more = row.getByRole('button');
  await expect(more).toBeVisible();
  const hidden = await row.locator('a[hidden]').count();
  expect(hidden).toBeGreaterThan(0);
  await expect(more).toHaveText('+' + hidden);
  await expect(row.locator('.post-kicker-new')).toBeVisible();
  const sameLine = await row.evaluate(box => {
    const visible = [...box.children].filter(chip => !chip.hasAttribute('hidden'));
    return visible.every(chip => {
      const r = chip.getBoundingClientRect(), bounds = box.getBoundingClientRect();
      return r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1 && r.right <= bounds.right + 1;
    });
  });
  expect(sameLine).toBe(true);
  // A late font or translated label can change chip widths while the card stays put.
  const firstTopic = row.locator('a.post-kicker').first();
  await expect(firstTopic).toBeVisible();
  await firstTopic.evaluate(el => { el.style.minWidth = '1000px'; });
  await expect(firstTopic).toBeHidden();
  await firstTopic.evaluate(el => { el.style.removeProperty('min-width'); });
  await page.setViewportSize({ width: 393, height: 844 });
  await expect(more).toBeVisible();
  await more.focus();
  await more.press('Enter');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(row.getByRole('link')).toHaveCount(tags.length);
  await expect(row.locator('a:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect.poll(() => row.locator('a[hidden]').count()).toBeGreaterThan(0);
  await more.click();
  const tag = tags[tags.length - 1];
  const request = page.waitForRequest(r => {
    const url = new URL(r.url());
    return url.pathname === '/api/posts' && url.searchParams.get('tag') === tag && url.searchParams.get('tag_scope') === 'topic';
  });
  await row.getByRole('link', { name: tag, exact: true }).click();
  await request;
  const url = new URL(page.url());
  expect(url.pathname).toBe('/apr');
  expect(url.searchParams.get('tag')).toBe(tag);
  expect(url.searchParams.get('q')).toBe('스카우트');
  expect(url.searchParams.get('page')).toBeNull();
  expect(url.searchParams.get('debug_mode')).toBeNull();
  await expect(page.getByRole('button', { name: tag, exact: true })).toHaveClass(/active/);
  await expect(page.locator('#board-grid .post-card-title-link')).toHaveAttribute('href', '/post/42');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /목록 필터/ }).click();
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await expect(page).not.toHaveURL(/tag=/);
});
