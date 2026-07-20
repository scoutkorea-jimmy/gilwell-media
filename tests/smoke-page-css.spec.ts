import { test, expect } from '@playwright/test';

// 페이지 전용 CSS 분리(00.176.00) 회귀 가드.
//
// scripts/split_css.mjs 가 style.css 에서 "그 페이지에서만 쓰인다"고 확정된 규칙을
// css/board.css · calendar.css · post.css · wosm-members.css · glossary.css ·
// jamboree16.css 로 떼어냈다. 링크를 빠뜨리거나 잘못된 규칙을 옮기면 해당 페이지의
// 레이아웃이 조용히 무너진다. 각 시트에서 실제로 온 속성값을 브라우저에서 확인한다.

type Case = {
  name: string;
  path: string;
  sheet: string;
  selector: string;
  /** 분리된 시트가 적용됐을 때만 성립하는 계산된 스타일 */
  expect: { prop: string; not: string };
};

const CASES: Case[] = [
  { name: '게시판', path: '/korea', sheet: 'board.css', selector: '.board-grid',
    expect: { prop: 'display', not: 'block' } },
  { name: '캘린더', path: '/calendar', sheet: 'calendar.css', selector: '.calendar-page',
    expect: { prop: 'padding-top', not: '0px' } },
  { name: '용어집', path: '/glossary', sheet: 'glossary.css', selector: '.glossary-search-options',
    expect: { prop: 'display', not: 'inline' } },
  { name: '회원국 현황', path: '/wosm-members', sheet: 'wosm-members.css', selector: '.members-hero',
    expect: { prop: 'padding-top', not: '0px' } },
  { name: '잼버리 특별관', path: '/jamboree16', sheet: 'jamboree16.css', selector: '.jam16-hero',
    expect: { prop: 'background-image', not: 'none' } },
  { name: '기사 상세', path: '/post/6', sheet: 'post.css', selector: '.post-page-wrap',
    expect: { prop: 'display', not: 'inline' } },
];

for (const c of CASES) {
  test(`${c.name}(${c.path}) 는 ${c.sheet} 를 로드하고 적용한다`, async ({ page }) => {
    const loaded: string[] = [];
    page.on('response', (res) => {
      const u = res.url();
      if (u.includes(`/css/${c.sheet}`)) loaded.push(`${res.status()}`);
    });

    const response = await page.goto(c.path);
    expect(response?.ok(), `${c.path} 가 200 이어야 함`).toBeTruthy();

    // 1) 시트가 실제로 200 으로 받아졌는가 (링크 누락 / 파일명 오타 방지)
    expect(loaded, `${c.sheet} 요청 상태`).toContain('200');

    // 2) 그 시트의 규칙이 실제 요소에 적용됐는가
    const el = page.locator(c.selector).first();
    await expect(el, `${c.selector} 존재`).toBeAttached({ timeout: 10_000 });
    const value = await el.evaluate(
      (node, prop) => getComputedStyle(node as Element).getPropertyValue(prop),
      c.expect.prop
    );
    expect(value.trim(), `${c.selector} 의 ${c.expect.prop}`).not.toBe(c.expect.not);
  });
}

test('홈은 페이지 전용 시트를 로드하지 않는다', async ({ page }) => {
  const pageSheets: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    for (const s of ['board.css', 'calendar.css', 'post.css', 'wosm-members.css', 'glossary.css', 'jamboree16.css']) {
      if (u.includes(`/css/${s}`)) pageSheets.push(s);
    }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(pageSheets, '홈이 불필요한 페이지 시트를 받아오면 분리 의미가 없다').toEqual([]);
});
