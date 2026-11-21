import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import { onRequest } from '../functions/_middleware.js';
import { loadPrivacyPolicy } from '../functions/_shared/privacy-policy.js';

const measurementId = 'G-TEST1234';
const scripts = await Promise.all(['site-analytics.js', 'search.js'].map((name) =>
  readFile(new URL('../public/js/' + name, import.meta.url), 'utf8')));
const consentKey = 'bpmedia-analytics-transfer-consent';

test('middleware limits analytics and CSP to configured public HTML', async () => {
  const original = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class {
    append = '';
    on(selector, handler) {
      if (selector === 'body') handler.element({ append: (markup) => { this.append = markup; } });
      return this;
    }
    transform(response) {
      return new Response('<body>' + this.append + '</body>', response);
    }
  };

  try {
    for (const [path, id, status, robots, expected] of [
      ['/', measurementId, 200, '', true],
      ['/search', measurementId, 200, '', true],
      ['/post/42', measurementId, 200, '', true],
      ['/post/42', measurementId, 200, 'noindex', false],
      ['/post/42', measurementId, 404, '', false],
      ['/admin.html', measurementId, 200, '', false],
      ['/dreampath', measurementId, 200, '', false],
      ['/kms', measurementId, 200, '', false],
      ['/', undefined, 200, '', false],
      ['https://gilwell-media.pages.dev/', measurementId, 200, '', false],
      ['/', '" onload="x', 200, '', false],
    ]) {
      const response = await onRequest({
        env: { GA4_MEASUREMENT_ID: id },
        request: new Request(new URL(path, 'https://bpmedia.net')),
        next: async () => new Response('', { status, headers: { 'Content-Type': 'text/html', 'X-Robots-Tag': robots } }),
      });
      const html = await response.text();
      const csp = response.headers.get('Content-Security-Policy');
      assert.equal(html.includes('site-analytics.js'), expected, path);
      assert.equal(csp.includes('https://www.googletagmanager.com'), expected, path);
      assert.equal(csp.includes('https://*.google-analytics.com'), expected, path);
      const styles = csp.split(';').find(directive => directive.trim().startsWith('style-src ')).trim().split(/\s+/);
      assert.equal(styles.includes('https://www.googletagmanager.com/debug/badge.css'), expected, path);
      assert.equal(styles.includes('https://www.googletagmanager.com'), false, path);
      if (expected) {
        const nonce = html.match(/nonce="([^"]+)"/)[1];
        assert.ok(csp.includes("'nonce-" + nonce + "'"));
      }
    }
  } finally {
    globalThis.HTMLRewriter = original;
  }
});

test('public policy lists the optional overseas transfer only when GA4 is configured', async () => {
  const original = await loadPrivacyPolicy({});
  const enabled = await loadPrivacyPolicy({ GA4_MEASUREMENT_ID: measurementId });
  assert.ok(enabled.html.startsWith(original.html.replace(/최종 개정 \d{4}-\d{2}-\d{2}/, '최종 개정 2026-11-21')));
  assert.match(enabled.html, /id="analytics-privacy".+국외 이전/);
  assert.match(enabled.html, /2개월/);
  assert.doesNotMatch(original.html, /id="analytics-privacy"/);
});

test('public analytics opt-in, reader flow, search privacy, opt-out', async () => {
  const searchHtml = await readFile(new URL('../public/search.html', import.meta.url), 'utf8');
  const searchMarkup = searchHtml.match(/<form id="reader-search"[\s\S]*?<div id="search-pagination"[^>]*><\/div>/)[0];
  const siteMarkup = {
    '/': '<div id="home-lead-story"><a href="/post/1">첫 기사</a></div>',
    '/post/1': '<div class="post-page-body"><p style="height:1400px">기사 본문</p></div><a href="/post/2">다음 기사</a>',
    '/post/2': '<div class="post-page-body">두 번째 기사</div><a href="/search?q=private%40example.test">검색 페이지</a>',
    '/search': searchMarkup + '<script src="/search-fixture.js"></script><script src="/search.js"></script>',
  };
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/site-analytics.js' || pathname === '/search.js' || pathname === '/search-fixture.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(pathname === '/search-fixture.js'
        ? `window.GW = { bootstrapStandardPage(){}, escapeHtml(v) {return String(v)}, formatDate(){return ''},
          CATEGORIES:{korea:{label:'Korea', tagClass:'korea'}}, renderPostDateLabel(){return ''},
          apiFetch(url){return Promise.resolve(url.includes('noresults') ? {posts:[], total:0} : {posts:[{id:3,title:'검색 결과',category:'korea'}],total:1})} };`
        : scripts[pathname === '/search.js' ? 1 : 0]);
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.end(`<!doctype html><title>Fixture</title><style>.site-analytics-body-end{display:block;height:1px}</style>
      <body><a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <main id="main-content">${siteMarkup[pathname] || '<div class="post-page-body">검색 결과 기사</div>'}</main>
      <footer><div class="footer-brand"></div></footer>
      <script defer src="/site-analytics.js" data-measurement-id="${measurementId}"></script></body>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let tagRequests = 0;
    await context.route('https://**/*', (route) => route.abort());
    await context.route('https://www.googletagmanager.com/**', (route) => {
      tagRequests++;
      return route.fulfill({ contentType: 'text/javascript', body: '/* synthetic Google tag */' });
    });
    const page = await context.newPage();
    const events = () => page.evaluate(() => Array.from(window.dataLayer || [], (item) => Array.from(item))
      .filter(([kind]) => kind === 'event').map(([, name, params]) => ({ name, params })));
    await page.goto(origin + '/?q=private%40example.test#private');
    await page.getByRole('button', { name: '허용 안 함' }).click();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), '첫 기사');
    assert.equal(tagRequests, 0);
    assert.deepEqual(await events(), []);
    await page.reload();
    assert.equal(await page.getByRole('region', { name: '선택적 방문 분석' }).isVisible(), false);
    await page.getByRole('button', { name: '방문 분석 설정' }).click();
    await Promise.all([
      page.waitForResponse('https://www.googletagmanager.com/**'),
      page.getByRole('button', { name: '분석 및 국외 이전 동의' }).click(),
    ]);
    assert.equal(await page.locator(':focus').textContent(), '방문 분석 설정');
    let seen = await events();
    const initialization = await page.evaluate(() => Array.from(window.dataLayer || [], args => Array.from(args)));
    assert.equal(initialization[0][0], 'set');
    assert.equal(initialization[0][1].page_location, origin + '/');
    assert.equal(initialization.find(([command]) => command === 'config')[2].send_page_view, true);
    assert.equal(seen.filter(({ name }) => name === 'page_view').length, 0);
    assert.doesNotMatch(JSON.stringify(initialization), /private/);

    await page.evaluate(() => addEventListener('pagehide', () =>
      sessionStorage.setItem('test-home-events', JSON.stringify(Array.from(dataLayer, (args) => Array.from(args))))));
    await page.getByRole('link', { name: '첫 기사' }).click();
    const homeEvents = await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-home-events')));
    assert.equal(homeEvents.filter((args) => args[1] === 'home_section_view').length, 1);
    await page.waitForLoadState('domcontentloaded');
    assert.equal(homeEvents.filter((args) => args[1] === 'home_article_click').length, 0);
    const homeClicks = (await events()).filter(({ name }) => name === 'home_article_click');
    assert.equal(homeClicks.length, 1);
    assert.equal(homeClicks[0].params.home_section, 'main_story');
    assert.equal(homeClicks[0].params.article_id, '1');
    assert.equal(homeClicks[0].params.page_location, origin + '/');
    await page.locator('.site-analytics-body-end').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Array.from(window.dataLayer || []).some((args) => args[1] === 'article_body_end'));
    await page.locator('.site-analytics-body-end').scrollIntoViewIfNeeded();
    assert.equal((await events()).filter(({ name }) => name === 'article_body_end').length, 1);
    await page.getByRole('link', { name: '다음 기사' }).click();
    await page.waitForLoadState('domcontentloaded');
    seen = await events();
    assert.equal(seen.filter(({ name }) => name === 'next_article_view').length, 1);
    assert.equal(seen.find(({ name }) => name === 'next_article_view').params.previous_article_id, '1');

    await page.getByRole('link', { name: '검색 페이지' }).click();
    await page.getByRole('link', { name: '검색 결과' }).waitFor();
    seen = await events();
    assert.ok(seen.some(({ name, params }) => name === 'site_search_results' && params.result_state === 'has_results'));
    assert.doesNotMatch(JSON.stringify(seen), /private|search_term/);
    await page.getByRole('link', { name: '검색 결과' }).click();
    await page.waitForLoadState('domcontentloaded');
    seen = await events();
    assert.equal(seen.filter(({ name }) => name === 'search_article_view').length, 1);
    assert.equal(seen.find(({ name }) => name === 'search_article_view').params.page_referrer, origin + '/search');
    await page.reload();
    assert.ok(!(await events()).some(({ name }) => name === 'search_article_view'));

    await page.goto(origin + '/search?q=noresults');
    await page.waitForFunction(() => Array.from(window.dataLayer || []).some((args) => args[2]?.result_state === 'zero_results'));
    await page.getByRole('button', { name: '방문 분석 설정' }).click();
    await page.getByRole('button', { name: '허용 안 함' }).click();
    assert.equal(await page.evaluate((id) => window['ga-disable-' + id], measurementId), true);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), consentKey), 'denied');
    const before = tagRequests;
    await page.goto(origin);
    assert.equal(tagRequests, before);
    assert.deepEqual(await events(), []);
  } finally {
    try { await browser?.close(); } finally { server.close(); }
  }
});
