import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PUBLIC_PATHS = [
  '/', '/latest', '/korea', '/apr', '/wosm', '/people', '/glossary',
  '/wosm-members', '/memorabilia', '/search?q=스카우트',
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
  const lead = page.locator('.home-lead-card');
  await expect(page.locator('#latest-list .mini-item-overlay').first()).toBeAttached();
  await lead.scrollIntoViewIfNeeded();
  await expect(lead).toHaveCSS('transform', 'none');
  await expect(lead).toHaveCSS('opacity', '1');

  const result = await page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        top: Math.round(rect.top),
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
  expect(result.lead.borderTop).toBe('0px');
  expect(result.lead.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.rail.borderTop).toBe('0px');
  expect(result.rail.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.rail.radius).not.toBe('0px');
  expect(result.row.borderTop).toBe('0px');
  expect(result.row.borderLeft).toBe('0px');
  expect(result.row.borderBottom).toBe('0px');
});

for (const width of [390, 820, 900, 1440]) {
  test(`홈 최신 기사 바로 아래에 RSS 행이 표시된다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const card = page.locator('.home-priority-latest .home-rail-card');
    await expect(card.locator('#latest-list .mini-item-overlay').first()).toBeAttached();
    await expect(card.getByRole('link', { name: 'RSS 구독' })).toBeVisible();
    const lastStory = card.locator('#latest-list .mini-item').last();
    await lastStory.scrollIntoViewIfNeeded();
    await expect(lastStory).toHaveCSS('transform', 'none');
    await expect(lastStory).toHaveCSS('opacity', '1');
    await page.evaluate(() => document.fonts.ready);

    const gaps = await card.evaluate((el) => {
      const lastStory = el.querySelector('#latest-list .mini-item:last-child')!.getBoundingClientRect();
      const actions = el.querySelector('.home-rail-actions')!.getBoundingClientRect();
      const rss = el.querySelector('a[href="/rss.xml"]')!.getBoundingClientRect();
      return {
        '마지막 기사와 RSS 링크': rss.top - lastStory.bottom,
        'RSS 행과 카드 하단': el.getBoundingClientRect().bottom - actions.bottom,
      };
    });
    for (const [label, gap] of Object.entries(gaps)) {
      expect(gap, label).toBeGreaterThanOrEqual(0);
      expect(gap, label).toBeLessThanOrEqual(16);
    }
  });
}

test('태블릿 홈에서 인기 기사 제목을 누르면 본문이 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/');
  const list = page.locator(':is(#popular-list, #popular-list-mobile):visible');
  await expect(list.locator('.mini-item-overlay').first()).toBeAttached();
  const article = list.locator('h4 a').first();
  const path = await article.getAttribute('href');
  expect(path).toMatch(/^\/post\/\d+$/);
  await article.click();
  await expect(page).toHaveURL(path!);
  await expect(page.locator('h1.post-page-title')).toBeVisible();
});

test('홈 리뉴얼 감사 인사는 캠페인 기간의 닫기·오늘 그만 보기와 종료 시각을 지킨다', async ({ page }) => {
  const fixtureTitle = '리뉴얼 기간의 최신 기사';
  await page.route(/\/api\/home(?:\?|$)/, route => route.fulfill({ json: {
    banners: [], latest: { posts: [{ id: 1, title: fixtureTitle, category: 'korea', created_at: '2026-09-30' }] },
  } }));
  await page.addInitScript(() => localStorage.setItem('bpmedia-analytics-transfer-consent', 'denied'));
  await page.clock.setFixedTime(new Date('2026-09-30T23:59:59+09:00'));
  const homeReady = () => expect(page.locator('#latest-list .mini-item-link').first()).toHaveText(fixtureTitle);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.removeItem('gw_renewal_thanks_hidden_until'); sessionStorage.removeItem('gw_renewal_thanks_dismissed'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const dialog = page.locator('.gw-thanks-dialog[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.home-renewal-banner')).toHaveCount(0);
    const box = await dialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { width: Math.round(rect.width), radius: style.borderTopLeftRadius, padding: style.paddingTop, left: Math.round(rect.left), right: Math.round(innerWidth - rect.right) };
    });
    expect(box.width).toBeLessThanOrEqual(560);
    expect(box.radius).toBe('28px');
    expect(box.padding).toBe('24px');
    expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(1);
    // 닫기 = 이번 방문(세션) 동안 다시 뜨지 않는다
    await page.locator('.gw-thanks-ok').click();
    await expect(dialog).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await homeReady();
    await expect(page.locator('.gw-thanks-dialog')).toHaveCount(0);
    // 오늘 그만 보기 = 새 방문(세션 초기화)에도 오늘은 뜨지 않는다
    await page.evaluate(() => sessionStorage.removeItem('gw_renewal_thanks_dismissed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.locator('.gw-thanks-today').click();
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => sessionStorage.removeItem('gw_renewal_thanks_dismissed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await homeReady();
    await expect(page.locator('.gw-thanks-dialog')).toHaveCount(0);
  }
  // 마감 직후의 새 방문. 두 저장소의 숨김 여부와 무관하게 캠페인이 끝난다.
  await page.clock.setFixedTime(new Date('2026-10-01T00:00:00+09:00'));
  await page.evaluate(() => {
    localStorage.removeItem('gw_renewal_thanks_hidden_until');
    sessionStorage.removeItem('gw_renewal_thanks_dismissed');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await homeReady();
  await expect(page.locator('.gw-thanks-dialog')).toHaveCount(0);
});

test('기사 정보와 공유·수정은 모든 화면에서 제목 아래 본문 앞에 표시된다', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/post/385', { waitUntil: 'domcontentloaded' });
    const info = page.locator('dl.post-reader-meta');
    await expect(info).toHaveCount(1);
    await expect(info.locator('dt')).toHaveText(['섹션', '작성자', '게시일', '읽기 시간', '조회수']);
    await expect(info.locator('a')).toBeVisible();
    await expect(page.locator('.post-reader-meta + .post-page-share #post-edit-btn')).toBeVisible();
    await expect(page.locator('.post-reader-meta + .post-page-share #post-share-btn')).toBeVisible();
    await expect(page.locator('.post-page-body ~ .post-reader-meta, .post-reader-rail .post-reader-meta')).toHaveCount(0);
  }
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

test('상단 검색은 입력과 버튼을 한 surface와 한 포커스 링으로 묶는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('.mh-search-input').focus();
  const result = await page.evaluate(() => {
    const wrap = document.querySelector('.masthead-search') as HTMLElement;
    const input = document.querySelector('.mh-search-input') as HTMLElement;
    const button = document.querySelector('.mh-search-btn') as HTMLElement;
    const wrapRect = wrap.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const wrapStyle = getComputedStyle(wrap);
    const inputStyle = getComputedStyle(input);
    return {
      wrapHeight: Math.round(wrapRect.height),
      childrenTop: new Set([Math.round(inputRect.top), Math.round(buttonRect.top)]).size,
      childrenBottom: new Set([Math.round(inputRect.bottom), Math.round(buttonRect.bottom)]).size,
      inputShadow: inputStyle.boxShadow,
      inputRadius: inputStyle.borderRadius,
      wrapShadow: wrapStyle.boxShadow,
      wrapRadius: wrapStyle.borderRadius,
    };
  });
  expect(result.wrapHeight).toBe(56);
  expect(result.childrenTop).toBe(1);
  expect(result.childrenBottom).toBe(1);
  expect(result.inputShadow).toBe('none');
  expect(result.inputRadius).toBe('0px');
  expect(result.wrapShadow).toContain('inset');
  expect(result.wrapRadius).not.toBe('0px');
});

test('넓은 화면의 주요 기사는 사진 옆에 제목과 읽기 링크를 정렬한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const ticker = page.locator('#main-content > .ticker');
  await expect(ticker).toBeVisible();
  const tickerBox = await ticker.boundingBox();
  const headingBox = await page.locator('#home-front-title').boundingBox();
  expect(tickerBox!.y + tickerBox!.height).toBeLessThanOrEqual(headingBox!.y);
  const slide = page.locator('.site-hero-slide.active.has-bg');
  await expect(slide.locator('.site-hero-title a')).toBeVisible();
  const layout = await slide.evaluate(hero => {
    const box = (selector: string) => hero.querySelector(selector)!.getBoundingClientRect();
    return {
      contentRight: box('.site-hero-content').right,
      photoLeft: box('.site-hero-media').left,
      titleLeft: box('.site-hero-title').left,
      actionsLeft: box('.site-hero-actions').left,
      headingsLink: hero.querySelector('.site-hero-title a')!.getAttribute('href'),
      imageLink: hero.querySelector('.site-hero-media')!.getAttribute('href'),
    };
  });
  expect(layout.contentRight).toBeCloseTo(layout.photoLeft, 0);
  expect(layout.titleLeft).toBeCloseTo(layout.actionsLeft, 0);
  expect(layout.headingsLink).toBe(layout.imageLink);

  await page.route('**/test-missing-hero-image', route => route.fulfill({ status: 404 }));
  await page.evaluate(() => {
    const home = (window as any).GW.HomeHero;
    home.renderHero({ posts: [{ id: 1, title: '사진을 가져오지 못한 기사', image_url: '/test-missing-hero-image' }] });
  });
  await expect(page.locator('.site-hero-slide.active .site-hero-media')).toHaveCount(0);
  await expect(page.locator('.site-hero-slide.active .site-hero-title a')).toHaveAttribute('href', '/post/1');
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

test('홈 섹션은 같은 축에 정렬되고 기사 본문은 넓은 화면에서도 읽기 폭을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/');
  const home = await page.evaluate(() => {
    const read = (selector: string) => {
      const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    };
    return { wrap: read('.home-wrapper'), hero: read('.site-hero-slider'), content: read('.home-priority') };
  });

  await page.goto('/post/385');
  const post = await page.evaluate(() => {
    const read = (selector: string) => {
      const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    };
    return { wrap: read('.post-page-wrap'), main: read('.post-page-main'), body: read('.post-page-body') };
  });

  expect(home.wrap).toEqual(home.hero);
  expect(home.content).toEqual(home.hero);
  expect(post.wrap.width).toBeLessThan(home.wrap.width);
  expect(post.wrap.x * 2 + post.wrap.width).toBe(1920);
  expect(post.body.width).toBe(760);
  expect(post.body.x).toBe(post.main.x);
  expect(post.body.width).toBe(post.main.width);
});

test('태블릿 홈은 목록 역할을 2열로 합쳐 불필요한 세로 길이를 만들지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.home-3col')).toBeVisible({ timeout: 10_000 });
  const layout = await page.evaluate(() => {
    const two = getComputedStyle(document.querySelector('.home-2col') as Element);
    const four = getComputedStyle(document.querySelector('.home-3col') as Element);
    const wrapper = (document.querySelector('.home-wrapper') as HTMLElement).getBoundingClientRect();
    return {
      twoColumns: two.gridTemplateColumns.split(' ').length,
      fourColumns: four.gridTemplateColumns.split(' ').length,
      wrapperHeight: Math.round(wrapper.height),
    };
  });
  expect(layout.twoColumns).toBe(2);
  expect(layout.fourColumns).toBe(2);
  expect(layout.wrapperHeight).toBeLessThan(5_500);
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

test('모바일 기사에서 공통 헤더 메뉴와 이전 화면 링크를 함께 사용할 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/post/385');
  const header = page.locator('#mobile-compact-header');
  await expect(header).toBeVisible();
  await expect(page.locator('.post-mobile-header')).toBeHidden();
  await expect(page.locator('body.post-page > .masthead')).toBeHidden();
  await expect(page.locator('.post-page-meta [data-action="history-back"]')).toBeVisible();
  const rect = await header.boundingBox();
  expect(rect?.y).toBe(0);
  expect(rect?.height).toBe(64);
  await page.locator('#mobile-compact-toggle').click();
  await expect(page.locator('#mobile-compact-drawer')).toBeVisible();
  await expect(page.locator('#mobile-compact-drawer a[href="/latest"]')).toBeVisible();
});

test('게시판 D-day는 별도 박스가 아닌 배경 오브제로 표시된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/korea');
  const total = await page.locator('.board-banner-total').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      border: style.borderTopWidth,
      radius: style.borderRadius,
      background: style.backgroundColor,
      padding: style.paddingTop,
      shadow: style.boxShadow,
    };
  });
  expect(total).toEqual({
    border: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)', padding: '0px', shadow: 'none',
  });

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

test('게시판 필터는 히어로·검색·카드와 같은 축의 한 기능 surface를 사용한다', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/latest');
    if (viewport.width === 390) {
      const filter = page.getByRole('button', { name: /목록 필터/ });
      await expect(filter).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.board-sort-bar')).toBeHidden();
      await expect(page.locator('#board-search-input')).toBeVisible();
      await filter.click();
    }
    await expect(page.locator('.board-sort-bar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.tag-filter-btn').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.board-search-wrap')).toBeVisible({ timeout: 10_000 });

    const layout = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector) as HTMLElement;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          x: Math.round(rect.x), width: Math.round(rect.width), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
          background: style.backgroundColor, radius: style.borderRadius,
        };
      };
      return {
        hero: read('.board-banner'), sort: read('.board-sort-bar'), tags: read('.tag-filter-bar'),
        search: read('.board-search-wrap'), grid: read('.board-grid'),
      };
    });

    for (const item of [layout.sort, layout.tags, layout.search, layout.grid]) {
      expect(item.x).toBe(layout.hero.x);
      expect(item.width).toBe(layout.hero.width);
    }
    expect(layout.sort.bottom).toBe(layout.tags.top);
    expect(layout.tags.bottom).toBe(layout.search.top);
    expect(layout.sort.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(layout.tags.background).toBe(layout.sort.background);
    expect(layout.search.background).toBe(layout.sort.background);
  }
});

test('게시판 정렬 용어는 의미를 설명하고 모바일 주제 행은 한 줄을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/apr');
  await page.getByRole('button', { name: /목록 필터/ }).click();
  await expect(page.locator('.board-sort-bar')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tag-filter-btn').first()).toBeVisible({ timeout: 10_000 });

  const labels = await page.locator('.board-sort-btn').allTextContents();
  expect(labels).toEqual(['추천 기사', '많이 본 기사']);
  const tagRow = await page.locator('.tag-filter-bar').evaluate((el) => ({
    height: Math.round(el.getBoundingClientRect().height),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    railOverflow: el.scrollWidth - el.clientWidth,
    touchAction: getComputedStyle(el).touchAction,
  }));
  expect(tagRow.height).toBeLessThanOrEqual(48);
  expect(tagRow.pageOverflow).toBeLessThanOrEqual(1);
  expect(tagRow.railOverflow).toBeGreaterThan(0);
  expect(tagRow.touchAction).toBe('pan-x');
});

test('게시판 카드의 공유 버튼은 카드 안에서 외곽선과 48px 누름 영역을 갖는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/latest');
  const shareButton = page.locator('.post-card-share-btn').first();
  await expect(shareButton).toBeVisible({ timeout: 10_000 });
  const result = await shareButton.evaluate((share) => {
    const card = share.closest('.post-card') as HTMLElement;
    const cardRect = card.getBoundingClientRect();
    const body = card.querySelector('.post-card-body') as HTMLElement;
    const bodyRect = body.getBoundingClientRect();
    const style = getComputedStyle(share);
    return {
      bodyBottom: Math.round(bodyRect.bottom), cardBottom: Math.round(cardRect.bottom),
      shareBackground: style.backgroundColor, shareBorder: style.borderTopWidth, shareHeight: share.getBoundingClientRect().height,
    };
  });
  expect(result.bodyBottom).toBeLessThanOrEqual(result.cardBottom);
  expect(result.shareBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.shareBorder).toBe('1px');
  expect(result.shareHeight).toBeGreaterThanOrEqual(48);
});

test('홈 섹션 제목과 장문 페이지 장은 별도 카드로 중첩되지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.home-section-title').first()).toBeVisible({ timeout: 10_000 });
  const home = await page.locator('.home-section-title').first().evaluate((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const next = el.nextElementSibling as HTMLElement;
    const nextRect = next.getBoundingClientRect();
    return {
      border: style.borderTopWidth, radius: style.borderRadius, background: style.backgroundColor,
      gap: Math.round(nextRect.top - rect.bottom),
    };
  });
  expect(home).toMatchObject({ border: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)' });
  expect(home.gap).toBeLessThanOrEqual(12);

  await page.goto('/editorial-policy');
  const chapter = await page.locator('.static-page-section').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: style.borderTopWidth, radius: style.borderRadius, background: style.backgroundColor, padding: style.paddingTop };
  });
  expect(chapter).toEqual({ border: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)', padding: '0px' });
});

test('공개 홈페이지 UI 소스에는 이모지 글리프를 사용하지 않는다', () => {
  const files = [
    'public/memorabilia.html', 'public/js/site-chrome.js', 'public/js/board-write.js',
    'public/js/main.js', 'public/js/chatbot.js', 'public/js/home-runtime.js',
    'public/js/board.js', 'public/js/jamboree16.js',
    'public/js/memorabilia.js', 'public/card-news-app/app.jsx', 'functions/post/[id].js',
  ];
  const emoji = /[✏📷🖼✨💾😊👇📦👁🔗⬆🔒❤♥]/u;
  const violations = files.filter((file) => emoji.test(readFileSync(file, 'utf8')));
  expect(violations).toEqual([]);
});

test('입력 필드·칩·버튼 그룹은 M3 규격(56/48 필드, 16px 입력, 32 칩)을 지킨다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ['/korea', '/search?q=스카우트', '/glossary', '/memorabilia', '/wosm-members']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_200);
    const result = await page.evaluate(() => {
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select')]
        .filter(visible)
        .filter((el) => !el.closest('.memo-filter-year-range, .masthead-search'))
        .map((el) => ({ id: el.id || el.className, height: Math.round(el.getBoundingClientRect().height), font: parseFloat(getComputedStyle(el).fontSize) }));
      const chips = [...document.querySelectorAll('.tag-filter-btn, .glossary-letter-btn')]
        .filter(visible)
        .map((el) => ({ height: Math.round(el.getBoundingClientRect().height), font: parseFloat(getComputedStyle(el).fontSize) }));
      const groups = [...document.querySelectorAll('.board-sort-toggle, .search-scope-row, .members-view-chips')]
        .filter(visible)
        .map((el) => ({ gap: getComputedStyle(el).columnGap, segmented: el.matches('.search-scope-row') }));
      return { fields, chips, groups };
    });
    for (const field of result.fields) {
      expect([48, 56], `${path} ${field.id} 필드 높이`).toContain(field.height);
      expect(field.font, `${path} ${field.id} 입력 글자`).toBeGreaterThanOrEqual(16);
    }
    for (const chip of result.chips) {
      expect(chip.height, `${path} 칩 높이`).toBe(32);
      expect(chip.font, `${path} 칩 글자`).toBeGreaterThanOrEqual(14);
    }
    for (const group of result.groups) expect(group.gap, `${path} 버튼 그룹 간격`).toBe(group.segmented ? '0px' : '8px');
  }
});

test('공개 화면은 보이는 H1 이 하나이고, 로고는 홈에서만 H1 이다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of PUBLIC_PATHS) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length > 0).map((h) => (h.textContent || '').trim().slice(0, 20)),
      logoIsH1: !!document.querySelector('.masthead-logo h1'),
    }));
    expect(result.visible, `${path} 보이는 H1`).toHaveLength(1);
    expect(result.logoIsH1, `${path} 로고 H1`).toBe(path === '/');
  }
});

test('기사 제목 아래 공유·수정 버튼을 키보드로 열고 돌아온다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bpmedia-analytics-transfer-consent', 'denied'));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/post/628');
    const share = page.getByRole('button', { name: '공유하기', exact: true });
    const edit = page.getByRole('button', { name: '수정하기', exact: true });
    for (const button of [share, edit]) {
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      await expect(button).toHaveCSS('border-radius', '12px');
    }
    await share.focus();
    await page.keyboard.press('Enter');
    const close = page.locator('#share-modal-close');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-share-channel="copy"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(share).toBeFocused();
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '관리자 로그인' })).toBeVisible();
    await page.locator('#post-login-cancel-btn').click();
    await expect(edit).toBeFocused();
  }
});

test('메뉴를 첫 클릭으로 열고 Escape로 원래 버튼에 돌아간다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bpmedia-analytics-transfer-consent', 'denied'));
  await page.goto('/latest');
  const group = page.locator('.nav-group').first();
  const toggle = group.getByRole('button');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(group.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('맨 위로 버튼은 스크롤한 뒤 나타나고 상단에 돌아오면 사라진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/latest', { waitUntil: 'domcontentloaded' });
  const topButton = page.locator('#global-scroll-top-btn');
  await expect(topButton).toHaveCSS('opacity', '0');
  await expect(topButton).toHaveJSProperty('inert', true);
  await page.locator('.post-card').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(topButton).toHaveCSS('opacity', '1');
  await topButton.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(topButton).toHaveCSS('opacity', '0');
  await expect(topButton).toHaveJSProperty('inert', true);
});
