import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installSyntheticAdmin, assertRenderedBounds } from './analytics-internals-fixture';
import { resolveAdminAnalyticsRange, analyticsRangeMeta } from '../functions/_shared/admin-analytics-range.js';

const ORIGIN = 'http://127.0.0.1:8781';

async function open(page: Page) {
  const boundary = await installSyntheticAdmin(page);
  const state = { reads: [] as string[], errors: new Set<string>(), empty: false };
  // Offline diagnostic tile: validates Leaflet geometry without automated OSM traffic.
  // Real provider imagery is deliberately unverified here and requires native production review.
  await page.route('https://*.tile.openstreetmap.org/**', async route => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf4f7"/><path d="M0 128H256M128 0V256M0 0H256V256H0Z" stroke="#cedde2" fill="none"/><text x="10" y="22" font-family="system-ui" font-size="12" fill="#55657a">LOCAL MAP FIXTURE</text><text x="10" y="42" font-family="system-ui" font-size="12" fill="#55657a">실제 지도 타일 미검증</text></svg>' });
  });
  const countryRows = [
    ['KR', '대한민국', 37.56, 126.98, 30, 70, 2], ['JP', '일본', 35.68, 139.69, 12, 25, 1],
    ['US', '미국', 38.9, -77.03, 18, 33, 1], ['GB', '영국', 51.5, -0.12, 9, 18, 1],
    ['ZZ', '국가 미확인', null, null, 2, 3, 0],
  ].map(([country_code, country_name, latitude, longitude, visits, pageviews, city_count]) => ({ country_code, country_name, country_name_original: country_name, latitude, longitude, visits, pageviews, city_count, last_visit_at: '2026-10-15 02:00:00' }));
  const cityRows = [
    ['KR', '대한민국', '서울', 'Seoul', 37.56, 126.98, 25, 55], ['KR', '대한민국', '부산', 'Busan', 35.18, 129.08, 8, 15],
    ['JP', '일본', '도쿄', 'Tokyo', 35.68, 139.69, 12, 25], ['US', '미국', '워싱턴', 'Washington', 38.9, -77.03, 18, 33],
    ['GB', '영국', '런던', 'London', 51.5, -0.12, 9, 18], ['ZZ', '국가 미확인', '도시 미확인', 'Unknown', null, null, 2, 3],
  ].map(([country_code, country_name, city_name, city_name_original, latitude, longitude, visits, pageviews]) => ({ country_code, country_name, city_name, city_name_original, latitude, longitude, visits, pageviews, last_visit_at: '2026-10-15 02:00:00' }));
  const points = Array.from({ length: 8 }, (_, i) => ({ path: '/post/' + (101 + i), title: '합성 기사 ' + (i + 1) + ' · 스카우트 교육과 지역사회 활동', stage: ['awareness', 'interest', 'consideration'][i % 3], unique_users: 12 + i * 17, pageviews: (12 + i * 17) * (1 + i / 3), views_per_user: 1 + i / 3, share_ratio: i / 10 }));
  const flow = {
    sources: [{ id: 's1', label: '직접 방문', value: 50, color: '#622599' }, { id: 's2', label: '구글 검색', value: 30, color: '#0094b4' }, { id: 's3', label: '공유 링크', value: 20, color: '#248737' }],
    stages: [{ id: 'a', label: '입구 페이지', value: 20, color: '#ff8c42' }, { id: 'b', label: '탐색 페이지', value: 30, color: '#2f9e44' }, { id: 'c', label: '기사 읽기', value: 50, color: '#e64980' }],
    destinations: [{ id: 'd1', label: '합성 홈페이지', value: 20, color: '#ff8c42' }, { id: 'd2', label: '합성 자료와 국가별 기사 탐색', value: 30, color: '#2f9e44' }, { id: 'd3', label: '합성 스카우트 지도자의 교육과 청소년 성장', value: 30, color: '#e64980' }, { id: 'd4', label: '합성 지역사회 봉사 활동', value: 20, color: '#e64980' }],
    links: [{ source: 's1', target: 'a', value: 20 }, { source: 's1', target: 'b', value: 30 }, { source: 's2', target: 'c', value: 30 }, { source: 's3', target: 'c', value: 20 }, { source: 'a', target: 'd1', value: 20 }, { source: 'b', target: 'd2', value: 30 }, { source: 'c', target: 'd3', value: 30 }, { source: 'c', target: 'd4', value: 20 }],
  };
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN || !['/api/admin/geo-audience', '/api/admin/marketing'].includes(url.pathname)) return route.fallback();
    expect(route.request().method()).toBe('GET'); state.reads.push(url.pathname + url.search);
    if (state.errors.has(url.pathname)) return route.fulfill({ status: 503, json: { error: '합성 검증용 조회 실패' } });
    const range = analyticsRangeMeta(resolveAdminAnalyticsRange(url.searchParams, { days: url.pathname.endsWith('marketing') ? 7 : 30 }));
    if (url.pathname.endsWith('geo-audience')) return route.fulfill({ json: { range, summary: { countries: state.empty ? 0 : 4, cities: state.empty ? 0 : 5, visits: state.empty ? 0 : 55, pageviews: state.empty ? 0 : 149, missing_coordinate_pageviews: state.empty ? 0 : 3, unknown_country_pageviews: state.empty ? 0 : 3 }, countries: state.empty ? [] : countryRows, cities: state.empty ? [] : cityRows, tracking_note: '합성 검증 집계. 국가·도시 고유 방문은 합산하지 않습니다.' } });
    return route.fulfill({ json: { range, summary: { unique_users: state.empty ? 0 : 100, total_pageviews: state.empty ? 0 : 240, awareness_users: state.empty ? 0 : 60, interest_users: state.empty ? 0 : 40, consideration_users: state.empty ? 0 : 50 },
      funnel: state.empty ? [] : [{ key: 'awareness', label: '입구 페이지', users: 60, rate: 60, description: '합성 홈·일정 도달' }, { key: 'interest', label: '탐색 페이지', users: 40, rate: 40, description: '합성 분류·자료 도달' }, { key: 'consideration', label: '기사 읽기', users: 50, rate: 50, description: '합성 기사 상세 도달' }],
      journey_flow: state.empty ? null : flow, page_opportunities: state.empty ? [] : points,
      utm_campaigns: state.empty ? [] : [{ campaign: '합성 교육 소식', source: 'newsletter', medium: 'email', visits: 20, pageviews: 50, stage: 'consideration' }],
      top_transitions: state.empty ? [] : [{ from_title: '합성 홈페이지', to_title: '합성 청소년 기사', users: 25 }], notes: [],
    } });
  });
  await page.goto('/admin.html'); await expect(page.locator('body')).toHaveClass(/admin-session-loaded/);
  return { state, boundary };
}

async function show(page: Page, id: 'geo-audience' | 'marketing') {
  await page.evaluate(id => (window as any).V3.showPanel(id), id);
  await expect(page.locator('#' + (id === 'marketing' ? 'marketing-body' : 'geo-audience-city-list'))).toHaveAttribute('aria-busy', 'false');
}
function boundaryOK(boundary: Awaited<ReturnType<typeof installSyntheticAdmin>>) {
  expect(boundary.externalApi).toEqual([]); expect(boundary.pageErrors).toEqual([]);
  expect(boundary.writes.filter(value => value !== 'POST /api/homepage-issues/report')).toEqual([]);
}

for (const width of [280, 390, 1920, 2560, 5120]) test(`${width}px visible primary map and comparison diagrams with readable labels`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width > 1000 ? 1440 : 1000 });
  const { state, boundary } = await open(page);
  const measurements: any[] = [];
  await show(page, 'geo-audience');
  await expect(page.locator('#geo-audience-map')).toBeVisible(); await expect(page.locator('#geo-audience-map')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#geo-audience-map .leaflet-interactive')).toHaveCount(4);
  await expect.poll(() => page.locator('#geo-audience-map img.leaflet-tile').evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.locator('#geo-audience-map').evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(page.locator('#geo-audience-note')).toBeVisible();
  await assertRenderedBounds(page, `${width}px visible Geo`);
  const map = await page.locator('.v3-geo-map-card').boundingBox(), list = await page.locator('.v3-geo-list-card').boundingBox();
  if (width > 1000) { expect(Math.abs(map!.y - list!.y)).toBeLessThan(2); expect(map!.width).toBeGreaterThan(list!.width); }
  else expect(map!.y).toBeLessThan(list!.y);
  measurements.push({ screen: 'geo', map, list });
  await page.locator('#panel-geo-audience h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`synthetic-visible-geo-${width}.png`) });
  if (width === 390) { await page.locator('#geo-audience-map').scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('synthetic-visible-map-detail-390.png') }); }
  await show(page, 'marketing');
  await expect(page.locator('#marketing-flow svg')).toBeVisible(); await expect(page.locator('#marketing-scatter svg')).toBeVisible();
  expect(await page.locator('#marketing-flow').evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(page.locator('.marketing-definition')).toBeVisible();
  const charts = await page.locator('.marketing-visual-card').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
  if (width > 1000) { expect(Math.abs(charts[0].y - charts[1].y)).toBeLessThan(2); expect(Math.abs(charts[0].height - charts[1].height)).toBeLessThan(2); } else expect(charts[0].y).toBeLessThan(charts[1].y);
  const periodX = await page.locator('#mkt-period-bar').evaluate(el => el.getBoundingClientRect().x), headingX = await page.locator('#panel-marketing h1').evaluate(el => el.getBoundingClientRect().x);
  expect(Math.abs(periodX - headingX)).toBeLessThan(2);
  const text = await page.locator('#marketing-body svg text').evaluateAll(labels => labels.filter(label => getComputedStyle(label).visibility !== 'hidden').map(label => { const matrix = (label as SVGGraphicsElement).getScreenCTM()!; return { name: label.textContent, font: parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b) }; }));
  for (const label of text) expect(label.font, label.name || '').toBeGreaterThanOrEqual(11.99);
  measurements.push({ screen: 'marketing', charts, text });
  await assertRenderedBounds(page, `${width}px visible Marketing`);
  await page.locator('#panel-marketing h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`synthetic-visible-marketing-${width}.png`) });
  if (width === 390) {
    for (const chart of ['flow', 'scatter']) { await page.locator('#marketing-' + chart).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`synthetic-visible-${chart}-detail-390.png`) }); }
  }
  const reads = state.reads.length;
  await page.setViewportSize({ width: width < 1000 ? 1920 : 390, height: 1000 });
  await expect.poll(async () => page.locator('#marketing-flow .marketing-flow-label').first().evaluate(label => { const matrix = (label as SVGGraphicsElement).getScreenCTM()!; return parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b); })).toBeGreaterThanOrEqual(11.99);
  expect(state.reads.length).toBe(reads);
  await writeFile(testInfo.outputPath('synthetic-layout-measurements.json'), JSON.stringify(measurements, null, 2));
  boundaryOK(boundary);
});

test('Geo map, country and city connect without changing filters or fetching more data', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  const { state, boundary } = await open(page); await show(page, 'geo-audience');
  const reads = state.reads.length;
  await page.locator('#geo-audience-map .leaflet-interactive').first().click();
  await expect(page.locator('[data-geo-country-toggle="KR"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#geo-audience-map-selection')).toContainText('대한민국');
  const city = page.getByRole('button', { name: '서울 지도에서 보기' }); await city.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#geo-audience-map-selection')).toContainText('서울');
  await expect(page.locator('[data-geo-country-key="KR"]')).toHaveClass(/is-map-focused/);
  await expect(page.locator('[data-geo-country-toggle="KR"] .is-visits')).toHaveText('30방문');
  await page.locator('#geo-audience-city-search').fill('Busan'); await expect(page.locator('.v3-geo-city-search-summary')).toContainText('1개 도시');
  await page.getByRole('button', { name: '부산 지도에서 보기' }).click(); await expect(page.locator('#geo-audience-city-search')).toHaveValue('Busan');
  expect(state.reads.length).toBe(reads); boundaryOK(boundary);
});

test('Marketing native interactions, fullscreen redraw, errors and empty visuals remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const { state, boundary } = await open(page); await show(page, 'marketing');
  const reads = state.reads.length;
  const flow = page.locator('#marketing-flow .marketing-flow-shell'); await flow.focus();
  const before = await flow.locator('svg').getAttribute('style'); await page.keyboard.press('ArrowRight');
  await expect(flow.locator('svg')).not.toHaveAttribute('style', before || '');
  await page.locator('#marketing-flow [data-pz="reset"]').click();
  const node = page.locator('#marketing-flow .marketing-flow-node').first(); await node.focus(); await expect(page.locator('#marketing-flow .marketing-hover-tip')).toHaveClass(/open/);
  for (let i = 0; i < 2; i++) {
    const trigger = page.locator('.marketing-visual-card .marketing-expand-btn').first(); await trigger.click();
    await expect(page.locator('#marketing-fullscreen-modal')).toHaveClass(/open/);
    const label = page.locator('#marketing-fullscreen-body .marketing-flow-label').first(); await expect(label).toBeVisible();
    expect(await label.evaluate(el => { const matrix = (el as SVGGraphicsElement).getScreenCTM()!; return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(matrix.a, matrix.b); })).toBeGreaterThanOrEqual(11.99);
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  }
  expect(state.reads.length).toBe(reads);
  state.errors.add('/api/admin/marketing'); await page.locator('#mkt-apply-btn').click();
  await expect(page.locator('#marketing-status')).toContainText('갱신 실패'); await expect(page.locator('#marketing-flow svg')).toBeVisible();
  state.errors.clear(); state.empty = true; await page.locator('#mkt-apply-btn').click();
  await expect(page.locator('#marketing-body')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#marketing-flow')).toContainText('아직 흐름 데이터가 없습니다');
  await expect(page.locator('#marketing-scatter')).toContainText('페이지 기회 맵 데이터가 없습니다');
  await show(page, 'geo-audience'); await expect(page.locator('#geo-audience-map')).toBeVisible(); await expect(page.locator('#geo-audience-map-summary')).toContainText('0개 국가');
  state.empty = false; state.errors.add('/api/admin/geo-audience'); await page.locator('#geo-audience-refresh-btn').click();
  await expect(page.locator('#geo-audience-status')).toContainText('갱신 실패'); await expect(page.locator('#geo-audience-map')).toHaveAttribute('aria-busy', 'false');
  boundaryOK(boundary);
});

for (const width of [320, 1920]) test(`${width}px marketing scatter numeric axes preserve scales and readable geometry`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1100 });
  const { state, boundary } = await open(page); await show(page, 'marketing');
  const chart = page.locator('#marketing-scatter');
  const count = width === 320 ? 3 : 5;
  await expect(chart.locator('.marketing-axis-tick.is-x')).toHaveCount(count);
  await expect(chart.locator('.marketing-axis-tick.is-y')).toHaveCount(count);
  await expect(chart.locator('.marketing-grid-line')).toHaveCount(count * 2);
  await expect(chart.locator('.marketing-scatter-point')).toHaveCount(8);
  const geometry = await chart.evaluate(el => {
    const svg = el.querySelector('svg') as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    const labels = Array.from(svg.querySelectorAll('.marketing-axis-title')).map(label => {
      const box = label.getBoundingClientRect(), matrix = (label as SVGGraphicsElement).getScreenCTM()!;
      return { text: label.textContent, x: box.x, y: box.y, width: box.width, height: box.height, font: parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b),
        axis: label.classList.contains('is-x') ? 'x' : label.classList.contains('is-y') ? 'y' : 'title', value: Number(label.getAttribute('data-value')),
        anchorX: Number(label.getAttribute('x')), anchorY: Number(label.getAttribute('y')) };
    });
    return { svg: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, labels,
      points: Array.from(svg.querySelectorAll('.marketing-scatter-point')).map(point => point.getAttribute('aria-label')) };
  });
  for (const label of geometry.labels) {
    expect(label.font, label.text || '').toBeGreaterThanOrEqual(11.99);
    expect(label.x).toBeGreaterThanOrEqual(geometry.svg.x - 1); expect(label.x + label.width).toBeLessThanOrEqual(geometry.svg.x + geometry.svg.width + 1);
    expect(label.y).toBeGreaterThanOrEqual(geometry.svg.y - 1); expect(label.y + label.height).toBeLessThanOrEqual(geometry.svg.y + geometry.svg.height + 1);
  }
  for (let i = 0; i < geometry.labels.length; i++) for (let j = i + 1; j < geometry.labels.length; j++) {
    const a = geometry.labels[i], b = geometry.labels[j];
    expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y, `${a.text} overlaps ${b.text}`).toBe(false);
  }
  const x = geometry.labels.filter(label => label.axis === 'x'), y = geometry.labels.filter(label => label.axis === 'y');
  expect(x[0].text).toBe('12'); expect(x.at(-1)!.text).toBe('131'); expect(y[0].text).toBe('0'); expect(y.at(-1)!.text).toBe('3.33');
  for (const tick of x) expect((tick.anchorX - x[0].anchorX) / (x.at(-1)!.anchorX - x[0].anchorX)).toBeCloseTo(Math.log(tick.value / 12) / Math.log(131 / 12), 5);
  for (const tick of y) expect((tick.anchorY - y[0].anchorY) / (y.at(-1)!.anchorY - y[0].anchorY)).toBeCloseTo(tick.value / (10 / 3), 5);
  for (let i = 0; i < geometry.points.length; i++) {
    expect(geometry.points[i]).toContain('경로 /post/' + (101 + i)); expect(geometry.points[i]).toContain('사용자 ' + (12 + i * 17));
  }
  await assertRenderedBounds(page, `${width}px numeric marketing axes`);
  await page.locator('.marketing-visual-card').nth(1).screenshot({ path: testInfo.outputPath(`synthetic-marketing-scatter-numeric-${width}.png`) });
  await writeFile(testInfo.outputPath('synthetic-numeric-axis-geometry.json'), JSON.stringify(geometry, null, 2));
  const reads = state.reads.length;
  await page.setViewportSize({ width: width === 320 ? 1920 : 320, height: 1100 });
  await expect(chart.locator('.marketing-axis-tick.is-x')).toHaveCount(width === 320 ? 5 : 3);
  expect(state.reads.length).toBe(reads); boundaryOK(boundary);
});
