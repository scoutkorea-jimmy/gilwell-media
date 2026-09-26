import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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

test('홈 카드 역할은 대표 surface와 tonal 목록으로 명확히 분리된다', async ({ page }) => {
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
        borderBottom: style.borderBottomWidth,
        radius: style.borderRadius,
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
  expect(result.rail.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.rail.radius).not.toBe('0px');
  expect(result.row.borderTop).toBe('0px');
  expect(result.row.borderLeft).toBe('0px');
  expect(result.row.borderBottom).toBe('0px');
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
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PUBLIC_PATHS) {
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

test('상단 메뉴와 드롭다운 메뉴는 가로·세로 중앙 정렬된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.nav[data-managed-nav]')).toHaveClass(/is-ready/);

  const primary = await page.locator('.nav[data-managed-nav] > .nav-link, .nav[data-managed-nav] > .nav-group').evaluateAll((items) => items.map((item) => {
    const target = item.matches('.nav-group') ? item.querySelector('.nav-group-trigger') as HTMLElement : item as HTMLElement;
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      top: Math.round(rect.top),
      height: Math.round(rect.height),
      display: style.display,
      align: style.alignItems,
      justify: style.justifyContent,
      textAlign: style.textAlign,
    };
  }));

  expect(new Set(primary.map((item) => item.top)).size).toBe(1);
  expect(new Set(primary.map((item) => item.height)).size).toBe(1);
  for (const item of primary) {
    expect(item).toMatchObject({ display: 'flex', align: 'center', justify: 'center', textAlign: 'center' });
  }

  await page.locator('.nav-group').first().evaluate((group) => group.classList.add('is-open'));
  const submenu = await page.locator('.nav-group.is-open .nav-sublink').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const style = getComputedStyle(item);
    return { height: Math.round(rect.height), display: style.display, align: style.alignItems, justify: style.justifyContent, textAlign: style.textAlign };
  }));
  expect(submenu.length).toBeGreaterThan(0);
  for (const item of submenu) {
    expect(item).toMatchObject({ height: 48, display: 'flex', align: 'center', justify: 'center', textAlign: 'center' });
  }
});

test('기념품 검색과 필터는 한 겹 외곽선과 동일한 컨트롤 높이를 사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/memorabilia');
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const search = document.querySelector('.memo-search-bar') as HTMLElement;
    const searchInput = document.querySelector('#memo-search-input') as HTMLInputElement;
    const searchButton = document.querySelector('#memo-search-btn') as HTMLButtonElement;
    const controls = [...document.querySelectorAll('.memo-filters > select, .memo-filters > input, .memo-filters > .memo-filter-year-range')] as HTMLElement[];
    const yearRange = document.querySelector('.memo-filter-year-range') as HTMLElement;
    const yearInputs = [...yearRange.querySelectorAll('input')] as HTMLInputElement[];
    searchInput.focus();
    const focusedStyle = getComputedStyle(searchInput);
    const yearRect = yearRange.getBoundingClientRect();
    return {
      searchBorder: getComputedStyle(search).borderTopWidth,
      searchInputHeight: Math.round(searchInput.getBoundingClientRect().height),
      searchButtonHeight: Math.round(searchButton.getBoundingClientRect().height),
      controlHeights: controls.map((el) => Math.round(el.getBoundingClientRect().height)),
      yearInputsInside: yearInputs.every((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= yearRect.top && rect.bottom <= yearRect.bottom;
      }),
      focusOutline: focusedStyle.outlineStyle,
      focusShadow: focusedStyle.boxShadow,
    };
  });

  expect(result.searchBorder).toBe('0px');
  expect(result.searchInputHeight).toBe(56);
  expect(result.searchButtonHeight).toBe(56);
  expect(new Set(result.controlHeights)).toEqual(new Set([48]));
  expect(result.yearInputsInside).toBe(true);
  expect(result.focusOutline).toBe('none');
  expect(result.focusShadow).toContain('inset');
});

test('잼버리 개요는 이중 캡이나 구분선 없이 하나의 tonal surface를 사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/jamboree16');
  const styles = await page.evaluate(() => {
    const facts = getComputedStyle(document.querySelector('.jam16-facts') as Element);
    const row = getComputedStyle(document.querySelector('.jam16-fact') as Element);
    return {
      outerBorder: facts.borderTopWidth,
      outerRadius: facts.borderRadius,
      outerBackground: facts.backgroundColor,
      rowBorderTop: row.borderTopWidth,
      rowBorderBottom: row.borderBottomWidth,
      rowRadius: row.borderRadius,
      rowBackground: row.backgroundColor,
    };
  });
  expect(styles).toMatchObject({
    outerBorder: '0px',
    rowBorderTop: '0px', rowBorderBottom: '0px', rowRadius: '0px', rowBackground: 'rgba(0, 0, 0, 0)',
  });
  expect(styles.outerRadius).not.toBe('0px');
  expect(styles.outerBackground).not.toBe('rgba(0, 0, 0, 0)');
});

test('홈과 기사 페이지는 같은 1280px 외곽 축을 사용하고 기사 본문은 본문 열을 채운다', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/');
  const home = await page.locator('.home-wrapper').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.x), width: Math.round(rect.width) };
  });

  await page.goto('/post/385');
  const post = await page.evaluate(() => {
    const read = (selector: string) => {
      const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    };
    return { wrap: read('.post-page-wrap'), main: read('.post-page-main'), body: read('.post-page-body') };
  });

  expect(post.wrap).toEqual(home);
  expect(post.body.x).toBe(post.main.x);
  expect(post.body.width).toBe(post.main.width);
});

test('compact 화면은 큰 4단 메뉴 대신 64px 상단바와 중앙 정렬 드로어를 사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/korea');
  const header = page.locator('#mobile-compact-header');
  await expect(header).toBeVisible();
  await expect(page.locator('body > .masthead')).toBeHidden();

  const headerRect = await header.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: Math.round(rect.top), height: Math.round(rect.height) };
  });
  expect(headerRect).toEqual({ top: 0, height: 64 });

  await page.locator('#mobile-compact-toggle').click();
  await expect(page.locator('#mobile-compact-drawer')).toBeVisible();
  const alignment = await page.locator('.mobile-nav-link, .mobile-nav-group-summary, .mobile-nav-sublink').evaluateAll((items) => items.filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).map((item) => {
    const style = getComputedStyle(item);
    return { align: style.alignItems, justify: style.justifyContent, textAlign: style.textAlign };
  }));
  expect(alignment.length).toBeGreaterThan(0);
  for (const item of alignment) {
    expect(item).toEqual({ align: 'center', justify: 'center', textAlign: 'center' });
  }
});

test('compact 기사 화면도 64px 상단바와 양축 중앙 정렬 메뉴를 사용한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/post/385');
  const header = page.locator('.post-mobile-header');
  const bar = page.locator('.post-mobile-header-bar');
  await expect(header).toBeVisible();
  await expect(page.locator('body.post-page > .masthead')).toBeHidden();

  const geometry = await bar.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const brand = (el.querySelector('.post-mobile-brand') as HTMLElement).getBoundingClientRect();
    return { height: Math.round(rect.height), brandCenter: Math.round(brand.left + brand.width / 2) };
  });
  expect(geometry.height).toBe(64);
  expect(geometry.brandCenter).toBe(195);

  const alignment = await page.locator('.post-mobile-quicknav a').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    return { align: style.alignItems, justify: style.justifyContent, textAlign: style.textAlign };
  }));
  expect(alignment.length).toBeGreaterThan(0);
  for (const item of alignment) {
    expect(item).toEqual({ align: 'center', justify: 'center', textAlign: 'center' });
  }
});

test('게시판 D-day는 별도 박스가 아닌 배경 오브제로 표시된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/korea');
  await page.locator('.board-banner-total').evaluate((el) => {
    el.classList.add('has-event');
    el.innerHTML = '<span class="board-banner-total-label">제16회 한국잼버리</span><span class="board-banner-total-value">D+52</span>';
  });
  await expect(page.locator('.board-banner-total.has-event')).toBeVisible();
  const style = await page.locator('.board-banner-total.has-event').evaluate((el) => {
    const root = getComputedStyle(el);
    const value = getComputedStyle(el.querySelector('.board-banner-total-value') as Element);
    return { border: root.borderTopWidth, radius: root.borderRadius, background: root.backgroundColor, valueOpacity: value.opacity };
  });
  expect(style.border).toBe('0px');
  expect(style.radius).toBe('0px');
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(Number(style.valueOpacity)).toBeLessThanOrEqual(0.25);
});

test('공개 홈페이지 UI 소스에는 이모지 글리프를 사용하지 않는다', () => {
  const files = [
    'public/memorabilia.html', 'public/js/site-chrome.js', 'public/js/board-write.js',
    'public/js/main.js', 'public/js/chatbot.js', 'public/js/home-runtime.js',
    'public/js/board.js', 'public/js/jamboree16.js', 'public/js/calendar.js',
    'public/js/memorabilia.js', 'public/card-news-app/app.jsx', 'functions/post/[id].js',
  ];
  const emoji = /[✏📷🖼✨💾😊👇📦👁🔗⬆🔒❤♥]/u;
  const violations = files.filter((file) => emoji.test(readFileSync(file, 'utf8')));
  expect(violations).toEqual([]);
});
