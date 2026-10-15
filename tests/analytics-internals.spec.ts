import { test, expect, type Page, type Route } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installSyntheticAdmin, assertRenderedBounds } from './analytics-internals-fixture';
import { buildTagInsights, splitCommaTokens } from '../functions/_shared/tag-insights.js';
import { resolveAdminAnalyticsRange, analyticsRangeMeta } from '../functions/_shared/admin-analytics-range.js';

const ORIGIN = 'http://127.0.0.1:8781';
const lastTag = '힣 검색범위밖의긴메타태그';
const postRows = Array.from({ length: 85 }, (_, index) => ({ id: index + 1, title: '합성 태그 기사 ' + index,
  category: 'korea', tag: '검증 글머리', meta_tags: '공통,' + (index === 84 ? lastTag : '검증태그 ' + index),
  published: 1, publish_at: '2026-10-01 10:00:00', created_at: '2026-10-01 01:00:00', views: 0 }));

async function open(page: Page) {
  const boundary = await installSyntheticAdmin(page);
  const state = { reads: [] as URL[], delivered: [] as string[], errors: new Map<string, number>(),
    defers: new Map<string, (() => void)[]>(), hold: new Set<string>(), empty: new Set<string>() };
  const countries = [{ country_code: 'KR', country_name: '대한민국 긴 국가명 검증', country_name_original: 'South Korea', visits: 5, pageviews: 311, city_count: 303, latitude: null, longitude: null, last_visit_at: '2026-10-01 01:00:00' }];
  const cities = Array.from({ length: 303 }, (_, index) => ({ country_code: 'KR', country_name: countries[0].country_name,
    city_name: index === 0 ? '서울' : index === 1 ? '부산' : '합성도시 ' + index,
    city_name_original: index === 0 ? 'Seoul' : index === 1 ? 'Busan' : 'Synthetic City ' + index,
    visits: index < 2 ? 4 : 1, pageviews: index < 2 ? 5 : 1, latitude: null, longitude: null, last_visit_at: '2026-10-01 01:00:00' }));
  await page.route('**/api/admin/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (!['/api/admin/analytics', '/api/admin/geo-audience', '/api/admin/tag-insights', '/api/admin/tag-articles', '/api/admin/marketing', '/api/admin/search-performance', '/api/admin/search-keywords'].includes(url.pathname)) return route.fallback();
    expect(route.request().method()).toBe('GET');
    state.reads.push(url);
    const key = url.pathname + '?' + url.searchParams.toString();
    if (state.hold.has(key)) await new Promise<void>(release => { const list = state.defers.get(key) || []; list.push(release); state.defers.set(key, list); });
    const status = state.errors.get(url.pathname);
    if (status) return route.fulfill({ status, json: { error: '합성 검증 오류' } });
    const range = analyticsRangeMeta(resolveAdminAnalyticsRange(url.searchParams, { days: url.pathname === '/api/admin/marketing' ? 7 : 30, allowAll: url.pathname.includes('tag-'), defaultAll: url.pathname.includes('tag-') }));
    const empty = state.empty.has(url.pathname);
    let json: any;
    if (url.pathname === '/api/admin/analytics') json = { range: { ...range, granularity: 'day' }, today: { visits: 1, views: 2 },
      summary: { range_visits: empty ? 0 : range.days, range_pageviews: empty ? 0 : Number(range.days) * 2 },
      visitors: { series: [{ date: range.end_date, visits: empty ? 0 : range.days }] }, views: { series: [{ date: range.end_date, views: empty ? 0 : Number(range.days) * 2 }] },
      article_top_posts: [], sources: [], tracking_note: '합성 검증 전용. 운영 성과가 아닙니다.' };
    else if (url.pathname === '/api/admin/geo-audience') json = { range,
      summary: { countries: empty ? 0 : 1, cities: empty ? 0 : 303, visits: empty ? 0 : 5, pageviews: empty ? 0 : 311, missing_coordinate_pageviews: empty ? 0 : 311 },
      countries: empty ? [] : countries, cities: empty ? [] : cities, tracking_note: '합성 위치 집계 · 기간 고유 방문' };
    else if (url.pathname === '/api/admin/search-keywords') json = { range: { ...range, start: url.searchParams.get('start'), end: url.searchParams.get('end') }, total_visits: 0, known_visits: 0, hidden_visits: 0, total_unique: 0, by_engine: [], keywords: [] };
    else if (url.pathname.includes('tag-')) {
      const rows = empty ? [] : postRows.filter(row => !range.start_date || row.publish_at.slice(0, 10) >= range.start_date && row.publish_at.slice(0, 10) <= range.end_date!);
      if (url.pathname === '/api/admin/tag-insights') json = { ...buildTagInsights(rows), range };
      else { const matches = rows.filter(row => splitCommaTokens(row.meta_tags).includes(url.searchParams.get('tag'))); json = { posts: matches, total: matches.length, page: 1, limit: 20, range }; }
    } else if (url.pathname === '/api/admin/search-performance') json = { reports: [{ engine: 'google', period_days: 30, total_clicks: 65,
      synced_at: '2026-10-15T01:00:00Z', data_through: '2026-10-14', rows: Array.from({ length: 65 }, (_, index) => ({ keyword: '합성 검색어 ' + index, clicks: 1, impressions: 2, ctr: 0.5, position: 1 })) }] };
    else json = { range, summary: { unique_users: empty ? 0 : range.days, total_pageviews: empty ? 0 : 10, awareness_users: empty ? 0 : 5, interest_users: 0, consideration_users: empty ? 0 : 5 },
      funnel: empty ? [] : [{ label: '기사 읽기', users: 5, rate: 100, description: '기간별 도달' }], utm_campaigns: [], top_transitions: [], notes: [],
      page_opportunities: empty ? [] : [{ path: '/post/101', title: '합성 기사 · 긴 페이지 제목의 성과를 확인합니다', stage: 'consideration', unique_users: 5, pageviews: 10, views_per_user: 2, share_ratio: 0.4 }],
      journey_flow: { sources: empty ? [] : [{ id: 'source:direct', label: '직접', value: 5 }], stages: empty ? [] : [{ id: 'stage:consideration', label: '기사 읽기', value: 5 }],
        destinations: empty ? [] : [{ id: 'dest:/post/101', label: '합성 기사 · 긴 페이지 제목의 성과를 확인합니다', value: 5 }],
        links: empty ? [] : [{ source: 'source:direct', target: 'stage:consideration', value: 5, color: '#622599' }, { source: 'stage:consideration', target: 'dest:/post/101', value: 5, color: '#622599' }] } };
    await route.fulfill({ json });
    state.delivered.push(key);
  });
  await page.goto('/admin.html');
  await expect(page.locator('body')).toHaveClass(/admin-session-loaded/);
  await expect(page.locator('#v3-app')).toBeVisible();
  return { state, boundary };
}

async function panel(page: Page, id: string) {
  await page.evaluate(id => (window as any).V3.showPanel(id), id);
  await expect(page.locator('#panel-' + id)).toHaveClass(/active/);
  const status = id === 'analytics-visits' ? '#analytics-live-meta' : id === 'analytics-tags' ? '#analytics-tags-status' : id === 'geo-audience' ? '#geo-audience-status' : '#marketing-status';
  await expect(page.locator(status)).toContainText(/마지막 (성공|갱신)/);
  const body = id === 'analytics-visits' ? '#analytics-body' : id === 'analytics-tags' ? '#analytics-tags-body' : id === 'geo-audience' ? '#geo-audience-city-list' : '#marketing-body';
  await expect(page.locator(body)).toHaveAttribute('aria-busy', 'false');
}
async function settled(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
function assertBoundary(boundary: Awaited<ReturnType<typeof installSyntheticAdmin>>) {
  expect(boundary.externalApi).toEqual([]); expect(boundary.pageErrors).toEqual([]);
  expect(boundary.writes.filter(write => write !== 'POST /api/homepage-issues/report')).toEqual([]);
}

for (const width of [280, 320, 390, 820, 1280]) test(`${width}px populated/empty analysis content, controls and real bounds`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const { state, boundary } = await open(page);
  for (const id of ['analytics-visits', 'geo-audience', 'analytics-tags', 'marketing']) {
    await panel(page, id);
    if (id === 'geo-audience') {
      const row = page.locator('.v3-geo-country-row');
      await expect(row.locator('.is-visits')).toBeVisible(); await expect(row.locator('.is-visits')).toContainText('5');
      await expect(row.locator('.is-pageviews')).toBeVisible();
      await row.click(); await expect(page.locator('.v3-geo-city-sublist')).toBeVisible();
      const refresh = await page.locator('#geo-audience-refresh-btn').boundingBox();
      expect(refresh!.width).toBeGreaterThanOrEqual(48); expect(refresh!.height).toBeGreaterThanOrEqual(48);
      expect(await page.locator('#geo-audience-refresh-btn').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; })).toBe(1);
    }
    if (id === 'marketing') {
      expect(await page.locator('#marketing-flow').evaluate(el => !!el.closest('details'))).toBe(false);
      await expect(page.locator('.marketing-flow-svg')).toBeVisible();
      await page.locator('[data-pz="in"]').click(); await page.locator('[data-pz="reset"]').click();
      expect(await page.locator('[data-pz="in"]').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
    }
    await assertRenderedBounds(page, `${width}px ${id} populated`);
    if (width === 390 || width === 1280) {
      await page.locator('#panel-' + id + ' h1').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`synthetic-${id}-${width}.png`) });
    }
  }
  for (const id of ['geo-audience', 'analytics-tags', 'marketing']) {
    state.empty.add(id === 'geo-audience' ? '/api/admin/geo-audience' : id === 'analytics-tags' ? '/api/admin/tag-insights' : '/api/admin/marketing');
    await panel(page, id);
    if (id === 'geo-audience') await expect(page.locator('#geo-audience-city-list')).toContainText('선택 기간의 국가·도시 접속 기록이 없습니다');
    if (id === 'analytics-tags') await expect(page.locator('#analytics-tags-body')).toContainText('메타 태그가 없습니다');
    if (id === 'marketing') await expect(page.locator('#marketing-body')).toContainText('선택 기간의 페이지 방문이 없습니다');
    await assertRenderedBounds(page, `${width}px ${id} empty`);
  }
  assertBoundary(boundary);
});

test('visits latest filter wins, exact custom period, partial validation, report page survives refresh', async ({ page }) => {
  await page.clock.install();
  const { state, boundary } = await open(page);
  await panel(page, 'analytics-visits'); await page.locator('#analytics-auto-refresh').uncheck();
  const bar = page.locator('[data-v3-period-scope="analytics"]');
  const key = '/api/admin/analytics?days=7'; state.hold.add(key);
  await bar.locator('[data-days="7"]').click(); await bar.locator('[data-days="7"]').click();
  await expect.poll(() => state.defers.get(key)?.length || 0).toBe(1);
  await bar.locator('[data-days="90"]').click();
  await expect(page.locator('#analytics-stats')).toContainText('90');
  state.hold.delete(key); state.defers.get(key)!.forEach(release => release());
  await expect.poll(() => state.delivered.includes(key)).toBe(true); await settled(page);
  await expect(page.locator('#analytics-stats')).not.toContainText('7일');
  await bar.locator('[data-v3-role="start"]').fill('2026-10-01'); await bar.locator('[data-v3-role="end"]').fill('2026-10-02');
  await bar.locator('.v3-apply-btn').click();
  await expect(page.locator('#analytics-stats')).toContainText('2026-10-01 ~ 2026-10-02');
  await expect(page.locator('.v3-analytics-trend-card')).toContainText('2026-10-01 ~ 2026-10-02');
  const before = state.reads.filter(url => url.pathname === '/api/admin/analytics').length;
  await bar.locator('[data-v3-role="end"]').fill(''); await bar.locator('.v3-apply-btn').click();
  await settled(page); expect(state.reads.filter(url => url.pathname === '/api/admin/analytics').length).toBe(before);
  await expect(page.locator('#search-performance-page')).toContainText('1');
  await page.locator('#search-performance-next').click();
  const reportPage = await page.locator('#search-performance-page').innerText();
  const reportsBefore = state.reads.filter(url => url.pathname === '/api/admin/search-performance').length;
  await page.locator('#analytics-refresh-btn').click(); await settled(page);
  await expect(page.locator('#search-performance-page')).toHaveText(reportPage);
  expect(state.reads.filter(url => url.pathname === '/api/admin/search-performance').length).toBe(reportsBefore);
  await expect(page.locator('.v3-trend-data')).toBeVisible();
  await page.locator('#analytics-auto-refresh').check();
  const autoBefore = state.reads.filter(url => url.pathname === '/api/admin/analytics' && !url.searchParams.has('heatmap_days')).length;
  await page.locator('#search-performance-next').focus();
  await page.clock.fastForward(31_000);
  await expect.poll(() => state.reads.filter(url => url.pathname === '/api/admin/analytics' && !url.searchParams.has('heatmap_days')).length).toBe(autoBefore + 1);
  await expect(page.locator('#analytics-body')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.v3-trend-data')).toBeVisible();
  await expect(page.locator('.v3-trend-data tbody tr')).not.toHaveCount(0);
  await expect(page.locator('#search-performance-page')).toHaveText(reportPage);
  assertBoundary(boundary);
});

test('Geo uses country counts; search/collapse, complete list, null-map and failed refresh stay coherent', async ({ page }) => {
  const { state, boundary } = await open(page); await panel(page, 'geo-audience');
  await expect(page.locator('.v3-geo-country-row .is-visits')).toHaveText('5방문');
  await page.locator('#geo-audience-city-search').fill('서울');
  await expect(page.locator('.v3-geo-country-row')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.v3-geo-country-row').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.v3-geo-country-row')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.v3-geo-country-row')).toBeFocused();
  await page.locator('#geo-audience-city-toggle-all').click(); await expect(page.locator('.v3-geo-country-row')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#geo-audience-city-toggle-all').click(); await expect(page.locator('.v3-geo-country-row')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#geo-audience-city-search').fill('합성도시 302');
  await expect(page.locator('.v3-geo-city-sublist')).toContainText('합성도시 302');
  expect(await page.locator('#geo-audience-map').evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  expect(await page.locator('.leaflet-overlay-pane path').count()).toBe(0);
  state.errors.set('/api/admin/geo-audience', 503); await page.locator('#geo-audience-refresh-btn').click();
  await expect(page.locator('#geo-audience-status')).toContainText('갱신 실패');
  await page.locator('#geo-audience-city-search').fill('부산');
  await expect(page.locator('.v3-geo-city-sublist')).toContainText('부산');
  await expect(page.locator('#geo-audience-status')).toContainText('표시 자료:');
  await expect(page.locator('.v3-geo-country-row .is-visits')).toHaveText('5방문');
  assertBoundary(boundary);
});

test('Geo and tags ignore delayed prior-period responses', async ({ page }) => {
  const { state, boundary } = await open(page);
  for (const [id, scope, endpoint, status] of [['geo-audience', 'geo-audience', '/api/admin/geo-audience', '#geo-audience-status'], ['analytics-tags', 'analytics-tag', '/api/admin/tag-insights', '#analytics-tags-status']]) {
    await panel(page, id);
    const key = endpoint + '?days=7'; state.hold.add(key);
    const bar = page.locator(`[data-v3-period-scope="${scope}"]`);
    await bar.locator('[data-days="7"]').click(); await expect.poll(() => state.defers.get(key)?.length || 0).toBe(1);
    await bar.locator('[data-days="90"]').click(); await expect(page.locator(status)).toContainText('표시 자료:');
    const selected = await page.locator(status).innerText();
    state.hold.delete(key); state.defers.get(key)!.forEach(release => release());
    await expect.poll(() => state.delivered.includes(key)).toBe(true); await settled(page);
    await expect(page.locator(status)).toHaveText(selected);
  }
  assertBoundary(boundary);
});

test('Tag custom scope and graph-unlisted search open exact published detail by keyboard and restore focus', async ({ page }) => {
  const { state, boundary } = await open(page); await panel(page, 'analytics-tags');
  const bar = page.locator('[data-v3-period-scope="analytics-tag"]');
  await bar.locator('[data-v3-role="start"]').fill('2026-10-01'); await bar.locator('[data-v3-role="end"]').fill('2026-10-02');
  await bar.locator('.v3-apply-btn').click(); await expect(page.locator('#analytics-tags-status')).toContainText('2026-10-01 ~ 2026-10-02');
  const request = state.reads.filter(url => url.pathname === '/api/admin/tag-insights').at(-1)!;
  expect(request.searchParams.get('all')).toBeNull();
  await page.locator('#v3-ti-graph-search').fill(lastTag);
  const result = page.locator('[data-ti-result-tag]').filter({ hasText: lastTag });
  await expect(result).toBeVisible(); await result.focus(); await page.keyboard.press('Enter');
  const modal = page.locator('.v3-ti-articles-modal'); await expect(modal).toBeVisible();
  await expect(modal).toContainText('정확한 메타 태그'); await expect(page.locator('#v3-ti-articles-close')).toBeFocused();
  const detail = state.reads.filter(url => url.pathname === '/api/admin/tag-articles').at(-1)!;
  expect(detail.searchParams.get('start')).toBe('2026-10-01'); expect(detail.searchParams.get('end')).toBe('2026-10-02'); expect(detail.searchParams.get('tag')).toBe(lastTag);
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(result).toBeFocused();
  const node = page.locator('.v3-ti-graph-node').first(); await node.focus(); await page.keyboard.press('Enter');
  await expect(modal).toBeVisible(); await page.keyboard.press('Escape'); await expect(node).toBeFocused();
  await node.scrollIntoViewIfNeeded();
  const nodeBox = (await node.locator('circle').boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nodeBox.x + nodeBox.width / 2, y: nodeBox.y + nodeBox.height / 2, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await settled(page); await expect(modal).toHaveCount(0);
  await page.locator('#v3-ti-graph-search').fill(lastTag);
  await page.locator('#analytics-tags-refresh-btn').click();
  await expect(page.locator('#analytics-tags-body')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#v3-ti-graph-search')).toHaveValue(lastTag);
  await expect(page.locator('[data-ti-result-tag]').filter({ hasText: lastTag })).toBeVisible();
  assertBoundary(boundary);
});

test('Marketing normalizes181day/reverse ranges, latest response, failed state and real fullscreen/pointer controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, boundary } = await open(page); await panel(page, 'marketing');
  await page.locator('#mkt-date-from').fill('2026-01-01'); await page.locator('#mkt-date-to').fill('2026-10-15'); await page.locator('#mkt-apply-btn').click();
  await expect(page.locator('#marketing-status')).toContainText('표시 자료:');
  await expect(page.locator('#mkt-date-from')).toHaveValue('2026-04-19');
  await page.locator('#mkt-date-from').fill('2026-10-02'); await page.locator('#mkt-date-to').fill('2026-10-01');
  await expect(page.locator('#mkt-apply-btn')).toBeEnabled(); await page.locator('#mkt-apply-btn').click();
  await expect(page.locator('#mkt-date-from')).toHaveValue('2026-10-01'); await expect(page.locator('#mkt-date-to')).toHaveValue('2026-10-02');
  await expect(page.locator('#marketing-body')).toContainText('2026-10-01 ~ 2026-10-02');
  const key = '/api/admin/marketing?start=2026-10-01&end=2026-10-03'; state.hold.add(key);
  await page.locator('#mkt-date-to').fill('2026-10-03'); await expect(page.locator('#mkt-apply-btn')).toBeEnabled(); await page.locator('#mkt-apply-btn').click();
  await expect.poll(() => state.defers.get(key)?.length || 0).toBe(1);
  await page.locator('.mkt-preset-btn[data-days="30"]').click();
  await expect(page.locator('#marketing-status')).toContainText('공개 페이지 방문 집계');
  const latest = await page.locator('#marketing-status').innerText(); state.hold.delete(key); state.defers.get(key)!.forEach(release => release());
  await expect.poll(() => state.delivered.includes(key)).toBe(true); await settled(page); await expect(page.locator('#marketing-status')).toHaveText(latest);
  await expect(page.locator('#marketing-flow svg')).toBeVisible();
  const flow = page.locator('#marketing-flow .marketing-flow-shell'); await flow.focus();
  const transform = await flow.locator('svg').getAttribute('style'); await page.keyboard.press('ArrowRight'); expect(await flow.locator('svg').getAttribute('style')).not.toBe(transform);
  await flow.scrollIntoViewIfNeeded();
  const flowBox = (await flow.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  const x = flowBox.x + flowBox.width * 0.75, y = flowBox.y + Math.min(100, flowBox.height / 2);
  const beforeTouch = await flow.locator('svg').getAttribute('style');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 50, y, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await flow.locator('svg').getAttribute('style')).not.toBe(beforeTouch);
  for (let i = 0; i < 2; i++) {
    const trigger = page.locator('#marketing-body .marketing-expand-btn').first(); await trigger.click();
    await expect(page.locator('#marketing-fullscreen-modal .marketing-zoom-btn').first()).toBeFocused();
    const fullscreenSvg = page.locator('#marketing-fullscreen-body svg');
    const beforeZoom = await fullscreenSvg.getAttribute('style');
    const zoom = page.locator('#marketing-fullscreen-body [data-pz="in"]'); await zoom.click();
    await expect(fullscreenSvg).not.toHaveAttribute('style', beforeZoom || '');
    await page.keyboard.press('Escape'); await expect(page.locator('#marketing-fullscreen-modal')).not.toHaveClass(/open/); await expect(trigger).toBeFocused();
  }
  // Real keyboard link activation opens a synthetic target, with no production network.
  await page.context().route(ORIGIN + '/post/101', route => route.fulfill({ contentType: 'text/html', body: '<title>합성 링크 대상</title>운영 요청을 차단한 합성 기사 링크 대상' }));
  const point = page.locator('#marketing-scatter .marketing-scatter-point').first();
  await point.focus();
  const popupPromise = page.context().waitForEvent('page');
  await page.keyboard.press('Enter');
  const popup = await popupPromise; await popup.waitForLoadState();
  expect(popup.url()).toBe(ORIGIN + '/post/101'); await popup.close();
  state.errors.set('/api/admin/marketing', 503); await expect(page.locator('#mkt-apply-btn')).toBeEnabled(); await page.locator('#mkt-apply-btn').click();
  await expect(page.locator('#marketing-status')).toContainText('갱신 실패'); await expect(page.locator('#mkt-apply-btn')).toHaveText('조회');
  await expect(page.locator('#marketing-body')).toContainText('세션 전환율이 아닙니다');
  assertBoundary(boundary);
});

test('first-load errors stay distinct from empty data and recover without stale error styling', async ({ page }) => {
  const { state, boundary } = await open(page);
  for (const [id, endpoint, body, status, retry] of [
    ['analytics-visits', '/api/admin/analytics', '#analytics-body', '#analytics-live-meta', '#analytics-refresh-btn'],
    ['geo-audience', '/api/admin/geo-audience', '#geo-audience-city-list', '#geo-audience-status', '#geo-audience-refresh-btn'],
    ['analytics-tags', '/api/admin/tag-insights', '#analytics-tags-body', '#analytics-tags-status', '#analytics-tags-refresh-btn'],
    ['marketing', '/api/admin/marketing', '#marketing-body', '#marketing-status', '#mkt-apply-btn'],
  ]) {
    state.errors.set(endpoint, 503);
    await page.evaluate(id => (window as any).V3.showPanel(id), id);
    await expect(page.locator(status)).toContainText('갱신 실패'); await expect(page.locator(body)).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator(status)).toHaveClass(/is-error/);
    if (id === 'geo-audience') {
      await page.locator('#geo-audience-city-search').fill('서울');
      await expect(page.locator(body)).toContainText('새로고침으로 다시 시도');
      await page.locator('#geo-audience-city-search').fill('');
    }
    state.errors.delete(endpoint); await page.locator(retry).click();
    await expect(page.locator(body)).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator(status)).not.toHaveClass(/is-error/);
  }
  assertBoundary(boundary);
});

test('Geo metadata admin-scope503 shows partial warning and retries without caching fallback', async ({ page }) => {
  const { boundary } = await open(page);
  const metaUrls: URL[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/settings/wosm-members') metaUrls.push(url); });
  boundary.errors.set('/api/settings/wosm-members', 503);
  await panel(page, 'geo-audience');
  await expect(page.locator('#geo-audience-status')).toContainText('지역연맹 분류 조회 실패');
  await expect(page.locator('.v3-geo-country-row .is-visits')).toHaveText('5방문');
  expect(metaUrls.length).toBe(3); expect(metaUrls.every(url => url.searchParams.get('scope') === 'admin')).toBe(true);
  boundary.errors.delete('/api/settings/wosm-members');
  await page.locator('#geo-audience-refresh-btn').click();
  await expect(page.locator('#geo-audience-city-list')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#geo-audience-status')).not.toContainText('지역연맹 분류 조회 실패');
  expect(metaUrls.length).toBe(4);
  boundary.errors.set('/api/settings/wosm-members', 503);
  await page.locator('#geo-audience-refresh-btn').click();
  await expect(page.locator('#geo-audience-city-list')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#geo-audience-status')).toContainText('마지막 성공 분류를 표시합니다');
  boundary.errors.delete('/api/settings/wosm-members');
  await page.locator('[data-v3-period-scope="geo-audience"] [data-days="7"]').click();
  await expect(page.locator('#geo-audience-city-list')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#geo-audience-status')).not.toContainText('지역연맹 분류 조회 실패');
  expect(metaUrls.length).toBe(8);
  assertBoundary(boundary);
});

test('Geo regional text uses readable ink and tag labels retain a contrasting halo', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { boundary } = await open(page); await panel(page, 'geo-audience');
  await expect(page.locator('#geo-audience-status')).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} KST/);
  const regionalColors = await page.evaluate(() => {
    const parse = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
    const blend = (over: number[], under: number[]) => over.slice(0, 3).map((v, i) => v * (over[3] ?? 1) + under[i] * (1 - (over[3] ?? 1)));
    const luminance = (color: number[]) => color.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a: number[], b: number[]) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pill = document.querySelector('.v3-geo-country-name .v3-geo-pill') as HTMLElement;
    const originalClass = pill.className;
    const ancestors: Element[] = []; for (let node: Element | null = pill; node; node = node.parentElement) ancestors.unshift(node);
    const results = ['africa', 'arab', 'asia-pacific', 'european', 'interamerican', 'wosm', 'unassigned'].map(region => {
      pill.className = 'v3-geo-pill is-' + region;
      const style = getComputedStyle(pill);
      const background = ancestors.reduce((color, node) => blend(parse(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
      return { region, foreground: style.color, background: style.backgroundColor, contrast: ratio(parse(style.color), background) };
    });
    pill.className = originalClass;
    for (const selector of ['#geo-audience-region-summary .v3-badge', '#geo-audience-stats .v3-stat-label', '.v3-geo-country-stat']) {
      const element = document.querySelector(selector)!;
      let background = [255, 255, 255]; const path: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) path.unshift(node);
      for (const node of path) background = blend(parse(getComputedStyle(node).backgroundColor), background);
      const style = getComputedStyle(element); results.push({ region: selector, foreground: style.color, background: style.backgroundColor, contrast: ratio(parse(style.color), background) });
    }
    return results;
  });
  for (const color of regionalColors) expect(color.contrast, JSON.stringify(color)).toBeGreaterThanOrEqual(4.5);
  await panel(page, 'analytics-tags');
  const graphNodes = await page.locator('.v3-ti-graph-node').evaluateAll(nodes => nodes.map(node => ({ role: node.getAttribute('role'), tabIndex: node.getAttribute('tabindex'), label: node.getAttribute('aria-label'), tooltip: node.querySelector('title')?.textContent })));
  expect(graphNodes).toHaveLength(50); expect(await page.locator('.v3-ti-graph-node.is-primary').count()).toBe(5);
  for (const node of graphNodes) { expect(node.role).toBe('button'); expect(node.tabIndex).toBe('0'); expect(node.label).toContain('관련 기사 열기'); expect(node.tooltip).toBeTruthy(); }
  const graphLabel = await page.locator('.v3-ti-graph-node.is-primary .v3-ti-graph-label').first().evaluate(el => { const style = getComputedStyle(el); const matrix = (el as SVGGraphicsElement).getScreenCTM()!; return { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, paintOrder: style.paintOrder, displayedFontSize: parseFloat(style.fontSize) * Math.hypot(matrix.a, matrix.b) }; });
  expect(graphLabel.fill).toBe('rgb(15, 23, 42)'); expect(graphLabel.stroke).toBe('rgb(255, 255, 255)'); expect(graphLabel.paintOrder).toContain('stroke'); expect(parseFloat(graphLabel.strokeWidth)).toBeGreaterThanOrEqual(3);
  expect(graphLabel.displayedFontSize).toBeGreaterThanOrEqual(12);
  const secondary = page.locator('.v3-ti-graph-node.is-secondary').first(); await secondary.focus();
  await expect(secondary).toHaveClass(/is-focused/); await expect(secondary.locator('text')).toHaveCSS('opacity', '1');
  const svg = page.locator('#analytics-tag-graph'); await svg.focus();
  const previousTransform = await svg.locator('.v3-ti-graph-world').getAttribute('transform');
  await page.keyboard.press('ArrowRight'); await expect(svg.locator('.v3-ti-graph-world')).not.toHaveAttribute('transform', previousTransform || '');
  await page.locator('#v3-ti-graph-reset').click();
  const colorPath = testInfo.outputPath('synthetic-computed-text-colors.json');
  await writeFile(colorPath, JSON.stringify({ regionalColors, graphLabel }, null, 2));
  await testInfo.attach('synthetic-computed-text-colors', { path: colorPath, contentType: 'application/json' });
  await page.locator('.v3-ti-graph-stage').screenshot({ path: testInfo.outputPath('synthetic-tag-graph-390.png') });
  const displayedSize = () => page.locator('.v3-ti-graph-node.is-primary .v3-ti-graph-label').first().evaluate(el => { const matrix = (el as SVGGraphicsElement).getScreenCTM()!; return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(matrix.a, matrix.b); });
  await page.locator('#v3-ti-graph-zoom-out').click(); await expect.poll(displayedSize).toBeGreaterThanOrEqual(12);
  await page.setViewportSize({ width: 1280, height: 900 }); await expect.poll(displayedSize).toBeGreaterThanOrEqual(12);
  assertBoundary(boundary);
});

test('Tag graph fits initial/reset nodes and keeps readable label boxes disjoint through zoom and resize', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, boundary } = await open(page); await panel(page, 'analytics-tags');
  await page.mouse.move(0, 0);
  const svg = page.locator('#analytics-tag-graph');
  const measure = () => svg.evaluate(element => {
    const frame = element.getBoundingClientRect();
    const nodes = Array.from(element.querySelectorAll('.v3-ti-graph-node'));
    const circles = nodes.map(node => node.querySelector('circle')!.getBoundingClientRect());
    const labels = nodes.map(node => node.querySelector('text')!).filter(text => Number(getComputedStyle(text).opacity) > 0.99 && Number(getComputedStyle(text.parentElement!).opacity) > 0.99).map(text => {
      const box = text.getBoundingClientRect(), matrix = (text as SVGGraphicsElement).getScreenCTM()!;
      return { text: text.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom, fontSize: parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b) };
    });
    const intersections: string[] = [];
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) intersections.push(a.text + ' / ' + b.text);
    }
    return { nodeCount: nodes.length, primaryCount: nodes.filter(node => node.classList.contains('is-primary')).length, labels, intersections,
      frame: { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom, height: frame.height },
      bounds: { left: Math.min(...circles.map(box => box.left)), right: Math.max(...circles.map(box => box.right)), top: Math.min(...circles.map(box => box.top)), bottom: Math.max(...circles.map(box => box.bottom)) } };
  });
  const checkLabels = async () => {
    await expect.poll(async () => (await measure()).intersections).toEqual([]);
    const result = await measure(); expect(result.nodeCount).toBe(50); expect(result.primaryCount).toBe(5); expect(result.labels.length).toBeGreaterThan(0);
    for (const label of result.labels) expect(label.fontSize).toBeGreaterThanOrEqual(12);
    return result;
  };
  const initial = await checkLabels();
  expect(initial.bounds.bottom - initial.bounds.top).toBeGreaterThan(initial.frame.height * 0.7);
  expect(initial.bounds.left).toBeGreaterThanOrEqual(initial.frame.left); expect(initial.bounds.right).toBeLessThanOrEqual(initial.frame.right);
  expect(initial.bounds.top).toBeGreaterThanOrEqual(initial.frame.top); expect(initial.bounds.bottom).toBeLessThanOrEqual(initial.frame.bottom);
  const initialTransform = await svg.locator('.v3-ti-graph-world').getAttribute('transform');
  await page.locator('.v3-ti-graph-stage').screenshot({ path: testInfo.outputPath('synthetic-tag-graph-fitted-390.png') });
  const reads = state.reads.length;
  await page.locator('#v3-ti-graph-zoom-out').click(); await checkLabels();
  await page.locator('#v3-ti-graph-reset').click(); await expect(svg.locator('.v3-ti-graph-world')).toHaveAttribute('transform', initialTransform!); await checkLabels();
  const results: any[] = [{ width: 390, state: 'initial', ...initial }];
  for (const width of [280, 320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await settled(page);
    results.push({ width, state: 'resize-fit', ...await checkLabels() });
  }
  await page.locator('.v3-ti-graph-stage').screenshot({ path: testInfo.outputPath('synthetic-tag-graph-fitted-1280.png') });
  expect(state.reads.length).toBe(reads);
  await writeFile(testInfo.outputPath('synthetic-tag-graph-label-bounds.json'), JSON.stringify(results, null, 2));
  assertBoundary(boundary);
});


for (const width of [280, 390, 1465, 1920, 2560, 5120]) test(`${width}px visible visual overview, readable titles and fitted trend`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1200 });
  await page.addInitScript(() => {
    (window as any).__resizeErrors = [];
    window.addEventListener('error', event => { if (/ResizeObserver/.test(event.message)) (window as any).__resizeErrors.push(event.message); });
  });
  const { boundary } = await open(page);
  await page.route('**/api/admin/analytics?**', async route => {
    const dates = Array.from({ length: 30 }, (_, index) => new Date(Date.UTC(2026, 8, 16 + index)).toISOString().slice(0, 10));
    const top = Array.from({ length: 10 }, (_, index) => ({ title: `합성 기사 ${index + 1} · 청소년 프로그램의 운영 성과와 지역별 참여 경험을 함께 살펴보는 긴 제목`, views: 37 - index * 3 }));
    await route.fulfill({ json: { range: { start: dates[0], end: dates[29], label: dates[0] + ' ~ ' + dates[29], granularity: 'day' },
      today: { visits: 14, views: 30 }, summary: { range_visits: 350, range_pageviews: 928, average_dwell_seconds: 48.5 },
      visitors: { series: dates.map((date, index) => ({ date, visits: index < 15 ? index % 4 : index * 2 })) },
      views: { series: dates.map((date, index) => ({ date, views: index === 10 ? 300 : index * 4 })) },
      article_top_posts: top, sources: ['페이스북', '직접 방문', '내부 이동', '네이버 검색', '구글'].map((source_label, index) => ({ source_label, visits: 190 - index * 30 })),
      tracking_note: '합성 검증 전용. 고유 방문과 조회를 구별하며 실제 운영 성과가 아닙니다.' } });
  });
  await panel(page, 'analytics-visits'); await page.locator('#analytics-auto-refresh').uncheck();
  await expect(page.locator('#analytics-range-start')).not.toHaveValue('');
  await expect(page.locator('#analytics-range-end')).not.toHaveValue('');
  await page.locator('[data-v3-period-scope="analytics"] [data-days="7"]').click();
  const range = await page.locator('[data-v3-period-scope="analytics"]').evaluate(el => Array.from(el.querySelectorAll('input')).map(input => input.value));
  expect((Date.parse(range[1]) - Date.parse(range[0])) / 86400000).toBe(6);
  await page.locator('[data-v3-period-scope="analytics"] [data-days="30"]').click();
  await expect(page.locator('[data-v3-period-scope="analytics"] [data-days="30"]')).toHaveClass(/is-active/);
  await expect(page.locator('.v3-visit-post')).toHaveCount(10);
  await expect(page.locator('.v3-visit-sources .v3-bar-row')).toHaveCount(5);
  await expect.poll(async () => page.locator('.v3-chart-svg').evaluate(svg => Math.abs(svg.getBoundingClientRect().width - (svg as SVGSVGElement).viewBox.baseVal.width))).toBeLessThan(2);
  const metrics = await page.locator('#panel-analytics-visits').evaluate(panel => {
    const chart = panel.querySelector('.v3-chart-svg') as SVGSVGElement;
    const text = chart.querySelector('.v3-chart-axis-text') as SVGGraphicsElement;
    const matrix = text.getScreenCTM()!;
    const title = panel.querySelector('.v3-visit-post-title')!;
    const header = panel.querySelector('.v3-page-head')!.getBoundingClientRect();
    const trend = panel.querySelector('.v3-analytics-trend-card')!.getBoundingClientRect();
    const posts = panel.querySelector('.v3-visit-posts')!.getBoundingClientRect();
    return { chartWidth: chart.getBoundingClientRect().width, axisFont: parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b),
      titleOverflow: title.scrollWidth > title.clientWidth + 1, titleEllipsis: getComputedStyle(title).textOverflow,
      headerHeight: header.height, trend: { top: trend.top, left: trend.left }, posts: { top: posts.top, left: posts.left } };
  });
  expect(metrics.axisFont).toBeGreaterThanOrEqual(11.9);
  expect(metrics.titleOverflow).toBe(false); expect(metrics.titleEllipsis).not.toBe('ellipsis');
  if (width >= 1920) { expect(metrics.headerHeight).toBeLessThan(230); expect(Math.abs(metrics.trend.top - metrics.posts.top)).toBeLessThan(2); expect(metrics.posts.left).toBeGreaterThan(metrics.trend.left); }
  await assertRenderedBounds(page, `${width}px visual visit overview`);
  await settled(page);
  expect(await page.evaluate(() => (window as any).__resizeErrors)).toEqual([]);
  await page.locator('#panel-analytics-visits h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`synthetic-visits-visual-${width}.png`) });
  await writeFile(testInfo.outputPath('visual-metrics.json'), JSON.stringify(metrics, null, 2));
  if (width === 1920) {
    await page.locator('.v3-chart-hover-zone').first().focus();
    for (const resizeWidth of [390, 2560, 1920]) {
      await page.setViewportSize({ width: resizeWidth, height: 1200 });
      await expect.poll(async () => page.locator('.v3-chart-svg').evaluate(svg => Math.abs(svg.getBoundingClientRect().width - (svg as SVGSVGElement).viewBox.baseVal.width))).toBeLessThan(2);
      await expect(page.locator('.v3-chart-hover-zone').first()).toBeFocused();
      await expect(page.locator('.v3-chart-tooltip')).toBeVisible();
    }
  }
  await panel(page, 'analytics-tags');
  await expect(page.locator('#analytics-tag-graph')).toBeVisible();
  const order = await page.locator('#analytics-tags-body').evaluate(el => ({ graph: el.querySelector('#analytics-tag-graph')!.getBoundingClientRect().top,
    tables: el.querySelector('.v3-ti-section-gap')!.getBoundingClientRect().top }));
  expect(order.graph).toBeLessThan(order.tables);
  await expect(page.locator('.v3-ti-usage-row')).toHaveCount(10);
  await assertRenderedBounds(page, `${width}px visual tag overview`);
  await page.locator('#panel-analytics-tags h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`synthetic-tags-visual-${width}.png`) });
  assertBoundary(boundary);
});

test('Tag relationship links stay thin through zoom and retain focus and edge counts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  const { boundary } = await open(page);
  const repeated = Array.from({ length: 40 }, (_, index) => ({ ...postRows[0], id: 1000 + index, meta_tags: index < 25 ? '공통,반복 주제,운영 경험' : '공통,반복 주제' }));
  const graphData = buildTagInsights([...postRows, ...repeated]);
  await page.route('**/api/admin/tag-insights?**', route => route.fulfill({ json: { ...graphData, range: { start: '2026-09-16', end: '2026-10-15', label: '2026-09-16 ~ 2026-10-15' } } }));
  await panel(page, 'analytics-tags');
  const links = page.locator('.v3-ti-graph-link');
  const edgeCount = await links.count(); expect(edgeCount).toBeGreaterThan(1);
  const measure = () => links.evaluateAll(lines => lines.map(line => ({ width: parseFloat(getComputedStyle(line).strokeWidth), vectorEffect: getComputedStyle(line).vectorEffect, stroke: getComputedStyle(line).stroke })));
  for (const zoom of ['initial', 'in', 'in', 'out', 'reset']) {
    if (zoom !== 'initial') await page.locator(zoom === 'reset' ? '#v3-ti-graph-reset' : '#v3-ti-graph-zoom-' + zoom).click();
    const result = await measure();
    for (const link of result) { expect(link.width).toBeGreaterThanOrEqual(0.6); expect(link.width).toBeLessThanOrEqual(1.5); expect(link.vectorEffect).toBe('non-scaling-stroke'); }
    expect(await links.count()).toBe(edgeCount);
  }
  await page.locator('.v3-ti-graph-node').first().focus();
  await expect(page.locator('.v3-ti-graph-link.is-focused').first()).toHaveCSS('stroke', 'rgb(98, 37, 153)');
  expect(await links.count()).toBe(edgeCount);
  await page.mouse.move(0, 0); await page.locator('#v3-ti-graph-search').fill('');
  await page.locator('#panel-analytics-tags h1').click();
  await page.locator('#panel-analytics-tags h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('synthetic-tag-links-refined-1920.png') });
  await writeFile(testInfo.outputPath('tag-link-metrics.json'), JSON.stringify({ edgeCount, links: await measure() }, null, 2));
  assertBoundary(boundary);
});
