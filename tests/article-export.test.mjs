import assert from 'node:assert/strict';
import { onRequestGet, onRequestHead } from '../functions/api/articles.ndjson.js';

const queries = [];
function context(fail = false) {
  return {
    request: new Request('https://bpmedia.net/api/articles.ndjson?limit=1&category=korea'),
    env: { DB: Object.assign(new (class D1Database {})(), { prepare(sql) {
      queries.push(sql);
      return { bind(...values) {
        assert.deepEqual(values, ['-90 days', 'korea', 1]);
        return { async all() {
          if (fail) throw new Error('synthetic DB failure');
          return { results: [{ id: 42, author: 'Editor A', publish_at: '2026-10-22 09:00:00' }] };
        } };
      } };
    } }) },
  };
}
const response = await onRequestGet(context());
const rows = (await response.text()).trim().split('\n').map(JSON.parse);
assert.equal(rows[0].row_count, 1);
assert.equal(rows[1].url, 'https://bpmedia.net/post/42');
assert.equal(rows[1].author_code, 'Editor.A');
assert.equal(rows[1].published_at, '2026-10-22T00:00:00.000Z');
assert.match(queries[0], /WHERE published = 1/);
const head = await onRequestHead(context());
assert.equal(head.status, 200);
assert.equal(head.headers.get('content-type'), response.headers.get('content-type'));
assert.equal(head.headers.get('cache-control'), response.headers.get('cache-control'));
assert.equal(head.headers.get('x-robots-tag'), 'noindex');
assert.equal(await head.text(), '');

const originalError = console.error;
console.error = () => {};
try {
  for (const handler of [onRequestGet, onRequestHead]) {
    const failure = await handler(context(true));
    assert.equal(failure.status, 500);
    assert.equal(failure.headers.get('cache-control'), 'no-store');
    if (handler === onRequestHead) assert.equal(await failure.text(), '');
  }
} finally { console.error = originalError; }
console.log('PASS machine article export GET/HEAD, publication filter, metadata and uncached errors');
