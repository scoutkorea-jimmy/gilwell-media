import assert from 'node:assert/strict';
import { summarizeSearchRows } from '../functions/api/admin/search-keywords.js';

const summary = summarizeSearchRows([
  { referrer_host: 'www.google.com', referrer_url: 'https://www.google.com/', visits: 4 },
  { referrer_host: 'search.naver.com', referrer_url: 'https://search.naver.com/search.naver?query=스카우트', visits: 2 },
  { referrer_host: 'search.naver.com', referrer_url: 'https://search.naver.com/search.naver', visits: 1 },
  { referrer_host: 'direct', referrer_url: null, visits: 3 },
  { referrer_host: 'bing.com', referrer_url: 'not-a-url', visits: 1 },
]);

assert.equal(summary.total_visits, 8);
assert.equal(summary.known_visits, 2);
assert.equal(summary.hidden_visits, 6);
assert.deepEqual(summary.keywords, [{ keyword: '스카우트', engine: 'Naver', visits: 2 }]);
assert.deepEqual(summary.by_engine.map(({ engine, visits }) => [engine, visits]), [['Google', 4], ['Naver', 3], ['Bing', 1]]);
