import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 로컬 소스만 덮어 읽는 배포 전 검증. 공개 데이터는 GET만 사용하고 분석·쓰기 요청은 보내지 않는다.
test.use({ channel: 'chrome', viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['/css/m3-site.css', '/js/site-chrome.js', '/js/glossary.js'].includes(path)) {
      return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync('public' + path, 'utf8') });
    }
    if (!['GET', 'HEAD'].includes(request.method()) || /analytics|kakaocdn.net\/kas/.test(request.url())) return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });
});

test('모바일 메뉴는 열리면 포커스를 받고 보이는 항목 안에서 순환한 뒤 원래 버튼으로 돌아온다', async ({ page }) => {
  await page.goto('/korea', { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('#mobile-compact-toggle');
  const close = page.locator('#mobile-compact-drawer-close');
  await toggle.click();
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#mobile-compact-nav > a').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('작은 화면의 대표 소식은 이미지와 글을 나누고 읽기 동작과 전환 조작부가 겹치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.site-hero-slide.active.has-bg .site-hero-media')).toBeVisible();
  for (const width of [280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.site-hero-slide.active').evaluate(hero => {
      const box = (selector: string) => hero.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { image: box('.site-hero-media'), copy: box('.site-hero-content'), title: box('.site-hero-title'), subtitle: box('.site-hero-subtitle'), actions: box('.site-hero-actions'), cta: box('.site-hero-cta'), controls: document.querySelector('.hero-controls')!.getBoundingClientRect().toJSON(), scroll: document.documentElement.scrollWidth };
    });
    expect(layout.scroll).toBeLessThanOrEqual(width);
    expect(layout.image.bottom).toBeLessThanOrEqual(layout.copy.top + 1);
    expect(layout.title.left).toBeCloseTo(layout.subtitle.left, 0);
    expect(layout.title.left).toBeCloseTo(layout.actions.left, 0);
    expect(layout.subtitle.bottom).toBeLessThanOrEqual(layout.actions.top + 1);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.controls.top + 1);
    expect(layout.cta.height).toBeGreaterThanOrEqual(48);
  }
});

test('용어집 검색 범위를 모두 해제해도 입력과 검색 의도를 유지하고 범위를 다시 고르면 검색을 복원한다', async ({ page }, testInfo) => {
  await page.goto('/glossary', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#glossary-results-meta')).toContainText('개 용어');
  const input = page.locator('#glossary-search-input');
  await input.fill('항건');
  await expect(page.locator('#glossary-results')).toContainText('Neckerchief');
  await page.locator('#glossary-search-terms').uncheck();
  await page.locator('#glossary-search-description').uncheck();
  await expect(input).toHaveValue('항건');
  await expect(page.locator('#glossary-results')).toContainText('검색할 범위를 하나 이상 선택해 주세요.');
  await expect(page.locator('#glossary-results .glossary-term-row')).toHaveCount(0);
  await page.locator('#glossary-results-meta').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('glossary-no-scope.png') });
  await page.locator('#glossary-search-terms').check();
  await expect(input).toHaveValue('항건');
  await expect(page.locator('#glossary-results')).toContainText('Neckerchief');
  await expect(page.locator('#glossary-results .glossary-term-row')).toHaveCount(1);
});
