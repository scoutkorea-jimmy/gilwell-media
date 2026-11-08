// Run: node --import ./tests/register-rust-wasm.mjs --test tests/site-share-login.test.mjs (Chrome, synthetic pages only).
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { onRequestGet } from '../functions/post/[id].js';

mkdirSync('work/gpt-share-login-20261022', { recursive: true });
const origin = 'https://bpmedia.test';
const post = { id: 440, published: 1, category: 'korea', title: '합성 기사', content: '합성 본문', created_at: '2026-10-22 00:00:00' };
const DB = Object.assign(new (class D1Database {})(), { prepare(sql) { return {
  bind() { return this; },
  async first() { return sql.includes('SELECT * FROM posts') ? post : sql.includes('COUNT(*)') ? { count: 0 } : { value: '{}' }; },
  async all() { return { results: [] }; },
}; } });
const response = await onRequestGet({ params: { id: '440' }, request: new Request(origin + '/post/440', { headers: { 'User-Agent': 'Googlebot' } }), env: { DB } });
assert.equal(response.status, 200, 'synthetic article SSR must succeed before browser checks');
const postHtml = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') + '<script src="/js/main.js"></script><script>GW.bootstrapStandardPage=function(){};GW.loadTurnstile=function(){};</script><script src="/js/post-page.js"></script>';

test('Site: Kakao payload, responsive lead and article account login', {timeout: 45000}, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error('PAGE:', error.message));
    let loginBody;
    let loginCount = 0;
    let loginStatus = 401;
    const handleRoute = async route => {
      const req = route.request(), url = new URL(req.url());
      assert.equal(url.hostname === 'bpmedia.net' && req.method() !== 'GET', false, 'no production writes');
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/admin/login') {
        loginBody = req.postDataJSON(); loginCount++;
        return route.fulfill({ status: loginStatus, json: loginStatus === 429 ? { error: '제한', retry_after: 120 } : loginStatus === 200 ? {token:'synthetic',role:'full'} : { error: '로그인할 수 없습니다.' } });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      if (url.pathname === '/post/440') return route.fulfill({ contentType: 'text/html', body: postHtml });
      const path = 'public' + (url.pathname === '/' ? '/index.html' : url.pathname);
      if (!existsSync(path)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream', body: readFileSync(path) });
    };
    await page.route('**/*', handleRoute);
    await page.goto(origin + '/post/440');
    await page.waitForFunction(() => !!window._postLoginSubmit);
    await page.evaluate(() => { GW.showToast = () => {}; window._postEdit(); });
    await page.waitForFunction(() => document.activeElement?.id === 'post-login-username');
    await page.locator('#post-login-username').fill('Editor');
    await page.locator('#post-login-pw').fill('  synthetic password  ');
    await page.locator('#post-login-pw').press('Enter');
    await page.waitForFunction(() => document.querySelector('#post-login-err').textContent.includes('로그인할 수 없습니다'));
    assert.deepEqual(loginBody, { username: 'editor', password: '  synthetic password  ' });
    assert.equal(loginCount, 1, 'Enter submits once');
    assert.equal(await page.locator('#post-login-pw').inputValue(), '');
    await page.evaluate(() => { document.querySelector('#post-login-username').value=''; window._postLoginSubmit(); });
    assert.equal(loginCount, 1, 'empty ID never reaches owner fallback');
    await page.locator('#post-login-username').fill('editor');
    await page.locator('#post-login-pw').fill('synthetic');
    loginStatus = 429;
    await page.locator('#post-login-submit-btn').click();
    await page.waitForFunction(() => document.querySelector('#post-login-err').textContent.includes('120초'));
    await page.evaluate(() => { window._postLoginSubmit(); window._postLoginSubmit(); });
    assert.equal(loginCount, 2, 'retry wait blocks repeated API attempts');
    await page.screenshot({ path: 'work/gpt-share-login-20261022/login-desktop.png' });
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({ path: 'work/gpt-share-login-20261022/login-mobile.png' });

    const shares = await page.evaluate(async () => {
      const payloads = [], toasts = [];
      GW.loadKakaoSdk = () => Promise.resolve({ Share: { sendDefault: p => payloads.push(p) } });
      GW.showToast = msg => toasts.push(msg);
      for (const image of ['', '/img/logo.png', 'data:image/png;base64,bad', 'https://example.org/image.png']) {
        await GW.shareViaKakao({ url: '/post/440', title: '가'.repeat(240), description: '나'.repeat(240), image });
      }
      return { payloads, toasts };
    });
    assert.equal(shares.payloads.length, 4);
    for (const payload of shares.payloads) {
      assert.equal(payload.content.title.length, 200);
      assert.equal(payload.content.description.length, 200);
      assert.ok(payload.content.link.webUrl.startsWith(origin + '/post/440?share_ref='));
      assert.deepEqual(payload.buttons[0].link, payload.content.link);
    }
    assert.equal(shares.payloads[0].content.imageUrl, origin + '/img/og-default.png');
    assert.equal(shares.payloads[1].content.imageUrl, origin + '/img/logo.png');
    assert.equal(shares.payloads[2].content.imageUrl, origin + '/img/og-default.png');
    assert.equal(shares.payloads[3].content.imageUrl, 'https://example.org/image.png');
    assert.equal(shares.toasts.length, 0, 'no unverified success toast');
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(async () => {
      GW.loadKakaoSdk = () => Promise.reject(new Error('synthetic'));
      GW.copyText = async () => { window.copied = true; };
      await GW.shareViaKakao({url:'/post/440',title:'합성'});
    });
    assert.equal(await page.evaluate(() => window.copied), true, 'SDK failure retains fallback');

    await page.goto(origin + '/post/440');
    await page.waitForFunction(() => !!window._postLoginSubmit);
    await page.evaluate(() => {
      GW.showToast = () => {};
      window.Header = window.List = window.Quote = function() {};
      window.EditorJS = function() { this.isReady = Promise.resolve(); this.render = () => Promise.resolve(); };
      window._postEdit();
    });
    loginStatus = 200;
    await page.locator('#post-login-username').fill('editor');
    await page.locator('#post-login-pw').fill('synthetic');
    await page.locator('#post-login-submit-btn').click();
    await page.waitForFunction(() => document.querySelector('#post-edit-overlay').classList.contains('open'));
    assert.equal(await page.locator('#post-login-modal').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#post-login-modal').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => GW.getToken()), '1', 'existing session marker is reused');

    await page.goto(origin + '/');
    for (const width of [320,360,390,599,768,839,840,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.locator('.home-priority-main').isVisible(), width >= 840, `lead at ${width}px`);
      assert.equal(await page.locator('.home-priority-side').isVisible(), true, `latest at ${width}px`);
      if (width === 390 || width === 1440) await page.screenshot({path:`work/gpt-share-login-20261022/home-${width}.png`});
    }
    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.setDefaultTimeout(10000);
    await mobile.route('**/*', handleRoute);
    await mobile.goto(origin + '/');
    await mobile.waitForFunction(() => !!window.GW?._pullToRefreshBound);
    const touch = async (type, y) => mobile.evaluate(({type,y}) => {
      const touches = type === 'touchcancel' ? [] : [new Touch({identifier:1,target:document.body,clientX:100,clientY:y})];
      document.body.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches}));
    },{type,y});
    await touch('touchstart',100);
    await touch('touchmove',300);
    assert.equal(await mobile.locator('.pull-refresh-text').textContent(),'놓으면 새로고침');
    const readyStyle = await mobile.locator('.pull-refresh-label').evaluate(el => ({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,radius:getComputedStyle(el).borderRadius}));
    assert.notEqual(readyStyle.bg,readyStyle.color,'ready text contrasts with its own background');
    assert.equal(readyStyle.radius,'999px');
    await mobile.waitForFunction(() => getComputedStyle(document.querySelector('#pull-refresh-indicator')).opacity === '1');
    const indicatorBox = await mobile.locator('#pull-refresh-indicator').boundingBox();
    assert.ok(indicatorBox.x >= 0 && indicatorBox.x + indicatorBox.width <= 390, 'refresh indicator fits mobile');
    await mobile.screenshot({path:'work/gpt-share-login-20261022/pull-refresh-ready.png'});
    await touch('touchmove',150);
    assert.equal(await mobile.locator('.pull-refresh-text').textContent(),'당겨서 새로고침','retreat restores label');
    await mobile.evaluate(() => document.documentElement.setAttribute('data-theme','dark'));
    await touch('touchmove',300);
    await mobile.screenshot({path:'work/gpt-share-login-20261022/pull-refresh-dark.png'});
    await touch('touchcancel',0);
    assert.equal(await mobile.locator('#pull-refresh-indicator').getAttribute('aria-hidden'),'true');
    await mobile.close();
    const middleware = readFileSync('functions/_middleware.js','utf8');
    const headers = readFileSync('public/_headers','utf8');
    for (const source of [middleware, headers]) assert.ok(source.includes("form-action 'self' https://sharer.kakao.com https://accounts.kakao.com"));
  } finally { await browser.close(); }
});
