// Run: node --test tests/site-stability.test.mjs (isolated data and Chrome only).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { onRequestGet as home } from '../functions/api/home.js';
import { onRequest as publicPage } from '../functions/[[path]].js';
import { onRequestGet as article } from '../functions/post/[id].js';
import { onRequestGet as articleApi } from '../functions/api/posts/[id].js';

const nestedContent = JSON.stringify({ blocks: [{ type: 'list', data: { items: [{ content: 'parent', items: [{ content: '<strong>nested child</strong>', items: [{ content: 'deep descendant', items: [] }] }] }] } }] });

function fixture() {
  const state = { title: 'before', public: true, failRails: false, railCalls: 0, failAux: '', failCore: false };
  const post = () => ({ id: 1, published: 1, category: 'korea', title: state.title, content: 'preserved article body', created_at: '2026-10-22 00:00:00', related_posts_manual: '[2]', special_feature: 'synthetic feature' });
  const env = { DB: Object.assign(new (class D1Database {})(), { prepare(sql) { state.sql?.push(sql); return {
    bind() { return this; },
    async first() {
      if (sql.includes('SELECT * FROM posts')) {
        if (state.failCore) throw Error('synthetic core failure');
        return post();
      }
      if (sql.includes('FROM post_likes') && state.failAux === 'likes') throw Error('synthetic likes failure');
      if (sql.includes("key = 'public_runtime'")) return { value: '{}' };
      return null;
    },
    async all() {
      if (sql.includes('SUM(CASE WHEN pv.viewed_at')) {
        state.railCalls++;
        if (state.failRails) throw Error('synthetic rails failure');
        return { results: state.public ? [{ id: 1, v7: 1, v14: 0, v30: 0, vold: 0, pub: '2026-10-22' }] : [] };
      }
      if (sql.includes('FROM posts WHERE id IN')) return { results: state.public ? [post()] : [] };
      if (sql.includes('AND id IN') && state.failAux === 'manual') throw Error('synthetic manual relation failure');
      if (sql.includes('AND id != ?') && state.failAux === 'related') throw Error('synthetic relation failure');
      if (sql.includes("COALESCE(special_feature, '') = ?") && state.failAux === 'feature') throw Error('synthetic feature failure');
      return { results: [] };
    },
    async run() { return { meta: { changes: 0, last_row_id: 1 } }; },
  }; } }) };
  return { state, env, post };
}

async function withExpectedErrors(run) {
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try { await run(errors); } finally { console.error = original; }
}

async function homeData(f, origin = 'https://synthetic.invalid') {
  const response = await home({ env: f.env, request: new Request(origin + '/api/home'), waitUntil() {} });
  assert.equal(response.status, 200);
  return response.json();
}

test('home rails share work within a request and refresh edits, publication and origin on the next request', async () => {
  const f = fixture();
  assert.equal((await homeData(f)).picks.posts[0].title, 'before');
  assert.equal(f.state.railCalls, 1);
  f.state.title = 'after';
  const next = await homeData(f, 'https://second.invalid');
  assert.equal(next.picks.posts[0].title, 'after');
  assert.equal(next.picks.posts[0].image_url, 'https://second.invalid/img/logo.png');
  assert.equal(f.state.railCalls, 2);
  f.state.public = false;
  assert.deepEqual((await homeData(f)).picks.posts, []);
  assert.equal(f.state.railCalls, 3);
});

test('home rails recover on the next request after a transient query failure', async () => {
  await withExpectedErrors(async errors => {
    const f = fixture();
    f.state.failRails = true;
    const failed = await homeData(f);
    assert.equal(failed.issues.picks, true);
    assert.deepEqual(failed.picks.posts, []);
    f.state.failRails = false;
    assert.equal((await homeData(f)).picks.posts[0].id, 1);
    assert.equal(f.state.railCalls, 2);
    assert.ok(errors.length);
  });
});

test('home SSR rails refresh and recover with a reused environment', async () => {
  // Exercise the request handler; capture content handed to Cloudflare's rewriter.
  const original = globalThis.HTMLRewriter;
  let rendered;
  globalThis.HTMLRewriter = class {
    on(selector, handler) {
      handler.element({ setInnerContent(value) { rendered[selector] = value; }, append() {}, getAttribute() { return null; } });
      return this;
    }
    transform(response) { return response; }
  };
  try {
    const f = fixture();
    const request = async () => {
      rendered = {};
      const response = await publicPage({ env: f.env, request: new Request('https://synthetic.invalid/'), next: async () => new Response('<head><!-- SHARE_META --></head>', { headers: { 'Content-Type': 'text/html' } }), waitUntil() {} });
      assert.equal(response.status, 200);
      return rendered['#picks-list'];
    };
    assert.match(await request(), /before/);
    f.state.title = 'after';
    assert.match(await request(), /after/);
    f.state.failRails = true;
    assert.doesNotMatch(await request(), /after/);
    f.state.failRails = false;
    assert.match(await request(), /after/);
    assert.equal(f.state.railCalls, 4, 'one aggregate per request');
  } finally { globalThis.HTMLRewriter = original; }
});

test('article HTML and API retain the article when optional widget queries fail', async () => {
  await withExpectedErrors(async errors => {
    for (const failAux of ['likes', 'related', 'manual', 'feature']) {
      const f = fixture();
      f.state.failAux = failAux;
      for (const handler of [article, articleApi]) {
        const response = await handler({ env: f.env, params: { id: '1' }, request: new Request('https://synthetic.invalid/post/1', { headers: { 'User-Agent': 'Googlebot' } }) });
        assert.equal(response.status, 200, failAux);
        if (handler === article) {
          const html = await response.text();
          assert.match(html, /preserved article body/);
          assert.match(html, /rel="canonical" href="https:\/\/synthetic.invalid\/post\/1"/);
        } else {
          const { post } = await response.json();
          assert.equal(post.content, 'preserved article body');
          assert.ok(Array.isArray(post.related_posts));
          if (failAux === 'likes') assert.equal(post.likes, 0);
        }
      }
    }
    assert.ok(errors.length >= 8, 'optional failures remain observable');
  });
});

test('article core failures and unpublished access still return errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.match(String(input), /^https:\/\/synthetic\.invalid\/(?:404|500)\.html$/);
    return new Response('synthetic error page');
  };
  try {
    await withExpectedErrors(async () => {
      for (const handler of [article, articleApi]) {
        const f = fixture();
        f.state.failCore = true;
        const context = { env: f.env, params: { id: '1' }, request: new Request('https://synthetic.invalid/post/1', { headers: { 'User-Agent': 'Googlebot' } }) };
        assert.equal((await handler(context)).status, 500);
        const originalPrepare = f.env.DB.prepare;
        f.env.DB.prepare = sql => {
          const stmt = originalPrepare(sql);
          if (sql.includes('SELECT * FROM posts')) stmt.first = async () => ({ ...f.post(), published: 0 });
          return stmt;
        };
        assert.equal((await handler(context)).status, 404);
      }
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('numeric entities outside Unicode range do not turn the SSR body into Editor.js JSON', async () => {
  const f = fixture();
  const originalPrepare = f.env.DB.prepare;
  const content = JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: 'intact &#x110000; &#1114112; &#x1F600; &amp;lt;' } }] });
  f.env.DB.prepare = sql => {
    const stmt = originalPrepare(sql);
    if (sql.includes('SELECT * FROM posts')) stmt.first = async () => ({ ...f.post(), content });
    return stmt;
  };
  const response = await article({ env: f.env, params: { id: '1' }, request: new Request('https://synthetic.invalid/post/1', { headers: { 'User-Agent': 'Googlebot' } }) });
  const html = await response.text();
  assert.match(html, /<p>intact &amp;#x110000; &amp;#1114112; 😀 &amp;lt;<\/p>/);
});

test('nested list descendants appear in article structured data and fallback descriptions', async () => {
  const f = fixture();
  const originalPrepare = f.env.DB.prepare;
  f.env.DB.prepare = sql => {
    const stmt = originalPrepare(sql);
    if (sql.includes('SELECT * FROM posts')) stmt.first = async () => ({ ...f.post(), content: nestedContent });
    return stmt;
  };
  const response = await article({ env: f.env, params: { id: '1' }, request: new Request('https://synthetic.invalid/post/1', { headers: { 'User-Agent': 'Googlebot' } }) });
  const html = await response.text();
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => JSON.parse(match[1]));
  const news = schemas.find(schema => schema['@type'] === 'NewsArticle');
  assert.equal(news.articleBody, 'parent nested child deep descendant');
  assert.equal(news.wordCount, 5);
  assert.match(html, /name="description" content="parent nested child deep descendant"/);
});

test('mobile refresh excludes dialogs and controls, cancels invalid gestures and preserves normal pulls', { timeout: 30000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route('**/*', route => route.request().url() === 'https://synthetic.invalid/' ? route.fulfill({ contentType: 'text/html', body: '<body><main id="surface">page</main><textarea id="draft">unsaved</textarea><div contenteditable="true" id="editor">text</div><div role="dialog" id="dialog">modal</div><a href="#" id="link">link</a></body>' }) : route.abort());
    await page.goto('https://synthetic.invalid/');
    await page.addScriptTag({ content: readFileSync('public/js/main.js', 'utf8') });
    assert.deepEqual(await page.evaluate(() => ['&#x110000;', '&#1114112;', '&#999999999999999999999999999999;', '&#x1F600;', '&amp;lt;'].map(value => GW.decodeHtmlEntitiesOnce(value))), ['&#x110000;', '&#1114112;', '&#999999999999999999999999999999;', '😀', '&lt;']);
    assert.equal(await page.evaluate(content => GW.truncate(content, 200), nestedContent), 'parent nested child deep descendant');
    await page.addScriptTag({ content: readFileSync('public/js/site-chrome.js', 'utf8') });
    await page.evaluate(() => GW.setupPullToRefresh());
    const touch = async (type, y, id = 'surface', count = 1) => page.evaluate(({ type, y, id, count }) => {
      const target = document.getElementById(id);
      const touches = Array.from({ length: count }, (_, identifier) => new Touch({ identifier, target, clientX: 100, clientY: y }));
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches }));
    }, { type, y, id, count });
    const hidden = async () => assert.equal(await page.locator('#pull-refresh-indicator').getAttribute('aria-hidden'), 'true');
    for (const id of ['draft', 'editor', 'dialog', 'link']) {
      await touch('touchstart', 100, id);
      await touch('touchmove', 300, id);
      await hidden();
    }
    await page.evaluate(() => document.body.style.overflow = 'hidden');
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await hidden();
    await page.evaluate(() => document.body.style.overflow = '');
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    assert.equal(await page.locator('#pull-refresh-indicator').evaluate(el => el.classList.contains('ready')), true);
    await touch('touchmove', 150);
    assert.equal(await page.locator('.pull-refresh-text').textContent(), '당겨서 새로고침');
    await touch('touchmove', 300);
    await touch('touchmove', 300, 'surface', 2);
    await hidden();
    await touch('touchmove', 300);
    await hidden();
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await page.evaluate(() => document.body.style.overflow = 'hidden');
    await touch('touchend', 300, 'surface', 0);
    await hidden();
    assert.equal(page.url(), 'https://synthetic.invalid/');
    assert.equal(await page.locator('#draft').inputValue(), 'unsaved');
  } finally { await browser.close(); }
});
