import assert from 'node:assert/strict';
import * as sitemap from '../functions/sitemap.xml/index.js';
import * as newsSitemap from '../functions/sitemap-news.xml/index.js';
import * as glossary from '../functions/glossary-raw.js';

function database({ posts = [], terms = [], fail = () => false } = {}) {
  return Object.assign(new (class D1Database {})(), { prepare(sql) { return {
    async first() { return null; },
    async all() {
      if (sql.includes('published = 0')) return { results: [] };
      if (fail(sql)) throw new Error('simulated D1 query failure');
      return { results: sql.includes('glossary_terms') ? terms : posts };
    },
  }; } });
}
function context(path, db) {
  return { request: new Request(`https://bpmedia.net/${path}`), env: { DB: db } };
}

const originalError = console.error;
console.error = () => {};
try {
  for (const [path, handler] of [['sitemap.xml', sitemap], ['sitemap-news.xml', newsSitemap], ['glossary-raw', glossary]]) {
    for (const method of ['onRequestGet', 'onRequestHead']) {
      const failed = await handler[method](context(path, database({ fail: () => true })));
      assert.equal(failed.status, 503, `${path} ${method}: a query failure is temporary unavailability`);
      assert.equal(failed.headers.get('cache-control'), 'no-store');
      assert.equal(failed.headers.get('retry-after'), '300');
      const failedBody = await failed.text();
      assert.doesNotMatch(failedBody, /simulated D1|<urlset|0개 용어/);
      if (method === 'onRequestHead') assert.equal(failedBody, '');

      const empty = await handler[method](context(path, database()));
      assert.equal(empty.status, 200, `${path}: an empty database is still valid`);
      assert.equal(empty.headers.get('retry-after'), null);
      if (method === 'onRequestHead') assert.equal(await empty.text(), '');
    }
  }
  const metadataFailure = await sitemap.onRequestGet(context('sitemap.xml', database({ fail: sql => sql.includes('glossary_terms') })));
  assert.equal(metadataFailure.status, 503, 'a parallel metadata query failure must not publish an incomplete sitemap');
} finally {
  console.error = originalError;
}

const posts = [{ id: 42, title: '기사 & 제목', category: 'korea', created_at: '2026-10-01 16:01:00', public_date_kst: '2026-10-02 01:01:00' }];
for (const [path, handler] of [['sitemap.xml', sitemap], ['sitemap-news.xml', newsSitemap]]) {
  const response = await handler.onRequestGet(context(path, database({ posts })));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/xml/);
  assert.match(await response.text(), /<loc>https:\/\/bpmedia.net\/post\/42<\/loc>/);
}

const terms = [
  { id: 1, term_ko: '<script>검증</script>', description_ko: 'A&B', created_at: '2026-09-30 00:00:00', updated_at: '2026-10-01 16:01:00' },
  { id: 2, term_ko: '스카우트', created_at: '2026-09-01 00:00:00', updated_at: 'invalid' },
];
const html = await (await glossary.onRequestGet(context('glossary-raw', database({ terms })))).text();
assert.match(html, /총 2개 용어/);
assert.match(html, /업데이트 2026-10-02/, 'latest saved timestamp is displayed in Korea time');
assert.match(html, /&lt;script&gt;검증&lt;\/script&gt;/);
assert.match(html, /A&amp;B/);
for (const invalidTerms of [[], [{ id: 3, term_ko: '기록', created_at: 'invalid', updated_at: null }]]) {
  const noDate = await (await glossary.onRequestGet(context('glossary-raw', database({ terms: invalidTerms })))).text();
  assert.doesNotMatch(noDate, / · 업데이트 /, 'unknown modification date must not become today');
}
console.log('PASS SEO resilience: transient failures, valid empty data, GET/HEAD, sitemap URLs and saved glossary dates');
