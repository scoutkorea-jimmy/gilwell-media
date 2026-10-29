import assert from 'node:assert/strict';
import { summarizeSearchRows } from './fixtures/search-keywords-summary.js';

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

const { queryRust } = await import('../functions/_shared/rust-server.js');
const rows = [
  {referrer_host:'www.google.com',referrer_url:'https://google.com/search?q=%EC%8A%A4%EC%B9%B4%EC%9A%B0%ED%8A%B8',visits:2},
  {referrer_host:'WWW.GOOGLE.CO.KR',referrer_url:'https://www.google.co.kr/search?q=Scout+Camp',visits:4},
  {referrer_host:'naver.com',referrer_url:'https://bing.com/?q=scout%20camp',visits:3},
  {referrer_host:'direct',referrer_url:'https://search.naver.com/?query=%EC%95%BC%EC%98%81',visits:4},
  {referrer_host:'bing.com',referrer_url:'bad url',visits:1},
  {referrer_host:'search.yahoo.com',referrer_url:'https://search.yahoo.com/?p=%EB%82%98%EB%AC%B4',visits:1},
  {referrer_host:'baidu.com',referrer_url:'https://baidu.com/?wd=x&word=%ED%95%9C%EA%B8%80',visits:2},
  {referrer_host:'duckduckgo.com',referrer_url:'https://duckduckgo.com/?q=%F0%9F%98%80',visits:2},
  {referrer_host:'yandex.com',referrer_url:'https://yandex.com/?text=%EA%B0%80%EB%82%98',visits:2},
  {referrer_host:'ecosia.org',referrer_url:'https://ecosia.org/?q=%EB%8B%A4%EB%9D%BC',visits:2},
  {referrer_host:'zum.com',referrer_url:'https://zum.com/?query=%EB%B0%94%EC%82%AC',visits:2},
  {referrer_host:'nate.com',referrer_url:'https://nate.com/?q=%EC%95%84%EC%9E%90',visits:2},
  {referrer_host:'google.com.evil.invalid',referrer_url:'https://google.com.evil.invalid/?q=two',visits:1},
  {referrer_host:'notgoogle.com',referrer_url:'https://notgoogle.com/?q=ignored',visits:100},
  {referrer_host:'daum.net',referrer_url:'https://daum.net/?q=x',visits:2},
];
for (const limit of [0, 1, 2, 10, 100, 2.7]) {
  const result = await queryRust({env:{},request:new Request('https://synthetic.invalid/')},'search-keywords-summary',{rows,limit});
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),summarizeSearchRows(rows,limit));
}
